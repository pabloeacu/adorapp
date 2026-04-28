// WizardSpotlight — dim the screen, cut a hole around a `data-tour` element,
// and show a tooltip card next to it. Used by OnboardingWizard's visual tour
// to point at real elements in the live UI (bottom nav links, header icons).
//
// Usage:
//   <WizardSpotlight
//     targetSelector="[data-tour='ordenes-link']"
//     title="Tus órdenes"
//     body="Acá vas a ver las listas de canciones de cada reunión."
//     stepIndex={0}
//     stepCount={3}
//     onNext={() => setStep(s => s + 1)}
//     onSkip={() => setStep(stepCount)}
//   />
//
// If the target element is not in the DOM (e.g. the bottom nav is hidden on
// desktop), the spotlight renders centered with no cutout — the message still
// reaches the user.

import React, { useEffect, useState, useCallback } from 'react';
import { ArrowRight, X } from 'lucide-react';

const PADDING = 8;
const TOOLTIP_GAP = 16;
const TOOLTIP_MAX_WIDTH = 320;

export function WizardSpotlight({
  targetSelector,
  title,
  body,
  stepIndex,
  stepCount,
  nextLabel = 'Siguiente',
  onNext,
  onSkip,
}) {
  const [rect, setRect] = useState(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });

  const measure = useCallback(() => {
    const el = targetSelector ? document.querySelector(targetSelector) : null;
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({
        top: Math.max(0, r.top - PADDING),
        left: Math.max(0, r.left - PADDING),
        width: r.width + PADDING * 2,
        height: r.height + PADDING * 2,
      });
    } else {
      setRect(null);
    }
    setViewport({ w: window.innerWidth, h: window.innerHeight });
  }, [targetSelector]);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    document.body && ro.observe(document.body);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    // Re-measure once the target element mounts (it may render after us).
    const t = setTimeout(measure, 50);
    const t2 = setTimeout(measure, 250);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [measure]);

  // Tooltip placement: above the target if there's room, otherwise below.
  // If no target rect, center vertically.
  const tooltipPos = (() => {
    if (!rect) {
      return {
        top: viewport.h / 2 - 100,
        left: Math.max(16, viewport.w / 2 - TOOLTIP_MAX_WIDTH / 2),
        width: Math.min(TOOLTIP_MAX_WIDTH, viewport.w - 32),
      };
    }
    const placeAbove = rect.top > 240;
    const top = placeAbove
      ? Math.max(16, rect.top - TOOLTIP_GAP - 200)
      : Math.min(viewport.h - 220, rect.top + rect.height + TOOLTIP_GAP);
    const idealLeft = rect.left + rect.width / 2 - TOOLTIP_MAX_WIDTH / 2;
    const left = Math.max(16, Math.min(viewport.w - TOOLTIP_MAX_WIDTH - 16, idealLeft));
    return { top, left, width: Math.min(TOOLTIP_MAX_WIDTH, viewport.w - 32) };
  })();

  // Backdrop: 4 dark rectangles forming a frame around the cutout. If no rect,
  // a single full-screen overlay.
  const backdrop = rect
    ? (
      <>
        <div className="fixed bg-black/75 backdrop-blur-[2px]" style={{ top: 0, left: 0, right: 0, height: rect.top, zIndex: 200 }} />
        <div className="fixed bg-black/75 backdrop-blur-[2px]" style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0, zIndex: 200 }} />
        <div className="fixed bg-black/75 backdrop-blur-[2px]" style={{ top: rect.top, left: 0, width: rect.left, height: rect.height, zIndex: 200 }} />
        <div className="fixed bg-black/75 backdrop-blur-[2px]" style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height, zIndex: 200 }} />
        {/* highlight ring around the cutout */}
        <div
          className="fixed pointer-events-none rounded-2xl ring-2 ring-white/80 shadow-[0_0_0_4px_rgba(255,255,255,0.15)]"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, zIndex: 201 }}
        />
      </>
    )
    : <div className="fixed inset-0 bg-black/85 backdrop-blur-sm" style={{ zIndex: 200 }} />;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="spotlight-title" className="fixed inset-0 z-[200]">
      {backdrop}

      {/* Skip button (top-right) */}
      <button
        onClick={onSkip}
        aria-label="Saltar tour"
        className="fixed top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white"
        style={{ zIndex: 203 }}
      >
        <X size={18} />
      </button>

      {/* Tooltip card */}
      <div
        className="fixed bg-neutral-900 border border-neutral-700 rounded-2xl p-5 shadow-2xl"
        style={{ top: tooltipPos.top, left: tooltipPos.left, width: tooltipPos.width, zIndex: 202 }}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs uppercase tracking-wider text-gray-500">
            Paso {stepIndex + 1} de {stepCount}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: stepCount }).map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${i === stepIndex ? 'w-6 bg-white' : 'w-1.5 bg-neutral-700'}`}
              />
            ))}
          </div>
        </div>
        <h3 id="spotlight-title" className="text-lg font-semibold text-white mb-1">{title}</h3>
        <p className="text-sm text-gray-300 leading-relaxed mb-4">{body}</p>
        <div className="flex gap-2">
          <button
            onClick={onSkip}
            className="flex-1 py-2 text-sm text-gray-400 hover:text-white"
          >
            Saltar
          </button>
          <button
            onClick={onNext}
            className="flex-1 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-gray-200 flex items-center justify-center gap-1"
          >
            {nextLabel} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
