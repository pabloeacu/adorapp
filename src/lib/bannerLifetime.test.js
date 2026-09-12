import { describe, it, expect } from 'vitest';
import {
  HOUR_MS, DAY_MS, inWindow, rehearsalCardWindow, prepWindow, observerChangedWindow, observerServiceWindow,
  observerNewWindow, orderChangedWindow, ministrationNoticeWindow, collabResultWindow, nextBoundary, nextArtMidnight,
  resolveMinistrationNotice, resolveOrderChanged, artDayEpoch,
} from './bannerLifetime';
import { pickObserverFocus } from './observerBanners';

// Servicio: sábado 2026-09-19 a las 16:00 ART = 19:00 UTC.
const START = Date.UTC(2026, 8, 19, 19, 0);
const iso = (ms) => new Date(ms).toISOString();
const base = { id: 'o1', bandId: 'b1', status: 'scheduled', date: '2026-09-19', time: '16:00', songs: [{ songId: 's1' }] };

describe('ventanas de vida de los banners', () => {
  it('ensamble: [día 08:00, hora + 2 h); sin hora hasta las 23:00', () => {
    const w = rehearsalCardWindow({ ...base, rehearsalDate: '2026-09-17', rehearsalTime: '20:00' });
    expect(w).toEqual({ start: artDayEpoch('2026-09-17', 8), end: Date.UTC(2026, 8, 17, 23, 0) + 2 * HOUR_MS });
    expect(rehearsalCardWindow({ ...base, rehearsalDate: '2026-09-17', rehearsalTime: null }))
      .toEqual({ start: artDayEpoch('2026-09-17', 8), end: artDayEpoch('2026-09-17', 23) });
    expect(rehearsalCardWindow({ ...base })).toBeNull();
    // ensamble a las 07:00 → termina 09:00, después de las 08:00: ventana válida de 1 h
    expect(rehearsalCardWindow({ ...base, rehearsalDate: '2026-09-17', rehearsalTime: '07:00' }).end - artDayEpoch('2026-09-17', 8)).toBe(HOUR_MS);
    // ensamble a las 05:00 → terminaría 07:00 < 08:00 → sin ventana
    expect(rehearsalCardWindow({ ...base, rehearsalDate: '2026-09-17', rehearsalTime: '05:00' })).toBeNull();
  });

  it('preparación: 7 días antes (00:00 ART) hasta la hora del servicio', () => {
    const w = prepWindow(base);
    expect(w.start).toBe(artDayEpoch('2026-09-12', 0));
    expect(w.end).toBe(START);
    expect(inWindow(w, START - 1)).toBe(true);
    expect(inWindow(w, START)).toBe(false);
    expect(inWindow(w, artDayEpoch('2026-09-11', 23))).toBe(false);
    expect(prepWindow({ ...base, date: null })).toBeNull();
  });

  it('áreas "¡Ojo!": desde el cambio hasta 2 h después de la hora del servicio', () => {
    const changedAt = START - 3 * DAY_MS;
    const w = observerChangedWindow({ ...base, contentChangedAt: iso(changedAt) });
    expect(w).toEqual({ start: changedAt, end: START + 2 * HOUR_MS });
    expect(inWindow(w, START + HOUR_MS)).toBe(true);
    expect(inWindow(w, START + 2 * HOUR_MS)).toBe(false);
    // cambio DESPUÉS de las 2 h post-servicio → sin ventana
    expect(observerChangedWindow({ ...base, contentChangedAt: iso(START + 3 * HOUR_MS) })).toBeNull();
    expect(observerChangedWindow({ ...base })).toBeNull();
  });

  it('áreas "hoy hay servicio": [08:00, inicio + 3 h)', () => {
    const w = observerServiceWindow(base);
    expect(w).toEqual({ start: artDayEpoch('2026-09-19', 8), end: START + 3 * HOUR_MS });
    expect(inWindow(w, artDayEpoch('2026-09-19', 7))).toBe(false);
    expect(inWindow(w, START + 3 * HOUR_MS - 1)).toBe(true);
  });

  it('áreas "orden nuevo": 72 h desde la creación', () => {
    const created = START - 10 * DAY_MS;
    const w = observerNewWindow({ ...base, createdAt: iso(created) });
    expect(w).toEqual({ start: created, end: created + 72 * HOUR_MS });
    expect(observerNewWindow({ ...base })).toBeNull();
  });

  it('banda "hubo cambios": 48 h desde el cambio y nunca después del inicio', () => {
    const early = START - 10 * DAY_MS;
    expect(orderChangedWindow({ ...base, contentChangedAt: iso(early) })).toEqual({ start: early, end: early + 48 * HOUR_MS });
    const late = START - HOUR_MS;
    expect(orderChangedWindow({ ...base, contentChangedAt: iso(late) })).toEqual({ start: late, end: START });
    // cambio con el servicio ya empezado (p. ej. ministración) → sin ventana
    expect(orderChangedWindow({ ...base, contentChangedAt: iso(START + 10 * 60 * 1000) })).toBeNull();
  });

  it('aviso de ministración: [inicio, +3 h)', () => {
    expect(ministrationNoticeWindow(base)).toEqual({ start: START, end: START + 3 * HOUR_MS });
  });

  it('colaboración (resultado): 48 h desde la decisión, nunca después del servicio', () => {
    const decided = START - 5 * DAY_MS;
    expect(collabResultWindow(iso(decided), base)).toEqual({ start: decided, end: decided + 48 * HOUR_MS });
    expect(collabResultWindow(iso(START - HOUR_MS), base)).toEqual({ start: START - HOUR_MS, end: START });
    expect(collabResultWindow(iso(decided), null)).toEqual({ start: decided, end: decided + 48 * HOUR_MS });
    expect(collabResultWindow(null, base)).toBeNull();
    expect(collabResultWindow(iso(START + HOUR_MS), base)).toBeNull();
  });

  it('nextBoundary elige el límite futuro más cercano; nextArtMidnight cae a las 03:00 UTC', () => {
    const now = START - 1000;
    expect(nextBoundary([{ start: START - 5000, end: START + 5000 }, { start: START, end: START + 9000 }, null], now)).toBe(START);
    expect(nextBoundary([{ start: START - 5000, end: START - 2000 }], now)).toBeNull();
    const mid = nextArtMidnight(START); // 19/09 16:00 ART → 20/09 00:00 ART = 03:00 UTC
    expect(mid).toBe(Date.UTC(2026, 8, 20, 3, 0));
    expect(nextArtMidnight(Date.UTC(2026, 8, 20, 2, 59))).toBe(Date.UTC(2026, 8, 20, 3, 0)); // 23:59 ART → misma medianoche
    expect(nextArtMidnight(Date.UTC(2026, 8, 20, 3, 0))).toBe(Date.UTC(2026, 8, 21, 3, 0));
  });
});

