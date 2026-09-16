// Red de pruebas del CAMINO DE GUARDADO del store — las dos piezas cuya falla
// saldría más cara y que hasta ahora sólo se probaban a mano/en vivo:
//
//   (A) Anti pérdida de datos (regla #8 / landmine #8): updateSong/updateOrder
//       MERGEAN el snapshot del store antes del converter, así una actualización
//       PARCIAL (p. ej. `updateSong(id,{lastUsed})` que dispara addOrder) NO
//       regenera la fila con defaults y borra letra/acordes/tono/estructura.
//       Este es EXACTAMENTE el incidente de junio-2026 (PR #20).
//
//   (B) Guardas de concurrencia optimista (landmine #85): el UPDATE aplica
//       compare-and-set sobre `content_changed_at` con el sello que el editor
//       tenía AL ABRIR (no el del store, que Realtime refresca). Un choque de
//       CONTENIDO avisa y NO pisa; una acción de fondo (lastUsed/status) se
//       re-aplica sobre lo fresco.
//
// Mock de supabase con el mismo patrón que appStore.lineup.test.js, extendido
// para registrar el filtro `content_changed_at` (eq vs is) y para encolar
// resultados por llamada (simular PGRST116 = 0 filas = choque).

import { describe, it, expect, beforeEach, vi } from 'vitest';

const db = {
  updateResults: [], // cola de { data, error } para update()...select().single()
  fetchResults: [],  // cola de { data, error } para select('*').eq().single() (refetch)
  updates: [],       // [{ table, payload }] registrado por cada update()
  filters: [],       // [{ table, kind:'eq'|'is', val }] SOLO para content_changed_at
  reset() { this.updateResults = []; this.fetchResults = []; this.updates = []; this.filters = []; },
};

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table) => ({
      update: (payload) => {
        db.updates.push({ table, payload });
        let rowId;
        const chain = {
          eq: (col, val) => {
            if (col === 'id') rowId = val;
            else if (col === 'content_changed_at') db.filters.push({ table, kind: 'eq', val });
            return chain;
          },
          is: (col, val) => {
            if (col === 'content_changed_at') db.filters.push({ table, kind: 'is', val });
            return chain;
          },
          select: () => ({
            single: () => Promise.resolve(
              db.updateResults.length ? db.updateResults.shift() : { data: { id: rowId, ...payload }, error: null }
            ),
          }),
        };
        return chain;
      },
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve(
            db.fetchResults.length ? db.fetchResults.shift() : { data: null, error: null }
          ),
        }),
      }),
    }),
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  },
  callAdminFunction: async () => ({}),
}));

import { useAppStore } from './appStore';

const SONG = {
  id: 'song1',
  title: 'Océanos',
  artist: 'Hillsong',
  key: 'D',
  originalKey: 'D',
  categories: ['adoracion', 'intimidad'],
  youtubeUrl: 'https://youtu.be/xyz',
  structure: [{ type: 'Verso 1', content: 'letra con acordes' }, { type: 'Coro', content: 'más letra' }],
  compass: '6/8',
  bpm: '72',
  lastUsed: null,
  contentChangedAt: 'STORE-TOKEN',
};

const ORDER = {
  id: 'order1',
  date: '2026-10-04',
  time: '19:00',
  bandId: 'banda-dom',
  meetingType: 'culto_general',
  songs: [{ songId: 'song1', key: 'D', directorId: 'dir1' }, { songId: 'song2', key: 'G' }],
  feedback: null,
  status: 'scheduled',
  lineup: { mode: 'custom', members: [{ memberId: 'm1', instruments: ['Voz'] }] },
  contentChangedAt: 'STORE-TOKEN',
};

const seedSong = (over = {}) => useAppStore.setState({ songs: [{ ...SONG, ...over }] });
const seedOrder = (over = {}) => useAppStore.setState({ orders: [{ ...ORDER, ...over }] });

beforeEach(() => {
  db.reset();
  useAppStore.setState({ songs: [], orders: [], error: null });
});

