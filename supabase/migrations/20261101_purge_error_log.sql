-- ─────────────────────────────────────────────────────────────────────────────
-- Retención: sumar error_log al barrendero técnico (purge_technical_logs)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cierra un hallazgo de la auditoría adversarial del carril exprés: error_log era
-- la ÚNICA bitácora técnica sin poda (las demás —health_checks, email_queue,
-- sent_emails, admin_action_events, event_staff_hits— ya se podaban), así que crecía
-- sin límite. Hoy es minúscula (59 filas), pero en una plataforma que vive años una
-- tabla sin poda se acumula indefinidamente.
--
-- Mismo criterio de 90 días que las otras bitácoras de su clase. Aplica a TODAS las
-- filas por antigüedad (no se conservan las no-resueltas: a los 90 días son obsoletas
-- para el diagnóstico — si el problema sigue vivo, re-loguea reciente y eso se conserva;
-- el monitor check_system_health y el panel /salud miran una ventana reciente, no 90d).
-- error_log NO contiene datos del ministerio (canciones/órdenes/miembros/correos): son
-- apuntes técnicos de diagnóstico.
--
-- CREATE OR REPLACE con el cuerpo idéntico al vigente + UNA línea (DELETE de error_log),
-- verificado contra pg_get_functiondef. No cambia el resto (SECURITY DEFINER, search_path,
-- EXCEPTION best-effort, grants). El cron technical-logs-purge (jobid 19, 05:00 ART) ya
-- lo ejecuta a diario: desde la próxima corrida poda también error_log.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_technical_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  DELETE FROM public.health_checks WHERE checked_at < now() - interval '90 days';
  DELETE FROM public.email_queue WHERE status IN ('sent','failed') AND created_at < now() - interval '90 days';
  DELETE FROM public.sent_emails WHERE created_at < now() - interval '90 days';
  DELETE FROM public.error_log WHERE occurred_at < now() - interval '90 days';
  DELETE FROM public.admin_action_events WHERE at < now() - interval '1 day';
  DELETE FROM public.event_staff_hits WHERE at < now() - interval '30 days';
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.error_log (message, severity, context)
    VALUES ('purge_technical_logs: fallo', 'error', jsonb_build_object('error', SQLERRM));
  EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$$;
