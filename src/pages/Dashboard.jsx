import React from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  CalendarClock,
  ChevronRight,
  Guitar,
  Mic2,
  Drum,
  Piano,
  User
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
import { ServiceFeedbackPrompt } from '../components/dashboard/ServiceFeedbackPrompt';
import { RequestCollaborationButton } from '../components/dashboard/RequestCollaborationButton';
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
  const { members, bands, songs, orders, getUnusedSongs } = useAppStore();
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
  const todaysRehearsal = orders.find(
    (o) => o.rehearsalDate && String(o.rehearsalDate).slice(0, 10) === todayART
  );
  const showRehearsalCard = !!todaysRehearsal && artHour >= 8 && artHour < 23;
  const rehearsalBand = todaysRehearsal
    ? bands.find((b) => b.id === todaysRehearsal.bandId)
    : null;

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

      {/* Solicitar colaboración — botón sólo pastor/líder (se auto-oculta si no lo es). */}
      <SilentBoundary>
        <RequestCollaborationButton />
      </SilentBoundary>

      {/* Colaboración — banners CONDICIONALES: invitado (ofrecerse), ofrecido (esperando),
          el que pidió (gestionar y cubrir) y resultado. Se auto-ocultan si no hay nada. */}
      <SilentBoundary>
        <CollaborationBanner />
      </SilentBoundary>

      {/* Hoy tenés ensayo — full-width highlight card, links to the order */}
      {showRehearsalCard && todaysRehearsal && (
        <Link
          to={`/ordenes?order=${todaysRehearsal.id}`}
          className="block rounded-2xl p-5 bg-gold-gradient text-black shadow-lg hover:brightness-105 transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-black/10 shrink-0">
              <CalendarClock size={28} className="text-black" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold">¡Hoy tenés ensamble!</p>
              <p className="text-sm font-medium text-black/80 truncate">
                {rehearsalBand?.name || 'Banda'}
                {todaysRehearsal.rehearsalTime ? ` · ${todaysRehearsal.rehearsalTime}` : ''} — tocá para ver el orden
              </p>
            </div>
            <ChevronRight size={24} className="text-black/70 shrink-0" />
          </div>
        </Link>
      )}

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
              return (
                <div
                  key={order.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-neutral-800/50"
                >
                  <div className="w-12 h-12 rounded-xl bg-gold-gradient-soft ring-1 ring-gold-500/40 flex items-center justify-center">
                    <CalendarDots size={24} weight="duotone" className="text-gold-100" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{new Date(order.date).toLocaleDateString('es-ES', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                    <p className="text-sm text-gray-400">{order.time} - {band?.name}</p>
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
