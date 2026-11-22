import type { ActiveColor } from '../colors';
import type { GameSettings, HudSnapshot, LevelCompleteStats } from '../types';

export interface TouchInputState {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  jumpJustPressed: boolean;
}

export interface EngineCallbacks {
  onEngineReady?: () => void;
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onLevelComplete: (stats: LevelCompleteStats) => void;
  onCrystalCollected: (levelId: number, crystalId: string) => void;
  onTogglePause: () => void;
  onToggleWheel: () => void;
  onToggleMute: () => void;
  onCheckpointToast: () => void;
}

export interface EngineBridge {
  loadLevel: (levelId: number, ownedCrystals: number) => void;
  enterTitleMode: () => void;
  restartLevel: () => void;
  setPaused: (paused: boolean) => void;
  selectColor: (color: ActiveColor) => void;
  cycleColor: (dir: 1 | -1) => void;
  applySettings: (settings: GameSettings) => void;
  setTouchInput: (patch: Partial<TouchInputState>) => void;
  triggerTouchJump: () => void;
  releaseTouchJump: () => void;
  triggerColorBlast: () => void;
  clearInputs: () => void;
  destroy: () => void;
}
