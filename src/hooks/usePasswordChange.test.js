import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mockeamos supabase para no tocar auth de verdad. updateUser se controla por test.
const updateUser = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { updateUser: (...a) => updateUser(...a) } },
}));

import { usePasswordChange } from './usePasswordChange';

// Fija el CONTRATO del hook compartido que reemplaza la lógica que estaba
// duplicada verbatim en Header.jsx y MobileNav.jsx: mismo orden de validación,
// mismos códigos de error, limpieza de campos y updateUser una sola vez.
describe('usePasswordChange', () => {
  beforeEach(() => {
    updateUser.mockReset();
  });

  const setup = () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();
    const { result } = renderHook(() => usePasswordChange({ onError, onSuccess }));
    return { result, onError, onSuccess };
  };

  it('vacío → onError("empty") y NO llama updateUser', async () => {
    const { result, onError, onSuccess } = setup();
    act(() => result.current.setNewPassword('   ')); // solo espacios = vacío
    await act(async () => { await result.current.submit(); });
    expect(onError).toHaveBeenCalledWith('empty');
    expect(updateUser).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('menos de 6 → onError("short")', async () => {
    const { result, onError } = setup();
    act(() => result.current.setNewPassword('abc'));
    await act(async () => { await result.current.submit(); });
    expect(onError).toHaveBeenCalledWith('short');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('no coinciden → onError("mismatch")', async () => {
    const { result, onError } = setup();
    act(() => {
      result.current.setNewPassword('secreto1');
      result.current.setConfirmPassword('secreto2');
    });
    await act(async () => { await result.current.submit(); });
    expect(onError).toHaveBeenCalledWith('mismatch');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('válido → updateUser una vez, limpia campos, onSuccess', async () => {
    updateUser.mockResolvedValue({ error: null });
    const { result, onError, onSuccess } = setup();
    act(() => {
      result.current.setNewPassword('secreto123');
      result.current.setConfirmPassword('secreto123');
      result.current.setShowNew(true);
      result.current.setShowConfirm(true);
    });
    await act(async () => { await result.current.submit(); });
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({ password: 'secreto123' });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    // reset(): campos y toggles vuelven a cero
    expect(result.current.newPassword).toBe('');
    expect(result.current.confirmPassword).toBe('');
    expect(result.current.showNew).toBe(false);
    expect(result.current.showConfirm).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it('updateUser devuelve error → onError("failed"), sin onSuccess, saving vuelve a false', async () => {
    updateUser.mockResolvedValue({ error: new Error('nope') });
    const { result, onError, onSuccess } = setup();
    act(() => {
      result.current.setNewPassword('secreto123');
      result.current.setConfirmPassword('secreto123');
    });
    await act(async () => { await result.current.submit(); });
    expect(onError).toHaveBeenCalledWith('failed');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.saving).toBe(false);
    // los campos NO se limpian ante error (el usuario reintenta)
    expect(result.current.newPassword).toBe('secreto123');
  });

  it('updateUser lanza (excepción de red) → onError("failed")', async () => {
    updateUser.mockRejectedValue(new Error('red caída'));
    const { result, onError } = setup();
    act(() => {
      result.current.setNewPassword('secreto123');
      result.current.setConfirmPassword('secreto123');
    });
    await act(async () => { await result.current.submit(); });
    expect(onError).toHaveBeenCalledWith('failed');
    expect(result.current.saving).toBe(false);
  });
});
