import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Music2, CalendarClock, Clock, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { Badge } from '../ui/Badge';
import { uniqueSongIds, ensayometroPercent, pendingSongIds } from '../../lib/ensayometro';

// Banner de PREPARACIÓN — SOLO LECTURA y CONDICIONAL: aparece únicamente si el
// miembro participa (su banda) en un orden PROGRAMADO próximo con canciones. Si no
// hay nada que informar, renderiza null (el encabezado del Dashboard queda intacto).
// El % sale del util compartido (idéntico a Mi Ensayo y al cron). Va envuelto en un
// SilentBoundary desde el Dashboard; igual está blindado (optional chaining +
// try/catch + guard 'alive') por correr bajo el ErrorBoundary raíz.

const fmtDate = (d) => {
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  } catch {
    return '';
  }
};

// Orden 'scheduled' más próximo, de una banda que integra el miembro, con canciones.
// Mismo filtro que el cron send_practice_reminders() (landmine #27). Función de
// módulo (pura) para que el useMemo del componente sea preservable por el compiler.
const resolveActiveOrder = (orders, memberId, todayART, getEffectiveBandMemberIds) => {
  try {
    if (!memberId || !Array.isArray(orders)) return null;
    const cmp = (a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const at = a.time || '', bt = b.time || '';
      if (at !== bt) return at < bt ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    };
    return orders.reduce((best, o) => {
      const ok = o?.status === 'scheduled' &&
        o?.date && String(o.date).slice(0, 10) >= todayART &&
        Array.isArray(o.songs) && o.songs.length > 0 &&
        getEffectiveBandMemberIds(o.bandId).has(memberId);
      if (!ok) return best;
      return best === null || cmp(o, best) < 0 ? o : best;
    }, null);
  } catch {
    return null;
  }
};

export const PrepBanner = ({ member, todayART }) => {
  const orders = useAppStore((s) => s.orders);
  const getBandById = useAppStore((s) => s.getBandById);
  const getSongById = useAppStore((s) => s.getSongById);
  const fetchPracticeLogs = useAppStore((s) => s.fetchPracticeLogs);
  const getEffectiveBandMemberIds = useAppStore((s) => s.getEffectiveBandMemberIds);
  const bandTemporaryMembers = useAppStore((s) => s.bandTemporaryMembers);

  // El orden 'scheduled' más próximo, de una banda que integra el miembro
  // (permanente o temporal vigente), con canciones. Mismo filtro que el cron
  // send_practice_reminders() (landmine #27) — que también usa el miembro efectivo.
  const activeOrder = useMemo(
    () => resolveActiveOrder(orders, member?.id, todayART, getEffectiveBandMemberIds),
    [orders, member?.id, todayART, getEffectiveBandMemberIds, bandTemporaryMembers]
  );

  const [prep, setPrep] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!activeOrder?.id) {
      setPrep(null);
      return () => { alive = false; };
    }
    (async () => {
      try {
        const rows = await fetchPracticeLogs(activeOrder.id);
        if (!alive) return;
        const logsById = {};
        (rows || []).forEach((r) => { if (r?.songId) logsById[r.songId] = r; });
        const ids = uniqueSongIds(activeOrder);
        const percent = ensayometroPercent(ids, logsById);
        const missing = pendingSongIds(ids, logsById)
          .map((id) => getSongById(id)?.title)
          .filter(Boolean);
        setPrep({ percent, missing });
      } catch {
        if (alive) setPrep(null);
      }
    })();
    return () => { alive = false; };
  }, [activeOrder, fetchPracticeLogs, getSongById]);

  if (!activeOrder || !prep) return null;

  const band = getBandById(activeOrder.bandId);
  const percent = prep.percent;
  const ready = percent >= 100;
  const hasRehearsal = !!activeOrder.rehearsalDate;

  return (
    <Link
      to={`/practica/${activeOrder.id}`}
      className="block rounded-2xl p-5 border border-gold-500/25 bg-gradient-to-br from-gold-600/[0.28] via-neutral-900 to-gold-300/[0.10] hover:border-gold-500/50 transition-colors"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-500/15 ring-1 ring-gold-500/25 text-gold-300">
          <Music2 size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">Tu preparación</p>
            <span className={`text-sm font-bold tabular-nums ${ready ? 'text-green-300' : 'text-gold-200'}`}>{percent}%</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {band?.name ? `${band.name} · ` : ''}orden del {fmtDate(activeOrder.date)}
          </p>

          {/* Barra de progreso */}
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-neutral-700/50">
            <div
              className={`h-full rounded-full ${ready ? 'bg-green-400' : 'bg-gradient-to-r from-gold-400 to-gold-600'}`}
              style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
            />
          </div>

          {/* Canciones que faltan / al 100% */}
          {ready ? (
            <p className="mt-2.5 text-xs text-green-300">✓ ¡Estás al 100%, listo para el ensamble!</p>
          ) : prep.missing.length > 0 ? (
            <div className="mt-2.5">
              <p className="text-xs text-gray-400 mb-1.5">Te falta practicar:</p>
              <div className="flex flex-wrap gap-1.5">
                {prep.missing.slice(0, 6).map((title, i) => (
                  <Badge key={`${title}-${i}`} variant="default" size="sm">{title}</Badge>
                ))}
                {prep.missing.length > 6 && (
                  <span className="text-xs text-gray-500 self-center">+{prep.missing.length - 6} más</span>
                )}
              </div>
            </div>
          ) : null}

          {/* Horarios */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
            {hasRehearsal && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock size={13} className="text-gold-400" />
                Ensamble: {fmtDate(activeOrder.rehearsalDate)}{activeOrder.rehearsalTime ? ` · ${activeOrder.rehearsalTime}` : ''}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock size={13} className="text-gold-400" />
              Servicio: {fmtDate(activeOrder.date)}{activeOrder.time ? ` · ${activeOrder.time}` : ''}
            </span>
          </div>
        </div>
        <ChevronRight size={20} className="text-gray-600 shrink-0 self-center" />
      </div>
    </Link>
  );
};
