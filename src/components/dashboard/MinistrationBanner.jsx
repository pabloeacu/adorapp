import React, { useEffect, useMemo, useState } from 'react';
import { Mic2, Search, Plus, X, CheckCircle2, User } from 'lucide-react';
import { useAppStore, MUSICAL_KEYS } from '../../stores/appStore';
import { supabase } from '../../lib/supabase';
import { resolveMinistrationOrder, ministrationWindow, isMinistrationSong } from '../../lib/ministration';
import { suggestDirectorForSong } from '../../lib/orders';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { SelectMenu } from '../ui/SelectMenu';

// "¿Con qué ministramos?" — banner del Inicio durante el servicio EN EJECUCIÓN (desde la
// hora de inicio y por 3 h), SOLO para el líder de la banda del orden y los pastores.
// Es un atajo: elegir una o más canciones del repertorio (director + tono) que se agregan
// al FINAL del orden con la marca "Ministración". El guardado y el aviso (push + correo a
// formación ∪ Multimedia ∪ Sonido ∪ pastores) los hace la RPC `add_ministration_songs`
// (frontera real: mismo gate + misma ventana). La regla de elegibilidad vive en
// src/lib/ministration.js. Se auto-oculta al vencer la ventana, sin recargar.

const ERROR_COPY = {
  ventana_vencida: 'Pasaron más de 3 horas desde el inicio del servicio: la ventana para asignar la ministración ya se cerró.',
  todavia_no_empezo: 'El servicio todavía no empezó.',
  orden_no_programado: 'Este orden ya no está programado.',
  director_invalido: 'El director elegido no integra la banda de este orden.',
  tono_invalido: 'El tono elegido no es válido.',
  cancion_inexistente: 'Una de las canciones ya no existe en el repertorio.',
};
const errorCopy = (msg) => {
  const m = String(msg || '');
  for (const k of Object.keys(ERROR_COPY)) if (m.includes(k)) return ERROR_COPY[k];
  if (/permiso/i.test(m)) return 'No tenés permiso para asignar la ministración de este orden.';
  return 'No se pudo guardar la canción de ministración. Probá de nuevo.';
};

