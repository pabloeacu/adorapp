// Feedback post-servicio ("¿Cómo estuvimos?") — regla de ELEGIBILIDAD (pura, testeable).
//
// Regla de Paul (2026-09-12): la tarjeta se le ofrece al LÍDER de la banda que tuvo el
// servicio (rol 'leader' + integrante PERMANENTE de `bands.members`) y a los PASTORES
// (cualquier banda: "los pastores tienen que poder hacer y recibir todo"), durante las
// 48 horas siguientes a la hora del servicio, y después desaparece sola. Ni miembros, ni
// líderes de otras bandas, ni temporales. La Edge Function `send-service-feedback`
// aplica exactamente la misma regla del lado del servidor (el cliente solo decide si
// MOSTRAR la tarjeta).

export const FEEDBACK_WINDOW_MS = 48 * 3600 * 1000;

// Epoch (ms, UTC) del inicio del servicio expresado en hora de Argentina (UTC-3, sin
// DST → UTC = ART + 3 h). Permite comparar contra Date.now() sin depender de la TZ del
// dispositivo.
export const serviceStartEpoch = (date, time) => {
  if (!date) return null;
  const [Y, M, D] = String(date).slice(0, 10).split('-').map(Number);
  if (!Y || !M || !D) return null;
  const [h, mi] = String(time || '00:00').split(':').map(Number);
  return Date.UTC(Y, M - 1, D, (h || 0) + 3, mi || 0);
};

// Ventana [inicio, inicio + 48 h) del servicio; null si la fecha es inválida.
export const feedbackWindow = (order) => {
  const start = serviceStartEpoch(order?.date, order?.time);
  if (start == null) return null;
  return { start, end: start + FEEDBACK_WINDOW_MS };
};

// ¿Es esta persona el líder de la banda del orden? (rol líder + miembro permanente)
export const isBandLeader = (band, member, role) =>
  role === 'leader' && !!member?.id && Array.isArray(band?.members) && band.members.includes(member.id);

// ¿Puede esta persona dar la devolución de este orden? Pastor (cualquier banda) o líder
// de la banda. Espejo exacto del gate de la Edge Function.
export const canGiveFeedback = (band, member, role) =>
  !!member?.id && (role === 'pastor' || isBandLeader(band, member, role));

// Orden elegible para ofrecer feedback AHORA: el de inicio más reciente entre los que
// están dentro de su ventana de 48 h y que esta persona puede evaluar.
export const resolveFeedbackOrder = (orders, member, role, getBandById, nowMs = Date.now()) => {
  try {
    if (!Array.isArray(orders) || !member?.id || (role !== 'leader' && role !== 'pastor')) return null;
    let best = null, bestStart = -Infinity;
    for (const o of orders) {
      if (!o || o.status === 'cancelled' || !o.bandId) continue;
      const w = feedbackWindow(o);
      if (!w) continue;
      if (nowMs < w.start || nowMs >= w.end) continue;   // todavía no empezó / ya pasaron 48 h
      if (!canGiveFeedback(getBandById?.(o.bandId), member, role)) continue;
      if (w.start > bestStart) { best = o; bestStart = w.start; }
    }
    return best;
  } catch {
    return null;
  }
};
