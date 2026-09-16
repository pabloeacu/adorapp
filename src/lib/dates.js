// Fechas guardadas como `YYYY-MM-DD` (cumpleaños, fecha de una solicitud) se
// muestran TAL CUAL, sin corrimiento de zona horaria.
//
// `new Date('2026-09-11')` se interpreta en UTC y en Argentina (−3) muestra el
// día ANTERIOR — el bug que reportó Paul en las fechas de los órdenes (landmine
// #50). Por eso se parsea a mano y se arma un Date LOCAL.
//
// Esta función estaba copiada en cuatro archivos (Header, MobileNav, Miembros y
// Solicitudes), con la única diferencia del mes largo ("11 de septiembre") o
// corto ("11 sept"). Ahora es una sola, con esa variante como opción.
const build = (dateStr) => {
  if (!dateStr) return null;
  // Acepta tanto YYYY-MM-DD como ISO completo.
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
};

export const formatDateLocal = (dateStr, monthStyle = 'long') => {
  if (!dateStr) return '';
  const date = build(dateStr);
  if (!date) return dateStr;
  return date.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: monthStyle,
    day: 'numeric',
  });
};

// Variante con mes abreviado (tablas y listados).
export const formatDateLocalShort = (dateStr) => formatDateLocal(dateStr, 'short');
