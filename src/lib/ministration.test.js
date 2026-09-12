import { describe, it, expect } from 'vitest';
import { resolveMinistrationOrder, ministrationWindow, canOfferMinistration, isMinistrationSong, MINISTRATION_WINDOW_MS, MINISTRATION_KEY_RE } from './ministration';

const H = 3600 * 1000;
const bands = {
  'b-sab': { id: 'b-sab', name: 'Banda Sábado', members: ['mel', 'gus'] },
  'b-mar': { id: 'b-mar', name: 'Banda Martes', members: ['daniel'] },
};
const getBandById = (id) => bands[id];
// Servicio del sábado 12/09/2026 16:00 ART = 19:00 UTC
const START = Date.UTC(2026, 8, 12, 19, 0);
const order = { id: 'o1', bandId: 'b-sab', date: '2026-09-12', time: '16:00', status: 'scheduled' };

describe('ministration · elegibilidad del banner', () => {
  it('la ventana es [inicio del servicio, inicio + 3 h)', () => {
    expect(ministrationWindow(order)).toEqual({ start: START, end: START + MINISTRATION_WINDOW_MS });
    expect(MINISTRATION_WINDOW_MS).toBe(3 * H);
    expect(ministrationWindow({ date: null })).toBeNull();
  });

  it('la líder de la banda lo ve desde la hora de inicio y hasta las 3 h (exclusive)', () => {
    expect(resolveMinistrationOrder([order], { id: 'mel' }, 'leader', getBandById, START)?.id).toBe('o1');
    expect(resolveMinistrationOrder([order], { id: 'mel' }, 'leader', getBandById, START + 2 * H + 59 * 60_000)?.id).toBe('o1');
    expect(resolveMinistrationOrder([order], { id: 'mel' }, 'leader', getBandById, START - 1)).toBeNull();
    expect(resolveMinistrationOrder([order], { id: 'mel' }, 'leader', getBandById, START + 3 * H)).toBeNull();
  });

  it('un pastor lo ve, de cualquier banda', () => {
    expect(canOfferMinistration(bands['b-sab'], { id: 'ana' }, 'pastor')).toBe(true);
    expect(resolveMinistrationOrder([order], { id: 'ana' }, 'pastor', getBandById, START + 1 * H)?.id).toBe('o1');
  });

  it('un miembro de la banda, un líder de otra banda y un líder temporal NO lo ven', () => {
    expect(resolveMinistrationOrder([order], { id: 'gus' }, 'member', getBandById, START + 1 * H)).toBeNull();
    expect(resolveMinistrationOrder([order], { id: 'daniel' }, 'leader', getBandById, START + 1 * H)).toBeNull();
    expect(resolveMinistrationOrder([order], { id: 'olga' }, 'leader', getBandById, START + 1 * H)).toBeNull();
    expect(canOfferMinistration(bands['b-sab'], null, 'pastor')).toBe(false);
  });

  it('solo órdenes PROGRAMADOS con banda y hora', () => {
    expect(resolveMinistrationOrder([{ ...order, status: 'completed' }], { id: 'mel' }, 'leader', getBandById, START + 1 * H)).toBeNull();
    expect(resolveMinistrationOrder([{ ...order, status: 'cancelled' }], { id: 'mel' }, 'leader', getBandById, START + 1 * H)).toBeNull();
    expect(resolveMinistrationOrder([{ ...order, bandId: null }], { id: 'mel' }, 'leader', getBandById, START + 1 * H)).toBeNull();
    expect(resolveMinistrationOrder([{ ...order, time: '' }], { id: 'mel' }, 'leader', getBandById, START + 1 * H)).toBeNull();
  });

  it('con dos servicios en ventana elige el de inicio más reciente', () => {
    const earlier = { ...order, id: 'o0', time: '14:30' };
    expect(resolveMinistrationOrder([earlier, order], { id: 'mel' }, 'leader', getBandById, START + 30 * 60_000)?.id).toBe('o1');
    // antes de que empiece o1, solo o0 está en ventana
    expect(resolveMinistrationOrder([earlier, order], { id: 'mel' }, 'leader', getBandById, START - 30 * 60_000)?.id).toBe('o0');
  });

  it('marca de canción de ministración y tonos válidos', () => {
    expect(isMinistrationSong({ songId: 's', ministracion: true })).toBe(true);
    expect(isMinistrationSong({ songId: 's' })).toBe(false);
    expect(isMinistrationSong(null)).toBe(false);
    for (const k of ['C', 'C#', 'Dm', 'F#m', 'B']) expect(MINISTRATION_KEY_RE.test(k)).toBe(true);
    for (const k of ['Db', 'H', 'c', 'C##', 'Cmaj7', '']) expect(MINISTRATION_KEY_RE.test(k)).toBe(false);
  });

  it('es robusta a entradas basura', () => {
    expect(resolveMinistrationOrder(null, { id: 'mel' }, 'leader', getBandById, START)).toBeNull();
    expect(resolveMinistrationOrder([null, {}], { id: 'mel' }, 'leader', getBandById, START)).toBeNull();
    expect(resolveMinistrationOrder([order], { id: 'mel' }, 'leader', () => { throw new Error('x'); }, START)).toBeNull();
  });
});
