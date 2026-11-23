// Circuito "Olvidé mi contraseña" — lado cliente (puro salvo las dos llamadas a la EF).
//
//   /recuperar   → requestPasswordReset(email)              → EF action=request
//   /restablecer → completePasswordReset(tokenHash, pass)   → EF action=complete
//
// La EF `auth-password-reset` corre sin sesión (quien la usa no puede entrar). El token
// viaja SOLO en el enlace del correo (`?th=`) y se consume recién al tocar "Guardar":
// la pantalla lo lee al montar y lo saca de la barra de direcciones (readResetToken).
import { supabase } from './supabase';

export const RESET_TOKEN_PARAM = 'th';
export const RESET_LINK_MINUTES = 60;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,255}$/;

// Mensajes por código de la EF (y de red). La EF nunca confirma si un correo existe.
export const RESET_MESSAGES = {
  enlace_invalido: 'Este enlace venció o ya fue usado. Pedí uno nuevo y volvé a intentar.',
  cuenta_desactivada: 'Tu cuenta está desactivada. Si creés que es un error, hablá con un pastor.',
  misma_contrasena: 'La contraseña nueva tiene que ser distinta a la anterior.',
  contrasena_debil: 'Elegí una contraseña más segura (mínimo 8 caracteres, con letras y números).',
  rate_limited: 'Hiciste demasiados intentos seguidos. Esperá un minuto y probá de nuevo.',
  email_invalido: 'Escribí un correo válido.',
  offline: 'Parece que no tenés conexión. Revisá internet y volvé a intentar.',
  error: 'No pudimos completar el pedido. Probá de nuevo en unos segundos.',
};

export const resetMessage = (code) => RESET_MESSAGES[code] || RESET_MESSAGES.error;

// Lee el token del enlace (`?th=`) y devuelve '' si falta o no tiene forma válida.
export const parseResetToken = (search) => {
  try {
    const raw = new URLSearchParams(search || '').get(RESET_TOKEN_PARAM) || '';
    const t = raw.trim();
    return TOKEN_RE.test(t) ? t : '';
  } catch {
    return '';
  }
};

// Lee el token de la URL actual y lo QUITA de la barra de direcciones (sin recargar), para
// que no quede en el historial, en capturas ni en el referer de ningún enlace posterior.
export const readResetToken = (win = typeof window !== 'undefined' ? window : null) => {
  if (!win?.location) return '';
  const token = parseResetToken(win.location.search);
  try {
    if (win.location.search && win.history?.replaceState) {
      win.history.replaceState(win.history.state, '', win.location.pathname);
    }
  } catch { /* noop */ }
  return token;
};

// Normaliza la respuesta de supabase.functions.invoke a { ok, code, ...data }.
async function invokeReset(body) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, code: 'offline' };
  try {
    const { data, error } = await supabase.functions.invoke('auth-password-reset', { body });
    if (error) {
      let parsed = null;
      try {
        if (error.context && typeof error.context.json === 'function') parsed = await error.context.json();
      } catch { /* sin cuerpo JSON */ }
      const status = error.context?.status;
      if (parsed && typeof parsed === 'object') return { ok: false, code: parsed.code || 'error', detail: parsed.detail, status };
      if (status === 429) return { ok: false, code: 'rate_limited', status };
      return { ok: false, code: 'error', status };
    }
    if (!data || typeof data !== 'object') return { ok: false, code: 'error' };
    return data.ok ? { ok: true, ...data } : { ok: false, code: data.code || 'error', detail: data.detail };
  } catch {
    return { ok: false, code: 'error' };
  }
}

// Paso 1: pedir el enlace. Siempre que el correo tenga forma válida la respuesta es
// { ok:true } (la EF no revela si existe); el cliente muestra el mismo mensaje.
export const requestPasswordReset = (email) =>
  invokeReset({ action: 'request', email: String(email || '').trim().toLowerCase() });

// Paso 2: fijar la contraseña nueva con el token del correo.
// Éxito → { ok:true, email, session:{access_token, refresh_token} }.
export const completePasswordReset = (tokenHash, password) =>
  invokeReset({ action: 'complete', token_hash: tokenHash, password });
