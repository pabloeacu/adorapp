// Formación del orden — lógica PURA (sin React ni Supabase), compartida por el
// asistente, el detalle del orden, el Dashboard, Mi Ensayo, el PDF y el presentador.
//
// ⚠️ ESPEJO MANUAL de los helpers SQL de supabase/migrations/20260911_order_lineup.sql:
//   - participantIdsOf   ↔ _lineup_participants / order_participant_ids
//   - lineupInstrumentsFor ↔ _lineup_member_instruments
//   - INSTRUMENT_ORDER   ↔ _instrument_rank
// Si cambiás una regla acá, cambiala también allá (y viceversa).
//
// Contrato de `order.lineup` (columna jsonb, normalizada por la base):
//   null                                   → sin formación: participa toda la banda efectiva
//   { mode: 'all', members: [] }           → participa toda la banda efectiva (dinámico)
//   { mode: 'custom', members: [{ memberId, instruments: [] }] } → lista cerrada

export const INSTRUMENT_ORDER = [
  'Voz', 'Coros', 'Guitarra Eléctrica', 'Guitarra Acústica', 'Piano', 'Teclado',
  'Bajo', 'Batería', 'Violín', 'Flauta', 'Saxofón', 'Trompeta',
];

export const instrumentRank = (instrument) => {
  const i = INSTRUMENT_ORDER.indexOf(instrument);
  return i === -1 ? 99 : i;
};

export const sortInstruments = (list) =>
  [...new Set(list || [])].sort((a, b) => instrumentRank(a) - instrumentRank(b) || a.localeCompare(b, 'es'));

export const lineupMode = (order) => {
  const m = order?.lineup?.mode;
  return m === 'all' || m === 'custom' ? m : null;
};

export const isCustomLineup = (order) => lineupMode(order) === 'custom';

// Entradas { memberId, instruments } de una formación custom (tolerante a basura).
export const lineupEntries = (lineup) => {
  if (!lineup || lineup.mode !== 'custom' || !Array.isArray(lineup.members)) return [];
  const seen = new Set();
  const out = [];
  for (const e of lineup.members) {
    const id = e?.memberId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ memberId: id, instruments: Array.isArray(e.instruments) ? e.instruments.filter(Boolean) : [] });
  }
  return out;
};

// Set de ids de participantes. `effectiveIds` = Set de la banda efectiva
// (permanentes ∪ temporales vigentes) — lo provee el store.
export const participantIdsOf = (order, effectiveIds) => {
  if (isCustomLineup(order)) return new Set(lineupEntries(order.lineup).map((e) => e.memberId));
  return new Set(effectiveIds || []);
};

export const isOrderParticipant = (order, memberId, effectiveIds) =>
  !!memberId && participantIdsOf(order, effectiveIds).has(memberId);

// Instrumentos con los que participa un miembro: custom → lo declarado;
// all/null → los de su ficha.
export const lineupInstrumentsFor = (order, member) => {
  if (!member) return [];
  if (isCustomLineup(order)) {
    const e = lineupEntries(order.lineup).find((x) => x.memberId === member.id);
    return e ? sortInstruments(e.instruments) : [];
  }
  return sortInstruments(member.instruments || []);
};

// Agrupa participantes (objetos miembro) por instrumento, en el orden canónico.
// Un miembro con varios instrumentos aparece en cada grupo; sin instrumento → noInstrument.
export const groupByInstrument = (order, participants) => {
  const map = new Map();
  const noInstrument = [];
  for (const m of participants || []) {
    const insts = lineupInstrumentsFor(order, m);
    if (insts.length === 0) { noInstrument.push(m); continue; }
    for (const inst of insts) {
      if (!map.has(inst)) map.set(inst, []);
      map.get(inst).push(m);
    }
  }
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es');
  const groups = [...map.entries()]
    .sort(([a], [b]) => instrumentRank(a) - instrumentRank(b) || a.localeCompare(b, 'es'))
    .map(([instrument, members]) => ({ instrument, members: [...members].sort(byName) }));
  return { groups, noInstrument: noInstrument.sort(byName) };
};

// Directores de las canciones del orden (participan siempre — decisión de producto).
export const directorIdsOf = (songs) =>
  new Set((songs || []).map((s) => s?.directorId).filter(Boolean));

