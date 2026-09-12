import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Sección plegable con animación de altura PROLIJA sin librerías: el truco
// grid-template-rows 0fr↔1fr transiciona la altura resuelta suavemente (el
// contenido va en un hijo `min-h-0 overflow-hidden`). Respeta prefers-reduced-motion.
//
// Dos modos:
//  - Simple: pasás `title` (+ `count`, `icon`) → header por defecto (Formación, Canciones…).
//  - Header rico: pasás `header` (JSX) → fila horizontal tipo card (Día de servicio / ensamble).
// `className` pinta el borde/fondo del contenedor (acento por sección).
// Si NO hay `children`, se renderiza como fila ESTÁTICA (sin chevron ni plegado) — para
// cuando no hay opciones que revelar (p. ej. un miembro sin acciones, o "sin ensamble").
export const CollapsibleSection = ({
  title,
  count,
  icon: Icon,
  header,
  className,
  defaultOpen = false,
  children,
  testId,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const wrap = `rounded-xl border overflow-hidden ${className || 'border-white/10 bg-white/[0.02]'}`;

  const headerInner = header || (
    <>
      {Icon && <Icon size={16} className="text-gold-300 shrink-0" />}
      <span className="text-sm font-medium text-gray-200">{title}</span>
      {count != null && (
        <span className="text-xs text-gray-400 bg-white/[0.06] rounded-full px-2 py-0.5 tabular-nums">{count}</span>
      )}
    </>
  );

  if (!children) {
    // Sin contenido colapsable → fila estática (misma estética, sin chevron).
    return (
      <div className={wrap} data-testid={testId}>
        <div className="w-full flex items-center gap-3 px-4 py-3">{headerInner}</div>
      </div>
    );
  }

  return (
    <div className={wrap} data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        {headerInner}
        <ChevronDown
          size={18}
          className={`ml-auto shrink-0 text-gray-500 transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
};
