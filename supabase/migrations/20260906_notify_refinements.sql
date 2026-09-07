-- Refinamientos pedidos por Paul sobre los dos avisos del 2026-09-06:
--   1) Resumen diario (send_leader_activity_digest): SOLO correo (sin campanita)
--      y DETALLANDO los nombres de las canciones por acción y por autor, ej:
--      "Leandro agregó 1 canción (La niña de tus ojos) y editó 2 canciones
--       (Renuévame y Digno)".
--   2) (temporales ya incluidos — sin cambios)
--   3) Mail de EDICIÓN de orden (notify_on_order_update): aclarar QUÉ cambió, ej:
--      "El orden del 13/09/2026 · Banda Jóvenes se modificó. Se agregó la canción
--       Yeshua." (se puede agregar y quitar canciones + fecha/hora/banda/tipo).

--------------------------------------------------------------------------------
-- Helper: lista en español con tope. p_total = total real (para "y N más").
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._join_names(p_names text[], p_total int)
  RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_names IS NULL OR array_length(p_names, 1) IS NULL THEN ''
    WHEN COALESCE(p_total, array_length(p_names, 1)) > array_length(p_names, 1) THEN
      array_to_string(p_names, ', ') || ' y ' || (p_total - array_length(p_names, 1))::text || ' más'
    WHEN array_length(p_names, 1) = 1 THEN p_names[1]
    ELSE array_to_string(p_names[1:array_length(p_names, 1) - 1], ', ') || ' y ' || p_names[array_length(p_names, 1)]
  END;
$$;

--------------------------------------------------------------------------------
-- Helper: sub-frase del digest por grupo (sin el autor; se antepone una vez).
--   p_n = objetos distintos, p_rows = filas (para "integrantes"), p_names = tope
--   de nombres, p_total = nombres distintos totales (para "y N más").
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._activity_subphrase(
  p_table text, p_action text, p_n int, p_rows int, p_names text[], p_total int)
  RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_table = 'songs' THEN
      (CASE p_action WHEN 'insert' THEN 'agregó ' WHEN 'update' THEN 'editó ' ELSE 'eliminó ' END)
      || p_n::text || ' ' || (CASE WHEN p_n = 1 THEN 'canción' ELSE 'canciones' END)
      || CASE WHEN COALESCE(array_length(p_names, 1), 0) > 0
              THEN ' (' || public._join_names(p_names, p_total) || ')' ELSE '' END
    WHEN p_table = 'orders' THEN
      (CASE p_action WHEN 'insert' THEN 'creó ' WHEN 'update' THEN 'editó ' ELSE 'eliminó ' END)
      || p_n::text || ' ' || (CASE WHEN p_n = 1 THEN 'orden de servicio' ELSE 'órdenes de servicio' END)
      || CASE WHEN COALESCE(array_length(p_names, 1), 0) > 0
              THEN ' (del ' || public._join_names(p_names, p_total) || ')' ELSE '' END
    WHEN p_table = 'bands' AND p_action = 'update' THEN
      'sumó ' || p_rows::text || ' ' || (CASE WHEN p_rows = 1 THEN 'integrante' ELSE 'integrantes' END)
      || ' a ' || (CASE WHEN p_n = 1 THEN 'la banda' ELSE 'las bandas' END)
      || CASE WHEN COALESCE(array_length(p_names, 1), 0) > 0
              THEN ' (' || public._join_names(p_names, p_total) || ')' ELSE '' END
    WHEN p_table = 'bands' THEN
      (CASE p_action WHEN 'insert' THEN 'creó ' ELSE 'eliminó ' END)
      || p_n::text || ' ' || (CASE WHEN p_n = 1 THEN 'banda' ELSE 'bandas' END)
      || CASE WHEN COALESCE(array_length(p_names, 1), 0) > 0
              THEN ' (' || public._join_names(p_names, p_total) || ')' ELSE '' END
    ELSE 'hizo ' || p_rows::text || ' cambio(s)'
  END;
