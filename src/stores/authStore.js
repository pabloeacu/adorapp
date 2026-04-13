import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAppStore } from './appStore';

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  error: null,
  isRefreshing: false, // Prevent multiple simultaneous refreshes

  // Initialize auth state
  initialize: async () => {
    try {
      // Clear ALL cached auth data first
      localStorage.removeItem('user_profile');
      localStorage.removeItem('user');

      // Check for existing session
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        set({ user: session.user, loading: true });
        await get().fetchProfile(session.user.id);
      }
    } catch (err) {
      console.error('Auth initialization error:', err);
    } finally {
      set({ loading: false });
    }

    // Listen for auth changes - ONLY handle sign out events, not refreshes
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

  // Force refresh profile from database - ALWAYS bypass cache
  refreshProfile: async () => {
    const userId = get().user?.id;
    if (!userId) return;

    localStorage.removeItem('user_profile');
    await get().fetchProfile(userId);
  },

  // Fetch user profile from members table - ALWAYS fresh from DB
  fetchProfile: async (userId) => {
    try {
      // ALWAYS clear cached profile to ensure fresh data from database
      localStorage.removeItem('user_profile');

      // First try to find by user_id
      let { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('user_id', userId)
        .single();

      // If not found by user_id, try to get from appStore by email
      if ((error || !data) && get().user?.email) {
        const appStore = useAppStore.getState();
        const memberFromAppStore = appStore.members?.find(m => m.email === get().user.email);
        if (memberFromAppStore) {
          // Get fresh data from DB
          const memberId = memberFromAppStore.id;
          const { data: freshData } = await supabase
            .from('members')
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
  signUp: async (email, password, name) => {
    set({ error: null, loading: true });

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });

      if (error) {
        set({ error: error.message, loading: false });
        return false;
      }

      // Create member profile if signup successful
      if (data?.user) {
        await supabase.from('members').insert({
          id: data.user.id,
          name,
          email,
          user_id: data.user.id,
          role: 'member',
          active: true,
        });

        set({ user: data.user });
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

  // Sign out - COMPLETE CLEANUP of all local data
  logout: async () => {
    try {
      // 1. Clear Supabase auth session
      await supabase.auth.signOut();

      // 2. Clear ALL localStorage data related to auth and app
      const keysToRemove = [
        'user_profile',
        'user',
        'userPhoto',
        'supabase-auth-token',
        'supabase-session',
        'sb-gvsoexomzfaimagnaqzm-auth-token',
        'sb-gvsoexomzfaimagnaqzm-auth-token-change-token'
      ];

      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });

      // 3. Clear sessionStorage as well
      sessionStorage.clear();

      // 4. Reset app store data (members, bands, songs, orders)
      useAppStore.getState().reset();

      // 5. Reset auth store state
      set({ user: null, profile: null, loading: false, error: null });

      console.log('✅ Complete logout cleanup performed');
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
