import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, CheckCircle2, X } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { Modal } from '../ui/Modal';
import { callAdminFunction } from '../../lib/supabase';

// Feedback post-servicio ("¿Cómo estuvimos?") — CONDICIONAL y OPTATIVO. Aparece en
// "Mi Adorapp" para un PASTOR (cualquier banda) o el LÍDER integrante de la banda de
// un servicio que ya ocurrió (≥ 4 h después de la hora del servicio, dentro de las
// últimas 2 semanas). Si no hay nada que ofrecer, o ya envié, o lo descarté →
// renderiza null (va en SilentBoundary desde el Dashboard). El envío va SOLO por la
// Edge Function send-service-feedback (valida rol server-side + manda por correo a la
// banda con copia a pastores).

const FOUR_H_MS = 4 * 3600 * 1000;
const RECENCY_MS = 14 * 86400 * 1000;

const fmtDate = (d) => {
  try {
    return new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  } catch {
    return '';
  }
};

// Epoch (ms, UTC) del inicio del servicio expresado en hora de Argentina (UTC-3, sin
// DST → UTC = ART + 3 h). Permite comparar contra Date.now() sin depender de la TZ
// del dispositivo.
const serviceStartEpoch = (date, time) => {
  if (!date) return null;
  const [Y, M, D] = String(date).slice(0, 10).split('-').map(Number);
  if (!Y || !M || !D) return null;
  const [h, mi] = String(time || '00:00').split(':').map(Number);
  return Date.UTC(Y, M - 1, D, (h || 0) + 3, mi || 0);
};

// Orden elegible más reciente para pedir feedback. Función de módulo (pura) para que
// el useMemo del componente sea preservable por el React Compiler (como PrepBanner).
const resolveFeedbackOrder = (orders, memberId, role, getBandById, nowMs) => {
  try {
    if (!Array.isArray(orders) || !memberId) return null;
    const isPastor = role === 'pastor';
    let best = null, bestS = -Infinity;
    for (const o of orders) {
      if (!o || o.status === 'cancelled' || !o.bandId) continue;
      const s = serviceStartEpoch(o.date, o.time);
      if (s == null) continue;
      if (nowMs < s + FOUR_H_MS) continue;      // todavía no pasaron 4 h del servicio
      if (nowMs > s + RECENCY_MS) continue;     // demasiado viejo (no molestar)
      const inBand = (getBandById(o.bandId)?.members || []).includes(memberId);
      if (!isPastor && !inBand) continue;       // pastor: cualquiera; líder: su banda
      if (s > bestS) { best = o; bestS = s; }   // el más reciente
    }
    return best;
  } catch {
    return null;
  }
};

const dismissKey = (orderId) => `adorapp_fb_dismissed_${orderId}`;

