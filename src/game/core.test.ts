import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BGM_TRACK_URL,
  computeEffectiveMusicVolume,
  diagnoseInvalidAudioPayload,
  isValidMp3Bytes,
} from './audio';
import { COLOR_PALETTE, COLOR_MAP, getBackgroundRgb, lerpRgb } from './colors';
import {
  computeDisplayProgress,
  computeRawLoadProgress,
  createInitialLoadTasks,
  getFirstEssentialError,
  getOptionalAudioWarning,
  MIN_LOADING_DISPLAY_MS,
} from './loader';
import {
  clearDirectionalHold,
  computeCameraFraming,
  computeMobileViewportProfile,
  createDirectionalHoldState,
  getDirectionalHoldOutput,
  pressDirectionalHold,
  releaseDirectionalHoldToken,
  resolveDirectionalPadInput,
} from './mobileLayout';
import {
  advanceColorLock,
  computeSafeMonsterResetX,
  evaluateColorBlastHit,
  evaluateColorObjectState,
  evaluateJumpTrigger,
  evaluateMonsterContact,
  isDoubleJumpAvailable,
  reflectBeamDir,
  resolveReMaterializeOverlap,
  traceLightBeams,
} from './rules';
import {
  computeCompletionPercent,
  countTotalCollectedCrystals,
  createDefaultSave,
  recordLevelCompletion,
  sanitizeSaveData,
} from './save';

