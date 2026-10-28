// "Lado B" del navegador de canciones sin usar: advertir la REPETICIÓN de una
// canción al armar un orden. Lógica PURA, solo lectura (no escribe nada).
//
// Decisiones de producto (Paul, 2026-10-28):
// - Conteo GLOBAL (todas las bandas): la monotonía la siente la congregación,
//   que escucha distintas bandas a lo largo de la semana.
// - Umbral: "más de 5 veces en los últimos 120 días" → avisa a partir de la 6ª.
// - No bloquea: es un aviso para reevaluar (el líder decide).

export const OVERUSE_THRESHOLD = 5; // "más de 5" → isOverused usa `count > 5`
export const OVERUSE_WINDOW_DAYS = 120;

// Fecha 'YYYY-MM-DD' en hora LOCAL a `days` días de `nowMs`. Comparación
// lexicográfica de strings (igual que getUnusedByBand/bandLastUseMap) → evita el
// off-by-one de TZ de `new Date('YYYY-MM-DD')` (se interpreta en UTC; landmine #50).
const dayStr = (ms, days = 0) => {
  const d = new Date(ms);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Cuenta en cuántas órdenes (de CUALQUIER banda) se usó `songId` dentro de los
// últimos `days` días: ventana [hoy-days, hoy], excluyendo canceladas, sin fecha,
// futuras, y la orden que se está editando (`excludeOrderId`). `nowMs` inyectable.
export const countRecentUses = (
  orders,
  songId,
  { days = OVERUSE_WINDOW_DAYS, nowMs, excludeOrderId = null } = {},
) => {
  if (!songId || !orders) return 0;
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const from = dayStr(now, days);
  const to = dayStr(now, 0); // hoy: no contar fechas futuras
  let n = 0;
  for (const o of orders) {
    if (!o || (excludeOrderId != null && o.id === excludeOrderId)) continue;
    if (o.status === 'cancelled' || !o.date) continue;
    const d = String(o.date).slice(0, 10);
    if (d < from || d > to) continue;
    if ((o.songs || []).some((s) => s && s.songId === songId)) n += 1;
  }
  return n;
};

// ¿Supera el umbral? ("más de 5" = estrictamente mayor).
export const isOverused = (count, threshold = OVERUSE_THRESHOLD) => count > threshold;
