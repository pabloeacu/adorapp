// Centered "AdorAPP" loader: pulsing logo + "Cargando…" text.
// Used between route transitions and inside heavy pages (Solicitudes, etc.)
// so the loading experience is consistent with the initial app boot screen.
//
// Modo actualización (`progress` definido): debajo del logo, "Actualizando a la
// nueva versión…", una barra dorada finita que avanza por hitos reales, el
// paso en curso y la fecha del build. Solo aparece cuando hay una versión
// nueva detrás; el arranque normal no cambia.

import React from 'react';

const BUILD_DATE = import.meta.env.VITE_BUILD_DATE || '';

/**
 * @param {Object} p
 * @param {string} [p.label]    Text under the logo. Defaults to "Cargando AdorAPP…".
 * @param {boolean} [p.fullscreen] If true, occupies min-h-screen with black bg
 *                                 (matches the initial boot screen). Otherwise
 *                                 fills the available content area.
 * @param {boolean} [p.overlay]  Fixed full-viewport overlay (por encima de la app ya montada).
 * @param {number}  [p.progress] 0–100: activa el modo actualización con barra dorada.
 * @param {string}  [p.caption]  Paso en curso (modo actualización).
 */
export const PageLoader = ({ label = 'Cargando AdorAPP…', fullscreen = false, overlay = false, progress, caption }) => {
  const updating = typeof progress === 'number';
  const pct = updating ? Math.max(0, Math.min(100, progress)) : 0;
  const done = updating && pct >= 100;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!done}
      data-testid={updating ? 'update-loader' : 'page-loader'}
      className={
        overlay
          ? 'fixed inset-0 z-[1000] bg-black flex items-center justify-center animate-fade-in'
          : fullscreen
            ? 'min-h-screen bg-black flex items-center justify-center'
            : 'min-h-[50vh] flex items-center justify-center'
      }
    >
      <div className="text-center px-8 w-full max-w-xs">
        <img
          src="/logo.png"
          alt="AdorAPP"
          className={`w-16 h-16 rounded-2xl mx-auto mb-4 object-contain ${done ? '' : 'animate-pulse'}`}
        />
        {!updating && <p className="text-gray-500">{label}</p>}
        {updating && (
          <div className="animate-fade-in">
            <p className="text-gold-200 font-medium tracking-wide">
              {done ? 'Listo' : 'Actualizando a la nueva versión…'}
            </p>
            <div
              className="relative mt-4 h-[3px] w-full rounded-full bg-neutral-800/90 overflow-hidden ring-1 ring-gold-500/10"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label="Progreso de la actualización"
            >
              <div
                className="update-bar h-full rounded-full"
                style={{ width: `${pct}%` }}
                data-testid="update-bar"
              />
            </div>
            <p className="mt-3 text-xs text-gray-500 min-h-[1rem]" data-testid="update-caption">{caption || ''}</p>
            {BUILD_DATE && (
              <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-gold-500/50">versión del {BUILD_DATE}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
