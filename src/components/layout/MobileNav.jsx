import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  RotateCcw,
  ZoomOut,
  Move,
  FileText,
  Send,
  Bell,
  Music,
  Heart,
  Sunset,
  Search,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { useCurrentMember } from '../../hooks/useCurrentMember';
import { PushToggle } from '../PushToggle';
import { titleForPath } from '../../lib/pageTitles';

// Formato es-AR sin timezone shift — mismo helper que Header.jsx para mantener
// paridad visual de fechas (cumpleaños, etc.) entre layouts.
const formatDateLocal = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// Full nav list. The component filters it by role at render time so plain
// members don't see the "Miembros" tab (it would be empty UX for them).
const ALL_NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Inicio' },
  { path: '/ordenes', icon: CalendarDays, label: 'Órdenes' },
  { path: '/repertorio', icon: Music2, label: 'Repertorio' },
  { path: '/bandas', icon: Users, label: 'Bandas' },
  { path: '/miembros', icon: UserCircle, label: 'Miembros', roles: ['pastor', 'leader'] },
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
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Notifications state
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [readNotificationIds, setReadNotificationIds] = useState([]);

  // Load read notification IDs for current user. Source of truth is the
  // `notifications_read` table in DB (cross-device). localStorage is kept as
  // an optimistic cache so the bell doesn't flicker between mount and the
  // first DB response.
  useEffect(() => {
    const { user } = useAuthStore.getState();
    if (!user?.id) return;
    const userKey = `readNotificationIds_${user.id}`;

    // 1. Hydrate from cache immediately. Depends on user?.id (set by auth
    // after first render), so this can't be lazy initial state.
    const cached = JSON.parse(localStorage.getItem(userKey) || '[]');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReadNotificationIds(cached);

    // 2. Replace with DB truth as soon as it arrives.
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('notifications_read')
        .select('notification_id')
        .eq('user_id', user.id);
      if (cancelled) return;
      if (error) {
        console.error('Error fetching notifications_read:', error);
        return;
      }
      const dbIds = (data || []).map((r) => r.notification_id);
      const merged = Array.from(new Set([...cached, ...dbIds]));
      setReadNotificationIds(merged);
      localStorage.setItem(userKey, JSON.stringify(merged));
    })();

    return () => { cancelled = true; };
  }, []);

  // Load notifications from `notifications` (globals + per-user) and
  // `communication_notifications`. DB triggers populate the first table when
  // songs/bands/members are created or pending registrations come in.
  useEffect(() => {
    const iconForType = (t) => ({
      devotional: 'cross',
      reflection: 'sunset',
      song: 'music',
      band: 'users',
      member: 'heart',
      request: 'file',
      order: 'calendar',
    }[t] || 'cross');

    const loadNotifications = async () => {
      try {
        const notifs = [];
        const { user } = useAuthStore.getState();
        const nowIso = new Date().toISOString();

        let q = supabase
          .from('notifications')
          .select('id, title, message, type, user_id, is_global, created_at, expires_at')
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order('created_at', { ascending: false })
          .limit(20);
        q = user?.id
          ? q.or(`is_global.eq.true,user_id.eq.${user.id}`)
          : q.eq('is_global', true);
        const { data: notifRows } = await q;

        (notifRows || []).forEach((n) => {
          notifs.push({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            icon: iconForType(n.type),
            time: new Date(n.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          });
        });

        // Communications (separate shape: sender + subject + preview + full body).
        if (user?.id) {
          const { data: commNotifs } = await supabase
            .from('communication_notifications')
            .select('id, communication_id, sender_name, sender_photo, subject, preview, full_message, is_read, created_at')
            .eq('recipient_id', user.id)
            .eq('is_read', false)
            .order('created_at', { ascending: false })
            .limit(10);

          (commNotifs || []).forEach((cn) => {
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
              time: new Date(cn.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
            });
          });
        }

        setNotifications(notifs);
        const unread = notifs.filter((n) => !readNotificationIds.includes(n.id)).length;
        setUnreadCount(unread);
      } catch (err) {
        console.error('Error loading notifications:', err);
      }
    };

    loadNotifications();
    const interval = setInterval(loadNotifications, 2 * 60 * 1000);

    const { user } = useAuthStore.getState();
    // Use a per-user channel name (no `-mobile-` suffix) so a user with the
    // app open on both desktop and mobile lands on the same logical channel.
    // Each browser still gets its own websocket — supabase-js scopes channels
    // per client — but the name being identical makes the intent clearer and
    // matches the Header naming.
    const channel = supabase
      .channel(`bell-${user?.id || 'anon'}-mobile`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => loadNotifications()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'communication_notifications', filter: `recipient_id=eq.${user?.id}` },
        () => loadNotifications()
      )
      // Listen for UPDATE too: when the user marks a comm as read on another
      // device (Header / desktop), is_read=true persists in DB and we want the
      // mobile bell to drop that row instantly instead of waiting for the next
      // 2-min poll.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'communication_notifications', filter: `recipient_id=eq.${user?.id}` },
        () => loadNotifications()
      )
      // Same for notifications_read: when this user marks a global notif as
      // read on another device, the INSERT lands here too — we patch the local
      // readNotificationIds set so the badge count drops instantly.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications_read', filter: `user_id=eq.${user?.id}` },
        (payload) => {
          const newId = payload?.new?.notification_id;
          if (!newId) return;
          setReadNotificationIds((prev) => {
            if (prev.includes(newId)) return prev;
            const next = [...prev, newId];
            const userKey = `readNotificationIds_${user?.id}`;
            try { localStorage.setItem(userKey, JSON.stringify(next)); } catch { /* ignore quota */ }
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [readNotificationIds]);

  const markAsRead = async (notificationId) => {
    const { user } = useAuthStore.getState();
    if (!user?.id) return;
    const userKey = `readNotificationIds_${user.id}`;
    const newReadIds = [...readNotificationIds, notificationId];
    // Optimistic UI: update state + cache immediately.
    setReadNotificationIds(newReadIds);
    localStorage.setItem(userKey, JSON.stringify(newReadIds));
    setUnreadCount(Math.max(0, unreadCount - 1));

    const notif = notifications.find((n) => n.id === notificationId);

    if (notif?.type === 'communication') {
      // Communications track is_read per-row.
      await supabase
        .from('communication_notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('recipient_id', user.id);
    } else {
      // Global notifications persist read state in notifications_read so it
      // syncs across devices via Realtime.
      await supabase
        .from('notifications_read')
        .upsert(
          { user_id: user.id, notification_id: notificationId },
          { onConflict: 'user_id,notification_id', ignoreDuplicates: true }
        );
    }
  };

  const markAllAsRead = async () => {
    const { user } = useAuthStore.getState();
    if (!user?.id) return;
    const userKey = `readNotificationIds_${user.id}`;
    const allIds = notifications.map(n => n.id);
    setReadNotificationIds(allIds);
    localStorage.setItem(userKey, JSON.stringify(allIds));
    setUnreadCount(0);

    const commIds = notifications.filter((n) => n.type === 'communication').map((n) => n.id);
    const globalIds = notifications.filter((n) => n.type !== 'communication').map((n) => n.id);

    if (commIds.length > 0) {
      await supabase
        .from('communication_notifications')
        .update({ is_read: true })
        .in('id', commIds)
        .eq('recipient_id', user.id);
    }
    if (globalIds.length > 0) {
      await supabase
        .from('notifications_read')
        .upsert(
          globalIds.map((id) => ({ user_id: user.id, notification_id: id })),
          { onConflict: 'user_id,notification_id', ignoreDuplicates: true }
        );
    }
  };

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
  const isPastor = (currentUserMember?.role || profile?.role) === 'pastor';
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

  // Filter the base nav by role (plain members don't see "Miembros") and
  // add Solicitudes / Comunicaciones for pastors only.
  const role = currentUserMember?.role || profile?.role || 'member';
  const allNavItems = useMemo(() => {
    const items = ALL_NAV_ITEMS.filter((it) => !it.roles || it.roles.includes(role));
    if (isPastor) {
      items.push({ path: '/solicitudes', icon: FileText, label: 'Solicitudes' });
      items.push({ path: '/comunicaciones', icon: Send, label: 'Comunicaciones' });
    }
    return items;
  }, [isPastor, role]);

  const profileSheetRef = useRef(null);
  const fileInputRef = useRef(null);

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

  const handleMouseDown = (e) => {
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

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      alert('El nombre es obligatorio');
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
        alert('No pudimos identificar tu fila de miembro. Probá recargar la página.');
        return;
      }

      const { error } = await supabase
        .from('members')
        .update(updateData)
        .eq('id', memberIdToUpdate);

      if (error) {
        console.error('Error updating profile:', error);
        alert('Error al actualizar el perfil');
        return;
      }

      await refreshProfile();
      setEditMode(false);
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Error al guardar los cambios');
    }
  };

  // Change own password — same flow as Header.jsx, simpler UI (alerts vs modals)
  // since MobileNav doesn't have the success/error modal infrastructure.
  const handleChangePassword = async () => {
    if (!pwNew.trim()) {
      alert('Ingresá la nueva contraseña.');
      return;
    }
    if (pwNew.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (pwNew !== pwConfirm) {
      alert('Las contraseñas no coinciden.');
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
      alert('Contraseña actualizada correctamente.');
    } catch (err) {
      console.error('Error changing password:', err);
      alert('No se pudo cambiar la contraseña. Probá de nuevo.');
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
      alert('Por favor selecciona una imagen válida.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen es muy grande. Máximo 5MB.');
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
      setZoom(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
    } catch (err) {
      console.error('Error selecting file:', err);
      alert('Error al seleccionar la imagen.');
    }
  };

  const handleSavePhoto = async () => {
    if (!previewUrl) {
      setShowCropper(false);
      setPreviewUrl(null);
      return;
    }

    try {
      // Get original file from input
      const file = fileInputRef.current?.files?.[0];
      if (!file) {
        setShowCropper(false);
        setPreviewUrl(null);
        return;
      }


      // Load the image
      const img = new Image();

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = previewUrl;
      });

      // Create canvas - 400x400 for high quality avatar
      const canvasSize = 400;
      const canvas = document.createElement('canvas');
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext('2d');

      // Mobile preview uses maxHeight: 280px, circle is 200px
      const previewCircleSize = 200;
      const previewMaxHeight = 280;
      const imgAspect = img.width / img.height;

      let imgDisplayW, imgDisplayH;
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
      const scaleToCanvas = canvasSize / previewCircleSize;
      const canvasImgW = imgDisplayW * scaleToCanvas;
      const canvasImgH = imgDisplayH * scaleToCanvas;

      // Clip to circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
      ctx.clip();

      // Move to canvas center
      ctx.translate(canvasSize / 2, canvasSize / 2);

      // Apply same transforms as CSS preview
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);
      ctx.translate(
        position.x * scaleToCanvas,
        position.y * scaleToCanvas
      );

      // Draw image centered
      ctx.drawImage(img, -canvasImgW / 2, -canvasImgH / 2, canvasImgW, canvasImgH);

      ctx.restore();

      // Convert canvas to blob
      const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png', 0.95);
      });

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
        alert('Error al subir la foto: ' + uploadError.message);
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
        alert('Error: No se encontró el ID del usuario. Intentá de nuevo.');
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
      alert('Error al procesar la foto. Intentá de nuevo.');
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
      if (e.key === 'Escape' && (profileOpen || showPhotoModal || showCropper)) {
        setProfileOpen(false);
        setShowPhotoModal(false);
        setShowCropper(false);
        setEditMode(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [profileOpen, showPhotoModal, showCropper]);

  // Prevent scroll when profile is open
  useEffect(() => {
    if (profileOpen || showPhotoModal || showCropper) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [profileOpen, showPhotoModal, showCropper]);

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
              touchAction: 'none'
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
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white transition-colors"
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
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white transition-colors"
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
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white transition-colors"
                          placeholder="Nombre del pastor"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-neutral-400 text-xs mb-1.5 ml-1">Líder de</label>
                      <div className="relative">
                        <Users2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" />
                        <input
                          type="text"
                          value={editLeaderOf}
                          onChange={(e) => setEditLeaderOf(e.target.value)}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white transition-colors"
                          placeholder="Grupo o área que lidera"
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
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-11 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white transition-colors"
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
                      className="flex-1 py-3 bg-white text-black font-medium rounded-xl hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2"
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
                        <p className="text-xs text-neutral-500">Líder de</p>
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
                className="w-full py-3 bg-white text-black font-medium rounded-xl hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2"
              >
                <Camera size={18} />
                Seleccionar imagen
              </button>

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
          <div className="flex items-center justify-between p-4 border-b border-neutral-800" onClick={(e) => e.stopPropagation()}>
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
            <button
              onClick={handleSavePhoto}
              className="px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-neutral-200 transition-colors flex items-center gap-2"
            >
              <Check size={18} />
              Guardar
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            {/* Image Preview - Full image with circular guide overlay */}
            <div className="relative flex items-center justify-center" style={{ height: '300px', width: '100%', maxWidth: '400px' }}>
              {/* Dark Background */}
              <div
                className="absolute inset-0 rounded-2xl bg-neutral-900"
              />

              {/* Full Image Container - shows complete image WITHOUT clipping */}
              <div
                className="relative w-full h-full cursor-move"
                onMouseDown={handleMouseDown}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
              >
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="absolute"
                    style={{
                      maxHeight: '280px',
                      maxWidth: '100%',
                      objectFit: 'contain',
                      transform: `scale(${zoom}) rotate(${rotation}deg) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                      transition: isDragging ? 'none' : 'transform 0.2s ease',
                      left: '50%',
                      top: '50%',
                      transformOrigin: 'center center',
                      marginLeft: '-50%',
                      marginTop: '-50%'
                    }}
                    draggable={false}
                  />
                )}
              </div>

              {/* Circle Guide Overlay - Semi-transparent, shows crop area */}
              <div
                className="absolute pointer-events-none"
                style={{
                  width: '200px',
                  height: '200px',
                  borderRadius: '50%',
                  border: '3px solid rgba(255, 255, 255, 0.8)',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)',
                  zIndex: 10
                }}
              />

              {/* Corner Handles on the guide */}
              <div className="absolute pointer-events-none" style={{ width: '200px', height: '200px', zIndex: 11 }}>
                <div className="absolute -top-[3px] -left-[3px] w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-full" />
                <div className="absolute -top-[3px] -right-[3px] w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-full" />
                <div className="absolute -bottom-[3px] -left-[3px] w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-full" />
                <div className="absolute -bottom-[3px] -right-[3px] w-6 h-6 border-b-4 border-r-4 border-white rounded-br-full" />
              </div>

              {/* Drag Hint */}
              {isDragging && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 z-20">
                  <Move size={12} />
                  Soltá para posicionar
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="w-full max-w-sm mt-6 space-y-4 p-4 bg-neutral-800/50 rounded-2xl">
              {/* Zoom Control */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-neutral-400">
                    <ZoomOut size={16} />
                    <span className="text-xs">Zoom</span>
                  </div>
                  <span className="text-xs text-white font-medium">{Math.round(zoom * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>

              {/* Rotation Control */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-neutral-400">
                    <RotateCcw size={16} />
                    <span className="text-xs">Rotación</span>
                  </div>
                  <span className="text-xs text-white font-medium">{rotation}°</span>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="5"
                  value={rotation}
                  onChange={(e) => setRotation(parseInt(e.target.value))}
                  className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setZoom(1); setRotation(0); setPosition({ x: 0, y: 0 }); }}
                  className="flex-1 px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm text-neutral-300 transition-colors flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={14} />
                  Restablecer
                </button>
                <button
                  onClick={() => setRotation(prev => prev + 90)}
                  className="flex-1 px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm text-neutral-300 transition-colors"
                >
                  +90°
                </button>
                <button
                  onClick={() => setRotation(prev => prev - 90)}
                  className="flex-1 px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm text-neutral-300 transition-colors"
                >
                  -90°
                </button>
              </div>
            </div>

            <p className="text-neutral-500 text-xs text-center mt-4 px-4">
              Arrastrá la imagen para posicionarla dentro del círculo. Ajustá el zoom y rotación.
            </p>
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
              {allNavItems.map(({ path, icon: Icon, label }) => {
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
                  className="w-full px-4 py-2.5 pr-10 bg-neutral-800 border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white text-white"
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
                      : 'border-neutral-700 focus:ring-white/40 focus:border-white'
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
                className="flex-1 py-2.5 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
                            window.location.href = '/solicitudes';
                          }
                        }}
                        className="p-4 bg-neutral-800/50 rounded-2xl border border-neutral-700 hover:border-blue-500/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-xl ${
                            notif.type === 'song' ? 'bg-purple-500/20' :
                            notif.type === 'band' ? 'bg-blue-500/20' :
                            notif.type === 'member' ? 'bg-green-500/20' :
                            notif.type === 'order' ? 'bg-emerald-500/20' :
                            notif.type === 'request' ? 'bg-yellow-500/20' :
                            notif.type === 'devotional' ? 'bg-amber-500/20' :
                            notif.type === 'reflection' ? 'bg-indigo-500/20' :
                            notif.type === 'communication' ? 'bg-blue-500/20' :
                            'bg-blue-500/20'
                          }`}>
                            {notif.icon === 'music' && <Music size={18} className="text-purple-400" />}
                            {notif.icon === 'users' && <Users2 size={18} className="text-blue-400" />}
                            {notif.icon === 'heart' && <Heart size={18} className="text-green-400" />}
                            {notif.icon === 'file' && <FileText size={18} className="text-yellow-400" />}
                            {notif.icon === 'cross' && <Cross size={18} className="text-amber-400" />}
                            {notif.icon === 'sunset' && <Sunset size={18} className="text-indigo-400" />}
                            {notif.icon === 'calendar' && <Calendar size={18} className="text-emerald-400" />}
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
                          <span className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
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

      {/* Bottom Tab Bar */}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-lg border-t border-neutral-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around h-20 px-2">
          {allNavItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path;
            return (
              <NavLink
                key={path}
                to={path}
                data-tour={`nav-${path === '/' ? 'inicio' : path.replace('/', '')}`}
                className={`flex flex-col items-center justify-center w-full h-full transition-all ${
                  isActive ? 'text-white' : 'text-gray-500'
                }`}
              >
                <div className={`p-2 rounded-xl transition-all ${isActive ? 'bg-white/10' : ''}`}>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-xs mt-1 font-medium ${isActive ? 'text-white' : ''}`}>
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