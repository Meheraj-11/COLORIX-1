import React, { useState } from 'react';
import type { Translations } from '../game/i18n';
import type {
  ControlScheme,
  GameSettings,
  GraphicsQuality,
  LanguageCode,
  LevelCompleteStats,
  TouchMode,
} from '../game/types';
import { CrystalIcon } from './Icons';

interface PauseModalProps {
  t: Translations;
  levelLabel: string;
  onResume: () => void;
  onRestart: () => void;
  onOpenSettings: () => void;
  onMainMenu: () => void;
}

export function PauseModal({
  t,
  levelLabel,
  onResume,
  onRestart,
  onOpenSettings,
  onMainMenu,
}: PauseModalProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#06080E]/75 p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t.paused}
    >
      <div className="w-full max-w-sm rounded-2xl bg-[#0E1320] border border-white/15 p-6 shadow-2xl flex flex-col gap-5">
        <div>
          <p className="text-xs font-mono-num text-slate-400">{levelLabel}</p>
          <h2 className="font-display text-2xl font-bold text-white mt-0.5">{t.paused}</h2>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-3 px-4 rounded-lg bg-[#F8FAFC] text-[#0B0D14] font-display font-bold text-sm hover:bg-white transition-colors cursor-pointer"
          >
            {t.resume}
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 px-4 rounded-lg bg-white/8 hover:bg-white/14 text-slate-100 font-medium text-sm transition-colors cursor-pointer"
          >
            {t.restartLevel}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full py-2.5 px-4 rounded-lg bg-white/8 hover:bg-white/14 text-slate-100 font-medium text-sm transition-colors cursor-pointer"
          >
            {t.settings}
          </button>
          <button
            type="button"
            onClick={onMainMenu}
            className="w-full py-2.5 px-4 rounded-lg bg-transparent border border-white/12 hover:bg-white/8 text-slate-300 font-medium text-sm transition-colors cursor-pointer"
          >
            {t.mainMenu}
          </button>
        </div>
      </div>
    </div>
  );
}

interface LevelCompleteModalProps {
  t: Translations;
  stats: LevelCompleteStats;
  onNextLevel: () => void;
  onReplay: () => void;
  onWorldMap: () => void;
}

