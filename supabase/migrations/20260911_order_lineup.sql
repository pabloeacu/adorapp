-- ============================================================================
-- Formación del orden (quiénes participan de un servicio y con qué instrumento)
-- Plan: docs/PLAN_formacion_orden.md — decisiones cerradas por Paul el 2026-09-11.
--
-- 100% aditivo: `orders.lineup` NULL = comportamiento de hoy. Con formación:
--   • el mail del orden (alta y edición) lleva el bloque {{formacion}} con una
--     línea personal por destinatario;
--   • los avisos del SERVICIO (ensamble 2 h antes, alarma de ensayo 18:00)
--     llegan SOLO a los participantes (`order_participant_ids`);
--   • la info general (push "Nuevo orden", mail del orden, "orden actualizado")
--     sigue llegando a toda la banda efectiva ∪ pastores;
--   • un cambio SOLO de formación avisa únicamente a quien entra/sale/cambia
--     de instrumento (rama nueva en notify_on_order_update), sin mail a la banda.
--
-- De paso (Regla de Oro §5): el mail `nuevo-orden` pasa a la banda EFECTIVA
-- (temporales incluidos) ∪ pastores (antes: `bands.members` crudo), y se
-- cierran etiquetas HTML sin cerrar en las plantillas `nuevo-orden` y
-- `recordatorio-ensayo` (todo lo que seguía quedaba en cursiva/negrita).
--
-- Blindaje: helpers SECURITY DEFINER con search_path fijo; REVOKE de los RPC;
-- CREATE OR REPLACE resetea grants → se re-asertan (landmine #39).
-- ============================================================================

-- 1) Columna --------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS lineup jsonb;
COMMENT ON COLUMN public.orders.lineup IS
  'Formación del servicio: {mode:"all"|"custom", members:[{memberId, instruments[]}], definedBy, definedAt}. NULL = sin formación (participa toda la banda efectiva). Normalizada por validate_order_lineup.';

-- 2) Helpers puros ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._safe_uuid(p text)
RETURNS uuid LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT CASE WHEN p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p::uuid ELSE NULL END;
$$;

-- Orden de presentación de los instrumentos (voces primero, después la base rítmica).
CREATE OR REPLACE FUNCTION public._instrument_rank(p text)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(array_position(ARRAY['Voz','Coros','Guitarra Eléctrica','Guitarra Acústica','Piano','Teclado','Bajo','Batería','Violín','Flauta','Saxofón','Trompeta'], p), 99);
$$;

