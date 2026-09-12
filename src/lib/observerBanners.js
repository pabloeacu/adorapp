// Lógica pura de los banners de las áreas observadoras (Multimedia / Sonido) en el
// inicio. Decide, según los órdenes programados y el momento actual, QUÉ mensaje
// mostrar por área y a qué orden apuntar el atajo. Sin dependencias de React/DOM →
// testeable en aislamiento. Las ventanas de vida viven en bannerLifetime.js.

import {
  inWindow, observerChangedWindow, observerServiceWindow, rehearsalCardWindow, observerNewWindow,
  serviceStartOf,
} from './bannerLifetime';
import { isMinistrationSong } from './ministration';

const dayOf = (o) => String(o.date).slice(0, 10);

const scheduledSorted = (orders) =>
  (orders || [])
    .filter((o) => o && o.status === 'scheduled' && o.date)
    .slice()
    .sort((a, b) =>
      dayOf(a).localeCompare(dayOf(b)) || String(a.time || '').localeCompare(String(b.time || ''))
    );

// Un orden "cambió" si el trigger le selló content_changed_at DESPUÉS de crearse y estamos
// dentro de la ventana [cambio, inicio del servicio + 2 h). Se omite si el cambio lo hizo
// esta misma persona (contentChangedBy), si ya recibe el aviso de la banda por ese orden
// (`coveredElsewhere`, evita el doble banner) o si el cambio ocurrió con el servicio en
// marcha y el orden tiene ministración (ese cambio ES la ministración: tiene aviso propio).
const recentlyChanged = (o, nowMs, ctx) =>
  !!o.contentChangedAt &&
  (!o.createdAt || String(o.contentChangedAt) > String(o.createdAt)) &&
  inWindow(observerChangedWindow(o), nowMs) &&
  !(ctx?.memberId && o.contentChangedBy === ctx.memberId) &&
  !(ctx?.coveredElsewhere?.(o)) &&
  !(new Date(o.contentChangedAt).getTime() >= (serviceStartOf(o) ?? Infinity) && (o.songs || []).some(isMinistrationSong));

// Devuelve { state, order } para un área observadora, o null si no hay nada relevante.
// Prioridad: cambios recientes > servicio hoy > ensamble hoy (solo Sonido) > orden próximo.
// Cada estado vive SOLO dentro de su ventana (bannerLifetime.js):
//   changed  [cambio, inicio + 2 h)  · service [día 08:00, inicio + 3 h)
//   ensamble [día 08:00, hora + 2 h) · new     [creación, +72 h) y servicio futuro
// `ctx`: { nowMs, todayART, memberId, coveredElsewhere(order) }.
export function pickObserverFocus(area, orders, ctx) {
  if (area !== 'sonido' && area !== 'multimedia') return null;
  const nowMs = ctx?.nowMs ?? Date.now();
  const todayART = ctx?.todayART || '';
  const sched = scheduledSorted(orders);

  // El nudge de cambios manda: el orden cambiado más próximo.
  const changed = sched.find((o) => recentlyChanged(o, nowMs, ctx));
  if (changed) return { state: 'changed', order: changed };

  const serviceNow = sched.find((o) => inWindow(observerServiceWindow(o), nowMs));
  if (serviceNow) return { state: 'service', order: serviceNow };
  if (area === 'sonido') {
    const ensambleNow = sched.find((o) => inWindow(rehearsalCardWindow(o), nowMs));
    if (ensambleNow) return { state: ensambleNow.rehearsalSuspended ? 'ensamble_suspendido' : 'ensamble', order: ensambleNow };
  }
  const nextFuture = sched.find((o) => dayOf(o) > todayART && inWindow(observerNewWindow(o), nowMs));
  if (nextFuture) return { state: 'new', order: nextFuture };
  return null;
}

// Ventanas de todos los estados posibles (para agendar la re-evaluación del banner).
export function observerWindows(orders) {
  const out = [];
  for (const o of orders || []) {
    if (!o || o.status !== 'scheduled') continue;
    out.push(observerChangedWindow(o), observerServiceWindow(o), rehearsalCardWindow(o), observerNewWindow(o));
  }
  return out;
}

// El texto de "cambios" es el MISMO para ambas áreas (cada una con su logo/color).
const CHANGED = {
  title: '¡Ojo! Hubo cambios en el orden.',
  message: '¿Ya los viste? Revisá el orden y la formación para no quedarte afuera de ningún ajuste.',
};

const CONTENT = {
  sonido: {
    changed: CHANGED,
    ensamble: {
      title: '¡Hoy hay ensamble!',
      message: '¿Ya está listo el operador? Mirá la banda y el repertorio del orden.',
    },
    ensamble_suspendido: {
      title: 'Ensamble suspendido',
      message: 'El ensamble de hoy se suspendió. El servicio sigue en pie — revisá el orden.',
    },
    service: {
      title: '¡Hoy hay servicio!',
      message: '¿Está todo listo? Repasá el orden y la formación para afinar los detalles de la mezcla.',
    },
    new: {
      title: '¡Hay un orden nuevo!',
      message: 'Accedé a él para prepararte para tu servicio.',
    },
  },
  multimedia: {
    changed: CHANGED,
    service: {
      title: '¡Hoy hay servicio!',
      message: '¿Está todo listo? Repasá el orden y la formación para saber dónde apuntar las cámaras y pasar las letras como un reloj suizo.',
    },
    new: {
      title: '¡Hay un orden nuevo!',
      message: 'Accedé a él para prepararte para tu servicio. ¿Hay letras por copiar?',
    },
  },
};

export function observerBannerContent(area, state) {
  return (CONTENT[area] && CONTENT[area][state]) || null;
}
