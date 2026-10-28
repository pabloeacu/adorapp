import { describe, it, expect } from 'vitest';
import {
  bandLastUseMap, lastUseLabel, rankUnused, filterUnused, categoriesPresent,
} from './unusedSongs';

// Repertorio de prueba
const s1 = { id: 's1', title: 'Océanos', artist: 'Hillsong', categories: ['lenta', 'intimidad'] };
const s2 = { id: 's2', title: 'Agua Viva', artist: 'Generación 12', categories: ['rapida'] };
const s3 = { id: 's3', title: 'Él es digno', artist: 'Marco Barrientos', categories: ['adoracion'] };
const s4 = { id: 's4', title: 'Aquí estoy', artist: 'Miel San Marcos', categories: [] };

const SONG_CATEGORIES = [
  { id: 'adoracion', label: 'Adoración' },
  { id: 'intimidad', label: 'Intimidad' },
  { id: 'rapida', label: 'Rápida' },
  { id: 'lenta', label: 'Lenta' },
];

describe('bandLastUseMap', () => {
  const orders = [
    { bandId: 'b1', date: '2026-10-01', songs: [{ songId: 's1' }, { songId: 's2' }] },
    { bandId: 'b1', date: '2026-10-20', songs: [{ songId: 's1' }] }, // s1 más reciente
    { bandId: 'b2', date: '2026-10-25', songs: [{ songId: 's3' }] }, // otra banda → ignorar
  ];

  it('mapea songId → fecha más reciente de ESTA banda', () => {
    const map = bandLastUseMap(orders, 'b1');
    expect(map.get('s1')).toBe('2026-10-20'); // se queda con la más reciente
    expect(map.get('s2')).toBe('2026-10-01');
    expect(map.has('s3')).toBe(false); // de otra banda
  });

  it('banda vacía o nula → mapa vacío', () => {
    expect(bandLastUseMap(orders, null).size).toBe(0);
    expect(bandLastUseMap(null, 'b1').size).toBe(0);
  });

  it('ignora órdenes sin fecha y canciones sin songId', () => {
    const map = bandLastUseMap(
      [{ bandId: 'b1', date: null, songs: [{ songId: 's1' }] },
       { bandId: 'b1', date: '2026-10-05', songs: [{ songId: null }, { songId: 's2' }] }],
      'b1',
    );
    expect(map.has('s1')).toBe(false);
    expect(map.get('s2')).toBe('2026-10-05');
  });
});

describe('lastUseLabel', () => {
  const now = new Date('2026-10-28T12:00:00').getTime();
  it('sin fecha → "nunca con esta banda"', () => {
    expect(lastUseLabel(null, now)).toBe('nunca con esta banda');
    expect(lastUseLabel('', now)).toBe('nunca con esta banda');
  });
  it('≤6 días → "esta semana"', () => {
    expect(lastUseLabel('2026-10-24', now)).toBe('esta semana');
    expect(lastUseLabel('2026-10-28', now)).toBe('esta semana');
  });
  it('semanas (singular/plural)', () => {
    expect(lastUseLabel('2026-10-20', now)).toBe('hace 1 semana');
    expect(lastUseLabel('2026-10-10', now)).toBe('hace 2 semanas');
  });
  it('≥9 semanas → meses', () => {
    expect(lastUseLabel('2026-07-01', now)).toBe('hace 4 meses');
  });
  it('fecha inválida → "nunca con esta banda"', () => {
    expect(lastUseLabel('no-es-fecha', now)).toBe('nunca con esta banda');
  });
});

describe('rankUnused', () => {
  it('nunca-usadas primero, luego por último uso más antiguo, desempate por título', () => {
    const lu = new Map([['s1', '2026-10-20'], ['s2', '2026-10-01']]);
    const ranked = rankUnused([s1, s2, s3, s4], lu);
    // s3 y s4 nunca usadas → primero (orden alfabético: "Aquí estoy" < "Él es digno")
    expect(ranked.map((s) => s.id)).toEqual(['s4', 's3', 's2', 's1']);
  });
  it('no muta el array original', () => {
    const arr = [s1, s2];
    rankUnused(arr, new Map());
    expect(arr).toEqual([s1, s2]);
  });
});

describe('filterUnused', () => {
  const list = [s1, s2, s3, s4];
  it('sin query ni categoría → devuelve todo', () => {
    expect(filterUnused(list, {}).length).toBe(4);
  });
  it('busca por título/artista indistinto a tildes', () => {
    expect(filterUnused(list, { query: 'oceanos' }).map((s) => s.id)).toEqual(['s1']);
    expect(filterUnused(list, { query: 'miel' }).map((s) => s.id)).toEqual(['s4']);
  });
  it('filtra por categoría', () => {
    expect(filterUnused(list, { category: 'rapida' }).map((s) => s.id)).toEqual(['s2']);
    expect(filterUnused(list, { category: 'lenta' }).map((s) => s.id)).toEqual(['s1']);
  });
  it('combina query + categoría', () => {
    expect(filterUnused(list, { query: 'agua', category: 'rapida' }).map((s) => s.id)).toEqual(['s2']);
    expect(filterUnused(list, { query: 'agua', category: 'lenta' })).toEqual([]);
  });
});

describe('categoriesPresent', () => {
  it('devuelve solo las categorías presentes, en orden de allCategories, con conteo', () => {
    const cats = categoriesPresent([s1, s2, s3], SONG_CATEGORIES);
    expect(cats.map((c) => c.id)).toEqual(['adoracion', 'intimidad', 'rapida', 'lenta']);
    expect(cats.find((c) => c.id === 'lenta').count).toBe(1);
    expect(cats.find((c) => c.id === 'adoracion').count).toBe(1);
  });
  it('canción sin categorías no aporta', () => {
    const cats = categoriesPresent([s4], SONG_CATEGORIES);
    expect(cats).toEqual([]);
  });
});
