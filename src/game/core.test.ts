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



