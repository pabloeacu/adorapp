import { useState } from 'react';
import { supabase } from '../lib/supabase';

// Lógica COMPARTIDA de "cambiar mi contraseña" (estado + validación + updateUser),
// que estaba duplicada casi verbatim en Header.jsx (escritorio) y MobileNav.jsx
// (celular). Cada pantalla conserva su propio formulario, su chrome (Modal vs
// hoja) y su COPY de avisos: el hook no decide textos, sólo emite un CÓDIGO de
// error y cada pantalla lo mapea a su título/mensaje.
//
// onError(code)  → code ∈ 'empty' | 'short' | 'mismatch' | 'failed'
// onSuccess()    → se cambió la contraseña correctamente (los campos ya se limpiaron)
export function usePasswordChange({ onError, onSuccess }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setNewPassword('');
    setConfirmPassword('');
    setShowNew(false);
    setShowConfirm(false);
  };

  const submit = async () => {
    if (!newPassword.trim()) return onError('empty');
    if (newPassword.length < 6) return onError('short');
    if (newPassword !== confirmPassword) return onError('mismatch');
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      reset();
      onSuccess();
    } catch (err) {
      console.error('Error changing password:', err);
      onError('failed');
    } finally {
      setSaving(false);
    }
  };

  return {
    newPassword, setNewPassword,
    confirmPassword, setConfirmPassword,
    showNew, setShowNew,
    showConfirm, setShowConfirm,
    saving, submit, reset,
  };
}
