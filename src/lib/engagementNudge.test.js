import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  decideNudge, copyForNudge, readNudgeState, recordNudgeShown,
  NUDGE_COPY, NOTIF_BLOCKED_COPY, NUDGE_CADENCE_MS,
} from './engagementNudge';

const NOW = 1_000_000_000_000;
const base = { isMobile: true, isInstalled: false, notifEnabled: false, notifDenied: false, lastShownAt: 0, shownCount: 0, now: NOW };

describe('decideNudge — prioridad instalar → notif → nada', () => {
  it('no instalada → cartel de INSTALAR (aunque tampoco tenga notif)', () => {
    const r = decideNudge({ ...base, isInstalled: false, notifEnabled: false });
    expect(r.show).toBe(true);
    expect(r.type).toBe('install');
  });

  it('instalada pero sin notif → cartel de NOTIFICACIONES', () => {
    const r = decideNudge({ ...base, isInstalled: true, notifEnabled: false });
    expect(r.show).toBe(true);
    expect(r.type).toBe('notif');
  });

  it('instalada + con notif → NADA', () => {
    const r = decideNudge({ ...base, isInstalled: true, notifEnabled: true });
    expect(r.show).toBe(false);
    expect(r.type).toBe(null);
  });
});

describe('decideNudge — solo en teléfono', () => {
  it('en la compu (no mobile) → nada, aunque le falte todo', () => {
    const r = decideNudge({ ...base, isMobile: false, isInstalled: false });
    expect(r.show).toBe(false);
    expect(r.type).toBe(null);
  });
});

describe('decideNudge — reloj de 10 días (no invasivo)', () => {
  it('nunca mostrado → muestra', () => {
    expect(decideNudge({ ...base, lastShownAt: 0 }).show).toBe(true);
  });

  it('mostrado hace menos de 10 días → NO muestra (pero conserva el type)', () => {
    const r = decideNudge({ ...base, lastShownAt: NOW - (NUDGE_CADENCE_MS - 1) });
    expect(r.show).toBe(false);
    expect(r.type).toBe('install');
  });

  it('mostrado hace 10 días o más → vuelve a mostrar', () => {
    expect(decideNudge({ ...base, lastShownAt: NOW - NUDGE_CADENCE_MS }).show).toBe(true);
    expect(decideNudge({ ...base, lastShownAt: NOW - NUDGE_CADENCE_MS - 1 }).show).toBe(true);
  });
});

describe('decideNudge — rotación A/B del copy', () => {
  it('variant alterna 0,1,0,1 según el contador de apariciones', () => {
    expect(decideNudge({ ...base, shownCount: 0 }).variant).toBe(0);
    expect(decideNudge({ ...base, shownCount: 1 }).variant).toBe(1);
    expect(decideNudge({ ...base, shownCount: 2 }).variant).toBe(0);
    expect(decideNudge({ ...base, shownCount: 3 }).variant).toBe(1);
  });
});

describe('decideNudge — notificaciones bloqueadas', () => {
  it('notif + denied → marca denied (para mostrar instrucciones, no el botón)', () => {
    const r = decideNudge({ ...base, isInstalled: true, notifEnabled: false, notifDenied: true });
    expect(r.type).toBe('notif');
    expect(r.denied).toBe(true);
  });

  it('el denied NO aplica al cartel de instalar', () => {
    const r = decideNudge({ ...base, isInstalled: false, notifDenied: true });
    expect(r.type).toBe('install');
    expect(r.denied).toBe(false);
  });
});

describe('copyForNudge — resuelve rotación + bloqueado', () => {
  it('install variante 0 y 1', () => {
    expect(copyForNudge({ type: 'install', variant: 0, denied: false })).toBe(NUDGE_COPY.install[0]);
    expect(copyForNudge({ type: 'install', variant: 1, denied: false })).toBe(NUDGE_COPY.install[1]);
  });
  it('notif variante 0 y 1', () => {
    expect(copyForNudge({ type: 'notif', variant: 0, denied: false })).toBe(NUDGE_COPY.notif[0]);
    expect(copyForNudge({ type: 'notif', variant: 1, denied: false })).toBe(NUDGE_COPY.notif[1]);
  });
  it('notif bloqueado → copy de instrucciones', () => {
    expect(copyForNudge({ type: 'notif', variant: 0, denied: true })).toBe(NOTIF_BLOCKED_COPY);
  });
});

describe('readNudgeState / recordNudgeShown — fallback con storage roto (modo privado / cuota)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    try { localStorage.clear(); } catch { /* noop */ }
  });

  it('con localStorage que lanza, sella el reloj en memoria y readNudgeState lo devuelve', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => {},
      clear: () => {},
    });
    const t = 1_700_000_000_000;
    recordNudgeShown(t); // no debe tirar aunque setItem lance
    const s = readNudgeState(); // getItem lanza → cae al fallback en memoria
    expect(s.lastShownAt).toBe(t);
    expect(s.shownCount).toBe(1);
  });

  it('con storage sano persiste y lee el reloj (camino feliz)', () => {
    try { localStorage.clear(); } catch { /* noop */ }
    const t = 1_700_000_100_000;
    recordNudgeShown(t);
    const s = readNudgeState();
    expect(s.lastShownAt).toBe(t);
    expect(s.shownCount).toBeGreaterThanOrEqual(1);
  });
});
