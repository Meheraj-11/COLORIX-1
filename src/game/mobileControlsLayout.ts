export type MobileControlButtonId = 'left' | 'right' | 'blast' | 'jump';

export const MOBILE_CONTROL_BUTTON_IDS: readonly MobileControlButtonId[] = [
  'left',
  'right',
  'blast',
  'jump',
] as const;

export interface NormalizedControlPosition {
  /** Horizontal button center as a fraction of viewport width (0..1) */
  x: number;
  /** Vertical button center as a fraction of viewport height (0..1) */
  y: number;
}

export type MobileControlPositions = Record<MobileControlButtonId, NormalizedControlPosition>;

export interface MobileControlsLayout {
  /** False uses the exact built-in default mobile layout; true applies player's custom positions */
  customized: boolean;
  /** Saved normalized center positions for every mobile control button */
  buttons: MobileControlPositions;
}

export interface ButtonPixelSize {
  w: number;
  h: number;
}

export interface ButtonPixelRect {
  left: number;
  top: number;
  centerX: number;
  centerY: number;
  w: number;
  h: number;
}

export interface PlayableControlBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/**
 * Returns the exact visual pixel dimensions for each mobile control button,
 * matching GameHud's responsive Tailwind button sizes 1:1.
 */
export function getMobileButtonPixelSize(
  id: MobileControlButtonId,
  viewportW: number,
  viewportH: number,
): ButtonPixelSize {
  const isLandscape = viewportW >= viewportH;
  const widePortrait = viewportW >= 400;

  switch (id) {
    case 'left':
    case 'right':
      if (isLandscape) return { w: 56, h: 56 };
      return widePortrait ? { w: 64, h: 64 } : { w: 58, h: 58 };
    case 'blast':
      if (isLandscape) return { w: 56, h: 56 };
      return widePortrait ? { w: 64, h: 64 } : { w: 60, h: 60 };
    case 'jump':
      if (isLandscape) return { w: 60, h: 60 };
      return widePortrait ? { w: 68, h: 68 } : { w: 64, h: 64 };
  }
}

/**
 * Returns the safe playable screen area for draggable mobile buttons,
 * keeping every control inside the visible screen and clear of the top HUD bar.
 */
export function getPlayableControlArea(
  viewportW: number,
  viewportH: number,
): { padX: number; topSafeY: number; bottomPadY: number } {
  const safeW = Math.max(240, viewportW || 390);
  const safeH = Math.max(240, viewportH || 844);
  const isLandscape = safeW >= safeH;

  const padX = 10;
  // Reserve top HUD + Quick Color Dock safe zone so controls can never be lost behind top menus
  const topSafeY = isLandscape ? Math.min(64, Math.round(safeH * 0.22)) : Math.min(116, Math.round(safeH * 0.22));
  const bottomPadY = 12;

  return { padX, topSafeY, bottomPadY };
}

export function getButtonCenterBounds(
  btnSize: ButtonPixelSize,
  viewportW: number,
  viewportH: number,
): PlayableControlBounds {
  const safeW = Math.max(240, viewportW || 390);
  const safeH = Math.max(240, viewportH || 844);
  const { padX, topSafeY, bottomPadY } = getPlayableControlArea(safeW, safeH);

  const halfW = btnSize.w * 0.5;
  const halfH = btnSize.h * 0.5;

  const minX = Math.min(safeW * 0.5, padX + halfW);
  const maxX = Math.max(minX, safeW - padX - halfW);
  const minY = Math.min(safeH * 0.5, topSafeY + halfH);
  const maxY = Math.max(minY, safeH - bottomPadY - halfH);

  return { minX, maxX, minY, maxY };
}

/**
 * Clamps a pixel center coordinate strictly inside the visible playable control area.
 */
export function clampControlCenterPx(
  centerX: number,
  centerY: number,
  btnSize: ButtonPixelSize,
  viewportW: number,
  viewportH: number,
): { centerX: number; centerY: number } {
  const bounds = getButtonCenterBounds(btnSize, viewportW, viewportH);
  return {
    centerX: clamp(centerX, bounds.minX, bounds.maxX),
    centerY: clamp(centerY, bounds.minY, bounds.maxY),
  };
}

/**
 * Converts a pixel center coordinate into a safely clamped normalized (0..1) position.
 */
