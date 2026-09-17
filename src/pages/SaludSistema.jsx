import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, Mail, ListChecks, Globe, AlertTriangle,
  RefreshCw, CheckCircle2, ShieldCheck,
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAppStore } from '../stores/appStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageLoader } from '../components/ui/PageLoader';

// Panel solo-pastor de "Salud del sistema". Lee la foto que arma el servidor
// (RPC system_health_snapshot) y la muestra con un semáforo por señal. Es
// SOLO LECTURA: no toca nada, no escribe nada. El servidor decide cada estado
// (espeja el monitor check_system_health) — acá sólo lo pintamos.

// Colores semánticos de estado (separados del acento dorado de la marca).
const STATUS = {
  ok:      { dot: 'bg-green-400', text: 'text-green-300', ring: 'ring-green-500/25', chip: 'bg-green-500/15 text-green-300', label: 'En orden' },
  warn:    { dot: 'bg-amber-400', text: 'text-amber-300', ring: 'ring-amber-500/30', chip: 'bg-amber-500/15 text-amber-300', label: 'Atención' },
  unknown: { dot: 'bg-gray-500',  text: 'text-gray-400',  ring: 'ring-gray-600/30',  chip: 'bg-neutral-700 text-gray-300', label: 'Sin datos' },
};
const st = (s) => STATUS[s] || STATUS.unknown;

