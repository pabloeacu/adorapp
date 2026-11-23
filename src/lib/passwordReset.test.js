import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) } } }));

const mod = await import('./passwordReset');
const { parseResetToken, readResetToken, requestPasswordReset, completePasswordReset, resetMessage } = mod;

const TOKEN = 'a'.repeat(40);

describe('token del enlace (?th=)', () => {
  it('lee un token con forma válida y rechaza basura', () => {
    expect(parseResetToken(`?th=${TOKEN}`)).toBe(TOKEN);
    expect(parseResetToken(`?x=1&th=${TOKEN}&y=2`)).toBe(TOKEN);
    expect(parseResetToken('?th=corto')).toBe('');
    expect(parseResetToken('?th=<script>alert(1)</script>')).toBe('');
    expect(parseResetToken(`?th=${'z'.repeat(300)}`)).toBe('');
    expect(parseResetToken('')).toBe('');
    expect(parseResetToken(null)).toBe('');
  });
  it('readResetToken devuelve el token y lo saca de la barra de direcciones', () => {
    const replaceState = vi.fn();
    const win = { location: { search: `?th=${TOKEN}`, pathname: '/restablecer' }, history: { state: null, replaceState } };
    expect(readResetToken(win)).toBe(TOKEN);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/restablecer');
  });
  it('sin token no toca el historial', () => {
    const replaceState = vi.fn();
    expect(readResetToken({ location: { search: '', pathname: '/restablecer' }, history: { replaceState } })).toBe('');
    expect(replaceState).not.toHaveBeenCalled();
  });
});

describe('llamadas a la Edge Function', () => {
  beforeEach(() => { invoke.mockReset(); });

  it('request: normaliza el correo y devuelve ok', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const res = await requestPasswordReset('  Juan.C.Sosa1988@Gmail.com ');
    expect(res.ok).toBe(true);
    expect(invoke).toHaveBeenCalledWith('auth-password-reset', { body: { action: 'request', email: 'juan.c.sosa1988@gmail.com' } });
  });

  it('complete: pasa token y contraseña y devuelve la sesión', async () => {
    invoke.mockResolvedValue({ data: { ok: true, email: 'x@y.z', session: { access_token: 'a', refresh_token: 'r' } }, error: null });
    const res = await completePasswordReset(TOKEN, 'adoracion2026');
    expect(res.ok).toBe(true);
    expect(res.session.refresh_token).toBe('r');
    expect(invoke).toHaveBeenCalledWith('auth-password-reset', { body: { action: 'complete', token_hash: TOKEN, password: 'adoracion2026' } });
  });

  it('mapea un error HTTP con cuerpo JSON al código de la EF', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: { status: 400, json: async () => ({ ok: false, code: 'enlace_invalido' }) } } });
    const res = await completePasswordReset(TOKEN, 'adoracion2026');
    expect(res).toMatchObject({ ok: false, code: 'enlace_invalido' });
    expect(resetMessage(res.code)).toMatch(/venció o ya fue usado/);
  });

  it('mapea 429 sin cuerpo a rate_limited y fallos de red a error', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: { status: 429, json: async () => { throw new Error('no json'); } } } });
    expect((await requestPasswordReset('a@b.co')).code).toBe('rate_limited');
    invoke.mockRejectedValue(new Error('boom'));
    expect((await requestPasswordReset('a@b.co')).code).toBe('error');
    expect(resetMessage('lo-que-sea')).toBe(resetMessage('error'));
  });

  it('con data.ok=false devuelve el código del cuerpo', async () => {
    invoke.mockResolvedValue({ data: { ok: false, code: 'cuenta_desactivada' }, error: null });
    expect((await completePasswordReset(TOKEN, 'adoracion2026')).code).toBe('cuenta_desactivada');
  });
});
