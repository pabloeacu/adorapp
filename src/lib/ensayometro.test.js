import { describe, it, expect } from 'vitest';
import {
  MILESTONES_PER_SONG,
  milestonesOf,
  uniqueSongIds,
  ensayometroPercent,
  pendingSongIds,
} from './ensayometro';

const log = (o = {}) => ({
  timesPracticed: 0, knowsLyrics: false, knowsStructure: false, knowsArrangements: false, ...o,
});

describe('milestonesOf', () => {
  it('null/undefined → 0', () => {
    expect(milestonesOf(null)).toBe(0);
    expect(milestonesOf(undefined)).toBe(0);
  });
  it('cuenta 1 por cada hito y 4 con todos', () => {
    expect(milestonesOf(log())).toBe(0);
    expect(milestonesOf(log({ timesPracticed: 1 }))).toBe(1);
    expect(milestonesOf(log({ timesPracticed: 3, knowsLyrics: true }))).toBe(2);
    expect(milestonesOf(log({ timesPracticed: 1, knowsLyrics: true, knowsStructure: true, knowsArrangements: true }))).toBe(4);
  });
  it('timesPracticed 0 no suma, >0 suma', () => {
    expect(milestonesOf(log({ timesPracticed: 0 }))).toBe(0);
    expect(milestonesOf(log({ timesPracticed: 5 }))).toBe(1);
  });
});

describe('uniqueSongIds', () => {
  it('deduplica por songId e ignora vacíos', () => {
    const order = { songs: [{ songId: 'a' }, { songId: 'b' }, { songId: 'a' }, { songId: null }, {}] };
    expect(uniqueSongIds(order)).toEqual(['a', 'b']);
  });
  it('orden nulo o sin canciones → []', () => {
    expect(uniqueSongIds(null)).toEqual([]);
    expect(uniqueSongIds({})).toEqual([]);
  });
});

describe('ensayometroPercent (paridad con Practica.jsx y el cron)', () => {
  it('sin canciones → 0', () => {
    expect(ensayometroPercent([], {})).toBe(0);
    expect(ensayometroPercent(null, {})).toBe(0);
  });
  it('1 canción con 1 sola pasada → 25%', () => {
    expect(ensayometroPercent(['a'], { a: log({ timesPracticed: 1 }) })).toBe(25);
  });
  it('1 canción 4/4 → 100%', () => {
    expect(ensayometroPercent(['a'], { a: log({ timesPracticed: 1, knowsLyrics: true, knowsStructure: true, knowsArrangements: true }) })).toBe(100);
  });
  it('canciones sin log cuentan como 0 hitos', () => {
    expect(ensayometroPercent(['a', 'b', 'c', 'd'], {})).toBe(0);
  });
  it('redondea (3 canciones, 5 hitos totales → Math.round(500/12)=42)', () => {
    const logs = {
      a: log({ timesPracticed: 1, knowsLyrics: true }),   // 2
      b: log({ timesPracticed: 1, knowsLyrics: true }),   // 2
      c: log({ timesPracticed: 1 }),                      // 1
    };
    // done=5, total=12 → 41.66 → 42
    expect(ensayometroPercent(['a', 'b', 'c'], logs)).toBe(42);
  });
  it('MILESTONES_PER_SONG es 4', () => {
    expect(MILESTONES_PER_SONG).toBe(4);
  });
});

describe('pendingSongIds', () => {
  it('devuelve sólo las canciones con hitos < 4', () => {
    const logs = {
      a: log({ timesPracticed: 1, knowsLyrics: true, knowsStructure: true, knowsArrangements: true }), // 4
      b: log({ timesPracticed: 1 }), // 1
      // c sin log → 0
    };
    expect(pendingSongIds(['a', 'b', 'c'], logs)).toEqual(['b', 'c']);
  });
  it('todas completas → []', () => {
    const full = log({ timesPracticed: 1, knowsLyrics: true, knowsStructure: true, knowsArrangements: true });
    expect(pendingSongIds(['a'], { a: full })).toEqual([]);
  });
});
