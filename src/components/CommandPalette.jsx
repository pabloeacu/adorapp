// CommandPalette — cmd+k / ctrl+k global search across pages, members,
// songs, bands, and recent orders. Implemented with `cmdk` because it
// gives us keyboard nav, fuzzy filtering, and accessibility for free.
//
// Reads from useAppStore so the search is instant and offline-friendly.
// Navigation goes through react-router so the SPA stays in-app.

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { useCurrentRole } from '../hooks/useCurrentMember';
import {
  Search,
  LayoutDashboard,
  CalendarDays,
  Music2,
  Users,
  UserCircle,
  FileText,
  Send,
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';

const PAGE_ITEMS_BASE = [
  { id: 'page-dashboard', kind: 'page', label: 'Inicio', path: '/', icon: LayoutDashboard },
  { id: 'page-ordenes', kind: 'page', label: 'Órdenes', path: '/ordenes', icon: CalendarDays },
  { id: 'page-repertorio', kind: 'page', label: 'Repertorio', path: '/repertorio', icon: Music2 },
  { id: 'page-bandas', kind: 'page', label: 'Bandas', path: '/bandas', icon: Users },
];
const MIEMBROS_PAGE_ITEM = { id: 'page-miembros', kind: 'page', label: 'Miembros', path: '/miembros', icon: UserCircle };
const PASTOR_PAGE_ITEMS = [
  { id: 'page-solicitudes', kind: 'page', label: 'Solicitudes', path: '/solicitudes', icon: FileText },
  { id: 'page-comunicaciones', kind: 'page', label: 'Comunicaciones', path: '/comunicaciones', icon: Send },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { members, songs, orders, bands } = useAppStore();
  const { user } = useAuthStore();
  const role = useCurrentRole();
  const isPastor = role === 'pastor';
  const canSeeMembers = role === 'pastor' || role === 'leader';

  // Open on Cmd/Ctrl+K from anywhere (desktop), or on a custom event dispatched
  // by mobile UI (where there's no keyboard) so the palette is reachable from
  // the mobile header search button.
  useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('openCommandPalette', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('openCommandPalette', onOpenEvent);
    };
  }, [open]);

  // All hooks must run unconditionally (rules of hooks).
  // Page navigation: members don't see Miembros (gated in nav & via route guard).
  // Pastors additionally see Solicitudes + Comunicaciones.
  const pageItems = [
    ...PAGE_ITEMS_BASE,
    ...(canSeeMembers ? [MIEMBROS_PAGE_ITEM] : []),
    ...(isPastor ? PASTOR_PAGE_ITEMS : []),
  ];

  const recentOrders = useMemo(
    () =>
      [...orders]
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
        .slice(0, 8),
    [orders]
  );

  if (!user) return null; // hide the palette before login

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      {/* Hint button visible on desktop only — mobile gets keyboard search by other means. */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Búsqueda global"
          className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <Command
            className="w-full max-w-xl rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden"
            label="Búsqueda global"
          >
            <div className="flex items-center gap-2 px-4 border-b border-neutral-800">
              <Search size={18} className="text-gray-500 shrink-0" />
              <Command.Input
                placeholder="Buscar canciones, miembros, órdenes, ir a una sección…"
                className="flex-1 bg-transparent py-3.5 text-white placeholder-gray-500 outline-none"
                autoFocus
              />
              <kbd className="text-[10px] text-gray-500 border border-neutral-700 rounded px-1.5 py-0.5">ESC</kbd>
            </div>

            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-gray-500 text-sm">
                Nada coincide. Probá con otro término.
              </Command.Empty>

              <Command.Group heading="Ir a" className="text-xs uppercase text-gray-500 px-2 pt-2 pb-1">
                {pageItems.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`pagina ${p.label}`}
                    onSelect={() => go(p.path)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-white aria-selected:bg-white/10"
                  >
                    <p.icon size={16} className="text-gray-400" />
                    <span>{p.label}</span>
                    <span className="ml-auto text-xs text-gray-500">/{p.path === '/' ? '' : p.path.slice(1)}</span>
                  </Command.Item>
                ))}
              </Command.Group>

              {songs.length > 0 && (
                <Command.Group heading="Canciones" className="text-xs uppercase text-gray-500 px-2 pt-2 pb-1">
                  {songs.slice(0, 50).map((s) => (
                    <Command.Item
                      key={`song-${s.id}`}
                      value={`cancion ${s.title} ${s.artist || ''}`}
                      onSelect={() => go(`/repertorio?song=${s.id}`)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-white aria-selected:bg-white/10"
                    >
                      <Music2 size={16} className="text-purple-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{s.title}</div>
                        {s.artist && <div className="text-xs text-gray-500 truncate">{s.artist}</div>}
                      </div>
                      <span className="text-xs text-gray-500">{s.key || s.originalKey}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Members results: only for roles that can land on /miembros.
                  Plain members get bounced from that route, so hiding the
                  search results too avoids a confusing dead-end. */}
              {canSeeMembers && members.length > 0 && (
                <Command.Group heading="Miembros" className="text-xs uppercase text-gray-500 px-2 pt-2 pb-1">
                  {members.filter((m) => m.active !== false).slice(0, 50).map((m) => (
                    <Command.Item
                      key={`member-${m.id}`}
                      value={`miembro ${m.name} ${isPastor ? (m.email || '') : ''}`}
                      onSelect={() => go(`/miembros?member=${m.id}`)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-white aria-selected:bg-white/10"
                    >
                      <UserCircle size={16} className="text-blue-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{m.name}</div>
                        {isPastor && m.email && <div className="text-xs text-gray-500 truncate">{m.email}</div>}
                      </div>
                      <span className="text-xs text-gray-500 capitalize">{m.role}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {bands.length > 0 && (
                <Command.Group heading="Bandas" className="text-xs uppercase text-gray-500 px-2 pt-2 pb-1">
                  {bands.filter((b) => b.active !== false).map((b) => (
                    <Command.Item
                      key={`band-${b.id}`}
                      value={`banda ${b.name}`}
                      onSelect={() => go(`/bandas?band=${b.id}`)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-white aria-selected:bg-white/10"
                    >
                      <Users size={16} className="text-green-400 shrink-0" />
                      <span className="flex-1">{b.name}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {recentOrders.length > 0 && (
                <Command.Group heading="Órdenes recientes" className="text-xs uppercase text-gray-500 px-2 pt-2 pb-1">
                  {recentOrders.map((o) => {
                    const band = bands.find((b) => b.id === o.bandId);
                    return (
                      <Command.Item
                        key={`order-${o.id}`}
                        value={`orden ${o.date} ${band?.name || ''}`}
                        onSelect={() => go(`/ordenes?order=${o.id}`)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-white aria-selected:bg-white/10"
                      >
                        <CalendarDays size={16} className="text-orange-400 shrink-0" />
                        <span className="flex-1">{band?.name || 'Banda'}</span>
                        <span className="text-xs text-gray-500">{o.date}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
            </Command.List>

            <div className="border-t border-neutral-800 px-4 py-2 text-[11px] text-gray-500 flex items-center gap-3">
              <span>↑↓ moverse</span>
              <span>↵ abrir</span>
              <span className="ml-auto">⌘K para abrir/cerrar</span>
            </div>
          </Command>
        </div>
      )}
    </>
  );
}
