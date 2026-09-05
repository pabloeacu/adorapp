import React, { useState } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  Plus, Calendar, Clock, Edit, Trash2,
  Check, ChevronDown, AlertTriangle, UserPlus, X, Search
} from 'lucide-react';
import { MicrophoneStage, UsersThree } from '@phosphor-icons/react';
import { useAppStore, MEETING_TYPES } from '../stores/appStore';
import { useCurrentRole, useCurrentMember } from '../hooks/useCurrentMember';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { IconBadge } from '../components/ui/IconBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { ConfirmModal, SuccessModal, ErrorModal } from '../components/ui/ConfirmModal';

import { dayLabels, dayPluralLabels, compareBandsByCalendar } from '../lib/days';

export const Bandas = () => {
  useDocumentTitle('Bandas');
  const {
    bands, members, orders, bandTemporaryMembers,
    addBand, updateBand, deleteBand, getBandMembers,
    addPermanentBandMember, addTemporaryBandMember, removeTemporaryBandMember, getEffectiveBandMemberIds,
  } = useAppStore();
  const userRole = useCurrentRole();
  const currentMember = useCurrentMember();
  const isPastor = userRole === 'pastor';
  const isLeader = userRole === 'leader';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBand, setEditingBand] = useState(null);
  const [expandedBand, setExpandedBand] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    meetingType: 'culto_general',
    meetingDay: 'domingo',
    meetingTime: '20:00',
    members: []
  });

  // Confirmation modals
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

  // "Agregar miembro" (permanente o temporal) — visible para líder y pastor.
  const [addModal, setAddModal] = useState({ isOpen: false, band: null });
  const [addForm, setAddForm] = useState({ memberId: '', isTemporary: false, days: 7 });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addSearch, setAddSearch] = useState(''); // buscador por nombre en el selector

  const openAddModal = (band) => {
    setAddForm({ memberId: '', isTemporary: false, days: 7 });
    setAddSearch('');
    setAddModal({ isOpen: true, band });
  };
  const closeAddModal = () => {
    setAddModal({ isOpen: false, band: null });
    setAddForm({ memberId: '', isTemporary: false, days: 7 });
    setAddSearch('');
  };

  const handleAddSubmit = async () => {
    const band = addModal.band;
    if (!band || !addForm.memberId || addSubmitting) return;
    const n = Number(addForm.days);
    if (addForm.isTemporary && (!Number.isInteger(n) || n < 1 || n > 90)) {
      setErrorModal({ isOpen: true, title: 'Días inválidos', message: 'La cantidad de días del temporal debe ser un número entre 1 y 90.' });
      return;
    }
    setAddSubmitting(true);
    const res = addForm.isTemporary
      ? await addTemporaryBandMember({ bandId: band.id, memberId: addForm.memberId, days: n, addedBy: currentMember?.id })
      : await addPermanentBandMember(band.id, addForm.memberId);
    setAddSubmitting(false);
    if (res?.ok) {
      const who = members.find(m => m.id === addForm.memberId)?.name || 'La persona';
      closeAddModal();
      setSuccessModal({
        isOpen: true,
        title: 'Integrante agregado',
        message: addForm.isTemporary
          ? `${who} se sumó a "${band.name}" como temporal por ${n} ${n === 1 ? 'día' : 'días'}.`
          : `${who} se sumó a "${band.name}".`,
      });
    } else {
      setErrorModal({ isOpen: true, title: 'No se pudo agregar', message: res?.error || 'Intentá de nuevo.' });
    }
  };

  const handleRemoveTemporary = (band, member) => {
    const tempRow = bandTemporaryMembers.find(
      t => t.bandId === band.id && t.memberId === member.id && new Date(t.expiresAt).getTime() > Date.now()
    );
    if (!tempRow) return;
    setConfirmModal({
      isOpen: true,
      title: 'Quitar temporal',
      message: `¿Quitar a "${member.name}" de "${band.name}"? Es un integrante temporal; dejará de contar de inmediato.`,
      type: 'warning',
      confirmText: 'Sí, quitar',
      cancelText: 'Mejor no',
      icon: AlertTriangle,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, loading: true }));
        const res = await removeTemporaryBandMember(tempRow.id);
        setConfirmModal(prev => ({ ...prev, loading: false, isOpen: false }));
        if (res?.ok) {
          setSuccessModal({ isOpen: true, title: 'Temporal quitado', message: `"${member.name}" ya no integra "${band.name}".` });
        } else {
          setErrorModal({ isOpen: true, title: 'No se pudo quitar', message: res?.error || 'Intentá de nuevo.' });
        }
      },
    });
  };

  // Formatea el vencimiento del temporal en ART (DD/MM).
  const fmtExpiry = (iso) => {
    try {
      return new Date(iso).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
  };

  // Tarjetas en orden calendario (martes → jueves → sábado → domingo con las
  // bandas actuales), no en el orden de carga de la DB.
  const activeBands = bands.filter(b => b.active).sort(compareBandsByCalendar);

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

  const handleDelete = (band) => {
    setConfirmModal({
      isOpen: true,
      title: 'Eliminar Banda',
      message: `¿Querés eliminar "${band.name}"? Esta banda tiene ${getBandSongCount(band.id)} ordenes asociadas. Se eliminará la banda pero las ordenes permanecerán.`,
      type: 'warning',
      confirmText: 'Sí, eliminar',
      cancelText: 'Mejor no',
      icon: AlertTriangle,
      onConfirm: async () => {
        // Esperar el resultado real (patrón PR #42): fire-and-forget mostraba
        // "eliminada" aunque la base rechazara el DELETE (p. ej. FK).
        setConfirmModal(prev => ({ ...prev, loading: true }));
        const ok = await deleteBand(band.id);
        setConfirmModal(prev => ({ ...prev, loading: false, isOpen: false }));
        if (ok) {
          setSuccessModal({
            isOpen: true,
            title: 'Banda eliminada',
            message: `"${band.name}" fue eliminada correctamente.`
          });
        } else {
          setErrorModal({
            isOpen: true,
            title: 'No se pudo eliminar',
            message: `Hubo un problema al eliminar "${band.name}". Intentá de nuevo.`
          });
        }
      }
    });
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
        {/* Pastors and Leaders can create bands */}
        {(isPastor || isLeader) && (
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
            <Card key={band.id} className="relative overflow-hidden">
              {/* barra de acento dorada a la izquierda */}
              <div className="bg-gold-gradient absolute inset-y-0 left-0 w-1" />
              <div
                className="flex flex-wrap items-center justify-between gap-3 p-4 cursor-pointer hover:bg-neutral-800/30 transition-colors"
                onClick={() => setExpandedBand(isExpanded ? null : band.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <IconBadge icon={MicrophoneStage} size="md" />
                  <div>
                    <h3 className="text-lg font-semibold">{band.name}</h3>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {dayPluralLabels[band.meetingDay] || dayLabels[band.meetingDay]}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {band.meetingTime}
                      </span>
                      <Badge variant="gold" size="sm">
                        {getMeetingTypeLabel(band.meetingType)}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
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
                  <Badge variant="primary" size="sm">
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
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <h4 className="text-sm font-medium text-gray-400">Miembros ({bandMembers.length})</h4>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Líder y pastor pueden AGREGAR (permanente o temporal) */}
                      {(isPastor || isLeader) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={UserPlus}
                          onClick={(e) => {
                            e.stopPropagation();
                            openAddModal(band);
                          }}
                        >
                          Agregar miembro
                        </Button>
                      )}
                      {/* Solo el pastor edita/elimina la banda */}
                      {isPastor && (
                        <>
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
                              handleDelete(band);
                            }}
                          >
                            Eliminar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {bandMembers.map((member) => (
                      <div
                        key={member.id}
                        className={`relative flex items-center gap-3 p-3 rounded-xl ${member.temporary ? 'bg-neutral-900 ring-1 ring-gold-500/25' : 'bg-neutral-900'}`}
                      >
                        <Avatar name={member.name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{member.name}</p>
                          {member.temporary ? (
                            <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-gold-300">
                              <Clock size={11} /> Temporal · vence {fmtExpiry(member.expiresAt)}
                            </span>
                          ) : (
                            <p className="text-xs text-gray-500 truncate">
                              {member.instruments?.join(', ')}
                            </p>
                          )}
                        </div>
                        {/* El pastor puede quitar un temporal (el líder no ve la ✕) */}
                        {member.temporary && isPastor && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTemporary(band, member)}
                            className="shrink-0 p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            aria-label={`Quitar a ${member.name}`}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {bandMembers.length === 0 && (
                    <EmptyState
                      icon={UsersThree}
                      title="No hay miembros asignados"
                      subtitle="Todavía nadie integra esta banda."
                      annotation="Editá para sumar miembros"
                    />
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {activeBands.length === 0 && (
        <EmptyState
          icon={MicrophoneStage}
          title="No hay bandas creadas"
          subtitle="Armá tu primera banda de adoración y empezá a organizar los encuentros."
          annotation="Creá tu primera banda"
        >
          {(isPastor || isLeader) && (
            <Button
              variant="secondary"
              icon={Plus}
              onClick={() => handleOpenModal()}
            >
              Crear primera banda
            </Button>
          )}
        </EmptyState>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                      ? 'border-gold-500/60 bg-gold-500/10'
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
                    ${formData.members.includes(member.id) ? 'border-gold-500 bg-gold-gradient' : 'border-gray-500'}
                  `}>
                    {formData.members.includes(member.id) && (
                      <Check size={12} className="text-black" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {/* Agregar miembro (permanente o temporal) — líder y pastor */}
      <Modal
        isOpen={addModal.isOpen}
        onClose={closeAddModal}
        title={addModal.band ? `Agregar a ${addModal.band.name}` : 'Agregar miembro'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeAddModal} disabled={addSubmitting}>Cancelar</Button>
            <Button onClick={handleAddSubmit} disabled={!addForm.memberId || addSubmitting}>
              {addSubmitting ? 'Agregando…' : 'Agregar'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Selector de persona: activos que todavía NO integran la banda (ni permanente ni temporal vigente) */}
          <div>
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-2">Persona</label>
            {(() => {
              const effective = addModal.band ? getEffectiveBandMemberIds(addModal.band.id) : new Set();
              const allCandidates = members.filter(m => m.active && !effective.has(m.id));
              if (allCandidates.length === 0) {
                return <p className="text-sm text-gray-500">Todos los miembros activos ya integran esta banda.</p>;
              }
              // Filtro por nombre, insensible a mayúsculas y acentos (con muchos miembros, sobre todo en móvil).
              const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
              const q = norm(addSearch.trim());
              const candidates = q ? allCandidates.filter(m => norm(m.name).includes(q)) : allCandidates;
              return (
                <>
                  <div className="relative mb-2">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      type="text"
                      value={addSearch}
                      onChange={(e) => setAddSearch(e.target.value)}
                      placeholder="Buscar por nombre…"
                      className="w-full pl-9 pr-3"
                    />
                  </div>
                  {candidates.length === 0 ? (
                    <p className="py-2 text-sm text-gray-500">Nadie coincide con “{addSearch.trim()}”.</p>
                  ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto">
                  {candidates.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setAddForm(prev => ({ ...prev, memberId: m.id }))}
                      className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all border-2 ${addForm.memberId === m.id ? 'border-gold-500/60 bg-gold-500/10' : 'border-neutral-800 hover:border-neutral-700'}`}
                    >
                      <Avatar name={m.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{m.name}</p>
                        <p className="text-xs text-gray-500 truncate">{m.instruments?.slice(0, 2).join(', ')}</p>
                      </div>
                      {addForm.memberId === m.id && (
                        <div className="w-5 h-5 rounded-full bg-gold-gradient flex items-center justify-center shrink-0">
                          <Check size={12} className="text-black" />
                        </div>
                      )}
                    </button>
                  ))}
                  </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Tipo: permanente (default) / temporal — switch inmune a iOS (landmine #23) */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Temporal</p>
              <p className="text-xs text-gray-500">Se suma por unos días y después deja de contar solo, sin aviso.</p>
            </div>
            <label className="relative inline-flex shrink-0 cursor-pointer items-center">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={addForm.isTemporary}
                onChange={(e) => setAddForm(prev => ({ ...prev, isTemporary: e.target.checked }))}
              />
              <span className="block w-[52px] h-8 rounded-full bg-neutral-700 transition-colors peer-checked:bg-gold-500 peer-focus-visible:ring-2 peer-focus-visible:ring-gold-500/50" />
              <span className="pointer-events-none absolute top-[2px] left-[2px] h-7 w-7 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            </label>
          </div>

          {/* Días (solo temporal) */}
          {addForm.isTemporary && (
            <div>
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-1.5">¿Por cuántos días? (1 a 90)</label>
              <input
                type="number"
                min="1"
                max="90"
                className="w-full"
                value={addForm.days}
                onChange={(e) => setAddForm(prev => ({ ...prev, days: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1.5">Cuenta como integrante pleno (puede dirigir) hasta que venza. Después desaparece sin aviso.</p>
            </div>
          )}
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
