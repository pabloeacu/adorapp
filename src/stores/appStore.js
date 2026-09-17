import { create } from 'zustand';
import { participantIdsOf, isOrderParticipant as isOrderParticipantPure, groupByInstrument } from '../lib/lineup';
import { supabase, callAdminFunction } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
// Motor de transposición: extraído a src/lib/transpose.js (sin cambios de
// comportamiento). Se importa porque el store lo usa internamente y se RE-EXPORTA
// para los consumidores que lo importaban desde este módulo (Repertorio, Órdenes,
// Practica, IniciarServicio).
import { transposeSongStructure } from '../lib/transpose';
// Converters de datos: extraídos a src/lib/converters.js (sin cambios). El store los
// usa en todas sus acciones; normalizeName/stripSongRefs quedaron internos de ese módulo.
import {
  convertMemberFromDB, mergeMemberRealtimeRow, convertBandFromDB,
  convertBandTemporaryMemberFromDB, convertCollabRequestFromDB, convertCollabParticipantFromDB,
  convertServiceSchemaFromDB, convertSchemaTemplateFromDB, convertSongFromDB, convertOrderFromDB,
  convertMemberToDB, convertBandToDB, convertSongToDB, convertOrderToDB,
  convertPracticeLogFromDB, convertPracticeLogToDB,
} from '../lib/converters';

