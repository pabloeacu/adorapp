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

// ─────────────────────────────────────────────────────────────────────────
// "Choque" de agenda: la MISMA canción ya está en un orden MUY CERCANO en el
// tiempo (±N días alrededor de hoy: pasado reciente Y órdenes próximas ya
// cargadas). A diferencia de countRecentUses (frecuencia, 120 días, solo
// pasado), esto cuida que dos líderes no se pisen al armar sus órdenes sin
// mirar lo ya publicado. NO bloquea: es un aviso para reevaluar.
//
// Decisiones de producto (Paul, 2026-10-31):
// - Ventana: ±4 días alrededor de hoy (pasado reciente + próximas órdenes).
// - Dispara con UNA sola aparición (no hay umbral de cantidad).
// - El cartel dice CUÁNDO fue y QUÉ banda la tiene (relación entre líderes).

export const COLLISION_WINDOW_DAYS = 4;

// Fecha 'YYYY-MM-DD' → Date a medianoche LOCAL (evita el off-by-one de TZ de
// new Date('YYYY-MM-DD'), que se interpreta en UTC; mismo criterio que dayStr).
const toLocalMidnight = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Diferencia en días (con signo) entre `dateStr` y HOY (negativo = pasado,
// positivo = futuro), ambos tomados a medianoche LOCAL.
const dayDiffFromToday = (nowMs, dateStr) =>
  Math.round((toLocalMidnight(dateStr) - toLocalMidnight(dayStr(nowMs, 0))) / 86400000);

// Órdenes (de CUALQUIER banda) que YA tienen `songId` dentro de la ventana
// [hoy-days, hoy+days], excluyendo canceladas, sin fecha y la orden en edición.
// Cada entrada: { orderId, bandId, date, dayDiff }. Ordenadas por cercanía a
// hoy (y, a igualdad, el pasado antes que el futuro). `nowMs` inyectable.
export const findRecentCollisions = (
  orders,
  songId,
  { days = COLLISION_WINDOW_DAYS, nowMs, excludeOrderId = null } = {},
) => {
  if (!songId || !orders) return [];
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const from = dayStr(now, days);    // hoy - days
  const to = dayStr(now, -days);     // hoy + days
  const out = [];
  for (const o of orders) {
    if (!o || (excludeOrderId != null && o.id === excludeOrderId)) continue;
    if (o.status === 'cancelled' || !o.date) continue;
    const d = String(o.date).slice(0, 10);
    if (d < from || d > to) continue;
    if ((o.songs || []).some((s) => s && s.songId === songId)) {
      out.push({ orderId: o.id, bandId: o.bandId ?? null, date: d, dayDiff: dayDiffFromToday(now, d) });
    }
  }
  out.sort((a, b) => Math.abs(a.dayDiff) - Math.abs(b.dayDiff) || a.dayDiff - b.dayDiff);
  return out;
};

// Etiqueta humana del "cuándo" relativo a hoy.
export const collisionWhenLabel = (dayDiff) => {
  if (dayDiff === 0) return 'hoy';
  if (dayDiff === -1) return 'ayer';
  if (dayDiff === 1) return 'mañana';
  if (dayDiff < 0) return `hace ${-dayDiff} días`;
  return `en ${dayDiff} días`;
};
