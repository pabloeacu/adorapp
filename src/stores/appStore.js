import { create } from 'zustand';
import { supabase, callAdminFunction } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

// Musical key transposition table
const semitoneSteps = {
  'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
  'Am': 0, 'A#m': 1, 'Bm': 2, 'Cm': 3, 'C#m': 4, 'Dm': 5, 'D#m': 6, 'Em': 7, 'Fm': 8, 'F#m': 9, 'Gm': 10, 'G#m': 11
};

const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Map for flat notes to their sharp equivalents
const flatToSharp = {
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
};

// Get the semitone index for a note (handles both sharp and flat)
const getSemitoneIndex = (note) => {
  if (semitoneSteps[note] !== undefined) return semitoneSteps[note];
  if (flatToSharp[note]) return semitoneSteps[flatToSharp[note]];
  const idx = notes.indexOf(note);
  return idx >= 0 ? idx : null;
};

// Get note name from semitone index
const getNoteFromIndex = (index) => notes[(index + 12) % 12];

// Transpose a single chord token (handles slash chords, suffixes, accidentals)
const transposeChordToken = (token, semitones) => {
  if (!token || token.trim() === '') return token;

  // Handle slash chords
  let mainPart = token;
  let bassPart = null;

  if (token.includes('/')) {
    const parts = token.split('/');
    mainPart = parts[0];
    bassPart = parts[1];
  }

  // Parse main chord: root + accidental + suffix
  // Pattern: [A-G] (case-insensitive; lowercase roots like 'c9' are typos but
  // must still transpose) + optional [#b] + optional suffix
  const match = mainPart.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) return token;

  const rootNote = match[1].toUpperCase();
  const accidental = match[2];
  const suffix = match[3];

  // Get root with accidental for lookup
  const rootWithAcc = accidental ? `${rootNote}${accidental}` : rootNote;

  // Get semitone index and transpose
  const rootIndex = getSemitoneIndex(rootWithAcc);
  if (rootIndex === null) return token;

  const newRootIndex = (rootIndex + semitones + 12) % 12;
  const newRoot = getNoteFromIndex(newRootIndex);

  // Handle bass note if present
  let newBassNote = null;
  if (bassPart) {
    const bassMatch = bassPart.match(/^([A-Ga-g])([#b]?)(.*)$/);
    if (bassMatch) {
      const bassRoot = bassMatch[1].toUpperCase();
      const bassAcc = bassMatch[2];
      const bassRootWithAcc = bassAcc ? `${bassRoot}${bassAcc}` : bassRoot;
      const bassIndex = getSemitoneIndex(bassRootWithAcc);
      if (bassIndex !== null) {
        const newBassIndex = (bassIndex + semitones + 12) % 12;
        newBassNote = getNoteFromIndex(newBassIndex);
      }
    }
  }

  // Reconstruct chord
  if (newBassNote) {
    return `${newRoot}${suffix}/${newBassNote}`;
  }
  return `${newRoot}${suffix}`;
};

// Transpose a string of chords separated by spaces
const transposeChordString = (chordString, semitones) => {
  if (!chordString || chordString.trim() === '') return chordString;

  // Split by spaces to get individual chords
  const chords = chordString.trim().split(/\s+/);

  // Transpose each chord token individually
  const transposedChords = chords.map(chord => transposeChordToken(chord, semitones));

  // Rejoin with spaces
  return transposedChords.join(' ');
};

export const transposeSongStructure = (structure, fromKey, toKey) => {
  const fromSemitones = semitoneSteps[fromKey] || 0;
  const toSemitones = semitoneSteps[toKey] || 0;
  const semitones = toSemitones - fromSemitones;

  return structure.map(section => ({
    ...section,
    chords: transposeChordString(section.chords, semitones)
  }));
};

// Convert snake_case from Supabase to camelCase for frontend
const convertMemberFromDB = (m) => ({
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
  active: m.active,
  onboarded: m.onboarded !== false, // default true so existing rows skip the wizard
  userId: m.user_id,
  avatar_url: m.avatar_url, // Keep BOTH for compatibility
  avatarUrl: m.avatar_url,   // Both fields point to same value
  createdAt: m.created_at,
  updatedAt: m.updated_at,
});

const convertBandFromDB = (b) => ({
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
const convertBandTemporaryMemberFromDB = (t) => ({
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
const convertCollabRequestFromDB = (r) => ({
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
const convertCollabParticipantFromDB = (p) => ({
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
const convertServiceSchemaFromDB = (s) => ({
  id: s.id,
  orderId: s.order_id,
  createdBy: s.created_by,
  sections: s.sections || [],
  createdAt: s.created_at,
  updatedAt: s.updated_at,
});
const convertSchemaTemplateFromDB = (t) => ({
  id: t.id,
  name: t.name,
  createdBy: t.created_by,
  sections: t.sections || [],
  createdAt: t.created_at,
  updatedAt: t.updated_at,
});

const convertSongFromDB = (s) => ({
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
});

const convertOrderFromDB = (o) => ({
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
  createdAt: o.created_at,
  updatedAt: o.updated_at,
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

// Convert camelCase to snake_case for Supabase
const convertMemberToDB = (m) => {
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

const convertBandToDB = (b) => ({
  name: normalizeName(b.name),
  meeting_type: b.meetingType || 'culto_general',
  meeting_day: b.meetingDay || null,
  meeting_time: b.meetingTime || '20:00',
  members: b.members || [],
  active: b.active ?? true,
});

const convertSongToDB = (s) => ({
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

const convertOrderToDB = (o) => ({
  date: o.date,
  time: o.time || '20:00',
  band_id: o.bandId || null,
  meeting_type: o.meetingType || 'culto_general',
  songs: o.songs || [],
  feedback: o.feedback || null,
  status: o.status || 'scheduled',
  // Rehearsal scheduling (nullable). NOTE: rehearsal_reminder_sent is owned by
  // the send_rehearsal_reminders cron — intentionally NOT written from the
  // client, so an update can never clobber the dedup flag.
  rehearsal_date: o.rehearsalDate || null,
  rehearsal_time: o.rehearsalTime || null,
});

// Ensayómetro: personal practice log per (user, order, song).
const convertPracticeLogFromDB = (p) => ({
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
const convertPracticeLogToDB = (p) => ({
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

export const useAppStore = create((set, get) => ({
  members: [],
  bands: [],
  songs: [],
  orders: [],
  bandTemporaryMembers: [], // temporales de banda (permanentes siguen en bands.members)
  collaborationRequests: [],     // "Solicitar colaboración" (RLS acota lo que ve cada uno)
  collaborationParticipants: [], // participación propia + (para el que pidió) sus voluntarios
  serviceSchemas: [],            // "Esquema de reunión" por orden (accesorio)
  schemaTemplates: [],           // plantillas de esquema (pastor)
  loading: false,
  error: null,

  // Initialize data from Supabase
  initialize: async () => {
    set({ loading: true, error: null });

    try {
      const [membersRes, bandsRes, songsRes, ordersRes, tempRes, collabReqRes, collabPartRes, schemasRes, templatesRes] = await Promise.all([
        supabase.from('members').select('*').order('name'),
        supabase.from('bands').select('*').order('name'),
        supabase.from('songs').select('*').order('title'),
        supabase.from('orders').select('*').order('date', { ascending: false }),
        supabase.from('band_temporary_members').select('*'),
        supabase.from('collaboration_requests').select('*'),
        supabase.from('collaboration_participants').select('*'),
        supabase.from('service_schemas').select('*'),
        supabase.from('schema_templates').select('*'),
      ]);

      if (membersRes.error) throw membersRes.error;
      if (bandsRes.error) throw bandsRes.error;
      if (songsRes.error) throw songsRes.error;
      if (ordersRes.error) throw ordersRes.error;

      const members = membersRes.data.map(convertMemberFromDB);
      const bands = bandsRes.data.map(convertBandFromDB);
      const songs = songsRes.data.map(convertSongFromDB);
      const orders = ordersRes.data.map(convertOrderFromDB);
      // Temporales: TOLERANTE. Si falla (tabla no desplegada aún, permiso), NO
      // rompe la carga del núcleo — el resto de la app sigue funcionando igual.
      if (tempRes.error) console.warn('band_temporary_members no disponible:', tempRes.error.message);
      const bandTemporaryMembers = tempRes.error ? [] : (tempRes.data || []).map(convertBandTemporaryMemberFromDB);
      // Colaboración: TOLERANTE igual (tabla nueva). El cliente solo lee lo que la RLS le deja.
      if (collabReqRes.error) console.warn('collaboration_requests no disponible:', collabReqRes.error.message);
      if (collabPartRes.error) console.warn('collaboration_participants no disponible:', collabPartRes.error.message);
      const collaborationRequests = collabReqRes.error ? [] : (collabReqRes.data || []).map(convertCollabRequestFromDB);
      const collaborationParticipants = collabPartRes.error ? [] : (collabPartRes.data || []).map(convertCollabParticipantFromDB);
      // Esquemas de reunión: TOLERANTE (tablas nuevas y accesorias). RLS acota lo que ve cada uno.
      if (schemasRes.error) console.warn('service_schemas no disponible:', schemasRes.error.message);
      if (templatesRes.error) console.warn('schema_templates no disponible:', templatesRes.error.message);
      const serviceSchemas = schemasRes.error ? [] : (schemasRes.data || []).map(convertServiceSchemaFromDB);
      const schemaTemplates = templatesRes.error ? [] : (templatesRes.data || []).map(convertSchemaTemplateFromDB);

      // Persist to localStorage for survival across page refreshes
      localStorage.setItem('appMembers', JSON.stringify(members));
      localStorage.setItem('appBands', JSON.stringify(bands));
      localStorage.setItem('appSongs', JSON.stringify(songs));
      localStorage.setItem('appOrders', JSON.stringify(orders));
      try { localStorage.setItem('appBandTempMembers', JSON.stringify(bandTemporaryMembers)); } catch { /* non-fatal */ }
      try { localStorage.setItem('appCollabRequests', JSON.stringify(collaborationRequests)); } catch { /* non-fatal */ }
      try { localStorage.setItem('appCollabParticipants', JSON.stringify(collaborationParticipants)); } catch { /* non-fatal */ }
      try { localStorage.setItem('appServiceSchemas', JSON.stringify(serviceSchemas)); } catch { /* non-fatal */ }
      try { localStorage.setItem('appSchemaTemplates', JSON.stringify(schemaTemplates)); } catch { /* non-fatal */ }

      set({
        members,
        bands,
        songs,
        orders,
        bandTemporaryMembers,
        collaborationRequests,
        collaborationParticipants,
        serviceSchemas,
        schemaTemplates,
        loading: false,
      });
    } catch (err) {
      console.error('Error loading data from Supabase:', err);
      // Fallback to localStorage if Supabase fails
      try {
        const cachedMembers = JSON.parse(localStorage.getItem('appMembers') || '[]');
        const cachedBands = JSON.parse(localStorage.getItem('appBands') || '[]');
        const cachedSongs = JSON.parse(localStorage.getItem('appSongs') || '[]');
        const cachedOrders = JSON.parse(localStorage.getItem('appOrders') || '[]');
        const cachedTemp = JSON.parse(localStorage.getItem('appBandTempMembers') || '[]');
        const cachedCollabReq = JSON.parse(localStorage.getItem('appCollabRequests') || '[]');
        const cachedCollabPart = JSON.parse(localStorage.getItem('appCollabParticipants') || '[]');
        const cachedSchemas = JSON.parse(localStorage.getItem('appServiceSchemas') || '[]');
        const cachedTemplates = JSON.parse(localStorage.getItem('appSchemaTemplates') || '[]');

        if (cachedMembers.length > 0 || cachedBands.length > 0 || cachedSongs.length > 0) {
          console.log('📦 Loading from localStorage cache...');
          set({
            members: cachedMembers,
            bands: cachedBands,
            songs: cachedSongs,
            orders: cachedOrders,
            bandTemporaryMembers: cachedTemp,
            collaborationRequests: cachedCollabReq,
            collaborationParticipants: cachedCollabPart,
            serviceSchemas: cachedSchemas,
            schemaTemplates: cachedTemplates,
            loading: false,
          });
          return;
        }
      } catch (cacheErr) {
        console.error('Cache error:', cacheErr);
      }
      set({ error: err.message, loading: false });
    }
  },

  // Member CRUD — admin operations go through edge functions, never the client.
  addMember: async (member) => {
    try {
      const { data, error } = await callAdminFunction('admin-create-member', {
        name: member.name,
        email: member.email || null,
        password: member.password || null,
        phone: member.phone || null,
        pastor_area: member.pastor_area || null,
        leader_of: member.leader_of || null,
        birthdate: member.birthdate || null,
        role: member.role || 'member',
        editor: member.editor || false,
        instruments: member.instruments || [],
        active: member.active !== false,
      });

      if (error) {
        console.error('Error adding member:', error);
        set({ error });
        return null;
      }

      const newMember = data.member;
      set((state) => ({
        members: [...state.members, convertMemberFromDB(newMember)],
      }));

      return { ...newMember, generatedPassword: data.generatedPassword || member.password };
    } catch (err) {
      console.error('Error adding member:', err);
      set({ error: err.message });
      return null;
    }
  },

  updateMember: async (id, updates) => {
    try {
      // CRITICAL DATA-LOSS FIX: convertMemberToDB regenerates the entire DB row
      // with defaults for every missing field. If we passed `updates` alone,
      // any field not in `updates` would be wiped (phone, birthdate, role…).
      // We merge updates over the current store snapshot first so the converter
      // emits the full, intact row. (Same pattern fixes updateBand/Song/Order.)
      const current = get().members.find(m => m.id === id);
      if (!current) {
        console.error('updateMember: member not found in store, aborting', { id });
        return null;
      }
      const merged = { ...current, ...updates };

      const { data, error } = await supabase
        .from('members')
        .update(convertMemberToDB(merged))
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Get the updated member with any preserved fields
      const updatedData = convertMemberFromDB(data);

      set((state) => ({
        members: state.members.map(m => m.id === id ? updatedData : m),
      }));

      // Also update localStorage cache to persist changes
      try {
        const cachedMembers = JSON.parse(localStorage.getItem('appMembers') || '[]');
        const updatedCache = cachedMembers.map(m => m.id === id ? updatedData : m);
        localStorage.setItem('appMembers', JSON.stringify(updatedCache));
      } catch (cacheErr) {
        console.error('Cache update error:', cacheErr);
      }

      return data;
    } catch (err) {
      console.error('Error updating member:', err);
      set({ error: err.message });
      return null;
    }
  },

  // Ruta PRIVILEGIADA para editar un miembro cuando cambia el EMAIL. El email es
  // a la vez login (auth.users), identidad de auth y contacto (members), y la app
  // matchea usuario↔ficha por email (useCurrentMember/authStore/Header), así que
  // cambiarlo solo en members lo desincroniza y ROMPE al usuario. La EF
  // admin-update-member lo cambia por la Admin API (auth+identidad) + members y
  // revoca sesiones. Devuelve { member } o { error } (string) para mostrar al usuario.
  updateMemberViaAdmin: async (id, updates) => {
    try {
      const { data, error } = await callAdminFunction('admin-update-member', { memberId: id, updates });
      if (error) return { error };
      // Blindaje: si la EF respondiera 200 sin `member`, no reventar con un TypeError
      // silencioso — devolver un error legible para que el modal lo muestre.
      if (!data || !data.member) return { error: 'Respuesta inválida del servidor. Probá de nuevo.' };
      const updatedData = convertMemberFromDB(data.member);
      set((state) => ({ members: state.members.map(m => m.id === id ? updatedData : m) }));
      try {
        const cachedMembers = JSON.parse(localStorage.getItem('appMembers') || '[]');
        localStorage.setItem('appMembers', JSON.stringify(cachedMembers.map(m => m.id === id ? updatedData : m)));
      } catch (cacheErr) {
        console.error('Cache update error:', cacheErr);
      }
      return { member: updatedData };
    } catch (err) {
      console.error('updateMemberViaAdmin error:', err);
      return { error: err.message || 'Error al actualizar el miembro' };
    }
  },

  deleteMember: async (id, permanent = false) => {
    try {
      if (permanent) {
        // Permanent deletion goes through the edge function (verifies pastor role,
        // deletes auth user + member row atomically server-side).
        const { error } = await callAdminFunction('admin-delete-member', { memberId: id });
        if (error) {
          console.error('Error deleting member:', error);
          set({ error });
          return false;
        }

        set((state) => ({
          members: state.members.filter(m => m.id !== id),
        }));

        return true;
      } else {
        // Soft delete - just deactivate
        const { error } = await supabase
          .from('members')
          .update({ active: false })
          .eq('id', id);

        if (error) throw error;

        set((state) => ({
          members: state.members.map(m => m.id === id ? { ...m, active: false } : m),
        }));

        return true;
      }
    } catch (err) {
      console.error('Error deleting member:', err);
      set({ error: err.message });
      return false;
    }
  },

  toggleMemberActive: async (id) => {
    const member = get().members.find(m => m.id === id);
    if (member) {
      return get().updateMember(id, { ...member, active: !member.active });
    }
    return false;
  },

  // Band CRUD
  addBand: async (band) => {
    try {
      const newBand = {
        ...convertBandToDB(band),
        id: uuidv4(),
      };

      const { data, error } = await supabase
        .from('bands')
        .insert(newBand)
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        bands: [...state.bands, convertBandFromDB(data)],
      }));

      return data;
    } catch (err) {
      console.error('Error adding band:', err);
      set({ error: err.message });
      return null;
    }
  },

  updateBand: async (id, updates) => {
    try {
      // Merge with current store snapshot before converting — see updateMember
      // comment for why. Prevents data loss on partial updates.
      const current = get().bands.find(b => b.id === id);
      if (!current) {
        console.error('updateBand: band not found in store, aborting', { id });
        return null;
      }
      const merged = { ...current, ...updates };

      const { data, error } = await supabase
        .from('bands')
        .update(convertBandToDB(merged))
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        bands: state.bands.map(b => b.id === id ? convertBandFromDB(data) : b),
      }));

      return data;
    } catch (err) {
      console.error('Error updating band:', err);
      set({ error: err.message });
      return null;
    }
  },

  deleteBand: async (id) => {
    try {
      const { error } = await supabase
        .from('bands')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        bands: state.bands.filter(b => b.id !== id),
      }));

      return true;
    } catch (err) {
      console.error('Error deleting band:', err);
      set({ error: err.message });
      return false;
    }
  },

  // ── Miembros de banda agregados por líderes/pastor (docs/PLAN_membresias_bandas) ──
  // Devuelven { ok } | { error } (string legible) para que la UI ramifique
  // (patrón anti fire-and-forget, landmine #32).

  // Agregar PERMANENTE: append a bands.members. Update DIRIGIDO solo a `members`
  // (NO convertBandToDB): no puede perder datos ni tropezar el trigger
  // append-only del líder (los demás campos quedan idénticos → NEW = OLD).
  addPermanentBandMember: async (bandId, memberId) => {
    try {
      const band = get().bands.find(b => b.id === bandId);
      if (!band) return { error: 'La banda no existe.' };
      if ((band.members || []).includes(memberId)) return { ok: true }; // ya es permanente
      const nextMembers = [...(band.members || []), memberId];
      const { data, error } = await supabase
        .from('bands')
        .update({ members: nextMembers })
        .eq('id', bandId)
        .select()
        .single();
      if (error) return { error: error.message };
      const updated = convertBandFromDB(data);
      set((state) => ({ bands: state.bands.map(b => b.id === bandId ? updated : b) }));
      try {
        const cached = JSON.parse(localStorage.getItem('appBands') || '[]');
        localStorage.setItem('appBands', JSON.stringify(cached.map(b => b.id === bandId ? updated : b)));
      } catch { /* non-fatal */ }
      return { ok: true };
    } catch (err) {
      console.error('addPermanentBandMember error:', err);
      return { error: err.message || 'No se pudo agregar el integrante.' };
    }
  },

  // Agregar TEMPORAL: fila en band_temporary_members. starts_at y expires_at se
  // derivan del MISMO instante de cliente → el CHECK (1–90 días) se cumple
  // determinísticamente sin depender del reloj del servidor. `addedBy` debe ser
  // el member id del usuario actual (RLS lo verifica: no se puede firmar por otro).
  addTemporaryBandMember: async ({ bandId, memberId, days, addedBy }) => {
    try {
      const n = Number(days);
      if (!Number.isInteger(n) || n < 1 || n > 90) return { error: 'La cantidad de días debe ser entre 1 y 90.' };
      if (!addedBy) return { error: 'No pudimos identificar quién agrega. Recargá la página e intentá de nuevo.' };
      const startsAt = new Date();
      const expiresAt = new Date(startsAt.getTime() + n * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from('band_temporary_members')
        .insert({
          band_id: bandId,
          member_id: memberId,
          added_by: addedBy,
          starts_at: startsAt.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();
      if (error) return { error: error.message };
      const row = convertBandTemporaryMemberFromDB(data);
      set((state) => ({ bandTemporaryMembers: [row, ...state.bandTemporaryMembers] }));
      try {
        const cached = JSON.parse(localStorage.getItem('appBandTempMembers') || '[]');
        localStorage.setItem('appBandTempMembers', JSON.stringify([row, ...cached]));
      } catch { /* non-fatal */ }
      return { ok: true, temporary: row };
    } catch (err) {
      console.error('addTemporaryBandMember error:', err);
      return { error: err.message || 'No se pudo agregar el integrante temporal.' };
    }
  },

  // Quitar TEMPORAL (solo pastor; la RLS lo garantiza). count:'exact' detecta el
  // caso RLS-bloqueado (0 filas sin error) para no mentirle al usuario.
  removeTemporaryBandMember: async (id) => {
    try {
      const { error, count } = await supabase
        .from('band_temporary_members')
        .delete({ count: 'exact' })
        .eq('id', id);
      if (error) return { error: error.message };
      if (!count) return { error: 'Solo el pastor puede quitar integrantes temporales.' };
      set((state) => ({ bandTemporaryMembers: state.bandTemporaryMembers.filter(t => t.id !== id) }));
      try {
        const cached = JSON.parse(localStorage.getItem('appBandTempMembers') || '[]');
        localStorage.setItem('appBandTempMembers', JSON.stringify(cached.filter(t => t.id !== id)));
      } catch { /* non-fatal */ }
      return { ok: true };
    } catch (err) {
      console.error('removeTemporaryBandMember error:', err);
      return { error: err.message || 'No se pudo quitar el integrante temporal.' };
    }
  },

  // Song CRUD
  addSong: async (song) => {
    try {
      const newSong = {
        ...convertSongToDB(song),
        id: uuidv4(),
      };

      const { data, error } = await supabase
        .from('songs')
        .insert(newSong)
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        songs: [...state.songs, convertSongFromDB(data)],
      }));

      return data;
    } catch (err) {
      console.error('Error adding song:', err);
      set({ error: err.message });
      return null;
    }
  },

  updateSong: async (id, updates) => {
    try {
      // CRITICAL DATA-LOSS FIX: this was the root cause of the structure=[]
      // wipe-out reported by Paul. updateSong(id, { lastUsed }) called from
      // addOrder used to send the converted row with EVERY other field
      // defaulted to '', NULL, or 'C' — silently nuking lyrics, chords, tono,
      // artista, categorías, youtube, etc. on every order save.
      // Merge with current store snapshot before converting.
      const current = get().songs.find(s => s.id === id);
      if (!current) {
        console.error('updateSong: song not found in store, aborting', { id });
        return null;
      }
      const merged = { ...current, ...updates };

      const { data, error } = await supabase
        .from('songs')
        .update(convertSongToDB(merged))
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        songs: state.songs.map(s => s.id === id ? convertSongFromDB(data) : s),
      }));

      return data;
    } catch (err) {
      console.error('Error updating song:', err);
      set({ error: err.message });
      return null;
    }
  },

  deleteSong: async (id) => {
    try {
      const { error } = await supabase
        .from('songs')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        songs: state.songs.filter(s => s.id !== id),
      }));

      return true;
    } catch (err) {
      console.error('Error deleting song:', err);
      set({ error: err.message });
      return false;
    }
  },

  // Order CRUD
  addOrder: async (order) => {
    try {
      const newOrder = {
        ...convertOrderToDB(order),
        id: uuidv4(),
      };

      const { data, error } = await supabase
        .from('orders')
        .insert(newOrder)
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        orders: [convertOrderFromDB(data), ...state.orders],
      }));

      // Update last_used for songs in this order
      if (order.songs?.length) {
        order.songs.forEach(songEntry => {
          get().updateSong(songEntry.songId, { lastUsed: order.date });
        });
      }

      return data;
    } catch (err) {
      console.error('Error adding order:', err);
      set({ error: err.message });
      return null;
    }
  },

  updateOrder: async (id, updates) => {
    try {
      // Merge with current store snapshot before converting — see updateMember
      // comment. Without this, saving feedback alone would wipe date/band/songs.
      const current = get().orders.find(o => o.id === id);
      if (!current) {
        console.error('updateOrder: order not found in store, aborting', { id });
        return null;
      }
      const merged = { ...current, ...updates };

      const { data, error } = await supabase
        .from('orders')
        .update(convertOrderToDB(merged))
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        orders: state.orders.map(o => o.id === id ? convertOrderFromDB(data) : o),
      }));

      return data;
    } catch (err) {
      console.error('Error updating order:', err);
      set({ error: err.message });
      return null;
    }
  },

  deleteOrder: async (id) => {
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set((state) => ({
        orders: state.orders.filter(o => o.id !== id),
      }));

      return true;
    } catch (err) {
      console.error('Error deleting order:', err);
      set({ error: err.message });
      return false;
    }
  },

  cloneOrder: async (id) => {
    const order = get().orders.find(o => o.id === id);
    if (order) {
      const newOrder = {
        ...order,
        id: undefined,
        date: new Date().toISOString().split('T')[0],
        status: 'scheduled',
        feedback: '',
      };
      return get().addOrder(newOrder);
    }
    return null;
  },

  // --- Ensayómetro (personal practice logs) -------------------------------
  // Deliberately OUTSIDE initialize()/realtime/localStorage: this is personal,
  // per-order data that only the Practica page needs. RLS already scopes every
  // query to the logged-in user, so no client-side filtering is required.

  fetchPracticeLogs: async (orderId) => {
    try {
      const { data, error } = await supabase
        .from('practice_logs')
        .select('*')
        .eq('order_id', orderId);
      if (error) throw error;
      return (data || []).map(convertPracticeLogFromDB);
    } catch (err) {
      console.error('Error fetching practice logs:', err);
      return [];
    }
  },

  // Versículo del día — el MISMO que manda el push de la mañana
  // (send_daily_devotional_notification): día del año en ART, clampeado con
  // ((doy - 1) % 365) + 1, y select en daily_devotionals por ese day_of_year.
  // Lectura on-demand (fuera de initialize/realtime), no-throw (null si falla).
  fetchDailyDevotional: async () => {
    try {
      const artDate = new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
      }); // 'YYYY-MM-DD' en ART
      const [y, m, d] = artDate.split('-').map(Number);
      const doy = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
      const dayIdx = ((doy - 1) % 365) + 1;
      const { data, error } = await supabase
        .from('daily_devotionals')
        .select('reference, verse')
        .eq('day_of_year', dayIdx)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    } catch (err) {
      console.error('Error fetching daily devotional:', err);
      return null;
    }
  },

  // Feedback post-servicio ya registrado para un orden. RLS: el autor ve lo suyo, el
  // pastor ve todo. Se usa SOLO para suprimir el modal ("¿ya envié yo?"). Lectura
  // on-demand, no-throw. El envío NO pasa por acá: va por la Edge Function
  // send-service-feedback (service_role) vía callAdminFunction.
  fetchServiceFeedbackForOrder: async (orderId) => {
    try {
      const { data, error } = await supabase
        .from('service_feedback')
        .select('id, author_id, created_at')
        .eq('order_id', orderId);
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching service feedback:', err);
      return [];
    }
  },

  // Takes a COMPLETE log object (see DATA-LOSS LANDMINE on the converter).
  // Upsert on (user_id, order_id, song_id): user_id comes from the DB default
  // auth.uid(), so the same call transparently creates or updates the row.
  upsertPracticeLog: async (log) => {
    try {
      const { data, error } = await supabase
        .from('practice_logs')
        .upsert(convertPracticeLogToDB(log), { onConflict: 'user_id,order_id,song_id' })
        .select()
        .single();
      if (error) throw error;
      return convertPracticeLogFromDB(data);
    } catch (err) {
      console.error('Error saving practice log:', err);
      return null;
    }
  },

  // --- Alarma de ensayo (Ensayómetro F2) ----------------------------------
  // Preferencia personal (opt-in): push diario 18:00 ART mientras haya
  // canciones por practicar. Una fila por usuario en practice_alarms
  // (user_id via DEFAULT auth.uid(); RLS owner-only). El push lo manda el
  // cron send_practice_reminders(), no el cliente.

  fetchPracticeAlarm: async () => {
    try {
      const { data, error } = await supabase
        .from('practice_alarms')
        .select('enabled')
        .maybeSingle();
      if (error) throw error;
      // Sin fila = nunca la activó → alarma apagada.
      return data ? data.enabled : false;
    } catch (err) {
      console.error('Error fetching practice alarm:', err);
      return false;
    }
  },

  setPracticeAlarm: async (enabled) => {
    try {
      const { data, error } = await supabase
        .from('practice_alarms')
        .upsert(
          { enabled, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
        .select('enabled')
        .single();
      if (error) throw error;
      return data.enabled;
    } catch (err) {
      console.error('Error saving practice alarm:', err);
      return null;
    }
  },

  // Helper functions
  getMemberById: (id) => get().members.find(m => m.id === id),
  getBandById: (id) => get().bands.find(b => b.id === id),
  getSongById: (id) => get().songs.find(s => s.id === id),

  // IDs de miembros EFECTIVOS de una banda = permanentes (bands.members) ∪
  // temporales VIGENTES (expires_at > ahora). Espeja la definición SQL
  // band_effective_member_ids(). Sin filtro de "active" (igual que el SQL): los
  // consumidores filtran actividad donde corresponda. Se re-evalúa en cada
  // llamada con Date.now() (sin timers) — un temporal vencido deja de contar.
  getEffectiveBandMemberIds: (bandId) => {
    const band = get().bands.find(b => b.id === bandId);
    const ids = new Set(band?.members || []);
    const now = Date.now();
    for (const t of get().bandTemporaryMembers) {
      if (t.bandId === bandId && new Date(t.expiresAt).getTime() > now) ids.add(t.memberId);
    }
    return ids;
  },

  // Miembros de la banda (objetos, activos) para mostrar: permanentes ∪
  // temporales vigentes. Los temporales llevan { temporary: true, expiresAt }
  // para el badge "Temporal · vence DD/MM". El permanente gana si alguien
  // figura en ambos (sin badge).
  getBandMembers: (bandId) => {
    const band = get().bands.find(b => b.id === bandId);
    if (!band) return [];
    const permanentIds = new Set(band.members || []);
    const now = Date.now();
    // memberId -> expiresAt más lejano entre sus temporales vigentes (no permanentes)
    const tempExpiry = new Map();
    for (const t of get().bandTemporaryMembers) {
      if (t.bandId !== bandId) continue;
      if (permanentIds.has(t.memberId)) continue;
      if (new Date(t.expiresAt).getTime() <= now) continue;
      const prev = tempExpiry.get(t.memberId);
      if (!prev || new Date(t.expiresAt).getTime() > new Date(prev).getTime()) {
        tempExpiry.set(t.memberId, t.expiresAt);
      }
    }
    const result = [];
    for (const m of get().members) {
      if (!m.active) continue;
      if (permanentIds.has(m.id)) result.push(m);
      else if (tempExpiry.has(m.id)) result.push({ ...m, temporary: true, expiresAt: tempExpiry.get(m.id) });
    }
    return result;
  },

  // Get song with transposed key
  getSongWithKey: (songId, key) => {
    const song = get().songs.find(s => s.id === songId);
    if (!song) return null;

    if (key === song.originalKey || !key) {
      return { ...song, displayStructure: song.structure };
    }

    return {
      ...song,
      displayStructure: transposeSongStructure(song.structure, song.originalKey, key)
    };
  },

  // Smart search for unused songs
  getUnusedSongs: (weeks = 4) => {
    const state = get();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - weeks * 7);

    return state.songs.filter(song => {
      if (!song.lastUsed) return true;
      return new Date(song.lastUsed) < cutoff;
    });
  },

  // Get songs not used in specific band's recent orders
  getUnusedByBand: (bandId, weeks = 4) => {
    const state = get();
    const bandOrders = state.orders.filter(o => o.bandId === bandId);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - weeks * 7);

    const recentlyUsedSongIds = new Set();
    bandOrders.forEach(order => {
      if (new Date(order.date) >= cutoff) {
        order.songs.forEach(s => recentlyUsedSongIds.add(s.songId));
      }
    });

    return state.songs.filter(song => !recentlyUsedSongIds.has(song.id));
  },

  // Merge a realtime change from Supabase into the store. Called by the
  // realtime subscription layer in src/lib/realtimeSync.js. We patch in place
  // instead of refetching so changes appear instantly without a network hop.
  // The localStorage mirror is updated so a navigation away+back shows the
  // same data we just merged.
  mergeRealtimeChange: ({ table, eventType, newRow, oldRow }) => {
    const id = (newRow && newRow.id) || (oldRow && oldRow.id);
    if (!id) return;

    const tableSpec = {
      members: { key: 'members', from: convertMemberFromDB, lsKey: 'appMembers' },
      bands:   { key: 'bands',   from: convertBandFromDB,   lsKey: 'appBands'   },
      songs:   { key: 'songs',   from: convertSongFromDB,   lsKey: 'appSongs'   },
      orders:  { key: 'orders',  from: convertOrderFromDB,  lsKey: 'appOrders'  },
      band_temporary_members: { key: 'bandTemporaryMembers', from: convertBandTemporaryMemberFromDB, lsKey: 'appBandTempMembers' },
      collaboration_requests: { key: 'collaborationRequests', from: convertCollabRequestFromDB, lsKey: 'appCollabRequests' },
      collaboration_participants: { key: 'collaborationParticipants', from: convertCollabParticipantFromDB, lsKey: 'appCollabParticipants' },
      service_schemas: { key: 'serviceSchemas', from: convertServiceSchemaFromDB, lsKey: 'appServiceSchemas' },
    };
    const spec = tableSpec[table];
    if (!spec) return;

    set((state) => {
      const list = state[spec.key] || [];
      let next;
      if (eventType === 'DELETE') {
        next = list.filter((r) => r.id !== id);
      } else if (eventType === 'INSERT') {
        // Avoid duplicates if the optimistic-update path already inserted the row.
        if (list.some((r) => r.id === id)) return state;
        next = [spec.from(newRow), ...list];
      } else {
        // UPDATE
        const updated = spec.from(newRow);
        const idx = list.findIndex((r) => r.id === id);
        next = idx >= 0 ? list.map((r, i) => (i === idx ? updated : r)) : [updated, ...list];
      }
      try { localStorage.setItem(spec.lsKey, JSON.stringify(next)); } catch { /* non-fatal */ }
      return { [spec.key]: next };
    });
  },

  // Reset all data on logout. Also clears the localStorage caches that
  // mirror this store, so a different user logging in on the same device
  // does not see the previous user's data flash before fresh data loads.
  reset: () => {
    try {
      localStorage.removeItem('appMembers');
      localStorage.removeItem('appBands');
      localStorage.removeItem('appSongs');
      localStorage.removeItem('appOrders');
      localStorage.removeItem('appBandTempMembers');
      localStorage.removeItem('appCollabRequests');
      localStorage.removeItem('appCollabParticipants');
      localStorage.removeItem('appServiceSchemas');
      localStorage.removeItem('appSchemaTemplates');
    } catch {
      // localStorage may be unavailable in some embedded contexts; non-fatal.
    }
    set({
      members: [],
      bands: [],
      songs: [],
      orders: [],
      bandTemporaryMembers: [],
      collaborationRequests: [],
      collaborationParticipants: [],
      serviceSchemas: [],
      schemaTemplates: [],
      loading: false,
      error: null,
    });
  },

  // ---------- "Solicitar colaboración" — envoltorios de la Edge Function collab ----------
  // Toda escritura pasa por el server (service_role). Devuelven { ok, ... } o { error }.
  requestCollaboration: async ({ bandId, orderId, categories }) => {
    const { data, error } = await callAdminFunction('collab', { action: 'create', bandId, orderId, categories });
    if (error) return { error };
    return { ok: true, ...(data || {}) };
  },
  offerCollaboration: async (requestId) => {
    const { data, error } = await callAdminFunction('collab', { action: 'offer', requestId });
    if (error) return { error };
    return { ok: true, ...(data || {}) };
  },
  coverCollaboration: async ({ requestId, memberId, days }) => {
    const { data, error } = await callAdminFunction('collab', { action: 'cover', requestId, memberId, days });
    if (error) return { error };
    return { ok: true, ...(data || {}) };
  },
  cancelCollaboration: async (requestId) => {
    const { data, error } = await callAdminFunction('collab', { action: 'cancel', requestId });
    if (error) return { error };
    return { ok: true, ...(data || {}) };
  },

  // Deriva los banners de colaboración para un miembro, a partir de lo que la RLS
  // ya le dejó ver (collaborationRequests/Participants). Puro, sin red.
  getCollaborationFeed: (memberId) => {
    if (!memberId) return { invited: [], offered: [], managing: [], results: [] };
    const reqs = get().collaborationRequests || [];
    const parts = get().collaborationParticipants || [];
    const myPart = new Map(); // requestId -> my participant
    for (const p of parts) if (p.memberId === memberId) myPart.set(p.requestId, p);
    const offersByReq = new Map(); // requestId -> count of 'offered'
    for (const p of parts) if (p.status === 'offered') offersByReq.set(p.requestId, (offersByReq.get(p.requestId) || 0) + 1);

    const invited = [], offered = [], managing = [], results = [];
    for (const r of reqs) {
      const mine = myPart.get(r.id);
      if (r.status === 'open') {
        if (mine && mine.status === 'invited') invited.push(r);
        else if (mine && mine.status === 'offered') offered.push(r);
        if (r.requestedBy === memberId && (offersByReq.get(r.id) || 0) > 0) managing.push(r);
      } else if (r.status === 'covered' && mine && (mine.status === 'accepted' || mine.status === 'declined')) {
        results.push({ request: r, outcome: mine.status });
      }
    }
    return { invited, offered, managing, results };
  },

  // Voluntarios (participantes 'offered') de una solicitud propia, para el modal de gestión.
  getCollaborationVolunteers: (requestId) => {
    const parts = get().collaborationParticipants || [];
    return parts.filter((p) => p.requestId === requestId && p.status === 'offered');
  },

  // ---------- "Esquema de reunión" ----------
  getServiceSchema: (orderId) => (get().serviceSchemas || []).find((s) => s.orderId === orderId) || null,

  // Crear o editar el esquema de un orden (upsert por order_id). `sections` es el
  // array COMPLETO desde el armador (nunca parcial → sin data-loss). Optimista + realtime.
  upsertServiceSchema: async ({ orderId, sections, createdBy }) => {
    try {
      const { data, error } = await supabase
        .from('service_schemas')
        .upsert({ order_id: orderId, created_by: createdBy || null, sections: sections || [], updated_at: new Date().toISOString() }, { onConflict: 'order_id' })
        .select().single();
      if (error) return { error: error.message };
      const row = convertServiceSchemaFromDB(data);
      set((state) => {
        const next = [row, ...(state.serviceSchemas || []).filter((s) => s.orderId !== orderId)];
        try { localStorage.setItem('appServiceSchemas', JSON.stringify(next)); } catch { /* non-fatal */ }
        return { serviceSchemas: next };
      });
      return { ok: true, schema: row };
    } catch (err) { return { error: err.message }; }
  },

  deleteServiceSchema: async (orderId) => {
    try {
      const { error, count } = await supabase.from('service_schemas').delete({ count: 'exact' }).eq('order_id', orderId);
      if (error) return { error: error.message };
      if (!count) return { error: 'Solo pastor o líder puede quitar el esquema.' };
      set((state) => {
        const next = (state.serviceSchemas || []).filter((s) => s.orderId !== orderId);
        try { localStorage.setItem('appServiceSchemas', JSON.stringify(next)); } catch { /* non-fatal */ }
        return { serviceSchemas: next };
      });
      return { ok: true };
    } catch (err) { return { error: err.message }; }
  },

  // Plantilla (solo pastor por RLS). No está en realtime (cambian poco): update optimista.
  saveSchemaTemplate: async ({ name, sections, createdBy }) => {
    try {
      const { data, error } = await supabase
        .from('schema_templates')
        .insert({ name: (name || '').trim() || 'Plantilla', created_by: createdBy || null, sections: sections || [] })
        .select().single();
      if (error) return { error: error.message };
      const row = convertSchemaTemplateFromDB(data);
      set((state) => ({ schemaTemplates: [row, ...(state.schemaTemplates || [])] }));
      return { ok: true, template: row };
    } catch (err) { return { error: err.message }; }
  },

  deleteSchemaTemplate: async (id) => {
    try {
      const { error, count } = await supabase.from('schema_templates').delete({ count: 'exact' }).eq('id', id);
      if (error) return { error: error.message };
      if (!count) return { error: 'Solo el pastor puede quitar plantillas.' };
      set((state) => ({ schemaTemplates: (state.schemaTemplates || []).filter((t) => t.id !== id) }));
      return { ok: true };
    } catch (err) { return { error: err.message }; }
  },
}));

