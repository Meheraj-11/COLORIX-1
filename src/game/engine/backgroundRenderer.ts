import Phaser from 'phaser';
import { rgbToHexNum } from '../colors';
import type { GraphicsQuality, WorldDef } from '../types';

interface AmbientMote {
  x: number;
  y: number;
  r: number;
  speedY: number;
  speedX: number;
  phase: number;
  alpha: number;
}

const MAX_MOTES = 46;

export class BackgroundRenderer {
  private motes: AmbientMote[] = [];
  // Pre-allocated scratch RGB tuples to avoid per-frame GC allocations on mobile
  private topRgb: [number, number, number] = [0, 0, 0];
  private midRgb: [number, number, number] = [0, 0, 0];
  private botRgb: [number, number, number] = [0, 0, 0];
  private bandRgb: [number, number, number] = [0, 0, 0];
  private layerRgb: [number, number, number] = [0, 0, 0];

  constructor() {
    for (let i = 0; i < MAX_MOTES; i++) {
      this.motes.push({
        x: Math.random() * 1600,
        y: Math.random() * 900,
        r: 1.2 + Math.random() * 2.4,
        speedY: -10 - Math.random() * 18,
        speedX: (Math.random() - 0.5) * 14,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.25 + Math.random() * 0.45,
      });
    }
  }

  public update(dt: number, viewW: number, viewH: number, theme: WorldDef['theme'], activeRatio = 1): void {
    const w = Math.max(320, viewW);
    const h = Math.max(320, viewH);
    const dirY = theme === 'frozen' ? 1 : -1;
    const count = Math.max(8, Math.min(this.motes.length, Math.round(this.motes.length * activeRatio)));
    for (let i = 0; i < count; i++) {
      const m = this.motes[i];
      m.phase += dt * 1.4;
      m.x += (m.speedX + Math.sin(m.phase) * 8) * dt;
      m.y += Math.abs(m.speedY) * dirY * dt;
      if (m.y < -20) m.y = h + 20;
      if (m.y > h + 20) m.y = -20;
      if (m.x < -20) m.x = w + 20;
      if (m.x > w + 20) m.x = -20;
    }
  }

  public render(
    g: Phaser.GameObjects.Graphics,
    viewW: number,
    viewH: number,
    camX: number,
    camY: number,
    bgRgb: [number, number, number],
    world: WorldDef,
    timeSec: number,
    quality: GraphicsQuality,
    opts?: { bands?: number; moteRatio?: number; drawLightShafts?: boolean; highFidelity?: boolean },
  ): void {
    g.clear();

    // 1. Atmospheric Sky Gradient (Canvas & WebGL compatible multi-band vertical gradient)
    const bands = opts?.bands ?? 14;
    const highFidelity = Boolean(opts?.highFidelity);
    const topRgb = this.topRgb;
    topRgb[0] = Math.max(6, Math.round(bgRgb[0] * 0.54));
    topRgb[1] = Math.max(8, Math.round(bgRgb[1] * 0.54));
    topRgb[2] = Math.max(14, Math.round(bgRgb[2] * 0.62));

    const midRgb = this.midRgb;
    midRgb[0] = Math.min(255, Math.round(bgRgb[0] * 0.98));
    midRgb[1] = Math.min(255, Math.round(bgRgb[1] * 0.98));
    midRgb[2] = Math.min(255, Math.round(bgRgb[2] * 0.98));

    const botRgb = this.botRgb;
    botRgb[0] = Math.min(255, Math.round(bgRgb[0] * 1.16 + 14));
    botRgb[1] = Math.min(255, Math.round(bgRgb[1] * 1.16 + 14));
    botRgb[2] = Math.min(255, Math.round(bgRgb[2] * 1.16 + 18));

    const bandRgb = this.bandRgb;
    const bandStep = viewH / bands;
    const bandH = Math.ceil(bandStep) + 1;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      if (t < 0.55) {
        const k = t / 0.55;
        bandRgb[0] = Math.round(topRgb[0] + (midRgb[0] - topRgb[0]) * k);
        bandRgb[1] = Math.round(topRgb[1] + (midRgb[1] - topRgb[1]) * k);
        bandRgb[2] = Math.round(topRgb[2] + (midRgb[2] - topRgb[2]) * k);
      } else {
        const k = (t - 0.55) / 0.45;
        bandRgb[0] = Math.round(midRgb[0] + (botRgb[0] - midRgb[0]) * k);
        bandRgb[1] = Math.round(midRgb[1] + (botRgb[1] - midRgb[1]) * k);
        bandRgb[2] = Math.round(midRgb[2] + (botRgb[2] - midRgb[2]) * k);
      }
      g.fillStyle(rgbToHexNum(bandRgb), 1);
      g.fillRect(0, i * bandStep, viewW, bandH);
    }

