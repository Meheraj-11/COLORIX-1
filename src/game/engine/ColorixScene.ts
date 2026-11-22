import Phaser from 'phaser';
import { audioManager } from '../audio';
import {
  COLOR_MAP,
  COLOR_PALETTE,
  getBackgroundRgb,
  lerpRgb,
  rgbToHexNum,
  type ActiveColor,
  type ColorId,
} from '../colors';
import { getLevelById, TOTAL_LEVEL_COUNT, WORLD_MAP } from '../levels';
import {
  aabbOverlap,
  advanceColorLock,
  computeSafeMonsterResetX,
  DOUBLE_JUMP_CRYSTAL_THRESHOLD,
  evaluateColorBlastHit,
  evaluateColorObjectState,
  evaluateJumpTrigger,
  evaluateMonsterContact,
  isDoubleJumpAvailable,
  resolveReMaterializeOverlap,
  traceLightBeams,
  type AABB,
  type LightSegment,
} from '../rules';
import type {
  GameSettings,
  HudSnapshot,
  LevelDef,
  MonsterArchetype,
  WorldDef,
} from '../types';
import { BackgroundRenderer } from './backgroundRenderer';
import type { EngineCallbacks, TouchInputState } from './eventBus';
import { ParticlePool } from './particlePool';

interface RuntimePlatform {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  colorId?: ColorId;
  kind: 'neutral' | 'color_block' | 'bridge' | 'hidden_wall';
  alpha: number;
  solid: boolean;
  /** Temporary phased safety grace if player was inside when this became solid */
  phasedGrace: boolean;
}

interface RuntimeMovingPlatform {
  id: string;
  startX: number;
  startY: number;
  toX: number;
  toY: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  w: number;
  h: number;
  speed: number;
  progress: number;
  dir: 1 | -1;
  colorId?: ColorId;
  alpha: number;
  solid: boolean;
  phasedGrace: boolean;
}

interface RuntimeMagnetic {
  id: string;
  startX: number;
  startY: number;
  toX: number;
  toY: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  w: number;
  h: number;
  speed: number;
  colorId: ColorId;
  reactColorId: ColorId;
  alpha: number;
  solid: boolean;
  phasedGrace: boolean;
  engaged: boolean;
}

interface RuntimeGate {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  colorId: ColorId;
  unlockMode: 'match' | 'linked';
  unlocked: boolean;
  openProgress: number; // 0 = closed, 1 = fully open
}

interface RuntimeLock {
  id: string;
  x: number;
  y: number;
  sequence: ColorId[];
  targetGateId: string;
  step: number;
  unlocked: boolean;
}

interface RuntimeCrystal {
  id: string;
  x: number;
  y: number;
  colorId: ColorId;
  secret?: boolean;
  collected: boolean;
}

interface RuntimeCheckpoint {
  id: string;
  x: number;
  y: number;
  activated: boolean;
}

interface RuntimeHazard {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  colorId?: ColorId;
  direction: 'up' | 'down';
  alpha: number;
  active: boolean;
}

interface RuntimeMonster {
  id: string;
  startX: number;
  x: number;
  y: number; // feet Y
  groundY: number;
  vy: number;
  w: number;
  h: number;
  patrolMinX: number;
  patrolMaxX: number;
  speed: number;
  dir: 1 | -1;
  vulnerableColor: ColorId;
  archetype: MonsterArchetype;
  defeated: boolean;
  defeatTimer: number;
  animPhase: number;
  hopTimer: number;
  deflectFlashTimer: number;
  suppressed: boolean;
}

interface RuntimeBlast {
  id: number;
  x: number;
  y: number;
  vx: number;
  color: ActiveColor;
  traveled: number;
  maxRange: number;
  radius: number;
}

const PLAYER_W = 28;
const PLAYER_H = 44;
const GRAVITY = 1280;
const FALL_GRAVITY_MULT = 1.24;
const MOVE_SPEED = 280;
const GROUND_ACCEL = 2300;
const AIR_ACCEL = 1650;
const GROUND_FRICTION = 2400;
const AIR_FRICTION = 650;
const JUMP_SPEED = -530;
const DOUBLE_JUMP_SPEED = -475;
const MAX_FALL_SPEED = 780;
const COYOTE_TIME = 0.11;
const JUMP_BUFFER_TIME = 0.125;

// Monster Combat Tuning
const STOMP_BOUNCE_VY = -400;
const BLAST_COOLDOWN = 0.65;
const BLAST_SPEED = 640;
const BLAST_RANGE = 560;
const BLAST_RADIUS = 11;
const DEATH_DURATION = 0.62;
const RESPAWN_FADE_IN_DURATION = 0.24;
const MONSTER_DEFEAT_DURATION = 0.34;

export class ColorixScene extends Phaser.Scene {
  private callbacks!: EngineCallbacks;
  private bgRenderer = new BackgroundRenderer();
  private particles = new ParticlePool();

  private bgGraphics!: Phaser.GameObjects.Graphics;
  private worldGraphics!: Phaser.GameObjects.Graphics;
  private entityGraphics!: Phaser.GameObjects.Graphics;
  private fxGraphics!: Phaser.GameObjects.Graphics;
  private deathFadeGraphics!: Phaser.GameObjects.Graphics;

  private mode: 'title' | 'playing' = 'title';
  private paused = false;
  private levelCompleteLock = false;

  private level!: LevelDef;
  private worldDef: WorldDef = WORLD_MAP[1];
  private settings: GameSettings = {
    masterVolume: 0.8,
    musicVolume: 0.55,
    musicEnabled: true,
    sfxVolume: 0.85,
    muted: false,
    graphicsQuality: 'high',
    controlScheme: 'wasd',
    touchMode: 'auto',
    language: 'en',
    fullscreen: false,
  };

  // Active Color & Smooth Transition
  private activeColor: ActiveColor = 'void';
  private currentBgRgb: [number, number, number] = [21, 25, 38];
  private targetBgRgb: [number, number, number] = [21, 25, 38];

  // Runtime Level Objects
  private platforms: RuntimePlatform[] = [];
  private movingPlatforms: RuntimeMovingPlatform[] = [];
  private magneticBlocks: RuntimeMagnetic[] = [];
  private gates: RuntimeGate[] = [];
  private locks: RuntimeLock[] = [];
  private crystals: RuntimeCrystal[] = [];
  private checkpoints: RuntimeCheckpoint[] = [];
  private hazards: RuntimeHazard[] = [];
  private monsters: RuntimeMonster[] = [];
  private blasts: RuntimeBlast[] = [];
  private nextBlastId = 1;
  private lightSegments: LightSegment[] = [];
  private activatedReceptors = new Set<string>();

  // Player Physics & Animation State
  private px = 100;
  private py = 500;
  private prevPlayerBottom = 500 + PLAYER_H;
  private vx = 0;
  private vy = 0;
  private facing: 1 | -1 = 1;
  private onGround = false;
  private wasOnGround = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private airJumpsRemaining = 0;
  private scaleX = 1;
  private scaleY = 1;
  private walkDistance = 0;
  private scarfNodes: Array<{ x: number; y: number }> = [
    { x: 100, y: 500 },
    { x: 92, y: 504 },
    { x: 84, y: 508 },
  ];
  private spawnX = 100;
  private spawnY = 500;
  private isDead = false;
  private respawnTimer = 0;
  private deathAnimTimer = 0;
  private respawnFadeInTimer = 0;
  private deathOriginX = 100;
  private deathOriginY = 500;
  private blastCooldown = 0;
  private lastBroadcastCooldownBucket = 0;
  private hitstopTimer = 0;
  private cameraTrauma = 0;
  private switchRippleTimer = 0;

  // Run Stats
  private ownedCrystalsBeforeRun = 0;
  private runCollectedCrystalIds = new Set<string>();
  private elapsedSeconds = 0;
  private deathsInRun = 0;
  private lastHudBroadcastSec = -1;
  private timeSec = 0;

  // Smooth Camera State
  private camX = 0;
  private camY = 0;
  private titleDriftIndex = 0;
  private titleDriftTimer = 0;

  // Unified Keyboard + Touch Inputs
  private keysHeld = new Set<string>();
  private touchInput: TouchInputState = {
    left: false,
    right: false,
    jumpHeld: false,
    jumpJustPressed: false,
  };
  private prevJumpHeld = false;

  private boundKeyDown!: (e: KeyboardEvent) => void;
  private boundKeyUp!: (e: KeyboardEvent) => void;
  private boundBlur!: () => void;
  private boundVisChange!: () => void;

  constructor() {
    super({ key: 'ColorixScene' });
  }

  public setCallbacks(callbacks: EngineCallbacks): void {
    this.callbacks = callbacks;
  }

  public create(): void {
    // Fixed screen-space background layer (scrollFactor 0)
    this.bgGraphics = this.add.graphics().setScrollFactor(0).setDepth(0);
    // World-space layers
    this.worldGraphics = this.add.graphics().setDepth(10);
    this.entityGraphics = this.add.graphics().setDepth(20);
    this.fxGraphics = this.add.graphics().setDepth(30);
    // Fixed screen-space death/respawn transition curtain
    this.deathFadeGraphics = this.add.graphics().setScrollFactor(0).setDepth(40);

    this.setupInputListeners();
    this.enterTitleMode();
    this.callbacks?.onEngineReady?.();
  }

  private setupInputListeners(): void {
    this.boundKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      const code = e.code;

      if (code === 'Escape' || (code === 'KeyP' && this.mode === 'playing')) {
        if (this.mode === 'playing') {
          e.preventDefault();
          this.callbacks?.onTogglePause();
        }
        return;
      }

      if (code === 'KeyM') {
        this.callbacks?.onToggleMute();
        return;
      }

      if (this.mode !== 'playing' || this.paused || this.levelCompleteLock || this.isDead) return;

      if (code === 'KeyR' && !e.repeat) {
        e.preventDefault();
        this.restartLevel();
        return;
      }

      if (code === 'KeyX' && !e.repeat) {
        e.preventDefault();
        this.triggerColorBlast();
        return;
      }

      if ((code === 'Tab' || code === 'KeyC') && !e.repeat) {
        e.preventDefault();
        this.callbacks?.onToggleWheel();
        return;
      }

      if (code === 'KeyQ' && !e.repeat) {
        this.cycleColor(-1);
        return;
      }
      if (code === 'KeyE' && !e.repeat) {
        this.cycleColor(1);
        return;
      }

      // Number keys 1-8 map to the level's featured palette colors
      if (code.startsWith('Digit') && !e.repeat) {
        const digit = parseInt(code.replace('Digit', ''), 10);
        if (digit >= 1 && digit <= 8) {
          const targetColor = this.level.palette[digit - 1];
          if (targetColor) {
            this.selectColor(targetColor);
          }
          return;
        }
        if (digit === 0) {
          this.selectColor('void');
          return;
        }
      }

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(code)) {
        e.preventDefault();
      }

      const wasHeld = this.keysHeld.has(code);
      this.keysHeld.add(code);