describe('resolveMinistrationNotice', () => {
  const band = { id: 'b1', members: ['lea', 'vicky'] };
  const getBandById = () => band;
  const order = { ...base, songs: [{ songId: 's1' }, { songId: 's5', key: 'Dm', directorId: 'vicky', ministracion: true }] };
  const inService = START + 30 * 60 * 1000;
  const ctxFor = (participantIds, isObserver = false) => ({
    getBandById, isObserver, isOrderParticipant: (o, id) => participantIds.includes(id),
  });

  it('lo ve quien participa (miembro) durante las 3 h; no antes ni después', () => {
    const ctx = ctxFor(['vicky']);
    expect(resolveMinistrationNotice([order], { id: 'vicky' }, 'member', ctx, inService)?.id).toBe('o1');
    expect(resolveMinistrationNotice([order], { id: 'vicky' }, 'member', ctx, START - 1)).toBeNull();
    expect(resolveMinistrationNotice([order], { id: 'vicky' }, 'member', ctx, START + 3 * HOUR_MS)).toBeNull();
  });
  it('lo ve el observador de área aunque no participe; no lo ve quien no participa ni es observador', () => {
    expect(resolveMinistrationNotice([order], { id: 'sofi' }, 'member', ctxFor([], true), inService)?.id).toBe('o1');
    expect(resolveMinistrationNotice([order], { id: 'otro' }, 'member', ctxFor([]), inService)).toBeNull();
  });
  it('NO lo ven el líder de la banda ni el pastor (tienen "¿Con qué ministramos?")', () => {
    expect(resolveMinistrationNotice([order], { id: 'lea' }, 'leader', ctxFor(['lea']), inService)).toBeNull();
    expect(resolveMinistrationNotice([order], { id: 'ana' }, 'pastor', ctxFor([]), inService)).toBeNull();
  });
  it('sin canción de ministración, cancelado o sin banda → nada', () => {
    const ctx = ctxFor(['vicky']);
    expect(resolveMinistrationNotice([base], { id: 'vicky' }, 'member', ctx, inService)).toBeNull();
    expect(resolveMinistrationNotice([{ ...order, status: 'cancelled' }], { id: 'vicky' }, 'member', ctx, inService)).toBeNull();
    expect(resolveMinistrationNotice([{ ...order, bandId: null }], { id: 'vicky' }, 'member', ctx, inService)).toBeNull();
  });
});

