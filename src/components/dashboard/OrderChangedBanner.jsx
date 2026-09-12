import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { resolveOrderChanged, orderChangedWindow } from '../../lib/bannerLifetime';
import { useLifetimeTick } from '../../hooks/useLifetimeTick';

const fmtDate = (d) => {
  try {
    return new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
  } catch {
    return '';
  }
};

// "Hubo cambios en el orden" — para la BANDA efectiva del orden ∪ pastores, excluyendo a
// quien hizo el cambio (sello content_changed_by de la base). Vive 48 h desde el cambio y
// nunca después de la hora del servicio (bannerLifetime.js); se va solo, sin recargar.
// Lo que cambió en detalle ya viaja por correo/campanita; acá es el recordatorio visual.
export const OrderChangedBanner = ({ member, role }) => {
  const orders = useAppStore((s) => s.orders);
  const bands = useAppStore((s) => s.bands);
  const bandTemporaryMembers = useAppStore((s) => s.bandTemporaryMembers);
  const getBandById = useAppStore((s) => s.getBandById);
  const getEffectiveBandMemberIds = useAppStore((s) => s.getEffectiveBandMemberIds);

  const windows = useMemo(
    () => orders.filter((o) => o?.status === 'scheduled').map(orderChangedWindow),
    [orders]
  );
  const nowMs = useLifetimeTick(windows);

  const changed = useMemo(
    () => resolveOrderChanged(orders, member, role, { getEffectiveBandMemberIds }, nowMs).slice(0, 3),
    [orders, bands, bandTemporaryMembers, member, role, getEffectiveBandMemberIds, nowMs]
  );
  if (!changed.length) return null;

  return (
    <div className="space-y-3">
      {changed.map((o) => {
        const band = getBandById(o.bandId);
        return (
          <div
            key={o.id}
            data-testid="order-changed-banner"
            data-order={o.id}
            className="rounded-2xl p-4 sm:p-5 border border-gold-500/30 bg-gradient-to-br from-gold-600/[0.24] via-neutral-900 to-gold-300/[0.08]"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-500/15 ring-1 ring-gold-500/25 text-gold-300">
                <BellRing size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gold-100">Hubo cambios en el orden</p>
                <p className="text-xs text-neutral-300 mt-0.5 first-letter:uppercase">
                  {fmtDate(o.date)}{o.time ? ` · ${o.time}` : ''}{band?.name ? ` · ${band.name}` : ''}
                </p>
                <p className="text-xs text-neutral-400 mt-1">¿Ya los viste? Revisá las canciones, los tonos y la formación para llegar afinado.</p>
                <Link
                  to={`/ordenes?order=${o.id}`}
                  className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gold-500/15 text-gold-100 border border-gold-500/30 hover:bg-gold-500/25 transition-colors"
                >
                  Ver el orden <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