      const isJumpKey = code === 'Space' || code === 'KeyW' || code === 'ArrowUp';
      if (isJumpKey && !wasHeld) {
        this.jumpBufferTimer = JUMP_BUFFER_TIME;
      }
    };

    this.boundKeyUp = (e: KeyboardEvent) => {
      this.keysHeld.delete(e.code);
    };

    this.boundBlur = () => this.clearInputs();
    this.boundVisChange = () => {
      if (document.hidden) this.clearInputs();
    };

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('blur', this.boundBlur);
    document.addEventListener('visibilitychange', this.boundVisChange);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      window.removeEventListener('blur', this.boundBlur);
      document.removeEventListener('visibilitychange', this.boundVisChange);
    });
  }

  public clearInputs(): void {
    this.keysHeld.clear();
    this.touchInput = { left: false, right: false, jumpHeld: false, jumpJustPressed: false };
    this.prevJumpHeld = false;
  }

  public applySettings(settings: GameSettings): void {
    this.settings = { ...settings };
  }

  public setTouchInput(patch: Partial<TouchInputState>): void {
    this.touchInput = { ...this.touchInput, ...patch };
  }

  public triggerTouchJump(): void {
    if (this.isDead || this.paused || this.levelCompleteLock) return;
    this.touchInput.jumpHeld = true;
    this.jumpBufferTimer = JUMP_BUFFER_TIME;
  }

  public releaseTouchJump(): void {
    this.touchInput.jumpHeld = false;
  }

  public triggerColorBlast(): void {
    if (this.mode !== 'playing' || this.paused || this.levelCompleteLock || this.isDead) return;
    if (this.blastCooldown > 0) return;

    const muzzleX = this.px + PLAYER_W * 0.5 + this.facing * 16;
    const muzzleY = this.py + PLAYER_H * 0.46;

    this.blasts.push({
      id: this.nextBlastId++,
      x: muzzleX,
      y: muzzleY,
      vx: this.facing * BLAST_SPEED,
      color: this.activeColor,
      traveled: 0,
      maxRange: BLAST_RANGE,
      radius: BLAST_RADIUS,
    });

    this.blastCooldown = BLAST_COOLDOWN;
    this.lastBroadcastCooldownBucket = 12;

    // Tactile cast recoil + muzzle flash
    this.scaleX = 1.16;
    this.scaleY = 0.88;
    const boltHex = this.activeColor === 'void' ? 0x93c5fd : COLOR_MAP[this.activeColor].num;
    audioManager.playColorBlast(this.activeColor);
    this.particles.emit(muzzleX, muzzleY, 8, boltHex, {
      speedMin: 60,
      speedMax: 190,
      angleMin: this.facing > 0 ? -0.55 : Math.PI - 0.55,
      angleMax: this.facing > 0 ? 0.55 : Math.PI + 0.55,
      lifeMin: 0.14,
      lifeMax: 0.28,
      shape: 'diamond',
    });
    this.particles.emitRing(muzzleX, muzzleY, boltHex, 26);
    this.broadcastHud(true);
  }

  public enterTitleMode(): void {
    this.mode = 'title';
    this.paused = false;
    this.levelCompleteLock = false;
    this.clearInputs();
    this.particles.clear();
    this.worldDef = WORLD_MAP[1];
    this.level = getLevelById(1);
    this.buildLevelRuntime(this.level);
    this.activeColor = 'indigo';
    this.targetBgRgb = getBackgroundRgb('indigo', this.worldDef.baseBgRgb);
    this.currentBgRgb = [...this.targetBgRgb];
    this.camX = 0;
    this.camY = 0;
    this.cameras.main.setZoom(1);
    this.px = 455;
    this.py = 600 - PLAYER_H;
    this.facing = 1;
    this.resetScarf();
  }

  public loadLevel(levelId: number, ownedCrystals: number): void {
    this.mode = 'playing';
    this.paused = false;
    this.levelCompleteLock = false;
    this.clearInputs();
    this.particles.clear();

    this.level = getLevelById(levelId);
    this.worldDef = WORLD_MAP[this.level.worldId];
    this.ownedCrystalsBeforeRun = ownedCrystals;
    this.runCollectedCrystalIds.clear();
    this.elapsedSeconds = 0;
    this.deathsInRun = 0;
    this.lastHudBroadcastSec = -1;

    this.buildLevelRuntime(this.level);
    this.activeColor = this.level.initialColor;
    this.targetBgRgb = getBackgroundRgb(this.activeColor, this.worldDef.baseBgRgb);
    this.currentBgRgb = [...this.targetBgRgb];

    this.spawnX = this.level.spawn.x;
    this.spawnY = this.level.spawn.y;
    this.placePlayerAt(this.spawnX, this.spawnY);
    this.snapCameraToPlayer();

    this.evaluateAllColorStates(true);
    this.updateLightBeams();
    this.broadcastHud(true);
  }

  public restartLevel(): void {
    if (!this.level) return;
    this.loadLevel(this.level.id, this.ownedCrystalsBeforeRun);
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.clearInputs();
    }
  }

  public selectColor(color: ActiveColor): void {
    if (this.mode !== 'playing' || this.paused || this.levelCompleteLock || this.isDead) return;
    if (color === this.activeColor) return;

    this.activeColor = color;
    this.targetBgRgb = getBackgroundRgb(color, this.worldDef.baseBgRgb);
    this.switchRippleTimer = 0.28;
    audioManager.playColorSwitch(color);

    const ringHex = color === 'void' ? 0xe2e8f0 : COLOR_MAP[color].num;
    this.particles.emitRing(this.px + PLAYER_W * 0.5, this.py + PLAYER_H * 0.5, ringHex, 66);

    this.evaluateAllColorStates(false);
    this.evaluateColorLocksOnSwitch(color);
    this.evaluatePrismGatesNearby();
    this.updateLightBeams();
    this.broadcastHud(true);
  }

  public cycleColor(dir: 1 | -1): void {
    if (!this.level || this.level.palette.length === 0) return;
    const pal = this.level.palette;
    const idx = this.activeColor === 'void' ? -1 : pal.indexOf(this.activeColor);
    const nextIdx = idx === -1 ? (dir > 0 ? 0 : pal.length - 1) : (idx + dir + pal.length) % pal.length;
    this.selectColor(pal[nextIdx]);
  }

  private buildLevelRuntime(def: LevelDef): void {
    this.platforms = def.platforms.map((p) => ({
      ...p,
      alpha: p.kind === 'bridge' ? 0.14 : 1,
      solid: p.kind !== 'bridge',
      phasedGrace: false,
    }));

    this.movingPlatforms = def.movingPlatforms.map((m) => ({
      id: m.id,
      startX: m.x,
      startY: m.y,
      toX: m.toX,
      toY: m.toY,
      x: m.x,
      y: m.y,
      prevX: m.x,
      prevY: m.y,
      w: m.w,
      h: m.h,
      speed: m.speed,
      progress: 0,
      dir: 1,
      colorId: m.colorId,
      alpha: 1,
      solid: true,
      phasedGrace: false,
    }));

    this.magneticBlocks = def.magneticBlocks.map((mb) => ({
      id: mb.id,
      startX: mb.x,
      startY: mb.y,
      toX: mb.toX,
      toY: mb.toY,
      x: mb.x,
      y: mb.y,
      prevX: mb.x,
      prevY: mb.y,
      w: mb.w,
      h: mb.h,
      speed: mb.speed,
      colorId: mb.colorId,
      reactColorId: mb.reactColorId,
      alpha: 1,
      solid: true,
      phasedGrace: false,
      engaged: false,
    }));

    this.gates = def.gates.map((g) => ({
      ...g,
      unlocked: false,
      openProgress: 0,
    }));

    this.locks = def.locks.map((l) => ({
      ...l,
      step: 0,
      unlocked: false,
    }));

    this.crystals = def.crystals.map((c) => ({
      ...c,
      collected: false,
    }));

    this.checkpoints = def.checkpoints.map((cp) => ({
      ...cp,
      activated: false,
    }));

    this.hazards = def.hazards.map((h) => ({
      ...h,
      direction: h.direction ?? 'up',
      alpha: 1,
      active: true,
    }));

    this.monsters = (def.monsters ?? []).map((m, idx) => {
      const defaultW = m.archetype === 'hopper' ? 34 : 36;
      const defaultH = m.archetype === 'sentinel' ? 40 : m.archetype === 'hopper' ? 32 : 28;
      return {
        id: m.id,
        startX: m.x,
        x: m.x,
        y: m.y,
        groundY: m.y,
        vy: 0,
        w: m.w ?? defaultW,
        h: m.h ?? defaultH,
        patrolMinX: m.patrolMinX,
        patrolMaxX: m.patrolMaxX,
        speed: m.speed,
        dir: idx % 2 === 0 ? 1 : -1,
        vulnerableColor: m.vulnerableColor,
        archetype: m.archetype,
        defeated: false,
        defeatTimer: 0,
        animPhase: idx * 1.7,
        hopTimer: 1.1 + (idx % 3) * 0.45,
        deflectFlashTimer: 0,
        suppressed: false,
      };
    });

    this.blasts = [];
    this.blastCooldown = 0;
    this.lastBroadcastCooldownBucket = 0;
    this.isDead = false;
    this.respawnTimer = 0;
    this.deathAnimTimer = 0;
    this.respawnFadeInTimer = 0;

    this.lightSegments = [];
    this.activatedReceptors.clear();
  }

  private placePlayerAt(x: number, y: number): void {
    this.px = x;
    this.py = y;
    this.prevPlayerBottom = y + PLAYER_H;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.wasOnGround = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.scaleX = 1;
    this.scaleY = 1;
    this.respawnTimer = 0;
    this.isDead = false;
    this.resetScarf();
  }

  private resetScarf(): void {
    const cx = this.px + PLAYER_W * 0.5;
    const cy = this.py + 14;
    this.scarfNodes = [
      { x: cx, y: cy },
      { x: cx - this.facing * 8, y: cy + 3 },
      { x: cx - this.facing * 16, y: cy + 6 },
    ];
  }

  private getPlayerRect(): AABB {
    return { x: this.px, y: this.py, w: PLAYER_W, h: PLAYER_H };
  }

  private getAllSolidRects(excludeId?: string): AABB[] {
    const list: AABB[] = [];
    for (const p of this.platforms) {
      if (p.solid && !p.phasedGrace && p.id !== excludeId) {
        list.push({ x: p.x, y: p.y, w: p.w, h: p.h });
      }
    }
    for (const mp of this.movingPlatforms) {
      if (mp.solid && !mp.phasedGrace && mp.id !== excludeId) {
        list.push({ x: mp.x, y: mp.y, w: mp.w, h: mp.h });
      }
    }
    for (const mb of this.magneticBlocks) {
      if (mb.solid && !mb.phasedGrace && mb.id !== excludeId) {
        list.push({ x: mb.x, y: mb.y, w: mb.w, h: mb.h });
      }
    }
    for (const g of this.gates) {
      if (!g.unlocked && g.openProgress < 0.7 && g.id !== excludeId) {
        list.push({ x: g.x, y: g.y, w: g.w, h: g.h * (1 - g.openProgress) });
      }
    }
    return list;
  }

  private evaluateAllColorStates(instant: boolean): void {
    const applyState = <T extends { id: string; x: number; y: number; w: number; h: number; solid: boolean; phasedGrace: boolean; alpha: number }>(
      item: T,
      kind: 'neutral' | 'color_block' | 'bridge' | 'hidden_wall' | 'moving' | 'magnetic',
      colorId: ColorId | undefined,
    ) => {
      const next = evaluateColorObjectState(kind, colorId, this.activeColor);
      const becomingSolid = !item.solid && next.solid;
      item.solid = next.solid;

      if (!next.solid) {
        item.phasedGrace = false;
      } else if (becomingSolid && !instant) {
        const playerRect = this.getPlayerRect();
        const itemRect: AABB = { x: item.x, y: item.y, w: item.w, h: item.h };
        if (aabbOverlap(playerRect, itemRect)) {
          const res = resolveReMaterializeOverlap(playerRect, itemRect, this.getAllSolidRects(item.id));
          if (res.safeGrace) {
            item.phasedGrace = true;
          } else {
            this.px = res.nudgedX;
            this.py = res.nudgedY;
          }
        }
      }

      if (instant) {
        item.alpha = next.targetAlpha;
      }
    };

    for (const p of this.platforms) {
      applyState(p, p.kind, p.colorId);
    }
    for (const mp of this.movingPlatforms) {
      applyState(mp, 'moving', mp.colorId);
    }
    for (const mb of this.magneticBlocks) {
      applyState(mb, 'magnetic', mb.colorId);
      mb.engaged = this.activeColor === mb.reactColorId;
    }
    for (const h of this.hazards) {
      const st = evaluateColorObjectState('hazard', h.colorId, this.activeColor);
      h.active = st.solid;
      if (instant) h.alpha = st.targetAlpha;
    }
  }

  private evaluateColorLocksOnSwitch(color: ActiveColor): void {
    for (const lk of this.locks) {
      if (lk.unlocked) continue;
      // Player must be within reasonable chamber range of the lock (420px) OR level has only 1 lock
      const dist = Math.hypot(this.px + PLAYER_W * 0.5 - lk.x, this.py + PLAYER_H * 0.5 - (lk.y - 40));
      if (this.locks.length > 1 && dist > 480) continue;

      const res = advanceColorLock(lk, lk.step, lk.unlocked, color);
      lk.step = res.step;
      if (res.unlocked) {
        lk.unlocked = true;
        this.unlockGateById(lk.targetGateId);
        this.particles.emit(lk.x, lk.y - 52, 18, COLOR_MAP[lk.sequence[lk.sequence.length - 1]].num, {
          speedMin: 60,
          speedMax: 190,
          shape: 'diamond',
        });
      } else if (res.advanced) {
        audioManager.playLockStep(lk.step);
        this.particles.emit(lk.x, lk.y - 52, 7, color === 'void' ? 0xffffff : COLOR_MAP[color].num, {
          speedMin: 40,
          speedMax: 110,
          shape: 'diamond',
        });
      }
    }
  }

  private unlockGateById(gateId: string): void {
    const gate = this.gates.find((g) => g.id === gateId);
    if (!gate || gate.unlocked) return;
    gate.unlocked = true;
    audioManager.playGateUnlock();
    this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.35);
    this.particles.emit(gate.x + gate.w * 0.5, gate.y + gate.h * 0.5, 22, COLOR_MAP[gate.colorId].num, {
      speedMin: 60,
      speedMax: 220,
      shape: 'diamond',
    });
    this.broadcastHud(true);
  }

  private evaluatePrismGatesNearby(): void {
    const pcx = this.px + PLAYER_W * 0.5;
    const pcy = this.py + PLAYER_H * 0.5;
    for (const g of this.gates) {
      if (g.unlocked || g.unlockMode !== 'match') continue;
      if (this.activeColor !== g.colorId) continue;
      const dist = Math.hypot(pcx - (g.x + g.w * 0.5), pcy - (g.y + g.h * 0.5));
      if (dist < 165) {
        this.unlockGateById(g.id);
      }
    }
  }

  private updateLightBeams(): void {
    if (!this.level || this.level.emitters.length === 0) {
      this.lightSegments = [];
      return;
    }
    // Light beams are blocked by currently solid platforms, moving platforms, magnetic blocks, and closed gates
    const blockers: AABB[] = [];
    for (const p of this.platforms) {
      if (p.solid) blockers.push({ x: p.x, y: p.y, w: p.w, h: p.h });
    }
    for (const mp of this.movingPlatforms) {
      if (mp.solid) blockers.push({ x: mp.x, y: mp.y, w: mp.w, h: mp.h });
    }
    for (const mb of this.magneticBlocks) {
      if (mb.solid) blockers.push({ x: mb.x, y: mb.y, w: mb.w, h: mb.h });
    }

    const res = traceLightBeams(
      this.level.emitters,
      this.level.mirrors,
      this.level.receptors,
      blockers,
      this.activeColor,
      this.level.width,
      this.level.height,
    );
    this.lightSegments = res.segments;

    for (const recId of res.activatedReceptorIds) {
      if (!this.activatedReceptors.has(recId)) {
        this.activatedReceptors.add(recId);
        const rec = this.level.receptors.find((r) => r.id === recId);
        if (rec) {
          this.unlockGateById(rec.targetGateId);
          this.particles.emit(rec.x, rec.y, 16, COLOR_MAP[rec.colorId].num, {
            speedMin: 50,
            speedMax: 160,
            shape: 'diamond',
          });
        }
      }
    }
  }

  public update(_time: number, deltaMs: number): void {
    const rawDt = deltaMs / 1000;
    const dt = Math.min(rawDt, 0.05);
    this.timeSec += dt;

    const viewW = this.scale.width;
    const viewH = this.scale.height;

    // Smooth background RGB transition (always ticks cleanly)
    const bgLerp = 1 - Math.exp(-9.5 * dt);
    this.currentBgRgb = lerpRgb(this.currentBgRgb, this.targetBgRgb, bgLerp);

    if (this.mode === 'title') {
      this.updateTitleShowcase(dt, viewW, viewH);
      this.renderFrame(viewW, viewH);
      return;
    }

    if (this.paused) {
      this.renderFrame(viewW, viewH);
      return;
    }

    // Visual effects & camera trauma always decay smoothly in real dt
    this.particles.update(dt);
    this.bgRenderer.update(dt, viewW, viewH, this.worldDef.theme);
    this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.9);
    this.switchRippleTimer = Math.max(0, this.switchRippleTimer - dt);

    // Smooth alpha transitions on all color objects (zero flicker!)
    this.updateObjectAlphas(dt);

    // Hitstop freeze frame for weighty impacts
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.renderFrame(viewW, viewH);
      return;
    }

    if (!this.levelCompleteLock) {
      this.elapsedSeconds += dt;
      this.updateMovingAndMagnetic(dt);
      this.updateGates(dt);
      this.updateLightBeams();
      this.updateMonsters(dt);
      this.updateBlasts(dt);

      // Update Color Blast cooldown & broadcast cleanly in discrete steps
      if (this.blastCooldown > 0) {
        this.blastCooldown = Math.max(0, this.blastCooldown - dt);
        const bucket = Math.ceil((this.blastCooldown / BLAST_COOLDOWN) * 12);
        if (bucket !== this.lastBroadcastCooldownBucket) {
          this.lastBroadcastCooldownBucket = bucket;
          this.broadcastHud(false);
        }
      }

      if (this.respawnFadeInTimer > 0) {
        this.respawnFadeInTimer = Math.max(0, this.respawnFadeInTimer - dt);
      }

      if (this.isDead) {
        this.respawnTimer = Math.max(0, this.respawnTimer - dt);
        this.deathAnimTimer = Math.max(0, this.deathAnimTimer - dt);
        if (this.respawnTimer <= 0) {
          this.handleRespawn();
        }
      } else {
        this.updatePlayerPhysics(dt);
        this.checkInteractions();
      }

      this.updateCamera(dt, viewW, viewH);

      const wholeSec = Math.floor(this.elapsedSeconds);
      if (wholeSec !== this.lastHudBroadcastSec) {
        this.lastHudBroadcastSec = wholeSec;
        this.broadcastHud(false);
      }
    }

    this.renderFrame(viewW, viewH);
  }

  private updateTitleShowcase(dt: number, viewW: number, viewH: number): void {
    this.bgRenderer.update(dt, viewW, viewH, this.worldDef.theme);
    this.particles.update(dt);

    // Gently cycle ambient spectrum hues on the Title Screen every 4.2s
    this.titleDriftTimer += dt;
    if (this.titleDriftTimer >= 4.2) {
      this.titleDriftTimer = 0;
      const showcasePalette: ActiveColor[] = ['void', 'indigo', 'teal', 'crimson', 'violet', 'azure'];
      this.titleDriftIndex = (this.titleDriftIndex + 1) % showcasePalette.length;
      this.activeColor = showcasePalette[this.titleDriftIndex];
      this.targetBgRgb = getBackgroundRgb(this.activeColor, this.worldDef.baseBgRgb);
    }

    // Gentle parallax pan across the scenic vista, anchored cleanly to bottom ground
    const maxCamX = Math.max(0, this.level.width - viewW);
    this.camX = maxCamX > 0 ? ((Math.sin(this.timeSec * 0.14 - Math.PI * 0.5) + 1) * 0.5) * Math.min(260, maxCamX) : -(viewW - this.level.width) * 0.5;
    this.camY = this.level.height - viewH;
    this.cameras.main.setZoom(1);
    this.cameras.main.setScroll(this.camX, this.camY);

    // Gentle breathing scarf animation on Luma
    this.updateScarf(dt);
    this.updateObjectAlphas(dt);
  }

  private updateObjectAlphas(dt: number): void {
    const rate = 1 - Math.exp(-13 * dt);
    const pRect = this.getPlayerRect();

    for (const p of this.platforms) {
      const target = evaluateColorObjectState(p.kind, p.colorId, this.activeColor).targetAlpha;
      if (p.phasedGrace) {
        p.alpha += (0.35 - p.alpha) * rate;
        if (!aabbOverlap(pRect, { x: p.x, y: p.y, w: p.w, h: p.h })) {
          p.phasedGrace = false;
        }
      } else {
        p.alpha += (target - p.alpha) * rate;
      }
    }

    for (const mp of this.movingPlatforms) {
      const target = evaluateColorObjectState('moving', mp.colorId, this.activeColor).targetAlpha;
      if (mp.phasedGrace) {
        mp.alpha += (0.35 - mp.alpha) * rate;
        if (!aabbOverlap(pRect, { x: mp.x, y: mp.y, w: mp.w, h: mp.h })) {
          mp.phasedGrace = false;
        }
      } else {
        mp.alpha += (target - mp.alpha) * rate;
      }
    }

    for (const mb of this.magneticBlocks) {
      const target = evaluateColorObjectState('magnetic', mb.colorId, this.activeColor).targetAlpha;
      if (mb.phasedGrace) {
        mb.alpha += (0.35 - mb.alpha) * rate;
        if (!aabbOverlap(pRect, { x: mb.x, y: mb.y, w: mb.w, h: mb.h })) {
          mb.phasedGrace = false;
        }
      } else {
        mb.alpha += (target - mb.alpha) * rate;
      }
    }

    for (const h of this.hazards) {
      const target = evaluateColorObjectState('hazard', h.colorId, this.activeColor).targetAlpha;
      h.alpha += (target - h.alpha) * rate;
    }
  }

  private updateMovingAndMagnetic(dt: number): void {
    // 1. Patrol moving platforms
    for (const mp of this.movingPlatforms) {
      mp.prevX = mp.x;
      mp.prevY = mp.y;
      const dist = Math.hypot(mp.toX - mp.startX, mp.toY - mp.startY);
      if (dist > 1) {
        mp.progress += (mp.dir * mp.speed * dt) / dist;
        if (mp.progress >= 1) {
          mp.progress = 1;
          mp.dir = -1;
        } else if (mp.progress <= 0) {
          mp.progress = 0;
          mp.dir = 1;
        }
        // Smooth ease near endpoints
        const eased = mp.progress * mp.progress * (3 - 2 * mp.progress);
        mp.x = mp.startX + (mp.toX - mp.startX) * eased;
        mp.y = mp.startY + (mp.toY - mp.startY) * eased;
      }
    }

    // 2. Magnetic Color Objects slide toward (toX, toY) when reactColorId is active, return smoothly otherwise
    for (const mb of this.magneticBlocks) {
      mb.prevX = mb.x;
      mb.prevY = mb.y;
      mb.engaged = this.activeColor === mb.reactColorId;
      const targetX = mb.engaged ? mb.toX : mb.startX;
      const targetY = mb.engaged ? mb.toY : mb.startY;
      const dx = targetX - mb.x;
      const dy = targetY - mb.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.5) {
        const step = Math.min(d, mb.speed * dt);
        mb.x += (dx / d) * step;
        mb.y += (dy / d) * step;
      } else {
        mb.x = targetX;
        mb.y = targetY;
      }
    }
  }

  private updateGates(dt: number): void {
    for (const g of this.gates) {
      if (g.unlocked && g.openProgress < 1) {
        g.openProgress = Math.min(1, g.openProgress + dt * 2.8);
      }
    }
  }

  private updateMonsters(dt: number): void {
    for (const m of this.monsters) {
      if (m.suppressed) continue;

      if (m.defeated) {
        if (m.defeatTimer > 0) {
          m.defeatTimer = Math.max(0, m.defeatTimer - dt);
        }
        continue;
      }

      m.animPhase += dt * (m.speed * 0.08 + 3.2);
      if (m.deflectFlashTimer > 0) {
        m.deflectFlashTimer = Math.max(0, m.deflectFlashTimer - dt);
      }

      // Patrol horizontally within safe platform bounds
      const maxLeft = Math.max(m.patrolMinX, m.patrolMaxX - m.w);
      if (maxLeft > m.patrolMinX + 2) {
        m.x += m.dir * m.speed * dt;
        if (m.x <= m.patrolMinX) {
          m.x = m.patrolMinX;
          m.dir = 1;
        } else if (m.x >= maxLeft) {
          m.x = maxLeft;
          m.dir = -1;
        }
      }

      // Archetype-specific vertical motion (Hopper performs rhythmic low hops)
      if (m.archetype === 'hopper') {
        if (m.y >= m.groundY - 0.5 && m.vy >= 0) {
          m.y = m.groundY;
          m.vy = 0;
          m.hopTimer -= dt;
          if (m.hopTimer <= 0) {
            m.vy = -270;
            m.hopTimer = 1.65;
          }
        } else {
          m.vy += 880 * dt;
          m.y += m.vy * dt;
          if (m.y >= m.groundY) {
            m.y = m.groundY;
            m.vy = 0;
          }
        }
      } else {
        m.y = m.groundY;
        m.vy = 0;
      }
    }
  }

  private updateBlasts(dt: number): void {
    if (this.blasts.length === 0) return;

    const solids = this.getAllSolidRects();
    const survivors: RuntimeBlast[] = [];

    for (const b of this.blasts) {
      const dx = b.vx * dt;
      b.x += dx;
      b.traveled += Math.abs(dx);

      if (b.traveled >= b.maxRange || b.x < -30 || b.x > this.level.width + 30) {
        continue;
      }

      const boltHex = b.color === 'void' ? 0x93c5fd : COLOR_MAP[b.color].num;
      // Subtle sparkling trail
      if (Math.random() < 0.45) {
        this.particles.emit(b.x, b.y, 1, boltHex, {
          speedMin: 10,
          speedMax: 45,
          lifeMin: 0.1,
          lifeMax: 0.2,
          sizeMin: 2,
          sizeMax: 3.8,
        });
      }

      const blastBox: AABB = {
        x: b.x - b.radius,
        y: b.y - b.radius,
        w: b.radius * 2,
        h: b.radius * 2,
      };

      // Check solid wall/block collision
      let hitWall = false;
      for (const s of solids) {
        if (aabbOverlap(blastBox, s)) {
          hitWall = true;
          break;
        }
      }
      if (hitWall) {
        this.particles.emit(b.x, b.y, 8, boltHex, {
          speedMin: 45,
          speedMax: 145,
          lifeMin: 0.15,
          lifeMax: 0.28,
          shape: 'diamond',
        });
        continue;
      }

      // Check active monster collision
      let consumed = false;
      for (const m of this.monsters) {
        if (m.defeated || m.suppressed) continue;
        const mBox: AABB = { x: m.x, y: m.y - m.h, w: m.w, h: m.h };
        if (aabbOverlap(blastBox, mBox)) {
          const hit = evaluateColorBlastHit(b.color, m.vulnerableColor);
          if (hit.defeated) {
            this.defeatMonster(m, false);
          } else {
            // Wrong color: clear metallic deflection feedback so player sees the monster's required hue
            m.deflectFlashTimer = 0.24;
            audioManager.playBlastDeflect();
            this.particles.emit(b.x, b.y, 9, 0xe2e8f0, {
              speedMin: 60,
              speedMax: 165,
              lifeMin: 0.14,
              lifeMax: 0.26,
            });
            this.particles.emitRing(b.x, b.y, 0xffffff, 24);
          }
          consumed = true;
          break;
        }
      }

      if (!consumed) {
        survivors.push(b);
      }
    }

    this.blasts = survivors;
  }

  private defeatMonster(m: RuntimeMonster, viaStomp: boolean): void {
    if (m.defeated) return;
    m.defeated = true;
    m.defeatTimer = MONSTER_DEFEAT_DURATION;
    this.hitstopTimer = 0.045;
    this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.34);

    const cx = m.x + m.w * 0.5;
    const cy = m.y - m.h * 0.5;
    const colHex = COLOR_MAP[m.vulnerableColor].num;

    audioManager.playMonsterDefeat(viaStomp);
    this.particles.emit(cx, cy, 20, colHex, {
      speedMin: 70,
      speedMax: 240,
      lifeMin: 0.24,
      lifeMax: 0.52,
      shape: 'diamond',
      gravity: 120,
    });
    this.particles.emit(cx, cy, 8, 0xffffff, {
      speedMin: 50,
      speedMax: 170,
      lifeMin: 0.16,
      lifeMax: 0.34,
    });
    this.particles.emitRing(cx, cy, colHex, 58);

    if (viaStomp) {
      // Crisp automatic stomp bounce so player keeps momentum cleanly
      this.py = Math.min(this.py, m.y - m.h - PLAYER_H + 2);
      this.vy = STOMP_BOUNCE_VY;
      this.onGround = false;
      this.jumpBufferTimer = 0;
      this.scaleX = 0.82;
      this.scaleY = 1.24;
      const totalCrystals = this.ownedCrystalsBeforeRun + this.runCollectedCrystalIds.size;
      if (isDoubleJumpAvailable(totalCrystals, this.level.worldId)) {
        this.airJumpsRemaining = 1;
      }
    }

    this.broadcastHud(true);
  }

  private updatePlayerPhysics(dt: number): void {
    // Check if standing on a moving or magnetic platform first to apply delta carry!
    if (this.onGround) {
      const footProbe: AABB = { x: this.px + 2, y: this.py + PLAYER_H - 2, w: PLAYER_W - 4, h: 6 };
      for (const mp of this.movingPlatforms) {
        if (mp.solid && !mp.phasedGrace && aabbOverlap(footProbe, { x: mp.prevX, y: mp.prevY, w: mp.w, h: mp.h })) {
          this.px += mp.x - mp.prevX;
          this.py += mp.y - mp.prevY;
          break;
        }
      }
      for (const mb of this.magneticBlocks) {
        if (mb.solid && !mb.phasedGrace && aabbOverlap(footProbe, { x: mb.prevX, y: mb.prevY, w: mb.w, h: mb.h })) {
          this.px += mb.x - mb.prevX;
          this.py += mb.y - mb.prevY;
          break;
        }
      }
    }

    const moveLeft = this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft') || this.touchInput.left;
    const moveRight = this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight') || this.touchInput.right;
    const jumpHeld =
      this.keysHeld.has('Space') ||
      this.keysHeld.has('KeyW') ||
      this.keysHeld.has('ArrowUp') ||
      this.touchInput.jumpHeld;

    const dir = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
    if (dir !== 0) {
      this.facing = dir > 0 ? 1 : -1;
      const accel = this.onGround ? GROUND_ACCEL : AIR_ACCEL;
      this.vx += dir * accel * dt;
      if (Math.abs(this.vx) > MOVE_SPEED) {
        this.vx = Math.sign(this.vx) * MOVE_SPEED;
      }
    } else {
      const fric = this.onGround ? GROUND_FRICTION : AIR_FRICTION;
      if (Math.abs(this.vx) <= fric * dt) {
        this.vx = 0;
      } else {
        this.vx -= Math.sign(this.vx) * fric * dt;
      }
    }

    // Coyote & Jump Buffer Timers
    if (this.onGround) {
      this.coyoteTimer = COYOTE_TIME;
      const totalCrystals = this.ownedCrystalsBeforeRun + this.runCollectedCrystalIds.size;
      this.airJumpsRemaining = isDoubleJumpAvailable(totalCrystals, this.level.worldId) ? 1 : 0;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    const jumpEval = evaluateJumpTrigger({
      jumpBuffered: this.jumpBufferTimer > 0,
      coyoteTimer: this.coyoteTimer,
      onGround: this.onGround,
      airJumpsRemaining: this.airJumpsRemaining,
    });

    if (jumpEval.shouldJump) {
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.onGround = false;
      if (jumpEval.isAirJump) {
        this.airJumpsRemaining = Math.max(0, this.airJumpsRemaining - 1);
        this.vy = DOUBLE_JUMP_SPEED;
        this.scaleX = 0.82;
        this.scaleY = 1.22;
        audioManager.playJump(true);
        const ringColor = this.activeColor === 'void' ? 0x93c5fd : COLOR_MAP[this.activeColor].num;
        this.particles.emitRing(this.px + PLAYER_W * 0.5, this.py + PLAYER_H, ringColor, 34);
      } else {
        this.vy = JUMP_SPEED;
        this.scaleX = 0.84;
        this.scaleY = 1.18;
        audioManager.playJump(false);
        this.particles.emit(this.px + PLAYER_W * 0.5, this.py + PLAYER_H, 5, 0xe2e8f0, {
          speedMin: 25,
          speedMax: 90,
          angleMin: Math.PI,
          angleMax: Math.PI * 2,
          lifeMin: 0.16,
          lifeMax: 0.3,
          gravity: 80,
        });
      }
    }

    // Variable jump height cut when jump key released while rising
    if (!jumpHeld && this.prevJumpHeld && this.vy < -140) {
      this.vy *= 0.48;
    }
    this.prevJumpHeld = jumpHeld;

    // Gravity with snappier falling arc
    const gravMult = this.vy > 0 ? FALL_GRAVITY_MULT : 1;
    this.vy = Math.min(MAX_FALL_SPEED, this.vy + GRAVITY * gravMult * dt);

    const solids = this.getAllSolidRects();

    // Axis-separated horizontal collision
    this.px += this.vx * dt;
    if (this.px < 0) {
      this.px = 0;
      this.vx = 0;
    } else if (this.px + PLAYER_W > this.level.width) {
      this.px = this.level.width - PLAYER_W;
      this.vx = 0;
    }
    for (const s of solids) {
      if (aabbOverlap({ x: this.px, y: this.py + 2, w: PLAYER_W, h: PLAYER_H - 4 }, s)) {
        if (this.vx > 0) {
          this.px = s.x - PLAYER_W;
          this.vx = 0;
        } else if (this.vx < 0) {
          this.px = s.x + s.w;
          this.vx = 0;
        }
      }
    }

    // Axis-separated vertical collision (capture previous feet Y before integrating Y for strict stomp detection)
    this.prevPlayerBottom = this.py + PLAYER_H;
    this.wasOnGround = this.onGround;
    this.onGround = false;
    const prevVy = this.vy;
    this.py += this.vy * dt;

    for (const s of solids) {
      if (aabbOverlap({ x: this.px + 2, y: this.py, w: PLAYER_W - 4, h: PLAYER_H }, s)) {
        if (this.vy >= 0) {
          this.py = s.y - PLAYER_H;
          this.vy = 0;
          this.onGround = true;
        } else if (this.vy < 0) {
          this.py = s.y + s.h;
          this.vy = 0;
        }
      }
    }

    // Landing squash & audio
    if (this.onGround && !this.wasOnGround && prevVy > 130) {
      const impact = Math.min(1, prevVy / 650);
      this.scaleX = 1 + 0.24 * impact;
      this.scaleY = 1 - 0.22 * impact;
      audioManager.playLand(impact);
      this.particles.emit(this.px + PLAYER_W * 0.5, this.py + PLAYER_H, 5, 0xcbd5e1, {
        speedMin: 30,
        speedMax: 105,
        angleMin: Math.PI * 1.05,
        angleMax: Math.PI * 1.95,
        lifeMin: 0.14,
        lifeMax: 0.28,
        gravity: 160,
      });
    }

    // Smooth squash/stretch return to 1
    const sqRate = 1 - Math.exp(-15 * dt);
    this.scaleX += (1 - this.scaleX) * sqRate;
    this.scaleY += (1 - this.scaleY) * sqRate;

    if (this.onGround && Math.abs(this.vx) > 10) {
      this.walkDistance += Math.abs(this.vx) * dt;
    }

    this.updateScarf(dt);
  }

  private updateScarf(dt: number): void {
    const anchorX = this.px + PLAYER_W * 0.5 - this.facing * 4;
    const anchorY = this.py + 15;
    this.scarfNodes[0].x = anchorX;
    this.scarfNodes[0].y = anchorY;

    const windX = -this.facing * (12 + Math.abs(this.vx) * 0.04);
    for (let i = 1; i < this.scarfNodes.length; i++) {
      const prev = this.scarfNodes[i - 1];
      const cur = this.scarfNodes[i];
      const targetX = prev.x + windX * 0.72;
      const targetY = prev.y + 2 + Math.sin(this.timeSec * 8 + i * 1.3) * 2.5 - this.vy * 0.008;
      const k = 1 - Math.exp(-18 * dt);
      cur.x += (targetX - cur.x) * k;
      cur.y += (targetY - cur.y) * k;
    }
  }

  private checkInteractions(): void {
    const pRect = this.getPlayerRect();
    const pcx = this.px + PLAYER_W * 0.5;
    const pcy = this.py + PLAYER_H * 0.5;

    // 1. Pit fall check
    if (this.py > this.level.height + 70) {
      this.triggerPlayerDeath();
      return;
    }

    // 2. Active Hazard check (only hurts if hazard is NOT blended into background)
    for (const h of this.hazards) {
      if (!h.active) continue;
      // Forgiving inset hitbox on spikes so near-misses feel fair
      const hBox: AABB = { x: h.x + 5, y: h.y + 6, w: Math.max(4, h.w - 10), h: Math.max(4, h.h - 6) };
      if (aabbOverlap(pRect, hBox)) {
        this.triggerPlayerDeath();
        return;
      }
    }

    // 2b. Monster Combat Collision (strict downward stomp vs instant one-hit player death)
    for (const m of this.monsters) {
      if (m.defeated || m.suppressed) continue;
      const outcome = evaluateMonsterContact({
        player: pRect,
        prevPlayerBottom: this.prevPlayerBottom,
        playerVy: this.vy,
        monster: { x: m.x, y: m.y - m.h, w: m.w, h: m.h },
      });
      if (outcome === 'stomp') {
        this.defeatMonster(m, true);
        break;
      }
      if (outcome === 'player_death') {
        this.triggerPlayerDeath();
        return;
      }
    }

    // 3. Match-mode Prism Gates proximity unlock
    this.evaluatePrismGatesNearby();

    // 4. Collect Color Crystals
    for (const c of this.crystals) {
      if (c.collected) continue;
      const dist = Math.hypot(pcx - c.x, pcy - c.y);
      if (dist < 30) {
        c.collected = true;
        this.runCollectedCrystalIds.add(c.id);
        audioManager.playCrystal();
        this.particles.emit(c.x, c.y, 16, COLOR_MAP[c.colorId].num, {
          speedMin: 55,
          speedMax: 185,
          shape: 'diamond',
          gravity: 60,
        });
        this.particles.emitRing(c.x, c.y, COLOR_MAP[c.colorId].num, 38);
        this.callbacks?.onCrystalCollected(this.level.id, c.id);
        this.broadcastHud(true);
      }
    }

    // 5. Checkpoints
    for (const cp of this.checkpoints) {
      if (cp.activated) continue;
      if (Math.abs(pcx - cp.x) < 34 && Math.abs(pcy - (cp.y - 36)) < 54) {
        cp.activated = true;
        this.spawnX = cp.x - PLAYER_W * 0.5;
        this.spawnY = cp.y - PLAYER_H - 4;
        audioManager.playCheckpoint();
        this.particles.emit(cp.x, cp.y - 42, 14, 0xfef08a, {
          speedMin: 40,
          speedMax: 140,
          shape: 'diamond',
          gravity: -40,
        });
        this.callbacks?.onCheckpointToast();
        this.broadcastHud(true);
      }
    }

    // 6. Exit Prism Portal
    const portalDist = Math.hypot(pcx - this.level.portal.x, pcy - this.level.portal.y);
    if (portalDist < 42) {
      this.completeCurrentLevel();
    }
  }

  private triggerPlayerDeath(): void {
    if (this.isDead || this.levelCompleteLock) return;
    this.isDead = true;
    this.deathsInRun++;
    this.respawnTimer = DEATH_DURATION;
    this.deathAnimTimer = DEATH_DURATION;
    this.deathOriginX = this.px + PLAYER_W * 0.5;
    this.deathOriginY = this.py + PLAYER_H * 0.5;
    this.vx = 0;
    this.vy = 0;
    this.clearInputs();
    this.blasts = [];
    this.hitstopTimer = 0.05;
    this.cameraTrauma = 0.62;
    audioManager.playDeath();

    const burstHex = this.activeColor === 'void' ? 0xf8fafc : COLOR_MAP[this.activeColor].num;
    this.particles.emit(this.deathOriginX, this.deathOriginY, 24, burstHex, {
      speedMin: 65,
      speedMax: 250,
      lifeMin: 0.25,
      lifeMax: 0.55,
      shape: 'diamond',
      gravity: 110,
    });
    this.particles.emit(this.deathOriginX, this.deathOriginY, 10, 0xffffff, {
      speedMin: 40,
      speedMax: 160,
      lifeMin: 0.18,
      lifeMax: 0.36,
    });
    this.particles.emitRing(this.deathOriginX, this.deathOriginY, burstHex, 68);
    this.broadcastHud(true);
  }

  private handleRespawn(): void {
    this.isDead = false;
    this.respawnFadeInTimer = RESPAWN_FADE_IN_DURATION;
    this.blastCooldown = 0;
    this.lastBroadcastCooldownBucket = 0;
    this.blasts = [];
    this.clearInputs();

    this.placePlayerAt(this.spawnX, this.spawnY);

    // Reset incomplete Color Locks while preserving unlocked gates & collected crystals
    for (const lk of this.locks) {
      if (!lk.unlocked) {
        lk.step = 0;
      }
    }

    // Safely reset monsters (zero instant-death respawn loops)
    const hasCheckpoint = this.checkpoints.some((c) => c.activated);
    const respawnCenterX = this.spawnX + PLAYER_W * 0.5;
    const respawnCenterY = this.spawnY + PLAYER_H * 0.5;

    for (const m of this.monsters) {
      // Keep monsters already defeated before an activated checkpoint cleared
      if (hasCheckpoint && m.defeated && m.startX < this.spawnX - 60) {
        continue;
      }
      const safe = computeSafeMonsterResetX({
        defaultX: m.startX,
        monsterW: m.w,
        monsterY: m.groundY,
        monsterH: m.h,
        patrolMinX: m.patrolMinX,
        patrolMaxX: m.patrolMaxX,
        respawnCenterX,
        respawnCenterY,
      });
      m.defeated = false;
      m.defeatTimer = 0;
      m.deflectFlashTimer = 0;
      m.x = safe.x;
      m.y = m.groundY;
      m.vy = 0;
      m.suppressed = safe.suppressNearSpawn;
    }

    this.evaluateAllColorStates(false);
    this.snapCameraToPlayer();
    this.particles.emitRing(this.px + PLAYER_W * 0.5, this.py + PLAYER_H * 0.5, 0xffffff, 48);
    this.broadcastHud(true);
  }

  private completeCurrentLevel(): void {
    this.levelCompleteLock = true;
    this.clearInputs();
    audioManager.playLevelComplete();
    this.particles.emit(this.level.portal.x, this.level.portal.y, 28, 0xfef08a, {
      speedMin: 70,
      speedMax: 260,
      shape: 'diamond',
      gravity: 40,
    });
    this.particles.emitRing(this.level.portal.x, this.level.portal.y, 0xffffff, 88);

    const prevTotal = this.ownedCrystalsBeforeRun;
    const newTotal = prevTotal + this.runCollectedCrystalIds.size;
    const unlockedDoubleJumpNow =
      prevTotal < DOUBLE_JUMP_CRYSTAL_THRESHOLD && newTotal >= DOUBLE_JUMP_CRYSTAL_THRESHOLD;

    this.callbacks?.onLevelComplete({
      levelId: this.level.id,
      levelName: this.level.name,
      worldName: this.worldDef.name,
      elapsedSeconds: this.elapsedSeconds,
      bestTimeSeconds: this.elapsedSeconds,
      isNewBest: false,
      crystalsCollected: this.runCollectedCrystalIds.size,
      crystalsTotal: this.crystals.length,
      deathsInRun: this.deathsInRun,
      hasNextLevel: this.level.id < TOTAL_LEVEL_COUNT,
      unlockedDoubleJumpNow,
    });
  }

  private computeResponsiveZoom(viewW: number, viewH: number): number {
    if (viewW < 640) {
      return Math.max(0.58, Math.min(0.85, viewW / 620));
    }
    if (viewH < 640) {
      return Math.max(0.75, Math.min(1, viewH / 720));
    }
    return 1;
  }

  private snapCameraToPlayer(): void {
    const viewW = this.scale.width;
    const viewH = this.scale.height;
    const zoom = this.computeResponsiveZoom(viewW, viewH);
    this.cameras.main.setZoom(zoom);
    const effW = viewW / zoom;
    const effH = viewH / zoom;
    const maxX = Math.max(0, this.level.width - effW);

    this.camX =
      this.level.width <= effW
        ? -(effW - this.level.width) * 0.5
        : Math.max(0, Math.min(maxX, this.px + PLAYER_W * 0.5 - effW * 0.42));
    this.camY =
      this.level.height <= effH
        ? this.level.height - effH
        : Math.max(0, Math.min(this.level.height - effH, this.py + PLAYER_H * 0.5 - effH * 0.58));

    // Convert top-left world point to Phaser camera scroll (which accounts for zoom around center)
    const scrollX = this.camX - (viewW - effW) * 0.5;
    const scrollY = this.camY - (viewH - effH) * 0.5;
    this.cameras.main.setScroll(scrollX, scrollY);
  }

  private updateCamera(dt: number, viewW: number, viewH: number): void {
    const zoom = this.computeResponsiveZoom(viewW, viewH);
    this.cameras.main.setZoom(zoom);
    const effW = viewW / zoom;
    const effH = viewH / zoom;

    const lookAhead = this.facing * 68;
    const maxX = Math.max(0, this.level.width - effW);

    let targetX: number;
    if (this.level.width <= effW) {
      targetX = -(effW - this.level.width) * 0.5;
    } else {
      targetX = Math.max(0, Math.min(maxX, this.px + PLAYER_W * 0.5 + lookAhead - effW * 0.48));
    }

    let targetY: number;
    if (this.level.height <= effH) {
      targetY = this.level.height - effH;
    } else {
      targetY = Math.max(0, Math.min(this.level.height - effH, this.py + PLAYER_H * 0.5 - effH * 0.58));
    }

    const damp = 1 - Math.exp(-7.5 * dt);
    this.camX += (targetX - this.camX) * damp;
    this.camY += (targetY - this.camY) * damp;

    const shake = this.cameraTrauma * this.cameraTrauma * 12;
    const sx = shake > 0.1 ? (Math.random() - 0.5) * 2 * shake : 0;
    const sy = shake > 0.1 ? (Math.random() - 0.5) * 2 * shake : 0;

    const scrollX = this.camX - (viewW - effW) * 0.5;
    const scrollY = this.camY - (viewH - effH) * 0.5;
    this.cameras.main.setScroll(scrollX + sx, scrollY + sy);
  }

  private broadcastHud(force: boolean): void {
    if (!this.callbacks || !this.level) return;
    if (!force && this.mode !== 'playing') return;

    const activeLock = this.locks.find((l) => !l.unlocked);
    const totalOwned = this.ownedCrystalsBeforeRun + this.runCollectedCrystalIds.size;

    this.callbacks.onHudUpdate({
      levelId: this.level.id,
      worldId: this.level.worldId,
      worldName: this.worldDef.name,
      levelName: this.level.name,
      objective: this.level.objective,
      hint: this.level.hint,
      activeColor: this.activeColor,
      palette: this.level.palette,
      crystalsCollected: this.runCollectedCrystalIds.size,
      crystalsTotal: this.crystals.length,
      totalOwnedCrystals: totalOwned,
      doubleJumpUnlocked: isDoubleJumpAvailable(totalOwned, this.level.worldId),
      elapsedSeconds: this.elapsedSeconds,
      deathsInRun: this.deathsInRun,
      checkpointActive: this.checkpoints.some((c) => c.activated),
      gatesUnlocked: this.gates.filter((g) => g.unlocked).length,
      gatesTotal: this.gates.length,
      activeLockProgress: activeLock
        ? { sequence: activeLock.sequence, step: activeLock.step }
        : undefined,
      blastCooldownRatio: Math.max(0, Math.min(1, this.blastCooldown / BLAST_COOLDOWN)),
      blastCooldownSec: this.blastCooldown,
      monstersDefeated: this.monsters.filter((m) => m.defeated && !m.suppressed).length,
      monstersTotal: this.monsters.filter((m) => !m.suppressed).length,
      isDead: this.isDead,
    });
  }

  private renderFrame(viewW: number, viewH: number): void {
    // 1. Background Parallax Layer (compensate for responsive camera zoom so sky fills 100% of viewport)
    const zoom = this.cameras.main.zoom || 1;
    this.bgGraphics.setScale(1 / zoom);
    this.bgGraphics.setPosition(
      (-viewW * (1 - zoom)) / (2 * zoom),
      (-viewH * (1 - zoom)) / (2 * zoom),
    );
    this.bgRenderer.render(
      this.bgGraphics,
      viewW,
      viewH,
      this.camX,
      this.camY,
      this.currentBgRgb,
      this.worldDef,
      this.timeSec,
      this.settings.graphicsQuality,
    );

    // 2. World Geometry Layer
    const wg = this.worldGraphics;
    wg.clear();

    // Draw rails for Moving Platforms & Magnetic Blocks first (behind platforms)
    this.renderRails(wg);

    // Platforms, Color Blocks, Bridges, Hidden Walls
    for (const p of this.platforms) {
      if (p.kind === 'neutral') {
        // Extend ground bedrock slabs cleanly below the viewport bottom so levels never float
        const touchesBottom = p.y + p.h >= this.level.height - 4;
        const drawH = touchesBottom ? p.h + 420 : p.h;
        this.drawNeutralTerrain(wg, p.x, p.y, p.w, drawH);
      } else if (p.kind === 'bridge') {
        this.drawColorBridge(wg, p);
      } else if (p.kind === 'hidden_wall') {
        this.drawHiddenWall(wg, p);
      } else {
        this.drawColorBlock(wg, p.x, p.y, p.w, p.h, p.colorId!, p.alpha, p.phasedGrace);
      }
    }

    // Moving Platforms
    for (const mp of this.movingPlatforms) {
      this.drawMovingPlatform(wg, mp);
    }

    // Magnetic Color Objects
    for (const mb of this.magneticBlocks) {
      this.drawMagneticBlock(wg, mb);
    }

    // Hazards (Crystal Thorns)
    for (const h of this.hazards) {
      this.drawHazard(wg, h);
    }

    // 3. Interactive Entities Layer (Gates, Locks, Optics, Checkpoints, Crystals, Portal, Player)
    const eg = this.entityGraphics;
    eg.clear();

    this.renderGates(eg);
    this.renderLocks(eg);
    this.renderOptics(eg);
    this.renderCheckpoints(eg);
    this.renderCrystals(eg);
    this.renderPortal(eg);
    this.renderMonsters(eg);
    this.renderBlasts(eg);

    if (!this.isDead) {
      this.renderPlayer(eg);
    } else if (this.deathAnimTimer > 0) {
      this.renderPlayerDeathDissolve(eg);
    }

    // 4. Particles & Ripple FX Layer
    const fg = this.fxGraphics;
    fg.clear();
    this.particles.render(fg);

    if (this.switchRippleTimer > 0 && this.activeColor !== 'void') {
      const prog = 1 - this.switchRippleTimer / 0.28;
      const col = COLOR_MAP[this.activeColor].num;
      fg.lineStyle(3 * (1 - prog), col, (1 - prog) * 0.45);
      fg.strokeCircle(this.px + PLAYER_W * 0.5, this.py + PLAYER_H * 0.5, 24 + prog * 220);
    }

    // 5. Smooth Death / Respawn Transition Curtain (screen-space, zoom-compensated)
    const df = this.deathFadeGraphics;
    df.clear();
    let curtainAlpha = 0;
    if (this.isDead) {
      const progress = 1 - this.respawnTimer / DEATH_DURATION;
      // Ease smoothly into dark curtain in the latter half of death animation
      curtainAlpha = Math.max(0, Math.min(0.76, (progress - 0.18) / 0.62 * 0.76));
    } else if (this.respawnFadeInTimer > 0) {
      curtainAlpha = (this.respawnFadeInTimer / RESPAWN_FADE_IN_DURATION) * 0.72;
    }
    if (curtainAlpha > 0.01) {
      df.setScale(1 / zoom);
      df.setPosition(
        (-viewW * (1 - zoom)) / (2 * zoom),
        (-viewH * (1 - zoom)) / (2 * zoom),
      );
      df.fillStyle(0x06080f, curtainAlpha);
      df.fillRect(0, 0, viewW, viewH);
    }
  }

  private drawNeutralTerrain(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    // Deep sculpted obsidian stone with top rim highlight and subtle stone strata
    g.fillStyle(0x0c0f18, 1);
    g.fillRect(x, y, w, h);

    // Subtle inner stone bevel
    g.fillStyle(0x161b29, 0.9);
    g.fillRect(x + 3, y + 3, Math.max(0, w - 6), Math.min(20, h - 3));

    // Crisp illuminated top walk edge
    g.fillStyle(0x475569, 0.72);
    g.fillRect(x, y, w, 3);
    g.fillStyle(0xe2e8f0, 0.28);
    g.fillRect(x + 2, y, Math.max(0, w - 4), 1.5);

    // Architectural stone seam lines
    g.lineStyle(1, 0x1e2538, 0.65);
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (w >= 120 && h >= 48) {
      for (let sx = x + 64; sx < x + w - 20; sx += 64) {
        g.lineBetween(sx, y + 4, sx, y + Math.min(34, h - 4));
      }
    }
  }

  private drawColorBlock(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    colorId: ColorId,
    alpha: number,
    phasedGrace: boolean,
  ): void {
    const def = COLOR_MAP[colorId];
    if (alpha <= 0.16) {
      // Blended into background: draw ultra-subtle crystalline dashed ghost outline so player has spatial clarity
      g.lineStyle(1.5, 0xffffff, 0.22);
      this.drawDashedRect(g, x + 1, y + 1, w - 2, h - 2, 8);
      return;
    }

    const a = phasedGrace ? 0.38 + Math.sin(this.timeSec * 22) * 0.12 : alpha;
    // Outer drop shadow
    g.fillStyle(0x05070c, 0.35 * a);
    g.fillRect(x + 4, y + 5, w, h);

    // Main saturated prism stone fill
    g.fillStyle(def.num, a);
    g.fillRoundedRect(x, y, w, h, 4);

    // Recessed darker interior facet
    g.fillStyle(def.bgNum, 0.42 * a);
    g.fillRoundedRect(x + 5, y + 5, Math.max(0, w - 10), Math.max(0, h - 10), 2);

    // Top specular highlight
    g.fillStyle(0xffffff, 0.38 * a);
    g.fillRect(x + 3, y + 1.5, Math.max(0, w - 6), 2.5);

    // Crisp dark architectural outline
    g.lineStyle(1.5, 0x090b12, 0.65 * a);
    g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, 4);

    // Geometric facet diamond marker in center (colorblind-friendly visual cue)
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    const r = Math.min(8, Math.min(w, h) * 0.25);
    if (r >= 4) {
      g.lineStyle(1.5, 0xffffff, 0.42 * a);
      g.beginPath();
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r, cy);
      g.lineTo(cx, cy + r);
      g.lineTo(cx - r, cy);
      g.closePath();
      g.strokePath();
    }
  }

  private drawColorBridge(g: Phaser.GameObjects.Graphics, p: RuntimePlatform): void {
    const def = COLOR_MAP[p.colorId!];
    // End anchor pylons (always visible in obsidian + colored core)
    const anchorW = 10;
    g.fillStyle(0x0f1420, 1);
    g.fillRect(p.x - 4, p.y - 3, anchorW, p.h + 6);
    g.fillRect(p.x + p.w - 6, p.y - 3, anchorW, p.h + 6);
    g.fillStyle(def.num, 0.95);
    g.fillCircle(p.x + 1, p.y + p.h * 0.5, 4);
    g.fillCircle(p.x + p.w - 1, p.y + p.h * 0.5, 4);

    if (p.alpha < 0.35) {
      // Unmaterialized guide trace
      g.lineStyle(2, def.num, 0.45);
      this.drawDashedLine(g, p.x + 8, p.y + p.h * 0.5, p.x + p.w - 8, p.y + p.h * 0.5, 10);
      g.lineStyle(1, 0xffffff, 0.2);
      g.strokeRect(p.x + 4, p.y + 2, p.w - 8, p.h - 4);
      return;
    }

    // Materialized crystalline bridge!
    g.fillStyle(def.num, 0.25 * p.alpha);
    g.fillRoundedRect(p.x - 2, p.y - 4, p.w + 4, p.h + 8, 6);

    g.fillStyle(def.num, 0.94 * p.alpha);
    g.fillRoundedRect(p.x, p.y, p.w, p.h, 4);

    g.fillStyle(0xffffff, 0.55 * p.alpha);
    g.fillRect(p.x + 4, p.y + 2, p.w - 8, 3);

    // Energy chevrons
    g.lineStyle(1.5, 0xffffff, 0.45 * p.alpha);
    for (let sx = p.x + 22; sx < p.x + p.w - 18; sx += 26) {
      g.lineBetween(sx - 5, p.y + p.h - 5, sx, p.y + 6);
      g.lineBetween(sx, p.y + 6, sx + 5, p.y + p.h - 5);
    }
  }

  private drawHiddenWall(g: Phaser.GameObjects.Graphics, p: RuntimePlatform): void {
    const def = COLOR_MAP[p.colorId!];
    if (p.alpha <= 0.16) {
      g.lineStyle(1, def.num, 0.22);
      this.drawDashedRect(g, p.x, p.y, p.w, p.h, 8);
      return;
    }
    // Looks like shadowed stone veined with glowing hidden pigment fissures
    g.fillStyle(0x101420, p.alpha);
    g.fillRect(p.x, p.y, p.w, p.h);

    const pulse = 0.55 + 0.35 * Math.sin(this.timeSec * 3.5);
    g.lineStyle(2.2, def.num, pulse * p.alpha);
    g.strokeRect(p.x + 2, p.y + 2, p.w - 4, p.h - 4);
    g.lineBetween(p.x + 4, p.y + p.h * 0.3, p.x + p.w - 4, p.y + p.h * 0.45);
    g.lineBetween(p.x + p.w - 4, p.y + p.h * 0.65, p.x + 4, p.y + p.h * 0.8);
  }

  private renderRails(g: Phaser.GameObjects.Graphics): void {
    for (const mp of this.movingPlatforms) {
      const cx1 = mp.startX + mp.w * 0.5;
      const cy1 = mp.startY + mp.h * 0.5;
      const cx2 = mp.toX + mp.w * 0.5;
      const cy2 = mp.toY + mp.h * 0.5;
      g.lineStyle(2, 0xffffff, 0.18);
      this.drawDashedLine(g, cx1, cy1, cx2, cy2, 9);
      g.fillStyle(0xffffff, 0.28);
      g.fillCircle(cx1, cy1, 4);
      g.fillCircle(cx2, cy2, 4);
    }

    for (const mb of this.magneticBlocks) {
      const reactCol = COLOR_MAP[mb.reactColorId].num;
      const cx1 = mb.startX + mb.w * 0.5;
      const cy1 = mb.startY + mb.h * 0.5;
      const cx2 = mb.toX + mb.w * 0.5;
      const cy2 = mb.toY + mb.h * 0.5;
      g.lineStyle(mb.engaged ? 3 : 2, reactCol, mb.engaged ? 0.78 : 0.35);
      this.drawDashedLine(g, cx1, cy1, cx2, cy2, 8);
      g.fillStyle(reactCol, mb.engaged ? 0.95 : 0.5);
      g.fillCircle(cx2, cy2, 6);
      g.lineStyle(1.5, 0xffffff, 0.5);
      g.strokeCircle(cx2, cy2, 9);
    }
  }

  private drawMovingPlatform(g: Phaser.GameObjects.Graphics, mp: RuntimeMovingPlatform): void {
    if (mp.colorId) {
      this.drawColorBlock(g, mp.x, mp.y, mp.w, mp.h, mp.colorId, mp.alpha, mp.phasedGrace);
    } else {
      g.fillStyle(0x1e293b, 1);
      g.fillRoundedRect(mp.x, mp.y, mp.w, mp.h, 4);
      g.fillStyle(0x94a3b8, 0.85);
      g.fillRect(mp.x + 3, mp.y + 1, mp.w - 6, 3);
      g.lineStyle(1.5, 0x090b12, 0.85);
      g.strokeRoundedRect(mp.x, mp.y, mp.w, mp.h, 4);
    }
    if (mp.alpha > 0.3) {
      // Subtle thruster nodes underneath
      g.fillStyle(0x38bdf8, 0.65 * mp.alpha);
      g.fillCircle(mp.x + 18, mp.y + mp.h + 1, 3);
      g.fillCircle(mp.x + mp.w - 18, mp.y + mp.h + 1, 3);
    }
  }

  private drawMagneticBlock(g: Phaser.GameObjects.Graphics, mb: RuntimeMagnetic): void {
    this.drawColorBlock(g, mb.x, mb.y, mb.w, mb.h, mb.colorId, mb.alpha, mb.phasedGrace);
    if (mb.alpha <= 0.2) return;

    // Prominent Magnetic Reaction Halo showing which color pulls this block!
    const reactDef = COLOR_MAP[mb.reactColorId];
    g.lineStyle(mb.engaged ? 3.5 : 2.5, reactDef.num, mb.engaged ? 1 : 0.88);
    g.strokeRoundedRect(mb.x - 3, mb.y - 3, mb.w + 6, mb.h + 6, 6);

    // Center polarity badge
    const cx = mb.x + mb.w * 0.5;
    const cy = mb.y + mb.h * 0.5;
    g.fillStyle(0x0b0e17, 0.85);
    g.fillCircle(cx, cy, 9);
    g.fillStyle(reactDef.num, 1);
    g.fillCircle(cx, cy, 5.5);
  }

  private drawHazard(g: Phaser.GameObjects.Graphics, h: RuntimeHazard): void {
    const col = h.colorId ? COLOR_MAP[h.colorId].num : 0xf43f5e;
    if (h.alpha <= 0.16) {
      g.lineStyle(1, 0xffffff, 0.18);
      g.strokeRect(h.x, h.y + h.h - 4, h.w, 4);
      return;
    }

    const spikeW = 16;
    const count = Math.max(1, Math.floor(h.w / spikeW));
    const actualW = h.w / count;

    for (let i = 0; i < count; i++) {
      const sx = h.x + i * actualW;
      g.fillStyle(col, h.alpha);
      g.fillTriangle(sx + 1, h.y + h.h, sx + actualW * 0.5, h.y, sx + actualW - 1, h.y + h.h);
      g.fillStyle(0xffffff, 0.35 * h.alpha);
      g.fillTriangle(sx + actualW * 0.38, h.y + h.h, sx + actualW * 0.5, h.y + 3, sx + actualW * 0.56, h.y + h.h);
      g.lineStyle(1, 0x090b12, 0.6 * h.alpha);
      g.strokeTriangle(sx + 1, h.y + h.h, sx + actualW * 0.5, h.y, sx + actualW - 1, h.y + h.h);
    }
  }

  private renderGates(g: Phaser.GameObjects.Graphics): void {
    for (const gate of this.gates) {
      const def = COLOR_MAP[gate.colorId];
      // Permanent gate frame posts
      g.fillStyle(0x0f1320, 1);
      g.fillRect(gate.x - 4, gate.y - 6, gate.w + 8, 12);

      const closedH = gate.h * (1 - gate.openProgress);
      if (closedH <= 2) continue;

      // Energy barrier core
      g.fillStyle(def.num, 0.22);
      g.fillRect(gate.x - 4, gate.y, gate.w + 8, closedH);

      g.fillStyle(def.num, 0.85);
      g.fillRoundedRect(gate.x, gate.y, gate.w, closedH, 3);

      // Vertical crystalline bars
      g.fillStyle(0x0a0d16, 0.55);
      g.fillRect(gate.x + 8, gate.y + 6, 6, Math.max(0, closedH - 12));
      g.fillRect(gate.x + gate.w - 14, gate.y + 6, 6, Math.max(0, closedH - 12));

      // Lock diamond emblem
      const cx = gate.x + gate.w * 0.5;
      const cy = gate.y + closedH * 0.5;
      g.fillStyle(0x0b0e17, 0.9);
      g.fillCircle(cx, cy, 13);
      g.fillStyle(def.num, 1);
      g.fillCircle(cx, cy, 8);
      g.lineStyle(2, 0xffffff, 0.85);
      g.strokeCircle(cx, cy, 12);
    }
  }

  private renderLocks(g: Phaser.GameObjects.Graphics): void {
    for (const lk of this.locks) {
      // Sculpted obelisk pedestal
      g.fillStyle(0x0f1320, 1);
      g.fillRoundedRect(lk.x - 20, lk.y - 64, 40, 64, 4);
      g.lineStyle(1.5, 0x475569, 0.8);
      g.strokeRoundedRect(lk.x - 20, lk.y - 64, 40, 64, 4);

      // Sequence rune sockets floating above pillar
      const count = lk.sequence.length;
      const spacing = 26;
      const startX = lk.x - ((count - 1) * spacing) * 0.5;
      const socketY = lk.y - 84;

      // Subtle backing strip
      g.fillStyle(0x0b0e17, 0.88);
      g.fillRoundedRect(startX - 16, socketY - 15, (count - 1) * spacing + 32, 30, 6);

      lk.sequence.forEach((colId, idx) => {
        const sx = startX + idx * spacing;
        const done = lk.unlocked || idx < lk.step;
        const next = !lk.unlocked && idx === lk.step;
        const hex = COLOR_MAP[colId].num;

        if (done) {
          g.fillStyle(hex, 1);
          g.fillCircle(sx, socketY, 8);
          g.lineStyle(2, 0xffffff, 0.95);
          g.strokeCircle(sx, socketY, 9.5);
        } else {
          g.fillStyle(hex, next ? 0.9 : 0.45);
          g.fillCircle(sx, socketY, next ? 7.5 : 6);
          if (next) {
            const pulse = 1 + Math.sin(this.timeSec * 6) * 1.5;
            g.lineStyle(1.8, 0xffffff, 0.85);
            g.strokeCircle(sx, socketY, 9.5 + pulse);
          }
        }
      });
    }
  }

  private renderOptics(g: Phaser.GameObjects.Graphics): void {
    // Beams first
    for (const seg of this.lightSegments) {
      const hex = COLOR_MAP[seg.colorId].num;
      g.lineStyle(10, hex, 0.22);
      g.lineBetween(seg.x1, seg.y1, seg.x2, seg.y2);
      g.lineStyle(4.5, hex, 0.85);
      g.lineBetween(seg.x1, seg.y1, seg.x2, seg.y2);
      g.lineStyle(1.8, 0xffffff, 0.92);
      g.lineBetween(seg.x1, seg.y1, seg.x2, seg.y2);
    }

    // Emitters
    for (const em of this.level.emitters) {
      const hex = COLOR_MAP[em.colorId].num;
      g.fillStyle(0x0f1420, 1);
      g.fillRoundedRect(em.x - 16, em.y - 16, 32, 32, 6);
      g.fillStyle(hex, 1);
      g.fillCircle(em.x, em.y, 8);
      g.lineStyle(2, 0xffffff, 0.75);
      g.strokeRoundedRect(em.x - 16, em.y - 16, 32, 32, 6);
    }

    // Mirrors
    for (const m of this.level.mirrors) {
      const hidden = m.colorId && this.activeColor === m.colorId;
      const alpha = hidden ? 0.16 : 1;
      const col = m.colorId ? COLOR_MAP[m.colorId].num : 0xe2e8f0;
      g.lineStyle(5, col, alpha);
      if (m.angle === '/') {
        g.lineBetween(m.x - 15, m.y + 15, m.x + 15, m.y - 15);
      } else {
        g.lineBetween(m.x - 15, m.y - 15, m.x + 15, m.y + 15);
      }
      g.fillStyle(0xffffff, 0.85 * alpha);
      g.fillCircle(m.x, m.y, 4);
    }

    // Receptors
    for (const rec of this.level.receptors) {
      const lit = this.activatedReceptors.has(rec.id);
      const hex = COLOR_MAP[rec.colorId].num;
      g.fillStyle(0x0f1420, 1);
      g.fillCircle(rec.x, rec.y, 18);
      g.lineStyle(3, hex, lit ? 1 : 0.7);
      g.strokeCircle(rec.x, rec.y, 17);
      g.fillStyle(lit ? 0xffffff : hex, lit ? 1 : 0.4);
      g.fillCircle(rec.x, rec.y, lit ? 10 : 7);
    }
  }

  private renderCheckpoints(g: Phaser.GameObjects.Graphics): void {
    for (const cp of this.checkpoints) {
      // Stone lantern pillar
      g.fillStyle(0x161c2c, 1);
      g.fillRect(cp.x - 5, cp.y - 54, 10, 54);
      g.fillRect(cp.x - 14, cp.y - 8, 28, 8);
      // Lantern diamond
      const flameY = cp.y - 62;
      if (cp.activated) {
        const pulse = 1 + Math.sin(this.timeSec * 6) * 0.15;
        g.fillStyle(0xfef08a, 0.28);
        g.fillCircle(cp.x, flameY, 18 * pulse);
        g.fillStyle(0xfacc15, 1);
        g.beginPath();
        g.moveTo(cp.x, flameY - 12);
        g.lineTo(cp.x + 8, flameY);
        g.lineTo(cp.x, flameY + 10);
        g.lineTo(cp.x - 8, flameY);
        g.closePath();
        g.fillPath();
      } else {
        g.lineStyle(1.8, 0x94a3b8, 0.85);
        g.strokeCircle(cp.x, flameY, 8);
      }
    }
  }

  private renderCrystals(g: Phaser.GameObjects.Graphics): void {
    for (const c of this.crystals) {
      if (c.collected) continue;
      const def = COLOR_MAP[c.colorId];
      const bob = Math.sin(this.timeSec * 3.4 + c.x * 0.02) * 5;
      const cy = c.y + bob;

      // Soft ambient halo
      g.fillStyle(def.num, 0.24);
      g.fillCircle(c.x, cy, 18);

      // Multi-faceted diamond crystal
      g.fillStyle(def.num, 1);
      g.beginPath();
      g.moveTo(c.x, cy - 14);
      g.lineTo(c.x + 10, cy);
      g.lineTo(c.x, cy + 14);
      g.lineTo(c.x - 10, cy);
      g.closePath();
      g.fillPath();

      // Inner bright highlight facet
      g.fillStyle(0xffffff, 0.65);
      g.beginPath();
      g.moveTo(c.x, cy - 11);
      g.lineTo(c.x + 5, cy - 1);
      g.lineTo(c.x, cy + 2);
      g.lineTo(c.x - 4, cy - 1);
      g.closePath();
      g.fillPath();

      g.lineStyle(1.4, 0xffffff, 0.85);
      g.beginPath();
      g.moveTo(c.x, cy - 14);
      g.lineTo(c.x + 10, cy);
      g.lineTo(c.x, cy + 14);
      g.lineTo(c.x - 10, cy);
      g.closePath();
      g.strokePath();
    }
  }

  private renderPortal(g: Phaser.GameObjects.Graphics): void {
    const { x, y } = this.level.portal;
    const pulse = 1 + Math.sin(this.timeSec * 3.2) * 0.07;

    // Vertical sanctuary beacon
    g.fillStyle(0xffffff, 0.06);
    g.fillRect(x - 24, y - 140, 48, 200);

    // Outer obsidian stone arch
    g.lineStyle(5, 0x0d111b, 0.95);
    g.strokeCircle(x, y, 36);

    // Rotating chromatic rings
    const ringCol = this.activeColor === 'void' ? 0x38bdf8 : COLOR_MAP[this.activeColor].num;
    g.fillStyle(ringCol, 0.22);
    g.fillCircle(x, y, 34 * pulse);

    g.lineStyle(3, 0xffffff, 0.92);
    g.strokeCircle(x, y, 28 * pulse);
    g.lineStyle(2.5, ringCol, 0.9);
    g.strokeCircle(x, y, 20);

    // Inner bright core
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(x, y, 10 * pulse);

    // Orbiting prism shards
    for (let i = 0; i < 4; i++) {
      const a = this.timeSec * 1.9 + (i * Math.PI) / 2;
      const ox = x + Math.cos(a) * 34;
      const oy = y + Math.sin(a) * 34;
      const shardColor = COLOR_PALETTE[(i * 4 + this.level.worldId) % 16].num;
      g.fillStyle(shardColor, 0.95);
      g.fillCircle(ox, oy, 3.6);
    }
  }

  private renderMonsters(g: Phaser.GameObjects.Graphics): void {
    for (const m of this.monsters) {
      if (m.suppressed) continue;
      if (m.defeated && m.defeatTimer <= 0) continue;

      const def = COLOR_MAP[m.vulnerableColor];
      const cx = m.x + m.w * 0.5;
      const bottomY = m.y;

      // Defeat squash & prismatic dissolve animation
      if (m.defeated) {
        const t = 1 - m.defeatTimer / MONSTER_DEFEAT_DURATION; // 0 -> 1
        const alpha = Math.max(0, 1 - t);
        const sqW = m.w * (1 + t * 0.65);
        const sqH = Math.max(4, m.h * (1 - t * 0.85));
        g.fillStyle(def.num, alpha * 0.9);
        g.fillRoundedRect(cx - sqW * 0.5, bottomY - sqH, sqW, sqH, 6);
        g.fillStyle(0xffffff, alpha * 0.75);
        g.fillEllipse(cx, bottomY - sqH * 0.5, sqW * 0.7, sqH * 0.55);
        continue;
      }

      const flash = m.deflectFlashTimer > 0;
      const stride = Math.sin(m.animPhase) * 4;
      const bob = m.archetype === 'sentinel' ? Math.sin(m.animPhase * 0.7) * 3 : Math.abs(Math.sin(m.animPhase)) * 1.5;

      // Ground contact shadow
      g.fillStyle(0x05070c, 0.45);
      g.fillEllipse(cx, m.groundY + 1, m.w * 0.9, 6);

      // Subtle vulnerability aura ring behind monster
      const pulse = 1 + Math.sin(this.timeSec * 4.5 + m.startX * 0.03) * 0.08;
      g.fillStyle(def.num, 0.16);
      g.fillCircle(cx, bottomY - m.h * 0.52 - bob, (m.w * 0.65) * pulse);

      if (m.archetype === 'crawler') {
        // Skittering legs
        g.lineStyle(2.5, 0x090b12, 1);
        g.lineBetween(cx - 11, bottomY - 7, cx - 15 + stride, bottomY);
        g.lineBetween(cx - 3, bottomY - 7, cx - 4 - stride, bottomY);
        g.lineBetween(cx + 5, bottomY - 7, cx + 6 + stride, bottomY);
        g.lineBetween(cx + 12, bottomY - 7, cx + 16 - stride, bottomY);

        // Obsidian armored lower chassis
        const bodyTop = bottomY - m.h - bob;
        g.fillStyle(0x0d111d, 1);
        g.fillRoundedRect(m.x, bodyTop + 6, m.w, m.h - 8, 8);

        // Vivid vulnerable-color prism carapace dome (clearly signals stomp target + blast hue!)
        g.fillStyle(flash ? 0xffffff : def.num, 1);
        g.fillRoundedRect(m.x + 2, bodyTop + 1, m.w - 4, m.h * 0.56, 7);
        g.fillStyle(0xffffff, 0.36);
        g.fillRoundedRect(m.x + 6, bodyTop + 3, m.w - 12, 4, 2);

        // Crisp outline
        g.lineStyle(1.8, 0x090b12, 0.9);
        g.strokeRoundedRect(m.x, bodyTop + 2, m.w, m.h - 4, 8);

        // Menacing glowing eyes facing patrol direction
        const eyeX = cx + m.dir * 8;
        const eyeY = bodyTop + m.h * 0.56;
        g.fillStyle(0xffffff, 1);
        g.fillCircle(eyeX - 3, eyeY, 2.6);
        g.fillCircle(eyeX + 3, eyeY, 2.6);
        g.fillStyle(0x090b12, 1);
        g.fillCircle(eyeX - 3 + m.dir * 0.8, eyeY, 1.2);
        g.fillCircle(eyeX + 3 + m.dir * 0.8, eyeY, 1.2);
      } else if (m.archetype === 'hopper') {
        const crouch = m.y >= m.groundY - 0.5 && m.hopTimer < 0.28 ? 4 : 0;
        const bodyTop = bottomY - m.h + crouch;
        const bodyH = m.h - crouch;

        // Spring energy legs
        g.lineStyle(3, def.num, 0.95);
        g.lineBetween(cx - 8, bottomY - 9, cx - 10, bottomY);
        g.lineBetween(cx + 8, bottomY - 9, cx + 10, bottomY);

        // Obsidian torso + bright prism core
        g.fillStyle(0x0e1320, 1);
        g.fillRoundedRect(m.x + 1, bodyTop, m.w - 2, bodyH - 6, 9);
        g.fillStyle(flash ? 0xffffff : def.num, 0.96);
        g.fillRoundedRect(m.x + 4, bodyTop + 3, m.w - 8, bodyH * 0.52, 6);
        g.lineStyle(1.8, 0x090b12, 0.9);
        g.strokeRoundedRect(m.x + 1, bodyTop, m.w - 2, bodyH - 6, 9);

        // Expressive twin eyes
        const eyeX = cx + m.dir * 6;
        const eyeY = bodyTop + bodyH * 0.45;
        g.fillStyle(0xffffff, 1);
        g.fillCircle(eyeX - 4, eyeY, 2.8);
        g.fillCircle(eyeX + 4, eyeY, 2.8);
        g.fillStyle(0x090b12, 1);
        g.fillCircle(eyeX - 4 + m.dir, eyeY, 1.3);
        g.fillCircle(eyeX + 4 + m.dir, eyeY, 1.3);
      } else {
        // Sentinel: tall obsidian prism guardian with glowing core & orbiting crest
        const bodyTop = bottomY - m.h - bob;
        g.fillStyle(0x0d111d, 1);
        g.beginPath();
        g.moveTo(cx, bodyTop);
        g.lineTo(m.x + m.w, bodyTop + m.h * 0.44);
        g.lineTo(cx + m.w * 0.34, bottomY - 3 - bob);
        g.lineTo(cx - m.w * 0.34, bottomY - 3 - bob);
        g.lineTo(m.x, bodyTop + m.h * 0.44);
        g.closePath();
        g.fillPath();

        // Vulnerable prism core diamond
        g.fillStyle(flash ? 0xffffff : def.num, 1);
        g.beginPath();
        g.moveTo(cx, bodyTop + 5);
        g.lineTo(cx + 11, bodyTop + m.h * 0.44);
        g.lineTo(cx, bottomY - 10 - bob);
        g.lineTo(cx - 11, bodyTop + m.h * 0.44);
        g.closePath();
        g.fillPath();

        g.lineStyle(1.8, 0xffffff, 0.65);
        g.strokePath();

        // Sentinel visor eye
        const eyeX = cx + m.dir * 6;
        const eyeY = bodyTop + m.h * 0.34;
        g.fillStyle(0xffffff, 1);
        g.fillCircle(eyeX, eyeY, 3.4);
        g.fillStyle(0x090b12, 1);
        g.fillCircle(eyeX + m.dir * 1.1, eyeY, 1.4);
      }

      // Clear Overhead Color-Vulnerability Gem (communicates exact Color Blast weakness at a glance)
      const gemY = bottomY - m.h - 15 - bob;
      const gemPulse = 1 + Math.sin(this.timeSec * 5.2) * 0.12;
      const r = 5.5 * gemPulse;
      g.fillStyle(0x0b0e17, 0.88);
      g.fillCircle(cx, gemY, r + 3.2);
      g.fillStyle(flash ? 0xffffff : def.num, 1);
      g.beginPath();
      g.moveTo(cx, gemY - r);
      g.lineTo(cx + r, gemY);
      g.lineTo(cx, gemY + r);
      g.lineTo(cx - r, gemY);
      g.closePath();
      g.fillPath();
      g.lineStyle(1.4, 0xffffff, 0.9);
      g.strokePath();

      // Deflection ring feedback when hit with wrong color blast
      if (flash) {
        g.lineStyle(2.2, 0xffffff, 0.85);
        g.strokeCircle(cx, bottomY - m.h * 0.5, m.w * 0.62);
      }
    }
  }

  private renderBlasts(g: Phaser.GameObjects.Graphics): void {
    for (const b of this.blasts) {
      const dir = b.vx >= 0 ? 1 : -1;
      const colHex = b.color === 'void' ? 0x93c5fd : COLOR_MAP[b.color].num;

      // Tapered luminous comet tail
      g.fillStyle(colHex, 0.25);
      g.fillTriangle(
        b.x + dir * 10,
        b.y,
        b.x - dir * 32,
        b.y - 8,
        b.x - dir * 32,
        b.y + 8,
      );
      g.fillStyle(colHex, 0.45);
      g.fillCircle(b.x, b.y, b.radius + 4);

      // Core prismatic energy orb
      g.fillStyle(colHex, 1);
      g.fillCircle(b.x, b.y, b.radius);

      // Hot bright specular center
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(b.x + dir * 2, b.y, b.radius * 0.48);

      // Crisp outer ring
      g.lineStyle(1.6, 0xffffff, 0.8);
      g.strokeCircle(b.x, b.y, b.radius + 1);
    }
  }

  private renderPlayerDeathDissolve(g: Phaser.GameObjects.Graphics): void {
    const progress = 1 - this.deathAnimTimer / DEATH_DURATION; // 0 -> 1
    if (progress > 0.62) return;
    const alpha = Math.max(0, 1 - progress / 0.62);
    const radius = 14 + progress * 44;
    const colHex = this.activeColor === 'void' ? 0x38bdf8 : COLOR_MAP[this.activeColor].num;

    g.lineStyle(3 * alpha, colHex, alpha * 0.9);
    g.strokeCircle(this.deathOriginX, this.deathOriginY, radius);
    g.fillStyle(0xffffff, alpha * 0.75);
    g.fillCircle(this.deathOriginX, this.deathOriginY, Math.max(2, 12 * (1 - progress * 1.4)));
  }

  private renderPlayer(g: Phaser.GameObjects.Graphics): void {
    const cx = this.px + PLAYER_W * 0.5;
    const bottomY = this.py + PLAYER_H;
    const w = PLAYER_W * this.scaleX;
    const h = PLAYER_H * this.scaleY;
    const topY = bottomY - h;

    const scarfColor = this.activeColor === 'void' ? 0x38bdf8 : COLOR_MAP[this.activeColor].num;

    // 1. Flowing Chromatic Scarf Trail (behind body)
    g.lineStyle(6, scarfColor, 0.95);
    g.beginPath();
    g.moveTo(this.scarfNodes[0].x, this.scarfNodes[0].y);
    g.lineTo(this.scarfNodes[1].x, this.scarfNodes[1].y);
    g.lineTo(this.scarfNodes[2].x, this.scarfNodes[2].y);
    g.strokePath();
    g.fillStyle(0xffffff, 0.55);
    g.fillCircle(this.scarfNodes[2].x, this.scarfNodes[2].y, 2.2);

    // 2. Ground shadow when grounded
    if (this.onGround || this.mode === 'title') {
      g.fillStyle(0x05070c, 0.42);
      g.fillEllipse(cx, bottomY + 1, w * 0.95, 6);
    }

    // 3. Stride-synced animated legs
    const running = this.onGround && Math.abs(this.vx) > 20;
    const stride = running ? Math.sin(this.walkDistance * 0.14) * 6 : 0;
    const legLift = !this.onGround ? -3 : 0;
    g.lineStyle(3.5, 0x0b0e17, 1);
    g.lineBetween(cx - 4, bottomY - 12, cx - 4 + stride, bottomY - 1 + legLift);
    g.lineBetween(cx + 4, bottomY - 12, cx + 4 - stride, bottomY - 1 - legLift);

    // 4. Sculpted Obsidian Traveler Cloak
    g.fillStyle(0x111522, 1);
    g.beginPath();
    g.moveTo(cx, topY + 2);
    g.lineTo(cx + w * 0.52, bottomY - 8);
    g.lineTo(cx - w * 0.52, bottomY - 8);
    g.closePath();
    g.fillPath();

    // Subtle colored cloak trim along hem
    g.lineStyle(2, scarfColor, 0.9);
    g.lineBetween(cx - w * 0.48, bottomY - 9, cx + w * 0.48, bottomY - 9);

    // 5. Hooded Head Silhouette
    const headY = topY + 12;
    g.fillStyle(0x0f1320, 1);
    g.fillCircle(cx, headY, 11.5 * this.scaleX);
    g.lineStyle(1.6, 0xe2e8f0, 0.55);
    g.strokeCircle(cx, headY, 11.5 * this.scaleX);

    // Expressive luminous eyes facing travel direction
    const eyeOffsetX = this.facing * 4;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx + eyeOffsetX - 2, headY - 1, 2.2);
    g.fillCircle(cx + eyeOffsetX + 3.5, headY - 1, 2.2);

    // Small prism crest above hood tinted to active color
    g.fillStyle(scarfColor, 0.95);
    g.fillTriangle(cx, topY - 4, cx + 3.5, topY + 2, cx - 3.5, topY + 2);
  }

  private drawDashedLine(
    g: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dashLen: number,
  ): void {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    if (dist < 1) return;
    const steps = Math.floor(dist / (dashLen * 1.7));
    const dx = (x2 - x1) / dist;
    const dy = (y2 - y1) / dist;
    for (let i = 0; i <= steps; i++) {
      const s = i * dashLen * 1.7;
      const e = Math.min(dist, s + dashLen);
      g.lineBetween(x1 + dx * s, y1 + dy * s, x1 + dx * e, y1 + dy * e);
    }
  }

  private drawDashedRect(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    dash: number,
  ): void {
    this.drawDashedLine(g, x, y, x + w, y, dash);
    this.drawDashedLine(g, x + w, y, x + w, y + h, dash);
    this.drawDashedLine(g, x + w, y + h, x, y + h, dash);
    this.drawDashedLine(g, x, y + h, x, y, dash);
  }
}
