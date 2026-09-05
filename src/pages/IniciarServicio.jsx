import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { X, Play, Pause, Square, ChevronRight, ChevronLeft, Gauge, Music2 } from 'lucide-react';
import { useAppStore, transposeSongStructure } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { GoldWave } from '../components/ui/GoldWave';
import { PageLoader } from '../components/ui/PageLoader';
import { sectionMeta, sectionDurationMin, sectionDisplayLabel } from '../lib/serviceSchema';

const fmtClock = (secs) => {
  if (secs == null) return null;
  const neg = secs < 0;
  const s = Math.abs(Math.round(secs));
  return `${neg ? '-' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Presentador "Iniciar servicio" — pantalla completa, POR DISPOSITIVO (cada músico
// avanza en su pantalla). Fuera del Layout (sin barra lateral). Muestra la sección
// actual con cuenta regresiva + Play/Stop/Siguiente; en "Adoración", una canción por
// vez con acordes en el tono del orden y autoscroll. Estado por-dispositivo en
// localStorage (resume tras refresh). Solo lectura de datos existentes.
export const IniciarServicio = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const loading = useAppStore((s) => s.loading);
  const orders = useAppStore((s) => s.orders);
  const initialize = useAppStore((s) => s.initialize);
  const getServiceSchema = useAppStore((s) => s.getServiceSchema);
  const getSongById = useAppStore((s) => s.getSongById);
  const getBandById = useAppStore((s) => s.getBandById);

  // Deep-link / refresh: si el store está vacío, cargarlo.
  useEffect(() => {
    if (orders.length === 0 && !loading) initialize?.();
  }, [orders.length, loading, initialize]);

  const order = orders.find((o) => o.id === orderId);
  const schema = getServiceSchema(orderId);
  const sections = schema?.sections || [];

  // Pasos planos: una sección normal = 1 paso; "Adoración" con N canciones = N pasos
  // (una canción por vez). Cada paso conoce su índice de sección (para la cuenta).
  const steps = useMemo(() => {
    const out = [];
    sections.forEach((s, si) => {
      if (s.type === 'adoracion' && (s.songIds || []).length > 0) {
        s.songIds.forEach((songId, k) => out.push({ kind: 'song', si, songId, songPos: k + 1, songTotal: s.songIds.length }));
      } else {
        out.push({ kind: 'section', si });
      }
    });
    return out;
  }, [sections]);

  const posKey = `adorapp_presenter_pos_${orderId}`;
  const [stepIdx, setStepIdx] = useState(() => {
    try { const v = parseInt(localStorage.getItem(posKey), 10); return Number.isInteger(v) ? v : 0; } catch { return 0; }
  });
  const [remaining, setRemaining] = useState(null);
  const [running, setRunning] = useState(false);
  const [dir, setDir] = useState(1); // dirección del slide

  const step = steps[Math.min(stepIdx, Math.max(0, steps.length - 1))];
  const curSection = step ? sections[step.si] : null;
  const curSectionIdx = step ? step.si : 0;

  // Persistir posición.
  useEffect(() => { try { localStorage.setItem(posKey, String(stepIdx)); } catch { /* non-fatal */ } }, [stepIdx, posKey]);

  // Reset de la cuenta al cambiar de SECCIÓN (no entre canciones de la misma sección).
  useEffect(() => {
    const dur = sectionDurationMin(sections[curSectionIdx]);
    setRemaining(dur ? dur * 60 : null);
    setRunning(false);
  }, [curSectionIdx, sections]);

  // Tick de la cuenta (deja pasar a negativo = tiempo excedido, en rojo).
  useEffect(() => {
    if (!running || remaining == null) return;
    const id = setInterval(() => setRemaining((r) => (r == null ? r : r - 1)), 1000);
    return () => clearInterval(id);
  }, [running, remaining == null]);

  // ---- Autoscroll (solo pasos de canción) ----
  const scrollRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(false);
  const [speed, setSpeed] = useState(() => { try { return Number(localStorage.getItem('adorapp_presenter_speed')) || 24; } catch { return 24; } });
  useEffect(() => { try { localStorage.setItem('adorapp_presenter_speed', String(speed)); } catch { /* non-fatal */ } }, [speed]);
  useEffect(() => { setAutoScroll(false); if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [stepIdx]);
  useEffect(() => {
    if (!autoScroll) return;
    let raf; let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const el = scrollRef.current;
      if (el) {
        el.scrollTop += speed * dt;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { setAutoScroll(false); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoScroll, speed]);

  if (!user) return <Navigate to="/login" replace />;
  if (!order || !schema) {
    if (loading || orders.length === 0) return <PageLoader fullscreen />;
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg">Este orden no tiene un esquema de reunión.</p>
        <button onClick={() => navigate('/ordenes')} className="rounded-lg bg-gold-gradient text-black px-4 py-2 font-semibold">Volver a Órdenes</button>
      </div>
    );
  }

  const band = getBandById(order.bandId);
  const total = steps.length;
  const go = (delta) => {
    setDir(delta);
    setStepIdx((i) => Math.max(0, Math.min(total - 1, i + delta)));
  };
  const overtime = remaining != null && remaining < 0;

  // Contenido del paso actual.
  const renderStep = () => {
    if (!step) return null;
    if (step.kind === 'song') {
      const song = getSongById(step.songId);
      const songRef = (order.songs || []).find((r) => r.songId === step.songId);
      const orderKey = songRef?.key;
      const originalKey = song?.originalKey || song?.key;
      const structure = song ? (orderKey && orderKey !== originalKey
        ? transposeSongStructure(song.structure || [], originalKey, orderKey)
        : (song.structure || [])) : [];
      return (
        <div className="flex flex-col h-full min-h-0">
          <div className="shrink-0 mb-3">
            <p className="text-gold-300/80 text-xs uppercase tracking-widest">{sectionDisplayLabel(curSection, sectionMeta(curSection?.type))} · canción {step.songPos} de {step.songTotal}</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">{song?.title || 'Canción'}</h2>
            {orderKey && <p className="text-sm text-gold-300 mt-0.5">Tono: {orderKey}</p>}
          </div>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
            {structure.length === 0 && <p className="text-neutral-500">Esta canción no tiene letra/acordes cargados.</p>}
            {structure.map((sec, i) => (
              <div key={i}>
                {sec.label && <p className="text-gold-300/70 text-xs uppercase tracking-wider mb-1">{sec.label}</p>}
                {sec.chords && <p className="text-gold-300 font-mono text-lg sm:text-xl mb-1 whitespace-pre-wrap">{sec.chords}</p>}
                {sec.content && <p className="text-gray-100 whitespace-pre-line leading-relaxed text-lg sm:text-2xl">{sec.content}</p>}
              </div>
            ))}
            <div className="h-40" aria-hidden="true" />
          </div>
        </div>
      );
    }
    // Sección no-canción: título grande + observación o frase por defecto.
    const meta = sectionMeta(curSection.type);
    const text = (curSection.note && curSection.note.trim()) ? curSection.note.trim() : meta.phrase;
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-4">
        <p className="text-gold-300/80 text-sm uppercase tracking-widest">{sectionDisplayLabel(curSection, meta)}</p>
        <p className="text-2xl sm:text-4xl font-semibold text-white max-w-2xl leading-snug text-balance">{text || meta.label}</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black text-white flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <GoldWave className="absolute -top-6 right-0 w-2/3 h-28 pointer-events-none" opacity={0.25} flip />

      {/* Barra superior */}
      <div className="relative shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gold-500/15">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{band?.name || 'Servicio'}</p>
          <p className="text-xs text-neutral-500 truncate">Paso {Math.min(stepIdx + 1, total)} de {total}</p>
        </div>
        {remaining != null && (
          <div className={`tabular-nums text-2xl sm:text-3xl font-bold ${overtime ? 'text-red-400' : 'text-gold-200'}`}>
            {fmtClock(remaining)}
          </div>
        )}
        <button onClick={() => navigate('/ordenes')} aria-label="Salir" className="shrink-0 rounded-lg p-2 text-neutral-400 hover:text-white hover:bg-white/5">
          <X size={22} />
        </button>
      </div>

      {/* Contenido (con transición slide por paso) */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div key={stepIdx} className={`h-full p-5 sm:p-8 ${dir >= 0 ? 'animate-slide-left' : 'animate-slide-right'}`}>
          {renderStep()}
        </div>
      </div>

      {/* Controles */}
      <div className="shrink-0 border-t border-gold-500/15 px-4 py-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        {step?.kind === 'song' && (
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setAutoScroll((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border transition-colors ${
                autoScroll ? 'bg-gold-500/20 border-gold-500/50 text-gold-200' : 'bg-neutral-900 border-neutral-700 text-neutral-300'}`}>
              <Gauge size={15} /> {autoScroll ? 'Autoscroll ON' : 'Autoscroll'}
            </button>
            <input type="range" min="6" max="90" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
              className="flex-1 max-w-[220px] accent-gold-500" aria-label="Velocidad de autoscroll" />
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => go(-1)} disabled={stepIdx === 0}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm text-neutral-300 hover:text-white disabled:opacity-30">
            <ChevronLeft size={18} /> Anterior
          </button>
          <div className="flex items-center gap-2">
            {remaining != null && (
              <>
                <button onClick={() => setRunning((r) => !r)} aria-label={running ? 'Pausar' : 'Iniciar'}
                  className="rounded-full p-3 bg-neutral-900 border border-neutral-700 text-gold-200 hover:border-gold-500/50">
                  {running ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button onClick={() => { const dur = sectionDurationMin(sections[curSectionIdx]); setRemaining(dur ? dur * 60 : null); setRunning(false); }}
                  aria-label="Reiniciar cuenta" className="rounded-full p-3 bg-neutral-900 border border-neutral-700 text-neutral-300 hover:text-white">
                  <Square size={18} />
                </button>
              </>
            )}
          </div>
          <button onClick={() => go(1)} disabled={stepIdx >= total - 1}
            className="inline-flex items-center gap-1 rounded-lg px-4 py-2.5 text-sm font-semibold bg-gold-gradient text-black disabled:opacity-40">
            Siguiente <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
