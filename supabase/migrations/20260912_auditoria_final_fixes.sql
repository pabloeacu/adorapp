-- ============================================================================
-- Remediaciones de la auditoría FINAL adversarial (2026-09-12). Ya aplicadas a prod + QA.
-- ============================================================================

-- FIX #1/#4/#8/#11 — El freeze permitía LIMPIAR una suspensión en silencio al cambiar la fecha
-- del ensamble desde el editor/PATCH (incl. cross-banda). Ahora: si el ensamble está SUSPENDIDO,
-- cambiar rehearsal_date/time desde el cliente RAISE 42501 → obliga a usar las RPCs Reprogramar/
-- Reactivar (que sí avisan). Reprogramar normal (orden no suspendido) sigue igual.
CREATE OR REPLACE FUNCTION public.enforce_order_rehearsal_rules()
  RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_backend boolean;
BEGIN
  SELECT rolbypassrls INTO v_backend FROM pg_roles WHERE rolname = current_user;
  IF COALESCE(v_backend, false) THEN RETURN NEW; END IF;
  IF (NEW.rehearsal_date IS DISTINCT FROM OLD.rehearsal_date)
     OR (NEW.rehearsal_time IS DISTINCT FROM OLD.rehearsal_time) THEN
    IF OLD.rehearsal_suspended_at IS NOT NULL THEN
      RAISE EXCEPTION 'El ensamble está suspendido: reprogramalo o reactivalo desde su botón.' USING ERRCODE = '42501';
    END IF;
    NEW.rehearsal_suspended_at := NULL;
    NEW.rehearsal_suspended_reason := NULL;
    NEW.rehearsal_suspended_by := NULL;
    NEW.rehearsal_reminder_sent := false;
  ELSE
    NEW.rehearsal_suspended_at := OLD.rehearsal_suspended_at;
    NEW.rehearsal_suspended_reason := OLD.rehearsal_suspended_reason;
    NEW.rehearsal_suspended_by := OLD.rehearsal_suspended_by;
    NEW.rehearsal_reminder_sent := OLD.rehearsal_reminder_sent;
  END IF;
  RETURN NEW;
END;
$$;

-- FIX #7 — El nombre de banda en {{banda_sufijo}} del correo NO se escapaba (HTML injection).
-- Ahora la variable del CORREO va escapada; el push (texto plano, sin render HTML) usa el sufijo plano.

-- SUSPEND
CREATE OR REPLACE FUNCTION public.suspend_order_rehearsal(p_order_id uuid, p_reason text DEFAULT NULL)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_n int; v_reason text; v_band text; v_when text; v_sufijo text; v_sufijo_html text;
  v_rd date; v_rt text; v_ens text; v_motivo_html text; v_today_art date;
