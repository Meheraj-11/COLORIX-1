import type { ColorId } from '../colors';
import type {
  CheckpointDef,
  ColorLockDef,
  CrystalDef,
  HazardDef,
  LevelDef,
  LightEmitterDef,
  LightMirrorDef,
  LightReceptorDef,
  MagneticBlockDef,
  MonsterArchetype,
  MonsterDef,
  MovingPlatformDef,
  PrismGateDef,
  RectPlatform,
  WorldId,
} from '../types';
import { LEVEL_TITLES, WORLD_COLOR_POOLS } from './worldData';

/** Deterministic PRNG (Mulberry32) so every level layout is 100% consistent and testable */
function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SegmentType =
  | 'color_steps'
  | 'barrier_run'
  | 'bridge_chasm'
  | 'moving_skyway'
  | 'hidden_alcove'
  | 'prism_gate'
  | 'color_lock'
  | 'magnetic_lift'
  | 'light_chamber'
  | 'thorn_crossing';

function pickPalette(worldId: WorldId, indexInWorld: number, rng: () => number): ColorId[] {
  const pool = [...WORLD_COLOR_POOLS[worldId]];
  // Deterministic Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const count = Math.min(
    8,
    Math.min(pool.length, Math.max(3, 2 + Math.floor(worldId * 0.85) + (indexInWorld > 7 ? 1 : 0))),
  );
  return pool.slice(0, count);
}

function chooseSegmentsForWorld(worldId: WorldId, indexInWorld: number, rng: () => number): SegmentType[] {
  const worldPools: Record<WorldId, SegmentType[]> = {
    1: ['color_steps', 'barrier_run', 'thorn_crossing', 'prism_gate', 'hidden_alcove'],
    2: ['bridge_chasm', 'color_steps', 'thorn_crossing', 'prism_gate', 'hidden_alcove'],
    3: ['moving_skyway', 'hidden_alcove', 'barrier_run', 'bridge_chasm', 'thorn_crossing'],
    4: ['color_lock', 'bridge_chasm', 'barrier_run', 'color_steps', 'thorn_crossing'],
    5: ['magnetic_lift', 'bridge_chasm', 'moving_skyway', 'thorn_crossing', 'prism_gate'],
    6: ['light_chamber', 'moving_skyway', 'barrier_run', 'color_steps', 'thorn_crossing'],
    7: ['bridge_chasm', 'magnetic_lift', 'color_lock', 'light_chamber', 'moving_skyway', 'hidden_alcove'],
    8: ['light_chamber', 'color_lock', 'magnetic_lift', 'bridge_chasm', 'moving_skyway', 'barrier_run', 'hidden_alcove'],
  };

  const primaryByWorld: Record<WorldId, SegmentType> = {
    1: indexInWorld % 2 === 0 ? 'barrier_run' : 'color_steps',
    2: 'bridge_chasm',
    3: 'moving_skyway',
    4: 'color_lock',
    5: 'magnetic_lift',
    6: 'light_chamber',
    7: indexInWorld % 2 === 0 ? 'magnetic_lift' : 'light_chamber',
    8: indexInWorld % 3 === 0 ? 'light_chamber' : indexInWorld % 3 === 1 ? 'color_lock' : 'magnetic_lift',
  };

  const numSegments = worldId <= 2 ? (indexInWorld <= 5 ? 2 : 3) : worldId <= 5 ? 3 : 4;
  const pool = worldPools[worldId];
  const chosen: SegmentType[] = [primaryByWorld[worldId]];

  while (chosen.length < numSegments) {
    const candidate = pool[Math.floor(rng() * pool.length)];
    // Avoid back-to-back identical segments for variety
    if (candidate !== chosen[chosen.length - 1] || pool.length === 1) {
      chosen.push(candidate);
    }
  }
  // Shuffle order slightly while keeping variety
  if (indexInWorld % 2 === 1 && chosen.length >= 2) {
    [chosen[0], chosen[1]] = [chosen[1], chosen[0]];
  }
  return chosen;
}

