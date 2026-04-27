import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  footer
}) => {
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

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
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
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800 shrink-0 bg-neutral-900">
          <h2 id="modal-title" className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 rounded-lg hover:bg-neutral-800 transition-colors text-gray-400 focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            <X size={20} />
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
    </div>
  );
};