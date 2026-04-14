// AdorAPP - Centro de Avivamiento Familiar
// Communications Page - Send messages to members
import React, { useState, useEffect, useMemo } from 'react';
import { Send, Users, X, Check, Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export const Comunicaciones = () => {
  const { user, profile } = useAuthStore();
  const { bands, members } = useAppStore();
  const isPastor = profile?.role === 'pastor';

  // Form state
  const [recipientType, setRecipientType] = useState(''); // 'bands' | 'users' | 'roles' | 'all'
  const [selectedBands, setSelectedBands] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Modal states
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Recipient selection modals
  const [showBandSelector, setShowBandSelector] = useState(false);
  const [showUserSelector, setShowUserSelector] = useState(false);

  // Active members only
  const activeMembers = useMemo(() => {
    return members.filter(m => m.status === 'active');
  }, [members]);

  // Active bands only
  const activeBands = useMemo(() => {
    return bands.filter(b => b.status === 'active');
  }, [bands]);

  // Get members by selected bands
  const membersInSelectedBands = useMemo(() => {
    if (selectedBands.length === 0) return [];

    const bandIds = new Set(selectedBands);
    return activeMembers.filter(m => {
      // Check if member is in any selected band
      const memberBandIds = m.band_id ? [m.band_id] : (m.bandIds || []);
      return memberBandIds.some(bid => bandIds.has(bid));
    });
  }, [activeMembers, selectedBands]);

  // Toggle band selection
  const toggleBand = (bandId) => {
    setSelectedBands(prev =>
      prev.includes(bandId)
        ? prev.filter(id => id !== bandId)
        : [...prev, bandId]
    );
  };

  // Toggle user selection
  const toggleUser = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  // Reset form
  const resetForm = () => {
    setRecipientType('');
    setSelectedBands([]);
    setSelectedUsers([]);
    setSelectedRoles([]);
    setSubject('');
    setMessage('');
  };

  // Get recipient IDs based on selection
  const getRecipientIds = () => {
    const recipientIds = new Set();

    if (recipientType === 'all') {
      // All active members
      activeMembers.forEach(m => {
        if (m.user_id) recipientIds.add(m.user_id);
      });
    } else if (recipientType === 'bands') {
      // Members from selected bands
      membersInSelectedBands.forEach(m => {
        if (m.user_id) recipientIds.add(m.user_id);
      });
    } else if (recipientType === 'users') {
      // Selected users
      selectedUsers.forEach(uid => recipientIds.add(uid));
    } else if (recipientType === 'roles') {
      // Members with selected roles
      selectedRoles.forEach(role => {
        activeMembers
          .filter(m => m.role === role)
          .forEach(m => {
            if (m.user_id) recipientIds.add(m.user_id);
          });
      });
    }

    return Array.from(recipientIds);
  };

  // Send communication
  const handleSend = async () => {
    // Validation
    if (!subject.trim()) {
      setErrorMessage('El asunto es obligatorio');
      setShowError(true);
      return;
    }
    if (!message.trim()) {
      setErrorMessage('El mensaje es obligatorio');
      setShowError(true);
      return;
    }
    if (!recipientType) {
      setErrorMessage('Debes seleccionar al menos un tipo de destinatario');
      setShowError(true);
      return;
    }

    const recipientIds = getRecipientIds();
    if (recipientIds.length === 0) {
      setErrorMessage('No hay destinatarios disponibles');
      setShowError(true);
      return;
    }

    setIsSending(true);

    try {
      // Get sender info (pastor's member record)
      const senderMember = activeMembers.find(m => m.email === user?.email);

      // Create communication record
      const { data: commData, error: commError } = await supabase
        .from('communications')
        .insert({
          sender_id: senderMember?.user_id || senderMember?.id,
          sender_name: senderMember?.name || profile?.name || user?.name,
          sender_photo: senderMember?.avatar_url || senderMember?.photo_url,
          subject: subject.trim(),
          message: message.trim(),
          recipient_type: recipientType,
          recipient_ids: recipientIds,
          recipient_count: recipientIds.length,
        })
        .select()
        .single();

      if (commError) throw commError;

      // Create individual notifications for each recipient
      const notifications = recipientIds.map(recipientId => ({
        id: `comm-${commData.id}-${recipientId}-${Date.now()}`,
        communication_id: commData.id,
        recipient_id: recipientId,
        sender_name: senderMember?.name || profile?.name || user?.name,
        sender_photo: senderMember?.avatar_url || senderMember?.photo_url,
        subject: subject.trim(),
        preview: message.trim().substring(0, 100),
        full_message: message.trim(),
        is_read: false,
        created_at: new Date().toISOString(),
      }));

      // Insert notifications in batches of 50
      const batchSize = 50;
      for (let i = 0; i < notifications.length; i += batchSize) {
        const batch = notifications.slice(i, i + batchSize);
        const { error: notifError } = await supabase
          .from('communication_notifications')
          .insert(batch);

        if (notifError) {
          console.error('Error inserting notifications batch:', notifError);
        }
      }

      setShowSuccess(true);
      resetForm();
    } catch (err) {
      console.error('Error sending communication:', err);
      setErrorMessage('Error al enviar la comunicación. Por favor, intentá de nuevo.');
      setShowError(true);
    } finally {
      setIsSending(false);
    }
  };

  // If not a pastor, show access denied
  if (!isPastor) {
    return (
      <div className="p-6">
        <Card className="max-w-md mx-auto mt-8">
          <div className="text-center py-8">
            <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Acceso Denegado</h3>
            <p className="text-gray-400">Solo los pastores pueden acceder a esta sección.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Comunicaciones</h1>
        <p className="text-gray-400 text-sm mt-1">
          Enviá mensajes a los miembros de la plataforma
        </p>
      </div>

      <Card className="p-6">
        <div className="space-y-6">
          {/* Recipient Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Destinatarios
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Bandas */}
              <button
                onClick={() => {
                  setRecipientType('bands');
                  setShowBandSelector(true);
                }}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  recipientType === 'bands'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-neutral-700 hover:border-neutral-600'
                }`}
              >
                <Users size={24} className={recipientType === 'bands' ? 'text-blue-400' : 'text-gray-400'} />
                <p className="font-medium text-white mt-2">Bandas</p>
                <p className="text-xs text-gray-400 mt-1">
                  {selectedBands.length > 0
                    ? `${selectedBands.length} banda(s) seleccionada(s)`
                    : 'Seleccionar bandas'}
                </p>
              </button>

              {/* Usuarios específicos */}
              <button
                onClick={() => {
                  setRecipientType('users');
                  setShowUserSelector(true);
                }}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  recipientType === 'users'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-neutral-700 hover:border-neutral-600'
                }`}
              >
                <Users size={24} className={recipientType === 'users' ? 'text-blue-400' : 'text-gray-400'} />
                <p className="font-medium text-white mt-2">Usuarios</p>
                <p className="text-xs text-gray-400 mt-1">
                  {selectedUsers.length > 0
                    ? `${selectedUsers.length} usuario(s) seleccionado(s)`
                    : 'Seleccionar usuarios'}
                </p>
              </button>

              {/* Roles */}
              <button
                onClick={() => {
                  setRecipientType('roles');
                  setSelectedRoles(
                    selectedRoles.length === 0 ? ['pastor', 'leader', 'member'] : []
                  );
                }}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  recipientType === 'roles'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-neutral-700 hover:border-neutral-600'
                }`}
              >
                <Users size={24} className={recipientType === 'roles' ? 'text-blue-400' : 'text-gray-400'} />
                <p className="font-medium text-white mt-2">Por Rol</p>
                <p className="text-xs text-gray-400 mt-1">
                  Pastores, líderes o miembros
                </p>
              </button>

              {/* Todos */}
              <button
                onClick={() => setRecipientType('all')}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  recipientType === 'all'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-neutral-700 hover:border-neutral-600'
                }`}
              >
                <Users size={24} className={recipientType === 'all' ? 'text-blue-400' : 'text-gray-400'} />
                <p className="font-medium text-white mt-2">Todos</p>
                <p className="text-xs text-gray-400 mt-1">
                  {activeMembers.length} miembro(s) activo(s)
                </p>
              </button>
            </div>
          </div>

          {/* Role Multi-select (when roles selected) */}
          {recipientType === 'roles' && (
            <div className="bg-neutral-800/50 rounded-xl p-4">
              <p className="text-sm text-gray-400 mb-3">Seleccionar roles:</p>
              <div className="flex flex-wrap gap-3">
                {['pastor', 'leader', 'member'].map(role => (
                  <button
                    key={role}
                    onClick={() => {
                      setSelectedRoles(prev =>
                        prev.includes(role)
                          ? prev.filter(r => r !== role)
                          : [...prev, role]
                      );
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedRoles.includes(role)
                        ? 'bg-blue-500 text-white'
                        : 'bg-neutral-700 text-gray-300 hover:bg-neutral-600'
                    }`}
                  >
                    {role === 'pastor' ? 'Pastores' : role === 'leader' ? 'Líderes' : 'Miembros'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Asunto *
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ej: Reunión de líderes este sábado"
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white focus:outline-none focus:border-blue-500 transition-colors"
              maxLength={100}
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Mensaje *
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escribí tu mensaje aquí..."
              rows={6}
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white focus:outline-none focus:border-blue-500 transition-colors resize-none"
              maxLength={1000}
            />
            <p className="text-xs text-gray-500 mt-1 text-right">
              {message.length}/1000 caracteres
            </p>
          </div>

          {/* Summary */}
          <div className="bg-neutral-800/50 rounded-xl p-4">
            <p className="text-sm text-gray-400">
              Esta comunicación llegará a{' '}
              <span className="text-white font-medium">
                {getRecipientIds().length}
              </span>{' '}
              destinatario(s).
            </p>
          </div>

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={isSending || !recipientType || !subject.trim() || !message.trim()}
            className="w-full"
            size="lg"
          >
            {isSending ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send size={18} />
                Enviar Comunicación
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Band Selector Modal */}
      {showBandSelector && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowBandSelector(false)}
        >
          <div
            className="bg-neutral-900 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
              <h3 className="text-lg font-semibold text-white">Seleccionar Bandas</h3>
              <button
                onClick={() => setShowBandSelector(false)}
                className="p-2 rounded-full hover:bg-neutral-800"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="space-y-2">
                {activeBands.map(band => (
                  <button
                    key={band.id}
                    onClick={() => toggleBand(band.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                      selectedBands.includes(band.id)
                        ? 'bg-blue-500/20 border-2 border-blue-500'
                        : 'bg-neutral-800 hover:bg-neutral-700 border-2 border-transparent'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      selectedBands.includes(band.id)
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-neutral-600'
                    }`}>
                      {selectedBands.includes(band.id) && (
                        <Check size={14} className="text-white" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white font-medium">{band.name}</p>
                      <p className="text-xs text-gray-400">
                        {activeMembers.filter(m => m.band_id === band.id).length} miembros
                      </p>
                    </div>
                  </button>
                ))}
                {activeBands.length === 0 && (
                  <p className="text-center text-gray-500 py-8">
                    No hay bandas activas
                  </p>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-neutral-800">
              <Button
                onClick={() => setShowBandSelector(false)}
                className="w-full"
              >
                Aceptar ({selectedBands.length} seleccionada(s))
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* User Selector Modal */}
      {showUserSelector && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowUserSelector(false)}
        >
          <div
            className="bg-neutral-900 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-neutral-800">
              <h3 className="text-lg font-semibold text-white">Seleccionar Usuarios</h3>
              <button
                onClick={() => setShowUserSelector(false)}
                className="p-2 rounded-full hover:bg-neutral-800"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="space-y-2">
                {activeMembers.map(member => (
                  <button
                    key={member.id}
                    onClick={() => {
                      if (member.user_id || member.id) {
                        toggleUser(member.user_id || member.id);
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                      selectedUsers.includes(member.user_id || member.id)
                        ? 'bg-blue-500/20 border-2 border-blue-500'
                        : 'bg-neutral-800 hover:bg-neutral-700 border-2 border-transparent'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      selectedUsers.includes(member.user_id || member.id)
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-neutral-600'
                    }`}>
                      {selectedUsers.includes(member.user_id || member.id) && (
                        <Check size={14} className="text-white" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white font-medium">{member.name}</p>
                      <p className="text-xs text-gray-400 capitalize">
                        {member.role === 'pastor' ? 'Pastor' : member.role === 'leader' ? 'Líder' : 'Miembro'}
                      </p>
                    </div>
                  </button>
                ))}
                {activeMembers.length === 0 && (
                  <p className="text-center text-gray-500 py-8">
                    No hay miembros activos
                  </p>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-neutral-800">
              <Button
                onClick={() => setShowUserSelector(false)}
                className="w-full"
              >
                Aceptar ({selectedUsers.length} seleccionado(s))
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccess && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowSuccess(false)}
        >
          <div
            className="bg-neutral-900 rounded-2xl w-full max-w-sm p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">¡Comunicación Enviada!</h3>
            <p className="text-gray-400 mb-6">
              La comunicación ha sido enviada a {getRecipientIds().length} destinatario(s).
            </p>
            <Button onClick={() => setShowSuccess(false)} className="w-full">
              Aceptar
            </Button>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showError && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowError(false)}
        >
          <div
            className="bg-neutral-900 rounded-2xl w-full max-w-sm p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} className="text-red-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Error</h3>
            <p className="text-gray-400 mb-6">{errorMessage}</p>
            <Button onClick={() => setShowError(false)} className="w-full" variant="secondary">
              Aceptar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
