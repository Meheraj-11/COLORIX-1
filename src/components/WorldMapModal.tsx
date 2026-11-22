import React, { useState } from 'react';
import type { Translations } from '../game/i18n';
import { getLevelsForWorld, TOTAL_LEVEL_COUNT, WORLDS } from '../game/levels';
import { computeCompletionPercent, countTotalCollectedCrystals } from '../game/save';
import type { SaveData, WorldId } from '../game/types';
import { CheckIcon, CrystalIcon, LockIcon } from './Icons';

interface WorldMapModalProps {
  save: SaveData;
  t: Translations;
  onSelectLevel: (levelId: number) => void;
  onBack: () => void;
}

export function WorldMapModal({ save, t, onSelectLevel, onBack }: WorldMapModalProps) {
  const initialWorld = Math.min(8, Math.max(1, Math.ceil(save.lastPlayedLevel / 13))) as WorldId;
  const [selectedWorld, setSelectedWorld] = useState<WorldId>(initialWorld);

  const worldDef = WORLDS.find((w) => w.id === selectedWorld) ?? WORLDS[0];
  const worldLevels = getLevelsForWorld(selectedWorld);
  const completedSet = new Set(save.completedLevels);
  const overallPct = computeCompletionPercent(save);
  const totalCrystals = countTotalCollectedCrystals(save);

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col bg-[#0A0D16]/96 text-slate-100 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t.worldMap}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-4 px-5 sm:px-8 py-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="px-3.5 py-2 rounded-lg bg-white/8 hover:bg-white/15 text-sm font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            ← {t.mainMenu}
          </button>
          <h1 className="font-display text-lg sm:text-2xl font-bold tracking-tight text-white truncate">
            {t.worldMap}
          </h1>
        </div>

        <div className="flex items-center gap-4 text-xs sm:text-sm text-slate-300 shrink-0">
          <div className="flex items-center gap-1.5 font-mono-num">
            <CrystalIcon color="#06B6D4" size={16} />
            <span>{totalCrystals}</span>
          </div>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <div className="font-mono-num">
            {save.completedLevels.length}/{TOTAL_LEVEL_COUNT} ({overallPct}%)
          </div>
        </div>
      </div>

      {/* Main Split: 8 Worlds Sidebar + 13 Level Slots Grid */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* 8 Worlds Selector */}
        <nav
          aria-label="Worlds"
          className="lg:w-[320px] xl:w-[350px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 p-4 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto colorix-scroll"
        >
          {WORLDS.map((w) => {
            const [startL, endL] = w.levelRange;
            const isWorldUnlocked = save.unlockedLevel >= startL;
            const doneCount = save.completedLevels.filter((id) => id >= startL && id <= endL).length;
            const active = selectedWorld === w.id;

            return (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedWorld(w.id)}
                className={`text-left p-3.5 rounded-xl transition-colors shrink-0 w-[210px] lg:w-full cursor-pointer border ${
                  active
                    ? 'bg-white/12 border-white/30 text-white'
                    : 'bg-white/4 border-white/6 text-slate-300 hover:bg-white/8'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="flex items-center gap-2 font-mono-num text-xs text-slate-400">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: w.accentHex }}
                    />
                    World {w.id}
                  </span>
                  {!isWorldUnlocked ? (
                    <span className="text-slate-500 flex items-center gap-1 text-xs">
                      <LockIcon size={12} />
                    </span>
                  ) : (
                    <span className="font-mono-num text-xs text-slate-300">
                      {doneCount}/13
                    </span>
                  )}
                </div>
                <div className="font-display font-semibold text-sm truncate text-white">
                  {w.name}
                </div>
                <div className="text-xs text-slate-400 truncate mt-0.5">
                  {w.featuredMechanic}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Active World Details & 13 Playable Level Slots */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-8 colorix-scroll">
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                  <span>World {worldDef.id} of 8</span>
                  <span aria-hidden="true">·</span>
                  <span>{worldDef.featuredMechanic}</span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                  {worldDef.name}
                </h2>
                <p className="text-sm text-slate-300 mt-1">{worldDef.subtitle}</p>
              </div>
              <div className="font-mono-num text-xs text-slate-400 shrink-0">
                Levels {worldDef.levelRange[0]}–{worldDef.levelRange[1]}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {worldLevels.map((lvl) => {
                const isUnlocked = lvl.id <= save.unlockedLevel;
                const isDone = completedSet.has(lvl.id);
                const collected = (save.collectedCrystals[String(lvl.id)] ?? []).length;
                const best = save.bestTimes[String(lvl.id)];

                return (
                  <button
                    key={lvl.id}
                    type="button"
                    disabled={!isUnlocked}
                    onClick={() => onSelectLevel(lvl.id)}
                    aria-label={`Level ${lvl.id}: ${lvl.name}${isUnlocked ? '' : ' (Locked)'}`}
                    className={`group text-left p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                      isUnlocked
                        ? 'bg-[#121726] border-white/12 hover:border-white/35 hover:bg-[#171E33] cursor-pointer'
                        : 'bg-[#0D101B] border-white/5 opacity-55 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono-num text-xs text-slate-400">
                          {worldDef.id}-{lvl.indexInWorld} · Level {lvl.id}
                        </div>
                        <div className="font-display font-semibold text-base text-white mt-0.5 leading-snug">
                          {lvl.name}
                        </div>
                      </div>
                      <div className="shrink-0 mt-0.5">
                        {!isUnlocked ? (
                          <span className="text-slate-500">
                            <LockIcon size={16} />
                          </span>
                        ) : isDone ? (
                          <span className="text-emerald-400">
                            <CheckIcon size={17} />
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/8">
                      <span className="inline-flex items-center gap-1 font-mono-num">
                        <CrystalIcon
                          color={collected >= lvl.crystals.length && lvl.crystals.length > 0 ? '#FACC15' : '#06B6D4'}
                          size={13}
                        />
                        {collected}/{lvl.crystals.length}
                      </span>
                      <span className="font-mono-num">
                        {best !== undefined ? `${best.toFixed(1)}s` : isUnlocked ? 'Ready' : t.locked}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
