import { describe, it, expect } from 'vitest';
import {
  SCHEMA_SECTION_TYPES, sectionMeta, hhmmToMin, minToHhmm,
  sectionDurationMin, sectionDisplayLabel, minToDurationLabel,
} from './serviceSchema';

// Helpers puros del "Esquema de reunión" / presentador (cuenta regresiva por sección).
// Fuente única del armador y del presentador en vivo; hasta ahora sin test propio.

describe('hhmmToMin', () => {
  it('convierte "hh:mm" válidos a minutos', () => {
    expect(hhmmToMin('09:30')).toBe(570);
    expect(hhmmToMin('00:00')).toBe(0);
    expect(hhmmToMin('23:59')).toBe(1439);
  });
  it('rechaza formatos y rangos inválidos con null', () => {
    expect(hhmmToMin('25:00')).toBeNull(); // hora > 23
    expect(hhmmToMin('10:70')).toBeNull(); // minutos > 59
    expect(hhmmToMin('9:5')).toBeNull();   // regex exige 2 dígitos de minuto
    expect(hhmmToMin('abc')).toBeNull();
    expect(hhmmToMin('')).toBeNull();
    expect(hhmmToMin(null)).toBeNull();
  });
});

describe('minToHhmm', () => {
  it('convierte minutos a "hh:mm" con wraparound', () => {
    expect(minToHhmm(570)).toBe('09:30');
    expect(minToHhmm(1440)).toBe('00:00'); // vuelve a 0
    expect(minToHhmm(-30)).toBe('23:30');  // negativo envuelve
    expect(minToHhmm(null)).toBe('');
    expect(minToHhmm(Infinity)).toBe('');
  });
});

describe('sectionDurationMin', () => {
  it('modo duration: el número tal cual, >0', () => {
    expect(sectionDurationMin({ timeMode: 'duration', durationMin: 20 })).toBe(20);
    expect(sectionDurationMin({ timeMode: 'duration', durationMin: 0 })).toBeNull();
    expect(sectionDurationMin({ timeMode: 'duration', durationMin: -5 })).toBeNull();
    expect(sectionDurationMin({ timeMode: 'duration', durationMin: 'x' })).toBeNull();
  });
  it('modo horario: fin − inicio si fin > inicio', () => {
    expect(sectionDurationMin({ timeMode: 'horario', startTime: '19:00', endTime: '20:30' })).toBe(90);
    expect(sectionDurationMin({ timeMode: 'horario', startTime: '20:00', endTime: '20:00' })).toBeNull();
    expect(sectionDurationMin({ timeMode: 'horario', startTime: '20:00', endTime: '19:00' })).toBeNull();
    expect(sectionDurationMin({ timeMode: 'horario', startTime: 'x', endTime: '20:00' })).toBeNull();
  });
  it('modo none / sección nula → null', () => {
    expect(sectionDurationMin({ timeMode: 'none' })).toBeNull();
    expect(sectionDurationMin({})).toBeNull(); // default none
    expect(sectionDurationMin(null)).toBeNull();
  });
});

describe('minToDurationLabel', () => {
  it('formatea minutos → etiqueta legible', () => {
    expect(minToDurationLabel(45)).toBe('45 min');
    expect(minToDurationLabel(60)).toBe('1 hr');
    expect(minToDurationLabel(70)).toBe('1 hr 10 min');
    expect(minToDurationLabel(120)).toBe('2 hr');
    expect(minToDurationLabel(0)).toBe('0 min');
    expect(minToDurationLabel(-5)).toBe('0 min'); // clamp a 0
  });
});

describe('sectionMeta / sectionDisplayLabel / contrato de tipos', () => {
  it('sectionMeta devuelve el tipo o un fallback', () => {
    expect(sectionMeta('adoracion').isSong).toBe(true);
    expect(sectionMeta('otro').isCustom).toBe(true);
    expect(sectionMeta('inexistente').label).toBe('Sección');
  });
  it('sectionDisplayLabel prioriza el alias trimeado, si no el label del tipo', () => {
    expect(sectionDisplayLabel({ alias: '  Bienvenida ' }, { label: 'Host' })).toBe('Bienvenida');
    expect(sectionDisplayLabel({ alias: '' }, { label: 'Host' })).toBe('Host');
    expect(sectionDisplayLabel(null, null)).toBe('Sección');
  });
  it('lock del contrato: adoracion=isSong, otro=isCustom (y una sola de cada una)', () => {
    expect(SCHEMA_SECTION_TYPES.filter((t) => t.isSong).map((t) => t.id)).toEqual(['adoracion']);
    expect(SCHEMA_SECTION_TYPES.filter((t) => t.isCustom).map((t) => t.id)).toEqual(['otro']);
  });
});