-- Participantes de una formación dada (para poder evaluar OLD y NEW en triggers).
-- custom → los listados que sigan activos; all/NULL → banda efectiva (dinámico).
CREATE OR REPLACE FUNCTION public._lineup_participants(p_lineup jsonb, p_band_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_lineup->>'mode' = 'custom' THEN
      ARRAY(SELECT m.id
            FROM jsonb_array_elements(COALESCE(p_lineup->'members', '[]'::jsonb)) e
            JOIN public.members m ON m.id = public._safe_uuid(e->>'memberId')
            WHERE m.active)
    ELSE public.band_effective_member_ids(p_band_id)
  END;
$$;
REVOKE EXECUTE ON FUNCTION public._lineup_participants(jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- Participantes de un orden. Fuente de verdad para TODO aviso del servicio.
CREATE OR REPLACE FUNCTION public.order_participant_ids(p_order_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT public._lineup_participants(o.lineup, o.band_id) FROM public.orders o WHERE o.id = p_order_id), '{}'::uuid[]);
$$;
REVOKE EXECUTE ON FUNCTION public.order_participant_ids(uuid) FROM PUBLIC, anon, authenticated;

-- Instrumentos con los que participa un miembro en una formación (custom: lo
-- declarado; all: los de su ficha).
CREATE OR REPLACE FUNCTION public._lineup_member_instruments(p_lineup jsonb, p_member_id uuid)
RETURNS text[] LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_lineup->>'mode' = 'custom' THEN
      COALESCE((SELECT ARRAY(SELECT jsonb_array_elements_text(e->'instruments'))
                FROM jsonb_array_elements(COALESCE(p_lineup->'members', '[]'::jsonb)) e
                WHERE public._safe_uuid(e->>'memberId') = p_member_id LIMIT 1), '{}'::text[])
    ELSE COALESCE((SELECT m.instruments FROM public.members m WHERE m.id = p_member_id), '{}'::text[])
  END;
$$;
REVOKE EXECUTE ON FUNCTION public._lineup_member_instruments(jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- 3) Validador/normalizador (BEFORE INSERT OR UPDATE) -------------------------------
-- La base no confía en el cliente: modo válido, integrantes de la banda efectiva,
-- instrumentos ⊆ ficha del miembro, sin duplicados, directores de canciones
-- SIEMPRE incluidos, definedBy = quien está logueado. SECURITY DEFINER porque
-- band_effective_member_ids está revocada para authenticated (landmine #37).
CREATE OR REPLACE FUNCTION public.validate_order_lineup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_mode text; v_in jsonb; e jsonb; v_mid uuid; v_eff uuid[]; v_members jsonb := '[]'::jsonb;
  v_seen uuid[] := '{}'::uuid[]; v_inst text[]; v_minst text[]; v_name text; v_active boolean;
  v_me uuid; v_defined_by uuid; v_defined_at timestamptz; v_changed boolean; v_dir uuid;
BEGIN
  IF NEW.lineup IS NULL THEN RETURN NEW; END IF;
  v_changed := (TG_OP = 'INSERT') OR (NEW.lineup IS DISTINCT FROM OLD.lineup);
  IF NOT v_changed AND NEW.band_id IS NOT DISTINCT FROM OLD.band_id AND NEW.songs IS NOT DISTINCT FROM OLD.songs THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.lineup) <> 'object' THEN
    RAISE EXCEPTION 'Formación inválida.' USING ERRCODE = 'P0001';
  END IF;
  v_mode := NEW.lineup->>'mode';
  IF v_mode IS NULL OR v_mode NOT IN ('all', 'custom') THEN
    RAISE EXCEPTION 'Formación inválida: modo desconocido.' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    SELECT id INTO v_me FROM public.members WHERE user_id = auth.uid() AND active LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_me := NULL; END;
  IF v_changed THEN
    v_defined_by := COALESCE(v_me, public._safe_uuid(NEW.lineup->>'definedBy'));
    v_defined_at := now();
  ELSE
    v_defined_by := public._safe_uuid(NEW.lineup->>'definedBy');
    BEGIN v_defined_at := (NEW.lineup->>'definedAt')::timestamptz; EXCEPTION WHEN OTHERS THEN v_defined_at := now(); END;
  END IF;

  v_eff := CASE WHEN NEW.band_id IS NULL THEN '{}'::uuid[] ELSE public.band_effective_member_ids(NEW.band_id) END;

  IF v_mode = 'custom' THEN
    v_in := NEW.lineup->'members';
    IF v_in IS NULL OR jsonb_typeof(v_in) <> 'array' THEN
      RAISE EXCEPTION 'Formación inválida: falta la lista de integrantes.' USING ERRCODE = 'P0001';
    END IF;
    FOR e IN SELECT value FROM jsonb_array_elements(v_in) LOOP
      IF jsonb_typeof(e) <> 'object' THEN
        RAISE EXCEPTION 'Formación inválida: integrante mal formado.' USING ERRCODE = 'P0001';
      END IF;
      v_mid := public._safe_uuid(e->>'memberId');
      IF v_mid IS NULL THEN
        RAISE EXCEPTION 'Formación inválida: integrante sin identificador.' USING ERRCODE = 'P0001';
      END IF;
      IF v_mid = ANY(v_seen) THEN CONTINUE; END IF;
      v_name := NULL;
      SELECT m.name, m.active, COALESCE(m.instruments, '{}'::text[]) INTO v_name, v_active, v_minst
      FROM public.members m WHERE m.id = v_mid;
      IF v_name IS NULL THEN
        RAISE EXCEPTION 'Formación inválida: hay un integrante que no existe.' USING ERRCODE = 'P0001';
      END IF;
      IF NOT (v_mid = ANY(v_eff)) THEN
        IF v_changed THEN
          RAISE EXCEPTION '% no integra esta banda. Sumalo a la banda (permanente o temporal) antes de ponerlo en la formación.', v_name
            USING ERRCODE = 'P0001';
        END IF;
        CONTINUE; -- cambió la banda del orden: se filtra en silencio
      END IF;
      IF NOT v_active THEN CONTINUE; END IF;
      SELECT COALESCE(array_agg(x ORDER BY public._instrument_rank(x)), '{}'::text[]) INTO v_inst
      FROM (SELECT DISTINCT jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(e->'instruments') = 'array' THEN e->'instruments' ELSE '[]'::jsonb END) AS x) s
      WHERE x = ANY(v_minst);
      v_members := v_members || jsonb_build_object('memberId', v_mid, 'instruments', to_jsonb(v_inst));
      v_seen := v_seen || v_mid;
    END LOOP;

    -- Los directores de las canciones del orden participan siempre (decisión 3).
    FOR v_dir IN
      SELECT DISTINCT public._safe_uuid(s->>'directorId')
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.songs) = 'array' THEN NEW.songs ELSE '[]'::jsonb END) s
    LOOP
      IF v_dir IS NULL OR v_dir = ANY(v_seen) OR NOT (v_dir = ANY(v_eff)) THEN CONTINUE; END IF;
      SELECT m.active, COALESCE(m.instruments, '{}'::text[]) INTO v_active, v_minst FROM public.members m WHERE m.id = v_dir;
      IF NOT COALESCE(v_active, false) THEN CONTINUE; END IF;
      v_inst := CASE WHEN 'Voz' = ANY(v_minst) THEN ARRAY['Voz'] ELSE '{}'::text[] END;
      v_members := v_members || jsonb_build_object('memberId', v_dir, 'instruments', to_jsonb(v_inst));
      v_seen := v_seen || v_dir;
    END LOOP;

    IF jsonb_array_length(v_members) = 0 THEN
      IF v_changed THEN
        RAISE EXCEPTION 'La formación no puede quedar vacía. Elegí al menos un integrante o "Participan todos".' USING ERRCODE = 'P0001';
      END IF;
      v_mode := 'all'; -- cambió la banda y nadie quedó: vuelve a "todos"
    END IF;
  END IF;
  IF v_mode = 'all' THEN v_members := '[]'::jsonb; END IF;

  NEW.lineup := jsonb_build_object(
    'mode', v_mode, 'members', v_members,
    'definedBy', v_defined_by, 'definedAt', v_defined_at);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validate_order_lineup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_order_lineup ON public.orders;
