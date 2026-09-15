import { describe, it, expect } from 'vitest';
import {
  isEnganchadaAt,
  numberOrderSongs,
  addEnganchadaAfter,
  unlinkEnganchada,
  normalizeEnganchadas,
} from './orderNumbering';

const s = (id, extra = {}) => ({ songId: id, key: 'C', directorId: null, ...extra });
const nums = (songs) => numberOrderSongs(songs).map((x) => x.displayNumber);

describe('numberOrderSongs', () => {
  it('array vacío → []', () => {
    expect(numberOrderSongs([])).toEqual([]);
    expect(numberOrderSongs(null)).toEqual([]);
    expect(numberOrderSongs(undefined)).toEqual([]);
  });

  it('una sola canción → "1" (sin letra)', () => {
    expect(nums([s('a')])).toEqual(['1']);
    const [only] = numberOrderSongs([s('a')]);
    expect(only.groupSize).toBe(1);
    expect(only.hasLinkedBelow).toBe(false);
    expect(only.isEnganchada).toBe(false);
  });

  it('dos canciones normales → "1", "2"', () => {
    expect(nums([s('a'), s('b')])).toEqual(['1', '2']);
  });

  it('EJEMPLO DE PAUL: 1 Eres fiel, 2 Tu fidelidad + enganchada Dios de pactos → 1, 2.a, 2.b', () => {
    const songs = [s('eres-fiel'), s('tu-fidelidad'), s('dios-de-pactos', { enganchada: true })];
    const r = numberOrderSongs(songs);
    expect(r.map((x) => x.displayNumber)).toEqual(['1', '2.a', '2.b']);
    // "Tu fidelidad" (madre) lleva la cadenita: hasLinkedBelow
    expect(r[1].hasLinkedBelow).toBe(true);
    expect(r[1].isEnganchada).toBe(false);
    // "Dios de pactos" (hija) lleva la etiqueta "enganchada"
    expect(r[2].isEnganchada).toBe(true);
    expect(r[2].hasLinkedBelow).toBe(false);
    // "Eres fiel" solo: sin cadenita ni etiqueta
    expect(r[0].hasLinkedBelow).toBe(false);
    expect(r[0].isEnganchada).toBe(false);
  });

  it('cadena de 3+ → 2.a, 2.b, 2.c', () => {
    const songs = [s('x'), s('a'), s('b', { enganchada: true }), s('c', { enganchada: true })];
    const r = numberOrderSongs(songs);
    expect(r.map((x) => x.displayNumber)).toEqual(['1', '2.a', '2.b', '2.c']);
    // la del medio es hija Y madre a la vez
    expect(r[2].isEnganchada).toBe(true);
    expect(r[2].hasLinkedBelow).toBe(true);
    expect(r[3].hasLinkedBelow).toBe(false);
  });

  it('varios grupos mezclados', () => {
    // 1 solo · 2(a,b) · 3 solo · 4(a,b,c)
    const songs = [
      s('g1'),
      s('g2a'), s('g2b', { enganchada: true }),
      s('g3'),
      s('g4a'), s('g4b', { enganchada: true }), s('g4c', { enganchada: true }),
    ];
    expect(nums(songs)).toEqual(['1', '2.a', '2.b', '3', '4.a', '4.b', '4.c']);
  });

  it('DEFENSIVO: enganchada en índice 0 se ignora (se numera como normal)', () => {
    const songs = [s('a', { enganchada: true }), s('b')];
    const r = numberOrderSongs(songs);
    expect(r.map((x) => x.displayNumber)).toEqual(['1', '2']);
    expect(r[0].isEnganchada).toBe(false);
  });

  it('ministración es independiente: sigue numerada normal', () => {
    const songs = [s('a'), s('b'), s('minis', { ministracion: true })];
    expect(nums(songs)).toEqual(['1', '2', '3']);
    // una ministración también puede (en teoría) ser enganchada
    const songs2 = [s('a'), s('b'), s('minis', { ministracion: true, enganchada: true })];
    const r = numberOrderSongs(songs2);
    expect(r.map((x) => x.displayNumber)).toEqual(['1', '2.a', '2.b']);
    expect(r[2].songRef.ministracion).toBe(true);
  });

  it('grupo enganchado al final del array', () => {
    const songs = [s('a'), s('b'), s('c', { enganchada: true })];
    const r = numberOrderSongs(songs);
    expect(r.map((x) => x.displayNumber)).toEqual(['1', '2.a', '2.b']);
    expect(r[2].hasLinkedBelow).toBe(false);
  });
});

describe('isEnganchadaAt', () => {
  it('índice 0 nunca es enganchada, aunque tenga la marca', () => {
    expect(isEnganchadaAt([s('a', { enganchada: true })], 0)).toBe(false);
  });
  it('índice >0 con marca → true', () => {
    expect(isEnganchadaAt([s('a'), s('b', { enganchada: true })], 1)).toBe(true);
  });
  it('sin marca → false', () => {
    expect(isEnganchadaAt([s('a'), s('b')], 1)).toBe(false);
  });
});

describe('addEnganchadaAfter', () => {
  it('inserta justo debajo con enganchada:true, sin mutar el original', () => {
    const songs = [s('a'), s('b')];
    const out = addEnganchadaAfter(songs, 0, s('nueva'));
    expect(out.map((x) => x.songId)).toEqual(['a', 'nueva', 'b']);
    expect(out[1].enganchada).toBe(true);
    expect(songs.length).toBe(2); // no mutó
  });
  it('afterIndex fuera de rango → devuelve copia sin cambios', () => {
    const songs = [s('a')];
    expect(addEnganchadaAfter(songs, 5, s('x')).map((x) => x.songId)).toEqual(['a']);
    expect(addEnganchadaAfter(songs, -1, s('x')).map((x) => x.songId)).toEqual(['a']);
  });
});

describe('unlinkEnganchada', () => {
  it('quita la marca enganchada de la canción indicada', () => {
    const songs = [s('a'), s('b', { enganchada: true, key: 'D' })];
    const out = unlinkEnganchada(songs, 1);
    expect(out[1].enganchada).toBeUndefined();
    expect(out[1].key).toBe('D'); // conserva el resto
    expect(out[0]).toBe(songs[0]); // no toca las demás
  });
});

describe('normalizeEnganchadas', () => {
  it('limpia la marca si quedó en el índice 0 (p. ej. tras reordenar)', () => {
    const songs = [s('a', { enganchada: true }), s('b', { enganchada: true })];
    const out = normalizeEnganchadas(songs);
    expect(out[0].enganchada).toBeUndefined();
    expect(out[1].enganchada).toBe(true); // la del medio queda intacta
  });
  it('si el índice 0 ya está limpio, no cambia nada', () => {
    const songs = [s('a'), s('b', { enganchada: true })];
    expect(normalizeEnganchadas(songs)).toBe(songs);
  });
});
