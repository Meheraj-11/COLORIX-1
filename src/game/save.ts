import {
  createDefaultMobileControlsLayout,
  DEFAULT_MOBILE_CONTROLS_LAYOUT,
  sanitizeMobileControlsLayout,
} from './mobileControlsLayout';
import type { GameSettings, SaveData } from './types';

export const SAVE_STORAGE_KEY = 'colorix_save_v1';
export const SAVE_VERSION = 1;
export const TOTAL_LEVELS = 104;

export const DEFAULT_SETTINGS: GameSettings = {
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
  mobileControlsLayout: DEFAULT_MOBILE_CONTROLS_LAYOUT,
};

export function createDefaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    unlockedLevel: 1,
    lastPlayedLevel: 1,
    completedLevels: [],
    collectedCrystals: {},
    bestTimes: {},
    totalDeaths: 0,
    settings: {
      ...DEFAULT_SETTINGS,
      mobileControlsLayout: createDefaultMobileControlsLayout(),
    },
  };
}

export function sanitizeSaveData(raw: unknown): SaveData {
  const base = createDefaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, unknown>;

  const unlockedLevel =
    typeof obj.unlockedLevel === 'number' && Number.isFinite(obj.unlockedLevel)
      ? Math.max(1, Math.min(TOTAL_LEVELS, Math.floor(obj.unlockedLevel)))
      : 1;

  const lastPlayedLevel =
    typeof obj.lastPlayedLevel === 'number' && Number.isFinite(obj.lastPlayedLevel)
      ? Math.max(1, Math.min(unlockedLevel, Math.floor(obj.lastPlayedLevel)))
      : 1;

  const completedLevels = Array.isArray(obj.completedLevels)
    ? Array.from(
        new Set(
          obj.completedLevels
            .filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= TOTAL_LEVELS),
        ),
      ).sort((a, b) => a - b)
    : [];

  const collectedCrystals: Record<string, string[]> = {};
  if (obj.collectedCrystals && typeof obj.collectedCrystals === 'object') {
    for (const [k, v] of Object.entries(obj.collectedCrystals as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        collectedCrystals[k] = Array.from(
          new Set(v.filter((id): id is string => typeof id === 'string')),
        );
      }
    }
  }

  const bestTimes: Record<string, number> = {};
  if (obj.bestTimes && typeof obj.bestTimes === 'object') {
    for (const [k, v] of Object.entries(obj.bestTimes as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        bestTimes[k] = v;
      }
    }
  }

  const totalDeaths =
    typeof obj.totalDeaths === 'number' && Number.isFinite(obj.totalDeaths) && obj.totalDeaths >= 0
      ? Math.floor(obj.totalDeaths)
      : 0;

  const rawSettings = (obj.settings && typeof obj.settings === 'object'
    ? (obj.settings as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const clamp01 = (val: unknown, fallback: number): number =>
    typeof val === 'number' && Number.isFinite(val) ? Math.max(0, Math.min(1, val)) : fallback;

  const settings: GameSettings = {
    masterVolume: clamp01(rawSettings.masterVolume, DEFAULT_SETTINGS.masterVolume),
    musicVolume: clamp01(rawSettings.musicVolume, DEFAULT_SETTINGS.musicVolume),
    musicEnabled:
      typeof rawSettings.musicEnabled === 'boolean'
        ? rawSettings.musicEnabled
        : DEFAULT_SETTINGS.musicEnabled,
    sfxVolume: clamp01(rawSettings.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    muted: typeof rawSettings.muted === 'boolean' ? rawSettings.muted : DEFAULT_SETTINGS.muted,
    graphicsQuality:
      rawSettings.graphicsQuality === 'low' ||
      rawSettings.graphicsQuality === 'medium' ||
      rawSettings.graphicsQuality === 'high'
        ? rawSettings.graphicsQuality
        : DEFAULT_SETTINGS.graphicsQuality,
    controlScheme:
      rawSettings.controlScheme === 'wasd' || rawSettings.controlScheme === 'arrows'
        ? rawSettings.controlScheme
        : DEFAULT_SETTINGS.controlScheme,
    touchMode:
      rawSettings.touchMode === 'auto' || rawSettings.touchMode === 'on' || rawSettings.touchMode === 'off'
        ? rawSettings.touchMode
        : DEFAULT_SETTINGS.touchMode,
    language:
      rawSettings.language === 'en' || rawSettings.language === 'es' || rawSettings.language === 'fr'
        ? rawSettings.language
        : DEFAULT_SETTINGS.language,
    fullscreen: typeof rawSettings.fullscreen === 'boolean' ? rawSettings.fullscreen : false,
    mobileControlsLayout: sanitizeMobileControlsLayout(rawSettings.mobileControlsLayout),
  };

  return {
    version: SAVE_VERSION,
    unlockedLevel,
    lastPlayedLevel,
    completedLevels,
    collectedCrystals,
    bestTimes,
    totalDeaths,
    settings,
  };
}

export function loadSaveData(): SaveData {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return createDefaultSave();
    }
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return createDefaultSave();
    return sanitizeSaveData(JSON.parse(raw));
  } catch {
    return createDefaultSave();
  }
}

export function persistSaveData(data: SaveData): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota or private-mode errors safely
  }
}

export function countTotalCollectedCrystals(data: SaveData): number {
  let total = 0;
  for (const list of Object.values(data.collectedCrystals)) {
    total += list.length;
  }
  return total;
}

export function recordLevelCompletion(
  prev: SaveData,
  levelId: number,
  elapsedSeconds: number,
  crystalIds: string[],
  deathsInRun: number,
): { next: SaveData; isNewBest: boolean; bestTimeSeconds: number } {
  const key = String(levelId);
  const prevBest = prev.bestTimes[key];
  const isNewBest = prevBest === undefined || elapsedSeconds < prevBest;
  const bestTimeSeconds = isNewBest ? elapsedSeconds : prevBest;

  const existingCrystals = prev.collectedCrystals[key] ?? [];
  const mergedCrystals = Array.from(new Set([...existingCrystals, ...crystalIds]));

  const completedSet = new Set(prev.completedLevels);
  completedSet.add(levelId);

  const unlockedLevel = Math.min(TOTAL_LEVELS, Math.max(prev.unlockedLevel, levelId + 1));

  const next: SaveData = {
    ...prev,
    unlockedLevel,
    lastPlayedLevel: Math.min(TOTAL_LEVELS, levelId + 1),
    completedLevels: Array.from(completedSet).sort((a, b) => a - b),
    collectedCrystals: {
      ...prev.collectedCrystals,
      [key]: mergedCrystals,
    },
    bestTimes: {
      ...prev.bestTimes,
      [key]: bestTimeSeconds,
    },
    totalDeaths: prev.totalDeaths + Math.max(0, deathsInRun),
  };

  return { next, isNewBest, bestTimeSeconds };
}

export function computeCompletionPercent(data: SaveData): number {
  return Math.round((data.completedLevels.length / TOTAL_LEVELS) * 100);
}
