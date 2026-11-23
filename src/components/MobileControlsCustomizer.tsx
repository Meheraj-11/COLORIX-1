import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Translations } from '../game/i18n';
import {
  getDefaultMobileControlPositions,
  getMobileButtonPixelSize,
  getPlayableControlArea,
  pxCenterToNormalized,
  resolveMobileControlRects,
  type MobileControlButtonId,
  type MobileControlPositions,
  type MobileControlsLayout,
} from '../game/mobileControlsLayout';
import { BlastIcon } from './Icons';

interface MobileControlsCustomizerProps {
  t: Translations;
  initialLayout: MobileControlsLayout;
  onSave: (layout: MobileControlsLayout) => void;
  onCancel: () => void;
}

interface ActiveDragState {
  id: MobileControlButtonId;
  pointerId: number | null;
  touchId: number | null;
  grabOffsetX: number;
  grabOffsetY: number;
}

const BUTTON_LABELS: Record<MobileControlButtonId, string> = {
  left: 'LEFT',
  right: 'RIGHT',
  blast: 'BLAST',
  jump: 'JUMP',
};

function readViewportSize(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: 390, h: 844 };
  return {
    w: Math.max(240, window.innerWidth || 390),
    h: Math.max(240, window.innerHeight || 844),
  };
}

