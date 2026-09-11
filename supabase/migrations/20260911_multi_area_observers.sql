-- ============================================================================
-- Multi-área — observadores de Multimedia y Sonido + área universal (PR 1 backend)
-- Aditivo. UNA columna nueva (members.areas), registro de capacidades en helpers,
-- freeze de seguridad, destinatarios de correo por área, línea de ensamble para
-- TODOS, aviso de formación a Sonido, y lectura del presentador para observadores.
-- No toca roles, ni escrituras, ni pastor_area. Devocionales/reflexiones ya son
-- globales (llegan a cualquier miembro, incluidos los de área) → sin cambios.
-- ============================================================================

-- 1) Columna de área (espeja members.instruments text[]). '{}' = como hoy. -------
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS areas text[] NOT NULL DEFAULT '{}'::text[];

-- 2) Backfill: músicos actuales = Adoración. Pastores quedan '{}' (multiárea x rol).
UPDATE public.members
   SET areas = ARRAY['adoracion']
 WHERE role IN ('leader','member')
   AND (areas IS NULL OR areas = '{}'::text[]);

-- 3) Registro de capacidades por área — FUENTE ÚNICA (editar acá para sumar áreas).
CREATE OR REPLACE FUNCTION public._area_email_slugs()
  RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $$ SELECT ARRAY['multimedia','sonido']::text[] $$;

CREATE OR REPLACE FUNCTION public._area_formation_slugs()
  RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $$ SELECT ARRAY['sonido']::text[] $$;

CREATE OR REPLACE FUNCTION public._area_presenter_slugs()
  RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $$ SELECT ARRAY['multimedia','sonido']::text[] $$;

CREATE OR REPLACE FUNCTION public._area_label(p_slug text)
  RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $$ SELECT CASE p_slug
    WHEN 'adoracion'  THEN 'Adoración'
    WHEN 'multimedia' THEN 'Multimedia'
    WHEN 'sonido'     THEN 'Sonido'
    ELSE initcap(COALESCE(p_slug,'')) END $$;

-- Etiquetas legibles de las áreas OBSERVADORAS de un miembro (excluye 'adoracion').
-- NULL si no tiene ninguna área observadora.
CREATE OR REPLACE FUNCTION public._member_observer_area_labels(p_areas text[])
  RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $$
  SELECT string_agg(public._area_label(a), ' y ' ORDER BY a)
  FROM unnest(COALESCE(p_areas,'{}'::text[])) a
  WHERE a <> 'adoracion'
$$;

-- Bloque HTML de ensamble (para el mail del orden, a TODOS). '' si no hay ensamble.
CREATE OR REPLACE FUNCTION public._ensamble_html(p_date date, p_time text)
  RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $$
  SELECT CASE WHEN p_date IS NULL THEN '' ELSE
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;"><tr>'
    || '<td style="padding:10px 14px;border:1px solid #e8d9a8;border-left:4px solid #b8860b;border-radius:8px;background:#fbf7ea;font-size:14px;line-height:1.5;color:#374151;">'
    || '<strong style="color:#8a6508;">Ensamble</strong> · '
    || (CASE extract(isodow from p_date)
          WHEN 1 THEN 'lunes' WHEN 2 THEN 'martes' WHEN 3 THEN 'miércoles'
          WHEN 4 THEN 'jueves' WHEN 5 THEN 'viernes' WHEN 6 THEN 'sábado'
          WHEN 7 THEN 'domingo' ELSE '' END)
    || ' ' || to_char(p_date,'DD/MM')
    || COALESCE(' a las ' || public._html_escape(NULLIF(p_time,'')), '')
    || '</td></tr></table>' END
$$;