// ─────────────────────────────────────────────────────────────────────────────
// (A) ANTI PÉRDIDA DE DATOS — el corazón del incidente de junio
// ─────────────────────────────────────────────────────────────────────────────
describe('updateSong — merge antes del converter (anti pérdida de datos)', () => {
  it('updateSong(id,{lastUsed}) NO borra letra/acordes/tono: reenvía la fila COMPLETA mergeada', async () => {
    seedSong();
    // Ésta es la llamada exacta que hace addOrder al sellar last_used.
    await useAppStore.getState().updateSong('song1', { lastUsed: '2026-10-04' });

    expect(db.updates).toHaveLength(1);
    const p = db.updates[0].payload;
    // Todo el contenido sensible sigue presente (NO defaulteado a '', 'C', [], null)
    expect(p.structure).toEqual(SONG.structure);
    expect(p.key).toBe('D');
    expect(p.original_key).toBe('D');
    expect(p.title).toBe('Océanos');
    expect(p.artist).toBe('Hillsong');
    expect(p.categories).toEqual(['adoracion', 'intimidad']);
    expect(p.youtube_url).toBe('https://youtu.be/xyz');
    expect(p.compass).toBe('6/8');
    expect(p.bpm).toBe('72');
    // Y sí aplicó el cambio pedido
    expect(p.last_used).toBe('2026-10-04');
  });

  it('control negativo: un converter SOBRE EL PARCIAL SOLO (sin merge) SÍ borraría el contenido', () => {
    // Documenta por qué el merge importa: convertir {lastUsed} solo defaultea todo.
    // (No es cómo funciona el store — es la trampa que el store evita.)
    const partialOnly = { lastUsed: '2026-10-04' };
    // Simula el anti-patrón (structure/key/title ausentes → el converter los defaultea)
    const naive = {
      title: partialOnly.title || '',
      key: partialOnly.key || 'C',
      structure: partialOnly.structure || [],
    };
    expect(naive.structure).toEqual([]); // <- esto es lo que borró datos en junio
    expect(naive.key).toBe('C');
  });
});

