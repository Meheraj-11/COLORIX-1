import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ColorWheel } from './components/ColorWheel';
import { GameHud } from './components/GameHud';
import { LoadingScreen } from './components/LoadingScreen';
import {
  CreditsModal,
  HowToPlayModal,
  LevelCompleteModal,
  PauseModal,
  SettingsModal,
} from './components/Modals';
import { TitleScreen } from './components/TitleScreen';
import { WorldMapModal } from './components/WorldMapModal';
import { audioManager } from './game/audio';
import { COLOR_PALETTE, type ActiveColor } from './game/colors';
import { createColorixEngine } from './game/engine/createPhaserGame';
import type { EngineBridge } from './game/engine/eventBus';
import { getStrings } from './game/i18n';
import { getLevelById, getWorldIdForLevel, TOTAL_LEVEL_COUNT, WORLDS } from './game/levels';
import {
  COMPLETE_HOLD_MS,
  computeDisplayProgress,
  computeRawLoadProgress,
  createInitialLoadTasks,
  FADE_OUT_MS,
  getFirstEssentialError,
  getOptionalAudioWarning,
  MIN_LOADING_DISPLAY_MS,
  type LoadTaskId,
  type LoadTaskState,
} from './game/loader';
import {
  countTotalCollectedCrystals,
  createDefaultSave,
  loadSaveData,
  persistSaveData,
  recordLevelCompletion,
} from './game/save';
import { computeMobileViewportProfile, type MobileViewportProfile } from './game/mobileLayout';
import type {
  AppScreen,
  GameSettings,
  GraphicsQuality,
  HudSnapshot,
  LevelCompleteStats,
  SaveData,
} from './game/types';

