import { describe, it, expect } from 'vitest';
import {
  convertMemberFromDB, convertMemberToDB,
  convertBandFromDB, convertBandToDB,
  convertSongFromDB, convertSongToDB,
  convertOrderFromDB, convertOrderToDB,
  mergeMemberRealtimeRow,
} from './converters';

// Red de pruebas del módulo MÁS caro de romper: los converters snake_case↔camelCase.
// El incidente del 15-jun-2026 (PR #20) borró letra/acordes/tono/artista de cada
// canción tocada por un orden porque un partial pasó por convertSongToDB (que
// regenera la fila con defaults). Estos tests fijan el CONTRATO anti pérdida de
// datos (regla #8) + qué columnas son server-owned (FromDB-only, NUNCA en ToDB:
// landmines #9/#51/#58/#64/#78/#85) para que agregar una columna nueva y olvidarla
// en ToDB (la trampa de "columna = tres lugares", #52/#73) se ponga ROJO en CI.

// ---- Filas de DB completas (todos los campos poblados) ----
const memberRow = {
  id: 'm1', name: 'Ana Gómez', email: 'Ana@Example.COM', phone: '11-2222',
  pastor_area: 'Zona Norte', leader_of: 'Lider X', birthdate: '1990-01-15',
  role: 'leader', editor: true, instruments: ['Piano', 'Voz'], areas: ['adoracion'],
  active: true, onboarded: true, user_id: 'u1', avatar_url: 'http://a/x.png',
  created_at: '2020-01-01T00:00:00Z', updated_at: '2020-02-02T00:00:00Z',
};
const bandRow = {
  id: 'b1', name: 'Banda  Sábado', meeting_type: 'ensayo', meeting_day: 'sabado',
  meeting_time: '18:00', members: ['m1', 'm2'], active: true,
  created_at: '2020-01-01', updated_at: '2020-02-02',
};
const songRow = {
  id: 's1', title: 'Océanos', artist: 'Hillsong', original_key: 'C', key: 'D',
  categories: ['adoracion', 'lenta'], youtube_url: 'http://yt/1',
  structure: [{ type: 'verse', label: 'V1', chords: 'C G Am F', content: 'Me llamas' }],
  compass: '4/4', bpm: 72, last_used: '2020-03-03',
  created_at: '2020-01-01', updated_at: '2020-02-02', content_changed_at: '2020-04-04',
};
const orderRow = {
  id: 'o1', date: '2026-09-20', time: '19:00', band_id: 'b1', meeting_type: 'culto_general',
  songs: [{ songId: 's1', key: 'D', directorId: 'm1', ministracion: true, enganchada: false, _localId: 'x', _pendingHistory: true, _suggestedDirector: 'zz' }],
  feedback: 'buen servicio', status: 'scheduled',
  rehearsal_date: '2026-09-18', rehearsal_time: '20:00',
  lineup: { mode: 'custom', members: [{ memberId: 'm1', instruments: ['Piano'] }], definedBy: 'm1', definedAt: 't' },
  content_changed_at: '2026-09-19T00:00:00Z', content_changed_by: 'm2',
  rehearsal_suspended_at: '2026-09-17T00:00:00Z', rehearsal_suspended_reason: 'lluvia', rehearsal_suspended_by: 'm3',
  created_at: '2020-01-01', updated_at: '2020-02-02',
};

describe('convertSongToDB — anti pérdida de datos (el incidente de junio)', () => {
  it('preserva letra+acordes, artista, tono original, tono, categorías, YouTube, BPM y compás en el round-trip', () => {
    const db = convertSongToDB(convertSongFromDB(songRow));
    // Estas 8 aserciones son EXACTAMENTE lo que PR #20 rompió: si un campo cae a
    // su default, el test se pone rojo.
    expect(db.structure).toEqual([{ type: 'verse', label: 'V1', chords: 'C G Am F', content: 'Me llamas' }]);
    expect(db.artist).toBe('Hillsong');
    expect(db.original_key).toBe('C');
    expect(db.key).toBe('D');
    expect(db.categories).toEqual(['adoracion', 'lenta']);
    expect(db.youtube_url).toBe('http://yt/1');
    expect(db.bpm).toBe(72);
    expect(db.compass).toBe('4/4');
    expect(db.title).toBe('Océanos');
    expect(db.last_used).toBe('2020-03-03');
  });

  it('mantiene la categoría legacy (single) sincronizada con el array', () => {
    const db = convertSongToDB(convertSongFromDB(songRow));
    expect(db.category).toBe('adoracion'); // primer elemento del array
  });

  it('el sello de concurrencia content_changed_at es server-owned: NO va en ToDB', () => {
    const db = convertSongToDB(convertSongFromDB(songRow));
    expect(db).not.toHaveProperty('content_changed_at');
  });

  it('convertSongFromDB soporta categoría legacy single y default', () => {
    expect(convertSongFromDB({ category: 'guerra' }).categories).toEqual(['guerra']);
    expect(convertSongFromDB({}).categories).toEqual(['adoracion']);
    expect(convertSongFromDB(songRow).contentChangedAt).toBe('2020-04-04');
  });
});