describe('updateOrder — merge antes del converter (anti pérdida de datos)', () => {
  it('updateOrder(id,{feedback}) NO borra canciones/fecha/banda/formación', async () => {
    seedOrder();
    await useAppStore.getState().updateOrder('order1', { feedback: 'Estuvo hermoso' });

    expect(db.updates).toHaveLength(1);
    const p = db.updates[0].payload;
    expect(p.songs).toHaveLength(2);
    expect(p.songs[0].songId).toBe('song1');
    expect(p.date).toBe('2026-10-04');
    expect(p.band_id).toBe('banda-dom');
    expect(p.meeting_type).toBe('culto_general');
    expect(p.lineup).toEqual(ORDER.lineup);
    expect(p.feedback).toBe('Estuvo hermoso');
  });

  it('updateOrder(id,{status}) tampoco borra el contenido', async () => {
    seedOrder();
    await useAppStore.getState().updateOrder('order1', { status: 'completed' });
    const p = db.updates[0].payload;
    expect(p.songs).toHaveLength(2);
    expect(p.date).toBe('2026-10-04');
    expect(p.band_id).toBe('banda-dom');
    expect(p.status).toBe('completed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (B) GUARDAS DE CONCURRENCIA — el sello content_changed_at
// ─────────────────────────────────────────────────────────────────────────────
describe('updateSong — guarda de concurrencia (CAS sobre content_changed_at)', () => {
  it('usa el sello DE APERTURA que le pasan (no el del store, que Realtime refresca)', async () => {
    seedSong({ contentChangedAt: 'STORE-FRESCO' });
    await useAppStore.getState().updateSong('song1', { key: 'E' }, 'ABIERTO-VIEJO');
    const cc = db.filters.filter(f => f.table === 'songs');
    expect(cc).toEqual([{ table: 'songs', kind: 'eq', val: 'ABIERTO-VIEJO' }]);
  });

  it('si NO le pasan sello, cae al del store (acciones de fondo como lastUsed)', async () => {
    seedSong({ contentChangedAt: 'STORE-TOKEN' });
    await useAppStore.getState().updateSong('song1', { lastUsed: '2026-10-04' });
    expect(db.filters).toContainEqual({ table: 'songs', kind: 'eq', val: 'STORE-TOKEN' });
  });

  it('sello null → filtra por IS NULL (órdenes/canciones sin sello todavía)', async () => {
    seedSong({ contentChangedAt: null });
    await useAppStore.getState().updateSong('song1', { key: 'E' }, null);
    expect(db.filters).toContainEqual({ table: 'songs', kind: 'is', val: null });
  });

  it('CHOQUE de contenido (0 filas + el sello se movió + editás contenido) → avisa y NO pisa', async () => {
    seedSong({ contentChangedAt: 'T1' });
    db.updateResults.push({ data: null, error: { code: 'PGRST116' } });
    db.fetchResults.push({ data: { id: 'song1', title: 'Océanos', key: 'F', original_key: 'F', structure: [{ type: 'Coro', content: 'otra' }], content_changed_at: 'T2' }, error: null });

    const res = await useAppStore.getState().updateSong('song1', { key: 'E' }, 'T1');
    expect(res).toMatchObject({ __conflict: true });
    expect(res.song.contentChangedAt).toBe('T2');
    // NO reintentó el UPDATE (no pisó): un solo update.
    expect(db.updates).toHaveLength(1);
  });

  it('acción de fondo (lastUsed) con 0 filas + sello movido → re-aplica sobre lo fresco (no pisa a nadie)', async () => {
    seedSong({ contentChangedAt: 'T1' });
    db.updateResults.push({ data: null, error: { code: 'PGRST116' } }); // 1er intento: choque
    db.fetchResults.push({ data: { id: 'song1', title: 'Nueva', key: 'F', original_key: 'F', structure: [{ type: 'Coro', content: 'fresca' }], content_changed_at: 'T2' }, error: null });
    db.updateResults.push({ data: { id: 'song1', title: 'Nueva', key: 'F', original_key: 'F', structure: [{ type: 'Coro', content: 'fresca' }], last_used: '2026-10-04', content_changed_at: 'T2' }, error: null }); // reintento OK

    const res = await useAppStore.getState().updateSong('song1', { lastUsed: '2026-10-04' });
    expect(res).not.toBeNull();
    expect(res.__conflict).toBeUndefined();
    expect(db.updates).toHaveLength(2); // reintentó
    // El reintento usó el sello FRESCO y preservó el contenido fresco + lastUsed
    expect(db.filters).toContainEqual({ table: 'songs', kind: 'eq', val: 'T2' });
    const retry = db.updates[1].payload;
    expect(retry.title).toBe('Nueva');
    expect(retry.structure).toEqual([{ type: 'Coro', content: 'fresca' }]);
    expect(retry.last_used).toBe('2026-10-04');
  });

  it('0 filas pero el sello NO se movió (RLS/carrera rara) → error genérico, NO un falso choque', async () => {
    seedSong({ contentChangedAt: 'T1' });
    db.updateResults.push({ data: null, error: { code: 'PGRST116' } });
    db.fetchResults.push({ data: { id: 'song1', title: 'Océanos', key: 'D', original_key: 'D', structure: SONG.structure, content_changed_at: 'T1' }, error: null }); // MISMO sello

    const res = await useAppStore.getState().updateSong('song1', { key: 'E' }, 'T1');
    expect(res).toBeNull(); // no es {__conflict}; es null (camino de error)
    expect(db.updates).toHaveLength(1); // no reintentó
  });
});

describe('updateOrder — guarda de concurrencia (CAS sobre content_changed_at)', () => {
  it('usa el sello de apertura que le pasan', async () => {
    seedOrder({ contentChangedAt: 'STORE-FRESCO' });
    await useAppStore.getState().updateOrder('order1', { date: '2026-10-11' }, 'ABIERTO-VIEJO');
    expect(db.filters).toContainEqual({ table: 'orders', kind: 'eq', val: 'ABIERTO-VIEJO' });
  });

  it('CHOQUE de contenido (0 filas + sello movido + editás contenido) → {__conflict} y NO pisa', async () => {
    seedOrder({ contentChangedAt: 'T1' });
    db.updateResults.push({ data: null, error: { code: 'PGRST116' } });
    db.fetchResults.push({ data: { id: 'order1', date: '2026-10-04', band_id: 'banda-dom', songs: ORDER.songs, content_changed_at: 'T2' }, error: null });

    const res = await useAppStore.getState().updateOrder('order1', { songs: [{ songId: 'song9', key: 'A' }] }, 'T1');
    expect(res).toMatchObject({ __conflict: true });
    expect(res.order.contentChangedAt).toBe('T2');
    expect(db.updates).toHaveLength(1);
  });

  it('acción de fondo (status) con 0 filas + sello movido → re-aplica sobre lo fresco', async () => {
    seedOrder({ contentChangedAt: 'T1' });
    db.updateResults.push({ data: null, error: { code: 'PGRST116' } });
    db.fetchResults.push({ data: { id: 'order1', date: '2026-10-04', band_id: 'banda-dom', songs: ORDER.songs, status: 'scheduled', content_changed_at: 'T2' }, error: null });
    db.updateResults.push({ data: { id: 'order1', date: '2026-10-04', band_id: 'banda-dom', songs: ORDER.songs, status: 'completed', content_changed_at: 'T2' }, error: null });

    const res = await useAppStore.getState().updateOrder('order1', { status: 'completed' });
    expect(res).not.toBeNull();
    expect(res.__conflict).toBeUndefined();
    expect(db.updates).toHaveLength(2);
    expect(db.filters).toContainEqual({ table: 'orders', kind: 'eq', val: 'T2' });
  });
});
