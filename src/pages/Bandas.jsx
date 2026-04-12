import React, { useState } from 'react';
import {
  Plus, Users, Calendar, Clock, MoreVertical, Edit, Trash2,
  Music, Check, X, UserPlus, Shield, ChevronDown
} from 'lucide-react';
import { useAppStore, MEETING_TYPES } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';

const dayLabels = {
  domingo: 'Domingo',
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
 viernes: 'Viernes',
  sabado: 'Sábado'
};

export const Bandas = () => {
  const { bands, members, orders, addBand, updateBand, deleteBand, getBandMembers } = useAppStore();
  const user = useAuthStore((state) => state.user);
  const isPastor = user?.role === 'pastor';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBand, setEditingBand] = useState(null);
  const [expandedBand, setExpandedBand] = useState(null);
  const [showAddMembers, setShowAddMembers] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    meetingType: 'culto_general',
    meetingDay: 'domingo',
    meetingTime: '20:00',
    members: []
  });

  const activeBands = bands.filter(b => b.active);

  const getBandSongCount = (bandId) => {
    return orders.filter(o => o.bandId === bandId).length;
  };

  const getMeetingTypeLabel = (typeId) => {
    const type = MEETING_TYPES.find(t => t.id === typeId);
    return type?.label || typeId;
  };

  const handleOpenModal = (band = null) => {
    if (band) {
      setEditingBand(band);
      setFormData({
        name: band.name,
        meetingType: band.meetingType,
        meetingDay: band.meetingDay,
        meetingTime: band.meetingTime,
        members: [...band.members]
      });
    } else {
      setEditingBand(null);
      setFormData({
        name: '',
        meetingType: 'culto_general',
        meetingDay: 'domingo',
        meetingTime: '20:00',
        members: []
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBand(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingBand) {
      updateBand(editingBand.id, formData);
    } else {
      addBand(formData);
    }
    handleCloseModal();
  };

  const handleDelete = (bandId) => {
    if (window.confirm('¿Estás seguro de eliminar esta banda?')) {
      deleteBand(bandId);
    }
  };

  const toggleMemberSelection = (memberId) => {
    setFormData(prev => ({
      ...prev,
      members: prev.members.includes(memberId)
        ? prev.members.filter(id => id !== memberId)
        : [...prev.members, memberId]
    }));
  };

  const availableMembers = members.filter(m => m.active);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Bandas de Adoración</h2>
          <p className="text-sm text-gray-400 mt-1">
            {activeBands.length} bandas activas
          </p>
        </div>
        {isPastor && (
          <Button icon={Plus} onClick={() => handleOpenModal()}>
            Crear Banda
          </Button>
        )}
      </div>

      {/* Bands List */}
      <div className="space-y-4">
        {activeBands.map((band) => {
          const bandMembers = getBandMembers(band.id);
          const songCount = getBandSongCount(band.id);
          const isExpanded = expandedBand === band.id;

          return (
            <Card key={band.id} className="overflow-hidden">
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-neutral-800/30 transition-colors"
                onClick={() => setExpandedBand(isExpanded ? null : band.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Users size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{band.name}</h3>
                    <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {dayLabels[band.meetingDay]}s
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {band.meetingTime}
                      </span>
                      <Badge variant="primary" size="sm">
                        {getMeetingTypeLabel(band.meetingType)}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {bandMembers.slice(0, 4).map((member) => (
                      <Avatar key={member.id} name={member.name} size="sm" />
                    ))}
                    {bandMembers.length > 4 && (
                      <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-xs">
                        +{bandMembers.length - 4}
                      </div>
                    )}
                  </div>
                  <Badge variant="success" size="sm">
                    {songCount} servicios
                  </Badge>
                  <ChevronDown
                    size={20}
                    className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-neutral-800 p-4 bg-neutral-800/20 animate-slide-up">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium text-gray-400">Miembros ({bandMembers.length})</h4>
                    {isPastor && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Edit}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenModal(band);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Trash2}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(band.id);
                          }}
                        >
                          Eliminar
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {bandMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 p-3 bg-neutral-900 rounded-xl"
                      >
                        <Avatar name={member.name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{member.name}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {member.instruments?.join(', ')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {bandMembers.length === 0 && (
                    <div className="text-center py-6 text-gray-500">
                      <Users size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No hay miembros asignados</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {activeBands.length === 0 && (
        <div className="text-center py-12">
          <Users size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">No hay bandas creadas</p>
          <Button
            variant="secondary"
            icon={Plus}
            onClick={() => handleOpenModal()}
            className="mt-4"
          >
            Crear primera banda
          </Button>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingBand ? 'Editar Banda' : 'Crear Nueva Banda'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.name.trim() || formData.members.length === 0}
            >
              {editingBand ? 'Guardar Cambios' : 'Crear Banda'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Nombre de la Banda"
            placeholder="Ej: Banda Principal"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-1.5">
                Día de Reunión
              </label>
              <select
                className="w-full"
                value={formData.meetingDay}
                onChange={(e) => setFormData({ ...formData, meetingDay: e.target.value })}
              >
                {Object.entries(dayLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-1.5">
                Hora
              </label>
              <input
                type="time"
                className="w-full"
                value={formData.meetingTime}
                onChange={(e) => setFormData({ ...formData, meetingTime: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-1.5">
                Tipo de Reunión
              </label>
              <select
                className="w-full"
                value={formData.meetingType}
                onChange={(e) => setFormData({ ...formData, meetingType: e.target.value })}
              >
                {MEETING_TYPES.map(type => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-3">
              Miembros ({formData.members.length} seleccionados)
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {availableMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => toggleMemberSelection(member.id)}
                  className={`
                    flex items-center gap-3 p-3 rounded-xl text-left transition-all border-2
                    ${formData.members.includes(member.id)
                      ? 'border-white bg-white/10'
                      : 'border-neutral-800 hover:border-neutral-700'
                    }
                  `}
                >
                  <Avatar name={member.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{member.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {member.instruments?.slice(0, 2).join(', ')}
                    </p>
                  </div>
                  <div className={`
                    w-5 h-5 rounded-full border-2 flex items-center justify-center
                    ${formData.members.includes(member.id) ? 'border-black bg-black' : 'border-gray-500'}
                  `}>
                    {formData.members.includes(member.id) && (
                      <Check size={12} className="text-white" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