const fmtDate = (d) => {
  try { return new Date(`${d}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); } catch { return ''; }
};

export const MinistrationBanner = ({ member, role }) => {
  const orders = useAppStore((s) => s.orders);
  const bands = useAppStore((s) => s.bands);
  const songs = useAppStore((s) => s.songs);
  const members = useAppStore((s) => s.members);
  const bandTemporaryMembers = useAppStore((s) => s.bandTemporaryMembers);
  const getBandById = useAppStore((s) => s.getBandById);
  const getSongById = useAppStore((s) => s.getSongById);
  const getMemberById = useAppStore((s) => s.getMemberById);
  const getEffectiveBandMemberIds = useAppStore((s) => s.getEffectiveBandMemberIds);
  const addMinistrationSongs = useAppStore((s) => s.addMinistrationSongs);

  // Orden elegible AHORA (se re-evalúa al vencer la ventana con la pantalla abierta).
  const [tick, setTick] = useState(0);
  const [order, setOrder] = useState(null);
  useEffect(() => {
    let alive = true;
    const now = Date.now();
    const o = resolveMinistrationOrder(orders, member, role, getBandById, now);
    setOrder(o);
    if (!o?.id) return () => { alive = false; };
    const w = ministrationWindow(o);
    const msLeft = w ? Math.max(0, w.end - now) : 0;
    const timer = setTimeout(() => { if (alive) setTick((t) => t + 1); }, Math.min(msLeft + 250, 2 ** 31 - 1));
    return () => { alive = false; clearTimeout(timer); };
  }, [orders, bands, member, role, getBandById, tick]);

  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState([]); // [{ songId, key, directorId, historyKey }]
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { added, notified }

  const band = order ? getBandById(order.bandId) : null;
  // Directores elegibles = integrantes EFECTIVOS activos con 'Voz' (misma regla que el editor de órdenes).
  const singers = useMemo(() => {
    if (!order?.bandId) return [];
    const ids = getEffectiveBandMemberIds(order.bandId);
    return members.filter((m) => m.active && ids.has(m.id) && m.instruments?.includes('Voz'));
  }, [order?.bandId, members, bands, bandTemporaryMembers, getEffectiveBandMemberIds]);
  const singerIds = useMemo(() => new Set(singers.map((s) => s.id)), [singers]);

  // Opciones del selector: todo el repertorio menos lo ya elegido (el buscador vive en la hoja).
  const pickerOptions = useMemo(() => {
    const taken = new Set(picked.map((p) => p.songId));
    return songs
      .filter((s) => !taken.has(s.id))
      .map((s) => ({ value: s.id, label: s.title, sublabel: s.artist || '', badge: s.key || '' }));
  }, [songs, picked]);

  const alreadyAssigned = useMemo(() => (order?.songs || []).filter(isMinistrationSong), [order]);

  const openModal = () => { setPicked([]); setError(''); setResult(null); setOpen(true); };
  const closeModal = () => { if (!sending) setOpen(false); };

  // Al elegir una canción: director sugerido por historial + tono del director la última
  // vez que la dirigió (song_key_history), si existe; si no, el tono de la ficha.
  const pickSong = async (song) => {
    const directorId = suggestDirectorForSong({ singerIds, orders, songId: song.id, bandId: order?.bandId }) || null;
    const base = { songId: song.id, key: song.key || song.originalKey || 'C', directorId, historyKey: null };
    setPicked((prev) => [...prev, base]);
    if (!directorId) return;
    try {
      const { data } = await supabase
        .from('song_key_history').select('key').eq('member_id', directorId).eq('song_id', song.id)
        .order('order_date', { ascending: false }).limit(1).maybeSingle();
      if (data?.key && MUSICAL_KEYS.includes(data.key)) {
        setPicked((prev) => prev.map((p) => (p.songId === song.id && p.directorId === directorId ? { ...p, key: data.key, historyKey: data.key } : p)));
      }
    } catch { /* best-effort */ }
  };
  const updatePick = (songId, patch) => setPicked((prev) => prev.map((p) => (p.songId === songId ? { ...p, ...patch } : p)));
  const removePick = (songId) => setPicked((prev) => prev.filter((p) => p.songId !== songId));

  const confirm = async () => {
    if (!order?.id || picked.length === 0 || sending) return;
    setSending(true); setError('');
    const res = await addMinistrationSongs(order.id, picked.map(({ songId, key, directorId }) => ({ songId, key, directorId: directorId || null })));
    setSending(false);
    if (!res || res.error || res.ok !== true) { setError(errorCopy(res?.error)); return; }
    setResult({ added: res.added ?? picked.length, notified: res.notified ?? 0 });
    setPicked([]);
  };

  if (!order) return null;

  return (
    <>
      <div className="rounded-2xl p-4 sm:p-5 shadow-lg bg-gold-gradient text-black" data-testid="ministration-banner">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl shrink-0 bg-black/10 text-black"><Mic2 size={28} /></div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold">¿Con qué ministramos?</p>
            <p className="text-sm font-medium text-black/80">Elegí la canción para la parte final del servicio</p>
            <p className="text-xs text-black/60 truncate mt-0.5">{band?.name || 'Banda'} · orden del {fmtDate(order.date)}{order.time ? ` · ${order.time}` : ''}</p>
          </div>
        </div>
        {alreadyAssigned.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" data-testid="ministration-assigned">
            {alreadyAssigned.map((ref, i) => (
              <span key={`${ref.songId}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-black/10 px-2.5 py-1 text-xs font-semibold">
                <CheckCircle2 size={12} /> {getSongById(ref.songId)?.title || 'Canción'} · {ref.key}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={openModal} data-testid="ministration-open"
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all active:scale-95 bg-black/10 text-black hover:bg-black/20">
            <Plus size={14} /> {alreadyAssigned.length > 0 ? 'Agregar otra canción' : 'Elegir canción'}
          </button>
        </div>
      </div>

      <Modal isOpen={open} onClose={closeModal} title="¿Con qué ministramos?" size="lg"
        footer={result ? (
          <Button variant="primary" onClick={closeModal} data-testid="ministration-done">Listo</Button>
        ) : (
          <div className="flex gap-2 w-full">
            <Button variant="secondary" className="flex-1" onClick={closeModal} disabled={sending}>Cancelar</Button>
            <Button variant="primary" className="flex-1" onClick={confirm} disabled={sending || picked.length === 0} data-testid="ministration-confirm">
              {sending ? 'Guardando…' : picked.length > 1 ? `Asignar ${picked.length} canciones` : 'Asignar y avisar'}
            </Button>
          </div>
        )}>
        {result ? (
          <div className="text-center py-6" data-testid="ministration-success">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15 text-green-400"><CheckCircle2 size={30} /></div>
            <p className="text-lg font-semibold text-white">¡Listo!</p>
            <p className="text-sm text-gray-400 mt-1">
              {result.added === 1 ? 'La canción de ministración quedó' : `Las ${result.added} canciones de ministración quedaron`} al final del orden.
              {result.notified > 0 ? ` Avisamos por push y correo a ${result.notified} ${result.notified === 1 ? 'persona' : 'personas'} (formación, Multimedia, Sonido y pastores).` : ''}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Elegí la canción para la parte final del servicio de <span className="text-white font-medium">{band?.name || 'la banda'}</span>. Se agrega al final del orden y se avisa a la formación, Multimedia, Sonido y a los pastores.
            </p>

            {/* Elección de canciones con el MISMO método que director y tono (SelectMenu con
                buscador adentro de la hoja): la lista scrollea en la hoja inferior, no queda
                atrapada dentro del modal. Cada elección agrega la canción; se puede repetir. */}
            <SelectMenu
              icon={Search}
              value=""
              placeholder={picked.length ? 'Agregar otra canción del repertorio…' : 'Elegir canción del repertorio…'}
              searchable
              searchPlaceholder="Buscar por título o artista…"
              emptyText="No encontramos esa canción. Probá con otro título o artista."
              testId="ministration-picker"
              options={pickerOptions}
              onChange={(id) => { const s = getSongById(id); if (s) pickSong(s); }}
            />

            {picked.length === 0 ? (
              <p className="text-xs text-gray-500">Buscá por título o artista y tocá la canción para agregarla.</p>
            ) : (
              <div className="space-y-3" data-testid="ministration-picked">
                {picked.map((p) => {
                  const song = getSongById(p.songId);
                  return (
                    <div key={p.songId} className="rounded-xl border border-gold-500/25 bg-neutral-800/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-white truncate">{song?.title || 'Canción'}</p>
                          {song?.artist && <p className="text-xs text-gray-500 truncate">{song.artist}</p>}
                        </div>
                        <button type="button" onClick={() => removePick(p.songId)} className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-neutral-700" aria-label="Quitar"><X size={16} /></button>
                      </div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wide block mb-1">Director</label>
                          <SelectMenu icon={User} value={p.directorId || ''} placeholder="Sin director"
                            options={[{ value: '', label: 'Sin director' }, ...singers.map((m) => ({ value: m.id, label: m.name }))]}
                            onChange={(v) => updatePick(p.songId, { directorId: v || null, historyKey: null })} />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wide block mb-1">Tono</label>
                          <SelectMenu value={p.key} options={MUSICAL_KEYS.map((k) => ({ value: k, label: k }))} onChange={(v) => updatePick(p.songId, { key: v })} />
                          {p.historyKey && p.historyKey === p.key && (
                            <p className="text-[11px] text-gold-300/80 mt-1">Tono que usó {getMemberById(p.directorId)?.name?.split(' ')[0] || 'el director'} la última vez.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {error && <p className="text-sm text-red-400" data-testid="ministration-error">{error}</p>}
            {alreadyAssigned.length > 0 && (
              <p className="text-xs text-gray-500">Ya asignadas: {alreadyAssigned.map((r) => getSongById(r.songId)?.title).filter(Boolean).join(', ')}.</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
};
