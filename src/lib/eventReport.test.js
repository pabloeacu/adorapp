import { describe, it, expect } from 'vitest';
import { normalizeChurch, computeEventAnalytics, fmtArt } from './eventReport';

describe('normalizeChurch', () => {
  it('agrupa todas las variantes de CAF (tildes, puntos, typos)', () => {
    for (const v of ['CAF', 'caf', 'C.A.F', 'Centro de Avivamiento Familiar',
      'centro avivamiento familiar', 'auditorio caf', 'avivamento familiar',
      'centro de avivar familiar', 'avivamiento de jóvenes', 'CAF San Martín']) {
      expect(normalizeChurch(v)).toBe('CAF');
    }
  });
  it('reconoce iglesias invitadas por nombre', () => {
    expect(normalizeChurch('Rey de Reyes')).toBe('Rey de Reyes');
    expect(normalizeChurch('Luz para nuestros caminos.')).toBe('Luz para nuestros caminos');
    expect(normalizeChurch('Sembrando Vida')).toBe('Sembrando Vida');
    expect(normalizeChurch('Manantial de Bendiciones')).toBe('Manantial de Bendiciones');
    expect(normalizeChurch('Iglesia apostólica y profética Águila y León')).toBe('Águila y León');
  });
  it('vacío / ninguna / local → (Sin dato)', () => {
    expect(normalizeChurch('')).toBe('(Sin dato)');
    expect(normalizeChurch(null)).toBe('(Sin dato)');
    expect(normalizeChurch('ninguna')).toBe('(Sin dato)');
    expect(normalizeChurch('local')).toBe('(Sin dato)');
  });
  it('un nombre desconocido cae en Otras sin romper', () => {
    expect(normalizeChurch('Iglesia Bautista del Centro')).toBe('Otras');
  });
});

describe('computeEventAnalytics', () => {
  const regs = [
    // titular solo, de CAF, ingresó
    { id: 'a', status: 'confirmed', acompanantes: 0, como_se_entero: 'En la iglesia', iglesia: 'CAF', checked_in_at: '2026-10-31T22:00:00Z' },
    // titular + 2 acompañantes, de "centro de avivamiento familiar", NO ingresó
    { id: 'b', status: 'confirmed', acompanantes: 2, como_se_entero: 'WhatsApp', iglesia: 'centro de avivamiento familiar', checked_in_at: null },
    // titular + 1, Rey de Reyes, ingresó
    { id: 'c', status: 'confirmed', acompanantes: 1, como_se_entero: 'En la iglesia', iglesia: 'Rey de Reyes', checked_in_at: '2026-10-31T22:05:00Z' },
    // cancelada: NO cuenta
    { id: 'd', status: 'cancelled', acompanantes: 5, como_se_entero: 'Instagram', iglesia: 'CAF', checked_in_at: null },
    // sin como/iglesia
    { id: 'e', status: 'confirmed', acompanantes: 0, como_se_entero: '', iglesia: '', checked_in_at: null },
  ];
  const r = computeEventAnalytics(regs);

  it('reservas y personas ignoran canceladas', () => {
    expect(r.reservas).toBe(4);           // a,b,c,e
    expect(r.personas).toBe(1 + 3 + 2 + 1); // 7
  });
  it('ingreso por personas (grupo escaneado cuenta completo)', () => {
    expect(r.reservasIngreso).toBe(2);    // a,c
    expect(r.personasIngreso).toBe(1 + 2); // 3
    expect(r.noVinieron).toBe(4);
    expect(r.asistenciaPct).toBe(Math.round((3 / 7) * 100)); // 43
  });
  it('¿cómo se enteraron? por personas, ordenado desc', () => {
    expect(r.como[0]).toEqual({ label: 'En la iglesia', value: 3 }); // a(1)+c(2)
    const wa = r.como.find((x) => x.label === 'WhatsApp');
    expect(wa.value).toBe(3); // b
    expect(r.como.find((x) => x.label === '(Sin dato)').value).toBe(1); // e
    expect(r.como.some((x) => x.label === 'Instagram')).toBe(false); // d cancelada
  });
  it('iglesias normalizadas por personas', () => {
    const caf = r.iglesias.find((x) => x.label === 'CAF');
    expect(caf.value).toBe(1 + 3); // a + b
    expect(r.iglesias.find((x) => x.label === 'Rey de Reyes').value).toBe(2); // c
    expect(r.iglesias.find((x) => x.label === '(Sin dato)').value).toBe(1); // e
  });
  it('tolera lista vacía / nula', () => {
    const z = computeEventAnalytics([]);
    expect(z.personas).toBe(0);
    expect(z.asistenciaPct).toBe(0);
    expect(computeEventAnalytics(null).reservas).toBe(0);
  });
});

describe('fmtArt', () => {
  it('formatea ART y tolera basura', () => {
    expect(fmtArt('')).toBe('');
    expect(fmtArt(null)).toBe('');
    expect(fmtArt('no-es-fecha')).toBe('');
    expect(fmtArt('2026-10-31T23:30:00Z')).toMatch(/31\/10\/2026/); // 20:30 ART
  });
});
