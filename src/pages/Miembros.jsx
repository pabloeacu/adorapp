import React, { useState, useMemo, useEffect } from 'react';
import { matchesSearch as matchesSearchText } from '../lib/searchText';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Mail, Phone, Shield, Edit, Trash2,
  Check, X, Filter, Key,
  LayoutGrid, List, AlertTriangle, UserX, Cross, Users2, Calendar,
  Clock, Smartphone, Bell, BellOff
} from 'lucide-react';
import { UsersThree, UserPlus } from '@phosphor-icons/react';
import { useAppStore, MEMBER_ROLES, INSTRUMENTS } from '../stores/appStore';
import { SELECTABLE_AREAS, areaLabels } from '../lib/areas';
import { useAuthStore } from '../stores/authStore';
import { useCurrentRole } from '../hooks/useCurrentMember';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { MemberCard } from '../components/members/MemberCard';
import { MemberRow } from '../components/members/MemberRow';
import { IconBadge } from '../components/ui/IconBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ConfirmModal, SuccessModal, ErrorModal } from '../components/ui/ConfirmModal';
import { toCSV, downloadCSV } from '../lib/csv';
import { supabase } from '../lib/supabase';
import { saveErrorMessage } from '../lib/saveError';
import { formatDateLocalShort as formatDateLocal } from '../lib/dates';


// Última conexión → { fecha: dd/mm/yy (ART), rel: "hoy"/"ayer"/"hace N días", days }.
// El "hace N días" ayuda al pastor a ver quién lleva tiempo sin conectarse.
const fmtLastSeen = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const TZ = 'America/Argentina/Buenos_Aires';
  const fecha = d.toLocaleDateString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit' });
  const artToday = new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
  const artSeen = d.toLocaleDateString('en-CA', { timeZone: TZ });
  const days = Math.max(0, Math.round((Date.parse(artToday) - Date.parse(artSeen)) / 86400000));
  const rel = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
  return { fecha, rel, days };
};

