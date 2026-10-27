-- HARDENING del control de acceso: la LLAVE de puerta NO puede vivir en
-- event_events (que tiene SELECT público para la landing) -> anon podría leerla.
-- La movemos a event_staff_access, tabla SIN acceso de cliente (default-deny,
-- REVOKE total): SOLO las RPCs SECURITY DEFINER la tocan. El pastor obtiene/ve la
-- llave exclusivamente por RPC. (La llave estaba en NULL; no hubo exposición real.)

CREATE TABLE IF NOT EXISTS public.event_staff_access (
  event_slug text PRIMARY KEY REFERENCES public.event_events(slug) ON DELETE CASCADE,
  staff_key  text,
  enabled    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_staff_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_staff_access FORCE ROW LEVEL SECURITY;
-- Sin policies -> default-deny para TODO cliente. Acceso solo vía RPCs definer.
REVOKE ALL ON public.event_staff_access FROM PUBLIC, anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_staff_access_key
  ON public.event_staff_access(staff_key) WHERE staff_key IS NOT NULL;

-- Migrar lo que hubiera en las columnas viejas (normalmente nada).
INSERT INTO public.event_staff_access(event_slug, staff_key, enabled)
SELECT slug, staff_key, staff_enabled FROM public.event_events
WHERE staff_key IS NOT NULL OR staff_enabled = true
ON CONFLICT (event_slug) DO NOTHING;

-- Gate: ahora valida la llave contra event_staff_access.
CREATE OR REPLACE FUNCTION public._event_staff_gate(p_key text, p_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_slug text; v_hits int;
BEGIN
  SELECT count(*) INTO v_hits FROM public.event_staff_hits WHERE at > now() - interval '1 minute';
  IF v_hits >= 600 THEN RAISE EXCEPTION 'demasiadas_solicitudes' USING ERRCODE='PT429'; END IF;
  SELECT event_slug INTO v_slug FROM public.event_staff_access
    WHERE enabled = true AND staff_key IS NOT NULL AND staff_key = p_key
    LIMIT 1;
  IF v_slug IS NULL THEN
    INSERT INTO public.event_staff_hits(event_slug, kind) VALUES ('(bad)', 'bad_key');
    RAISE EXCEPTION 'acceso_invalido' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.event_staff_hits(event_slug, kind) VALUES (v_slug, p_kind);
  RETURN v_slug;
END; $fn$;

-- Gestión pastor: estado (lee), generar, activar/desactivar, regenerar.
CREATE OR REPLACE FUNCTION public.event_staff_status(p_slug text DEFAULT 'thechosen')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_key text; v_enabled boolean;
BEGIN
  IF coalesce(public.is_pastor(), false) IS NOT TRUE THEN RAISE EXCEPTION 'no_autorizado' USING ERRCODE='42501'; END IF;
  SELECT staff_key, enabled INTO v_key, v_enabled FROM public.event_staff_access WHERE event_slug = p_slug;
  RETURN jsonb_build_object('ok', true, 'has_key', v_key IS NOT NULL, 'enabled', coalesce(v_enabled, false), 'key', v_key);
END; $fn$;

CREATE OR REPLACE FUNCTION public.event_staff_key_ensure(p_slug text DEFAULT 'thechosen')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_key text; v_enabled boolean; v_found boolean;
BEGIN
  IF coalesce(public.is_pastor(), false) IS NOT TRUE THEN RAISE EXCEPTION 'no_autorizado' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.event_events WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'evento_inexistente' USING ERRCODE='22023'; END IF;
  SELECT staff_key, enabled INTO v_key, v_enabled FROM public.event_staff_access WHERE event_slug = p_slug;
  v_found := FOUND;
  IF NOT v_found THEN
    v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    INSERT INTO public.event_staff_access(event_slug, staff_key) VALUES (p_slug, v_key);
    v_enabled := false;
  ELSIF v_key IS NULL THEN
    v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    UPDATE public.event_staff_access SET staff_key = v_key, updated_at = now() WHERE event_slug = p_slug;
  END IF;
  RETURN jsonb_build_object('ok', true, 'key', v_key, 'enabled', coalesce(v_enabled, false));
END; $fn$;

CREATE OR REPLACE FUNCTION public.event_staff_set_enabled(p_slug text, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
  IF coalesce(public.is_pastor(), false) IS NOT TRUE THEN RAISE EXCEPTION 'no_autorizado' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.event_events WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'evento_inexistente' USING ERRCODE='22023'; END IF;
  INSERT INTO public.event_staff_access(event_slug, enabled) VALUES (p_slug, coalesce(p_enabled, false))
    ON CONFLICT (event_slug) DO UPDATE SET enabled = excluded.enabled, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'enabled', coalesce(p_enabled, false));
END; $fn$;

CREATE OR REPLACE FUNCTION public.event_staff_rotate(p_slug text DEFAULT 'thechosen')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_key text;
BEGIN
  IF coalesce(public.is_pastor(), false) IS NOT TRUE THEN RAISE EXCEPTION 'no_autorizado' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.event_events WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'evento_inexistente' USING ERRCODE='22023'; END IF;
  v_key := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.event_staff_access(event_slug, staff_key) VALUES (p_slug, v_key)
    ON CONFLICT (event_slug) DO UPDATE SET staff_key = excluded.staff_key, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'key', v_key);
END; $fn$;

-- Quitar el vector: la llave ya no vive en una tabla de SELECT público.
ALTER TABLE public.event_events DROP COLUMN IF EXISTS staff_key;
ALTER TABLE public.event_events DROP COLUMN IF EXISTS staff_enabled;

-- Grants del nuevo RPC de estado (pastor-only).
REVOKE ALL ON FUNCTION public.event_staff_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_staff_status(text) TO authenticated;
