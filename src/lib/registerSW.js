// Service worker registration + progreso de actualización.
//
// El SW hace skipWaiting al instalarse, así que una versión nueva se activa
// sola; cuando toma control (`controllerchange`) recargamos para pasar al build
// nuevo. Cada hito del SW se publica en updateProgress para que la pantalla de
// carga muestre "Actualizando a la nueva versión" con una barra de progreso
// real, antes y después de la recarga. Si además hubiera un SW "waiting"
// (no debería, por el skipWaiting), se avisa a la página como antes.

import { markUpdateStep } from './updateProgress';

const SW_PATH = '/sw.js';

let pendingWorker = null;

export function registerSW() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // Only run in production builds; the dev server has no SW and HMR fights it.
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    // Si ya había un SW controlando la página, cualquier instalación nueva es
    // una ACTUALIZACIÓN (y merece la pantalla de progreso). Si no lo había, es
    // la primera visita: el SW se instala en silencio y no hace falta recargar
    // (la página ya vino fresca de la red).
    const isUpdate = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register(SW_PATH).then((reg) => {
      if (reg.waiting) onWaiting(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        if (isUpdate) markUpdateStep('found');
        if (isUpdate) markUpdateStep('downloading');
        installing.addEventListener('statechange', () => {
          if (!isUpdate) return;
          if (installing.state === 'installed') {
            markUpdateStep('installed');
            if (navigator.serviceWorker.controller) onWaiting(installing);
          } else if (installing.state === 'activating') {
            markUpdateStep('activating');
          }
        });
      });
    }).catch(() => {});

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      if (!isUpdate) return; // primera instalación: sin recarga
      markUpdateStep('reloading');
      // Un respiro para que la barra muestre "Reiniciando…" antes del salto.
      setTimeout(() => window.location.reload(), 250);
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
