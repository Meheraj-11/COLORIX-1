export type ColorId =
  | 'crimson'
  | 'scarlet'
  | 'orange'
  | 'amber'
  | 'gold'
  | 'yellow'
  | 'lime'
  | 'emerald'
  | 'green'
  | 'teal'
  | 'cyan'
  | 'sky_blue'
  | 'azure'
  | 'indigo'
  | 'violet'
  | 'magenta';

export type ActiveColor = ColorId | 'void';

export interface ColorDef {
  id: ColorId;
  index: number;
  name: string;
  hex: string;
  num: number;
  bgHex: string;
  bgNum: number;
  rgb: [number, number, number];
  bgRgb: [number, number, number];
  pitchHz: number;
  glyph: string;
  darkText: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexToNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

const RAW_COLORS: Array<{
  id: ColorId;
  name: string;
  hex: string;
  bgHex: string;
  pitchHz: number;
  glyph: string;
  darkText: boolean;
}> = [
  { id: 'crimson',  name: 'Crimson',  hex: '#C81E3A', bgHex: '#6E1324', pitchHz: 261.63, glyph: '◆', darkText: false },
  { id: 'scarlet',  name: 'Scarlet',  hex: '#E53935', bgHex: '#7D1F1E', pitchHz: 277.18, glyph: '▲', darkText: false },
  { id: 'orange',   name: 'Orange',   hex: '#F26B1D', bgHex: '#7E3911', pitchHz: 293.66, glyph: '●', darkText: false },
  { id: 'amber',    name: 'Amber',    hex: '#F59E0B', bgHex: '#7C5109', pitchHz: 311.13, glyph: '■', darkText: true  },
  { id: 'gold',     name: 'Gold',     hex: '#EAB308', bgHex: '#755B07', pitchHz: 329.63, glyph: '★', darkText: true  },
  { id: 'yellow',   name: 'Yellow',   hex: '#D4C420', bgHex: '#696212', pitchHz: 349.23, glyph: '✦', darkText: true  },
  { id: 'lime',     name: 'Lime',     hex: '#84CC16', bgHex: '#43680E', pitchHz: 369.99, glyph: '◈', darkText: true  },
  { id: 'emerald',  name: 'Emerald',  hex: '#10B981', bgHex: '#0B5E44', pitchHz: 392.00, glyph: '⬟', darkText: false },
  { id: 'green',    name: 'Green',    hex: '#16A34A', bgHex: '#0E5429', pitchHz: 415.30, glyph: '⬢', darkText: false },
  { id: 'teal',     name: 'Teal',     hex: '#0D9488', bgHex: '#094E48', pitchHz: 440.00, glyph: '▼', darkText: false },
  { id: 'cyan',     name: 'Cyan',     hex: '#06B6D4', bgHex: '#075A6A', pitchHz: 466.16, glyph: '◇', darkText: true  },
  { id: 'sky_blue', name: 'Sky Blue', hex: '#0EA5E9', bgHex: '#0A5275', pitchHz: 493.88, glyph: '○', darkText: false },
  { id: 'azure',    name: 'Azure',    hex: '#2563EB', bgHex: '#153478', pitchHz: 523.25, glyph: '□', darkText: false },
  { id: 'indigo',   name: 'Indigo',   hex: '#4F46E5', bgHex: '#2A2575', pitchHz: 554.37, glyph: '△', darkText: false },
  { id: 'violet',   name: 'Violet',   hex: '#7C3AED', bgHex: '#401F7A', pitchHz: 587.33, glyph: '❖', darkText: false },
  { id: 'magenta',  name: 'Magenta',  hex: '#D946EF', bgHex: '#6B2178', pitchHz: 622.25, glyph: '✧', darkText: false },
];

export const COLOR_PALETTE: readonly ColorDef[] = RAW_COLORS.map((c, index) => ({
  ...c,
  index,
  num: hexToNum(c.hex),
  bgNum: hexToNum(c.bgHex),
  rgb: hexToRgb(c.hex),
  bgRgb: hexToRgb(c.bgHex),
}));

export const COLOR_MAP: Record<ColorId, ColorDef> = COLOR_PALETTE.reduce(
  (acc, c) => {
    acc[c.id] = c;
    return acc;
  },
  {} as Record<ColorId, ColorDef>,
);

export const VOID_COLOR = {
  id: 'void' as const,
  name: 'Twilight',
  hex: '#161B2B',
  num: 0x161b2b,
  rgb: [22, 27, 43] as [number, number, number],
};

export function getColorDef(id: ColorId): ColorDef {
  return COLOR_MAP[id];
}

export function getBackgroundRgb(activeColor: ActiveColor, worldBaseRgb: [number, number, number]): [number, number, number] {
  if (activeColor === 'void') {
    return worldBaseRgb;
  }
  const c = COLOR_MAP[activeColor];
  // Blend the vivid color with deep atmospheric depth so the matching object blends cleanly while obsidian terrain stays crisp
  return [
    Math.round(c.rgb[0] * 0.68 + c.bgRgb[0] * 0.32),
    Math.round(c.rgb[1] * 0.68 + c.bgRgb[1] * 0.32),
    Math.round(c.rgb[2] * 0.68 + c.bgRgb[2] * 0.32),
  ];
}

export function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * clamped),
    Math.round(a[1] + (b[1] - a[1]) * clamped),
    Math.round(a[2] + (b[2] - a[2]) * clamped),
  ];
}

export function rgbToHexNum(rgb: [number, number, number]): number {
  return ((rgb[0] & 255) << 16) | ((rgb[1] & 255) << 8) | (rgb[2] & 255);
}

export function rgbToCss(rgb: [number, number, number], alpha = 1): string {
  if (alpha >= 1) {
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}