export const ServiceFeedbackPrompt = ({ member, role }) => {
  const orders = useAppStore((s) => s.orders);
  const getBandById = useAppStore((s) => s.getBandById);
  const fetchServiceFeedbackForOrder = useAppStore((s) => s.fetchServiceFeedbackForOrder);

  const [order, setOrder] = useState(null);
  // 'loading' | 'hidden' | 'prompt' | 'sent'
  const [status, setStatus] = useState('loading');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ queFunciono: '', queAjustamos: '', reflexion: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Resolvemos el orden elegible DENTRO del effect (ahí Date.now() es válido) y lo
  // guardamos en estado. Luego consultamos si ya envié / lo descarté para decidir si
  // mostrar la tarjeta.
  useEffect(() => {
    let alive = true;
    const o = resolveFeedbackOrder(orders, member?.id, role, getBandById, Date.now());
    setOrder(o);
    if (!o?.id) { setStatus('hidden'); return () => { alive = false; }; }
    let dismissed = false;
    try { dismissed = !!localStorage.getItem(dismissKey(o.id)); } catch { /* bloqueado → mostrar igual */ }
    if (dismissed) { setStatus('hidden'); return () => { alive = false; }; }
    (async () => {
      try {
        const rows = await fetchServiceFeedbackForOrder(o.id);
        if (!alive) return;
        const mineSent = (rows || []).some((r) => r?.author_id === member?.userId);
        setStatus(mineSent ? 'hidden' : 'prompt');
      } catch {
        if (alive) setStatus('hidden');
      }
    })();
    return () => { alive = false; };
  }, [orders, member?.id, member?.userId, role, getBandById, fetchServiceFeedbackForOrder]);

  const dismiss = () => {
    try { if (order?.id) localStorage.setItem(dismissKey(order.id), '1'); } catch { /* noop */ }
    setStatus('hidden');
  };

  const band = order ? getBandById(order.bandId) : null;
  const hasContent = form.queFunciono.trim() || form.queAjustamos.trim() || form.reflexion.trim();

  const handleSend = async () => {
    if (!order?.id || !hasContent || sending) return;
    setSending(true);
    setError('');
    const { data, error: err } = await callAdminFunction('send-service-feedback', {
      orderId: order.id,
      queFunciono: form.queFunciono,
      queAjustamos: form.queAjustamos,
      reflexion: form.reflexion,
    });
    setSending(false);
    if (err) {
      // Si ya se había enviado (otra pestaña/dispositivo), tratarlo como éxito.
      if (err === 'ya_enviado') { finishSent(); return; }
      setError(err || 'No se pudo enviar. Probá de nuevo.');
      return;
    }
    if (data?.ok || data) { finishSent(); }
  };

  const finishSent = () => {
    try { if (order?.id) localStorage.setItem(dismissKey(order.id), '1'); } catch { /* noop */ }
    setModalOpen(false);
    setStatus('sent');
  };

  if (status === 'loading' || status === 'hidden') return null;

  if (status === 'sent') {
    return (
      <div className="rounded-2xl p-4 border border-emerald-800/50 bg-emerald-950/30 flex items-center gap-3">
        <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
        <p className="text-sm text-emerald-200">
          ¡Gracias! Tu devolución se envió a la banda{' '}
          <span className="text-emerald-300/80">(con copia a los pastores)</span>.
        </p>
      </div>
    );
  }

  // status === 'prompt'
  return (
    <>
      <div className="rounded-2xl p-5 border border-gold-500/25 bg-gradient-to-br from-gold-600/[0.28] via-neutral-900 to-gold-300/[0.10]">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-500/15 ring-1 ring-gold-500/25 text-gold-300">
            <MessageSquare size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">¿Cómo estuvimos?</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {band?.name ? `${band.name} · ` : ''}servicio del {fmtDate(order.date)}. Dejá tu
              devolución para la banda.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setError(''); setModalOpen(true); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient hover:brightness-110px-3.5 py-2 text-sm font-semibold text-black transition-colors"
              >
                <MessageSquare size={15} /> Dar mi feedback
              </button>
              <button
                onClick={dismiss}
                className="rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-neutral-800 transition-colors"
              >
                Ahora no
              </button>
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Descartar"
            className="shrink-0 text-gray-600 hover:text-gray-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !sending && setModalOpen(false)}
        title="¿Cómo estuvimos?"
        size="lg"
        footer={
          <div className="flex flex-col gap-2">
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                disabled={sending}
                className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSend}
                disabled={!hasContent || sending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient hover:brightness-110px-4 py-2 text-sm font-semibold text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={15} /> {sending ? 'Enviando…' : 'Enviar a la banda'}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            {band?.name ? <><span className="text-gray-200">{band.name}</span> · </> : null}
            servicio del {fmtDate(order.date)}. Se enviará por correo a la banda, con copia a los
            pastores, firmado con tu nombre. Es opcional: completá lo que quieras.
          </p>

          <FeedbackField
            label="¿Qué funcionó?"
            accent="text-emerald-300"
            value={form.queFunciono}
            onChange={(v) => setForm((f) => ({ ...f, queFunciono: v }))}
            placeholder="Lo que salió bien, lo que sumó, lo que hay que sostener…"
          />
          <FeedbackField
            label="¿Qué ajustamos?"
            accent="text-amber-300"
            value={form.queAjustamos}
            onChange={(v) => setForm((f) => ({ ...f, queAjustamos: v }))}
            placeholder="Lo que podemos mejorar para la próxima…"
          />
          <FeedbackField
            label="Reflexión final"
            accent="text-gold-300"
            value={form.reflexion}
            onChange={(v) => setForm((f) => ({ ...f, reflexion: v }))}
            placeholder="Una palabra de aliento, una lectura del momento, gratitud…"
          />
        </div>
      </Modal>
    </>
  );
};

const MAXLEN = 2000;

const FeedbackField = ({ label, accent, value, onChange, placeholder }) => (
  <div>
    <label className={`block text-sm font-semibold mb-1.5 ${accent}`}>{label}</label>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value.slice(0, MAXLEN))}
      placeholder={placeholder}
      rows={3}
      className="w-full rounded-lg bg-neutral-800/60 border border-neutral-700 focus:border-gold-500 focus:ring-1 focus:ring-gold-500 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none resize-y"
    />
  </div>
);
