import type { ActiveColor, ColorId } from './colors';
import type {
  ColorLockDef,
  LightEmitterDef,
  LightMirrorDef,
  LightReceptorDef,
} from './types';

export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LightSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  colorId: ColorId;
}

export const DOUBLE_JUMP_CRYSTAL_THRESHOLD = 5;

/**
 * Determines whether a color-sensitive object is currently SOLID (collidable)
 * and its target visual opacity based on the active background color.
 */
export function evaluateColorObjectState(
  kind: 'neutral' | 'color_block' | 'bridge' | 'hidden_wall' | 'hazard' | 'moving' | 'magnetic',
  objectColor: ColorId | undefined,
  activeColor: ActiveColor,
): { solid: boolean; targetAlpha: number } {
  if (!objectColor || kind === 'neutral') {
    return { solid: true, targetAlpha: 1 };
  }
  const matchesBg = activeColor === objectColor;

  if (kind === 'bridge') {
    // Color Bridges MATERIALIZE when the player switches to their matching color.
    return matchesBg
      ? { solid: true, targetAlpha: 1 }
      : { solid: false, targetAlpha: 0.14 };
  }

  // Standard color blocks, hidden walls, hazards, colored moving platforms, magnetic blocks
  // blend into the background and lose collision when matched.
  return matchesBg
    ? { solid: false, targetAlpha: 0.09 }
    : { solid: true, targetAlpha: 1 };
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/**
 * Safe unstick resolution when an object becomes solid while overlapping the player.
 * Attempts small upward or horizontal nudges to place the player safely outside without
 * colliding into other solid geometry. If no safe nudge exists, returns `{ safeGrace: true }`
 * so the re-materializing block stays phased until the player exits its bounds.
 */
export function resolveReMaterializeOverlap(
  player: AABB,
  becomingSolid: AABB,
  otherSolids: AABB[],
): { nudgedX: number; nudgedY: number; safeGrace: boolean } {
  if (!aabbOverlap(player, becomingSolid)) {
    return { nudgedX: player.x, nudgedY: player.y, safeGrace: false };
  }

  const candidates: Array<{ x: number; y: number }> = [
    // Nudge on top of block if close to top surface
    { x: player.x, y: becomingSolid.y - player.h - 1 },
    // Nudge left
    { x: becomingSolid.x - player.w - 1, y: player.y },
    // Nudge right
    { x: becomingSolid.x + becomingSolid.w + 1, y: player.y },
    // Nudge below
    { x: player.x, y: becomingSolid.y + becomingSolid.h + 1 },
  ];

  const MAX_UP_NUDGE = 46;
  const MAX_SIDE_NUDGE = 30;
  const MAX_DOWN_NUDGE = 28;

  for (const c of candidates) {
    const dx = Math.abs(c.x - player.x);
    const dy = c.y - player.y;
    if (dy < -MAX_UP_NUDGE || dy > MAX_DOWN_NUDGE || dx > MAX_SIDE_NUDGE) {
      continue;
    }
    const testRect: AABB = { x: c.x, y: c.y, w: player.w, h: player.h };
    const hitsOther = otherSolids.some((s) => aabbOverlap(testRect, s));
    if (!hitsOther && !aabbOverlap(testRect, becomingSolid)) {
      return { nudgedX: c.x, nudgedY: c.y, safeGrace: false };
    }
  }

  // Deeply inside the block: grant phased grace so player cannot get crushed or stuck.
  return { nudgedX: player.x, nudgedY: player.y, safeGrace: true };
}

/**
 * Advances a Color Lock sequence state machine when the player selects a new color.
 */
export function advanceColorLock(
  lock: ColorLockDef,
  currentStep: number,
  unlocked: boolean,
  selectedColor: ActiveColor,
): { step: number; unlocked: boolean; advanced: boolean; reset: boolean } {
  if (unlocked) {
    return { step: lock.sequence.length, unlocked: true, advanced: false, reset: false };
  }
  if (selectedColor === 'void') {
    return { step: currentStep, unlocked: false, advanced: false, reset: false };
  }

  const expected = lock.sequence[currentStep];
  if (selectedColor === expected) {
    const nextStep = currentStep + 1;
    if (nextStep >= lock.sequence.length) {
      return { step: nextStep, unlocked: true, advanced: true, reset: false };
    }
    return { step: nextStep, unlocked: false, advanced: true, reset: false };
  }

  // If the selected color matches the FIRST step of the sequence, restart at 1
  if (selectedColor === lock.sequence[0]) {
    return { step: 1, unlocked: false, advanced: currentStep === 0, reset: currentStep > 0 };
  }

  return { step: 0, unlocked: false, advanced: false, reset: currentStep > 0 };
}

/**
 * Reflects a cardinal ray direction off a '/' or '\' mirror.
 */
export function reflectBeamDir(
  dir: 'right' | 'left' | 'up' | 'down',
  mirrorAngle: '/' | '\\',
): 'right' | 'left' | 'up' | 'down' {
  if (mirrorAngle === '/') {
    switch (dir) {
      case 'right': return 'up';
      case 'up': return 'right';
      case 'left': return 'down';
      case 'down': return 'left';
    }
  } else {
    switch (dir) {
      case 'right': return 'down';
      case 'down': return 'right';
      case 'left': return 'up';
      case 'up': return 'left';
    }
  }
}

function dirToVec(dir: 'right' | 'left' | 'up' | 'down'): { dx: number; dy: number } {
  switch (dir) {
    case 'right': return { dx: 1, dy: 0 };
    case 'left': return { dx: -1, dy: 0 };
    case 'up': return { dx: 0, dy: -1 };
    case 'down': return { dx: 0, dy: 1 };
  }
}

/**
 * Ray-vs-AABB distance along a cardinal ray starting at (ox, oy) in unit direction (dx, dy).
 * Returns distance >= 1 if hit, or null if missed.
 */
function rayHitDistance(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  box: AABB,
): number | null {
  if (dx > 0) {
    if (oy >= box.y && oy <= box.y + box.h && box.x >= ox) {
      return box.x - ox;
    }
  } else if (dx < 0) {
    if (oy >= box.y && oy <= box.y + box.h && box.x + box.w <= ox) {
      return ox - (box.x + box.w);
    }
  } else if (dy > 0) {
    if (ox >= box.x && ox <= box.x + box.w && box.y >= oy) {
      return box.y - oy;
    }
  } else if (dy < 0) {
    if (ox >= box.x && ox <= box.x + box.w && box.y + box.h <= oy) {
      return oy - (box.y + box.h);
    }
  }
  return null;
}

/**
 * Traces all active Light Beams through solid obstacles, active mirrors, and receptors.
 * Returns rendered beam segments and the set of triggered receptor IDs.
 */
export function traceLightBeams(
  emitters: LightEmitterDef[],
  mirrors: LightMirrorDef[],
  receptors: LightReceptorDef[],
  solidObstacles: AABB[],
  activeColor: ActiveColor,
  worldWidth: number,
  worldHeight: number,
): { segments: LightSegment[]; activatedReceptorIds: Set<string> } {
  const segments: LightSegment[] = [];
  const activatedReceptorIds = new Set<string>();
  const MAX_BOUNCES = 6;
  const MIRROR_RADIUS = 18;
  const RECEPTOR_RADIUS = 20;

  for (const emitter of emitters) {
    let ox = emitter.x;
    let oy = emitter.y;
    let dir = emitter.dir;

    for (let bounce = 0; bounce < MAX_BOUNCES; bounce++) {
      const { dx, dy } = dirToVec(dir);
      let bestDist =
        dx > 0 ? worldWidth - ox :
        dx < 0 ? ox :
        dy > 0 ? worldHeight - oy :
        oy;

      let hitType: 'none' | 'wall' | 'mirror' | 'receptor' = 'none';
      let hitMirror: LightMirrorDef | null = null;
      let hitReceptor: LightReceptorDef | null = null;

      for (const wall of solidObstacles) {
        const d = rayHitDistance(ox, oy, dx, dy, wall);
        if (d !== null && d > 2 && d < bestDist) {
          bestDist = d;
          hitType = 'wall';
          hitMirror = null;
          hitReceptor = null;
        }
      }

      for (const m of mirrors) {
        // Mirror is hidden/inactive when background matches its colorId
        if (m.colorId && activeColor === m.colorId) continue;
        const mBox: AABB = {
          x: m.x - MIRROR_RADIUS,
          y: m.y - MIRROR_RADIUS,
          w: MIRROR_RADIUS * 2,
          h: MIRROR_RADIUS * 2,
        };
        const d = rayHitDistance(ox, oy, dx, dy, mBox);
        if (d !== null && d > 6 && d < bestDist) {
          bestDist = d + MIRROR_RADIUS;
          hitType = 'mirror';
          hitMirror = m;
          hitReceptor = null;
        }
      }

      for (const r of receptors) {
        const rBox: AABB = {
          x: r.x - RECEPTOR_RADIUS,
          y: r.y - RECEPTOR_RADIUS,
          w: RECEPTOR_RADIUS * 2,
          h: RECEPTOR_RADIUS * 2,
        };
        const d = rayHitDistance(ox, oy, dx, dy, rBox);
        if (d !== null && d > 4 && d < bestDist) {
          bestDist = d + RECEPTOR_RADIUS;
          hitType = 'receptor';
          hitReceptor = r;
          hitMirror = null;
        }
      }

      const endX = ox + dx * bestDist;
      const endY = oy + dy * bestDist;
      segments.push({
        x1: ox,
        y1: oy,
        x2: endX,
        y2: endY,
        colorId: emitter.colorId,
      });

      if (hitType === 'receptor' && hitReceptor) {
        if (hitReceptor.colorId === emitter.colorId) {
          activatedReceptorIds.add(hitReceptor.id);
        }
        break;
      } else if (hitType === 'mirror' && hitMirror) {
        ox = hitMirror.x;
        oy = hitMirror.y;
        dir = reflectBeamDir(dir, hitMirror.angle);
      } else {
        break;
      }
    }
  }

  return { segments, activatedReceptorIds };
}

/**
 * Computes whether double jump is available for the player based on total collected crystals
 * or entering World 4+ (where puzzles begin rewarding aerial versatility).
 */
export function isDoubleJumpAvailable(totalOwnedCrystals: number, worldId: number): boolean {
  return totalOwnedCrystals >= DOUBLE_JUMP_CRYSTAL_THRESHOLD || worldId >= 4;
}

/**
 * Pure platformer jump eligibility check supporting coyote time, input buffer, and double jump.
 */
export function evaluateJumpTrigger(params: {
  jumpBuffered: boolean;
  coyoteTimer: number;
  onGround: boolean;
  airJumpsRemaining: number;
}): { shouldJump: boolean; isAirJump: boolean } {
  if (!params.jumpBuffered) {
    return { shouldJump: false, isAirJump: false };
  }
  if (params.onGround || params.coyoteTimer > 0) {
    return { shouldJump: true, isAirJump: false };
  }
  if (params.airJumpsRemaining > 0) {
    return { shouldJump: true, isAirJump: true };
  }
  return { shouldJump: false, isAirJump: false };
}

export type MonsterContactOutcome = 'none' | 'stomp' | 'player_death';

/**
 * Evaluates player-vs-monster collision with strict platformer combat rules:
 * - Returns 'stomp' ONLY when the player is actively descending (vy > 0) from above
 *   the monster's head zone.
 * - ANY side, front, rear, or underside contact (including walking horizontally into a
 *   monster with vy <= 0) immediately returns 'player_death'.
 */
export function evaluateMonsterContact(params: {
  player: AABB;
  prevPlayerBottom: number;
  playerVy: number;
  monster: AABB;
}): MonsterContactOutcome {
  const { player, prevPlayerBottom, playerVy, monster } = params;

  // Slightly inset monster hurtbox (3px horizontal, 2px top) for crisp, fair pixel feel
  const mBox: AABB = {
    x: monster.x + 3,
    y: monster.y + 2,
    w: Math.max(4, monster.w - 6),
    h: Math.max(4, monster.h - 2),
  };

  if (!aabbOverlap(player, mBox)) {
    return 'none';
  }

  const playerBottom = player.y + player.h;
  const stompHeadCutoff = monster.y + monster.h * 0.48;
  const maxStompPenetrationY = monster.y + monster.h * 0.68;

  // Strictly require downward descent AND previous feet above/near head top
  // so sideways contact or jumping up from below can NEVER accidentally register as a stomp.
  const isDescending = playerVy > 15;
  const cameFromAbove = prevPlayerBottom <= stompHeadCutoff;
  const landedInHeadZone = playerBottom <= maxStompPenetrationY;

  if (isDescending && cameFromAbove && landedInHeadZone) {
    return 'stomp';
  }

  return 'player_death';
}

/**
 * Evaluates whether a Color Blast projectile defeats a monster based on the 16-color system.
 * Only the exact matching vulnerable color defeats the monster; wrong colors or 'void' deflect.
 */
export function evaluateColorBlastHit(
  projectileColor: ActiveColor,
  monsterVulnerableColor: ColorId,
): { defeated: boolean } {
  if (projectileColor === 'void') {
    return { defeated: false };
  }
  return { defeated: projectileColor === monsterVulnerableColor };
}

/**
 * Computes a safe patrol reset X position for a monster when the player respawns,
 * guaranteeing the player NEVER respawns inside or immediately adjacent to a monster.
 */
export function computeSafeMonsterResetX(params: {
  defaultX: number;
  monsterW: number;
  monsterY: number;
  monsterH: number;
  patrolMinX: number;
  patrolMaxX: number;
  respawnCenterX: number;
  respawnCenterY: number;
  minSafeDistance?: number;
}): { x: number; suppressNearSpawn: boolean } {
  const safeDist = params.minSafeDistance ?? 125;
  const mCenterY = params.monsterY - params.monsterH * 0.5;
  const defaultCenterX = params.defaultX + params.monsterW * 0.5;

  if (Math.hypot(defaultCenterX - params.respawnCenterX, mCenterY - params.respawnCenterY) >= safeDist) {
    return { x: params.defaultX, suppressNearSpawn: false };
  }

  // Try placing the monster at whichever patrol edge is farthest from the respawn point
  const minCandidate = params.patrolMinX;
  const maxCandidate = Math.max(params.patrolMinX, params.patrolMaxX - params.monsterW);
  const dMin = Math.hypot(minCandidate + params.monsterW * 0.5 - params.respawnCenterX, mCenterY - params.respawnCenterY);
  const dMax = Math.hypot(maxCandidate + params.monsterW * 0.5 - params.respawnCenterX, mCenterY - params.respawnCenterY);

  if (Math.max(dMin, dMax) >= safeDist) {
    return { x: dMax >= dMin ? maxCandidate : minCandidate, suppressNearSpawn: false };
  }

  // Patrol lane overlaps the checkpoint directly; suppress this monster on respawn so no instant-death loop can occur
  return { x: params.defaultX, suppressNearSpawn: true };
}

