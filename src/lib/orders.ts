// Pure helpers shared by the orders page and the calendar component.
// Extracted from Ordenes.jsx / OrderCalendar.jsx so they can be unit-tested
// without rendering the surrounding UI.

/**
 * Local-day key for an order's date. Slicing the YYYY-MM-DD prefix when the
 * input already starts with that shape avoids the off-by-one that comes from
 * Date(...).toISOString() drifting across UTC.
 */
export function dayKey(dateLike: string | number | Date | null | undefined): string {
  if (!dateLike) return '';
  const s = String(dateLike);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(dateLike as string | number | Date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type OrderSongRef = {
  songId: string;
  directorId?: string | null;
};

export type OrderForSuggestion = {
  bandId?: string | null;
  songs?: OrderSongRef[] | null;
};

export type SuggestDirectorArgs = {
  singerIds: Set<string>;
  orders: OrderForSuggestion[];
  songId: string;
  bandId?: string | null;
};

/**
 * Suggest the most-likely director for a song based on history.
 *
 * Prefers the director who has led it most often in the chosen band; falls
 * back to most-frequent across any band. Returns null when the song has
 * never been led, or when no candidate is in the active singers set.
 */
export function suggestDirectorForSong({
  singerIds,
  orders,
  songId,
  bandId,
}: SuggestDirectorArgs): string | null {
  if (!songId || !singerIds || singerIds.size === 0) return null;

  const tally = (filter: (o: OrderForSuggestion) => boolean): string | null => {
    const counts = new Map<string, number>();
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
