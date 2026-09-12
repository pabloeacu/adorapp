-- ============================================================================
-- "Suspender ensamble" — PR1 (backend). 100% aditivo, no-breaking.
-- Suspender el ENSAMBLE (encuentro de banda) ≠ cancelar el ORDEN (status). Ejes independientes.
-- Diseño auditado por Workflow (relevamiento + diseño + red-team). Incorpora los arreglos:
--   * CRÍTICO: columnas server-owned CONGELADAS a nivel base (trigger INVOKER), no confiable
--     que el cliente "no las mande" (un PATCH crudo podía suspender/forjar ensamble ajeno).
--   * Carrera/doble-tap: UPDATE atómico condicional (CAS) → solo el que flipeó notifica.
--   * Reprogramar deja "pegado" suspendido: el mismo trigger auto-limpia al cambiar fecha/hora.
--   * Cancelar el orden no frena el ensamble: cron filtra status='scheduled' + re-chequeo in-loop.
-- ============================================================================

-- ── 1) Columnas server-owned (NULL = ensamble activo) ───────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rehearsal_suspended_at     timestamptz,
  ADD COLUMN IF NOT EXISTS rehearsal_suspended_reason text,
  ADD COLUMN IF NOT EXISTS rehearsal_suspended_by     uuid;

-- ── 2) FREEZE + auto-clear (INVOKER, landmine #41: usa current_user/rolbypassrls) ──
-- El cliente autenticado NUNCA escribe estas columnas ni rehearsal_reminder_sent.
-- Si reprograma (cambia rehearsal_date/time) → auto-limpia la suspensión y re-arma el
-- recordatorio. Backend (RPC/cron/service_role, rolbypassrls) pasa libre.
CREATE OR REPLACE FUNCTION public.enforce_order_rehearsal_rules()
  RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_backend boolean;
BEGIN
  SELECT rolbypassrls INTO v_backend FROM pg_roles WHERE rolname = current_user;
  IF COALESCE(v_backend, false) THEN RETURN NEW; END IF;  -- RPC / cron / service_role: libre

  IF (NEW.rehearsal_date IS DISTINCT FROM OLD.rehearsal_date)
     OR (NEW.rehearsal_time IS DISTINCT FROM OLD.rehearsal_time) THEN
    -- Reprogramó el ensamble desde el editor: limpia suspensión + re-arma el recordatorio.
    NEW.rehearsal_suspended_at     := NULL;
    NEW.rehearsal_suspended_reason := NULL;
    NEW.rehearsal_suspended_by     := NULL;
    NEW.rehearsal_reminder_sent    := false;
  ELSE
    -- No reprogramó: congela las 4 columnas a lo guardado (neutraliza cualquier PATCH directo).
    NEW.rehearsal_suspended_at     := OLD.rehearsal_suspended_at;
    NEW.rehearsal_suspended_reason := OLD.rehearsal_suspended_reason;
    NEW.rehearsal_suspended_by     := OLD.rehearsal_suspended_by;
    NEW.rehearsal_reminder_sent    := OLD.rehearsal_reminder_sent;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_order_rehearsal_rules ON public.orders;
CREATE TRIGGER enforce_order_rehearsal_rules
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_rehearsal_rules();

-- ── 3) Etiqueta plain-text del ensamble (día DD/MM a las HH:MM), reusable ────
CREATE OR REPLACE FUNCTION public._ensamble_label(p_date date, p_time text)
  RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $$
  SELECT CASE WHEN p_date IS NULL THEN '' ELSE
    (CASE extract(isodow from p_date)
       WHEN 1 THEN 'lunes' WHEN 2 THEN 'martes' WHEN 3 THEN 'miércoles'
       WHEN 4 THEN 'jueves' WHEN 5 THEN 'viernes' WHEN 6 THEN 'sábado'
       WHEN 7 THEN 'domingo' ELSE '' END)
    || ' ' || to_char(p_date,'DD/MM')
    || (CASE WHEN NULLIF(p_time,'') IS NOT NULL THEN ' a las ' || p_time ELSE '' END)
  END
