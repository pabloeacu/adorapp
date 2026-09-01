-- ============================================================================
-- admin-update-member — soporte para cambiar el email de un miembro SIN romperlo.
--
-- Contexto: el email de un miembro es tres cosas a la vez → login (auth.users),
-- identidad de auth (auth.identities) y contacto (public.members). Además la app
-- matchea al usuario logueado con su ficha POR EMAIL (useCurrentMember /
-- authStore / Header: `m.email === user.email`), así que si esos valores divergen
-- el usuario queda sin ficha (sin rol, sin permisos). El formulario "Editar
-- Miembro" hacía solo `members.update`, desincronizando el login → footgun.
--
-- La Edge Function `admin-update-member` cambia el email por la Admin API
-- (updateUserById → sincroniza auth.users + auth.identities) y luego revoca las
-- sesiones del usuario para que su JWT no quede con el email viejo en los claims
-- hasta refrescar (ventana en la que el match rompería). Esta migración crea la
-- función que la EF usa para revocar sesiones (PostgREST/service_role no puede
-- tocar el schema auth vía `.from()`, así que va por un RPC SECURITY DEFINER).
-- ============================================================================

create or replace function public.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- auth.refresh_tokens.user_id es varchar; auth.sessions.user_id es uuid.
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions      where user_id = p_user_id;
  get diagnostics v_count = row_count;   -- sesiones borradas
  return v_count;
end;
$$;

-- Blindaje del RPC (mismo patrón que las otras funciones privilegiadas del repo):
-- nadie del lado público la ejecuta; solo el worker/EF con service_role.
revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

comment on function public.revoke_user_sessions(uuid) is
  'Revoca sesiones + refresh_tokens de un usuario (sign-out global). SECURITY DEFINER, search_path fijo, solo service_role. La usa la EF admin-update-member tras cambiar el email, para evitar la ventana en la que el JWT vivo lleva el email viejo (rompería el match user.email === members.email).';
