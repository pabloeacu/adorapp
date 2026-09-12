// VENTANAS DE VIDA de los banners del Inicio — fuente única (pura, testeable).
//
// Regla de Paul (2026-09-13): ningún banner "persiste todo el día"; cada uno nace con su
// vencimiento. Todo se calcula en epoch UTC a partir de fechas/horas ART (UTC-3, sin DST)
// con `serviceStartEpoch`, así que no depende de la zona horaria del dispositivo. Cada
// componente evalúa `inWindow(ventana, ahora)` y se re-evalúa solo en el próximo límite
// (`useLifetimeTick`), sin recargar la pantalla.
//
// Esquema aprobado (ver CLAUDE.md, Estado 2026-09-13 (IV)):
//   · "¿Cómo estuvimos?"            [inicio del servicio, +48 h)         → serviceFeedback.js
//   · "¿Con qué ministramos?"       [inicio, +3 h)                        → ministration.js
//   · Aviso de ministración (banda/áreas)  [inicio, +3 h)                 → ministrationNoticeWindow
//   · "Hubo cambios en el orden" (banda)   [cambio, min(cambio+48 h, inicio))  → orderChangedWindow
//   · "¡Hoy tenés ensamble!"        [día del ensamble 08:00, hora del ensamble + 2 h)
//   · "Tu preparación"              [7 días antes del servicio (00:00), inicio del servicio)
//   · Áreas: "¡Ojo! Hubo cambios"   [cambio, inicio del servicio + 2 h)   (ajuste de Paul)
//   · Áreas: "¡Hoy hay servicio!"   [día del servicio 08:00, inicio + 3 h)
//   · Áreas: "¡Hoy hay ensamble!"   = "¡Hoy tenés ensamble!"
//   · Áreas: "¡Hay un orden nuevo!" [creación, +72 h) y solo mientras el servicio sea futuro
//   · Colaboración (resultado)      [decisión, min(decisión+48 h, inicio del servicio)); la ✕ sigue
//   · Cumpleaños                    el día (GreetingHeader, sin cambios)

import { serviceStartEpoch } from './serviceFeedback';
import { MINISTRATION_WINDOW_MS, isMinistrationSong, canOfferMinistration } from './ministration';

export const HOUR_MS = 3600 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const REHEARSAL_TAIL_MS = 2 * HOUR_MS;      // ensamble: hasta 2 h después de su hora
export const PREP_LEAD_MS = 7 * DAY_MS;            // preparación: desde 7 días antes
export const CHANGED_TAIL_MS = 2 * HOUR_MS;        // áreas "¡Ojo!": hasta 2 h después del servicio
export const SERVICE_TAIL_MS = 3 * HOUR_MS;        // áreas "hoy hay servicio": hasta 3 h después
export const NEW_ORDER_MS = 72 * HOUR_MS;          // áreas "orden nuevo": 72 h desde la creación
export const ORDER_CHANGED_MS = 48 * HOUR_MS;      // banda "hubo cambios": 48 h desde el cambio
export const COLLAB_RESULT_MS = 48 * HOUR_MS;      // colaboración: 48 h desde la decisión
export const DAY_START_HOUR = 8;                   // "hoy…": desde las 08:00 ART
export const DAY_END_HOUR = 23;                    // ensamble sin hora: hasta las 23:00 ART

const toMs = (iso) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};

// Epoch UTC de una fecha ART (YYYY-MM-DD) a una hora entera dada.
export const artDayEpoch = (date, hour = 0) => serviceStartEpoch(date, `${String(hour).padStart(2, '0')}:00`);

export const serviceStartOf = (order) => serviceStartEpoch(order?.date, order?.time);

// Inicio del ENSAMBLE (fecha + hora 'HH:MM'); null si no hay fecha. Sin hora → 00:00.
export const rehearsalStartOf = (order) =>
  order?.rehearsalDate ? serviceStartEpoch(order.rehearsalDate, order.rehearsalTime || '00:00') : null;

// Una ventana válida es { start, end } con start < end; null si no aplica.
const win = (start, end) => (start == null || end == null || !(start < end) ? null : { start, end });

export const inWindow = (w, nowMs) => !!w && nowMs >= w.start && nowMs < w.end;

// "¡Hoy tenés ensamble!" / áreas "¡Hoy hay ensamble!": [día 08:00, hora + 2 h); sin hora,
// hasta las 23:00 del día (antes era 08:00–23:00 siempre).
export const rehearsalCardWindow = (order) => {
  if (!order?.rehearsalDate) return null;
  const dayStart = artDayEpoch(order.rehearsalDate, DAY_START_HOUR);
  const end = order.rehearsalTime
    ? rehearsalStartOf(order) + REHEARSAL_TAIL_MS
    : artDayEpoch(order.rehearsalDate, DAY_END_HOUR);
  return win(dayStart, end);
};

// "Tu preparación": [7 días antes del servicio (00:00 ART), inicio del servicio).
export const prepWindow = (order) => {
  const start = serviceStartOf(order);
  if (start == null) return null;
  return win(artDayEpoch(order.date, 0) - PREP_LEAD_MS, start);
};

// Áreas "¡Ojo! Hubo cambios": [cambio, inicio del servicio + 2 h). Ajuste de Paul: arranca
// con el cambio y termina 2 h después de la hora del servicio (no 48 h desde el cambio).
export const observerChangedWindow = (order) => {
  const changed = toMs(order?.contentChangedAt);
  const start = serviceStartOf(order);
  if (changed == null || start == null) return null;
  return win(changed, start + CHANGED_TAIL_MS);
};

