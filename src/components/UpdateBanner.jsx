// Toast that appears when the service worker has a newer build waiting.
// Click "actualizar" → SKIP_WAITING → controllerchange → reload.

import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { applyUpdate } from '../lib/registerSW';

export function UpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onAvailable = () => setVisible(true);
    window.addEventListener('adorapp:sw-update-available', onAvailable);
    return () => window.removeEventListener('adorapp:sw-update-available', onAvailable);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[300] flex items-center gap-3 bg-neutral-900 border border-neutral-700 rounded-2xl px-4 py-3 shadow-2xl max-w-sm"
    >
      <RefreshCw size={18} className="text-blue-400 shrink-0" />
      <div className="flex-1 min-w-0 text-sm">
        <div className="font-medium text-white">Hay una nueva versión</div>
        <div className="text-xs text-gray-400 truncate">
          Recargá para usar la última actualización.
        </div>
      </div>
      <button
        type="button"
        onClick={applyUpdate}
        className="text-sm bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-lg shrink-0 focus:outline-none focus:ring-2 focus:ring-white/40"
      >
        Actualizar
      </button>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Descartar"
        className="p-1 text-gray-500 hover:text-white shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
}
