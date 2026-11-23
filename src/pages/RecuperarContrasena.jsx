import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Mail, Loader2, MailCheck, ArrowLeft, KeyRound } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { AuthShell, AuthField, AuthPrimaryButton, AuthSecondaryButton } from '../components/auth/AuthShell';
import { requestPasswordReset, resetMessage, RESET_LINK_MINUTES } from '../lib/passwordReset';

// Paso 1 del circuito "Olvidé mi contraseña" (/recuperar).
// Pide el correo y dispara el enlace. La respuesta es SIEMPRE la misma ("si ese correo
// está registrado, te enviamos un enlace") — anti-enumeración; la EF decide en silencio.
// Reenviar queda disponible tras un breve conteo (el freno firme vive en la base).

const RESEND_SECONDS = 45;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const RecuperarContrasena = () => {
  useDocumentTitle('Recuperar contraseña');
  const location = useLocation();
  const prefill = useMemo(() => {
    try {
      const q = new URLSearchParams(location.search).get('email') || '';
      return q || localStorage.getItem('rememberedEmail') || '';
    } catch {
      return '';
    }
  }, [location.search]);

  const [email, setEmail] = useState(prefill);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (sending || cooldown > 0) return;
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError(resetMessage('email_invalido'));
      return;
    }
    setError('');
    setSending(true);
    const res = await requestPasswordReset(clean);
    setSending(false);
    if (res.ok) {
      setSentTo(clean);
      setCooldown(RESEND_SECONDS);
    } else {
      setError(resetMessage(res.code));
    }
  };

  const footer = (
    <div className="mt-5 text-center">
      <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gold-200 transition-colors">
        <ArrowLeft size={16} /> Volver al ingreso
      </Link>
    </div>
  );

  if (sentTo) {
    return (
      <AuthShell title="Revisá tu correo" footer={footer} testId="recuperar-sent">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-gold-500/15 ring-1 ring-gold-500/30 rounded-full flex items-center justify-center mx-auto">
            <MailCheck size={38} className="text-gold-300" />
          </div>
          <p className="text-gray-300 text-sm leading-relaxed">
            Si <span className="font-medium text-white break-all">{sentTo}</span> está registrado en AdorAPP,
            te enviamos un correo con el botón <span className="font-semibold text-gold-200">“Crear nueva contraseña”</span>.
          </p>
          <ul className="text-left text-sm text-gray-400 space-y-2 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
            <li>• El enlace vale por <span className="text-gray-200">{RESET_LINK_MINUTES} minutos</span> y sirve una sola vez.</li>
            <li>• Si no lo ves en un par de minutos, revisá <span className="text-gray-200">Spam</span> o <span className="text-gray-200">Promociones</span>.</li>
            <li>• Si no pediste esto, no hace falta hacer nada: tu contraseña sigue igual.</li>
          </ul>
          <AuthSecondaryButton onClick={submit} disabled={sending || cooldown > 0} data-testid="recuperar-resend">
            {sending ? <Loader2 size={18} className="animate-spin" /> : null}
            {cooldown > 0 ? `Reenviar en ${cooldown} s` : 'Reenviar el correo'}
          </AuthSecondaryButton>
          {error && <p className="text-sm text-red-400" data-testid="recuperar-error">{error}</p>}
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Recuperar contraseña" footer={footer} testId="recuperar-form">
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-gold-500/20 bg-gold-500/[0.06] px-4 py-3">
        <KeyRound size={18} className="mt-0.5 shrink-0 text-gold-300" />
        <p className="text-sm text-gray-300 leading-relaxed">
          Escribí el correo con el que entrás a AdorAPP y te mandamos un enlace para crear una contraseña nueva.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AuthField
          icon={Mail}
          type="email"
          name="email"
          placeholder="Tu correo"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
          autoComplete="username"
          autoFocus
          disabled={sending}
          data-testid="recuperar-email"
        />
        {error && <p className="text-sm text-red-400 text-center" data-testid="recuperar-error">{error}</p>}
        <AuthPrimaryButton disabled={sending} data-testid="recuperar-submit">
          {sending && <Loader2 size={18} className="animate-spin" />}
          {sending ? 'Enviando…' : 'Enviarme el enlace'}
        </AuthPrimaryButton>
      </form>
      <p className="mt-6 pt-6 border-t border-neutral-800 text-xs text-gray-500 text-center">
        ¿No recordás con qué correo te registraste? Preguntale a un pastor.
      </p>
    </AuthShell>
  );
};

export default RecuperarContrasena;
