// Invitados — miembro TEMPORAL sin credenciales (sin login) que vence por fecha.
//
// Modelo: `members.guest_until` (date) es la ÚNICA marca:
//   - NULL                → no es invitado (miembro normal).
//   - fecha >= hoy (ART)  → invitado VIGENTE (aparece en los combos).
//   - fecha <  hoy (ART)  → invitado VENCIDO (desaparece de los combos; la ficha
//                           NO se borra → los órdenes históricos conservan su
//                           nombre y su tonalidad).
//
// El nombre del invitado se GUARDA con el sufijo " -invitado-" en members.name
// (p. ej. "Marcos Witt -invitado-") → se ve así en TODA superficie sin lógica por
// pantalla (combos, detalle del orden, PDF, correos). El badge con la fecha vive
// solo en /miembros. Decisión de Paul (2026-11-03).
//
// Puro: sin React, sin store, sin Date en el cuerpo de los predicados (reciben
// `todayStr`). `todayARTDateString()` SÍ usa el reloj → llamarla FUERA del render
// (hook useToday con init perezoso, o dentro de un getter del store), nunca en el
// cuerpo de un componente (regla react-hooks/purity, landmine #91).

export const GUEST_SUFFIX = ' -invitado-';

// Regex del sufijo al final del nombre (tolerante a espacios y a mayúsc/minúsc).
const SUFFIX_RE = /\s*-\s*invitado\s*-\s*$/i;

// ¿La ficha es un invitado? (tiene guest_until no nulo).
export const isGuest = (m) => !!(m && m.guestUntil);

export const guestUntilOf = (m) => (m && m.guestUntil) || null;

// Invitado cuyo plazo YA venció (hoy ART ya pasó su guest_until, que es inclusivo).
// Comparación de strings ISO 'YYYY-MM-DD' (orden lexicográfico == cronológico).
export const isGuestExpired = (m, todayStr) =>
  isGuest(m) && !!todayStr && String(m.guestUntil) < String(todayStr);

// Invitado VIGENTE (es invitado y todavía no venció).
export const isGuestActive = (m, todayStr) => isGuest(m) && !isGuestExpired(m, todayStr);

// ¿El miembro se puede ELEGIR hoy en un combo? Activo en la ficha Y, si es
// invitado, todavía vigente. Fuente ÚNICA para filtrar todos los selectores
// (directores, formación, "miembros activos", candidatos de banda, etc.).
export const isMemberSelectable = (m, todayStr) =>
  (m?.active !== false) && !isGuestExpired(m, todayStr);

// Quita el sufijo " -invitado-" del final de un nombre (para editar el nombre limpio).
export const stripGuestSuffix = (name) => (name ?? '').toString().replace(SUFFIX_RE, '').trim();

// Agrega el sufijo " -invitado-" una sola vez (idempotente: no lo duplica).
export const withGuestSuffix = (name) => `${stripGuestSuffix(name)}${GUEST_SUFFIX}`;

// 'YYYY-MM-DD' → 'DD/MM' SIN new Date('YYYY-MM-DD') (que se interpreta en UTC y en
// ART muestra el día anterior — landmine #50). Parseo por string.
export const formatGuestUntil = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const [, m, d] = dateStr.split('-');
  if (!m || !d) return dateStr;
  return `${d}/${m}`;
};

// Badge para /miembros: { label, expired } o null si no es invitado.
export const guestBadge = (m, todayStr) => {
  if (!isGuest(m)) return null;
  if (isGuestExpired(m, todayStr)) return { label: 'Invitado vencido', expired: true };
  return { label: `Invitado · hasta ${formatGuestUntil(m.guestUntil)}`, expired: false };
};

// Hoy en ART como 'YYYY-MM-DD' (en-CA da ese formato). USA EL RELOJ: llamar fuera
// del render (useToday / getters del store), nunca en el cuerpo de un componente.
export const todayARTDateString = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

// Días (enteros, >=1) desde hoy ART hasta guest_until (inclusive), para la ventana
// del integrante temporal de banda (CHECK 1–90 días). Devuelve null si ya venció.
export const guestDaysUntil = (guestUntil, todayStr) => {
  if (!guestUntil || !todayStr) return null;
  const toUTC = (s) => { const [y, mo, d] = String(s).split('-').map(Number); return Date.UTC(y, mo - 1, d); };
  const a = toUTC(todayStr);
  const b = toUTC(guestUntil);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const days = Math.round((b - a) / 86400000);
  return days >= 1 ? days : null;
};
