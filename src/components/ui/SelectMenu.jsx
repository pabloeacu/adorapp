import React, { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

// Desplegable propio de la plataforma (mismo look que el de categorías del
// Repertorio): botón + panel flotante oscuro con opciones doradas al elegir.
// Reemplaza al <select> nativo (que abre la lista genérica del sistema operativo).
// options: [{ value, label }]. `up` abre el panel hacia arriba (para campos
// cerca del borde inferior de un modal con scroll, así no queda tapado).
export const SelectMenu = ({ value, onChange, options = [], placeholder = 'Elegí…', disabled = false, icon: Icon, up = false }) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 px-4 py-3 bg-neutral-900 border rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          value ? 'border-gold-500/60 text-white' : 'border-neutral-800 text-gray-400 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={18} className="shrink-0 text-gold-300/80" />}
          <span className="truncate text-sm sm:text-base">{selected ? selected.label : placeholder}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute left-0 right-0 z-50 bg-neutral-900 border border-neutral-700 rounded-xl shadow-xl max-h-56 overflow-y-auto p-1.5 ${
            up ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}>
            {options.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">Sin opciones</div>}
            {options.map((o) => {
              const on = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    on ? 'bg-gold-500/15 text-gold-100' : 'text-gray-200 hover:bg-neutral-800'
                  }`}
                >
                  <span className="truncate text-sm">{o.label}</span>
                  {on && <Check size={16} className="shrink-0 text-gold-300" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
