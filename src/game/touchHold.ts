export type MoveDirection = 'left' | 'right';

export interface DirectionalHoldState {
  activePointerId: number | null;
  activeTouchId: number | null;
  direction: MoveDirection | null;
}

export interface DirectionalInputOutput {
  left: boolean;
  right: boolean;
}

export function createInitialHoldState(): DirectionalHoldState {
  return {
    activePointerId: null,
    activeTouchId: null,
    direction: null,
  };
}

export function getDirectionalOutput(state: DirectionalHoldState): DirectionalInputOutput {
  return {
    left: state.direction === 'left',
    right: state.direction === 'right',
  };
}

/**
 * Activates a continuous directional hold for a specific pointerId.
 * Always mutually exclusive: pressing Left immediately cancels Right and vice versa.
 */
export function pressDirectionPointer(
  _state: DirectionalHoldState,
  pointerId: number,
  direction: MoveDirection,
): DirectionalHoldState {
  return {
    activePointerId: pointerId,
    activeTouchId: null,
    direction,
  };
}

/**
 * Releases the directional hold ONLY if the released pointerId matches the active directional pointer.
 * Unrelated pointers (e.g., second thumb tapping Jump or Blast) never interrupt held movement.
 */
export function releaseDirectionPointer(
  state: DirectionalHoldState,
  pointerId: number,
): DirectionalHoldState {
  if (state.activePointerId !== pointerId) {
    return state;
  }
  return createInitialHoldState();
}

/**
 * Legacy touch-only fallback (used only in environments without PointerEvent support).
 */
export function pressDirectionTouch(
  _state: DirectionalHoldState,
  touchId: number,
  direction: MoveDirection,
): DirectionalHoldState {
  return {
    activePointerId: null,
    activeTouchId: touchId,
    direction,
  };
}

export function releaseDirectionTouch(
  state: DirectionalHoldState,
  touchId: number,
): DirectionalHoldState {
  if (state.activeTouchId !== touchId) {
    return state;
  }
  return createInitialHoldState();
}

/**
 * Immediately clears any active directional hold (blur, visibility change, touchcancel, zero active touches).
 */
export function clearDirectionalHold(): DirectionalHoldState {
  return createInitialHoldState();
}
