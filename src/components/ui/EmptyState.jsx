import React from 'react';
import { Annotation } from './Annotation';

// Estado vacío premium: ícono Phosphor duotono en badge dorado sobre un halo radial
// dorado (spotlight), título, subtítulo, acción opcional y anotación manuscrita
// opcional ("Comenzá desde acá →"). El caller pasa un ícono de Phosphor.
export const EmptyState = ({ icon: Icon, title, subtitle, annotation, children, className = '' }) => (
  <div className={`relative flex flex-col items-center justify-center py-12 text-center ${className}`}>
    <div
      className="gold-radial-glow pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full"
      aria-hidden="true"
    />
    <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gold-gradient-soft ring-[1.5px] ring-gold-500/50 shadow-[0_0_30px_-6px_rgba(242,201,76,0.5)]">
      {Icon && <Icon size={38} weight="duotone" className="text-gold-100" />}
    </div>
    {title && <p className="relative mt-5 text-lg font-bold text-white">{title}</p>}
    {subtitle && <p className="relative mt-1.5 max-w-sm text-sm text-gray-400">{subtitle}</p>}
    {children && <div className="relative mt-5">{children}</div>}
    {/* La anotación SOLO acompaña a un botón de acción: la flecha apunta hacia él.
        Sin botón no tendría a qué apuntar, así que no se muestra. */}
    {annotation && children && <Annotation text={annotation} className="mt-2" />}
  </div>
);
