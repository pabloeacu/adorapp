-- "Control de acceso en la puerta" del evento The Chosen (Camino B).
-- Credencial de puerta AISLADA: NO es un rol de plataforma. Voluntarios SIN cuenta
-- de AdorApp escanean/tipean y marcan el ingreso, autorizados por una LLAVE de
-- evento (bearer token de 64 hex). 100% dentro de event_*; CERO contacto con
-- members/roles/RLS de la plataforma. Los RPCs de puerta devuelven lo mínimo
-- (nombre + N personas + válida/usada), NUNCA mail/celu/iglesia ni la lista.
-- Migración PURAMENTE ADITIVA (columnas, tabla y funciones nuevas; no modifica
-- event_register/event_ticket/event_check_in ni ningún objeto existente).

-- 1) Llave de puerta en event_events (NULL = sin generar; disabled por defecto).
ALTER TABLE public.event_events ADD COLUMN IF NOT EXISTS staff_key text;
ALTER TABLE public.event_events ADD COLUMN IF NOT EXISTS staff_enabled boolean NOT NULL DEFAULT false;

-- 2) Rate-limit + mini-auditoría de la puerta (aislada, no-PII: solo timestamps).
CREATE TABLE IF NOT EXISTS public.event_staff_hits (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_slug text NOT NULL,
  kind       text NOT NULL,            -- 'auth' | 'lookup' | 'checkin' | 'bad_key'
  at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_staff_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_staff_hits FORCE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_event_staff_hits_at ON public.event_staff_hits(at);
DROP POLICY IF EXISTS event_staff_hits_select_pastor ON public.event_staff_hits;
CREATE POLICY event_staff_hits_select_pastor ON public.event_staff_hits
  FOR SELECT TO authenticated USING (public.is_pastor());
-- escritura SOLO vía las RPCs SECURITY DEFINER (owner postgres); el cliente nunca escribe.
GRANT SELECT ON public.event_staff_hits TO authenticated;
REVOKE ALL ON public.event_staff_hits FROM anon;

-- 3) Helpers internos (NO ejecutables por el cliente; solo desde las RPCs definer).
--    Gate de la puerta: rate-limit global + valida la llave -> slug, o RAISE.
CREATE OR REPLACE FUNCTION public._event_staff_gate(p_key text, p_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_slug text; v_hits int;
BEGIN
  SELECT count(*) INTO v_hits FROM public.event_staff_hits WHERE at > now() - interval '1 minute';
  IF v_hits >= 600 THEN RAISE EXCEPTION 'demasiadas_solicitudes' USING ERRCODE='PT429'; END IF;
  SELECT slug INTO v_slug FROM public.event_events
    WHERE staff_enabled = true AND staff_key IS NOT NULL AND staff_key = p_key
    LIMIT 1;
  IF v_slug IS NULL THEN
    INSERT INTO public.event_staff_hits(event_slug, kind) VALUES ('(bad)', 'bad_key');
    RAISE EXCEPTION 'acceso_invalido' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.event_staff_hits(event_slug, kind) VALUES (v_slug, p_kind);
  RETURN v_slug;
END; $fn$;

--    Resuelve p_code (token completo del QR, o código de 6 tipeado) a una reserva.
CREATE OR REPLACE FUNCTION public._event_staff_find(p_slug text, p_code text)
RETURNS public.event_registrations LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_code text := lower(regexp_replace(coalesce(p_code,''), '[^0-9a-fA-F]', '', 'g'));
        v_reg public.event_registrations%ROWTYPE; v_n int;
BEGIN
  IF length(v_code) >= 16 THEN
    SELECT * INTO v_reg FROM public.event_registrations
      WHERE event_slug = p_slug AND ticket_token = v_code LIMIT 1;
  ELSIF length(v_code) = 6 THEN
    SELECT count(*) INTO v_n FROM public.event_registrations
      WHERE event_slug = p_slug AND left(ticket_token, 6) = v_code;
    IF v_n = 1 THEN
      SELECT * INTO v_reg FROM public.event_registrations
        WHERE event_slug = p_slug AND left(ticket_token, 6) = v_code LIMIT 1;
    END IF;  -- 0 o >1 => v_reg NULL (no encontrada / ambigua)
  END IF;
  RETURN v_reg;
END; $fn$;

-- 4) RPCs públicos de puerta (anon+auth): gateados por la LLAVE, retorno mínimo.
CREATE OR REPLACE FUNCTION public.event_staff_auth(p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_slug text; v_ev public.event_events%ROWTYPE;
BEGIN
  v_slug := public._event_staff_gate(p_key, 'auth');
  SELECT * INTO v_ev FROM public.event_events WHERE slug = v_slug;
  RETURN jsonb_build_object('ok', true, 'titulo', v_ev.titulo, 'fecha', v_ev.fecha_texto, 'lugar', v_ev.lugar_texto);
EXCEPTION
  WHEN sqlstate '42501' THEN RETURN jsonb_build_object('ok', false, 'reason', 'acceso_invalido');
  WHEN sqlstate 'PT429' THEN RETURN jsonb_build_object('ok', false, 'reason', 'demasiadas_solicitudes');
END; $fn$;

CREATE OR REPLACE FUNCTION public.event_staff_lookup(p_key text, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_slug text; v_reg public.event_registrations%ROWTYPE;
BEGIN
  v_slug := public._event_staff_gate(p_key, 'lookup');
  v_reg := public._event_staff_find(v_slug, p_code);
  IF v_reg.id IS NULL THEN RETURN jsonb_build_object('ok', true, 'found', false); END IF;
  RETURN jsonb_build_object('ok', true, 'found', true,
    'nombre', v_reg.nombre, 'personas', 1 + v_reg.acompanantes,
    'status', v_reg.status, 'checked_in_at', v_reg.checked_in_at,
    'code', upper(left(v_reg.ticket_token, 6)));
EXCEPTION
  WHEN sqlstate '42501' THEN RETURN jsonb_build_object('ok', false, 'reason', 'acceso_invalido');
  WHEN sqlstate 'PT429' THEN RETURN jsonb_build_object('ok', false, 'reason', 'demasiadas_solicitudes');
END; $fn$;

CREATE OR REPLACE FUNCTION public.event_staff_checkin(p_key text, p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_slug text; v_reg public.event_registrations%ROWTYPE; v_already boolean := false;
BEGIN
  v_slug := public._event_staff_gate(p_key, 'checkin');
  v_reg := public._event_staff_find(v_slug, p_code);
  IF v_reg.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'found', false); END IF;
  IF v_reg.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cancelada', 'nombre', v_reg.nombre);
  END IF;
  IF v_reg.checked_in_at IS NOT NULL THEN
    v_already := true;
  ELSE
    UPDATE public.event_registrations SET checked_in_at = now(), updated_at = now()
      WHERE id = v_reg.id AND checked_in_at IS NULL
      RETURNING * INTO v_reg;
    IF NOT FOUND THEN  -- carrera: otro puesto lo marcó en el ínterin
      SELECT * INTO v_reg FROM public.event_registrations WHERE id = v_reg.id;
      v_already := true;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'found', true, 'already', v_already,
    'nombre', v_reg.nombre, 'personas', 1 + v_reg.acompanantes,
    'checked_in_at', v_reg.checked_in_at, 'code', upper(left(v_reg.ticket_token, 6)));
EXCEPTION
  WHEN sqlstate '42501' THEN RETURN jsonb_build_object('ok', false, 'reason', 'acceso_invalido');
  WHEN sqlstate 'PT429' THEN RETURN jsonb_build_object('ok', false, 'reason', 'demasiadas_solicitudes');
END; $fn$;

-- 5) RPCs de gestión (PASTOR ONLY): generar / activar / regenerar la llave.
CREATE OR REPLACE FUNCTION public.event_staff_key_ensure(p_slug text DEFAULT 'thechosen')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_key text; v_enabled boolean;
BEGIN
  IF coalesce(public.is_pastor(), false) IS NOT TRUE THEN RAISE EXCEPTION 'no_autorizado' USING ERRCODE='42501'; END IF;
  SELECT staff_key, staff_enabled INTO v_key, v_enabled FROM public.event_events WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'evento_inexistente' USING ERRCODE='22023'; END IF;
  IF v_key IS NULL THEN
    v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    UPDATE public.event_events SET staff_key = v_key, updated_at = now() WHERE slug = p_slug;
  END IF;
  RETURN jsonb_build_object('ok', true, 'key', v_key, 'enabled', coalesce(v_enabled, false));