// Áreas "¡Hoy hay servicio!": [día del servicio 08:00, inicio + 3 h).
export const observerServiceWindow = (order) => {
  const start = serviceStartOf(order);
  if (start == null) return null;
  return win(artDayEpoch(order.date, DAY_START_HOUR), start + SERVICE_TAIL_MS);
};

// Áreas "¡Hay un orden nuevo!": [creación, +72 h). (Además el servicio debe ser futuro —
// lo decide pickObserverFocus; el día del servicio manda "¡Hoy hay servicio!".)
export const observerNewWindow = (order) => {
  const created = toMs(order?.createdAt);
  if (created == null) return null;
  return win(created, created + NEW_ORDER_MS);
};

// Banda "Hubo cambios en el orden": [cambio, min(cambio + 48 h, inicio del servicio)).
export const orderChangedWindow = (order) => {
  const changed = toMs(order?.contentChangedAt);
  const start = serviceStartOf(order);
  if (changed == null || start == null) return null;
  return win(changed, Math.min(changed + ORDER_CHANGED_MS, start));
};

// Aviso de ministración para quienes la reciben: [inicio del servicio, +3 h).
export const ministrationNoticeWindow = (order) => {
  const start = serviceStartOf(order);
  if (start == null) return null;
  return win(start, start + MINISTRATION_WINDOW_MS);
};

// Colaboración (resultado): [decisión, min(decisión + 48 h, inicio del servicio)); sin
// orden conocido, 48 h desde la decisión. Sin fecha de decisión → sin vencimiento (la ✕ sigue).
export const collabResultWindow = (decidedAtIso, order) => {
  const decided = toMs(decidedAtIso);
  if (decided == null) return null;
  const start = serviceStartOf(order);
  return win(decided, start == null ? decided + COLLAB_RESULT_MS : Math.min(decided + COLLAB_RESULT_MS, start));
};

// Próximo límite (start o end) estrictamente posterior a `nowMs` entre varias ventanas;
// null si no hay ninguno. Sirve para agendar la re-evaluación del banner.
export const nextBoundary = (windows, nowMs) => {
  let best = null;
  for (const w of windows) {
    if (!w) continue;
    for (const t of [w.start, w.end]) {
      if (t > nowMs && (best == null || t < best)) best = t;
    }
  }
  return best;
};

// Próxima medianoche ART (para que "hoy" se recalcule solo al cambiar el día).
export const nextArtMidnight = (nowMs) => {
  const art = new Date(nowMs - 3 * HOUR_MS); // reloj ART en campos UTC
  return Date.UTC(art.getUTCFullYear(), art.getUTCMonth(), art.getUTCDate() + 1, 3, 0, 0);
};

// ── Resolvers de los dos banners nuevos ──────────────────────────────────────────

// Aviso de ministración: órdenes programados EN EJECUCIÓN (ventana de 3 h) con al menos una
// canción de ministración, para quien PARTICIPA del servicio o es de un área observadora,
// y que NO gestiona la ministración (el líder de la banda y el pastor ya ven el banner
// "¿Con qué ministramos?" con lo asignado). Devuelve el más reciente en ventana o null.
export const resolveMinistrationNotice = (orders, member, role, ctx, nowMs = Date.now()) => {
  try {
    if (!Array.isArray(orders) || !member?.id) return null;
    const { getBandById, isOrderParticipant, isObserver } = ctx || {};
    let best = null, bestStart = -Infinity;
    for (const o of orders) {
      if (!o || o.status !== 'scheduled' || !o.bandId) continue;
      if (!Array.isArray(o.songs) || !o.songs.some(isMinistrationSong)) continue;
      const w = ministrationNoticeWindow(o);
      if (!inWindow(w, nowMs)) continue;
      if (canOfferMinistration(getBandById?.(o.bandId), member, role)) continue;
      const participates = !!isOrderParticipant?.(o, member.id);
      if (!participates && !isObserver) continue;
      if (w.start > bestStart) { best = o; bestStart = w.start; }
    }
    return best;
  } catch {
    return null;
  }
};

// "Hubo cambios en el orden" para la BANDA: órdenes programados cuyo contenido/formación
// cambió (sello de la base) dentro de su ventana, para la banda efectiva ∪ pastores,
// EXCLUYENDO a quien hizo el cambio. Devuelve los órdenes (cambio más reciente primero).
export const resolveOrderChanged = (orders, member, role, ctx, nowMs = Date.now()) => {
  try {
    if (!Array.isArray(orders) || !member?.id) return [];
    const { getEffectiveBandMemberIds } = ctx || {};
    const out = [];
    for (const o of orders) {
      if (!o || o.status !== 'scheduled' || !o.bandId) continue;
      if (o.contentChangedBy && o.contentChangedBy === member.id) continue;
      const w = orderChangedWindow(o);
      if (!inWindow(w, nowMs)) continue;
      if (role !== 'pastor') {
        const ids = getEffectiveBandMemberIds?.(o.bandId);
        const inBand = ids && typeof ids.has === 'function' ? ids.has(member.id) : Array.isArray(ids) && ids.includes(member.id);
        if (!inBand) continue;
      }
      out.push(o);
    }
    return out.sort((a, b) => String(b.contentChangedAt).localeCompare(String(a.contentChangedAt)));
  } catch {
    return [];
  }
};
