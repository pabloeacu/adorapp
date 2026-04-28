// Pure helpers shared by the orders page and the calendar component.
// Extracted from Ordenes.jsx / OrderCalendar.jsx so they can be unit-tested
// without rendering the surrounding UI.

/**
 * Local-day key for an order's date. Slicing the YYYY-MM-DD prefix when the
 * input already starts with that shape avoids the off-by-one that comes from
 * Date(...).toISOString() drifting across UTC.
 */
export function dayKey(dateLike) {
  if (!dateLike) return '';
  const s = String(dateLike);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Suggest the most-likely director for a song based on history.
 *
 *   `singerIds`  — set of candidate member ids (active members who can sing)
 *   `orders`     — the full orders list (each entry has songs[]: { songId, directorId })
 *   `songId`     — the song we're about to add
 *   `bandId`     — the band the new order is for; band-specific history wins,
 *                  global history is the fallback. Pass `null` to skip the
 *                  band-prefer step.
 *
 * Returns a member id, or `null` when there's no signal.
 */
export function suggestDirectorForSong({ singerIds, orders, songId, bandId }) {
  if (!songId || !singerIds || singerIds.size === 0) return null;

  const tally = (filter) => {
    const counts = new Map();
    for (const o of orders) {
      if (!filter(o)) continue;
      if (!Array.isArray(o.songs)) continue;
      for (const s of o.songs) {
        if (s.songId !== songId || !s.directorId) continue;
        if (!singerIds.has(s.directorId)) continue;
        counts.set(s.directorId, (counts.get(s.directorId) || 0) + 1);
      }
    }
    if (counts.size === 0) return null;
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  return (
    (bandId ? tally((o) => o.bandId === bandId) : null) ||
    tally(() => true) ||
    null
  );
}
