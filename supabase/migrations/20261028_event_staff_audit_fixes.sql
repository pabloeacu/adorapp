-- Fixes de la auditoría adversarial del control de acceso en la puerta
-- (0 crítico/alto/medio; estos son hygiene de bajo/info):
--  (A) event_staff_hits: REVOKE del grant DML residual de 'authenticated' (hoy
--      inerte por RLS FORCED, pero cierra la defensa en profundidad — landmines #45/#86).
--  (B) Retención: purge_technical_logs poda event_staff_hits > 30 días.
--  (C) _event_staff_gate: sube el tope del rate-limit a 1500/min (holgura para 5
--      estaciones en pico) y quita el INSERT de 'bad_key' (se revertía solo por el
--      EXCEPTION del RPC -> mini-auditoría muerta; limpieza).
--  (D) event_check_in (panel pastor): agrega el CAS `AND checked_in_at IS NULL`
--      (como event_staff_checkin) -> ingreso a prueba de carrera también desde el panel.
-- Todo dentro de event_* + una función existente del evento; cero plataforma.

-- (A)
REVOKE INSERT, UPDATE, DELETE ON public.event_staff_hits FROM authenticated;

-- (B)
CREATE OR REPLACE FUNCTION public.purge_technical_logs()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  DELETE FROM public.health_checks WHERE checked_at < now() - interval '90 days';
  DELETE FROM public.email_queue WHERE status IN ('sent','failed') AND created_at < now() - interval '90 days';
  DELETE FROM public.sent_emails WHERE created_at < now() - interval '90 days';
  DELETE FROM public.admin_action_events WHERE at < now() - interval '1 day';
  DELETE FROM public.event_staff_hits WHERE at < now() - interval '30 days';
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.error_log (message, severity, context)
    VALUES ('purge_technical_logs: fallo', 'error', jsonb_build_object('error', SQLERRM));
  EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$function$;

-- (C)
CREATE OR REPLACE FUNCTION public._event_staff_gate(p_key text, p_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_slug text; v_hits int;
BEGIN
  SELECT count(*) INTO v_hits FROM public.event_staff_hits WHERE at > now() - interval '1 minute';
  IF v_hits >= 1500 THEN RAISE EXCEPTION 'demasiadas_solicitudes' USING ERRCODE='PT429'; END IF;
  SELECT event_slug INTO v_slug FROM public.event_staff_access
    WHERE enabled = true AND staff_key IS NOT NULL AND staff_key = p_key
    LIMIT 1;
  IF v_slug IS NULL THEN RAISE EXCEPTION 'acceso_invalido' USING ERRCODE='42501'; END IF;
  INSERT INTO public.event_staff_hits(event_slug, kind) VALUES (v_slug, p_kind);
  RETURN v_slug;
END; $fn$;
REVOKE ALL ON FUNCTION public._event_staff_gate(text, text) FROM PUBLIC, anon, authenticated;

-- (D)
CREATE OR REPLACE FUNCTION public.event_check_in(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_reg public.event_registrations%ROWTYPE; v_already boolean := false;
BEGIN
  IF coalesce((SELECT public.auth_role()) IN ('pastor','leader'), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'no_autorizado' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_reg FROM public.event_registrations WHERE ticket_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_existe'); END IF;
  IF v_reg.status = 'cancelled' THEN RETURN jsonb_build_object('ok', false, 'reason', 'cancelada', 'nombre', v_reg.nombre); END IF;
  IF v_reg.checked_in_at IS NOT NULL THEN
    v_already := true;
  ELSE
    UPDATE public.event_registrations
      SET checked_in_at = now(), checked_in_by = public.my_member_id(), updated_at = now()
      WHERE id = v_reg.id AND checked_in_at IS NULL
      RETURNING * INTO v_reg;
    IF NOT FOUND THEN
      SELECT * INTO v_reg FROM public.event_registrations WHERE id = v_reg.id;
      v_already := true;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'ok', true, 'already', v_already,
    'nombre', v_reg.nombre, 'personas', 1 + v_reg.acompanantes,
    'checked_in_at', v_reg.checked_in_at);
END;
$function$;
REVOKE ALL ON FUNCTION public.event_check_in(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_check_in(text) TO authenticated;
