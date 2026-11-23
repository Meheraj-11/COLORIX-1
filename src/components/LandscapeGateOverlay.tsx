import React, { useState } from 'react';

interface LandscapeGateOverlayProps {
  onRequestLandscape: () => Promise<boolean> | void;
}

/**
 * Clean, responsive Rotate-to-Landscape gate shown ONLY on mobile devices
 * when a web browser blocks automatic orientation locking and the phone is
 * currently held in Portrait Mode. Automatically disappears the moment the
 * device rotates into Landscape Left or Landscape Right.
 */
export function LandscapeGateOverlay({ onRequestLandscape }: LandscapeGateOverlayProps) {
  const [attempting, setAttempting] = useState(false);

  const handleEnterLandscape = async () => {
    setAttempting(true);
    try {
      await onRequestLandscape();
    } finally {
      setAttempting(false);
    }
  };

  return (
    <div
      data-testid="rotate-landscape-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="colorix-landscape-title"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[#06080E]/96 backdrop-blur-md px-6 py-8 text-center pointer-events-auto select-none"
    >
      <div className="w-full max-w-sm rounded-2xl bg-[#0E1320]/95 border border-white/15 px-6 py-7 shadow-2xl flex flex-col items-center gap-5">
        {/* Crisp Landscape Device Rotation Graphic */}
        <div
          className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-[#141B2E] border border-cyan-400/30 shadow-[0_0_24px_rgba(34,211,238,0.18)]"
          aria-hidden="true"
        >
          <svg
            width="46"
            height="46"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Landscape phone silhouette */}
            <rect
              x="6"
              y="14"
              width="36"
              height="22"
              rx="4"
              stroke="#38BDF8"
              strokeWidth="2.5"
              fill="#0B1020"
            />
            <rect x="11" y="18" width="24" height="14" rx="1.5" fill="#17233D" />
            <circle cx="38.5" cy="25" r="1.4" fill="#38BDF8" />
            {/* Rotation arrows */}
            <path
              d="M15 9.5C18 6.8 22 5.5 26.5 6C30.2 6.4 33.4 8.2 35.5 10.8"
              stroke="#A855F7"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              d="M35.5 6.8V11H31.3"
              stroke="#A855F7"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M33 40.5C30 43.2 26 44.5 21.5 44C17.8 43.6 14.6 41.8 12.5 39.2"
              stroke="#22D3EE"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              d="M12.5 43.2V39H16.7"
              stroke="#22D3EE"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-display font-bold tracking-[0.2em] uppercase text-cyan-300">
            COLORIX
          </div>
          <h2
            id="colorix-landscape-title"
            className="font-display text-xl font-bold text-white leading-snug"
          >
            Rotate to Landscape Mode
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            COLORIX plays in full-screen Landscape orientation. Turn your device sideways (left or right) to continue.
          </p>
        </div>

        <button
          type="button"
          data-testid="enter-landscape-btn"
          disabled={attempting}
          onClick={() => {
            void handleEnterLandscape();
          }}
          className="w-full py-3 px-5 rounded-xl bg-[#F8FAFC] hover:bg-white active:scale-[0.99] text-[#0B0D14] font-display font-bold text-sm tracking-wide transition-all shadow-lg cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          {attempting ? 'Switching…' : 'Enter Landscape Fullscreen'}
        </button>
      </div>
    </div>
  );
}
