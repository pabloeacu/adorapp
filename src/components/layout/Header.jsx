// AdorAPP - Centro de Avivamiento Familiar
// Photo Cropper fix - Canvas API image processing
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PhotoCropper } from '../profile/PhotoCropper';
import { NotifIconBadge } from '../../lib/notificationVisual';
import { usePasswordChange } from '../../hooks/usePasswordChange';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search, ChevronRight, User, Mail, Shield, Camera, X, Check, LogOut, Trash2, Phone, Cross, Users2, Calendar, Loader2, Lock, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import { supabase } from '../../lib/supabase';
import { useNotificationsPanel } from '../../hooks/useNotificationsPanel';
import { Avatar } from '../ui/Avatar';
import { Modal } from '../ui/Modal';
import { PushToggle } from '../PushToggle';
import { Button } from '../ui/Button';
import { titleForPath } from '../../lib/pageTitles';
import { formatDateLocal } from '../../lib/dates';


// pageTitles lives in src/lib/pageTitles.js — single source of truth shared
// with MobileNav so both layouts always show the same name for each page.

// Fallback: si la subida a Storage falla, guardamos la foto como data URL desde
// el Blob que produjo <PhotoCropper> (antes se usaba canvas.toDataURL, pero el
// canvas ahora vive dentro del componente).
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Copy EXACTO de los avisos de "cambiar contraseña" en ESCRITORIO (idéntico al
// que tenía el handler viejo). El hook usePasswordChange sólo emite el código;
// el texto lo decide esta pantalla, para no cambiar ni una coma de lo que ve
// el usuario. MobileNav tiene su propio mapa con SU copy.
const HEADER_PW_ERRORS = {
  empty: { title: 'Campo requerido', message: 'Por favor, ingresá la nueva contraseña.' },
  short: { title: 'Contraseña muy corta', message: 'La contraseña debe tener al menos 6 caracteres.' },
  mismatch: { title: 'Contraseñas no coinciden', message: 'Las contraseñas ingresadas no son iguales. Por favor, verificá.' },
  failed: { title: 'Error', message: 'No se pudo cambiar la contraseña. Por favor, intentá de nuevo.' },
};

export const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, logout, refreshProfile: authRefreshProfile } = useAuthStore();
  const { members } = useAppStore();
  const [showProfile, setShowProfile] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPastorArea, setEditPastorArea] = useState('');
  const [editLeaderOf, setEditLeaderOf] = useState('');
  const [editBirthdate, setEditBirthdate] = useState('');
  const [showCropper, setShowCropper] = useState(false);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [userPhoto, setUserPhoto] = useState(null);
  const cropperRef = useRef(null);
  const [isSaving, setIsSaving] = useState(false);
  // Password change state — solo el flag de "mostrar el formulario" es local;
  // el estado de los campos + la validación + updateUser viven en el hook
  // compartido usePasswordChange (ver más abajo, tras los modales de éxito/error).
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Campanita: carga, orden por fecha, realtime y estado de leído viven en el
  // hook compartido con MobileNav (src/hooks/useNotificationsPanel.js). Antes
  // estaba duplicado palabra por palabra en los dos archivos (landmine #34).
  const { notifications, unreadCount, readNotificationIds, markAsRead, markAllAsRead } =
    useNotificationsPanel({ channelKey: 'desktop' });

  // Custom success/error modals - replaces browser alerts
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });

  // Cambiar contraseña: estado + validación + updateUser viven en el hook
  // compartido usePasswordChange (antes duplicado verbatim con MobileNav). El
  // hook emite un CÓDIGO de error y ESTA pantalla lo mapea a su copy exacto —
  // así los avisos de escritorio quedan idénticos a como estaban. Se aliasan los
  // nombres (showNew→showNewPassword, saving→passwordSaving, submit→handleChangePassword…)
  // para no tocar el formulario JSX de abajo.
  const {
    newPassword, setNewPassword,
    confirmPassword, setConfirmPassword,
    showNew: showNewPassword, setShowNew: setShowNewPassword,
    showConfirm: showConfirmPassword, setShowConfirm: setShowConfirmPassword,
    saving: passwordSaving, submit: handleChangePassword,
  } = usePasswordChange({
    onError: (code) => setErrorModal({ isOpen: true, ...HEADER_PW_ERRORS[code] }),
    onSuccess: () => {
      setShowPasswordChange(false);
      setSuccessModal({
        isOpen: true,
        title: '¡Contraseña actualizada!',
        message: 'Tu contraseña se ha cambiado correctamente.',
      });
    },
  });

  const fileInputRef = useRef(null);
  const title = titleForPath(location.pathname);


  // CRITICAL: Get profile from appStore.members (single source of truth for role, name, photo)
  // The authStore.profile might not have the correct role, so we MUST check members table
  const currentUserMember = useMemo(() => {
    if (user?.email) {
      // Find the member by email in appStore - this is the source of truth.
      // Case-insensitive: auth.users.email va en minúscula; evita perder la ficha
      // por un desajuste de mayúsculas con members.email.
      const member = members.find(m => (m.email || '').toLowerCase() === user.email.toLowerCase());
      if (member) return member;
    }
    return null;
  }, [user, members]);

  // Use authStore profile ONLY for fields not in members table (like auth metadata)
  // For role, name, photo - ALWAYS use currentUserMember from appStore
  const displayName = currentUserMember?.name || profile?.name || user?.name || 'Usuario';
  const displayRole = currentUserMember?.role || profile?.role || 'member';
  const displayPhoto = currentUserMember?.avatar_url || currentUserMember?.avatarUrl || profile?.avatar_url || profile?.avatarUrl;

  // Load saved photo on mount. Depends on profile/displayPhoto so we can't
  // use lazy initial state — those values arrive from the auth/app stores
  // after first render.
  useEffect(() => {
    const savedPhoto = localStorage.getItem('userPhoto');
    if (savedPhoto) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserPhoto(savedPhoto);
    } else if (displayPhoto) {
      setUserPhoto(displayPhoto);
    } else if (profile?.avatar_url) {
      setUserPhoto(profile.avatar_url);
    }
  }, [profile, displayPhoto]);

  const handleEditProfile = () => {
    setEditName(currentUserMember?.name || profile?.name || user?.name || '');
    setEditPhone(currentUserMember?.phone || profile?.phone || '');
    setEditPastorArea(currentUserMember?.pastor_area || profile?.pastor_area || '');
    setEditLeaderOf(currentUserMember?.leader_of || profile?.leader_of || '');
    setEditBirthdate(currentUserMember?.birthdate || profile?.birthdate || '');
    setIsEditing(true);
  };

  const handleSaveExtendedProfile = async () => {
    if (!editName.trim()) {
      setErrorModal({
        isOpen: true,
        title: 'Campo requerido',
        message: 'El nombre es obligatorio para guardar los cambios.'
      });
      return;
    }

    try {
      const updateData = {
        name: editName.trim(),
        phone: editPhone?.trim() || null,
        pastor_area: editPastorArea?.trim() || null,
        leader_of: editLeaderOf?.trim() || null,
        birthdate: editBirthdate || null
      };

      // IMMEDIATE SYNC: Update Supabase database FIRST with member's ID
      const memberIdToUpdate = currentUserMember?.id;

      if (memberIdToUpdate) {
        const { error } = await supabase
          .from('members')
          .update(updateData)
          .eq('id', memberIdToUpdate);

        if (error) {
          console.error('Error updating profile in DB:', error);
          setErrorModal({
            isOpen: true,
            title: 'Error al guardar',
            message: 'No se pudieron guardar los cambios en la base de datos.'
          });
          return;
        }

        // Then update appStore.members so Miembros page sees changes instantly
        useAppStore.setState(state => ({
          members: state.members.map(m =>
            m.id === memberIdToUpdate ? {
              ...m,
              name: updateData.name,
              phone: updateData.phone,
              pastor_area: updateData.pastor_area,
              leader_of: updateData.leader_of,
              birthdate: updateData.birthdate,
            } : m
          )
        }));

        // Also persist to localStorage for survival across page refreshes
        const currentMembers = JSON.parse(localStorage.getItem('appMembers') || '[]');
        const updatedMembers = currentMembers.map(m =>
          m.id === memberIdToUpdate ? {
            ...m,
            name: updateData.name,
            phone: updateData.phone,
            pastor_area: updateData.pastor_area,
            leader_of: updateData.leader_of,
            birthdate: updateData.birthdate,
          } : m
        );
        localStorage.setItem('appMembers', JSON.stringify(updatedMembers));
      }

      // Refresh auth profile
      await authRefreshProfile();

      setIsEditing(false);

      // Show custom success modal
      setSuccessModal({
        isOpen: true,
        title: '¡Cambios guardados!',
        message: 'Tu perfil se ha actualizado correctamente.'
      });
    } catch (err) {
      console.error('Error saving profile:', err);
      setErrorModal({
        isOpen: true,
        title: 'Error',
        message: 'Ocurrió un error al guardar los cambios. Por favor, intentá de nuevo.'
      });
    }
  };

  // Change own password
  const handleCameraClick = () => {
    if (userPhoto) {
      setShowPhotoOptions(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleReplacePhoto = () => {
    setShowPhotoOptions(false);
    fileInputRef.current?.click();
  };

  const handleDeletePhoto = async () => {
    localStorage.removeItem('userPhoto');
    setUserPhoto(null);
    setShowPhotoOptions(false);

    // Delete from storage and database
    if (profile?.avatar_url) {
      const fileName = profile.avatar_url.split('/').pop();
      await supabase.storage.from('avatars').remove([fileName]);
    }

    // Use currentUserMember.id to ensure we update the correct record
    const memberIdToUpdate = currentUserMember?.id;

    if (memberIdToUpdate) {
      // Update Supabase
      await supabase
        .from('members')
        .update({ avatar_url: null })
        .eq('id', memberIdToUpdate);

      // IMMEDIATE SYNC: Update appStore.members so Miembros section reflects the change
      useAppStore.setState(state => ({
        members: state.members.map(m =>
          m.id === memberIdToUpdate ? { ...m, avatar_url: null, avatarUrl: null } : m
        )
      }));
    }

    setSuccessModal({
      isOpen: true,
      title: 'Foto eliminada',
      message: 'La foto de perfil ha sido eliminada correctamente.'
    });
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorModal({
        isOpen: true,
        title: 'Archivo inválido',
        message: 'Por favor, seleccioná una imagen válida (JPEG, PNG, etc.).'
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorModal({
        isOpen: true,
        title: 'Imagen muy grande',
        message: 'La imagen debe ser menor a 5MB. Por favor,选择了 una imagen más pequeña.'
      });
      return;
    }

    try {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setShowCropper(true);
      // El transform (zoom/rotación/pan) lo resetea <PhotoCropper> al cambiar previewUrl.
    } catch (err) {
      console.error('Error selecting file:', err);
      setErrorModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo procesar la imagen. Por favor, intentá de nuevo.'
      });
    }
  };

  // El arrastre/zoom/rotación y el recorte a canvas viven en <PhotoCropper>
  // (compartido con MobileNav). Acá solo pedimos el Blob y lo subimos.
  const handleSavePhoto = async () => {
    if (!previewUrl) {
      setErrorModal({
        isOpen: true,
        title: 'Sin imagen',
        message: 'No hay imagen para guardar. Por favor, seleccioná una foto primero.'
      });
      return;
    }

    setIsSaving(true);

    try {
      // El recorte lo produce <PhotoCropper> reproduciendo EXACTO la vista previa
      // (mide el <img> real, landmine #2). Escritorio: círculo 256 → JPEG.
      const blob = await cropperRef.current?.getCroppedBlob();

      if (!blob) {
        throw new Error('Error al procesar la imagen');
      }

      // Upload to Supabase - use currentUserMember.id for reliable identification
      const fileExt = 'jpg';
      // Use currentUserMember.id as primary ID, fallback to user?.id
      const memberId = currentUserMember?.id || user?.id || 'unknown';
      const fileName = `avatars/${memberId}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, {
          upsert: true,
          contentType: 'image/jpeg'
        });

      let publicUrl = null;

      if (uploadError) {
        console.error('Upload error:', uploadError);
        console.error('Error message:', uploadError.message);
        console.error('Error status:', uploadError.status);

        // Log for debugging - RLS errors usually mean we need to fix bucket policies
        console.warn('Storage upload failed. Will try fallback save. RLS may need configuration.');
      } else {
        // Get public URL on successful upload
        const { data: { publicUrl: url } } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);
        publicUrl = url;
      }

      // Save photo - either from storage URL or fallback data URL
      const dataUrl = publicUrl || await blobToDataURL(blob);

      // Always save to localStorage
      localStorage.setItem('userPhoto', dataUrl);
      setUserPhoto(dataUrl);

      // Try to update member table using currentUserMember.id
      const memberIdToUpdate = currentUserMember?.id;
      if (memberIdToUpdate) {

        const { error: updateError } = await supabase
          .from('members')
          .update({ avatar_url: dataUrl })
          .eq('id', memberIdToUpdate);

        if (updateError) {
          console.error('Failed to update member avatar_url:', updateError);
        }

        // Sync appStore.members immediately so changes are visible everywhere
        useAppStore.setState(state => ({
          members: state.members.map(m =>
            m.id === memberIdToUpdate ? { ...m, avatar_url: dataUrl, avatarUrl: dataUrl } : m
          )
        }));

        // Persist to localStorage for survival across refreshes
        const currentMembers = JSON.parse(localStorage.getItem('appMembers') || '[]');
        const updatedMembers = currentMembers.map(m =>
          m.id === memberIdToUpdate ? { ...m, avatar_url: dataUrl, avatarUrl: dataUrl } : m
        );
        localStorage.setItem('appMembers', JSON.stringify(updatedMembers));
      } else {
        console.error('Cannot update member: currentUserMember.id is null/undefined');
      }

      // Show success modal
      setSuccessModal({
        isOpen: true,
        title: '¡Foto actualizada!',
        message: uploadError
          ? 'La foto se guardó localmente. Puede que tarde en aparecer en todos los dispositivos.'
          : 'Tu foto de perfil se ha guardado correctamente.'
      });
    } catch (err) {
      console.error('Photo save error:', err);
      setErrorModal({
        isOpen: true,
        title: 'Error al guardar',
        message: 'No se pudo guardar la foto. Por favor, intentá de nuevo.'
      });
    } finally {
      setIsSaving(false);
      setShowCropper(false);
      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      <header className="h-16 border-b border-neutral-800 flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">{title}</h1>
          <ChevronRight size={16} className="text-gray-600" />
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('openCommandPalette'))}
            className="p-2 rounded-lg hover:bg-neutral-800 transition-colors relative"
            title="Buscar"
          >
            <Search size={20} className="text-gray-400 hover:text-white transition-colors" />
          </button>
          <button
            className="p-2 rounded-lg hover:bg-neutral-800 transition-colors relative"
            title="Sincronizar perfil con Miembros"
            onClick={async () => {
              setIsSyncing(true);
              try {
                // ALWAYS reload from Supabase database - NEVER use cache
                await useAppStore.getState().initialize();
                // Force refresh auth profile from DB
                await authRefreshProfile();
              } finally {
                setIsSyncing(false);
              }
            }}
          >
            <RefreshCw size={20} className={`text-gray-400 hover:text-white transition-colors ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
          <button
            className="p-2.5 rounded-lg hover:bg-neutral-800 transition-colors relative bg-neutral-900 border border-neutral-700 group"
            title="Notificaciones"
            onClick={() => setShowNotifications(true)}
          >
            <Bell size={20} className="text-gray-400 group-hover:text-white transition-colors" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-neutral-900 animate-pulse" />
            )}
          </button>
          <div
            className="flex items-center gap-3 pl-4 border-l border-neutral-800 cursor-pointer hover:bg-neutral-800/50 rounded-lg p-2 -m-2 transition-colors"
            onClick={() => {
              // Open profile modal in READ mode first
              setIsEditing(false);
              setShowProfile(true);
            }}
            title="Mi Perfil"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-xs text-gray-500 capitalize">
                {displayRole === 'pastor' ? 'Pastor' : displayRole === 'leader' ? 'Líder' : 'Miembro'}
              </p>
            </div>
            {userPhoto ? (
              <img src={userPhoto} alt="Perfil" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <Avatar name={displayName} size="md" />
            )}
          </div>
        </div>
      </header>

      {/* Profile Modal */}
      <Modal
        isOpen={showProfile}
        onClose={() => { setShowProfile(false); setIsEditing(false); }}
        title={isEditing ? 'Editar Perfil' : 'Mi Perfil'}
        size="md"
      >
        <div className="space-y-6">
          {/* Profile Header */}
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              {userPhoto ? (
                <img src={userPhoto} alt="Perfil" className="w-28 h-28 rounded-full object-cover border-4 border-neutral-700" />
              ) : (
                <Avatar name={displayName} size="xl" />
              )}
              <button
                onClick={handleCameraClick}
                className="absolute bottom-0 right-0 p-2 bg-gold-gradient rounded-full hover:brightness-110 transition-colors shadow-lg"
                title="Cambiar foto"
              >
                <Camera size={16} className="text-white" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                className="hidden"
              />
            </div>
            <h3 className="mt-4 text-xl font-semibold">{displayName}</h3>
            <p className="text-gray-400 capitalize">
              {displayRole === 'pastor' ? 'Pastor' : displayRole === 'leader' ? 'Líder' : 'Miembro'}
            </p>
          </div>

          {/* Profile Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-xl">
              <div className="p-2 bg-neutral-700 rounded-lg">
                <User size={18} className="text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400">Nombre</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
                    placeholder="Tu nombre"
                  />
                ) : (
                  <p className="font-medium">{displayName}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-xl">
              <div className="p-2 bg-neutral-700 rounded-lg">
                <Phone size={18} className="text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400">Teléfono</p>
                {isEditing ? (
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
                    placeholder="+54 11 1234-5678"
                  />
                ) : (
                  <p className="font-medium">{currentUserMember?.phone || profile?.phone || 'No configurado'}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-xl">
              <div className="p-2 bg-neutral-700 rounded-lg">
                <Cross size={18} className="text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400">Pastor de área</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editPastorArea}
                    onChange={(e) => setEditPastorArea(e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
                    placeholder="Nombre del pastor"
                  />
                ) : (
                  <p className="font-medium">{currentUserMember?.pastor_area || profile?.pastor_area || 'No configurado'}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-xl">
              <div className="p-2 bg-neutral-700 rounded-lg">
                <Users2 size={18} className="text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400">Tu líder</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editLeaderOf}
                    onChange={(e) => setEditLeaderOf(e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
                    placeholder="Nombre de tu líder (Equipo de Avivamiento)"
                  />
                ) : (
                  <p className="font-medium">{currentUserMember?.leader_of || profile?.leader_of || 'No configurado'}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-xl">
              <div className="p-2 bg-neutral-700 rounded-lg">
                <Calendar size={18} className="text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400">Fecha de nacimiento</p>
                {isEditing ? (
                  <input
                    type="date"
                    value={editBirthdate}
                    onChange={(e) => setEditBirthdate(e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
                  />
                ) : (
                  <p className="font-medium">{(currentUserMember?.birthdate || profile?.birthdate) ? formatDateLocal(currentUserMember?.birthdate || profile?.birthdate) : 'No configurada'}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-xl">
              <div className="p-2 bg-neutral-700 rounded-lg">
                <Mail size={18} className="text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400">Correo electrónico</p>
                <p className="font-medium">{user?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-xl">
              <div className="p-2 bg-neutral-700 rounded-lg">
                <Shield size={18} className="text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400">Rol en el sistema</p>
                <p className="font-medium capitalize">
                  {displayRole === 'pastor' ? 'Pastor' : displayRole === 'leader' ? 'Líder' : 'Miembro'}
                </p>
              </div>
            </div>
          </div>

          {/* Edit / Save Buttons */}
          <div className="flex flex-col gap-3 pt-2">
            {!isEditing ? (
              <>
                <Button onClick={handleEditProfile} className="w-full" size="lg">
                  <User size={18} />
                  Editar Perfil
                </Button>
                <button
                  onClick={() => { setShowPasswordChange(true); setShowProfile(false); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-gray-300 hover:text-white transition-colors text-sm font-medium"
                >
                  <Lock size={16} />
                  Cambiar Contraseña
                </button>
              </>
            ) : (
              <>
                <Button onClick={handleSaveExtendedProfile} className="w-full" size="lg">
                  <Check size={18} />
                  Guardar Cambios
                </Button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-gray-400 hover:text-white transition-colors text-sm font-medium"
                >
                  <X size={16} />
                  Cancelar
                </button>
              </>
            )}
          </div>

          {/* Push notification toggle */}
          <PushToggle memberId={currentUserMember?.id} />

          {/* Logout Button */}
          <button
            onClick={async () => {
              await logout();
              window.location.href = '/login';
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-gray-400 hover:text-white transition-colors"
          >
            <LogOut size={18} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </Modal>

      {/* Photo Options Modal */}
      <Modal
        isOpen={showPhotoOptions}
        onClose={() => setShowPhotoOptions(false)}
        title="Opciones de Foto"
        size="sm"
      >
        <div className="space-y-3">
          <button
            onClick={handleReplacePhoto}
            className="w-full flex items-center gap-3 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-white transition-colors"
          >
            <Camera size={18} />
            <span>Reemplazar foto</span>
          </button>
          <button
            onClick={handleDeletePhoto}
            className="w-full flex items-center gap-3 px-4 py-3 bg-red-500/20 hover:bg-red-500/30 rounded-xl text-red-400 transition-colors"
          >
            <Trash2 size={18} />
            <span>Eliminar foto</span>
          </button>
        </div>
      </Modal>

      {/* Image Cropper Modal - Full Image Preview Version */}
      <Modal
        isOpen={showCropper}
        onClose={() => {
          if (!isSaving) {
            setShowCropper(false);
            setPreviewUrl(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        }}
        title="Ajustar Foto de Perfil"
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                if (!isSaving) {
                  setShowCropper(false);
                  setPreviewUrl(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }
              }}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSavePhoto}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Guardar
                </>
              )}
            </Button>
          </>
        }
      >
        <PhotoCropper
          ref={cropperRef}
          previewUrl={previewUrl}
          circleSize={256}
          stageHeight={280}
          imgMaxHeight={260}
          canvasSize={400}
          outputType="image/jpeg"
          outputQuality={0.9}
        />
      </Modal>

      {/* Password Change Modal */}
      <Modal
        isOpen={showPasswordChange}
        onClose={() => {
          setShowPasswordChange(false);
          setNewPassword('');
          setConfirmPassword('');
        }}
        title="Cambiar Contraseña"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setShowPasswordChange(false);
                setNewPassword('');
                setConfirmPassword('');
              }}
              disabled={passwordSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={passwordSaving || !newPassword || !confirmPassword}
            >
              {passwordSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Guardar Contraseña
                </>
              )}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-4 bg-neutral-800/50 rounded-xl flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Lock size={18} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium">{profile?.name || user?.email}</p>
              <p className="text-xs text-gray-400">Cambiando contraseña de tu cuenta</p>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-2">
              Nueva Contraseña
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 transition-colors pr-12"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors"
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-2">
              Confirmar Contraseña
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repetí la nueva contraseña"
                className={`w-full px-4 py-3 bg-neutral-900 border rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500/40 transition-colors pr-12 ${
                  confirmPassword && confirmPassword !== newPassword
                    ? 'border-red-500 focus:border-red-500'
                    : confirmPassword && confirmPassword === newPassword
                    ? 'border-green-500 focus:border-green-500'
                    : 'border-neutral-800 focus:border-gold-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {confirmPassword && confirmPassword !== newPassword && (
              <p className="text-xs text-red-400 mt-1">Las contraseñas no coinciden</p>
            )}
            {confirmPassword && confirmPassword === newPassword && (
              <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                <Check size={12} /> Las contraseñas coinciden
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* Notifications Modal */}
      <Modal
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        title="Notificaciones"
        size="md"
      >
        <div className="space-y-4">
          {/* Filter to show only unread notifications */}
          {(() => {
            const unreadNotifications = notifications.filter(
              notif => !readNotificationIds.includes(notif.id)
            );

            if (unreadNotifications.length === 0) {
              return (
                <div className="text-center py-12">
                  <Bell size={48} className="mx-auto text-gray-600 mb-4" />
                  <p className="text-gray-400 font-medium">No hay notificaciones nuevas</p>
                  <p className="text-xs text-gray-500 mt-2">Las notificaciones aparecen cuando hay nuevas canciones, bandas o miembros</p>
                </div>
              );
            }

            return (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">{unreadNotifications.length} notificación(es) sin leer</span>
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
                        navigate('/solicitudes');
                      }
                    }}
                    className="relative p-4 bg-neutral-800/50 rounded-xl border border-neutral-700 hover:border-gold-500/50 transition-colors cursor-pointer"
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
                      <NotifIconBadge type={notif.type} icon={notif.icon} radiusClass="rounded-lg" />
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
                                  <User size={12} className="text-blue-400" />
                                </div>
                              )}
                              <span className="text-xs text-blue-400 font-medium">{notif.senderName}</span>
                            </div>
                            <p className="text-sm text-white font-medium leading-relaxed">{notif.subject}</p>
                            <p className="text-xs text-gray-400 mt-1 leading-relaxed">{notif.preview}</p>
                            <div className="mt-2 pt-2 border-t border-neutral-700">
                              <p className="text-sm text-gray-300 leading-relaxed">{notif.fullMessage}</p>
                            </div>
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
                      <span className="w-2 h-2 bg-gold-400 rounded-full flex-shrink-0 mt-2" />
                    </div>
                  </div>
                ))}
              </>
            );
          })()}
        </div>
      </Modal>

      {/* Custom Success Modal */}
      <Modal
        isOpen={successModal.isOpen}
        onClose={() => setSuccessModal({ isOpen: false, title: '', message: '' })}
        title={successModal.title}
        size="sm"
        footer={
          <Button
            onClick={() => setSuccessModal({ isOpen: false, title: '', message: '' })}
            className="w-full"
          >
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

      {/* Custom Error Modal */}
      <Modal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal({ isOpen: false, title: '', message: '' })}
        title={errorModal.title}
        size="sm"
        footer={
          <Button
            onClick={() => setErrorModal({ isOpen: false, title: '', message: '' })}
            variant="secondary"
            className="w-full"
          >
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
