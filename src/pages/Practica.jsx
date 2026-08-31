import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Minus,
  Mic2,
  ListMusic,
  Sparkles,
  BookOpen,
  Youtube,
  User,
  CalendarDays,
  CheckCircle2,
  UploadCloud,
  AlarmClock,
  Timer,
} from 'lucide-react';
import { MusicNotes, MusicNotesSimple } from '@phosphor-icons/react';
import { useAppStore, transposeSongStructure } from '../stores/appStore';
import { milestonesOf, ensayometroPercent } from '../lib/ensayometro';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/PageLoader';
import { EmptyState } from '../components/ui/EmptyState';

// El Ensayómetro: registro PERSONAL de práctica por orden. Glosario del
// ministerio: el "ensamble" es el encuentro de toda la banda (programado en el
// orden); el "ensayo" es la práctica personal previa de cada músico. Esta
// pantalla acompaña ese ensayo personal: cuántas veces practicó cada canción,
// qué domina (letra / estructura / frases y arreglos) y qué dificultad le
// resultó. Los datos son privados de cada usuario (RLS user_id = auth.uid())
// y efímeros: viven mientras el orden está programado.

const DIFFICULTIES = [
  { id: 'easy', label: 'Fácil', selected: 'bg-green-500/30 text-green-300 border-green-500/60' },
  { id: 'medium', label: 'Media', selected: 'bg-amber-500/30 text-amber-300 border-amber-500/60' },
  { id: 'hard', label: 'Difícil', selected: 'bg-red-500/30 text-red-300 border-red-500/60' },
];

const MASTERY_CHECKS = [
  { field: 'knowsLyrics', label: 'Me sé la letra', icon: Mic2 },
  { field: 'knowsStructure', label: 'Me sé la estructura', icon: ListMusic },
  { field: 'knowsArrangements', label: 'Frases y arreglos', icon: Sparkles },
];

// milestonesOf y el cálculo del % viven en src/lib/ensayometro.js (fuente única
// compartida con el banner del Dashboard y espejo del cron; landmine #27).

const emptyLog = (orderId, songId) => ({
  orderId,
  songId,
  timesPracticed: 0,
  knowsLyrics: false,
  knowsStructure: false,
  knowsArrangements: false,
  difficulty: null,
  lastPracticedAt: null,
});

// Anillo de progreso SVG con degradé aurora. El offset transiciona con CSS,
// así cada hito completado "avanza" visualmente el anillo.
const ProgressRing = ({ percent }) => {
  const R = 52;
  const C = 2 * Math.PI * R;
  const offset = C - (C * percent) / 100;
  return (
    <div className="relative w-32 h-32 shrink-0">
      <svg viewBox="0 0 120 120" className="w-32 h-32 -rotate-90">
        <defs>
          <linearGradient id="ensayometro-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffe9a8" />
            <stop offset="50%" stopColor="#f2c94c" />
            <stop offset="100%" stopColor="#d4af37" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="url(#ensayometro-grad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{percent}%</span>
        <span className="text-[10px] uppercase tracking-wide text-gray-400">practicado</span>
      </div>
    </div>
  );
};

// Metrónomo (F3): Web Audio API, sin dependencias. Un solo metrónomo activo a
// la vez. El AudioContext se crea recién en el primer tap (política de
// autoplay de los navegadores móviles: el audio DEBE nacer de un gesto).
// Scheduler con lookahead corto: los beeps se agendan por adelantado en el
// reloj del AudioContext (preciso), no en el de setInterval (impreciso).
const beatsPerBarOf = (compass) => {
  const n = parseInt(String(compass || '').split('/')[0], 10);
  return Number.isFinite(n) && n > 0 && n <= 12 ? n : 4;
};

