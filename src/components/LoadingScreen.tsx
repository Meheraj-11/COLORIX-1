import React, { useEffect, useRef } from 'react';

interface LoadingScreenProps {
  /** Smoothly interpolated visual loading percentage 0..100 */
  progress: number;
  /** Non-null when an essential game asset failed to load */
  errorMessage: string | null;
  /** Non-null when optional background music could not load (never blocks entering game) */
  audioWarning?: string | null;
  /** True while fading out seamlessly into the Main Menu */
  fadingOut: boolean;
  /** Called when the player clicks Retry after an essential asset failure */
  onRetry: () => void;
}

interface FloatingCubeSpec {
  /** Normalized viewport X (0..1) */
  nx: number;
  /** Normalized viewport Y (0..1) */
  ny: number;
  /** Base radius relative to min(width, height) */
  sizeRatio: number;
  /** Top, left, right face hex colors + outer glow rgba */
  topHex: string;
  leftHex: string;
  rightHex: string;
  glowRgba: string;
  /** Rotation & bobbing motion parameters */
  baseAngle: number;
  rotSpeed: number;
  bobAmp: number;
  bobSpeed: number;
  phase: number;
  /** Hide some inner-edge cubes on ultra-narrow portrait screens so center stays uncluttered */
  desktopOnly?: boolean;
}

interface StarParticle {
  nx: number;
  ny: number;
  r: number;
  alpha: number;
  speedY: number;
  twinkleSpeed: number;
  phase: number;
  color: string;
}

