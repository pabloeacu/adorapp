import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// ---- Shared browser-history coordination for ALL <Modal> instances ----
// Each open modal pushes a dummy history entry so the mobile back gesture /
// Android back button CLOSES the top-most modal instead of navigating away.
//
// The listener is registered ONCE at module level (not one per modal). This is
// what makes modal→modal transitions correct: when a closing modal pops its own
// dummy entry with history.back(), that fires a popstate. A per-modal listener
// on a just-opened modal would mistake it for a user "back" and close itself —
// that was the "Perfil → Cambiar Contraseña no abre" bug (the second modal shut
// instantly). Here we count programmatic backs and absorb their popstate instead
// of treating them as a user back.
const openModalStack = [];        // { close }; top of stack = most recently opened
let programmaticBackPending = 0;  // # of history.back() we triggered ourselves
let popstateListenerBound = false;

function ensureModalPopstateListener() {
  if (popstateListenerBound) return;
  popstateListenerBound = true;
  window.addEventListener('popstate', () => {
    if (programmaticBackPending > 0) {
      // Our own cleanup popped a dummy entry — not a user back. Absorb it.
      programmaticBackPending--;
      return;
    }
    const top = openModalStack[openModalStack.length - 1];
    if (top) top.close();          // real user back → close the top-most modal
  });
}

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  footer
}) => {
  // Keep the latest onClose in a ref so the history effect can stay keyed only
  // on `isOpen` (onClose is usually an inline arrow recreated every render; if
  // it were a dependency we'd push a new history entry on every render).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Lock body scroll while open.
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Integrate with browser history so the mobile back gesture / Android back
  // button CLOSES this modal instead of navigating to the previous route.
  // On open we push a dummy entry and register ourselves on the shared stack;
  // the single module-level popstate listener closes the top modal on a real
  // back. If the modal is closed another way (X, Escape, programmatically, or
  // because another modal opened over this flow), the cleanup pops our dummy
  // entry — and that programmatic back() is absorbed, not treated as a user
  // back, so it never closes a sibling modal.
  useEffect(() => {
    if (!isOpen) return;

    ensureModalPopstateListener();
    const entry = { close: () => onCloseRef.current?.() };
    openModalStack.push(entry);
    window.history.pushState({ adorappModal: true }, '');

    return () => {
      const i = openModalStack.indexOf(entry);
      if (i !== -1) openModalStack.splice(i, 1);
      if (window.history.state && window.history.state.adorappModal) {
        // Our dummy entry is still on top (closed via X/Escape/programmatically);
        // pop it. The resulting popstate is absorbed by programmaticBackPending
        // so it never closes another modal. Same URL → the router won't navigate.
        programmaticBackPending++;
        window.history.back();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  // Rendered through a portal to <body> so `position: fixed` is always
  // relative to the viewport. Rendered inline, a transformed/animated ancestor
  // would become the containing block and the overlay (and its close button)
  // could scroll out of view on mobile.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 pb-20 bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      // En iPhone (PWA standalone, status bar black-translucent) el contenido
      // fluye DEBAJO del status bar. Con contenido alto el modal queda pegado
      // al borde superior y el botón "Cerrar" cae rozando la zona del status
      // bar / gesto del sistema: iOS se come el primer tap (reporte de Paul,
      // misma clase de bug que el "Guardar" del recortador bajo el notch).
      // El safe-area-inset-top corre todo el card por debajo de esa zona.
      // En pantallas sin notch env() = 0 → idéntico a antes.
      style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
    >
      {/* Modal Container.
          - max-h uses 100dvh (dynamic viewport) so iOS soft-keyboard does
            not push the footer below the visible area.
          - explicit padding-bottom from env(safe-area-inset-bottom) so the
            footer never overlaps the home indicator on notched phones. */}
      <div
        className={`
        relative bg-neutral-900 border border-neutral-800 rounded-2xl
        w-full ${sizes[size]} max-h-[calc(100dvh-160px)]
        flex flex-col
        animate-scale-in shadow-2xl
      `}
        // El max-height también descuenta el inset superior: con el card
        // corrido hacia abajo, sin esto podría no entrar en el alto visible.
        style={{ maxHeight: 'calc(100dvh - 160px - env(safe-area-inset-top, 0px))' }}
      >
        {/* Header — shrink-0 so it stays pinned at the top of the card; the
            close button is always visible regardless of content scroll. */}
        <div className="flex items-center justify-between gap-3 p-4 border-b border-neutral-800 shrink-0 bg-neutral-900 rounded-t-2xl">
          <h2 id="modal-title" className="text-lg font-semibold text-white min-w-0 truncate">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-neutral-800 transition-colors text-gray-400 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            <X size={20} />
            <span className="text-sm font-medium lg:hidden">Cerrar</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>

        {/* Footer — an in-flow flex child (shrink-0), NOT absolute, so the
            content area (flex-1) is sized between header and footer and scrolls
            on its own. Absolute positioning used to overlap the last fields. */}
        {footer && (
          <div
            className="shrink-0 p-4 border-t border-neutral-800 bg-neutral-900 rounded-b-2xl"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
