import { describe, it, expect, beforeEach, vi } from 'vitest';

// El reporter manda errores del cliente a la EF log-error. Dos propiedades caras
// de romper y relevantes a seguridad/robustez:
//   1) Rate-limit por clave (5/min) → un loop de render que tira error en cada
//      frame NO inunda error_log (anti-DoS de la tabla).
//   2) Truncado a 8000 chars de message/stack/componentStack → no se desborda la
//      fila (protege la base y el rate-limit de la EF).
// Cada caso usa una CLAVE distinta (message distinto) para no chocar con el
// contador de rate-limit, que vive en un Map a nivel de módulo.

const invoke = vi.hoisted(() => vi.fn(async () => ({ data: {}, error: null })));
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }));

import { reportError } from './errorReporter';

const lastBody = () => invoke.mock.calls.at(-1)[1].body;

describe('errorReporter.reportError', () => {
  beforeEach(() => { invoke.mockClear(); invoke.mockResolvedValue({ data: {}, error: null }); });

  it('trunca message/stack/componentStack a 8000 caracteres', async () => {
    await reportError({
      message: 'A'.repeat(20000), stack: 'B'.repeat(20000), componentStack: 'C'.repeat(20000),
    });
    const body = lastBody();
    expect(body.message.length).toBe(8000);
    expect(body.stack.length).toBe(8000);
    expect(body.componentStack.length).toBe(8000);
  });

  it('aplica defaults: message "Unknown error", severity "error", context {}', async () => {
    await reportError({ message: undefined, severity: undefined, context: undefined, stack: undefined });
    const body = lastBody();
    expect(body.message).toBe('Unknown error');
    expect(body.severity).toBe('error');
    expect(body.context).toEqual({});
    expect(body.stack).toBeUndefined();
  });

  it('conserva severity/context explícitos', async () => {
    await reportError({ message: 'con-contexto', severity: 'warning', context: { kind: 'x' } });
    const body = lastBody();
    expect(body.severity).toBe('warning');
    expect(body.context).toEqual({ kind: 'x' });
  });

  it('rate-limit: la MISMA clave se envía como máximo 5 veces por minuto (la 6ta y 7ma se suprimen)', async () => {
    const p = { message: 'clave-rate-limit-fija' };
    for (let i = 0; i < 7; i++) await reportError(p);
    expect(invoke).toHaveBeenCalledTimes(5);
  });

  it('rate-limit: la ventana se reinicia pasado 1 minuto', async () => {
    const nowSpy = vi.spyOn(Date, 'now');
    let t = 1_000_000;
    nowSpy.mockImplementation(() => t);
    const p = { message: 'clave-ventana' };
    for (let i = 0; i < 6; i++) await reportError(p); // 5 enviados, 6to suprimido
    expect(invoke).toHaveBeenCalledTimes(5);
    t += 61_000; // pasó >60 s → ventana nueva
    await reportError(p);
    expect(invoke).toHaveBeenCalledTimes(6);
    nowSpy.mockRestore();
  });

  it('claves DISTINTAS tienen contadores independientes', async () => {
    await reportError({ message: 'clave-independiente-A' });
    await reportError({ message: 'clave-independiente-B' });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('si la EF falla, reportError NO lanza (swallow: evita re-disparar el handler global)', async () => {
    invoke.mockRejectedValueOnce(new Error('network down'));
    let threw = false;
    try { await reportError({ message: 'clave-swallow' }); } catch { threw = true; }
    expect(threw).toBe(false);
  });
});
