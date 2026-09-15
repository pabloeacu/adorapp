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

/** Limpia enganches inválidos: la canción en índice 0 nunca puede ser enganchada. Pura. */
export function normalizeEnganchadas(songs) {
  const arr = Array.isArray(songs) ? songs : [];
  if (arr.length === 0) return arr;
  if (arr[0] && arr[0].enganchada === true) return unlinkEnganchada(arr, 0);
  return arr;
}
