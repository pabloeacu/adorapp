import React, { useState, useMemo } from 'react';
import {
  Plus, Search, Mail, Phone, Shield, MoreVertical, Edit, Trash2,
  UserPlus, Check, X, ChevronDown, ChevronUp, Filter, Lock, Key,
  LayoutGrid, List, AlertTriangle, UserX, Cross, Users2, Calendar
} from 'lucide-react';
import { useAppStore, MEMBER_ROLES, INSTRUMENTS } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ConfirmModal, SuccessModal, ErrorModal } from '../components/ui/ConfirmModal';

const roleConfig = {
  pastor: { label: 'Pastor', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  leader: { label: 'Líder', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  member: { label: 'Miembro', color: 'text-green-400', bg: 'bg-green-500/20' },
};

export const Miembros = () => {
  const { members, addMember, updateMember, deleteMember, toggleMemberActive } = useAppStore();
  const { user, profile } = useAuthStore();
  const isPastor = profile?.role === 'pastor';
  const isLeader = profile?.role === 'leader';

  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterActive, setFilterActive] = useState('all'); // 'all', 'true', 'false'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedInstruments, setSelectedInstruments] = useState([]);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    pastor_area: '',
    leader_of: '',
    birthdate: '',
    role: 'member',
    instruments: [],
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
    return members.filter(member => {
      const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.instruments?.some(i => i.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesRole = filterRole === 'all' || member.role === filterRole;
      const matchesActive = filterActive === 'all' || member.active === (filterActive === 'true');

      const matchesInstrument = selectedInstruments.length === 0 ||
        selectedInstruments.some(i => member.instruments?.includes(i));

      return matchesSearch && matchesRole && matchesActive && matchesInstrument;
    });
  }, [members, searchTerm, filterRole, filterActive, selectedInstruments]);

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
        instruments: member.instruments || [],
        active: member.active,
        password: member.password || '' // Don't show existing password
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
        instruments: [],
        active: true,
        password: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingMember(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) return;

    if (editingMember) {
      updateMember(editingMember.id, formData);
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
  };

  const toggleInstrument = (instrument) => {
    setFormData(prev => ({
      ...prev,
      instruments: prev.instruments.includes(instrument)
        ? prev.instruments.filter(i => i !== instrument)
        : [...prev.instruments, instrument]
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
            message: 'No se pudo desactivar el miembro. Contactá al administrador.'
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
            message: 'No se pudo eliminar el miembro. Contactá al administrador.'
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

    try {
      // Import supabaseAdmin for admin operations
      const { supabaseAdmin } = await import('../lib/supabase');

      if (memberToReset.user_id) {
        // Update password in auth
        const { error } = await supabaseAdmin.auth.admin.updateUserById(
          memberToReset.user_id,
          { password: newPassword }
        );

        if (error) {
          console.error('Error resetting password:', error);
          setErrorModal({
            isOpen: true,
            title: 'Error',
            message: 'No se pudo restablecer la contraseña: ' + error.message
          });
          return;
        }
      }

      setShowResetPasswordModal(false);
      setSuccessModal({
        isOpen: true,
        title: 'Contraseña Restablecida',
        message: `La contraseña de ${memberToReset.name} ha sido actualizada.`
      });
      setMemberToReset(null);
      setNewPassword('');
    } catch (err) {
      console.error('Error:', err);
      setErrorModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo restablecer la contraseña.'
      });
    }
  };

  const handleToggleActive = (memberId) => {
    toggleMemberActive(memberId);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Miembros del Ministerio</h2>
          <p className="text-sm text-gray-400 mt-1">
            {filteredMembers.filter(m => m.active).length} miembros activos
            {filterRole !== 'all' && ` · Filtrado: ${roleConfig[filterRole]?.label}`}
          </p>
        </div>
        {/* View mode toggle - visible to all users */}
        <div className="flex items-center gap-2">
          <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'cards' ? 'bg-white text-black' : 'hover:bg-neutral-800 text-gray-400'}`}
              title="Vista de tarjetas"
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white text-black' : 'hover:bg-neutral-800 text-gray-400'}`}
              title="Vista de grilla"
            >
              <List size={18} />
            </button>
          </div>
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
              placeholder="Buscar por nombre, email o instrumento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl focus:outline-none focus:border-white transition-colors"
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
                        ? 'bg-white text-black'
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
                          ? 'bg-white text-black'
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
                        ? 'bg-white text-black'
                        : 'bg-neutral-800 hover:bg-neutral-700'
                    }`}
                  >
                    Activos
                  </button>
                  <button
                    onClick={() => setFilterActive('false')}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                      filterActive === 'false'
                        ? 'bg-white text-black'
                        : 'bg-neutral-800 hover:bg-neutral-700'
                    }`}
                  >
                    Inactivos
                  </button>
                  <button
                    onClick={() => setFilterActive('all')}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                      filterActive === 'all'
                        ? 'bg-white text-black'
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
                          ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
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
            <Card
              key={member.id}
              className={`group transition-all ${
                !member.active ? 'opacity-60 border-dashed' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Avatar name={member.name} size="lg" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{member.name}</h3>
                      {!member.active && (
                        <Badge variant="danger" size="sm">Inactivo</Badge>
                      )}
                    </div>
                    <span className={`text-xs font-medium ${roleConfig[member.role]?.color}`}>
                      {roleConfig[member.role]?.label}
                    </span>
                  </div>
                </div>

                {isPastor && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleResetPassword(member)}
                      className="p-2 rounded-lg hover:bg-neutral-800 transition-colors"
                      title="Restablecer contraseña"
                    >
                      <Key size={16} className="text-purple-400" />
                    </button>
                    <button
                      onClick={() => handleOpenModal(member)}
                      className="p-2 rounded-lg hover:bg-neutral-800 transition-colors"
                      title="Editar"
                    >
                      <Edit size={16} className="text-gray-400" />
                    </button>
                    <button
                      onClick={() => handlePermanentlyDelete(member.id, member.name)}
                      className="p-2 rounded-lg hover:bg-neutral-800 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={16} className="text-gray-400 hover:text-red-400" />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2 text-sm">
                {member.email && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Mail size={14} />
                    <span className="truncate">{member.email}</span>
                  </div>
                )}
                {member.phone && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Phone size={14} />
                    <span>{member.phone}</span>
                  </div>
                )}
                {member.pastor_area && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Cross size={14} />
                    <span>{member.pastor_area}</span>
                  </div>
                )}
                {member.leader_of && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Users2 size={14} />
                    <span>{member.leader_of}</span>
                  </div>
                )}
                {member.birthdate && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Calendar size={14} />
                    <span>{new Date(member.birthdate).toLocaleDateString('es-AR')}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {member.instruments?.map((inst) => (
                  <span
                    key={inst}
                    className="px-2 py-0.5 bg-neutral-800 rounded text-xs text-gray-300"
                  >
                    {inst}
                  </span>
                ))}
              </div>

              {isPastor && (
                <div className="mt-4 pt-4 border-t border-neutral-800">
                  <button
                    onClick={() => handleToggleActive(member.id)}
                    className={`text-xs flex items-center gap-1.5 transition-colors ${
                      member.active ? 'text-green-400 hover:text-green-300' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {member.active ? (
                      <>
                        <Check size={14} />
                        Activo - Click para desactivar
                      </>
                    ) : (
                      <>
                        <X size={14} />
                        Inactivo - Click para activar
                      </>
                    )}
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        /* Table View */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase hidden lg:table-cell">Email</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Teléfono</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Pastor</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Líder</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Rol</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase hidden xl:table-cell">Instrumentos</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Estado</th>
                  {isPastor && (
                    <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium uppercase">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr
                    key={member.id}
                    className={`border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors ${
                      !member.active ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={member.name} size="sm" />
                        <span className="font-medium">{member.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{member.email || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{member.phone || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{member.pastor_area || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{member.leader_of || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${roleConfig[member.role]?.color}`}>
                        {roleConfig[member.role]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {member.instruments?.slice(0, 2).map((inst) => (
                          <span key={inst} className="px-2 py-0.5 bg-neutral-800 rounded text-xs">
                            {inst}
                          </span>
                        ))}
                        {member.instruments?.length > 2 && (
                          <span className="px-2 py-0.5 bg-neutral-800 rounded text-xs text-gray-400">
                            +{member.instruments.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {member.active ? (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <Check size={12} /> Activo
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <X size={12} /> Inactivo
                        </span>
                      )}
                    </td>
                    {isPastor && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleToggleActive(member.id)}
                            className={`p-1.5 rounded hover:bg-neutral-800 transition-colors ${
                              member.active ? 'text-green-400' : 'text-gray-400'
                            }`}
                            title={member.active ? 'Desactivar' : 'Activar'}
                          >
                            {member.active ? <Check size={14} /> : <X size={14} />}
                          </button>
                          <button
                            onClick={() => handleOpenModal(member)}
                            className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-gray-400"
                            title="Editar"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(member.id, member.name)}
                            className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-gray-400 hover:text-red-400"
                            title="Desactivar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {filteredMembers.length === 0 && (
        <div className="text-center py-12">
          <UserPlus size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">No se encontraron miembros</p>
          <p className="text-sm text-gray-500 mt-1">
            {searchTerm ? 'Intenta con otro término de búsqueda' : 'Agrega tu primer miembro'}
          </p>
        </div>
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
              disabled={!formData.name.trim() || (!editingMember && formData.email && !formData.password)}
            >
              {editingMember ? 'Guardar Cambios' : 'Agregar Miembro'}
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
              label="Líder de"
              placeholder="Grupo o área"
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
                <Key size={18} className="text-purple-400" />
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
                      ? 'border-white bg-white/10'
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

          <div>
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-3">
              Instrumentos (puede seleccionar varios)
            </label>
            <div className="grid grid-cols-4 gap-2">
              {INSTRUMENTS.map(inst => (
                <button
                  key={inst}
                  type="button"
                  onClick={() => toggleInstrument(inst)}
                  className={`
                    p-3 rounded-xl text-sm transition-all border-2
                    ${formData.instruments.includes(inst)
                      ? 'border-white bg-white/10'
                      : 'border-neutral-800 hover:border-neutral-700'
                    }
                  `}
                >
                  {inst}
                </button>
              ))}
            </div>
          </div>
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
              <Key size={18} className="text-purple-400" />
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
              className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl focus:outline-none focus:border-purple-500 transition-colors"
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
