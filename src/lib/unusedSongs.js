// Navegador de "canciones sin usar" para armar un orden — lógica PURA (sin React).
// La sugerencia (getUnusedByBand en el store) devuelve TODAS las canciones que la
// banda no tocó en las últimas N semanas (suele ser casi todo el repertorio). Acá
// se la hace navegable: ordenada por "la más olvidada primero", con "hace cuánto",
// filtrable por texto (indistinto a tildes) y por categoría/clima.

import { matchesSearch } from './searchText';

// Mapa songId -> fecha ISO ('YYYY-MM-DD') de la ÚLTIMA vez que ESTA banda usó la
// canción (según sus órdenes). Las fechas son 'YYYY-MM-DD' → comparan lexicográfico.
export const bandLastUseMap = (orders, bandId) => {
  const map = new Map();
  if (!bandId) return map;
  for (const o of orders || []) {
    if (o?.bandId !== bandId || !o?.date) continue;
    const d = String(o.date).slice(0, 10);
    for (const s of o.songs || []) {
      const id = s?.songId;
      if (!id) continue;
      const prev = map.get(id);
      if (!prev || d > prev) map.set(id, d);
    }
  }
  return map;
};

// Etiqueta amable del último uso: "nunca con esta banda" / "esta semana" /
// "hace N semanas" / "hace N meses". `nowMs` = Date.now() (inyectable para test).
export const lastUseLabel = (isoDate, nowMs) => {
  if (!isoDate) return 'nunca con esta banda';
  const then = new Date(String(isoDate).slice(0, 10) + 'T00:00:00').getTime();
  if (Number.isNaN(then)) return 'nunca con esta banda';
  const days = Math.max(0, Math.floor((nowMs - then) / 86400000));
  if (days <= 6) return 'esta semana';
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
  const months = Math.max(2, Math.round(days / 30));
  return `hace ${months} meses`;
};

// Ordena por "la más olvidada primero": nunca-con-esta-banda arriba, después por
// último uso más antiguo. Desempate por título (es). No muta el array original.
export const rankUnused = (songs, bandLastUse) => {
  const lu = bandLastUse || new Map();
  return [...(songs || [])].sort((a, b) => {
    const da = lu.get(a.id) || ''; // '' (nunca) ordena primero
    const db = lu.get(b.id) || '';
    if (da !== db) return da < db ? -1 : 1;
    return (a.title || '').localeCompare(b.title || '', 'es');
  });
};

// Filtra por texto (título/artista, indistinto a tildes) y por categoría (id de clima).
export const filterUnused = (songs, { query = '', category = null } = {}) =>
  (songs || []).filter((s) =>
    (!category || (s.categories || []).includes(category)) &&
    matchesSearch(query, s.title, s.artist));

// Categorías/climas presentes en el set, en el orden de `allCategories`, con conteo.
// `allCategories` = SONG_CATEGORIES ([{ id, label, ... }]).
export const categoriesPresent = (songs, allCategories) => {
  const counts = new Map();
  for (const s of songs || []) for (const c of s?.categories || []) counts.set(c, (counts.get(c) || 0) + 1);
  return (allCategories || [])
    .filter((c) => counts.has(c.id))
    .map((c) => ({ ...c, count: counts.get(c.id) }));
};
