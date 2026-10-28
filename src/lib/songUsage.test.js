import { describe, it, expect } from 'vitest';
import { countRecentUses, isOverused, OVERUSE_THRESHOLD, OVERUSE_WINDOW_DAYS } from './songUsage';

// "ahora" fijo para tests deterministas
const NOW = new Date('2026-10-28T12:00:00').getTime();
const daysAgo = (n) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const daysAhead = (n) => daysAgo(-n);

const ord = (over) => ({ id: over.id, bandId: over.bandId || 'b1', date: over.date, status: over.status || 'scheduled', songs: (over.ids || []).map((songId) => ({ songId })) });

describe('countRecentUses', () => {
  it('cuenta las órdenes con la canción dentro de la ventana (global, todas las bandas)', () => {
    const orders = [
      ord({ id: 'o1', bandId: 'b1', date: daysAgo(5), ids: ['s1', 's2'] }),
      ord({ id: 'o2', bandId: 'b2', date: daysAgo(20), ids: ['s1'] }), // otra banda SÍ cuenta
      ord({ id: 'o3', bandId: 'b1', date: daysAgo(90), ids: ['s1'] }),
    ];
    expect(countRecentUses(orders, 's1', { nowMs: NOW })).toBe(3);
    expect(countRecentUses(orders, 's2', { nowMs: NOW })).toBe(1);
    expect(countRecentUses(orders, 'sX', { nowMs: NOW })).toBe(0);
  });

  it('excluye fuera de ventana (más de 120 días)', () => {
    const orders = [
      ord({ id: 'o1', date: daysAgo(119), ids: ['s1'] }),
      ord({ id: 'o2', date: daysAgo(121), ids: ['s1'] }), // fuera
    ];
    expect(countRecentUses(orders, 's1', { nowMs: NOW })).toBe(1);
  });

  it('excluye fechas futuras (no son "últimos 120 días")', () => {
    const orders = [
      ord({ id: 'o1', date: daysAgo(3), ids: ['s1'] }),
      ord({ id: 'o2', date: daysAhead(7), ids: ['s1'] }), // futura
    ];
    expect(countRecentUses(orders, 's1', { nowMs: NOW })).toBe(1);
  });

  it('excluye canceladas y sin fecha', () => {
    const orders = [
      ord({ id: 'o1', date: daysAgo(3), ids: ['s1'] }),
      ord({ id: 'o2', date: daysAgo(4), status: 'cancelled', ids: ['s1'] }),
      ord({ id: 'o3', date: null, ids: ['s1'] }),
    ];
    expect(countRecentUses(orders, 's1', { nowMs: NOW })).toBe(1);
  });

  it('excluye la orden que se está editando (excludeOrderId)', () => {
    const orders = [
      ord({ id: 'o1', date: daysAgo(3), ids: ['s1'] }),
      ord({ id: 'o2', date: daysAgo(10), ids: ['s1'] }),
    ];
    expect(countRecentUses(orders, 's1', { nowMs: NOW })).toBe(2);
    expect(countRecentUses(orders, 's1', { nowMs: NOW, excludeOrderId: 'o1' })).toBe(1);
  });

  it('tolera entradas nulas', () => {
    expect(countRecentUses(null, 's1', { nowMs: NOW })).toBe(0);
    expect(countRecentUses([null, { date: daysAgo(2), songs: null }], 's1', { nowMs: NOW })).toBe(0);
    expect(countRecentUses([{ id: 'o', date: daysAgo(2), songs: [null, { songId: 's1' }] }], 's1', { nowMs: NOW })).toBe(1);
  });
});

describe('isOverused', () => {
  it('"más de 5" = estrictamente mayor que el umbral', () => {
    expect(OVERUSE_THRESHOLD).toBe(5);
    expect(OVERUSE_WINDOW_DAYS).toBe(120);
    expect(isOverused(5)).toBe(false); // 5 no supera
    expect(isOverused(6)).toBe(true);  // 6 sí
    expect(isOverused(0)).toBe(false);
  });
});
