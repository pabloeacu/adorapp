// Targeted tests for the realtime merge action — pure store mutation, so
// no Supabase mock is needed.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// We don't actually call supabase here, but appStore imports it. Stub the
// module so the import graph resolves cleanly under jsdom.
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));

import { useAppStore } from './appStore';

describe('mergeRealtimeChange', () => {
  beforeEach(() => {
    useAppStore.setState({ members: [], bands: [], songs: [], orders: [] });
  });

  it('inserts a new member at the head of the list', () => {
    useAppStore.getState().mergeRealtimeChange({
      table: 'members',
      eventType: 'INSERT',
      newRow: { id: 'm1', name: 'Ana', email: 'ana@x', role: 'pastor', active: true },
    });
    expect(useAppStore.getState().members).toHaveLength(1);
    expect(useAppStore.getState().members[0]).toMatchObject({ id: 'm1', name: 'Ana' });
  });

  it('does not duplicate when the row was already optimistically inserted', () => {
    useAppStore.setState({
      members: [{ id: 'm1', name: 'Ana', role: 'pastor', active: true }],
    });
    useAppStore.getState().mergeRealtimeChange({
      table: 'members',
      eventType: 'INSERT',
      newRow: { id: 'm1', name: 'Ana', role: 'pastor', active: true },
    });
    expect(useAppStore.getState().members).toHaveLength(1);
  });

  it('replaces a row on UPDATE, preserving order', () => {
    useAppStore.setState({
      orders: [
        { id: 'o1', date: '2026-01-01', bandId: 'b1' },
        { id: 'o2', date: '2026-02-02', bandId: 'b2' },
      ],
    });
    useAppStore.getState().mergeRealtimeChange({
      table: 'orders',
      eventType: 'UPDATE',
      newRow: { id: 'o1', date: '2026-12-31', band_id: 'b9', songs: [] },
    });
    const list = useAppStore.getState().orders;
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 'o1', date: '2026-12-31' });
    expect(list[1].id).toBe('o2');
  });

  it('removes a row on DELETE', () => {
    useAppStore.setState({
      songs: [
        { id: 's1', title: 'A' },
        { id: 's2', title: 'B' },
      ],
    });
    useAppStore.getState().mergeRealtimeChange({
      table: 'songs',
      eventType: 'DELETE',
      oldRow: { id: 's1' },
    });
    const list = useAppStore.getState().songs;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('s2');
  });

  it('falls through silently for unknown tables', () => {
    expect(() =>
      useAppStore.getState().mergeRealtimeChange({
        table: 'whatever',
        eventType: 'INSERT',
        newRow: { id: 'x' },
      })
    ).not.toThrow();
  });

  it('falls through silently when the row has no id', () => {
    useAppStore.getState().mergeRealtimeChange({
      table: 'members',
      eventType: 'INSERT',
      newRow: { name: 'no id' },
    });
    expect(useAppStore.getState().members).toHaveLength(0);
  });
});
