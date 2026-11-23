import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, Loader2, ShieldCheck, CheckCircle2, Circle, LinkIcon, ArrowRight, Smartphone } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { AuthShell, AuthField, AuthPrimaryButton, AuthSecondaryButton } from '../components/auth/AuthShell';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { PASSWORD_RULES, passwordProblem, passwordMessage, PASSWORD_MAX } from '../lib/passwordPolicy';
import { parseResetToken, readResetToken, completePasswordReset, resetMessage } from '../lib/passwordReset';

// Paso 2 del circuito "Olvidé mi contraseña" (/restablecer?th=<token>).
// El token se lee del enlace al montar y se saca de la barra de direcciones; se consume
// RECIÉN al tocar "Guardar" (así un escáner de enlaces del correo no lo gasta). Al
// guardar, la EF devuelve la sesión y la persona queda adentro de la app.

const EyeToggle = ({ shown, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'}
    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
  >
    {shown ? <EyeOff size={18} /> : <Eye size={18} />}
  </button>
);

export const RestablecerContrasena = () => {
  useDocumentTitle('Nueva contraseña');
  const navigate = useNavigate();

  // Token: se parsea de la URL al primer render (idempotente) y se quita de la barra en
  // un efecto (una sola vez). Sin token válido → pantalla "enlace inválido".
  const [token] = useState(() => (typeof window !== 'undefined' ? parseResetToken(window.location.search) : ''));
  useEffect(() => { readResetToken(); }, []);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState(token ? 'form' : 'invalid'); // form | invalid | done
  const [doneEmail, setDoneEmail] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  const rulesState = PASSWORD_RULES.map((r) => ({ ...r, ok: r.test(password) }));
  const allRulesOk = rulesState.every((r) => r.ok);
  const matches = confirm.length > 0 && confirm === password;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (saving) return;
    const problem = passwordProblem(password);
    if (problem) { setError(passwordMessage(problem)); return; }
    if (password !== confirm) { setError(passwordMessage('distinta')); return; }
    setError('');
    setSaving(true);
    const res = await completePasswordReset(token, password);
    if (!res.ok) {
      setSaving(false);
      if (res.code === 'enlace_invalido') { setPhase('invalid'); return; }
      if (res.code === 'contrasena_debil') { setError(passwordMessage(res.detail) || resetMessage(res.code)); return; }
      setError(resetMessage(res.code));
      return;
    }
    // Sesión nueva → la persona queda adentro (mismo camino que login: user + ficha).
    let ok = false;
    try {
      const { data, error: sErr } = await supabase.auth.setSession({
        access_token: res.session?.access_token,
        refresh_token: res.session?.refresh_token,
      });
      const user = !sErr ? data?.session?.user : null;
      if (user) {
        useAuthStore.setState({ user, loading: true, error: null });
        await useAuthStore.getState().bootProfile(user.id);
        ok = true;
      }
    } catch { /* si no se pudo abrir la sesión, igual se cambió la contraseña */ }
    setLoggedIn(ok);
    setDoneEmail(res.email || '');
    setSaving(false);
    setPhase('done');
  };

  const footer = (
    <div className="mt-5 text-center">
      <Link to="/login" className="text-sm text-gray-400 hover:text-gold-200 transition-colors">Volver al ingreso</Link>
    </div>
  );

  if (phase === 'invalid') {
    return (
      <AuthShell title="Este enlace ya no sirve" footer={footer} testId="restablecer-invalid">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-neutral-800 ring-1 ring-neutral-700 rounded-full flex items-center justify-center mx-auto">
            <LinkIcon size={34} className="text-gray-400" />
          </div>
          <p className="text-gray-300 text-sm leading-relaxed">
            {resetMessage('enlace_invalido')} Los enlaces valen 60 minutos y sirven una sola vez.
          </p>
          <Link
            to="/recuperar"
            className="w-full py-3 bg-gold-gradient text-black font-semibold rounded-xl hover:brightness-110 shadow-[0_2px_14px_-3px_rgba(212,175,55,0.45)] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            data-testid="restablecer-again"
          >
            Pedir un enlace nuevo <ArrowRight size={18} />
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (phase === 'done') {
    return (
      <AuthShell title="¡Listo!" testId="restablecer-done">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-green-500/15 ring-1 ring-green-500/30 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck size={38} className="text-green-400" />
          </div>
          <p className="text-gray-200 text-sm leading-relaxed">
            Tu contraseña fue actualizada{doneEmail ? <> para <span className="font-medium text-white break-all">{doneEmail}</span></> : null}.
            Te enviamos un correo de confirmación y cerramos las demás sesiones abiertas de tu cuenta.
          </p>
          <div className="flex items-start gap-3 text-left rounded-xl border border-gold-500/20 bg-gold-500/[0.06] px-4 py-3">
            <Smartphone size={18} className="mt-0.5 shrink-0 text-gold-300" />
            <p className="text-sm text-gray-300 leading-relaxed">
              Si usás la <span className="text-white font-medium">app instalada</span> en tu teléfono, abrila e ingresá con tu contraseña nueva.
            </p>
          </div>
          {loggedIn ? (
            <AuthPrimaryButton type="button" onClick={() => navigate('/', { replace: true })} data-testid="restablecer-enter">
              Entrar a AdorAPP <ArrowRight size={18} />
            </AuthPrimaryButton>
          ) : (
            <AuthPrimaryButton type="button" onClick={() => navigate('/login', { replace: true })} data-testid="restablecer-enter">
              Ir al ingreso <ArrowRight size={18} />
            </AuthPrimaryButton>
          )}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Creá tu nueva contraseña" footer={footer} testId="restablecer-form">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AuthField
          icon={Lock}
          type={showPw ? 'text' : 'password'}
          name="new-password"
          placeholder="Nueva contraseña"
          value={password}
          maxLength={PASSWORD_MAX}
          onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
          autoComplete="new-password"
          autoFocus
          disabled={saving}
          data-testid="restablecer-password"
          right={<EyeToggle shown={showPw} onClick={() => setShowPw((v) => !v)} disabled={saving} />}
        />
        <AuthField
          icon={Lock}
          type={showPw ? 'text' : 'password'}
          name="confirm-password"
          placeholder="Repetí la contraseña"
          value={confirm}
          maxLength={PASSWORD_MAX}
          onChange={(e) => { setConfirm(e.target.value); if (error) setError(''); }}
          autoComplete="new-password"
          disabled={saving}
          data-testid="restablecer-confirm"
        />

        <ul className="space-y-1.5 rounded-xl border border-neutral-800 bg-neutral-950/60 px-4 py-3" data-testid="restablecer-rules">
          {rulesState.map((r) => (
            <li key={r.id} className={`flex items-center gap-2 text-xs ${r.ok ? 'text-green-300' : 'text-gray-500'}`} data-ok={r.ok ? '1' : '0'}>
              {r.ok ? <CheckCircle2 size={14} /> : <Circle size={14} />} {r.label}
            </li>
          ))}
          <li className={`flex items-center gap-2 text-xs ${matches ? 'text-green-300' : 'text-gray-500'}`} data-ok={matches ? '1' : '0'}>
            {matches ? <CheckCircle2 size={14} /> : <Circle size={14} />} Las dos contraseñas coinciden
          </li>
        </ul>

        {error && <p className="text-sm text-red-400 text-center" data-testid="restablecer-error">{error}</p>}

        <AuthPrimaryButton disabled={saving || !allRulesOk || !matches} data-testid="restablecer-submit">
          {saving && <Loader2 size={18} className="animate-spin" />}
          {saving ? 'Guardando…' : 'Guardar nueva contraseña'}
        </AuthPrimaryButton>
        <AuthSecondaryButton onClick={() => navigate('/recuperar')} disabled={saving} className="!py-2.5 text-sm">
          Pedir otro enlace
        </AuthSecondaryButton>
      </form>
    </AuthShell>
  );
};

export default RestablecerContrasena;
