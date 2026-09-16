-- Fase 1 (observabilidad) · Freno de alertas del monitor POR TIPO de problema.
--
-- Antes: check_system_health usaba UN solo cupo diario global
-- ('system_health:<fecha>'): el primer problema del día reclamaba el cupo y
-- CUALQUIER otro problema distinto más tarde quedaba silenciado hasta el día
-- siguiente. Un aviso chico de la mañana podía tapar uno grave y distinto de la
-- tarde.
--
-- Ahora: cada una de las 4 señales (correos fallidos / correos atascados / crons
-- fallidos / errores serios) reclama su PROPIO cupo diario
-- ('system_health:<tipo>:<fecha>'). Si al menos una señal ACTIVA todavía no se
-- avisó hoy, se manda la alerta (con el resumen completo de lo que esté activo).
-- Si todas las señales activas ya se avisaron hoy, no se repite. Así un problema
-- nuevo nunca queda tapado por otro que ya avisamos, sin volver a spamear el mismo.
--
-- Cambio quirúrgico: sólo se toca la lógica del cupo (líneas del throttle). La
-- detección de señales, el fan-out a pastores (push + correo), los BEGIN/EXCEPTION
-- y el REVOKE quedan idénticos. QA transaccional con el trigger de push
-- deshabilitado y RAISE que revierte (landmine #84 — NUNCA llamarla en vivo).

CREATE OR REPLACE FUNCTION public.check_system_health(p_now timestamptz DEFAULT NULL)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz; v_fecha text; v_fecha_date text;
  v_problems text := ''; v_summary text := '';
  v_count int; v_new int := 0; v_c int; v_pastor record;
  v_t_failed boolean := false; v_t_stuck boolean := false;
  v_t_cron boolean := false; v_t_errors boolean := false;
BEGIN
  v_now := COALESCE(p_now, now());
  v_fecha := to_char((v_now AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'DD/MM/YYYY HH24:MI');
  v_fecha_date := to_char((v_now AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM-DD');

  SELECT count(*) INTO v_count FROM public.email_queue
    WHERE status='failed' AND created_at > v_now - interval '24 hours';
  IF v_count > 0 THEN
    v_t_failed := true;
    v_problems := v_problems || '• <strong>'||v_count||'</strong> correo(s) fallaron en las últimas 24 h.<br>';
    v_summary := v_summary || v_count || ' correo(s) fallidos. ';
  END IF;

  SELECT count(*) INTO v_count FROM public.email_queue
    WHERE status='pending' AND created_at < v_now - interval '1 hour';
  IF v_count > 0 THEN
    v_t_stuck := true;
    v_problems := v_problems || '• <strong>'||v_count||'</strong> correo(s) atascados sin enviarse (>1 h). El envío de correo podría estar caído.<br>';
    v_summary := v_summary || v_count || ' correo(s) atascados. ';
  END IF;

  SELECT count(*) INTO v_count FROM cron.job_run_details
    WHERE status='failed' AND start_time > v_now - interval '24 hours';
  IF v_count > 0 THEN
    v_t_cron := true;
    v_problems := v_problems || '• <strong>'||v_count||'</strong> corrida(s) de tareas automáticas fallaron en 24 h.<br>';
    v_summary := v_summary || v_count || ' cron(s) fallidos. ';
  END IF;

  SELECT count(*) INTO v_count FROM public.error_log
    WHERE severity IN ('error','fatal') AND occurred_at > v_now - interval '24 hours'
      AND COALESCE(resolved,false)=false AND COALESCE(context->>'kind','')<>'stale-chunk'
      AND message NOT ILIKE '%Importing a module script failed%' AND message NOT ILIKE '%Script error%';
  IF v_count > 0 THEN
    v_t_errors := true;
    v_problems := v_problems || '• <strong>'||v_count||'</strong> error(es) nuevos serios en 24 h (revisá <em>error_log</em>).<br>';
    v_summary := v_summary || v_count || ' error(es) serios. ';
  END IF;

  IF v_problems = '' THEN RETURN; END IF;

  -- Cupo POR TIPO: cada señal activa reclama su propio cupo diario. v_new cuenta
  -- cuántos tipos son NUEVOS hoy. Si ninguno es nuevo (todos ya avisados), no repetimos.
  IF v_t_failed THEN
    INSERT INTO public.email_throttle (key, last_sent_at)
    VALUES ('system_health:mail_failed:'||v_fecha_date, now()) ON CONFLICT (key) DO NOTHING;
    GET DIAGNOSTICS v_c = ROW_COUNT; v_new := v_new + v_c;
  END IF;
  IF v_t_stuck THEN
    INSERT INTO public.email_throttle (key, last_sent_at)
    VALUES ('system_health:mail_stuck:'||v_fecha_date, now()) ON CONFLICT (key) DO NOTHING;
    GET DIAGNOSTICS v_c = ROW_COUNT; v_new := v_new + v_c;
  END IF;
  IF v_t_cron THEN
    INSERT INTO public.email_throttle (key, last_sent_at)
    VALUES ('system_health:cron_failed:'||v_fecha_date, now()) ON CONFLICT (key) DO NOTHING;
    GET DIAGNOSTICS v_c = ROW_COUNT; v_new := v_new + v_c;
  END IF;
  IF v_t_errors THEN
    INSERT INTO public.email_throttle (key, last_sent_at)
    VALUES ('system_health:errors:'||v_fecha_date, now()) ON CONFLICT (key) DO NOTHING;
    GET DIAGNOSTICS v_c = ROW_COUNT; v_new := v_new + v_c;
  END IF;

  IF v_new = 0 THEN RETURN; END IF; -- todas las señales activas ya se avisaron hoy

  FOR v_pastor IN
    SELECT user_id, email, name FROM public.members
    WHERE role='pastor' AND active=true AND user_id IS NOT NULL AND email IS NOT NULL AND email <> ''
  LOOP
    BEGIN
      INSERT INTO public.notifications (user_id, title, message, type, is_global)
      VALUES (v_pastor.user_id, '⚠️ Alerta del sistema AdorAPP',
              'Necesita atención: '||trim(v_summary)||' Mirá el correo o la base para el detalle.', 'alert', false);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.error_log (message, severity, context)
      VALUES ('check_system_health: fallo push a un pastor', 'warning',
              jsonb_build_object('user_id', v_pastor.user_id, 'error', SQLERRM));
    END;
    BEGIN
      PERFORM public.encolar_email('sistema-alerta', v_pastor.email, v_pastor.name,
        jsonb_build_object('nombre', public._html_escape(COALESCE(v_pastor.name,'')),
          'fecha', v_fecha, 'problemas', v_problems), 1::smallint);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.error_log (message, severity, context)
      VALUES ('check_system_health: fallo mail a un pastor', 'warning',
              jsonb_build_object('email', v_pastor.email, 'error', SQLERRM));
    END;
  END LOOP;

EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.error_log (message, severity, context)
    VALUES ('check_system_health: fallo general', 'error', jsonb_build_object('error', SQLERRM));
  EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_system_health(timestamptz) FROM PUBLIC, anon, authenticated;