END; $fn$;

CREATE OR REPLACE FUNCTION public.event_staff_set_enabled(p_slug text, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
  IF coalesce(public.is_pastor(), false) IS NOT TRUE THEN RAISE EXCEPTION 'no_autorizado' USING ERRCODE='42501'; END IF;
  UPDATE public.event_events SET staff_enabled = coalesce(p_enabled, false), updated_at = now() WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'evento_inexistente' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('ok', true, 'enabled', coalesce(p_enabled, false));
END; $fn$;

CREATE OR REPLACE FUNCTION public.event_staff_rotate(p_slug text DEFAULT 'thechosen')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_key text;
BEGIN
  IF coalesce(public.is_pastor(), false) IS NOT TRUE THEN RAISE EXCEPTION 'no_autorizado' USING ERRCODE='42501'; END IF;
  v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  UPDATE public.event_events SET staff_key = v_key, updated_at = now() WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'evento_inexistente' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('ok', true, 'key', v_key);
END; $fn$;

-- 6) Grants / blindaje de ACL.
--    Helpers internos: nadie del cliente los ejecuta (solo las RPCs definer, como owner).
REVOKE ALL ON FUNCTION public._event_staff_gate(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._event_staff_find(text, text) FROM PUBLIC, anon, authenticated;
--    Puerta (voluntarios sin login): anon + authenticated.
REVOKE ALL ON FUNCTION public.event_staff_auth(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_staff_lookup(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.event_staff_checkin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_staff_auth(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_staff_lookup(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_staff_checkin(text, text) TO anon, authenticated;
--    Gestión: solo authenticated (gate interno is_pastor); anon nunca.
REVOKE ALL ON FUNCTION public.event_staff_key_ensure(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.event_staff_set_enabled(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.event_staff_rotate(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_staff_key_ensure(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_staff_set_enabled(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_staff_rotate(text) TO authenticated;
