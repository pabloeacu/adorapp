// restoreSession / bootProfile: la credencial queda lista antes de cualquier
// pedido; `loading` se suelta solo cuando la ficha volvió (o no hay sesión).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = { session: null, profileRow: null, calls: [] };
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: vi.fn(),
    },
    from: (table) => ({
      select: () => ({ eq: () => ({ single: async () => { state.calls.push(table); return { data: state.profileRow, error: state.profileRow ? null : { message: 'no' } }; } }) }),
    }),
  },
  callAdminFunction: vi.fn(),
}));

import { useAuthStore } from './authStore';

describe('authStore arranque', () => {
  beforeEach(() => { state.session = null; state.profileRow = null; state.calls = []; useAuthStore.setState({ user: null, profile: null, loading: true, _authListenerBound: false }); });

  it('sin sesión: user null y loading false (va al login)', async () => {
    const user = await useAuthStore.getState().restoreSession();
    expect(user).toBeNull();
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('con sesión: deja user y loading true hasta que bootProfile trae la ficha', async () => {
    state.session = { user: { id: 'u1', email: 'a@b.c' } };
    state.profileRow = { id: 'm1', user_id: 'u1', name: 'Ana', role: 'pastor' };
    const user = await useAuthStore.getState().restoreSession();
    expect(user.id).toBe('u1');
    expect(useAuthStore.getState().loading).toBe(true);
    expect(state.calls).toEqual([]); // restoreSession NO pide la ficha
    await useAuthStore.getState().bootProfile('u1');
    expect(state.calls).toEqual(['members_directory']); // la ficha se lee por la VISTA (landmine #73)
    expect(useAuthStore.getState().profile?.name).toBe('Ana');
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('bootProfile suelta loading aunque la ficha falle', async () => {
    state.session = { user: { id: 'u1' } };
    await useAuthStore.getState().restoreSession();
    await useAuthStore.getState().bootProfile('u1');
    expect(useAuthStore.getState().profile).toBeNull();
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it('initialize() sigue siendo sesión + ficha en serie (compatibilidad)', async () => {
    state.session = { user: { id: 'u1' } };
    state.profileRow = { id: 'm1', user_id: 'u1', name: 'Ana', role: 'pastor' };
    await useAuthStore.getState().initialize();
    expect(state.calls).toEqual(['members_directory']); // la ficha se lee por la VISTA (landmine #73)
    expect(useAuthStore.getState().loading).toBe(false);
  });
});
