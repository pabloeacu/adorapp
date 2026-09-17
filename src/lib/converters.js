// Converters de datos (snake_case DB ↔ camelCase frontend) + helpers de normalización,
// extraídos de appStore.js SIN cambios de comportamiento. Puros (sin get/set/supabase).
//
// ⚠️ DATA-LOSS LANDMINE (regla #8): los convertXToDB regeneran la fila COMPLETA con
// defaults para INSERTs. NUNCA hacer supabase.from(...).update(convertXToDB(partial)):
// rutear SIEMPRE por updateMember/Band/Song/Order del store, que mergean el partial con
// el snapshot antes del converter. `mergeMemberRealtimeRow` y los ToDB se re-exportan /
// usan desde el store.

export const convertMemberFromDB = (m) => ({
  id: m.id,
  name: m.name,
  email: m.email,
  phone: m.phone,
  pastor_area: m.pastor_area,
  leader_of: m.leader_of,
  birthdate: m.birthdate,
  role: m.role,
  editor: m.editor || false, // Editor permission for songs
  instruments: m.instruments || [],
  areas: m.areas || [], // Áreas de ministerio (adoracion/multimedia/sonido). Solo el pastor las cambia (freeze en la base). DEBE estar en AMBOS converters (regla #8, landmine #58).
  active: m.active,
  onboarded: m.onboarded !== false, // default true so existing rows skip the wizard
  userId: m.user_id,
  avatar_url: m.avatar_url, // Keep BOTH for compatibility
  avatarUrl: m.avatar_url,   // Both fields point to same value
  createdAt: m.created_at,
  updatedAt: m.updated_at,
});

// Funde una fila realtime de `members` (que NO trae email/phone/birthdate: Realtime respeta
// los privilegios de columna, landmine #73) sobre la ficha ya cargada: solo pisa las claves
// que vienen en la fila, así el pastor no pierde el correo/teléfono que ya tenía en memoria.
export const mergeMemberRealtimeRow = (existing, row) => {
  const incoming = convertMemberFromDB(row);
  const merged = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== undefined) merged[k] = v;
  }
  if (!('avatar_url' in row)) { merged.avatar_url = existing.avatar_url; merged.avatarUrl = existing.avatarUrl; }
  return merged;
};

export const convertBandFromDB = (b) => ({
  id: b.id,
  name: b.name,
  meetingType: b.meeting_type,
  meetingDay: b.meeting_day,
  meetingTime: b.meeting_time,
  members: b.members || [],
  active: b.active,
  createdAt: b.created_at,
  updatedAt: b.updated_at,
});

// Temporal de banda (tabla band_temporary_members). Los permanentes siguen en
// bands.members uuid[]; los temporales viven acá con su ventana (expires_at).
// "Vigente" = expires_at > now(). Ver docs/PLAN_membresias_bandas.md.
export const convertBandTemporaryMemberFromDB = (t) => ({
  id: t.id,
  bandId: t.band_id,
  memberId: t.member_id,
  addedBy: t.added_by,
  startsAt: t.starts_at,
  expiresAt: t.expires_at,
  createdAt: t.created_at,
});

