-- ============================================================================
-- Decisión de Paul (2026-09-12): simetría alta/edición. Igual que el ALTA de un orden le
-- manda el correo al autor (confirmación de que salió), la EDICIÓN de CONTENIDO ahora también
-- le llega al editor. Resuelve el hallazgo #5 de la auditoría (asimetría alta-vs-edición).
--
-- Único cambio vs. la versión de 20260912_area_avisos_ambas_y_cambios.sql: la rama de CONTENIDO
-- ya NO excluye al editor (se quitó "AND m.user_id IS DISTINCT FROM v_uid" SOLO en ese loop).
-- La rama SOLO-formación SIGUE excluyendo al editor (los avisos personales "te sumaron/sacaron
-- de la formación" no tienen sentido dirigidos a quien hizo el cambio sobre sí mismo).
-- El dedup se mantiene (SELECT DISTINCT); un miembro multi-área recibe 1 correo + 1 push.
-- Ya aplicada a prod vía MCP + verificada empíricamente (editor 1/1, otro 1/1, exclusión x2).
-- ============================================================================
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

      -- Rama de CONTENIDO: SIN exclusión del editor (Paul: el editor recibe la confirmación).
      FOR v_member IN
        SELECT DISTINCT m.id, m.name, m.email, m.user_id, m.role, m.areas FROM public.members m
        WHERE m.active = true
          AND ( (v_band_ids IS NOT NULL AND m.id = ANY (v_band_ids)) OR m.role = 'pastor'
                OR (m.areas && public._area_email_slugs()) )
      LOOP
        v_is_core := ((v_band_ids IS NOT NULL AND v_member.id = ANY (v_band_ids)) OR v_member.role = 'pastor');
        v_obs := public._member_observer_area_labels(v_member.areas);
        v_area_nota := CASE WHEN (NOT v_is_core) AND v_obs IS NOT NULL
          THEN '<em style="color:#8a6508;">Recibís este orden como parte del área de ' || public._html_escape(v_obs) || '.</em><br><br>'
          ELSE '' END;
        BEGIN
          IF v_member.user_id IS NOT NULL THEN
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
      -- Rama SOLO-formación: SIGUE excluyendo al editor (avisos personales sobre uno mismo no van).
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

      FOR v_member IN
        SELECT DISTINCT m.id, m.name, m.email, m.user_id FROM public.members m
        WHERE m.active = true AND m.user_id IS DISTINCT FROM v_uid
          AND (m.areas && public._area_formation_slugs())
          AND NOT (m.id = ANY(v_notified))
      LOOP
        v_detalle := 'se actualizó la formación del orden del <strong>' || v_when || public._html_escape(v_sufijo)
                  || '</strong>. Revisá quiénes participan para preparar tu parte del servicio.';
        BEGIN
          IF v_member.user_id IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, message, type, is_global, created_at, expires_at)
            VALUES (v_member.user_id, 'Cambió la formación',
                    'Orden del ' || v_when || v_sufijo || ' · se actualizó la formación', 'order', false, now(), now() + interval '7 days');
          END IF;
          IF v_member.email IS NOT NULL AND v_member.email <> '' THEN
            PERFORM public.encolar_email('formacion-cambio', v_member.email, v_member.name,
              jsonb_build_object('nombre', COALESCE(v_member.name, ''), 'fecha', v_when,
                'banda_sufijo', v_sufijo, 'detalle', v_detalle,
                'url', 'https://adorapp.net.ar/ordenes'), 5::smallint);
          END IF;
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
