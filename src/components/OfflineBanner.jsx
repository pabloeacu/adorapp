// Aviso global "Sin conexión" (solo lectura, no invasivo). Aparece cuando el teléfono
// pierde internet estando ya dentro de la app y desaparece solo al volver la conexión.
// Con debounce anti-parpadeo (no titila ante microcortes). NO empuja contenido (fixed)
// y no bloquea taps (pointer-events sólo en la píldora). Respeta el notch (safe-area,
// landmine #31). Complementa el manejo de arranque offline (SW cachea el shell +
// initialize cae a la copia local) y los mensajes conscientes de red al guardar.

import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

const isOfflineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export function OfflineBanner() {
  const [offline, setOffline] = useState(isOfflineNow());

  useEffect(() => {
    let t;
    const sync = () => {
      clearTimeout(t);
      // Confirmar el estado 600 ms después para no parpadear ante un microcorte.
      t = setTimeout(() => setOffline(isOfflineNow()), 600);
    };
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      clearTimeout(t);
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
      className="fixed inset-x-0 top-0 z-[250] flex justify-center px-3 pointer-events-none"
      style={{ paddingTop: 'calc(64px + env(safe-area-inset-top, 0px))' }}
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-400/40 bg-neutral-900/95 px-4 py-2 shadow-2xl backdrop-blur">
        <WifiOff size={16} className="text-amber-400 shrink-0" />
        <span className="text-xs font-medium text-amber-100">
          Sin conexión — algunos cambios pueden no guardarse
        </span>
      </div>
    </div>
  );
}

export default OfflineBanner;
