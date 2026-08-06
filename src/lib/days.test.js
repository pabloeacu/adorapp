import { describe, it, expect } from 'vitest';
import { dayPluralLabels, compareBandsByCalendar } from './days';

describe('dayPluralLabels', () => {
  it('los días terminados en s son invariantes (nunca "Martess")', () => {
    expect(dayPluralLabels.lunes).toBe('Lunes');
    expect(dayPluralLabels.martes).toBe('Martes');
    expect(dayPluralLabels.miercoles).toBe('Miércoles');
    expect(dayPluralLabels.jueves).toBe('Jueves');
    expect(dayPluralLabels.viernes).toBe('Viernes');
  });

  it('sábado y domingo sí pluralizan', () => {
    expect(dayPluralLabels.sabado).toBe('Sábados');
    expect(dayPluralLabels.domingo).toBe('Domingos');
  });

  it('ningún plural termina en doble s', () => {
    Object.values(dayPluralLabels).forEach((label) => {
      expect(label.endsWith('ss')).toBe(false);
    });
  });
});

describe('compareBandsByCalendar', () => {
  const band = (name, meetingDay, meetingTime = '20:00') => ({ name, meetingDay, meetingTime });

  it('ordena las bandas reales del ministerio: martes, jueves, sábado, domingo', () => {
    const bands = [
      band('Banda Domingo', 'domingo', '11:00'),
      band('Banda Jóvenes', 'sabado', '20:00'),
      band('Banda Martes', 'martes', '19:30'),
      band('Banda Sábado', 'sabado', '16:00'),
      band('Banda Av. Mujer', 'jueves', '19:30'),
    ];
    const sorted = [...bands].sort(compareBandsByCalendar);
    expect(sorted.map(b => b.name)).toEqual([
      'Banda Martes',        // martes
      'Banda Av. Mujer',     // jueves
      'Banda Sábado',        // sábado 16:00 (antes que 20:00)
      'Banda Jóvenes',       // sábado 20:00
      'Banda Domingo',       // domingo
    ]);
  });

  it('a igual día desempata por horario y después por nombre', () => {
    const sorted = [
      band('Zeta', 'domingo', '11:00'),
      band('Alfa', 'domingo', '11:00'),
      band('Temprano', 'domingo', '09:00'),
    ].sort(compareBandsByCalendar);
    expect(sorted.map(b => b.name)).toEqual(['Temprano', 'Alfa', 'Zeta']);
  });

  it('día desconocido o vacío va al final sin romper', () => {
    const sorted = [
      band('Sin día', null),
      band('Martes', 'martes'),
    ].sort(compareBandsByCalendar);
    expect(sorted.map(b => b.name)).toEqual(['Martes', 'Sin día']);
  });
});
