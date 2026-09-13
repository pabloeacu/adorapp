import { describe, it, expect } from 'vitest';
import {
  participantIdsOf, isOrderParticipant, lineupInstrumentsFor, groupByInstrument, coverageGaps,
  suggestRotation, buildLineup, lineupEntries, lineupSummaryText, sortInstruments, formatShortDate,
  defaultInstrumentsFor, pendingChoiceIds,
} from './lineup';

const luca = { id: 'luca', name: 'Luca Molina', instruments: ['Batería', 'Bajo'], active: true };
const marcos = { id: 'marcos', name: 'Marcos Vazquez', instruments: ['Batería'], active: true };
const gus = { id: 'gus', name: 'Gustavo Godoy', instruments: ['Bajo'], active: true };
const karen = { id: 'karen', name: 'Karen García', instruments: ['Voz'], active: true };
const damaris = { id: 'damaris', name: 'Damaris', instruments: [], active: true };
const band = [luca, marcos, gus, karen, damaris];
const effective = new Set(band.map((m) => m.id));

describe('participantes', () => {
  it('sin formación (null) → toda la banda efectiva', () => {
    expect(participantIdsOf({ lineup: null }, effective)).toEqual(effective);
    expect(isOrderParticipant({ lineup: null }, 'gus', effective)).toBe(true);
  });
  it('mode all → toda la banda efectiva (dinámico)', () => {
    expect(participantIdsOf({ lineup: { mode: 'all', members: [] } }, effective).size).toBe(5);
  });
  it('custom → solo los listados, sin duplicados ni basura', () => {
    const order = { lineup: { mode: 'custom', members: [
      { memberId: 'luca', instruments: ['Batería'] }, { memberId: 'luca', instruments: ['Bajo'] }, { nope: 1 }, { memberId: 'karen' },
    ] } };
    expect([...participantIdsOf(order, effective)]).toEqual(['luca', 'karen']);
    expect(isOrderParticipant(order, 'gus', effective)).toBe(false);
    expect(lineupEntries(order.lineup)).toEqual([{ memberId: 'luca', instruments: ['Batería'] }, { memberId: 'karen', instruments: [] }]);
  });
  it('modo desconocido se trata como sin formación', () => {
    expect(participantIdsOf({ lineup: { mode: 'x' } }, effective).size).toBe(5);
  });
});

describe('instrumentos y agrupado', () => {
  it('custom usa lo declarado; all usa la ficha; orden canónico', () => {
    const custom = { lineup: { mode: 'custom', members: [{ memberId: 'luca', instruments: ['Bajo', 'Batería'] }] } };
    expect(lineupInstrumentsFor(custom, luca)).toEqual(['Bajo', 'Batería']);
    expect(lineupInstrumentsFor({ lineup: { mode: 'all' } }, luca)).toEqual(['Bajo', 'Batería']);
    expect(sortInstruments(['Batería', 'Voz', 'Bajo', 'Voz'])).toEqual(['Voz', 'Bajo', 'Batería']);
  });
  it('agrupa por instrumento con voces primero y los sin instrumento aparte', () => {
    const { groups, noInstrument } = groupByInstrument({ lineup: null }, [luca, marcos, karen, damaris]);
    expect(groups.map((g) => g.instrument)).toEqual(['Voz', 'Bajo', 'Batería']);
    expect(groups[2].members.map((m) => m.name)).toEqual(['Luca Molina', 'Marcos Vazquez']);
    expect(noInstrument.map((m) => m.id)).toEqual(['damaris']);
  });
  it('resumen en texto', () => {
    const text = lineupSummaryText({ lineup: null }, [luca, karen, damaris]);
    expect(text).toBe('Voz: Karen García · Bajo: Luca Molina · Batería: Luca Molina · También: Damaris');
  });
});

describe('cobertura', () => {
  it('detecta instrumentos de la banda que nadie cubre', () => {
    expect(coverageGaps(band, [{ memberId: 'luca', instruments: ['Batería'] }, { memberId: 'karen', instruments: ['Voz'] }])).toEqual(['Bajo']);
    expect(coverageGaps(band, [{ memberId: 'luca', instruments: ['Batería', 'Bajo'] }, { memberId: 'karen', instruments: ['Voz'] }])).toEqual([]);
  });
});