describe('resolveOrderChanged', () => {
  const ids = new Set(['lea', 'vicky', 'olga']);
  const ctx = { getEffectiveBandMemberIds: () => ids };
  const changedAt = START - 2 * DAY_MS;
  const order = { ...base, contentChangedAt: iso(changedAt), contentChangedBy: 'lea' };
  const now = changedAt + HOUR_MS;

  it('lo ve la banda efectiva (incluye temporales) y el pastor; no quien editó', () => {
    expect(resolveOrderChanged([order], { id: 'vicky' }, 'member', ctx, now).map((o) => o.id)).toEqual(['o1']);
    expect(resolveOrderChanged([order], { id: 'olga' }, 'leader', ctx, now).map((o) => o.id)).toEqual(['o1']);
    expect(resolveOrderChanged([order], { id: 'ana' }, 'pastor', { getEffectiveBandMemberIds: () => new Set() }, now).map((o) => o.id)).toEqual(['o1']);
    expect(resolveOrderChanged([order], { id: 'lea' }, 'leader', ctx, now)).toEqual([]);
    expect(resolveOrderChanged([order], { id: 'ajeno' }, 'member', ctx, now)).toEqual([]);
  });
  it('vence a las 48 h y nunca pasa la hora del servicio', () => {
    expect(resolveOrderChanged([order], { id: 'vicky' }, 'member', ctx, changedAt + 48 * HOUR_MS)).toEqual([]);
    const late = { ...order, contentChangedAt: iso(START - HOUR_MS) };
    expect(resolveOrderChanged([late], { id: 'vicky' }, 'member', ctx, START - 1).length).toBe(1);
    expect(resolveOrderChanged([late], { id: 'vicky' }, 'member', ctx, START)).toEqual([]);
  });
  it('sin sello, cancelado o sello pisado por el cron (sin autor) → se muestra igual salvo sin sello', () => {
    expect(resolveOrderChanged([base], { id: 'vicky' }, 'member', ctx, now)).toEqual([]);
    expect(resolveOrderChanged([{ ...order, status: 'completed' }], { id: 'vicky' }, 'member', ctx, now)).toEqual([]);
    expect(resolveOrderChanged([{ ...order, contentChangedBy: null }], { id: 'lea' }, 'leader', ctx, now).length).toBe(1);
  });
  it('ordena por cambio más reciente primero', () => {
    const o2 = { ...order, id: 'o2', contentChangedAt: iso(changedAt + 10 * 60 * 1000) };
    expect(resolveOrderChanged([order, o2], { id: 'vicky' }, 'member', ctx, now).map((o) => o.id)).toEqual(['o2', 'o1']);
  });
});

