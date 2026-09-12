-- Auditoría transversal de roles y permisos (2026-09-12, pedido de Paul: "que nadie vea nada
-- incorrecto"). Remediaciones del lado servidor. Cada bloque cierra un hallazgo verificado en
-- prod (pg_policies / pg_proc / impersonación en BEGIN…ROLLBACK). Aditivo y reversible.
--
--  H2  notifications: la policy de UPDATE no tenía WITH CHECK → un miembro podía convertir una
--      notificación propia en GLOBAL con texto arbitrario. El cliente nunca hace UPDATE/DELETE
--      sobre notifications (marca leído en notifications_read) → se revoca y se quitan policies.
--  H4  storage avatars: cualquier autenticado podía sobrescribir/borrar la foto de OTRO
--      (policies solo miraban bucket_id). Ahora: INSERT solo con prefijo propio (member id o
--      auth uid, los dos formatos que usa el cliente), UPDATE/DELETE solo del dueño (owner_id).
--  H5  bands: un LÍDER podía sumarse a sí mismo a cualquier banda (append-only no lo excluía) y
--      con eso pasar todos los gates "líder de la banda" (ensamble, feedback, avisos). Ahora el
--      líder no puede agregar su propio id (lo suma el pastor).
--  I3/L4 members: `leader_of` ("Tu líder") y `pastor_area` estaban congelados para no-pastores
--      pero son datos PERSONALES editables desde "Mi perfil" → se descongelan. `email` pasa al
--      freeze (el cambio de correo va SOLO por la EF admin-update-member, que sincroniza auth).
--  H3  cuenta desactivada con sesión viva: todas las policies de SELECT eran `true` → seguía
--      leyendo todo. Ahora exigen `auth_role() IS NOT NULL` (= ficha activa); en members se
--      permite además la fila propia (para que el cliente pueda explicar "cuenta desactivada").
--  H1  pending_registrations (formulario público): el nombre viajaba CRUDO al HTML del correo
--      "registro-pendiente" y al header To: (inyección de cabeceras / relay de phishing con la
--      identidad del ministerio); INSERT con WITH CHECK (true) permitía status/assigned_role
--      arbitrarios. Ahora: trigger de saneo (largos, control chars, email en minúscula), policies
--      con WITH CHECK (solo 'pending' sin aprobaciones) y `_html_escape` en el correo.
--  L3  notify_on_order_insert/_update: `banda_sufijo` crudo en plantillas RAW → escapado.
--  L7  hora del ensamble/servicio: regex aceptaba 24:00–29:59 → CHECK + regex correcto.

-- ---------------------------------------------------------------------------------------
-- H2 · notifications: sin UPDATE/DELETE desde el cliente
-- ---------------------------------------------------------------------------------------
REVOKE UPDATE, DELETE ON public.notifications FROM anon, authenticated;
DROP POLICY IF EXISTS "Allow update notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow delete notifications" ON public.notifications;

-- ---------------------------------------------------------------------------------------
-- H4 · storage avatars: solo lo propio
-- ---------------------------------------------------------------------------------------
DROP POLICY IF EXISTS avatars_authenticated_insert ON storage.objects;
DROP POLICY IF EXISTS avatars_authenticated_update ON storage.objects;
DROP POLICY IF EXISTS avatars_authenticated_delete ON storage.objects;

CREATE POLICY avatars_authenticated_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      name LIKE 'avatars/' || (SELECT auth.uid())::text || '-%'
      OR name LIKE 'avatars/' || COALESCE((SELECT public.my_member_id())::text, '00000000-0000-0000-0000-000000000000') || '-%'
    )
  );

CREATE POLICY avatars_authenticated_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND owner_id = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'avatars' AND owner_id = (SELECT auth.uid())::text);

CREATE POLICY avatars_authenticated_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND owner_id = (SELECT auth.uid())::text);

-- ---------------------------------------------------------------------------------------
-- H5 · bands: el líder no puede sumarse a sí mismo (SECURITY INVOKER, como estaba)
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_band_update_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := public.auth_role();
  v_me uuid := public.my_member_id();
