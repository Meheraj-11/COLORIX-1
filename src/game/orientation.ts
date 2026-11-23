import type { ViewportOrientation } from './mobileLayout';

export interface MobileOrientationCheckInput {
  width: number;
  height: number;
  isMobile: boolean;
}

export interface MobileOrientationState {
  orientation: ViewportOrientation;
  /** True only on mobile viewports currently in Portrait where browser could not auto-lock landscape */
  requiresLandscapeRotation: boolean;
}

/**
 * Pure helper evaluating whether the current mobile viewport is in Landscape Mode
 * or requires rotating to Landscape. Desktop viewports are NEVER blocked.
 */
export function evaluateMobileOrientationState(
  input: MobileOrientationCheckInput,
): MobileOrientationState {
  const safeW = Math.max(1, input.width || 1280);
  const safeH = Math.max(1, input.height || 720);
  const orientation: ViewportOrientation = safeH > safeW ? 'portrait' : 'landscape';

  if (!input.isMobile) {
    return {
      orientation,
      requiresLandscapeRotation: false,
    };
  }

  return {
    orientation,
    requiresLandscapeRotation: orientation === 'portrait',
  };
}

interface CapacitorScreenOrientationPlugin {
  lock?: (options: { orientation: string }) => Promise<void>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: {
    ScreenOrientation?: CapacitorScreenOrientationPlugin;
    App?: {
      addListener?: (
        eventName: string,
        listener: (event: { canGoBack?: boolean }) => void,
      ) => Promise<{ remove: () => Promise<void> }> | { remove: () => void };
    };
  };
}

/**
 * Attempts to lock mobile screen orientation to Landscape (supporting both Landscape Left
 * and Landscape Right via 'landscape' / native 'sensorLandscape').
 * Gracefully handles browser limitations (e.g., iOS Safari or non-fullscreen Chrome) without throwing.
 */
export async function tryLockLandscapeOrientation(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. Native Capacitor ScreenOrientation plugin if installed in Android/iOS wrapper
  try {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    if (cap?.Plugins?.ScreenOrientation?.lock) {
      await cap.Plugins.ScreenOrientation.lock({ orientation: 'landscape' });
      return true;
    }
  } catch {
    // Continue to Web Screen Orientation API fallback
  }

  // 2. Standard Web Screen Orientation API ('landscape' allows both landscape-primary & landscape-secondary)
  try {
    const screenOrient = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
      | undefined;
    if (screenOrient && typeof screenOrient.lock === 'function') {
      await screenOrient.lock('landscape');
      return true;
    }
  } catch {
    // Expected on iOS Safari or mobile browsers before entering fullscreen via user gesture
  }

  return false;
}

/**
 * User-gesture helper: enters fullscreen when supported, then locks to Landscape Mode.
 * Never throws in restricted iframes or browsers without fullscreen/orientation-lock support.
 */
export async function requestFullscreenLandscape(): Promise<boolean> {
  if (typeof document !== 'undefined') {
    try {
      const root = document.documentElement;
      if (!document.fullscreenElement && typeof root.requestFullscreen === 'function') {
        await root.requestFullscreen();
      }
    } catch {
      // Safe fallback when fullscreen is unsupported or blocked
    }
  }
  return tryLockLandscapeOrientation();
}

/**
 * Subscribes safely to Capacitor's native Android hardware Back button when running inside
 * a Capacitor Android WebView. Returns an unsubscribe cleanup function.
 */
export function subscribeNativeAndroidBackButton(onBack: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const appPlugin = cap?.Plugins?.App;
  if (!appPlugin?.addListener) {
    return () => {};
  }

  let disposed = false;
  let removeHandle: (() => void) | null = null;

  try {
    const maybeHandle = appPlugin.addListener('backButton', () => {
      if (!disposed) {
        onBack();
        void tryLockLandscapeOrientation();
      }
    });

    if (maybeHandle && typeof (maybeHandle as Promise<{ remove: () => Promise<void> }>).then === 'function') {
      void (maybeHandle as Promise<{ remove: () => Promise<void> }>)
        .then((handle) => {
          if (disposed) {
            void handle.remove();
          } else {
            removeHandle = () => {
              void handle.remove();
            };
          }
        })
        .catch(() => {});
    } else if (maybeHandle && typeof (maybeHandle as { remove?: () => void }).remove === 'function') {
      removeHandle = () => (maybeHandle as { remove: () => void }).remove();
    }
  } catch {
    // Non-Capacitor browser environment
  }

  return () => {
    disposed = true;
    removeHandle?.();
  };
}
