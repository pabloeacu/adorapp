import { create } from 'zustand';
import { supabase, supabaseAdmin } from '../lib/supabase';
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
  // Pattern: [A-G] + optional [#b] + optional suffix
  const match = mainPart.match(/^([A-G])([#b]?)(.*)$/);
  if (!match) return token;

  const rootNote = match[1];
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
    const bassMatch = bassPart.match(/^([A-G])([#b]?)(.*)$/);
    if (bassMatch) {
      const bassRoot = bassMatch[1];
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

// Legacy function for single chord (now uses the token function)
const transposeChord = (chord, semitones) => {
  return transposeChordToken(chord, semitones);
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
  createdAt: o.created_at,
  updatedAt: o.updated_at,
});

// Convert camelCase to snake_case for Supabase
const convertMemberToDB = (m) => ({
  name: m.name,
  email: m.email,
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
});

const convertBandToDB = (b) => ({
  name: b.name,
  meeting_type: b.meetingType || 'culto_general',
  meeting_day: b.meetingDay || null,
  meeting_time: b.meetingTime || '20:00',
  members: b.members || [],
  active: b.active ?? true,
});

const convertSongToDB = (s) => ({
  title: s.title,
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
});

export const useAppStore = create((set, get) => ({
  members: [],
  bands: [],
  songs: [],
  orders: [],
  loading: false,
  error: null,

  // Auto-refresh mechanism for PWA
  autoRefreshInterval: null,
  autoRefreshMinutes: 5,

  // Set auto-refresh interval (in minutes, 0 to disable)
  setAutoRefresh: (minutes) => {
    const state = get();

    // Clear existing interval
    if (state.autoRefreshInterval) {
      clearInterval(state.autoRefreshInterval);
    }

    if (minutes > 0) {
      console.log(`🔄 Auto-refresh enabled: every ${minutes} minutes`);
      const intervalId = setInterval(() => {
        console.log('🔄 Auto-refresh triggered, reloading data...');
        get().initialize();
      }, minutes * 60 * 1000);

      set({ autoRefreshInterval: intervalId, autoRefreshMinutes: minutes });
    } else {
      console.log('🔄 Auto-refresh disabled');
      set({ autoRefreshInterval: null, autoRefreshMinutes: 0 });
    }
  },

  // Stop auto-refresh
  clearAutoRefresh: () => {
    const state = get();
    if (state.autoRefreshInterval) {
      clearInterval(state.autoRefreshInterval);
      set({ autoRefreshInterval: null });
      console.log('🔄 Auto-refresh stopped');
    }
  },

  // Initialize data from Supabase
  initialize: async () => {
    set({ loading: true, error: null });

    try {
      const [membersRes, bandsRes, songsRes, ordersRes] = await Promise.all([
        supabase.from('members').select('*').order('name'),
        supabase.from('bands').select('*').order('name'),
        supabase.from('songs').select('*').order('title'),
        supabase.from('orders').select('*').order('date', { ascending: false }),
      ]);

      if (membersRes.error) throw membersRes.error;
      if (bandsRes.error) throw bandsRes.error;
      if (songsRes.error) throw songsRes.error;
      if (ordersRes.error) throw ordersRes.error;

      const members = membersRes.data.map(convertMemberFromDB);
      const bands = bandsRes.data.map(convertBandFromDB);
      const songs = songsRes.data.map(convertSongFromDB);
      const orders = ordersRes.data.map(convertOrderFromDB);

      // Persist to localStorage for survival across page refreshes
      localStorage.setItem('appMembers', JSON.stringify(members));
      localStorage.setItem('appBands', JSON.stringify(bands));
      localStorage.setItem('appSongs', JSON.stringify(songs));
      localStorage.setItem('appOrders', JSON.stringify(orders));

      set({
        members,
        bands,
        songs,
        orders,
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

        if (cachedMembers.length > 0 || cachedBands.length > 0 || cachedSongs.length > 0) {
          console.log('📦 Loading from localStorage cache...');
          set({
            members: cachedMembers,
            bands: cachedBands,
            songs: cachedSongs,
            orders: cachedOrders,
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

  // Member CRUD
  addMember: async (member) => {
    try {
      const memberId = uuidv4();
      let userId = null;

      // Create auth user if email and password are provided
      if (member.email && member.password) {
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: member.email,
          password: member.password,
          email_confirm: true,
          user_metadata: { name: member.name },
        });

        if (authError) {
          console.error('Auth creation error:', authError);
          // Continue anyway - the member record is still created
        } else if (authData?.user) {
          userId = authData.user.id;
        }
      }

      const newMember = {
        ...convertMemberToDB(member),
        id: memberId,
        user_id: userId,
      };

      // Remove password from data before storing
      delete newMember.password;

      const { data, error } = await supabase
        .from('members')
        .insert(newMember)
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        members: [...state.members, convertMemberFromDB(data)],
      }));

      // Return the created member along with the generated password
      return { ...data, generatedPassword: member.password };
    } catch (err) {
      console.error('Error adding member:', err);
      set({ error: err.message });
      return null;
    }
  },

  updateMember: async (id, updates) => {
    try {
      // CRITICAL: Preserve avatar_url if not explicitly provided in updates
      // This prevents losing the avatar when only role/name/etc is changed
      const existingMember = get().members.find(m => m.id === id);

      // Only preserve if avatar is not being explicitly changed to a new value
      // convertMemberToDB uses avatarUrl, so we must set that field
      if (!updates.avatar_url && !updates.avatarUrl && existingMember?.avatar_url) {
        updates.avatar_url = existingMember.avatar_url;
        updates.avatarUrl = existingMember.avatar_url; // <-- This is the fix!
      }

      const { data, error } = await supabase
        .from('members')
        .update(convertMemberToDB(updates))
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

  deleteMember: async (id, permanent = false) => {
    try {
      if (permanent) {
        // Permanent deletion - remove from database completely
        const member = get().members.find(m => m.id === id);

        // Delete the auth user if exists
        if (member?.userId) {
          try {
            const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(member.userId);
            if (authError) {
              console.error('Error deleting auth user:', authError);
              // Continue with member deletion even if auth delete fails
            }
          } catch (authErr) {
            console.error('Auth delete error:', authErr);
          }
        }

        // Delete from members table
        const { error } = await supabase
          .from('members')
          .delete()
          .eq('id', id);

        if (error) throw error;

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
      const { data, error } = await supabase
        .from('bands')
        .update(convertBandToDB(updates))
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
      const { data, error } = await supabase
        .from('songs')
        .update(convertSongToDB(updates))
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
      const { data, error } = await supabase
        .from('orders')
        .update(convertOrderToDB(updates))
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

  // Helper functions
  getMemberById: (id) => get().members.find(m => m.id === id),
  getBandById: (id) => get().bands.find(b => b.id === id),
  getSongById: (id) => get().songs.find(s => s.id === id),

  // Get members by band
  getBandMembers: (bandId) => {
    const band = get().bands.find(b => b.id === bandId);
    if (!band) return [];
    return get().members.filter(m => band.members.includes(m.id) && m.active);
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

  // Reset all data on logout
  reset: () => {
    // Clear auto-refresh interval
    if (get().autoRefreshInterval) {
      clearInterval(get().autoRefreshInterval);
    }

    set({
      members: [],
      bands: [],
      songs: [],
      orders: [],
      loading: false,
      error: null,
      autoRefreshInterval: null,
      autoRefreshMinutes: 5,
    });
    console.log('✅ App store reset on logout (localStorage preserved)');
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
