import React from 'react';

// Anotación manuscrita dorada con flecha curva — el toque cálido y guiado de los
// mockups, para los estados vacíos ("Comenzá desde acá →"). Puramente estético.
// `flip` invierte la flecha (para apuntar hacia la izquierda/arriba según el layout).
export const Annotation = ({ text, className = '', flip = false }) => (
  <div className={`relative flex items-end gap-1.5 ${flip ? 'flex-row-reverse' : ''} ${className}`}>
    <span className="font-hand text-[22px] font-bold leading-none text-gold-300 -rotate-3">{text}</span>
    <svg
      viewBox="0 0 46 34"
      className={`h-8 w-11 text-gold-400 ${flip ? 'scale-x-[-1]' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6 C 20 2, 40 10, 42 28" />
      <path d="M34 24l8 5 1-9" />
    </svg>
  </div>
);