// Instrumentos que existen en la banda pero que nadie cubre en la selección.
// `entries` = [{ memberId, instruments }] seleccionados; `bandMembers` = objetos miembro.
export const coverageGaps = (bandMembers, entries) => {
  const inBand = new Set();
  for (const m of bandMembers || []) for (const i of m.instruments || []) inBand.add(i);
  const covered = new Set();
  for (const e of entries || []) for (const i of e.instruments || []) covered.add(i);
  return sortInstruments([...inBand].filter((i) => !covered.has(i)));
};

// Sugerencia de rotación: para cada instrumento con ≥2 candidatos en la banda,
// propone al que hace MÁS tiempo no lo toca (según formaciones custom anteriores
// de la misma banda, hasta 120 días atrás). Sin historial para ese instrumento →
// no sugiere nada. Devuelve [{ instrument, memberId, lastMemberIds, lastDate }].
export const suggestRotation = ({ bandId, orderDate, orders, bandMembers, excludeOrderId = null, lookbackDays = 120 }) => {
  if (!bandId || !orderDate || !Array.isArray(orders) || !Array.isArray(bandMembers)) return [];
  const limit = new Date(orderDate + 'T00:00:00');
  limit.setDate(limit.getDate() - lookbackDays);
  const limitKey = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(limit.getDate()).padStart(2, '0')}`;
  const history = orders
    .filter((o) => o && o.bandId === bandId && o.id !== excludeOrderId && isCustomLineup(o)
      && typeof o.date === 'string' && o.date < orderDate && o.date >= limitKey)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // más reciente primero
  if (history.length === 0) return [];

  const suggestions = [];
  const instruments = sortInstruments(bandMembers.flatMap((m) => m.instruments || []));
  for (const inst of instruments) {
    const candidates = bandMembers.filter((m) => (m.instruments || []).includes(inst));
    if (candidates.length < 2) continue;
    // última fecha en que cada candidato tocó ESTE instrumento
    const lastPlayed = new Map();
    let lastMemberIds = null; let lastDate = null;
    for (const o of history) {
      const players = lineupEntries(o.lineup).filter((e) => e.instruments.includes(inst)).map((e) => e.memberId);
      if (players.length === 0) continue;
      if (!lastDate) { lastDate = o.date; lastMemberIds = players; }
      for (const id of players) if (!lastPlayed.has(id)) lastPlayed.set(id, o.date);
    }
    if (!lastDate) continue; // nadie tocó este instrumento en el período → sin base
    const ranked = [...candidates].sort((a, b) => {
      const da = lastPlayed.get(a.id) || ''; const db = lastPlayed.get(b.id) || '';
      if (da !== db) return da < db ? -1 : 1; // '' (nunca) primero, después el más antiguo
      return (a.name || '').localeCompare(b.name || '', 'es');
    });
    const pick = ranked[0];
    // Si el elegido es exactamente quien tocó la última vez, no hay rotación que sugerir.
    if (lastMemberIds.length === 1 && lastMemberIds[0] === pick.id) continue;
    suggestions.push({ instrument: inst, memberId: pick.id, lastMemberIds, lastDate });
  }
  return suggestions;
};

// Arma el objeto a persistir (la base lo normaliza y agrega definedBy/definedAt).
export const buildLineup = (mode, entries) => {
  if (mode !== 'custom') return { mode: 'all', members: [] };
  return {
    mode: 'custom',
    members: (entries || []).map((e) => ({ memberId: e.memberId, instruments: sortInstruments(e.instruments) })),
  };
};

// Texto plano "Voz: A, B · Bajo: C" (PDF, presentador, pill).
export const lineupSummaryText = (order, participants, { maxGroups = Infinity } = {}) => {
  const { groups, noInstrument } = groupByInstrument(order, participants);
  const parts = groups.slice(0, maxGroups).map((g) => `${g.instrument}: ${g.members.map((m) => m.name).join(', ')}`);
  if (noInstrument.length) parts.push(`También: ${noInstrument.map((m) => m.name).join(', ')}`);
  if (groups.length > maxGroups) parts.push(`+${groups.length - maxGroups} más`);
  return parts.join(' · ');
};

export const formatShortDate = (isoDate) => {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}` : isoDate;
};
