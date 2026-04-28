// Centered "AdorAPP" loader: pulsing logo + "Cargando…" text.
// Used between route transitions and inside heavy pages (Solicitudes, etc.)
// so the loading experience is consistent with the initial app boot screen.

import React from 'react';

/**
 * @param {Object} p
 * @param {string} [p.label]    Text under the logo. Defaults to "Cargando AdorAPP…".
 * @param {boolean} [p.fullscreen] If true, occupies min-h-screen with black bg
 *                                 (matches the initial boot screen). Otherwise
 *                                 fills the available content area.
 */
export const PageLoader = ({ label = 'Cargando AdorAPP…', fullscreen = false }) => (
  <div
    role="status"
    aria-live="polite"
    className={
      fullscreen
        ? 'min-h-screen bg-black flex items-center justify-center'
        : 'min-h-[50vh] flex items-center justify-center'
    }
  >
    <div className="text-center">
      <img
        src="/logo.png"
        alt="AdorAPP"
        className="w-16 h-16 rounded-2xl mx-auto mb-4 object-contain animate-pulse"
      />
      <p className="text-gray-500">{label}</p>
    </div>
  </div>
);
