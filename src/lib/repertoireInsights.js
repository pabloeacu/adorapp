// Radiografía del repertorio — cálculo PURO y de solo-lectura.
// Recibe las canciones y las órdenes (tal como viven en el store, ya convertidas
// a camelCase) y devuelve estadísticas de balance por clima y de rotación/uso.
// NO escribe nada, no toca converters ni la base: sólo agrega en memoria.
//
// El uso se deriva SIEMPRE recorriendo orders.songs[] (la fuente de verdad), no
// del campo best-effort songs.lastUsed (que sólo se setea al crear una orden y no
// se revierte al borrarla). `now` es inyectable para tests deterministas.

// Los 13 climas reales del repertorio (claves EXACTAS como vienen en song.categories).
export const CLIMATE_LABELS = {
  adoracion: 'Adoración',
  intimidad: 'Intimidad',
  alabanza: 'Alabanza',
  humillacion: 'Humillación',
  lenta: 'Lenta',
  rapida: 'Rápida',
  festivas: 'Festivas',
  testimonial: 'Testimonial',
  guerra: 'Guerra',
  ofrenda: 'Ofrenda',
  santa_cena: 'Santa Cena',
  pascua: 'Pascua',
  coritos: 'Coritos',
};
export const CLIMATE_KEYS = Object.keys(CLIMATE_LABELS);

// Umbrales (en semanas / cantidades). Tuneables: son la definición de cada grupo.
// Se calibran con el uso real; hoy el ministerio tiene poca historia y casi todo
// cae en "sin estrenar" — es honesto y se afina solo a medida que se cargan órdenes.
export const THRESHOLDS = {
  freshWeeks: 6,        // usada dentro de las últimas 6 semanas → en rotación
  riskWeeks: 16,        // 6–16 semanas sin sonar → en riesgo de olvido; más → dormida
  overuseCount: 3,      // usada >= 3 veces...
  overuseWindowWeeks: 8, // ...dentro de las últimas 8 semanas → sobreutilizada
};

const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
const parseDate = (d) => (d ? new Date(`${d}T00:00:00`) : null);
const weeksBetween = (a, b) => (b - a) / MS_WEEK;
const addDays = (date, days) => {
  const c = new Date(date);
  c.setDate(c.getDate() + days);
  return c;
};

export function computeRepertoireInsights(songs = [], orders = [], now = new Date(), thresholds = THRESHOLDS) {
  const t = { ...THRESHOLDS, ...thresholds };
  const total = songs.length;
  const byId = new Map(songs.map((s) => [s.id, s]));

  // Órdenes YA sonadas: no canceladas y con fecha en o antes de hoy.
  const played = orders.filter(
    (o) => o && o.status !== 'cancelled' && o.date && parseDate(o.date) <= now
  );

  // Uso por canción: veces tocada, última vez, y veces en la ventana de sobreuso.
  const usage = new Map();
  const overuseCutoff = addDays(now, -t.overuseWindowWeeks * 7);
  for (const o of played) {
    const d = parseDate(o.date);
    for (const entry of o.songs || []) {
      const id = entry && entry.songId;
      if (!id) continue;
      const u = usage.get(id) || { uses: 0, lastUse: null, recentUses: 0 };
      u.uses += 1;
      if (!u.lastUse || d > u.lastUse) u.lastUse = d;
      if (d >= overuseCutoff) u.recentUses += 1;
      usage.set(id, u);
    }
  }

  // Grupos de rotación, MUTUAMENTE EXCLUYENTES (suman el total del repertorio).
  const freshCut = addDays(now, -t.freshWeeks * 7);
  const riskCut = addDays(now, -t.riskWeeks * 7);
  const lists = { saludable: [], sobreutilizada: [], enRiesgo: [], dormida: [], sinEstrenar: [] };
  for (const s of songs) {
    const u = usage.get(s.id);
    if (!u || u.uses === 0) { lists.sinEstrenar.push({ id: s.id, title: s.title }); continue; }
    if (u.recentUses >= t.overuseCount) { lists.sobreutilizada.push({ id: s.id, title: s.title, uses: u.recentUses }); continue; }
    if (u.lastUse >= freshCut) { lists.saludable.push({ id: s.id, title: s.title }); continue; }
    if (u.lastUse >= riskCut) { lists.enRiesgo.push({ id: s.id, title: s.title, weeks: Math.floor(weeksBetween(u.lastUse, now)) }); continue; }
    lists.dormida.push({ id: s.id, title: s.title, weeks: Math.floor(weeksBetween(u.lastUse, now)) });
  }

  // Balance por clima = COBERTURA (cuántas canciones sirven para cada clima). Una
  // canción puede servir para varios climas, así que NO suma 100% (es a propósito).
  const clima = CLIMATE_KEYS.map((key) => {
    const count = songs.filter((s) => Array.isArray(s.categories) && s.categories.includes(key)).length;
    return { key, label: CLIMATE_LABELS[key], count, pct: total ? Math.round((count / total) * 100) : 0 };
  }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  // Última vez que sonó un clima en una orden (para las sugerencias de balance).
  const climaLast = {};
  for (const o of played) {
    const d = parseDate(o.date);
    for (const entry of o.songs || []) {
      const song = byId.get(entry && entry.songId);
      if (!song || !Array.isArray(song.categories)) continue;
      for (const cat of song.categories) {
        if (!climaLast[cat] || d > climaLast[cat]) climaLast[cat] = d;
      }
    }
  }
  // Sólo climas para los que TENÉS canciones (no tiene sentido sugerir uno vacío).
  const haveClima = new Set(clima.filter((c) => c.count > 0).map((c) => c.key));
  const climaGaps = CLIMATE_KEYS.filter((k) => haveClima.has(k))
    .map((key) => {
      const last = climaLast[key] || null;
      return {
        key,
        label: CLIMATE_LABELS[key],
        everPlayed: !!last,
        weeksSince: last ? Math.floor(weeksBetween(last, now)) : null,
      };
    })
    // Primero los que nunca sonaron, luego por más tiempo sin sonar.
    .sort((a, b) => {
      if (a.everPlayed !== b.everPlayed) return a.everPlayed ? 1 : -1;
      return (b.weeksSince || 0) - (a.weeksSince || 0);
    });

  // Span de historia (para avisar con honestidad cuando hay poco dato de uso).
  const playedDates = played.map((o) => parseDate(o.date)).filter(Boolean).sort((a, b) => a - b);
  const historyWeeks = playedDates.length ? Math.max(1, Math.round(weeksBetween(playedDates[0], now))) : 0;

  return {
    total,
    playedOrders: played.length,
    historyWeeks,
    buckets: {
      saludable: lists.saludable.length,
      sobreutilizada: lists.sobreutilizada.length,
      enRiesgo: lists.enRiesgo.length,
      dormida: lists.dormida.length,
      sinEstrenar: lists.sinEstrenar.length,
    },
    lists,
    clima,
    climaGaps,
  };
}
