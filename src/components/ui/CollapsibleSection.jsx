import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Sección plegable con animación de altura PROLIJA sin librerías: el truco
// grid-template-rows 0fr↔1fr transiciona la altura resuelta suavemente (el
// contenido va en un hijo `min-h-0 overflow-hidden`). Respeta prefers-reduced-motion.
// Pensada para que los modales largos (Detalle de Orden) no sean scroll infinito,
// sobre todo en el celu.
export const CollapsibleSection = ({
  title,
  count,
  icon: Icon,
  defaultOpen = false,
  children,
  testId,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        {Icon && <Icon size={16} className="text-gold-300 shrink-0" />}
        <span className="text-sm font-medium text-gray-200">{title}</span>
        {count != null && (
          <span className="text-xs text-gray-400 bg-white/[0.06] rounded-full px-2 py-0.5 tabular-nums">{count}</span>
        )}
        <ChevronDown
          size={16}
          className={`ml-auto text-gray-500 transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
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