test('16-color system defines exactly 16 unique colors with valid HEX values', () => {
  assert.equal(COLOR_PALETTE.length, 16);
  const ids = new Set(COLOR_PALETTE.map((c) => c.id));
  const hexes = new Set(COLOR_PALETTE.map((c) => c.hex));
  assert.equal(ids.size, 16);
  assert.equal(hexes.size, 16);
  for (const c of COLOR_PALETTE) {
    assert.match(c.hex, /^#[0-9A-Fa-f]{6}$/);
    assert.equal(COLOR_MAP[c.id].hex, c.hex);
  }
  const bg = getBackgroundRgb('crimson', [20, 20, 30]);
  assert.equal(bg.length, 3);
  const lerped = lerpRgb([0, 0, 0], [100, 200, 50], 0.5);
  assert.deepEqual(lerped, [50, 100, 25]);
});

test('color switching rules toggle visibility and collision accurately', () => {
  // Standard block hides when matching background
  assert.equal(evaluateColorObjectState('color_block', 'crimson', 'crimson').solid, false);
  assert.equal(evaluateColorObjectState('color_block', 'crimson', 'cyan').solid, true);
  assert.equal(evaluateColorObjectState('color_block', 'crimson', 'void').solid, true);

  // Neutral terrain never hides
  assert.equal(evaluateColorObjectState('neutral', undefined, 'crimson').solid, true);

  // Color Bridges use inverse materialization rule
  assert.equal(evaluateColorObjectState('bridge', 'cyan', 'cyan').solid, true);
  assert.equal(evaluateColorObjectState('bridge', 'cyan', 'crimson').solid, false);
  assert.equal(evaluateColorObjectState('bridge', 'cyan', 'void').solid, false);

  // Hazards become safe when matched
  assert.equal(evaluateColorObjectState('hazard', 'gold', 'gold').solid, false);
  assert.equal(evaluateColorObjectState('hazard', 'gold', 'crimson').solid, true);
});

test('safe re-materialize overlap nudges player out cleanly or grants phased grace', () => {
  const block = { x: 100, y: 200, w: 60, h: 60 };
  // Player overlapping top edge of block should nudge cleanly onto top
  const nearTopPlayer = { x: 110, y: 180, w: 28, h: 44 };
  const resTop = resolveReMaterializeOverlap(nearTopPlayer, block, []);
  assert.equal(resTop.safeGrace, false);
  assert.equal(resTop.nudgedY, 155);

  // Player deeply trapped in the middle of a huge solid pillar gets phasedGrace instead of crush
  const hugePillar = { x: 100, y: 100, w: 200, h: 200 };
  const trappedPlayer = { x: 185, y: 180, w: 28, h: 44 };
  const resTrapped = resolveReMaterializeOverlap(trappedPlayer, hugePillar, []);
  assert.equal(resTrapped.safeGrace, true);
});

test('Color Lock sequence requires exact order and unlocks target gate', () => {
  const lock = {
    id: 'lk1',
    x: 200,
    y: 400,
    sequence: ['crimson', 'cyan', 'gold'] as Array<'crimson' | 'cyan' | 'gold'>,
    targetGateId: 'g1',
  };

  let state = advanceColorLock(lock, 0, false, 'crimson');
  assert.equal(state.step, 1);
  assert.equal(state.unlocked, false);

  // Wrong color resets sequence
  state = advanceColorLock(lock, state.step, false, 'violet');
  assert.equal(state.step, 0);
  assert.equal(state.reset, true);

  // Complete full sequence
  state = advanceColorLock(lock, 0, false, 'crimson');
  state = advanceColorLock(lock, state.step, false, 'cyan');
  state = advanceColorLock(lock, state.step, false, 'gold');
  assert.equal(state.unlocked, true);
  assert.equal(state.step, 3);
});

test('Light Beam raycasting reflects off mirrors and clears when shutter hides', () => {
  assert.equal(reflectBeamDir('right', '\\'), 'down');
  assert.equal(reflectBeamDir('right', '/'), 'up');

  const emitters = [{ id: 'e1', x: 100, y: 200, dir: 'right' as const, colorId: 'amber' as const }];
  const mirrors = [{ id: 'm1', x: 400, y: 200, angle: '\\' as const }];
  const receptors = [{ id: 'r1', x: 400, y: 400, colorId: 'amber' as const, targetGateId: 'g1' }];
  const shutter = [{ x: 250, y: 150, w: 30, h: 100 }];

  // With shutter solid: receptor is NOT hit
  const blocked = traceLightBeams(emitters, mirrors, receptors, shutter, 'void', 1000, 600);
  assert.equal(blocked.activatedReceptorIds.has('r1'), false);

  // With shutter hidden (removed from solidObstacles): beam bounces off mirror and hits receptor
  const open = traceLightBeams(emitters, mirrors, receptors, [], 'crimson', 1000, 600);
  assert.equal(open.activatedReceptorIds.has('r1'), true);
  assert.equal(open.segments.length, 2);
});

test('jump trigger handles coyote time, double jump, and crystal threshold', () => {
  assert.equal(isDoubleJumpAvailable(0, 1), false);
  assert.equal(isDoubleJumpAvailable(5, 1), true);
  assert.equal(isDoubleJumpAvailable(0, 4), true);

  assert.deepEqual(
    evaluateJumpTrigger({ jumpBuffered: true, coyoteTimer: 0.05, onGround: false, airJumpsRemaining: 0 }),
    { shouldJump: true, isAirJump: false },
  );
  assert.deepEqual(
    evaluateJumpTrigger({ jumpBuffered: true, coyoteTimer: 0, onGround: false, airJumpsRemaining: 1 }),
    { shouldJump: true, isAirJump: true },
  );
});

test('Save Manager safely recovers corrupted data and updates level progression', () => {
  const recovered = sanitizeSaveData({ unlockedLevel: 9999, completedLevels: ['bad', 1, 1, 2], settings: { masterVolume: 5 } });
  assert.equal(recovered.unlockedLevel, 104);
  assert.deepEqual(recovered.completedLevels, [1, 2]);
  assert.equal(recovered.settings.masterVolume, 1);

  const fresh = createDefaultSave();
  const { next, isNewBest } = recordLevelCompletion(fresh, 1, 18.4, ['c1', 'c2'], 1);
  assert.equal(isNewBest, true);
  assert.equal(next.unlockedLevel, 2);
  assert.equal(countTotalCollectedCrystals(next), 2);
  assert.equal(computeCompletionPercent(next), 1);
});

test('monster stomp requires strict downward descent onto head; side, front, rear, and below contact kill player immediately', () => {
  const monster = { x: 400, y: 570, w: 36, h: 30 }; // occupies y: 570..600

  // 1. Valid downward stomp from above (feet cross from 566 -> 578 with vy > 15)
  assert.equal(
    evaluateMonsterContact({
      player: { x: 404, y: 534, w: 28, h: 44 }, // bottom = 578
      prevPlayerBottom: 566,
      playerVy: 220,
      monster,
    }),
    'stomp',
  );

  // 2. Sideways walking contact on same floor (vy = 0) -> instant player_death
  assert.equal(
    evaluateMonsterContact({
      player: { x: 378, y: 556, w: 28, h: 44 }, // bottom = 600, right = 406
      prevPlayerBottom: 600,
      playerVy: 0,
      monster,
    }),
    'player_death',
  );

  // 3. Rear horizontal contact while descending slightly after already below head cutoff -> player_death
  assert.equal(
    evaluateMonsterContact({
      player: { x: 428, y: 554, w: 28, h: 44 }, // bottom = 598
      prevPlayerBottom: 592,
      playerVy: 60,
      monster,
    }),
    'player_death',
  );

  // 4. Collision from below while jumping upward (vy < 0) -> instant player_death
  assert.equal(
    evaluateMonsterContact({
      player: { x: 404, y: 590, w: 28, h: 44 },
      prevPlayerBottom: 640,
      playerVy: -320,
      monster,
    }),
    'player_death',
  );

  // 5. No overlap -> none
  assert.equal(
    evaluateMonsterContact({
      player: { x: 200, y: 556, w: 28, h: 44 },
      prevPlayerBottom: 600,
      playerVy: 0,
      monster,
    }),
    'none',
  );
});

test('Color Blast defeats monster only when projectile matches vulnerableColor', () => {
  assert.deepEqual(evaluateColorBlastHit('crimson', 'crimson'), { defeated: true });
  assert.deepEqual(evaluateColorBlastHit('cyan', 'crimson'), { defeated: false });
  assert.deepEqual(evaluateColorBlastHit('void', 'crimson'), { defeated: false });
});

test('computeSafeMonsterResetX prevents instant-death respawn loops near checkpoints', () => {
  // Far from spawn -> keeps defaultX
  const far = computeSafeMonsterResetX({
    defaultX: 800,
    monsterW: 36,
    monsterY: 600,
    monsterH: 28,
    patrolMinX: 650,
    patrolMaxX: 980,
    respawnCenterX: 120,
    respawnCenterY: 570,
  });
  assert.equal(far.x, 800);
  assert.equal(far.suppressNearSpawn, false);

  // Default X overlaps checkpoint, but far patrol edge is safe -> shifts to farthest edge
  const shifted = computeSafeMonsterResetX({
    defaultX: 500,
    monsterW: 36,
    monsterY: 600,
    monsterH: 28,
    patrolMinX: 460,
    patrolMaxX: 760,
    respawnCenterX: 510,
    respawnCenterY: 575,
  });
  assert.equal(shifted.suppressNearSpawn, false);
  assert.equal(shifted.x, 724);

  // Entire short patrol lane is right on top of checkpoint -> suppresses cleanly
  const suppressed = computeSafeMonsterResetX({
    defaultX: 500,
    monsterW: 36,
    monsterY: 600,
    monsterH: 28,
    patrolMinX: 470,
    patrolMaxX: 550,
    respawnCenterX: 510,
    respawnCenterY: 575,
  });
  assert.equal(suppressed.suppressNearSpawn, true);
});

test('Background music settings compute effective volume and persist musicEnabled safely', () => {
  assert.equal(BGM_TRACK_URL, '/assets/audio/colorix-theme.mp3');

  // Active music computes master * music clamped to [0, 1]
  assert.ok(
    Math.abs(
      computeEffectiveMusicVolume({
        masterVolume: 0.8,
        musicVolume: 0.5,
        musicEnabled: true,
        muted: false,
      }) - 0.4,
    ) < 1e-9,
  );

  // Disabled music or muted output immediately zeroes volume
  assert.equal(
    computeEffectiveMusicVolume({
      masterVolume: 0.8,
      musicVolume: 0.9,
      musicEnabled: false,
      muted: false,
    }),
    0,
  );
  assert.equal(
    computeEffectiveMusicVolume({
      masterVolume: 0.8,
      musicVolume: 0.9,
      musicEnabled: true,
      muted: true,
    }),
    0,
  );

  // Save sanitization preserves musicEnabled boolean and defaults legacy saves to true
  const legacyRecovered = sanitizeSaveData({ settings: { musicVolume: 0.7 } });
  assert.equal(legacyRecovered.settings.musicEnabled, true);
  assert.equal(legacyRecovered.settings.musicVolume, 0.7);

  const disabledSaved = sanitizeSaveData({ settings: { musicEnabled: false, musicVolume: 0.35, muted: true } });
  assert.equal(disabledSaved.settings.musicEnabled, false);
  assert.equal(disabledSaved.settings.musicVolume, 0.35);
  assert.equal(disabledSaved.settings.muted, true);

  // MP3 header validator recognizes ID3 and MPEG frame sync while diagnosing HTML / Git LFS payloads
  assert.equal(isValidMp3Bytes(new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00])), true);
  assert.equal(isValidMp3Bytes(new Uint8Array([0xff, 0xfb, 0x90, 0x64])), true);
  const htmlBytes = new TextEncoder().encode('<!doctype html><html></html>');
  assert.equal(isValidMp3Bytes(htmlBytes), false);
  assert.match(diagnoseInvalidAudioPayload(htmlBytes), /HTML/i);
  const lfsBytes = new TextEncoder().encode('version https://git-lfs.github.com/spec/v1\n');
  assert.equal(isValidMp3Bytes(lfsBytes), false);
  assert.match(diagnoseInvalidAudioPayload(lfsBytes), /Git LFS/i);
});

