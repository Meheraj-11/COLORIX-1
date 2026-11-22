import type { LevelDef, WorldId } from '../types';
import { HANDCRAFTED_LEVELS } from './handcrafted';
import { buildModularLevel } from './levelBuilder';
import { WORLDS, WORLD_MAP } from './worldData';

export { WORLDS, WORLD_MAP };

export const LEVELS_PER_WORLD = 13;
export const TOTAL_LEVEL_COUNT = WORLDS.length * LEVELS_PER_WORLD; // 104 playable levels

const LEVEL_CACHE = new Map<number, LevelDef>();

export function getWorldIdForLevel(levelId: number): WorldId {
  const clamped = Math.max(1, Math.min(TOTAL_LEVEL_COUNT, Math.floor(levelId)));
  return (Math.floor((clamped - 1) / LEVELS_PER_WORLD) + 1) as WorldId;
}

export function getLevelById(levelId: number): LevelDef {
  const clamped = Math.max(1, Math.min(TOTAL_LEVEL_COUNT, Math.floor(levelId)));
  const cached = LEVEL_CACHE.get(clamped);
  if (cached) return cached;

  let def: LevelDef;
  if (HANDCRAFTED_LEVELS[clamped]) {
    def = HANDCRAFTED_LEVELS[clamped];
  } else {
    const worldId = getWorldIdForLevel(clamped);
    const indexInWorld = ((clamped - 1) % LEVELS_PER_WORLD) + 1;
    def = buildModularLevel(clamped, worldId, indexInWorld);
  }

  LEVEL_CACHE.set(clamped, def);
  return def;
}

export function getAllLevels(): LevelDef[] {
  const list: LevelDef[] = [];
  for (let i = 1; i <= TOTAL_LEVEL_COUNT; i++) {
    list.push(getLevelById(i));
  }
  return list;
}

export function getLevelsForWorld(worldId: WorldId): LevelDef[] {
  const start = (worldId - 1) * LEVELS_PER_WORLD + 1;
  const result: LevelDef[] = [];
  for (let i = 0; i < LEVELS_PER_WORLD; i++) {
    result.push(getLevelById(start + i));
  }
  return result;
}
