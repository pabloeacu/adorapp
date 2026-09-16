import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAppStore } from './appStore';
import { invalidateRefresh } from '../lib/refreshThrottle';

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  error: null,
  isRefreshing: false, // Prevent multiple simultaneous refreshes

  // Initialize auth state (sesión + ficha, en serie). Se conserva por
  // compatibilidad; el arranque de App usa restoreSession + bootProfile para
  // pedir la ficha EN PARALELO con los datos (ver App.jsx).
  initialize: async () => {
    const user = await get().restoreSession();
    if (user) await get().bootProfile(user.id);
  },

  // Paso 1 del arranque: restaurar la sesión guardada en el dispositivo.
  // Es local (no viaja al servidor salvo que el token esté vencido y haya que
  // refrescarlo). Deja `user` listo, con la credencial cargada en el cliente
  // de Supabase, para que TODO pedido posterior (ficha y tablas) salga
  // autenticado. Con sesión: `loading` queda en true hasta bootProfile.
  // Sin sesión: `loading` false (irá al login). Devuelve el user o null.
  restoreSession: async () => {
    let user = null;
    try {
      // Clear ALL cached auth data first
      localStorage.removeItem('user_profile');
      localStorage.removeItem('user');

      // Check for existing session
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        user = session.user;
        set({ user, loading: true });
      } else {
        set({ loading: false });
      }
    } catch (err) {
      console.error('Auth initialization error:', err);
      set({ loading: false });
    }

    // Listen for auth changes - ONLY handle sign out events, not refreshes
    get()._listenAuthChanges();
    return user;
  },

  // Paso 2 del arranque: la ficha del miembro (1 viaje). Pase lo que pase,
  // suelta `loading` (la pantalla de carga se gatea con él).
  bootProfile: async (userId) => {
    try {
      await get().fetchProfile(userId);
    } finally {
      set({ loading: false });
    }
  },

  _authListenerBound: false,
  _listenAuthChanges: () => {
    if (get()._authListenerBound) return;
    set({ _authListenerBound: true });
    supabase.auth.onAuthStateChange(async (event, session) => {
      // Only process SIGNED_IN and SIGNED_OUT events, ignore TOKEN_REFRESHED
      if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        if (!session?.user) {
          // User signed out or no session
          set({ user: null, profile: null, loading: false });
        }
      }
      // IGNORE token refresh events to prevent infinite loops
    });
  },

  // Force-refresh the current user's profile AND the appStore caches that mirror
  // the same data. This is the canonical way to make a profile/avatar/role
  // change propagate everywhere without waiting for a route change.
  refreshProfile: async () => {
    const userId = get().user?.id;
    if (!userId) return;

    localStorage.removeItem('user_profile');
    await get().fetchProfile(userId);

    try {
      await useAppStore.getState().initialize();
    } catch (err) {
      console.error('appStore refresh after profile update failed:', err);
    }
  },

  // Fetch user profile from members table - ALWAYS fresh from DB
  fetchProfile: async (userId) => {
    try {
      // ALWAYS clear cached profile to ensure fresh data from database
      localStorage.removeItem('user_profile');

      // First try to find by user_id
      // Por la VISTA members_directory (landmine #73): la propia ficha viene completa
      // (correo/teléfono/cumpleaños) aunque la tabla ya no exponga esas columnas.
      let { data, error } = await supabase
        .from('members_directory')
        .select('*')
        .eq('user_id', userId)
        .single();

      // If not found by user_id, try to get from appStore by email
      if ((error || !data) && get().user?.email) {
        const appStore = useAppStore.getState();
        const memberFromAppStore = appStore.members?.find(m => (m.email || '').toLowerCase() === get().user.email.toLowerCase());
        if (memberFromAppStore) {
          // Get fresh data from DB
          const memberId = memberFromAppStore.id;
          const { data: freshData } = await supabase
            .from('members_directory')
            .select('*')
            .eq('id', memberId)
            .single();
          if (freshData) {
            data = freshData;
            error = null;
          }
        }
      }

      if (error) {
        console.log('Profile fetch error:', error.message);
        set({ profile: null });
        return;
      }

      if (data) {
        console.log('🔍 PROFILE LOADED FROM DB:', data.role, data.name, 'user_id:', data.user_id);
        set({ profile: data });
        // Don't cache to localStorage to avoid stale data issues
      }
    } catch (err) {
      console.log('Profile fetch error (expected for new users):', err.message);
      set({ profile: null });
    }
  },

  // Sign in with email and password
  login: async (email, password) => {
    set({ error: null, loading: true });

    try {
      // Clear ALL cached data before login
      localStorage.removeItem('user_profile');
      localStorage.removeItem('user');

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        set({ error: error.message, loading: false });
        return false;
      }

      if (data?.user) {
        set({ user: data.user, loading: true });
        // Fetch profile fresh from DB
        await get().fetchProfile(data.user.id);
        set({ loading: false });
        return true;
      }
    } catch (err) {
      set({ error: err.message, loading: false });
      return false;
    }

    set({ loading: false });
    return false;
  },

  // Sign up new user
  // (signUp eliminado: nadie lo usaba y escribía `members` desde el cliente; el alta va
  //  SOLO por pending_registrations + EF admin-approve-registration. Landmine #41.)

  // Sign out — wipe every trace of the previous user from this device:
  // Supabase session, app caches, per-user keys, sessionStorage. Anything
  // that survived would either leak data across users on a shared device
  // or cause the next login to flash stale state.
  logout: async () => {
    try {
      await supabase.auth.signOut();

      // Static keys we know about.
      const staticKeys = [
        'user_profile',
        'user',
        'userPhoto',
        'rememberedEmail',
        'rememberMe',
        'rememberedPassword', // legacy leak — clear if any old client still has it
        'lastDevocionalDate',
        'readDevotionalIds',
        'supabase-auth-token',
        'supabase-session',
        'sb-gvsoexomzfaimagnaqzm-auth-token',
        'sb-gvsoexomzfaimagnaqzm-auth-token-change-token',
      ];
      staticKeys.forEach(k => localStorage.removeItem(k));

      // Per-user notification read-state keys (one per user_id we ever saw).
      try {
        const toDelete = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('readNotificationIds_')) toDelete.push(key);
        }
        toDelete.forEach(k => localStorage.removeItem(k));
      } catch { /* non-fatal */ }

      sessionStorage.clear();

      // App caches (members/bands/songs/orders) — handled inside the store reset.
      useAppStore.getState().reset();
      // El store quedó vacío: la próxima sesión tiene que volver a cargar todo
      // aunque entre dentro de la ventana de 15 s del auto-refresco.
      invalidateRefresh();

      set({ user: null, profile: null, loading: false, error: null });
    } catch (err) {
      console.error('Logout error:', err);
    }
  },

  // Reset password
  resetPassword: async (email) => {
    set({ error: null, loading: true });

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        set({ error: error.message, loading: false });
        return false;
      }

      set({ loading: false });
      return true;
    } catch (err) {
      set({ error: err.message, loading: false });
      return false;
    }
  },

  // Clear error
  clearError: () => set({ error: null }),
}));