test('Loading system tracks essential tasks accurately, keeps optional audio non-fatal, and blocks only on essential errors', () => {
  const tasks = createInitialLoadTasks();
  assert.equal(computeRawLoadProgress(tasks), 0);
  assert.equal(getFirstEssentialError(tasks), null);
  assert.equal(getOptionalAudioWarning(tasks), null);

  // Partial essential completion never yields 100%
  tasks[0].status = 'loaded'; // core_data: 25%
  tasks[1].status = 'loaded'; // fonts: +20% = 45%
  assert.equal(computeRawLoadProgress(tasks), 45);

  // Even after minimum display time passes, incomplete essential assets MUST NOT reach 100% or transition
  const slowWait = computeDisplayProgress({
    rawProgress: 45,
    elapsedMs: MIN_LOADING_DISPLAY_MS * 3,
    hasError: false,
  });
  assert.ok(slowWait.targetPercent <= 45);
  assert.equal(slowWait.readyToTransition, false);

  // Optional background music failure MUST NOT block reaching 100% or transitioning to the Main Menu
  const audioTask = tasks.find((t) => t.id === 'audio')!;
  audioTask.status = 'error';
  audioTask.errorMessage = 'Background music file returned HTTP 404.';
  assert.equal(getFirstEssentialError(tasks), null);
  assert.equal(getOptionalAudioWarning(tasks), 'Background music file returned HTTP 404.');

  // Complete remaining essential task (engine) -> reaches 100% even though optional audio failed
  const engineTask = tasks.find((t) => t.id === 'engine')!;
  engineTask.status = 'loaded';
  assert.equal(computeRawLoadProgress(tasks), 100);

  const midFast = computeDisplayProgress({
    rawProgress: 100,
    elapsedMs: MIN_LOADING_DISPLAY_MS * 0.5,
    hasError: false,
  });
  assert.ok(midFast.targetPercent > 40 && midFast.targetPercent < 95);
  assert.equal(midFast.readyToTransition, false);

  const doneFast = computeDisplayProgress({
    rawProgress: 100,
    elapsedMs: MIN_LOADING_DISPLAY_MS,
    hasError: false,
  });
  assert.equal(doneFast.targetPercent, 100);
  assert.equal(doneFast.readyToTransition, true);

  // Genuinely essential asset error (e.g. engine) still prevents transition and surfaces explicit error
  engineTask.status = 'error';
  engineTask.errorMessage = 'Phaser engine failed to initialize';
  assert.equal(getFirstEssentialError(tasks), 'Phaser engine failed to initialize');
  const errored = computeDisplayProgress({
    rawProgress: computeRawLoadProgress(tasks),
    elapsedMs: MIN_LOADING_DISPLAY_MS * 2,
    hasError: true,
  });
  assert.equal(errored.readyToTransition, false);
  assert.ok(errored.targetPercent < 100);
});