export function pxCenterToNormalized(
  centerX: number,
  centerY: number,
  btnSize: ButtonPixelSize,
  viewportW: number,
  viewportH: number,
): NormalizedControlPosition {
  const safeW = Math.max(240, viewportW || 390);
  const safeH = Math.max(240, viewportH || 844);
  const clamped = clampControlCenterPx(centerX, centerY, btnSize, safeW, safeH);
  return {
    x: round4(clamped.centerX / safeW),
    y: round4(clamped.centerY / safeH),
  };
}

/**
 * Converts a saved normalized (0..1) position into a clamped pixel bounding box
 * for the current viewport size, preserving relative positions across screen sizes & orientations.
 */
export function normalizedToClampedRect(
  pos: NormalizedControlPosition,
  btnSize: ButtonPixelSize,
  viewportW: number,
  viewportH: number,
): ButtonPixelRect {
  const safeW = Math.max(240, viewportW || 390);
  const safeH = Math.max(240, viewportH || 844);
  const rawCenterX = (Number.isFinite(pos.x) ? pos.x : 0.5) * safeW;
  const rawCenterY = (Number.isFinite(pos.y) ? pos.y : 0.85) * safeH;
  const clamped = clampControlCenterPx(rawCenterX, rawCenterY, btnSize, safeW, safeH);

  return {
    left: Math.round(clamped.centerX - btnSize.w * 0.5),
    top: Math.round(clamped.centerY - btnSize.h * 0.5),
    centerX: Math.round(clamped.centerX),
    centerY: Math.round(clamped.centerY),
    w: btnSize.w,
    h: btnSize.h,
  };
}

/**
 * Computes the exact default normalized button positions for a given viewport,
 * mirroring the original GameHud bottom-left (←, →) and bottom-right (BLAST, JUMP) layout.
 */
export function getDefaultMobileControlPositions(
  viewportW: number,
  viewportH: number,
): MobileControlPositions {
  const safeW = Math.max(240, viewportW || 390);
  const safeH = Math.max(240, viewportH || 844);
  const padSide = 11; // ~0.65rem safe-hud-padding
  const padBottom = 12; // ~0.75rem safe-hud-padding
  const arrowGap = 12; // gap-3
  const actionGap = 14; // gap-3.5

  const leftSize = getMobileButtonPixelSize('left', safeW, safeH);
  const rightSize = getMobileButtonPixelSize('right', safeW, safeH);
  const blastSize = getMobileButtonPixelSize('blast', safeW, safeH);
  const jumpSize = getMobileButtonPixelSize('jump', safeW, safeH);

  const leftCenterX = padSide + leftSize.w * 0.5;
  const leftCenterY = safeH - padBottom - leftSize.h * 0.5;

  const rightCenterX = padSide + leftSize.w + arrowGap + rightSize.w * 0.5;
  const rightCenterY = safeH - padBottom - rightSize.h * 0.5;

  const jumpCenterX = safeW - padSide - jumpSize.w * 0.5;
  const jumpCenterY = safeH - padBottom - jumpSize.h * 0.5;

  const blastCenterX = safeW - padSide - jumpSize.w - actionGap - blastSize.w * 0.5;
  const blastCenterY = safeH - padBottom - blastSize.h * 0.5;

  return {
    left: pxCenterToNormalized(leftCenterX, leftCenterY, leftSize, safeW, safeH),
    right: pxCenterToNormalized(rightCenterX, rightCenterY, rightSize, safeW, safeH),
    blast: pxCenterToNormalized(blastCenterX, blastCenterY, blastSize, safeW, safeH),
    jump: pxCenterToNormalized(jumpCenterX, jumpCenterY, jumpSize, safeW, safeH),
  };
}

export const DEFAULT_MOBILE_CONTROLS_LAYOUT: MobileControlsLayout = {
  customized: false,
  buttons: getDefaultMobileControlPositions(844, 390),
};

export function createDefaultMobileControlsLayout(
  viewportW = 844,
  viewportH = 390,
): MobileControlsLayout {
  return {
    customized: false,
    buttons: getDefaultMobileControlPositions(viewportW, viewportH),
  };
}

/**
 * Safely sanitizes stored custom mobile control positions loaded from localStorage.
 * Preserves valid customized positions and recovers cleanly from missing/corrupt entries.
 */
