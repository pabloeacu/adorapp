import { describe, it, expect, beforeEach } from 'vitest';
import {
  pctOf, isPreReloadStep, UPDATE_STEPS,
  markUpdateStep, finishUpdate, getUpdateState,
} from './updateProgress';

// Máquina de estados de la pantalla "Actualizando a la nueva versión". Un bug acá
// = barra que retrocede o % equivocado en CADA publicación. Ver landmine #60.
describe('updateProgress', () => {
  beforeEach(() => finishUpdate()); // estado limpio antes de cada caso

  it('pctOf respeta el modo (build = 4 pasos, sw = 9 pasos)', () => {
    expect(pctOf('booting', 'build')).toBe(22);
    expect(pctOf('booting', 'sw')).toBe(72);
    expect(pctOf('done', 'build')).toBe(100);
    expect(pctOf('done', 'sw')).toBe(100);
    expect(pctOf('found', 'sw')).toBe(12);
    expect(pctOf('desconocido', 'sw')).toBe(0);
  });

  it('isPreReloadStep separa antes/después de la recarga', () => {
    expect(isPreReloadStep('found')).toBe(true);
    expect(isPreReloadStep('reloading')).toBe(true); // inclusive
    expect(isPreReloadStep('booting')).toBe(false);
    expect(isPreReloadStep('done')).toBe(false);
  });

  it('el % de los pasos es estrictamente creciente en el orden definido (la barra nunca salta hacia atrás)', () => {
    const order = Object.keys(UPDATE_STEPS);
    for (let i = 1; i < order.length; i++) {
      expect(UPDATE_STEPS[order[i]].pct > UPDATE_STEPS[order[i - 1]].pct).toBe(true);
    }
  });

  it('markUpdateStep avanza y NUNCA retrocede (un evento tardío del SW no pisa un paso posterior)', () => {
    markUpdateStep('downloading');
    expect(getUpdateState().step).toBe('downloading');
    expect(getUpdateState().active).toBe(true);
    markUpdateStep('found'); // anterior en el orden → se ignora
    expect(getUpdateState().step).toBe('downloading');
    markUpdateStep('done');
    expect(getUpdateState().step).toBe('done');
  });

  it('un paso inválido no hace nada', () => {
    markUpdateStep('booting');
    markUpdateStep('paso-inexistente');
    expect(getUpdateState().step).toBe('booting');
  });

  it('finishUpdate apaga el estado', () => {
    markUpdateStep('data');
    finishUpdate();
    expect(getUpdateState().active).toBe(false);
    expect(getUpdateState().step).toBe(null);
  });
});
