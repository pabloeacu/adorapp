import { describe, it, expect } from 'vitest';
import { observerBannerContent, observerWindows, pickObserverFocus } from './observerBanners';

// pickObserverFocus (la elección de estado por ventana) ya está cubierto a fondo
// en bannerLifetime.test.js. Acá cerramos lo que quedaba sin test: el contrato de
// COPY por área/estado, la agregación de ventanas, y el corte por área no observadora.

describe('observerBannerContent — contrato de copy por área/estado', () => {
  it('Sonido tiene los 5 estados con su título', () => {
    expect(observerBannerContent('sonido', 'changed').title).toBe('¡Ojo! Hubo cambios en el orden.');
    expect(observerBannerContent('sonido', 'ensamble').title).toBe('¡Hoy hay ensamble!');
    expect(observerBannerContent('sonido', 'ensamble_suspendido').title).toBe('Ensamble suspendido');
    expect(observerBannerContent('sonido', 'service').title).toBe('¡Hoy hay servicio!');
    expect(observerBannerContent('sonido', 'new').title).toBe('¡Hay un orden nuevo!');
  });
  it('Multimedia NO tiene estados de ensamble (es de Sonido)', () => {
    expect(observerBannerContent('multimedia', 'ensamble')).toBeNull();
    expect(observerBannerContent('multimedia', 'ensamble_suspendido')).toBeNull();
    expect(observerBannerContent('multimedia', 'service').title).toBe('¡Hoy hay servicio!');
    expect(observerBannerContent('multimedia', 'new').title).toBe('¡Hay un orden nuevo!');
  });
  it('el texto de "cambios" es idéntico para ambas áreas', () => {
    expect(observerBannerContent('sonido', 'changed')).toEqual(observerBannerContent('multimedia', 'changed'));
  });
  it('área o estado desconocido → null', () => {
    expect(observerBannerContent('adoracion', 'service')).toBeNull();
    expect(observerBannerContent('sonido', 'inexistente')).toBeNull();
    expect(observerBannerContent(undefined, undefined)).toBeNull();
  });
});

describe('observerWindows', () => {
  it('devuelve las 4 ventanas candidatas por cada orden programado y saltea los demás', () => {
    const scheduled = { id: 'o1', status: 'scheduled', date: '2026-09-19', time: '16:00', songs: [{ songId: 's1' }] };
    const completed = { id: 'o2', status: 'completed', date: '2026-09-19', time: '16:00' };
    expect(observerWindows([scheduled, completed])).toHaveLength(4); // solo el scheduled
    expect(observerWindows([scheduled, scheduled])).toHaveLength(8);
    expect(observerWindows([])).toEqual([]);
    expect(observerWindows(null)).toEqual([]);
  });
});

describe('pickObserverFocus — corte por área', () => {
  it('un área que no es observadora devuelve null', () => {
    expect(pickObserverFocus('adoracion', [], { nowMs: 0 })).toBeNull();
    expect(pickObserverFocus(undefined, [], { nowMs: 0 })).toBeNull();
  });
  it('sin órdenes relevantes devuelve null', () => {
    expect(pickObserverFocus('sonido', [], { nowMs: 0, todayART: '2026-09-19' })).toBeNull();
  });
});