describe('convertMemberToDB — round-trip fiel (freeze de columnas privilegiadas)', () => {
  it('preserva rol/editor/activo/áreas (self-edit reenvía idéntico → el freeze de la base pasa, landmine #41/#58)', () => {
    const db = convertMemberToDB(convertMemberFromDB(memberRow));
    expect(db.role).toBe('leader');
    expect(db.editor).toBe(true);
    expect(db.active).toBe(true);
    expect(db.areas).toEqual(['adoracion']);
    expect(db.instruments).toEqual(['Piano', 'Voz']);
    expect(db.user_id).toBe('u1');
    expect(db.avatar_url).toBe('http://a/x.png');
    expect(db.phone).toBe('11-2222');
    expect(db.pastor_area).toBe('Zona Norte');
    expect(db.leader_of).toBe('Lider X');
    expect(db.birthdate).toBe('1990-01-15');
  });

  it('baja el email a minúscula (match usuario↔ficha con auth.users, siempre minúscula)', () => {
    expect(convertMemberToDB({ email: 'Ana@Example.COM' }).email).toBe('ana@example.com');
    expect(convertMemberToDB({ name: 'x' }).email).toBeUndefined();
  });

  it('normaliza el nombre (colapsa espacios dobles/extremos — fix YUNDEFINED, landmine #35)', () => {
    expect(convertMemberToDB({ name: '  Ana   Gómez  ' }).name).toBe('Ana Gómez');
  });

  it('onboarded solo se escribe si el caller lo pasó explícito (si no, conserva el valor de la base)', () => {
    expect(convertMemberToDB({ name: 'x' })).not.toHaveProperty('onboarded');
    expect(convertMemberToDB({ onboarded: false }).onboarded).toBe(false);
    expect(convertMemberToDB({ onboarded: true }).onboarded).toBe(true);
  });
});

describe('convertBandToDB — round-trip fiel', () => {
  it('preserva tipo/día/hora/miembros/activo y normaliza el nombre', () => {
    const db = convertBandToDB(convertBandFromDB(bandRow));
    expect(db.name).toBe('Banda Sábado'); // doble espacio colapsado
    expect(db.meeting_type).toBe('ensayo');
    expect(db.meeting_day).toBe('sabado');
    expect(db.meeting_time).toBe('18:00');
    expect(db.members).toEqual(['m1', 'm2']);
    expect(db.active).toBe(true);
  });
});

describe('convertOrderToDB — round-trip + stripSongRefs + server-owned', () => {
  it('preserva fecha/hora/banda/tipo/feedback/estado/ensamble/formación', () => {
    const db = convertOrderToDB(convertOrderFromDB(orderRow));
    expect(db.date).toBe('2026-09-20');
    expect(db.time).toBe('19:00');
    expect(db.band_id).toBe('b1');
    expect(db.meeting_type).toBe('culto_general');
    expect(db.feedback).toBe('buen servicio');
    expect(db.status).toBe('scheduled');
    expect(db.rehearsal_date).toBe('2026-09-18');
    expect(db.rehearsal_time).toBe('20:00');
    expect(db.lineup).toEqual({ mode: 'custom', members: [{ memberId: 'm1', instruments: ['Piano'] }], definedBy: 'm1', definedAt: 't' });
  });

  it('stripSongRefs: quita _localId/_pendingHistory/_suggestedDirector pero CONSERVA songId/key/directorId/ministracion/enganchada', () => {
    const db = convertOrderToDB(convertOrderFromDB(orderRow));
    expect(db.songs).toEqual([{ songId: 's1', key: 'D', directorId: 'm1', ministracion: true, enganchada: false }]);
  });

  it('los sellos y la suspensión del ensamble son server-owned: NUNCA en ToDB (landmines #9/#64/#78)', () => {
    const db = convertOrderToDB(convertOrderFromDB(orderRow));
    expect(db).not.toHaveProperty('content_changed_at');
    expect(db).not.toHaveProperty('content_changed_by');
    expect(db).not.toHaveProperty('rehearsal_suspended_at');
    expect(db).not.toHaveProperty('rehearsal_suspended_reason');
    expect(db).not.toHaveProperty('rehearsal_suspended_by');
    expect(db).not.toHaveProperty('rehearsal_reminder_sent');
    expect(db).not.toHaveProperty('created_at');
  });

  it('convertOrderFromDB expone el derivado rehearsalSuspended + los sellos de solo-lectura', () => {
    const app = convertOrderFromDB(orderRow);
    expect(app.rehearsalSuspended).toBe(true);
    expect(app.contentChangedAt).toBe('2026-09-19T00:00:00Z');
    expect(app.contentChangedBy).toBe('m2');
    expect(convertOrderFromDB({ ...orderRow, rehearsal_suspended_at: null }).rehearsalSuspended).toBe(false);
  });
});

describe('mergeMemberRealtimeRow — no pierde datos personales que la realtime no trae (landmine #73)', () => {
  it('una fila realtime SIN email/phone/birthdate (walrus respeta privilegios de columna) NO pisa los que ya estaban', () => {
    const existing = convertMemberFromDB(memberRow); // tiene email/phone/birthdate
    const rtRow = { id: 'm1', name: 'Ana R.', role: 'member', instruments: ['Voz'], areas: [], active: true, user_id: 'u1', avatar_url: 'http://a/x.png' };
    const merged = mergeMemberRealtimeRow(existing, rtRow);
    // datos personales preservados:
    expect(merged.email).toBe(existing.email);
    expect(merged.phone).toBe('11-2222');
    expect(merged.birthdate).toBe('1990-01-15');
    // lo que sí vino se actualiza:
    expect(merged.name).toBe('Ana R.');
    expect(merged.role).toBe('member');
    expect(merged.instruments).toEqual(['Voz']);
  });

  it('si la fila no trae avatar_url, conserva el avatar previo', () => {
    const existing = convertMemberFromDB(memberRow);
    const rtRow = { id: 'm1', name: 'Ana', role: 'leader' }; // sin avatar_url
    const merged = mergeMemberRealtimeRow(existing, rtRow);
    expect(merged.avatar_url).toBe('http://a/x.png');
    expect(merged.avatarUrl).toBe('http://a/x.png');
  });
});
