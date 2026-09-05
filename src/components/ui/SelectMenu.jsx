import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

// Desplegable propio de la plataforma. Dos presentaciones según el dispositivo:
//  • ESCRITORIO (≥640px): panel flotante anclado al botón, por PORTAL con posición
//    fija (nunca lo tapa el overflow de un modal), abriéndose arriba o abajo según
//    el espacio. El listener de scroll ignora el scroll DENTRO del panel.
//  • MÓVIL (<640px): hoja inferior (bottom sheet) fija abajo — cómoda para el pulgar,
//    no salta de posición ni se esconde, y no se cierra al scrollear la lista.
// options: [{ value, label }].
export const SelectMenu = ({ value, onChange, options = [], placeholder = 'Elegí…', disabled = false, icon: Icon, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const [mobile, setMobile] = useState(false);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const selected = options.find((o) => o.value === value);

  const openMenu = () => {
    if (disabled) return;
    setMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setRect({ left: r.left, top: r.top, bottom: r.bottom, width: r.width });
    setOpen(true);
  };

  // Escritorio: cerrar ante scroll/resize (la posición fija quedaría desalineada),
  // PERO no cuando el scroll ocurre DENTRO del propio panel (lista de opciones). En
  // móvil la hoja está fija abajo → nunca se cierra por scroll.
  useEffect(() => {
    if (!open || mobile) return;
    const onScroll = (e) => {
      if (panelRef.current && e.target && panelRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onResize); };
  }, [open, mobile]);

  const spaceBelow = rect ? window.innerHeight - rect.bottom : 0;
  const up = rect && spaceBelow < 260 && rect.top > spaceBelow;

  const optionList = (
    <>
      {options.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">Sin opciones</div>}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => { onChange(o.value); setOpen(false); }}
            className={`w-full flex items-center justify-between gap-2 px-3 py-3 rounded-lg text-left transition-colors ${
              on ? 'bg-gold-500/15 text-gold-100' : 'text-gray-200 hover:bg-neutral-800 active:bg-neutral-800'
            }`}
          >
            <span className="truncate text-sm">{o.label}</span>
            {on && <Check size={16} className="shrink-0 text-gold-300" />}
          </button>
        );
      })}
    </>
  );

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-neutral-900 border rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          value ? 'border-gold-500/60 text-white' : 'border-neutral-700 text-gray-400 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={16} className="shrink-0 text-gold-300/80" />}
          <span className="truncate text-sm">{selected ? selected.label : placeholder}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Móvil: hoja inferior fija (bottom sheet). */}
      {open && mobile && createPortal(
        <>
          <div className="fixed inset-0 z-[300] bg-black/50" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className="fixed inset-x-0 bottom-0 z-[301] bg-neutral-900 border-t border-gold-500/20 rounded-t-2xl shadow-2xl max-h-[70vh] overflow-y-auto overscroll-contain p-2 animate-slide-up"
            style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="mx-auto mb-2 mt-1 h-1 w-10 rounded-full bg-neutral-600" aria-hidden="true" />
            {placeholder && <p className="px-3 pb-1.5 text-[11px] uppercase tracking-wider text-neutral-500">{placeholder}</p>}
            {optionList}
          </div>
        </>,
        document.body,
      )}

      {/* Escritorio: panel anclado al botón. */}
      {open && !mobile && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[300]" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className="fixed z-[301] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto overscroll-contain p-1.5"
            style={{ left: rect.left, width: rect.width, ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }) }}
          >
            {optionList}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
};
