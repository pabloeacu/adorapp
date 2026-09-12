import { describe, it, expect } from 'vitest';
import { resolveFeedbackOrder, feedbackWindow, serviceStartEpoch, isBandLeader, canGiveFeedback, FEEDBACK_WINDOW_MS } from './serviceFeedback';

const H = 3600 * 1000;
const bands = {
  'b-sab': { id: 'b-sab', name: 'Banda Sábado', members: ['mel', 'gus', 'luca'] },
  'b-mar': { id: 'b-mar', name: 'Banda Martes', members: ['daniel'] },
};
const getBandById = (id) => bands[id];
// Servicio del sábado 12/09/2026 16:00 ART = 19:00 UTC
const START = Date.UTC(2026, 8, 12, 19, 0);
const order = { id: 'o1', bandId: 'b-sab', date: '2026-09-12', time: '16:00', status: 'completed' };

describe('serviceFeedback · elegibilidad', () => {
  it('serviceStartEpoch convierte fecha+hora ART a epoch UTC (ART = UTC-3)', () => {
    expect(serviceStartEpoch('2026-09-12', '16:00')).toBe(START);
    expect(serviceStartEpoch('2026-09-12', undefined)).toBe(Date.UTC(2026, 8, 12, 3, 0));
    expect(serviceStartEpoch(null)).toBeNull();
    expect(serviceStartEpoch('basura')).toBeNull();
  });

  it('la ventana es [inicio, inicio + 48 h)', () => {
    expect(feedbackWindow(order)).toEqual({ start: START, end: START + FEEDBACK_WINDOW_MS });
    expect(FEEDBACK_WINDOW_MS).toBe(48 * H);
  });

  it('la líder de la banda la ve desde la hora del servicio (inclusive)', () => {
    expect(resolveFeedbackOrder([order], { id: 'mel' }, 'leader', getBandById, START)?.id).toBe('o1');
    expect(resolveFeedbackOrder([order], { id: 'mel' }, 'leader', getBandById, START + 2 * H)?.id).toBe('o1');
    expect(resolveFeedbackOrder([order], { id: 'mel' }, 'leader', getBandById, START + 47 * H + 59 * 60_000)?.id).toBe('o1');
  });

  it('antes de la hora del servicio NO se ofrece', () => {
    expect(resolveFeedbackOrder([order], { id: 'mel' }, 'leader', getBandById, START - 1)).toBeNull();
  });

  it('a las 48 h exactas desaparece', () => {
    expect(resolveFeedbackOrder([order], { id: 'mel' }, 'leader', getBandById, START + 48 * H)).toBeNull();
    expect(resolveFeedbackOrder([order], { id: 'mel' }, 'leader', getBandById, START + 3 * 24 * H)).toBeNull();
  });

  it('un MIEMBRO de la banda (Gustavo) NO la ve', () => {
    expect(resolveFeedbackOrder([order], { id: 'gus' }, 'member', getBandById, START + 2 * H)).toBeNull();
  });

  it('un pastor SÍ la ve, de cualquier banda (regla: los pastores hacen y reciben todo)', () => {
    expect(canGiveFeedback(bands['b-sab'], { id: 'ana' }, 'pastor')).toBe(true);
    expect(isBandLeader(bands['b-sab'], { id: 'ana' }, 'pastor')).toBe(false);
    expect(resolveFeedbackOrder([order], { id: 'ana' }, 'pastor', getBandById, START + 2 * H)?.id).toBe('o1');
    // misma ventana que el líder: antes del inicio y a las 48 h no
    expect(resolveFeedbackOrder([order], { id: 'ana' }, 'pastor', getBandById, START - 1)).toBeNull();
    expect(resolveFeedbackOrder([order], { id: 'ana' }, 'pastor', getBandById, START + 48 * H)).toBeNull();
  });

  it('un pastor sin id o con orden sin banda tampoco', () => {
    expect(canGiveFeedback(bands['b-sab'], null, 'pastor')).toBe(false);
    expect(resolveFeedbackOrder([{ ...order, bandId: null }], { id: 'ana' }, 'pastor', getBandById, START + 2 * H)).toBeNull();
  });

  it('un líder de OTRA banda NO la ve', () => {
    expect(resolveFeedbackOrder([order], { id: 'daniel' }, 'leader', getBandById, START + 2 * H)).toBeNull();
  });

  it('un líder que integra la banda solo como TEMPORAL (no está en bands.members) NO la ve', () => {
    expect(isBandLeader(bands['b-sab'], { id: 'olga' }, 'leader')).toBe(false);
    expect(resolveFeedbackOrder([order], { id: 'olga' }, 'leader', getBandById, START + 2 * H)).toBeNull();
  });

  it('un orden cancelado, sin banda o sin fecha NO cuenta', () => {
    expect(resolveFeedbackOrder([{ ...order, status: 'cancelled' }], { id: 'mel' }, 'leader', getBandById, START + 2 * H)).toBeNull();
    expect(resolveFeedbackOrder([{ ...order, bandId: null }], { id: 'mel' }, 'leader', getBandById, START + 2 * H)).toBeNull();
    expect(resolveFeedbackOrder([{ ...order, date: null }], { id: 'mel' }, 'leader', getBandById, START + 2 * H)).toBeNull();
  });

  it('con dos servicios en ventana elige el de inicio más reciente', () => {
    const earlier = { ...order, id: 'o0', date: '2026-09-11', time: '19:30' };
    expect(resolveFeedbackOrder([earlier, order], { id: 'mel' }, 'leader', getBandById, START + 1 * H)?.id).toBe('o1');
  });

  it('es robusta a entradas basura', () => {
    expect(resolveFeedbackOrder(null, { id: 'mel' }, 'leader', getBandById, START)).toBeNull();
    expect(resolveFeedbackOrder([null, {}], { id: 'mel' }, 'leader', getBandById, START)).toBeNull();
    expect(resolveFeedbackOrder([order], null, 'leader', getBandById, START)).toBeNull();
    expect(resolveFeedbackOrder([order], { id: 'mel' }, 'leader', () => { throw new Error('x'); }, START)).toBeNull();
  });
});