BEGIN
  IF NOT public._can_manage_order_rehearsal(p_order_id) THEN
    RAISE EXCEPTION 'no autorizado para suspender este ensamble' USING ERRCODE = '42501';
  END IF;
  v_reason := nullif(btrim(p_reason), '');
  v_today_art := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
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
  v_sufijo_html := CASE WHEN v_band IS NOT NULL THEN ' · ' || public._html_escape(v_band) ELSE '' END;
  v_ens := public._ensamble_label(v_rd, v_rt);
  v_motivo_html := CASE WHEN v_reason IS NOT NULL
    THEN '<div style="margin:6px 0 14px;padding:10px 14px;border:1px solid #e6c3b8;border-left:4px solid #c0563f;border-radius:8px;background:#fbeee9;color:#7a2e2e;font-size:14px;line-height:1.5;"><strong>Motivo:</strong> '
         || public._html_escape(v_reason) || '</div>'
    ELSE '' END;
  PERFORM public._fanout_rehearsal_event(
    p_order_id, 'ensamble-suspendido', 'Ensamble suspendido',
    'Se suspendió el ensamble del ' || v_ens || v_sufijo,
    jsonb_build_object('fecha', v_when, 'banda_sufijo', v_sufijo_html, 'ensamble_txt', v_ens,
                       'motivo', v_motivo_html, 'url', 'https://adorapp.net.ar/ordenes'));
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.suspend_order_rehearsal(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.suspend_order_rehearsal(uuid, text) TO authenticated;

-- RESUME (FIX #5: exigir ensamble futuro, simétrico con suspend + FIX #7 escape)
CREATE OR REPLACE FUNCTION public.resume_order_rehearsal(p_order_id uuid)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_n int; v_band text; v_when text; v_sufijo text; v_sufijo_html text; v_rd date; v_rt text; v_ens text; v_today_art date;
BEGIN
  IF NOT public._can_manage_order_rehearsal(p_order_id) THEN
    RAISE EXCEPTION 'no autorizado para reactivar este ensamble' USING ERRCODE = '42501';
  END IF;
  v_today_art := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  UPDATE public.orders
     SET rehearsal_suspended_at = NULL, rehearsal_suspended_by = NULL, rehearsal_suspended_reason = NULL
   WHERE id = p_order_id AND status = 'scheduled' AND rehearsal_suspended_at IS NOT NULL
     AND rehearsal_date IS NOT NULL AND rehearsal_date >= v_today_art;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_aplicable'); END IF;
  SELECT b.name, to_char(o.date,'DD/MM'), o.rehearsal_date, o.rehearsal_time
    INTO v_band, v_when, v_rd, v_rt
    FROM public.orders o LEFT JOIN public.bands b ON b.id = o.band_id WHERE o.id = p_order_id;
  v_sufijo := CASE WHEN v_band IS NOT NULL THEN ' · ' || v_band ELSE '' END;
  v_sufijo_html := CASE WHEN v_band IS NOT NULL THEN ' · ' || public._html_escape(v_band) ELSE '' END;
  v_ens := public._ensamble_label(v_rd, v_rt);
  PERFORM public._fanout_rehearsal_event(
    p_order_id, 'ensamble-reactivado', 'Ensamble reactivado',
    'El ensamble del ' || v_ens || v_sufijo || ' vuelve a estar en pie',
    jsonb_build_object('fecha', v_when, 'banda_sufijo', v_sufijo_html, 'ensamble_txt', v_ens,
                       'url', 'https://adorapp.net.ar/ordenes'));
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resume_order_rehearsal(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resume_order_rehearsal(uuid) TO authenticated;

-- RESCHEDULE (FIX #6: guarda CAS anti doble-aviso + FIX #7 escape)
CREATE OR REPLACE FUNCTION public.reschedule_order_rehearsal(
  p_order_id uuid, p_date date, p_time text, p_reason text DEFAULT NULL)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_n int; v_reason text; v_band text; v_when text; v_sufijo text; v_sufijo_html text; v_ens text; v_motivo_html text; v_today_art date;
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
  -- CAS: solo actúa (y avisa) si algo cambia de verdad (fecha/hora distinta o había suspensión).
  UPDATE public.orders
     SET rehearsal_date = p_date, rehearsal_time = p_time, rehearsal_reminder_sent = false,
         rehearsal_suspended_at = NULL, rehearsal_suspended_by = NULL, rehearsal_suspended_reason = NULL
   WHERE id = p_order_id AND status = 'scheduled'
     AND (rehearsal_date IS DISTINCT FROM p_date OR rehearsal_time IS DISTINCT FROM p_time
          OR rehearsal_suspended_at IS NOT NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'sin_cambios_o_no_programado'); END IF;
  SELECT b.name, to_char(o.date,'DD/MM') INTO v_band, v_when
    FROM public.orders o LEFT JOIN public.bands b ON b.id = o.band_id WHERE o.id = p_order_id;
  v_sufijo := CASE WHEN v_band IS NOT NULL THEN ' · ' || v_band ELSE '' END;
  v_sufijo_html := CASE WHEN v_band IS NOT NULL THEN ' · ' || public._html_escape(v_band) ELSE '' END;
  v_ens := public._ensamble_label(p_date, p_time);
  v_motivo_html := CASE WHEN v_reason IS NOT NULL
    THEN '<div style="margin:6px 0 14px;padding:10px 14px;border:1px solid #e8d9a8;border-left:4px solid #b8860b;border-radius:8px;background:#fbf7ea;color:#5b4a1e;font-size:14px;line-height:1.5;"><strong>Nota:</strong> '
         || public._html_escape(v_reason) || '</div>'
    ELSE '' END;
  PERFORM public._fanout_rehearsal_event(
    p_order_id, 'ensamble-reprogramado', 'Ensamble reprogramado',
    'El ensamble' || v_sufijo || ' se reprogramó para el ' || v_ens,
    jsonb_build_object('fecha', v_when, 'banda_sufijo', v_sufijo_html, 'ensamble_txt', v_ens,
                       'motivo', v_motivo_html, 'url', 'https://adorapp.net.ar/ordenes'));
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reschedule_order_rehearsal(uuid, date, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reschedule_order_rehearsal(uuid, date, text, text) TO authenticated;

-- FIX #9 — filtro de status NULL-safe en el reporte de salud (una orden con status NULL saldría del denom).
CREATE OR REPLACE FUNCTION public.send_ensamble_health_report(p_now timestamptz DEFAULT now(), p_force boolean DEFAULT false)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_today date; v_anchor date := DATE '2026-10-01'; v_start date; v_n int;
  v_stats jsonb; v_periodo text; v_member record; v_items text; v_bandrec record; v_relevant jsonb;
BEGIN
  v_today := (p_now AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  IF NOT p_force THEN
    IF v_today < v_anchor + 90 OR ((v_today - v_anchor) % 90) <> 0 THEN RETURN; END IF;
  END IF;
  INSERT INTO public.email_throttle (key, last_sent_at) VALUES ('ensamble_health:' || v_today::text, now())
    ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN; END IF;
  v_start := GREATEST(v_today - 90, v_anchor);
  v_periodo := to_char(v_start, 'DD/MM/YYYY') || ' al ' || to_char(v_today - 1, 'DD/MM/YYYY');
  SELECT jsonb_agg(jsonb_build_object('band_id', s.band_id, 'name', s.name,
           'denom', s.denom, 'numer', s.numer, 'pct', s.pct) ORDER BY s.name)
    INTO v_stats
    FROM (
      SELECT b.id AS band_id, b.name,
             count(*) AS denom,
             count(*) FILTER (WHERE o.rehearsal_date IS NOT NULL AND o.rehearsal_suspended_at IS NULL) AS numer,
             round(100.0 * count(*) FILTER (WHERE o.rehearsal_date IS NOT NULL AND o.rehearsal_suspended_at IS NULL) / count(*))::int AS pct
        FROM public.orders o JOIN public.bands b ON b.id = o.band_id
       WHERE o.date >= v_start AND o.date < v_today AND o.status IS DISTINCT FROM 'cancelled'
       GROUP BY b.id, b.name
    ) s;
  IF v_stats IS NULL THEN RETURN; END IF;
  FOR v_member IN
    SELECT m.id, m.name, m.email, m.role FROM public.members m
    WHERE m.active AND m.role IN ('pastor','leader') AND m.email IS NOT NULL AND m.email <> ''
  LOOP
    IF v_member.role = 'pastor' THEN
      v_relevant := v_stats;
    ELSE
      SELECT jsonb_agg(e) INTO v_relevant
        FROM jsonb_array_elements(v_stats) e
       WHERE EXISTS (SELECT 1 FROM public.bands b
                     WHERE b.id = (e->>'band_id')::uuid AND v_member.id = ANY(b.members));
    END IF;
    IF v_relevant IS NULL OR jsonb_array_length(v_relevant) = 0 THEN CONTINUE; END IF;
    v_items := '';
    FOR v_bandrec IN SELECT value FROM jsonb_array_elements(v_relevant) LOOP
      v_items := v_items
        || '<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #e8d9a8;border-left:4px solid #b8860b;border-radius:8px;background:#fbf7ea;color:#374151;font-size:14px;line-height:1.55;">'
        || '<strong style="color:#8a6508;">' || public._html_escape(v_bandrec.value->>'name') || '</strong> — '
        || '<strong>' || (v_bandrec.value->>'pct') || '%</strong> de ensambles concretados '
        || '(' || (v_bandrec.value->>'numer') || ' de ' || (v_bandrec.value->>'denom') || ' servicios).<br>'
        || public._ensamble_health_phrase((v_bandrec.value->>'pct')::int)
        || '</div>';
    END LOOP;
    BEGIN
      PERFORM public.encolar_email('salud-ensambles', v_member.email, v_member.name,
        jsonb_build_object('nombre', COALESCE(v_member.name, ''), 'periodo', v_periodo,
                           'items', v_items, 'url', 'https://adorapp.net.ar/ordenes'), 5::smallint);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'send_ensamble_health_report: fallo para %: %', v_member.email, SQLERRM;
    END;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_ensamble_health_report(timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.send_ensamble_health_report(timestamptz, boolean) TO service_role;

-- FIX #14 — vocabulario: "orden" es masculino (landmine #26).
UPDATE public.email_templates SET cta_text = 'Ver los órdenes', updated_at = now() WHERE slug = 'salud-ensambles';
