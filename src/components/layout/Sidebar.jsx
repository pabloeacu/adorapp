import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Music2,
  Users,
  UserCircle,
  LogOut
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/ordenes', icon: CalendarDays, label: 'Órdenes' },
  { path: '/repertorio', icon: Music2, label: 'Repertorio' },
  { path: '/bandas', icon: Users, label: 'Bandas' },
  { path: '/miembros', icon: UserCircle, label: 'Miembros' },
];

export const Sidebar = () => {
  const { logout } = useAuthStore();

  return (
    <aside className="w-64 border-r border-neutral-800 h-screen flex flex-col">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="AdorAPP Logo"
            className="w-12 h-12 rounded-xl object-contain"
          />
          <div>
            <h1 className="text-xl font-bold tracking-tight">AdorAPP</h1>
            <p className="text-xs text-gray-500">La plataforma de Adoración CAF</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3">
        <div className="space-y-1">
          {navItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-white text-black'
                    : 'text-gray-400 hover:text-white hover:bg-neutral-800/50'
                }`
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="p-4 border-t border-neutral-800">
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
