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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pb-20 bg-black/80">
      {/* Modal Container */}
      <div className={`
        relative bg-neutral-900 border border-neutral-800 rounded-2xl
        w-full ${sizes[size]} max-h-[calc(100vh-160px)]
        flex flex-col
        animate-scale-in shadow-2xl
      `}>
        {/* Header - Always visible */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800 shrink-0 bg-neutral-900">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-800 transition-colors text-gray-400"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - Scrollable but leaves room for footer */}
        <div className="flex-1 overflow-y-auto p-4 pb-32">
          {children}
        </div>

        {/* Footer - Always visible at bottom */}
        {footer && (
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-neutral-800 bg-neutral-900 rounded-b-2xl safe-area-bottom">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};