import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

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
  // button CLOSES the modal instead of navigating to the previous route.
  // On open we push a dummy history entry; a back press pops it and fires
  // popstate, which we turn into onClose(). If the modal is closed another way
  // (the X, Escape, programmatically), the dummy entry is still on the stack,
  // so the cleanup pops it to keep history clean.
  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState({ adorappModal: true }, '');

    const onPopState = () => {
      onCloseRef.current?.();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      if (window.history.state && window.history.state.adorappModal) {
        // Closed via X/Escape/programmatically — our dummy entry is still
        // there; pop it (same URL, so the router doesn't navigate).
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
    >
      {/* Modal Container.
          - max-h uses 100dvh (dynamic viewport) so iOS soft-keyboard does
            not push the footer below the visible area.
          - explicit padding-bottom from env(safe-area-inset-bottom) so the
            footer never overlaps the home indicator on notched phones. */}
      <div className={`
        relative bg-neutral-900 border border-neutral-800 rounded-2xl
        w-full ${sizes[size]} max-h-[calc(100dvh-160px)]
        flex flex-col
        animate-scale-in shadow-2xl
      `}>
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
        <div className="flex-1 overflow-y-auto p-4 pb-32">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className="absolute bottom-0 left-0 right-0 p-4 border-t border-neutral-800 bg-neutral-900 rounded-b-2xl"
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