describe('rotación asistida', () => {
  const past = (id, date, members) => ({ id, bandId: 'b1', date, lineup: { mode: 'custom', members } });
  it('sugiere al que hace más tiempo no toca el instrumento', () => {
    const orders = [
      past('o1', '2026-08-29', [{ memberId: 'luca', instruments: ['Batería'] }, { memberId: 'gus', instruments: ['Bajo'] }]),
      past('o2', '2026-08-15', [{ memberId: 'marcos', instruments: ['Batería'] }, { memberId: 'gus', instruments: ['Bajo'] }]),
    ];
    const s = suggestRotation({ bandId: 'b1', orderDate: '2026-09-12', orders, bandMembers: band });
    const bat = s.find((x) => x.instrument === 'Batería');
    expect(bat).toMatchObject({ memberId: 'marcos', lastMemberIds: ['luca'], lastDate: '2026-08-29' });
    // Bajo: Luca nunca lo tocó en el período → tiene prioridad sobre Gus
    const bajo = s.find((x) => x.instrument === 'Bajo');
    expect(bajo).toMatchObject({ memberId: 'luca', lastMemberIds: ['gus'] });
    // Voz: un solo candidato → sin sugerencia
    expect(s.find((x) => x.instrument === 'Voz')).toBeUndefined();
  });
  it('sin historial no sugiere; ignora otras bandas, órdenes futuros, el propio orden y fuera de ventana', () => {
    expect(suggestRotation({ bandId: 'b1', orderDate: '2026-09-12', orders: [], bandMembers: band })).toEqual([]);
    const orders = [
      { ...past('otra', '2026-09-01', [{ memberId: 'luca', instruments: ['Batería'] }]), bandId: 'b2' },
      past('futuro', '2026-09-20', [{ memberId: 'luca', instruments: ['Batería'] }]),
      past('self', '2026-09-05', [{ memberId: 'luca', instruments: ['Batería'] }]),
      past('viejo', '2026-01-01', [{ memberId: 'luca', instruments: ['Batería'] }]),
      { id: 'all', bandId: 'b1', date: '2026-09-01', lineup: { mode: 'all', members: [] } },
    ];
    expect(suggestRotation({ bandId: 'b1', orderDate: '2026-09-12', orders, bandMembers: band, excludeOrderId: 'self' })).toEqual([]);
  });
  it('no sugiere cuando el elegido es el mismo que tocó la última vez', () => {
    const orders = [past('o1', '2026-08-29', [{ memberId: 'marcos', instruments: ['Batería'] }])];
    // marcos tocó; luca nunca → sugiere luca (distinto del último) → sí hay sugerencia
    expect(suggestRotation({ bandId: 'b1', orderDate: '2026-09-12', orders, bandMembers: band }).map((s) => s.memberId)).toContain('luca');
  });
});

describe('elección de instrumento (multi-instrumento)', () => {
  const byId = new Map(band.map((m) => [m.id, m]));

  it('defaultInstrumentsFor: 1 se asigna solo, 2+ queda vacío para elegir, 0 vacío', () => {
    expect(defaultInstrumentsFor(marcos)).toEqual(['Batería']); // 1 → se asigna
    expect(defaultInstrumentsFor(luca)).toEqual([]);            // 2 → hay que elegir
    expect(defaultInstrumentsFor(damaris)).toEqual([]);         // 0 → nada que elegir
    expect(defaultInstrumentsFor(null)).toEqual([]);
    expect(defaultInstrumentsFor({})).toEqual([]);
  });

  it('pendingChoiceIds: marca al de 2+ sin elegir; ignora al de 1, al de 0 y al ya elegido', () => {
    const entries = [
      { memberId: 'luca', instruments: [] },        // 2 instrumentos, ninguno → pendiente
      { memberId: 'marcos', instruments: [] },      // 1 instrumento → NO pendiente
      { memberId: 'damaris', instruments: [] },     // 0 instrumentos → NO pendiente
      { memberId: 'gus', instruments: ['Bajo'] },   // 1 instrumento → NO pendiente
    ];
    expect([...pendingChoiceIds(entries, byId)]).toEqual(['luca']);
  });

  it('pendingChoiceIds: al de 2+ con uno elegido NO lo marca', () => {
    const entries = [{ memberId: 'luca', instruments: ['Bajo'] }];
    expect(pendingChoiceIds(entries, byId).size).toBe(0);
  });

  it('pendingChoiceIds: excluye a los directores (su función es por rol)', () => {
    const entries = [{ memberId: 'luca', instruments: [] }];
    expect(pendingChoiceIds(entries, byId, new Set(['luca'])).size).toBe(0);
  });

  it('pendingChoiceIds: un instrumento viejo (ya no en la ficha) cuenta como no-elegido → pendiente', () => {
    const entries = [{ memberId: 'luca', instruments: ['Piano'] }]; // Piano no está en la ficha de luca
    expect([...pendingChoiceIds(entries, byId)]).toEqual(['luca']);
  });

  it('pendingChoiceIds: ids desconocidos o entradas basura no rompen', () => {
    const entries = [{ memberId: 'fantasma', instruments: [] }, null, { instruments: [] }];
    expect(pendingChoiceIds(entries, byId).size).toBe(0);
  });
});

describe('buildLineup', () => {
  it('all vacía los miembros; custom ordena instrumentos', () => {
    expect(buildLineup('all', [{ memberId: 'x', instruments: ['Voz'] }])).toEqual({ mode: 'all', members: [] });
    expect(buildLineup('custom', [{ memberId: 'luca', instruments: ['Batería', 'Bajo'] }]))
      .toEqual({ mode: 'custom', members: [{ memberId: 'luca', instruments: ['Bajo', 'Batería'] }] });
  });
  it('formatShortDate', () => {
    expect(formatShortDate('2026-09-12')).toBe('12/09');
    expect(formatShortDate('')).toBe('');
  });
});
