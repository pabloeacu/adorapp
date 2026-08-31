import { describe, it, expect } from 'vitest';
import { computeRepertoireInsights, CLIMATE_KEYS } from './repertoireInsights';

const NOW = new Date('2026-08-31T12:00:00');

// freshCut = NOW-42d ≈ 2026-07-20 · riskCut = NOW-112d ≈ 2026-05-11
// overuseCutoff = NOW-56d ≈ 2026-07-06
const songs = [
  { id: 's1', title: 'Nunca sonó', categories: ['guerra'] },
  { id: 's2', title: 'Reciente', categories: ['adoracion', 'lenta'] },
  { id: 's3', title: 'Repetida', categories: ['rapida'] },
  { id: 's4', title: 'Enfriándose', categories: ['intimidad'] },
  { id: 's5', title: 'Dormida', categories: ['ofrenda'] },
];
const orders = [
  { id: 'o1', date: '2026-08-15', status: 'completed', songs: [{ songId: 's2' }] },
  { id: 'o2', date: '2026-07-10', status: 'completed', songs: [{ songId: 's3' }] },
  { id: 'o3', date: '2026-07-24', status: 'completed', songs: [{ songId: 's3' }] },
  { id: 'o4', date: '2026-08-07', status: 'completed', songs: [{ songId: 's3' }] },
  { id: 'o5', date: '2026-06-15', status: 'completed', songs: [{ songId: 's4' }] },
  { id: 'o6', date: '2026-03-01', status: 'completed', songs: [{ songId: 's5' }] },
  { id: 'oc', date: '2026-08-20', status: 'cancelled', songs: [{ songId: 's1' }] }, // no cuenta
  { id: 'of', date: '2026-09-30', status: 'scheduled', songs: [{ songId: 's1' }] }, // futura, no cuenta
];

describe('computeRepertoireInsights — grupos de rotación', () => {
  const r = computeRepertoireInsights(songs, orders, NOW);

  it('clasifica cada canción en el grupo correcto', () => {
    expect(r.buckets).toEqual({
      saludable: 1,      // s2 (sonó hace 2 semanas)
      sobreutilizada: 1, // s3 (3 veces en la ventana)
      enRiesgo: 1,       // s4 (hace ~11 semanas)
      dormida: 1,        // s5 (hace ~26 semanas)
      sinEstrenar: 1,    // s1 (nunca en orden válida)
    });
  });

  it('los grupos son mutuamente excluyentes y suman el total', () => {
    const sum = Object.values(r.buckets).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.total);
    expect(r.total).toBe(5);
  });

  it('el sobreuso tiene prioridad sobre "en rotación" aunque también sea reciente', () => {
    expect(r.lists.sobreutilizada).toEqual([{ id: 's3', title: 'Repetida', uses: 3 }]);
    expect(r.lists.saludable.map((s) => s.id)).toEqual(['s2']);
  });

  it('ignora órdenes canceladas y futuras (s1 queda sin estrenar)', () => {
    expect(r.lists.sinEstrenar).toEqual([{ id: 's1', title: 'Nunca sonó' }]);
  });

  it('cuenta la historia desde la orden sonada más antigua', () => {
    expect(r.playedOrders).toBe(6);
    expect(r.historyWeeks).toBeGreaterThanOrEqual(25); // Mar 1 → Ago 31 ≈ 26 semanas
  });
});

describe('computeRepertoireInsights — balance por clima (cobertura)', () => {
  const r = computeRepertoireInsights(songs, orders, NOW);

  it('cuenta cada canción en TODOS sus climas (cobertura, no suma 100%)', () => {
    const adoracion = r.clima.find((c) => c.key === 'adoracion');
    const lenta = r.clima.find((c) => c.key === 'lenta');
    expect(adoracion.count).toBe(1);
    expect(adoracion.pct).toBe(20); // 1 de 5
    expect(lenta.count).toBe(1);
    // s2 aporta a adoracion Y lenta → la suma de counts supera el total
    const sumCounts = r.clima.reduce((a, c) => a + c.count, 0);
    expect(sumCounts).toBeGreaterThan(r.total);
  });

  it('incluye los 13 climas aunque estén en 0', () => {
    expect(r.clima).toHaveLength(CLIMATE_KEYS.length);
    expect(r.clima.every((c) => typeof c.label === 'string')).toBe(true);
  });

  it('ordena por cobertura descendente', () => {
    for (let i = 1; i < r.clima.length; i++) {
      expect(r.clima[i - 1].count).toBeGreaterThanOrEqual(r.clima[i].count);
    }
  });
});

describe('computeRepertoireInsights — sugerencias de balance', () => {
  const r = computeRepertoireInsights(songs, orders, NOW);

  it('sólo sugiere climas para los que hay canciones', () => {
    const keys = r.climaGaps.map((g) => g.key);
    // adoracion, lenta, guerra, rapida, intimidad, ofrenda tienen canciones
    expect(keys).toEqual(expect.arrayContaining(['adoracion', 'lenta', 'guerra', 'rapida', 'intimidad', 'ofrenda']));
    expect(keys).not.toContain('coritos'); // sin canciones → no se sugiere
  });

  it('pone primero los climas que nunca sonaron', () => {
    // guerra sólo está en s1, que nunca sonó en orden válida
    expect(r.climaGaps[0].key).toBe('guerra');
    expect(r.climaGaps[0].everPlayed).toBe(false);
  });
});

describe('computeRepertoireInsights — bordes', () => {
  it('maneja repertorio y órdenes vacíos sin romper', () => {
    const r = computeRepertoireInsights([], [], NOW);
    expect(r.total).toBe(0);
    expect(r.buckets).toEqual({ saludable: 0, sobreutilizada: 0, enRiesgo: 0, dormida: 0, sinEstrenar: 0 });
    expect(r.clima.every((c) => c.count === 0 && c.pct === 0)).toBe(true);
    expect(r.climaGaps).toEqual([]);
    expect(r.historyWeeks).toBe(0);
  });

  it('canciones sin categorías no rompen la cobertura', () => {
    const r = computeRepertoireInsights([{ id: 'x', title: 'Sin clima' }], [], NOW);
    expect(r.total).toBe(1);
    expect(r.buckets.sinEstrenar).toBe(1);
    expect(r.clima.every((c) => c.count === 0)).toBe(true);
  });
});
