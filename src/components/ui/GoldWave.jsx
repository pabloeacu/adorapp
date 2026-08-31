import React from 'react';

// Ondas doradas arqueadas decorativas (line-art) — el detalle "premium hecho a
// medida" de los mockups. Trazos con degradé dorado brillante, bien visibles, sin
// capturar eventos. Se posiciona con clases utilitarias desde donde se use.
export const GoldWave = ({ className = '', opacity = 0.45, flip = false }) => (
  <svg
    viewBox="0 0 400 120"
    preserveAspectRatio="none"
    aria-hidden="true"
    className={`pointer-events-none select-none ${flip ? 'scale-y-[-1]' : ''} ${className}`}
    style={{ opacity }}
  >
    <defs>
      <linearGradient id="ador-goldwave" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#b8860b" stopOpacity="0" />
        <stop offset="45%" stopColor="#ffe9a8" />
        <stop offset="65%" stopColor="#f2c94c" />
        <stop offset="100%" stopColor="#b8860b" stopOpacity="0" />
      </linearGradient>
    </defs>
    <g fill="none" stroke="url(#ador-goldwave)" strokeWidth="2.2" strokeLinecap="round">
      <path d="M0,70 C80,26 160,116 260,58 S382,16 400,50" />
      <path d="M0,92 C90,48 172,126 272,74 S392,38 400,66" strokeOpacity="0.7" />
      <path d="M0,50 C70,14 150,94 250,42 S382,8 400,34" strokeOpacity="0.5" />
    </g>
  </svg>
);
