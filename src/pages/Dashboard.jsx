import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  CalendarClock,
  ChevronRight,
  Guitar,
  Mic2,
  Drum,
  Piano,
  User,
  Ban,
  RotateCcw
} from 'lucide-react';
import {
  UsersThree,
  MicrophoneStage,
  MusicNotes as MusicNotesDuo,
  CalendarDots,
  TrendUp,
  Lightning,
} from '@phosphor-icons/react';
import { useAppStore } from '../stores/appStore';
import { useCurrentRole, useCurrentMember } from '../hooks/useCurrentMember';
import { useAuthStore } from '../stores/authStore';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { StatCard } from '../components/ui/StatCard';
import { EmptyState } from '../components/ui/EmptyState';
import { GoldWave } from '../components/ui/GoldWave';
import { SilentBoundary } from '../components/ui/SilentBoundary';
import { GreetingHeader } from '../components/dashboard/GreetingHeader';
import { PrepBanner } from '../components/dashboard/PrepBanner';
import { ObserverAreaBanners } from '../components/dashboard/ObserverAreaBanners';
import { RehearsalActionModal } from '../components/orders/RehearsalActionModal';
import { lineupInstrumentsFor } from '../lib/lineup';

// Fecha `YYYY-MM-DD` parseada LOCAL (landmine #50: `new Date('2026-09-11')` es UTC
// y en ART muestra el día anterior).
const parseLocalDate = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00`);
import { ServiceFeedbackPrompt } from '../components/dashboard/ServiceFeedbackPrompt';
import { CollaborationBanner } from '../components/dashboard/CollaborationBanner';

const getInstrumentIcon = (instrument) => {
  const lower = instrument.toLowerCase();
  if (lower.includes('guitarra')) return Guitar;
  if (lower.includes('voz') || lower.includes('coros')) return Mic2;
  if (lower.includes('bater')) return Drum;
  if (lower.includes('piano') || lower.includes('teclado')) return Piano;
  return User;
};

export const Dashboard = () => {
  useDocumentTitle('Inicio');
  const { members, bands, songs, orders, getUnusedSongs, isOrderParticipant, getEffectiveBandMemberIds } = useAppStore();
  useAppStore((s) => s.bandTemporaryMembers); // re-render si cambia la pertenencia efectiva
  const role = useCurrentRole();
  const member = useCurrentMember();
  const profile = useAuthStore((s) => s.profile);

  const activeMembers = members.filter(m => m.active).length;
  const upcomingOrders = orders.filter(o => o.status === 'scheduled');
  const unusedSongs = getUnusedSongs(4);
  const recentSongs = songs.slice(0, 4);

  // "Hoy tenés ensayo" card: shown only on the rehearsal day, between 08:00 and
  // 23:00 ART. We read the current ART wall-clock via toLocaleString (ART is
  // UTC-3, no DST) so date + hour are correct regardless of the device's TZ.
  const artNow = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })
  );
  const todayART = `${artNow.getFullYear()}-${String(artNow.getMonth() + 1).padStart(2, '0')}-${String(artNow.getDate()).padStart(2, '0')}`;
  const artHour = artNow.getHours();
  // Solo se muestra a quien PARTICIPA del servicio (formación) — antes se la
  // mostraba a todo el mundo, fuera o no de la banda. El pastor la ve siempre.
  const todaysRehearsal = orders.find(
    (o) => o.rehearsalDate && String(o.rehearsalDate).slice(0, 10) === todayART
      && o.status === 'scheduled'  // un orden cancelado no anuncia su ensamble (cancelar arrastra)
      && (role === 'pastor' || isOrderParticipant(o, member?.id))
  );
  const showRehearsalCard = !!todaysRehearsal && artHour >= 8 && artHour < 23;
  const rehearsalBand = todaysRehearsal
    ? bands.find((b) => b.id === todaysRehearsal.bandId)
    : null;
  // Suspender/Reactivar/Reprogramar desde el card: pastor cualquiera; líder solo su banda
  // (miembro permanente) — espeja el gate de la RPC.
  const canManageRehearsal = role === 'pastor'
    || (role === 'leader' && rehearsalBand?.members?.includes(member?.id));
  const [rehearsalModal, setRehearsalModal] = useState({ isOpen: false, order: null, mode: null });
  const [rehearsalReasonOpen, setRehearsalReasonOpen] = useState(false);

  // Each stat card doubles as a shortcut to its section — but only for roles
  // that can actually reach that section (mirrors the nav + route guards:
  // /miembros is pastor/leader only, the rest are open to all roles). When the
  // role lacks access the card renders as a plain, non-clickable info tile.
  // The Órdenes card counts only 'scheduled' orders (upcomingOrders): counting
  // every order ever created would balloon into the hundreds over time and stop
  // meaning "lo que viene".
  const stats = [
    { label: 'Miembros Activos', value: activeMembers, icon: UsersThree, to: '/miembros', roles: ['pastor', 'leader'] },
    { label: 'Bandas', value: bands.length, icon: MicrophoneStage, to: '/bandas' },
    { label: 'Canciones', value: songs.length, icon: MusicNotesDuo, to: '/repertorio' },
    { label: 'Órdenes', value: upcomingOrders.length, icon: CalendarDots, to: '/ordenes' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Encabezado premium "Mi Adorapp" — SIEMPRE presente (saludo + versículo del
          día + hora + cumpleaños + rol/instrumento). Construido para no lanzar. */}
      <GreetingHeader
        member={member}
        role={role}
        todayART={todayART}
        artHour={artHour}
        profileName={profile?.name}
      />

      {/* Preparación personal — CONDICIONAL: sólo si el miembro participa en un
          orden programado próximo con canciones. En SilentBoundary para que, ante
          cualquier problema, no muestre nada sin tumbar la app (el saludo queda). */}
      <SilentBoundary>
        <PrepBanner member={member} todayART={todayART} />
      </SilentBoundary>

      {/* Feedback post-servicio — CONDICIONAL y OPTATIVO: sólo para pastor/líder de la
          banda de un servicio ya ocurrido (≥4h), que todavía no envió su devolución.
          En SilentBoundary por la misma razón que PrepBanner. */}
      <SilentBoundary>
        <ServiceFeedbackPrompt member={member} role={role} />
      </SilentBoundary>

      {/* Colaboración — banners CONDICIONALES: invitado (ofrecerse), ofrecido (esperando),
          el que pidió (gestionar y cubrir) y resultado. Se auto-ocultan si no hay nada.
          (El botón "Solicitar colaboración" vive en la sección Bandas.) */}
      <SilentBoundary>
        <CollaborationBanner />
      </SilentBoundary>

      {/* Hoy tenés ensamble — full-width highlight card. Si el ensamble está SUSPENDIDO,
          cambia de color y lo dice, con "ver más" del motivo. Botones Suspender/Reactivar/
          Reprogramar para pastor/líder de la banda. Ya no es un <Link> entero (un botón dentro
          de un link es inválido y roba el tap): el link "Ver el orden" es interno. */}
      {showRehearsalCard && todaysRehearsal && (() => {
        const suspended = todaysRehearsal.rehearsalSuspended;
        return (
          <div className={`rounded-2xl p-4 sm:p-5 shadow-lg ${suspended ? 'bg-rose-500/15 border border-rose-500/40 text-white' : 'bg-gold-gradient text-black'}`} data-testid="rehearsal-card">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl shrink-0 ${suspended ? 'bg-rose-500/20 text-rose-200' : 'bg-black/10 text-black'}`}>
                {suspended ? <Ban size={28} /> : <CalendarClock size={28} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold">{suspended ? 'Ensamble suspendido' : '¡Hoy tenés ensamble!'}</p>
                <p className={`text-sm font-medium truncate ${suspended ? 'text-rose-100/90' : 'text-black/80'}`}>
                  {rehearsalBand?.name || 'Banda'}
                  {todaysRehearsal.rehearsalTime ? ` · ${todaysRehearsal.rehearsalTime}` : ''}
                  {suspended ? ' — el servicio sigue en pie' : ''}
                </p>
              </div>
            </div>

            {suspended && todaysRehearsal.rehearsalSuspendedReason && (
              <div className="mt-2">
                <button type="button" className="text-xs text-rose-200 underline" onClick={() => setRehearsalReasonOpen((v) => !v)}>
                  {rehearsalReasonOpen ? 'Ocultar motivo' : 'Ver más'}
                </button>
                {rehearsalReasonOpen && (
                  <p className="mt-1 text-sm text-rose-50/90 whitespace-pre-wrap">{todaysRehearsal.rehearsalSuspendedReason}</p>
                )}
              </div>
            )}

            {/* Acciones en UNA sola línea en celu (390 px): las tres con el MISMO estilo que
                "Ver el orden" (tinta negra sobre dorado; blanca sobre rosa si está suspendido).
                Un <Button variant="secondary"> (texto gris claro + borde gris) no se leía sobre
                el dorado. Etiquetas cortas ("Suspender" / "Reprogramar") para que entren. */}
            {(() => {
              // flex-1 + flex-wrap: en 375/390 px las tres comparten la fila (medido con Inter
              // real: 301 px de contenido mínimo); en pantallas más angostas la última baja de
              // línea en vez de desbordar. text-xs + íconos 13 px + px-2 para que entren.
              const action = `flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${suspended ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-black/10 text-black hover:bg-black/20'}`;
              const open = (mode) => setRehearsalModal({ isOpen: true, order: todaysRehearsal, mode });
              return (
                <div className="mt-3 flex flex-wrap gap-1.5" data-testid="rehearsal-card-actions">
                  <Link to={`/ordenes?order=${todaysRehearsal.id}`} className={action}>
                    Ver el orden <ChevronRight size={13} />
                  </Link>
                  {canManageRehearsal && (suspended ? (
                    <button type="button" className={action} onClick={() => open('resume')}><RotateCcw size={13} /> Reactivar</button>
                  ) : (
                    <button type="button" className={action} onClick={() => open('suspend')}><Ban size={13} /> Suspender</button>
                  ))}
                  {canManageRehearsal && (
                    <button type="button" className={action} onClick={() => open('reschedule')}><CalendarClock size={13} /> Reprogramar</button>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })()}

      <RehearsalActionModal
        order={rehearsalModal.order}
        mode={rehearsalModal.mode}
        isOpen={rehearsalModal.isOpen}
        onClose={() => setRehearsalModal({ isOpen: false, order: null, mode: null })}
        onDone={() => setRehearsalReasonOpen(false)}
      />

      {/* Banners de las áreas observadoras (Multimedia / Sonido) — identidad + atajos.
          Van DESPUÉS de todo lo de Adoración (prioridad). Se auto-ocultan si el miembro
          no es de esas áreas o si no hay órdenes relevantes. En SilentBoundary. */}
      <SilentBoundary>
        <ObserverAreaBanners member={member} todayART={todayART} />
      </SilentBoundary>

      {/* Stats Grid — each card links to its section when the role can access it */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const canAccess = !stat.roles || stat.roles.includes(role);
          const card = (
            <StatCard label={stat.label} value={stat.value} icon={stat.icon} interactive={canAccess} />
          );
          return canAccess ? (
            <Link key={stat.label} to={stat.to} className="block h-full">{card}</Link>
          ) : (
            <div key={stat.label} className="h-full">{card}</div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Songs */}
        <Card className="relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Canciones Recientes</h3>
            <Link to="/repertorio" className="text-sm font-medium text-gold-300 hover:text-gold-200 transition-colors">
              Ver todas →
            </Link>
          </div>
          <div className="relative space-y-3">
            {recentSongs.map((song) => (
              <div
                key={song.id}
                className="hover-relief flex items-center justify-between p-3 rounded-lg bg-neutral-800/50 hover:bg-neutral-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gold-gradient-soft ring-1 ring-gold-500/40 flex items-center justify-center">
                    <MusicNotesDuo size={22} weight="duotone" className="text-gold-100" />
                  </div>
                  <div>
                    <p className="font-medium">{song.title}</p>
                    <p className="text-sm text-gray-400">{song.artist}</p>
                  </div>
                </div>
                <Badge variant="primary" size="sm">Tono: {song.key}</Badge>
              </div>
            ))}
          </div>
          <GoldWave className="absolute -bottom-2 left-0 w-full h-16" opacity={0.18} />
        </Card>

        {/* Upcoming Services */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Próximos Servicios</h3>
            <Link to="/ordenes" className="text-sm font-medium text-gold-300 hover:text-gold-200 transition-colors">
              Ver agenda →
            </Link>
          </div>
          <div className="space-y-3">
            {upcomingOrders.slice(0, 3).map((order) => {
              const band = bands.find(b => b.id === order.bandId);
              // Chip personal de formación: "Tocás: Batería" / "Participás" /
              // "No estás en la formación" (solo si integra la banda).
              const inBand = !!member?.id && getEffectiveBandMemberIds(order.bandId).has(member.id);
              const participates = inBand && isOrderParticipant(order, member.id);
              const myInstruments = participates ? lineupInstrumentsFor(order, member) : [];
              const chip = !inBand ? null
                : participates
                  ? { variant: 'gold', text: myInstruments.length ? `Tocás: ${myInstruments.join(' y ')}` : 'Participás' }
                  : { variant: 'default', text: 'No estás en la formación' };
              return (
                <div
                  key={order.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-neutral-800/50"
                >
                  <div className="w-12 h-12 rounded-xl bg-gold-gradient-soft ring-1 ring-gold-500/40 flex items-center justify-center">
                    <CalendarDots size={24} weight="duotone" className="text-gold-100" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{parseLocalDate(order.date).toLocaleDateString('es-ES', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                    <p className="text-sm text-gray-400">{order.time} - {band?.name}</p>
                    {chip && (
                      <span className="mt-1 inline-block" data-testid="upcoming-lineup-chip">
                        <Badge variant={chip.variant} size="sm">{chip.text}</Badge>
                      </span>
                    )}
                  </div>
                  <Badge variant="primary" size="sm">{order.songs.length} canciones</Badge>
                </div>
              );
            })}
            {upcomingOrders.length === 0 && (
              <EmptyState
                icon={CalendarDots}
                title="No hay servicios programados"
                subtitle="Aún no hay servicios en tu agenda. Planificá el próximo encuentro."
                annotation="Programá desde Órdenes"
              />
            )}
          </div>
        </Card>

        {/* Quick Stats */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Resumen Rápido</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 rounded-xl bg-neutral-800/50">
              <TrendUp size={30} weight="duotone" className="mx-auto text-gold-100 mb-2" />
              <p className="text-2xl font-bold">{orders.filter(o => o.status === 'completed').length}</p>
              <p className="text-xs text-gray-400">Servicios completados</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-neutral-800/50">
              <Lightning size={30} weight="duotone" className="mx-auto text-gold-100 mb-2" />
              <p className="text-2xl font-bold">{unusedSongs.length}</p>
              <p className="text-xs text-gray-400">Canciones sin usar 4+ sem</p>
            </div>
          </div>
        </Card>

        {/* Ministry Members */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Miembros Activos</h3>
            <Badge variant="primary" size="sm">{activeMembers} miembros</Badge>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {members.filter(m => m.active).map((member) => {
              const InstrumentIcon = member.instruments[0] ? getInstrumentIcon(member.instruments[0]) : User;
              return (
                <div
                  key={member.id}
                  className="hover-relief flex items-center gap-3 px-3 py-2.5 bg-neutral-800/50 rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer"
                  title={`${member.instruments.join(', ')}`}
                >
                  <Avatar name={member.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{member.name}</p>
                    <p className="text-xs text-gray-400 truncate">{member.instruments.slice(0, 2).join(', ')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <InstrumentIcon size={14} className="text-gray-500" />
                    <Badge
                      variant={member.role === 'pastor' ? 'warning' : member.role === 'leader' ? 'primary' : 'default'}
                      size="sm"
                    >
                      {member.role === 'pastor' ? 'Pastor' : member.role === 'leader' ? 'Líder' : 'Miembro'}
                    </Badge>
                  </div>
                </div>
              );
            })}
            {members.filter(m => m.active).length === 0 && (
              <p className="text-gray-400 text-sm text-center py-4">No hay miembros activos</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