describe('pickObserverFocus con ventanas', () => {
  const created = START - 10 * DAY_MS;
  const o = { ...base, createdAt: iso(created) };
  const ctx = (nowMs, extra = {}) => ({ nowMs, todayART: '2026-09-12', memberId: 'sofi', ...extra });

  it('"changed" vive desde el cambio hasta 2 h después del servicio', () => {
    const chg = { ...o, contentChangedAt: iso(START - DAY_MS), contentChangedBy: 'lea' };
    expect(pickObserverFocus('multimedia', [chg], ctx(START - HOUR_MS))?.state).toBe('changed');
    expect(pickObserverFocus('multimedia', [chg], ctx(START + HOUR_MS))?.state).toBe('changed');
    expect(pickObserverFocus('multimedia', [chg], ctx(START + 2 * HOUR_MS))?.state).toBe('service'); // todavía dentro de [08:00, +3 h)
    expect(pickObserverFocus('multimedia', [chg], ctx(START + 3 * HOUR_MS))).toBeNull();
  });
  it('"changed" se omite para quien editó, para quien ya recibe el aviso de banda, y para la ministración en curso', () => {
    const chg = { ...o, contentChangedAt: iso(START - DAY_MS), contentChangedBy: 'sofi' };
    expect(pickObserverFocus('multimedia', [chg], ctx(START - HOUR_MS))?.state).toBe('service');
    const chg2 = { ...chg, contentChangedBy: 'lea' };
    expect(pickObserverFocus('multimedia', [chg2], ctx(START - HOUR_MS, { coveredElsewhere: () => true }))?.state).toBe('service');
    const min = { ...o, contentChangedAt: iso(START + 20 * 60 * 1000), contentChangedBy: 'lea', songs: [{ songId: 's5', ministracion: true }] };
    expect(pickObserverFocus('sonido', [min], ctx(START + 30 * 60 * 1000))?.state).toBe('service');
    const editDuring = { ...min, songs: [{ songId: 's1' }] };
    expect(pickObserverFocus('sonido', [editDuring], ctx(START + 30 * 60 * 1000))?.state).toBe('changed');
  });
  it('"service" solo entre las 08:00 y 3 h después del inicio; antes de las 08:00 cae a "new" si sigue en sus 72 h', () => {
    const fresh = { ...o, createdAt: iso(START - 2 * DAY_MS) };
    expect(pickObserverFocus('multimedia', [fresh], ctx(artDayEpoch('2026-09-19', 7), { todayART: '2026-09-19' }))).toBeNull(); // hoy, pero "new" exige servicio futuro
    expect(pickObserverFocus('multimedia', [fresh], ctx(artDayEpoch('2026-09-18', 10), { todayART: '2026-09-18' }))?.state).toBe('new');
    expect(pickObserverFocus('multimedia', [fresh], ctx(artDayEpoch('2026-09-19', 9), { todayART: '2026-09-19' }))?.state).toBe('service');
  });
  it('"new" vence a las 72 h de la creación', () => {
    expect(pickObserverFocus('multimedia', [o], ctx(created + 71 * HOUR_MS))?.state).toBe('new');
    expect(pickObserverFocus('multimedia', [o], ctx(created + 72 * HOUR_MS))).toBeNull();
  });
  it('"ensamble" (solo Sonido): [08:00, hora + 2 h)', () => {
    const ens = { ...o, rehearsalDate: '2026-09-17', rehearsalTime: '20:00' };
    const at = artDayEpoch('2026-09-17', 21);
    expect(pickObserverFocus('sonido', [ens], ctx(at, { todayART: '2026-09-17' }))?.state).toBe('ensamble');
    expect(pickObserverFocus('multimedia', [ens], ctx(at, { todayART: '2026-09-17' }))).toBeNull();
    expect(pickObserverFocus('sonido', [ens], ctx(artDayEpoch('2026-09-17', 22) + 1, { todayART: '2026-09-17' }))).toBeNull();
    expect(pickObserverFocus('sonido', [{ ...ens, rehearsalSuspended: true }], ctx(at, { todayART: '2026-09-17' }))?.state).toBe('ensamble_suspendido');
  });
});
