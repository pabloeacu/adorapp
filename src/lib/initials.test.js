import { describe, it, expect } from 'vitest';
import { getInitials } from './initials';

describe('getInitials', () => {
  it('el doble espacio ya NO produce "YUNDEFINED" (bug reportado)', () => {
    // "Yessica  Santillán" con doble espacio: antes split(' ') daba
    // ['Yessica','','Santillán'] y parts[1][0] era undefined → "YUNDEFINED".
    expect(getInitials('Yessica  Santillán')).toBe('YS');
  });

  it('nombre normal de dos palabras → iniciales de ambas', () => {
    expect(getInitials('Yessica Santillán')).toBe('YS');
    expect(getInitials('Ana Colina')).toBe('AC');
  });

  it('espacios al inicio/fin no ensucian las iniciales', () => {
    expect(getInitials('  Yessica Santillán  ')).toBe('YS');
  });

  it('tres o más palabras → primeras dos', () => {
    expect(getInitials('Juan Carlos Pérez')).toBe('JC');
  });

  it('un solo nombre → sus dos primeras letras', () => {
    expect(getInitials('Leandro')).toBe('LE');
  });

  it('cualquier tipo de whitespace (tab/salto) se colapsa', () => {
    expect(getInitials('Ana\tColina')).toBe('AC');
    expect(getInitials('Ana\nColina')).toBe('AC');
  });

  it('vacío, solo espacios, null o undefined → "?"', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials('   ')).toBe('?');
    expect(getInitials(null)).toBe('?');
    expect(getInitials(undefined)).toBe('?');
  });

  it('nunca devuelve un resultado que contenga "UNDEFINED"', () => {
    for (const n of ['Yessica  Santillán', ' A  B ', 'X', '', '   ', 'Uno Dos Tres']) {
      expect(getInitials(n)).not.toMatch(/UNDEFINED/);
    }
  });

  it('ignora el sufijo " -invitado-" (los invitados lo guardan en el nombre)', () => {
    // Antes del fix, un invitado de UN solo nombre daba "M-" (el guión del sufijo
    // como 2ª inicial). Ahora el sufijo se quita antes de calcular.
    expect(getInitials('Marcos -invitado-')).toBe('MA');
    expect(getInitials('Ana -invitado-')).toBe('AN');
    expect(getInitials('Marcos Witt -invitado-')).toBe('MW');
    expect(getInitials('Ana María -invitado-')).toBe('AM');
    // nunca toma el guión del sufijo como inicial
    for (const n of ['Madonna -invitado-', 'Juan -invitado-', 'Lucía -invitado-']) {
      expect(getInitials(n)).not.toContain('-');
    }
  });
});
