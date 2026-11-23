import React, { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR_MAP, VOID_COLOR, type ActiveColor } from '../game/colors';
import type { Translations } from '../game/i18n';
import {
  clearAllMultiTouchButtons,
  createMultiTouchButtonState,
  getActiveControlButtons,
  pressMultiTouchButton,
  releaseMultiTouchToken,
  resolveMobileControlRects,
  type ActiveControlButtons,
  type MobileControlButtonId,
  type MobileControlsLayout,
  type MultiTouchButtonState,
} from '../game/mobileControlsLayout';
import type { ViewportOrientation } from '../game/mobileLayout';
import type { HudSnapshot } from '../game/types';
import { BlastIcon, CrystalIcon, PauseIcon, RestartIcon, SoundIcon, WheelIcon } from './Icons';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  t: Translations;
  isMobile: boolean;
  orientation: ViewportOrientation;
  showTouchControls: boolean;
  customControlsLayout: MobileControlsLayout;
  checkpointBanner: boolean;
  onSelectColor: (color: ActiveColor) => void;
  onOpenWheel: () => void;
  onTriggerBlast: () => void;
  onToggleMute: () => void;
  onRestart: () => void;
  onPause: () => void;
  onTouchLeft: (down: boolean) => void;
  onTouchRight: (down: boolean) => void;
  onTouchJumpDown: () => void;
  onTouchJumpUp: () => void;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function GameHud({
  hud,
  muted,
  t,
  isMobile,
  orientation,
  showTouchControls,
  customControlsLayout,
  checkpointBanner,
  onSelectColor,
  onOpenWheel,
  onTriggerBlast,
  onToggleMute,
  onRestart,
  onPause,
  onTouchLeft,
  onTouchRight,
  onTouchJumpDown,
  onTouchJumpUp,
}: GameHudProps) {
  const activeColorDef = hud.activeColor === 'void' ? null : COLOR_MAP[hud.activeColor];
  const activeHex = activeColorDef ? activeColorDef.hex : VOID_COLOR.hex;
  const activeName = activeColorDef ? activeColorDef.name : VOID_COLOR.name;
  const blastReady = hud.blastCooldownRatio <= 0.01 && !hud.isDead;
  const blastFillPct = Math.round((1 - hud.blastCooldownRatio) * 100);
  const blastBoltHex = activeColorDef ? activeColorDef.hex : '#93C5FD';

  // Reactive viewport dimensions for responsive custom mobile layout clamping
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth || 390 : 390,
    h: typeof window !== 'undefined' ? window.innerHeight || 844 : 844,
  }));

  useEffect(() => {
    const syncSize = () => {
      setViewportSize({
        w: Math.max(240, window.innerWidth || 390),
        h: Math.max(240, window.innerHeight || 844),
      });
    };
    window.addEventListener('resize', syncSize);
    window.addEventListener('orientationchange', syncSize);
    window.visualViewport?.addEventListener('resize', syncSize);
    return () => {
      window.removeEventListener('resize', syncSize);
      window.removeEventListener('orientationchange', syncSize);
      window.visualViewport?.removeEventListener('resize', syncSize);
    };
  }, []);

  // Independent per-button multi-touch tracking:
  // LEFT + JUMP, RIGHT + JUMP, LEFT + RIGHT, and BLAST all track their own pointer/touch IDs
  // so releasing one button NEVER interrupts another active button.
  const touchCallbacksRef = useRef({
    onTouchLeft,
    onTouchRight,
    onTouchJumpDown,
    onTouchJumpUp,
    onTriggerBlast,
  });
  touchCallbacksRef.current = {
    onTouchLeft,
    onTouchRight,
    onTouchJumpDown,
    onTouchJumpUp,
    onTriggerBlast,
  };

  const multiTouchRef = useRef<MultiTouchButtonState>(createMultiTouchButtonState());
  const lastAppliedButtonsRef = useRef<ActiveControlButtons>({
    left: false,
    right: false,
    blast: false,
    jump: false,
  });
  const capturedPointersRef = useRef<Set<number>>(new Set());
  const lastPointerDownByBtnRef = useRef<Record<MobileControlButtonId, number>>({
    left: 0,
    right: 0,
    blast: 0,
    jump: 0,
  });

  const [activeBtns, setActiveBtns] = useState<ActiveControlButtons>({
    left: false,
    right: false,
    blast: false,
    jump: false,
  });

  const syncMultiTouchOutputs = useCallback((force = false) => {
    const next = getActiveControlButtons(multiTouchRef.current);
    const prev = lastAppliedButtonsRef.current;

    if (force || next.left !== prev.left) {
      touchCallbacksRef.current.onTouchLeft(next.left);
    }
    if (force || next.right !== prev.right) {
      touchCallbacksRef.current.onTouchRight(next.right);
    }
    if (next.jump && !prev.jump) {
      touchCallbacksRef.current.onTouchJumpDown();
    } else if ((force && !next.jump) || (!next.jump && prev.jump)) {
      touchCallbacksRef.current.onTouchJumpUp();
    }

    if (
      force ||
      next.left !== prev.left ||
      next.right !== prev.right ||
      next.blast !== prev.blast ||
      next.jump !== prev.jump
    ) {
      setActiveBtns(next);
    }
    lastAppliedButtonsRef.current = next;
  }, []);

  const releaseAllTouchInputs = useCallback(() => {
    multiTouchRef.current = clearAllMultiTouchButtons();
    capturedPointersRef.current.clear();
    syncMultiTouchOutputs(true);
  }, [syncMultiTouchOutputs]);

  const releasePointerToken = useCallback(
    (pointerId: number) => {
      capturedPointersRef.current.delete(pointerId);
      const next = releaseMultiTouchToken(multiTouchRef.current, `p:${pointerId}`);
      if (next !== multiTouchRef.current) {
        multiTouchRef.current = next;
        syncMultiTouchOutputs();
      }
    },
    [syncMultiTouchOutputs],
  );

  // Clear touch inputs ONLY when touch controls actually hide, window loses focus, tab backgrounds,
  // or a global pointer/touch release/cancel occurs (NEVER on HUD timer/cooldown re-renders).
  useEffect(() => {
    if (!showTouchControls) {
      releaseAllTouchInputs();
      return;
    }

    const handleGlobalPointerEnd = (e: PointerEvent) => {
      releasePointerToken(e.pointerId);
    };

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      let next = multiTouchRef.current;
      for (let i = 0; i < e.changedTouches.length; i += 1) {
        next = releaseMultiTouchToken(next, `t:${e.changedTouches[i].identifier}`);
      }
      if (next !== multiTouchRef.current) {
        multiTouchRef.current = next;
        syncMultiTouchOutputs();
      }
    };

    const handleGlobalTouchCancel = (e: TouchEvent) => {
      handleGlobalTouchEnd(e);
      if (e.touches.length === 0) {
        releaseAllTouchInputs();
      }
    };

    const handleClear = () => releaseAllTouchInputs();
    const handleVis = () => {
      if (document.hidden) releaseAllTouchInputs();
    };

    window.addEventListener('pointerup', handleGlobalPointerEnd, true);
    window.addEventListener('pointercancel', handleGlobalPointerEnd, true);
    window.addEventListener('touchend', handleGlobalTouchEnd, true);
    window.addEventListener('touchcancel', handleGlobalTouchCancel, true);
    window.addEventListener('blur', handleClear);
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerEnd, true);
      window.removeEventListener('pointercancel', handleGlobalPointerEnd, true);
      window.removeEventListener('touchend', handleGlobalTouchEnd, true);
      window.removeEventListener('touchcancel', handleGlobalTouchCancel, true);
      window.removeEventListener('blur', handleClear);
      document.removeEventListener('visibilitychange', handleVis);
      releaseAllTouchInputs();
    };
  }, [showTouchControls, releaseAllTouchInputs, releasePointerToken, syncMultiTouchOutputs]);

  // Keep button visual pressed state synchronized when player death clears engine inputs
  useEffect(() => {
    if (hud.isDead) {
      releaseAllTouchInputs();
    }
  }, [hud.isDead, releaseAllTouchInputs]);

  const preventContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleControlPointerDown = useCallback(
    (buttonId: MobileControlButtonId, e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      lastPointerDownByBtnRef.current[buttonId] = performance.now();

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
        if (
          typeof e.currentTarget.hasPointerCapture !== 'function' ||
          e.currentTarget.hasPointerCapture(e.pointerId)
        ) {
          capturedPointersRef.current.add(e.pointerId);
        }
      } catch {
        // Synthetic pointer events without active pointerId can safely skip capture
      }

      if (buttonId === 'blast') {
        touchCallbacksRef.current.onTriggerBlast();
      }

      multiTouchRef.current = pressMultiTouchButton(
        multiTouchRef.current,
        buttonId,
        `p:${e.pointerId}`,
      );
      syncMultiTouchOutputs();
    },
    [syncMultiTouchOutputs],
  );

  const handleControlPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      releasePointerToken(e.pointerId);
    },
    [releasePointerToken],
  );

  const handleControlPointerLeave = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const hasNativeCapture =
        capturedPointersRef.current.has(e.pointerId) &&
        typeof e.currentTarget.hasPointerCapture === 'function' &&
        e.currentTarget.hasPointerCapture(e.pointerId);
      if (!hasNativeCapture) {
        releasePointerToken(e.pointerId);
      }
    },
    [releasePointerToken],
  );

  const handleControlTouchStart = useCallback(
    (buttonId: MobileControlButtonId, e: React.TouchEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      // Per-button deduplication: if PointerEvents already handled this exact button press moments ago,
      // skip duplicate touch token registration without blocking other fingers on other buttons.
      if (performance.now() - lastPointerDownByBtnRef.current[buttonId] < 80) {
        return;
      }

      if (buttonId === 'blast') {
        touchCallbacksRef.current.onTriggerBlast();
      }

      let next = multiTouchRef.current;
      for (let i = 0; i < e.changedTouches.length; i += 1) {
        next = pressMultiTouchButton(next, buttonId, `t:${e.changedTouches[i].identifier}`);
      }
      multiTouchRef.current = next;
      syncMultiTouchOutputs();
    },
    [syncMultiTouchOutputs],
  );

  const handleControlTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLButtonElement>) => {
      let next = multiTouchRef.current;
      for (let i = 0; i < e.changedTouches.length; i += 1) {
        next = releaseMultiTouchToken(next, `t:${e.changedTouches[i].identifier}`);
      }
      if (next !== multiTouchRef.current) {
        multiTouchRef.current = next;
        syncMultiTouchOutputs();
      }
    },
    [syncMultiTouchOutputs],
  );

  const handleControlTouchCancel = useCallback(
    (e: React.TouchEvent<HTMLButtonElement>) => {
      handleControlTouchEnd(e);
      if (e.touches.length === 0) {
        releaseAllTouchInputs();
      }
    },
    [handleControlTouchEnd, releaseAllTouchInputs],
  );

  // Reusable preserved Quick Color Dock ([1][2][3]... | [Wheel 16]) matching the visual identity
  const renderColorDock = (compactMobile: boolean) => {
    const isMobileLandscape = isMobile && orientation === 'landscape';
    const btnSize = compactMobile
      ? isMobileLandscape
        ? 'w-8 h-8 rounded-lg'
        : 'w-9 h-9 rounded-lg'
      : 'w-9 h-9 sm:w-10 sm:h-10 rounded-lg';
    const wheelHeight = compactMobile
      ? isMobileLandscape
        ? 'h-8 px-2'
        : 'h-9 px-2.5'
      : 'h-9 sm:h-10 px-2.5';

    return (
      <div
        data-testid="color-hud-dock"
        className={`pointer-events-auto flex items-center border border-white/15 max-w-full overflow-x-auto no-scrollbar ${
          compactMobile
            ? isMobileLandscape
              ? 'bg-[#0D111C]/92 shadow-xl gap-1.5 px-2 py-1.5 rounded-xl'
              : 'bg-[#0D111C]/92 shadow-xl gap-1.5 px-2.5 py-1.5 rounded-xl'
            : 'bg-[#0D111C]/88 backdrop-blur-md shadow-2xl ring-1 ring-white/10 gap-1.5 px-2.5 py-2 rounded-xl'
        }`}
      >
        {hud.palette.map((colorId, idx) => {
          const def = COLOR_MAP[colorId];
          const isSelected = hud.activeColor === colorId;
          return (
            <button
              key={colorId}
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onSelectColor(colorId);
              }}
              aria-label={`Switch to ${def.name} (Key ${idx + 1})`}
              title={`${def.name} [${idx + 1}]`}
              className={`relative ${btnSize} flex flex-col items-center justify-center transition-transform cursor-pointer shrink-0 select-none ${
                isSelected
                  ? 'scale-105 ring-2 ring-white shadow-lg'
                  : 'opacity-90 hover:opacity-100 active:scale-95'
              }`}
              style={{ backgroundColor: def.hex }}
            >
              <span
                className="font-mono-num text-[11px] font-bold leading-none"
                style={{ color: def.darkText ? '#0B0D14' : '#FFFFFF' }}
              >
                {idx + 1}
              </span>
            </button>
          );
        })}

        <div
          className={`w-px bg-white/18 mx-0.5 shrink-0 ${compactMobile && isMobileLandscape ? 'h-5' : 'h-6'}`}
          aria-hidden="true"
        />

        <button
          type="button"
          tabIndex={-1}
          data-testid="color-wheel-trigger"
          onClick={(e) => {
            e.currentTarget.blur();
            onOpenWheel();
          }}
          aria-label="Open full 16-Color Wheel"
          title={`${t.colorWheel} (Tab)`}
          className={`${wheelHeight} rounded-lg bg-white/10 hover:bg-white/18 active:bg-white/25 text-white flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap select-none`}
        >
          <WheelIcon size={compactMobile && isMobileLandscape ? 16 : 18} />
          <span className={compactMobile ? 'inline font-mono-num text-xs' : 'hidden sm:inline'}>16</span>
        </button>

        {!showTouchControls && !isMobile && (
          <>
            <div className="w-px h-6 bg-white/15 mx-0.5 shrink-0" aria-hidden="true" />

            {/* Color Blast Ability Button + Live Cooldown Indicator (Desktop) */}
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onTriggerBlast();
              }}
              disabled={!blastReady}
              aria-label={`${t.colorBlast} (Key X) — ${blastReady ? t.blastReady : `${hud.blastCooldownSec.toFixed(1)}s`}`}
              title={`${t.colorBlast} [X]`}
              className={`relative overflow-hidden h-9 sm:h-10 px-2.5 rounded-lg border flex items-center gap-1.5 text-xs font-semibold transition-all shrink-0 whitespace-nowrap ${
                blastReady
                  ? 'bg-white/12 hover:bg-white/20 border-white/35 text-white cursor-pointer'
                  : 'bg-white/5 border-white/12 text-slate-400 cursor-not-allowed'
              }`}
            >
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-0 h-[3px] transition-[width] duration-75"
                style={{
                  width: `${blastFillPct}%`,
                  backgroundColor: blastBoltHex,
                }}
              />
              <BlastIcon color={blastReady ? blastBoltHex : '#64748B'} size={16} />
              <span className="hidden sm:inline">{t.colorBlast}</span>
              <span className="font-mono-num text-[11px] px-1 py-0.5 rounded bg-black/35 text-slate-200 leading-none">
                {blastReady ? 'X' : `${hud.blastCooldownSec.toFixed(1)}s`}
              </span>
            </button>
          </>
        )}
      </div>
    );
  };

  // Reusable Ergonomic Mobile Touch Controls (Default layout OR player's saved Custom layout)
  const renderTouchControls = () => {
    const isLandscape = isMobile && orientation === 'landscape';
    const arrowBtnClass = isLandscape
      ? 'w-14 h-14 text-lg rounded-xl'
      : 'w-[58px] h-[58px] min-[400px]:w-16 min-[400px]:h-16 text-xl rounded-xl';
    const blastBtnClass = isLandscape
      ? 'w-14 h-14 rounded-2xl text-[10px]'
      : 'w-[60px] h-[60px] min-[400px]:w-16 min-[400px]:h-16 rounded-2xl text-[11px]';
    const jumpBtnClass = isLandscape
      ? 'w-[60px] h-[60px] rounded-2xl text-xs'
      : 'w-16 h-16 min-[400px]:w-[68px] min-[400px]:h-[68px] rounded-2xl text-sm';

    const customRects = customControlsLayout.customized
      ? resolveMobileControlRects(customControlsLayout.buttons, viewportSize.w, viewportSize.h)
      : null;

    const getCustomPosStyle = (id: MobileControlButtonId): React.CSSProperties | undefined => {
      if (!customRects) return undefined;
      const r = customRects[id];
      return {
        position: 'fixed',
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.w}px`,
        height: `${r.h}px`,
      };
    };

    const leftButton = (
      <button
        type="button"
        tabIndex={-1}
        data-testid="mobile-left-btn"
        aria-label="Move Left"
        aria-pressed={activeBtns.left}
        draggable={false}
        onContextMenu={preventContextMenu}
        onPointerDown={(e) => handleControlPointerDown('left', e)}
        onPointerUp={handleControlPointerEnd}
        onPointerCancel={handleControlPointerEnd}
        onPointerLeave={handleControlPointerLeave}
        onLostPointerCapture={handleControlPointerEnd}
        onTouchStart={(e) => handleControlTouchStart('left', e)}
        onTouchEnd={handleControlTouchEnd}
        onTouchCancel={handleControlTouchCancel}
        style={getCustomPosStyle('left')}
        className={`${arrowBtnClass} pointer-events-auto border text-white font-bold flex items-center justify-center transition-transform select-none touch-none shadow-lg ${
          activeBtns.left
            ? 'bg-white/25 border-white/60 scale-95'
            : 'bg-[#0D111C]/88 border-white/24'
        }`}
      >
        ←
      </button>
    );

    const rightButton = (
      <button
        type="button"
        tabIndex={-1}
        data-testid="mobile-right-btn"
        aria-label="Move Right"
        aria-pressed={activeBtns.right}
        draggable={false}
        onContextMenu={preventContextMenu}
        onPointerDown={(e) => handleControlPointerDown('right', e)}
        onPointerUp={handleControlPointerEnd}
        onPointerCancel={handleControlPointerEnd}
        onPointerLeave={handleControlPointerLeave}
        onLostPointerCapture={handleControlPointerEnd}
        onTouchStart={(e) => handleControlTouchStart('right', e)}
        onTouchEnd={handleControlTouchEnd}
        onTouchCancel={handleControlTouchCancel}
        style={getCustomPosStyle('right')}
        className={`${arrowBtnClass} pointer-events-auto border text-white font-bold flex items-center justify-center transition-transform select-none touch-none shadow-lg ${
          activeBtns.right
            ? 'bg-white/25 border-white/60 scale-95'
            : 'bg-[#0D111C]/88 border-white/24'
        }`}
      >
        →
      </button>
    );

    const blastStyle: React.CSSProperties = {
      ...(getCustomPosStyle('blast') ?? {}),
      ...(blastReady ? { borderColor: blastBoltHex } : {}),
    };

    const blastButton = (
      <button
        type="button"
        tabIndex={-1}
        data-testid="mobile-blast-btn"
        aria-label={t.colorBlast}
        aria-pressed={activeBtns.blast}
        draggable={false}
        onContextMenu={preventContextMenu}
        onPointerDown={(e) => handleControlPointerDown('blast', e)}
        onPointerUp={handleControlPointerEnd}
        onPointerCancel={handleControlPointerEnd}
        onPointerLeave={handleControlPointerLeave}
        onLostPointerCapture={handleControlPointerEnd}
        onTouchStart={(e) => handleControlTouchStart('blast', e)}
        onTouchEnd={handleControlTouchEnd}
        onTouchCancel={handleControlTouchCancel}
        disabled={!blastReady}
        className={`relative overflow-hidden ${blastBtnClass} pointer-events-auto border-2 font-display font-bold flex flex-col items-center justify-center gap-0.5 select-none touch-none shadow-lg transition-transform ${
          blastReady
            ? activeBtns.blast
              ? 'bg-[#0D111C]/92 text-white scale-95'
              : 'bg-[#0D111C]/92 text-white active:scale-95'
            : 'bg-[#0D111C]/72 text-slate-400 border-white/18'
        }`}
        style={Object.keys(blastStyle).length > 0 ? blastStyle : undefined}
      >
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-1 transition-[width] duration-75"
          style={{
            width: `${blastFillPct}%`,
            backgroundColor: blastBoltHex,
          }}
        />
        <BlastIcon color={blastReady ? blastBoltHex : '#64748B'} size={isLandscape ? 16 : 18} />
        <span className="leading-none">
          {blastReady ? 'BLAST' : `${hud.blastCooldownSec.toFixed(1)}s`}
        </span>
      </button>
    );

    const jumpButton = (
      <button
        type="button"
        tabIndex={-1}
        data-testid="mobile-jump-btn"
        aria-label="Jump"
        aria-pressed={activeBtns.jump}
        draggable={false}
        onContextMenu={preventContextMenu}
        onPointerDown={(e) => handleControlPointerDown('jump', e)}
        onPointerUp={handleControlPointerEnd}
        onPointerCancel={handleControlPointerEnd}
        onPointerLeave={handleControlPointerLeave}
        onLostPointerCapture={handleControlPointerEnd}
        onTouchStart={(e) => handleControlTouchStart('jump', e)}
        onTouchEnd={handleControlTouchEnd}
        onTouchCancel={handleControlTouchCancel}
        style={getCustomPosStyle('jump')}
        className={`${jumpBtnClass} pointer-events-auto bg-[#F8FAFC]/94 border-2 border-white text-[#0B0D14] font-display font-bold flex items-center justify-center select-none touch-none shadow-lg transition-transform ${
          activeBtns.jump ? 'scale-95 bg-white' : ''
        }`}
      >
        JUMP
      </button>
    );

    // Custom saved layout: every control positioned independently at player's exact saved coordinates
    if (customControlsLayout.customized) {
      return (
        <div
          data-testid="mobile-touch-controls"
          data-layout-mode="custom"
          className="fixed inset-0 pointer-events-none select-none z-20"
        >
          {leftButton}
          {rightButton}
          {blastButton}
          {jumpButton}
        </div>
      );
    }

    // Exact original default bottom row layout (pixel-identical)
    return (
      <div
        data-testid="mobile-touch-controls"
        data-layout-mode="default"
        className="flex items-end justify-between gap-2 w-full pointer-events-none select-none"
      >
        {/* Left / Right Mobile Hold-to-Move Directional Buttons (exact existing styling preserved) */}
        <div
          data-testid="mobile-move-pad"
          onContextMenu={preventContextMenu}
          className="flex items-center gap-3 pointer-events-auto touch-none select-none p-1 -m-1"
          role="group"
          aria-label="Movement controls"
        >
          {leftButton}
          {rightButton}
        </div>

        {/* Right Action Cluster: Dedicated Mobile Color Blast + Jump with ergonomic spacing */}
        <div className="flex items-end gap-3.5 pointer-events-auto touch-none select-none">
          {blastButton}
          {jumpButton}
        </div>
      </div>
    );
  };

  // =========================================================================
  // MOBILE HUD LAYOUT (Portrait & Landscape — top HUD clear of character!)
  // =========================================================================
  if (isMobile) {
    const isLandscape = orientation === 'landscape';

    return (
      <div
        data-testid="game-hud"
        data-hud-mode={isLandscape ? 'mobile-landscape' : 'mobile-portrait'}
        data-active-color={hud.activeColor}
        className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between safe-hud-padding"
      >
        {/* TOP PERIMETER: Compact Status + Preserved Quick Color Dock + Utility Buttons */}
        <div className={`flex flex-col ${isLandscape ? 'gap-1' : 'gap-2'}`}>
          <div className="flex items-center justify-between gap-2 min-w-0">
            {/* Top-Left Compact Status Cluster */}
            <div className="flex flex-col gap-0.5 min-w-0 shrink">
              <div className="flex items-center gap-1.5 text-white hud-text-shadow min-w-0">
                <span className="font-mono-num text-xs font-semibold text-slate-200 shrink-0">
                  W{hud.worldId}·L{hud.levelId}
                </span>
                <span className="font-display font-bold text-sm tracking-tight truncate max-w-[118px] min-[420px]:max-w-[165px]">
                  {hud.levelName}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono-num text-slate-200 hud-text-shadow">
                <span className="inline-flex items-center gap-1 shrink-0">
                  <CrystalIcon color="#06B6D4" size={13} />
                  <span>
                    {hud.crystalsCollected}/{hud.crystalsTotal}
                  </span>
                </span>
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span className="shrink-0">{formatTime(hud.elapsedSeconds)}</span>
                {hud.doubleJumpUnlocked && (
                  <>
                    <span aria-hidden="true" className="text-slate-400">·</span>
                    <span className="text-amber-300 font-sans text-[11px] font-medium shrink-0">2×</span>
                  </>
                )}
              </div>
            </div>

            {/* Mobile Landscape: Place the exact preserved Quick Color Dock ([1][2][3] | ⭕ 16) cleanly in TOP-CENTER */}
            {isLandscape && (
              <div className="flex items-center justify-center min-w-0 max-w-[54vw]">
                {renderColorDock(true)}
              </div>
            )}

            {/* Top-Right Active Color + Compact Utility Buttons */}
            <div className="flex items-center gap-1.5 pointer-events-auto shrink-0">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenWheel();
                }}
                aria-label={`Active color: ${activeName}. Open 16-Color Wheel`}
                className="flex items-center gap-1.5 h-8 px-2 rounded-lg bg-[#0D111C]/90 border border-white/18 text-white active:border-white/40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span
                  className="w-3 h-3 rounded-sm border border-white/50 shrink-0"
                  style={{ backgroundColor: activeHex }}
                />
                <span
                  className={
                    isLandscape
                      ? 'hidden min-[740px]:inline font-display font-semibold text-xs'
                      : 'hidden min-[380px]:inline font-display font-semibold text-xs'
                  }
                >
                  {activeName}
                </span>
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleMute();
                }}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                title="Mute (M)"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#0D111C]/90 border border-white/18 text-slate-100 active:bg-[#171E31] transition-colors cursor-pointer shrink-0"
              >
                <SoundIcon muted={muted} size={15} />
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onRestart();
                }}
                aria-label="Restart level"
                title="Restart (R)"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#0D111C]/90 border border-white/18 text-slate-100 active:bg-[#171E31] transition-colors cursor-pointer shrink-0"
              >
                <RestartIcon size={15} />
              </button>

              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onPause();
                }}
                aria-label="Pause game"
                title="Pause (Esc)"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#0D111C]/90 border border-white/18 text-slate-100 active:bg-[#171E31] transition-colors cursor-pointer shrink-0"
              >
                <PauseIcon size={15} />
              </button>
            </div>
          </div>

          {/* Mobile Portrait: Centered Quick Color Dock ([1][2][3] | ⭕ 16) in upper sky safe zone, completely above gameplay */}
          {!isLandscape && (
            <div className="flex items-center justify-center w-full">
              {renderColorDock(true)}
            </div>
          )}
        </div>

        {/* Transient Checkpoint Toast (non-blocking) */}
        {checkpointBanner && (
          <div className="self-center px-3.5 py-1 rounded-lg bg-[#0D111C]/92 border border-amber-400/50 text-amber-200 font-display text-xs font-semibold shadow-lg">
            {t.checkpointReached}
          </div>
        )}

        {/* BOTTOM PERIMETER: Ergonomic Touch Controls Only (resting over extended obsidian bedrock) */}
        {showTouchControls ? (
          <div className="w-full">{renderTouchControls()}</div>
        ) : (
          <div />
        )}
      </div>
    );
  }

  // =========================================================================
  // DESKTOP HUD LAYOUT (100% Preserved Unchanged!)
  // =========================================================================
  return (
    <div
      data-testid="game-hud"
      data-hud-mode="desktop"
      data-active-color={hud.activeColor}
      className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-5"
    >
      {/* Top Perimeter Bar: Left World/Level/Stats — Right Active Color & Utility Icon Buttons */}
      <div className="flex items-start justify-between gap-3">
        {/* Top-Left Compact Status Cluster */}
        <div className="flex flex-col gap-1 max-w-[55vw] sm:max-w-md">
          <div className="flex items-center gap-2.5 text-white hud-text-shadow">
            <span className="font-mono-num text-sm sm:text-base font-semibold text-slate-200">
              W{hud.worldId}·L{hud.levelId}
            </span>
            <span className="font-display font-bold text-base sm:text-xl tracking-tight truncate">
              {hud.levelName}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs sm:text-sm font-mono-num text-slate-200 hud-text-shadow">
            <span className="inline-flex items-center gap-1">
              <CrystalIcon color="#06B6D4" size={15} />
              <span>
                {hud.crystalsCollected}/{hud.crystalsTotal}
              </span>
            </span>
            <span aria-hidden="true" className="text-slate-400">·</span>
            <span>{formatTime(hud.elapsedSeconds)}</span>
            {hud.doubleJumpUnlocked && (
              <>
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span className="text-amber-300 font-sans text-xs font-medium">2× Jump</span>
              </>
            )}
          </div>

          {/* Subtle non-blocking objective / tutorial line */}
          <p className="hidden sm:block text-xs text-slate-200/90 hud-text-shadow truncate">
            {hud.hint ?? hud.objective}
          </p>
        </div>

        {/* Top-Right Active Color Readout + Utility Buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenWheel();
            }}
            aria-label={`Active color: ${activeName}. Open 16-Color Wheel`}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0D111C]/88 backdrop-blur-md border border-white/20 ring-1 ring-white/8 shadow-lg text-white hover:border-white/40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span
              className="w-3.5 h-3.5 rounded-sm border border-white/50 shrink-0"
              style={{ backgroundColor: activeHex }}
            />
            <span className="font-display font-semibold text-xs sm:text-sm">
              {activeName}
            </span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            title="Mute (M)"
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg bg-[#0D111C]/88 backdrop-blur-md border border-white/20 ring-1 ring-white/8 shadow-lg text-slate-100 hover:bg-[#171E31] transition-colors cursor-pointer shrink-0"
          >
            <SoundIcon muted={muted} size={17} />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            aria-label="Restart level"
            title="Restart (R)"
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg bg-[#0D111C]/88 backdrop-blur-md border border-white/20 ring-1 ring-white/8 shadow-lg text-slate-100 hover:bg-[#171E31] transition-colors cursor-pointer shrink-0"
          >
            <RestartIcon size={17} />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pause game"
            title="Pause (Esc)"
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg bg-[#0D111C]/88 backdrop-blur-md border border-white/20 ring-1 ring-white/8 shadow-lg text-slate-100 hover:bg-[#171E31] transition-colors cursor-pointer shrink-0"
          >
            <PauseIcon size={17} />
          </button>
        </div>
      </div>

      {/* Transient Checkpoint Toast (non-blocking) */}
      {checkpointBanner && (
        <div className="self-center px-4 py-1.5 rounded-lg bg-[#0D111C]/92 border border-amber-400/50 text-amber-200 font-display text-sm font-semibold shadow-lg">
          {t.checkpointReached}
        </div>
      )}

      {/* Bottom Perimeter: Quick Palette Strip + Optional Forced Touch Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-center">{renderColorDock(false)}</div>
        {showTouchControls && renderTouchControls()}
      </div>
    </div>
  );
}