test('desktop PC/Laptop profile uses pixel-budgeted HiDPI & proportional zoom while mobile stays strictly unchanged', () => {
  // Desktop 1440x900 @ DPR 2 (Retina laptop): crisp HiDPI renderScale within pixel budget + proportional zoom
  const retinaLaptop = computeMobileViewportProfile({
    width: 1440,
    height: 900,
    devicePixelRatio: 2,
    isTouchDevice: false,
    hardwareConcurrency: 8,
    graphicsQuality: 'high',
  });
  assert.equal(retinaLaptop.isMobile, false);
  assert.ok(retinaLaptop.renderScale >= 1.6 && retinaLaptop.renderScale <= 2.0);
  assert.ok(1440 * 900 * retinaLaptop.renderScale * retinaLaptop.renderScale <= 4_000_000);
  assert.equal(retinaLaptop.logicalZoom, 1.25); // 900 / 720 = exact 1.25x
  assert.equal(retinaLaptop.topSafePx, 0);
  assert.equal(retinaLaptop.bottomSafePx, 0);
  assert.equal(retinaLaptop.bgBands, 28);
  assert.equal(retinaLaptop.particleScale, 1);
  assert.equal(retinaLaptop.highFidelityDetail, true);

  // Desktop 1920x1080 @ DPR 1.25 (Windows Full HD 125% scaling): exact 1.5x zoom fills screen edge-to-edge
  const fhdPc = computeMobileViewportProfile({
    width: 1920,
    height: 1080,
    devicePixelRatio: 1.25,
    isTouchDevice: false,
    hardwareConcurrency: 8,
    graphicsQuality: 'high',
  });
  assert.equal(fhdPc.isMobile, false);
  assert.equal(fhdPc.renderScale, 1.25);
  assert.equal(fhdPc.logicalZoom, 1.5); // 1920/1.5 = 1280, 1080/1.5 = 720 (zero empty side margins!)

  // Desktop 2560x1440 @ DPR 2 (QHD PC): stays within smooth physical pixel budget (no 5K bloat) & exact 2.0x zoom
  const qhdPc = computeMobileViewportProfile({
    width: 2560,
    height: 1440,
    devicePixelRatio: 2,
    isTouchDevice: false,
    hardwareConcurrency: 8,
    graphicsQuality: 'high',
  });
  assert.equal(qhdPc.isMobile, false);
  assert.equal(qhdPc.logicalZoom, 2);
  assert.ok(2560 * 1440 * qhdPc.renderScale * qhdPc.renderScale <= 4_100_000);

  // Desktop Low Quality disables desktop high-fidelity detail & lowers sky bands/DPR cap
  const lowDesktop = computeMobileViewportProfile({
    width: 1366,
    height: 768,
    devicePixelRatio: 2,
    isTouchDevice: false,
    hardwareConcurrency: 4,
    graphicsQuality: 'low',
  });
  assert.equal(lowDesktop.isMobile, false);
  assert.equal(lowDesktop.renderScale, 1.25);
  assert.equal(lowDesktop.bgBands, 14);
  assert.equal(lowDesktop.highFidelityDetail, false);
  assert.equal(lowDesktop.drawLightShafts, false);

  // STRICT MOBILE PRESERVATION: Mobile portrait (390x844 @ DPR 3) unchanged
  const portrait = computeMobileViewportProfile({
    width: 390,
    height: 844,
    devicePixelRatio: 3,
    isTouchDevice: true,
    hardwareConcurrency: 6,
    graphicsQuality: 'high',
  });
  assert.equal(portrait.isMobile, true);
  assert.equal(portrait.orientation, 'portrait');
  assert.equal(portrait.renderScale, 2);
  assert.equal(portrait.highFidelityDetail, undefined);
  assert.ok(portrait.topSafePx >= 98 && portrait.bottomSafePx >= 104);
  assert.ok(portrait.logicalZoom >= 0.66 && portrait.logicalZoom <= 0.9);

  // STRICT MOBILE PRESERVATION: Low-end mobile unchanged
  const lowEnd = computeMobileViewportProfile({
    width: 360,
    height: 740,
    devicePixelRatio: 3,
    isTouchDevice: true,
    hardwareConcurrency: 4,
    graphicsQuality: 'low',
  });
  assert.equal(lowEnd.isMobile, true);
  assert.equal(lowEnd.isLowEndMobile, true);
  assert.equal(lowEnd.renderScale, 1.5);
  assert.equal(lowEnd.drawLightShafts, false);
  assert.equal(lowEnd.bgBands, 8);

  // STRICT MOBILE PRESERVATION: Mobile landscape phone (932x430) unchanged
  const landscape = computeMobileViewportProfile({
    width: 932,
    height: 430,
    devicePixelRatio: 2,
    isTouchDevice: true,
    hardwareConcurrency: 6,
    graphicsQuality: 'high',
  });
  assert.equal(landscape.isMobile, true);
  assert.equal(landscape.orientation, 'landscape');
  assert.equal(landscape.renderScale, 2);
  assert.ok(landscape.topSafePx <= 56);
  assert.ok(landscape.bottomSafePx <= 90);
});

