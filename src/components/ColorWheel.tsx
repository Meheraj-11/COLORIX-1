import React, { useState } from 'react';
import { COLOR_MAP, COLOR_PALETTE, VOID_COLOR, type ActiveColor, type ColorId } from '../game/colors';

interface ColorWheelProps {
  open: boolean;
  activeColor: ActiveColor;
  levelPalette: ColorId[];
  onSelect: (color: ActiveColor) => void;
  onClose: () => void;
  titleLabel: string;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function createWedgePath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  const p1 = polarToCartesian(cx, cy, rOuter, endDeg);
  const p2 = polarToCartesian(cx, cy, rOuter, startDeg);
  const p3 = polarToCartesian(cx, cy, rInner, startDeg);
  const p4 = polarToCartesian(cx, cy, rInner, endDeg);
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 0 0 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 0 1 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export function ColorWheel({
  open,
  activeColor,
  levelPalette,
  onSelect,
  onClose,
  titleLabel,
}: ColorWheelProps) {
  const [hovered, setHovered] = useState<ActiveColor | null>(null);

  if (!open) return null;

  const previewColor = hovered ?? activeColor;
  const previewDef = previewColor === 'void' ? null : COLOR_MAP[previewColor];
  const previewName = previewDef ? previewDef.name : VOID_COLOR.name;
  const previewHex = previewDef ? previewDef.hex : VOID_COLOR.hex;

  const size = 328;
  const cx = size / 2;
  const cy = size / 2;
  const stepDeg = 360 / 16;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#06080E]/65 pointer-events-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={titleLabel}
    >
      <div
        className="relative flex flex-col items-center gap-3 p-5 rounded-2xl bg-[#0D111C]/96 border border-white/15 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full px-1">
          <span className="font-display text-sm font-semibold tracking-wide text-slate-200">
            {titleLabel}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close color wheel"
            className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white rounded-md bg-white/8 hover:bg-white/15 transition-colors cursor-pointer"
          >
            Esc / Tab
          </button>
        </div>

        <div className="relative" style={{ width: size, height: size }}>
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="w-full h-full select-none"
            aria-label="16-Color Radial Selector"
          >
            {/* Outer dark obsidian bezel */}
            <circle cx={cx} cy={cy} r={154} fill="#090C14" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />

            {COLOR_PALETTE.map((c, idx) => {
              const startDeg = idx * stepDeg + 1;
              const endDeg = (idx + 1) * stepDeg - 1;
              const isSelected = activeColor === c.id;
              const isHovered = hovered === c.id;
              const inLevel = levelPalette.includes(c.id);
              const rOuter = isSelected || isHovered ? 148 : inLevel ? 142 : 134;
              const rInner = 64;
              const path = createWedgePath(cx, cy, rInner, rOuter, startDeg, endDeg);
              const labelPos = polarToCartesian(cx, cy, 108, idx * stepDeg + stepDeg * 0.5);
              const keyIdx = levelPalette.indexOf(c.id);

              return (
                <g
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select color ${c.name}`}
                  className="cursor-pointer outline-none"
                  onMouseEnter={() => setHovered(c.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => {
                    onSelect(c.id);
                    onClose();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(c.id);
                      onClose();
                    }
                  }}
                >
                  <path
                    d={path}
                    fill={c.hex}
                    fillOpacity={inLevel || isSelected || isHovered ? 1 : 0.72}
                    stroke={isSelected ? '#FFFFFF' : '#090C14'}
                    strokeWidth={isSelected ? 3 : 1.5}
                  />
                  {/* Level quick-key index dot or number */}
                  {keyIdx >= 0 && keyIdx < 8 && (
                    <text
                      x={labelPos.x}
                      y={labelPos.y + 4}
                      textAnchor="middle"
                      fill={c.darkText ? '#0B0D14' : '#FFFFFF'}
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="700"
                      fontSize="12"
                      pointerEvents="none"
                    >
                      {keyIdx + 1}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Center Neutral Twilight Reset Hub */}
            <g
              role="button"
              tabIndex={0}
              aria-label="Reset to Twilight neutral background"
              className="cursor-pointer outline-none"
              onMouseEnter={() => setHovered('void')}
              onMouseLeave={() => setHovered(null)}
              onClick={() => {
                onSelect('void');
                onClose();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect('void');
                  onClose();
                }
              }}
            >
              <circle
                cx={cx}
                cy={cy}
                r={56}
                fill="#0D111C"
                stroke={previewHex}
                strokeWidth="3.5"
              />
              <circle cx={cx} cy={cy - 14} r={11} fill={previewHex} stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" />
              <text
                x={cx}
                y={cy + 11}
                textAnchor="middle"
                fill="#F8FAFC"
                fontFamily="Outfit, sans-serif"
                fontWeight="700"
                fontSize="13"
                pointerEvents="none"
              >
                {previewName}
              </text>
              <text
                x={cx}
                y={cy + 27}
                textAnchor="middle"
                fill="#94A3B8"
                fontFamily="JetBrains Mono, monospace"
                fontSize="10"
                pointerEvents="none"
              >
                {previewHex}
              </text>
            </g>
          </svg>
        </div>

        {/* Accessible 16-color text grid below wheel for keyboard/screen-reader & rapid selection */}
        <div className="grid grid-cols-4 gap-1.5 w-full max-w-[332px]">
          {COLOR_PALETTE.map((c) => {
            const active = activeColor === c.id;
            const inLevel = levelPalette.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelect(c.id);
                  onClose();
                }}
                onMouseEnter={() => setHovered(c.id)}
                onMouseLeave={() => setHovered(null)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-transform cursor-pointer whitespace-nowrap truncate ${
                  active
                    ? 'bg-white/18 text-white ring-1 ring-white'
                    : inLevel
                      ? 'bg-white/8 text-slate-100 hover:bg-white/14'
                      : 'bg-white/4 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0 border border-black/40"
                  style={{ backgroundColor: c.hex }}
                />
                <span className="truncate">{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
