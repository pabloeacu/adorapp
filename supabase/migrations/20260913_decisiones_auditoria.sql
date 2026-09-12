-- Decisiones de Paul sobre la auditoría de roles y permisos (2026-09-12, Estado (X)):
--   D2  Los datos personales de los miembros (correo, teléfono, cumpleaños) NO viajan a
--       quien no es pastor. La tabla `members` deja de exponer esas tres columnas a la
--       API del cliente; el cliente lee la vista `members_directory`, que las muestra
--       SOLO al pastor y a cada uno sobre su propia ficha.
--   D5  Las columnas `password_hash` (vacías: 0 filas con valor, 0 referencias en el
--       código) se eliminan de `members` y `pending_registrations`.
--   D6  `error_log` y `health_checks` (las dos tablas detrás de las Edge Functions
--       anónimas `log-error` y `record-health-check`) quedan con freno de volumen en la
--       base y sin permisos de escritura para el cliente (solo service_role).
--   (D1 se mantiene; D3 es cliente + Edge Function; D4 postergada.)
--
-- Todo aditivo salvo (a) el DROP de las columnas vacías y (b) el REVOKE de SELECT sobre
-- `members` para el cliente, que se aplica en la migración hermana
-- `20260913_members_revoke_select.sql` DESPUÉS de publicar el cliente que lee la vista.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- D5 · password_hash fuera (primero quien lo referencia, después la columna)
-- ─────────────────────────────────────────────────────────────────────────────

-- Freeze de columnas privilegiadas de members (sigue SECURITY INVOKER, landmine #41).
CREATE OR REPLACE FUNCTION public.enforce_member_update_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RETURN NEW;
  END IF;
  IF (SELECT public.is_pastor()) THEN
    RETURN NEW;
  END IF;
  IF (NEW.role       IS DISTINCT FROM OLD.role)
     OR (NEW.editor     IS DISTINCT FROM OLD.editor)
     OR (NEW.active     IS DISTINCT FROM OLD.active)
     OR (NEW.user_id    IS DISTINCT FROM OLD.user_id)
     OR (NEW.id         IS DISTINCT FROM OLD.id)
     OR (NEW.email      IS DISTINCT FROM OLD.email)
     OR (NEW.created_at IS DISTINCT FROM OLD.created_at)
     OR (NEW.areas      IS DISTINCT FROM OLD.areas)
  THEN
    RAISE EXCEPTION 'No tenés permiso para cambiar rol, estado, permisos de edición, área, correo ni el vínculo de cuenta de un miembro. Solo un pastor puede hacerlo.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Políticas de alta de solicitudes: mismas guardas, sin la columna que desaparece.
DROP POLICY IF EXISTS pending_reg_insert_anon ON public.pending_registrations;
DROP POLICY IF EXISTS pending_reg_insert_auth ON public.pending_registrations;
CREATE POLICY pending_reg_insert_anon ON public.pending_registrations
  FOR INSERT TO anon
  WITH CHECK (status = 'pending' AND assigned_role IS NULL
              AND approved_by IS NULL AND approved_at IS NULL
              AND rejected_by IS NULL AND rejected_at IS NULL);
CREATE POLICY pending_reg_insert_auth ON public.pending_registrations
  FOR INSERT TO authenticated
  WITH CHECK (status = 'pending' AND assigned_role IS NULL
              AND approved_by IS NULL AND approved_at IS NULL
              AND rejected_by IS NULL AND rejected_at IS NULL);

ALTER TABLE public.members               DROP COLUMN IF EXISTS password_hash;
ALTER TABLE public.pending_registrations DROP COLUMN IF EXISTS password_hash;

-- ─────────────────────────────────────────────────────────────────────────────
-- D2 · Directorio de miembros sin datos personales para quien no es pastor
-- ─────────────────────────────────────────────────────────────────────────────

-- Correo/teléfono/cumpleaños de UNA ficha, solo si quien pregunta es pastor o es la
-- propia ficha. SECURITY DEFINER porque el cliente deja de tener SELECT sobre esas
-- columnas en la tabla (migración hermana); devuelve 0 filas → NULLs en la vista.
CREATE OR REPLACE FUNCTION public.member_private_fields(p_member_id uuid)
RETURNS TABLE (email text, phone text, birthdate date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.email, m.phone, m.birthdate
  FROM public.members m
  WHERE m.id = p_member_id
    AND (m.user_id = auth.uid() OR public.is_pastor());
$$;
REVOKE EXECUTE ON FUNCTION public.member_private_fields(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.member_private_fields(uuid) TO authenticated, service_role;

-- La vista corre con los permisos de quien la lee (security_invoker): la RLS de
-- `members` decide QUÉ filas (ficha activa + la propia, landmine #69) y la función
-- de arriba decide si los tres datos personales van con valor o en NULL.
DROP VIEW IF EXISTS public.members_directory;
CREATE VIEW public.members_directory
WITH (security_invoker = true)
AS
SELECT m.id, m.name, m.role, m.instruments, m.active, m.user_id, m.avatar_url,
       m.created_at, m.updated_at, m.pastor_area, m.leader_of, m.editor, m.onboarded, m.areas,
       p.email, p.phone, p.birthdate
FROM public.members m
LEFT JOIN LATERAL public.member_private_fields(m.id) p ON true;

REVOKE ALL ON public.members_directory FROM PUBLIC, anon;
GRANT SELECT ON public.members_directory TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- D6 · Tablas detrás de las Edge Functions anónimas: freno de volumen + solo backend
-- ─────────────────────────────────────────────────────────────────────────────

-- El cliente nunca escribe estas tablas directo (va por las Edge Functions con
-- service_role). Se quita el grant redundante (patrón landmine #45); `error_log`
-- conserva UPDATE para que el pastor marque errores como resueltos.
REVOKE INSERT, UPDATE, DELETE ON public.health_checks FROM anon, authenticated;
REVOKE INSERT, DELETE         ON public.error_log     FROM anon, authenticated;

-- Freno global de volumen (mismo patrón que rate_limit_pending_registrations):
-- ningún flujo legítimo se acerca (uptime = 12 filas/hora; un deploy con 30 usuarios
-- adentro = decenas de errores por minuto), un bot sí. Devuelve 429 (PT429).
CREATE OR REPLACE FUNCTION public.rate_limit_error_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last_minute int;
BEGIN
  SELECT count(*) INTO v_last_minute
  FROM public.error_log
  WHERE occurred_at > now() - interval '1 minute';
  IF v_last_minute >= 300 THEN
    RAISE EXCEPTION 'Demasiados errores reportados en un minuto; intentá más tarde.'
      USING ERRCODE = 'PT429';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rate_limit_error_log() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rate_limit_health_checks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last_minute int;
BEGIN
  SELECT count(*) INTO v_last_minute
  FROM public.health_checks
  WHERE checked_at > now() - interval '1 minute';
  IF v_last_minute >= 30 THEN
    RAISE EXCEPTION 'Demasiados pings de salud en un minuto; intentá más tarde.'
      USING ERRCODE = 'PT429';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rate_limit_health_checks() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rate_limit_error_log ON public.error_log;
CREATE TRIGGER rate_limit_error_log
  BEFORE INSERT ON public.error_log
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_error_log();

DROP TRIGGER IF EXISTS rate_limit_health_checks ON public.health_checks;
CREATE TRIGGER rate_limit_health_checks
  BEFORE INSERT ON public.health_checks
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_health_checks();

COMMIT;
