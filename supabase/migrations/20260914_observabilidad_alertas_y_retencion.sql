-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2 de estabilización post-auditoría — OBSERVABILIDAD + RETENCIÓN
-- Autorizado por Paul (2026-09-14). ADITIVO: no toca ningún flujo de usuario.
-- Aplicado a prod vía MCP + QA transaccional (rollback); crons programados (jobid 18/19).
--
-- (A) Monitor de salud `check_system_health()`: cierra los 2 hallazgos ALTO de la
--     auditoría (el correo/los crons/los errores podían fallar EN SILENCIO). Lee lo que
--     el sistema YA instrumenta y, ante una anomalía real, avisa a los pastores por
--     PUSH + campanita (independiente de Gmail → llega aunque el correo esté caído) y MAIL.
--     Silencioso cuando todo está sano. Throttle: 1 aviso por día como máximo.
--     4 señales PRECISAS: correo fallido / correo atascado / cron fallido / error serio nuevo.
--     (Se descartó la señal de "staleness del watchdog de uptime": el watchdog externo
--      corre de forma muy irregular —gaps normales de 1.5 a 5.5 h— y daba falsos positivos.
--      `notifications.type` debe ser un valor del CHECK → se usa 'alert'.)
--
-- (B) Retención `purge_technical_logs()`: poda tablas PURAMENTE técnicas (>90 días) para que
--     no crezcan sin techo. NO toca datos del ministerio (orders, songs, members, bands,
--     audit_events, notifications, error_log). Hoy borra 0 (los datos tienen ~30 días); es
--     preventivo. Primera ejecución verificada a mano (0 filas).
--
-- Ambas: SECURITY DEFINER, search_path fijo, envueltas en EXCEPTION (un fallo del monitor
-- jamás rompe nada), sin EXECUTE para el cliente. QA: SANO 0/0/0 · ANOMALÍA push=2 mail=2.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.email_templates
  (slug, asunto, from_label, activo, kicker, titulo, cuerpo_html, body_html, color_acento, mostrar_logo, firma)
VALUES (
  'sistema-alerta', '⚠️ Alerta del sistema — AdorAPP', 'adorapp', true, 'ADORACIÓN CAF', 'Alerta del sistema',
  'Hola {{nombre}}, el monitor automático de AdorAPP detectó algo que necesita atención (<strong>{{fecha}}</strong>):<br><br>{{problemas}}<br><em style="color:#6b7280;font-size:13px;line-height:1.5">Este es un aviso automático del sistema. Si ya lo resolviste, ignoralo — se repite como máximo una vez por día mientras el problema siga. Detalle técnico en la base (error_log / email_queue / cron.job_run_details).</em>',
  'Hola {{nombre}}, el monitor automático de AdorAPP detectó algo que necesita atención (<strong>{{fecha}}</strong>):<br><br>{{problemas}}<br><em style="color:#6b7280;font-size:13px;line-height:1.5">Este es un aviso automático del sistema. Se repite como máximo una vez por día mientras el problema siga.</em>',
  '#c0392b', true, 'Monitoreo automático · AdorAPP'
)
ON CONFLICT (slug) DO UPDATE SET
  asunto=EXCLUDED.asunto, activo=EXCLUDED.activo, titulo=EXCLUDED.titulo,
  cuerpo_html=EXCLUDED.cuerpo_html, body_html=EXCLUDED.body_html,
  color_acento=EXCLUDED.color_acento, firma=EXCLUDED.firma, updated_at=now();

CREATE OR REPLACE FUNCTION public.check_system_health(p_now timestamptz DEFAULT NULL)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamptz; v_fecha text; v_problems text := ''; v_summary text := '';
  v_count int; v_claim int; v_pastor record;
BEGIN
  v_now := COALESCE(p_now, now());
  v_fecha := to_char((v_now AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'DD/MM/YYYY HH24:MI');

  SELECT count(*) INTO v_count FROM public.email_queue
    WHERE status='failed' AND created_at > v_now - interval '24 hours';
  IF v_count > 0 THEN
    v_problems := v_problems || '• <strong>'||v_count||'</strong> correo(s) fallaron en las últimas 24 h.<br>';
    v_summary := v_summary || v_count || ' correo(s) fallidos. ';
  END IF;

  SELECT count(*) INTO v_count FROM public.email_queue
    WHERE status='pending' AND created_at < v_now - interval '1 hour';
  IF v_count > 0 THEN
    v_problems := v_problems || '• <strong>'||v_count||'</strong> correo(s) atascados sin enviarse (>1 h). El envío de correo podría estar caído.<br>';
    v_summary := v_summary || v_count || ' correo(s) atascados. ';
  END IF;

  SELECT count(*) INTO v_count FROM cron.job_run_details
    WHERE status='failed' AND start_time > v_now - interval '24 hours';
  IF v_count > 0 THEN
    v_problems := v_problems || '• <strong>'||v_count||'</strong> corrida(s) de tareas automáticas fallaron en 24 h.<br>';
    v_summary := v_summary || v_count || ' cron(s) fallidos. ';
  END IF;

  SELECT count(*) INTO v_count FROM public.error_log
    WHERE severity IN ('error','fatal') AND occurred_at > v_now - interval '24 hours'
      AND COALESCE(resolved,false)=false AND COALESCE(context->>'kind','')<>'stale-chunk'
      AND message NOT ILIKE '%Importing a module script failed%' AND message NOT ILIKE '%Script error%';
  IF v_count > 0 THEN
    v_problems := v_problems || '• <strong>'||v_count||'</strong> error(es) nuevos serios en 24 h (revisá <em>error_log</em>).<br>';
    v_summary := v_summary || v_count || ' error(es) serios. ';
  END IF;

  IF v_problems = '' THEN RETURN; END IF;

  INSERT INTO public.email_throttle (key, last_sent_at)
  VALUES ('system_health:'||to_char((v_now AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,'YYYY-MM-DD'), now())
  ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS v_claim = ROW_COUNT;
  IF v_claim = 0 THEN RETURN; END IF;

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

CREATE OR REPLACE FUNCTION public.purge_technical_logs()
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  DELETE FROM public.health_checks WHERE checked_at < now() - interval '90 days';
  DELETE FROM public.email_queue   WHERE status IN ('sent','failed') AND created_at < now() - interval '90 days';
  DELETE FROM public.sent_emails   WHERE created_at < now() - interval '90 days';
  -- NO se tocan: orders, songs, members, bands, audit_events, notifications, error_log.
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.error_log (message, severity, context)
    VALUES ('purge_technical_logs: fallo', 'error', jsonb_build_object('error', SQLERRM));
  EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_system_health(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_technical_logs()          FROM PUBLIC, anon, authenticated;

-- Crons (jobid 18/19 en prod):
SELECT cron.schedule('system-health-monitor', '*/15 * * * *', $$select public.check_system_health()$$);
SELECT cron.schedule('technical-logs-purge',  '0 8 * * *',     $$select public.purge_technical_logs()$$);  -- 05:00 ART
