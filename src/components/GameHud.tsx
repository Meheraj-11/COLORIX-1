import React from 'react';
import { COLOR_MAP, VOID_COLOR, type ActiveColor } from '../game/colors';
import type { Translations } from '../game/i18n';
import type { HudSnapshot } from '../game/types';
import { BlastIcon, CrystalIcon, PauseIcon, RestartIcon, SoundIcon, WheelIcon } from './Icons';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  t: Translations;
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

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
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
          {/* Active Color Indicator (Color + Name — never hue-only!) */}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenWheel();
            }}
            aria-label={`Active color: ${activeName}. Open 16-Color Wheel`}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0D111C]/90 border border-white/18 text-white hover:border-white/40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
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
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg bg-[#0D111C]/90 border border-white/18 text-slate-100 hover:bg-[#171E31] transition-colors cursor-pointer shrink-0"
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
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg bg-[#0D111C]/90 border border-white/18 text-slate-100 hover:bg-[#171E31] transition-colors cursor-pointer shrink-0"
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
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg bg-[#0D111C]/90 border border-white/18 text-slate-100 hover:bg-[#171E31] transition-colors cursor-pointer shrink-0"
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

      {/* Bottom Perimeter: Quick Palette Strip + Mobile Touch Controls */}
      <div className="flex flex-col gap-3">
        {/* Compact Quick Color Dock (center) */}
        <div className="flex items-center justify-center">
          <div className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#0D111C]/92 border border-white/15 shadow-xl max-w-full overflow-x-auto">
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
                  className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex flex-col items-center justify-center transition-transform cursor-pointer shrink-0 ${
                    isSelected
                      ? 'scale-108 ring-2 ring-white shadow-lg'
                      : 'opacity-85 hover:opacity-100 hover:scale-105'
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

            <div className="w-px h-6 bg-white/15 mx-0.5 shrink-0" aria-hidden="true" />

            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenWheel();
              }}
              aria-label="Open full 16-Color Wheel"
              title={`${t.colorWheel} (Tab)`}
              className="h-9 sm:h-10 px-2.5 rounded-lg bg-white/10 hover:bg-white/18 text-white flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              <WheelIcon size={18} />
              <span className="hidden sm:inline">16</span>
            </button>

            {!showTouchControls && (
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
                  {/* Cooldown fill sweep along bottom */}
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
        </div>

        {/* Mobile / Touch Controls Row */}
        {showTouchControls && (
          <div className="flex items-end justify-between px-1 pb-1 pointer-events-none">
            {/* Left / Right Pad */}
            <div className="flex items-center gap-3 pointer-events-auto">
              <button
                type="button"
                aria-label="Move Left"
                onPointerDown={(e) => {
                  e.preventDefault();
                  onTouchLeft(true);
                }}
                onPointerUp={() => onTouchLeft(false)}
                onPointerLeave={() => onTouchLeft(false)}
                onPointerCancel={() => onTouchLeft(false)}
                className="w-14 h-14 rounded-xl bg-[#0D111C]/88 border border-white/22 text-white text-xl font-bold flex items-center justify-center active:bg-white/20 select-none"
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Move Right"
                onPointerDown={(e) => {
                  e.preventDefault();
                  onTouchRight(true);
                }}
                onPointerUp={() => onTouchRight(false)}
                onPointerLeave={() => onTouchRight(false)}
                onPointerCancel={() => onTouchRight(false)}
                className="w-14 h-14 rounded-xl bg-[#0D111C]/88 border border-white/22 text-white text-xl font-bold flex items-center justify-center active:bg-white/20 select-none"
              >
                →
              </button>
            </div>

            {/* Right Action Cluster: Dedicated Mobile Color Blast + Jump */}
            <div className="flex items-center gap-3 pointer-events-auto">
              <button
                type="button"
                aria-label={t.colorBlast}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onTriggerBlast();
                }}
                disabled={!blastReady}
                className={`relative overflow-hidden w-16 h-16 rounded-2xl border-2 font-display font-bold text-xs flex flex-col items-center justify-center gap-0.5 select-none shadow-lg transition-transform ${
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
                <BlastIcon color={blastReady ? blastBoltHex : '#64748B'} size={18} />
                <span className="leading-none">
                  {blastReady ? 'BLAST' : `${hud.blastCooldownSec.toFixed(1)}s`}
                </span>
              </button>

              <button
                type="button"
                aria-label="Jump"
                onPointerDown={(e) => {
                  e.preventDefault();
                  onTouchJumpDown();
                }}
                onPointerUp={onTouchJumpUp}
                onPointerLeave={onTouchJumpUp}
                onPointerCancel={onTouchJumpUp}
                className="w-16 h-16 rounded-2xl bg-[#F8FAFC]/92 border-2 border-white text-[#0B0D14] font-display font-bold text-sm flex items-center justify-center active:scale-95 select-none shadow-lg"
              >
                JUMP
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
