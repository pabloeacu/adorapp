// Service worker registration + update prompt wiring.
//
// On registration we listen for a `waiting` SW (a new build sitting behind
// the active one) and notify the page so it can show a "actualizar" toast.
// The page calls `applyUpdate()` to send SKIP_WAITING — once the SW takes
// control we reload to swap the active client to the new build.

const SW_PATH = '/sw.js';

let pendingWorker = null;

export function registerSW() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // Only run in production builds; the dev server has no SW and HMR fights it.
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_PATH).then((reg) => {
      // If a new SW is already waiting at first load, surface it.
      if (reg.waiting) onWaiting(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (
            installing.state === 'installed' &&
            navigator.serviceWorker.controller // there's already an active SW
          ) {
            onWaiting(installing);
          }
        });
      });
    }).catch(() => {});

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

function onWaiting(worker) {
  pendingWorker = worker;
  window.dispatchEvent(new CustomEvent('adorapp:sw-update-available'));
}

export function applyUpdate() {
  if (pendingWorker) pendingWorker.postMessage('SKIP_WAITING');
}