export function LevelCompleteModal({
  t,
  stats,
  onNextLevel,
  onReplay,
  onWorldMap,
}: LevelCompleteModalProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#06080E]/78 p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t.levelComplete}
    >
      <div className="w-full max-w-md rounded-2xl bg-[#0E1320] border border-white/18 p-6 sm:p-7 shadow-2xl flex flex-col gap-5">
        <div>
          <p className="text-xs text-slate-400">
            {stats.worldName} · Level {stats.levelId}
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mt-0.5">
            {t.levelComplete}
          </h2>
          <p className="text-sm text-slate-300 mt-1">{stats.levelName}</p>
        </div>

        {stats.unlockedDoubleJumpNow && (
          <div className="px-3.5 py-2.5 rounded-lg bg-amber-500/15 border border-amber-400/40 text-amber-200 text-xs font-semibold">
            {t.doubleJumpUnlocked} — Press Jump again midair!
          </div>
        )}

        <div className="grid grid-cols-3 gap-2.5">
          <div className="p-3 rounded-xl bg-white/5 border border-white/8">
            <div className="text-[11px] text-slate-400">{t.crystals}</div>
            <div className="mt-1 flex items-center gap-1.5 font-mono-num text-lg font-bold text-white">
              <CrystalIcon color="#06B6D4" size={16} />
              {stats.crystalsCollected}/{stats.crystalsTotal}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/8">
            <div className="text-[11px] text-slate-400">
              {t.time} {stats.isNewBest ? `· ${t.newRecord}` : ''}
            </div>
            <div className="mt-1 font-mono-num text-lg font-bold text-white">
              {stats.elapsedSeconds.toFixed(1)}s
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/8">
            <div className="text-[11px] text-slate-400">{t.deaths}</div>
            <div className="mt-1 font-mono-num text-lg font-bold text-white">
              {stats.deathsInRun}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {stats.hasNextLevel && (
            <button
              type="button"
              data-start="true"
              onClick={onNextLevel}
              className="w-full py-3 px-4 rounded-lg bg-[#F8FAFC] text-[#0B0D14] font-display font-bold text-sm hover:bg-white transition-colors cursor-pointer"
            >
              {t.nextLevel} →
            </button>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onReplay}
              className="py-2.5 px-4 rounded-lg bg-white/8 hover:bg-white/14 text-slate-100 font-medium text-sm transition-colors cursor-pointer"
            >
              {t.replay}
            </button>
            <button
              type="button"
              onClick={onWorldMap}
              className="py-2.5 px-4 rounded-lg bg-white/8 hover:bg-white/14 text-slate-100 font-medium text-sm transition-colors cursor-pointer"
            >
              {t.levelSelect}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SettingsModalProps {
  t: Translations;
  settings: GameSettings;
  musicWarning?: string | null;
  retryingMusic?: boolean;
  onRetryMusic?: () => void;
  onUpdate: (patch: Partial<GameSettings>) => void;
  onResetProgress: () => void;
  onClose: () => void;
}

export function SettingsModal({
  t,
  settings,
  musicWarning,
  retryingMusic,
  onRetryMusic,
  onUpdate,
  onResetProgress,
  onClose,
}: SettingsModalProps) {
  const [confirmReset, setConfirmReset] = useState(false);

  const toggleFullscreen = async (wantFull: boolean) => {
    try {
      if (wantFull && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else if (!wantFull && document.fullscreenElement) {
        await document.exitFullscreen?.();
      }
    } catch {
      // Safe fallback in restricted iframes
    }
    onUpdate({ fullscreen: wantFull });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#06080E]/80 p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t.settings}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto colorix-scroll rounded-2xl bg-[#0E1320] border border-white/15 p-6 shadow-2xl flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-white">{t.settings}</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-xs font-medium text-slate-200 cursor-pointer"
          >
            {t.close}
          </button>
        </div>

        {/* Audio & Music Controls */}
        <div className="flex flex-col gap-3.5">
          {/* Background Music ON/OFF */}
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-200">{t.backgroundMusic}</span>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-white/6" role="group" aria-label={t.backgroundMusic}>
              <button
                type="button"
                aria-pressed={settings.musicEnabled}
                onClick={() => onUpdate({ musicEnabled: true, muted: false })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  settings.musicEnabled ? 'bg-white text-[#0B0D14]' : 'text-slate-300 hover:text-white'
                }`}
              >
                {t.on}
              </button>
              <button
                type="button"
                aria-pressed={!settings.musicEnabled}
                onClick={() => onUpdate({ musicEnabled: false })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  !settings.musicEnabled ? 'bg-white text-[#0B0D14]' : 'text-slate-300 hover:text-white'
                }`}
              >
                {t.off}
              </button>
            </div>
          </div>

          {musicWarning && (
            <div
              role="status"
              className="rounded-xl bg-amber-500/10 border border-amber-400/35 px-3.5 py-2.5 flex items-center justify-between gap-3"
            >
              <p className="text-xs text-amber-200/95 leading-snug">{musicWarning}</p>
              {onRetryMusic && (
                <button
                  type="button"
                  disabled={retryingMusic}
                  onClick={onRetryMusic}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/45 text-amber-100 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
                >
                  {retryingMusic ? 'Retrying…' : 'Retry Audio'}
                </button>
              )}
            </div>
          )}

          {/* Mute All Audio */}
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-200">{t.muteAll}</span>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-white/6" role="group" aria-label={t.muteAll}>
              <button
                type="button"
                aria-pressed={!settings.muted}
                onClick={() => onUpdate({ muted: false })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  !settings.muted ? 'bg-white text-[#0B0D14]' : 'text-slate-300 hover:text-white'
                }`}
              >
                {t.unmutedLabel}
              </button>
              <button
                type="button"
                aria-pressed={settings.muted}
                onClick={() => onUpdate({ muted: true })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  settings.muted ? 'bg-white text-[#0B0D14]' : 'text-slate-300 hover:text-white'
                }`}
              >
                {t.mutedLabel}
              </button>
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-medium text-slate-300">
              <span>{t.musicVolume}</span>
              <span className="font-mono-num">{Math.round(settings.musicVolume * 100)}%</span>
            </div>
            <input
              type="range"
              aria-label={t.musicVolume}
              min={0}
              max={100}
              value={Math.round(settings.musicVolume * 100)}
              onChange={(e) =>
                onUpdate({
                  musicVolume: Number(e.target.value) / 100,
                  muted: false,
                })
              }
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-medium text-slate-300">
              <span>{t.masterVolume}</span>
              <span className="font-mono-num">{Math.round(settings.masterVolume * 100)}%</span>
            </div>
            <input
              type="range"
              aria-label={t.masterVolume}
              min={0}
              max={100}
              value={Math.round(settings.masterVolume * 100)}
              onChange={(e) => onUpdate({ masterVolume: Number(e.target.value) / 100, muted: false })}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs font-medium text-slate-300">
              <span>{t.sfxVolume}</span>
              <span className="font-mono-num">{Math.round(settings.sfxVolume * 100)}%</span>
            </div>
            <input
              type="range"
              aria-label={t.sfxVolume}
              min={0}
              max={100}
              value={Math.round(settings.sfxVolume * 100)}
              onChange={(e) => onUpdate({ sfxVolume: Number(e.target.value) / 100 })}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </label>
        </div>

        {/* Graphics Quality */}
        <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/10">
          <span className="text-sm text-slate-200">{t.graphicsQuality}</span>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white/6">
            {(['low', 'medium', 'high'] as GraphicsQuality[]).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onUpdate({ graphicsQuality: q })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  settings.graphicsQuality === q ? 'bg-white text-[#0B0D14]' : 'text-slate-300 hover:text-white'
                }`}
              >
                {t[q]}
              </button>
            ))}
          </div>
        </div>

        {/* Screen Mode */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-200">{t.screenMode}</span>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white/6">
            <button
              type="button"
              onClick={() => toggleFullscreen(false)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                !settings.fullscreen ? 'bg-white text-[#0B0D14]' : 'text-slate-300 hover:text-white'
              }`}
            >
              {t.windowed}
            </button>
            <button
              type="button"
              onClick={() => toggleFullscreen(true)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                settings.fullscreen ? 'bg-white text-[#0B0D14]' : 'text-slate-300 hover:text-white'
              }`}
            >
              {t.fullscreen}
            </button>
          </div>
        </div>

        {/* Control Scheme */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-200">{t.controls}</span>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white/6">
            {(['wasd', 'arrows'] as ControlScheme[]).map((scheme) => (
              <button
                key={scheme}
                type="button"
                onClick={() => onUpdate({ controlScheme: scheme })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  settings.controlScheme === scheme ? 'bg-white text-[#0B0D14]' : 'text-slate-300 hover:text-white'
                }`}
              >
                {scheme === 'wasd' ? 'A / D + Space' : '← / → + Space'}
              </button>
            ))}
          </div>
        </div>

        {/* Touch Controls */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-200">{t.touchControls}</span>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white/6">
            {(['auto', 'on', 'off'] as TouchMode[]).map((tm) => (
              <button
                key={tm}
                type="button"
                onClick={() => onUpdate({ touchMode: tm })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  settings.touchMode === tm ? 'bg-white text-[#0B0D14]' : 'text-slate-300 hover:text-white'
                }`}
              >
                {t[tm]}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-200">{t.language}</span>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white/6">
            {([
              { id: 'en', label: 'English' },
              { id: 'es', label: 'Español' },
              { id: 'fr', label: 'Français' },
            ] as Array<{ id: LanguageCode; label: string }>).map((lang) => (
              <button
                key={lang.id}
                type="button"
                onClick={() => onUpdate({ language: lang.id })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  settings.language === lang.id ? 'bg-white text-[#0B0D14]' : 'text-slate-300 hover:text-white'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reset Progress with explicit in-modal confirmation */}
        <div className="pt-4 border-t border-white/10">
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="w-full py-2.5 px-4 rounded-lg bg-rose-500/12 border border-rose-500/35 text-rose-200 hover:bg-rose-500/20 text-xs font-semibold transition-colors cursor-pointer"
            >
              {t.resetProgress}
            </button>
          ) : (
            <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/40 flex flex-col gap-3">
              <div className="text-sm font-semibold text-rose-100">{t.resetConfirmTitle}</div>
              <p className="text-xs text-rose-200/85">{t.resetConfirmBody}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onResetProgress();
                    setConfirmReset(false);
                  }}
                  className="flex-1 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
                >
                  {t.confirmReset}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="flex-1 py-2 px-3 rounded-lg bg-white/10 hover:bg-white/16 text-slate-200 text-xs font-medium cursor-pointer"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function HowToPlayModal({ t, onClose }: { t: Translations; onClose: () => void }) {
  const rules = [
    {
      title: '16-Color Switching',
      desc: 'Select a color with keys 1–8, Q/E, or the 16-Color Radial Wheel (Tab / C). Objects matching the sky blend away and lose collision; all other colors remain solid.',
    },
    {
      title: 'Color Bridges & Hidden Paths',
      desc: 'Color Bridges work in reverse—they materialize into solid glass when you match their color. Faintly veined Hidden Walls dissolve to reveal secret crystals.',
    },
    {
      title: 'Prism Gates, Locks & Light Beams',
      desc: 'Approach matching Prism Gates, enter Color Lock sequences in order, ride Magnetic Monoliths by matching their outer ring color, and clear shutters so Light Beams strike Receptors.',
    },
    {
      title: 'Monster Combat: Stomp & Color Blast',
      desc: 'Defeat patrolling monsters by stomping directly onto their heads from above for a clean bounce, or press X (or the mobile BLAST button) while attuned to the monster’s glowing gem color to shatter them with a Color Blast. Side or underside contact is instantly fatal.',
    },
    {
      title: 'Crystals & Double Jump',
      desc: 'Collect 5 Color Crystals across any levels to unlock the midair Prism Double Jump permanently.',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#06080E]/80 p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t.howToPlay}
    >
      <div className="w-full max-w-lg max-h-[88vh] overflow-y-auto colorix-scroll rounded-2xl bg-[#0E1320] border border-white/15 p-6 shadow-2xl flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-white">{t.howToPlay}</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-xs font-medium text-slate-200 cursor-pointer"
          >
            {t.close}
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {rules.map((r) => (
            <div key={r.title} className="pb-3.5 border-b border-white/8 last:border-b-0 last:pb-0">
              <h3 className="font-display text-sm font-bold text-white">{r.title}</h3>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CreditsModal({ t, onClose }: { t: Translations; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#06080E]/80 p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t.credits}
    >
      <div className="w-full max-w-md rounded-2xl bg-[#0E1320] border border-white/15 p-6 shadow-2xl flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-white">{t.credits}</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-xs font-medium text-slate-200 cursor-pointer"
          >
            {t.close}
          </button>
        </div>

        <div className="flex flex-col gap-3 text-sm text-slate-300">
          <p className="text-white font-display font-semibold text-base">
            COLORIX – A World Beyond Colors
          </p>
          <p className="leading-relaxed">
            An original 16-color puzzle-platformer built with Phaser 3, procedural multi-layer 2D atmospheric art, custom axis-separated platformer physics, and Web Audio synthesis.
          </p>
          <div className="pt-3 border-t border-white/10 text-xs text-slate-400 flex flex-col gap-1.5">
            <div>World & Level Design: 8 Worlds · 104 Levels</div>
            <div>Engine: Phaser 3 Canvas Renderer & Custom Physics Solver</div>
            <div>Audio: Procedural Modal Web Audio Synthesizer</div>
          </div>
          <div className="pt-3 border-t border-white/10 font-display text-sm font-semibold text-white">
            Developed by Meheraj
          </div>
        </div>
      </div>
    </div>
  );
}
