-- "¿Con qué ministramos?" (canción de ministración, atajo del líder/pastor durante el
-- servicio) + Ensayómetro para quien solo canta + hora del orden obligatoria.
-- Decisiones de Paul (2026-09-13); ver CLAUDE.md "Estado al 2026-09-13 (II)".

-- ─────────────────────────────────────────────────────────────────────────────
-- 0 · La hora del servicio es obligatoria (0 filas sin hora al aplicar; el CHECK
--     HH:MM ya existe y dejaba pasar NULL; el cliente ahora la exige en el form).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.orders ALTER COLUMN "time" SET NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- Inicio del servicio (fecha + hora en ART) como instante UTC. Espejo de
-- serviceStartEpoch() del cliente.
CREATE OR REPLACE FUNCTION public._service_start_utc(p_date date, p_time text)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_date IS NULL THEN NULL
    ELSE ((p_date::text || ' ' || COALESCE(NULLIF(p_time, ''), '00:00'))::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
  END;
$$;
REVOKE EXECUTE ON FUNCTION public._service_start_utc(date, text) FROM PUBLIC, anon, authenticated;

-- ¿Solo canta? TODOS sus instrumentos (en ese orden) son Voz/Coros y tiene al menos uno.
-- Espejo EXACTO de isSingerOnly() en src/lib/ensayometro.js (landmine #27).
CREATE OR REPLACE FUNCTION public._singer_only(p_instruments text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(cardinality(p_instruments), 0) > 0
     AND p_instruments <@ ARRAY['Voz', 'Coros']::text[];
$$;
REVOKE EXECUTE ON FUNCTION public._singer_only(text[]) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · Plantilla de correo
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.email_templates
  (slug, descripcion, asunto, kicker, titulo, cuerpo_html, cta_text, cta_url, color_acento, mostrar_logo, firma, activo)
VALUES
  ('ministracion',
   'Canción de ministración asignada durante el servicio (formación + Multimedia + Sonido + pastores)',
   'Canción de ministración',
   'ADORACIÓN CAF',
   '¿Con qué ministramos?',
   'Hola {{nombre}}, <strong>{{quien}}</strong> eligió la canción de ministración para la parte final del servicio del <strong>{{fecha}}</strong>{{banda_sufijo}}:<br><br>{{canciones}}<br>Ya está agregada al final del orden. Podés ver los acordes en el tono elegido desde la plataforma.<br><br>Un abrazo!',
   'Ver el orden', '{{url}}', '#b8860b', true, 'Pastores de Adoración CAF', true)
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · RPC add_ministration_songs(p_order_id, p_songs)
--     p_songs = [{ "songId": uuid, "key": "Dm", "directorId": uuid|null }, …] (1..10)
--     Gate: pastor activo (cualquier banda) o líder activo miembro PERMANENTE de la banda
--     del orden. Ventana: [inicio del servicio, +3 h). Orden 'scheduled' con banda.
--     Agrega al FINAL de orders.songs con la marca "ministracion": true, sella
--     songs.last_used, registra el tono del director (song_key_history) y avisa por
--     push + correo a formación ∪ pastores ∪ Multimedia ∪ Sonido (sin quien lo hizo).
--     El aviso genérico "Orden actualizado" (notify_on_order_update) se silencia para
--     este UPDATE ocupando su throttle `order_edit:<id>` (90 s) ANTES del UPDATE.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_ministration_songs(p_order_id uuid, p_songs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me record; v_order record; v_band record; v_eff uuid[]; v_start timestamptz;
  e jsonb; v_sid uuid; v_did uuid; v_key text; v_title text; v_dname text;
  v_new jsonb := '[]'::jsonb; v_seen uuid[] := '{}'::uuid[]; v_existing uuid[];
  v_added int := 0; v_skipped int := 0; v_list_html text := ''; v_list_txt text := '';
  v_when text; v_sufijo text; v_member record; v_notified int := 0; v_participants uuid[];
BEGIN
  -- Quién llama (ficha ACTIVA; NULL-safe, landmine #71).
  SELECT m.id, m.name, m.role, m.user_id INTO v_me
  FROM public.members m WHERE m.user_id = auth.uid() AND m.active LIMIT 1;
  IF v_me.id IS NULL THEN
    RAISE EXCEPTION 'No tenés permiso para asignar la ministración.' USING ERRCODE = '42501';
  END IF;

  SELECT o.id, o.date, o."time", o.band_id, o.status, o.songs INTO v_order
  FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'orden_inexistente' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.status IS DISTINCT FROM 'scheduled' THEN
    RAISE EXCEPTION 'orden_no_programado' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.band_id IS NULL THEN
    RAISE EXCEPTION 'orden_sin_banda' USING ERRCODE = 'P0001';
  END IF;

  SELECT b.id, b.name, COALESCE(b.members, '{}'::uuid[]) AS members INTO v_band
  FROM public.bands b WHERE b.id = v_order.band_id;
  IF v_band.id IS NULL THEN
    RAISE EXCEPTION 'orden_sin_banda' USING ERRCODE = 'P0001';
  END IF;

  -- Gate: pastor, o líder miembro permanente de la banda del orden (espejo de
  -- canOfferMinistration en src/lib/ministration.js).
  IF NOT COALESCE(v_me.role = 'pastor' OR (v_me.role = 'leader' AND v_me.id = ANY(v_band.members)), false) THEN
    RAISE EXCEPTION 'No tenés permiso para asignar la ministración de este orden.' USING ERRCODE = '42501';
  END IF;

  -- Ventana: [inicio, inicio + 3 h).
  v_start := public._service_start_utc(v_order.date, v_order."time");
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'orden_sin_hora' USING ERRCODE = 'P0001';
  END IF;
  IF now() < v_start THEN
    RAISE EXCEPTION 'todavia_no_empezo' USING ERRCODE = 'P0001';
  END IF;
  IF now() >= v_start + interval '3 hours' THEN
    RAISE EXCEPTION 'ventana_vencida' USING ERRCODE = 'P0001';
  END IF;

  -- Canciones: 1..10, cada una con songId existente, tono válido y director (opcional)
  -- integrante EFECTIVO activo de la banda. Idempotente: una canción ya marcada como
  -- ministración en el orden se saltea (doble tap / reintento).
  IF p_songs IS NULL OR jsonb_typeof(p_songs) <> 'array' OR jsonb_array_length(p_songs) = 0 THEN
    RAISE EXCEPTION 'sin_canciones' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(p_songs) > 10 THEN
    RAISE EXCEPTION 'demasiadas_canciones' USING ERRCODE = 'P0001';
  END IF;
  v_eff := public.band_effective_member_ids(v_order.band_id);
  SELECT COALESCE(array_agg(public._safe_uuid(s->>'songId')), '{}'::uuid[]) INTO v_existing
  FROM jsonb_array_elements(COALESCE(v_order.songs, '[]'::jsonb)) s
  WHERE (s->>'ministracion')::boolean IS TRUE;

  FOR e IN SELECT value FROM jsonb_array_elements(p_songs) LOOP
    IF jsonb_typeof(e) <> 'object' THEN
      RAISE EXCEPTION 'cancion_invalida' USING ERRCODE = 'P0001';
    END IF;
    v_sid := public._safe_uuid(e->>'songId');
    IF v_sid IS NULL THEN
      RAISE EXCEPTION 'cancion_invalida' USING ERRCODE = 'P0001';
    END IF;
    SELECT s.title INTO v_title FROM public.songs s WHERE s.id = v_sid;
    IF v_title IS NULL THEN
      RAISE EXCEPTION 'cancion_inexistente' USING ERRCODE = 'P0001';
    END IF;
    v_key := btrim(COALESCE(e->>'key', ''));
    IF v_key !~ '^[A-G]#?m?$' THEN
      RAISE EXCEPTION 'tono_invalido' USING ERRCODE = 'P0001';
    END IF;
    v_did := public._safe_uuid(e->>'directorId');
    v_dname := NULL;
    IF v_did IS NOT NULL THEN
      SELECT m.name INTO v_dname FROM public.members m
      WHERE m.id = v_did AND m.active AND m.id = ANY(v_eff);
      IF v_dname IS NULL THEN
        RAISE EXCEPTION 'director_invalido' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    IF v_sid = ANY(v_seen) OR v_sid = ANY(v_existing) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    v_seen := v_seen || v_sid;
    v_new := v_new || jsonb_build_object('songId', v_sid, 'key', v_key, 'directorId', v_did, 'ministracion', true);
    v_added := v_added + 1;
    v_list_html := v_list_html || '• <strong>' || public._html_escape(v_title) || '</strong> en ' || public._html_escape(v_key)
                || CASE WHEN v_dname IS NOT NULL THEN ' · dirige ' || public._html_escape(v_dname) ELSE '' END || '<br>';
    v_list_txt := v_list_txt || CASE WHEN v_list_txt = '' THEN '' ELSE ' · ' END
               || '«' || v_title || '» en ' || v_key || CASE WHEN v_dname IS NOT NULL THEN ' (dirige ' || v_dname || ')' ELSE '' END;

    -- Tono del director para esa canción (misma memoria que usa el editor de órdenes).
    IF v_did IS NOT NULL THEN
      BEGIN
        INSERT INTO public.song_key_history (member_id, song_id, key, order_id, order_date, updated_at)
        VALUES (v_did, v_sid, v_key, v_order.id, v_order.date, now())
        ON CONFLICT (member_id, song_id) DO UPDATE
          SET key = EXCLUDED.key, order_id = EXCLUDED.order_id, order_date = EXCLUDED.order_date, updated_at = now();
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    BEGIN
      UPDATE public.songs SET last_used = v_order.date WHERE id = v_sid;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  IF v_added = 0 THEN
    RETURN jsonb_build_object('ok', true, 'added', 0, 'skipped', v_skipped, 'notified', 0);
  END IF;

  -- Silenciar el aviso genérico de edición para este UPDATE: ocupa su throttle de 90 s.
  INSERT INTO public.email_throttle (key, last_sent_at) VALUES ('order_edit:' || v_order.id::text, now())
  ON CONFLICT (key) DO UPDATE SET last_sent_at = now();

  UPDATE public.orders SET songs = COALESCE(songs, '[]'::jsonb) || v_new WHERE id = v_order.id;

  -- Aviso propio: formación del orden ∪ pastores ∪ Multimedia ∪ Sonido, sin quien lo hizo.
  BEGIN
    v_participants := public.order_participant_ids(v_order.id);
    v_when := to_char(v_order.date, 'DD/MM/YYYY');
    v_sufijo := ' · ' || v_band.name;
    FOR v_member IN
      SELECT DISTINCT m.id, m.name, m.email, m.user_id FROM public.members m
      WHERE m.active = true AND m.id IS DISTINCT FROM v_me.id
        AND ( m.id = ANY(COALESCE(v_participants, '{}'::uuid[])) OR m.role = 'pastor'
              OR (m.areas && ARRAY['multimedia', 'sonido']::text[]) )
    LOOP
      BEGIN
        IF v_member.user_id IS NOT NULL THEN
          INSERT INTO public.notifications (user_id, title, message, type, is_global, created_at, expires_at)
          VALUES (v_member.user_id, '🎤 Canción de ministración',
                  v_list_txt || ' · Orden del ' || v_when || v_sufijo, 'order', false, now(), now() + interval '7 days');
        END IF;
        IF v_member.email IS NOT NULL AND v_member.email <> '' THEN
          PERFORM public.encolar_email('ministracion', v_member.email, v_member.name,
            jsonb_build_object('nombre', COALESCE(v_member.name, ''), 'fecha', v_when,
              'banda_sufijo', public._html_escape(v_sufijo), 'quien', public._html_escape(COALESCE(v_me.name, 'El líder')),
              'canciones', v_list_html,
              'url', 'https://adorapp.net.ar/ordenes?order=' || v_order.id::text), 5::smallint);
        END IF;
        v_notified := v_notified + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'add_ministration_songs: fallo para %: %', v_member.email, SQLERRM;
      END;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.error_log (message, severity, context)
      VALUES ('add_ministration_songs: fallo en el aviso', 'warning',
              jsonb_build_object('order', v_order.id, 'error', SQLERRM));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END;

  RETURN jsonb_build_object('ok', true, 'added', v_added, 'skipped', v_skipped, 'notified', v_notified, 'songs', v_new);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_ministration_songs(uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.add_ministration_songs(uuid, jsonb) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · Alarma de ensayo (cron practice-reminders): quien SOLO canta mide 3 hitos por
--     canción (sin "Frases y arreglos"). Espejo de src/lib/ensayometro.js.
--     Instrumentos "en ese orden" = _lineup_member_instruments(lineup, member)
--     (formación custom → los de la formación; all/NULL → los de la ficha).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_practice_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      SELECT mu.user_id, mu.member_id, o.id AS order_id, o.date,
             (SELECT count(DISTINCT s->>'songId') FROM jsonb_array_elements(to_jsonb(o.songs)) s) AS song_count,
             public._singer_only(public._lineup_member_instruments(o.lineup, mu.member_id)) AS singer
      FROM public.orders o
      JOIN public.bands b ON b.id = o.band_id
      JOIN member_users mu ON mu.member_id = ANY (public.order_participant_ids(o.id))
      WHERE o.status = 'scheduled' AND o.date >= today_art AND jsonb_array_length(to_jsonb(o.songs)) > 0
    ),
    progress AS (
      SELECT u.user_id, u.order_id, u.date,
        u.song_count * (CASE WHEN u.singer THEN 3 ELSE 4 END) AS total,
        COALESCE((
          SELECT sum((pl.times_practiced > 0)::int + pl.knows_lyrics::int + pl.knows_structure::int
                     + (CASE WHEN u.singer THEN 0 ELSE pl.knows_arrangements::int END))
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
-- CREATE OR REPLACE resetea grants (landmine #39): re-asertar.
REVOKE EXECUTE ON FUNCTION public.send_practice_reminders() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.send_practice_reminders() TO service_role;
