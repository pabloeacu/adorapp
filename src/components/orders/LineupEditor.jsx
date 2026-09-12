import React, { useMemo, useState } from 'react';
import { Check, Search, Lock, Clock, Sparkles, AlertTriangle } from 'lucide-react';
import { UsersThree, UserCheck } from '@phosphor-icons/react';
import { useAppStore } from '../../stores/appStore';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { IconBadge } from '../ui/IconBadge';
import {
  directorIdsOf, coverageGaps, suggestRotation, lineupEntries, sortInstruments, instrumentRank, formatShortDate,
} from '../../lib/lineup';
import { matchesSearch as matchesSearchText } from '../../lib/searchText';


const ROLE_LABEL = { pastor: 'Pastor', leader: 'Líder', member: 'Miembro' };

const fmtExpiry = (iso) => {
  try {
    return new Date(iso).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit' });
  } catch { return ''; }
};

// Garantiza que los directores de las canciones estén SIEMPRE en la formación
// custom (decisión de producto: un director que no participa es un orden
// inconsistente). La base hace lo mismo del lado servidor.
const withDirectors = (entries, directorIds, membersById) => {
  const out = [...entries];
  for (const id of directorIds) {
    if (out.some((e) => e.memberId === id)) continue;
    const m = membersById.get(id);
    if (!m) continue;
    out.push({ memberId: id, instruments: (m.instruments || []).includes('Voz') ? ['Voz'] : [] });
  }
  return out;
};

/**
 * Editor de formación. `value` = { mode: 'all'|'custom', members: [{ memberId, instruments }] }.
 * Dos modos: "Participan todos" (dinámico: la banda efectiva) o "Elegir la formación"
 * (lista cerrada con instrumento por persona). Los directores de canciones quedan
 * bloqueados como participantes. Incluye sugerencia de rotación y alerta de cobertura.
 */
