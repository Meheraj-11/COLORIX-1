export type LoadTaskId = 'core_data' | 'fonts' | 'audio' | 'engine';

export type LoadTaskStatus = 'pending' | 'loaded' | 'error';

export interface LoadTaskState {
  id: LoadTaskId;
  label: string;
  weight: number;
  essential: boolean;
  status: LoadTaskStatus;
  errorMessage?: string;
}

export const MIN_LOADING_DISPLAY_MS = 2400;
export const COMPLETE_HOLD_MS = 220;
export const FADE_OUT_MS = 480;

export function createInitialLoadTasks(): LoadTaskState[] {
  return [
    { id: 'core_data', label: 'Core worlds & 16-color system', weight: 25, essential: true, status: 'pending' },
    { id: 'fonts', label: 'Display typography', weight: 20, essential: true, status: 'pending' },
    { id: 'engine', label: 'Phaser 3 game engine', weight: 55, essential: true, status: 'pending' },
    { id: 'audio', label: 'Background music track', weight: 0, essential: false, status: 'pending' },
  ];
}

/**
 * Computes true weighted progress (0..100) strictly from essential game tasks.
 * Optional assets (like background music) never block reaching 100% or entering the game.
 */
export function computeRawLoadProgress(tasks: LoadTaskState[]): number {
  const essentialTasks = tasks.filter((t) => t.essential);
  if (essentialTasks.length === 0) return 0;

  let totalWeight = 0;
  let completedWeight = 0;
  let allEssentialLoaded = true;

  for (const t of essentialTasks) {
    totalWeight += t.weight;
    if (t.status === 'loaded') {
      completedWeight += t.weight;
    } else {
      allEssentialLoaded = false;
    }
  }

  if (totalWeight <= 0) return 0;
  if (allEssentialLoaded) return 100;
  return Math.min(99, Math.floor((completedWeight / totalWeight) * 100));
}

export function getFirstEssentialError(tasks: LoadTaskState[]): string | null {
  for (const t of tasks) {
    if (t.essential && t.status === 'error') {
      return t.errorMessage || `Failed to load ${t.label.toLowerCase()}.`;
    }
  }
  return null;
}

export function getOptionalAudioWarning(tasks: LoadTaskState[]): string | null {
  const audioTask = tasks.find((t) => t.id === 'audio' && !t.essential);
  if (audioTask && audioTask.status === 'error') {
    return audioTask.errorMessage || 'Background music could not load. You can continue playing or retry audio.';
  }
  return null;
}

export interface DisplayProgressResult {
  /** Target visual percentage 0..100; guaranteed < 100 until real loading finishes */
  targetPercent: number;
  /** True only when all essential assets loaded AND minimum visual showcase elapsed */
  readyToTransition: boolean;
}

/**
 * Pure progress pacing curve:
 * - Never reaches 100% while rawProgress < 100 (no fake completion).
 * - If real assets load very fast, paces smoothly from 0% -> 100% over minDisplayMs (~2.4s).
 * - If real assets take longer than minDisplayMs, tracks rawProgress accurately until ready.
 */
export function computeDisplayProgress(params: {
  rawProgress: number;
  elapsedMs: number;
  hasError: boolean;
  minDisplayMs?: number;
}): DisplayProgressResult {
  const minMs = params.minDisplayMs ?? MIN_LOADING_DISPLAY_MS;
  const raw = Math.max(0, Math.min(100, params.rawProgress));
  const elapsed = Math.max(0, params.elapsedMs);

  if (params.hasError) {
    return {
      targetPercent: Math.min(raw, 92),
      readyToTransition: false,
    };
  }

  // Smooth ease-out-quad time curve across the minimum display window
  const timeNorm = Math.min(1, elapsed / Math.max(1, minMs));
  const easedTimePercent = (1 - (1 - timeNorm) * (1 - timeNorm) * 0.35) * timeNorm * 100;
  // Simpler monotonic curve that starts cleanly at 0 and reaches 100 exactly at timeNorm = 1
  const smoothTimePercent = Math.min(100, (timeNorm * 0.45 + (1 - Math.pow(1 - timeNorm, 2)) * 0.55) * 100);
  void easedTimePercent;

  if (raw < 100) {
    // Strictly bounded by real task completion (never exceeds raw, never reaches 100 early)
    const bounded = Math.min(raw, Math.min(96, Math.max(smoothTimePercent * 0.9, raw * Math.min(1, timeNorm * 1.6))));
    return {
      targetPercent: Math.max(0, Math.min(96, bounded)),
      readyToTransition: false,
    };
  }

  // All real tasks succeeded: pace smoothly to 100% over minDisplayMs
  if (timeNorm < 1) {
    return {
      targetPercent: Math.min(99.4, smoothTimePercent),
      readyToTransition: false,
    };
  }

  return {
    targetPercent: 100,
    readyToTransition: true,
  };
}
