import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { SuccessModal, ErrorModal, ConfirmModal } from '../ui/ConfirmModal';
import { LineupEditor } from './LineupEditor';
import { buildLineup, lineupEntries, directorIdsOf, pendingChoiceIds } from '../../lib/lineup';

// Edición de la formación desde el detalle de un orden ya guardado.
// Guarda vía updateOrder (merge anti-DATA-LOSS); la base valida/normaliza y, si
// cambió, avisa SOLO a quien entra/sale/cambia de instrumento.
export const LineupModal = ({ isOpen, onClose, order, onSaved }) => {
  const updateOrder = useAppStore((s) => s.updateOrder);
  const getBandById = useAppStore((s) => s.getBandById);
  const getBandMembers = useAppStore((s) => s.getBandMembers);
  const [value, setValue] = useState({ mode: 'all', members: [] });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState({ isOpen: false, message: '' });
  const [error, setError] = useState({ isOpen: false, message: '' });
  const [pendingConfirm, setPendingConfirm] = useState({ isOpen: false, count: 0 });

  useEffect(() => {
    if (!isOpen || !order) return;
    const mode = order.lineup?.mode === 'custom' ? 'custom' : 'all';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue({ mode, members: mode === 'custom' ? lineupEntries(order.lineup) : [] });
  }, [isOpen, order]);

  const invalid = value.mode === 'custom' && value.members.length === 0;

  // Integrantes con la función SIN elegir (tocan varios instrumentos y no se
  // marcó ninguno). No bloquea, pero se confirma antes de guardar.
  const pendingCount = (() => {
    if (!order || value.mode !== 'custom') return 0;
    const membersById = new Map((getBandMembers(order.bandId) || []).map((m) => [m.id, m]));
    return pendingChoiceIds(value.members, membersById, directorIdsOf(order.songs)).size;
  })();

  const handleSave = async (opts = {}) => {
    if (!order || submitting || invalid) return;
    const built = buildLineup(value.mode, value.members);
    // No-op guard: si la formación quedó igual a la guardada, NO reenviar. Un
    // re-guardado sin cambios, si no, re-sella definedBy/definedAt y dispara
    // avisos "cambió la formación" fantasma a Sonido/Multimedia (el cliente no
    // manda definedBy/definedAt, así que el jsonb siempre difería en la base).
    const originalMode = order.lineup?.mode === 'custom' ? 'custom' : 'all';
    const original = buildLineup(originalMode, originalMode === 'custom' ? lineupEntries(order.lineup) : []);
    if (JSON.stringify(built) === JSON.stringify(original)) { onClose(); return; }
    // Aviso no bloqueante por funciones sin elegir (una sola vez).
    if (!opts.skipPendingCheck && pendingCount > 0) {
      setPendingConfirm({ isOpen: true, count: pendingCount });
      return;
    }
    setSubmitting(true);
    const res = await updateOrder(order.id, { lineup: built });
    setSubmitting(false);
    if (!res) {
      setError({ isOpen: true, message: useAppStore.getState().error || 'No se pudo guardar la formación. Intentá de nuevo.' });
      return;
    }
    const fresh = useAppStore.getState().orders.find((o) => o.id === order.id) || order;
    onClose();
    const n = fresh.lineup?.mode === 'custom' ? (fresh.lineup.members || []).length : null;
    setSuccess({ isOpen: true, message: n == null ? 'Participa toda la banda. Todos reciben los avisos de ensamble y ensayo.' : `Quedaron ${n} ${n === 1 ? 'integrante' : 'integrantes'} en la formación. Solo se avisó a quienes entran, salen o cambian de instrumento.` });
    onSaved?.(fresh);
  };

  const band = order ? getBandById(order.bandId) : null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={band ? `Formación · ${band.name}` : 'Formación'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancelar</Button>
            <Button onClick={() => handleSave()} disabled={submitting || invalid} data-testid="lineup-modal-save">
              {submitting ? 'Guardando…' : 'Guardar formación'}
            </Button>
          </>
        }
      >
        {order && (
          <LineupEditor
            bandId={order.bandId}
            songs={order.songs}
            orderDate={order.date}
            excludeOrderId={order.id}
            value={value}
            onChange={setValue}
          />
        )}
      </Modal>
      <SuccessModal isOpen={success.isOpen} onClose={() => setSuccess({ isOpen: false, message: '' })} title="Formación guardada" message={success.message} />
      <ErrorModal isOpen={error.isOpen} onClose={() => setError({ isOpen: false, message: '' })} title="No se pudo guardar" message={error.message} />
      <ConfirmModal
        isOpen={pendingConfirm.isOpen}
        onClose={() => setPendingConfirm({ isOpen: false, count: 0 })}
        onConfirm={() => { setPendingConfirm({ isOpen: false, count: 0 }); handleSave({ skipPendingCheck: true }); }}
        title="Falta elegir el instrumento"
        message={`Hay ${pendingConfirm.count} ${pendingConfirm.count === 1 ? 'integrante que toca varios instrumentos y no le elegiste' : 'integrantes que tocan varios instrumentos y no les elegiste'} con cuál participan en este servicio. Podés elegirlo ahora o guardar y definirlo después.`}
        type="warning"
        confirmText="Guardar igual"
        cancelText="Volver a elegir"
      />
    </>
  );
};