function readViewportProfile(quality: GraphicsQuality): MobileViewportProfile {
  if (typeof window === 'undefined') {
    return computeMobileViewportProfile({
      width: 1280,
      height: 720,
      devicePixelRatio: 1,
      isTouchDevice: false,
      graphicsQuality: quality,
    });
  }
  const isTouchDevice =
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  return computeMobileViewportProfile({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    isTouchDevice,
    hardwareConcurrency: navigator.hardwareConcurrency,
    graphicsQuality: quality,
  });
}

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<EngineBridge | null>(null);

  const [save, setSave] = useState<SaveData>(() => loadSaveData());
  const saveRef = useRef<SaveData>(save);
  saveRef.current = save;

  const [screen, setScreen] = useState<AppScreen>('title');
  const screenRef = useRef<AppScreen>(screen);
  screenRef.current = screen;

  const [wheelOpen, setWheelOpen] = useState(false);
  const wheelOpenRef = useRef(wheelOpen);
  wheelOpenRef.current = wheelOpen;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [checkpointBanner, setCheckpointBanner] = useState(false);
  const [viewportProfile, setViewportProfile] = useState<MobileViewportProfile>(() =>
    readViewportProfile(save.settings.graphicsQuality),
  );

  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [completeStats, setCompleteStats] = useState<LevelCompleteStats | null>(null);

  // One-time Launch Loading Screen State (never re-shown on level or menu transitions)
  const [loadingPhase, setLoadingPhase] = useState<'loading' | 'fading' | 'done'>('loading');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [musicWarning, setMusicWarning] = useState<string | null>(null);
  const [musicWarningDismissed, setMusicWarningDismissed] = useState<boolean>(false);
  const [retryingMusic, setRetryingMusic] = useState<boolean>(false);
  const [loadAttempt, setLoadAttempt] = useState<number>(0);

  const engineReadyRef = useRef<boolean>(false);
  const loadTasksRef = useRef<LoadTaskState[]>(createInitialLoadTasks());
  const loadStartTimeRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const pendingAutostartLevelRef = useRef<number | null>(null);

  const runCrystalBufferRef = useRef<string[]>([]);
  const checkpointTimerRef = useRef<number | null>(null);

  const t = getStrings(save.settings.language);

  const markTaskStatus = useCallback((id: LoadTaskId, status: 'pending' | 'loaded' | 'error', errorMessage?: string) => {
    loadTasksRef.current = loadTasksRef.current.map((task) =>
      task.id === id ? { ...task, status, errorMessage } : task,
    );
    const firstErr = getFirstEssentialError(loadTasksRef.current);
    if (firstErr) {
      setLoadingError(firstErr);
    }
    if (id === 'audio') {
      const audioWarn = getOptionalAudioWarning(loadTasksRef.current);
      setMusicWarning(audioWarn);
      if (!audioWarn) {
        setMusicWarningDismissed(false);
      }
    }
  }, []);

  // Persist save changes & sync audio/engine settings
  useEffect(() => {
    persistSaveData(save);
    audioManager.applySettings(save.settings);
    engineRef.current?.applySettings(save.settings);
  }, [save]);

  // Sync body data-state attribute for deterministic game-state inspection
  useEffect(() => {
    if (loadingPhase !== 'done') {
      document.body.dataset.state = 'loading';
      return;
    }
    const bodyState =
      screen === 'playing'
        ? 'playing'
        : screen === 'paused'
          ? 'paused'
          : screen === 'level_complete'
            ? 'gameover'
            : 'title';
    document.body.dataset.state = bodyState;
  }, [screen, loadingPhase]);

  // Responsive mobile viewport & orientation detection on resize / orientation change
  useEffect(() => {
    const syncProfile = () => setViewportProfile(readViewportProfile(saveRef.current.settings.graphicsQuality));
    syncProfile();
    window.addEventListener('resize', syncProfile);
    window.addEventListener('orientationchange', syncProfile);
    window.visualViewport?.addEventListener('resize', syncProfile);
    return () => {
      window.removeEventListener('resize', syncProfile);
      window.removeEventListener('orientationchange', syncProfile);
      window.visualViewport?.removeEventListener('resize', syncProfile);
    };
  }, [save.settings.graphicsQuality]);

  // Clear held movement inputs whenever the 16-Color Wheel opens so mobile touches never stick
  useEffect(() => {
    if (wheelOpen) {
      engineRef.current?.clearInputs();
    }
  }, [wheelOpen]);

  const startLevel = useCallback((levelId: number) => {
    audioManager.unlock();
    const owned = countTotalCollectedCrystals(saveRef.current);
    runCrystalBufferRef.current = [];
    setWheelOpen(false);
    setSettingsOpen(false);
    setHowToPlayOpen(false);
    setCreditsOpen(false);
    setCompleteStats(null);
    setScreen('playing');
    document.body.dataset.state = 'playing';
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    audioManager.setAmbientMode('world', getWorldIdForLevel(levelId));
    engineRef.current?.loadLevel(levelId, owned);
  }, []);

  const returnToTitle = useCallback(() => {
    setWheelOpen(false);
    setSettingsOpen(false);
    setCompleteStats(null);
    setScreen('title');
    audioManager.setAmbientMode('menu', 1);
    engineRef.current?.enterTitleMode();
  }, []);

  const togglePause = useCallback(() => {
    if (wheelOpenRef.current) {
      setWheelOpen(false);
      return;
    }
    if (screenRef.current === 'playing') {
      setScreen('paused');
      engineRef.current?.setPaused(true);
      audioManager.setAmbientMode('paused');
    } else if (screenRef.current === 'paused') {
      setSettingsOpen(false);
      setScreen('playing');
      engineRef.current?.setPaused(false);
      audioManager.setAmbientMode('world', hud?.worldId ?? 1);
    }
  }, [hud?.worldId]);

  const updateSettings = useCallback((patch: Partial<GameSettings>) => {
    const nextSettings: GameSettings = { ...saveRef.current.settings, ...patch };
    audioManager.applySettings(nextSettings);
    audioManager.unlock();
    if (
      patch.masterVolume === undefined &&
      patch.musicVolume === undefined &&
      patch.sfxVolume === undefined
    ) {
      audioManager.playUiClick();
    }
    setSave((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
    }));
  }, []);

  const toggleMute = useCallback(() => {
    const nextSettings: GameSettings = {
      ...saveRef.current.settings,
      muted: !saveRef.current.settings.muted,
    };
    audioManager.applySettings(nextSettings);
    audioManager.unlock();
    setSave((prev) => ({
      ...prev,
      settings: { ...prev.settings, muted: !prev.settings.muted },
    }));
  }, []);

  const resetProgress = useCallback(() => {
    setSave((prev) => ({
      ...createDefaultSave(),
      settings: { ...prev.settings },
    }));
  }, []);

  // Mount isolated Phaser 3 engine exactly once
  const callbacksRef = useRef({
    onEngineReady: () => {
      engineReadyRef.current = true;
      markTaskStatus('engine', 'loaded');
    },
    onHudUpdate: (snapshot: HudSnapshot) => setHud(snapshot),
    onCrystalCollected: (_levelId: number, crystalId: string) => {
      if (!runCrystalBufferRef.current.includes(crystalId)) {
        runCrystalBufferRef.current.push(crystalId);
      }
    },
    onLevelComplete: (rawStats: LevelCompleteStats) => {
      const { next, isNewBest, bestTimeSeconds } = recordLevelCompletion(
        saveRef.current,
        rawStats.levelId,
        rawStats.elapsedSeconds,
        runCrystalBufferRef.current,
        rawStats.deathsInRun,
      );
      setSave(next);
      setWheelOpen(false);
      setCompleteStats({
        ...rawStats,
        isNewBest,
        bestTimeSeconds,
      });
      setScreen('level_complete');
    },
    onTogglePause: () => togglePause(),
    onToggleWheel: () => {
      if (screenRef.current === 'playing') {
        setWheelOpen((prev) => !prev);
      }
    },
    onToggleMute: () => toggleMute(),
    onCheckpointToast: () => {
      setCheckpointBanner(true);
      if (checkpointTimerRef.current) window.clearTimeout(checkpointTimerRef.current);
      checkpointTimerRef.current = window.setTimeout(() => setCheckpointBanner(false), 2200);
    },
  });

  // Keep dynamic callback refs fresh without re-mounting Phaser
  callbacksRef.current.onTogglePause = togglePause;
  callbacksRef.current.onToggleMute = toggleMute;
  callbacksRef.current.onEngineReady = () => {
    engineReadyRef.current = true;
    markTaskStatus('engine', 'loaded');
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let bridge: EngineBridge | null = null;
    try {
      bridge = createColorixEngine(container, {
        onEngineReady: () => callbacksRef.current.onEngineReady(),
        onHudUpdate: (s) => callbacksRef.current.onHudUpdate(s),
        onLevelComplete: (st) => callbacksRef.current.onLevelComplete(st),
        onCrystalCollected: (lid, cid) => callbacksRef.current.onCrystalCollected(lid, cid),
        onTogglePause: () => callbacksRef.current.onTogglePause(),
        onToggleWheel: () => callbacksRef.current.onToggleWheel(),
        onToggleMute: () => callbacksRef.current.onToggleMute(),
        onCheckpointToast: () => callbacksRef.current.onCheckpointToast(),
      });
      engineRef.current = bridge;
      bridge.applySettings(saveRef.current.settings);
    } catch {
      markTaskStatus('engine', 'error', 'Game rendering engine failed to initialize. Please retry.');
    }

    // Support ?autostart=1 (and optional ?level=N) after loading finishes
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const reqLevel = Number(params.get('level') || '1');
      const target = Number.isInteger(reqLevel) && reqLevel >= 1 && reqLevel <= 104 ? reqLevel : 1;
      pendingAutostartLevelRef.current = target;
    }

    return () => {
      if (checkpointTimerRef.current) window.clearTimeout(checkpointTimerRef.current);
      bridge?.destroy();
      engineRef.current = null;
    };
  }, [markTaskStatus]);

  // Automatic real-asset loading & initialization coordinator (runs once at launch, or on Retry)
  useEffect(() => {
    if (loadingPhase === 'done') return;

    let cancelled = false;
    let rafId = 0;
    let holdTimer: number | null = null;
    let fadeTimer: number | null = null;
    let engineTimeout: number | null = null;
    let transitioning = false;

    loadStartTimeRef.current = performance.now();
    setLoadingError(null);
    setLoadingProgress(0);
    setLoadingPhase('loading');

    // Reset tasks cleanly (preserving engine status if already initialized)
    loadTasksRef.current = createInitialLoadTasks().map((task) =>
      task.id === 'engine' && engineReadyRef.current ? { ...task, status: 'loaded' } : task,
    );

    // 1. Validate core game data (16-color system, 8 worlds, 104 levels) and pre-warm Level 1
    try {
      if (COLOR_PALETTE.length !== 16 || WORLDS.length !== 8 || TOTAL_LEVEL_COUNT !== 104) {
        throw new Error('Core COLORIX world and color configuration data is incomplete.');
      }
      const firstLevel = getLevelById(1);
      if (!firstLevel || firstLevel.platforms.length === 0) {
        throw new Error('Initial level geometry failed integrity verification.');
      }
      markTaskStatus('core_data', 'loaded');
    } catch (err) {
      markTaskStatus(
        'core_data',
        'error',
        err instanceof Error ? err.message : 'Core game data failed validation.',
      );
    }

    // 2. Verify display fonts readiness (with safe fallback timeout so offline play never stalls)
    const waitForFonts = async () => {
      try {
        if (document.fonts && document.fonts.ready) {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => window.setTimeout(resolve, 2200)),
          ]);
        }
        if (!cancelled) markTaskStatus('fonts', 'loaded');
      } catch {
        if (!cancelled) markTaskStatus('fonts', 'loaded');
      }
    };
    void waitForFonts();

    // 3. Preload optional background music track using the singleton AudioManager (non-fatal)
    audioManager.applySettings(saveRef.current.settings);
    const waitForAudio = async () => {
      const result = await audioManager.preloadAndVerifyBackgroundMusic(6000);
      if (cancelled) return;
      if (result.ok) {
        markTaskStatus('audio', 'loaded');
      } else {
        markTaskStatus(
          'audio',
          'error',
          result.error || 'Background music could not load. You can play now or retry audio.',
        );
      }
    };
    void waitForAudio();

    // 4. Guard against Phaser engine stalling indefinitely on launch
    if (!engineReadyRef.current) {
      engineTimeout = window.setTimeout(() => {
        if (!cancelled && !engineReadyRef.current) {
          markTaskStatus(
            'engine',
            'error',
            'Game engine initialization timed out. Please retry.',
          );
        }
      }, 12000);
    }

    // Smoothly animate visual progress strictly tied to real task completion + minimum showcase time
    let smoothed = 0;
    const tick = (now: number) => {
      if (cancelled) return;
      const tasks = loadTasksRef.current;
      const err = getFirstEssentialError(tasks);
      const raw = computeRawLoadProgress(tasks);
      const elapsedMs = now - loadStartTimeRef.current;

      const { targetPercent, readyToTransition } = computeDisplayProgress({
        rawProgress: raw,
        elapsedMs,
        hasError: Boolean(err),
        minDisplayMs: MIN_LOADING_DISPLAY_MS,
      });

      // Smooth interpolation (never jumps backwards, never reaches 100 early)
      const step = (targetPercent - smoothed) * 0.16;
      smoothed = Math.abs(targetPercent - smoothed) < 0.2 ? targetPercent : smoothed + Math.max(0, step);
      setLoadingProgress(smoothed);

      if (err) {
        setLoadingError(err);
        return; // Halt loop cleanly; wait for Retry button
      }

      if (readyToTransition && !transitioning) {
        transitioning = true;
        setLoadingProgress(100);
        if (engineTimeout !== null) window.clearTimeout(engineTimeout);

        holdTimer = window.setTimeout(() => {
          if (cancelled) return;
          setLoadingPhase('fading');
          fadeTimer = window.setTimeout(() => {
            if (cancelled) return;
            setLoadingPhase('done');
            if (pendingAutostartLevelRef.current !== null) {
              const targetLvl = pendingAutostartLevelRef.current;
              pendingAutostartLevelRef.current = null;
              startLevel(targetLvl);
            }
          }, FADE_OUT_MS);
        }, COMPLETE_HOLD_MS);
        return;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      if (holdTimer !== null) window.clearTimeout(holdTimer);
      if (fadeTimer !== null) window.clearTimeout(fadeTimer);
      if (engineTimeout !== null) window.clearTimeout(engineTimeout);
    };
  }, [loadAttempt, markTaskStatus, startLevel]);

  const handleRetryLoading = useCallback(() => {
    setLoadingError(null);
    setMusicWarning(null);
    setMusicWarningDismissed(false);
    setLoadAttempt((n) => n + 1);
  }, []);

  const handleRetryMusic = useCallback(async () => {
    setRetryingMusic(true);
    audioManager.applySettings(saveRef.current.settings);
    const result = await audioManager.retryBackgroundMusic(8000);
    setRetryingMusic(false);
    if (result.ok) {
      markTaskStatus('audio', 'loaded');
      setMusicWarning(null);
      setMusicWarningDismissed(false);
    } else {
      const msg = result.error || 'Background music still could not load. Please check your connection and retry.';
      markTaskStatus('audio', 'error', msg);
      setMusicWarning(msg);
      setMusicWarningDismissed(false);
    }
  }, [markTaskStatus]);

  // Stable mobile touch control callbacks so HUD timer/cooldown ticks never interrupt held movement
  const handleTouchLeft = useCallback((down: boolean) => {
    engineRef.current?.setTouchInput({ left: down });
  }, []);

  const handleTouchRight = useCallback((down: boolean) => {
    engineRef.current?.setTouchInput({ right: down });
  }, []);

  const handleTouchJumpDown = useCallback(() => {
    audioManager.unlock();
    engineRef.current?.triggerTouchJump();
  }, []);

  const handleTouchJumpUp = useCallback(() => {
    engineRef.current?.releaseTouchJump();
  }, []);

  // Title-to-Start Keyboard Handshake (Enter / Space starts immediately once loading completes)
  useEffect(() => {
    const onTitleKey = (e: KeyboardEvent) => {
      if (loadingPhase !== 'done' || screen !== 'title' || settingsOpen || howToPlayOpen || creditsOpen) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        const hasProgress = save.completedLevels.length > 0 || save.unlockedLevel > 1;
        startLevel(hasProgress ? save.lastPlayedLevel : 1);
      }
    };
    window.addEventListener('keydown', onTitleKey);
    return () => window.removeEventListener('keydown', onTitleKey);
  }, [loadingPhase, screen, settingsOpen, howToPlayOpen, creditsOpen, save.completedLevels.length, save.unlockedLevel, save.lastPlayedLevel, startLevel]);

  const showTouchControls =
    save.settings.touchMode === 'on' ||
    (save.settings.touchMode === 'auto' && viewportProfile.isMobile);

  const handleSelectColor = useCallback((color: ActiveColor) => {
    audioManager.unlock();
    engineRef.current?.selectColor(color);
  }, []);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0B0D14]">
      {/* Isolated Phaser 3 Full-Viewport Canvas */}
      <div
        ref={mountRef}
        data-testid="phaser-viewport"
        className="fixed inset-0 z-0 w-full h-full"
      />

      {/* Title Screen */}
      {screen === 'title' && loadingPhase !== 'loading' && (
        <TitleScreen
          save={save}
          t={t}
          controlScheme={save.settings.controlScheme}
          musicWarning={musicWarningDismissed ? null : musicWarning}
          retryingMusic={retryingMusic}
          onRetryMusic={() => {
            void handleRetryMusic();
          }}
          onDismissMusicWarning={() => setMusicWarningDismissed(true)}
          onPlayNew={() => {
            audioManager.unlock();
            audioManager.playUiClick();
            startLevel(1);
          }}
          onContinue={() => {
            audioManager.unlock();
            audioManager.playUiClick();
            startLevel(save.lastPlayedLevel);
          }}
          onOpenWorldMap={() => {
            audioManager.unlock();
            audioManager.playUiClick();
            setScreen('world_map');
          }}
          onOpenSettings={() => {
            audioManager.unlock();
            audioManager.playUiClick();
            setSettingsOpen(true);
          }}
          onOpenHowToPlay={() => {
            audioManager.unlock();
            audioManager.playUiClick();
            setHowToPlayOpen(true);
          }}
          onOpenCredits={() => {
            audioManager.unlock();
            audioManager.playUiClick();
            setCreditsOpen(true);
          }}
        />
      )}

      {/* World Map / 104-Level Selector */}
      {screen === 'world_map' && (
        <WorldMapModal
          save={save}
          t={t}
          onSelectLevel={(id) => {
            audioManager.playUiClick();
            startLevel(id);
          }}
          onBack={() => {
            audioManager.playUiClick();
            setScreen('title');
          }}
        />
      )}

      {/* Active Gameplay HUD */}
      {(screen === 'playing' || screen === 'paused') && hud && (
        <GameHud
          hud={hud}
          muted={save.settings.muted}
          t={t}
          isMobile={viewportProfile.isMobile}
          orientation={viewportProfile.orientation}
          showTouchControls={showTouchControls && screen === 'playing' && !wheelOpen}
          checkpointBanner={checkpointBanner}
          onSelectColor={handleSelectColor}
          onOpenWheel={() => {
            audioManager.unlock();
            setWheelOpen((v) => !v);
          }}
          onTriggerBlast={() => {
            audioManager.unlock();
            engineRef.current?.triggerColorBlast();
          }}
          onToggleMute={toggleMute}
          onRestart={() => {
            audioManager.playUiClick();
            runCrystalBufferRef.current = [];
            setWheelOpen(false);
            engineRef.current?.restartLevel();
          }}
          onPause={togglePause}
          onTouchLeft={handleTouchLeft}
          onTouchRight={handleTouchRight}
          onTouchJumpDown={handleTouchJumpDown}
          onTouchJumpUp={handleTouchJumpUp}
        />
      )}

      {/* Interactive 16-Color Radial Wheel */}
      {screen === 'playing' && hud && (
        <ColorWheel
          open={wheelOpen}
          activeColor={hud.activeColor}
          levelPalette={hud.palette}
          onSelect={handleSelectColor}
          onClose={() => setWheelOpen(false)}
          titleLabel={t.colorWheel}
        />
      )}

      {/* Pause Menu */}
      {screen === 'paused' && !settingsOpen && (
        <PauseModal
          t={t}
          levelLabel={hud ? `World ${hud.worldId} · Level ${hud.levelId} — ${hud.levelName}` : ''}
          onResume={togglePause}
          onRestart={() => {
            audioManager.playUiClick();
            runCrystalBufferRef.current = [];
            setScreen('playing');
            engineRef.current?.setPaused(false);
            engineRef.current?.restartLevel();
          }}
          onOpenSettings={() => {
            audioManager.playUiClick();
            setSettingsOpen(true);
          }}
          onMainMenu={() => {
            audioManager.playUiClick();
            returnToTitle();
          }}
        />
      )}

      {/* Level Complete Screen */}
      {screen === 'level_complete' && completeStats && (
        <LevelCompleteModal
          t={t}
          stats={completeStats}
          onNextLevel={() => {
            audioManager.playUiClick();
            startLevel(completeStats.levelId + 1);
          }}
          onReplay={() => {
            audioManager.playUiClick();
            startLevel(completeStats.levelId);
          }}
          onWorldMap={() => {
            audioManager.playUiClick();
            setCompleteStats(null);
            setScreen('world_map');
          }}
        />
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal
          t={t}
          settings={save.settings}
          musicWarning={musicWarning}
          retryingMusic={retryingMusic}
          onRetryMusic={() => {
            void handleRetryMusic();
          }}
          onUpdate={updateSettings}
          onResetProgress={resetProgress}
          onClose={() => {
            audioManager.playUiClick();
            setSettingsOpen(false);
          }}
        />
      )}

      {/* How to Play Modal */}
      {howToPlayOpen && (
        <HowToPlayModal
          t={t}
          onClose={() => {
            audioManager.playUiClick();
            setHowToPlayOpen(false);
          }}
        />
      )}

      {/* Credits Modal */}
      {creditsOpen && (
        <CreditsModal
          t={t}
          onClose={() => {
            audioManager.playUiClick();
            setCreditsOpen(false);
          }}
        />
      )}

      {/* Full-Screen Animated Launch Loading Screen (runs once on launch, auto-transitions smoothly) */}
      {loadingPhase !== 'done' && (
        <LoadingScreen
          progress={loadingProgress}
          errorMessage={loadingError}
          audioWarning={musicWarning}
          fadingOut={loadingPhase === 'fading'}
          onRetry={handleRetryLoading}
        />
      )}
    </main>
  );
}