BEGIN
  IF v_role = 'pastor' THEN
    RETURN NEW;
  END IF;

  IF v_role = 'leader' THEN
    IF NOT (COALESCE(NEW.members, '{}'::uuid[]) @> COALESCE(OLD.members, '{}'::uuid[])) THEN
      RAISE EXCEPTION 'Como líder solo podés agregar integrantes a la banda, no quitarlos. Pedile al pastor que quite o edite integrantes.'
        USING ERRCODE = 'P0001';
    END IF;
    -- Auditoría 2026-09-12: un líder NO puede agregarse a sí mismo a una banda de la que no es
    -- integrante (con eso pasaría a "líder de esa banda" para ensamble/feedback/avisos).
    IF v_me IS NOT NULL
       AND v_me = ANY (COALESCE(NEW.members, '{}'::uuid[]))
       AND NOT (v_me = ANY (COALESCE(OLD.members, '{}'::uuid[]))) THEN
      RAISE EXCEPTION 'Un líder no puede sumarse a sí mismo a una banda: pedile al pastor que te agregue.'
        USING ERRCODE = 'P0001';
    END IF;
    IF (NEW.id            IS DISTINCT FROM OLD.id)
       OR (NEW.name         IS DISTINCT FROM OLD.name)
       OR (NEW.meeting_type IS DISTINCT FROM OLD.meeting_type)
       OR (NEW.meeting_day  IS DISTINCT FROM OLD.meeting_day)
       OR (NEW.meeting_time IS DISTINCT FROM OLD.meeting_time)
       OR (NEW.active       IS DISTINCT FROM OLD.active)
       OR (NEW.created_at   IS DISTINCT FROM OLD.created_at) THEN
      RAISE EXCEPTION 'Como líder solo podés agregar integrantes; el resto de los datos de la banda los edita el pastor.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'No tenés permiso para modificar bandas.'
    USING ERRCODE = 'P0001';
END;
$function$;

