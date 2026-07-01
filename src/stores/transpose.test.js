import { describe, it, expect, vi } from 'vitest';

// appStore imports supabase at module load; stub it so the import graph
// resolves under jsdom (same pattern as appStore.realtime.test.js).
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
}));

import { transposeSongStructure } from './appStore';

// Locks in the chord-transposition engine used by the song viewer, the
// Repertorio PDF export and the Órdenes "Imprimir" PDF. Regressions here
// silently produce wrong chord charts, so keep this green.

const struct = (chords) => [{ type: 'verse', label: 'V', chords, content: '' }];
const chordsOf = (s) => s[0].chords;

describe('transposeSongStructure', () => {
  it('transposes major/minor roots up 2 semitones (Dm -> Em)', () => {
    expect(chordsOf(transposeSongStructure(struct('Dm F C Bb'), 'Dm', 'Em'))).toBe('Em G D C');
  });

  it('transposes lowercase chord roots (typos like "c9")', () => {
    // Regression guard: the root regex used to require uppercase [A-G], so a
    // lowercase "c9" stayed untransposed and broke transposed exports.
    expect(chordsOf(transposeSongStructure(struct('Fmaj7 c9 Bbmaj7'), 'Dm', 'Em'))).toBe('Gmaj7 D9 Cmaj7');
  });

  it('handles slash chords (bass note transposed too)', () => {
    expect(chordsOf(transposeSongStructure(struct('D/F#'), 'C', 'D'))).toBe('E/G#');
  });

  it('resolves flats via their sharp equivalent (Bb -> C going up 2)', () => {
    expect(chordsOf(transposeSongStructure(struct('Bbmaj7'), 'Dm', 'Em'))).toBe('Cmaj7');
  });

  it('leaves non-chord tokens untouched', () => {
    expect(chordsOf(transposeSongStructure(struct('N.C. Dm'), 'Dm', 'Em'))).toBe('N.C. Em');
  });

  it('preserves empty chord strings', () => {
    expect(chordsOf(transposeSongStructure(struct(''), 'Dm', 'Em'))).toBe('');
  });

  it('keeps section metadata (label/content/type) intact', () => {
    const out = transposeSongStructure(
      [{ type: 'chorus', label: 'Coro', chords: 'Dm', content: 'letra' }],
      'Dm',
      'Em'
    );
    expect(out[0]).toMatchObject({ type: 'chorus', label: 'Coro', content: 'letra', chords: 'Em' });
  });
});
