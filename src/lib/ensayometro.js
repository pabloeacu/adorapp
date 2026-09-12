// Ensayómetro — cálculo PURO del progreso de práctica, fuente ÚNICA compartida por
// la pantalla "Mi Ensayo" (Practica.jsx) y el banner de preparación del Dashboard.
//
// ⚠️ ESPEJO MANUAL del cron server-side send_practice_reminders()
// (última versión en supabase/migrations/20260913_ministracion_y_ensayometro.sql): la
// definición de los hitos (4, o 3 para quien solo canta), `_singer_only` y el redondeo
// del % TIENEN que quedar en sincronía con ese SQL (landmine #27).
// Si cambiás la fórmula acá, cambiala también allá. Sin React ni Supabase.

export const MILESTONES_PER_SONG = 4;
export const MILESTONES_PER_SONG_SINGER = 3;

// Categorías "de canto": si TODOS los instrumentos de la persona en ESE orden son de esta
// lista (y tiene al menos uno), "Frases y arreglos" no cuenta para su progreso (decisión
// de Paul, 2026-09-13). Con cualquier instrumento además de la voz, cuentan los 4 hitos.
// Sin instrumento cargado → se la trata como músico (4 hitos). ESPEJO de _singer_only() en SQL.
export const SINGER_INSTRUMENTS = ['Voz', 'Coros'];

export const isSingerOnly = (instruments) => {
  const list = Array.isArray(instruments) ? instruments.filter(Boolean) : [];
  return list.length > 0 && list.every((i) => SINGER_INSTRUMENTS.includes(i));
};

export const milestonesPerSong = (singer = false) => (singer ? MILESTONES_PER_SONG_SINGER : MILESTONES_PER_SONG);

// Hitos por canción: al menos una pasada + los checks de dominio (3 para músicos; para
// quien solo canta, "Frases y arreglos" no cuenta aunque esté marcado).
export const milestonesOf = (log, singer = false) => {
  if (!log) return 0;
  return (
    (log.timesPracticed > 0 ? 1 : 0) +
    (log.knowsLyrics ? 1 : 0) +
    (log.knowsStructure ? 1 : 0) +
    (!singer && log.knowsArrangements ? 1 : 0)
  );
};

// IDs de canción únicos de un orden (dedup por songId, ignorando vacíos).
export const uniqueSongIds = (order) =>
  [...new Set((order?.songs || []).map((s) => s?.songId).filter(Boolean))];

// % de preparación (0..100). `logsById` es un objeto { [songId]: log }.
export const ensayometroPercent = (songIds, logsById, singer = false) => {
  if (!songIds || songIds.length === 0) return 0;
  const total = songIds.length * milestonesPerSong(singer);
  const done = songIds.reduce((acc, id) => acc + milestonesOf(logsById?.[id], singer), 0);
  return Math.round((done / total) * 100);
};

// IDs de las canciones que todavía NO están al 100% (hitos < 4, o < 3 para quien solo canta).
export const pendingSongIds = (songIds, logsById, singer = false) =>
  (songIds || []).filter((id) => milestonesOf(logsById?.[id], singer) < milestonesPerSong(singer));