CREATE TRIGGER validate_order_lineup
  BEFORE INSERT OR UPDATE OF lineup, band_id, songs ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_lineup();

-- 4) Bloque HTML de formación para los mails ---------------------------------------
-- Devuelve '' si no hay formación (mail idéntico al de hoy). Todo dato de usuario
-- pasa por _html_escape (cuerpo_html es RAW, landmine #48). Incluye la línea
-- personal del destinatario (decisión 8).
CREATE OR REPLACE FUNCTION public._lineup_html(p_lineup jsonb, p_band_id uuid, p_member_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_parts uuid[]; v_lines text := ''; r record; v_mine text[]; v_personal text := '';
  v_head text; v_none text[];
BEGIN
  IF p_lineup IS NULL THEN RETURN ''; END IF;
  v_parts := public._lineup_participants(p_lineup, p_band_id);
  IF COALESCE(array_length(v_parts, 1), 0) = 0 THEN RETURN ''; END IF;

  v_head := CASE WHEN p_lineup->>'mode' = 'all'
    THEN 'Participa toda la banda (' || array_length(v_parts, 1) || CASE WHEN array_length(v_parts, 1) = 1 THEN ' integrante).' ELSE ' integrantes).' END
    WHEN array_length(v_parts, 1) = 1 THEN 'Participa 1 integrante.'
    ELSE 'Participan ' || array_length(v_parts, 1) || ' integrantes.' END;

  FOR r IN
    SELECT inst, string_agg(public._html_escape(m.name), ', ' ORDER BY m.name) AS names
    FROM public.members m
    CROSS JOIN LATERAL unnest(public._lineup_member_instruments(p_lineup, m.id)) AS inst
    WHERE m.id = ANY(v_parts)
    GROUP BY inst ORDER BY public._instrument_rank(inst), inst
  LOOP
    v_lines := v_lines || '<strong>' || public._html_escape(r.inst) || '</strong> — ' || r.names || '<br>';
  END LOOP;
  SELECT array_agg(public._html_escape(m.name) ORDER BY m.name) INTO v_none
  FROM public.members m
  WHERE m.id = ANY(v_parts) AND COALESCE(array_length(public._lineup_member_instruments(p_lineup, m.id), 1), 0) = 0;
  IF v_none IS NOT NULL THEN
    v_lines := v_lines || '<strong>También participan</strong> — ' || array_to_string(v_none, ', ') || '<br>';
  END IF;

  IF p_member_id IS NOT NULL THEN
    IF p_member_id = ANY(v_parts) THEN
      v_mine := public._lineup_member_instruments(p_lineup, p_member_id);
      v_personal := CASE WHEN COALESCE(array_length(v_mine, 1), 0) > 0
        THEN 'Vos participás como ' || public._html_escape(array_to_string(v_mine, ' y ')) || '.'
        ELSE 'Vos participás en este servicio.' END;
    ELSIF p_band_id IS NOT NULL AND p_member_id = ANY(public.band_effective_member_ids(p_band_id)) THEN
      v_personal := 'Esta vez no estás en la formación de este servicio (te avisamos igual para que estés al tanto), pero siempre viene bien repasar.';
    END IF;
  END IF;

  RETURN '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;"><tr>'
    || '<td style="padding:12px 14px;border:1px solid #e8d9a8;border-left:4px solid #b8860b;border-radius:8px;background:#fbf7ea;font-size:14px;line-height:1.6;color:#374151;">'
    || '<strong style="color:#8a6508;">Formación para este servicio</strong> · ' || v_head || '<br>'
    || v_lines
    || CASE WHEN v_personal <> '' THEN '<em style="color:#8a6508;">' || v_personal || '</em>' ELSE '' END
    || '</td></tr></table>';
END;
$$;
REVOKE EXECUTE ON FUNCTION public._lineup_html(jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 5) Alta de orden: destinatarios efectivos ∪ pastores + bloque de formación ---------
CREATE OR REPLACE FUNCTION public.notify_on_order_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_band text; v_label text; v_when text; v_msg text; v_sufijo text; v_member record;
BEGIN
  IF NEW.band_id IS NOT NULL THEN
    SELECT name INTO v_band FROM public.bands WHERE id = NEW.band_id;
  END IF;
  v_label := public._meeting_label(NEW.meeting_type);
  v_when  := to_char(NEW.date, 'DD/MM');
  v_msg   := v_label || ' del ' || v_when;
  IF v_band IS NOT NULL THEN v_msg := v_msg || ' · ' || v_band; END IF;

  -- Push global (info general, sin cambios).
  INSERT INTO public.notifications (title, message, type, is_global, created_at, expires_at)
  VALUES ('Nuevo orden', v_msg, 'order', true, now(), now() + interval '7 days');

  v_sufijo := CASE WHEN v_band IS NOT NULL THEN ' · ' || v_band ELSE '' END;
  -- Mail: banda EFECTIVA (permanentes ∪ temporales vigentes) ∪ pastores activos.
  FOR v_member IN
    SELECT DISTINCT m.id, m.name, m.email FROM public.members m
    WHERE m.active = true AND m.email IS NOT NULL AND m.email <> ''
      AND ( (NEW.band_id IS NOT NULL AND m.id = ANY (public.band_effective_member_ids(NEW.band_id)))
            OR m.role = 'pastor' )
  LOOP
    BEGIN
      PERFORM public.encolar_email(
        'nuevo-orden', v_member.email, v_member.name,
        jsonb_build_object(
          'nombre', COALESCE(v_member.name, ''),
          'fecha', v_when,
          'banda_sufijo', v_sufijo,
          'formacion', public._lineup_html(NEW.lineup, NEW.band_id, v_member.id),
          'url', 'https://adorapp.net.ar/ordenes'
        ), 5::smallint);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_on_order_insert: email enqueue failed for %: %', v_member.email, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_on_order_insert() FROM PUBLIC, anon, authenticated;

-- 6) Edición de orden: contenido (con bloque) o SOLO formación (aviso puntual) --------
-- Hallazgo de la QA (bug preexistente en prod): `text[] || 'literal'` hace que Postgres
-- parsee el literal como ARRAY → "malformed array literal" → el aviso de cambio de
-- banda / tipo de reunión / solo-tonos fallaba en silencio (error_log). Se castea ::text.
CREATE OR REPLACE FUNCTION public.notify_on_order_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid; v_key text; v_fire int; v_band text; v_when text; v_sufijo text;
  v_added text[]; v_removed text[]; v_parts text[] := ARRAY[]::text[]; v_cambios text; v_msg text;
  v_member record; v_content boolean; v_lineup boolean;
  v_old uuid[]; v_new uuid[]; v_oi text[]; v_ni text[]; v_kind text; v_detalle text; v_title text;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  v_content := (NEW.songs IS DISTINCT FROM OLD.songs OR NEW.date IS DISTINCT FROM OLD.date
             OR NEW.time IS DISTINCT FROM OLD.time OR NEW.band_id IS DISTINCT FROM OLD.band_id
             OR NEW.meeting_type IS DISTINCT FROM OLD.meeting_type);
  v_lineup := NEW.lineup IS DISTINCT FROM OLD.lineup;
  IF NOT v_content AND NOT v_lineup THEN RETURN NEW; END IF;

  BEGIN
    IF NEW.band_id IS NOT NULL THEN SELECT name INTO v_band FROM public.bands WHERE id = NEW.band_id; END IF;
    v_when   := to_char(NEW.date, 'DD/MM/YYYY');
    v_sufijo := CASE WHEN v_band IS NOT NULL THEN ' · ' || v_band ELSE '' END;

    IF v_content THEN
      -- ===== Rama de contenido (igual que antes + bloque de formación) =====
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

      FOR v_member IN
        SELECT DISTINCT m.id, m.name, m.email, m.user_id FROM public.members m
        WHERE m.active = true AND m.user_id IS DISTINCT FROM v_uid
          AND ( (NEW.band_id IS NOT NULL AND m.id = ANY (public.band_effective_member_ids(NEW.band_id))) OR m.role = 'pastor' )
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
                'formacion', public._lineup_html(NEW.lineup, NEW.band_id, v_member.id),
                'url', 'https://adorapp.net.ar/ordenes'), 5::smallint);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'notify_on_order_update: fallo para %: %', v_member.email, SQLERRM;
        END;
      END LOOP;

    ELSE
      -- ===== Rama SOLO formación: aviso puntual a quien entra / sale / cambia =====
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
          CONTINUE; -- sigue igual: no se lo molesta
        END IF;

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
$$;
REVOKE EXECUTE ON FUNCTION public.notify_on_order_update() FROM PUBLIC, anon, authenticated;

