import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  ChevronRight,
  Check,
  Phone,
  Cross,
  Users2,
  Calendar,
  FileText,
  Send,
  Bell,
  Search,
  Menu,
  Lock,
  Eye,
  EyeOff,
  Mail,
  Shield,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { useCurrentMember } from '../../hooks/useCurrentMember';
import { PushToggle } from '../PushToggle';
import { titleForPath } from '../../lib/pageTitles';
import { useNotificationsPanel } from '../../hooks/useNotificationsPanel';
import { formatDateLocal } from '../../lib/dates';
import { PhotoCropper } from '../profile/PhotoCropper';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { NotifIconBadge } from '../../lib/notificationVisual';


// The mobile bottom strip is split in two:
//   - PRIMARY_NAV: 4 tabs visible to ALL roles (the bottom strip backbone).
//   - SECONDARY_NAV: items shown behind the hamburger menu (5th tab),
//     filtered by role. Plain members get no hamburger at all (nothing to
//     show), so they keep a clean 4-tab strip.
const PRIMARY_NAV = [
  { path: '/', icon: LayoutDashboard, label: 'Inicio' },
  { path: '/ordenes', icon: CalendarDays, label: 'Órdenes' },
  { path: '/repertorio', icon: Music2, label: 'Repertorio' },
  { path: '/bandas', icon: Users, label: 'Bandas' },
];
const SECONDARY_NAV = [
  { path: '/miembros', icon: UserCircle, label: 'Miembros', roles: ['pastor', 'leader'] },
  { path: '/solicitudes', icon: FileText, label: 'Solicitudes', roles: ['pastor'] },
  { path: '/comunicaciones', icon: Send, label: 'Comunicaciones', roles: ['pastor'] },
];

// pageTitles lives in src/lib/pageTitles.js — single source of truth shared
// with Header so both layouts always show the same name for each page.