test('camera framing keeps player unobstructed on mobile and fills PC/Laptop resolutions cleanly without floating voids', () => {
  const mobileViewports = [
    { name: 'portrait-390x844', w: 390, h: 844 },
    { name: 'compact-portrait-360x740', w: 360, h: 740 },
    { name: 'landscape-844x390', w: 844, h: 390 },
    { name: 'compact-landscape-667x375', w: 667, h: 375 },
  ];

  // Level 1 standard geometry: 1280x720, ground surface at y=600, player body y=556..600 (center 578)
  const levelWidth = 1280;
  const levelHeight = 720;
  const playerTopWorldY = 556;
  const playerBottomWorldY = 600;
  const playerCenterY = 578;

  for (const vp of mobileViewports) {
    const profile = computeMobileViewportProfile({
      width: vp.w,
      height: vp.h,
      devicePixelRatio: 2,
      isTouchDevice: true,
      graphicsQuality: 'high',
    });
    const cam = computeCameraFraming({
      profile,
      viewW: vp.w,
      viewH: vp.h,
      levelWidth,
      levelHeight,
      playerCenterX: 114,
      playerCenterY,
      facing: 1,
      useLookAhead: false,
    });

    const playerTopScreenY = (playerTopWorldY - cam.camY) * cam.logicalZoom;
    const playerBottomScreenY = (playerBottomWorldY - cam.camY) * cam.logicalZoom;

    assert.ok(
      playerTopScreenY >= profile.topSafePx,
      `${vp.name}: player top (${playerTopScreenY.toFixed(1)}) must stay below top HUD (${profile.topSafePx})`,
    );
    assert.ok(
      playerBottomScreenY <= vp.h - profile.bottomSafePx + 1,
      `${vp.name}: player feet (${playerBottomScreenY.toFixed(1)}) must stay above bottom controls (${vp.h - profile.bottomSafePx})`,
    );
  }

  // Desktop resolutions (1280x720, 1366x768, 1440x900, 1920x1080, 2560x1440):
  // Level fills full width/height with zero floating side margins and player stays cleanly above bottom HUD dock!
  const desktopViewports = [
    { name: 'hd-1280x720', w: 1280, h: 720 },
    { name: 'laptop-1366x768', w: 1366, h: 768 },
    { name: 'macbook-1440x900', w: 1440, h: 900 },
    { name: 'fhd-1920x1080', w: 1920, h: 1080 },
    { name: 'qhd-2560x1440', w: 2560, h: 1440 },
  ];

  for (const vp of desktopViewports) {
    const desktopProfile = computeMobileViewportProfile({
      width: vp.w,
      height: vp.h,
      devicePixelRatio: 1,
      isTouchDevice: false,
      graphicsQuality: 'high',
    });
    const desktopCam = computeCameraFraming({
      profile: desktopProfile,
      viewW: vp.w,
      viewH: vp.h,
      levelWidth,
      levelHeight,
      playerCenterX: 114,
      playerCenterY,
      facing: 1,
      useLookAhead: false,
    });

    // Zero huge floating side voids (effW <= 1281 -> camX >= -1)
    assert.ok(
      desktopCam.camX >= -1,
      `${vp.name}: expected no floating left void, got camX=${desktopCam.camX}`,
    );
    const playerBottomScreenY = (playerBottomWorldY - desktopCam.camY) * desktopCam.logicalZoom;
    assert.ok(
      playerBottomScreenY <= vp.h - 90,
      `${vp.name}: player feet (${playerBottomScreenY.toFixed(1)}) must stay cleanly above bottom HUD dock`,
    );
  }
});