export const LineupEditor = ({ bandId, songs = [], orderDate = null, excludeOrderId = null, value, onChange }) => {
  const getBandMembers = useAppStore((s) => s.getBandMembers);
  const orders = useAppStore((s) => s.orders);
  useAppStore((s) => s.bandTemporaryMembers); // re-render si cambia la pertenencia efectiva
  const [search, setSearch] = useState('');
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  const bandMembers = useMemo(() => getBandMembers(bandId), [getBandMembers, bandId]);
  const membersById = useMemo(() => new Map(bandMembers.map((m) => [m.id, m])), [bandMembers]);
  const directorIds = useMemo(() => {
    const ids = directorIdsOf(songs);
    return new Set([...ids].filter((id) => membersById.has(id)));
  }, [songs, membersById]);
  const directorCount = useMemo(() => {
    const c = new Map();
    for (const s of songs || []) if (s?.directorId) c.set(s.directorId, (c.get(s.directorId) || 0) + 1);
    return c;
  }, [songs]);

  const mode = value?.mode === 'custom' ? 'custom' : 'all';
  const entries = useMemo(
    () => withDirectors(lineupEntries({ mode: 'custom', members: value?.members || [] }).filter((e) => membersById.has(e.memberId)), directorIds, membersById),
    [value, directorIds, membersById],
  );
  const entryById = useMemo(() => new Map(entries.map((e) => [e.memberId, e])), [entries]);

  const emit = (nextMode, nextEntries) => {
    onChange({ mode: nextMode, members: nextMode === 'custom' ? withDirectors(nextEntries, directorIds, membersById) : [] });
  };

  const setAll = () => emit('all', []);
  const setCustom = () => {
    // Al pasar a "elegir", arranca con la selección previa (o todos, la primera vez).
    const base = entries.length > directorIds.size ? entries : bandMembers.map((m) => ({ memberId: m.id, instruments: sortInstruments(m.instruments || []) }));
    emit('custom', base);
  };
  const selectEveryone = () => emit('custom', bandMembers.map((m) => ({ memberId: m.id, instruments: sortInstruments(m.instruments || []) })));
  const selectNobody = () => emit('custom', []);

  const togglePerson = (m) => {
    if (directorIds.has(m.id)) return; // bloqueado
    if (entryById.has(m.id)) emit('custom', entries.filter((e) => e.memberId !== m.id));
    else emit('custom', [...entries, { memberId: m.id, instruments: sortInstruments(m.instruments || []) }]);
  };

  const toggleInstrument = (m, inst) => {
    const e = entryById.get(m.id);
    if (!e) return;
    const has = e.instruments.includes(inst);
    const nextInst = has ? e.instruments.filter((i) => i !== inst) : sortInstruments([...e.instruments, inst]);
    emit('custom', entries.map((x) => (x.memberId === m.id ? { ...x, instruments: nextInst } : x)));
  };

  // Sugerencia de rotación (solo con historial de formaciones custom de esta banda).
  const suggestions = useMemo(
    () => suggestRotation({ bandId, orderDate, orders, bandMembers, excludeOrderId }),
    [bandId, orderDate, orders, bandMembers, excludeOrderId],
  );
  const suggestionApplied = suggestions.length > 0 && suggestions.every((s) => {
    const e = entryById.get(s.memberId);
    return e && e.instruments.includes(s.instrument);
  });
  const applySuggestion = () => {
    let next = entries.map((e) => ({ ...e, instruments: [...e.instruments] }));
    for (const s of suggestions) {
      // Los demás candidatos del instrumento lo sueltan (los directores conservan
      // lo suyo: dirigen y cantan igual); si quedan sin nada y no dirigen, salen.
      next = next
        .map((e) => (e.memberId !== s.memberId && !directorIds.has(e.memberId) && e.instruments.includes(s.instrument)
          ? { ...e, instruments: e.instruments.filter((i) => i !== s.instrument) } : e))
        .filter((e) => e.instruments.length > 0 || directorIds.has(e.memberId));
      const cur = next.find((e) => e.memberId === s.memberId);
      if (cur) { if (!cur.instruments.includes(s.instrument)) cur.instruments = sortInstruments([...cur.instruments, s.instrument]); }
      else next.push({ memberId: s.memberId, instruments: [s.instrument] });
    }
    emit('custom', next);
  };

  const gaps = useMemo(() => (mode === 'custom' ? coverageGaps(bandMembers, entries) : []), [mode, bandMembers, entries]);

  // Conteo por instrumento (chips del resumen).
  const counts = useMemo(() => {
    const c = new Map();
    for (const e of entries) for (const i of e.instruments) c.set(i, (c.get(i) || 0) + 1);
    return [...c.entries()].sort(([a], [b]) => instrumentRank(a) - instrumentRank(b));
  }, [entries]);

  // Orden estable de la lista: directores primero, después por instrumento principal, después nombre.
  const sorted = useMemo(() => {
    const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es');
    return [...bandMembers].sort((a, b) => {
      const da = directorIds.has(a.id) ? 0 : 1; const db = directorIds.has(b.id) ? 0 : 1;
      if (da !== db) return da - db;
      const ra = instrumentRank(sortInstruments(a.instruments || [])[0]); const rb = instrumentRank(sortInstruments(b.instruments || [])[0]);
      if (ra !== rb) return ra - rb;
      return byName(a, b);
    });
  }, [bandMembers, directorIds]);
  const visible = sorted.filter((m) => matchesSearchText(search, m.name));

  const nameOf = (id) => membersById.get(id)?.name || 'alguien';

  if (!bandId) {
    return <p className="text-sm text-gray-500">Elegí la banda del orden para definir la formación.</p>;
  }

  return (
    <div className="space-y-4" data-testid="lineup-editor">
      {/* Modo: dos tarjetas grandes, a la altura del pulgar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          data-testid="lineup-mode-all"
          onClick={setAll}
          className={`text-left rounded-2xl p-4 border-2 transition-all ${mode === 'all'
            ? 'border-gold-500/70 bg-gold-gradient text-black shadow-[0_2px_18px_-4px_rgba(212,175,55,0.5)]'
            : 'border-neutral-800 bg-neutral-900 hover:border-gold-500/40'}`}
        >
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl shrink-0 ${mode === 'all' ? 'bg-black/10' : 'bg-gold-500/10 ring-1 ring-gold-500/25'}`}>
              <UsersThree size={24} weight="duotone" className={mode === 'all' ? 'text-black' : 'text-gold-300'} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold">Participan todos</p>
              <p className={`text-xs mt-0.5 ${mode === 'all' ? 'text-black/70' : 'text-gray-400'}`}>
                Los {bandMembers.length} integrantes de la banda (temporales incluidos). Un toque y listo.
              </p>
            </div>
          </div>
        </button>
        <button
          type="button"
          data-testid="lineup-mode-custom"
          onClick={setCustom}
          className={`text-left rounded-2xl p-4 border-2 transition-all ${mode === 'custom'
            ? 'border-gold-500/70 bg-gold-gradient text-black shadow-[0_2px_18px_-4px_rgba(212,175,55,0.5)]'
            : 'border-neutral-800 bg-neutral-900 hover:border-gold-500/40'}`}
        >
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl shrink-0 ${mode === 'custom' ? 'bg-black/10' : 'bg-gold-500/10 ring-1 ring-gold-500/25'}`}>
              <UserCheck size={24} weight="duotone" className={mode === 'custom' ? 'text-black' : 'text-gold-300'} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold">Elegir la formación</p>
              <p className={`text-xs mt-0.5 ${mode === 'custom' ? 'text-black/70' : 'text-gray-400'}`}>
                Marcá quiénes tocan este servicio y con qué instrumento.
              </p>
            </div>
          </div>
        </button>
      </div>

      {mode === 'all' && (
        <div className="rounded-xl border border-gold-500/20 bg-gold-500/[0.05] p-4">
          <div className="flex items-center gap-3">
            <IconBadge icon={UsersThree} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Participa toda la banda</p>
              <p className="text-xs text-gray-400">Todos reciben los avisos de ensamble y la alarma de ensayo. Si después alguien se suma a la banda, queda incluido.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {bandMembers.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-800 pl-1 pr-3 py-1 text-xs text-gray-200">
                <Avatar name={m.name} src={m.avatarUrl} size="sm" className="!w-6 !h-6 !text-[10px]" />
                {m.name}
                {m.temporary && <Clock size={11} className="text-gold-300" />}
              </span>
            ))}
          </div>
        </div>
      )}

      {mode === 'custom' && (
        <div className="space-y-3" data-testid="lineup-picker">
          {/* Resumen vivo */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold" data-testid="lineup-count">
                <span className="text-gold-gradient">{entries.length}</span> de {bandMembers.length} participan
              </p>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={selectEveryone} className="rounded-full px-3 py-1 text-xs border border-neutral-700 text-gray-300 hover:border-gold-500/50 hover:text-gold-200">Todos</button>
                <button type="button" onClick={selectNobody} className="rounded-full px-3 py-1 text-xs border border-neutral-700 text-gray-300 hover:border-gold-500/50 hover:text-gold-200">Ninguno</button>
              </div>
            </div>
            {(counts.length > 0 || gaps.length > 0) && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {counts.map(([inst, n]) => (
                  <Badge key={inst} variant="gold" size="sm">{inst} · {n}</Badge>
                ))}
                {gaps.map((inst) => (
                  <span key={`gap-${inst}`} data-testid="lineup-gap" className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30 px-2.5 py-1 text-xs font-medium">
                    <AlertTriangle size={11} /> Sin {inst.toLowerCase()}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Sugerencia de rotación */}
          {suggestions.length > 0 && !suggestionDismissed && (
            <div data-testid="lineup-suggestion" className="rounded-xl border border-gold-500/30 bg-gradient-to-br from-gold-600/[0.18] via-neutral-900 to-gold-300/[0.06] p-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-gold-500/15 text-gold-300 shrink-0"><Sparkles size={18} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Sugerencia por rotación</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-gray-300">
                    {suggestions.map((s) => (
                      <li key={s.instrument}>
                        <span className="text-gold-200">{s.instrument}</span> → <span className="font-medium text-white">{nameOf(s.memberId)}</span>
                        <span className="text-gray-500"> (la última vez {s.lastMemberIds.length === 1 ? 'tocó' : 'tocaron'} {s.lastMemberIds.map(nameOf).join(' y ')}, {formatShortDate(s.lastDate)})</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestionApplied ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-300"><Check size={13} /> Sugerencia aplicada</span>
                    ) : (
                      <button type="button" data-testid="lineup-apply-suggestion" onClick={applySuggestion} className="rounded-lg bg-gold-gradient text-black px-3 py-1.5 text-xs font-semibold hover:brightness-110 active:scale-95">Aplicar sugerencia</button>
                    )}
                    <button type="button" onClick={() => setSuggestionDismissed(true)} className="rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-gold-200">Ocultar</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Buscador (bandas grandes) */}
          {bandMembers.length > 6 && (
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre…"
                className="w-full pl-9 pr-3"
                aria-label="Buscar integrante"
              />
            </div>
          )}

          {/* Lista de integrantes */}
          <div className="space-y-2">
            {visible.length === 0 && <p className="py-2 text-sm text-gray-500">Nadie coincide con “{search.trim()}”.</p>}
            {visible.map((m) => {
              const entry = entryById.get(m.id);
              const selected = !!entry;
              const locked = directorIds.has(m.id);
              const instruments = sortInstruments(m.instruments || []);
              return (
                <div
                  key={m.id}
                  data-testid={`lineup-row-${m.id}`}
                  data-selected={selected ? '1' : '0'}
                  className={`rounded-xl border-2 transition-all ${selected ? 'border-gold-500/60 bg-gold-500/10' : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'}`}
                >
                  <button
                    type="button"
                    onClick={() => togglePerson(m)}
                    aria-pressed={selected}
                    aria-disabled={locked}
                    className={`w-full flex items-center gap-3 p-3 text-left min-h-[56px] ${locked ? 'cursor-default' : ''}`}
                  >
                    <Avatar name={m.name} src={m.avatarUrl} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{m.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-gray-500">{ROLE_LABEL[m.role] || 'Miembro'}</span>
                        {m.temporary && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gold-300"><Clock size={11} /> Temporal · vence {fmtExpiry(m.expiresAt)}</span>
                        )}
                        {locked && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gold-500/15 text-gold-200 ring-1 ring-gold-500/30 px-2 py-0.5 text-[11px] font-medium">
                            <Lock size={10} /> Dirige {directorCount.get(m.id) || 1} {(directorCount.get(m.id) || 1) === 1 ? 'canción' : 'canciones'}
                          </span>
                        )}
                        {instruments.length === 0 && (
                          <span className="text-[11px] text-gray-500 italic">Sin instrumento cargado</span>
                        )}
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-gold-gradient' : 'border border-neutral-700'}`}>
                      {selected && <Check size={14} className="text-black" />}
                    </div>
                  </button>
                  {selected && instruments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-3 pb-3 -mt-1">
                      {instruments.map((inst) => {
                        const on = entry.instruments.includes(inst);
                        return (
                          <button
                            key={inst}
                            type="button"
                            data-testid={`lineup-inst-${m.id}-${inst}`}
                            aria-pressed={on}
                            onClick={() => toggleInstrument(m, inst)}
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border transition-colors ${on
                              ? 'bg-gold-500/20 border-gold-500/50 text-gold-200'
                              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-600'}`}
                          >
                            {on && <Check size={12} />}{inst}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
