import { describe, it, expect } from 'vitest';
import {
  GUEST_SUFFIX, isGuest, guestUntilOf, isGuestExpired, isGuestActive,
  isMemberSelectable, stripGuestSuffix, withGuestSuffix, formatGuestUntil,
  guestBadge, guestDaysUntil,
} from './guests';

const normal = { id: 'n', name: 'Ana', active: true, guestUntil: null };
const guestVigente = { id: 'g', name: 'Marcos Witt -invitado-', active: true, guestUntil: '2026-11-09' };
const guestVencido = { id: 'x', name: 'Juan -invitado-', active: true, guestUntil: '2026-10-01' };
const guestInactivo = { id: 'i', name: 'Leo -invitado-', active: false, guestUntil: '2026-12-31' };
const TODAY = '2026-11-03';

describe('isGuest / guestUntilOf', () => {
  it('detecta invitados por guest_until', () => {
    expect(isGuest(normal)).toBe(false);
    expect(isGuest(guestVigente)).toBe(true);
    expect(isGuest(null)).toBe(false);
    expect(isGuest({})).toBe(false);
    expect(guestUntilOf(guestVigente)).toBe('2026-11-09');
    expect(guestUntilOf(normal)).toBe(null);
  });
});

describe('isGuestExpired / isGuestActive', () => {
  it('un invitado vence cuando hoy ya pasó su guest_until (inclusive)', () => {
    expect(isGuestExpired(guestVigente, TODAY)).toBe(false); // 2026-11-09 >= 2026-11-03
    expect(isGuestExpired(guestVencido, TODAY)).toBe(true);  // 2026-10-01 < 2026-11-03
    expect(isGuestExpired(normal, TODAY)).toBe(false);       // no es invitado
  });
  it('el día exacto de vencimiento todavía está vigente (inclusive)', () => {
    expect(isGuestExpired({ guestUntil: TODAY }, TODAY)).toBe(false);
    expect(isGuestActive({ guestUntil: TODAY }, TODAY)).toBe(true);
  });
  it('isGuestActive = invitado y no vencido', () => {
    expect(isGuestActive(guestVigente, TODAY)).toBe(true);
    expect(isGuestActive(guestVencido, TODAY)).toBe(false);
    expect(isGuestActive(normal, TODAY)).toBe(false);
  });
});

describe('isMemberSelectable', () => {
  it('normal activo = seleccionable; inactivo = no', () => {
    expect(isMemberSelectable(normal, TODAY)).toBe(true);
    expect(isMemberSelectable({ ...normal, active: false }, TODAY)).toBe(false);
  });
  it('invitado vigente = seleccionable; vencido = no; inactivo = no', () => {
    expect(isMemberSelectable(guestVigente, TODAY)).toBe(true);
    expect(isMemberSelectable(guestVencido, TODAY)).toBe(false);
    expect(isMemberSelectable(guestInactivo, TODAY)).toBe(false);
  });
});

describe('sufijo -invitado-', () => {
  it('agrega el sufijo una sola vez (idempotente) y lo saca', () => {
    expect(withGuestSuffix('Marcos Witt')).toBe(`Marcos Witt${GUEST_SUFFIX}`);
    expect(withGuestSuffix('Marcos Witt -invitado-')).toBe(`Marcos Witt${GUEST_SUFFIX}`);
    expect(stripGuestSuffix('Marcos Witt -invitado-')).toBe('Marcos Witt');
    expect(stripGuestSuffix('Marcos Witt')).toBe('Marcos Witt');
    // tolerante a variaciones de espacio/mayúsculas
    expect(stripGuestSuffix('Ana  -INVITADO-')).toBe('Ana');
  });
});

describe('formatGuestUntil', () => {
  it('YYYY-MM-DD -> DD/MM sin reparsear como UTC', () => {
    expect(formatGuestUntil('2026-11-09')).toBe('09/11');
    expect(formatGuestUntil('')).toBe('');
    expect(formatGuestUntil(null)).toBe('');
  });
});

describe('guestBadge', () => {
  it('null para no-invitado; vigente con fecha; vencido', () => {
    expect(guestBadge(normal, TODAY)).toBe(null);
    expect(guestBadge(guestVigente, TODAY)).toEqual({ label: 'Invitado · hasta 09/11', expired: false });
    expect(guestBadge(guestVencido, TODAY)).toEqual({ label: 'Invitado vencido', expired: true });
  });
});

describe('guestDaysUntil', () => {
  it('días enteros desde hoy hasta guest_until (>=1), o null si ya venció', () => {
    expect(guestDaysUntil('2026-11-09', TODAY)).toBe(6);
    expect(guestDaysUntil('2026-11-04', TODAY)).toBe(1);
    expect(guestDaysUntil('2026-11-03', TODAY)).toBe(null); // mismo día < 1
    expect(guestDaysUntil('2026-10-01', TODAY)).toBe(null); // pasado
    expect(guestDaysUntil(null, TODAY)).toBe(null);
  });
});
