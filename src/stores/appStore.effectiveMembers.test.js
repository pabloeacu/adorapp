// Paridad del "miembro efectivo" (permanentes ∪ temporales vigentes) con la
// semántica SQL de band_effective_member_ids(): vigente = expires_at > now,
// vencido excluido, permanente gana sobre temporal. Mutación pura del store.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));

import { useAppStore } from './appStore';

const DAY = 86400000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

describe('getEffectiveBandMemberIds / getBandMembers', () => {
  beforeEach(() => {
    useAppStore.setState({
      members: [
        { id: 'perm1', name: 'Perm Uno', active: true, instruments: ['Voz'] },
        { id: 'temp1', name: 'Temp Uno', active: true, instruments: ['Bajo'] },
        { id: 'exp1', name: 'Vencido', active: true, instruments: [] },
        { id: 'inact', name: 'Inactivo', active: false, instruments: [] },
        { id: 'other', name: 'Ajeno', active: true, instruments: [] },
      ],
      bands: [{ id: 'b1', name: 'Banda', members: ['perm1'], active: true }],
      bandTemporaryMembers: [
        { id: 't1', bandId: 'b1', memberId: 'temp1', expiresAt: iso(1 * DAY) },   // vigente
        { id: 't2', bandId: 'b1', memberId: 'exp1', expiresAt: iso(-1 * DAY) },   // vencido
        { id: 't3', bandId: 'b2', memberId: 'other', expiresAt: iso(1 * DAY) },   // otra banda
      ],
    });
  });

  it('incluye permanentes + temporales vigentes; excluye vencidos y de otra banda', () => {
    const ids = useAppStore.getState().getEffectiveBandMemberIds('b1');
    expect(ids.has('perm1')).toBe(true);
    expect(ids.has('temp1')).toBe(true);
    expect(ids.has('exp1')).toBe(false);
    expect(ids.has('other')).toBe(false);
    expect(ids.size).toBe(2);
  });

  it('getBandMembers marca {temporary,expiresAt} en temporales, no en permanentes; excluye vencido e inactivo', () => {
    const list = useAppStore.getState().getBandMembers('b1');
    const perm = list.find((m) => m.id === 'perm1');
    const temp = list.find((m) => m.id === 'temp1');
    expect(perm).toBeTruthy();
    expect(perm.temporary).toBeUndefined();
    expect(temp).toBeTruthy();
    expect(temp.temporary).toBe(true);
    expect(typeof temp.expiresAt).toBe('string');
    expect(list.find((m) => m.id === 'exp1')).toBeUndefined();
    expect(list.find((m) => m.id === 'inact')).toBeUndefined();
    expect(list).toHaveLength(2);
  });

  it('el permanente gana si alguien es permanente Y temporal (sin badge)', () => {
    useAppStore.setState({ bands: [{ id: 'b1', name: 'Banda', members: ['perm1', 'temp1'], active: true }] });
    const temp = useAppStore.getState().getBandMembers('b1').find((m) => m.id === 'temp1');
    expect(temp.temporary).toBeUndefined();
  });

  it('banda sin temporales: efectivos == permanentes (paridad con SQL de tabla vacía)', () => {
    useAppStore.setState({ bandTemporaryMembers: [] });
    const ids = useAppStore.getState().getEffectiveBandMemberIds('b1');
    expect([...ids].sort()).toEqual(['perm1']);
  });

  it('banda inexistente: efectivos vacío y getBandMembers vacío', () => {
    const ids = useAppStore.getState().getEffectiveBandMemberIds('nope');
    expect(ids.size).toBe(0);
    expect(useAppStore.getState().getBandMembers('nope')).toEqual([]);
  });
});