// Carefully placed around the perimeter to mirror the attached COLORIX loading screen reference
const FLOATING_CUBES: FloatingCubeSpec[] = [
  // Top-left cluster
  {
    nx: 0.06,
    ny: 0.02,
    sizeRatio: 0.056,
    topHex: '#A855F7',
    leftHex: '#7E22CE',
    rightHex: '#581C87',
    glowRgba: 'rgba(168, 85, 247, 0.55)',
    baseAngle: -0.35,
    rotSpeed: 0.14,
    bobAmp: 8,
    bobSpeed: 0.65,
    phase: 0.2,
  },
  {
    nx: 0.175,
    ny: 0.17,
    sizeRatio: 0.042,
    topHex: '#FF4B5C',
    leftHex: '#E11D48',
    rightHex: '#9F1239',
    glowRgba: 'rgba(244, 63, 94, 0.62)',
    baseAngle: 0.42,
    rotSpeed: -0.18,
    bobAmp: 10,
    bobSpeed: 0.82,
    phase: 1.1,
  },
  {
    nx: 0.28,
    ny: 0.09,
    sizeRatio: 0.022,
    topHex: '#38BDF8',
    leftHex: '#0284C7',
    rightHex: '#0369A1',
    glowRgba: 'rgba(56, 189, 248, 0.65)',
    baseAngle: 0.2,
    rotSpeed: 0.25,
    bobAmp: 7,
    bobSpeed: 0.95,
    phase: 2.3,
    desktopOnly: true,
  },
  // Mid-left cluster
  {
    nx: 0.095,
    ny: 0.31,
    sizeRatio: 0.046,
    topHex: '#38BDF8',
    leftHex: '#0EA5E9',
    rightHex: '#0369A1',
    glowRgba: 'rgba(14, 165, 233, 0.65)',
    baseAngle: -0.22,
    rotSpeed: 0.16,
    bobAmp: 11,
    bobSpeed: 0.72,
    phase: 0.8,
  },
  {
    nx: 0.005,
    ny: 0.46,
    sizeRatio: 0.036,
    topHex: '#FDE047',
    leftHex: '#F59E0B',
    rightHex: '#B45309',
    glowRgba: 'rgba(250, 204, 21, 0.58)',
    baseAngle: 0.35,
    rotSpeed: -0.15,
    bobAmp: 8,
    bobSpeed: 0.78,
    phase: 3.1,
    desktopOnly: true,
  },
  {
    nx: 0.13,
    ny: 0.49,
    sizeRatio: 0.021,
    topHex: '#4ADE80',
    leftHex: '#16A34A',
    rightHex: '#15803D',
    glowRgba: 'rgba(34, 197, 94, 0.65)',
    baseAngle: -0.18,
    rotSpeed: 0.24,
    bobAmp: 7,
    bobSpeed: 0.9,
    phase: 4.0,
    desktopOnly: true,
  },
  // Bottom-left cluster
  {
    nx: 0.155,
    ny: 0.68,
    sizeRatio: 0.049,
    topHex: '#FF4B5C',
    leftHex: '#DC2626',
    rightHex: '#991B1B',
    glowRgba: 'rgba(239, 68, 68, 0.65)',
    baseAngle: -0.32,
    rotSpeed: 0.14,
    bobAmp: 9,
    bobSpeed: 0.74,
    phase: 2.0,
  },
  {
    nx: 0.042,
    ny: 0.77,
    sizeRatio: 0.051,
    topHex: '#22D3EE',
    leftHex: '#0EA5E9',
    rightHex: '#0284C7',
    glowRgba: 'rgba(34, 211, 238, 0.7)',
    baseAngle: 0.18,
    rotSpeed: -0.16,
    bobAmp: 8,
    bobSpeed: 0.68,
    phase: 5.2,
  },
  {
    nx: 0.28,
    ny: 0.78,
    sizeRatio: 0.02,
    topHex: '#E879F9',
    leftHex: '#C026D3',
    rightHex: '#86198F',
    glowRgba: 'rgba(217, 70, 239, 0.65)',
    baseAngle: 0.28,
    rotSpeed: 0.22,
    bobAmp: 6,
    bobSpeed: 0.92,
    phase: 1.5,
  },
  // Top-right cluster
  {
    nx: 0.67,
    ny: 0.08,
    sizeRatio: 0.027,
    topHex: '#FDE047',
    leftHex: '#F59E0B',
    rightHex: '#B45309',
    glowRgba: 'rgba(250, 204, 21, 0.65)',
    baseAngle: 0.34,
    rotSpeed: -0.2,
    bobAmp: 8,
    bobSpeed: 0.85,
    phase: 0.6,
  },
  {
    nx: 0.935,
    ny: 0.185,
    sizeRatio: 0.057,
    topHex: '#4ADE80',
    leftHex: '#22C55E',
    rightHex: '#15803D',
    glowRgba: 'rgba(34, 197, 94, 0.65)',
    baseAngle: -0.45,
    rotSpeed: 0.13,
    bobAmp: 11,
    bobSpeed: 0.66,
    phase: 3.6,
  },
  {
    nx: 0.865,
    ny: 0.275,
    sizeRatio: 0.02,
    topHex: '#A855F7',
    leftHex: '#7C3AED',
    rightHex: '#5B21B6',
    glowRgba: 'rgba(139, 92, 246, 0.62)',
    baseAngle: 0.22,
    rotSpeed: -0.24,
    bobAmp: 6,
    bobSpeed: 1.0,
    phase: 2.9,
    desktopOnly: true,
  },
  // Mid-right cluster
  {
    nx: 0.865,
    ny: 0.445,
    sizeRatio: 0.043,
    topHex: '#FEF08A',
    leftHex: '#FACC15',
    rightHex: '#CA8A04',
    glowRgba: 'rgba(250, 204, 21, 0.65)',
    baseAngle: 0.24,
    rotSpeed: 0.17,
    bobAmp: 10,
    bobSpeed: 0.75,
    phase: 4.5,
  },
  // Bottom-right cluster
  {
    nx: 0.96,
    ny: 0.675,
    sizeRatio: 0.068,
    topHex: '#FB7185',
    leftHex: '#EF4444',
    rightHex: '#991B1B',
    glowRgba: 'rgba(239, 68, 68, 0.68)',
    baseAngle: -0.2,
    rotSpeed: -0.12,
    bobAmp: 9,
    bobSpeed: 0.62,
    phase: 1.8,
  },
  {
    nx: 0.805,
    ny: 0.72,
    sizeRatio: 0.032,
    topHex: '#38BDF8',
    leftHex: '#0284C7',
    rightHex: '#075985',
    glowRgba: 'rgba(56, 189, 248, 0.68)',
    baseAngle: 0.14,
    rotSpeed: 0.19,
    bobAmp: 8,
    bobSpeed: 0.84,
    phase: 0.9,
  },
  {
    nx: 0.665,
    ny: 0.79,
    sizeRatio: 0.025,
    topHex: '#4ADE80',
    leftHex: '#16A34A',
    rightHex: '#166534',
    glowRgba: 'rgba(34, 197, 94, 0.65)',
    baseAngle: -0.25,
    rotSpeed: -0.21,
    bobAmp: 7,
    bobSpeed: 0.88,
    phase: 3.3,
  },
];

