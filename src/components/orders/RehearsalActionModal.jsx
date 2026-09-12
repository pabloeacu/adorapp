import React, { useEffect, useState } from 'react';
import { CalendarClock, Ban, RotateCcw } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useAppStore } from '../../stores/appStore';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Suspender / Reactivar / Reprogramar el ENSAMBLE de un orden. mode: 'suspend'|'resume'|'reschedule'.
// Escribe por las RPCs del store (autorización + avisos server-side). Motivo/nota SIEMPRE opcional.
export const RehearsalActionModal = ({ order, mode, isOpen, onClose, onDone }) => {
  const suspendRehearsal = useAppStore((s) => s.suspendRehearsal);
  const resumeRehearsal = useAppStore((s) => s.resumeRehearsal);
  const rescheduleRehearsal = useAppStore((s) => s.rescheduleRehearsal);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setReason('');
    setError('');
    setBusy(false);
    // Si el ensamble actual ya pasó, el campo arranca vacío (min = hoy): obliga a elegir un día nuevo.
    setDate(order?.rehearsalDate && order.rehearsalDate >= todayISO() ? order.rehearsalDate : '');
    setTime(order?.rehearsalTime || '18:00');
  }, [isOpen, order?.id, mode]);

  if (!order) return null;

  const cfg = {
    suspend: { title: 'Suspender ensamble', confirm: 'Suspender ensamble', icon: Ban },
    resume: { title: 'Reactivar ensamble', confirm: 'Reactivar ensamble', icon: RotateCcw },
    reschedule: { title: 'Reprogramar ensamble', confirm: 'Reprogramar', icon: CalendarClock },
  }[mode] || {};

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    let res;
    if (mode === 'suspend') res = await suspendRehearsal(order.id, reason);
    else if (mode === 'resume') res = await resumeRehearsal(order.id);
    else if (mode === 'reschedule') {
      if (!date || !time) { setError('Elegí día y hora del nuevo ensamble.'); setBusy(false); return; }
      res = await rescheduleRehearsal(order.id, date, time, reason);
    }
    setBusy(false);
    if (res?.ok) {
      onDone?.({ mode, reason: (reason || '').trim() || null, date, time });
      onClose();
    } else {
      setError('No se pudo completar la acción. Probá de nuevo.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={cfg.title}
      size="md"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={run} disabled={busy} icon={cfg.icon}>{busy ? 'Guardando…' : cfg.confirm}</Button>
        </>
      )}
    >
      <div className="space-y-3">
        {mode === 'suspend' && (
          <>
            <p className="text-sm text-gray-300">
              Se le avisará a la formación, a los pastores y al área de Sonido que <strong>se suspende el ensamble</strong>.
              El <strong>servicio sigue en pie</strong>: solo se suspende el encuentro de banda para ensamblar.
            </p>
            <label className="text-xs text-gray-400 font-medium uppercase block">Motivo (opcional)</label>
            <textarea
              className="w-full h-24 bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-gold-500/40"
              placeholder="Ej: se cortó la luz en el lugar de ensayo…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </>
        )}

        {mode === 'resume' && (
          <p className="text-sm text-gray-300">
            El ensamble <strong>vuelve a estar en pie</strong> el mismo día y horario. Se le avisará a la formación,
            a los pastores y al área de Sonido.
          </p>
        )}

        {mode === 'reschedule' && (
          <>
            <p className="text-sm text-gray-300">
              Elegí la <strong>nueva fecha y hora</strong> del ensamble. Se le avisará a la formación, a los pastores
              y al área de Sonido.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nuevo día" type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gold-500/40" />
              <Input label="Nueva hora" type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gold-500/40" />
            </div>
            <label className="text-xs text-gray-400 font-medium uppercase block">Nota (opcional)</label>
            <textarea
              className="w-full h-20 bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-gold-500/40"
              placeholder="Ej: lo movemos al jueves por el corte de luz…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </>
        )}

        {error && (
          <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-sm">{error}</div>
        )}
      </div>
    </Modal>
  );
};
