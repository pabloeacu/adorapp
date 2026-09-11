-- ============================================================================
-- Registro con área declarada por el solicitante + regla "Adoración-primero" en push.
-- ============================================================================

-- 1) El que se registra declara su área (el pastor puede cambiarla al aprobar).
ALTER TABLE public.pending_registrations
  ADD COLUMN IF NOT EXISTS areas text[] NOT NULL DEFAULT '{}'::text[];
-- El form público inserta como anon; el grant de tabla cubre la columna nueva.
-- Se re-asierta por prolijidad (idempotente).
GRANT INSERT ON public.pending_registrations TO anon, authenticated;

-- 2) Área "principal" para PUSH. Adoración es el área principal de la plataforma:
--    si el miembro la tiene (aunque además tenga Multimedia/Sonido) los push van como
--    Adoración. Devuelve NULL cuando corresponde el mensaje genérico (tiene Adoración,
--    o no tiene área observadora); si es observador PURO devuelve la etiqueta de sus
--    áreas observadoras (Multimedia/Sonido).
CREATE OR REPLACE FUNCTION public._member_push_area_label(p_areas text[])
  RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $$
  SELECT CASE
    WHEN 'adoracion' = ANY(COALESCE(p_areas, '{}'::text[])) THEN NULL
    ELSE public._member_observer_area_labels(p_areas)
  END
$$;

-- 3) Push de bienvenida usando el área principal para push (Adoración-primero).
CREATE OR REPLACE FUNCTION public.notify_on_member_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_obs text;
  v_msg text;
BEGIN
  v_obs := public._member_push_area_label(NEW.areas);
  IF v_obs IS NOT NULL THEN
    v_msg := '¡Bienvenido/a a bordo, ' || COALESCE(NEW.name, '') || ' (' || v_obs || ')! Somos una familia en Cristo.';
  ELSE
    v_msg := 'Bienvenido/a ' || COALESCE(NEW.name, 'a la familia') || ' a la familia de adoración';
  END IF;

  INSERT INTO public.notifications (title, message, type, is_global, created_at, expires_at)
  VALUES ('Nuevo miembro', v_msg, 'member', true, NOW(), NOW() + INTERVAL '7 days');
  RETURN NEW;
END;
$function$;
