import { describe, it, expect } from 'vitest';
import { foldText, toCSV } from './csv';

describe('foldText', () => {
  it('lowercases and strips diacritics', () => {
    expect(foldText('Océanos')).toBe('oceanos');
    expect(foldText('Comunión')).toBe('comunion');
    expect(foldText('Ñoño')).toBe('nono');
  });

  it('returns empty string for null/undefined', () => {
    expect(foldText(null)).toBe('');
    expect(foldText(undefined)).toBe('');
  });

  it('coerces non-strings', () => {
    expect(foldText(42)).toBe('42');
  });
});

describe('toCSV', () => {
  const cols = [
    { header: 'Nombre', get: (r) => r.name },
    { header: 'Email', get: (r) => r.email },
    { header: 'Instrumentos', get: (r) => r.instruments },
  ];

  it('emits a UTF-8 BOM and the header row', () => {
    const out = toCSV([], cols);
    expect(out.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(out).toContain('Nombre,Email,Instrumentos');
  });

  it('joins arrays with semicolons', () => {
    const out = toCSV([{ name: 'A', email: 'a@b.com', instruments: ['Voz', 'Guitarra'] }], cols);
    expect(out).toContain('Voz; Guitarra');
  });

  it('quotes fields containing commas, quotes, or newlines', () => {
    const out = toCSV([{ name: 'Doe, John', email: 'a"b@c.com', instruments: ['x\ny'] }], cols);
    expect(out).toContain('"Doe, John"');
    expect(out).toContain('"a""b@c.com"');
    expect(out).toContain('"x\ny"');
  });

  it('defuses CSV injection by prefixing dangerous leading chars', () => {
    const out = toCSV([{ name: '=SUM(A1)', email: '+phone', instruments: '@cmd' }], cols);
    expect(out).toContain("'=SUM(A1)");
    expect(out).toContain("'+phone");
    expect(out).toContain("'@cmd");
  });

  it('renders null fields as empty', () => {
    const out = toCSV([{ name: 'A', email: null, instruments: null }], cols);
    expect(out).toMatch(/A,,\s*\n?$/);
  });
});
