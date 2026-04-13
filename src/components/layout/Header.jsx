import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Search, ChevronRight, User, Mail, Shield, Camera, X, RotateCcw, ZoomIn, ZoomOut, Check, Move, LogOut, Trash2, Phone, Cross, Users2, Calendar, Loader2 } from 'lucide-react';
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
  const { user, profile, logout } = useAuthStore();
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
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const title = pageTitles[location.pathname] || 'AdorAPP';

  const isPastor = profile?.role === 'pastor';
  const isLeader = profile?.role === 'leader';

  // Load saved photo on mount
  useEffect(() => {
    const savedPhoto = localStorage.getItem('userPhoto');
    if (savedPhoto) {
      setUserPhoto(savedPhoto);
    } else if (profile?.avatar_url) {
      setUserPhoto(profile.avatar_url);
    }
  }, [profile]);

  // Listen for events from MobileNav
  useEffect(() => {
    const handleOpenPhotoUpload = () => {
      setShowProfile(true);
    };

    const handleOpenEditProfile = () => {
      setEditName(profile?.name || user?.name || '');
      setIsEditing(true);
      setShowProfile(true);
    };

    window.addEventListener('openPhotoUpload', handleOpenPhotoUpload);
    window.addEventListener('openEditProfile', handleOpenEditProfile);

    return () => {
      window.removeEventListener('openPhotoUpload', handleOpenPhotoUpload);
      window.removeEventListener('openEditProfile', handleOpenEditProfile);
    };
  }, [profile, user]);

  const handleEditProfile = () => {
    setEditName(user?.name || profile?.name || '');
    setEditPhone(profile?.phone || '');
    setEditPastorArea(profile?.pastor_area || '');
    setEditLeaderOf(profile?.leader_of || '');
    setEditBirthdate(profile?.birthdate || '');
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

      await refreshProfile();
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Error al guardar los cambios');
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      const { data } = await supabase
        .from('members')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (data) {
        useAuthStore.setState({ profile: data });
      }
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

  // Process and save photo with crop/zoom/rotation applied
  const handleSavePhoto = async () => {
    if (!previewUrl) {
      alert('No hay imagen para guardar');
      return;
    }

    setIsSaving(true);

    try {
      // Create canvas for processing
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = previewUrl;
      });

      // Circular crop size
      const cropSize = 400;
      canvas.width = cropSize;
      canvas.height = cropSize;

      // Clear canvas
      ctx.clearRect(0, 0, cropSize, cropSize);

      // Calculate center of image considering zoom and position
      const centerX = cropSize / 2;
      const centerY = cropSize / 2;
      const imgAspect = img.width / img.height;

      let drawWidth, drawHeight;
      if (imgAspect > 1) {
        drawHeight = cropSize * zoom;
        drawWidth = drawHeight * imgAspect;
      } else {
        drawWidth = cropSize * zoom;
        drawHeight = drawWidth / imgAspect;
      }

      // Apply zoom to position
      const adjustedX = position.x;
      const adjustedY = position.y;

      // Translate to center, rotate, scale, translate back
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(
        img,
        -drawWidth / 2 + adjustedX,
        -drawHeight / 2 + adjustedY,
        drawWidth,
        drawHeight
      );
      ctx.restore();

      // Create circular clip
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, cropSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(canvas, 0, 0);
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
          <button className="p-2 rounded-lg hover:bg-neutral-800 transition-colors relative" title="Buscar">
            <Search size={20} className="text-gray-400 hover:text-white transition-colors" />
          </button>
          <button className="p-2.5 rounded-lg hover:bg-neutral-800 transition-colors relative bg-neutral-900 border border-neutral-700 group" title="Notificaciones">
            <Bell size={20} className="text-gray-400 group-hover:text-white transition-colors" />
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-neutral-900 animate-pulse" />
          </button>
          <div
            className="flex items-center gap-3 pl-4 border-l border-neutral-800 cursor-pointer hover:bg-neutral-800/50 rounded-lg p-2 -m-2 transition-colors"
            onClick={() => setShowProfile(true)}
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{profile?.name || user?.name}</p>
              <p className="text-xs text-gray-500 capitalize">
                {profile?.role === 'pastor' ? 'Pastor' : profile?.role === 'leader' ? 'Líder' : 'Miembro'}
              </p>
            </div>
            {userPhoto ? (
              <img src={userPhoto} alt="Perfil" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <Avatar name={profile?.name || user?.name} size="md" />
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
                <Avatar name={profile?.name || user?.name} size="xl" />
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
            <h3 className="mt-4 text-xl font-semibold">{profile?.name || user?.name}</h3>
            <p className="text-gray-400 capitalize">
              {profile?.role === 'pastor' ? 'Pastor' : profile?.role === 'leader' ? 'Líder' : 'Miembro'}
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
                  <p className="font-medium">{profile?.name || user?.name}</p>
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
                  <p className="font-medium">{profile?.phone || 'No configurado'}</p>
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
                  <p className="font-medium">{profile?.pastor_area || 'No configurado'}</p>
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
                  <p className="font-medium">{profile?.leader_of || 'No configurado'}</p>
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
                  <p className="font-medium">{profile?.birthdate ? new Date(profile.birthdate).toLocaleDateString('es-AR') : 'No configurada'}</p>
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

          {/* Edit Button for Pastors/Leaders */}
          {(isPastor || isLeader) && !isEditing && (
            <Button onClick={handleEditProfile} variant="secondary" className="w-full">
              <User size={16} />
              Editar Perfil
            </Button>
          )}

          {/* Permission Note */}
          {(isPastor || isLeader) && !isEditing && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
              <p className="text-sm text-green-300">
                Podés editar todos tus datos directamente. Los cambios se guardan automáticamente.
              </p>
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
    </>
  );
};
