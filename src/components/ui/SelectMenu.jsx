import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';
import { matchesSearch } from '../../lib/searchText';

// Desplegable propio de la plataforma. Dos presentaciones según el dispositivo:
//  • ESCRITORIO (≥640px): panel flotante anclado al botón, por PORTAL con posición
//    fija (nunca lo tapa el overflow de un modal), abriéndose arriba o abajo según
//    el espacio. El listener de scroll ignora el scroll DENTRO del panel.
//  • MÓVIL (<640px): hoja inferior (bottom sheet) fija abajo — cómoda para el pulgar,
//    no salta de posición ni se esconde, y no se cierra al scrollear la lista.
// options: [{ value, label, sublabel?, badge?, keywords? }].
//  • `searchable`: buscador DENTRO de la hoja/panel (indistinto a tildes, src/lib/searchText.js)
//    sobre label + sublabel + badge + keywords. Es el método para listas largas (repertorio):
//    la lista scrollea en la hoja, nunca "atrapada" dentro del área scrolleable de un modal.
//  • `beforeOpen()`: si devuelve false, no se abre (p. ej. "Elegí la banda primero").
//  • `testId`: data-testid del botón; el buscador lleva `${testId}-search` y la lista `${testId}-list`.
export const SelectMenu = ({
  value, onChange, options = [], placeholder = 'Elegí…', disabled = false, icon: Icon, className = '',
  searchable = false, searchPlaceholder = 'Buscar…', emptyText = 'Sin opciones', beforeOpen, testId,
  // `renderTrigger({ ref, open, toggle })`: reemplaza el botón por defecto por un
  // disparador propio (p. ej. un ícono chico). `menuWidth`: ancho del panel de
  // escritorio cuando el disparador es más angosto que la lista (ej. el picker de
  // "enganchar"). Ambos son OPT-IN: sin ellos, el comportamiento es idéntico al de antes.
  renderTrigger, menuWidth,
}) => {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState('');
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const selected = options.find((o) => o.value === value);

  const openMenu = () => {
    if (disabled) return;
    if (beforeOpen && beforeOpen() === false) return;
    setQuery('');
    setMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setRect({ left: r.left, top: r.top, bottom: r.bottom, width: r.width });
    setOpen(true);
  };

  const visible = useMemo(
    () => (searchable && query.trim()
      ? options.filter((o) => matchesSearch(query, o.label, o.sublabel, o.badge, o.keywords))
      : options),
    [options, searchable, query]
  );

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
  // Panel de escritorio: por defecto usa el ancho del disparador; con `menuWidth`
  // se puede forzar un ancho mayor (disparador angosto) y se clampa a la ventana.
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 9999;
  const panelW = menuWidth || rect?.width || 0;
  const panelLeft = rect ? Math.max(8, Math.min(rect.left, viewportW - panelW - 8)) : 0;

  const optionList = (
    <div data-testid={testId ? `${testId}-list` : undefined}>
      {visible.length === 0 && <div className="px-3 py-3 text-sm text-gray-500">{emptyText}</div>}
      {visible.map((o) => {
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
            <span className="min-w-0">
              <span className="block truncate text-sm">{o.label}</span>
              {o.sublabel ? <span className="block truncate text-xs text-gray-500">{o.sublabel}</span> : null}
            </span>
            {on ? <Check size={16} className="shrink-0 text-gold-300" /> : o.badge ? (
              <span className="shrink-0 rounded-md bg-gold-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-gold-200">{o.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  // Buscador dentro de la hoja/panel (solo `searchable`). Autofoco: al abrir, ya se puede tipear.
  const searchBox = searchable ? (
    <div className="relative px-1 pb-2">
      <Search size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        autoFocus
        data-testid={testId ? `${testId}-search` : undefined}
        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold-500/40"
      />
    </div>
  ) : null;

  const toggle = () => (open ? setOpen(false) : openMenu());

  return (
    <div className={`relative ${className}`}>
      {renderTrigger ? (
        renderTrigger({ ref: btnRef, open, toggle })
      ) : (
        <button
          ref={btnRef}
          type="button"
          disabled={disabled}
          data-testid={testId}
          onClick={toggle}
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
      )}

      {/* Móvil: hoja inferior fija (bottom sheet). */}
      {open && mobile && createPortal(
        <>
          <div className="fixed inset-0 z-[300] bg-black/50" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className={`fixed inset-x-0 bottom-0 z-[301] flex flex-col bg-neutral-900 border-t border-gold-500/20 rounded-t-2xl shadow-2xl overscroll-contain p-2 animate-slide-up ${searchable ? 'h-[85vh]' : 'max-h-[70vh]'}`}
            style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="mx-auto mb-2 mt-1 h-1 w-10 shrink-0 rounded-full bg-neutral-600" aria-hidden="true" />
            {placeholder && <p className="shrink-0 px-3 pb-1.5 text-[11px] uppercase tracking-wider text-neutral-500">{placeholder}</p>}
            {searchBox}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{optionList}</div>
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
            className={`fixed z-[301] flex flex-col bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overscroll-contain p-1.5 ${searchable ? 'max-h-96' : 'max-h-60'}`}
            style={{ left: panelLeft, width: panelW, ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }) }}
          >
            {searchBox}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{optionList}</div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
};
