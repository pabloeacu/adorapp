// AdorAPP - Centro de Avivamiento Familiar
// Photo Cropper fix - Canvas API image processing
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search, ChevronRight, User, Mail, Shield, Camera, X, RotateCcw, ZoomIn, ZoomOut, Check, Move, LogOut, Trash2, Phone, Cross, Users2, Calendar, Loader2, Lock, Eye, EyeOff, RefreshCw, Music, Heart, FileText, Send } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import { supabase } from '../../lib/supabase';
import { Avatar } from '../ui/Avatar';
import { Modal } from '../ui/Modal';
import { PushToggle } from '../PushToggle';
import { Button } from '../ui/Button';

// Helper to format dates WITHOUT timezone shift (for birthdates and stored dates)
// When we store YYYY-MM-DD, we want to display it as-is, not shifted by timezone
const formatDateLocal = (dateStr) => {
  if (!dateStr) return '';
  // Handle both YYYY-MM-DD and ISO formats
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  // Parse manually to avoid timezone shift
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

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
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [readNotificationIds, setReadNotificationIds] = useState([]);

  // Load read notification IDs specific to current user
  useEffect(() => {
    if (user?.id) {
      const userKey = `readNotificationIds_${user.id}`;
      const saved = JSON.parse(localStorage.getItem(userKey) || '[]');
      setReadNotificationIds(saved);
      // Clean up old global key if exists (migration)
      const oldKey = localStorage.getItem('readNotificationIds');
      if (oldKey && !localStorage.getItem(userKey)) {
        localStorage.setItem(userKey, oldKey);
        localStorage.removeItem('readNotificationIds');
      }
    }
  }, [user?.id]);

  // Custom success/error modals - replaces browser alerts
  const [successModal, setSuccessModal] = useState({ isOpen: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ isOpen: false, title: '', message: '' });
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const title = pageTitles[location.pathname] || 'AdorAPP';

  const isPastor = profile?.role === 'pastor';
  const isLeader = profile?.role === 'leader';

  // CRITICAL: Get profile from appStore.members (single source of truth for role, name, photo)
  // The authStore.profile might not have the correct role, so we MUST check members table
  const currentUserMember = useMemo(() => {
    if (user?.email) {
      // Find the member by email in appStore - this is the source of truth
      const member = members.find(m => m.email === user.email);
      if (member) return member;
    }
    return null;
  }, [user, members]);

  // Use authStore profile ONLY for fields not in members table (like auth metadata)
  // For role, name, photo - ALWAYS use currentUserMember from appStore
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


  // Load notifications from Supabase. Devotional + reflection are global rows
  // emitted by daily pg_cron jobs (06:00 ART y 17:00 ART) — viven en la tabla
  // y se autoexpiran a las 00:00 ART. Resto de las notifs (canciones, miembros,
  // comunicaciones) se derivan de otras tablas.
  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const notifs = [];

        // Check for new songs from Supabase
        const { data: newSongs } = await supabase
          .from('songs')
          .select('id, title, created_at')
          .order('created_at', { ascending: false })
          .limit(5);

        if (newSongs && newSongs.length > 0) {
          notifs.push({
            id: 'song-' + newSongs[0].id,
            type: 'song',
            message: `¡Nueva canción en el repertorio! "${newSongs[0].title}" - ¡Es hora de aprenderla!`,
            icon: 'music',
            time: new Date(newSongs[0].created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
          });
        }

        // Check for new bands from Supabase
        const { data: newBands } = await supabase
          .from('bands')
          .select('id, name, created_at')
          .order('created_at', { ascending: false })
          .limit(3);

        if (newBands && newBands.length > 0) {
          notifs.push({
            id: 'band-' + newBands[0].id,
            type: 'band',
            message: `¡Tenemos una nueva banda en línea! "${newBands[0].name}" te está esperando.`,
            icon: 'users',
            time: new Date(newBands[0].created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
          });
        }

        // Check for new members from Supabase
        const { data: newMembers } = await supabase
          .from('members')
          .select('id, name, created_at')
          .order('created_at', { ascending: false })
          .limit(3);

        if (newMembers && newMembers.length > 0) {
          notifs.push({
            id: 'member-' + newMembers[0].id,
            type: 'member',
            message: `¡Recibimos a un nuevo miembro en la familia de adoración! Bienvenido/a ${newMembers[0].name}.`,
            icon: 'heart',
            time: new Date(newMembers[0].created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
          });
        }

        // Check for pending registration requests (pastors only)
        if (isPastor) {
          const { data: pendingRequests } = await supabase
            .from('pending_registrations')
            .select('id, name, created_at')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

          if (pendingRequests && pendingRequests.length > 0) {
            notifs.push({
              id: 'pending-request-' + pendingRequests[0].id,
              type: 'request',
              message: `${pendingRequests.length} nueva${pendingRequests.length > 1 ? 's' : ''} solicitud${pendingRequests.length > 1 ? 'es' : ''} de registro pendiente${pendingRequests.length > 1 ? 's' : ''}.`,
              icon: 'file',
              time: new Date(pendingRequests[0].created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
            });
          }
        }

        // Load communication notifications for current user
        if (user?.id) {
          const { data: commNotifs } = await supabase
            .from('communication_notifications')
            .select('id, communication_id, sender_name, sender_photo, subject, preview, full_message, is_read, created_at')
            .eq('recipient_id', user.id)
            .eq('is_read', false)
            .order('created_at', { ascending: false })
            .limit(10);

          if (commNotifs && commNotifs.length > 0) {
            commNotifs.forEach(cn => {
              notifs.push({
                id: cn.id,
                type: 'communication',
                communicationId: cn.communication_id,
                senderName: cn.sender_name,
                senderPhoto: cn.sender_photo,
                subject: cn.subject,
                preview: cn.preview,
                fullMessage: cn.full_message,
                message: cn.subject,
                icon: 'send',
                time: new Date(cn.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
              });
            });
          }
        }

        // Load GLOBAL devotional + reflection from notifications table.
        // Filter out expired (the cron sets expires_at to next 00:00 ART so the
        // bell doesn't show yesterday's items after midnight even if the new
        // ones haven't been inserted yet).
        const nowIso = new Date().toISOString();
        const { data: globalNotifs, error: globalError } = await supabase
          .from('notifications')
          .select('id, title, message, type, created_at, expires_at')
          .eq('is_global', true)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order('created_at', { ascending: false })
          .limit(5);

        if (globalError) {
          console.error('Error fetching global notifications:', globalError);
        }

        if (globalNotifs && globalNotifs.length > 0) {
          globalNotifs.forEach(n => {
            notifs.push({
              id: n.id,
              type: n.type, // 'devotional' or 'reflection'
              title: n.title,
              message: n.message,
              icon: 'cross',
              time: new Date(n.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
            });
          });
        }

        setNotifications(notifs);
        const unread = notifs.filter(n => !readNotificationIds.includes(n.id)).length;
        setUnreadCount(unread);
      } catch (err) {
        console.error('Error loading notifications:', err);
      }
    };

    // Load immediately, then keep fresh through Supabase Realtime + a slower
    // 2-minute fallback poll for the "derived" notifications (new songs count etc.)
    // that don't have a direct Realtime hook.
    loadNotifications();
    const interval = setInterval(loadNotifications, 2 * 60 * 1000);

    // Realtime: refresh as soon as relevant rows are inserted, instead of waiting
    // up to 2 minutes for the next poll.
    const channel = supabase
      .channel(`bell-${user?.id || 'anon'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'is_global=eq.true' },
        () => loadNotifications()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'communication_notifications', filter: `recipient_id=eq.${user?.id}` },
        () => loadNotifications()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'songs' },
        () => loadNotifications()
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [readNotificationIds, user?.id]);

  // Mark notification as read (user-specific)
  const markAsRead = async (notificationId) => {
    if (!user?.id) return;
    const userKey = `readNotificationIds_${user.id}`;
    const newReadIds = [...readNotificationIds, notificationId];
    setReadNotificationIds(newReadIds);
    localStorage.setItem(userKey, JSON.stringify(newReadIds));
    setUnreadCount(Math.max(0, unreadCount - 1));

    // Read state of global notifs (devotional/reflection) lives in the
    // per-user read list above — no extra localStorage to maintain.
    const notif = notifications.find(n => n.id === notificationId);

    // Find if this is a communication notification
    if (notif?.type === 'communication' && notif?.communicationId) {
      // Mark as read in database
      await supabase
        .from('communication_notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('recipient_id', user.id);
    }
  };

  // Mark all as read (user-specific)
  const markAllAsRead = () => {
    if (!user?.id) return;
    const userKey = `readNotificationIds_${user.id}`;
    const allIds = notifications.map(n => n.id);
    setReadNotificationIds(allIds);
    localStorage.setItem(userKey, JSON.stringify(allIds));
    setUnreadCount(0);
  };

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
  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      setErrorModal({
        isOpen: true,
        title: 'Campo requerido',
        message: 'Por favor, ingresá la nueva contraseña.'
      });
      return;
    }
    if (newPassword.length < 6) {
      setErrorModal({
        isOpen: true,
        title: 'Contraseña muy corta',
        message: 'La contraseña debe tener al menos 6 caracteres.'
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorModal({
        isOpen: true,
        title: 'Contraseñas no coinciden',
        message: 'Las contraseñas ingresadas no son iguales. Por favor, verificá.'
      });
      return;
    }
    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setShowPasswordChange(false);
      setNewPassword('');
      setConfirmPassword('');
      setSuccessModal({
        isOpen: true,
        title: '¡Contraseña actualizada!',
        message: 'Tu contraseña se ha cambiado correctamente.'
      });
    } catch (err) {
      console.error('Error changing password:', err);
      setErrorModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo cambiar la contraseña. Por favor, intentá de nuevo.'
      });
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
      setZoom(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
    } catch (err) {
      console.error('Error selecting file:', err);
      setErrorModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo procesar la imagen. Por favor, intentá de nuevo.'
      });
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

  // Process and save photo with crop/zoom/rotation applied - MATCHES PREVIEW EXACTLY
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
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = previewUrl;
      });

      // Output canvas size
      const cropSize = 400;
      const canvas = document.createElement('canvas');
      canvas.width = cropSize;
      canvas.height = cropSize;
      const ctx = canvas.getContext('2d');

      // Preview uses maxHeight: 260px, maxWidth: 100%, objectFit: contain, in a 256x256 circle
      // We need to calculate the image dimensions as the browser does for object-fit: contain
      const previewCircleSize = 256; // w-64 h-64 in CSS
      const previewMaxHeight = 260;

      const imgAspect = img.width / img.height;
      let imgDisplayW, imgDisplayH;

      // object-fit: contain calculation
      // Compare image aspect with container aspect (using preview dimensions)
      const containerAspect = 1; // square container
      if (imgAspect > containerAspect) {
        // Wide image: width = previewCircleSize, height proportionally
        imgDisplayW = previewCircleSize;
        imgDisplayH = previewCircleSize / imgAspect;
      } else {
        // Tall/square image: height = previewMaxHeight, width proportionally
        imgDisplayH = previewMaxHeight;
        imgDisplayW = previewMaxHeight * imgAspect;
      }

      // Scale from preview pixels to canvas pixels
      // previewCircleSize (256) maps to cropSize (400)
      const scaleToCanvas = cropSize / previewCircleSize;

      // Draw image centered, scaled to canvas
      const canvasImgW = imgDisplayW * scaleToCanvas;
      const canvasImgH = imgDisplayH * scaleToCanvas;

      // CRITICAL: Match EXACTLY what CSS does
      // CSS: transform: scale(zoom) rotate(rotation) translate(position.x/zoom, position.y/zoom)
      // Canvas applies RIGHT-TO-LEFT, so order is: translate → rotate → scale (visually)

      // First save state
      ctx.save();

      // Move to canvas center
      ctx.translate(cropSize / 2, cropSize / 2);

      // Apply transforms in canvas order (right-to-left = visual left-to-right)
      // Visual order: 1) translate(position/zoom), 2) rotate, 3) scale(zoom)

      // Translate by (position.x / zoom) scaled to canvas
      ctx.translate(
        (position.x / zoom) * scaleToCanvas,
        (position.y / zoom) * scaleToCanvas
      );

      // Rotate around center
      ctx.rotate((rotation * Math.PI) / 180);

      // Scale (zoom)
      ctx.scale(zoom, zoom);

      // Draw image centered at origin
      ctx.drawImage(img, -canvasImgW / 2, -canvasImgH / 2, canvasImgW, canvasImgH);

      ctx.restore();

      // CRITICAL: Clip to circle AFTER drawing (outside the transformed area)
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.beginPath();
      ctx.arc(cropSize / 2, cropSize / 2, cropSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Convert to blob
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      });

      if (!blob) {
        throw new Error('Error al procesar la imagen');
      }

      // Upload to Supabase - use currentUserMember.id for reliable identification
      const fileExt = 'jpg';
      // Use currentUserMember.id as primary ID, fallback to user?.id
      const memberId = currentUserMember?.id || user?.id || 'unknown';
      const fileName = `avatars/${memberId}-${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
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
      const dataUrl = publicUrl || canvas.toDataURL('image/jpeg', 0.9);

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
        } else {
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
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-blue-500"
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
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-blue-500"
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
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-blue-500"
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
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-blue-500"
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
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-blue-500"
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
        <div className="space-y-4">
          {/* Image Preview - Full Image with Circular Guide Overlay */}
          <div className="relative flex items-center justify-center" style={{ height: '280px' }}>
            {/* Dark Background for visibility */}
            <div className="absolute inset-0 bg-neutral-900 rounded-xl" />

            {/* Draggable Image Container - NO clipping, shows full image */}
            <div
              className="relative cursor-move"
              onMouseDown={handleMouseDown}
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-w-none"
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                    transition: isDragging ? 'none' : 'transform 0.2s ease',
                    maxHeight: '260px',
                    maxWidth: '100%',
                    objectFit: 'contain'
                  }}
                  draggable={false}
                />
              )}
            </div>

            {/* Circular Guide Overlay - Semi-transparent, non-clipped */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div
                className="w-64 h-64 rounded-full border-[3px] border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
              />
            </div>

            {/* Corner Handles on the guide */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 pointer-events-none">
              <div className="absolute -top-[3px] -left-[3px] w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-full" />
              <div className="absolute -top-[3px] -right-[3px] w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-full" />
              <div className="absolute -bottom-[3px] -left-[3px] w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-full" />
              <div className="absolute -bottom-[3px] -right-[3px] w-6 h-6 border-b-4 border-r-4 border-white rounded-br-full" />
            </div>

            {/* Drag Hint */}
            {isDragging && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 z-10">
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
            Arrastrá la imagen para posicionarla dentro del círculo. Ajustá el zoom y rotación según sea necesario.
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
                className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-blue-500 transition-colors pr-12"
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
                className={`w-full px-4 py-3 bg-neutral-900 border rounded-xl focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors pr-12 ${
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

      {/* Notifications Modal */}
      <Modal
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        title="Notificaciones"
        size="md"
      >
        <div className="space-y-4">
          {/* Debug info */}
          <div className="text-xs text-gray-500 bg-neutral-800 p-2 rounded mb-4">
            Total loaded: {notifications.length} | Unread: {unreadCount} | Read IDs: {readNotificationIds.length}
          </div>
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
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Marcar todas como leídas
                  </button>
                </div>
                {unreadNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => {
                      markAsRead(notif.id);
                      if (notif.type === 'request') {
                        setShowNotifications(false);
                        navigate('/solicitudes');
                      }
                    }}
                    className="p-4 bg-neutral-800/50 rounded-xl border border-neutral-700 hover:border-blue-500/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        notif.type === 'song' ? 'bg-purple-500/20' :
                        notif.type === 'band' ? 'bg-blue-500/20' :
                        notif.type === 'devotional' ? 'bg-amber-500/20' :
                        notif.type === 'reflection' ? 'bg-indigo-500/20' :
                        notif.type === 'request' ? 'bg-yellow-500/20' :
                        notif.type === 'communication' ? 'bg-blue-500/20' :
                        'bg-green-500/20'
                      }`}>
                        {notif.icon === 'music' && <Music size={18} className="text-purple-400" />}
                        {notif.icon === 'users' && <Users2 size={18} className="text-blue-400" />}
                        {notif.icon === 'heart' && <Heart size={18} className="text-green-400" />}
                        {notif.icon === 'cross' && <Cross size={18} className="text-amber-400" />}
                        {notif.icon === 'file' && <FileText size={18} className="text-yellow-400" />}
                        {notif.icon === 'send' && <Send size={18} className="text-blue-400" />}
                      </div>
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
                            <p className="text-sm text-white leading-relaxed">{notif.message}</p>
                            <p className="text-xs text-gray-500 mt-1">{notif.time}</p>
                          </>
                        )}
                      </div>
                      <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
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
