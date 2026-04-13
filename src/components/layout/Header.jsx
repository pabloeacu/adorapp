// AdorAPP - Centro de Avivamiento Familiar
// Photo Cropper fix - Canvas API image processing
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search, ChevronRight, User, Mail, Shield, Camera, X, RotateCcw, ZoomIn, ZoomOut, Check, Move, LogOut, Trash2, Phone, Cross, Users2, Calendar, Loader2, Lock, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import { supabase } from '../../lib/supabase';
import { Avatar } from '../ui/Avatar';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

const pageTitles = {
  '/': 'Dashboard',
  '/ordenes': 'Órdenes de Servicio',
  '/repertorio': 'Repertorio',
  '/bandas': 'Bandas',
  '/miembros': 'Miembros',
};

export const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, logout, refreshProfile: authRefreshProfile } = useAuthStore();
  const { updateMember, members } = useAppStore();
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
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);
  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const title = pageTitles[location.pathname] || 'AdorAPP';

  const isPastor = profile?.role === 'pastor';
  const isLeader = profile?.role === 'leader';

  // CRITICAL FIX: Get profile from authStore OR fall back to appStore.members
  // This ensures the user always sees their correct profile data
  const currentUserMember = useMemo(() => {
    // First try authStore profile
    if (profile) return profile;
    // Fall back to appStore members by matching email
    if (user?.email) {
      const member = members.find(m => m.email === user.email);
      if (member) return member;
    }
    return null;
  }, [profile, user, members]);

  const displayName = currentUserMember?.name || profile?.name || user?.name || 'Usuario';
  const displayRole = currentUserMember?.role || profile?.role || 'member';
  const displayPhoto = currentUserMember?.avatar_url || currentUserMember?.avatarUrl || profile?.avatar_url || profile?.avatarUrl;

  // Load saved photo on mount
  useEffect(() => {
    const savedPhoto = localStorage.getItem('userPhoto');
    if (savedPhoto) {
      setUserPhoto(savedPhoto);
    } else if (displayPhoto) {
      setUserPhoto(displayPhoto);
    } else if (profile?.avatar_url) {
      setUserPhoto(profile.avatar_url);
    }
  }, [profile, displayPhoto]);

  // Listen for events from MobileNav
  useEffect(() => {
    const handleOpenPhotoUpload = () => {
      setShowProfile(true);
    };

    const handleOpenEditProfile = () => {
      setEditName(currentUserMember?.name || profile?.name || user?.name || '');
      setEditPhone(currentUserMember?.phone || profile?.phone || '');
      setEditPastorArea(currentUserMember?.pastor_area || profile?.pastor_area || '');
      setEditLeaderOf(currentUserMember?.leader_of || profile?.leader_of || '');
      setEditBirthdate(currentUserMember?.birthdate || profile?.birthdate || '');
      setIsEditing(true);
      setShowProfile(true);
    };

    window.addEventListener('openPhotoUpload', handleOpenPhotoUpload);
    window.addEventListener('openEditProfile', handleOpenEditProfile);

    return () => {
      window.removeEventListener('openPhotoUpload', handleOpenPhotoUpload);
      window.removeEventListener('openEditProfile', handleOpenEditProfile);
    };
  }, [profile, user, currentUserMember]);

  const handleEditProfile = () => {
    setEditName(currentUserMember?.name || profile?.name || user?.name || '');
    setEditPhone(currentUserMember?.phone || profile?.phone || '');
    setEditPastorArea(currentUserMember?.pastor_area || profile?.pastor_area || '');
    setEditLeaderOf(currentUserMember?.leader_of || profile?.leader_of || '');
    setEditBirthdate(currentUserMember?.birthdate || profile?.birthdate || '');
    setIsEditing(true);
  };

  const handleSaveProfile = () => {
    if (editName.trim()) {
      useAuthStore.setState({
        user: { ...user, name: editName.trim() }
      });
      localStorage.setItem('user', JSON.stringify({ ...user, name: editName.trim() }));

      const memberIndex = members.findIndex(m => m.email === user?.email);
      if (memberIndex !== -1) {
        updateMember(members[memberIndex].id, { name: editName.trim() });
      }

      setIsEditing(false);
    }
  };

  const handleSaveExtendedProfile = async () => {
    if (!editName.trim()) {
      alert('El nombre es obligatorio');
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

      const { error } = await supabase
        .from('members')
        .update(updateData)
        .eq('user_id', user?.id);

      if (error) {
        console.error('Error updating profile:', error);
        alert('Error al actualizar el perfil');
        return;
      }

      await authRefreshProfile();

      // Sync appStore.members so Miembros page sees changes immediately
      useAppStore.setState(state => ({
        members: state.members.map(m =>
          m.userId === user?.id ? {
            ...m,
            name: updateData.name,
            phone: updateData.phone,
            pastor_area: updateData.pastor_area,
            leader_of: updateData.leader_of,
            birthdate: updateData.birthdate,
          } : m
        )
      }));

      setIsEditing(false);
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Error al guardar los cambios');
    }
  };

  // Change own password
  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      alert('Ingresá la nueva contraseña');
      return;
    }
    if (newPassword.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('Las contraseñas no coinciden');
      return;
    }
    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setShowPasswordChange(false);
      setNewPassword('');
      setConfirmPassword('');
      alert('¡Contraseña actualizada correctamente!');
    } catch (err) {
      console.error('Error changing password:', err);
      alert('Error al cambiar la contraseña: ' + (err.message || 'Intentá de nuevo'));
    } finally {
      setPasswordSaving(false);
    }
  };

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

  const handleDeletePhoto = () => {
    localStorage.removeItem('userPhoto');
    setUserPhoto(null);
    setShowPhotoOptions(false);
    if (profile?.avatar_url) {
      const fileName = profile.avatar_url.split('/').pop();
      supabase.storage.from('avatars').remove([fileName]);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona una imagen válida.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen es muy grande. Máximo 5MB.');
      return;
    }

    try {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setShowCropper(true);
      setZoom(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
    } catch (err) {
      console.error('Error selecting file:', err);
      alert('Error al seleccionar la imagen.');
    }
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleMouseMove = useCallback((e) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Process and save photo with crop/zoom/rotation applied - FIXED VERSION
  const handleSavePhoto = async () => {
    if (!previewUrl) {
      alert('No hay imagen para guardar');
      return;
    }

    setIsSaving(true);

    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = previewUrl;
      });

      // Output canvas size - high quality
      const cropSize = 400;
      // The preview container is w-64 = 256px in CSS
      const displaySize = 256;
      // Scale factor from display coordinates to canvas coordinates
      const posScale = cropSize / displaySize;

      const canvas = document.createElement('canvas');
      canvas.width = cropSize;
      canvas.height = cropSize;
      const ctx = canvas.getContext('2d');

      // Object-cover base scale: scale image so it fills the crop square
      // (same logic as CSS object-cover on a square container)
      const imgAspect = img.width / img.height;
      let baseCoverScale;
      if (imgAspect > 1) {
        // Wide image → scale so height = cropSize (width overflows, gets clipped)
        baseCoverScale = cropSize / img.height;
      } else {
        // Tall or square image → scale so width = cropSize (height overflows, gets clipped)
        baseCoverScale = cropSize / img.width;
      }

      const baseW = img.width * baseCoverScale;
      const baseH = img.height * baseCoverScale;

      // CRITICAL: Clip to circle BEFORE drawing (not after)
      ctx.save();
      ctx.beginPath();
      ctx.arc(cropSize / 2, cropSize / 2, cropSize / 2, 0, Math.PI * 2);
      ctx.clip();

      // Replicate the CSS transform chain: scale(zoom) rotate(rotation) translate(px/zoom, py/zoom)
      // Canvas transforms apply in reverse order, so we use translate → rotate → scale order:
      ctx.translate(cropSize / 2, cropSize / 2);   // move to center (transform-origin: center)
      ctx.scale(zoom, zoom);                         // CSS scale(zoom)
      ctx.rotate((rotation * Math.PI) / 180);        // CSS rotate(rotation)
      // CSS translate(px/zoom, py/zoom) × posScale to convert display→canvas coords
      ctx.translate(
        (position.x * posScale) / zoom,
        (position.y * posScale) / zoom
      );

      // Draw object-cover image centered on origin
      ctx.drawImage(img, -baseW / 2, -baseH / 2, baseW, baseH);
      ctx.restore();

      // Convert to blob
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      });

      if (!blob) {
        throw new Error('Error al procesar la imagen');
      }

      // Upload to Supabase
      const fileExt = 'jpg';
      const fileName = `avatars/${user?.id}-${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, {
          upsert: true,
          contentType: 'image/jpeg'
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        // Fallback: save as local data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        localStorage.setItem('userPhoto', dataUrl);
        setUserPhoto(dataUrl);

        // Try to update member table anyway
        await supabase
          .from('members')
          .update({ avatar_url: dataUrl })
          .eq('user_id', user?.id);
      } else {
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);

        localStorage.setItem('userPhoto', publicUrl);
        setUserPhoto(publicUrl);

        await supabase
          .from('members')
          .update({ avatar_url: publicUrl })
          .eq('user_id', user?.id);
      }

      console.log('Photo saved successfully');

    } catch (err) {
      console.error('Photo save error:', err);
      alert('Error al guardar la foto. Intentá de nuevo.');
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
                // First load fresh data from appStore (members)
                await useAppStore.getState().initialize();
                // Then refresh auth profile
                await authRefreshProfile();
                // Force re-render by triggering a state update
                useAuthStore.setState({ profile: useAuthStore.getState().profile });
              } finally {
                setIsSyncing(false);
              }
            }}
          >
            <RefreshCw size={20} className={`text-gray-400 hover:text-white transition-colors ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
          <button className="p-2.5 rounded-lg hover:bg-neutral-800 transition-colors relative bg-neutral-900 border border-neutral-700 group" title="Notificaciones">
            <Bell size={20} className="text-gray-400 group-hover:text-white transition-colors" />
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-neutral-900 animate-pulse" />
          </button>
          <div
            className="flex items-center gap-3 pl-4 border-l border-neutral-800 cursor-pointer hover:bg-neutral-800/50 rounded-lg p-2 -m-2 transition-colors"
            onClick={() => {
              // Navigate to Members section - Members is the single source of truth for profiles
              navigate('/miembros?edit=self');
            }}
            title="Editar mi perfil en Miembros"
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
                className="absolute bottom-0 right-0 p-2 bg-blue-600 rounded-full hover:bg-blue-500 transition-colors shadow-lg"
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
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
                      placeholder="Tu nombre"
                    />
                    <button
                      onClick={handleSaveExtendedProfile}
                      className="p-1.5 bg-green-600 rounded-lg hover:bg-green-500 transition-colors"
                      title="Guardar"
                    >
                      <Check size={16} className="text-white" />
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="p-1.5 bg-neutral-600 rounded-lg hover:bg-neutral-500 transition-colors"
                      title="Cancelar"
                    >
                      <X size={16} className="text-white" />
                    </button>
                  </div>
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
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
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
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
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
                <p className="text-xs text-gray-400">Líder de</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editLeaderOf}
                    onChange={(e) => setEditLeaderOf(e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
                    placeholder="Grupo o área"
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
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
                  />
                ) : (
                  <p className="font-medium">{(currentUserMember?.birthdate || profile?.birthdate) ? new Date(currentUserMember?.birthdate || profile?.birthdate).toLocaleDateString('es-AR') : 'No configurada'}</p>
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
                  {profile?.role === 'pastor' ? 'Pastor' : profile?.role === 'leader' ? 'Líder' : 'Miembro'}
                </p>
              </div>
            </div>
          </div>

          {/* Edit Button - ALL users can edit their profile */}
          {!isEditing && (
            <div className="flex flex-col gap-2">
              <Button onClick={handleEditProfile} variant="secondary" className="w-full">
                <User size={16} />
                Editar Perfil
              </Button>
              <button
                onClick={() => { setShowPasswordChange(true); setShowProfile(false); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-gray-300 hover:text-white transition-colors text-sm font-medium"
              >
                <Lock size={16} />
                Cambiar Contraseña
              </button>
            </div>
          )}

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

      {/* Image Cropper Modal - Fixed Version */}
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
        <div className="space-y-4">
          {/* Image Preview with Circular Mask */}
          <div className="relative flex items-center justify-center" style={{ height: '280px' }}>
            {/* Checkered Background */}
            <div
              className="absolute inset-0 overflow-hidden rounded-xl"
              style={{
                background: 'repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 50% / 20px 20px'
              }}
            />

            {/* Circular Mask Container */}
            <div
              className="relative w-64 h-64 rounded-full overflow-hidden cursor-move"
              onMouseDown={handleMouseDown}
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                    transition: isDragging ? 'none' : 'transform 0.2s ease'
                  }}
                  draggable={false}
                />
              )}

              {/* Circle Border Overlay */}
              <div className="absolute inset-0 border-[3px] border-white/60 rounded-full pointer-events-none" />

              {/* Corner Handles */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white/60 rounded-tl-full pointer-events-none" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white/60 rounded-tr-full pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white/60 rounded-bl-full pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white/60 rounded-br-full pointer-events-none" />
            </div>

            {/* Drag Hint */}
            {isDragging && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5">
                <Move size={12} />
                Soltá para posicionar
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="space-y-4 p-4 bg-neutral-800/50 rounded-xl">
            {/* Zoom Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-400">
                  <ZoomOut size={16} />
                  <span className="text-xs">Zoom</span>
                </div>
                <span className="text-xs text-white font-medium">{Math.round(zoom * 100)}%</span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>
            </div>

            {/* Rotation Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-400">
                  <RotateCcw size={16} />
                  <span className="text-xs">Rotación</span>
                </div>
                <span className="text-xs text-white font-medium">{rotation}°</span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="5"
                  value={rotation}
                  onChange={(e) => setRotation(parseInt(e.target.value))}
                  className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setZoom(1); setRotation(0); setPosition({ x: 0, y: 0 }); }}
                className="flex-1 px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm text-gray-300 transition-colors flex items-center justify-center gap-1.5"
              >
                <RotateCcw size={14} />
                Restablecer
              </button>
              <button
                onClick={() => setRotation(prev => prev + 90)}
                className="flex-1 px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm text-gray-300 transition-colors"
              >
                +90°
              </button>
              <button
                onClick={() => setRotation(prev => prev - 90)}
                className="flex-1 px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm text-gray-300 transition-colors"
              >
                -90°
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center">
            Arrastrá la imagen para posicionarla. Ajustá el zoom y rotación según sea necesario.
          </p>
        </div>
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
                className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl focus:outline-none focus:border-blue-500 transition-colors pr-12"
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
                className={`w-full px-4 py-3 bg-neutral-900 border rounded-xl focus:outline-none transition-colors pr-12 ${
                  confirmPassword && confirmPassword !== newPassword
                    ? 'border-red-500 focus:border-red-500'
                    : confirmPassword && confirmPassword === newPassword
                    ? 'border-green-500 focus:border-green-500'
                    : 'border-neutral-800 focus:border-blue-500'
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
    </>
  );
};
