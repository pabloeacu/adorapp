import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}), channel: () => ({}), auth: {} }, callAdminFunction: async () => ({}) }));
import { mergeMemberRealtimeRow } from './appStore';

// Los eventos realtime de `members` llegan SIN correo/teléfono/cumpleaños (Realtime
// respeta los privilegios de columna; landmine #73). El fundido no debe borrar lo que
// el pastor ya tenía en memoria.
describe('mergeMemberRealtimeRow', () => {
  const existing = {
    id: 'm1', name: 'Ana', email: 'ana@caf.test', phone: '11-1', birthdate: '1990-01-01',
    role: 'pastor', editor: false, instruments: ['Voz'], areas: [], active: true, onboarded: true,
    userId: 'u1', avatar_url: 'a.png', avatarUrl: 'a.png', createdAt: 'c', updatedAt: 'u',
    pastor_area: null, leader_of: null,
  };

  it('pisa solo lo que trae la fila y conserva los datos personales previos', () => {
    const row = { id: 'm1', name: 'Ana C.', role: 'pastor', editor: true, instruments: ['Voz', 'Piano'], areas: [], active: true, onboarded: true, user_id: 'u1', avatar_url: 'b.png', created_at: 'c', updated_at: 'u2' };
    const merged = mergeMemberRealtimeRow(existing, row);
    expect(merged.name).toBe('Ana C.');
    expect(merged.editor).toBe(true);
    expect(merged.instruments).toEqual(['Voz', 'Piano']);
    expect(merged.avatarUrl).toBe('b.png');
    expect(merged.email).toBe('ana@caf.test');
    expect(merged.phone).toBe('11-1');
    expect(merged.birthdate).toBe('1990-01-01');
  });

  it('si la fila trae los datos personales (propia ficha por la vista), los actualiza', () => {
    const merged = mergeMemberRealtimeRow(existing, { id: 'm1', name: 'Ana', phone: '11-2', email: 'ana2@caf.test', birthdate: '1991-02-02' });
    expect(merged.phone).toBe('11-2');
    expect(merged.email).toBe('ana2@caf.test');
    expect(merged.birthdate).toBe('1991-02-02');
  });

  it('una fila sin avatar_url no borra la foto', () => {
    const merged = mergeMemberRealtimeRow(existing, { id: 'm1', name: 'Ana' });
    expect(merged.avatar_url).toBe('a.png');
    expect(merged.avatarUrl).toBe('a.png');
  });
});