-- 7) Crons del SERVICIO: solo participantes ------------------------------------------
CREATE OR REPLACE FUNCTION public.send_rehearsal_reminders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ord RECORD; band_member RECORD; rehearsal_ts timestamptz;
BEGIN
  FOR ord IN
    SELECT o.id, o.rehearsal_date, o.rehearsal_time, public.order_participant_ids(o.id) AS participants
    FROM public.orders o
    JOIN public.bands b ON b.id = o.band_id
    WHERE o.rehearsal_date IS NOT NULL AND o.rehearsal_time IS NOT NULL AND o.rehearsal_reminder_sent = false
  LOOP
    BEGIN
      rehearsal_ts := (ord.rehearsal_date::text || ' ' || ord.rehearsal_time)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires';
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.orders SET rehearsal_reminder_sent = true WHERE id = ord.id;
      CONTINUE;
    END;

    IF NOW() >= rehearsal_ts - INTERVAL '2 hours' AND NOW() < rehearsal_ts THEN
      FOR band_member IN
        SELECT m.user_id, m.name, m.email FROM public.members m
        WHERE m.active = true AND m.user_id IS NOT NULL AND m.id = ANY(ord.participants)
      LOOP
        INSERT INTO public.notifications (title, message, type, user_id, is_global, created_at, expires_at)
        VALUES ('🎶 ¡Hoy tenés ensamble!',
                '¡Hoy tenés ensamble! Es hora de ensamblar con la banda las canciones que practicaste. ¡No faltes!',
                'reminder', band_member.user_id, false, NOW(), rehearsal_ts + INTERVAL '3 hours');
        IF band_member.email IS NOT NULL AND band_member.email <> '' THEN
          BEGIN
            PERFORM public.encolar_email('recordatorio-ensayo', band_member.email, band_member.name,
              jsonb_build_object('nombre', COALESCE(band_member.name, ''), 'fecha', to_char(ord.rehearsal_date, 'DD/MM'),
                                 'url', 'https://adorapp.net.ar/practica/' || ord.id), 3::smallint);
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'send_rehearsal_reminders: email enqueue failed for %: %', band_member.email, SQLERRM;
          END;
        END IF;
      END LOOP;
      UPDATE public.orders SET rehearsal_reminder_sent = true WHERE id = ord.id;
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_rehearsal_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_rehearsal_reminders() TO service_role;

