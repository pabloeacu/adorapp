import React from 'react';
import { AlertTriangle, Trash2, Check, X } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  type = 'warning', // 'warning', 'danger', 'success'
  icon: Icon = AlertTriangle,
  loading = false
}) => {
  const typeStyles = {
    warning: {
      iconBg: 'bg-yellow-500/20',
      iconColor: 'text-yellow-400',
      confirmBtn: 'bg-yellow-600 hover:bg-yellow-500',
      borderColor: 'border-yellow-500/30'
    },
    danger: {
      iconBg: 'bg-red-500/20',
      iconColor: 'text-red-400',
      confirmBtn: 'bg-red-600 hover:bg-red-500',
      borderColor: 'border-red-500/30'
    },
    success: {
      iconBg: 'bg-green-500/20',
      iconColor: 'text-green-400',
      confirmBtn: 'bg-green-600 hover:bg-green-500',
      borderColor: 'border-green-500/30'
    }
  };

  const styles = typeStyles[type] || typeStyles.warning;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            className={styles.confirmBtn}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Eliminando...
              </span>
            ) : (
              confirmText
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Icon */}
        <div className="flex justify-center">
          <div className={`w-16 h-16 ${styles.iconBg} rounded-full flex items-center justify-center`}>
            <Icon size={32} className={styles.iconColor} />
          </div>
        </div>

        {/* Message */}
        <div className={`text-center p-4 rounded-xl border ${styles.borderColor} bg-neutral-800/30`}>
          <p className="text-gray-300">{message}</p>
        </div>
      </div>
    </Modal>
  );
};

export const SuccessModal = ({
  isOpen,
  onClose,
  title,
  message,
  icon: Icon = Check
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <Button onClick={onClose} className="w-full">
          Entendido
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
            <Icon size={32} className="text-green-400" />
          </div>
        </div>

        {/* Message */}
        <div className="text-center">
          <p className="text-gray-300">{message}</p>
        </div>
      </div>
    </Modal>
  );
};

export const ErrorModal = ({
  isOpen,
  onClose,
  title,
  message,
  icon: Icon = AlertTriangle
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose} className="w-full">
          Cerrar
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
            <Icon size={32} className="text-red-400" />
          </div>
        </div>

        {/* Message */}
        <div className="text-center">
          <p className="text-gray-300">{message}</p>
        </div>
      </div>
    </Modal>
  );
};