    // Desktop-only subtle horizon atmospheric glow for richer depth on wide PC/Laptop screens
    if (highFidelity) {
      g.fillStyle(0xffffff, 0.028);
      g.fillRect(0, viewH * 0.64, viewW, viewH * 0.18);
      g.fillStyle(0xffffff, 0.022);
      g.fillRect(0, viewH * 0.72, viewW, viewH * 0.14);
    }

    // 2. Subtle Atmospheric Light Shafts / Celestial Prism Halo (medium & high quality)
    const showShafts = opts?.drawLightShafts ?? quality !== 'low';
    if (showShafts) {
      const sunX = viewW * 0.72 - ((camX * 0.03) % 240);
      const sunY = viewH * 0.24;
      const haloR = Math.min(viewW, viewH) * 0.24;
      g.fillStyle(0xffffff, 0.05);
      g.fillCircle(sunX, sunY, haloR);
      g.fillStyle(0xffffff, 0.07);
      g.fillCircle(sunX, sunY, Math.min(viewW, viewH) * 0.11);
      if (highFidelity) {
        g.lineStyle(1, 0xffffff, 0.08);
        g.strokeCircle(sunX, sunY, haloR * 0.68);
      }

      // Diagonal light shafts (cull shafts outside current viewport)
      g.fillStyle(0xffffff, 0.035);
      for (let i = 0; i < 3; i++) {
        const sx = ((i * 420 - camX * 0.06) % (viewW + 420)) - 120;
        if (sx - 210 > viewW || sx + 95 < 0) continue;
        g.beginPath();
        g.moveTo(sx, 0);
        g.lineTo(sx + 95, 0);
        g.lineTo(sx - 110, viewH);
        g.lineTo(sx - 210, viewH);
        g.closePath();
        g.fillPath();
      }
    }

    // 3. Far Parallax Silhouette Layer (0.12x camera scroll)
    const layerRgb = this.layerRgb;
    layerRgb[0] = Math.max(4, Math.round(bgRgb[0] * 0.34));
    layerRgb[1] = Math.max(5, Math.round(bgRgb[1] * 0.34));
    layerRgb[2] = Math.max(10, Math.round(bgRgb[2] * 0.4));
    const farColor = rgbToHexNum(layerRgb);
    const farOffset = -(camX * 0.12);
    const baseY = viewH - Math.min(80, camY * 0.05);

