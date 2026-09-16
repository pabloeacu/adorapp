// Landmine #50: una fecha YYYY-MM-DD se muestra tal cual, sin corrimiento de
// zona horaria (`new Date('2026-09-11')` en Argentina mostraría el día 10).
import { describe, it, expect } from 'vitest';
import { formatDateLocal, formatDateLocalShort } from './dates';

describe('formatDateLocal', () => {
  it('muestra el MISMO día que dice la fecha guardada', () => {
    expect(formatDateLocal('1990-05-10')).toMatch(/^10 de mayo de 1990$/);
    expect(formatDateLocal('2026-01-01')).toMatch(/^1 de enero de 2026$/);
    // el caso que rompía con new Date(str): 1 de mes a medianoche UTC
    expect(formatDateLocal('2026-09-11')).toMatch(/^11 de septiembre de 2026$/);
  });

  it('acepta un ISO completo (usa la parte de la fecha)', () => {
    expect(formatDateLocal('2026-09-11T23:30:00Z')).toMatch(/^11 de septiembre de 2026$/);
  });

  it('variante con mes corto', () => {
    expect(formatDateLocalShort('2026-09-11')).toMatch(/^11 (de )?sept/);
  });

  it('vacío o formato desconocido: no rompe', () => {
    expect(formatDateLocal('')).toBe('');
    expect(formatDateLocal(null)).toBe('');
    expect(formatDateLocal(undefined)).toBe('');
    // Sin tres partes separadas por guion, devuelve el texto tal cual
    // (comportamiento original, conservado al unificar las 4 copias).
    expect(formatDateLocal('no es fecha')).toBe('no es fecha');
  });
});