$$;

--------------------------------------------------------------------------------
-- Digest diario — SOLO correo, con nombres de canciones, una línea por autor.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_leader_activity_digest(p_now timestamptz DEFAULT NULL)
  RETURNS void LANGUAGE plpgsql
  SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_end    timestamptz;
  v_start  timestamptz;
  v_fecha  text;
  v_total  int := 0;
  v_html   text := '';
  v_prev   text := NULL;
  v_line   text := '';
  v_sub    text;
  v_claim  int;
  v_g      record;
  v_pastor record;
BEGIN
  v_end   := COALESCE(p_now, now());
  v_start := v_end - interval '24 hours';
  v_fecha := to_char((v_end AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 'DD/MM/YYYY');

  -- Movimientos últimas 24 h de líderes/editores (no pastores, no crons),
  -- agrupados por autor + tabla + acción, con la lista de nombres afectados.
  FOR v_g IN
    SELECT sub.actor_name, sub.table_name, sub.action,
           count(DISTINCT sub.record_id)::int AS n_obj,
           count(*)::int AS n_rows,
           (array_agg(DISTINCT sub.nm) FILTER (WHERE sub.nm IS NOT NULL AND sub.nm <> '')) AS names_full,
           count(DISTINCT sub.nm) FILTER (WHERE sub.nm IS NOT NULL AND sub.nm <> '')::int AS n_names
    FROM (
      SELECT ae.actor_name, ae.table_name, ae.action, ae.record_id,
             COALESCE(ae.after->>'title', ae.after->>'name', ae.after->>'date',
                      ae.before->>'title', ae.before->>'name', ae.before->>'date') AS nm
      FROM public.audit_events ae
      LEFT JOIN public.members m ON m.id = ae.actor_member_id
      WHERE ae.table_name IN ('songs', 'orders', 'bands')
        AND ae.action IN ('insert', 'update', 'delete')
        AND ae.actor_member_id IS NOT NULL
        AND ae.actor_role IS DISTINCT FROM 'pastor'
        AND (ae.actor_role = 'leader' OR COALESCE(m.editor, false) = true)
        AND ae.occurred_at >= v_start AND ae.occurred_at < v_end
    ) sub
    GROUP BY sub.actor_name, sub.table_name, sub.action
    ORDER BY sub.actor_name, sub.table_name, sub.action
  LOOP
    IF v_g.actor_name IS DISTINCT FROM v_prev THEN
      IF v_prev IS NOT NULL THEN
        v_html := v_html || '• ' || public._html_escape(v_prev || ' ' || v_line) || '<br>';
      END IF;
      v_prev := v_g.actor_name; v_line := '';
    END IF;
    v_sub := public._activity_subphrase(v_g.table_name, v_g.action, v_g.n_obj, v_g.n_rows,
                                        (v_g.names_full)[1:9], v_g.n_names);
    v_line := v_line || CASE WHEN v_line = '' THEN '' ELSE ' y ' END || v_sub;
    v_total := v_total + v_g.n_obj;
  END LOOP;
  IF v_prev IS NOT NULL THEN
    v_html := v_html || '• ' || public._html_escape(v_prev || ' ' || v_line) || '<br>';
  END IF;

  IF v_total = 0 THEN RETURN; END IF;

  -- Dedup por fecha (evita doble envío ante misfire/re-invocación). Se reclama
  -- SOLO cuando hay algo para mandar.
  INSERT INTO public.email_throttle (key, last_sent_at)
  VALUES ('leader_digest:' || v_fecha, now())
  ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS v_claim = ROW_COUNT;
  IF v_claim = 0 THEN RETURN; END IF;  -- ya se envió el resumen de esta fecha

  FOR v_pastor IN
    SELECT email, name FROM public.members
    WHERE role = 'pastor' AND active = true AND email IS NOT NULL AND email <> ''
  LOOP
    BEGIN
      PERFORM public.encolar_email('actividad-lider', v_pastor.email, v_pastor.name,
        jsonb_build_object(
          'nombre',   public._html_escape(COALESCE(v_pastor.name, '')),
          'fecha',    v_fecha,
          'cantidad', v_total::text,
          'items',    v_html),
        5::smallint);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.error_log (message, severity, context)
      VALUES ('leader-activity-digest: fallo enviando a un pastor', 'warning',
              jsonb_build_object('email', v_pastor.email, 'error', SQLERRM));
    END;
  END LOOP;

EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.error_log (message, severity, context)
    VALUES ('leader-activity-digest: fallo general', 'error', jsonb_build_object('error', SQLERRM));
  EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$function$;

--------------------------------------------------------------------------------
-- Plantilla del digest (actualiza el copy: "movimiento(s)" ya lista canciones).
--------------------------------------------------------------------------------
UPDATE public.email_templates SET
  cuerpo_html =
    'Hola {{nombre}}, el <strong>{{fecha}}</strong> hubo actividad de líderes o editores en la plataforma:'
    || '<br><br>{{items}}'
    || '<br>Podés ver el detalle completo cuando quieras desde la plataforma.',
  updated_at = now()
WHERE slug = 'actividad-lider';

--------------------------------------------------------------------------------
-- Plantilla de EDICIÓN de orden (más clara + detalle del cambio en {{cambios}}).
--------------------------------------------------------------------------------
UPDATE public.email_templates SET
  cuerpo_html =
    'Hola {{nombre}}, el orden del <strong>{{fecha}}</strong>{{banda_sufijo}} se modificó.'
    || '<br><br>{{cambios}}'
    || '<br><br>Podés ver el orden completo y mirar los acordes de cada canción desde la plataforma.'
    || '<br><br>Un abrazo!',
  updated_at = now()
WHERE slug = 'orden-editado';

--------------------------------------------------------------------------------
-- Trigger de edición de orden — arma {{cambios}} con el detalle real.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_order_update()
  RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid     uuid;
  v_key     text;
  v_fire    int;
  v_band    text;
  v_when    text;
  v_sufijo  text;
  v_added   text[];
  v_removed text[];
  v_parts   text[] := ARRAY[]::text[];
  v_cambios text;
  v_msg     text;
  v_member  record;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  IF NOT (NEW.songs        IS DISTINCT FROM OLD.songs
       OR NEW.date         IS DISTINCT FROM OLD.date
       OR NEW.time         IS DISTINCT FROM OLD.time
       OR NEW.band_id      IS DISTINCT FROM OLD.band_id
       OR NEW.meeting_type IS DISTINCT FROM OLD.meeting_type) THEN
    RETURN NEW;
  END IF;

  BEGIN  -- nada rompe la edición del orden
    v_key := 'order_edit:' || NEW.id::text;
    INSERT INTO public.email_throttle (key, last_sent_at) VALUES (v_key, now())
    ON CONFLICT (key) DO UPDATE SET last_sent_at = now()
      WHERE email_throttle.last_sent_at < now() - interval '90 seconds';
    GET DIAGNOSTICS v_fire = ROW_COUNT;
    IF v_fire = 0 THEN RETURN NEW; END IF;

    IF NEW.band_id IS NOT NULL THEN
      SELECT name INTO v_band FROM public.bands WHERE id = NEW.band_id;
    END IF;
    v_when   := to_char(NEW.date, 'DD/MM/YYYY');
    v_sufijo := CASE WHEN v_band IS NOT NULL THEN ' · ' || v_band ELSE '' END;

    -- Diff de canciones (agregadas / quitadas), resolviendo títulos.
    SELECT array_agg(s.title ORDER BY s.title) INTO v_added FROM public.songs s WHERE s.id::text IN (
      SELECT e->>'songId' FROM jsonb_array_elements(COALESCE(NEW.songs, '[]'::jsonb)) e
      EXCEPT SELECT e->>'songId' FROM jsonb_array_elements(COALESCE(OLD.songs, '[]'::jsonb)) e);
    SELECT array_agg(s.title ORDER BY s.title) INTO v_removed FROM public.songs s WHERE s.id::text IN (
      SELECT e->>'songId' FROM jsonb_array_elements(COALESCE(OLD.songs, '[]'::jsonb)) e
      EXCEPT SELECT e->>'songId' FROM jsonb_array_elements(COALESCE(NEW.songs, '[]'::jsonb)) e);

    IF v_added IS NOT NULL THEN
      v_parts := v_parts || ((CASE WHEN array_length(v_added,1) = 1 THEN 'se agregó la canción '
                                   ELSE 'se agregaron las canciones ' END)
                             || public._join_names(v_added, array_length(v_added, 1)));
    END IF;
    IF v_removed IS NOT NULL THEN
      v_parts := v_parts || ((CASE WHEN array_length(v_removed,1) = 1 THEN 'se quitó la canción '
                                   ELSE 'se quitaron las canciones ' END)
                             || public._join_names(v_removed, array_length(v_removed, 1)));
    END IF;
    IF NEW.songs IS DISTINCT FROM OLD.songs AND v_added IS NULL AND v_removed IS NULL THEN
      v_parts := v_parts || 'se ajustaron los tonos o el orden de las canciones';
    END IF;
    IF NEW.date IS DISTINCT FROM OLD.date THEN
      v_parts := v_parts || ('cambió la fecha a ' || to_char(NEW.date, 'DD/MM/YYYY')); END IF;
    IF NEW.time IS DISTINCT FROM OLD.time THEN
      v_parts := v_parts || ('cambió el horario' || COALESCE(' a ' || NEW.time, '')); END IF;
    IF NEW.band_id IS DISTINCT FROM OLD.band_id THEN
      v_parts := v_parts || 'cambió la banda asignada'; END IF;
    IF NEW.meeting_type IS DISTINCT FROM OLD.meeting_type THEN
      v_parts := v_parts || 'cambió el tipo de reunión'; END IF;

    v_cambios := array_to_string(v_parts, '; ');
    IF v_cambios IS NULL OR v_cambios = '' THEN v_cambios := 'se actualizaron los detalles del servicio'; END IF;
    v_cambios := upper(left(v_cambios, 1)) || substr(v_cambios, 2) || '.';

    v_msg := v_when || v_sufijo || ' — ' || v_cambios;

    FOR v_member IN
      SELECT DISTINCT m.id, m.name, m.email, m.user_id
      FROM public.members m
      WHERE m.active = true
        AND m.user_id IS DISTINCT FROM v_uid
        AND ( m.id = ANY (public.band_effective_member_ids(NEW.band_id)) OR m.role = 'pastor' )
    LOOP
      BEGIN
        IF v_member.user_id IS NOT NULL THEN
          INSERT INTO public.notifications (user_id, title, message, type, is_global, created_at, expires_at)
          VALUES (v_member.user_id, 'Orden actualizado', v_msg, 'order', false, now(), now() + interval '7 days');
        END IF;
        IF v_member.email IS NOT NULL AND v_member.email <> '' THEN
          PERFORM public.encolar_email('orden-editado', v_member.email, v_member.name,
            jsonb_build_object('nombre', COALESCE(v_member.name, ''), 'fecha', v_when,
              'banda_sufijo', v_sufijo, 'cambios', public._html_escape(v_cambios),
              'url', 'https://adorapp.net.ar/ordenes'), 5::smallint);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_on_order_update: fallo para %: %', v_member.email, SQLERRM;
      END;
    END LOOP;

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

--------------------------------------------------------------------------------
-- Limpieza + blindaje.
--------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._leader_activity_phrase(text, text, text, int, text);
REVOKE ALL ON FUNCTION public.send_leader_activity_digest(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_order_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._join_names(text[], int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._activity_subphrase(text, text, int, int, text[], int) FROM PUBLIC, anon, authenticated;
