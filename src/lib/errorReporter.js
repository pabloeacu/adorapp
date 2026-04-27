// Error reporter — pipes uncaught client errors to the log-error edge function.
//
// Strategy:
//   - install() wires window.onerror, window.onunhandledrejection, and exports
//     reportError() for explicit calls (e.g. ErrorBoundary).
//   - The endpoint is verify_jwt:false (anon-callable) so we can capture
//     errors even when the user is not logged in.
//   - We rate-limit by message hash to avoid flooding the table on a tight
//     render loop that throws every frame.

import { supabase } from './supabase';

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5; // same error key allowed at most 5x/min
const seen = new Map(); // key -> { count, firstAt }

function shouldSend(key) {
  const now = Date.now();
  const entry = seen.get(key);
  if (!entry || now - entry.firstAt > RATE_LIMIT_WINDOW_MS) {
    seen.set(key, { count: 1, firstAt: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX;
}

export async function reportError(payload) {
  try {
    const body = {
      message: String(payload.message || 'Unknown error').slice(0, 8000),
      stack: payload.stack ? String(payload.stack).slice(0, 8000) : undefined,
      componentStack: payload.componentStack ? String(payload.componentStack).slice(0, 8000) : undefined,
      url: typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined,
      severity: payload.severity || 'error',
      context: payload.context || {},
    };

    const key = (body.message + '|' + (body.stack?.split('\n')[0] || '')).slice(0, 200);
    if (!shouldSend(key)) return;

    // supabase.functions.invoke attaches the user JWT automatically when present.
    await supabase.functions.invoke('log-error', { body });
  } catch {
    // Logging failures are not user-actionable; swallow them so they don't
    // re-trigger the global error handler (infinite loop risk).
  }
}

let installed = false;
export function installGlobalErrorReporter() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    if (!event) return;
    reportError({
      message: event.message || event.error?.message || 'window.onerror',
      stack: event.error?.stack,
      severity: 'error',
      context: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    reportError({
      message:
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'Unhandled promise rejection',
      stack: reason instanceof Error ? reason.stack : undefined,
      severity: 'error',
      context: { kind: 'unhandledrejection' },
    });
  });
}
