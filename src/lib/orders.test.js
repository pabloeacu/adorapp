import { describe, it, expect } from 'vitest';
import { dayKey, suggestDirectorForSong } from './orders';

describe('dayKey', () => {
  it('passes YYYY-MM-DD strings through unchanged', () => {
    expect(dayKey('2026-04-27')).toBe('2026-04-27');
    expect(dayKey('2026-04-27T20:00:00Z')).toBe('2026-04-27');
  });

  it('formats Date objects in local time', () => {
    const d = new Date(2026, 3, 27); // April 27, 2026 local
    expect(dayKey(d)).toBe('2026-04-27');
  });

  it('returns empty string for null/undefined/invalid', () => {
    expect(dayKey(null)).toBe('');
    expect(dayKey(undefined)).toBe('');
    expect(dayKey('not-a-date')).toBe('');
  });
});

describe('suggestDirectorForSong', () => {
  const singerIds = new Set(['andres', 'ana', 'paul']);

  const orders = [
    { bandId: 'banda-a', songs: [{ songId: 's1', directorId: 'andres' }] },
    { bandId: 'banda-a', songs: [{ songId: 's1', directorId: 'andres' }] },
    { bandId: 'banda-a', songs: [{ songId: 's1', directorId: 'ana' }] },
    { bandId: 'banda-b', songs: [{ songId: 's1', directorId: 'paul' }] },
    { bandId: 'banda-b', songs: [{ songId: 's1', directorId: 'paul' }] },
  ];

  it('prefers the most-frequent director within the chosen band', () => {
    const id = suggestDirectorForSong({ singerIds, orders, songId: 's1', bandId: 'banda-a' });
    expect(id).toBe('andres');
  });

  it('falls back to global most-frequent when bandId is null', () => {
    const id = suggestDirectorForSong({ singerIds, orders, songId: 's1', bandId: null });
    // Globally: andres 2, paul 2, ana 1 — first by tied count (insertion order) wins
    expect(['andres', 'paul']).toContain(id);
  });

  it('falls back to global if the band has no history for this song', () => {
    const id = suggestDirectorForSong({ singerIds, orders, songId: 's1', bandId: 'banda-c' });
    expect(['andres', 'paul']).toContain(id);
  });

  it('returns null when the song has never been led', () => {
    const id = suggestDirectorForSong({ singerIds, orders, songId: 's-unknown', bandId: 'banda-a' });
    expect(id).toBeNull();
  });

  it('skips directors who are not in the active-singer set', () => {
    const limited = new Set(['ana']); // andres no longer counts as a candidate
    const id = suggestDirectorForSong({ singerIds: limited, orders, songId: 's1', bandId: 'banda-a' });
    expect(id).toBe('ana');
  });

  it('returns null with an empty singer set', () => {
    const id = suggestDirectorForSong({ singerIds: new Set(), orders, songId: 's1', bandId: 'banda-a' });
    expect(id).toBeNull();
  });

  it('handles orders without a songs array safely', () => {
    const ordersMessy = [{ bandId: 'banda-a' }, { bandId: 'banda-a', songs: null }];
    const id = suggestDirectorForSong({ singerIds, orders: ordersMessy, songId: 's1', bandId: 'banda-a' });
    expect(id).toBeNull();
  });
});