// Constants
export const SONG_CATEGORIES = [
  { id: 'adoracion', label: 'Adoración', icon: 'Heart', color: 'text-pink-400', bg: 'bg-pink-500/20' },
  { id: 'intimidad', label: 'Intimidad', icon: 'Sparkles', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  { id: 'guerra', label: 'Guerra Espiritual', icon: 'Sword', color: 'text-red-400', bg: 'bg-red-500/20' },
  { id: 'rapida', label: 'Rápida', icon: 'Zap', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  { id: 'lenta', label: 'Lenta', icon: 'Moon', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  { id: 'alabanza', label: 'Alabanza', icon: 'Music2', color: 'text-green-400', bg: 'bg-green-500/20' },
  { id: 'humillacion', label: 'Humillación', icon: 'Cross', color: 'text-orange-400', bg: 'bg-orange-500/20' },
  { id: 'pascua', label: 'Pascua', icon: 'Egg', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  { id: 'santa_cena', label: 'Santa Cena', icon: 'Wine', color: 'text-red-400', bg: 'bg-red-500/20' },
  { id: 'testimonial', label: 'Testimonial', icon: 'Mic', color: 'text-teal-400', bg: 'bg-teal-500/20' },
  { id: 'ofrenda', label: 'Ofrenda', icon: 'Gift', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  { id: 'coritos', label: 'Coritos', icon: 'Baby', color: 'text-yellow-300', bg: 'bg-yellow-500/20' },
  { id: 'festivas', label: 'Festivas', icon: 'PartyPopper', color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/20' },
];

export const MEETING_TYPES = [
  { id: 'culto_general', label: 'Culto General', icon: 'Church', color: 'text-purple-400' },
  { id: 'jovenes', label: 'Reunión de Jóvenes', icon: 'Users', color: 'text-blue-400' },
  { id: 'mujeres', label: 'Reunión de Mujeres', icon: 'Heart', color: 'text-pink-400' },
  { id: 'hombres', label: 'Reunión de Hombres', icon: 'Shield', color: 'text-green-400' },
  { id: 'ninos', label: 'Escuela Dominical', icon: 'BookOpen', color: 'text-orange-400' },
  { id: 'evento', label: 'Evento Especial', icon: 'Star', color: 'text-yellow-400' },
];

export const MEMBER_ROLES = [
  { id: 'pastor', label: 'Pastor', description: 'Acceso total al sistema' },
  { id: 'leader', label: 'Líder', description: 'Puede gestionar órdenes y repertorio' },
  { id: 'member', label: 'Miembro', description: 'Acceso de solo lectura' },
];

export const INSTRUMENTS = [
  'Voz', 'Guitarra Eléctrica', 'Guitarra Acústica', 'Piano', 'Teclado', 'Batería', 'Bajo', 'Violín', 'Flauta', 'Saxofón', 'Trompeta', 'Coros'
];

export const MUSICAL_KEYS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Am', 'A#m', 'Bm', 'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m'
];