function createStarField(count: number): StarParticle[] {
  const colors = ['#FFFFFF', '#67E8F9', '#93C5FD', '#C4B5FD', '#F472B6'];
  const list: StarParticle[] = [];
  for (let i = 0; i < count; i++) {
    // Deterministic seeded distribution so first paint looks lush and balanced
    const s1 = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    const s2 = Math.sin(i * 269.5 + 183.3) * 43758.5453;
    const s3 = Math.sin(i * 419.2 + 71.9) * 43758.5453;
    const r1 = s1 - Math.floor(s1);
    const r2 = s2 - Math.floor(s2);
    const r3 = s3 - Math.floor(s3);
    list.push({
      nx: r1,
      ny: r2 * 0.85,
      r: 0.8 + r3 * 2.1,
      alpha: 0.3 + r3 * 0.65,
      speedY: 0.004 + r3 * 0.011,
      twinkleSpeed: 1.2 + r1 * 2.4,
      phase: r2 * Math.PI * 2,
      color: colors[i % colors.length],
    });
  }
  return list;
}

/**
 * Draws a beveled, luminous 3D isometric cube with glowing rim highlights.
 */
function drawGlowingCube(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  angle: number,
  spec: FloatingCubeSpec,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Soft colored atmospheric glow aura behind the cube
  const aura = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 1.95);
  aura.addColorStop(0, spec.glowRgba);
  aura.addColorStop(0.55, spec.glowRgba.replace(/[\d.]+\)$/, '0.18)'));
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.95, 0, Math.PI * 2);
  ctx.fill();

  // Isometric hexagon vertices
  const dx = radius * 0.866;
  const dy = radius * 0.5;

  const top = { x: 0, y: -radius };
  const topRight = { x: dx, y: -dy };
  const botRight = { x: dx, y: dy };
  const bot = { x: 0, y: radius };
  const botLeft = { x: -dx, y: dy };
  const topLeft = { x: -dx, y: -dy };

  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.2, radius * 0.05);

  // Top face (brightest)
  const topGrad = ctx.createLinearGradient(top.x, top.y, 0, 0);
  topGrad.addColorStop(0, '#FFFFFF');
  topGrad.addColorStop(0.22, spec.topHex);
  topGrad.addColorStop(1, spec.leftHex);
  ctx.fillStyle = topGrad;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(topRight.x, topRight.y);
  ctx.lineTo(0, 0);
  ctx.lineTo(topLeft.x, topLeft.y);
  ctx.closePath();
  ctx.fill();

  // Left face (rich midtone)
  const leftGrad = ctx.createLinearGradient(topLeft.x, topLeft.y, bot.x, bot.y);
  leftGrad.addColorStop(0, spec.leftHex);
  leftGrad.addColorStop(1, spec.rightHex);
  ctx.fillStyle = leftGrad;
  ctx.beginPath();
  ctx.moveTo(topLeft.x, topLeft.y);
  ctx.lineTo(0, 0);
  ctx.lineTo(bot.x, bot.y);
  ctx.lineTo(botLeft.x, botLeft.y);
  ctx.closePath();
  ctx.fill();

  // Right face (deeper shadow with subtle specular edge)
  const rightGrad = ctx.createLinearGradient(0, 0, botRight.x, botRight.y);
  rightGrad.addColorStop(0, spec.leftHex);
  rightGrad.addColorStop(0.45, spec.rightHex);
  rightGrad.addColorStop(1, '#090B16');
  ctx.fillStyle = rightGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(topRight.x, topRight.y);
  ctx.lineTo(botRight.x, botRight.y);
  ctx.lineTo(bot.x, bot.y);
  ctx.closePath();
  ctx.fill();

  // Crisp glossy specular ridges along the front edges
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.moveTo(topLeft.x, topLeft.y);
  ctx.lineTo(0, 0);
  ctx.lineTo(topRight.x, topRight.y);
  ctx.moveTo(0, 0);
  ctx.lineTo(bot.x, bot.y);
  ctx.stroke();

  // Soft outer rim light
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(topRight.x, topRight.y);
  ctx.lineTo(botRight.x, botRight.y);
  ctx.lineTo(bot.x, bot.y);
  ctx.lineTo(botLeft.x, botLeft.y);
  ctx.lineTo(topLeft.x, topLeft.y);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

