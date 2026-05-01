import React, { useState, useMemo } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  Search, Mail, Phone, Shield,
  Check, X, Filter, UserPlus, CheckCircle, XCircle,
  Cross, Clock, AlertTriangle
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { PageLoader } from '../components/ui/PageLoader';
import { useAppStore, MEMBER_ROLES } from '../stores/appStore';
import { supabase, callAdminFunction } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ConfirmModal, SuccessModal, ErrorModal } from '../components/ui/ConfirmModal';

// Helper to format dates WITHOUT timezone shift
const formatDateLocal = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export const Solicitudes = () => {
  useDocumentTitle('Solicitudes');
  const { profile } = useAuthStore();
  const { initialize } = useAppStore();
  const isPastor = profile?.role === 'pastor';

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState('cards');

  // Modal states
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState('member');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [createdMember, setCreatedMember] = useState(null);
  const [showPasswordReveal, setShowPasswordReveal] = useState(false);

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

  // Load pending registrations
  React.useEffect(() => {
    const loadRequests = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('pending_registrations')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setPendingRequests(data || []);
      } catch (err) {
        console.error('Error loading requests:', err);
        setErrorModal({
          isOpen: true,
          title: 'Error',
          message: 'No se pudieron cargar las solicitudes.'
        });
      } finally {
        setLoading(false);
      }
    };
    loadRequests();

    // Refresh every 30 seconds
    const interval = setInterval(loadRequests, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredRequests = useMemo(() => {
    return pendingRequests.filter(request => {
      const matchesSearch = request.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        request.email?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = filterStatus === 'all' || request.status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [pendingRequests, searchTerm, filterStatus]);

  // Generate a reasonably-strong random password (alphanumeric, 12 chars).
  // Uses crypto.getRandomValues for unbiased entropy.
  const generateRandomPassword = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const buf = new Uint32Array(12);
    crypto.getRandomValues(buf);
    let out = '';
    for (let i = 0; i < buf.length; i++) out += alphabet[buf[i] % alphabet.length];
    return out;
  };

  const handleApprove = (request) => {
    setSelectedRequest(request);
    setSelectedRole('member');
    setGeneratedPassword(generateRandomPassword());
    setShowApproveModal(true);
  };

  const handleConfirmApproval = async () => {
    if (!selectedRequest) return;
    if (!generatedPassword || generatedPassword.length < 6) {
      setErrorModal({ isOpen: true, title: 'Error', message: 'La contraseña inicial debe tener al menos 6 caracteres.' });
      return;
    }

    setConfirmModal({ ...confirmModal, loading: true });

    const approvedName = selectedRequest.name;
    const approvedEmail = selectedRequest.email;
    const approvedPassword = generatedPassword;

    const { error } = await callAdminFunction('admin-approve-registration', {
      requestId: selectedRequest.id,
      role: selectedRole,
      password: generatedPassword,
    });

    if (error) {
      console.error('Approval error:', error);
      setConfirmModal({ ...confirmModal, isOpen: false, loading: false });
      setErrorModal({
        isOpen: true,
        title: 'Error',
        message: 'No se pudo aprobar la solicitud. ' + error,
      });
      return;
    }

    setPendingRequests(prev => prev.filter(r => r.id !== selectedRequest.id));
    setShowApproveModal(false);
    setConfirmModal({ ...confirmModal, isOpen: false, loading: false });

    // Show the credentials modal so the pastor can copy and share them
    // through a secure channel. Once it closes, the password is gone.
    setCreatedMember({ name: approvedName, email: approvedEmail, password: approvedPassword });
    setShowPasswordReveal(true);

    await initialize();
  };

  const handleReject = (request) => {
    setSelectedRequest(request);
    setConfirmModal({
      isOpen: true,
      title: 'Rechazar Solicitud',
      message: `¿Estás seguro de rechazar la solicitud de ${request.name}?`,
      type: 'danger',
      confirmText: 'Rechazar',
      cancelText: 'Cancelar',
      icon: XCircle,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, loading: true }));
        const { error } = await callAdminFunction('admin-reject-registration', { requestId: request.id });
        if (error) {
          console.error('Reject error:', error);
          setConfirmModal(prev => ({ ...prev, loading: false }));
          setErrorModal({
            isOpen: true,
            title: 'Error',
            message: 'No se pudo rechazar la solicitud. ' + error,
          });
          return;
        }
        setPendingRequests(prev => prev.filter(r => r.id !== request.id));
        setConfirmModal(prev => ({ ...prev, isOpen: false, loading: false }));
        setSuccessModal({
          isOpen: true,
          title: 'Solicitud Rechazada',
          message: `La solicitud de ${request.name} ha sido rechazada.`,
        });
      }
    });
  };

  // Only pastors can access
  if (!isPastor) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="text-center py-12">
          <AlertTriangle size={48} className="mx-auto text-yellow-400 mb-4" />
          <h2 className="text-xl font-semibold">Acceso Restringido</h2>
          <p className="text-gray-400 mt-2">Solo los pastores pueden ver las solicitudes de registro.</p>
        </div>
      </div>
    );
  }

  const statusConfig = {
    pending: { label: 'Pendientes', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
    approved: { label: 'Aprobadas', color: 'text-green-400', bg: 'bg-green-500/20' },
    rejected: { label: 'Rechazadas', color: 'text-red-400', bg: 'bg-red-500/20' },
    all: { label: 'Todas', color: 'text-gray-400', bg: 'bg-gray-500/20' },
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Solicitudes de Registro</h2>
          <p className="text-sm text-gray-400 mt-1">
            {filteredRequests.filter(r => r.status === 'pending').length} solicitudes pendientes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'cards' ? 'bg-white text-black' : 'hover:bg-neutral-800 text-gray-400'}`}
              title="Vista de tarjetas"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white text-black' : 'hover:bg-neutral-800 text-gray-400'}`}
              title="Vista de lista"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            <input
              type="text"
              placeholder="Buscar por nombre o email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white transition-colors"
            />
          </div>
          <Button
            variant="secondary"
            icon={Filter}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filtros
          </Button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <Card className="animate-slide-up">
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusConfig).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setFilterStatus(key)}
                  className={`px-4 py-2 rounded-lg text-sm transition-all ${filterStatus === key
                    ? 'bg-white text-black'
                    : 'bg-neutral-800 hover:bg-neutral-700'
                    }`}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <PageLoader label="Cargando solicitudes…" />
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-12">
          <UserPlus size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">No se encontraron solicitudes</p>
          <p className="text-sm text-gray-500 mt-1">
            {searchTerm || filterStatus !== 'pending'
              ? 'Intenta con otros filtros'
              : 'Las nuevas solicitudes aparecerán aquí'
            }
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRequests.map((request) => (
            <Card key={request.id} className="group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-neutral-700 flex items-center justify-center text-lg font-semibold">
                    {request.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold">{request.name}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusConfig[request.status]?.bg} ${statusConfig[request.status]?.color}`}>
                      {statusConfig[request.status]?.label}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {request.email && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Mail size={14} />
                    <span className="truncate">{request.email}</span>
                  </div>
                )}
                {request.phone && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Phone size={14} />
                    <span>{request.phone}</span>
                  </div>
                )}
                {request.pastor_area && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Cross size={14} />
                    <span>{request.pastor_area}</span>
                  </div>
                )}
                {request.instruments?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {request.instruments.slice(0, 3).map((inst) => (
                      <span key={inst} className="px-2 py-0.5 bg-neutral-800 rounded text-xs">
                        {inst}
                      </span>
                    ))}
                    {request.instruments.length > 3 && (
                      <span className="px-2 py-0.5 bg-neutral-800 rounded text-xs text-gray-400">
                        +{request.instruments.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 text-xs text-gray-500 mt-3 pt-3 border-t border-neutral-800">
                <Clock size={12} />
                <span>{formatDateLocal(request.created_at)}</span>
              </div>

              {request.status === 'pending' && (
                <div className="mt-4 pt-4 border-t border-neutral-800 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(request)}
                    className="flex-1"
                  >
                    <Check size={14} />
                    Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleReject(request)}
                  >
                    <X size={14} />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase hidden lg:table-cell">Email</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Teléfono</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Instrumentos</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase">Estado</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => (
                  <tr
                    key={request.id}
                    className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center text-sm font-semibold">
                          {request.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{request.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 hidden lg:table-cell">{request.email || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">{request.phone || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {request.instruments?.slice(0, 2).map((inst) => (
                          <span key={inst} className="px-2 py-0.5 bg-neutral-800 rounded text-xs">
                            {inst}
                          </span>
                        ))}
                        {request.instruments?.length > 2 && (
                          <span className="px-2 py-0.5 bg-neutral-800 rounded text-xs text-gray-400">
                            +{request.instruments.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{formatDateLocal(request.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusConfig[request.status]?.bg} ${statusConfig[request.status]?.color}`}>
                        {statusConfig[request.status]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {request.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(request)}
                              className="p-1.5 rounded hover:bg-green-500/20 transition-colors text-green-400"
                              title="Aprobar"
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button
                              onClick={() => handleReject(request)}
                              className="p-1.5 rounded hover:bg-red-500/20 transition-colors text-red-400"
                              title="Rechazar"
                            >
                              <XCircle size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Approve Modal */}
      <Modal
        isOpen={showApproveModal}
        onClose={() => setShowApproveModal(false)}
        title="Aprobar Solicitud"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowApproveModal(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setConfirmModal({
              isOpen: true,
              title: 'Confirmar Aprobación',
              message: `¿Estás seguro de aprobar a ${selectedRequest?.name} como ${MEMBER_ROLES.find(r => r.id === selectedRole)?.label}? Se crearán sus credenciales de acceso.`,
              type: 'success',
              confirmText: 'Aprobar',
              cancelText: 'Cancelar',
              icon: CheckCircle,
              onConfirm: handleConfirmApproval
            })}>
              <Check size={16} />
              Aprobar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-4 bg-neutral-800/50 rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-neutral-700 flex items-center justify-center text-lg font-semibold">
                {selectedRequest?.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold">{selectedRequest?.name}</p>
                <p className="text-sm text-gray-400">{selectedRequest?.email}</p>
              </div>
            </div>
            {selectedRequest?.instruments?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedRequest.instruments.map((inst) => (
                  <span key={inst} className="px-2 py-0.5 bg-neutral-700 rounded text-xs">
                    {inst}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-3">
              Asignar Rol *
            </label>
            <div className="grid grid-cols-3 gap-3">
              {MEMBER_ROLES.map(role => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRole(role.id)}
                  className={`
                    p-4 rounded-xl text-left transition-all border-2
                    ${selectedRole === role.id
                      ? 'border-white bg-white/10'
                      : 'border-neutral-800 hover:border-neutral-700'
                    }
                  `}
                >
                  <Shield size={20} className={`mb-2 ${role.id === 'pastor' ? 'text-purple-400' : role.id === 'leader' ? 'text-blue-400' : 'text-green-400'}`} />
                  <p className="font-medium">{role.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{role.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide block mb-2">
              Contraseña inicial *
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={generatedPassword}
                onChange={(e) => setGeneratedPassword(e.target.value)}
                className="flex-1 px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white transition-colors"
                placeholder="Mínimo 6 caracteres"
                minLength={6}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setGeneratedPassword(generateRandomPassword())}
              >
                Regenerar
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Esta es la contraseña inicial que se le va a asignar. Se la mostraremos una sola vez después de aprobar para que se la pases al usuario por canal seguro.
            </p>
          </div>

          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-300">
            Al aprobar se crea un usuario en el sistema con esta contraseña inicial. El miembro la podrá cambiar después.
          </div>
        </div>
      </Modal>

      {/* Credentials Reveal Modal — shown once after a successful approval */}
      <Modal
        isOpen={showPasswordReveal}
        onClose={() => { setShowPasswordReveal(false); setCreatedMember(null); }}
        title="Solicitud Aprobada"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
              <CheckCircle size={32} className="text-green-400" />
            </div>
          </div>

          <div className="text-center">
            <p className="text-lg font-semibold">{createdMember?.name}</p>
            <p className="text-gray-400">fue aprobado y ya tiene cuenta de acceso</p>
          </div>

          <div className="bg-neutral-800/50 rounded-xl p-4 space-y-3">
            <div>
              <p className="text-xs text-gray-400">Email</p>
              <p className="font-medium">{createdMember?.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Contraseña inicial</p>
              <div className="flex items-center gap-2">
                <p className="flex-1 font-medium font-mono bg-neutral-900 px-3 py-2 rounded-lg break-all">
                  {createdMember?.password}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigator.clipboard.writeText(createdMember?.password || '')}
                >
                  Copiar
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-sm text-yellow-300">
            <strong>Importante:</strong> compartí la contraseña por un canal seguro. Después de cerrar este aviso ya no la vas a poder ver de nuevo.
          </div>

          <Button onClick={() => { setShowPasswordReveal(false); setCreatedMember(null); }} className="w-full">
            Entendido
          </Button>
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
