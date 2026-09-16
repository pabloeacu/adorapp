import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../stores/appStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { buildChannelRows, duplicateChannels } from '../../lib/channelPlan';

const parseLocalDate = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00`);

// Plan de canales (micrófonos) por orden. Autonumerado desde la formación, con colores
// por instrumento y números editables (los guarda quien puede: pastor/líder/Sonido).
export const ChannelPlanModal = ({ order, isOpen, onClose, canEdit = false }) => {
  const getOrderLineupGroups = useAppStore((s) => s.getOrderLineupGroups);
  const getBandById = useAppStore((s) => s.getBandById);
  const [overrides, setOverrides] = useState({});
  const [drafts, setDrafts] = useState({}); // key -> texto crudo mientras se edita (permite vaciar)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !order) return undefined;
    let alive = true;
    setLoading(true);
    setError('');
    setDrafts({});
    (async () => {
      try {
        const { data } = await supabase
          .from('order_channel_plans').select('plan').eq('order_id', order.id).maybeSingle();
        if (alive) setOverrides(data?.plan || {});
      } catch {
        if (alive) setOverrides({});
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [isOpen, order?.id]);

  const groups = order ? (getOrderLineupGroups(order)?.groups || []) : [];
  const rows = useMemo(() => buildChannelRows(groups, overrides), [groups, overrides]);
  const dups = useMemo(() => duplicateChannels(rows), [rows]);
  const band = order?.bandId ? getBandById?.(order.bandId) : null;
  const fecha = order?.date ? parseLocalDate(order.date).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';

  // Mientras se edita guardamos el texto crudo (incluido ''), sin tocar los overrides:
  // así la fila no salta al autonumerado ni se reordena hasta que el operador termina.
  const handleChannelChange = (key, value) => setDrafts((prev) => ({ ...prev, [key]: value }));

  // Al salir del campo, el texto se resuelve: número válido → override; vacío/ inválido → auto.
  const handleChannelBlur = (key) => {
    const raw = drafts[key];
    setDrafts((prev) => { const { [key]: _omit, ...rest } = prev; return rest; });
    if (raw === undefined) return;
    const n = parseInt(raw, 10);
    setOverrides((prev) => {
      if (Number.isFinite(n) && n > 0) return { ...prev, [key]: n };
      const { [key]: _o, ...rest } = prev;
      return rest;
    });
  };

  // Overrides efectivos incluyendo ediciones aún sin blur (para que "Guardar" nunca las pierda).
  const resolveOverrides = () => {
    const out = { ...overrides };
    for (const [key, raw] of Object.entries(drafts)) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0) out[key] = n; else delete out[key];
    }
    return out;
  };

  const handleReset = () => { setOverrides({}); setDrafts({}); };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const full = {};
      buildChannelRows(groups, resolveOverrides()).forEach((r) => { full[r.key] = r.channel; });
      const { error: upErr } = await supabase
        .from('order_channel_plans')
        .upsert({ order_id: order.id, plan: full, updated_at: new Date().toISOString() }, { onConflict: 'order_id' });
      if (upErr) throw upErr;
      onClose();
    } catch {
      setError('No se pudo guardar el plan. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Plan de canales"
      size="md"
      footer={canEdit ? (
        <>
          <Button variant="secondary" onClick={handleReset} icon={RotateCcw}>Autonumerar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar plan'}</Button>
        </>
      ) : null}
    >
      <div className="space-y-3">
        <div>
          <p className="text-sm text-white font-semibold capitalize">{fecha}{band ? ` · ${band.name}` : ''}</p>
          <p className="text-xs text-gray-400">
            {canEdit
              ? 'Numerado desde la formación. Cambiá el número para calzarlo con tu consola; se guarda por orden.'
              : 'Numerado desde la formación (color por instrumento).'}
          </p>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-sm">{error}</div>
        )}

        {dups.size > 0 && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>Hay canales repetidos ({[...dups].join(', ')}). Revisá que cada fuente tenga su número.</span>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500 py-4 text-center">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            Este orden todavía no tiene formación con instrumentos. Definí la formación para armar el plan.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.key}
                className="flex items-center gap-3 rounded-xl px-3 py-2 border border-white/10 bg-white/[0.03]"
              >
                {canEdit ? (
                  <input
                    type="number"
                    min="1"
                    value={drafts[r.key] !== undefined ? drafts[r.key] : r.channel}
                    onChange={(e) => handleChannelChange(r.key, e.target.value)}
                    onBlur={() => handleChannelBlur(r.key)}
                    className="shrink-0 h-10 w-12 rounded-lg text-center font-bold text-black border-0 focus:ring-2 focus:ring-white/40"
                    style={{ background: r.color }}
                    aria-label={`Canal de ${r.instrument} (${r.name})`}
                  />
                ) : (
                  <div className="shrink-0 grid place-items-center h-10 w-12 rounded-lg font-bold text-black" style={{ background: r.color }}>
                    {r.channel}
                  </div>
                )}
                <span className="shrink-0 h-3 w-3 rounded-full" style={{ background: r.color }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-white font-medium leading-tight truncate">{r.instrument}</p>
                  <p className="text-xs text-gray-400 truncate">{r.name}</p>
                </div>
                <span className="shrink-0 text-[11px] text-gray-500 uppercase tracking-wider">CH {r.channel}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
