import React, { useState, useMemo } from 'react';
import { Megaphone, Hourglass, Users, PartyPopper, HeartHandshake, X, Check } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useCurrentMember } from '../../hooks/useCurrentMember';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { Modal } from '../ui/Modal';
import { SuccessModal, ErrorModal } from '../ui/ConfirmModal';

const loadDismissed = () => {
  try { return new Set(JSON.parse(localStorage.getItem('adorapp_collab_dismissed') || '[]')); } catch { return new Set(); }
};
const saveDismissed = (set) => { try { localStorage.setItem('adorapp_collab_dismissed', JSON.stringify([...set])); } catch { /* non-fatal */ } };

const fmtFecha = (dateStr) => {
  if (!dateStr) return '';
  try {
    return new Date(String(dateStr).slice(0, 10) + 'T12:00:00Z')
      .toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' });
  } catch { return String(dateStr); }
};
const todayART = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
const daysUntil = (dateStr) => {
  if (!dateStr) return 7;
  const target = new Date(String(dateStr).slice(0, 10) + 'T12:00:00');
  const diff = Math.ceil((target - todayART()) / (24 * 60 * 60 * 1000)) + 1;
  return Math.min(90, Math.max(1, diff));
};

const GoldBanner = ({ icon: Icon, children, tone = 'gold' }) => (
  <div className={`rounded-2xl p-5 border ${tone === 'muted'
    ? 'border-neutral-800 bg-neutral-900/60'
    : 'border-gold-500/25 bg-gradient-to-br from-gold-600/[0.24] via-neutral-900 to-gold-300/[0.08]'}`}>
    <div className="flex items-start gap-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${tone === 'muted'
        ? 'bg-neutral-800 ring-neutral-700 text-neutral-400'
        : 'bg-gold-500/15 ring-gold-500/25 text-gold-300'}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  </div>
);

