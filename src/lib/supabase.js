import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Set them in .env.local for local dev or as Vercel env vars for production.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Invoke a Supabase Edge Function with the current user's JWT.
 * Pastor-only admin operations (create member, reset password, approve registration, etc.)
 * live in edge functions that verify the caller's role server-side.
 *
 * Returns { data } on success or { error: <human message> } on failure.
 * Never throws — callers should check for `error`.
 */
export async function callAdminFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    let detail = error.message || 'Unknown error';
    try {
      if (error.context && typeof error.context.json === 'function') {
        const parsed = await error.context.json();
        detail = parsed?.error || parsed?.detail || detail;
      }
    } catch {
      // ignore parse errors, keep the original message
    }
    return { error: detail };
  }

  if (data && data.error) return { error: data.error };
  return { data };
}
