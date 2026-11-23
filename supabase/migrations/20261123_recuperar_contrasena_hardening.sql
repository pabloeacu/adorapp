-- =============================================================================
-- Recuperar contraseña — HARDENING (defensa en profundidad) + poda
-- -----------------------------------------------------------------------------
-- La migración 20261123_recuperar_contrasena.sql dejó el circuito vivo con la guarda
-- de rol ADENTRO de las RPCs (42501 para anon/authenticated, verificado en vivo).
-- Acá se suma lo que requiere sentencias que el MCP de Supabase pide confirmar
-- (REVOKE / DELETE / DROP): el REVOKE explícito de EXECUTE (landmine #106), la poda
-- a 90 días y la limpieza de un helper de prueba.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.password_reset_gate(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.password_reset_gate(text, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.password_reset_mark(bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.password_reset_mark(bigint, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.password_reset_complete(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.password_reset_complete(uuid) TO service_role;

DROP FUNCTION IF EXISTS public._qa_noop();

-- Poda (retención 90 días, igual que el resto de los logs técnicos). Mismo cuerpo que la
-- versión vigente + la tabla nueva. Se re-asertan los grants (landmine #39).
CREATE OR REPLACE FUNCTION public.purge_technical_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  DELETE FROM public.health_checks WHERE checked_at < now() - interval '90 days';
  DELETE FROM public.email_queue WHERE status IN ('sent','failed') AND created_at < now() - interval '90 days';
  DELETE FROM public.sent_emails WHERE created_at < now() - interval '90 days';
  DELETE FROM public.error_log WHERE occurred_at < now() - interval '90 days';
  DELETE FROM public.admin_action_events WHERE at < now() - interval '1 day';
  DELETE FROM public.event_staff_hits WHERE at < now() - interval '30 days';
  DELETE FROM private.password_reset_requests WHERE created_at < now() - interval '90 days';
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.error_log (message, severity, context)
    VALUES ('purge_technical_logs: fallo', 'error', jsonb_build_object('error', SQLERRM));
  EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.purge_technical_logs() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_technical_logs() TO service_role;
