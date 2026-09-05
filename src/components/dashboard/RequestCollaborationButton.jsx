import React, { useState, useMemo } from 'react';
import { Megaphone, Check } from 'lucide-react';
import { useAppStore, INSTRUMENTS, MEETING_TYPES } from '../../stores/appStore';
import { useCurrentRole } from '../../hooks/useCurrentMember';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { SelectMenu } from '../ui/SelectMenu';
import { SuccessModal, ErrorModal } from '../ui/ConfirmModal';

const fmtOrderLabel = (order, bands) => {
  const band = bands.find((b) => b.id === order.bandId);
  const mt = MEETING_TYPES.find((m) => m.id === order.meetingType);
  const d = order.date ? new Date(String(order.date).slice(0, 10) + 'T12:00:00Z')
    .toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' }) : '';
  return `${d}${mt ? ' · ' + mt.label : ''}${band ? ' · ' + band.name : ''}`;
};

// Botón "Solicitar colaboración" (solo pastor/líder) + su modal. Pide un reemplazo
// para un servicio: banda + categorías (múltiple) + orden activo → Edge Function.
export const RequestCollaborationButton = () => {
  const role = useCurrentRole();
  const bands = useAppStore((s) => s.bands);
  const orders = useAppStore((s) => s.orders);
  const requestCollaboration = useAppStore((s) => s.requestCollaboration);

  const [open, setOpen] = useState(false);
  const [bandId, setBandId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [categories, setCategories] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState({ isOpen: false, title: '', message: '' });
  const [error, setError] = useState({ isOpen: false, title: '', message: '' });

  // Solo los órdenes programados DE LA BANDA elegida: la banda tiene que coincidir
  // con la del orden (los recordatorios se resuelven por order.band_id).
  const scheduledOrders = useMemo(
    () => orders.filter((o) => o.status === 'scheduled' && bandId && o.bandId === bandId)
      .sort((a, b) => String(a.date).localeCompare(String(b.date))),
    [orders, bandId],
  );
  const activeBands = useMemo(() => bands.filter((b) => b.active !== false), [bands]);

  if (role !== 'pastor' && role !== 'leader') return null;

  const reset = () => { setBandId(''); setOrderId(''); setCategories([]); };
  const openModal = () => { reset(); setOpen(true); };
  const closeModal = () => { setOpen(false); reset(); };
  const toggleCat = (c) => setCategories((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!bandId) { setError({ isOpen: true, title: 'Falta la banda', message: 'Elegí para qué banda necesitás la colaboración.' }); return; }
    if (!categories.length) { setError({ isOpen: true, title: 'Falta la categoría', message: 'Elegí al menos una categoría (Voz, Piano, etc.).' }); return; }
    if (!orderId) { setError({ isOpen: true, title: 'Falta el orden', message: 'Elegí a qué servicio programado aplica.' }); return; }
    setSubmitting(true);
    const res = await requestCollaboration({ bandId, orderId, categories });
    setSubmitting(false);
    if (res?.ok) {
      closeModal();
      const n = res.invitedCount || 0;
      setSuccess({
        isOpen: true,
        title: 'Solicitud enviada',
        message: n > 0
          ? `Avisamos a ${n} ${n === 1 ? 'persona' : 'personas'} que pueden colaborar. Te avisamos cuando alguien se ofrezca.`
          : 'No hay nadie con esa categoría fuera de la banda por ahora. Probá con otra categoría.',
      });
    } else {
      setError({ isOpen: true, title: 'No se pudo enviar', message: res?.error || 'Intentá de nuevo.' });
    }
  };

  return (
    <>
      <Button variant="secondary" icon={Megaphone} onClick={openModal}
        className="!bg-black !text-gold-300 !border !border-gold-500/60 hover:!bg-gold-500/10 hover:!text-gold-100">
        Solicitar colaboración
      </Button>

      <Modal isOpen={open} onClose={closeModal} title="Solicitar colaboración" size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar solicitud'}
            </Button>
          </div>
        )}>
        <div className="space-y-5">
          <p className="text-sm text-neutral-400">
            Pedí un reemplazo para un servicio. Avisaremos por correo, notificación y en el inicio a
            todos los que toquen lo que buscás y no estén ya en la banda.
          </p>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">Banda</label>
            <SelectMenu value={bandId} onChange={(v) => { setBandId(v); setOrderId(''); }}
              placeholder="Elegí una banda…"
              options={activeBands.map((b) => ({ value: b.id, label: b.name }))} />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">¿Qué se busca? (podés elegir varias)</label>
            <div className="flex flex-wrap gap-2">
              {INSTRUMENTS.map((inst) => {
                const on = categories.includes(inst);
                return (
                  <button key={inst} type="button" onClick={() => toggleCat(inst)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border transition-colors ${
                      on ? 'bg-gold-500/20 border-gold-500/50 text-gold-200' : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-600'
                    }`}>
                    {on && <Check size={14} />}{inst}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1.5">¿Para qué servicio?</label>
            <SelectMenu value={orderId} onChange={setOrderId} disabled={!bandId} up
              placeholder="Elegí un orden programado…"
              options={scheduledOrders.map((o) => ({ value: o.id, label: fmtOrderLabel(o, bands) }))} />
            {!bandId && <p className="mt-1.5 text-xs text-neutral-500">Elegí primero una banda.</p>}
            {bandId && scheduledOrders.length === 0 && (
              <p className="mt-1.5 text-xs text-neutral-500">Esta banda no tiene órdenes programados. Creá uno en Órdenes primero.</p>
            )}
          </div>
        </div>
      </Modal>

      <SuccessModal isOpen={success.isOpen} onClose={() => setSuccess({ ...success, isOpen: false })}
        title={success.title} message={success.message} />
      <ErrorModal isOpen={error.isOpen} onClose={() => setError({ ...error, isOpen: false })}
        title={error.title} message={error.message} />
    </>
  );
};
