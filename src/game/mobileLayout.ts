import type { GraphicsQuality } from './types';
import { computeDesktopCameraFraming, computeDesktopViewportProfile } from './desktopLayout';

export type ViewportOrientation = 'portrait' | 'landscape';

export interface MobileViewportInput {
  width: number;
  height: number;
  devicePixelRatio: number;
  isTouchDevice: boolean;
  hardwareConcurrency?: number;
  graphicsQuality: GraphicsQuality;
}

export interface MobileViewportProfile {
  /** True only on mobile / touch-sized viewports; false keeps desktop 100% unchanged */
  isMobile: boolean;
  orientation: ViewportOrientation;
  /** Physical backing-store multiplier (1 on desktop, crisp 1.5..2.0 adaptive HiDPI on mobile) */
  renderScale: number;
  /** Logical world zoom (1 on desktop, responsive camera zoom on mobile) */
  logicalZoom: number;
  /** Vertical pixels reserved at top of viewport for HUD (0 on desktop) */
  topSafePx: number;
  /** Vertical pixels reserved at bottom of viewport for touch controls (0 on desktop) */
  bottomSafePx: number;
  /** True on lower-end mobile devices or low quality setting */
  isLowEndMobile: boolean;
  /** Adaptive sky gradient band count */
  bgBands: number;
  /** Adaptive background mote ratio (0..1) */
  bgMoteRatio: number;
  /** Adaptive particle burst multiplier (0..1) */
  particleScale: number;
  /** Whether to draw atmospheric light shafts */
  drawLightShafts: boolean;
  /** Desktop-only enhanced micro-detail & smooth sky fidelity (always false on mobile) */
  highFidelityDetail?: boolean;
}

export interface CameraFramingInput {
  profile: MobileViewportProfile;
  viewW: number;
  viewH: number;
  levelWidth: number;
  levelHeight: number;
  playerCenterX: number;
  playerCenterY: number;
  facing: 1 | -1;
  /** Optional look-ahead override (0 when snapping on spawn/respawn) */
  useLookAhead: boolean;
}

