import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./updateProgress', () => ({ markUpdateStep: vi.fn() }));

import { markUpdateStep } from './updateProgress';
import { isChunkLoadError, recoverFromStaleChunk, recentlyRetried, clearRetryMark, withChunkRecovery, isReloadPending, _resetReloadPendingForTests } from './chunkRecovery';

describe('chunkRecovery', () => {
  beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); _resetReloadPendingForTests(); });

  it('reconoce los mensajes de chunk viejo de Safari, Chrome y Firefox', () => {
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Bandas-abc.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
  });

  it('NO confunde otros errores con chunk viejo', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkLoadError(new Error('Network request failed'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it('recarga UNA vez, marca "reloading" y no vuelve a recargar dentro de la ventana', () => {
    const reload = vi.fn();
    expect(recoverFromStaleChunk({ reload, now: 1000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(markUpdateStep).toHaveBeenCalledWith('reloading');
    expect(recentlyRetried(1000 + 30_000)).toBe(true);
    // misma página, recarga en curso → informa true pero NO vuelve a recargar
    expect(recoverFromStaleChunk({ reload, now: 1000 + 30_000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    // página nueva (tras la recarga) que vuelve a fallar dentro de la ventana → NO recarga
    // (anti-loop): el error debe llegar al ErrorBoundary
    _resetReloadPendingForTests();
    expect(recoverFromStaleChunk({ reload, now: 1000 + 30_000 })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('pasada la ventana (60 s) vuelve a poder recargar', () => {
    const reload = vi.fn();
    recoverFromStaleChunk({ reload, now: 1000 });
    _resetReloadPendingForTests(); // página nueva
    expect(recoverFromStaleChunk({ reload, now: 1000 + 61_000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('clearRetryMark limpia la marca', () => {
    recoverFromStaleChunk({ reload: () => {}, now: 1000 });
    clearRetryMark();
    expect(recentlyRetried(1000)).toBe(false);
  });

  it('withChunkRecovery: chunk viejo → recarga y deja la promesa pendiente (loader puesto)', async () => {
    const reloadSpy = vi.fn();
    const origLocation = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...origLocation, reload: reloadSpy } });
    const importer = vi.fn().mockRejectedValue(new Error('Importing a module script failed.'));
    const wrapped = withChunkRecovery(importer);
    const p = wrapped();
    const settled = await Promise.race([p.then(() => 'resolved', () => 'rejected'), new Promise((r) => setTimeout(() => r('pending'), 30))]);
    expect(settled).toBe('pending');
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, 'location', { configurable: true, value: origLocation });
  });

  it('withChunkRecovery: si ya se recargó hace poco, propaga el error (va al ErrorBoundary)', async () => {
    sessionStorage.setItem('adorapp:chunk-retry', String(Date.now()));
    const importer = vi.fn().mockRejectedValue(new Error('Importing a module script failed.'));
    await expect(withChunkRecovery(importer)()).rejects.toThrow(/module script/);
  });

  it('withChunkRecovery: un error que no es de chunk se propaga tal cual', async () => {
    const importer = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(withChunkRecovery(importer)()).rejects.toThrow('boom');
  });

  it('con la recarga ya disparada, cualquier otro fallo de carga queda pendiente (sin error falso)', async () => {
    recoverFromStaleChunk({ reload: () => {}, now: Date.now() });
    expect(isReloadPending()).toBe(true);
    // Vite con preloadError cancelado resuelve undefined → lazyPage tira TypeError: no debe propagarse
    const importer = vi.fn().mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'Bandas')"));
    const p = withChunkRecovery(importer)();
    const settled = await Promise.race([p.then(() => 'resolved', () => 'rejected'), new Promise((r) => setTimeout(() => r('pending'), 30))]);
    expect(settled).toBe('pending');
    // y una segunda llamada a recover NO vuelve a recargar pero informa que ya hay una en curso
    const reload = vi.fn();
    expect(recoverFromStaleChunk({ reload, now: Date.now() })).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it('withChunkRecovery: el import exitoso pasa intacto', async () => {
    const wrapped = withChunkRecovery(async () => ({ Foo: 1 }));
    await expect(wrapped()).resolves.toEqual({ Foo: 1 });
  });
});
