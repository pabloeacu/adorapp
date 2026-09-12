import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Mic2, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { effectiveAreas, OBSERVER_AREAS } from '../../lib/areas';
import { isMinistrationSong } from '../../lib/ministration';
import { resolveMinistrationNotice, ministrationNoticeWindow } from '../../lib/bannerLifetime';
import { useLifetimeTick } from '../../hooks/useLifetimeTick';

// Aviso de MINISTRACIÓN para quienes la reciben (no para quien la asigna): durante un
// servicio EN EJECUCIÓN (3 h desde la hora de inicio), si el orden ya tiene canción(es)
// de ministración, la formación del servicio y las áreas observadoras (Multimedia/Sonido)
// ven "Ministración: <canción> en <tono>" con el director y el atajo al orden. El líder de
// la banda y el pastor NO lo ven (ya tienen "¿Con qué ministramos?" con lo asignado).
// Se auto-oculta al vencer la ventana (bannerLifetime.js), sin recargar.
export const MinistrationNotice = ({ member, role }) => {
  const orders = useAppStore((s) => s.orders);
  const bands = useAppStore((s) => s.bands);
  const bandTemporaryMembers = useAppStore((s) => s.bandTemporaryMembers);
  const getBandById = useAppStore((s) => s.getBandById);
  const getSongById = useAppStore((s) => s.getSongById);
  const getMemberById = useAppStore((s) => s.getMemberById);
  const isOrderParticipant = useAppStore((s) => s.isOrderParticipant);

  const windows = useMemo(
    () => orders.filter((o) => o?.status === 'scheduled').map(ministrationNoticeWindow),
    [orders]
  );
  const nowMs = useLifetimeTick(windows);

  const isObserver = effectiveAreas(member, role).some((a) => OBSERVER_AREAS.includes(a));
  const order = useMemo(
    () => resolveMinistrationNotice(orders, member, role, { getBandById, isOrderParticipant, isObserver }, nowMs),
    [orders, bands, bandTemporaryMembers, member, role, getBandById, isOrderParticipant, isObserver, nowMs]
  );
  if (!order) return null;

  const band = getBandById(order.bandId);
  const songs = (order.songs || []).filter(isMinistrationSong);

  return (
    <div
      data-testid="ministration-notice"
      className="rounded-2xl p-4 sm:p-5 border border-gold-500/30 bg-gradient-to-br from-gold-600/[0.24] via-neutral-900 to-gold-300/[0.08]"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-500/15 ring-1 ring-gold-500/25 text-gold-300">
          <Mic2 size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gold-100">Ministración de hoy</p>
          <p className="text-xs text-neutral-400 mt-0.5">{band?.name || 'Servicio'}{order.time ? ` · ${order.time}` : ''}</p>
          <ul className="mt-2 space-y-1">
            {songs.map((ref, i) => {
              const song = getSongById(ref.songId);
              const director = ref.directorId ? getMemberById?.(ref.directorId) : null;
              return (
                <li key={`${ref.songId}-${i}`} className="text-sm text-white">
                  <span className="font-semibold">{song?.title || 'Canción'}</span>
                  {ref.key ? <span className="text-gold-200"> en {ref.key}</span> : null}
                  {director?.name ? <span className="text-neutral-400 text-xs"> · dirige {director.name}</span> : null}
                </li>
              );
            })}
          </ul>
          <Link
            to={`/ordenes?order=${order.id}`}
            className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gold-500/15 text-gold-100 border border-gold-500/30 hover:bg-gold-500/25 transition-colors"
          >
            Ver el orden <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
};