export function MobileControlsCustomizer({
  t,
  initialLayout,
  onSave,
  onCancel,
}: MobileControlsCustomizerProps) {
  const [viewport, setViewport] = useState<{ w: number; h: number }>(() => readViewportSize());

  // Initialize draft positions from saved custom layout or exact defaults for current viewport
  const [draftPositions, setDraftPositions] = useState<MobileControlPositions>(() =>
    initialLayout.customized
      ? {
          left: { ...initialLayout.buttons.left },
          right: { ...initialLayout.buttons.right },
          blast: { ...initialLayout.buttons.blast },
          jump: { ...initialLayout.buttons.jump },
        }
      : getDefaultMobileControlPositions(readViewportSize().w, readViewportSize().h),
  );
  const [draftCustomized, setDraftCustomized] = useState<boolean>(initialLayout.customized);
  const [selectedId, setSelectedId] = useState<MobileControlButtonId | null>(null);
  const [draggingId, setDraggingId] = useState<MobileControlButtonId | null>(null);

  const dragRef = useRef<ActiveDragState | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // Keep viewport measurements updated on resize / orientation change
  useEffect(() => {
    const syncViewport = () => {
      const next = readViewportSize();
      setViewport(next);
      // If still in pure default state, recompute exact defaults for the new screen size
      setDraftPositions((prev) =>
        draftCustomized ? prev : getDefaultMobileControlPositions(next.w, next.h),
      );
    };
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);
    window.visualViewport?.addEventListener('resize', syncViewport);
    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
      window.visualViewport?.removeEventListener('resize', syncViewport);
    };
  }, [draftCustomized]);

  const applyDragPoint = useCallback((id: MobileControlButtonId, clientX: number, clientY: number, grabOffsetX: number, grabOffsetY: number) => {
    const { w, h } = viewportRef.current;
    const btnSize = getMobileButtonPixelSize(id, w, h);
    const nextPos = pxCenterToNormalized(
      clientX - grabOffsetX,
      clientY - grabOffsetY,
      btnSize,
      w,
      h,
    );
    setDraftCustomized(true);
    setDraftPositions((prev) => ({
      ...prev,
      [id]: nextPos,
    }));
  }, []);

  // Global window drag listeners so dragging stays smooth even if pointer leaves button bounds
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      e.preventDefault();
      applyDragPoint(drag.id, e.clientX, e.clientY, drag.grabOffsetX, drag.grabOffsetY);
    };

    const handlePointerEnd = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      setDraggingId(null);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i += 1) {
        const touch = e.changedTouches[i];
        if (touch.identifier === drag.touchId) {
          applyDragPoint(drag.id, touch.clientX, touch.clientY, drag.grabOffsetX, drag.grabOffsetY);
          break;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i += 1) {
        if (e.changedTouches[i].identifier === drag.touchId) {
          dragRef.current = null;
          setDraggingId(null);
          break;
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerEnd, true);
    window.addEventListener('pointercancel', handlePointerEnd, true);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, true);
    window.addEventListener('touchcancel', handleTouchEnd, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd, true);
      window.removeEventListener('pointercancel', handlePointerEnd, true);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd, true);
      window.removeEventListener('touchcancel', handleTouchEnd, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [applyDragPoint, onCancel]);

  const rects = resolveMobileControlRects(draftPositions, viewport.w, viewport.h);
  const { topSafeY } = getPlayableControlArea(viewport.w, viewport.h);
  const isLandscape = viewport.w >= viewport.h;

  const startPointerDrag = (id: MobileControlButtonId, e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = rects[id];
    dragRef.current = {
      id,
      pointerId: e.pointerId,
      touchId: null,
      grabOffsetX: e.clientX - rect.centerX,
      grabOffsetY: e.clientY - rect.centerY,
    };
    setSelectedId(id);
    setDraggingId(id);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointer events safely fall back to window listeners
    }
  };

  const startTouchDrag = (id: MobileControlButtonId, e: React.TouchEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== null && dragRef.current?.pointerId !== undefined) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    e.stopPropagation();

    const rect = rects[id];
    dragRef.current = {
      id,
      pointerId: null,
      touchId: touch.identifier,
      grabOffsetX: touch.clientX - rect.centerX,
      grabOffsetY: touch.clientY - rect.centerY,
    };
    setSelectedId(id);
    setDraggingId(id);
  };

  const handleResetToDefault = () => {
    const defaults = getDefaultMobileControlPositions(viewport.w, viewport.h);
    setDraftPositions(defaults);
    setDraftCustomized(false);
    setSelectedId(null);
    setDraggingId(null);
    dragRef.current = null;
  };

  const handleSaveLayout = () => {
    onSave({
      customized: draftCustomized,
      buttons: {
        left: { ...draftPositions.left },
        right: { ...draftPositions.right },
        blast: { ...draftPositions.blast },
        jump: { ...draftPositions.jump },
      },
    });
  };

  const selectedRect = selectedId ? rects[selectedId] : null;
  const lrEdgeGap = Math.max(0, Math.round(rects.right.left - (rects.left.left + rects.left.w)));

  const renderDraggableButton = (id: MobileControlButtonId) => {
    const rect = rects[id];
    const isSelected = selectedId === id;
    const isDragging = draggingId === id;

    let visualClasses = '';
    let content: React.ReactNode = null;

    if (id === 'left' || id === 'right') {
      visualClasses =
        'rounded-xl border text-white font-bold bg-[#0D111C]/90 border-white/30 text-xl shadow-lg';
      content = id === 'left' ? '←' : '→';
    } else if (id === 'blast') {
      visualClasses =
        'rounded-2xl border-2 border-cyan-400/80 bg-[#0D111C]/92 text-white font-display font-bold flex-col gap-0.5 text-[10px] shadow-lg';
      content = (
        <>
          <BlastIcon color="#22D3EE" size={isLandscape ? 16 : 18} />
          <span className="leading-none">BLAST</span>
        </>
      );
    } else {
      visualClasses =
        'rounded-2xl border-2 border-white bg-[#F8FAFC]/94 text-[#0B0D14] font-display font-bold text-xs shadow-lg';
      content = 'JUMP';
    }

    return (
      <button
        key={id}
        type="button"
        data-testid={`customizer-btn-${id}`}
        data-pos-x={draftPositions[id].x}
        data-pos-y={draftPositions[id].y}
        aria-label={`Drag ${BUTTON_LABELS[id]} button`}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => startPointerDrag(id, e)}
        onTouchStart={(e) => startTouchDrag(id, e)}
        style={{
          position: 'fixed',
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.w}px`,
          height: `${rect.h}px`,
        }}
        className={`flex items-center justify-center select-none touch-none cursor-grab active:cursor-grabbing transition-shadow ${visualClasses} ${
          isDragging
            ? 'ring-2 ring-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.48)] scale-105 z-30'
            : isSelected
              ? 'ring-2 ring-cyan-400/80 z-20'
              : 'ring-1 ring-white/20 z-10'
        }`}
      >
        {content}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-[#0B0D14]/90 border text-[9px] font-mono-num font-semibold tracking-wide whitespace-nowrap ${
            isSelected ? 'border-cyan-400/70 text-cyan-200' : 'border-white/18 text-slate-300'
          }`}
        >
          {BUTTON_LABELS[id]}
        </span>
      </button>
    );
  };

  return (
    <div
      data-testid="mobile-controls-customizer"
      role="dialog"
      aria-modal="true"
      aria-label={t.customizeControls}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 z-[60] bg-[#06080E]/68 pointer-events-auto select-none touch-none overflow-hidden"
    >
      {/* Subtle Live Preview Alignment Grid inside Playable Area */}
      <div
        aria-hidden="true"
        style={{ top: `${topSafeY}px` }}
        className="fixed left-0 right-0 bottom-0 pointer-events-none border-t border-dashed border-cyan-300/30"
      >
        <div
          className="w-full h-full opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
      </div>

      {/* Compact Top Control Bar (positioned cleanly above draggable zone) */}
      <div className="fixed top-0 left-0 right-0 z-40 px-2.5 py-2 bg-[#0B0F1A]/94 border-b border-white/14 shadow-2xl">
        <div className="max-w-3xl mx-auto flex flex-col min-[560px]:flex-row min-[560px]:items-center min-[560px]:justify-between gap-1.5 min-[560px]:gap-3">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <h2 className="font-display text-sm font-bold text-white leading-tight truncate">
                {t.customizeControls}
              </h2>
              <p className="text-[11px] text-slate-300 leading-tight truncate">
                {selectedId && selectedRect
                  ? `${BUTTON_LABELS[selectedId]} · X ${Math.round(draftPositions[selectedId].x * 100)}% · Y ${Math.round(draftPositions[selectedId].y * 100)}%${
                      selectedId === 'left' || selectedId === 'right' ? ` · L–R Gap ${lrEdgeGap}px` : ''
                    }`
                  : t.customizeControlsHint}
              </p>
            </div>
            <span className="shrink-0 min-[560px]:hidden font-mono-num text-[10px] px-2 py-0.5 rounded bg-white/8 border border-white/14 text-slate-200">
              {draftCustomized ? t.customLayoutLabel : t.defaultLayoutLabel}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="customizer-save-btn"
              onClick={handleSaveLayout}
              className="flex-1 min-[560px]:flex-none py-1.5 px-3 rounded-lg bg-[#F8FAFC] hover:bg-white active:scale-[0.99] text-[#0B0D14] font-display font-bold text-xs tracking-wide transition-all cursor-pointer whitespace-nowrap"
            >
              {t.saveLayout}
            </button>
            <button
              type="button"
              data-testid="customizer-reset-btn"
              onClick={handleResetToDefault}
              className="py-1.5 px-2.5 rounded-lg bg-cyan-500/14 hover:bg-cyan-500/24 border border-cyan-400/40 text-cyan-100 font-display font-semibold text-xs tracking-wide transition-colors cursor-pointer whitespace-nowrap"
            >
              {t.resetToDefault}
            </button>
            <button
              type="button"
              data-testid="customizer-cancel-btn"
              onClick={onCancel}
              className="py-1.5 px-2.5 rounded-lg bg-white/10 hover:bg-white/16 border border-white/16 text-slate-100 font-display font-semibold text-xs tracking-wide transition-colors cursor-pointer whitespace-nowrap"
            >
              {t.cancel.toUpperCase()}
            </button>
          </div>
        </div>
      </div>

      {/* Live Preview Draggable Controls */}
      {renderDraggableButton('left')}
      {renderDraggableButton('right')}
      {renderDraggableButton('blast')}
      {renderDraggableButton('jump')}
    </div>
  );
}
