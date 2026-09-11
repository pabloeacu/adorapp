// Formación del orden en el store: (a) los helpers de participantes espejan la
// semántica SQL (custom = lista; all/null = banda efectiva); (b) la puerta a la
// base (convertOrderToDB vía addOrder/updateOrder) NO persiste las claves de UI
// de las canciones y SÍ reenvía `lineup` (regla #8 / landmine #51).

import { describe, it, expect, beforeEach, vi } from 'vitest';

const captured = { inserted: null, updated: null };
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
      insert: (row) => { captured.inserted = row; return { select: () => ({ single: () => Promise.resolve({ data: { ...row, band_id: row.band_id }, error: null }) }) }; },
      update: (row) => { captured.updated = row; return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'o1', ...row }, error: null }) }) }) }; },
    }),
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));

import { useAppStore } from './appStore';

const DAY = 86400000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

describe('formación en el store', () => {
  beforeEach(() => {
    captured.inserted = null; captured.updated = null;
    useAppStore.setState({
      members: [
        { id: 'luca', name: 'Luca', active: true, instruments: ['Batería', 'Bajo'] },
        { id: 'marcos', name: 'Marcos', active: true, instruments: ['Batería'] },
        { id: 'temp', name: 'Temporal', active: true, instruments: ['Voz'] },
        { id: 'inact', name: 'Inactivo', active: false, instruments: ['Voz'] },
      ],
      bands: [{ id: 'b1', name: 'Banda', members: ['luca', 'marcos', 'inact'], active: true }],
      bandTemporaryMembers: [{ id: 't1', bandId: 'b1', memberId: 'temp', expiresAt: iso(DAY) }],
      orders: [{ id: 'o1', bandId: 'b1', date: '2026-09-12', time: '16:00', meetingType: 'jovenes', songs: [{ songId: 's1', key: 'C', directorId: 'luca', _localId: 'x', _pendingHistory: true, _suggestedDirector: false }], status: 'scheduled', feedback: '', lineup: null }],
      songs: [],
    });
  });

  it('participantes: null/all → banda efectiva (temporal incluido); custom → lista', () => {
    const st = useAppStore.getState();
    const o = st.orders[0];
    expect([...st.getOrderParticipantIds(o)].sort()).toEqual(['inact', 'luca', 'marcos', 'temp']);
    expect(st.getOrderParticipants(o).map((m) => m.id)).toEqual(['luca', 'marcos', 'temp']); // activos, por nombre
    expect(st.isOrderParticipant(o, 'temp')).toBe(true);
    const custom = { ...o, lineup: { mode: 'custom', members: [{ memberId: 'marcos', instruments: ['Batería'] }] } };
    expect(st.isOrderParticipant(custom, 'luca')).toBe(false);
    expect(st.isOrderParticipant(custom, 'marcos')).toBe(true);
    expect(st.getOrderLineupGroups(custom).groups).toEqual([{ instrument: 'Batería', members: [expect.objectContaining({ id: 'marcos' })] }]);
  });

  it('addOrder stripea _localId/_pendingHistory/_suggestedDirector y manda lineup', async () => {
    await useAppStore.getState().addOrder({
      date: '2026-10-01', time: '20:00', bandId: 'b1', meetingType: 'culto_general',
      songs: [{ songId: 's1', key: 'C', directorId: 'luca', _localId: 'abc', _pendingHistory: true, _suggestedDirector: true }],
      lineup: { mode: 'custom', members: [{ memberId: 'luca', instruments: ['Batería'] }] },
    });
    expect(captured.inserted.songs).toEqual([{ songId: 's1', key: 'C', directorId: 'luca' }]);
    expect(captured.inserted.lineup).toEqual({ mode: 'custom', members: [{ memberId: 'luca', instruments: ['Batería'] }] });
  });

  it('updateOrder conserva lineup del snapshot al editar otra cosa y lo reemplaza al editar formación', async () => {
    useAppStore.setState({ orders: [{ ...useAppStore.getState().orders[0], lineup: { mode: 'all', members: [] } }] });
    await useAppStore.getState().updateOrder('o1', { feedback: 'ok' });
    expect(captured.updated.lineup).toEqual({ mode: 'all', members: [] });
    expect(captured.updated.songs).toEqual([{ songId: 's1', key: 'C', directorId: 'luca' }]);
    await useAppStore.getState().updateOrder('o1', { lineup: { mode: 'custom', members: [{ memberId: 'marcos', instruments: ['Batería'] }] } });
    expect(captured.updated.lineup.mode).toBe('custom');
  });

  it('cloneOrder no hereda ensamble ni formación', async () => {
    useAppStore.setState({ orders: [{ ...useAppStore.getState().orders[0], rehearsalDate: '2026-09-11', rehearsalTime: '18:00', lineup: { mode: 'custom', members: [{ memberId: 'luca', instruments: [] }] } }] });
    await useAppStore.getState().cloneOrder('o1');
    expect(captured.inserted.rehearsal_date).toBeNull();
    expect(captured.inserted.rehearsal_time).toBeNull();
    expect(captured.inserted.lineup).toBeNull();
    expect(captured.inserted.status).toBe('scheduled');
  });
});