-- ---------------------------------------------------------------------------------------
-- I3 / L4 · members: leader_of y pastor_area son personales; email pasa al freeze.
-- DEBE seguir SECURITY INVOKER (landmine #41): exime backend por rolbypassrls.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_member_update_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RETURN NEW;
  END IF;
  IF (SELECT public.is_pastor()) THEN
    RETURN NEW;
  END IF;
  IF (NEW.role          IS DISTINCT FROM OLD.role)
     OR (NEW.editor        IS DISTINCT FROM OLD.editor)
     OR (NEW.active        IS DISTINCT FROM OLD.active)
     OR (NEW.user_id       IS DISTINCT FROM OLD.user_id)
     OR (NEW.id            IS DISTINCT FROM OLD.id)
     OR (NEW.email         IS DISTINCT FROM OLD.email)
     OR (NEW.password_hash IS DISTINCT FROM OLD.password_hash)
     OR (NEW.created_at    IS DISTINCT FROM OLD.created_at)
     OR (NEW.areas         IS DISTINCT FROM OLD.areas)
  THEN
    RAISE EXCEPTION 'No tenés permiso para cambiar rol, estado, permisos de edición, área, correo ni el vínculo de cuenta de un miembro. Solo un pastor puede hacerlo.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------------------
-- H3 · lectura solo con ficha ACTIVA (auth_role() exige active=true). En members se permite
-- además la fila propia, así el cliente puede ver `active=false` y cerrar la sesión con
-- explicación. `(SELECT …)` → se evalúa una vez por consulta (InitPlan), no por fila.
-- ---------------------------------------------------------------------------------------
DROP POLICY IF EXISTS members_select_auth ON public.members;
CREATE POLICY members_select_auth ON public.members FOR SELECT TO authenticated
  USING ((SELECT public.auth_role()) IS NOT NULL OR user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS orders_select_auth ON public.orders;
CREATE POLICY orders_select_auth ON public.orders FOR SELECT TO authenticated
  USING ((SELECT public.auth_role()) IS NOT NULL);

DROP POLICY IF EXISTS songs_select_auth ON public.songs;
CREATE POLICY songs_select_auth ON public.songs FOR SELECT TO authenticated
  USING ((SELECT public.auth_role()) IS NOT NULL);

DROP POLICY IF EXISTS bands_select_auth ON public.bands;
CREATE POLICY bands_select_auth ON public.bands FOR SELECT TO authenticated
  USING ((SELECT public.auth_role()) IS NOT NULL);

DROP POLICY IF EXISTS btm_select_auth ON public.band_temporary_members;
CREATE POLICY btm_select_auth ON public.band_temporary_members FOR SELECT TO authenticated
  USING ((SELECT public.auth_role()) IS NOT NULL);

DROP POLICY IF EXISTS communications_select_auth ON public.communications;
CREATE POLICY communications_select_auth ON public.communications FOR SELECT TO authenticated
  USING ((SELECT public.auth_role()) IS NOT NULL);

DROP POLICY IF EXISTS skh_select_auth ON public.song_key_history;
CREATE POLICY skh_select_auth ON public.song_key_history FOR SELECT TO authenticated
  USING ((SELECT public.auth_role()) IS NOT NULL);

DROP POLICY IF EXISTS ocp_select ON public.order_channel_plans;
CREATE POLICY ocp_select ON public.order_channel_plans FOR SELECT TO authenticated
  USING ((SELECT public.auth_role()) IS NOT NULL);

-- ---------------------------------------------------------------------------------------
-- H1 · pending_registrations: saneo + WITH CHECK + correo escapado
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sanitize_pending_registration()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  clean text;
BEGIN
  -- nombre: sin caracteres de control (inyección de cabeceras), espacios colapsados, tope 120
  clean := btrim(regexp_replace(regexp_replace(COALESCE(NEW.name, ''), '[[:cntrl:]]+', ' ', 'g'), '\s+', ' ', 'g'));
  IF clean = '' THEN
    RAISE EXCEPTION 'El nombre es obligatorio.' USING ERRCODE = '22023';
  END IF;
  NEW.name := left(clean, 120);

  -- email: minúscula, sin espacios, formato básico, tope 200
  NEW.email := lower(btrim(regexp_replace(COALESCE(NEW.email, ''), '[[:cntrl:][:space:]]+', '', 'g')));
  IF NEW.email !~ '^[^@]+@[^@]+\.[^@]+$' OR length(NEW.email) > 200 THEN
    RAISE EXCEPTION 'El correo no es válido.' USING ERRCODE = '22023';
  END IF;

  NEW.phone       := NULLIF(left(btrim(regexp_replace(COALESCE(NEW.phone, ''), '[[:cntrl:]]+', '', 'g')), 40), '');
  NEW.leader_of   := NULLIF(left(btrim(regexp_replace(COALESCE(NEW.leader_of, ''), '[[:cntrl:]]+', ' ', 'g')), 120), '');
  NEW.pastor_area := NULLIF(left(btrim(regexp_replace(COALESCE(NEW.pastor_area, ''), '[[:cntrl:]]+', ' ', 'g')), 120), '');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS aa_sanitize_pending_registration ON public.pending_registrations;
CREATE TRIGGER aa_sanitize_pending_registration
  BEFORE INSERT ON public.pending_registrations
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_pending_registration();

DROP POLICY IF EXISTS pending_reg_insert_anon ON public.pending_registrations;
CREATE POLICY pending_reg_insert_anon ON public.pending_registrations FOR INSERT TO anon
  WITH CHECK (
    status = 'pending' AND assigned_role IS NULL AND password_hash IS NULL
    AND approved_by IS NULL AND approved_at IS NULL AND rejected_by IS NULL AND rejected_at IS NULL
  );
DROP POLICY IF EXISTS pending_reg_insert_auth ON public.pending_registrations;
CREATE POLICY pending_reg_insert_auth ON public.pending_registrations FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending' AND assigned_role IS NULL AND password_hash IS NULL
    AND approved_by IS NULL AND approved_at IS NULL AND rejected_by IS NULL AND rejected_at IS NULL
  );

-- Correo "registro-pendiente": el nombre va ESCAPADO al HTML (la plantilla se renderiza RAW).
CREATE OR REPLACE FUNCTION public.notify_on_pending_registration_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  pastor RECORD;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  FOR pastor IN
    SELECT user_id FROM public.members WHERE role = 'pastor' AND user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, is_global, created_at, expires_at)
    VALUES (
      pastor.user_id,
      'Solicitud de registro',
      COALESCE(NEW.name, 'Alguien') || ' se quiere registrar al ministerio',
      'request', false, NOW(), NOW() + INTERVAL '30 days'
    );
  END LOOP;

  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    BEGIN
      PERFORM public.encolar_email(
        'registro-pendiente', NEW.email, NEW.name,
        jsonb_build_object('nombre', public._html_escape(COALESCE(NEW.name, ''))), 1::smallint
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_on_pending_registration_insert: email enqueue failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.notify_on_pending_registration_insert() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- L3 · banda_sufijo escapado en los correos de alta/edición de orden (plantillas RAW).
-- Se reescriben las funciones vivas reemplazando el patrón exacto; si no aparece, ABORTA.
-- CREATE OR REPLACE conserva dueño y permisos (no toca grants).
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE r record; d text; n int;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname IN ('notify_on_order_insert', 'notify_on_order_update')
  LOOP
    d := pg_get_functiondef(r.oid);
    n := (length(d) - length(replace(d, '''banda_sufijo'', v_sufijo,', ''))) / length('''banda_sufijo'', v_sufijo,');
    IF n = 0 THEN
      RAISE EXCEPTION 'auditoría: patrón banda_sufijo crudo no encontrado en %', r.proname;
    END IF;
    EXECUTE replace(d, '''banda_sufijo'', v_sufijo,', '''banda_sufijo'', public._html_escape(v_sufijo),');
    RAISE NOTICE 'auditoría: % → % ocurrencias de banda_sufijo escapadas', r.proname, n;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------
-- L7 · hora HH:MM válida (00–23). Datos actuales: 0 filas fuera de formato (verificado).
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.reschedule_order_rehearsal'::regproc);
  IF position('''^[0-2][0-9]:[0-5][0-9]$''' IN d) = 0 THEN
    RAISE EXCEPTION 'auditoría: regex de hora no encontrada en reschedule_order_rehearsal';
  END IF;
  EXECUTE replace(d, '''^[0-2][0-9]:[0-5][0-9]$''', '''^([01][0-9]|2[0-3]):[0-5][0-9]$''');
END $$;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_time_hhmm_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_time_hhmm_check
  CHECK (time IS NULL OR time = '' OR time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_rehearsal_time_hhmm_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_rehearsal_time_hhmm_check
  CHECK (rehearsal_time IS NULL OR rehearsal_time = '' OR rehearsal_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- ---------------------------------------------------------------------------------------
-- RT-1 · RPCs de ensamble: guard NULL-safe. Para una cuenta INACTIVA `auth_role()` es NULL →
-- `_can_manage_order_rehearsal` devuelve NULL → `IF NOT NULL` no rechaza y, como los RPC son
-- SECURITY DEFINER, el UPDATE + fan-out masivo procedían (red-team lo confirmó en ROLLBACK).
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE r record; d text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname IN ('suspend_order_rehearsal', 'resume_order_rehearsal', 'reschedule_order_rehearsal')
  LOOP
    d := pg_get_functiondef(r.oid);
    IF position('IF NOT public._can_manage_order_rehearsal(p_order_id) THEN' IN d) = 0 THEN
      RAISE EXCEPTION 'auditoría: guard _can_manage no encontrado en %', r.proname;
    END IF;
    EXECUTE replace(d, 'IF NOT public._can_manage_order_rehearsal(p_order_id) THEN',
                       'IF NOT COALESCE(public._can_manage_order_rehearsal(p_order_id), false) THEN');
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------
-- RT-2 · communications: el texto completo de TODAS las comunicaciones (incluidas las dirigidas
-- a personas puntuales) era legible por cualquier autenticado. El cliente nunca lee esta tabla
-- (la campanita usa communication_notifications, own-only) → SELECT solo pastor.
-- ---------------------------------------------------------------------------------------
DROP POLICY IF EXISTS communications_select_auth ON public.communications;
CREATE POLICY communications_select_pastor ON public.communications FOR SELECT TO authenticated
  USING ((SELECT public.is_pastor()));

-- ---------------------------------------------------------------------------------------
-- RT-3 / L6 · autoría firmada por el servidor (no por el cliente): order_channel_plans.updated_by,
-- service_schemas.created_by, schema_templates.created_by = mi ficha (my_member_id()); en UPDATE
-- created_by no cambia. El backend (service_role/postgres, rolbypassrls) queda exento.
-- ---------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.force_author_updated_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN RETURN NEW; END IF;
  NEW.updated_by := public.my_member_id();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.force_author_created_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := public.my_member_id();
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS force_author_ocp ON public.order_channel_plans;
CREATE TRIGGER force_author_ocp BEFORE INSERT OR UPDATE ON public.order_channel_plans
  FOR EACH ROW EXECUTE FUNCTION public.force_author_updated_by();
DROP TRIGGER IF EXISTS force_author_service_schemas ON public.service_schemas;
CREATE TRIGGER force_author_service_schemas BEFORE INSERT OR UPDATE ON public.service_schemas
  FOR EACH ROW EXECUTE FUNCTION public.force_author_created_by();
DROP TRIGGER IF EXISTS force_author_schema_templates ON public.schema_templates;
CREATE TRIGGER force_author_schema_templates BEFORE INSERT OR UPDATE ON public.schema_templates
  FOR EACH ROW EXECUTE FUNCTION public.force_author_created_by();
