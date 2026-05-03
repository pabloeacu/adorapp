// Centralized PWA install plumbing.
//
// Captures `beforeinstallprompt` once (Chrome/Edge/Android) so any UI
// component can later trigger the native install dialog with one call.
// Detects platform so iOS Safari (no API) shows instructions instead.
//
// Registered from main.jsx BEFORE React mounts — Chrome can fire the event
// the moment PWA criteria are met, and that may happen before any component
// has had a chance to attach a listener.

let deferredPrompt = null;
let installed = false;
const subscribers = new Set();

const notify = () => {
  for (const cb of subscribers) {
    try { cb(); } catch { /* a single broken subscriber must not break others */ }
  }
};

export function initInstallPrompt() {
  if (typeof window === 'undefined') return;

  installed = isInstalled();

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome's mini-infobar so we can decide WHEN to show the prompt.
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

export function isInstalled() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari uses a non-standard navigator.standalone flag.
  if (window.navigator?.standalone === true) return true;
  return installed;
}

export function getPlatform() {
  if (typeof window === 'undefined') return 'unknown';
  const ua = window.navigator.userAgent || '';
  // iPadOS 13+ reports as Mac with touch — detect that too.
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && typeof document !== 'undefined' && 'ontouchend' in document);
  if (iOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function canPromptInstall() {
  return deferredPrompt !== null && !isInstalled();
}

// Returns the user's choice: 'accepted' | 'dismissed' | 'unavailable'.
export async function triggerInstall() {
  if (!deferredPrompt) return 'unavailable';
  const evt = deferredPrompt;
  deferredPrompt = null;
  notify();
  try {
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    return outcome;
  } catch {
    return 'dismissed';
  }
}

export function subscribeInstallPrompt(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