const roleConfig = {
  pastor: { label: 'Pastor', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  leader: { label: 'Líder', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  member: { label: 'Miembro', color: 'text-green-400', bg: 'bg-green-500/20' },
};

export const Miembros = () => {
  useDocumentTitle('Miembros');
  const { members, addMember, updateMember, updateMemberViaAdmin, deleteMember, toggleMemberActive } = useAppStore();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  // Role gating: pastors see everything (and can act). Leaders see a stripped
  // view — name, role badge, instruments. Plain members are bounced by the
  // route guard in App.jsx and never get here.
  const role = useCurrentRole();
  const isPastor = role === 'pastor';

  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterActive, setFilterActive] = useState('all'); // 'all', 'true', 'false'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedInstruments, setSelectedInstruments] = useState([]);
  const [sortBy, setSortBy] = useState('name_asc');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'
  const [isSubmitting, setIsSubmitting] = useState(false); // bloquea el botón Guardar en vuelo

  // Actividad por miembro (última conexión / app instalada / notificaciones),
  // desde member_activity (RLS solo-pastor). Mapa member_id -> datos.
  const [activityMap, setActivityMap] = useState({});
  useEffect(() => {
    if (!isPastor) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('member_activity')
          .select('member_id, last_seen_at, app_installed_at, notifications_on');
        if (!alive || error || !data) return;
        const map = {};
        for (const r of data) {
          map[r.member_id] = { lastSeenAt: r.last_seen_at, appInstalledAt: r.app_installed_at, notificationsOn: r.notifications_on };
        }
        setActivityMap(map);
      } catch { /* no crítico: la ficha muestra "sin registro" si falla */ }
    })();
    return () => { alive = false; };
  }, [isPastor, members.length]);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    pastor_area: '',
    leader_of: '',
    birthdate: '',
    role: 'member',
    editor: false, // Editor permission for songs
    instruments: [],
    areas: ['adoracion'], // default: integrante de banda; el pastor lo cambia para observadores (Multimedia/Sonido)
    active: true,
    password: '' // Password field for new members
  });

  // State for showing password after member creation
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [createdMemberData, setCreatedMemberData] = useState(null);

  // State for password reset modal
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [memberToReset, setMemberToReset] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  // State for confirmation modals
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    onConfirm: null,
    loading: false
  });

  const [successModal, setSuccessModal] = useState({
    isOpen: false,
    title: '',
    message: ''
  });

  const [errorModal, setErrorModal] = useState({
    isOpen: false,
    title: '',
    message: ''
  });

  const filteredMembers = useMemo(() => {
    const list = members.filter(member => {
      // Indistinto a tildes y mayúsculas (src/lib/searchText.js): "santillan" encuentra "Santillán".
      const matchesSearch = matchesSearchText(searchTerm, member.name, isPastor ? member.email : null, member.instruments);

      const matchesRole = filterRole === 'all' || member.role === filterRole;
      const matchesActive = filterActive === 'all' || member.active === (filterActive === 'true');

      const matchesInstrument = selectedInstruments.length === 0 ||
        selectedInstruments.some(i => member.instruments?.includes(i));

      return matchesSearch && matchesRole && matchesActive && matchesInstrument;
    });
    const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es');
    const byRole = (a, b) => (a.role || '').localeCompare(b.role || '', 'es') || byName(a, b);
    const byActive = (a, b) => Number(b.active) - Number(a.active) || byName(a, b);
    const cmp =
      sortBy === 'name_desc' ? (a, b) => byName(b, a) :
      sortBy === 'role' ? byRole :
      sortBy === 'active' ? byActive :
      byName;
    return [...list].sort(cmp);
  }, [members, searchTerm, filterRole, filterActive, selectedInstruments, sortBy]);

  const handleOpenModal = (member = null) => {
    if (member) {
      setEditingMember(member);
      setFormData({
        name: member.name,
        email: member.email || '',
        phone: member.phone || '',
        pastor_area: member.pastor_area || '',
        leader_of: member.leader_of || '',
        birthdate: member.birthdate || '',
        role: member.role,
        editor: member.editor || false,
        instruments: member.instruments || [],
        areas: member.areas || [],
        active: member.active,
        // NOTE: Do NOT include avatar_url here - let the store preserve it
        // The store's updateMember function will preserve the existing avatar
        // unless avatar_url is explicitly set to a new value
        password: '' // Don't show existing password
      });
    } else {
      setEditingMember(null);
      setFormData({
        name: '',
        email: '',
        phone: '',
        pastor_area: '',
        leader_of: '',
        birthdate: '',
        role: 'member',
        editor: false,
        instruments: [],
        areas: ['adoracion'],
        active: true,
        password: ''
      });
    }
    setIsModalOpen(true);
  };

  // Handle ?edit=self query param - open current user's edit modal
  useEffect(() => {
    if (searchParams.get('edit') === 'self' && members.length > 0 && user) {
      // Find the current user's member record
      const currentUserMember = members.find(m => m.userId === user.id);
      if (currentUserMember) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        handleOpenModal(currentUserMember);
      }
      // Clear the URL param after handling
      setSearchParams({});
    }
    // handleOpenModal is intentionally excluded — wrapping it in useCallback
    // would just push the same problem one level up. The effect only needs to
    // re-run when the URL param or auth/members data change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, members, user]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingMember(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) return;
    if (isSubmitting) return; // guard anti doble-submit (ruta privilegiada: evita doble Admin API)
    setIsSubmitting(true);
    try {
      if (editingMember) {
        // El email es login + identidad de auth + contacto Y la app matchea
        // usuario↔ficha por email: cambiarlo solo en `members` desincroniza el
        // login y ROMPE al miembro. Si el email cambió, va por la ruta privilegiada
        // (EF admin-update-member: Admin API + members + revoca sesiones). Si no
        // cambió, el camino directo de siempre (RLS self-or-pastor) queda intacto.
        const isSelf = editingMember.userId === user?.id;
        const newEmail = (formData.email || '').trim();

        // Un miembro CON acceso a la app (userId) no puede quedarse sin correo: el
        // correo es su login. Vaciarlo desincronizaría members↔auth y lo dejaría sin
        // ficha. Bloqueamos antes de guardar.
        if (editingMember.userId && !newEmail) {
          setErrorModal({
            isOpen: true,
            title: 'El correo es obligatorio',
            message: 'Este miembro tiene acceso a la app, así que no puede quedarse sin correo (es su usuario para entrar). Ingresá un correo válido.',
          });
          return;
        }

        const emailChanged = newEmail.length > 0 &&
          newEmail.toLowerCase() !== (editingMember.email || '').trim().toLowerCase();

        if (emailChanged) {
          // El correo es el correo de ACCESO (login) del miembro. Cambiarlo lo va a
          // desloguear y va a tener que entrar con el nuevo. Anda bien (va por la EF
          // admin-update-member: sincroniza auth+members y revoca sesiones), pero es
          // un cambio importante → pedimos confirmación explícita antes de tocar el login.
          const targetName = editingMember.name || 'este miembro';
          const oldEmail = (editingMember.email || '').trim();
          setConfirmModal({
            isOpen: true,
            title: isSelf ? 'Vas a cambiar tu correo de acceso' : 'Vas a cambiar el correo de acceso',
            message: isSelf
              ? `Tu correo de acceso pasará de "${oldEmail}" a "${newEmail}". Se va a cerrar tu sesión y vas a tener que volver a entrar con el correo nuevo (tu contraseña no cambia). ¿Confirmás?`
              : `El correo de acceso de ${targetName} pasará de "${oldEmail}" a "${newEmail}". Esa persona va a tener que iniciar sesión con el correo nuevo (su contraseña no cambia) y sus sesiones actuales se van a cerrar. ¿Confirmás el cambio?`,
            type: 'warning',
            confirmText: 'Sí, cambiar el correo',
            cancelText: 'Cancelar',
            icon: AlertTriangle,
            onConfirm: async () => {
              setConfirmModal(prev => ({ ...prev, loading: true }));
              const { error } = await updateMemberViaAdmin(editingMember.id, formData);
              setConfirmModal(prev => ({ ...prev, loading: false, isOpen: false }));
              if (error) {
                setErrorModal({
                  isOpen: true,
                  title: 'No se pudo cambiar el correo',
                  message: typeof error === 'string' ? error : 'Ocurrió un error al actualizar el correo del miembro.',
                });
                return; // dejar el modal de edición abierto para corregir
              }
              // Si cambió su PROPIO correo: su JWT lleva el email viejo y las sesiones
              // fueron revocadas → aviso para el Login + logout para reentrar limpio.
              if (isSelf) {
                try { sessionStorage.setItem('emailChangedNotice', newEmail.toLowerCase()); } catch { /* no crítico */ }
                handleCloseModal();
                await useAuthStore.getState().logout();
                return;
              }
              handleCloseModal();
            },
          });
          return; // esperamos la confirmación; el resto de handleSubmit no corre ahora
        }

        // Sin cambio de correo: camino directo de siempre (RLS self-or-pastor) intacto.
        await updateMember(editingMember.id, formData);

        // CRITICAL: If the edited member is the CURRENT LOGGED-IN USER,
        // refresh authStore.profile so all pages instantly see the new role/permissions
        if (isSelf) {
          await useAuthStore.getState().refreshProfile();
        }

        handleCloseModal();
      } else {
        // Creating a new member - show password modal after creation
        const result = await addMember(formData);
        if (result) {
          setCreatedMemberData({
            name: formData.name,
            email: formData.email,
            password: result.generatedPassword || formData.password
          });
          setShowPasswordModal(true);
        }
        handleCloseModal();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleInstrument = (instrument) => {
    setFormData(prev => ({
      ...prev,
      instruments: prev.instruments.includes(instrument)
        ? prev.instruments.filter(i => i !== instrument)
        : [...prev.instruments, instrument]
    }));
  };

  const toggleArea = (area) => {
    setFormData(prev => ({
      ...prev,
      areas: (prev.areas || []).includes(area)
        ? prev.areas.filter(a => a !== area)
        : [...(prev.areas || []), area]
    }));
  };

  // Handler for soft delete (deactivate member)
  const handleDelete = (memberId, memberName) => {
    setConfirmModal({
      isOpen: true,
      title: 'Desactivar Miembro',
      message: `¿Estás seguro de desactivar a ${memberName}? El miembro no podrá iniciar sesión.`,
      type: 'warning',
      confirmText: 'Desactivar',
      cancelText: 'Cancelar',
      icon: AlertTriangle,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, loading: true }));
        const success = await deleteMember(memberId, false);
        setConfirmModal(prev => ({ ...prev, loading: false, isOpen: false }));
        if (success) {
          setSuccessModal({
            isOpen: true,
            title: 'Miembro Desactivado',
            message: `${memberName} ha sido desactivado correctamente.`
          });
        } else {
          setErrorModal({
            isOpen: true,
            title: 'Error',
            message: saveErrorMessage(null, 'No se pudo desactivar el miembro. Contactá al administrador.')
          });
        }
      }
    });
  };

  // Handler for permanent delete (pastor only)
  const handlePermanentlyDelete = (memberId, memberName) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Miembro Permanentemente',
      message: `¿Estás seguro de ELIMINAR PERMANENTEMENTE a ${memberName}? Esta acción no se puede deshacer y eliminará toda la información del miembro.`,
      type: 'danger',
      confirmText: 'Eliminar Definitivamente',
      cancelText: 'Cancelar',
      icon: UserX,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, loading: true }));
        const success = await deleteMember(memberId, true);
        setConfirmModal(prev => ({ ...prev, loading: false, isOpen: false }));
        if (success) {
          setSuccessModal({
            isOpen: true,
            title: 'Miembro Eliminado',
            message: `${memberName} ha sido eliminado permanentemente del sistema.`
          });
        } else {
          setErrorModal({
            isOpen: true,
            title: 'Error',
            message: saveErrorMessage(null, 'No se pudo eliminar el miembro. Contactá al administrador.')
          });
        }
      }
    });
  };

  const handleResetPassword = (member) => {
    setMemberToReset(member);
    setNewPassword('');
    setShowResetPasswordModal(true);
  };

  const handleSaveNewPassword = async () => {
    if (!newPassword.trim() || !memberToReset) return;

    const userId = memberToReset.userId || memberToReset.user_id;
    if (!userId) {
      setErrorModal({
        isOpen: true,
        title: 'Error',
        message: 'Este miembro no tiene una cuenta de autenticación vinculada. No se puede restablecer la contraseña.',
      });
      return;
    }

    const { callAdminFunction } = await import('../lib/supabase');
    const { error } = await callAdminFunction('admin-reset-password', { userId, newPassword });

    if (error) {
      console.error('Error resetting password:', error);
      setErrorModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo restablecer la contraseña: ' + error,
      });
      return;
    }

    setShowResetPasswordModal(false);
    setSuccessModal({
      isOpen: true,
      title: 'Contraseña Restablecida',
      message: `La contraseña de ${memberToReset.name} ha sido actualizada.`,
    });
    setMemberToReset(null);
    setNewPassword('');
  };

  const handleToggleActive = (memberId) => {
    toggleMemberActive(memberId);
  };

  // Dependencias que la tarjeta de miembro (MemberCard, extraída a components/members)
  // necesita: helpers de rol/actividad, el flag isPastor y los handlers de este componente.
  const memberCardCtx = {
    roleConfig, fmtLastSeen, activityMap, isPastor,
    handleResetPassword, handleOpenModal, handlePermanentlyDelete, handleToggleActive,
  };
  // Dependencias de la fila de la vista de tabla (MemberRow).
  const memberRowCtx = { roleConfig, isPastor, handleToggleActive, handleOpenModal, handleDelete };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <IconBadge icon={UsersThree} size="md" />
          <div>
            <h2 className="text-2xl font-bold">Miembros del Ministerio</h2>
            <p className="text-sm text-gray-400 mt-1">
              {filteredMembers.filter(m => m.active).length} miembros activos
              {filterRole !== 'all' && ` · Filtrado: ${roleConfig[filterRole]?.label}`}
            </p>
          </div>
        </div>
        {/* View mode toggle - visible to all users */}
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'cards' ? 'bg-gold-gradient text-black' : 'hover:bg-neutral-800 text-gray-400'}`}
              title="Vista de tarjetas"
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'bg-gold-gradient text-black' : 'hover:bg-neutral-800 text-gray-400'}`}
              title="Vista de grilla"
            >
              <List size={18} />
            </button>
          </div>
          {/* Pastor-only export. We export the currently filtered list,
              so the user can pre-narrow by role/instrument before exporting. */}
          {isPastor && (
            <Button
              variant="secondary"
              onClick={() => {
                const csv = toCSV(filteredMembers, [
                  { header: 'Nombre', get: (m) => m.name },
                  { header: 'Email', get: (m) => m.email },
                  { header: 'Teléfono', get: (m) => m.phone },
                  { header: 'Rol', get: (m) => m.role },
                  { header: 'Editor', get: (m) => (m.editor ? 'sí' : 'no') },
                  { header: 'Activo', get: (m) => (m.active ? 'sí' : 'no') },
                  { header: 'Pastor de área', get: (m) => m.pastor_area },
                  { header: 'Líder', get: (m) => m.leader_of },
                  { header: 'Fecha nacimiento', get: (m) => m.birthdate },
                  { header: 'Instrumentos', get: (m) => m.instruments },
                ]);
                const today = new Date().toISOString().slice(0, 10);
                downloadCSV(`miembros-${today}.csv`, csv);
              }}
            >
              Exportar CSV
            </Button>
          )}
          {/* Only show Add Member button for pastors - NEVER for members */}
          {isPastor && (
            <Button icon={Plus} onClick={() => handleOpenModal()}>
              Agregar Miembro
            </Button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            <input
              type="text"
              placeholder={isPastor ? "Buscar por nombre, email o instrumento..." : "Buscar por nombre o instrumento..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 transition-colors"
            />
          </div>
          <Button
            variant="secondary"
            icon={Filter}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filtros
            {selectedInstruments.length > 0 && (
              <Badge size="sm" variant="primary" className="ml-2">
                {selectedInstruments.length}
              </Badge>
            )}
          </Button>
          <select
            aria-label="Ordenar miembros"
            className="px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="name_asc">Ordenar: nombre A→Z</option>
            <option value="name_desc">Ordenar: nombre Z→A</option>
            <option value="role">Ordenar: rol</option>
            <option value="active">Ordenar: activos primero</option>
          </select>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <Card className="animate-slide-up">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-3">
                  Perfil
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setFilterRole('all')}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                      filterRole === 'all'
                        ? 'bg-gold-gradient text-black'
                        : 'bg-neutral-800 hover:bg-neutral-700'
                    }`}
                  >
                    Todos
                  </button>
                  {MEMBER_ROLES.map(role => (
                    <button
                      key={role.id}
                      onClick={() => setFilterRole(role.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                        filterRole === role.id
                          ? 'bg-gold-gradient text-black'
                          : 'bg-neutral-800 hover:bg-neutral-700'
                      }`}
                    >
                      {role.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-3">
                  Estado
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFilterActive('true')}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                      filterActive === 'true'
                        ? 'bg-gold-gradient text-black'
                        : 'bg-neutral-800 hover:bg-neutral-700'
                    }`}
                  >
                    Activos
                  </button>
                  <button
                    onClick={() => setFilterActive('false')}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                      filterActive === 'false'
                        ? 'bg-gold-gradient text-black'
                        : 'bg-neutral-800 hover:bg-neutral-700'
                    }`}
                  >
                    Inactivos
                  </button>
                  <button
                    onClick={() => setFilterActive('all')}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                      filterActive === 'all'
                        ? 'bg-gold-gradient text-black'
                        : 'bg-neutral-800 hover:bg-neutral-700'
                    }`}
                  >
                    Todos
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-3">
                  Instrumentos
                </label>
                <div className="flex flex-wrap gap-2">
                  {INSTRUMENTS.slice(0, 6).map(inst => (
                    <button
                      key={inst}
                      onClick={() => {
                        setSelectedInstruments(prev =>
                          prev.includes(inst) ? prev.filter(i => i !== inst) : [...prev, inst]
                        );
                      }}
                      className={`px-2 py-1 rounded text-xs transition-all ${
                        selectedInstruments.includes(inst)
                          ? 'bg-gold-500/15 text-gold-200 border border-gold-500/40'
                          : 'bg-neutral-800 hover:bg-neutral-700'
                      }`}
                    >
                      {inst}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {selectedInstruments.length > 0 && (
              <button
                onClick={() => setSelectedInstruments([])}
                className="text-xs text-gray-400 hover:text-white mt-4 underline"
              >
                Limpiar filtros de instrumentos
              </button>
            )}
          </Card>
        )}
      </div>

      {/* Members View - Cards or Table */}
      {viewMode === 'cards' ? (
        /* Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMembers.map((member) => (
            <MemberCard key={member.id} member={member} ctx={memberCardCtx} />
          ))}
        </div>
      ) : (
        /* Table View */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Nombre</th>
                  {/* Pastors-only columns: contact + status + private fields */}
                  {isPastor && (
                    <>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase hidden lg:table-cell">Email</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Teléfono</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase hidden md:table-cell">Pastor</th>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase hidden md:table-cell">Líder</th>
                    </>
                  )}
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Rol</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase hidden xl:table-cell">Instrumentos</th>
                  {isPastor && (
                    <>
                      <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Estado</th>
                      <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium uppercase">Acciones</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <MemberRow key={member.id} member={member} ctx={memberRowCtx} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {filteredMembers.length === 0 && (
        <EmptyState
          icon={UserPlus}
          title="No se encontraron miembros"
          subtitle={searchTerm ? 'Intentá con otro término de búsqueda.' : 'Todavía no hay miembros que mostrar en el ministerio.'}
          annotation={searchTerm ? 'Probá otro nombre' : 'Sumá al primero'}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingMember ? 'Editar Miembro' : 'Agregar Nuevo Miembro'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !formData.name.trim() || (!editingMember && formData.email && !formData.password)}
            >
              {isSubmitting ? 'Guardando…' : (editingMember ? 'Guardar Cambios' : 'Agregar Miembro')}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Only require password for new members with email */}
          {!editingMember && formData.email && !formData.password && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-300">
              ⚠️ El miembro necesita una contraseña para poder iniciar sesión.
            </div>
          )}
          <Input
            label="Nombre Completo"
            placeholder="Nombre del miembro"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              placeholder="email@ejemplo.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <Input
              label="Teléfono"
              placeholder="+54 11 1234-5678"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Pastor de área"
              placeholder="Nombre del pastor"
              value={formData.pastor_area}
              onChange={(e) => setFormData({ ...formData, pastor_area: e.target.value })}
            />
            <Input
              label="Tu líder"
              placeholder="Nombre de tu líder (Equipo de Avivamiento)"
              value={formData.leader_of}
              onChange={(e) => setFormData({ ...formData, leader_of: e.target.value })}
            />
          </div>

          <Input
            label="Fecha de nacimiento"
            type="date"
            value={formData.birthdate}
            onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
          />

          {/* Password field - only visible when adding new member */}
          {!editingMember && (
            <div className="p-4 bg-neutral-800/30 rounded-xl border border-neutral-800">
              <div className="flex items-center gap-2 mb-3">
                <Key size={18} className="text-gold-300" />
                <label className="text-sm font-medium">Credenciales de Acceso</label>
              </div>
              <Input
                label="Contraseña inicial"
                type="text"
                placeholder="Contraseña para el nuevo miembro"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-2">
                Esta será la contraseña inicial del miembro. Podrá cambiarla después.
              </p>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-3">
              Perfil
            </label>
            <div className="grid grid-cols-3 gap-3">
              {MEMBER_ROLES.map(role => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, role: role.id })}
                  className={`
                    p-4 rounded-xl text-left transition-all border-2
                    ${formData.role === role.id
                      ? 'border-gold-500 bg-gold-500/10'
                      : 'border-neutral-800 hover:border-neutral-700'
                    }
                  `}
                >
                  <Shield size={20} className={`mb-2 ${roleConfig[role.id]?.color}`} />
                  <p className="font-medium">{role.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{role.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Editor Permission Switch - Only visible to pastors when editing/creating members */}
          {isPastor && formData.role === 'member' && (
            <div className="p-4 bg-gold-500/10 border border-gold-500/30 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gold-gradient-soft ring-1 ring-gold-500/40 flex items-center justify-center">
                    <Edit size={20} className="text-gold-100" />
                  </div>
                  <div>
                    <p className="font-medium text-white">Permiso de Editor</p>
                    <p className="text-xs text-gray-400">Permite agregar y editar canciones</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, editor: !prev.editor }))}
                  className={`
                    relative w-14 h-8 rounded-full transition-colors duration-200
                    ${formData.editor ? 'bg-gold-gradient' : 'bg-neutral-700'}
                  `}
                >
                  <span
                    className={`
                      absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-200
                      ${formData.editor ? 'translate-x-6' : 'translate-x-0'}
                    `}
                  />
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-3">
              Instrumentos (puede seleccionar varios)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {INSTRUMENTS.map(inst => (
                <button
                  key={inst}
                  type="button"
                  onClick={() => toggleInstrument(inst)}
                  className={`
                    p-3 rounded-xl text-sm transition-all border-2
                    ${formData.instruments.includes(inst)
                      ? 'border-gold-500 bg-gold-500/10'
                      : 'border-neutral-800 hover:border-neutral-700'
                    }
                  `}
                >
                  {inst}
                </button>
              ))}
            </div>
          </div>

          {isPastor && (
            <div>
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-3">
                Áreas de ministerio (puede seleccionar varias)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SELECTABLE_AREAS.map(area => (
                  <button
                    key={area.slug}
                    type="button"
                    onClick={() => toggleArea(area.slug)}
                    className={`
                      p-3 rounded-xl text-sm transition-all border-2
                      ${(formData.areas || []).includes(area.slug)
                        ? 'border-gold-500 bg-gold-500/10'
                        : 'border-neutral-800 hover:border-neutral-700'
                      }
                    `}
                  >
                    {area.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Adoración = integrantes de banda. Multimedia y Sonido reciben por correo los órdenes y las formaciones, pueden ver el presentador y no editan nada.
              </p>
            </div>
          )}
        </form>
      </Modal>

      {/* Password Modal - Shows after successful member creation */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setCreatedMemberData(null);
        }}
        title="Miembro Creado Exitosamente"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
              <Check size={32} className="text-green-400" />
            </div>
          </div>

          <div className="text-center">
            <p className="text-lg font-semibold">{createdMemberData?.name}</p>
            <p className="text-gray-400">ha sido agregado al sistema</p>
          </div>

          <div className="bg-neutral-800/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Mail size={18} className="text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-400">Email</p>
                <p className="font-medium">{createdMemberData?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Key size={18} className="text-gold-300" />
              <div className="flex-1">
                <p className="text-xs text-gray-400">Contraseña</p>
                <p className="font-medium font-mono bg-neutral-900 px-3 py-2 rounded-lg">
                  {createdMemberData?.password || 'N/A'}
                </p>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(createdMemberData?.password)}
                className="p-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-colors"
                title="Copiar contraseña"
              >
                <Check size={16} />
              </button>
            </div>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
            <p className="text-sm text-yellow-300">
              ⚠️ <strong>Importante:</strong> Compartí estas credenciales con el nuevo miembro de forma segura. La contraseña no se puede recuperar después de cerrar este mensaje.
            </p>
          </div>

          <Button
            onClick={() => {
              setShowPasswordModal(false);
              setCreatedMemberData(null);
            }}
            className="w-full"
          >
            Entendido
          </Button>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={showResetPasswordModal}
        onClose={() => {
          setShowResetPasswordModal(false);
          setMemberToReset(null);
          setNewPassword('');
        }}
        title="Restablecer Contraseña"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowResetPasswordModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveNewPassword} disabled={!newPassword.trim()}>
              Guardar Nueva Contraseña
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-4 bg-neutral-800/50 rounded-xl">
            <p className="text-sm text-gray-400 mb-1">Miembro</p>
            <p className="font-semibold">{memberToReset?.name}</p>
            <p className="text-sm text-gray-400 mt-1">{memberToReset?.email}</p>
          </div>

          <div>
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-2">
              Nueva Contraseña
            </label>
            <input
              type="text"
              placeholder="Ingresá la nueva contraseña"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 transition-colors"
            />
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
            <p className="text-sm text-yellow-300">
              ⚠️ <strong>Importante:</strong> La contraseña anterior dejará de funcionar. Compartí la nueva contraseña de forma segura con el miembro.
            </p>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        icon={confirmModal.icon}
        loading={confirmModal.loading}
      />

      {/* Success Modal */}
      <SuccessModal
        isOpen={successModal.isOpen}
        onClose={() => setSuccessModal(prev => ({ ...prev, isOpen: false }))}
        title={successModal.title}
        message={successModal.message}
      />

      {/* Error Modal */}
      <ErrorModal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal(prev => ({ ...prev, isOpen: false }))}
        title={errorModal.title}
        message={errorModal.message}
      />
    </div>
  );
};
