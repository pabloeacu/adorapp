// Numeración de las canciones de un ORDEN, con soporte de "enganchadas".
//
// Una canción "enganchada" (`enganchada: true`) está ligada a la canción de ARRIBA
// (índice anterior): en la lista se ve como un inciso del mismo número, no con un
// número propio. Es una canción más en TODOS sus efectos (director, tono, historial,
// estadísticas, avisos); solo cambia cómo se numera/muestra. La marca vive dentro de
// `orders.songs[]` sin prefijo `_` → sobrevive a `stripSongRefs` (mismo patrón que
// `ministracion`).
//
// Reglas:
//  • La PRIMERA canción (índice 0) NUNCA puede ser enganchada (no hay nada arriba) →
//    si llegara con la marca puesta (p. ej. por un reordenamiento), se ignora.
//  • Un GRUPO = una canción "madre" (no enganchada) + sus enganchadas consecutivas.
//      - grupo de 1  → número "N"        (ej. "1")
//      - grupo de 2+ → "N.a", "N.b", …   (ej. "2.a", "2.b")
//
// Devuelve, por canción: { songRef, index, groupNumber, groupSize, letter,
//   displayNumber, isEnganchada, isFirstOfGroup, hasLinkedBelow }.

/** ¿La canción del índice `i` es enganchada? (defensivo: el índice 0 nunca lo es). */
export function isEnganchadaAt(songs, i) {
  return i > 0 && !!(Array.isArray(songs) && songs[i] && songs[i].enganchada === true);
}

/** Numera un array de canciones de orden con incisos para las enganchadas. */
export function numberOrderSongs(songs) {
  const arr = Array.isArray(songs) ? songs : [];
  const eng = arr.map((_, i) => isEnganchadaAt(arr, i));

  // Índice de grupo por canción (el grupo sube solo en las NO enganchadas).
  const groupOf = [];
  let g = 0;
  arr.forEach((_, i) => {
    if (!eng[i]) g += 1;
    groupOf[i] = g;
  });

  // Tamaño de cada grupo.
  const size = {};
  groupOf.forEach((gi) => { size[gi] = (size[gi] || 0) + 1; });

  // Letra dentro del grupo (solo si el grupo tiene 2+).
  const seen = {};
  return arr.map((songRef, i) => {
    const gi = groupOf[i];
    const idxInGroup = seen[gi] || 0;
    seen[gi] = idxInGroup + 1;
    const multi = size[gi] > 1;
    const letter = multi ? String.fromCharCode(97 + idxInGroup) : '';
    return {
      songRef,
      index: i,
      groupNumber: gi,
      groupSize: size[gi],
      letter,
      displayNumber: multi ? `${gi}.${letter}` : `${gi}`,
      isEnganchada: eng[i],
      isFirstOfGroup: idxInGroup === 0,
      hasLinkedBelow: i + 1 < arr.length && eng[i + 1],
    };
  });
}

/** Inserta `newSongRef` como enganchada JUSTO DEBAJO del índice `afterIndex`. Pura. */
export function addEnganchadaAfter(songs, afterIndex, newSongRef) {
  const arr = Array.isArray(songs) ? [...songs] : [];
  if (afterIndex < 0 || afterIndex >= arr.length) return arr;
  arr.splice(afterIndex + 1, 0, { ...newSongRef, enganchada: true });
  return arr;
}

/** Quita el enganche de la canción `index` (vuelve a tener número propio). Pura. */
export function unlinkEnganchada(songs, index) {
  const arr = Array.isArray(songs) ? songs : [];
  return arr.map((s, i) => {
    if (i !== index || !s || typeof s !== 'object') return s;
    const { enganchada, ...rest } = s; // eslint-disable-line no-unused-vars
    return rest;
  });
}

/**
 * Límites del GRUPO que contiene al índice `index`: [inicioMadre, finUltimaEnganchada].
 * Devuelve null si el índice está fuera del array. Pura.
 */
export function groupBoundsAt(songs, index) {
  const arr = Array.isArray(songs) ? songs : [];
  if (index < 0 || index >= arr.length) return null;
  let start = index;
  while (start > 0 && isEnganchadaAt(arr, start)) start -= 1;
  let end = start;
  while (end + 1 < arr.length && isEnganchadaAt(arr, end + 1)) end += 1;
  return [start, end];
}

/**
 * Reordena arrastrando POR GRUPO (2ª etapa de las enganchadas). Pura.
 *
 * Reglas (las que se ven al arrastrar en el editor de órdenes):
 *  • Arrastrar una canción MADRE mueve TODO su grupo (ella + sus enganchadas)
 *    como una sola pieza — antes se movía sola y sus enganchadas se quedaban
 *    colgando de la canción que quedara arriba.
 *  • Un grupo sólo aterriza ENTRE grupos, nunca en el medio de otro: si se
 *    suelta sobre una canción de otro grupo, cae antes (si viene subiendo) o
 *    después (si viene bajando) de ESE grupo completo. Así mover una canción
 *    nunca parte el grupo de otra.
 *  • Arrastrar una ENGANCHADA sola sí es libre: va a donde se la suelte y queda
 *    enganchada a la canción que le toque arriba (el modelo es posicional).
 *    Es la forma de pasarla de un grupo a otro.
 *  • Si una enganchada termina arriba de todo, pierde el enganche
 *    (`normalizeEnganchadas`): no puede haber un inciso sin canción madre.
 *
 * Los objetos se mueven POR REFERENCIA: cada canción conserva su `_localId`
 * (landmine #91: las escrituras async del tono matchean por `_localId`).
 */
export function moveOrderSongs(songs, fromIndex, toIndex) {
  const arr = Array.isArray(songs) ? [...songs] : [];
  if (fromIndex < 0 || fromIndex >= arr.length) return arr;
  if (toIndex < 0 || toIndex >= arr.length) return arr;
  if (fromIndex === toIndex) return arr;

  const dragEnganchada = isEnganchadaAt(arr, fromIndex);
  const [bStart, bEnd] = dragEnganchada ? [fromIndex, fromIndex] : groupBoundsAt(arr, fromIndex);

  // Soltar dentro del propio bloque no mueve nada.
  if (toIndex >= bStart && toIndex <= bEnd) return arr;

  const block = arr.slice(bStart, bEnd + 1);

  let insertAt;
  if (dragEnganchada) {
    insertAt = toIndex; // libre: se engancha a la que le quede arriba
  } else {
    const [gStart, gEnd] = groupBoundsAt(arr, toIndex);
    insertAt = bStart < toIndex ? gEnd + 1 : gStart; // bajando → después del grupo; subiendo → antes
  }

  const rest = [...arr.slice(0, bStart), ...arr.slice(bEnd + 1)];
  // Una enganchada sola se comporta igual que el reordenamiento común de dnd-kit
  // (`arrayMove`): el índice de destino se aplica sobre la lista YA sin ella.
  // Para un bloque, en cambio, el destino se calculó sobre la lista ORIGINAL, así
  // que hay que descontar lo que se corrió al sacar el bloque.
  const at = dragEnganchada
    ? insertAt
    : (insertAt > bEnd ? insertAt - block.length : insertAt);
  rest.splice(at, 0, ...block);
  return normalizeEnganchadas(rest);
}

/** Limpia enganches inválidos: la canción en índice 0 nunca puede ser enganchada. Pura. */
export function normalizeEnganchadas(songs) {
  const arr = Array.isArray(songs) ? songs : [];
  if (arr.length === 0) return arr;
  if (arr[0] && arr[0].enganchada === true) return unlinkEnganchada(arr, 0);
  return arr;
}
