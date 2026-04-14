// AdorAPP - Centro de Avivamiento Familiar
// Photo Cropper fix - Canvas API image processing
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search, ChevronRight, User, Mail, Shield, Camera, X, RotateCcw, ZoomIn, ZoomOut, Check, Move, LogOut, Trash2, Phone, Cross, Users2, Calendar, Loader2, Lock, Eye, EyeOff, RefreshCw, Music, Heart, FileText } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import { supabase } from '../../lib/supabase';
import { Avatar } from '../ui/Avatar';
import { Modal } from '../ui/Modal';
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
  const [readNotificationIds, setReadNotificationIds] = useState(() => {
    return JSON.parse(localStorage.getItem('readNotificationIds') || '[]');
  });

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

  // Biblical verses for daily devotional - Reina Valera 1960
  // 37 verses from Salmos (Psalms) + 37 verses from Cantar de los Cantares (Song of Solomon)
  const bibleVerses = [
    // SALMOS (Psalms) - 37 verses
    { verse: "Bienaventurado el varón que no anduvo en consejo de malos, ni estuvo en camino de pecadores, ni en silla de escarnecedores se ha sentado.", reference: "Salmo 1:1" },
    { verse: "Mas su deleite está en la ley de Jehovah, y en su ley medita de día y de noche.", reference: "Salmo 1:2" },
    { verse: "El Jehovah es mi pastor; nada me faltará.", reference: "Salmo 23:1" },
    { verse: "En lugares de delicados pastos me hará descansar; junto a aguas de reposo me pastoreará.", reference: "Salmo 23:2" },
    { verse: "Confortará mi alma; me guiará por sendas de justicia por amor de su nombre.", reference: "Salmo 23:3" },
    { verse: "Aunque ande en valle de sombra de muerte, no temeré mal alguno, porque tú estarás conmigo.", reference: "Salmo 23:4" },
    { verse: "Jehovah es mi luz y mi salvación; ¿de quién tendré miedo?", reference: "Salmo 27:1" },
    { verse: "Jehovah es la fortaleza de mi vida; ¿de quién he de temerme?", reference: "Salmo 27:1" },
    { verse: "Una cosa he pedido a Jehovah, y ésa buscaré: que esté yo en la casa de Jehovah todos los días de mi vida.", reference: "Salmo 27:4" },
    { verse: "Porque su ira es solo por un momento; su favor, por toda la vida.", reference: "Salmo 30:5" },
    { verse: "Bienaventurado aquel cuya transgresión ha sido perdonada, y su pecado ha sido cubierto.", reference: "Salmo 32:1" },
    { verse: "El consejo de Jehovah permanece para siempre; los pensamientos de su corazón, por todas las generaciones.", reference: "Salmo 33:11" },
    { verse: "Lo busqué, y me dio respuesta, y me libró de todos mis miedos.", reference: "Salmo 34:4" },
    { verse: "Gustad y ved que es bueno Jehovah; dichoso el hombre que se refugia en él.", reference: "Salmo 34:8" },
    { verse: "Confía en Jehovah, y haz el bien; habita la tierra, y pastorea en ella.", reference: "Salmo 37:3" },
    { verse: "Deléitate en el Señor, y él te concederá las peticiones de tu corazón.", reference: "Salmo 37:4" },
    { verse: "Guarda silencio en presencia de Jehovah, y espera en él con paciencia.", reference: "Salmo 37:7" },
    { verse: "Esperé pacientemente a Jehovah, y él se inclinó hacia mí y escuchó mi clamor.", reference: "Salmo 40:1" },
    { verse: "Muchas maravillas has hecho, y tus pensamientos no pueden contarse ante ti.", reference: "Salmo 40:5" },
    { verse: "Como el ciervo anhela las corrientes de agua, así mi alma anhela a ti, oh Dios.", reference: "Salmo 42:1" },
    { verse: "Mi alma tiene sed de Dios, del Dios vivo; ¿cuándo vendré y pareceré ante Dios?", reference: "Salmo 42:2" },
    { verse: "Dios es nuestro refugio y fortaleza, pronto auxiliador en las tribulaciones.", reference: "Salmo 46:1" },
    { verse: "Estése quieta, y reconozca que yo soy Dios; soy excelso entre las naciones, excelso en la tierra.", reference: "Salmo 46:10" },
    { verse: "Crea en mí, oh Dios, un corazón limpio, y renueva un espíritu recto dentro de mí.", reference: "Salmo 51:10" },
    { verse: "Echa sobre Jehovah tu carga, y él te sustentará.", reference: "Salmo 55:22" },
    { verse: "Solo en Dios descansa mi alma; de él viene mi salvación.", reference: "Salmo 62:1" },
    { verse: "Oh Dios, tú eres mi Dios, de madrugada te buscaré; mi alma tiene sed de ti.", reference: "Salmo 63:1" },
    { verse: "Porque tú, Señor, eres bueno y perdonador, y grande en misericordia para con todos los que invocan tu nombre.", reference: "Salmo 86:5" },
    { verse: "Las misericordias de Jehovah cantaré por siempre; de generación en generación haré conocer tu fidelidad.", reference: "Salmo 89:1" },
    { verse: "El que habita al abrigo del Altísimo, bajo la sombra del Omnipotente descansará.", reference: "Salmo 91:1" },
    { verse: "Diré a Jehovah: Esperanza mía, y fuerte; él es mi Dios.", reference: "Salmo 91:2" },
    { verse: "Porque tú, Jehovah, eres mi esperanza; al Altísimo hiciste tu refugio.", reference: "Salmo 91:9" },
    { verse: "Bueno es alabarte, oh Jehovah, y cantar salmos a tu nombre, oh Altísimo.", reference: "Salmo 92:1" },
    { verse: "Cantad con regocijo a Jehovah, todos los moradores de la tierra.", reference: "Salmo 100:1" },
    { verse: "Servid a Jehovah con alegría; venid ante su presencia con regocijo.", reference: "Salmo 100:2" },
    { verse: "Bendice, alma mía, a Jehovah, y bendiga todo mi ser su santo nombre.", reference: "Salmo 103:1" },
    { verse: "Bendice, alma mía, a Jehovah, y no olvides ninguno de sus beneficios.", reference: "Salmo 103:2" },
    { verse: "Jehovah es misericordioso y clemente; lento para la ira, y grande en misericordia.", reference: "Salmo 103:8" },
    { verse: "Amo a Jehovah, pues ha oído mi voz y mis súplicas.", reference: "Salmo 116:1" },
    { verse: "Este es el día que hizo Jehovah; sea nuestro gozo y nuestra alegría.", reference: "Salmo 118:24" },
    { verse: "Jehovah es mi luz y mi salvación; ¿de quién tendré miedo?", reference: "Salmo 27:1" },
    { verse: "Lámpara es a mis pies tu palabra, y lumbrera a mi camino.", reference: "Salmo 119:105" },
    // CANTAR DE LOS CANTARES (Song of Solomon) - 37 verses
    { verse: "La canción de las canciones, la cual es de Salomón.", reference: "Cantar 1:1" },
    { verse: "Béseme con besos de su boca, porque mejores son tus amor que el vino.", reference: "Cantar 1:2" },
    { verse: "Aroma de tus ungüentos sobre toda la tierra son tus perfumes.", reference: "Cantar 1:3" },
    { verse: "Guíame a ti; corramos.", reference: "Cantar 1:4" },
    { verse: "Morena soy, pero deliciosa, como las tiendas de Quedar, como las cortinas de Salomón.", reference: "Cantar 1:5" },
    { verse: "No miréis cómo soy morena, porque el sol me ha mirado fijamente.", reference: "Cantar 1:6" },
    { verse: "Dime, oh tú a quien ama mi alma: ¿Dónde apacientas el rebaño?", reference: "Cantar 1:7" },
    { verse: "Si no lo sabes, oh la más hermosa entre las mujeres, ve tras los pasos del ganado.", reference: "Cantar 1:8" },
    { verse: "A mi persona estimada la tengo como un grupo de mirra que mora entre mis pechos.", reference: "Cantar 1:13" },
    { verse: "He aquí que tú eres hermosa, amiga mía; he aquí que tú eres hermosa; tus ojos son como palomas.", reference: "Cantar 1:15" },
    { verse: "He aquí que tú eres hermoso, amado mío, y deleitoso.", reference: "Cantar 1:16" },
    { verse: "Nuestro lecho es frondoso.", reference: "Cantar 1:16" },
    { verse: "Las vigas de nuestra casa son de cedro, y los entablados de ciprés.", reference: "Cantar 1:17" },
    { verse: "Yo soy la rosa de Sarón, el lirio de los valles.", reference: "Cantar 2:1" },
    { verse: "Como el lirio entre los espinos, así es mi amiga entre las doncellas.", reference: "Cantar 2:2" },
    { verse: "Como el manzano entre los árboles del bosque, así es mi amado entre los jóvenes.", reference: "Cantar 2:3" },
    { verse: "A su sombra con deleite me senté, y su fruto fue dulce a mi paladar.", reference: "Cantar 2:3" },
    { verse: "Me llevó a la casa del vino; su bandera sobre mí fue el amor.", reference: "Cantar 2:4" },
    { verse: " Sustentadme con pasas de uvas, me sostenéis con manzanas, porque yo estoy enferma de amor.", reference: "Cantar 2:5" },
    { verse: "Su izquierda esté bajo mi cabeza, y su derecha me abrace.", reference: "Cantar 2:6" },
    { verse: "Yo os conjuro, oh doncellas de Jerusalén, por los ciervos y por las ciervas del campo.", reference: "Cantar 2:7" },
    { verse: "¡Escucha! amado mío; he aquí que él viene saltando sobre los montes, saltando sobre las colinas.", reference: "Cantar 2:8" },
    { verse: "Mi amado es semejante a una gacela, o a un cervato de ciervos.", reference: "Cantar 2:9" },
    { verse: "He aquí que él está tras nuestra pared, mirando por las ventanas, asomándose por los resquicios.", reference: "Cantar 2:9" },
    { verse: "Mi amado habla y me dice: Levántate, oh mora, y ven, oh bella mía.", reference: "Cantar 2:10" },
    { verse: "Porque he aquí que el invierno ha pasado; la lluvia se fue.", reference: "Cantar 2:11" },
    { verse: "En la tierra se ven los frutos; el tiempo de cantarse ha llegado.", reference: "Cantar 2:12" },
    { verse: "La voz de la turtola se ha escuchado en nuestra tierra.", reference: "Cantar 2:12" },
    { verse: "Las higueras han producido sus frutos, y las vides han dado olor.", reference: "Cantar 2:13" },
    { verse: "Levántate, oh hermosa mía, y ven.", reference: "Cantar 2:13" },
    { verse: "Oh, tú que moras en los huertos, los compañeros listen para tu voz; hazme oírla.", reference: "Cantar 2:14" },
    { verse: "Atrápennos a las zorras, a las pequeñas zorras que echan a perder las viñas.", reference: "Cantar 2:15" },
    { verse: "Mi amado es mío, y yo soy suya; él pastorea entre los lirios.", reference: "Cantar 2:16" },
    { verse: "Hasta que apunte el día yanhaquen las sombras, vuélvete, parecido a la gacela, oh amado mío.", reference: "Cantar 2:17" },
    { verse: "Me despertó el aroma de mi perfumes, y su hablar me hace estremecer.", reference: "Cantar 3:4" },
    { verse: "Ponme como un sello sobre tu corazón, como un sello sobre tu brazo.", reference: "Cantar 8:6" },
    { verse: "Porque fuerte es como la muerte el amor; duros como el Seol los celos.", reference: "Cantar 8:6" },
    { verse: "Agua no podría apagar el amor, ni las inundaciones anegarlo.", reference: "Cantar 8:7" },
    { verse: "Si el hombre diese toda la hacienda de su casa por el amor, cierto sería menospreciado.", reference: "Cantar 8:7" },
  ];

  // Load notifications from Supabase - ALWAYS from database, never cache
  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const notifs = [];

        // Get devotional for today
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const lastDevotionalDate = localStorage.getItem('lastDevocionalDate') || '';
        const hour = now.getHours();
        const shouldShowAt6AM = hour >= 6 && hour < 8;
        const isNewDay = today !== lastDevotionalDate;

        // Generate daily devotional (only one per day, shown at 6 AM)
        if (shouldShowAt6AM || (isNewDay && hour >= 6)) {
          const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
          const verseIndex = dayOfYear % bibleVerses.length;
          const verse = bibleVerses[verseIndex];

          notifs.push({
            id: 'devocional-' + today,
            type: 'devocional',
            message: `¿Ya hiciste tu devocional? "${verse.verse}" — ${verse.reference} RV1960`,
            icon: 'cross',
            time: '06:00',
            isDevocional: true
          });

          if (isNewDay) {
            localStorage.setItem('lastDevocionalDate', today);
          }
        }

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

        setNotifications(notifs);

        // Calculate unread count
        const unread = notifs.filter(n => !readNotificationIds.includes(n.id)).length;
        setUnreadCount(unread);
      } catch (err) {
        console.log('Error loading notifications:', err);
      }
    };

    // Load immediately, then refresh every 2 minutes from Supabase
    loadNotifications();
    const interval = setInterval(loadNotifications, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [readNotificationIds]);

  // Mark notification as read
  const markAsRead = (notificationId) => {
    const newReadIds = [...readNotificationIds, notificationId];
    setReadNotificationIds(newReadIds);
    localStorage.setItem('readNotificationIds', JSON.stringify(newReadIds));
    setUnreadCount(Math.max(0, unreadCount - 1));
  };

  // Mark all as read
  const markAllAsRead = () => {
    const allIds = notifications.map(n => n.id);
    setReadNotificationIds(allIds);
    localStorage.setItem('readNotificationIds', JSON.stringify(allIds));
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

  // Process and save photo with crop/zoom/rotation applied - FIXED VERSION
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

      // Upload to Supabase - use currentUserMember.id for reliable identification
      const fileExt = 'jpg';
      // Use currentUserMember.id as primary ID, fallback to user?.id
      const memberId = currentUserMember?.id || user?.id || 'unknown';
      const fileName = `avatars/${memberId}-${Date.now()}.${fileExt}`;
      console.log('Uploading photo with fileName:', fileName, 'memberId:', memberId);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, {
          upsert: true,
          contentType: 'image/jpeg'
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        console.error('Error message:', uploadError.message);
        console.error('Error status:', uploadError.status);

        // Check if it's a 406 error (usually permissions issue)
        if (uploadError.status === 406 || uploadError.message?.includes('406')) {
          setErrorModal({
            isOpen: true,
            title: 'Error de permisos',
            message: 'No se pudo subir la foto. Verificá que el bucket "avatars" tenga permisos de escritura pública.'
          });
          return;
        }

        // Fallback: save as local data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        localStorage.setItem('userPhoto', dataUrl);
        setUserPhoto(dataUrl);

        // Try to update member table anyway using currentUserMember.id
        const memberIdToUpdate = currentUserMember?.id;
        if (memberIdToUpdate) {
          await supabase
            .from('members')
            .update({ avatar_url: dataUrl })
            .eq('id', memberIdToUpdate);

          // Sync appStore.members
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

          // Show success modal
          setSuccessModal({
            isOpen: true,
            title: '¡Foto actualizada!',
            message: 'Tu foto de perfil se ha guardado correctamente.'
          });
        }
      } else {
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);

        localStorage.setItem('userPhoto', publicUrl);
        setUserPhoto(publicUrl);

        // Update both Supabase and appStore.members for real-time sync
        // Use currentUserMember.id to ensure we update the correct record
        const memberIdToUpdate = currentUserMember?.id;

        if (memberIdToUpdate) {
          await supabase
            .from('members')
            .update({ avatar_url: publicUrl })
            .eq('id', memberIdToUpdate);

          // Sync appStore.members immediately so Miembros section shows new photo
          // Update BOTH avatar_url and avatarUrl for compatibility
          useAppStore.setState(state => ({
            members: state.members.map(m =>
              m.id === memberIdToUpdate ? { ...m, avatar_url: publicUrl, avatarUrl: publicUrl } : m
            )
          }));

          // Persist to localStorage for survival across refreshes
          const currentMembers = JSON.parse(localStorage.getItem('appMembers') || '[]');
          const updatedMembers = currentMembers.map(m =>
            m.id === memberIdToUpdate ? { ...m, avatar_url: publicUrl, avatarUrl: publicUrl } : m
          );
          localStorage.setItem('appMembers', JSON.stringify(updatedMembers));
        }

        // Show success modal
        setSuccessModal({
          isOpen: true,
          title: '¡Foto actualizada!',
          message: 'Tu foto de perfil se ha guardado correctamente.'
        });
      }
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
                    className="w-full bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500"
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

      {/* Notifications Modal */}
      <Modal
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        title="Notificaciones"
        size="md"
      >
        <div className="space-y-4">
          {notifications.length === 0 ? (
            <div className="text-center py-8">
              <Bell size={48} className="mx-auto text-gray-600 mb-3" />
              <p className="text-gray-400">No hay notificaciones nuevas</p>
              <p className="text-xs text-gray-500 mt-1">Las notificaciones aparecen cuando hay nuevas canciones, bandas o miembros</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">{notifications.length} notificación(es)</span>
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Marcar todas como leídas
                </button>
              </div>
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => {
                    markAsRead(notif.id);
                    if (notif.type === 'request') {
                      setShowNotifications(false);
                      navigate('/solicitudes');
                    }
                  }}
                  className={`p-4 bg-neutral-800/50 rounded-xl border transition-colors cursor-pointer ${
                    readNotificationIds.includes(notif.id)
                      ? 'border-neutral-800 opacity-60'
                      : 'border-neutral-700 hover:border-blue-500/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      notif.type === 'song' ? 'bg-purple-500/20' :
                      notif.type === 'band' ? 'bg-blue-500/20' :
                      notif.type === 'devocional' ? 'bg-amber-500/20' :
                      notif.type === 'request' ? 'bg-yellow-500/20' :
                      'bg-green-500/20'
                    }`}>
                      {notif.icon === 'music' && <Music size={18} className="text-purple-400" />}
                      {notif.icon === 'users' && <Users2 size={18} className="text-blue-400" />}
                      {notif.icon === 'heart' && <Heart size={18} className="text-green-400" />}
                      {notif.icon === 'cross' && <Cross size={18} className="text-amber-400" />}
                      {notif.icon === 'file' && <FileText size={18} className="text-yellow-400" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-white leading-relaxed">{notif.message}</p>
                      <p className="text-xs text-gray-500 mt-1">{notif.time}</p>
                    </div>
                    {!readNotificationIds.includes(notif.id) && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
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
