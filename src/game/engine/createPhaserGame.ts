import Phaser from 'phaser';
import { ColorixScene } from './ColorixScene';
import type { EngineBridge, EngineCallbacks } from './eventBus';

export function createColorixEngine(
  container: HTMLElement,
  callbacks: EngineCallbacks,
): EngineBridge {
  const scene = new ColorixScene();
  scene.setCallbacks(callbacks);

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: container,
    width: container.clientWidth || window.innerWidth,
    height: container.clientHeight || window.innerHeight,
    backgroundColor: '#0b0d14',
    antialias: true,
    roundPixels: false,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
    },
    scene: [scene],
    audio: {
      noAudio: true, // Managed directly by our procedural Web Audio synthesizer
    },
  });

  // Expose live ResizeObserver syncing so viewport changes never distort aspect ratio
  const ro = new ResizeObserver(() => {
    if (!game || !game.scale) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    if (w > 0 && h > 0) {
      game.scale.resize(w, h);
    }
  });
  ro.observe(container);

  return {
    loadLevel: (levelId, ownedCrystals) => scene.loadLevel(levelId, ownedCrystals),
    enterTitleMode: () => scene.enterTitleMode(),
    restartLevel: () => scene.restartLevel(),
    setPaused: (paused) => scene.setPaused(paused),
    selectColor: (color) => scene.selectColor(color),
    cycleColor: (dir) => scene.cycleColor(dir),
    applySettings: (settings) => scene.applySettings(settings),
    setTouchInput: (patch) => scene.setTouchInput(patch),
    triggerTouchJump: () => scene.triggerTouchJump(),
    releaseTouchJump: () => scene.releaseTouchJump(),
    triggerColorBlast: () => scene.triggerColorBlast(),
    clearInputs: () => scene.clearInputs(),
    destroy: () => {
      ro.disconnect();
      game.destroy(true);
    },
  };
}