// Re-exports para compatibilidad: los consumidores importan estos desde este módulo
// (la implementación vive ahora en src/lib/transpose.js y src/lib/converters.js).
export { transposeSongStructure };
export { mergeMemberRealtimeRow };

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
        // Miembros: por la VISTA members_directory (landmine #73): correo/teléfono/cumpleaños
        // vienen con valor solo para el pastor y para la propia ficha; el resto en null.
        supabase.from('members_directory').select('*').order('name'),
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

      // Persist to localStorage for survival across page refreshes.
      // Cada setItem va en su propio try/catch: si el navegador queda sin cuota
      // (repertorio grande → JSON > ~5MB), un fallo de caché NO debe abortar la
      // carga ni descartar los datos frescos que acabamos de traer — el store en
      // memoria ya los tiene; localStorage es solo conveniencia offline. (Antes
      // estas 4 escrituras estaban sin guarda y un QuotaExceeded caía al catch
      // externo, que revertía a la copia local vieja en silencio.)
      try { localStorage.setItem('appMembers', JSON.stringify(members)); } catch { /* non-fatal */ }
      try { localStorage.setItem('appBands', JSON.stringify(bands)); } catch { /* non-fatal */ }
      try { localStorage.setItem('appSongs', JSON.stringify(songs)); } catch { /* non-fatal */ }
      try { localStorage.setItem('appOrders', JSON.stringify(orders)); } catch { /* non-fatal */ }
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

      const { error } = await supabase
        .from('members')
        .update(convertMemberToDB(merged))
        .eq('id', id);

      if (error) throw error;

      // La tabla ya no devuelve correo/teléfono/cumpleaños al cliente (landmine #73):
      // se relee la ficha desde la vista (para el pastor y la propia ficha vienen con
      // valor). Si la relectura falla, se conserva el merge local.
      const { data } = await supabase
        .from('members_directory')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      const updatedData = data ? convertMemberFromDB(data) : merged;

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
        // Soft delete = desactivar. Va por la EF admin-update-member (pastor-only): además de
        // active=false, BANEA la cuenta de auth y revoca sesiones → el desactivado deja de
        // entrar de verdad (auditoría de roles 2026-09-12; antes solo se ponía la bandera).
        const res = await get().updateMemberViaAdmin(id, { active: false });
        if (res?.error) throw new Error(res.error);
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
    if (!member) return false;
    // Por la EF (pastor-only): (des)activar también banea/desbanea la cuenta de auth.
    const res = await get().updateMemberViaAdmin(id, { active: !member.active });
    return !res?.error;
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
      // count exacto: si la RLS no deja borrar (rol sin permiso, cuenta inactiva) el
      // DELETE "no falla" pero afecta 0 filas → devolver false, no mentir "eliminado".
      const { error, count } = await supabase
        .from('bands')
        .delete({ count: 'exact' })
        .eq('id', id);

      if (error) throw error;
      if (!count) {
        set({ error: 'No tenés permiso para eliminar esto.' });
        return false;
      }

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

  // `expectedContentChangedAt`: sello que el editor tenía AL ABRIR (no el del store,
  // que Realtime refresca). Las actualizaciones de fondo (last_used de addOrder) no lo pasan.
  updateSong: async (id, updates, expectedContentChangedAt = undefined) => {
    // Campos de contenido que el editor cambia (los que watchea set_song_content_changed).
    // Si `updates` toca alguno, un choque se avisa (no se pisa); si no (p. ej. lastUsed),
    // se re-aplica sobre lo fresco y reintenta (no pisa a nadie).
    const CONTENT_KEYS = ['title', 'artist', 'key', 'originalKey', 'categories', 'structure', 'youtubeUrl', 'compass', 'bpm'];
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

      // Guarda de concurrencia optimista sobre `content_changed_at` (espejo de updateOrder,
      // landmine #85). El sello lo mueve la base SOLO en cambios de contenido (no last_used).
      const doUpdate = (versionToken, mergeBase) => {
        let q = supabase.from('songs').update(convertSongToDB({ ...mergeBase, ...updates })).eq('id', id);
        q = (versionToken == null) ? q.is('content_changed_at', null) : q.eq('content_changed_at', versionToken);
        return q.select().single();
      };

      const expected = (expectedContentChangedAt !== undefined) ? expectedContentChangedAt : current.contentChangedAt;
      let { data, error } = await doUpdate(expected, current);

      if (error && error.code === 'PGRST116') {
        const { data: fresh, error: fErr } = await supabase.from('songs').select('*').eq('id', id).single();
        if (fErr || !fresh) throw (fErr || error);
        const freshSong = convertSongFromDB(fresh);
        set((state) => ({ songs: state.songs.map(s => s.id === id ? freshSong : s) }));

        const contentMoved = (freshSong.contentChangedAt || null) !== (expected || null);
        if (!contentMoved) {
          throw error; // 0 filas pero el contenido no se movió (RLS/carrera) → error genérico
        }
        if (CONTENT_KEYS.some(k => k in updates)) {
          return { __conflict: true, song: freshSong }; // editor de canción → avisar y NO pisar
        }
        ({ data, error } = await doUpdate(freshSong.contentChangedAt, freshSong)); // lastUsed → re-aplicar sobre lo fresco
        if (error) throw error;
      } else if (error) {
        throw error;
      }

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
      // count exacto: si la RLS no deja borrar (rol sin permiso, cuenta inactiva) el
      // DELETE "no falla" pero afecta 0 filas → devolver false, no mentir "eliminado".
      const { error, count } = await supabase
        .from('songs')
        .delete({ count: 'exact' })
        .eq('id', id);

      if (error) throw error;
      if (!count) {
        set({ error: 'No tenés permiso para eliminar esto.' });
        return false;
      }

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

  // `expectedContentChangedAt`: sello de versión que el usuario tenía AL ABRIR el
  // editor (no el del store, que Realtime mantiene fresco y anularía la guarda).
  // Las acciones rápidas (status/devolución) no lo pasan → usan el sello del store.
  updateOrder: async (id, updates, expectedContentChangedAt = undefined) => {
    // Campos que un usuario EDITA de forma deliberada y cuyo pisado sería pérdida
    // real de datos (los mismos que `set_order_content_changed` considera contenido).
    // Si `updates` toca alguno, un choque se avisa (no se pisa); si no (status/
    // devolución), se re-aplica sobre lo fresco (no pisa a nadie).
    const CONTENT_KEYS = ['songs', 'date', 'time', 'bandId', 'meetingType', 'lineup'];
    try {
      // Merge with current store snapshot before converting — see updateMember
      // comment. Without this, saving feedback alone would wipe date/band/songs.
      const current = get().orders.find(o => o.id === id);
      if (!current) {
        console.error('updateOrder: order not found in store, aborting', { id });
        return null;
      }

      // Guarda de concurrencia optimista: el UPDATE solo aplica si `content_changed_at`
      // sigue siendo el que el usuario tenía al abrir. Si otro cambió el CONTENIDO
      // mientras tanto, afecta 0 filas (PGRST116) → detectamos el choque. La base
      // mantiene `content_changed_at` server-side (trigger set_order_content_changed),
      // SOLO en cambios de contenido/formación → los toques de fondo (cron, reminder,
      // suspensión, cambio de estado) NO generan falsos choques.
      const doUpdate = (versionToken, mergeBase) => {
        let q = supabase.from('orders').update(convertOrderToDB({ ...mergeBase, ...updates })).eq('id', id);
        q = (versionToken == null)
          ? q.is('content_changed_at', null)
          : q.eq('content_changed_at', versionToken);
        return q.select().single();
      };

      const expected = (expectedContentChangedAt !== undefined) ? expectedContentChangedAt : current.contentChangedAt;
      let { data, error } = await doUpdate(expected, current);

      if (error && error.code === 'PGRST116') {
        // 0 filas: puede ser un choque de contenido. Traer la versión fresca.
        const { data: fresh, error: fErr } = await supabase.from('orders').select('*').eq('id', id).single();
        if (fErr || !fresh) throw (fErr || error);
        const freshOrder = convertOrderFromDB(fresh);
        set((state) => ({ orders: state.orders.map(o => o.id === id ? freshOrder : o) }));

        const contentMoved = (freshOrder.contentChangedAt || null) !== (expected || null);
        if (!contentMoved) {
          // 0 filas pero el contenido NO se movió (RLS/carrera rara) → error genérico, no un falso choque.
          throw error;
        }
        if (CONTENT_KEYS.some(k => k in updates)) {
          // El usuario estaba editando CONTENIDO → avisar y NO pisar (decisión de Paul).
          return { __conflict: true, order: freshOrder };
        }
        // El usuario NO editaba contenido (status/devolución) → re-aplicar sobre lo fresco
        // (no pisa el contenido nuevo de nadie) y reintentar UNA vez.
        ({ data, error } = await doUpdate(freshOrder.contentChangedAt, freshOrder));
        if (error) throw error;
      } else if (error) {
        throw error;
      }

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
      // count exacto: si la RLS no deja borrar (rol sin permiso, cuenta inactiva) el
      // DELETE "no falla" pero afecta 0 filas → devolver false, no mentir "eliminado".
      const { error, count } = await supabase
        .from('orders')
        .delete({ count: 'exact' })
        .eq('id', id);

      if (error) throw error;
      if (!count) {
        set({ error: 'No tenés permiso para eliminar esto.' });
        return false;
      }

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
        // El clon arranca sin ensamble (la fecha vieja no tiene sentido) y sin
        // formación (se define para el servicio nuevo). Tampoco hereda la suspensión.
        rehearsalDate: null,
        rehearsalTime: null,
        lineup: null,
        rehearsalSuspendedAt: null,
        rehearsalSuspendedReason: null,
        rehearsalSuspendedBy: null,
        rehearsalSuspended: false,
      };
      return get().addOrder(newOrder);
    }
    return null;
  },

  // --- Ensamble: suspender / reactivar / reprogramar ----------------------
  // Van por RPCs SECURITY DEFINER (no por updateOrder): la autorización + el fan-out de
  // avisos + la escritura de columnas server-owned viven en la base. Parcheo optimista del
  // array `orders` (SOLO los campos de suspensión, nunca un convertOrderToDB parcial — regla
  // #8) para que el card del Inicio / calendario / banners reflejen el cambio al instante,
  // sin esperar el realtime (que en móvil puede demorar). El realtime confirma después.
  suspendRehearsal: async (id, reason) => {
    try {
      const { data, error } = await supabase.rpc('suspend_order_rehearsal', { p_order_id: id, p_reason: reason || null });
      if (error) throw error;
      if (data?.ok) {
        const nowIso = new Date().toISOString();
        set((state) => ({
          orders: state.orders.map((o) => o.id === id
            ? { ...o, rehearsalSuspendedAt: nowIso, rehearsalSuspendedReason: (reason && reason.trim()) || null, rehearsalSuspended: true }
            : o),
        }));
      }
      return data || { ok: false };
    } catch (err) {
      console.error('Error suspending rehearsal:', err);
      return { ok: false, error: err.message };
    }
  },

  resumeRehearsal: async (id) => {
    try {
      const { data, error } = await supabase.rpc('resume_order_rehearsal', { p_order_id: id });
      if (error) throw error;
      if (data?.ok) {
        set((state) => ({
          orders: state.orders.map((o) => o.id === id
            ? { ...o, rehearsalSuspendedAt: null, rehearsalSuspendedReason: null, rehearsalSuspendedBy: null, rehearsalSuspended: false }
            : o),
        }));
      }
      return data || { ok: false };
    } catch (err) {
      console.error('Error resuming rehearsal:', err);
      return { ok: false, error: err.message };
    }
  },

  rescheduleRehearsal: async (id, date, time, reason) => {
    try {
      const { data, error } = await supabase.rpc('reschedule_order_rehearsal', { p_order_id: id, p_date: date, p_time: time, p_reason: reason || null });
      if (error) throw error;
      if (data?.ok) {
        set((state) => ({
          orders: state.orders.map((o) => o.id === id
            ? { ...o, rehearsalDate: date, rehearsalTime: time, rehearsalSuspendedAt: null, rehearsalSuspendedReason: null, rehearsalSuspendedBy: null, rehearsalSuspended: false }
            : o),
        }));
      }
      return data || { ok: false };
    } catch (err) {
      console.error('Error rescheduling rehearsal:', err);
      return { ok: false, error: err.message };
    }
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
  // ---------- "¿Con qué ministramos?" — canción de ministración durante el servicio ----------
  // Va por la RPC add_ministration_songs (gate + ventana + validación + aviso server-side).
  // songs = [{ songId, key, directorId|null }]. Devuelve el jsonb de la RPC o { error }.
  addMinistrationSongs: async (orderId, songs) => {
    try {
      const { data, error } = await supabase.rpc('add_ministration_songs', { p_order_id: orderId, p_songs: songs });
      if (error) return { error: error.message || 'error' };
      if (!data || data.ok !== true) return { error: data?.error || 'Respuesta inválida del servidor.' };
      // Parche optimista: las canciones ya están al final del orden en la base.
      if (Array.isArray(data.songs) && data.songs.length > 0) {
        set((state) => {
          const orders = state.orders.map((o) => (o.id === orderId ? { ...o, songs: [...(o.songs || []), ...data.songs] } : o));
          try { localStorage.setItem('appOrders', JSON.stringify(orders)); } catch { /* non-fatal */ }
          return { orders };
        });
      }
      get().refetchOrder(orderId);
      return data;
    } catch (err) {
      console.error('addMinistrationSongs error:', err);
      return { error: err.message || 'error' };
    }
  },

  // Relee UN orden desde la base y lo funde en el store (best-effort, sin throw).
  refetchOrder: async (id) => {
    try {
      const { data } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
      if (!data) return;
      const fresh = convertOrderFromDB(data);
      set((state) => {
        const orders = state.orders.some((o) => o.id === id) ? state.orders.map((o) => (o.id === id ? fresh : o)) : [fresh, ...state.orders];
        try { localStorage.setItem('appOrders', JSON.stringify(orders)); } catch { /* non-fatal */ }
        return { orders };
      });
    } catch { /* non-fatal */ }
  },

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

  // --- Formación del orden ------------------------------------------------
  // Participantes = formación custom, o la banda efectiva si no hay formación /
  // es "todos". Fuente ÚNICA para todo lo que sea "avisos del servicio" en el
  // cliente (Dashboard, PrepBanner, Mi Ensayo). Espejo de order_participant_ids.
  getOrderParticipantIds: (order) => {
    if (!order) return new Set();
    return participantIdsOf(order, get().getEffectiveBandMemberIds(order.bandId));
  },

  isOrderParticipant: (order, memberId) => {
    if (!order || !memberId) return false;
    return isOrderParticipantPure(order, memberId, get().getEffectiveBandMemberIds(order.bandId));
  },

  // Objetos miembro (activos) que participan del orden, ordenados por nombre.
  getOrderParticipants: (order) => {
    const ids = get().getOrderParticipantIds(order);
    return get().members
      .filter((m) => m.active && ids.has(m.id))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
  },

  // { groups: [{ instrument, members }], noInstrument: [] } para mostrar.
  getOrderLineupGroups: (order) => groupByInstrument(order, get().getOrderParticipants(order)),

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
        const idx = list.findIndex((r) => r.id === id);
        const updated = table === 'members' && idx >= 0 ? mergeMemberRealtimeRow(list[idx], newRow) : spec.from(newRow);
        next = idx >= 0 ? list.map((r, i) => (i === idx ? updated : r)) : [updated, ...list];
      }
      try { localStorage.setItem(spec.lsKey, JSON.stringify(next)); } catch { /* non-fatal */ }
      return { [spec.key]: next };
    });

    // Los eventos realtime de `members` llegan SIN correo/teléfono/cumpleaños (Realtime
    // respeta los privilegios de columna, landmine #73). Para que el pastor (y cada uno
    // sobre su ficha) vea el dato fresco, se relee esa ficha desde la vista.
    if (table === 'members' && eventType !== 'DELETE') get().refetchMemberFromDirectory(id);
  },

  // Relee UNA ficha desde members_directory y la funde en el store (best-effort, sin throw).
  refetchMemberFromDirectory: async (id) => {
    try {
      const { data } = await supabase.from('members_directory').select('*').eq('id', id).maybeSingle();
      if (!data) return;
      const fresh = convertMemberFromDB(data);
      set((state) => {
        const idx = state.members.findIndex((m) => m.id === id);
        const members = idx >= 0 ? state.members.map((m, i) => (i === idx ? fresh : m)) : [fresh, ...state.members];
        try { localStorage.setItem('appMembers', JSON.stringify(members)); } catch { /* non-fatal */ }
        return { members };
      });
    } catch { /* non-fatal */ }
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
        // decidedAt = cuándo se cubrió (fecha de la decisión) para el vencimiento del banner.
        results.push({ request: r, outcome: mine.status, decidedAt: r.coveredAt || mine.updatedAt || null });
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
  'Voz', 'Guitarra Eléctrica', 'Guitarra Acústica', 'Piano', 'Teclado', 'Batería', 'Percusión', 'Bajo', 'Violín', 'Flauta', 'Saxofón', 'Trompeta', 'Coros'
];

export const MUSICAL_KEYS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Am', 'A#m', 'Bm', 'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m'
];
