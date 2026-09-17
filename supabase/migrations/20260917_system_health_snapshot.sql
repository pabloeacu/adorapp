-- Panel "Salud del sistema" (solo pastor, solo lectura).
--
-- Un único RPC de LECTURA que arma una foto del estado del sistema para que el
-- pastor la vea de un vistazo. Espeja EXACTO las 4 señales del monitor
-- check_system_health (correo fallido / correo atascado / cron fallido / error
-- serio nuevo) para que el panel y las alertas nunca se contradigan, y agrega
-- lo lindo de solo-lectura: el último chequeo del sitio, el latido del worker
-- de correo y el último correo enviado.
--
-- Seguridad: SECURITY DEFINER con gate is_pastor() adentro (defensa en
-- profundidad además del route-guard del cliente). NO escribe nada -> no puede
-- romper ni spamear. Un no-pastor (o anon) recibe 42501.

CREATE OR REPLACE FUNCTION public.system_health_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_mail_failed int; v_mail_stuck int; v_mail_pending int; v_last_sent timestamptz;
  v_worker_last timestamptz;
  v_cron_failed int; v_cron_active int;
  v_site record;
  v_err_serious int; v_err_latest record;
  v_mail_status text; v_cron_status text; v_site_status text; v_err_status text;
  v_overall text;
BEGIN
  -- Gate: sólo pastores. auth.uid() se lee del JWT aunque la función sea DEFINER.
  -- COALESCE OBLIGATORIO (landmine #71): is_pastor() devuelve NULL (no false) cuando
  -- no hay usuario válido / ficha inactiva; sin COALESCE, `IF NOT NULL` no dispara el
  -- RAISE y la función DEVUELVE datos a un identity sin ficha. Verificado en QA.
  IF NOT COALESCE(public.is_pastor(), false) THEN
    RAISE EXCEPTION 'no_autorizado' USING ERRCODE = '42501';
  END IF;

  -- (1) Correos fallidos en 24 h (espeja check_system_health).
  SELECT count(*) INTO v_mail_failed FROM public.email_queue
    WHERE status = 'failed' AND created_at > v_now - interval '24 hours';
  -- (2) Correos atascados sin enviarse (>1 h).
  SELECT count(*) INTO v_mail_stuck FROM public.email_queue
    WHERE status = 'pending' AND created_at < v_now - interval '1 hour';
  -- Info: cuántos hay en cola ahora y cuándo salió el último correo.
  SELECT count(*) INTO v_mail_pending FROM public.email_queue WHERE status = 'pending';
  SELECT max(created_at) INTO v_last_sent FROM public.sent_emails;
  -- Info: latido del worker que envía TODO el correo (cron send-emails-worker).
  SELECT max(d.start_time) INTO v_worker_last
    FROM cron.job_run_details d
    JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'send-emails-worker' AND d.status = 'succeeded';

  -- (3) Corridas de tareas automáticas fallidas en 24 h.
  SELECT count(*) INTO v_cron_failed FROM cron.job_run_details
    WHERE status = 'failed' AND start_time > v_now - interval '24 hours';
  SELECT count(*) INTO v_cron_active FROM cron.job WHERE active;

  -- Sitio: último chequeo del ping de GitHub (health_checks).
  SELECT ok, checked_at, status_code, response_time_ms INTO v_site
    FROM public.health_checks ORDER BY checked_at DESC LIMIT 1;

  -- (4) Errores serios nuevos en 24 h (mismo filtro que el monitor: excluye el
  --     ruido benigno de chunk viejo tras un deploy).
  SELECT count(*) INTO v_err_serious FROM public.error_log
    WHERE severity IN ('error', 'fatal')
      AND occurred_at > v_now - interval '24 hours'
      AND COALESCE(resolved, false) = false
      AND COALESCE(context->>'kind', '') <> 'stale-chunk'
      AND message NOT ILIKE '%Importing a module script failed%'
      AND message NOT ILIKE '%Script error%';
  SELECT left(message, 140) AS message, occurred_at, severity INTO v_err_latest
    FROM public.error_log
    WHERE severity IN ('error', 'fatal')
      AND occurred_at > v_now - interval '24 hours'
      AND COALESCE(resolved, false) = false
      AND COALESCE(context->>'kind', '') <> 'stale-chunk'
      AND message NOT ILIKE '%Importing a module script failed%'
      AND message NOT ILIKE '%Script error%'
    ORDER BY occurred_at DESC LIMIT 1;

  -- Estados por señal (los decide el servidor: fuente única, espeja el monitor).
  v_mail_status := CASE WHEN v_mail_failed > 0 OR v_mail_stuck > 0 THEN 'warn' ELSE 'ok' END;
  v_cron_status := CASE WHEN v_cron_failed > 0 THEN 'warn' ELSE 'ok' END;
  -- Un chequeo viejo (>12 h) = el ping se detuvo -> 'unknown' (no 'ok' engañoso).
  -- No dispara 'warn' general: la caída real la cubre UptimeRobot (externo). El
  -- ping de GitHub corre irregular (cada 3-5 h), por eso el umbral es holgado.
  v_site_status := CASE WHEN v_site.checked_at IS NULL THEN 'unknown'
                        WHEN v_site.checked_at < v_now - interval '12 hours' THEN 'unknown'
                        WHEN v_site.ok THEN 'ok' ELSE 'warn' END;
  v_err_status  := CASE WHEN v_err_serious > 0 THEN 'warn' ELSE 'ok' END;
  v_overall     := CASE WHEN 'warn' IN (v_mail_status, v_cron_status, v_site_status, v_err_status)
                        THEN 'warn' ELSE 'ok' END;

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'overall', v_overall,
    'mail', jsonb_build_object(
      'failed_24h', v_mail_failed,
      'stuck_1h', v_mail_stuck,
      'pending_now', v_mail_pending,
      'last_sent_at', v_last_sent,
      'worker_last_run', v_worker_last,
      'status', v_mail_status),
    'crons', jsonb_build_object(
      'active', v_cron_active,
      'failed_24h', v_cron_failed,
      'status', v_cron_status),
    'site', jsonb_build_object(
      'ok', v_site.ok,
      'checked_at', v_site.checked_at,
      'status_code', v_site.status_code,
      'response_time_ms', v_site.response_time_ms,
      'status', v_site_status),
    'errors', jsonb_build_object(
      'serious_24h', v_err_serious,
      'latest', CASE WHEN v_err_latest.occurred_at IS NULL THEN NULL
                     ELSE jsonb_build_object(
                       'message', v_err_latest.message,
                       'occurred_at', v_err_latest.occurred_at,
                       'severity', v_err_latest.severity) END,
      'status', v_err_status)
  );
END;
$function$;

-- Solo pastores (gate interno); el cliente lo llama como authenticated.
REVOKE ALL ON FUNCTION public.system_health_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.system_health_snapshot() TO authenticated;
