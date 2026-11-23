import React from 'react';
import type { Translations } from '../game/i18n';
import type { ControlScheme, SaveData } from '../game/types';
import { computeCompletionPercent, countTotalCollectedCrystals, TOTAL_LEVELS } from '../game/save';
import { ColorixLogo, CrystalIcon } from './Icons';

interface TitleScreenProps {
  save: SaveData;
  t: Translations;
  controlScheme: ControlScheme;
  musicWarning?: string | null;
  retryingMusic?: boolean;
  onRetryMusic?: () => void;
  onDismissMusicWarning?: () => void;
  onPlayNew: () => void;
  onContinue: () => void;
  onOpenWorldMap: () => void;
  onOpenSettings: () => void;
  onOpenHowToPlay: () => void;
  onOpenCredits: () => void;
}

export function TitleScreen({
  save,
  t,
  controlScheme,
  musicWarning,
  retryingMusic,
  onRetryMusic,
  onDismissMusicWarning,
  onPlayNew,
  onContinue,
  onOpenWorldMap,
  onOpenSettings,
  onOpenHowToPlay,
  onOpenCredits,
}: TitleScreenProps) {
  const hasProgress = save.completedLevels.length > 0 || save.unlockedLevel > 1;
  const pct = computeCompletionPercent(save);
  const crystals = countTotalCollectedCrystals(save);

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-5 sm:p-10 md:p-14 [@media(max-height:480px)]:py-3 [@media(max-height:480px)]:px-6 pointer-events-none overflow-hidden">
      {/* Subtle dark atmospheric left vignette scrim so title lockup has effortless legibility over live canvas */}
      <div
        className="fixed inset-y-0 left-0 w-full md:w-[58%] pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(8,10,18,0.88) 0%, rgba(8,10,18,0.62) 60%, rgba(8,10,18,0) 100%)',
        }}
      />

      {/* Top Spacer / Quiet Save Summary + Optional Non-Blocking Audio Warning */}
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
        <div className="text-xs font-medium tracking-wide text-slate-300/90 hud-text-shadow flex items-center gap-3">
          <span>8 Worlds</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-num">{TOTAL_LEVELS} Levels</span>
          {hasProgress && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num text-amber-300">{pct}%</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-mono-num text-cyan-300">
                <CrystalIcon color="#06B6D4" size={14} />
                {crystals}
              </span>
            </>
          )}
        </div>

        {musicWarning && (
          <div
            role="status"
            data-testid="music-warning-banner"
            className="pointer-events-auto max-w-sm rounded-xl bg-[#101628]/95 border border-amber-400/45 px-3.5 py-2.5 shadow-xl flex items-start gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-display font-semibold text-amber-200">
                Background Music Unavailable
              </div>
              <p className="text-[11px] text-slate-300 leading-snug mt-0.5">
                {musicWarning}
              </p>
              <div className="mt-2 flex items-center gap-2">
                {onRetryMusic && (
                  <button
                    type="button"
                    disabled={retryingMusic}
                    onClick={onRetryMusic}
                    className="px-2.5 py-1 rounded-md bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/45 text-amber-100 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {retryingMusic ? 'Retrying…' : 'Retry Audio'}
                  </button>
                )}
                {onDismissMusicWarning && (
                  <button
                    type="button"
                    onClick={onDismissMusicWarning}
                    className="px-2 py-1 rounded-md text-slate-400 hover:text-white text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Left-Third Focal Anchor over Calm Negative Space */}
      <div className="relative z-10 max-w-md flex flex-col items-start gap-6 [@media(max-height:480px)]:gap-3 my-auto">
        <div className="flex flex-col gap-1.5 [@media(max-height:480px)]:gap-0.5">
          <div className="[@media(max-height:480px)]:scale-[0.82] [@media(max-height:480px)]:origin-left">
            <ColorixLogo />
          </div>
          <p className="font-display text-base sm:text-lg [@media(max-height:480px)]:text-sm font-medium tracking-wide text-slate-200/95 pl-1 hud-text-shadow">
            {t.subtitle}
          </p>
        </div>

        {/* Primary Action Stack */}
        <div className="flex flex-col gap-2.5 [@media(max-height:480px)]:gap-1.5 w-full max-w-[270px] pointer-events-auto">
          {hasProgress ? (
            <button
              type="button"
              data-start="true"
              onClick={onContinue}
              className="w-full py-3.5 [@media(max-height:480px)]:py-2.5 px-6 rounded-lg bg-[#F8FAFC] text-[#0B0D14] font-display font-bold text-base tracking-wide hover:bg-white active:scale-[0.99] transition-transform shadow-lg cursor-pointer whitespace-nowrap text-left flex items-center justify-between focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              <span>{t.continueGame}</span>
              <span className="font-mono-num text-xs font-semibold text-slate-600">
                L{save.lastPlayedLevel}
              </span>
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onPlayNew}
              className="w-full py-3.5 [@media(max-height:480px)]:py-2.5 px-6 rounded-lg bg-[#F8FAFC] text-[#0B0D14] font-display font-bold text-base tracking-wide hover:bg-white active:scale-[0.99] transition-transform shadow-lg cursor-pointer whitespace-nowrap text-left flex items-center justify-between focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              <span>{t.playGame}</span>
              <span className="text-xs font-semibold text-slate-600">Enter</span>
            </button>
          )}

          {hasProgress && (
            <button
              type="button"
              onClick={onPlayNew}
              className="w-full py-2.5 [@media(max-height:480px)]:py-2 px-5 rounded-lg bg-[#111524]/92 border border-white/15 text-slate-100 font-display font-semibold text-sm hover:bg-[#192036] hover:border-white/30 transition-colors cursor-pointer whitespace-nowrap text-left focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              {t.playGame} (Level 1)
            </button>
          )}

          <button
            type="button"
            onClick={onOpenWorldMap}
            className="w-full py-2.5 [@media(max-height:480px)]:py-2 px-5 rounded-lg bg-[#111524]/92 border border-white/15 text-slate-100 font-display font-semibold text-sm hover:bg-[#192036] hover:border-white/30 transition-colors cursor-pointer whitespace-nowrap text-left flex items-center justify-between focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <span>{t.levelSelect}</span>
            <span className="font-mono-num text-xs text-slate-400">
              {save.completedLevels.length}/{TOTAL_LEVELS}
            </span>
          </button>

          <div className="flex items-center gap-4 pt-2 [@media(max-height:480px)]:pt-1 pl-1">
            <button
              type="button"
              onClick={onOpenSettings}
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400 rounded"
            >
              {t.settings}
            </button>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onOpenHowToPlay}
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400 rounded"
            >
              {t.howToPlay}
            </button>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onOpenCredits}
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400 rounded"
            >
              {t.credits}
            </button>
          </div>
        </div>
      </div>

      {/* Single Flat Control-Hint Line in Bottom Safe Margin */}
      <div className="relative z-10 flex items-center justify-between">
        <p className="text-xs text-slate-300/85 font-medium tracking-wide hud-text-shadow">
          {controlScheme === 'wasd' ? t.controlHintWasd : t.controlHintArrows}
        </p>
      </div>
    </div>
  );
}
