import React from 'react';

// Anotación manuscrita dorada: flecha curva que APUNTA HACIA ARRIBA (al botón de
// acción, que en los estados vacíos queda justo encima) + texto debajo. La flecha va
// centrada, así apunta al botón centrado sin importar el ancho del texto. Font Caveat.
export const Annotation = ({ text, className = '' }) => (
  <div className={`relative flex flex-col items-center gap-1 ${className}`}>
    <svg
      viewBox="0 0 40 36"
      className="h-8 w-10 text-gold-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* rulo hecho a mano que sube y termina apuntando arriba, centrado */}
      <path d="M20 34 C 33 26, 7 20, 20 5" />
      <path d="M13 11 L20 4 L27 11" />
    </svg>
    <span className="font-hand text-[22px] font-bold leading-none text-gold-300 -rotate-2">{text}</span>
  </div>
);