-- 4) Freeze de seguridad: solo un pastor (o backend) cambia el área de un miembro.
--    SECURITY INVOKER OBLIGATORIO (landmine #41): usa current_user para eximir backend.
CREATE OR REPLACE FUNCTION public.enforce_member_update_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Backend confiable (Edge Functions service_role, crons, postgres): rolbypassrls.
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RETURN NEW;
  END IF;
  -- Pastor autenticado: sin restricción.
  IF (SELECT public.is_pastor()) THEN
    RETURN NEW;
  END IF;
  -- Resto (miembro/líder tocando su PROPIA ficha por RLS): columnas privilegiadas
  -- congeladas. Un self-edit legítimo reenvía valores idénticos → NEW=OLD → pasa.
  IF (NEW.role          IS DISTINCT FROM OLD.role)
     OR (NEW.editor        IS DISTINCT FROM OLD.editor)
     OR (NEW.active        IS DISTINCT FROM OLD.active)
     OR (NEW.user_id       IS DISTINCT FROM OLD.user_id)
     OR (NEW.id            IS DISTINCT FROM OLD.id)
     OR (NEW.pastor_area   IS DISTINCT FROM OLD.pastor_area)
     OR (NEW.leader_of     IS DISTINCT FROM OLD.leader_of)
     OR (NEW.password_hash IS DISTINCT FROM OLD.password_hash)
     OR (NEW.created_at    IS DISTINCT FROM OLD.created_at)
     OR (NEW.areas         IS DISTINCT FROM OLD.areas)
  THEN
    RAISE EXCEPTION 'No tenés permiso para cambiar rol, estado, permisos de edición, área ni el vínculo de cuenta de un miembro. Solo un pastor puede hacerlo.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

-- 5) Presentador: lectura para observadores (única relajación, SOLO SELECT). --------
--    SECURITY INVOKER: solo lee la PROPIA ficha (members SELECT = true) → no necesita
--    DEFINER y evita un advisor nuevo. Fixed search_path.
CREATE OR REPLACE FUNCTION public.can_open_service_presenter()
  RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public','pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = (SELECT auth.uid()) AND m.active = true
      AND m.areas && public._area_presenter_slugs()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_open_service_presenter() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_open_service_presenter() TO authenticated;

DROP POLICY IF EXISTS ss_select ON public.service_schemas;
CREATE POLICY ss_select ON public.service_schemas FOR SELECT TO authenticated
USING (
  (SELECT public.is_pastor_or_leader())
  OR public.am_i_in_order_band(order_id)
  OR (SELECT public.can_open_service_presenter())
);

-- 6) Plantillas: insertar {{ensamble}}{{area_nota}} antes de {{formacion}}. Idempotente.
UPDATE public.email_templates
   SET cuerpo_html = replace(cuerpo_html, '{{formacion}}', '{{ensamble}}{{area_nota}}{{formacion}}')
 WHERE slug IN ('nuevo-orden','orden-editado')
   AND cuerpo_html LIKE '%{{formacion}}%'
   AND cuerpo_html NOT LIKE '%{{ensamble}}%';

-- 7) Alta de orden: banda efectiva ∪ pastores ∪ observadores de área; + ensamble + nota.
CREATE OR REPLACE FUNCTION public.notify_on_order_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_band text; v_label text; v_when text; v_msg text; v_sufijo text; v_member record;
  v_band_ids uuid[]; v_ensamble text; v_area_nota text; v_obs text; v_is_band boolean;
BEGIN
 BEGIN
  IF NEW.band_id IS NOT NULL THEN
    SELECT name INTO v_band FROM public.bands WHERE id = NEW.band_id;
    v_band_ids := public.band_effective_member_ids(NEW.band_id);
  END IF;
  v_label := public._meeting_label(NEW.meeting_type);
  v_when  := to_char(NEW.date, 'DD/MM');
  v_msg   := v_label || ' del ' || v_when;
  IF v_band IS NOT NULL THEN v_msg := v_msg || ' · ' || v_band; END IF;

  INSERT INTO public.notifications (title, message, type, is_global, created_at, expires_at)
  VALUES ('Nuevo orden', v_msg, 'order', true, now(), now() + interval '7 days');

  v_sufijo   := CASE WHEN v_band IS NOT NULL THEN ' · ' || v_band ELSE '' END;
  v_ensamble := public._ensamble_html(NEW.rehearsal_date, NEW.rehearsal_time);

  FOR v_member IN
    SELECT DISTINCT m.id, m.name, m.email, m.role, m.areas FROM public.members m
    WHERE m.active = true AND m.email IS NOT NULL AND m.email <> ''
      AND ( (v_band_ids IS NOT NULL AND m.id = ANY (v_band_ids))
            OR m.role = 'pastor'
            OR (m.areas && public._area_email_slugs()) )
  LOOP
    v_is_band := (v_band_ids IS NOT NULL AND v_member.id = ANY (v_band_ids));
    v_obs := public._member_observer_area_labels(v_member.areas);
    v_area_nota := CASE WHEN (NOT v_is_band) AND v_member.role <> 'pastor' AND v_obs IS NOT NULL
      THEN '<em style="color:#8a6508;">Recibís este orden como parte del área de ' || public._html_escape(v_obs) || '.</em><br><br>'
      ELSE '' END;
    BEGIN
      PERFORM public.encolar_email(
        'nuevo-orden', v_member.email, v_member.name,
        jsonb_build_object(
          'nombre', COALESCE(v_member.name, ''),
          'fecha', v_when,
          'banda_sufijo', v_sufijo,
          'ensamble', v_ensamble,
          'area_nota', v_area_nota,
          'formacion', public._lineup_html(NEW.lineup, NEW.band_id, v_member.id),
          'url', 'https://adorapp.net.ar/ordenes'
        ), 5::smallint);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_on_order_insert: email enqueue failed for %: %', v_member.email, SQLERRM;
    END;
  END LOOP;
 EXCEPTION WHEN OTHERS THEN
   BEGIN
     INSERT INTO public.error_log (message, severity, context)
     VALUES ('notify_on_order_insert: fallo general', 'warning',
             jsonb_build_object('order', NEW.id, 'error', SQLERRM));
   EXCEPTION WHEN OTHERS THEN NULL; END;
 END;
  RETURN NEW;
