import React, { useMemo, useState } from 'react';
import { Zap, Music, Search, Plus, Clock, X } from 'lucide-react';
import { MusicNotes as MusicNotesDuo } from '@phosphor-icons/react';
import { useAppStore, SONG_CATEGORIES } from '../../stores/appStore';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import {
  bandLastUseMap, lastUseLabel, rankUnused, filterUnused, categoriesPresent,
} from '../../lib/unusedSongs';

const WINDOWS = [4, 8, 12];

// Navegador de "canciones sin usar" para armar un orden: todas (con scroll),
// ordenadas por la que hace más que no suena, buscables por texto (indistinto a
// tildes) y filtrables por clima. Reemplaza al listado recortado de 6.
export function UnusedSongsPanel({ bandId, onAdd }) {
  const getUnusedByBand = useAppStore((s) => s.getUnusedByBand);
  const orders = useAppStore((s) => s.orders);
  const songsStore = useAppStore((s) => s.songs); // recomputar si cambia el repertorio
  const [weeks, setWeeks] = useState(4);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);

  // "ahora" estable mientras el panel está montado con esta banda/ventana.
  const nowMs = useMemo(() => Date.now(), [bandId, weeks]);

  const unused = useMemo(
    () => (bandId ? getUnusedByBand(bandId, weeks) : []),
    [bandId, weeks, orders, songsStore, getUnusedByBand],
  );
  const lastUse = useMemo(() => bandLastUseMap(orders, bandId), [orders, bandId]);
  const ranked = useMemo(() => rankUnused(unused, lastUse), [unused, lastUse]);
  const cats = useMemo(() => categoriesPresent(unused, SONG_CATEGORIES), [unused]);
  const shown = useMemo(() => filterUnused(ranked, { query, category }), [ranked, query, category]);

  if (!bandId) return null;

  return (
    <div className="mb-4 p-3 sm:p-4 bg-gold-500/[0.06] border border-gold-500/30 rounded-xl">
      {/* Encabezado: título + contador + ventana de semanas */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-gold-300 text-sm min-w-0">
          <Zap size={14} className="shrink-0" />
          <span className="truncate">Sin usar · <strong>{unused.length}</strong></span>
        </div>
        <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Ventana de semanas sin usar">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeeks(w)}
              aria-pressed={weeks === w}
              className={`px-2 py-1 rounded-md text-xs transition-colors ${weeks === w ? 'bg-gold-500/20 text-gold-200 font-semibold' : 'text-gray-400 hover:text-gold-300 hover:bg-neutral-700/60'}`}
            >
              {w} sem
            </button>
          ))}
        </div>
      </div>

      {unused.length === 0 ? (
        <EmptyState
          className="w-full !py-6"
          icon={MusicNotesDuo}
          title="Sin canciones para sugerir"
          subtitle={`Esta banda usó todo su repertorio en las últimas ${weeks} semanas.`}
          annotation="Buscala más abajo"
        />
      ) : (
        <>
          {/* Buscador (indistinto a tildes) */}
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en las sugerencias…"
              className="w-full pl-9 pr-8 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-gold-500/50"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filtro por clima (scroll horizontal en celular) */}
          <div
            role="group"
            aria-label="Filtrar por clima"
            className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              type="button"
              onClick={() => setCategory(null)}
              aria-pressed={category === null}
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs transition-colors ${category === null ? 'bg-gold-gradient text-black font-semibold' : 'bg-neutral-800 text-gray-300 hover:bg-neutral-700'}`}
            >
              Todas
            </button>
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(category === c.id ? null : c.id)}
                aria-pressed={category === c.id}
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs transition-colors ${category === c.id ? 'bg-gold-gradient text-black font-semibold' : 'bg-neutral-800 text-gray-300 hover:bg-neutral-700'}`}
              >
                {c.label} <span className="opacity-70">{c.count}</span>
              </button>
            ))}
          </div>

          {/* Lista scrolleable, ordenada por "la que hace más que no suena" */}
          <div className="mt-1 max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {shown.map((song) => (
              <button
                key={song.id}
                type="button"
                onClick={() => onAdd(song)}
                className="group w-full flex items-center gap-2 p-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm text-left transition-colors"
              >
                <Music size={14} className="shrink-0 text-gray-400" />
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{song.title}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    {song.artist && <span className="truncate">{song.artist}</span>}
                    <span className="inline-flex items-center gap-0.5 shrink-0"><Clock size={10} /> {lastUseLabel(lastUse.get(song.id), nowMs)}</span>
                  </span>
                </span>
                <Badge size="sm" variant="primary">{song.key}</Badge>
                <span className="shrink-0 text-gold-300 group-hover:text-gold-200"><Plus size={16} /></span>
              </button>
            ))}
            {shown.length === 0 && (
              <p className="text-center text-xs text-gray-500 py-6">
                No hay sugerencias que coincidan con la búsqueda o el filtro.
              </p>
            )}
          </div>

          <p className="mt-2 text-[11px] text-gray-500 text-center">
            Mostrando {shown.length} de {unused.length} · ordenadas por la que hace más que no suena
          </p>
        </>
      )}
    </div>
  );
}