// Banner(s) de "Solicitar colaboración" en el inicio. Se auto-oculta si no hay
// nada para mostrar (SilentBoundary lo envuelve). Cuatro estados por rol:
// invitado (ofrecerse) · ofrecido (esperando) · el que pidió (gestionar) · resultado.
export const CollaborationBanner = () => {
  const member = useCurrentMember();
  const getCollaborationFeed = useAppStore((s) => s.getCollaborationFeed);
  const getCollaborationVolunteers = useAppStore((s) => s.getCollaborationVolunteers);
  const offerCollaboration = useAppStore((s) => s.offerCollaboration);
  const coverCollaboration = useAppStore((s) => s.coverCollaboration);
  const cancelCollaboration = useAppStore((s) => s.cancelCollaboration);
  const getBandById = useAppStore((s) => s.getBandById);
  const orders = useAppStore((s) => s.orders);
  const members = useAppStore((s) => s.members);
  // subscribe so banners recompute on realtime changes
  const reqs = useAppStore((s) => s.collaborationRequests);
  const parts = useAppStore((s) => s.collaborationParticipants);

  const [busyId, setBusyId] = useState(null);
  const [justOffered, setJustOffered] = useState(() => new Set());
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [manage, setManage] = useState(null); // request being managed (cover wizard)
  const [chosen, setChosen] = useState('');
  const [days, setDays] = useState(7);
  const [error, setError] = useState({ isOpen: false, title: '', message: '' });
  const [success, setSuccess] = useState({ isOpen: false, title: '', message: '' });

  const feed = useMemo(
    () => (member?.id ? getCollaborationFeed(member.id) : { invited: [], offered: [], managing: [], results: [] }),
    [member?.id, getCollaborationFeed, reqs, parts],
  );

  if (!member?.id) return null;

  const bandName = (id) => getBandById(id)?.name || 'la banda';
  const orderFecha = (orderId) => fmtFecha(orders.find((o) => o.id === orderId)?.date);
  const cats = (r) => (r.categories || []).join(', ');
  const memberById = (id) => members.find((m) => m.id === id);

  // "ofrecido" incluye los que acabo de ofrecer (optimista) aunque el realtime tarde.
  const invited = feed.invited.filter((r) => !justOffered.has(r.id));
  const offered = [...feed.offered, ...feed.invited.filter((r) => justOffered.has(r.id))];
  const results = feed.results.filter((x) => !dismissed.has(x.request.id));

  const nothing = !invited.length && !offered.length && !feed.managing.length && !results.length;
  if (nothing) return null;

  const handleOffer = async (r) => {
    if (busyId) return;
    setBusyId(r.id);
    const res = await offerCollaboration(r.id);
    setBusyId(null);
    if (res?.ok) setJustOffered((prev) => new Set(prev).add(r.id));
    else setError({ isOpen: true, title: 'No se pudo', message: res?.error || 'Intentá de nuevo.' });
  };

  const openManage = (r) => {
    setManage(r); setChosen(''); setDays(daysUntil(orders.find((o) => o.id === r.orderId)?.date));
  };
  const closeManage = () => { setManage(null); setChosen(''); };

  const handleCover = async () => {
    if (!manage || !chosen || busyId) return;
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 90) { setError({ isOpen: true, title: 'Días inválidos', message: 'Elegí un número entre 1 y 90.' }); return; }
    setBusyId('cover');
    const res = await coverCollaboration({ requestId: manage.id, memberId: chosen, days: n });
    setBusyId(null);
    if (res?.ok) {
      closeManage();
      setSuccess({ isOpen: true, title: 'Colaboración cubierta', message: 'Sumamos al voluntario como temporal y avisamos a todos. ¡Gracias!' });
    } else {
      setError({ isOpen: true, title: 'No se pudo cubrir', message: res?.error || 'Intentá de nuevo.' });
    }
  };

  const handleCancel = async () => {
    if (!manage || busyId) return;
    setBusyId('cancel');
    const res = await cancelCollaboration(manage.id);
    setBusyId(null);
    if (res?.ok) { closeManage(); }
    else setError({ isOpen: true, title: 'No se pudo cancelar', message: res?.error || 'Intentá de nuevo.' });
  };

  const dismissResult = (id) => setDismissed((prev) => { const n = new Set(prev).add(id); saveDismissed(n); return n; });

  const volunteers = manage ? getCollaborationVolunteers(manage.id) : [];

  return (
    <div className="space-y-3">
      {invited.map((r) => (
        <GoldBanner key={r.id} icon={Megaphone}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gold-100">Se busca {cats(r)} para {bandName(r.bandId)}</p>
              <p className="text-xs text-neutral-400 mt-0.5">Servicio del {orderFecha(r.orderId)} · ¿Podés dar una mano?</p>
            </div>
            <Button variant="primary" size="sm" icon={Check} onClick={() => handleOffer(r)} disabled={busyId === r.id} className="shrink-0">
              {busyId === r.id ? 'Enviando…' : 'Yo me ofrezco'}
            </Button>
          </div>
        </GoldBanner>
      ))}

      {offered.map((r) => (
        <GoldBanner key={r.id} icon={Hourglass} tone="muted">
          <p className="text-sm font-medium text-neutral-200">Ya te ofreciste para {bandName(r.bandId)}</p>
          <p className="text-xs text-neutral-500 mt-0.5">Te avisamos si te eligen para el servicio del {orderFecha(r.orderId)}.</p>
        </GoldBanner>
      ))}

      {feed.managing.map((r) => {
        const n = getCollaborationVolunteers(r.id).length;
        return (
          <GoldBanner key={r.id} icon={Users}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gold-100">
                  Tenés {n} {n === 1 ? 'voluntario' : 'voluntarios'} para {bandName(r.bandId)}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5">{cats(r)} · servicio del {orderFecha(r.orderId)}</p>
              </div>
              <Button variant="primary" size="sm" icon={HeartHandshake} onClick={() => openManage(r)} className="shrink-0">
                Ver y cubrir
              </Button>
            </div>
          </GoldBanner>
        );
      })}

      {results.map(({ request: r, outcome }) => (
        <GoldBanner key={r.id} icon={outcome === 'accepted' ? PartyPopper : HeartHandshake} tone={outcome === 'accepted' ? 'gold' : 'muted'}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {outcome === 'accepted' ? (
                <>
                  <p className="text-sm font-semibold text-gold-100">¡Gracias por colaborar!</p>
                  <p className="text-xs text-neutral-300 mt-0.5">Ya sos parte de {bandName(r.bandId)} para el servicio del {orderFecha(r.orderId)}. Tenés acceso a todo.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-neutral-200">La colaboración ya está cubierta</p>
                  <p className="text-xs text-neutral-500 mt-0.5">¡Gracias por ofrecerte para {bandName(r.bandId)}! Tu disposición vale muchísimo. 🙏</p>
                </>
              )}
            </div>
            <button onClick={() => dismissResult(r.id)} aria-label="Cerrar" className="shrink-0 text-neutral-500 hover:text-neutral-300 p-1">
              <X size={16} />
            </button>
          </div>
        </GoldBanner>
      ))}

      {/* Wizard "Cubrir solicitud" */}
      <Modal isOpen={!!manage} onClose={closeManage} title="Cubrir la colaboración" size="md"
        footer={(
          <div className="flex flex-col sm:flex-row sm:justify-between gap-2">
            <Button variant="ghost" onClick={handleCancel} disabled={!!busyId}>Cancelar solicitud</Button>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={closeManage}>Cerrar</Button>
              <Button variant="primary" onClick={handleCover} disabled={!chosen || !!busyId}>
                {busyId === 'cover' ? 'Cubriendo…' : 'Cubrir solicitud'}
              </Button>
            </div>
          </div>
        )}>
        {manage && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-400">
              Elegí quién cubre {cats(manage)} en {bandName(manage.bandId)} para el servicio del {orderFecha(manage.orderId)}.
              Lo sumamos como <strong className="text-gold-200">temporal</strong> por los días que indiques.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {volunteers.length === 0 && <p className="text-sm text-neutral-500">Todavía no hay voluntarios.</p>}
              {volunteers.map((p) => {
                const m = memberById(p.memberId);
                if (!m) return null;
                const on = chosen === p.memberId;
                return (
                  <button key={p.id} type="button" onClick={() => setChosen(p.memberId)}
                    className={`w-full flex items-center gap-3 rounded-xl p-3 border text-left transition-colors ${
                      on ? 'bg-gold-500/15 border-gold-500/50' : 'bg-neutral-800/60 border-neutral-700 hover:border-neutral-600'
                    }`}>
                    <Avatar name={m.name} src={m.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{m.name}</p>
                      <p className="text-xs text-neutral-400 truncate">{(m.instruments || []).join(', ') || 'Sin instrumentos'}</p>
                    </div>
                    {on && <Check size={18} className="text-gold-300 shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">¿Por cuántos días? (1 a 90)</label>
              <input type="number" min="1" max="90" value={days} onChange={(e) => setDays(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 text-white" />
              <p className="mt-1.5 text-xs text-neutral-500">Cuenta como integrante pleno de la banda hasta que venza. Después desaparece solo.</p>
            </div>
          </div>
        )}
      </Modal>

      <SuccessModal isOpen={success.isOpen} onClose={() => setSuccess({ ...success, isOpen: false })} title={success.title} message={success.message} />
      <ErrorModal isOpen={error.isOpen} onClose={() => setError({ ...error, isOpen: false })} title={error.title} message={error.message} />
    </div>
  );
};
