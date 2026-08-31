// Ensayómetro — cálculo PURO del progreso de práctica, fuente ÚNICA compartida por
// la pantalla "Mi Ensayo" (Practica.jsx) y el banner de preparación del Dashboard.
//
// ⚠️ ESPEJO MANUAL del cron server-side send_practice_reminders()
// (supabase/migrations/20260803_practice_alarms.sql): la definición de los 4 hitos
// y el redondeo del % TIENEN que quedar en sincronía con ese SQL (landmine #27).
// Si cambiás la fórmula acá, cambiala también allá. Sin React ni Supabase.

export const MILESTONES_PER_SONG = 4;

// 4 hitos por canción: al menos una pasada + los 3 checks de dominio.
export const milestonesOf = (log) => {
  if (!log) return 0;
  return (
    (log.timesPracticed > 0 ? 1 : 0) +
    (log.knowsLyrics ? 1 : 0) +
    (log.knowsStructure ? 1 : 0) +
    (log.knowsArrangements ? 1 : 0)
  );
};

// IDs de canción únicos de un orden (dedup por songId, ignorando vacíos).
export const uniqueSongIds = (order) =>
  [...new Set((order?.songs || []).map((s) => s?.songId).filter(Boolean))];

// % de preparación (0..100). `logsById` es un objeto { [songId]: log }.
export const ensayometroPercent = (songIds, logsById) => {
  if (!songIds || songIds.length === 0) return 0;
  const total = songIds.length * MILESTONES_PER_SONG;
  const done = songIds.reduce((acc, id) => acc + milestonesOf(logsById?.[id]), 0);
  return Math.round((done / total) * 100);
};

// IDs de las canciones que todavía NO están al 100% (hitos < 4).
export const pendingSongIds = (songIds, logsById) =>
  (songIds || []).filter((id) => milestonesOf(logsById?.[id]) < MILESTONES_PER_SONG);
