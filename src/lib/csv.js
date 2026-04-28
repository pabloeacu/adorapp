// Tiny CSV helpers + diacritic folder. Self-contained so we don't drag in a
// CSV library for a "click to download" feature, and so fuzzy search can
// reuse the folder.

/**
 * Normalize a string for diacritic-insensitive comparison.
 * "Océanos" → "oceanos". Used for fuzzy search and export sorting.
 */
export function foldText(s) {
  if (s == null) return '';
  return String(s).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Escape a CSV field. Quotes if needed and defuses leading =, +, -, @ to
 * prevent CSV-injection when opened in Excel/Sheets.
 */
function escapeField(v) {
  if (v == null) return '';
  let s = typeof v === 'string' ? v : Array.isArray(v) ? v.join('; ') : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Convert an array of objects to a CSV string with explicit column spec.
 *
 *   const csv = toCSV(members, [
 *     { header: 'Nombre', get: (m) => m.name },
 *     { header: 'Email', get: (m) => m.email },
 *     { header: 'Instrumentos', get: (m) => m.instruments },
 *   ]);
 */
export function toCSV(rows, columns) {
  const head = columns.map((c) => escapeField(c.header)).join(',');
  const body = rows
    .map((r) => columns.map((c) => escapeField(c.get(r))).join(','))
    .join('\n');
  // UTF-8 BOM so Excel opens accented characters correctly without manual import.
  return '﻿' + head + '\n' + body + '\n';
}

/**
 * Trigger a browser download of a CSV string with the given filename.
 */
export function downloadCSV(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