$$;

-- ── 4) Motor de avisos compartido por las 3 RPCs (fan-out best-effort) ──────
-- Audiencia = formación (order_participant_ids) ∪ pastores ∪ observadores de SONIDO.
-- (Sonido opera el sonido en el ensamble → debe saber si va o no; decisión de Paul.)
-- DISTINCT = 1 correo + 1 push por destinatario. Todo en BEGIN/EXCEPTION: un aviso que
-- falla nunca revierte el cambio de estado (landmine #49).
CREATE OR REPLACE FUNCTION public._fanout_rehearsal_event(
  p_order_id uuid, p_template text, p_push_title text, p_push_msg text, p_vars jsonb)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_member record;
BEGIN
  FOR v_member IN
    SELECT DISTINCT m.id, m.name, m.email, m.user_id FROM public.members m
    WHERE m.active = true
      AND ( m.id = ANY (public.order_participant_ids(p_order_id))
            OR m.role = 'pastor'
            OR 'sonido' = ANY (m.areas) )
  LOOP
    BEGIN
      IF v_member.user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, type, is_global, created_at, expires_at)
        VALUES (v_member.user_id, p_push_title, p_push_msg, 'reminder', false, now(), now() + interval '7 days');
      END IF;
      IF v_member.email IS NOT NULL AND v_member.email <> '' THEN
        PERFORM public.encolar_email(p_template, v_member.email, v_member.name,
          p_vars || jsonb_build_object('nombre', COALESCE(v_member.name, '')), 5::smallint);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '_fanout_rehearsal_event: fallo aviso a %: %', v_member.email, SQLERRM;
    END;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._fanout_rehearsal_event(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._fanout_rehearsal_event(uuid, text, text, text, jsonb) TO service_role;

-- Helper de autorización: pastor cualquiera; líder solo miembro PERMANENTE de la banda del orden.
CREATE OR REPLACE FUNCTION public._can_manage_order_rehearsal(p_order_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT public.is_pastor()
    OR ( public.auth_role() = 'leader'
         AND EXISTS (SELECT 1 FROM public.orders o JOIN public.bands b ON b.id = o.band_id
                     WHERE o.id = p_order_id AND public.my_member_id() = ANY (b.members)) )
$$;
-- Solo lo llaman las RPCs (que corren como owner postgres) → el cliente NO necesita EXECUTE.
REVOKE EXECUTE ON FUNCTION public._can_manage_order_rehearsal(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._can_manage_order_rehearsal(uuid) TO service_role;

-- ── 5) RPC: SUSPENDER ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.suspend_order_rehearsal(p_order_id uuid, p_reason text DEFAULT NULL)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_n int; v_reason text; v_band text; v_when text; v_sufijo text;
  v_rd date; v_rt text; v_ens text; v_motivo_html text; v_today_art date;
BEGIN
  IF NOT public._can_manage_order_rehearsal(p_order_id) THEN
    RAISE EXCEPTION 'no autorizado para suspender este ensamble' USING ERRCODE = '42501';
  END IF;
  v_reason := nullif(btrim(p_reason), '');
  v_today_art := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;

  -- CAS atómico: solo la llamada que efectivamente flipeó la columna sigue al fan-out.
  UPDATE public.orders
     SET rehearsal_suspended_at = now(), rehearsal_suspended_by = public.my_member_id(),
         rehearsal_suspended_reason = v_reason
   WHERE id = p_order_id AND status = 'scheduled'
     AND rehearsal_date IS NOT NULL AND rehearsal_date >= v_today_art
     AND rehearsal_suspended_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_aplicable_o_ya_suspendido'); END IF;

  SELECT b.name, to_char(o.date,'DD/MM'), o.rehearsal_date, o.rehearsal_time
    INTO v_band, v_when, v_rd, v_rt
    FROM public.orders o LEFT JOIN public.bands b ON b.id = o.band_id WHERE o.id = p_order_id;
  v_sufijo := CASE WHEN v_band IS NOT NULL THEN ' · ' || v_band ELSE '' END;
  v_ens := public._ensamble_label(v_rd, v_rt);
  v_motivo_html := CASE WHEN v_reason IS NOT NULL
    THEN '<div style="margin:6px 0 14px;padding:10px 14px;border:1px solid #e6c3b8;border-left:4px solid #c0563f;border-radius:8px;background:#fbeee9;color:#7a2e2e;font-size:14px;line-height:1.5;"><strong>Motivo:</strong> '
         || public._html_escape(v_reason) || '</div>'
    ELSE '' END;

  PERFORM public._fanout_rehearsal_event(
    p_order_id, 'ensamble-suspendido',
    'Ensamble suspendido',
    'Se suspendió el ensamble del ' || v_ens || v_sufijo,
    jsonb_build_object('fecha', v_when, 'banda_sufijo', v_sufijo, 'ensamble_txt', v_ens,
                       'motivo', v_motivo_html, 'url', 'https://adorapp.net.ar/ordenes'));
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.suspend_order_rehearsal(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.suspend_order_rehearsal(uuid, text) TO authenticated;

-- ── 6) RPC: REACTIVAR (mismo día/horario) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.resume_order_rehearsal(p_order_id uuid)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_n int; v_band text; v_when text; v_sufijo text; v_rd date; v_rt text; v_ens text;
BEGIN
  IF NOT public._can_manage_order_rehearsal(p_order_id) THEN
    RAISE EXCEPTION 'no autorizado para reactivar este ensamble' USING ERRCODE = '42501';
  END IF;
  UPDATE public.orders
     SET rehearsal_suspended_at = NULL, rehearsal_suspended_by = NULL, rehearsal_suspended_reason = NULL
   WHERE id = p_order_id AND status = 'scheduled' AND rehearsal_suspended_at IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_estaba_suspendido'); END IF;

  SELECT b.name, to_char(o.date,'DD/MM'), o.rehearsal_date, o.rehearsal_time
    INTO v_band, v_when, v_rd, v_rt
    FROM public.orders o LEFT JOIN public.bands b ON b.id = o.band_id WHERE o.id = p_order_id;
  v_sufijo := CASE WHEN v_band IS NOT NULL THEN ' · ' || v_band ELSE '' END;
  v_ens := public._ensamble_label(v_rd, v_rt);

  PERFORM public._fanout_rehearsal_event(
    p_order_id, 'ensamble-reactivado',
    'Ensamble reactivado',
    'El ensamble del ' || v_ens || v_sufijo || ' vuelve a estar en pie',
    jsonb_build_object('fecha', v_when, 'banda_sufijo', v_sufijo, 'ensamble_txt', v_ens,
                       'url', 'https://adorapp.net.ar/ordenes'));
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resume_order_rehearsal(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resume_order_rehearsal(uuid) TO authenticated;

-- ── 7) RPC: REPROGRAMAR (otro día/horario) ──────────────────────────────────
-- Cambia fecha/hora del ensamble, limpia cualquier suspensión y re-arma el recordatorio.
CREATE OR REPLACE FUNCTION public.reschedule_order_rehearsal(
  p_order_id uuid, p_date date, p_time text, p_reason text DEFAULT NULL)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_n int; v_reason text; v_band text; v_when text; v_sufijo text; v_ens text; v_motivo_html text; v_today_art date;
BEGIN
  IF NOT public._can_manage_order_rehearsal(p_order_id) THEN
    RAISE EXCEPTION 'no autorizado para reprogramar este ensamble' USING ERRCODE = '42501';
  END IF;
  IF p_date IS NULL OR nullif(btrim(p_time), '') IS NULL THEN
    RAISE EXCEPTION 'reprogramar requiere fecha y hora del ensamble' USING ERRCODE = '22004';
  END IF;
  IF p_time !~ '^[0-2][0-9]:[0-5][0-9]$' THEN
    RAISE EXCEPTION 'hora inválida (formato HH:MM)' USING ERRCODE = '22007';
  END IF;
  v_today_art := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  IF p_date < v_today_art THEN
    RAISE EXCEPTION 'la nueva fecha del ensamble no puede ser pasada' USING ERRCODE = '22008';
  END IF;
  v_reason := nullif(btrim(p_reason), '');

  UPDATE public.orders
     SET rehearsal_date = p_date, rehearsal_time = p_time, rehearsal_reminder_sent = false,
         rehearsal_suspended_at = NULL, rehearsal_suspended_by = NULL, rehearsal_suspended_reason = NULL
   WHERE id = p_order_id AND status = 'scheduled';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'orden_no_programado'); END IF;

  SELECT b.name, to_char(o.date,'DD/MM') INTO v_band, v_when
    FROM public.orders o LEFT JOIN public.bands b ON b.id = o.band_id WHERE o.id = p_order_id;
  v_sufijo := CASE WHEN v_band IS NOT NULL THEN ' · ' || v_band ELSE '' END;
  v_ens := public._ensamble_label(p_date, p_time);
  v_motivo_html := CASE WHEN v_reason IS NOT NULL
    THEN '<div style="margin:6px 0 14px;padding:10px 14px;border:1px solid #e8d9a8;border-left:4px solid #b8860b;border-radius:8px;background:#fbf7ea;color:#5b4a1e;font-size:14px;line-height:1.5;"><strong>Nota:</strong> '
         || public._html_escape(v_reason) || '</div>'
    ELSE '' END;

  PERFORM public._fanout_rehearsal_event(
    p_order_id, 'ensamble-reprogramado',
    'Ensamble reprogramado',
    'El ensamble' || v_sufijo || ' se reprogramó para el ' || v_ens,
    jsonb_build_object('fecha', v_when, 'banda_sufijo', v_sufijo, 'ensamble_txt', v_ens,
                       'motivo', v_motivo_html, 'url', 'https://adorapp.net.ar/ordenes'));
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reschedule_order_rehearsal(uuid, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reschedule_order_rehearsal(uuid, date, text, text) TO authenticated;

-- ── 8) CRON: no recordar ensambles suspendidos ni de órdenes no-programadas ─
CREATE OR REPLACE FUNCTION public.send_rehearsal_reminders()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  ord RECORD; band_member RECORD; rehearsal_ts timestamptz;
BEGIN
  FOR ord IN
    SELECT o.id, o.rehearsal_date, o.rehearsal_time, public.order_participant_ids(o.id) AS participants
    FROM public.orders o
    JOIN public.bands b ON b.id = o.band_id
    WHERE o.rehearsal_date IS NOT NULL AND o.rehearsal_time IS NOT NULL AND o.rehearsal_reminder_sent = false
      AND o.status = 'scheduled' AND o.rehearsal_suspended_at IS NULL
  LOOP
    BEGIN
      rehearsal_ts := (ord.rehearsal_date::text || ' ' || ord.rehearsal_time)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires';
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.orders SET rehearsal_reminder_sent = true WHERE id = ord.id;
      CONTINUE;
    END;

    IF NOW() >= rehearsal_ts - INTERVAL '2 hours' AND NOW() < rehearsal_ts THEN
      -- Re-chequeo del estado committeado más reciente (achica el TOCTOU driver→envío).
      IF EXISTS (SELECT 1 FROM public.orders o2 WHERE o2.id = ord.id
                 AND (o2.rehearsal_suspended_at IS NOT NULL OR o2.status <> 'scheduled')) THEN
        CONTINUE;  -- se suspendió/canceló mientras el cron corría → no avisar ni marcar enviado
      END IF;
      FOR band_member IN
        SELECT m.user_id, m.name, m.email FROM public.members m
        WHERE m.active = true AND m.user_id IS NOT NULL AND m.id = ANY(ord.participants)
      LOOP
        INSERT INTO public.notifications (title, message, type, user_id, is_global, created_at, expires_at)
        VALUES ('🎶 ¡Hoy tenés ensamble!',
                '¡Hoy tenés ensamble! Es hora de ensamblar con la banda las canciones que practicaste. ¡No faltes!',
                'reminder', band_member.user_id, false, NOW(), rehearsal_ts + INTERVAL '3 hours');
        IF band_member.email IS NOT NULL AND band_member.email <> '' THEN
          BEGIN
            PERFORM public.encolar_email('recordatorio-ensayo', band_member.email, band_member.name,
              jsonb_build_object('nombre', COALESCE(band_member.name, ''), 'fecha', to_char(ord.rehearsal_date, 'DD/MM'),
                                 'url', 'https://adorapp.net.ar/practica/' || ord.id), 3::smallint);
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'send_rehearsal_reminders: email enqueue failed for %: %', band_member.email, SQLERRM;
          END;
        END IF;
      END LOOP;
      UPDATE public.orders SET rehearsal_reminder_sent = true WHERE id = ord.id;
    END IF;
  END LOOP;
END;
$function$;
-- Re-asertar grants (CREATE OR REPLACE los resetea, landmine #39).
REVOKE EXECUTE ON FUNCTION public.send_rehearsal_reminders() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.send_rehearsal_reminders() TO service_role;

-- ── 9) Plantillas de correo ─────────────────────────────────────────────────
INSERT INTO public.email_templates (slug, descripcion, asunto, from_label, activo, kicker, titulo,
  color_acento, mostrar_logo, firma, cta_text, cta_url, cuerpo_html)
VALUES
('ensamble-suspendido', 'Aviso de ensamble suspendido a la formación + pastores + sonido',
 'Se suspendió un ensamble', 'adorapp', true, 'ADORACIÓN CAF', 'Ensamble suspendido',
 '#c0563f', true, 'Pastores de Adoración CAF', 'Ver el orden', '{{url}}',
 'Hola {{nombre}}, te avisamos que se <strong>suspendió el ensamble</strong> del <strong>{{ensamble_txt}}</strong>{{banda_sufijo}}.<br><br>{{motivo}}El <strong>servicio del {{fecha}} sigue en pie</strong>: solo se suspende el encuentro de banda para ensamblar. Si hay novedades, te avisamos por acá.<br><br>Un abrazo!'),
('ensamble-reactivado', 'Aviso de ensamble reactivado a la formación + pastores + sonido',
 'Se reactivó un ensamble', 'adorapp', true, 'ADORACIÓN CAF', 'Ensamble reactivado',
 '#4a9d6a', true, 'Pastores de Adoración CAF', 'Ver el orden', '{{url}}',
 'Hola {{nombre}}, ¡buenas noticias! Se <strong>reactivó el ensamble</strong> del <strong>{{ensamble_txt}}</strong>{{banda_sufijo}}: vuelve a estar en pie según lo previsto. ¡Te esperamos!<br><br>Un abrazo!'),
('ensamble-reprogramado', 'Aviso de ensamble reprogramado a la formación + pastores + sonido',
 'Se reprogramó un ensamble', 'adorapp', true, 'ADORACIÓN CAF', 'Ensamble reprogramado',
 '#b8860b', true, 'Pastores de Adoración CAF', 'Ver el orden', '{{url}}',
 'Hola {{nombre}}, el <strong>ensamble</strong>{{banda_sufijo}} se <strong>reprogramó</strong>. Nueva fecha y hora: <strong>{{ensamble_txt}}</strong>.<br><br>{{motivo}}Anotalo así no te lo perdés. ¡Te esperamos!<br><br>Un abrazo!')
ON CONFLICT (slug) DO UPDATE SET
  descripcion=EXCLUDED.descripcion, asunto=EXCLUDED.asunto, from_label=EXCLUDED.from_label,
  activo=EXCLUDED.activo, kicker=EXCLUDED.kicker, titulo=EXCLUDED.titulo, color_acento=EXCLUDED.color_acento,
  mostrar_logo=EXCLUDED.mostrar_logo, firma=EXCLUDED.firma, cta_text=EXCLUDED.cta_text,
  cta_url=EXCLUDED.cta_url, cuerpo_html=EXCLUDED.cuerpo_html, updated_at=now();
