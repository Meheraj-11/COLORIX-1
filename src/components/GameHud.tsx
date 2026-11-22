import React, { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR_MAP, VOID_COLOR, type ActiveColor } from '../game/colors';
import type { Translations } from '../game/i18n';
import { resolveDirectionalPadInput, type ViewportOrientation } from '../game/mobileLayout';
import type { HudSnapshot } from '../game/types';
import { BlastIcon, CrystalIcon, PauseIcon, RestartIcon, SoundIcon, WheelIcon } from './Icons';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  t: Translations;
  isMobile: boolean;
  orientation: ViewportOrientation;
  showTouchControls: boolean;
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

  // Multi-touch pointer tracking to guarantee zero stuck inputs & zero simultaneous Left+Right presses
  const movePadRef = useRef<HTMLDivElement | null>(null);
  const movePointerIdRef = useRef<number | null>(null);
  const jumpPointerIdRef = useRef<number | null>(null);
  const [pressedDir, setPressedDir] = useState<'left' | 'right' | null>(null);
  const [jumpPressed, setJumpPressed] = useState(false);

  const releaseAllTouchInputs = useCallback(() => {
    movePointerIdRef.current = null;
    jumpPointerIdRef.current = null;
    setPressedDir(null);
    setJumpPressed(false);
    onTouchLeft(false);
    onTouchRight(false);
    onTouchJumpUp();
  }, [onTouchLeft, onTouchRight, onTouchJumpUp]);

  // Clear touch inputs whenever touch controls hide, window loses focus, or tab backgrounds
  useEffect(() => {
    if (!showTouchControls) {
      releaseAllTouchInputs();
      return;
    }
    const handleClear = () => releaseAllTouchInputs();
    const handleVis = () => {
      if (document.hidden) releaseAllTouchInputs();
    };
    window.addEventListener('blur', handleClear);
    document.addEventListener('visibilitychange', handleVis);
    return () => {
      window.removeEventListener('blur', handleClear);
      document.removeEventListener('visibilitychange', handleVis);
      releaseAllTouchInputs();
    };
  }, [showTouchControls, releaseAllTouchInputs]);

  const applyMoveFromClientX = useCallback(
    (clientX: number) => {
      const pad = movePadRef.current;
      if (!pad) return;
      const rect = pad.getBoundingClientRect();
      const { left, right } = resolveDirectionalPadInput(clientX - rect.left, rect.width);
      onTouchLeft(left);
      onTouchRight(right);
      setPressedDir(left ? 'left' : right ? 'right' : null);
    },
    [onTouchLeft, onTouchRight],
  );

  const handleMovePadDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (movePointerIdRef.current !== null && movePointerIdRef.current !== e.pointerId) return;
      movePointerIdRef.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic pointer events without active pointerId can safely skip capture
      }
      applyMoveFromClientX(e.clientX);
    },
    [applyMoveFromClientX],
  );

  const handleMovePadMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (movePointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      applyMoveFromClientX(e.clientX);
    },
    [applyMoveFromClientX],
  );

  const handleMovePadUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (movePointerIdRef.current !== e.pointerId) return;
      movePointerIdRef.current = null;
      setPressedDir(null);
      onTouchLeft(false);
      onTouchRight(false);
    },
    [onTouchLeft, onTouchRight],
  );

  const handleJumpDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (jumpPointerIdRef.current !== null && jumpPointerIdRef.current !== e.pointerId) return;
      jumpPointerIdRef.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic event capture errors
      }
      setJumpPressed(true);
      onTouchJumpDown();
    },
    [onTouchJumpDown],
  );

  const handleJumpUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (jumpPointerIdRef.current !== e.pointerId) return;
      jumpPointerIdRef.current = null;
      setJumpPressed(false);
      onTouchJumpUp();
    },
    [onTouchJumpUp],
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

  // Reusable Ergonomic Mobile Touch Controls Row (unified directional pad + independent BLAST/JUMP)
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

    return (
      <div
        data-testid="mobile-touch-controls"
        className="flex items-end justify-between gap-2 w-full pointer-events-none select-none"
      >
        {/* Left / Right Unified Multi-Touch Directional Pad (prevents simultaneous L+R & stuck inputs) */}
        <div
          ref={movePadRef}
          data-testid="mobile-move-pad"
          onPointerDown={handleMovePadDown}
          onPointerMove={handleMovePadMove}
          onPointerUp={handleMovePadUp}
          onPointerCancel={handleMovePadUp}
          onLostPointerCapture={handleMovePadUp}
          className="flex items-center gap-3 pointer-events-auto touch-none select-none p-1 -m-1"
          role="group"
          aria-label="Movement controls"
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label="Move Left"
            aria-pressed={pressedDir === 'left'}
            className={`${arrowBtnClass} border text-white font-bold flex items-center justify-center transition-transform select-none touch-none shadow-lg ${
              pressedDir === 'left'
                ? 'bg-white/25 border-white/60 scale-95'
                : 'bg-[#0D111C]/88 border-white/24'
            }`}
          >
            ←
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Move Right"
            aria-pressed={pressedDir === 'right'}
            className={`${arrowBtnClass} border text-white font-bold flex items-center justify-center transition-transform select-none touch-none shadow-lg ${
              pressedDir === 'right'
                ? 'bg-white/25 border-white/60 scale-95'
                : 'bg-[#0D111C]/88 border-white/24'
            }`}
          >
            →
          </button>
        </div>

        {/* Right Action Cluster: Dedicated Mobile Color Blast + Jump with ergonomic spacing */}
        <div className="flex items-end gap-3.5 pointer-events-auto touch-none select-none">
          <button
            type="button"
            tabIndex={-1}
            data-testid="mobile-blast-btn"
            aria-label={t.colorBlast}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTriggerBlast();
            }}
            disabled={!blastReady}
            className={`relative overflow-hidden ${blastBtnClass} border-2 font-display font-bold flex flex-col items-center justify-center gap-0.5 select-none touch-none shadow-lg transition-transform ${
              blastReady
                ? 'bg-[#0D111C]/92 text-white active:scale-95'
                : 'bg-[#0D111C]/72 text-slate-400 border-white/18'
            }`}
            style={blastReady ? { borderColor: blastBoltHex } : undefined}
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

          <button
            type="button"
            tabIndex={-1}
            data-testid="mobile-jump-btn"
            aria-label="Jump"
            aria-pressed={jumpPressed}
            onPointerDown={handleJumpDown}
            onPointerUp={handleJumpUp}
            onPointerCancel={handleJumpUp}
            onLostPointerCapture={handleJumpUp}
            className={`${jumpBtnClass} bg-[#F8FAFC]/94 border-2 border-white text-[#0B0D14] font-display font-bold flex items-center justify-center select-none touch-none shadow-lg transition-transform ${
              jumpPressed ? 'scale-95 bg-white' : ''
            }`}
          >
            JUMP
          </button>
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
