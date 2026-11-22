import Phaser from 'phaser';
import { computeMobileViewportProfile, type MobileViewportProfile } from '../mobileLayout';
import type { GraphicsQuality } from '../types';
import { ColorixScene } from './ColorixScene';
import type { EngineBridge, EngineCallbacks } from './eventBus';

function detectTouchHardware(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    Boolean(window.matchMedia?.('(pointer: coarse)').matches)
  );
}

function measureViewport(
  container: HTMLElement,
  quality: GraphicsQuality,
): { cssW: number; cssH: number; physW: number; physH: number; profile: MobileViewportProfile } {
  const cssW = Math.max(240, Math.round(container.clientWidth || window.innerWidth || 1280));
  const cssH = Math.max(240, Math.round(container.clientHeight || window.innerHeight || 720));
  const profile = computeMobileViewportProfile({
    width: cssW,
    height: cssH,
    devicePixelRatio: window.devicePixelRatio || 1,
    isTouchDevice: detectTouchHardware(),
    hardwareConcurrency: navigator.hardwareConcurrency,
    graphicsQuality: quality,
  });
  const physW = Math.max(240, Math.round(cssW * profile.renderScale));
  const physH = Math.max(240, Math.round(cssH * profile.renderScale));
  return { cssW, cssH, physW, physH, profile };
}

export function createColorixEngine(
  container: HTMLElement,
  callbacks: EngineCallbacks,
): EngineBridge {
  const scene = new ColorixScene();
  scene.setCallbacks(callbacks);

  let currentQuality: GraphicsQuality = 'high';
  const initial = measureViewport(container, currentQuality);
  scene.setViewportMetrics(initial.cssW, initial.cssH, initial.profile);

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: container,
    width: initial.physW,
    height: initial.physH,
    backgroundColor: '#0b0d14',
    antialias: true,
    roundPixels: false,
    scale: {
      mode: Phaser.Scale.NONE,
      zoom: 1 / initial.profile.renderScale,
      autoCenter: Phaser.Scale.NO_CENTER,
    },
    scene: [scene],
    audio: {
      noAudio: true, // Managed directly by our procedural Web Audio synthesizer
    },
  });

  const applyCanvasCssSize = (cssW: number, cssH: number, isMobile: boolean) => {
    const canvas = game.canvas;
    if (!canvas) return;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.style.display = 'block';
    if (!isMobile) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) {
          ctx.imageSmoothingQuality = 'high';
        }
      }
    }
  };
  applyCanvasCssSize(initial.cssW, initial.cssH, initial.profile.isMobile);

  let resizeRafId = 0;
  let lastCssW = initial.cssW;
  let lastCssH = initial.cssH;
  let lastScale = initial.profile.renderScale;

  const syncViewportSize = (force = false) => {
    if (!game || !game.scale) return;
    const next = measureViewport(container, currentQuality);
    scene.setViewportMetrics(next.cssW, next.cssH, next.profile);

    if (
      force ||
      next.cssW !== lastCssW ||
      next.cssH !== lastCssH ||
      Math.abs(next.profile.renderScale - lastScale) > 0.01
    ) {
      lastCssW = next.cssW;
      lastCssH = next.cssH;
      lastScale = next.profile.renderScale;
      game.scale.setZoom(1 / next.profile.renderScale);
      game.scale.setGameSize(next.physW, next.physH);
      applyCanvasCssSize(next.cssW, next.cssH, next.profile.isMobile);
    }
  };

  game.events.once('ready', () => {
    syncViewportSize(true);
  });

  const scheduleSync = () => {
    if (resizeRafId) return;
    resizeRafId = window.requestAnimationFrame(() => {
      resizeRafId = 0;
      syncViewportSize(false);
    });
  };

  // Live ResizeObserver + window/orientation/visualViewport syncing for crisp, distortion-free scaling
  const ro = new ResizeObserver(scheduleSync);
  ro.observe(container);
  window.addEventListener('resize', scheduleSync);
  window.addEventListener('orientationchange', scheduleSync);
  window.visualViewport?.addEventListener('resize', scheduleSync);

  return {
    loadLevel: (levelId, ownedCrystals) => scene.loadLevel(levelId, ownedCrystals),
    enterTitleMode: () => scene.enterTitleMode(),
    restartLevel: () => scene.restartLevel(),
    setPaused: (paused) => scene.setPaused(paused),
    selectColor: (color) => scene.selectColor(color),
    cycleColor: (dir) => scene.cycleColor(dir),
    applySettings: (settings) => {
      const qualityChanged = settings.graphicsQuality !== currentQuality;
      currentQuality = settings.graphicsQuality;
      scene.applySettings(settings);
      if (qualityChanged) {
        syncViewportSize(true);
      }
    },
    setTouchInput: (patch) => scene.setTouchInput(patch),
    triggerTouchJump: () => scene.triggerTouchJump(),
    releaseTouchJump: () => scene.releaseTouchJump(),
    triggerColorBlast: () => scene.triggerColorBlast(),
    clearInputs: () => scene.clearInputs(),
    destroy: () => {
      if (resizeRafId) window.cancelAnimationFrame(resizeRafId);
      ro.disconnect();
      window.removeEventListener('resize', scheduleSync);
      window.removeEventListener('orientationchange', scheduleSync);
      window.visualViewport?.removeEventListener('resize', scheduleSync);
      game.destroy(true);
    },
  };
}
