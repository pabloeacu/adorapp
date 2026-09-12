import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MonitorPlay, FileText, Loader2, SlidersHorizontal } from 'lucide-react';
import { useAppStore, MEETING_TYPES } from '../../stores/appStore';
import { memberAreas } from '../../lib/areas';
import { pickObserverFocus, observerBannerContent } from '../../lib/observerBanners';
import { downloadOrderLyricsDocx } from '../../lib/lyricsDocx';
import { isChunkLoadError, recoverFromStaleChunk } from '../../lib/chunkRecovery';
import { ChannelPlanModal } from '../orders/ChannelPlanModal';

// Banners premium de las áreas OBSERVADORAS (Multimedia / Sonido). Identidad (su logo),
// orientación (qué hay hoy / qué se viene / si hubo cambios) y atajos directos. No
// reemplazan los correos. Van DESPUÉS de todo lo de Adoración (esa es la prioridad).

const parseLocalDate = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00`);

// Los dos logos ya son blancos/color sobre transparente → van TAL CUAL sobre el medallón
// negro (blanco sólido sobre negro sólido). Sin invertir, sin engrosar, sin watermark.
const AREA_STYLE = {
  // Apilado si tiene ambas: Multimedia arriba, Sonido abajo.
  multimedia: {
    label: 'Área de Multimedia',
    logo: '/area-multimedia.png',
    accent: '#c9a24a',
    btnText: '#000',
  },
  sonido: {
    label: 'Área de Sonido',
    logo: '/area-sonido.png',
    accent: '#e0322b',
    btnText: '#fff',
  },
};

const STACK_ORDER = ['multimedia', 'sonido'];

const AreaBanner = ({ area, order, state }) => {
  const getServiceSchema = useAppStore((s) => s.getServiceSchema);
  const getBandById = useAppStore((s) => s.getBandById);
  const getSongById = useAppStore((s) => s.getSongById);
  const [downloading, setDownloading] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const st = AREA_STYLE[area];
  const content = observerBannerContent(area, state);
  if (!st || !content || !order) return null;

  const band = order.bandId ? getBandById?.(order.bandId) : null;
  const hasSchema = !!getServiceSchema?.(order.id);
  const fecha = parseLocalDate(order.date).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const isEnsambleState = state === 'ensamble' || state === 'ensamble_suspendido';
  const hora = isEnsambleState
    ? (order.rehearsalTime ? `Ensamble ${order.rehearsalTime}` : null)
    : (order.time || null);

  const handleDocx = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const meetingLabel = band?.name
        || MEETING_TYPES.find((m) => m.id === order.meetingType)?.label
        || 'Servicio';
      await downloadOrderLyricsDocx(order, getSongById, meetingLabel);
    } catch (err) {
      // `docx` se carga por import() dinámico: si el chunk quedó viejo por una publicación
      // nueva, recargar una vez. Cualquier otro fallo no rompe nada; se puede reintentar.
      if (isChunkLoadError(err)) recoverFromStaleChunk();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 sm:p-5 border bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900"
      style={{ borderColor: `${st.accent}40`, borderLeftWidth: 4, borderLeftColor: st.accent }}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full opacity-20 blur-3xl"
        style={{ background: st.accent }}
        aria-hidden="true"
      />

      <div className="relative flex items-start gap-4">
        <div
          className="shrink-0 grid place-items-center h-20 w-20 sm:h-24 sm:w-24 rounded-2xl bg-black border"
          style={{ borderColor: `${st.accent}66` }}
        >
          <img src={st.logo} alt={st.label} className="h-16 w-16 sm:h-[76px] sm:w-[76px] object-contain" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: st.accent }}>
            {st.label}
          </p>
          <p className="text-lg font-bold text-white leading-tight">{content.title}</p>
          <p className="text-sm text-gray-300 mt-1">{content.message}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-gray-300 capitalize">
              {fecha}{band ? ` · ${band.name}` : ''}{hora ? ` · ${hora}` : ''}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to={`/ordenes?order=${order.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all hover:brightness-110"
              style={{ background: st.accent, color: st.btnText }}
            >
              Ver el orden <ChevronRight size={16} />
            </Link>

            {area === 'multimedia' && (
              <button
                type="button"
                onClick={handleDocx}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border text-gray-200 transition-colors hover:bg-white/5 disabled:opacity-60"
                style={{ borderColor: `${st.accent}66` }}
              >
                {downloading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {downloading ? 'Generando…' : 'Descargar letras (Word)'}
              </button>
            )}

            {area === 'sonido' && (
              <button
                type="button"
                onClick={() => setPlanOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border text-gray-200 transition-colors hover:bg-white/5"
                style={{ borderColor: `${st.accent}66` }}
              >
                <SlidersHorizontal size={16} /> Plan de canales
              </button>
            )}

            {area === 'sonido' && hasSchema && (
              <Link
                to={`/servicio/${order.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border text-gray-200 transition-colors hover:bg-white/5"
                style={{ borderColor: `${st.accent}66` }}
              >
                <MonitorPlay size={16} /> Abrir presentador
              </Link>
            )}
          </div>
        </div>
      </div>

      {area === 'sonido' && (
        <ChannelPlanModal order={order} isOpen={planOpen} onClose={() => setPlanOpen(false)} canEdit />
      )}
    </div>
  );
};

export const ObserverAreaBanners = ({ member, todayART }) => {
  const orders = useAppStore((s) => s.orders);
  const areas = memberAreas(member);
  const mine = STACK_ORDER.filter((a) => areas.includes(a));

  const changedSinceART = useMemo(() => {
    const d = new Date(`${todayART}T00:00:00`);
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [todayART]);

  if (!mine.length) return null;

  const banners = mine
    .map((area) => {
      const focus = pickObserverFocus(area, orders, todayART, changedSinceART);
      return focus ? { area, order: focus.order, state: focus.state } : null;
    })
    .filter(Boolean);

  if (!banners.length) return null;

  return (
    <div className="space-y-3">
      {banners.map((b) => (
        <AreaBanner key={b.area} area={b.area} order={b.order} state={b.state} />
      ))}
    </div>
  );
};
