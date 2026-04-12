import React from 'react';
import {
  Users,
  Music2,
  CalendarDays,
  UsersRound,
  TrendingUp,
  Clock,
  ChevronRight,
  Zap,
  Calendar,
  Guitar,
  Mic2,
  Drum,
  Piano,
  User
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';

const getInstrumentIcon = (instrument) => {
  const lower = instrument.toLowerCase();
  if (lower.includes('guitarra')) return Guitar;
  if (lower.includes('voz') || lower.includes('coros')) return Mic2;
  if (lower.includes('bater')) return Drum;
  if (lower.includes('piano') || lower.includes('teclado')) return Piano;
  return User;
};

export const Dashboard = () => {
  const { members, bands, songs, orders, getUnusedSongs } = useAppStore();

  const activeMembers = members.filter(m => m.active).length;
  const upcomingOrders = orders.filter(o => o.status === 'scheduled');
  const unusedSongs = getUnusedSongs(4);
  const recentSongs = songs.slice(0, 4);

  const stats = [
    { label: 'Miembros Activos', value: activeMembers, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/20' },
    { label: 'Bandas', value: bands.length, icon: UsersRound, color: 'text-purple-400', bg: 'bg-purple-500/20' },
    { label: 'Canciones', value: songs.length, icon: Music2, color: 'text-green-400', bg: 'bg-green-500/20' },
    { label: 'Órdenes', value: orders.length, icon: CalendarDays, color: 'text-orange-400', bg: 'bg-orange-500/20' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="hover:border-neutral-700 transition-all">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-400">{stat.label}</p>
                <p className="text-3xl font-bold mt-1">{stat.value}</p>
              </div>
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon size={24} className={stat.color} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Songs */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Canciones Recientes</h3>
            <Badge variant="success" size="sm">+{unusedSongs.length} sin usar</Badge>
          </div>
          <div className="space-y-3">
            {recentSongs.map((song) => (
              <div
                key={song.id}
                className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/50 hover:bg-neutral-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <Music2 size={20} className="text-purple-400" />
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
        </Card>

        {/* Upcoming Services */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Próximos Servicios</h3>
            <Badge variant="warning" size="sm">{upcomingOrders.length} programadas</Badge>
          </div>
          <div className="space-y-3">
            {upcomingOrders.slice(0, 3).map((order) => {
              const band = bands.find(b => b.id === order.bandId);
              return (
                <div
                  key={order.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-neutral-800/50"
                >
                  <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20">
                    <Calendar size={24} className="text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{new Date(order.date).toLocaleDateString('es-ES', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                    <p className="text-sm text-gray-400">{order.time} - {band?.name}</p>
                  </div>
                  <Badge variant="primary" size="sm">{order.songs.length} songs</Badge>
                </div>
              );
            })}
            {upcomingOrders.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-4">No hay servicios programados</p>
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
              <TrendingUp size={24} className="mx-auto text-green-400 mb-2" />
              <p className="text-2xl font-bold">{orders.filter(o => o.status === 'completed').length}</p>
              <p className="text-xs text-gray-400">Servicios completados</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-neutral-800/50">
              <Zap size={24} className="mx-auto text-yellow-400 mb-2" />
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
                  className="flex items-center gap-3 px-3 py-2.5 bg-neutral-800/50 rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer"
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
                      variant={member.role === 'pastor' ? 'warning' : member.role === 'leader' ? 'primary' : 'secondary'}
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
