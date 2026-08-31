import React from 'react';

// Ícono de acento DORADO con presencia: badge cuadrado-redondeado con degradé
// dorado suave, anillo dorado y glow. El ícono va en Phosphor weight="duotone"
// (relleno + contorno, premium y menos genérico que un trazo simple). El caller
// pasa un ícono de Phosphor (@phosphor-icons/react). Reemplaza el viejo
// `<div className="p-2 rounded-lg bg-blue-500/20"><Icon className="text-blue-400"/></div>`.
const DIMS = { sm: 'h-10 w-10 rounded-xl', md: 'h-14 w-14 rounded-2xl', lg: 'h-16 w-16 rounded-2xl' };
const ICON = { sm: 22, md: 30, lg: 34 };

export const IconBadge = ({ icon: Icon, size = 'md', weight = 'duotone', className = '' }) => (
  <div
    className={`relative flex ${DIMS[size]} shrink-0 items-center justify-center bg-gold-gradient-soft ring-[1.5px] ring-gold-500/50 shadow-[0_0_20px_-4px_rgba(242,201,76,0.45)] ${className}`}
  >
    {Icon && <Icon size={ICON[size]} weight={weight} className="relative text-gold-100" />}
  </div>
);
