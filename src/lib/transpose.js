// Motor de transposición de acordes (extraído de appStore.js sin cambios de
// comportamiento). Puro, sin dependencias. Lo usan el viewer de canciones, el PDF
// del Repertorio y el "Imprimir" de Órdenes; una regresión acá produce cifrados
// mal transportados en silencio (cubierto por transpose.test.js).

// Musical key transposition table
const semitoneSteps = {
  'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
  'Am': 0, 'A#m': 1, 'Bm': 2, 'Cm': 3, 'C#m': 4, 'Dm': 5, 'D#m': 6, 'Em': 7, 'Fm': 8, 'F#m': 9, 'Gm': 10, 'G#m': 11
};

const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Map for flat notes to their sharp equivalents
const flatToSharp = {
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
};

// Get the semitone index for a note (handles both sharp and flat)
const getSemitoneIndex = (note) => {
  if (semitoneSteps[note] !== undefined) return semitoneSteps[note];
  if (flatToSharp[note]) return semitoneSteps[flatToSharp[note]];
  const idx = notes.indexOf(note);
  return idx >= 0 ? idx : null;
};

// Get note name from semitone index
const getNoteFromIndex = (index) => notes[(index + 12) % 12];

// Transpose a single chord token (handles slash chords, suffixes, accidentals)
const transposeChordToken = (token, semitones) => {
  if (!token || token.trim() === '') return token;

  // Handle slash chords
  let mainPart = token;
  let bassPart = null;

  if (token.includes('/')) {
    const parts = token.split('/');
    mainPart = parts[0];
    bassPart = parts[1];
  }

  // Parse main chord: root + accidental + suffix
  // Pattern: [A-G] (case-insensitive; lowercase roots like 'c9' are typos but
  // must still transpose) + optional [#b] + optional suffix
  const match = mainPart.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) return token;

  const rootNote = match[1].toUpperCase();
  const accidental = match[2];
  const suffix = match[3];

  // Get root with accidental for lookup
  const rootWithAcc = accidental ? `${rootNote}${accidental}` : rootNote;

  // Get semitone index and transpose
  const rootIndex = getSemitoneIndex(rootWithAcc);
  if (rootIndex === null) return token;

  const newRootIndex = (rootIndex + semitones + 12) % 12;
  const newRoot = getNoteFromIndex(newRootIndex);

  // Handle bass note if present
  let newBassNote = null;
  if (bassPart) {
    const bassMatch = bassPart.match(/^([A-Ga-g])([#b]?)(.*)$/);
    if (bassMatch) {
      const bassRoot = bassMatch[1].toUpperCase();
      const bassAcc = bassMatch[2];
      const bassRootWithAcc = bassAcc ? `${bassRoot}${bassAcc}` : bassRoot;
      const bassIndex = getSemitoneIndex(bassRootWithAcc);
      if (bassIndex !== null) {
        const newBassIndex = (bassIndex + semitones + 12) % 12;
        newBassNote = getNoteFromIndex(newBassIndex);
      }
    }
  }

  // Reconstruct chord
  if (newBassNote) {
    return `${newRoot}${suffix}/${newBassNote}`;
  }
  return `${newRoot}${suffix}`;
};

// Transpose a string of chords separated by spaces
const transposeChordString = (chordString, semitones) => {
  if (!chordString || chordString.trim() === '') return chordString;

  // Split by spaces to get individual chords
  const chords = chordString.trim().split(/\s+/);

  // Transpose each chord token individually
  const transposedChords = chords.map(chord => transposeChordToken(chord, semitones));

  // Rejoin with spaces
  return transposedChords.join(' ');
};

export const transposeSongStructure = (structure, fromKey, toKey) => {
  const fromSemitones = semitoneSteps[fromKey] || 0;
  const toSemitones = semitoneSteps[toKey] || 0;
  const semitones = toSemitones - fromSemitones;

  return structure.map(section => ({
    ...section,
    chords: transposeChordString(section.chords, semitones)
  }));
};
