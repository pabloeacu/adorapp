// Copy de error CONSCIENTE de la conexión. Cuando un guardado o borrado falla porque
// el teléfono está sin internet, se lo decimos claro ("estás sin conexión, no se
// guardó nada") en vez del genérico "avisale al pastor". 100% cliente: SOLO cambia el
// TEXTO de la ruta de error — nunca el control de flujo ni el camino feliz.
//
// La señal fuerte es navigator.onLine === false; además reconocemos los mensajes
// típicos de un fetch caído por si onLine miente en "true" (conectado a una red sin
// salida a internet). Ver landmine #67 (isOffline de chunkRecovery usa el mismo criterio).

export const OFFLINE_SAVE_MESSAGE =
  'Parece que estás sin conexión. Revisá tu internet y volvé a intentar — no se guardó nada.';

const NETWORK_RE = /failed to fetch|networkerror|network request failed|load failed|net::|err_internet|err_network|fetch failed/i;

// ¿El error parece de conexión? (acepta string, Error, o nada)
export const looksOffline = (err) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = !err ? '' : (typeof err === 'string' ? err : (err.message || ''));
  return NETWORK_RE.test(msg);
};

// Mensaje final para un modal de error de guardado/borrado.
//  - si parece SIN CONEXIÓN → el aviso de conexión (prioridad);
//  - si no, se respeta el detalle que ya venía (error del store/EF), si es un string útil;
//  - si no hay detalle, el fallback de siempre.
// Equivale a `detail || fallback` cuando hay internet, y sólo mejora el caso offline.
export const saveErrorMessage = (
  detail,
  fallback = 'Intentá de nuevo. Si el problema sigue, avisale al pastor.',
) => {
  if (looksOffline(detail)) return OFFLINE_SAVE_MESSAGE;
  if (typeof detail === 'string' && detail.trim()) return detail;
  return fallback;
};