    g.fillStyle(farColor, 0.88);
    if (world.theme === 'caverns') {
      // Stalactites hanging from ceiling + far cavern ridge
      this.drawRepeatingPeaks(g, viewW, baseY - 90, farOffset, 260, 145, false);
      this.drawRepeatingPeaks(g, viewW, 0, farOffset * 0.9, 210, 120, true);
    } else if (world.theme === 'forest') {
      // Towering ancient forest silhouettes
      this.drawRepeatingForest(g, viewW, viewH, farOffset, 180, farColor, 0.72);
    } else if (world.theme === 'neon' || world.theme === 'machine') {
      // Geometric monolith skyline or clockwork silhouettes
      this.drawRepeatingMonoliths(g, viewW, viewH, farOffset, 220, world.theme === 'machine', timeSec);
    } else if (world.theme === 'prism' || world.theme === 'spectrum') {
      // Floating geometric prism shards & celestial rings
      this.drawRepeatingPeaks(g, viewW, baseY - 60, farOffset, 300, 175, false);
      g.lineStyle(1.5, 0xffffff, 0.09);
      g.strokeCircle(viewW * 0.5, viewH * 0.42, Math.min(viewW, viewH) * 0.34);
      g.strokeCircle(viewW * 0.5, viewH * 0.42, Math.min(viewW, viewH) * 0.44);
    } else {
      // Ruins / Frozen distant alpine peaks
      this.drawRepeatingPeaks(g, viewW, baseY - 65, farOffset, 280, 180, false);
    }

    // 4. Mid Parallax Architectural Layer (0.28x camera scroll)
    layerRgb[0] = Math.max(4, Math.round(bgRgb[0] * 0.2));
    layerRgb[1] = Math.max(5, Math.round(bgRgb[1] * 0.2));
    layerRgb[2] = Math.max(9, Math.round(bgRgb[2] * 0.25));
    const midColor = rgbToHexNum(layerRgb);
    const midOffset = -(camX * 0.28);
    g.fillStyle(midColor, 0.92);
    this.drawMidArchitecture(g, viewW, viewH, midOffset, world.theme, timeSec);

