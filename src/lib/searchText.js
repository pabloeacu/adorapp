// Búsqueda de texto INDISTINTA a tildes y mayúsculas — fuente única para TODOS los
// buscadores de la app (Miembros, Solicitudes, Órdenes, Bandas, formación, ministración,
// paleta de comandos, Repertorio). Regla de Paul (2026-09-13): "el buscador tiene que ser
// indistinto al tilde para extender al máximo su alcance y eficacia". `foldText` (csv.ts)
// ya hacía el plegado (NFD + quitar diacríticos + minúsculas); acá se centraliza el uso.

import { foldText } from './csv';

export { foldText };

// ¿Alguno de los campos contiene la consulta? Consulta vacía → true (no filtra).
export const matchesSearch = (query, ...fields) => {
  const q = foldText(query).trim();
  if (!q) return true;
  return fields.some((f) => {
    if (Array.isArray(f)) return f.some((x) => foldText(x).includes(q));
    return foldText(f).includes(q);
  });
};

// Filtro para cmdk (<Command filter={commandFilter}>): 1 si matchea, 0 si no.
// cmdk por defecto es sensible a tildes ("Océanos" no aparece con "oceanos").
export const commandFilter = (value, search, keywords) => {
  const hay = [value, ...(keywords || [])];
  return matchesSearch(search, ...hay) ? 1 : 0;
};