/**
 * Prominent COLORIX Logo Lockup matching the loading screen reference:
 * Rainbow faceted pentagon emblem with central white crown, dark glossy bezel,
 * cyan-purple neon halo, bold sculpted COLORIX wordmark, and 6 prismatic segments.
 */
function LoadingColorixLogo() {
  return (
    <div className="w-full max-w-[340px] sm:max-w-[500px] md:max-w-[650px] px-2 select-none colorix-logo-neon">
      <svg
        viewBox="0 0 640 164"
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="COLORIX"
      >
        <defs>
          <linearGradient id="clx-bezel-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="50%" stopColor="#818CF8" />
            <stop offset="100%" stopColor="#E879F9" />
          </linearGradient>
          <linearGradient id="clx-word-fill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="68%" stopColor="#F1F5F9" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>
          <linearGradient id="clx-crown-fill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#DCE8FF" />
          </linearGradient>
          <filter id="clx-neon-soft" x="-15%" y="-25%" width="130%" height="150%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Left Rainbow Faceted Pentagon Shield + Crown */}
        <g transform="translate(18, 12)">
          {/* Outer neon rim */}
          <polygon
            points="66,4 128,48 104,124 28,124 4,48"
            fill="#070B18"
            stroke="url(#clx-bezel-stroke)"
            strokeWidth="5.5"
            strokeLinejoin="round"
            filter="url(#clx-neon-soft)"
          />
          {/* Glossy inner dark frame */}
          <polygon
            points="66,11 120,51 99,117 33,117 12,51"
            fill="#0A0E1E"
            stroke="#04060D"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {/* 5 Prismatic Color Facets (Red, Gold, Green, Cyan-Blue, Purple) */}
          <polygon points="66,15 115,52 66,70" fill="#EF233C" />
          <polygon points="66,15 66,70 17,52" fill="#FACC15" />
          <polygon points="17,52 66,70 36,113" fill="#22C55E" />
          <polygon points="115,52 96,113 66,70" fill="#0EA5E9" />
          <polygon points="36,113 96,113 66,70" fill="#9333EA" />

          {/* Subtle facet specular highlights */}
          <polygon points="66,15 92,35 66,45 40,35" fill="#FFFFFF" fillOpacity="0.22" />
          <polygon points="66,70 96,113 66,113" fill="#C084FC" fillOpacity="0.35" />

          {/* Center White Prismatic Crown */}
          <g stroke="#0A0E1E" strokeWidth="3.2" strokeLinejoin="round">
            <path
              d="M44,86 L37,56 L54,67 L66,46 L78,67 L95,56 L88,86 Z"
              fill="url(#clx-crown-fill)"
            />
            <circle cx="37" cy="54" r="3.6" fill="#FFFFFF" />
            <circle cx="66" cy="43" r="4.2" fill="#FFFFFF" />
            <circle cx="95" cy="54" r="3.6" fill="#FFFFFF" />
          </g>
        </g>

        {/* Bold Sculpted COLORIX Wordmark */}
        <g transform="translate(166, 0)" aria-hidden="true">
          {/* Outer neon halo stroke */}
          <text
            x="4"
            y="102"
            fill="none"
            stroke="url(#clx-bezel-stroke)"
            strokeWidth="16"
            strokeLinejoin="round"
            fontFamily="Outfit, system-ui, sans-serif"
            fontWeight="800"
            fontSize="94"
            letterSpacing="6"
            opacity="0.45"
          >
            COLORIX
          </text>
          {/* Crisp dark sculptural outline + pure white face */}
          <text
            x="4"
            y="102"
            fill="url(#clx-word-fill)"
            stroke="#080B16"
            strokeWidth="12"
            strokeLinejoin="round"
            paintOrder="stroke fill"
            fontFamily="Outfit, system-ui, sans-serif"
            fontWeight="800"
            fontSize="94"
            letterSpacing="6"
          >
            COLORIX
          </text>

          {/* 6-Color Prismatic Underline Bar inside dark bezel */}
          <rect
            x="6"
            y="115"
            width="436"
            height="19"
            rx="9.5"
            fill="#070A14"
            stroke="url(#clx-bezel-stroke)"
            strokeWidth="2"
            strokeOpacity="0.55"
          />
          <rect x="13" y="120" width="64" height="9" rx="4.5" fill="#EF233C" />
          <rect x="84" y="120" width="64" height="9" rx="4.5" fill="#FACC15" />
          <rect x="155" y="120" width="64" height="9" rx="4.5" fill="#22C55E" />
          <rect x="226" y="120" width="64" height="9" rx="4.5" fill="#06B6D4" />
          <rect x="297" y="120" width="64" height="9" rx="4.5" fill="#8B5CF6" />
          <rect x="368" y="120" width="67" height="9" rx="4.5" fill="#EC4899" />
        </g>
      </svg>
    </div>
  );
}