export function sanitizeMobileControlsLayout(raw: unknown): MobileControlsLayout {
  const fallback = createDefaultMobileControlsLayout(844, 390);
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const obj = raw as Record<string, unknown>;
  const customized = typeof obj.customized === 'boolean' ? obj.customized : false;
  const rawButtons =
    obj.buttons && typeof obj.buttons === 'object'
      ? (obj.buttons as Record<string, unknown>)
      : {};

  const buttons = { ...fallback.buttons };
  for (const id of MOBILE_CONTROL_BUTTON_IDS) {
    const entry = rawButtons[id];
    if (entry && typeof entry === 'object') {
      const pos = entry as Record<string, unknown>;
      if (
        typeof pos.x === 'number' &&
        Number.isFinite(pos.x) &&
        typeof pos.y === 'number' &&
        Number.isFinite(pos.y)
      ) {
        buttons[id] = {
          x: round4(clamp(pos.x, 0, 1)),
          y: round4(clamp(pos.y, 0, 1)),
        };
      }
    }
  }

  return {
    customized,
    buttons,
  };
}

/**
 * Resolves clamped pixel rects for all 4 mobile buttons on the given viewport.
 */
export function resolveMobileControlRects(
  positions: MobileControlPositions,
  viewportW: number,
  viewportH: number,
): Record<MobileControlButtonId, ButtonPixelRect> {
  return {
    left: normalizedToClampedRect(positions.left, getMobileButtonPixelSize('left', viewportW, viewportH), viewportW, viewportH),
    right: normalizedToClampedRect(positions.right, getMobileButtonPixelSize('right', viewportW, viewportH), viewportW, viewportH),
    blast: normalizedToClampedRect(positions.blast, getMobileButtonPixelSize('blast', viewportW, viewportH), viewportW, viewportH),
    jump: normalizedToClampedRect(positions.jump, getMobileButtonPixelSize('jump', viewportW, viewportH), viewportW, viewportH),
  };
}

// ============================================================================
// INDEPENDENT MULTI-TOUCH BUTTON TRACKER
// Tracks every button independently by pointerId / touchId so LEFT+JUMP,
// RIGHT+JUMP, LEFT+RIGHT, and BLAST work simultaneously without conflict.
// ============================================================================

export type MultiTouchButtonState = Record<MobileControlButtonId, readonly string[]>;

export interface ActiveControlButtons {
  left: boolean;
  right: boolean;
  blast: boolean;
  jump: boolean;
}

export function createMultiTouchButtonState(): MultiTouchButtonState {
  return {
    left: [],
    right: [],
    blast: [],
    jump: [],
  };
}

/**
 * Registers an active pointer or touch token on a specific button.
 * Distinct fingers on different buttons stay completely independent so
 * LEFT+JUMP, RIGHT+JUMP, and LEFT+RIGHT are all simultaneously detectable.
 */
export function pressMultiTouchButton(
  state: MultiTouchButtonState,
  buttonId: MobileControlButtonId,
  token: string,
): MultiTouchButtonState {
  const next: MultiTouchButtonState = {
    left: buttonId === 'left'
      ? (state.left.includes(token) ? state.left : [...state.left, token])
      : state.left.filter((t) => t !== token),
    right: buttonId === 'right'
      ? (state.right.includes(token) ? state.right : [...state.right, token])
      : state.right.filter((t) => t !== token),
    blast: buttonId === 'blast'
      ? (state.blast.includes(token) ? state.blast : [...state.blast, token])
      : state.blast.filter((t) => t !== token),
    jump: buttonId === 'jump'
      ? (state.jump.includes(token) ? state.jump : [...state.jump, token])
      : state.jump.filter((t) => t !== token),
  };
  return next;
}

/**
 * Releases a single pointer or touch token without interrupting any other active button.
 */
export function releaseMultiTouchToken(
  state: MultiTouchButtonState,
  token: string,
): MultiTouchButtonState {
  let changed = false;
  const next: MultiTouchButtonState = {
    left: state.left,
    right: state.right,
    blast: state.blast,
    jump: state.jump,
  };

  for (const id of MOBILE_CONTROL_BUTTON_IDS) {
    if (state[id].includes(token)) {
      next[id] = state[id].filter((t) => t !== token);
      changed = true;
    }
  }

  return changed ? next : state;
}

export function clearAllMultiTouchButtons(): MultiTouchButtonState {
  return createMultiTouchButtonState();
}

export function getActiveControlButtons(state: MultiTouchButtonState): ActiveControlButtons {
  return {
    left: state.left.length > 0,
    right: state.right.length > 0,
    blast: state.blast.length > 0,
    jump: state.jump.length > 0,
  };
}