test('directional touch pad prevents simultaneous left+right and enforces center dead-zone', () => {
  assert.deepEqual(resolveDirectionalPadInput(20, 140), { left: true, right: false });
  assert.deepEqual(resolveDirectionalPadInput(70, 140), { left: false, right: false });
  assert.deepEqual(resolveDirectionalPadInput(115, 140), { left: false, right: true });
  assert.deepEqual(resolveDirectionalPadInput(0, 0), { left: false, right: false });
});

test('mobile directional hold state machine supports continuous hold, immediate release, clean reversal, and interrupt clear', () => {
  let state = createDirectionalHoldState();
  assert.deepEqual(getDirectionalHoldOutput(state), { left: false, right: false, activeDir: null });

  // 1. Hold LEFT continuously -> left stays true until matching token releases
  state = pressDirectionalHold(state, 'left', 'p:1');
  assert.deepEqual(getDirectionalHoldOutput(state), { left: true, right: false, activeDir: 'left' });

  // Unrelated pointer (e.g. JUMP thumb p:2) ending must NOT cancel held LEFT movement
  state = releaseDirectionalHoldToken(state, 'p:2');
  assert.deepEqual(getDirectionalHoldOutput(state), { left: true, right: false, activeDir: 'left' });

  // Releasing LEFT stops movement immediately
  state = releaseDirectionalHoldToken(state, 'p:1');
  assert.deepEqual(getDirectionalHoldOutput(state), { left: false, right: false, activeDir: null });

  // 2. Hold RIGHT continuously -> right stays true, immediate stop on release
  state = pressDirectionalHold(state, 'right', 'p:3');
  assert.deepEqual(getDirectionalHoldOutput(state), { left: false, right: true, activeDir: 'right' });
  state = releaseDirectionalHoldToken(state, 'p:3');
  assert.deepEqual(getDirectionalHoldOutput(state), { left: false, right: false, activeDir: null });

  // 3. Overlapping direction switch (hold LEFT p:4, then press RIGHT p:5) -> newest wins, NEVER both true
  state = pressDirectionalHold(state, 'left', 'p:4');
  state = pressDirectionalHold(state, 'right', 'p:5');
  assert.deepEqual(getDirectionalHoldOutput(state), { left: false, right: true, activeDir: 'right' });

  // Lifting RIGHT while LEFT is still held cleanly falls back to LEFT
  state = releaseDirectionalHoldToken(state, 'p:5');
  assert.deepEqual(getDirectionalHoldOutput(state), { left: true, right: false, activeDir: 'left' });

  // 4. Interrupted touch / blur / HUD hide clears all holds immediately with zero stuck movement
  state = clearDirectionalHold();
  assert.deepEqual(getDirectionalHoldOutput(state), { left: false, right: false, activeDir: null });
});