const useMetronome = () => {
  const ctxRef = useRef(null);
  const timerRef = useRef(null);
  const nextBeatRef = useRef(0);
  const beatCountRef = useRef(0);
  const [active, setActive] = useState(null); // { songId, bpm }

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setActive(null);
  }, []);

  const start = useCallback((songId, bpm, beatsPerBar) => {
    stop();
    if (!bpm || bpm <= 0) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = ctxRef.current || (ctxRef.current = new Ctx());
    if (ctx.state === 'suspended') ctx.resume();
    const interval = 60 / bpm;
    nextBeatRef.current = ctx.currentTime + 0.1;
    beatCountRef.current = 0;
    timerRef.current = setInterval(() => {
      while (nextBeatRef.current < ctx.currentTime + 0.15) {
        const accent = beatCountRef.current % beatsPerBar === 0;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = accent ? 1568 : 1047; // sol6 acentuado, do6 el resto
        gain.gain.setValueAtTime(accent ? 0.5 : 0.28, nextBeatRef.current);
        gain.gain.exponentialRampToValueAtTime(0.001, nextBeatRef.current + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(nextBeatRef.current);
        osc.stop(nextBeatRef.current + 0.09);
        beatCountRef.current += 1;
        nextBeatRef.current += interval;
      }
    }, 30);
    setActive({ songId, bpm });
  }, [stop]);

  // Al desmontar la pantalla: silencio garantizado.
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (ctxRef.current) ctxRef.current.close().catch(() => {});
  }, []);

  return { active, start, stop };
};

const encouragement = (percent) => {
  if (percent === 0) return '🎸 ¡A darle! Cada pasada suma.';
  if (percent < 50) return '🔥 Buen ritmo, seguí sumando pasadas.';
  if (percent < 100) return '🚀 Casi listo para el ensamble.';
  return '🏆 ¡Orden dominado! Llegás al ensamble con todo.';
};

