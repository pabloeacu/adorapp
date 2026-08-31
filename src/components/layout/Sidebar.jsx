import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Music2,
  Users,
  UserCircle,
  LogOut,
  FileText,
  Send
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useCurrentRole } from '../../hooks/useCurrentMember';
import { GoldWave } from '../ui/GoldWave';

export const Sidebar = () => {
  const { logout } = useAuthStore();
  // Source of truth is the members table row (per parity fix); falls back to
  // authStore.profile.role during the brief window before appStore is ready.
  const role = useCurrentRole();
  const isPastor = role === 'pastor';
  const canSeeMembers = role === 'pastor' || role === 'leader';

  // Dynamic navigation items:
  // - Miembros: pastors + leaders (plain members don't see it at all).
  // - Solicitudes / Comunicaciones: pastors only.
  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/ordenes', icon: CalendarDays, label: 'Órdenes' },
    { path: '/repertorio', icon: Music2, label: 'Repertorio' },
    { path: '/bandas', icon: Users, label: 'Bandas' },
    ...(canSeeMembers ? [{ path: '/miembros', icon: UserCircle, label: 'Miembros' }] : []),
    ...(isPastor ? [
      { path: '/solicitudes', icon: FileText, label: 'Solicitudes' },
      { path: '/comunicaciones', icon: Send, label: 'Comunicaciones' }
    ] : []),
  ];

  return (
    <aside className="relative overflow-hidden w-64 border-r border-neutral-800 h-screen flex flex-col shadow-[inset_-1px_0_0_0_rgba(212,175,55,0.10)]">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="AdorAPP Logo"
            className="w-12 h-12 rounded-xl object-contain"
          />
          <div>
            <h1 className="text-xl font-bold tracking-tight">AdorAPP</h1>
            <p className="text-xs text-gray-500">
              La plataforma de <span className="text-gold-300/90 font-medium">Adoración CAF</span>
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3">
        <div className="space-y-1">
          {navItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              data-tour={`nav-${path === '/' ? 'inicio' : path.replace('/', '')}`}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-gold-500/[0.22] to-transparent text-gold-100 shadow-[inset_3px_0_0_0_#d4af37]'
                    : 'text-gray-400 hover:text-white hover:bg-neutral-800/50'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} className={isActive ? 'text-gold-300' : ''} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Onda dorada decorativa al pie (detalle premium de los mockups) */}
      <GoldWave className="absolute bottom-14 left-0 w-full h-24" opacity={0.4} />

      <div className="relative p-4 border-t border-neutral-800">
        <button
          onClick={() => { logout(); window.location.href = '/login'; }}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-neutral-800/50 transition-all duration-200"
        >
          <LogOut size={20} />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
};
