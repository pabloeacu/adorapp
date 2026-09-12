// "¿Con qué ministramos?" — regla de ELEGIBILIDAD del banner (pura, testeable).
//
// Regla de Paul (2026-09-13): durante un servicio EN EJECUCIÓN (orden programado, desde
// la hora de inicio y por 3 horas), el LÍDER de la banda de ese orden (rol 'leader' +
// integrante PERMANENTE de bands.members) y los PASTORES (cualquier banda) ven en el
// Inicio el banner "¿Con qué ministramos?" para elegir la(s) canción(es) de la parte
// final del servicio. El banner aparece a la hora de inicio y desaparece solo 3 h después.
// La RPC `add_ministration_songs` aplica exactamente la misma regla del lado del servidor
// (el cliente solo decide si MOSTRAR el banner).

import { serviceStartEpoch, isBandLeader } from './serviceFeedback';

export const MINISTRATION_WINDOW_MS = 3 * 3600 * 1000;

// Ventana [inicio, inicio + 3 h) del servicio; null si la fecha es inválida.
export const ministrationWindow = (order) => {
  const start = serviceStartEpoch(order?.date, order?.time);
  if (start == null) return null;
  return { start, end: start + MINISTRATION_WINDOW_MS };
};

// ¿Puede esta persona asignar la ministración de este orden? Pastor o líder de la banda.
export const canOfferMinistration = (band, member, role) =>
  !!member?.id && (role === 'pastor' || isBandLeader(band, member, role));

// Orden "en ejecución" elegible AHORA: programado, con banda y hora, dentro de su ventana
// de 3 h y que esta persona pueda gestionar. Con dos en ventana, el de inicio más reciente.
export const resolveMinistrationOrder = (orders, member, role, getBandById, nowMs = Date.now()) => {
  try {
    if (!Array.isArray(orders) || !member?.id || (role !== 'leader' && role !== 'pastor')) return null;
    let best = null, bestStart = -Infinity;
    for (const o of orders) {
      if (!o || o.status !== 'scheduled' || !o.bandId || !o.time) continue;
      const w = ministrationWindow(o);
      if (!w) continue;
      if (nowMs < w.start || nowMs >= w.end) continue;
      if (!canOfferMinistration(getBandById?.(o.bandId), member, role)) continue;
      if (w.start > bestStart) { best = o; bestStart = w.start; }
    }
    return best;
  } catch {
    return null;
  }
};

// ¿Esta referencia de canción dentro del orden es una canción de ministración?
export const isMinistrationSong = (songRef) => songRef?.ministracion === true;

// Tonos aceptados por la RPC (espejo de MUSICAL_KEYS del store y del regex SQL).
export const MINISTRATION_KEY_RE = /^[A-G]#?m?$/;