export function LoadingScreen({
  progress,
  errorMessage,
  audioWarning,
  fadingOut,
  onRetry,
}: LoadingScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clampedPercent = Math.max(0, Math.min(100, Math.round(progress)));
  const fillWidthPercent = Math.max(0, Math.min(100, progress));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stars = createStarField(78);
    let rafId = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    const lowEnd = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 6) <= 4;
    const maxLoadingDpr = lowEnd ? 1.5 : 2;
    let dpr = Math.min(window.devicePixelRatio || 1, maxLoadingDpr);

    // Offscreen cache for static space sky, cosmic nebulae, glossy floor & vertical color reflections
    const backdropCanvas = document.createElement('canvas');
    const backdropCtx = backdropCanvas.getContext('2d');

    const renderStaticBackdrop = () => {
      if (!backdropCtx) return;
      backdropCanvas.width = Math.max(1, Math.floor(width * dpr));
      backdropCanvas.height = Math.max(1, Math.floor(height * dpr));
      backdropCtx.save();
      backdropCtx.scale(dpr, dpr);

      // 1. Deep futuristic dark cosmic space sky
      const skyGrad = backdropCtx.createLinearGradient(0, 0, width, height);
      skyGrad.addColorStop(0, '#02030A');
      skyGrad.addColorStop(0.42, '#060B22');
      skyGrad.addColorStop(0.76, '#090826');
      skyGrad.addColorStop(1, '#04040F');
      backdropCtx.fillStyle = skyGrad;
      backdropCtx.fillRect(0, 0, width, height);

      // 2. Cosmic nebulae (royal blue diagonal sweep + cyan/purple/magenta horizon clouds)
      const drawNebula = (
        cx: number,
        cy: number,
        r: number,
        cInner: string,
        cMid: string,
      ) => {
        const g = backdropCtx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
        g.addColorStop(0, cInner);
        g.addColorStop(0.45, cMid);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        backdropCtx.fillStyle = g;
        backdropCtx.fillRect(cx - r, cy - r, r * 2, r * 2);
      };

      const maxDim = Math.max(width, height);
      drawNebula(width * 0.5, height * 0.42, maxDim * 0.42, 'rgba(37, 99, 235, 0.36)', 'rgba(59, 130, 246, 0.12)');
      drawNebula(width * 0.84, height * 0.14, maxDim * 0.34, 'rgba(29, 78, 216, 0.38)', 'rgba(56, 189, 248, 0.1)');
      drawNebula(width * 0.14, height * 0.82, maxDim * 0.32, 'rgba(217, 70, 239, 0.36)', 'rgba(124, 58, 237, 0.14)');
      drawNebula(width * 0.88, height * 0.8, maxDim * 0.32, 'rgba(192, 38, 211, 0.38)', 'rgba(99, 102, 241, 0.13)');
      drawNebula(width * 0.5, height * 0.86, maxDim * 0.28, 'rgba(34, 211, 238, 0.38)', 'rgba(59, 130, 246, 0.14)');

      // 3. Glossy Futuristic Reflective Floor Plane (Bottom 13.5%)
      const horizonY = height * 0.865;
      const floorH = height - horizonY;

      const floorGrad = backdropCtx.createLinearGradient(0, horizonY, 0, height);
      floorGrad.addColorStop(0, '#0C1232');
      floorGrad.addColorStop(0.28, '#060818');
      floorGrad.addColorStop(1, '#02030A');
      backdropCtx.fillStyle = floorGrad;
      backdropCtx.fillRect(0, horizonY, width, floorH);

      // Soft vertical colorful reflections on the glossy floor
      const reflections: Array<{ x: number; w: number; color: string }> = [
        { x: 0.05, w: 0.08, color: 'rgba(34, 211, 238, 0.26)' },
        { x: 0.15, w: 0.09, color: 'rgba(236, 72, 153, 0.3)' },
        { x: 0.37, w: 0.08, color: 'rgba(250, 204, 21, 0.18)' },
        { x: 0.5, w: 0.16, color: 'rgba(56, 189, 248, 0.36)' },
        { x: 0.67, w: 0.08, color: 'rgba(34, 197, 94, 0.24)' },
        { x: 0.82, w: 0.09, color: 'rgba(168, 85, 247, 0.3)' },
        { x: 0.94, w: 0.08, color: 'rgba(244, 63, 94, 0.3)' },
      ];
      for (const ref of reflections) {
        const rg = backdropCtx.createRadialGradient(
          width * ref.x,
          horizonY + floorH * 0.25,
          2,
          width * ref.x,
          horizonY + floorH * 0.45,
          width * ref.w,
        );
        rg.addColorStop(0, ref.color);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        backdropCtx.fillStyle = rg;
        backdropCtx.fillRect(0, horizonY, width, floorH);
      }

      // Crisp glowing horizon seam
      const seamGrad = backdropCtx.createLinearGradient(0, horizonY, width, horizonY);
      seamGrad.addColorStop(0, 'rgba(168, 85, 247, 0.38)');
      seamGrad.addColorStop(0.25, 'rgba(56, 189, 248, 0.68)');
      seamGrad.addColorStop(0.5, 'rgba(125, 211, 252, 0.96)');
      seamGrad.addColorStop(0.75, 'rgba(192, 132, 252, 0.68)');
      seamGrad.addColorStop(1, 'rgba(236, 72, 153, 0.38)');
      backdropCtx.fillStyle = seamGrad;
      backdropCtx.fillRect(0, horizonY - 1, width, 2.4);

      backdropCtx.restore();
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, maxLoadingDpr);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      renderStaticBackdrop();
    };
    resize();
    window.addEventListener('resize', resize);

    const startTime = performance.now();

    const drawFrame = (now: number) => {
      const t = (now - startTime) * 0.001;
      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Blit pre-rendered static deep-space & glossy floor backdrop in one fast drawImage call
      ctx.drawImage(backdropCanvas, 0, 0, width, height);

      // 2. Drifting luminous stars & particles
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const px = s.nx * width;
        const py = (((s.ny - t * s.speedY) % 0.86 + 0.86) % 0.86) * height;
        const pulse = 0.55 + 0.45 * Math.sin(t * s.twinkleSpeed + s.phase);
        ctx.globalAlpha = s.alpha * pulse;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(px, py, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 3. Concentric glowing perspective neon rings on the floor (clipped cleanly below horizon)
      const horizonY = height * 0.865;
      const floorH = height - horizonY;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, horizonY, width, floorH);
      ctx.clip();

      const ringY = horizonY + floorH * 0.56;
      const ringSpecs = [
        { rx: width * 0.16, ry: floorH * 0.26, lw: 1.8, alpha: 0.58 },
        { rx: width * 0.3, ry: floorH * 0.48, lw: 2.8, alpha: 0.88 },
        { rx: width * 0.46, ry: floorH * 0.72, lw: 1.5, alpha: 0.42 },
      ];

      for (const rs of ringSpecs) {
        const ringGrad = ctx.createLinearGradient(width * 0.5 - rs.rx, ringY, width * 0.5 + rs.rx, ringY);
        ringGrad.addColorStop(0, '#00F0FF');
        ringGrad.addColorStop(0.35, '#3B82F6');
        ringGrad.addColorStop(0.7, '#A855F7');
        ringGrad.addColorStop(1, '#EC4899');
        ctx.strokeStyle = ringGrad;
        ctx.globalAlpha = rs.alpha * (0.88 + 0.12 * Math.sin(t * 1.4));
        ctx.lineWidth = rs.lw;
        ctx.beginPath();
        ctx.ellipse(width * 0.5, ringY, rs.rx, Math.max(8, rs.ry), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      // 4. Floating Colorful 3D Beveled Cubes
      const isNarrow = width < 640;
      const baseDim = Math.min(width, height);
      for (let i = 0; i < FLOATING_CUBES.length; i++) {
        const c = FLOATING_CUBES[i];
        if (isNarrow && c.desktopOnly) continue;

        const cx = c.nx * width + Math.cos(t * c.bobSpeed * 0.55 + c.phase) * (c.bobAmp * 0.45);
        const cy = c.ny * height + Math.sin(t * c.bobSpeed + c.phase) * c.bobAmp;
        const radius = Math.max(12, baseDim * c.sizeRatio * (isNarrow ? 1.1 : 1));
        const angle = c.baseAngle + Math.sin(t * c.rotSpeed + c.phase) * 0.24;

        drawGlowingCube(ctx, cx, cy, radius, angle, c);
      }

      ctx.restore();
      rafId = window.requestAnimationFrame(drawFrame);
    };

    rafId = window.requestAnimationFrame(drawFrame);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div
      data-testid="loading-screen"
      data-loading-state={errorMessage ? 'error' : fadingOut ? 'fading' : 'loading'}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#03040A] transition-opacity duration-500 ease-out ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
      }`}
      role="status"
      aria-live="polite"
      aria-label="Loading COLORIX"
    >
      {/* Animated Deep-Space, Floating Cubes & Reflective Floor Backdrop */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      />

      {/* Centered Upper-Middle Content Anchor (Matches Reference Layout) */}
      <div
        className={`relative z-10 w-full max-w-[700px] px-5 sm:px-6 flex flex-col items-center -mt-10 sm:-mt-12 transition-transform duration-500 ease-out ${
          fadingOut ? 'scale-[1.03]' : 'scale-100'
        }`}
      >
        {/* 1. Prominent COLORIX Logo at Top */}
        <LoadingColorixLogo />

        {/* 2. Loading Text Directly Below Logo OR Error Panel */}
        {!errorMessage ? (
          <div className="w-full max-w-[300px] sm:max-w-[460px] md:max-w-[560px] mt-6 sm:mt-8 flex flex-col items-center">
            <p className="font-display text-xl sm:text-2xl md:text-[28px] font-semibold tracking-wide text-white mb-3.5 select-none drop-shadow-[0_0_16px_rgba(125,211,252,0.85)]">
              <span>Loading</span>
              <span className="inline-block colorix-dot-1">.</span>
              <span className="inline-block colorix-dot-2">.</span>
              <span className="inline-block colorix-dot-3">.</span>
            </p>

            {/* 3. Glowing Neon Progress Bar (Cyan -> Blue -> Purple -> Pink) */}
            <div
              role="progressbar"
              aria-label="Game loading progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={clampedPercent}
              className="relative w-full h-8 sm:h-9 md:h-10 rounded-full p-[3px] bg-gradient-to-r from-[#00F0FF] via-[#6366F1] to-[#EC4899] shadow-[0_0_26px_rgba(34,211,238,0.58),0_0_44px_rgba(168,85,247,0.5)]"
            >
              {/* Dark recessed inner track */}
              <div className="relative w-full h-full rounded-full bg-[#060918] overflow-hidden p-[3px] shadow-inner">
                {/* Animated glowing fill bar */}
                <div
                  className="relative h-full rounded-full overflow-hidden transition-[width] duration-150 ease-out shadow-[0_0_18px_rgba(168,85,247,0.65)]"
                  style={{ width: `${fillWidthPercent}%` }}
                >
                  {/* Base Cyan -> Blue -> Purple -> Pink gradient */}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#00E5FF] via-[#60A5FA] via-50% via-[#A855F7] to-[#EC4899]" />

                  {/* Animated diagonal neon stripes matching reference bar */}
                  <div
                    className="absolute -inset-y-1 -left-8 right-0 colorix-bar-stripes opacity-45"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(-55deg, rgba(10,14,34,0.52) 0px, rgba(10,14,34,0.52) 8px, transparent 8px, transparent 18px)',
                    }}
                  />

                  {/* Glossy upper tube highlight */}
                  <div className="absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-white/35 to-transparent" />

                  {/* Bright leading-edge flare */}
                  {fillWidthPercent > 3 && (
                    <div className="absolute right-0 inset-y-0 w-3 bg-gradient-to-r from-transparent to-white/75" />
                  )}
                </div>
              </div>
            </div>

            {/* Subtle real loading percentage readout */}
            <div className="mt-2.5 text-xs sm:text-sm font-mono-num font-semibold tracking-wider text-cyan-200/90 drop-shadow-[0_0_8px_rgba(34,211,238,0.55)]">
              {clampedPercent}%
            </div>

            {audioWarning && (
              <p className="mt-2 text-xs text-amber-200/90 text-center max-w-sm leading-snug drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
                Background music unavailable — continuing without music
              </p>
            )}
          </div>
        ) : (
          <div
            role="alert"
            className="w-full max-w-md mt-7 rounded-2xl bg-[#0B1024]/95 border border-rose-400/45 p-5 sm:p-6 text-center shadow-[0_0_32px_rgba(244,63,94,0.28)] flex flex-col items-center gap-3.5"
          >
            <h2 className="font-display text-lg sm:text-xl font-bold text-white">
              Unable to Load Game Assets
            </h2>
            <p className="text-xs sm:text-sm text-slate-200/90 leading-relaxed">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 px-6 py-2.5 rounded-full bg-gradient-to-r from-[#06B6D4] via-[#6366F1] to-[#EC4899] text-white font-display font-bold text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(99,102,241,0.5)] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              Retry Loading
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
