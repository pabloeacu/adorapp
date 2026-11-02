-- ─────────────────────────────────────────────────────────────────────────────
-- Ministración: el correo sale por el CARRIL EXPRÉS (aviso de culto EN VIVO)
-- ─────────────────────────────────────────────────────────────────────────────
-- Único cambio funcional respecto de 20260913_ministracion_y_ensayometro.sql:
-- `encolar_email('ministracion', …)` pasa de prioridad 5 (goteo normal) a
-- prioridad 0 (carril exprés del worker send-emails). Con esto, cuando el
-- líder/pastor asigna la canción de ministración durante el servicio, el push
-- aparece al instante y el correo sale a TODOS los destinatarios A LA VEZ en el
-- próximo latido del cron (≤ 60 s), sin el goteo de 1/minuto ni el piso de 5 min
-- por-destinatario. Un aviso tardío no sirve en vivo; son pocos destinatarios
-- (formación ∪ pastores ∪ Multimedia ∪ Sonido) y 4x/semana → no afecta la
-- reputación del remitente. El resto del correo sigue el ritmo normal.
--
-- El worker (supabase/functions/send-emails/index.ts) reconoce la prioridad 0
-- como "exprés": la drena entera en el mismo latido, salteando ambos frenos.
-- Prioridad 0 NO la usaba ningún otro correo (verificado en email_queue en vivo).
--
-- CREATE OR REPLACE con el cuerpo idéntico al vigente (verificado byte a byte
-- contra pg_get_functiondef): no cambia ninguna otra lógica (gate, ventana,
-- validaciones, idempotencia, push, song_key_history, silenciado del aviso
-- genérico). Re-aserta REVOKE/GRANT por las dudas (patrón del proyecto).
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
          -- prioridad 0 = CARRIL EXPRÉS (sale a todos de una, al minuto; sin goteo ni piso de 5 min).
          PERFORM public.encolar_email('ministracion', v_member.email, v_member.name,
            jsonb_build_object('nombre', COALESCE(v_member.name, ''), 'fecha', v_when,
              'banda_sufijo', public._html_escape(v_sufijo), 'quien', public._html_escape(COALESCE(v_me.name, 'El líder')),
              'canciones', v_list_html,
              'url', 'https://adorapp.net.ar/ordenes?order=' || v_order.id::text), 0::smallint);
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
