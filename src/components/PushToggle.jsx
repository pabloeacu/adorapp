// Notification permission + push subscribe toggle for the profile sheet.
// Three states reflected in the UI:
//   * unsupported   → grey, no button (e.g. iOS Safari < 16.4 in non-PWA mode)
//   * not-subscribed → "Activar notificaciones"
//   * subscribed    → "Desactivar notificaciones"
//
// Permission "denied" is treated like unsupported, with a hint explaining how
// to re-enable it from the browser, since requestPermission() will not prompt
// again once denied.

import React, { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  isPushSupported,
  notificationPermission,
  subscribePush,
  unsubscribePush,
  isCurrentlySubscribed,
} from '../lib/push';

export function PushToggle({ memberId }) {
  const [supported, setSupported] = useState(false);
  const [perm, setPerm] = useState('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSupported(isPushSupported());
    setPerm(notificationPermission());
    isCurrentlySubscribed().then(setSubscribed);
  }, []);

  if (!supported) {
    return (
      <div className="text-xs text-gray-500 px-1">
        Las notificaciones no están disponibles en este dispositivo.
      </div>
    );
  }

  if (perm === 'denied') {
    return (
      <div className="text-xs text-gray-500 px-1">
        Las notificaciones fueron bloqueadas. Habilitalas desde la configuración de este sitio en tu navegador.
      </div>
    );
  }

  const onActivate = async () => {
    setError('');
    setBusy(true);
    try {
      await subscribePush(memberId);
      setSubscribed(true);
      setPerm(notificationPermission());
    } catch (e) {
      setError(e.message || 'No se pudo activar');
    } finally {
      setBusy(false);
    }
  };

  const onDeactivate = async () => {
    setError('');
    setBusy(true);
    try {
      await unsubscribePush();
      setSubscribed(false);
    } catch (e) {
      setError(e.message || 'No se pudo desactivar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={subscribed ? onDeactivate : onActivate}
        disabled={busy || !memberId}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-gray-300 hover:text-white transition-colors text-sm font-medium disabled:opacity-60"
      >
        {subscribed ? <BellOff size={16} /> : <Bell size={16} />}
        <span>
          {busy
            ? 'Procesando…'
            : subscribed
            ? 'Desactivar notificaciones'
            : 'Activar notificaciones'}
        </span>
      </button>
      {error && <p className="text-xs text-red-400 px-1">{error}</p>}
    </div>
  );
}
