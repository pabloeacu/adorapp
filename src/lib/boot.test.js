// Arranque: la ficha y las tablas se piden EN PARALELO después de restaurar la
// sesión, y no se declara listo hasta que vuelven LAS DOS (landmine #61).
import { describe, it, expect, vi } from 'vitest';
import { runBoot } from './boot';

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

describe('runBoot', () => {
  it('con sesión: lanza ficha y tablas a la vez, recién después de la sesión, y espera a ambas', async () => {
    const log = [];
    const profile = deferred(); const data = deferred();
    const restoreSession = vi.fn(async () => { log.push('session'); return { id: 'u1' }; });
    const bootProfile = vi.fn((id) => { log.push(`profile:${id}`); return profile.promise; });
    const initializeApp = vi.fn(() => { log.push('data'); return data.promise; });
    let done = false;
    const p = runBoot({ restoreSession, bootProfile, initializeApp }).then(() => { done = true; });
    await Promise.resolve(); await Promise.resolve();
    // Las dos ya salieron (en paralelo) sin que ninguna haya vuelto todavía
    expect(log).toEqual(['session', 'profile:u1', 'data']);
    expect(done).toBe(false);
    profile.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(done).toBe(false); // falta la data → sigue esperando
    data.resolve(); await p;
    expect(done).toBe(true);
    expect(bootProfile).toHaveBeenCalledWith('u1');
  });

  it('sin sesión: no pide NADA (ni ficha ni tablas) y termina', async () => {
    const bootProfile = vi.fn();
    const initializeApp = vi.fn(async () => {});
    const onSession = vi.fn();
    const user = await runBoot({ restoreSession: async () => null, bootProfile, initializeApp, onSession });
    expect(user).toBeNull();
    expect(bootProfile).not.toHaveBeenCalled();
    // Landmine #62(a): sin credencial no se piden datos (la base los deniega y
    // una respuesta de anónimo no debe llegar al store ni a la caché).
    expect(initializeApp).not.toHaveBeenCalled();
    expect(onSession).toHaveBeenCalledWith(null);
  });

  it('si la ficha falla, el arranque igual espera a las tablas y propaga el error', async () => {
    const initializeApp = vi.fn(async () => {});
    await expect(runBoot({ restoreSession: async () => ({ id: 'u1' }), bootProfile: async () => { throw new Error('ficha'); }, initializeApp }))
      .rejects.toThrow('ficha');
    expect(initializeApp).toHaveBeenCalledTimes(1);
  });
});