CREATE OR REPLACE FUNCTION public.send_practice_reminders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec RECORD;
  today_art date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  FOR rec IN
    WITH member_users AS (
      SELECT m.id AS member_id, m.user_id
      FROM public.members m
      JOIN public.practice_alarms pa ON pa.user_id = m.user_id AND pa.enabled
      WHERE m.active = true AND m.user_id IS NOT NULL
    ),
    upcoming AS (
      SELECT mu.user_id, o.id AS order_id, o.date,
             (SELECT count(DISTINCT s->>'songId') FROM jsonb_array_elements(to_jsonb(o.songs)) s) AS song_count
      FROM public.orders o
      JOIN public.bands b ON b.id = o.band_id
      JOIN member_users mu ON mu.member_id = ANY (public.order_participant_ids(o.id))
      WHERE o.status = 'scheduled' AND o.date >= today_art AND jsonb_array_length(to_jsonb(o.songs)) > 0
    ),
    progress AS (
      SELECT u.user_id, u.order_id, u.date, u.song_count * 4 AS total,
        COALESCE((
          SELECT sum((pl.times_practiced > 0)::int + pl.knows_lyrics::int + pl.knows_structure::int + pl.knows_arrangements::int)
          FROM public.practice_logs pl
          WHERE pl.user_id = u.user_id AND pl.order_id = u.order_id
            AND pl.song_id::text IN (
              SELECT DISTINCT s->>'songId' FROM public.orders o2, jsonb_array_elements(to_jsonb(o2.songs)) s WHERE o2.id = u.order_id)
        ), 0) AS done
      FROM upcoming u
    ),
    pending AS (
      SELECT user_id, min(date) AS next_date FROM progress WHERE done < total GROUP BY user_id
    )
    SELECT p.* FROM pending p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = p.user_id AND n.type = 'reminder' AND n.title = '🎸 Tu ensayo te espera'
        AND (n.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = today_art)
  LOOP
    INSERT INTO public.notifications (title, message, type, user_id, is_global, created_at, expires_at)
    VALUES ('🎸 Tu ensayo te espera',
            'Tenés canciones por practicar para el orden del ' || to_char(rec.next_date, 'DD/MM') || '. Entrá a Mi Ensayo y sumá una pasada. ¡Cada pasada suma!',
            'reminder', rec.user_id, false, now(), now() + INTERVAL '24 hours');
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_practice_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_practice_reminders() TO service_role;