export const Practica = () => {
  useDocumentTitle('Mi Ensayo');
  const { orderId } = useParams();
  const { orders, loading, getSongById, getBandById, getMemberById, fetchPracticeLogs, upsertPracticeLog, fetchPracticeAlarm, setPracticeAlarm } = useAppStore();

  const order = orders.find(o => o.id === orderId);
  const band = order ? getBandById(order.bandId) : null;

  // logs: mapa songId → log completo (siempre completo: apto para el upsert).
  const [logs, setLogs] = useState({});
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const [viewerSong, setViewerSong] = useState(null); // { song, orderKey }
  // Alarma de ensayo (F2): preferencia GLOBAL del usuario (no por orden).
  // null = todavía cargando (el toggle se deshabilita mientras tanto).
  const [alarmEnabled, setAlarmEnabled] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchPracticeAlarm().then((enabled) => { if (alive) setAlarmEnabled(enabled); });
    return () => { alive = false; };
  }, [fetchPracticeAlarm]);

  const toggleAlarm = async () => {
    if (alarmEnabled === null) return;
    const next = !alarmEnabled;
    setAlarmEnabled(next); // optimista
    const saved = await setPracticeAlarm(next);
    if (saved === null) setAlarmEnabled(!next); // falló → revertir
  };

  // Metrónomo (F3): uno solo activo a la vez, muere al salir de la pantalla.
  const metronome = useMetronome();

  // Festejo 100% (F3): SOLO cuando el usuario CRUZA a 100% en vivo (prev < 100
  // → 100). Entrar a una pantalla que ya está al 100% no festeja de nuevo.
  const [celebrating, setCelebrating] = useState(false);
  const prevPercentRef = useRef(null);
  const confetti = useMemo(() => {
    if (!celebrating) return [];
    const colors = ['#818cf8', '#a78bfa', '#60a5fa', '#f472b6', '#fbbf24', '#34d399'];
    return Array.from({ length: 44 }, (_, i) => ({
      left: `${(i * 37) % 100}%`,
      color: colors[i % colors.length],
      delay: `${(i % 11) * 0.12}s`,
      duration: `${2.4 + ((i * 13) % 10) / 6}s`,
      drift: `${((i * 29) % 120) - 60}px`,
      size: 6 + ((i * 7) % 6),
    }));
  }, [celebrating]);


  // Timers de autoguardado con debounce por canción. El upsert manda SIEMPRE
  // el objeto completo (contrato del converter — ver DATA-LOSS LANDMINE).
  const saveTimers = useRef({});
  const latestLogs = useRef({});
  useEffect(() => { latestLogs.current = logs; }, [logs]);

  useEffect(() => {
    let alive = true;
    if (!orderId) return undefined;
    // Reset al cambiar de orden (mismo componente, otro :orderId): sin esto,
    // un log de OTRO orden con la misma canción se mostraría como propio.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLogs({});
    setLogsLoaded(false);
    fetchPracticeLogs(orderId).then((rows) => {
      if (!alive) return;
      const map = {};
      rows.forEach(r => { map[r.songId] = r; });
      setLogs(map);
      setLogsLoaded(true);
    });
    return () => { alive = false; };
  }, [orderId, fetchPracticeLogs]);

  // Al desmontar, disparar los guardados pendientes (sin esperar el debounce).
  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      Object.values(timers).forEach(t => {
        clearTimeout(t.timer);
        if (t.flush) t.flush();
      });
    };
  }, []);

  const scheduleSave = useCallback((songId) => {
    const existing = saveTimers.current[songId];
    if (existing) clearTimeout(existing.timer);
    const flush = async () => {
      delete saveTimers.current[songId];
      const log = latestLogs.current[songId];
      if (!log) return;
      setSaveState('saving');
      const saved = await upsertPracticeLog(log);
      if (saved) {
        // Conservar el id devuelto (primera creación) sin pisar clics nuevos.
        setLogs(prev => ({ ...prev, [songId]: { ...prev[songId], id: saved.id } }));
        setSaveState('saved');
      } else {
        setSaveState('idle');
      }
    };
    saveTimers.current[songId] = { timer: setTimeout(flush, 500), flush };
  }, [upsertPracticeLog]);

  const updateLog = useCallback((songId, patch) => {
    setLogs(prev => {
      const current = prev[songId] || emptyLog(orderId, songId);
      return { ...prev, [songId]: { ...current, ...patch } };
    });
    scheduleSave(songId);
  }, [orderId, scheduleSave]);

  const addPractice = (songId, delta) => {
    const current = logs[songId] || emptyLog(orderId, songId);
    const next = Math.max(0, (current.timesPracticed || 0) + delta);
    updateLog(songId, {
      timesPracticed: next,
      lastPracticedAt: delta > 0 ? new Date().toISOString() : current.lastPracticedAt,
    });
  };

  const uniqueSongIds = useMemo(
    () => [...new Set((order?.songs || []).map(s => s.songId))],
    [order]
  );

  const percent = useMemo(
    () => ensayometroPercent(uniqueSongIds, logs),
    [uniqueSongIds, logs]
  );

  const totalPasses = useMemo(
    () => uniqueSongIds.reduce((acc, id) => acc + (logs[id]?.timesPracticed || 0), 0),
    [uniqueSongIds, logs]
  );

  // Festejo 100%: dispara solo en la transición en vivo (ver refs arriba).
  useEffect(() => {
    if (!logsLoaded) return undefined;
    const prev = prevPercentRef.current;
    prevPercentRef.current = percent;
    if (prev !== null && prev < 100 && percent === 100) {
      setCelebrating(true);
      const t = setTimeout(() => setCelebrating(false), 4200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [percent, logsLoaded]);

  // Orden inexistente: si el store todavía carga, esperar; si ya cargó y no
  // está (borrado, id inválido), volver a Órdenes.
  if (!order) {
    if (loading || orders.length === 0) return <PageLoader />;
    return <Navigate to="/ordenes" replace />;
  }

  if (!logsLoaded) return <PageLoader />;

  const orderDateLabel = new Date(order.date + 'T00:00:00').toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      {/* Festejo 100% (F3): confeti + mensaje, sólo en la transición en vivo */}
      {celebrating && (
        <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden" data-testid="celebration" aria-hidden="true">
          {confetti.map((p, i) => (
            <span
              key={i}
              className="absolute top-0 rounded-sm animate-confetti-fall"
              style={{
                left: p.left,
                width: p.size,
                height: p.size * 1.6,
                backgroundColor: p.color,
                animationDelay: p.delay,
                animationDuration: p.duration,
                '--confetti-drift': p.drift,
              }}
            />
          ))}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-fade-in rounded-2xl px-6 py-5 bg-gold-gradient border border-gold-300/30 shadow-2xl text-center">
              <p className="text-4xl mb-2">🏆</p>
              <p className="text-lg font-bold text-black">¡Orden dominado!</p>
              <p className="text-sm text-black/70">Llegás al ensamble con todo.</p>
            </div>
          </div>
        </div>
      )}
      {/* Volver + contexto del orden */}
      <div className="flex items-center gap-3">
        <Link
          to={`/ordenes?order=${order.id}`}
          className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-gray-400 hover:text-gold-200 hover:border-gold-500/40 transition-colors"
          aria-label="Volver al orden"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold truncate">Mi Ensayo</h2>
          <p className="text-sm text-gray-400 truncate">
            {band?.name || 'Banda'} · {orderDateLabel}
          </p>
        </div>
        {/* Indicador de autoguardado */}
        <div className="shrink-0 text-xs text-gray-500 flex items-center gap-1" aria-live="polite">
          {saveState === 'saving' && (<><UploadCloud size={14} className="animate-pulse" /> Guardando…</>)}
          {saveState === 'saved' && (<><CheckCircle2 size={14} className="text-green-400" /> Guardado</>)}
        </div>
      </div>

      {/* Ensayómetro: anillo de progreso + ánimo */}
      <div className="rounded-2xl p-5 border border-gold-500/25 bg-gradient-to-br from-gold-600/[0.28] via-neutral-900 to-gold-300/[0.10]">
        <div className="flex items-center gap-5">
          <ProgressRing percent={percent} />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold">Ensayómetro</p>
            <p className="text-sm text-gray-300 mt-1">{encouragement(percent)}</p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Badge variant="primary" size="sm">{uniqueSongIds.length} canciones</Badge>
              <Badge variant="secondary" size="sm">{totalPasses} pasadas en total</Badge>
              {order.rehearsalDate && (
                <Badge variant="warning" size="sm">
                  <span className="flex items-center gap-1">
                    <CalendarDays size={12} />
                    Ensamble: {new Date(order.rehearsalDate + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    {order.rehearsalTime ? ` · ${order.rehearsalTime}` : ''}
                  </span>
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Alarma de ensayo (F2): opt-in personal. El push diario 18:00 ART lo
          manda el cron send_practice_reminders() SOLO si hay canciones por
          practicar en algún orden programado (anti-spam server-side). */}
      <div className="rounded-xl border border-neutral-800 p-4 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white flex items-center gap-2">
            <AlarmClock size={16} className="text-gold-300 shrink-0" /> Alarma de ensayo
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Te recordamos todos los días a las 18:00 mientras tengas canciones por practicar. Sin pendientes, no te molestamos.
          </p>
        </div>
        {/* Switch inmune a iOS: label + checkbox sr-only peer + spans track/knob
            (mismo patrón que "Programar ensamble" en Ordenes — landmine 23). */}
        <label className={`relative shrink-0 inline-flex items-center ${alarmEnabled === null ? 'opacity-50' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            className="sr-only peer"
            aria-label="Alarma de ensayo"
            checked={!!alarmEnabled}
            disabled={alarmEnabled === null}
            onChange={toggleAlarm}
          />
          <span className="block w-[52px] h-8 rounded-full bg-neutral-700 transition-colors peer-checked:bg-green-500 peer-focus-visible:ring-2 peer-focus-visible:ring-gold-500/50" />
          <span className="pointer-events-none absolute top-[2px] left-[2px] h-7 w-7 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </label>
      </div>

      {/* Tarjetas de práctica por canción */}
      <div className="space-y-4">
        {order.songs.map((songRef, index) => {
          const song = getSongById(songRef.songId);
          if (!song) return null;
          const log = logs[songRef.songId] || emptyLog(orderId, songRef.songId);
          const director = getMemberById(songRef.directorId);
          const done = milestonesOf(log) === 4;

          return (
            <Card
              key={`${songRef.songId}-${index}`}
              className={done ? 'border-green-500/40 transition-all' : 'transition-all'}
            >
              <div className="space-y-4">
                {/* Cabecera de la canción */}
                <div className="flex items-start gap-3">
                  <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-medium ${done ? 'bg-green-500/20 text-green-400' : 'bg-gold-500/15 text-gold-300'}`}>
                    {done ? '✓' : index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{song.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-gray-400">
                      {song.artist && <span className="truncate">{song.artist}</span>}
                      <Badge size="sm" variant="primary">Tono: {songRef.key}</Badge>
                      {song.bpm && <Badge size="sm" variant="secondary">BPM: {song.bpm}</Badge>}
                      {director && (
                        <span className="flex items-center gap-1"><User size={12} /> {director.name}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contador de pasadas */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => addPractice(songRef.songId, 1)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gold-gradient text-black font-semibold hover:brightness-110 active:scale-[0.98] transition-all"
                  >
                    <Plus size={18} /> La practiqué
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="min-w-[3.5rem] text-center">
                      <span className="block text-2xl font-bold leading-none">{log.timesPracticed}</span>
                      <span className="block text-[10px] uppercase tracking-wide text-gray-500">
                        {log.timesPracticed === 1 ? 'pasada' : 'pasadas'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => addPractice(songRef.songId, -1)}
                      disabled={!log.timesPracticed}
                      className="p-2 rounded-lg border border-neutral-700 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                      aria-label="Restar una pasada"
                    >
                      <Minus size={14} />
                    </button>
                  </div>
                </div>

                {/* Checks de dominio */}
                <div className="flex flex-wrap gap-2">
                  {MASTERY_CHECKS.map(({ field, label, icon: CheckIcon }) => {
                    const active = !!log[field];
                    return (
                      <button
                        key={field}
                        type="button"
                        onClick={() => updateLog(songRef.songId, { [field]: !active })}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all ${
                          active
                            ? 'bg-green-500/20 text-green-300 border-green-500/50'
                            : 'bg-neutral-800/60 text-gray-400 border-neutral-700 hover:border-neutral-600'
                        }`}
                      >
                        <CheckIcon size={14} /> {label}
                      </button>
                    );
                  })}
                </div>

                {/* Dificultad percibida + accesos directos */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 mr-1">Me resultó:</span>
                    {DIFFICULTIES.map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => updateLog(songRef.songId, { difficulty: log.difficulty === d.id ? null : d.id })}
                        className={`px-2.5 py-1 rounded-full border text-xs transition-all ${
                          log.difficulty === d.id
                            ? d.selected
                            : 'bg-neutral-800/60 text-gray-400 border-neutral-700 hover:border-neutral-600'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {song.bpm && (() => {
                      const isTicking = metronome.active?.songId === songRef.songId;
                      return (
                        <button
                          type="button"
                          onClick={() =>
                            isTicking
                              ? metronome.stop()
                              : metronome.start(songRef.songId, Number(song.bpm), beatsPerBarOf(song.compass))
                          }
                          aria-label={`Metrónomo a ${song.bpm} BPM`}
                          aria-pressed={isTicking}
                          className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm transition-all ${
                            isTicking
                              ? 'bg-gold-500/20 text-gold-200 border border-gold-500/50'
                              : 'bg-neutral-800/60 text-gray-400 border border-neutral-700 hover:border-neutral-600'
                          }`}
                        >
                          <Timer size={16} />
                          {isTicking && (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-gold-300 animate-metronome-beat"
                              style={{ animationDuration: `${60 / Number(song.bpm)}s` }}
                            />
                          )}
                          <span className="text-xs">{song.bpm}</span>
                        </button>
                      );
                    })()}
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={BookOpen}
                      onClick={() => setViewerSong({ song, orderKey: songRef.key })}
                    >
                      Acordes
                    </Button>
                    {song.youtubeUrl && (
                      <a
                        href={song.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                        aria-label={`Escuchar ${song.title} en YouTube`}
                      >
                        <Youtube size={18} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}

        {order.songs.length === 0 && (
          <Card>
            <EmptyState
              icon={MusicNotes}
              title="Todavía no hay canciones"
              subtitle="Este orden aún no tiene canciones cargadas para practicar."
              annotation="Cargalas desde el orden"
            />
          </Card>
        )}
      </div>

      {/* Viewer de acordes en la tonalidad del orden */}
      <Modal
        isOpen={!!viewerSong}
        onClose={() => setViewerSong(null)}
        title={viewerSong?.song.title}
        size="xl"
      >
        {viewerSong ? (() => {
          const { song, orderKey } = viewerSong;
          const originalKey = song.originalKey || song.key;
          const structure = orderKey && orderKey !== originalKey
            ? transposeSongStructure(song.structure || [], originalKey, orderKey)
            : (song.structure || []);
          return (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="primary">Tono del orden: {orderKey || originalKey}</Badge>
                {orderKey && orderKey !== originalKey && (
                  <Badge variant="secondary">Original: {originalKey}</Badge>
                )}
                {song.compass && <Badge variant="secondary">Compás: {song.compass}</Badge>}
                {song.bpm && <Badge variant="secondary">BPM: {song.bpm}</Badge>}
              </div>
              <div className="space-y-4">
                {structure.map((section, i) => (
                  <div key={i} className="bg-neutral-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="primary" size="sm">{section.label}</Badge>
                    </div>
                    {section.chords && (
                      <p className="text-gold-300 font-mono text-lg mb-3">{section.chords}</p>
                    )}
                    {section.content && (
                      <p className="text-gray-300 whitespace-pre-line leading-relaxed">{section.content}</p>
                    )}
                  </div>
                ))}
                {structure.length === 0 && (
                  <EmptyState
                    icon={MusicNotesSimple}
                    title="Sin acordes cargados"
                    subtitle="Esta canción todavía no tiene acordes en el repertorio."
                    annotation="Cargalos desde Repertorio"
                  />
                )}
              </div>
            </div>
          );
        })() : null}
      </Modal>
    </div>
  );
};