    // 5. Atmospheric Drifting Motes (count scaled by Graphics Quality & mobile profile)
    const baseMoteCount = quality === 'low' ? 10 : quality === 'medium' ? 24 : MAX_MOTES;
    const moteRatio = opts?.moteRatio ?? 1;
    const moteCount = Math.max(6, Math.min(MAX_MOTES, Math.round(baseMoteCount * moteRatio)));
    for (let i = 0; i < moteCount; i++) {
      const m = this.motes[i];
      if (m.x < -10 || m.x > viewW + 10 || m.y < -10 || m.y > viewH + 10) continue;
      const pulse = 0.65 + 0.35 * Math.sin(m.phase * 1.5);
      g.fillStyle(0xffffff, m.alpha * pulse);
      g.fillCircle(m.x, m.y, m.r);
    }
  }

  private drawRepeatingPeaks(
    g: Phaser.GameObjects.Graphics,
    viewW: number,
    baseY: number,
    offsetX: number,
    step: number,
    peakH: number,
    invertedCeiling: boolean,
  ): void {
    const startIdx = Math.floor(-offsetX / step) - 1;
    const count = Math.ceil(viewW / step) + 3;
    g.beginPath();
    if (!invertedCeiling) {
      g.moveTo(-100, baseY + 400);
    } else {
      g.moveTo(-100, 0);
    }

    for (let i = 0; i <= count; i++) {
      const idx = startIdx + i;
      const x = idx * step + offsetX;
      const seed = Math.abs(Math.sin(idx * 12.9898) * 43758.5453) % 1;
      const h = peakH * (0.45 + seed * 0.55);
      const midX = x + step * (0.38 + (seed * 0.24));
      if (!invertedCeiling) {
        g.lineTo(x, baseY + 25);
        g.lineTo(midX, baseY - h);
      } else {
        g.lineTo(x, 12);
        g.lineTo(midX, h);
      }
    }

    if (!invertedCeiling) {
      g.lineTo(viewW + 200, baseY + 400);
    } else {
      g.lineTo(viewW + 200, 0);
    }
    g.closePath();
    g.fillPath();
  }

  private drawRepeatingForest(
    g: Phaser.GameObjects.Graphics,
    viewW: number,
    viewH: number,
    offsetX: number,
    step: number,
    color: number,
    alpha: number,
  ): void {
    g.fillStyle(color, alpha);
    const startIdx = Math.floor(-offsetX / step) - 1;
    const count = Math.ceil(viewW / step) + 3;
    for (let i = 0; i < count; i++) {
      const idx = startIdx + i;
      const x = idx * step + offsetX;
      const seed = Math.abs(Math.sin(idx * 78.233) * 19283.1) % 1;
      const trunkW = 24 + seed * 28;
      g.fillRect(x, 0, trunkW, viewH);
      // Canopy branch silhouette
      g.fillTriangle(x - 45, viewH * 0.35 + seed * 80, x + trunkW + 55, viewH * 0.28 + seed * 60, x + trunkW * 0.5, 0);
    }
  }

  private drawRepeatingMonoliths(
    g: Phaser.GameObjects.Graphics,
    viewW: number,
    viewH: number,
    offsetX: number,
    step: number,
    withGears: boolean,
    timeSec: number,
  ): void {
    const startIdx = Math.floor(-offsetX / step) - 1;
    const count = Math.ceil(viewW / step) + 3;
    for (let i = 0; i < count; i++) {
      const idx = startIdx + i;
      const x = idx * step + offsetX;
      const seed = Math.abs(Math.sin(idx * 45.164) * 31921.7) % 1;
      const w = 52 + seed * 64;
      const h = 180 + seed * 240;
      g.fillRect(x, viewH - h, w, h);
      // Subtle architectural notch
      g.fillRect(x + 12, viewH - h - 22, w - 24, 22);

      if (withGears && idx % 2 === 0) {
        const cx = x + w * 0.5;
        const cy = viewH - h - 45;
        const r = 46;
        g.lineStyle(4, 0x0b0c12, 0.38);
        g.strokeCircle(cx, cy, r);
        const angle = timeSec * 0.35 * (idx % 4 === 0 ? 1 : -1);
        for (let t = 0; t < 6; t++) {
          const a = angle + (t * Math.PI) / 3;
          g.lineBetween(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12), cx + Math.cos(a) * (r + 12), cy + Math.sin(a) * (r + 12));
        }
      }
    }
  }

  private drawMidArchitecture(
    g: Phaser.GameObjects.Graphics,
    viewW: number,
    viewH: number,
    offsetX: number,
    theme: WorldDef['theme'],
    timeSec: number,
  ): void {
    const step = 340;
    const startIdx = Math.floor(-offsetX / step) - 1;
    const count = Math.ceil(viewW / step) + 3;

    for (let i = 0; i < count; i++) {
      const idx = startIdx + i;
      const x = idx * step + offsetX;
      const seed = Math.abs(Math.sin(idx * 91.771) * 14512.3) % 1;

      if (theme === 'ruins' || theme === 'neon') {
        // Ruined stone arch / pillar
        const ph = 140 + seed * 150;
        g.fillRect(x, viewH - ph, 30, ph);
        g.fillRect(x + 92, viewH - ph * 0.85, 28, ph * 0.85);
        g.fillRect(x - 6, viewH - ph, 134, 22);
      } else if (theme === 'caverns' || theme === 'frozen') {
        // Crystalline spire cluster
        const sh = 120 + seed * 140;
        g.fillTriangle(x, viewH, x + 28, viewH - sh, x + 56, viewH);
        g.fillTriangle(x + 38, viewH, x + 64, viewH - sh * 0.72, x + 90, viewH);
      } else if (theme === 'prism' || theme === 'spectrum') {
        // Floating crystalline diamonds bobbing gently
        const floatY = viewH * 0.42 + seed * 180 + Math.sin(timeSec * 0.9 + idx) * 12;
        const size = 24 + seed * 26;
        g.beginPath();
        g.moveTo(x, floatY - size);
        g.lineTo(x + size * 0.65, floatY);
        g.lineTo(x, floatY + size);
        g.lineTo(x - size * 0.65, floatY);
        g.closePath();
        g.fillPath();
      } else {
        // Silhouetted ruins / conduits
        const h = 95 + seed * 115;
        g.fillRect(x, viewH - h, 42, h);
        g.fillTriangle(x, viewH - h, x + 21, viewH - h - 34, x + 42, viewH - h);
      }
    }
  }
}
