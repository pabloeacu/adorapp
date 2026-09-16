import { describe, it, expect } from 'vitest';
import { channelColor, buildChannelRows, duplicateChannels, CHANNEL_COLORS } from './channelPlan';

// Plan de canales (micrófonos) para Sonido: autonumerado desde la formación,
// overrides guardados por orden, color por instrumento, detección de colisiones.

const groups = [
  { instrument: 'Voz', members: [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bea' }] },
  { instrument: 'Batería', members: [{ id: 'c', name: 'Caro' }] },
];

describe('channelColor', () => {
  it('devuelve el color del instrumento o el default', () => {
    expect(channelColor('Voz')).toBe(CHANNEL_COLORS['Voz']);
    expect(channelColor('Batería')).toBe('#EF7A7A');
    expect(channelColor('Kazoo')).toBe('#9AA6B2'); // desconocido → default
  });
});

describe('buildChannelRows', () => {
  it('autonumera 1..N por (miembro, instrumento) en orden de grupos', () => {
    const rows = buildChannelRows(groups, {});
    expect(rows.map((r) => r.channel)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.memberId)).toEqual(['a', 'b', 'c']);
    expect(rows[0].key).toBe('a:Voz');
    expect(rows[2].instrument).toBe('Batería');
    expect(rows[2].color).toBe('#EF7A7A');
  });

  it('aplica overrides guardados y re-ordena por canal (desempate por auto)', () => {
    const rows = buildChannelRows(groups, { 'c:Batería': 5 });
    expect(rows.map((r) => [r.memberId, r.channel])).toEqual([['a', 1], ['b', 2], ['c', 5]]);
    expect(duplicateChannels(rows).size).toBe(0);
  });

  it('un override que colisiona con un autonumerado deja ambas filas en ese canal (desempate por auto)', () => {
    // Caro forzada al canal 1, que Ana ya ocupa por autonumerado → colisión detectable.
    const rows = buildChannelRows(groups, { 'c:Batería': 1 });
    expect([...duplicateChannels(rows)].sort()).toEqual([1]);
    expect(rows[0].memberId).toBe('a'); // menor auto primero
    expect(rows[1].memberId).toBe('c');
  });

  it('ignora overrides no positivos o no numéricos (cae al autonumerado)', () => {
    const rows = buildChannelRows(groups, { 'a:Voz': 0, 'b:Voz': -3 });
    expect(rows.map((r) => [r.memberId, r.channel])).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('tolera entradas vacías', () => {
    expect(buildChannelRows(null, null)).toEqual([]);
    expect(buildChannelRows([], {})).toEqual([]);
  });
});

describe('duplicateChannels', () => {
  it('detecta los canales usados por más de una fila', () => {
    const rows = [{ channel: 1 }, { channel: 2 }, { channel: 2 }, { channel: 3 }, { channel: 3 }];
    expect([...duplicateChannels(rows)].sort()).toEqual([2, 3]);
  });
  it('sin colisiones → set vacío; tolera vacío', () => {
    expect(duplicateChannels([{ channel: 1 }, { channel: 2 }]).size).toBe(0);
    expect(duplicateChannels(null).size).toBe(0);
  });
});