const TZ = 'America/Argentina/Buenos_Aires';
const fmtTime = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  } catch { return '—'; }
};
const fmtAgo = (iso) => {
  if (!iso) return 'sin registro';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '—';
  const m = Math.round(diff / 60000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} día${d === 1 ? '' : 's'}`;
};

// Una tarjeta de señal: ícono tintado por estado + punto semáforo + valor grande
// + líneas de detalle.
const SignalCard = ({ icon: Icon, title, status, value, details }) => {
  const s = st(status);
  return (
    <Card padding="lg" className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-800 ring-1 ${s.ring}`}>
            <Icon className={`h-5 w-5 ${s.text}`} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-300">{title}</p>
            <p className={`mt-0.5 text-lg font-bold ${s.text} leading-tight`}>{value}</p>
          </div>
        </div>
        <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.chip}`}>
          <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden="true" />
          {s.label}
        </span>
      </div>
      {details && details.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-neutral-800 pt-3">
          {details.filter(Boolean).map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gray-600" aria-hidden="true" />
              <span className="min-w-0">{d}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export const SaludSistema = () => {
  useDocumentTitle('Salud del sistema');
  const getSystemHealth = useAppStore((s) => s.getSystemHealth);

  const [snap, setSnap] = useState(null);
  const [loading, setLoading] = useState(true);   // primera carga
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  const mounted = useRef(true);

  const load = useCallback(async (isManual) => {
    if (isManual) setRefreshing(true);
    try {
      const data = await getSystemHealth();
      if (!mounted.current) return;
      setSnap(data);
      setError(false);
      setFetchedAt(new Date().toISOString());
    } catch {
      if (!mounted.current) return;
      setError(true);
    } finally {
      if (!mounted.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [getSystemHealth]);

  useEffect(() => {
    mounted.current = true;
    load(false);
    // Se refresca solo cada 60 s mientras la pantalla está abierta.
    const id = setInterval(() => load(false), 60000);
    return () => { mounted.current = false; clearInterval(id); };
  }, [load]);

  if (loading) return <PageLoader label="Cargando el estado del sistema…" />;

  if (error && !snap) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Header refreshing={refreshing} onRefresh={() => load(true)} fetchedAt={fetchedAt} />
        <Card padding="lg" className="border-red-500/30">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-red-400 shrink-0" />
            <div>
              <p className="font-semibold text-white">No se pudo cargar el estado</p>
              <p className="mt-0.5 text-sm text-gray-400">Probá de nuevo con el botón «Actualizar». Si sigue sin cargar, avisá.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const mail = snap?.mail || {};
  const crons = snap?.crons || {};
  const site = snap?.site || {};
  const errors = snap?.errors || {};
  const overallOk = snap?.overall === 'ok';

  // Valores + detalles por señal, en lenguaje llano.
  const mailValue = mail.failed_24h > 0 ? `${mail.failed_24h} sin enviar`
    : mail.stuck_1h > 0 ? `${mail.stuck_1h} demorados`
    : 'Todo enviado';
  const mailDetails = [
    `Último correo enviado: ${fmtTime(mail.last_sent_at)} (${fmtAgo(mail.last_sent_at)})`,
    mail.pending_now > 0 ? `${mail.pending_now} en cola por salir` : 'Nada en cola',
    `Motor de envío: última vuelta ${fmtAgo(mail.worker_last_run)}`,
  ];

  const cronValue = crons.failed_24h > 0 ? `${crons.failed_24h} con fallas` : `${crons.active ?? '—'} al día`;
  const cronDetails = [
    `${crons.active ?? '—'} tareas automáticas activas`,
    crons.failed_24h > 0
      ? `${crons.failed_24h} corrida(s) fallaron en las últimas 24 h`
      : 'Ninguna falló en las últimas 24 h',
  ];

  const siteValue = site.status === 'unknown' ? 'Sin chequeo reciente'
    : site.ok ? 'En línea' : 'No responde';
  const siteDetails = [
    site.checked_at ? `Último chequeo ${fmtAgo(site.checked_at)}` : 'Todavía sin chequeos',
    site.status_code ? `Respondió ${site.status_code} en ${site.response_time_ms ?? '—'} ms` : null,
    'Vigilancia externa: UptimeRobot revisa el sitio cada 5 minutos',
  ];

  const errValue = errors.serious_24h > 0 ? `${errors.serious_24h} en 24 h` : 'Ninguno';
  const errDetails = errors.serious_24h > 0 && errors.latest
    ? [`Último: “${errors.latest.message || 'sin detalle'}” (${fmtAgo(errors.latest.occurred_at)})`]
    : ['Sin errores serios en las últimas 24 horas'];

  return (
    <div className="space-y-6 animate-fade-in">
      <Header refreshing={refreshing} onRefresh={() => load(true)} fetchedAt={fetchedAt} stale={error} />

      {/* Estado general (hero) */}
      <Card padding="lg" className={overallOk ? 'border-green-500/25' : 'border-amber-500/30'}>
        <div className="flex items-center gap-4">
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 ${overallOk ? 'bg-green-500/10 ring-green-500/25' : 'bg-amber-500/10 ring-amber-500/30'}`}>
            {overallOk
              ? <CheckCircle2 className="h-7 w-7 text-green-400" />
              : <AlertTriangle className="h-7 w-7 text-amber-400" />}
          </span>
          <div className="min-w-0">
            <h2 className={`text-xl font-bold ${overallOk ? 'text-green-300' : 'text-amber-300'}`}>
              {overallOk ? 'Todo en orden' : 'Requiere atención'}
            </h2>
            <p className="mt-0.5 text-sm text-gray-400">
              {overallOk
                ? 'La plataforma está funcionando con normalidad.'
                : 'Hay algo para mirar más abajo. Ya te llegó (o te va a llegar) un aviso por correo y notificación.'}
            </p>
          </div>
        </div>
      </Card>

      {/* Señales */}
      <div className="grid gap-4 sm:grid-cols-2">
        <SignalCard icon={Mail} title="Correos" status={mail.status} value={mailValue} details={mailDetails} />
        <SignalCard icon={ListChecks} title="Tareas automáticas" status={crons.status} value={cronValue} details={cronDetails} />
        <SignalCard icon={Globe} title="Sitio en línea" status={site.status} value={siteValue} details={siteDetails} />
        <SignalCard icon={AlertTriangle} title="Errores" status={errors.status} value={errValue} details={errDetails} />
      </div>

      {/* Nota tranquilizadora */}
      <Card padding="lg" className="bg-neutral-900/60">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-gold-300" />
          <p className="text-sm text-gray-400">
            Esta pantalla es solo para pastores y se actualiza sola cada minuto. No hace falta que la mires seguido:
            si algo se pone en <span className="text-amber-300 font-medium">amarillo</span>, además te llega un aviso
            por correo y notificación. Está para darte tranquilidad cuando te quede la duda de «¿andará todo bien?».
          </p>
        </div>
      </Card>
    </div>
  );
};

const Header = ({ refreshing, onRefresh, fetchedAt, stale }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-gradient-soft ring-[1.5px] ring-gold-500/50">
        <Activity className="h-5 w-5 text-gold-100" />
      </span>
      <div>
        <h1 className="text-2xl font-bold text-white leading-tight">Salud del sistema</h1>
        <p className="text-sm text-gray-500">
          {fetchedAt ? `Actualizado a las ${fmtTime(fetchedAt)}` : 'Estado en vivo de la plataforma'}
          {/* Si el último refresco falló pero seguimos mostrando datos previos,
              avisamos con honestidad (el dato de arriba puede estar viejo). */}
          {stale && <span className="text-amber-400"> · no se pudo actualizar recién</span>}
        </p>
      </div>
    </div>
    <Button variant="secondary" icon={RefreshCw} onClick={onRefresh} disabled={refreshing}
      className={refreshing ? 'opacity-70' : ''}>
      {refreshing ? 'Actualizando…' : 'Actualizar'}
    </Button>
  </div>
);

export default SaludSistema;