-- 8) Digest diario: la formación se reporta como categoría propia (landmine #51) ------
CREATE OR REPLACE FUNCTION public.activity_digest_items(p_start timestamptz, p_end timestamptz)
RETURNS TABLE(actor_name text, prio int, stem text, item text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  e record; real_keys text[];
  v_title text; v_when text; v_n int; bname text; t text; sid text; v_lu text;
  before_songs jsonb; after_songs jsonb; s jsonb; b jsonb;
  added text[]; removed text[]; keych text[]; dirch text[]; parts text[]; fields text[];
  bm uuid[]; am uuid[]; addm text[]; remm text[]; own_new boolean;
BEGIN
  FOR e IN
    SELECT ae.*, m.editor AS actor_editor
    FROM public.audit_events ae
    LEFT JOIN public.members m ON m.id = ae.actor_member_id
    WHERE ae.table_name IN ('songs', 'orders', 'bands')
      AND ae.action IN ('insert', 'update', 'delete')
      AND ae.actor_member_id IS NOT NULL
      AND ae.actor_role IS DISTINCT FROM 'pastor'
      AND (ae.actor_role = 'leader' OR COALESCE(m.editor, false) = true)
      AND ae.occurred_at >= p_start AND ae.occurred_at < p_end
    ORDER BY ae.occurred_at
  LOOP
    actor_name := COALESCE(e.actor_name, 'Alguien');
    SELECT COALESCE(array_agg(k), '{}'::text[]) INTO real_keys
    FROM jsonb_object_keys(COALESCE(e.changes, '{}'::jsonb)) k
    WHERE k NOT IN ('updated_at', 'last_used', 'rehearsal_reminder_sent');

    IF e.table_name = 'songs' THEN
      v_title := COALESCE((SELECT sg.title FROM public.songs sg WHERE sg.id = e.record_id), e.after->>'title', e.before->>'title', 'una canción');
      IF e.action = 'insert' THEN
        prio := 30; stem := 'cargó canciones nuevas al repertorio'; item := v_title; RETURN NEXT;
      ELSIF e.action = 'delete' THEN
        prio := 50; stem := 'eliminó canciones del repertorio'; item := v_title; RETURN NEXT;
      ELSIF e.action = 'update' THEN
        IF array_length(real_keys, 1) IS NULL THEN CONTINUE; END IF;
        IF real_keys && ARRAY['key', 'original_key'] THEN
          prio := 0; stem := '⚠️ cambió la TONALIDAD de canciones del repertorio';
          item := v_title || ' (' || COALESCE(e.before->>'original_key', e.before->>'key', '?') || ' → ' || COALESCE(e.after->>'original_key', e.after->>'key', '?') || ')';
          RETURN NEXT;
        END IF;
        IF real_keys && ARRAY['structure'] THEN
          own_new := EXISTS (SELECT 1 FROM public.audit_events c WHERE c.table_name = 'songs' AND c.action = 'insert'
                             AND c.record_id = e.record_id AND c.actor_member_id = e.actor_member_id AND c.occurred_at >= p_start - interval '7 days');
          IF own_new THEN prio := 20; stem := 'completó acordes/contenido de canciones nuevas que cargó';
          ELSE prio := 10; stem := '⚠️ editó acordes o contenido de canciones que ya existían'; END IF;
          item := v_title; RETURN NEXT;
        END IF;
        SELECT array_agg(DISTINCT lbl) INTO fields FROM (
          SELECT CASE k WHEN 'title' THEN 'título' WHEN 'artist' THEN 'artista' WHEN 'youtube_url' THEN 'link de YouTube'
            WHEN 'categories' THEN 'categorías' WHEN 'category' THEN 'categorías' WHEN 'bpm' THEN 'BPM' WHEN 'compass' THEN 'compás' END AS lbl
          FROM unnest(real_keys) k) x WHERE lbl IS NOT NULL;
        IF array_length(fields, 1) IS NOT NULL THEN
          prio := 40; stem := 'corrigió datos de la ficha de canciones'; item := v_title || ' (' || array_to_string(fields, ', ') || ')'; RETURN NEXT;
        END IF;
      END IF;

    ELSIF e.table_name = 'orders' THEN
      v_when := to_char(COALESCE((e.after->>'date')::date, (e.before->>'date')::date), 'DD/MM');
      IF e.action = 'insert' THEN
        v_n := COALESCE(jsonb_array_length(e.after->'songs'), 0);
        v_lu := CASE WHEN e.after->'lineup'->>'mode' = 'custom' THEN ', formación de ' || jsonb_array_length(e.after->'lineup'->'members')
                          || CASE WHEN jsonb_array_length(e.after->'lineup'->'members') = 1 THEN ' integrante' ELSE ' integrantes' END
                     WHEN e.after->'lineup'->>'mode' = 'all' THEN ', participan todos' ELSE '' END;
        prio := 60; stem := 'armó órdenes';
        item := 'del ' || v_when || ' (' || v_n || CASE WHEN v_n = 1 THEN ' canción' ELSE ' canciones' END || v_lu || ')';
        RETURN NEXT;
      ELSIF e.action = 'delete' THEN
        prio := 100; stem := 'eliminó órdenes'; item := 'del ' || v_when; RETURN NEXT;
      ELSIF e.action = 'update' THEN
        IF array_length(real_keys, 1) IS NULL THEN CONTINUE; END IF;
        IF real_keys && ARRAY['songs'] THEN
          before_songs := COALESCE(e.before->'songs', '[]'::jsonb); after_songs := COALESCE(e.after->'songs', '[]'::jsonb);
          added := '{}'; removed := '{}'; keych := '{}'; dirch := '{}';
          FOR s IN SELECT value FROM jsonb_array_elements(after_songs) LOOP
            sid := s->>'songId';
            t := COALESCE((SELECT sg.title FROM public.songs sg WHERE sg.id::text = sid), 'una canción');
            SELECT value INTO b FROM jsonb_array_elements(before_songs) WHERE value->>'songId' = sid LIMIT 1;
            IF b IS NULL THEN added := added || t;
            ELSE
              IF (b->>'key') IS DISTINCT FROM (s->>'key') THEN keych := keych || (t || ' (' || COALESCE(b->>'key', '?') || ' → ' || COALESCE(s->>'key', '?') || ')'); END IF;
              IF (b->>'directorId') IS DISTINCT FROM (s->>'directorId') THEN
                dirch := dirch || (t || ' → ' || COALESCE((SELECT mm.name FROM public.members mm WHERE mm.id::text = s->>'directorId'), 'sin director'));
              END IF;
            END IF;
          END LOOP;
          FOR b IN SELECT value FROM jsonb_array_elements(before_songs) LOOP
            sid := b->>'songId';
            IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(after_songs) WHERE value->>'songId' = sid) THEN
              removed := removed || COALESCE((SELECT sg.title FROM public.songs sg WHERE sg.id::text = sid), 'una canción');
            END IF;
          END LOOP;
          parts := '{}';
          IF array_length(added, 1)   IS NOT NULL THEN parts := parts || ('agregó ' || public._join_names(added[1:9], array_length(added, 1))); END IF;
          IF array_length(removed, 1) IS NOT NULL THEN parts := parts || ('quitó ' || public._join_names(removed[1:9], array_length(removed, 1))); END IF;
          IF array_length(keych, 1)   IS NOT NULL THEN parts := parts || ('cambió el tono en el orden de ' || public._join_names(keych[1:9], array_length(keych, 1))); END IF;
          IF array_length(dirch, 1)   IS NOT NULL THEN parts := parts || ('cambió el director de ' || public._join_names(dirch[1:9], array_length(dirch, 1))); END IF;
          prio := 70; stem := 'cambió las canciones de órdenes';
          item := 'del ' || v_when || CASE WHEN array_length(parts, 1) IS NULL THEN ' (reordenó)' ELSE ' — ' || array_to_string(parts, '; ') END;
          RETURN NEXT;
        END IF;
        IF real_keys && ARRAY['lineup'] THEN
          prio := 65; stem := 'definió la formación de órdenes';
          item := 'del ' || v_when || ' (' || CASE WHEN e.after->'lineup'->>'mode' = 'custom' THEN jsonb_array_length(e.after->'lineup'->'members')
                                                        || CASE WHEN jsonb_array_length(e.after->'lineup'->'members') = 1 THEN ' integrante' ELSE ' integrantes' END
                                                   WHEN e.after->'lineup'->>'mode' = 'all' THEN 'participan todos' ELSE 'sin formación' END || ')';
          RETURN NEXT;
        END IF;
        IF real_keys && ARRAY['status'] THEN
          prio := 80; stem := 'cambió el estado de órdenes';
          item := 'del ' || v_when || ' → ' || CASE e.after->>'status' WHEN 'completed' THEN 'completado' WHEN 'cancelled' THEN 'cancelado'
                    WHEN 'scheduled' THEN 'reabierto (programado)' ELSE COALESCE(e.after->>'status', '?') END;
          RETURN NEXT;
        END IF;
        SELECT array_agg(DISTINCT lbl) INTO fields FROM (
          SELECT CASE k WHEN 'date' THEN 'fecha' WHEN 'time' THEN 'hora' WHEN 'band_id' THEN 'banda' WHEN 'meeting_type' THEN 'tipo de reunión'
            WHEN 'rehearsal_date' THEN 'ensamble' WHEN 'rehearsal_time' THEN 'ensamble' WHEN 'feedback' THEN 'comentario' END AS lbl
          FROM unnest(real_keys) k) x WHERE lbl IS NOT NULL;
        IF array_length(fields, 1) IS NOT NULL THEN
          prio := 90; stem := 'editó datos de órdenes'; item := 'del ' || v_when || ' (' || array_to_string(fields, ', ') || ')'; RETURN NEXT;
        END IF;
      END IF;

    ELSIF e.table_name = 'bands' THEN
      bname := COALESCE((SELECT bd.name FROM public.bands bd WHERE bd.id = e.record_id), e.after->>'name', e.before->>'name', 'una banda');
      IF e.action = 'insert' THEN prio := 110; stem := 'creó bandas'; item := bname; RETURN NEXT;
      ELSIF e.action = 'delete' THEN prio := 140; stem := 'eliminó bandas'; item := bname; RETURN NEXT;
      ELSIF e.action = 'update' THEN
        IF array_length(real_keys, 1) IS NULL THEN CONTINUE; END IF;
        IF real_keys && ARRAY['members'] THEN
          SELECT COALESCE(array_agg(x::uuid), '{}'::uuid[]) INTO bm FROM jsonb_array_elements_text(COALESCE(e.before->'members', '[]'::jsonb)) x;
          SELECT COALESCE(array_agg(x::uuid), '{}'::uuid[]) INTO am FROM jsonb_array_elements_text(COALESCE(e.after->'members',  '[]'::jsonb)) x;
          SELECT COALESCE(array_agg(mm.name), '{}'::text[]) INTO addm FROM public.members mm WHERE mm.id = ANY(am) AND NOT (mm.id = ANY(bm));
          SELECT COALESCE(array_agg(mm.name), '{}'::text[]) INTO remm FROM public.members mm WHERE mm.id = ANY(bm) AND NOT (mm.id = ANY(am));
          IF array_length(addm, 1) IS NOT NULL THEN prio := 120; stem := 'sumó integrantes a bandas'; item := public._join_names(addm[1:9], array_length(addm, 1)) || ' a ' || bname; RETURN NEXT; END IF;
          IF array_length(remm, 1) IS NOT NULL THEN prio := 121; stem := 'quitó integrantes de bandas'; item := public._join_names(remm[1:9], array_length(remm, 1)) || ' de ' || bname; RETURN NEXT; END IF;
        END IF;
        IF real_keys && ARRAY['name', 'meeting_type', 'meeting_day', 'meeting_time', 'active'] THEN
          prio := 130; stem := 'editó datos de bandas'; item := bname; RETURN NEXT;
        END IF;
      END IF;
    END IF;
  END LOOP;

  FOR e IN
    SELECT t.band_id, t.member_id, t.expires_at, t.created_at, a.name AS who_name, a.role AS who_role, a.editor AS who_editor
    FROM public.band_temporary_members t JOIN public.members a ON a.id = t.added_by
    WHERE t.created_at >= p_start AND t.created_at < p_end AND a.role IS DISTINCT FROM 'pastor'
      AND (a.role = 'leader' OR COALESCE(a.editor, false) = true)
    ORDER BY t.created_at
  LOOP
    actor_name := COALESCE(e.who_name, 'Alguien');
    prio := 122; stem := 'sumó integrantes temporales a bandas';
    item := COALESCE((SELECT mm.name FROM public.members mm WHERE mm.id = e.member_id), 'alguien')
         || ' a ' || COALESCE((SELECT bd.name FROM public.bands bd WHERE bd.id = e.band_id), 'una banda')
         || ' (hasta el ' || to_char(e.expires_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM') || ')';
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.activity_digest_items(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

-- 9) Plantillas ----------------------------------------------------------------------
-- Las plantillas vivas las editan los pastores desde la UI → se modifican por
-- reemplazo quirúrgico sobre el cuerpo actual, nunca pisándolo.
UPDATE public.email_templates
SET cuerpo_html = replace(cuerpo_html, 'prepararte desde la plataforma.<br><br>', 'prepararte desde la plataforma.<br><br>{{formacion}}'), updated_at = now()
WHERE slug = 'nuevo-orden' AND position('{{formacion}}' IN cuerpo_html) = 0 AND position('prepararte desde la plataforma.<br><br>' IN cuerpo_html) > 0;
UPDATE public.email_templates
SET cuerpo_html = cuerpo_html || '<br>{{formacion}}', updated_at = now()
WHERE slug = 'nuevo-orden' AND position('{{formacion}}' IN cuerpo_html) = 0;
-- Etiquetas sin cerrar (todo lo que seguía quedaba en cursiva/negrita).
UPDATE public.email_templates
SET cuerpo_html = replace(replace(cuerpo_html, 'para apoyarte.<em>', 'para apoyarte.</em>'), 'servicio a Dios.<strong>', 'servicio a Dios.</strong>'), updated_at = now()
WHERE slug = 'nuevo-orden' AND (position('para apoyarte.<em>' IN cuerpo_html) > 0 OR position('servicio a Dios.<strong>' IN cuerpo_html) > 0);
UPDATE public.email_templates
SET cuerpo_html = replace(cuerpo_html, 'al ensamble.<em>', 'al ensamble.</em>'), updated_at = now()
WHERE slug = 'recordatorio-ensayo' AND position('al ensamble.<em>' IN cuerpo_html) > 0;

UPDATE public.email_templates
SET cuerpo_html = replace(cuerpo_html, '{{cambios}}<br><br>', '{{cambios}}<br><br>{{formacion}}'), updated_at = now()
WHERE slug = 'orden-editado' AND position('{{formacion}}' IN cuerpo_html) = 0 AND position('{{cambios}}<br><br>' IN cuerpo_html) > 0;
UPDATE public.email_templates
SET cuerpo_html = cuerpo_html || '<br>{{formacion}}', updated_at = now()
WHERE slug = 'orden-editado' AND position('{{formacion}}' IN cuerpo_html) = 0;

INSERT INTO public.email_templates
  (slug, descripcion, asunto, kicker, titulo, cuerpo_html, cta_text, cta_url, color_acento, mostrar_logo, firma, activo)
VALUES
  ('formacion-cambio',
   'Aviso puntual a quien entra, sale o cambia de instrumento en la formación de un orden',
   'Cambio en la formación del {{fecha}}',
   'ADORACIÓN CAF',
   'Cambio en la formación',
   'Hola {{nombre}}, {{detalle}}<br><br>Podés ver el orden completo y los acordes de cada canción desde la plataforma.<br><br>Un abrazo!',
   'Ver el orden', '{{url}}',
   '#b8860b', true, 'Pastores de Adoración CAF', true)
ON CONFLICT (slug) DO NOTHING;
