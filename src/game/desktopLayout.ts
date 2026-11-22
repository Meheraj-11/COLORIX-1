import type { GraphicsQuality } from './types';
import type {
  CameraFramingResult,
  MobileViewportProfile,
  ViewportOrientation,
} from './mobileLayout';

export interface DesktopViewportInput {
  width: number;
  height: number;
  devicePixelRatio: number;
  hardwareConcurrency?: number;
  graphicsQuality: GraphicsQuality;
}

export interface DesktopCameraInput {
  viewW: number;
  viewH: number;
  logicalZoom: number;
  levelWidth: number;
  levelHeight: number;
  playerCenterX: number;
  playerCenterY: number;
  facing: 1 | -1;
  useLookAhead: boolean;
}

/**
 * Physical pixel ceilings keep HiDPI desktop canvases razor-sharp on Retina / 125%-200%
 * Windows & macOS displays while preventing unnecessary 4K-5K software fill-rate spikes.
 */
const DESKTOP_PIXEL_BUDGET: Record<GraphicsQuality, number> = {
  high: 3_750_000,   // ~2560x1460 physical max (crisp 1.5x-2.0x on laptops, sharp 1.35x+ on 1080p)
  medium: 2_600_000, // Smooth balanced HiDPI on integrated laptop GPUs
  low: 1_850_000,    // Fast native-class rendering on older laptops
};

const DESKTOP_DPR_CAP: Record<GraphicsQuality, number> = {
  high: 2.0,
  medium: 1.5,
  low: 1.25,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Computes PC / Laptop viewport scaling, HiDPI backing-store multiplier, and visual fidelity
 * settings. Strictly isolated from mobile profiles so desktop upgrades never affect mobile.
 */
export function computeDesktopViewportProfile(
  input: DesktopViewportInput,
): MobileViewportProfile {
  const width = Math.max(240, Math.round(input.width || 1280));
  const height = Math.max(240, Math.round(input.height || 720));
  const dpr =
    Number.isFinite(input.devicePixelRatio) && input.devicePixelRatio > 0
      ? input.devicePixelRatio
      : 1;
  const orientation: ViewportOrientation = height > width ? 'portrait' : 'landscape';

  const cores = input.hardwareConcurrency ?? 8;
  const isModestCpu = cores > 0 && cores <= 4;

  // 1. HiDPI Desktop Backing-Store Resolution (sharp on Retina & 125%/150%/200% Windows scaling)
  const dprCap =
    isModestCpu && input.graphicsQuality === 'high'
      ? 1.75
      : DESKTOP_DPR_CAP[input.graphicsQuality];
  const desiredScale = clamp(dpr, 1, dprCap);
  const pixelBudget = DESKTOP_PIXEL_BUDGET[input.graphicsQuality];
  const budgetScale = Math.sqrt(pixelBudget / Math.max(1, width * height));
  // Round to 0.05 increments to avoid sub-pixel shimmer while staying within pixel budget
  const rawScale = clamp(Math.min(desiredScale, Math.max(1, budgetScale)), 1, dprCap);
  const renderScale = Math.max(1, Math.round(rawScale * 20) / 20);

  // 2. Proportional PC / Laptop Logical Zoom
  // Authored reference stage is 1280x720. Scaling cleanly with viewport height (and ultrawide width)
  // ensures 1366x768, 1440x900, 1600x900, 1920x1080 (exact 1.5x), and 2560x1440 (exact 2.0x)
  // fill the screen edge-to-edge with zero floating side voids and exact aspect ratio preservation.
  const zoomByH = height / 720;
  const zoomByW = width / 1400;
  const logicalZoom = clamp(Math.max(zoomByH, zoomByW), 1.0, 2.0);

  return {
    isMobile: false,
    orientation,
    renderScale,
    logicalZoom,
    topSafePx: 0,
    bottomSafePx: 0,
    isLowEndMobile: false,
    bgBands: input.graphicsQuality === 'low' ? 14 : input.graphicsQuality === 'medium' ? 22 : 28,
    bgMoteRatio: 1,
    particleScale: 1,
    drawLightShafts: input.graphicsQuality !== 'low',
    highFidelityDetail: input.graphicsQuality !== 'low',
  };
}

/**
 * Computes desktop camera framing with proportional viewport zoom so PC & Laptop monitors
 * use full screen space cleanly without floating margins or cropped gameplay elements.
 */
export function computeDesktopCameraFraming(
  input: DesktopCameraInput,
): CameraFramingResult {
  const {
    viewW,
    viewH,
    logicalZoom,
    levelWidth,
    levelHeight,
    playerCenterX,
    playerCenterY,
    facing,
    useLookAhead,
  } = input;

  const zoom = logicalZoom || 1;
  const effW = viewW / zoom;
  const effH = viewH / zoom;

  const maxX = Math.max(0, levelWidth - effW);
  const camX =
    levelWidth <= effW
      ? -(effW - levelWidth) * 0.5
      : useLookAhead
        ? clamp(playerCenterX + facing * 68 - effW * 0.48, 0, maxX)
        : clamp(playerCenterX - effW * 0.42, 0, maxX);

  // Keep primary ground anchored cleanly above the desktop bottom Color Dock while following
  // smoothly on taller (740-800px) vertical levels and ultrawide viewports.
  const camY =
    levelHeight <= effH
      ? levelHeight - effH
      : clamp(playerCenterY - effH * 0.56, 0, levelHeight - effH);

  return { camX, camY, effW, effH, logicalZoom: zoom };
}
