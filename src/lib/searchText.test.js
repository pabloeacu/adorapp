import { describe, it, expect } from 'vitest';
import { matchesSearch, commandFilter, foldText } from './searchText';

describe('búsqueda indistinta a tildes y mayúsculas', () => {
  it('con o sin tilde, en la consulta o en el dato, matchea igual', () => {
    expect(matchesSearch('santillan', 'Yessica Santillán')).toBe(true);
    expect(matchesSearch('Santillán', 'Yessica Santillan')).toBe(true);
    expect(matchesSearch('PÉREZ', 'Raúl Pérez')).toBe(true);
    expect(matchesSearch('damian', 'Damián Nicolás Ovlasiuk')).toBe(true);
    expect(matchesSearch('oceanos', 'Océanos')).toBe(true);
    expect(matchesSearch('ñoño', 'Nono')).toBe(true);
  });
  it('busca en varios campos y en arrays (instrumentos)', () => {
    expect(matchesSearch('bateria', 'Luca', ['Batería', 'Bajo'])).toBe(true);
    expect(matchesSearch('guitarra electrica', 'Andrés', ['Guitarra Eléctrica'])).toBe(true);
    expect(matchesSearch('piano', 'Luca', ['Batería'])).toBe(false);
    expect(matchesSearch('xyz', 'Luca', null, undefined, ['Bajo'])).toBe(false);
  });
  it('consulta vacía o solo espacios no filtra', () => {
    expect(matchesSearch('', 'lo que sea')).toBe(true);
    expect(matchesSearch('   ', 'lo que sea')).toBe(true);
    expect(matchesSearch(null, 'x')).toBe(true);
  });
  it('commandFilter para la paleta: 1/0, con keywords', () => {
    expect(commandFilter('cancion Océanos Hillsong', 'oceanos')).toBe(1);
    expect(commandFilter('miembro Raúl Pérez', 'perez')).toBe(1);
    expect(commandFilter('miembro Raúl Pérez', 'gomez')).toBe(0);
    expect(commandFilter('pagina Órdenes', 'ordenes', ['ordenes'])).toBe(1);
    expect(foldText('Comunión')).toBe('comunion');
  });
});