export const MobileNav = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwShowNew, setPwShowNew] = useState(false);
  const [pwShowConfirm, setPwShowConfirm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  // Avisos prolijos (ventanitas), en vez de alert() nativos — espeja al Header.
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });

  // Notifications state
  const [showNotifications, setShowNotifications] = useState(false);

  // Campanita: carga, orden por fecha, realtime y estado de leído viven en el
  // hook compartido con Header (src/hooks/useNotificationsPanel.js). Antes
  // estaba duplicado palabra por palabra en los dos archivos (landmine #34).
  const { notifications, unreadCount, readNotificationIds, markAsRead, markAllAsRead } =
    useNotificationsPanel({ channelKey: 'mobile' });

  // Edit profile form state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPastorArea, setEditPastorArea] = useState('');
  const [editLeaderOf, setEditLeaderOf] = useState('');
  const [editBirthdate, setEditBirthdate] = useState('');

  const location = useLocation();
  const { profile, logout, refreshProfile } = useAuthStore();
  const currentUserMember = useCurrentMember();
  // CRITICAL: derive role from members table (single source of truth), same as
  // Header.jsx. authStore.profile may be stale after a role change in DB.
  const displayName = currentUserMember?.name || profile?.name || 'Usuario';
  const displayRole = currentUserMember?.role || profile?.role || 'member';
  const displayPhoto =
    currentUserMember?.avatar_url ||
    currentUserMember?.avatarUrl ||
    profile?.avatar_url ||
    profile?.avatarUrl;
  const displayPhone = currentUserMember?.phone || profile?.phone;
  const displayPastorArea = currentUserMember?.pastor_area || profile?.pastor_area;
  const displayLeaderOf = currentUserMember?.leader_of || profile?.leader_of;
  const displayBirthdate = currentUserMember?.birthdate || profile?.birthdate;

  // Secondary items (behind the hamburger) filtered by role. Empty for
  // plain members → no hamburger button shown at all.
  const role = currentUserMember?.role || profile?.role || 'member';
  const secondaryNavItems = useMemo(
    () => SECONDARY_NAV.filter((it) => !it.roles || it.roles.includes(role)),
    [role]
  );
  const hasSecondary = secondaryNavItems.length > 0;

  const profileSheetRef = useRef(null);
  const fileInputRef = useRef(null);
  // Ref al <PhotoCropper> compartido para pedirle el Blob del recorte al guardar.
  const cropperRef = useRef(null);

  const handleLogout = async (e) => {
    e.stopPropagation();
    setProfileOpen(false);
    await logout();
    window.location.href = '/login';
  };

  const handleCameraClick = (e) => {
    e.stopPropagation();
    setShowPhotoModal(true);
  };

  const handleEditProfileClick = (e) => {
    e.stopPropagation();
    setEditMode(true);
    setEditName(displayName === 'Usuario' ? '' : displayName);
    setEditPhone(displayPhone || '');
    setEditPastorArea(displayPastorArea || '');
    setEditLeaderOf(displayLeaderOf || '');
    setEditBirthdate(displayBirthdate || '');
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      setErrorModal({ isOpen: true, title: 'Falta el nombre', message: 'El nombre es obligatorio.' });
      return;
    }

    try {
      const updateData = {
        name: editName.trim(),
        phone: editPhone.trim() || null,
        pastor_area: editPastorArea.trim() || null,
        leader_of: editLeaderOf.trim() || null,
        birthdate: editBirthdate || null
      };

      // Use members.id (PK) like Header does. Targeting eq('user_id', profile?.user_id)
      // would silently miss the row when authStore.profile.user_id wasn't populated,
      // and could in theory match a different member if user_id wiring drifted.
      const memberIdToUpdate = currentUserMember?.id;
      if (!memberIdToUpdate) {
        setErrorModal({ isOpen: true, title: 'No se pudo identificar', message: 'No pudimos identificar tu ficha de miembro. Probá recargar la página.' });
        return;
      }

      const { error } = await supabase
        .from('members')
        .update(updateData)
        .eq('id', memberIdToUpdate);

      if (error) {
        console.error('Error updating profile:', error);
        setErrorModal({ isOpen: true, title: 'Error al guardar', message: 'No se pudo actualizar el perfil. Probá de nuevo.' });
        return;
      }

      await refreshProfile();
      setEditMode(false);
    } catch (err) {
      console.error('Error saving profile:', err);
      setErrorModal({ isOpen: true, title: 'Error al guardar', message: 'No se pudieron guardar los cambios. Probá de nuevo.' });
    }
  };

  // Change own password — same flow as Header.jsx, simpler UI (alerts vs modals)
  // since MobileNav doesn't have the success/error modal infrastructure.
  const handleChangePassword = async () => {
    if (!pwNew.trim()) {
      setErrorModal({ isOpen: true, title: 'Falta la contraseña', message: 'Ingresá la nueva contraseña.' });
      return;
    }
    if (pwNew.length < 6) {
      setErrorModal({ isOpen: true, title: 'Contraseña muy corta', message: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }
    if (pwNew !== pwConfirm) {
      setErrorModal({ isOpen: true, title: 'No coinciden', message: 'Las contraseñas no coinciden.' });
      return;
    }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew });
      if (error) throw error;
      setShowPasswordChange(false);
      setPwNew('');
      setPwConfirm('');
      setPwShowNew(false);
      setPwShowConfirm(false);
      setSuccessModal({ isOpen: true, title: '¡Listo!', message: 'Tu contraseña se actualizó correctamente.' });
    } catch (err) {
      console.error('Error changing password:', err);
      setErrorModal({ isOpen: true, title: 'Error', message: 'No se pudo cambiar la contraseña. Probá de nuevo.' });
    } finally {
      setPwSaving(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // DEBUG: Log original file info

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setErrorModal({ isOpen: true, title: 'Archivo inválido', message: 'Por favor, seleccioná una imagen válida (JPEG, PNG, etc.).' });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorModal({ isOpen: true, title: 'Imagen muy grande', message: 'La imagen debe ser menor a 5MB. Probá con una más chica.' });
      return;
    }

    try {
      // Show loading state in preview
      const url = URL.createObjectURL(file);

      // Load image to verify dimensions
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = () => {
          resolve();
        };
        img.onerror = reject;
        img.src = url;
      });

      setPreviewUrl(url);
      setShowCropper(true);
      setShowPhotoModal(false);
      // El transform lo resetea <PhotoCropper> al cambiar previewUrl.
    } catch (err) {
      console.error('Error selecting file:', err);
      setErrorModal({ isOpen: true, title: 'Error', message: 'No se pudo procesar la imagen. Probá de nuevo.' });
    }
  };

  // Quitar la foto de perfil: nulea avatar_url en members (lo que la saca de la
  // vista) y, si la foto vivía en Storage, hace un best-effort de borrar el
  // archivo. Espeja el "Eliminar foto" del Header desktop.
  const handleDeletePhoto = async () => {
    const memberIdToUpdate = currentUserMember?.id;
    const currentUrl =
      currentUserMember?.avatar_url || currentUserMember?.avatarUrl || profile?.avatar_url;
    try {
      const marker = '/object/public/avatars/';
      const idx = currentUrl ? currentUrl.indexOf(marker) : -1;
      if (idx !== -1) {
        const key = currentUrl.slice(idx + marker.length);
        await supabase.storage.from('avatars').remove([key]);
      }
      if (memberIdToUpdate) {
        // Update directo de una sola columna (no pasa por convertXToDB) — patrón
        // idéntico al de handleSavePhoto, sin riesgo de DATA-LOSS LANDMINE.
        await supabase.from('members').update({ avatar_url: null }).eq('id', memberIdToUpdate);
      }
      await refreshProfile();
    } catch (err) {
      console.error('Delete photo error:', err);
    } finally {
      setShowPhotoModal(false);
    }
  };

  const handleSavePhoto = async () => {
    if (!previewUrl) {
      setShowCropper(false);
      setPreviewUrl(null);
      return;
    }

    try {
      // El recorte lo produce <PhotoCropper> reproduciendo EXACTO la vista previa
      // (mide el <img> real, landmine #2). Celular: círculo 200 → PNG.
      const blob = await cropperRef.current?.getCroppedBlob();

      if (!blob) {
        throw new Error('Error al procesar la imagen');
      }


      // Generate unique filename - use profile.id as backup if user_id is null
      const userId = profile?.user_id || profile?.id || `temp-${Date.now()}`;
      const fileName = `avatars/${userId}-${Date.now()}.png`;

      // Upload processed image to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, {
          upsert: true,
          contentType: 'image/png'
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        setErrorModal({ isOpen: true, title: 'Error al subir', message: 'No se pudo subir la foto. Probá de nuevo.' });
        return;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Update in members table - use profile.id as backup if user_id is null
      const memberUserId = profile?.user_id || profile?.id;
      if (!memberUserId) {
        console.error('ERROR: No se pudo determinar el ID del miembro para actualizar');
        setErrorModal({ isOpen: true, title: 'Error', message: 'No se encontró tu identificación de usuario. Probá recargar la página.' });
        return;
      }


      const { error: updateError } = await supabase
        .from('members')
        .update({ avatar_url: publicUrl })
        .eq('user_id', memberUserId);

      if (updateError) {
        console.error('Update error:', updateError);
        // Try alternative with id field
        const { error: altError } = await supabase
          .from('members')
          .update({ avatar_url: publicUrl })
          .eq('id', profile?.id);
        if (altError) {
          console.error('Alternative update error:', altError);
        }
      }

      // Refresh profile
      await refreshProfile();

    } catch (err) {
      console.error('Photo upload error:', err);
      setErrorModal({ isOpen: true, title: 'Error', message: 'No se pudo procesar la foto. Probá de nuevo.' });
    } finally {
      setShowCropper(false);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      // Si hay una ventanita de aviso abierta encima, Escape NO cierra lo de
      // abajo (el aviso es un diálogo bloqueante; se cierra con "Aceptar").
      if (successModal.isOpen || errorModal.isOpen) return;
      if (e.key === 'Escape' && (profileOpen || showPhotoModal || showCropper)) {
        setProfileOpen(false);
        setShowPhotoModal(false);
        setShowCropper(false);
        setEditMode(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [profileOpen, showPhotoModal, showCropper, successModal.isOpen, errorModal.isOpen]);

  // Prevent scroll when profile is open. Incluye los avisos (successModal/
  // errorModal) para RE-ASERTAR el lock al cerrar un aviso con el sheet/foto/
  // recortador todavía abiertos: el <Modal> compartido libera body.overflow al
  // cerrarse y, sin esta dep, este efecto no se re-ejecutaba → el fondo volvía a
  // scrollear detrás del sheet. Los efectos del hijo (<Modal>) corren antes que
  // los del padre, así que este gana con 'hidden' cuando corresponde.
  useEffect(() => {
    if (profileOpen || showPhotoModal || showCropper || successModal.isOpen || errorModal.isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [profileOpen, showPhotoModal, showCropper, successModal.isOpen, errorModal.isOpen]);

  return (
    <>
      {/* Mobile Header */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-lg border-b border-neutral-800"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center justify-between px-4 h-14 gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <img src="/logo.png" alt="AdorAPP" className="w-8 h-8 rounded-lg object-contain shrink-0" />
            <h1 className="text-base font-semibold text-white truncate">
              {titleForPath(location.pathname)}
            </h1>
          </div>

          {/* Search — opens the same CommandPalette desktop has on Cmd/Ctrl+K */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('openCommandPalette'));
            }}
            className="p-2 rounded-full hover:bg-neutral-800 transition-colors"
            title="Buscar"
            aria-label="Buscar"
          >
            <Search size={22} className="text-neutral-400 hover:text-white transition-colors" />
          </button>

          {/* Notification Bell - Left of profile */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowNotifications(true);
            }}
            className="relative p-2 rounded-full hover:bg-neutral-800 transition-colors"
            title="Notificaciones"
          >
            <Bell size={22} className="text-neutral-400 hover:text-white transition-colors" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-black animate-pulse" />
            )}
          </button>

          {/* Profile Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setProfileOpen(!profileOpen);
              setEditMode(false);
            }}
            className="flex items-center gap-2 p-1 rounded-full hover:bg-neutral-800 transition-colors"
          >
            {displayPhoto ? (
              <img
                src={displayPhoto}
                alt={displayName}
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
            if (e.target === e.currentTarget) {
              setProfileOpen(false);
              setEditMode(false);
            }
          }}
        >
          <div
            ref={profileSheetRef}
            className="absolute bottom-0 left-0 right-0 bg-neutral-900 rounded-t-3xl animate-slide-up max-h-[90vh] overflow-y-auto"
            style={{
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
              // touch-action:none bloqueaba el scroll TÁCTIL del sheet en algunos
              // navegadores/celulares (contenido cortado, sin poder llegar a
              // "Activar notificaciones"). El sheet no tiene gesto de arrastre
              // propio, así que se deja el scroll táctil por defecto.
              // overscroll-behavior:contain evita que el scroll "sangre" al fondo.
              overscrollBehavior: 'contain'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle Bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-neutral-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 sticky top-0 bg-neutral-900">
              <h2 className="text-white font-semibold text-lg">
                {editMode ? 'Editar Perfil' : 'Mi Perfil'}
              </h2>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setProfileOpen(false);
                  setEditMode(false);
                }}
                className="p-2 rounded-full hover:bg-neutral-800 transition-colors"
              >
                <X size={20} className="text-neutral-400" />
              </button>
            </div>

            {/* Profile Content */}
            <div className="p-5">
              {editMode ? (
                // Edit Form
                <div className="space-y-4">
                  {/* Profile Photo with Edit */}
                  <div className="flex flex-col items-center mb-6">
                    <div className="relative">
                      {displayPhoto ? (
                        <img
                          src={displayPhoto}
                          alt={displayName}
                          className="w-20 h-20 rounded-full object-cover border-2 border-neutral-700"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-neutral-800 flex items-center justify-center border-2 border-neutral-700">
                          <UserCircle size={40} className="text-neutral-500" />
                        </div>
                      )}
                      <button
                        onClick={handleCameraClick}
                        className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-lg hover:bg-neutral-100 transition-colors"
                      >
                        <Camera size={14} className="text-black" />
                      </button>
                    </div>
                    <p className="text-neutral-400 text-sm mt-2">Tocá la cámara para cambiar foto</p>
                  </div>

                  {/* Edit Fields */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-neutral-400 text-xs mb-1.5 ml-1">Nombre completo *</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 transition-colors"
                        placeholder="Tu nombre"
                      />
                    </div>

                    <div>
                      <label className="block text-neutral-400 text-xs mb-1.5 ml-1">Teléfono</label>
                      <div className="relative">
                        <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 transition-colors"
                          placeholder="+54 11 1234-5678"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-neutral-400 text-xs mb-1.5 ml-1">Pastor de área</label>
                      <div className="relative">
                        <Cross size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                          type="text"
                          value={editPastorArea}
                          onChange={(e) => setEditPastorArea(e.target.value)}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 transition-colors"
                          placeholder="Nombre del pastor"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-neutral-400 text-xs mb-1.5 ml-1">Tu líder</label>
                      <div className="relative">
                        <Users2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                          type="text"
                          value={editLeaderOf}
                          onChange={(e) => setEditLeaderOf(e.target.value)}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 transition-colors"
                          placeholder="Nombre de tu líder"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-neutral-400 text-xs mb-1.5 ml-1">Fecha de nacimiento</label>
                      <div className="relative">
                        <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                          type="date"
                          value={editBirthdate}
                          onChange={(e) => setEditBirthdate(e.target.value)}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setEditMode(false)}
                      className="flex-1 py-3 bg-neutral-800 text-white font-medium rounded-xl hover:bg-neutral-700 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveProfile}
                      className="flex-1 py-3 bg-gold-gradient text-black font-medium rounded-xl hover:brightness-110 transition-colors flex items-center justify-center gap-2"
                    >
                      <Check size={18} />
                      Guardar
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <>
                  {/* Profile Info */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="relative">
                      {displayPhoto ? (
                        <img
                          src={displayPhoto}
                          alt={displayName}
                          className="w-16 h-16 rounded-full object-cover border-2 border-neutral-700"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center border-2 border-neutral-700">
                          <UserCircle size={32} className="text-neutral-500" />
                        </div>
                      )}
                      <button
                        onClick={handleCameraClick}
                        className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-lg hover:bg-neutral-100 transition-colors"
                      >
                        <Camera size={14} className="text-black" />
                      </button>
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-lg">{displayName}</h3>
                      <p className="text-neutral-400 text-sm capitalize">
                        {displayRole === 'pastor' ? 'Pastor' : displayRole === 'leader' ? 'Líder' : 'Miembro'}
                      </p>
                    </div>
                  </div>

                  {/* Profile Details */}
                  <div className="bg-neutral-800/50 rounded-2xl p-4 mb-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-neutral-700 rounded-lg">
                        <Phone size={16} className="text-neutral-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-neutral-500">Teléfono</p>
                        <p className="text-white text-sm">{displayPhone || 'No configurado'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-neutral-700 rounded-lg">
                        <Cross size={16} className="text-neutral-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-neutral-500">Pastor de área</p>
                        <p className="text-white text-sm">{displayPastorArea || 'No configurado'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-neutral-700 rounded-lg">
                        <Users2 size={16} className="text-neutral-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-neutral-500">Tu líder</p>
                        <p className="text-white text-sm">{displayLeaderOf || 'No configurado'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-neutral-700 rounded-lg">
                        <Calendar size={16} className="text-neutral-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-neutral-500">Fecha de nacimiento</p>
                        <p className="text-white text-sm">{displayBirthdate ? formatDateLocal(displayBirthdate) : 'No configurada'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-neutral-700 rounded-lg">
                        <Mail size={16} className="text-neutral-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-neutral-500">Email</p>
                        <p className="text-white text-sm truncate">{currentUserMember?.email || profile?.email || 'No configurado'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-neutral-700 rounded-lg">
                        <Shield size={16} className="text-neutral-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-neutral-500">Rol en el sistema</p>
                        <p className="text-white text-sm">{displayRole === 'pastor' ? 'Pastor' : displayRole === 'leader' ? 'Líder' : 'Miembro'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Menu Options */}
                  <div className="space-y-1">
                    <button
                      onClick={handleCameraClick}
                      className="w-full flex items-center gap-4 px-4 py-4 rounded-xl hover:bg-neutral-800 transition-colors"
                    >
                      <Camera size={20} className="text-neutral-400" />
                      <span className="flex-1 text-left text-white">Cambiar foto de perfil</span>
                      <ChevronRight size={18} className="text-neutral-600" />
                    </button>

                    <button
                      onClick={handleEditProfileClick}
                      className="w-full flex items-center gap-4 px-4 py-4 rounded-xl hover:bg-neutral-800 transition-colors"
                    >
                      <Settings size={20} className="text-neutral-400" />
                      <span className="flex-1 text-left text-white">Editar datos del perfil</span>
                      <ChevronRight size={18} className="text-neutral-600" />
                    </button>

                    <button
                      onClick={async () => {
                        // refreshProfile() también dispara appStore.initialize(),
                        // así que esto resincroniza perfil + datos de la app.
                        await refreshProfile();
                      }}
                      className="w-full flex items-center gap-4 px-4 py-4 rounded-xl hover:bg-neutral-800 transition-colors"
                    >
                      <RefreshCw size={20} className="text-neutral-400" />
                      <span className="flex-1 text-left text-white">Sincronizar</span>
                      <ChevronRight size={18} className="text-neutral-600" />
                    </button>

                    <div className="h-px bg-neutral-800 my-2" />

                    <div className="px-1">
                      <PushToggle memberId={currentUserMember?.id} />
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setProfileOpen(false);
                        setPwNew('');
                        setPwConfirm('');
                        setPwShowNew(false);
                        setPwShowConfirm(false);
                        setShowPasswordChange(true);
                      }}
                      className="w-full flex items-center gap-4 px-4 py-4 rounded-xl hover:bg-neutral-800 transition-colors"
                    >
                      <Lock size={20} className="text-neutral-400" />
                      <span className="flex-1 text-left text-white font-medium">Cambiar contraseña</span>
                    </button>

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-4 px-4 py-4 rounded-xl hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut size={20} className="text-red-500" />
                      <span className="flex-1 text-left text-red-500 font-medium">Cerrar Sesión</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Photo Upload Modal */}
      {showPhotoModal && (
        <div
          className="lg:hidden fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm animate-fade-in flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPhotoModal(false);
            }
          }}
        >
          <div
            className="bg-neutral-900 rounded-2xl w-full max-w-sm animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-white font-semibold text-lg">Cambiar foto de perfil</h3>
                <button
                  onClick={() => setShowPhotoModal(false)}
                  className="p-2 rounded-full hover:bg-neutral-800 transition-colors"
                >
                  <X size={20} className="text-neutral-400" />
                </button>
              </div>

              <div className="flex flex-col items-center mb-6">
                <div className="w-32 h-32 rounded-full bg-neutral-800 flex items-center justify-center mb-4 overflow-hidden border-2 border-neutral-700">
                  {displayPhoto ? (
                    <img
                      src={displayPhoto}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserCircle size={64} className="text-neutral-500" />
                  )}
                </div>
                <p className="text-neutral-400 text-sm text-center">
                  Selecciona una foto de tu dispositivo
                </p>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 bg-gold-gradient text-black font-medium rounded-xl hover:brightness-110 transition-colors flex items-center justify-center gap-2"
              >
                <Camera size={18} />
                Seleccionar imagen
              </button>

              {displayPhoto && (
                <button
                  onClick={handleDeletePhoto}
                  className="w-full mt-3 py-3 border border-red-500/40 text-red-400 font-medium rounded-xl hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 size={18} />
                  Eliminar foto
                </button>
              )}

              <p className="text-neutral-500 text-xs text-center mt-4">
                Formatos: JPG, PNG, GIF. Máximo 5MB.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Image Cropper Modal - Full Image Preview */}
      {showCropper && (
        <div
          className="lg:hidden fixed inset-0 z-[70] bg-black/95 backdrop-blur-sm animate-fade-in flex flex-col"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCropper(false);
              setPreviewUrl(null);
            }
          }}
        >
          <div
            className="flex items-center gap-3 p-4 border-b border-neutral-800"
            style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setShowCropper(false);
                setPreviewUrl(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="p-2 rounded-full hover:bg-neutral-800 transition-colors"
            >
              <X size={20} className="text-neutral-400" />
            </button>
            <h3 className="text-white font-semibold">Ajustar Foto</h3>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <PhotoCropper
              ref={cropperRef}
              previewUrl={previewUrl}
              circleSize={200}
              stageHeight={300}
              imgMaxHeight={280}
              canvasSize={400}
              outputType="image/png"
              outputQuality={0.95}
              accentClass="accent-white"
              radiusClass="rounded-2xl"
              borderOpacity={0.8}
              maskOpacity={0.7}
            />
          </div>

          {/* Save bar pinned at the bottom — always reachable and clear of the
              home indicator. Guardar used to live in the top bar, where the
              status bar / notch covered it and made it untappable. */}
          <div
            className="shrink-0 p-4 border-t border-neutral-800"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleSavePhoto}
              className="w-full py-3 bg-gold-gradient text-black font-medium rounded-xl hover:brightness-110 transition-colors flex items-center justify-center gap-2"
            >
              <Check size={18} />
              Guardar cambios
            </button>
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
                {displayPhoto ? (
                  <img
                    src={displayPhoto}
                    alt={displayName}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center">
                    <UserCircle size={20} className="text-neutral-500" />
                  </div>
                )}
                <div>
                  <p className="text-white font-medium">{displayName}</p>
                  <p className="text-neutral-500 text-sm capitalize">
                    {displayRole === 'pastor' ? 'Pastor' : displayRole === 'leader' ? 'Líder' : 'Miembro'}
                  </p>
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
              {secondaryNavItems.map(({ path, icon: Icon, label }) => {
                const isActive = location.pathname === path;
                return (
                  <NavLink
                    key={path}
                    to={path}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-4 px-6 py-4 rounded-2xl text-lg font-medium transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-gold-500/[0.22] to-transparent text-gold-100 shadow-[inset_3px_0_0_0_#d4af37]'
                        : 'text-gray-400 hover:text-white hover:bg-neutral-800'
                    }`}
                  >
                    <Icon size={28} className={isActive ? 'text-gold-300' : ''} />
                    {label}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {showPasswordChange && (
        <div
          className="lg:hidden fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPasswordChange(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-pw-title"
            className="w-full sm:max-w-md bg-neutral-900 border-t sm:border border-neutral-800 sm:rounded-2xl rounded-t-3xl p-5 max-h-[90dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="mobile-pw-title" className="text-lg font-semibold text-white flex items-center gap-2">
                <Lock size={18} /> Cambiar contraseña
              </h2>
              <button
                onClick={() => setShowPasswordChange(false)}
                className="p-2 rounded-full hover:bg-neutral-800 text-gray-400 hover:text-white"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-gray-400 mb-4">
              La nueva contraseña debe tener al menos 6 caracteres.
            </p>

            <label className="block mb-3">
              <span className="text-xs uppercase text-gray-500 block mb-1">Nueva contraseña</span>
              <div className="relative">
                <input
                  type={pwShowNew ? 'text' : 'password'}
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-4 py-2.5 pr-10 bg-neutral-800 border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-white"
                />
                <button
                  type="button"
                  onClick={() => setPwShowNew((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-white"
                  aria-label={pwShowNew ? 'Ocultar' : 'Mostrar'}
                >
                  {pwShowNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <label className="block mb-2">
              <span className="text-xs uppercase text-gray-500 block mb-1">Confirmar contraseña</span>
              <div className="relative">
                <input
                  type={pwShowConfirm ? 'text' : 'password'}
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  autoComplete="new-password"
                  className={`w-full px-4 py-2.5 pr-10 bg-neutral-800 border rounded-lg focus:outline-none focus:ring-2 text-white ${
                    pwConfirm && pwConfirm !== pwNew
                      ? 'border-red-500 focus:ring-red-500/40'
                      : pwConfirm && pwConfirm === pwNew
                      ? 'border-green-500 focus:ring-green-500/40'
                      : 'border-neutral-700 focus:ring-gold-500/40 focus:border-gold-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setPwShowConfirm((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-white"
                  aria-label={pwShowConfirm ? 'Ocultar' : 'Mostrar'}
                >
                  {pwShowConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {pwConfirm && pwConfirm !== pwNew && (
                <span className="text-xs text-red-400 mt-1 inline-block">Las contraseñas no coinciden.</span>
              )}
            </label>

            <div className="flex gap-2 pt-3">
              <button
                onClick={() => setShowPasswordChange(false)}
                className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-white font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleChangePassword}
                disabled={pwSaving || !pwNew || !pwConfirm || pwNew !== pwConfirm}
                className="flex-1 py-2.5 bg-gold-gradient text-black font-semibold rounded-lg hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pwSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Notifications Modal */}
      {showNotifications && (
        <div
          className="lg:hidden fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowNotifications(false);
            }
          }}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-neutral-900 rounded-t-3xl animate-slide-up max-h-[85vh] overflow-y-auto"
            style={{
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle Bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-neutral-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 sticky top-0 bg-neutral-900">
              <h2 className="text-white font-semibold text-lg">Notificaciones</h2>
              <button
                onClick={() => setShowNotifications(false)}
                className="p-2 rounded-full hover:bg-neutral-800 transition-colors"
              >
                <X size={20} className="text-neutral-400" />
              </button>
            </div>

            {/* Notifications List */}
            <div className="p-5 space-y-3">
              {(() => {
                const unreadNotifications = notifications.filter(
                  n => !readNotificationIds.includes(n.id)
                );

                if (unreadNotifications.length === 0) {
                  return (
                    <div className="text-center py-12">
                      <Bell size={48} className="mx-auto text-gray-600 mb-4" />
                      <p className="text-gray-400 font-medium">No hay notificaciones nuevas</p>
                      <p className="text-xs text-gray-500 mt-2">Las notificaciones aparecen cuando hay nuevas canciones o solicitudes</p>
                    </div>
                  );
                }

                return (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">{unreadNotifications.length} sin leer</span>
                      <button
                        onClick={markAllAsRead}
                        className="text-xs text-gold-300 hover:text-gold-200"
                      >
                        Marcar todas como leídas
                      </button>
                    </div>
                    {unreadNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => {
                          // Tocar el aviso NO lo descarta (un roce accidental lo
                          // borraba). Solo la ✕ de cada card o "Marcar todas".
                          if (notif.type === 'request') {
                            setShowNotifications(false);
                            window.location.href = '/solicitudes';
                          }
                        }}
                        className="relative p-4 bg-neutral-800/50 rounded-2xl border border-neutral-700 hover:border-gold-500/50 transition-colors cursor-pointer"
                      >
                        <button
                          type="button"
                          aria-label="Descartar notificación"
                          onClick={(e) => { e.stopPropagation(); markAsRead(notif.id); }}
                          className="absolute top-2 right-2 p-2 rounded-full text-gray-500 hover:text-white hover:bg-neutral-700 transition-colors"
                        >
                          <X size={16} />
                        </button>
                        <div className="flex items-start gap-3 pr-8">
                          <NotifIconBadge type={notif.type} icon={notif.icon} radiusClass="rounded-xl" fallbackBg="bg-blue-500/20" />
                          <div className="flex-1">
                            {notif.type === 'communication' ? (
                              <>
                                <div className="flex items-center gap-2 mb-1">
                                  {notif.senderPhoto ? (
                                    <img
                                      src={notif.senderPhoto}
                                      alt={notif.senderName}
                                      className="w-5 h-5 rounded-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-5 h-5 rounded-full bg-blue-500/30 flex items-center justify-center">
                                      <UserCircle size={12} className="text-blue-400" />
                                    </div>
                                  )}
                                  <span className="text-xs text-blue-400 font-medium">{notif.senderName}</span>
                                </div>
                                <p className="text-sm text-white font-medium leading-relaxed">{notif.subject}</p>
                                {notif.preview && (
                                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">{notif.preview}</p>
                                )}
                                {notif.fullMessage && notif.fullMessage !== notif.preview && (
                                  <div className="mt-2 pt-2 border-t border-neutral-700">
                                    <p className="text-sm text-gray-300 leading-relaxed">{notif.fullMessage}</p>
                                  </div>
                                )}
                                <p className="text-xs text-gray-500 mt-1">{notif.time}</p>
                              </>
                            ) : (
                              <>
                                {notif.title && (
                                  <p className="text-sm text-white font-semibold leading-snug mb-1">{notif.title}</p>
                                )}
                                <p className="text-sm text-gray-200 leading-relaxed">{notif.message}</p>
                                <p className="text-xs text-gray-500 mt-1">{notif.time}</p>
                              </>
                            )}
                          </div>
                          <span className="w-2 h-2 bg-gold-400 rounded-full mt-2" />
                        </div>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Tab Bar — 4 fixed primary tabs + (for pastors/leaders) a
          hamburger that opens the fullscreen menu with the secondary items.
          Plain members get only the 4 primary tabs (nothing extra to surface). */}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-lg border-t border-neutral-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around h-20 px-2">
          {PRIMARY_NAV.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path;
            return (
              <NavLink
                key={path}
                to={path}
                data-tour={`nav-${path === '/' ? 'inicio' : path.replace('/', '')}`}
                className={`flex flex-col items-center justify-center w-full h-full transition-all ${
                  isActive ? 'text-gold-100' : 'text-gray-500'
                }`}
              >
                <div className={`p-2 rounded-xl transition-all ${isActive ? 'bg-gold-500/15' : ''}`}>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-xs mt-1 font-medium ${isActive ? 'text-gold-100' : ''}`}>
                  {label}
                </span>
              </NavLink>
            );
          })}
          {hasSecondary && (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir menú"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={`flex flex-col items-center justify-center w-full h-full transition-all ${
                menuOpen ? 'text-gold-100' : 'text-gray-500'
              }`}
            >
              <div className={`p-2 rounded-xl transition-all ${menuOpen ? 'bg-gold-500/15' : ''}`}>
                <Menu size={22} strokeWidth={menuOpen ? 2.5 : 2} />
              </div>
              <span className={`text-xs mt-1 font-medium ${menuOpen ? 'text-gold-100' : ''}`}>
                Más
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Aviso de éxito (ventanita prolija, en vez de alert()) — espeja al Header */}
      <Modal
        isOpen={successModal.isOpen}
        onClose={() => setSuccessModal({ isOpen: false, title: '', message: '' })}
        title={successModal.title}
        size="sm"
        footer={
          <Button onClick={() => setSuccessModal({ isOpen: false, title: '', message: '' })} className="w-full">
            Aceptar
          </Button>
        }
      >
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-400" />
          </div>
          <p className="text-gray-300">{successModal.message}</p>
        </div>
      </Modal>

      {/* Aviso de error (ventanita prolija, en vez de alert()) — espeja al Header */}
      <Modal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal({ isOpen: false, title: '', message: '' })}
        title={errorModal.title}
        size="sm"
        footer={
          <Button onClick={() => setErrorModal({ isOpen: false, title: '', message: '' })} variant="secondary" className="w-full">
            Aceptar
          </Button>
        }
      >
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <X size={32} className="text-red-400" />
          </div>
          <p className="text-gray-300">{errorModal.message}</p>
        </div>
      </Modal>
    </>
  );
};