END;
$function$;

-- 8) Edición de orden: contenido (+ áreas, ensamble, nota; campanita solo banda/pastor)
--    y rama solo-formación (+ aviso a Sonido). ------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_order_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid; v_key text; v_fire int; v_band text; v_when text; v_sufijo text;
  v_added text[]; v_removed text[]; v_parts text[] := ARRAY[]::text[]; v_cambios text; v_msg text;
  v_member record; v_content boolean; v_lineup boolean;
  v_old uuid[]; v_new uuid[]; v_oi text[]; v_ni text[]; v_kind text; v_detalle text; v_title text;
  v_band_ids uuid[]; v_ensamble text; v_area_nota text; v_obs text; v_is_core boolean;
  v_notified uuid[] := ARRAY[]::uuid[];
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  v_content := (NEW.songs IS DISTINCT FROM OLD.songs OR NEW.date IS DISTINCT FROM OLD.date
             OR NEW.time IS DISTINCT FROM OLD.time OR NEW.band_id IS DISTINCT FROM OLD.band_id
             OR NEW.meeting_type IS DISTINCT FROM OLD.meeting_type);
  v_lineup := NEW.lineup IS DISTINCT FROM OLD.lineup;
  IF NOT v_content AND NOT v_lineup THEN RETURN NEW; END IF;

  BEGIN
    IF NEW.band_id IS NOT NULL THEN
      SELECT name INTO v_band FROM public.bands WHERE id = NEW.band_id;
      v_band_ids := public.band_effective_member_ids(NEW.band_id);
    END IF;
    v_when   := to_char(NEW.date, 'DD/MM/YYYY');
    v_sufijo := CASE WHEN v_band IS NOT NULL THEN ' · ' || v_band ELSE '' END;

    IF v_content THEN
      v_key := 'order_edit:' || NEW.id::text;
      INSERT INTO public.email_throttle (key, last_sent_at) VALUES (v_key, now())
      ON CONFLICT (key) DO UPDATE SET last_sent_at = now()
        WHERE email_throttle.last_sent_at < now() - interval '90 seconds';
      GET DIAGNOSTICS v_fire = ROW_COUNT;
      IF v_fire = 0 THEN RETURN NEW; END IF;

      SELECT array_agg(s.title ORDER BY s.title) INTO v_added FROM public.songs s WHERE s.id::text IN (
        SELECT e->>'songId' FROM jsonb_array_elements(COALESCE(NEW.songs, '[]'::jsonb)) e
        EXCEPT SELECT e->>'songId' FROM jsonb_array_elements(COALESCE(OLD.songs, '[]'::jsonb)) e);
      SELECT array_agg(s.title ORDER BY s.title) INTO v_removed FROM public.songs s WHERE s.id::text IN (
        SELECT e->>'songId' FROM jsonb_array_elements(COALESCE(OLD.songs, '[]'::jsonb)) e
        EXCEPT SELECT e->>'songId' FROM jsonb_array_elements(COALESCE(NEW.songs, '[]'::jsonb)) e);
      IF v_added IS NOT NULL THEN
        v_parts := v_parts || ((CASE WHEN array_length(v_added,1) = 1 THEN 'se agregó la canción ' ELSE 'se agregaron las canciones ' END)
                               || public._join_names(v_added, array_length(v_added, 1)));
      END IF;
      IF v_removed IS NOT NULL THEN
        v_parts := v_parts || ((CASE WHEN array_length(v_removed,1) = 1 THEN 'se quitó la canción ' ELSE 'se quitaron las canciones ' END)
                               || public._join_names(v_removed, array_length(v_removed, 1)));
      END IF;
      IF NEW.songs IS DISTINCT FROM OLD.songs AND v_added IS NULL AND v_removed IS NULL THEN
        v_parts := v_parts || 'se ajustaron los tonos o el orden de las canciones'::text;
      END IF;
      IF NEW.date IS DISTINCT FROM OLD.date THEN v_parts := v_parts || ('cambió la fecha a ' || to_char(NEW.date, 'DD/MM/YYYY')); END IF;
      IF NEW.time IS DISTINCT FROM OLD.time THEN v_parts := v_parts || ('cambió el horario' || COALESCE(' a ' || NEW.time, '')); END IF;
      IF NEW.band_id IS DISTINCT FROM OLD.band_id THEN v_parts := v_parts || 'cambió la banda asignada'::text; END IF;
      IF NEW.meeting_type IS DISTINCT FROM OLD.meeting_type THEN v_parts := v_parts || 'cambió el tipo de reunión'::text; END IF;
      IF v_lineup THEN v_parts := v_parts || 'se actualizó la formación'::text; END IF;

      v_cambios := array_to_string(v_parts, '; ');
      IF v_cambios IS NULL OR v_cambios = '' THEN v_cambios := 'se actualizaron los detalles del servicio'; END IF;
      v_cambios := upper(left(v_cambios, 1)) || substr(v_cambios, 2) || '.';
      v_msg := v_when || v_sufijo || ' — ' || v_cambios;

      v_ensamble := public._ensamble_html(NEW.rehearsal_date, NEW.rehearsal_time);

      FOR v_member IN
        SELECT DISTINCT m.id, m.name, m.email, m.user_id, m.role, m.areas FROM public.members m
        WHERE m.active = true AND m.user_id IS DISTINCT FROM v_uid
          AND ( (v_band_ids IS NOT NULL AND m.id = ANY (v_band_ids)) OR m.role = 'pastor'
                OR (m.areas && public._area_email_slugs()) )
      LOOP
        v_is_core := ((v_band_ids IS NOT NULL AND v_member.id = ANY (v_band_ids)) OR v_member.role = 'pastor');
        v_obs := public._member_observer_area_labels(v_member.areas);
        v_area_nota := CASE WHEN (NOT v_is_core) AND v_obs IS NOT NULL
          THEN '<em style="color:#8a6508;">Recibís este orden como parte del área de ' || public._html_escape(v_obs) || '.</em><br><br>'
          ELSE '' END;
        BEGIN
          IF v_member.user_id IS NOT NULL AND v_is_core THEN
            INSERT INTO public.notifications (user_id, title, message, type, is_global, created_at, expires_at)
            VALUES (v_member.user_id, 'Orden actualizado', v_msg, 'order', false, now(), now() + interval '7 days');
          END IF;
          IF v_member.email IS NOT NULL AND v_member.email <> '' THEN
            PERFORM public.encolar_email('orden-editado', v_member.email, v_member.name,
              jsonb_build_object('nombre', COALESCE(v_member.name, ''), 'fecha', v_when,
                'banda_sufijo', v_sufijo, 'cambios', public._html_escape(v_cambios),
                'ensamble', v_ensamble, 'area_nota', v_area_nota,
                'formacion', public._lineup_html(NEW.lineup, NEW.band_id, v_member.id),
                'url', 'https://adorapp.net.ar/ordenes'), 5::smallint);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'notify_on_order_update: fallo para %: %', v_member.email, SQLERRM;
        END;
      END LOOP;

    ELSE
      v_old := public._lineup_participants(OLD.lineup, OLD.band_id);
      v_new := public._lineup_participants(NEW.lineup, NEW.band_id);
      FOR v_member IN
        SELECT DISTINCT m.id, m.name, m.email, m.user_id FROM public.members m
        WHERE m.active = true AND m.user_id IS DISTINCT FROM v_uid
          AND (m.id = ANY(v_old) OR m.id = ANY(v_new))
      LOOP
        v_oi := CASE WHEN v_member.id = ANY(v_old) THEN public._lineup_member_instruments(OLD.lineup, v_member.id) ELSE NULL END;
        v_ni := CASE WHEN v_member.id = ANY(v_new) THEN public._lineup_member_instruments(NEW.lineup, v_member.id) ELSE NULL END;
        IF v_member.id = ANY(v_new) AND NOT (v_member.id = ANY(v_old)) THEN
          v_kind := 'added';
        ELSIF v_member.id = ANY(v_old) AND NOT (v_member.id = ANY(v_new)) THEN
          v_kind := 'removed';
        ELSIF v_oi IS DISTINCT FROM v_ni AND COALESCE(array_length(v_ni, 1), 0) > 0 THEN
          v_kind := 'changed';
        ELSE
          CONTINUE;
        END IF;
        v_notified := array_append(v_notified, v_member.id);

        IF v_kind = 'added' THEN
          v_title := 'Te sumaron a la formación';
          v_msg := 'Orden del ' || v_when || v_sufijo
                || CASE WHEN COALESCE(array_length(v_ni, 1), 0) > 0 THEN ' · como ' || array_to_string(v_ni, ' y ') ELSE '' END;
          v_detalle := 'te sumaron a la formación del orden del <strong>' || v_when || public._html_escape(v_sufijo) || '</strong>'
                || CASE WHEN COALESCE(array_length(v_ni, 1), 0) > 0 THEN ' como <strong>' || public._html_escape(array_to_string(v_ni, ' y ')) || '</strong>' ELSE '' END
                || '. Ya podés preparar las canciones desde Mi Ensayo.';
        ELSIF v_kind = 'removed' THEN
          v_title := 'Cambio en la formación';
          v_msg := 'Ya no estás en la formación del orden del ' || v_when || v_sufijo || '. Seguís viendo el orden; solo dejás de recibir los avisos de práctica.';
          v_detalle := 'ya no estás en la formación del orden del <strong>' || v_when || public._html_escape(v_sufijo) || '</strong>. Seguís viendo el orden y sus canciones; solo dejás de recibir los avisos de práctica de ese servicio.';
        ELSE
          v_title := 'Cambio en la formación';
          v_msg := 'Orden del ' || v_when || v_sufijo || ' · ahora participás como ' || array_to_string(v_ni, ' y ');
          v_detalle := 'en la formación del orden del <strong>' || v_when || public._html_escape(v_sufijo) || '</strong> ahora participás como <strong>'
                || public._html_escape(array_to_string(v_ni, ' y ')) || '</strong>.';
        END IF;

        BEGIN
          IF v_member.user_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, message, type, is_global, created_at, expires_at)
            VALUES (v_member.user_id, v_title, v_msg, 'order', false, now(), now() + interval '7 days');
          END IF;
          IF v_member.email IS NOT NULL AND v_member.email <> '' THEN
            PERFORM public.encolar_email('formacion-cambio', v_member.email, v_member.name,
              jsonb_build_object('nombre', COALESCE(v_member.name, ''), 'fecha', v_when,
                'banda_sufijo', v_sufijo, 'detalle', v_detalle,
                'url', 'https://adorapp.net.ar/ordenes'), 5::smallint);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'notify_on_order_update(formacion): fallo para %: %', v_member.email, SQLERRM;
        END;
      END LOOP;

      -- NUEVO: aviso por MAIL (sin campanita) a observadores de Sonido, excluyendo
      -- SOLO a quienes YA recibieron el aviso personal como participante (evita
      -- doble-aviso, pero sí avisa a un músico-de-banda que además es Sonido cuya
      -- parte no cambió). Observadores = solo correo (coherente con la rama de contenido).
      FOR v_member IN
        SELECT DISTINCT m.id, m.name, m.email FROM public.members m
        WHERE m.active = true AND m.user_id IS DISTINCT FROM v_uid
          AND m.email IS NOT NULL AND m.email <> ''
          AND (m.areas && public._area_formation_slugs())
          AND NOT (m.id = ANY(v_notified))
      LOOP
        v_detalle := 'se actualizó la formación del orden del <strong>' || v_when || public._html_escape(v_sufijo)
                  || '</strong>. Revisá quiénes participan para preparar el sonido del servicio.';
        BEGIN
          PERFORM public.encolar_email('formacion-cambio', v_member.email, v_member.name,
            jsonb_build_object('nombre', COALESCE(v_member.name, ''), 'fecha', v_when,
              'banda_sufijo', v_sufijo, 'detalle', v_detalle,
              'url', 'https://adorapp.net.ar/ordenes'), 5::smallint);
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'notify_on_order_update(formacion-area): fallo para %: %', v_member.email, SQLERRM;
        END;
      END LOOP;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.error_log (message, severity, context)
      VALUES ('notify_on_order_update: fallo general', 'warning',
              jsonb_build_object('order', NEW.id, 'error', SQLERRM));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END;
  RETURN NEW;
END;
$function$;