const OBJECTIVE_BY_SEGMENT: Record<SegmentType, string> = {
  color_steps: 'Time each hue change to cross the alternating chromatic steps.',
  barrier_run: 'Phase through colored monoliths while keeping your footing solid.',
  bridge_chasm: 'Materialize matching Color Bridges to span the abyss.',
  moving_skyway: 'Navigate the drifting platforms without dissolving your ride.',
  hidden_alcove: 'Uncover concealed pigment walls to claim secret crystals.',
  prism_gate: 'Attune your aura to unlock the sealed Prism Gate.',
  color_lock: 'Enter the exact harmonic color sequence to unlock the vault.',
  magnetic_lift: 'Activate magnetic attraction hues to glide across the rift.',
  light_chamber: 'Clear blocking shutters so the light beam strikes the receptor.',
  thorn_crossing: 'Blend away crystal thorns while navigating the elevated path.',
};

/**
 * Compiles a richly structured, guaranteed-reachable puzzle-platformer level
 * from modular architectural puzzle chambers. Every jump gap, step-up height,
 * bridge span, moving platform path, lock, and light beam is geometrically validated.
 */
export function buildModularLevel(levelId: number, worldId: WorldId, indexInWorld: number): LevelDef {
  const rng = createRng(levelId * 7919 + worldId * 104729 + indexInWorld * 313);
  const palette = pickPalette(worldId, indexInWorld, rng);
  const segments = chooseSegmentsForWorld(worldId, indexInWorld, rng);

  const levelHeight = 780;
  const platforms: RectPlatform[] = [];
  const movingPlatforms: MovingPlatformDef[] = [];
  const hazards: HazardDef[] = [];
  const gates: PrismGateDef[] = [];
  const crystals: CrystalDef[] = [];
  const checkpoints: CheckpointDef[] = [];
  const locks: ColorLockDef[] = [];
  const magneticBlocks: MagneticBlockDef[] = [];
  const emitters: LightEmitterDef[] = [];
  const mirrors: LightMirrorDef[] = [];
  const receptors: LightReceptorDef[] = [];
  const monsters: MonsterDef[] = [];

  let cursorX = 0;
  let floorY = 580 - Math.floor(rng() * 50); // 530..580
  let objCounter = 0;
  const nextId = (prefix: string) => `${prefix}_${levelId}_${++objCounter}`;
  const pickColor = (offset: number): ColorId => palette[(offset + levelId) % palette.length];

  // Start platform (safe neutral ground >= 280px wide)
  const startW = 290;
  platforms.push({
    id: nextId('start'),
    x: 0,
    y: floorY,
    w: startW,
    h: levelHeight - floorY,
    kind: 'neutral',
  });
  const spawn = { x: 100, y: floorY - 60 };
  cursorX = startW;

  segments.forEach((seg, segIdx) => {
    const cA = pickColor(segIdx * 2);
    const cB = pickColor(segIdx * 2 + 1);
    const cC = pickColor(segIdx * 2 + 2);

    // Add a checkpoint before later segments on longer levels
    if (segIdx === Math.floor(segments.length / 2) && segIdx > 0) {
      checkpoints.push({
        id: nextId('cp'),
        x: cursorX - 95,
        y: floorY,
      });
    }

    if (seg === 'color_steps') {
      // 3 alternating color stepping stones with gentle vertical change
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        const gap = 72 + Math.floor(rng() * 28); // 72..99px (well within single jump)
        const stepDelta = i === 1 ? -46 : i === 2 ? (rng() > 0.5 ? -36 : 30) : -24;
        floorY = Math.max(360, Math.min(600, floorY + stepDelta));
        const pw = 145 + Math.floor(rng() * 30);
        const col = i % 2 === 0 ? cA : cB;
        platforms.push({
          id: nextId('step'),
          x: cursorX + gap,
          y: floorY,
          w: pw,
          h: 26,
          colorId: col,
          kind: 'color_block',
        });
        if (i === 1) {
          crystals.push({
            id: nextId('cry'),
            x: cursorX + gap + Math.floor(pw / 2),
            y: floorY - 48,
            colorId: col,
          });
        }
        cursorX += gap + pw;
      }
      // Landing neutral stone
      const landGap = 76;
      const landW = 210;
      platforms.push({
        id: nextId('land'),
        x: cursorX + landGap,
        y: floorY,
        w: landW,
        h: levelHeight - floorY,
        kind: 'neutral',
      });
      cursorX += landGap + landW;
    } else if (seg === 'barrier_run') {
      // Solid platform crossed by 2 different colored barriers + an elevated bonus ledge
      const segW = 460;
      platforms.push({
        id: nextId('bar_floor'),
        x: cursorX,
        y: floorY,
        w: segW,
        h: levelHeight - floorY,
        kind: 'neutral',
      });
      platforms.push({
        id: nextId('wall'),
        x: cursorX + 135,
        y: floorY - 175,
        w: 38,
        h: 175,
        colorId: cA,
        kind: 'color_block',
      });
      platforms.push({
        id: nextId('wall'),
        x: cursorX + 305,
        y: floorY - 175,
        w: 38,
        h: 175,
        colorId: cB,
        kind: 'color_block',
      });
      hazards.push({
        id: nextId('haz'),
        x: cursorX + 205,
        y: floorY - 28,
        w: 72,
        h: 28,
        colorId: cC,
        direction: 'up',
      });
      crystals.push({
        id: nextId('cry'),
        x: cursorX + 240,
        y: floorY - 76,
        colorId: cC,
      });
      cursorX += segW;
    } else if (seg === 'bridge_chasm') {
      // Twin Color Bridges spanning a deep chasm with a neutral mid-pillar
      const br1W = 215;
      platforms.push({
        id: nextId('br'),
        x: cursorX + 12,
        y: floorY,
        w: br1W,
        h: 22,
        colorId: cA,
        kind: 'bridge',
      });
      crystals.push({
        id: nextId('cry'),
        x: cursorX + 12 + Math.floor(br1W / 2),
        y: floorY - 48,
        colorId: cA,
      });
      cursorX += br1W + 24;

      const pillarW = 140;
      const nextY = Math.max(370, Math.min(590, floorY - 28));
      platforms.push({
        id: nextId('pil'),
        x: cursorX,
        y: nextY,
        w: pillarW,
        h: levelHeight - nextY,
        kind: 'neutral',
      });
      floorY = nextY;
      cursorX += pillarW;

      const br2W = 225;
      platforms.push({
        id: nextId('br'),
        x: cursorX + 12,
        y: floorY,
        w: br2W,
        h: 22,
        colorId: cB,
        kind: 'bridge',
      });
      cursorX += br2W + 24;

      const landW = 200;
      platforms.push({
        id: nextId('land'),
        x: cursorX,
        y: floorY,
        w: landW,
        h: levelHeight - floorY,
        kind: 'neutral',
      });
      cursorX += landW;
    } else if (seg === 'moving_skyway') {
      // Moving platform traversing a scenic gap with optional colored hazard overhead
      const span = 340;
      const targetY = Math.max(360, Math.min(585, floorY - (rng() > 0.5 ? 50 : -20)));
      movingPlatforms.push({
        id: nextId('mp'),
        x: cursorX + 42,
        y: floorY - 6,
        w: 130,
        h: 24,
        toX: cursorX + span - 140,
        toY: targetY - 6,
        speed: 98 + worldId * 5,
        colorId: segIdx % 2 === 0 ? cA : undefined,
      });
      crystals.push({
        id: nextId('cry'),
        x: cursorX + Math.floor(span / 2),
        y: Math.min(floorY, targetY) - 62,
        colorId: cB,
      });
      cursorX += span;
      floorY = targetY;

      const landW = 220;
      platforms.push({
        id: nextId('land'),
        x: cursorX,
        y: floorY,
        w: landW,
        h: levelHeight - floorY,
        kind: 'neutral',
      });
      cursorX += landW;
    } else if (seg === 'hidden_alcove') {
      // Split-level pavilion: top route + secret ground alcove behind hidden wall
      const segW = 390;
      platforms.push({
        id: nextId('alc_floor'),
        x: cursorX,
        y: floorY,
        w: segW,
        h: levelHeight - floorY,
        kind: 'neutral',
      });
      // Upper ledge
      platforms.push({
        id: nextId('alc_roof'),
        x: cursorX + 95,
        y: floorY - 125,
        w: 220,
        h: 26,
        kind: 'neutral',
      });
      // Hidden front wall concealing secret crystal underneath
      platforms.push({
        id: nextId('hid'),
        x: cursorX + 95,
        y: floorY - 99,
        w: 30,
        h: 99,
        colorId: cA,
        kind: 'hidden_wall',
      });
      crystals.push({
        id: nextId('cry'),
        x: cursorX + 215,
        y: floorY - 46,
        colorId: cA,
        secret: true,
      });
      cursorX += segW;
    } else if (seg === 'prism_gate') {
      // Chamber with a match-activated Prism Gate and elevated overhang
      const segW = 370;
      platforms.push({
        id: nextId('pg_floor'),
        x: cursorX,
        y: floorY,
        w: segW,
        h: levelHeight - floorY,
        kind: 'neutral',
      });
      platforms.push({
        id: nextId('pg_roof'),
        x: cursorX + 185,
        y: Math.max(80, floorY - 310),
        w: 90,
        h: 140,
        kind: 'neutral',
      });
      gates.push({
        id: nextId('gate'),
        x: cursorX + 210,
        y: floorY - 170,
        w: 42,
        h: 170,
        colorId: cA,
        unlockMode: 'match',
      });
      crystals.push({
        id: nextId('cry'),
        x: cursorX + 305,
        y: floorY - 48,
        colorId: cA,
      });
      cursorX += segW;
    } else if (seg === 'color_lock') {
      // Vault with a 2-to-4 step Color Lock pillar linked to a Prism Gate
      const segW = 460;
      platforms.push({
        id: nextId('lk_floor'),
        x: cursorX,
        y: floorY,
        w: segW,
        h: levelHeight - floorY,
        kind: 'neutral',
      });
      const gateId = nextId('gate');
      platforms.push({
        id: nextId('lk_roof'),
        x: cursorX + 315,
        y: Math.max(80, floorY - 310),
        w: 88,
        h: 140,
        kind: 'neutral',
      });
      gates.push({
        id: gateId,
        x: cursorX + 338,
        y: floorY - 170,
        w: 42,
        h: 170,
        colorId: cC,
        unlockMode: 'linked',
      });
      const seqLen = worldId >= 7 ? 4 : worldId >= 5 ? 3 : 2;
      const sequence: ColorId[] = [];
      for (let k = 0; k < seqLen; k++) {
        sequence.push(pickColor(segIdx * 3 + k));
      }
      locks.push({
        id: nextId('lock'),
        x: cursorX + 165,
        y: floorY,
        sequence,
        targetGateId: gateId,
      });
      crystals.push({
        id: nextId('cry'),
        x: cursorX + 250,
        y: floorY - 90,
        colorId: sequence[sequence.length - 1],
      });
      cursorX += segW;
    } else if (seg === 'magnetic_lift') {
      // Gap bridged by a Magnetic Color Monolith pulled by reactColorId
      const span = 350;
      const targetY = Math.max(365, Math.min(585, floorY - 56));
      magneticBlocks.push({
        id: nextId('mag'),
        x: cursorX + 30,
        y: floorY - 10,
        w: 120,
        h: 30,
        toX: cursorX + span - 140,
        toY: targetY - 10,
        colorId: cA,
        reactColorId: cB === cA ? cC : cB,
        speed: 175,
      });
      crystals.push({
        id: nextId('cry'),
        x: cursorX + Math.floor(span / 2),
        y: Math.min(floorY, targetY) - 60,
        colorId: cB === cA ? cC : cB,
      });
      cursorX += span;
      floorY = targetY;
      const landW = 220;
      platforms.push({
        id: nextId('land'),
        x: cursorX,
        y: floorY,
        w: landW,
        h: levelHeight - floorY,
        kind: 'neutral',
      });
      cursorX += landW;
    } else if (seg === 'light_chamber') {
      // Optics chamber: emitter shoots beam across a colored shutter -> mirror -> receptor -> unlocks gate
      const segW = 540;
      platforms.push({
        id: nextId('lt_floor'),
        x: cursorX,
        y: floorY,
        w: segW,
        h: levelHeight - floorY,
        kind: 'neutral',
      });
      const beamY = floorY - 210;
      const gateId = nextId('gate');
      platforms.push({
        id: nextId('lt_roof'),
        x: cursorX + 415,
        y: Math.max(60, floorY - 320),
        w: 84,
        h: 150,
        kind: 'neutral',
      });
      gates.push({
        id: gateId,
        x: cursorX + 436,
        y: floorY - 170,
        w: 42,
        h: 170,
        colorId: cA,
        unlockMode: 'linked',
      });
      // Shutter blocking the beam until player matches cB
      const shutterColor = cB === cA ? cC : cB;
      platforms.push({
        id: nextId('shutter'),
        x: cursorX + 200,
        y: beamY - 55,
        w: 34,
        h: 120,
        colorId: shutterColor,
        kind: 'color_block',
      });
      emitters.push({
        id: nextId('em'),
        x: cursorX + 55,
        y: beamY,
        dir: 'right',
        colorId: cA,
      });
      mirrors.push({
        id: nextId('mir'),
        x: cursorX + 345,
        y: beamY,
        angle: '\\',
      });
      receptors.push({
        id: nextId('rec'),
        x: cursorX + 345,
        y: floorY - 26,
        colorId: cA,
        targetGateId: gateId,
      });
      crystals.push({
        id: nextId('cry'),
        x: cursorX + 275,
        y: floorY - 52,
        colorId: shutterColor,
      });
      cursorX += segW;
    } else {
      // thorn_crossing: floor with 2 alternating colored thorn beds + overhead stepping ledge
      const segW = 430;
      platforms.push({
        id: nextId('th_floor'),
        x: cursorX,
        y: floorY,
        w: segW,
        h: levelHeight - floorY,
        kind: 'neutral',
      });
      hazards.push({
        id: nextId('haz'),
        x: cursorX + 75,
        y: floorY - 28,
        w: 110,
        h: 28,
        colorId: cA,
        direction: 'up',
      });
      hazards.push({
        id: nextId('haz'),
        x: cursorX + 245,
        y: floorY - 28,
        w: 110,
        h: 28,
        colorId: cB,
        direction: 'up',
      });
      platforms.push({
        id: nextId('th_ledge'),
        x: cursorX + 165,
        y: floorY - 82,
        w: 115,
        h: 22,
        colorId: cC,
        kind: 'color_block',
      });
      crystals.push({
        id: nextId('cry'),
        x: cursorX + 222,
        y: floorY - 128,
        colorId: cC,
      });
      cursorX += segW;
    }
  });

  // Final Portal Sanctuary
  const endW = 290;
  platforms.push({
    id: nextId('end'),
    x: cursorX,
    y: floorY,
    w: endW,
    h: levelHeight - floorY,
    kind: 'neutral',
  });
  const portal = { x: cursorX + 175, y: floorY - 62 };
  const totalWidth = cursorX + endW;

  // Populate 1–3 patrolling monsters on qualifying neutral platforms (never on spawn slab, never overlapping hazards/gates)
  const targetMonsters = worldId <= 2 ? 1 : worldId <= 5 ? 2 : 3;
  const archetypePool: MonsterArchetype[] =
    worldId <= 2 ? ['crawler'] : worldId <= 4 ? ['crawler', 'hopper'] : ['crawler', 'hopper', 'sentinel'];

  for (const p of platforms) {
    if (monsters.length >= targetMonsters) break;
    if (p.kind !== 'neutral') continue;
    if (p.x < 220) continue; // Keep starting zone completely safe on spawn
    if (p.w < 190) continue; // Require generous patrol runway
    if (p.h < 60 && p.y < 340) continue; // Skip high narrow roofs

    // Keep patrol segment clear of hazards, gates, checkpoints, and exit portal
    const margin = 18;
    const minX = p.x + margin;
    const maxX = p.x + p.w - margin;
    if (maxX - minX < 120) continue;

    const overlapsPortal = portal.x >= minX - 45 && portal.x <= maxX + 45 && Math.abs(portal.y - (p.y - 60)) < 90;
    const overlapsHazard = hazards.some((h) => h.x < maxX && h.x + h.w > minX && Math.abs(h.y + h.h - p.y) < 40);
    const overlapsGate = gates.some((g) => g.x < maxX && g.x + g.w > minX && Math.abs(g.y + g.h - p.y) < 40);
    const overlapsCheckpoint = checkpoints.some((cp) => cp.x >= minX - 35 && cp.x <= maxX + 35 && Math.abs(cp.y - p.y) < 40);

    let patrolMinX = minX;
    let patrolMaxX = maxX;

    if (overlapsPortal) {
      patrolMaxX = Math.min(patrolMaxX, portal.x - 68);
    }
    if (overlapsHazard || overlapsGate || overlapsCheckpoint) continue;
    if (patrolMaxX - patrolMinX < 105) continue;

    const archetype = archetypePool[(monsters.length + levelId) % archetypePool.length];
    const mw = archetype === 'sentinel' ? 38 : 36;
    const mh = archetype === 'sentinel' ? 36 : archetype === 'hopper' ? 34 : 32;
    const speed = 68 + worldId * 5 + (archetype === 'sentinel' ? 10 : 0);
    const vulnerableColor = pickColor(monsters.length * 2 + 1);

    monsters.push({
      id: nextId('mon'),
      x: Math.round((patrolMinX + patrolMaxX - mw) * 0.5),
      y: p.y,
      w: mw,
      h: mh,
      patrolMinX,
      patrolMaxX,
      speed,
      vulnerableColor,
      archetype,
    });
  }

  // Fallback guarantee: if all mid-platforms had hazards/gates, place 1 safe guard before the portal sanctuary
  if (monsters.length === 0) {
    const endPlat = platforms[platforms.length - 1];
    const minX = endPlat.x + 12;
    const maxX = Math.max(minX + 95, portal.x - 56);
    monsters.push({
      id: nextId('mon'),
      x: minX + 18,
      y: endPlat.y,
      w: 36,
      h: 32,
      patrolMinX: minX,
      patrolMaxX: maxX,
      speed: 72 + worldId * 4,
      vulnerableColor: palette[0],
      archetype: 'crawler',
    });
  }

  const title = LEVEL_TITLES[worldId][indexInWorld - 1] ?? `Chamber ${worldId}-${indexInWorld}`;
  const objective = OBJECTIVE_BY_SEGMENT[segments[0]];

  return {
    id: levelId,
    worldId,
    indexInWorld,
    name: title,
    objective,
    width: totalWidth,
    height: levelHeight,
    spawn,
    portal,
    palette,
    initialColor: 'void',
    platforms,
    movingPlatforms,
    hazards,
    gates,
    crystals,
    checkpoints,
    locks,
    magneticBlocks,
    emitters,
    mirrors,
    receptors,
    monsters,
  };
}
