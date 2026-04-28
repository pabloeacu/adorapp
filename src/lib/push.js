// Client-side Web Push helpers.
//
// The VAPID public key is intentionally hardcoded: it is not a secret, and
// keeping it in source means the file is cacheable and the SW doesn't need
// a network round-trip just to know its application server key.

import { supabase } from './supabase';

export const VAPID_PUBLIC_KEY =
  'BCdY7UbAiOztspfHCDSTmTd6svGXm_ZyygH3XcS2ahL2YUw1JS9odMBg98cw8jXEkaXy3zmyCS8Psm3wdARm80g';

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function notificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufferToB64Url(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Subscribe the current device for push. Idempotent: if a subscription already
// exists, we reuse it; we always upsert the row in push_subscriptions so the
// last_seen_at gets refreshed.
export async function subscribePush(memberId) {
  if (!isPushSupported()) throw new Error('Push no soportado en este dispositivo');
  if (!memberId) throw new Error('No member id');

  const reg = await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Permiso denegado');
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh ?? bufferToB64Url(sub.getKey('p256dh'));
  const auth = json.keys?.auth ?? bufferToB64Url(sub.getKey('auth'));

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      member_id: memberId,
      endpoint: sub.endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  );
  if (error) throw error;
  return sub.endpoint;
}

export async function unsubscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export async function isCurrentlySubscribed() {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}