// "Solicitar colaboración" (tablas collaboration_requests / collaboration_participants).
// Solo lectura desde el cliente (RLS acota qué filas ve cada uno); toda escritura
// pasa por la Edge Function collab. Ver supabase/migrations/20260905_collaboration_*.
export const convertCollabRequestFromDB = (r) => ({
  id: r.id,
  bandId: r.band_id,
  orderId: r.order_id,
  categories: r.categories || [],
  requestedBy: r.requested_by,
  status: r.status,
  coveredMemberId: r.covered_member_id,
  coveredAt: r.covered_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
export const convertCollabParticipantFromDB = (p) => ({
  id: p.id,
  requestId: p.request_id,
  memberId: p.member_id,
  status: p.status,
  offeredAt: p.offered_at,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});

// "Esquema de reunión" (tablas service_schemas / schema_templates). Accesorio:
// sections es jsonb libre (round-trip como song.structure). El cliente escribe
// directo (RLS: schema = pastor/líder; plantilla = pastor). Ver 20260905_service_schemas.
export const convertServiceSchemaFromDB = (s) => ({
  id: s.id,
  orderId: s.order_id,
  createdBy: s.created_by,
  sections: s.sections || [],
  createdAt: s.created_at,
  updatedAt: s.updated_at,
});
export const convertSchemaTemplateFromDB = (t) => ({
  id: t.id,
  name: t.name,
  createdBy: t.created_by,
  sections: t.sections || [],
  createdAt: t.created_at,
  updatedAt: t.updated_at,
});

export const convertSongFromDB = (s) => ({
  id: s.id,
  title: s.title,
  artist: s.artist,
  originalKey: s.original_key,
  key: s.key,
  categories: s.categories || (s.category ? [s.category] : ['adoracion']), // Support both old single category and new array
  youtubeUrl: s.youtube_url,
  structure: s.structure || [],
  compass: s.compass || '', // Compás (ej: 4/4)
  bpm: s.bpm || '', // BPM (número hasta 3 dígitos)
  lastUsed: s.last_used,
  createdAt: s.created_at,
  updatedAt: s.updated_at,
  // Sello de versión server-owned (trigger set_song_content_changed): se mueve solo
  // en cambios de contenido. Va en FromDB pero NUNCA en convertSongToDB. Guarda de
  // concurrencia en updateSong (landmine #85, espejo de orders).
  contentChangedAt: s.content_changed_at,
});

export const convertOrderFromDB = (o) => ({
  id: o.id,
  date: o.date,
  time: o.time,
  bandId: o.band_id,
  meetingType: o.meeting_type,
  songs: o.songs || [],
  feedback: o.feedback,
  status: o.status,
  rehearsalDate: o.rehearsal_date,
  rehearsalTime: o.rehearsal_time,
  // Formación del servicio (jsonb normalizado por la base; null = sin formación).
  lineup: o.lineup ?? null,
  createdAt: o.created_at,
  updatedAt: o.updated_at,
  // Sello del trigger cuando cambia el CONTENIDO o la FORMACIÓN (para el nudge
  // "¡Ojo! Hubo cambios" de los banners de área). Lo escribe SOLO la base — nunca
  // el cliente — así que NO va en convertOrderToDB (mismo patrón que rehearsal_reminder_sent).
  contentChangedAt: o.content_changed_at,
  // Quién hizo ese último cambio (member id, o null si fue un cron): sirve para que el
  // propio editor no vea el aviso "Hubo cambios". Server-owned → tampoco va en ToDB.
  contentChangedBy: o.content_changed_by ?? null,
  // Suspensión del ENSAMBLE (server-owned: las escriben SOLO las RPCs suspend/resume/
  // reschedule + el trigger enforce_order_rehearsal_rules; NUNCA el cliente → NO van en
  // convertOrderToDB, mismo patrón que rehearsal_reminder_sent). `rehearsalSuspended` es
  // el booleano derivado para leer limpio en la UI.
  rehearsalSuspendedAt: o.rehearsal_suspended_at,
  rehearsalSuspendedReason: o.rehearsal_suspended_reason,
  rehearsalSuspendedBy: o.rehearsal_suspended_by,
  rehearsalSuspended: !!o.rehearsal_suspended_at,
});

// ⚠️ DATA-LOSS LANDMINE — convertXToDB shape and contract ⚠️
// The convertXToDB helpers below regenerate a FULL DB row, filling defaults
// (NULL, '', 'C', [], 'culto_general', etc.) for every field the input doesn't
// supply. This is the right shape for an INSERT but is CATASTROPHIC for an
// UPDATE: a partial input would silently wipe every other column on the row.
//
// Rule: NEVER call `supabase.from(...).update(convertXToDB(partial))`. Always
// route through `updateMember/Band/Song/Order` in this store — they merge the
// partial input with the current store snapshot BEFORE handing to the
// converter, so the full row going to UPDATE has the real values intact.
//
// History: this comment exists because June 15 2026 the bug wiped the lyrics,
// chords, artist, original key, categories, youtube_url, bpm and compass of
// every song touched by every saved order. See PR #20 commit message and
// memory/project_state_20260615.md for the full incident report.

// Normaliza un nombre/título para persistir: recorta extremos y colapsa
// cualquier secuencia de espacios interna a uno solo. Evita datos sucios como
// "Yessica  Santillán" (doble espacio) que rompían las iniciales del avatar
// (parts[1] = '' → parts[1][0] = undefined → "YUNDEFINED"), y también el orden
// alfabético/búsqueda cuando el título arranca con espacio (" Como En El Cielo").
// Pura sobre un solo campo → segura respecto del merge anti-DATA-LOSS.
const normalizeName = (s) => (s ?? '').toString().trim().replace(/\s+/g, ' ');

// Las filas de canciones del orden viajan con claves de UI (`_localId` para el
// drag-and-drop, `_pendingHistory`, `_suggestedDirector`) que NO deben
// persistirse (landmine #51). Se stripean acá, en la única puerta a la base.
const stripSongRefs = (songs) => (Array.isArray(songs) ? songs : []).map((s) => {
  if (!s || typeof s !== 'object') return s;
  const { _localId, _pendingHistory, _suggestedDirector, ...rest } = s;
  return rest;
});

// Convert camelCase to snake_case for Supabase
export const convertMemberToDB = (m) => {
  const out = {
    name: normalizeName(m.name),
    // El email es también el login (auth.users) y la app matchea usuario↔ficha por
    // email; GoTrue guarda auth.users.email SIEMPRE en minúscula, así que members.email
    // debe quedar en minúscula o divergiría y rompería el match (ver admin-update-member).
    email: m.email ? String(m.email).trim().toLowerCase() : m.email,
    phone: m.phone || null,
    pastor_area: m.pastor_area || null,
    leader_of: m.leader_of || null,
    birthdate: m.birthdate || null,
    role: m.role || 'member',
    editor: m.editor || false, // Editor permission for songs
    instruments: m.instruments || [],
    areas: m.areas || [], // round-trip fiel: el self-edit reenvía el mismo valor → el freeze de la base pasa (NEW=OLD). Solo el pastor (vía EF) puede cambiarlas.
    active: m.active ?? true,
    user_id: m.userId || null,
    avatar_url: m.avatarUrl || null,
  };
  // Only forward onboarded when the caller passed it explicitly — otherwise
  // the column keeps its current value (DB default true for old rows; the
  // edge functions for new members set it to false explicitly).
  if (m.onboarded !== undefined) out.onboarded = m.onboarded;
  return out;
};

export const convertBandToDB = (b) => ({
  name: normalizeName(b.name),
  meeting_type: b.meetingType || 'culto_general',
  meeting_day: b.meetingDay || null,
  meeting_time: b.meetingTime || '20:00',
  members: b.members || [],
  active: b.active ?? true,
});

export const convertSongToDB = (s) => ({
  title: normalizeName(s.title),
  artist: s.artist || null,
  original_key: s.originalKey || s.key || 'C',
  key: s.key || s.originalKey || 'C',
  categories: s.categories || (s.category ? [s.category] : ['adoracion']), // Support both array and legacy single category
  category: Array.isArray(s.categories) ? s.categories[0] : (s.category || 'adoracion'), // Keep category for compatibility
  youtube_url: s.youtubeUrl || null,
  structure: s.structure || [],
  compass: s.compass || null, // Compás (ej: 4/4)
  bpm: s.bpm || null, // BPM (número hasta 3 dígitos)
  last_used: s.lastUsed || null,
});

export const convertOrderToDB = (o) => ({
  date: o.date,
  time: o.time || '20:00',
  band_id: o.bandId || null,
  meeting_type: o.meetingType || 'culto_general',
  songs: stripSongRefs(o.songs),
  feedback: o.feedback || null,
  status: o.status || 'scheduled',
  // Rehearsal scheduling (nullable). NOTE: rehearsal_reminder_sent is owned by
  // the send_rehearsal_reminders cron — intentionally NOT written from the
  // client, so an update can never clobber the dedup flag.
  rehearsal_date: o.rehearsalDate || null,
  rehearsal_time: o.rehearsalTime || null,
  // Formación: SIEMPRE se reenvía (regla #8: el converter regenera la fila
  // completa; si faltara la clave, un update no la tocaría pero un merge
  // parcial sin ella la perdería del snapshot). La base la valida/normaliza.
  lineup: o.lineup ?? null,
});

// Ensayómetro: personal practice log per (user, order, song).
export const convertPracticeLogFromDB = (p) => ({
  id: p.id,
  orderId: p.order_id,
  songId: p.song_id,
  timesPracticed: p.times_practiced,
  knowsLyrics: p.knows_lyrics,
  knowsStructure: p.knows_structure,
  knowsArrangements: p.knows_arrangements,
  difficulty: p.difficulty,
  lastPracticedAt: p.last_practiced_at,
  updatedAt: p.updated_at,
});

// ⚠️ DATA-LOSS LANDMINE (same contract as the converters above): this builds a
// FULL row with defaults, so it must only receive COMPLETE log objects. The
// only writer is upsertPracticeLog below, whose callers (Practica.jsx) always
// hold the complete per-song log in state — never hand it a partial.
// user_id is NOT written from the client: the DB default (auth.uid()) fills it
// and RLS pins every row to its owner.
export const convertPracticeLogToDB = (p) => ({
  order_id: p.orderId,
  song_id: p.songId,
  times_practiced: p.timesPracticed || 0,
  knows_lyrics: p.knowsLyrics ?? false,
  knows_structure: p.knowsStructure ?? false,
  knows_arrangements: p.knowsArrangements ?? false,
  difficulty: p.difficulty || null,
  last_practiced_at: p.lastPracticedAt || null,
  updated_at: new Date().toISOString(),
});
