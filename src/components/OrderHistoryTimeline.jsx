// OrderHistoryTimeline — pastor-only history of mutations on a specific
// order. Reads from audit_events filtered by table_name='orders' and
// record_id = <orderId>. RLS enforces pastor-only on the SELECT, so a
// non-pastor caller will simply see an empty list.

import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ACTION_META = {
  insert: { icon: Plus, color: 'text-green-400', bg: 'bg-green-500/15', label: 'Creado' },
  update: { icon: Pencil, color: 'text-blue-400', bg: 'bg-blue-500/15', label: 'Editado' },
  delete: { icon: Trash2, color: 'text-red-400', bg: 'bg-red-500/15', label: 'Eliminado' },
};

const FIELD_LABELS = {
  date: 'Fecha',
  time: 'Hora',
  band_id: 'Banda',
  meeting_type: 'Tipo de reunión',
  songs: 'Canciones',
  feedback: 'Devolución del pastor',
  status: 'Estado',
  updated_at: null, // ignore noise
  created_at: null,
};

function formatRelativeAR(date) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return then.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function summarizeChanges(changes) {
  if (!changes || typeof changes !== 'object') return null;
  const meaningful = Object.entries(changes).filter(([k]) => FIELD_LABELS[k] !== null && k !== 'id');
  if (meaningful.length === 0) return null;
  return meaningful.map(([k]) => FIELD_LABELS[k] || k).join(', ');
}

export function OrderHistoryTimeline({ orderId }) {
  const [events, setEvents] = useState(null); // null = loading, [] = empty
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from('audit_events')
        .select('id, occurred_at, actor_name, actor_role, action, changes, before, after')
        .eq('table_name', 'orders')
        .eq('record_id', orderId)
        .order('occurred_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setEvents([]);
        return;
      }
      setEvents(data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (events === null) {
    return (
      <div role="status" aria-live="polite" className="text-sm text-gray-500 flex items-center gap-2">
        <span className="sr-only">Cargando historial</span>
        <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        Cargando historial…
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-gray-500">No se pudo cargar el historial.</p>;
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        Sin actividad registrada todavía. Los cambios futuros van a aparecer acá.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {events.map((ev) => {
        const meta = ACTION_META[ev.action] || ACTION_META.update;
        const Icon = meta.icon;
        const fields = summarizeChanges(ev.changes);
        return (
          <li key={ev.id} className="flex gap-3 items-start">
            <div className={`p-1.5 rounded-full ${meta.bg} shrink-0`}>
              <Icon size={14} className={meta.color} />
            </div>
            <div className="flex-1 min-w-0 text-sm">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-medium text-white">{meta.label}</span>
                <span className="text-gray-400">por</span>
                <span className="text-white">{ev.actor_name || 'sistema'}</span>
                {ev.actor_role && (
                  <span className="text-xs text-gray-500 capitalize">({ev.actor_role})</span>
                )}
              </div>
              {fields && (
                <p className="text-gray-400 text-xs mt-0.5">
                  Cambió: <span className="text-gray-300">{fields}</span>
                </p>
              )}
              <p className="text-gray-500 text-xs mt-0.5 flex items-center gap-1">
                <Clock size={11} />
                {formatRelativeAR(ev.occurred_at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
