import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { passwordProblem, isPasswordValid, PASSWORD_RULES, PASSWORD_MIN, PASSWORD_MAX, passwordMessage } from './passwordPolicy';

describe('política de contraseña (recuperación)', () => {
  it('acepta una contraseña con 8+ caracteres, letra y número', () => {
    expect(passwordProblem('adoracion2026')).toBeNull();
    expect(isPasswordValid('Rey Jesus 7')).toBe(true);
    expect(isPasswordValid('ñandú1234')).toBe(true);
  });
  it('rechaza corta / sin letra / sin número / larga / solo espacios', () => {
    expect(passwordProblem('abc1234')).toBe('corta');
    expect(passwordProblem('12345678')).toBe('sin_letra');
    expect(passwordProblem('abcdefgh')).toBe('sin_numero');
    expect(passwordProblem('a1'.repeat(40))).toBe('larga');
    expect(passwordProblem('        ')).toBe('sin_letra');
    expect(passwordProblem(null)).toBe('corta');
    expect(passwordProblem(12345678)).toBe('corta');
  });
  it('la checklist de la pantalla refleja las mismas reglas', () => {
    const ok = PASSWORD_RULES.map((r) => r.test('adoracion2026'));
    expect(ok.every(Boolean)).toBe(true);
    const bad = PASSWORD_RULES.map((r) => r.test('abc'));
    expect(bad).toEqual([false, true, false]);
  });
  it('tiene mensaje para cada código', () => {
    for (const code of ['corta', 'larga', 'sin_letra', 'sin_numero', 'distinta']) {
      expect(passwordMessage(code)).toMatch(/contraseña/i);
    }
    expect(passwordMessage('otro')).toMatch(/segura/);
  });

  // Espejo JS ↔ Edge Function (la frontera real es la EF): mismos límites.
  it('coincide con PASSWORD_RULES de la EF auth-password-reset', () => {
    const ef = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/functions/auth-password-reset/index.ts'), 'utf8');
    const m = ef.match(/const PASSWORD_RULES = \{ min: (\d+), max: (\d+) \}/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBe(PASSWORD_MIN);
    expect(Number(m[2])).toBe(PASSWORD_MAX);
    expect(ef).toMatch(/\/\[A-Za-zÁÉÍÓÚÑáéíóúñ\]\//);
    expect(ef).toMatch(/\/\\d\//);
  });
});
