import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Music2,
  Users,
  UserCircle,
  LogOut,
  Camera,
  Settings,
  X,
  ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Inicio' },
  { path: '/ordenes', icon: CalendarDays, label: 'Órdenes' },
  { path: '/repertorio', icon: Music2, label: 'Repertorio' },
  { path: '/bandas', icon: Users, label: 'Bandas' },
  { path: '/miembros', icon: UserCircle, label: 'Miembros' },
];

export const MobileNav = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const location = useLocation();
  const { profile, logout } = useAuthStore();
  const profileSheetRef = useRef(null);

  const handleLogout = async (e) => {
    e.stopPropagation();
    setProfileOpen(false);
    await logout();
    window.location.href = '/login';
  };

  const handleChangePhoto = (e) => {
    e.stopPropagation();
    setProfileOpen(false);
    window.dispatchEvent(new CustomEvent('openPhotoUpload'));
  };

  const handleEditProfile = (e) => {
    e.stopPropagation();
    setProfileOpen(false);
    window.dispatchEvent(new CustomEvent('openEditProfile'));
  };

  const handleCameraClick = (e) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('openPhotoUpload'));
  };

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && profileOpen) {
        setProfileOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [profileOpen]);

  // Prevent scroll when profile is open
  useEffect(() => {
    if (profileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [profileOpen]);

  return (
    <>
      {/* Mobile Header */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-lg border-b border-neutral-800"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center justify-between px-4 h-14">
          <img src="/logo.png" alt="AdorAPP" className="w-8 h-8 rounded-lg object-contain" />
          <span className="text-white font-semibold text-sm">AdorAPP</span>

          {/* Profile Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setProfileOpen(!profileOpen);
            }}
            className="flex items-center gap-2 p-1 rounded-full hover:bg-neutral-800 transition-colors"
          >
            {profile?.photo_url ? (
              <img
                src={profile.photo_url}
                alt={profile.name}
                className="w-8 h-8 rounded-full object-cover border-2 border-neutral-700"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center">
                <UserCircle size={20} className="text-neutral-400" />
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Profile Menu Overlay */}
      {profileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm animate-fade-in"
          style={{ display: 'block' }}
          onClick={(e) => {
            // Only close if clicking the overlay itself
            if (e.target === e.currentTarget) {
              setProfileOpen(false);
            }
          }}
        >
          <div
            ref={profileSheetRef}
            className="absolute bottom-0 left-0 right-0 bg-neutral-900 rounded-t-3xl animate-slide-up"
            style={{
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
              touchAction: 'none'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle Bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-neutral-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
              <h2 className="text-white font-semibold text-lg">Mi Perfil</h2>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setProfileOpen(false);
                }}
                className="p-2 rounded-full hover:bg-neutral-800 transition-colors"
              >
                <X size={20} className="text-neutral-400" />
              </button>
            </div>

            {/* Profile Info */}
            <div className="p-5">
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  {profile?.photo_url ? (
                    <img
                      src={profile.photo_url}
                      alt={profile.name}
                      className="w-16 h-16 rounded-full object-cover border-2 border-neutral-700"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center border-2 border-neutral-700">
                      <UserCircle size={32} className="text-neutral-500" />
                    </div>
                  )}
                  <button
                    onClick={handleCameraClick}
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-lg hover:bg-neutral-100 transition-colors active:scale-95"
                  >
                    <Camera size={14} className="text-black" />
                  </button>
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-semibold text-lg">{profile?.name || 'Usuario'}</h3>
                  <p className="text-neutral-400 text-sm capitalize">{profile?.role || 'Miembro'}</p>
                </div>
              </div>

              {/* Menu Options */}
              <div className="space-y-1">
                <button
                  onClick={handleChangePhoto}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-xl hover:bg-neutral-800 transition-colors active:bg-neutral-700"
                >
                  <Camera size={20} className="text-neutral-400" />
                  <span className="flex-1 text-left text-white">Cambiar foto de perfil</span>
                  <ChevronRight size={18} className="text-neutral-600" />
                </button>

                <button
                  onClick={handleEditProfile}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-xl hover:bg-neutral-800 transition-colors active:bg-neutral-700"
                >
                  <Settings size={20} className="text-neutral-400" />
                  <span className="flex-1 text-left text-white">Editar datos del perfil</span>
                  <ChevronRight size={18} className="text-neutral-600" />
                </button>

                <div className="h-px bg-neutral-800 my-2" />

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-xl hover:bg-red-500/10 transition-colors active:bg-red-500/20"
                >
                  <LogOut size={20} className="text-red-500" />
                  <span className="flex-1 text-left text-red-500 font-medium">Cerrar Sesión</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Menu Overlay */}
      {menuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/98 backdrop-blur-xl animate-fade-in"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="flex flex-col h-full pt-20"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 mb-6">
              <div className="flex items-center gap-3">
                {profile?.photo_url ? (
                  <img
                    src={profile.photo_url}
                    alt={profile.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center">
                    <UserCircle size={20} className="text-neutral-500" />
                  </div>
                )}
                <div>
                  <p className="text-white font-medium">{profile?.name || 'Usuario'}</p>
                  <p className="text-neutral-500 text-sm capitalize">{profile?.role || 'Miembro'}</p>
                </div>
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-2 rounded-full hover:bg-neutral-800 transition-colors"
              >
                <X size={24} className="text-white" />
              </button>
            </div>

            <nav className="flex-1 px-4 space-y-2">
              {navItems.map(({ path, icon: Icon, label }) => {
                const isActive = location.pathname === path;
                return (
                  <NavLink
                    key={path}
                    to={path}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-4 px-6 py-4 rounded-2xl text-lg font-medium transition-all ${
                      isActive
                        ? 'bg-white text-black'
                        : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                    }`}
                  >
                    <Icon size={28} />
                    {label}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Bottom Tab Bar */}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-lg border-t border-neutral-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path;
            return (
              <NavLink
                key={path}
                to={path}
                className={`flex flex-col items-center justify-center w-full h-full transition-all ${
                  isActive ? 'text-white' : 'text-gray-500'
                }`}
              >
                <div className={`p-2 rounded-xl transition-all ${isActive ? 'bg-white/10' : ''}`}>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-[10px] mt-1 font-medium ${isActive ? 'text-white' : ''}`}>
                  {label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </>
  );
};