export interface CameraFramingResult {
  camX: number;
  camY: number;
  effW: number;
  effH: number;
  logicalZoom: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Determines whether the current viewport should use the mobile profile and computes
 * crisp adaptive HiDPI scaling, safe HUD bands, camera zoom, and performance budgets.
 * Desktop viewports strictly receive untouched desktop defaults.
 */
export function computeMobileViewportProfile(input: MobileViewportInput): MobileViewportProfile {
  const width = Math.max(240, Math.round(input.width || 1280));
  const height = Math.max(240, Math.round(input.height || 720));
  const dpr = Number.isFinite(input.devicePixelRatio) && input.devicePixelRatio > 0 ? input.devicePixelRatio : 1;
  const orientation: ViewportOrientation = height > width ? 'portrait' : 'landscape';

  // Mobile detection: touch-capable devices at phone/tablet sizes, narrow viewports (< 900px),
  // or short phone landscape viewports (e.g., 932x430 iPhone Pro Max / 915x412 Galaxy Ultra)
  const isPhoneLandscape = width <= 1024 && height <= 520;
  const isCompactViewport = width < 900;
  const isTouchMobile = input.isTouchDevice && (width <= 1180 || height <= 820);
  const isMobile = isCompactViewport || isPhoneLandscape || isTouchMobile;

  if (!isMobile) {
    // PC / LAPTOP DESKTOP PROFILE (isolated in desktopLayout.ts — never alters mobile)
    return computeDesktopViewportProfile({
      width,
      height,
      devicePixelRatio: dpr,
      hardwareConcurrency: input.hardwareConcurrency,
      graphicsQuality: input.graphicsQuality,
    });
  }

  const cores = input.hardwareConcurrency ?? 6;
  const isLowEndMobile = input.graphicsQuality === 'low' || (cores > 0 && cores <= 4);

  // Crisp HiDPI backing resolution on mobile without wasteful 3x fill-rate overhead
  const maxDpr =
    input.graphicsQuality === 'low'
      ? 1.5
      : input.graphicsQuality === 'medium'
        ? 1.75
        : isLowEndMobile
          ? 1.75
          : 2.0;
  const renderScale = clamp(dpr, 1, maxDpr);

  let topSafePx: number;
  let bottomSafePx: number;
  let logicalZoom: number;

  if (orientation === 'portrait') {
    // Row 1 compact status bar (~44px) + Row 2 centered Color Dock (~48px) + breathing room
    topSafePx = width < 360 ? 98 : 104;
    // Ergonomic bottom touch controls (58-64px) + safe-area margin
    bottomSafePx = height < 680 ? 104 : 118;
    // Show ~530-560 world units horizontally so player & obstacles look sharp and generously sized
    logicalZoom = clamp(width / 540, 0.66, 0.9);
  } else {
    // Single unified top perimeter row (~48-52px) with Level Info + Color Dock + Utility Icons
    topSafePx = height < 360 ? 48 : 54;
    // Bottom touch controls on left & right corners over extended obsidian bedrock
    bottomSafePx = height < 360 ? 74 : 84;
    const playableH = Math.max(160, height - topSafePx - bottomSafePx);
    // Keep ~375 world units vertically visible in the unobstructed band (floor y=600 up to y=225)
    const zoomByH = playableH / 375;
    // Keep enough horizontal look-ahead (~900+ world units)
    const zoomByW = width / 900;
    logicalZoom = clamp(Math.min(zoomByH, zoomByW), 0.6, 0.92);
  }

  return {
    isMobile: true,
    orientation,
    renderScale,
    logicalZoom,
    topSafePx,
    bottomSafePx,
    isLowEndMobile,
    bgBands: input.graphicsQuality === 'low' ? 8 : 10,
    bgMoteRatio: input.graphicsQuality === 'low' ? 0.35 : isLowEndMobile ? 0.55 : 0.68,
    particleScale: input.graphicsQuality === 'low' ? 0.55 : isLowEndMobile ? 0.72 : 0.85,
    drawLightShafts: input.graphicsQuality !== 'low',
  };
}

/**
 * Computes camera target (camX, camY) in world coordinates for both desktop and mobile.
 * Desktop uses the exact original camera framing.
 * Mobile frames the playable level cleanly inside [topSafePx, viewH - bottomSafePx]
 * so neither the top HUD nor the bottom touch controls ever cover the player character.
 */
export function computeCameraFraming(input: CameraFramingInput): CameraFramingResult {
  const { profile, viewW, viewH, levelWidth, levelHeight, playerCenterX, playerCenterY, facing, useLookAhead } = input;
  const logicalZoom = profile.logicalZoom || 1;
  const effW = viewW / logicalZoom;
  const effH = viewH / logicalZoom;

  if (!profile.isMobile) {
    // PC / LAPTOP DESKTOP CAMERA FRAMING (isolated in desktopLayout.ts — never alters mobile)
    return computeDesktopCameraFraming({
      viewW,
      viewH,
      logicalZoom,
      levelWidth,
      levelHeight,
      playerCenterX,
      playerCenterY,
      facing,
      useLookAhead,
    });
  }

  // MOBILE SAFE-BAND CAMERA FRAMING
  const maxX = Math.max(0, levelWidth - effW);
  const lookAhead = useLookAhead ? facing * (profile.orientation === 'portrait' ? 40 : 54) : 0;
  const anchorRatioX = profile.orientation === 'portrait' ? 0.42 : 0.44;

  const camX =
    levelWidth <= effW
      ? -(effW - levelWidth) * 0.5
      : clamp(playerCenterX + lookAhead - effW * anchorRatioX, 0, maxX);

  // All 104 COLORIX levels place the primary ground surface at levelHeight - 120,
  // with bedrock slabs extending +420px below levelHeight.
  const floorSurfaceY = levelHeight - 120;
  const usableScreenH = Math.max(120, viewH - profile.topSafePx - profile.bottomSafePx);
  const usableWorldH = usableScreenH / logicalZoom;

  // Lift floor surface cleanly above the bottom touch-control zone.
  // On tall portrait screens with extra vertical sky room, lift slightly further for balanced framing.
  const extraPortraitLiftPx =
    profile.orientation === 'portrait' ? clamp((usableWorldH - 580) * logicalZoom * 0.22, 0, 52) : 0;
  const floorScreenY = viewH - profile.bottomSafePx - extraPortraitLiftPx;
  const floorAnchorCamY = floorSurfaceY - floorScreenY / logicalZoom;

  // Keep player centered comfortably in the lower-middle of the unobstructed playable band
  const desiredPlayerScreenY = profile.topSafePx + usableScreenH * 0.62;
  const followCamY = playerCenterY - desiredPlayerScreenY / logicalZoom;

  // Never let the top of the level hide behind the top HUD, and never let the floor sink behind touch controls
  const minCamY = -profile.topSafePx / logicalZoom;
  const maxCamY = floorAnchorCamY + 14;

  const camY =
    usableWorldH >= floorSurfaceY
      ? floorAnchorCamY
      : clamp(followCamY, Math.min(minCamY, maxCamY), maxCamY);

  return { camX, camY, effW, effH, logicalZoom };
}

/**
 * Resolves horizontal directional input from a unified mobile Left/Right touch pad.
 * Guarantees left and right can never be simultaneously active and leaves a small
 * center dead-zone so thumb taps near the inner edge stay accurate.
 */
export function resolveDirectionalPadInput(
  relativeX: number,
  padWidth: number,
): { left: boolean; right: boolean } {
  if (padWidth <= 0 || !Number.isFinite(relativeX)) {
    return { left: false, right: false };
  }
  const normalized = relativeX / padWidth;
  // Dead-zone in the middle 10% gap between the two arrow buttons (0.45..0.55)
  if (normalized < 0.45) {
    return { left: true, right: false };
  }
  if (normalized > 0.55) {
    return { left: false, right: true };
  }
  return { left: false, right: false };
}
