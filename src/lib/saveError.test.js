import { describe, it, expect, afterEach, vi } from 'vitest';
import { looksOffline, saveErrorMessage, OFFLINE_SAVE_MESSAGE } from './saveError';

const setOnline = (v) => {
  Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });
};

afterEach(() => {
  setOnline(true); // dejar el entorno "con conexión" para el resto de los tests
  vi.restoreAllMocks();
});

describe('looksOffline', () => {
  it('true cuando navigator.onLine === false', () => {
    setOnline(false);
    expect(looksOffline(null)).toBe(true);
    expect(looksOffline('cualquier cosa')).toBe(true);
  });

  it('con conexión, reconoce mensajes típicos de fetch caído', () => {
    setOnline(true);
    expect(looksOffline('TypeError: Failed to fetch')).toBe(true);
    expect(looksOffline(new Error('NetworkError when attempting to fetch resource'))).toBe(true);
    expect(looksOffline('Load failed')).toBe(true);
    expect(looksOffline('net::ERR_INTERNET_DISCONNECTED')).toBe(true);
  });

  it('con conexión y error NO de red → false', () => {
    setOnline(true);
    expect(looksOffline('duplicate key value violates unique constraint')).toBe(false);
    expect(looksOffline(null)).toBe(false);
    expect(looksOffline(undefined)).toBe(false);
    expect(looksOffline('')).toBe(false);
  });
});

describe('saveErrorMessage', () => {
  it('offline → siempre el aviso de conexión (aunque haya detalle)', () => {
    setOnline(false);
    expect(saveErrorMessage(null)).toBe(OFFLINE_SAVE_MESSAGE);
    expect(saveErrorMessage('Error raro del servidor')).toBe(OFFLINE_SAVE_MESSAGE);
    expect(saveErrorMessage(null, 'Fallback propio')).toBe(OFFLINE_SAVE_MESSAGE);
  });

  it('online: respeta el detalle del store/EF si es un string útil', () => {
    setOnline(true);
    expect(saveErrorMessage('No se pudo por RLS')).toBe('No se pudo por RLS');
  });

  it('online sin detalle → fallback (comportamiento previo `detail || fallback`)', () => {
    setOnline(true);
    expect(saveErrorMessage(null)).toBe('Intentá de nuevo. Si el problema sigue, avisale al pastor.');
    expect(saveErrorMessage('', 'Hubo un problema al eliminar.')).toBe('Hubo un problema al eliminar.');
    expect(saveErrorMessage(undefined, 'Fallback propio')).toBe('Fallback propio');
  });

  it('online con detalle de red → aviso de conexión (onLine mintió en true)', () => {
    setOnline(true);
    expect(saveErrorMessage('Failed to fetch')).toBe(OFFLINE_SAVE_MESSAGE);
  });
});
