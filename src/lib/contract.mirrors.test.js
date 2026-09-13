import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { INSTRUMENT_ORDER } from './lineup.js';
import { SINGER_INSTRUMENTS } from './ensayometro.js';
import { EMAIL_AREAS, FORMATION_AREAS, PRESENTER_AREAS } from './areas.js';

// ─────────────────────────────────────────────────────────────────────────────
// RED DE CONTENCIÓN DE LOS ESPEJOS MANUALES JS↔SQL (landmines #27 / #58 / #75).
//
// Varias reglas de negocio del cliente están duplicadas A MANO en una función SQL:
// si un lado cambia sin el otro, HOY nada falla — ni build, ni runtime — y la app y
// la base empiezan a discrepar en silencio (ya pasó una vez con FORMATION_AREAS, #120).
//
// Este test extrae el literal ARRAY[...] de la ÚLTIMA definición de cada función en
// supabase/migrations/*.sql y afirma que coincide con la constante JS. Cualquier
// deriva futura se vuelve un CI ROJO en vez de un bug de producción.
//
// NO toca la base ni el runtime: solo lee los archivos .sql del repositorio, así que
// es 100% seguro y determinístico. Si cambiás una constante JS o su función SQL,
// cambialas JUNTAS (mismo commit) — este test es el que lo garantiza.
// ─────────────────────────────────────────────────────────────────────────────

const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations');

function migrationsSorted() {
  return readdirSync(MIG_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort() // orden de nombre = orden de aplicación → la última definición gana
    .map((f) => readFileSync(join(MIG_DIR, f), 'utf8'));
}

// Devuelve el primer literal ARRAY[...] que aparece en la ÚLTIMA `CREATE [OR REPLACE]
// FUNCTION <fn>` de todas las migraciones, como array de strings ya limpio.
function sqlArrayLiteral(fn) {
  let literal = null;
  const nameRe = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\.)?${fn}\\b`, 'g');
  for (const sql of migrationsSorted()) {
    let m;
    while ((m = nameRe.exec(sql)) !== null) {
      const arr = sql.slice(m.index).match(/ARRAY\s*\[([^\]]*)\]/); // hasta el primer ']'
      if (arr) literal = arr[1];
    }
    nameRe.lastIndex = 0;
  }
  if (literal == null) {
    throw new Error(`No se encontró una definición con literal ARRAY para "${fn}" en ${MIG_DIR}`);
  }
  return literal
    .split(',')
    .map((s) => s.trim().replace(/^'/, '').replace(/'$/, ''));
}

describe('contrato de espejos JS↔SQL (constantes de negocio duplicadas)', () => {
  it('INSTRUMENT_ORDER (lineup.js) coincide con _instrument_rank (SQL)', () => {
    expect(INSTRUMENT_ORDER).toEqual(sqlArrayLiteral('_instrument_rank'));
  });

  it('SINGER_INSTRUMENTS (ensayometro.js) coincide con _singer_only (SQL)', () => {
    expect(SINGER_INSTRUMENTS).toEqual(sqlArrayLiteral('_singer_only'));
  });

  it('EMAIL_AREAS (areas.js) coincide con _area_email_slugs (SQL)', () => {
    expect(EMAIL_AREAS).toEqual(sqlArrayLiteral('_area_email_slugs'));
  });

  it('FORMATION_AREAS (areas.js) coincide con _area_formation_slugs (SQL, última def)', () => {
    // El caso que YA derivó en prod (#120): esta es la garantía de que no vuelva a pasar.
    expect(FORMATION_AREAS).toEqual(sqlArrayLiteral('_area_formation_slugs'));
  });

  it('PRESENTER_AREAS (areas.js) coincide con _area_presenter_slugs (SQL)', () => {
    expect(PRESENTER_AREAS).toEqual(sqlArrayLiteral('_area_presenter_slugs'));
  });
});
