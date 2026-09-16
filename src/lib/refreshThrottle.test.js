// Freno del auto-refresco: throttle de 15 s, pero SIEMPRE se recarga si los
// datos en memoria son de otro usuario (o de nadie).
import { describe, it, expect, beforeEach } from 'vitest';
import { shouldRefresh, markRefreshed, invalidateRefresh, REFRESH_THROTTLE_MS } from './refreshThrottle';

describe('refreshThrottle', () => {
  beforeEach(() => { invalidateRefresh(); });

  it('sin marca previa: siempre refresca', () => {
    expect(shouldRefresh(null)).toBe(true);
    expect(shouldRefresh('u1')).toBe(true);
  });

  it('recién marcado para el mismo usuario: frena', () => {
    markRefreshed('u1');
    expect(shouldRefresh('u1')).toBe(false);
  });

  it('pasada la ventana: vuelve a refrescar', () => {
    markRefreshed('u1');
    expect(shouldRefresh('u1', Date.now() + REFRESH_THROTTLE_MS + 1)).toBe(true);
  });

  it('arranque sin sesión + ingreso inmediato: NO frena (el usuario cambió)', () => {
    markRefreshed(null);           // arranque en el login, sin datos cargados
    expect(shouldRefresh('u1')).toBe(true);
  });

  it('cambio de usuario: no frena aunque sea al instante', () => {
    markRefreshed('u1');
    expect(shouldRefresh('u2')).toBe(true);
  });

  it('logout (invalidate) + reingreso del mismo usuario: no frena', () => {
    markRefreshed('u1');
    invalidateRefresh();
    expect(shouldRefresh('u1')).toBe(true);
  });
});
