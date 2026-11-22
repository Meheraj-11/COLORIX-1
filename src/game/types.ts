import type { ActiveColor, ColorId } from './colors';

export type WorldId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface WorldDef {
  id: WorldId;
  name: string;
  subtitle: string;
  theme: 'ruins' | 'caverns' | 'forest' | 'neon' | 'frozen' | 'machine' | 'spectrum' | 'prism';
  baseBgHex: string;
  baseBgRgb: [number, number, number];
  accentHex: string;
  ambientLightHex: string;
  featuredMechanic: string;
  levelRange: [number, number];
}

export interface RectPlatform {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Undefined or 'neutral' means permanent obsidian terrain */
  colorId?: ColorId;
  kind: 'neutral' | 'color_block' | 'bridge' | 'hidden_wall';
}

export interface MovingPlatformDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  toX: number;
  toY: number;
  speed: number;
  colorId?: ColorId;
}

export interface HazardDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  colorId?: ColorId;
  direction?: 'up' | 'down';
}

export interface PrismGateDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  colorId: ColorId;
  /** 'match' unlocks when player approaches/activates matching color; 'linked' unlocks via ColorLock or LightReceptor */
  unlockMode: 'match' | 'linked';
}

export interface CrystalDef {
  id: string;
  x: number;
  y: number;
  colorId: ColorId;
  secret?: boolean;
}

export interface CheckpointDef {
  id: string;
  x: number;
  y: number;
}

export interface ColorLockDef {
  id: string;
  x: number;
  y: number;
  sequence: ColorId[];
  targetGateId: string;
}

export interface MagneticBlockDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  toX: number;
  toY: number;
  colorId: ColorId;
  /** Color the player switches to in order to magnetically pull this block to (toX, toY) */
  reactColorId: ColorId;
  speed: number;
}

export interface LightEmitterDef {
  id: string;
  x: number;
  y: number;
  dir: 'right' | 'left' | 'up' | 'down';
  colorId: ColorId;
}

export interface LightMirrorDef {
  id: string;
  x: number;
  y: number;
  /** '/' reflects right->up, down->left; '\' reflects right->down, up->left */
  angle: '/' | '\\';
  /** If defined, mirror hides/disengages when background matches colorId */
  colorId?: ColorId;
}

export interface LightReceptorDef {
  id: string;
  x: number;
  y: number;
  colorId: ColorId;
  targetGateId: string;
}

export type MonsterArchetype = 'crawler' | 'hopper' | 'sentinel';

export interface MonsterDef {
  id: string;
  x: number;
  /** Y coordinate of the ground platform surface the monster walks on */
  y: number;
  w: number;
  h: number;
  patrolMinX: number;
  patrolMaxX: number;
  speed: number;
  /** The specific color from the 16-color palette that defeats this monster via Color Blast */
  vulnerableColor: ColorId;
  archetype: MonsterArchetype;
}

export interface LevelDef {
  id: number; // 1..104
  worldId: WorldId;
  indexInWorld: number; // 1..13
  name: string;
  objective: string;
  hint?: string;
  width: number;
  height: number;
  spawn: { x: number; y: number };
  portal: { x: number; y: number };
  /** Featured colors for this level (bound to keys 1-8; all 16 remain accessible via wheel) */
  palette: ColorId[];
  initialColor: ActiveColor;
  platforms: RectPlatform[];
  movingPlatforms: MovingPlatformDef[];
  hazards: HazardDef[];
  gates: PrismGateDef[];
  crystals: CrystalDef[];
  checkpoints: CheckpointDef[];
  locks: ColorLockDef[];
  magneticBlocks: MagneticBlockDef[];
  emitters: LightEmitterDef[];
  mirrors: LightMirrorDef[];
  receptors: LightReceptorDef[];
  monsters: MonsterDef[];
}

export type GraphicsQuality = 'low' | 'medium' | 'high';
export type ControlScheme = 'wasd' | 'arrows';
export type TouchMode = 'auto' | 'on' | 'off';
export type LanguageCode = 'en' | 'es' | 'fr';

export interface GameSettings {
  masterVolume: number; // 0..1
  musicVolume: number; // 0..1
  musicEnabled: boolean;
  sfxVolume: number; // 0..1
  muted: boolean;
  graphicsQuality: GraphicsQuality;
  controlScheme: ControlScheme;
  touchMode: TouchMode;
  language: LanguageCode;
  fullscreen: boolean;
}

export interface SaveData {
  version: number;
  unlockedLevel: number;
  lastPlayedLevel: number;
  completedLevels: number[];
  collectedCrystals: Record<string, string[]>; // levelId -> array of crystal IDs
  bestTimes: Record<string, number>; // levelId -> best seconds
  totalDeaths: number;
  settings: GameSettings;
}

export type AppScreen =
  | 'title'
  | 'world_map'
  | 'playing'
  | 'paused'
  | 'level_complete';

export interface HudSnapshot {
  levelId: number;
  worldId: WorldId;
  worldName: string;
  levelName: string;
  objective: string;
  hint?: string;
  activeColor: ActiveColor;
  palette: ColorId[];
  crystalsCollected: number;
  crystalsTotal: number;
  totalOwnedCrystals: number;
  doubleJumpUnlocked: boolean;
  elapsedSeconds: number;
  deathsInRun: number;
  checkpointActive: boolean;
  gatesUnlocked: number;
  gatesTotal: number;
  activeLockProgress?: { sequence: ColorId[]; step: number };
  /** 0 = ready to cast, 1 = full cooldown remaining */
  blastCooldownRatio: number;
  blastCooldownSec: number;
  monstersDefeated: number;
  monstersTotal: number;
  isDead: boolean;
}

export interface LevelCompleteStats {
  levelId: number;
  levelName: string;
  worldName: string;
  elapsedSeconds: number;
  bestTimeSeconds: number;
  isNewBest: boolean;
  crystalsCollected: number;
  crystalsTotal: number;
  deathsInRun: number;
  hasNextLevel: boolean;
  unlockedDoubleJumpNow: boolean;
}
