import React from 'react';

export function ColorixLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-start select-none ${className}`}>
      <svg
        viewBox="0 0 420 96"
        className="w-full max-w-[380px] h-auto overflow-visible"
        role="img"
        aria-label="COLORIX"
      >
        {/* Prismatic Crystal Emblem */}
        <g transform="translate(8, 8)">
          <polygon points="36,4 66,24 54,68 18,68 6,24" fill="#0E121D" stroke="#F4F6FB" strokeWidth="2.5" />
          <polygon points="36,4 66,24 36,38" fill="#C81E3A" />
          <polygon points="36,4 36,38 6,24" fill="#F59E0B" />
          <polygon points="66,24 54,68 36,38" fill="#06B6D4" />
          <polygon points="6,24 36,38 18,68" fill="#10B981" />
          <polygon points="18,68 54,68 36,38" fill="#7C3AED" />
          <polygon points="36,20 48,38 36,54 24,38" fill="#FFFFFF" fillOpacity="0.92" />
        </g>

        {/* Sculpted Display Wordmark */}
        <text
          x="90"
          y="64"
          fill="#F8FAFC"
          stroke="#0A0D16"
          strokeWidth="6"
          paintOrder="stroke fill"
          fontFamily="Outfit, system-ui, sans-serif"
          fontWeight="800"
          fontSize="58"
          letterSpacing="6"
        >
          COLORIX
        </text>
        {/* Subtle prismatic underline bar */}
        <rect x="92" y="75" width="44" height="3.5" rx="1.5" fill="#C81E3A" />
        <rect x="140" y="75" width="44" height="3.5" rx="1.5" fill="#F59E0B" />
        <rect x="188" y="75" width="44" height="3.5" rx="1.5" fill="#10B981" />
        <rect x="236" y="75" width="44" height="3.5" rx="1.5" fill="#06B6D4" />
        <rect x="284" y="75" width="44" height="3.5" rx="1.5" fill="#7C3AED" />
        <rect x="332" y="75" width="44" height="3.5" rx="1.5" fill="#D946EF" />
      </svg>
    </div>
  );
}

export function CrystalIcon({ color = '#06B6D4', size = 18 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polygon points="12,2 20,12 12,22 4,12" fill={color} stroke="#0B0E17" strokeWidth="1.8" />
      <polygon points="12,4.5 16.5,11.5 12,13.5 7.5,11.5" fill="#FFFFFF" fillOpacity="0.58" />
    </svg>
  );
}

export function WheelIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="#F8FAFC" strokeWidth="1.8" />
      <path d="M12 2.5 A9.5 9.5 0 0 1 21.5 12" fill="none" stroke="#C81E3A" strokeWidth="3.2" />
      <path d="M21.5 12 A9.5 9.5 0 0 1 12 21.5" fill="none" stroke="#06B6D4" strokeWidth="3.2" />
      <path d="M12 21.5 A9.5 9.5 0 0 1 2.5 12" fill="none" stroke="#10B981" strokeWidth="3.2" />
      <path d="M2.5 12 A9.5 9.5 0 0 1 12 2.5" fill="none" stroke="#F59E0B" strokeWidth="3.2" />
      <circle cx="12" cy="12" r="3" fill="#F8FAFC" />
    </svg>
  );
}

export function SoundIcon({ muted, size = 18 }: { muted: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {muted ? (
        <>
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M19 5a9.5 9.5 0 0 1 0 14" />
        </>
      )}
    </svg>
  );
}

export function PauseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export function RestartIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <polyline points="3 3 3 8 8 8" />
    </svg>
  );
}

export function LockIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function CheckIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function BlastIcon({ color = '#F8FAFC', size = 18 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polygon
        points="12,2 14.8,8.6 22,9.8 16.4,14.2 18,21.4 12,17.6 6,21.4 7.6,14.2 2,9.8 9.2,8.6"
        fill={color}
        stroke="#0B0E17"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.8" fill="#FFFFFF" />
    </svg>
  );
}
