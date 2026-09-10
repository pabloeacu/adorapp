-- Resumen diario a pastores ("Movimientos del día") — clasificación PRECISA.
--
-- Problema (reporte de Paul, 10-sep-2026): el resumen decía "Melanie editó 5
-- canciones" cuando en realidad solo armó un orden. Causa: agrupaba por
-- tabla+acción sin mirar QUÉ campos cambiaron, y contaba como "edición" el
-- sello automático songs.last_used que la app pone al crear un orden
-- (appStore.addOrder → updateSong({lastUsed})). Además no distinguía
-- asignación de canciones (dentro del orden, con el transportador) de una
-- edición real de acordes/tonalidad en el repertorio — justo lo que a un
-- pastor le importa vigilar.
--
-- Solución: activity_digest_items() clasifica cada evento de audit_events por
-- los campos reales que cambiaron (changes sin updated_at/last_used/
-- rehearsal_reminder_sent) y devuelve líneas legibles por actor con prioridad
-- (las alertas ⚠️ primero). send_leader_activity_digest() conserva ventana,
-- filtro (líderes/editores, no pastores), throttle diario y encolado, pero
-- arma el HTML con esas líneas y cierra con una nota fija que explica que
-- asignar/transportar dentro de un orden NO modifica la canción.
--
-- Blindaje: ambas SECURITY DEFINER + search_path fijo + REVOKE del RPC
-- (CREATE OR REPLACE resetea grants → se re-asertan acá).

CREATE OR REPLACE FUNCTION public.activity_digest_items(p_start timestamptz, p_end timestamptz)
RETURNS TABLE(actor_name text, prio int, stem text, item text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  e record;
  real_keys text[];
  v_title text; v_when text; v_n int; bname text; t text; sid text;
  before_songs jsonb; after_songs jsonb; s jsonb; b jsonb;
  added text[]; removed text[]; keych text[]; dirch text[]; parts text[]; fields text[];
  bm uuid[]; am uuid[]; addm text[]; remm text[];
  own_new boolean;
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
    -- Campos que cambiaron de verdad (sin los sellos automáticos).
    SELECT COALESCE(array_agg(k), '{}'::text[]) INTO real_keys
    FROM jsonb_object_keys(COALESCE(e.changes, '{}'::jsonb)) k
    WHERE k NOT IN ('updated_at', 'last_used', 'rehearsal_reminder_sent');

    -- ================= CANCIONES =================
    IF e.table_name = 'songs' THEN
      v_title := COALESCE((SELECT sg.title FROM public.songs sg WHERE sg.id = e.record_id),
                          e.after->>'title', e.before->>'title', 'una canción');
      IF e.action = 'insert' THEN
        prio := 30; stem := 'cargó canciones nuevas al repertorio'; item := v_title; RETURN NEXT;
      ELSIF e.action = 'delete' THEN
        prio := 50; stem := 'eliminó canciones del repertorio'; item := v_title; RETURN NEXT;
      ELSIF e.action = 'update' THEN
        -- Solo last_used/updated_at = sello automático al armar un orden → NO es edición.
        IF array_length(real_keys, 1) IS NULL THEN CONTINUE; END IF;
        IF real_keys && ARRAY['key', 'original_key'] THEN
          prio := 0; stem := '⚠️ cambió la TONALIDAD de canciones del repertorio';
          item := v_title || ' (' || COALESCE(e.before->>'original_key', e.before->>'key', '?')
                  || ' → ' || COALESCE(e.after->>'original_key', e.after->>'key', '?') || ')';
          RETURN NEXT;
        END IF;
        IF real_keys && ARRAY['structure'] THEN
          -- ¿La cargó ella/él mismo hace poco? Entonces está completando su propia canción nueva.
          own_new := EXISTS (
            SELECT 1 FROM public.audit_events c
            WHERE c.table_name = 'songs' AND c.action = 'insert'
              AND c.record_id = e.record_id AND c.actor_member_id = e.actor_member_id
              AND c.occurred_at >= p_start - interval '7 days'
          );
          IF own_new THEN
            prio := 20; stem := 'completó acordes/contenido de canciones nuevas que cargó';
          ELSE
            prio := 10; stem := '⚠️ editó acordes o contenido de canciones que ya existían';
          END IF;
          item := v_title; RETURN NEXT;
        END IF;
        SELECT array_agg(DISTINCT lbl) INTO fields FROM (
          SELECT CASE k
            WHEN 'title' THEN 'título' WHEN 'artist' THEN 'artista' WHEN 'youtube_url' THEN 'link de YouTube'
            WHEN 'categories' THEN 'categorías' WHEN 'category' THEN 'categorías'
            WHEN 'bpm' THEN 'BPM' WHEN 'compass' THEN 'compás' END AS lbl
          FROM unnest(real_keys) k
        ) x WHERE lbl IS NOT NULL;
        IF array_length(fields, 1) IS NOT NULL THEN
          prio := 40; stem := 'corrigió datos de la ficha de canciones';
          item := v_title || ' (' || array_to_string(fields, ', ') || ')'; RETURN NEXT;
        END IF;
      END IF;

    -- ================= ÓRDENES =================
    ELSIF e.table_name = 'orders' THEN
      v_when := to_char(COALESCE((e.after->>'date')::date, (e.before->>'date')::date), 'DD/MM');
      IF e.action = 'insert' THEN
        v_n := COALESCE(jsonb_array_length(e.after->'songs'), 0);
        prio := 60; stem := 'armó órdenes';
        item := 'del ' || v_when || ' (' || v_n || CASE WHEN v_n = 1 THEN ' canción)' ELSE ' canciones)' END;
        RETURN NEXT;
      ELSIF e.action = 'delete' THEN
        prio := 100; stem := 'eliminó órdenes'; item := 'del ' || v_when; RETURN NEXT;
      ELSIF e.action = 'update' THEN
        IF array_length(real_keys, 1) IS NULL THEN CONTINUE; END IF;
        IF real_keys && ARRAY['songs'] THEN
          before_songs := COALESCE(e.before->'songs', '[]'::jsonb);
          after_songs  := COALESCE(e.after->'songs',  '[]'::jsonb);
          added := '{}'; removed := '{}'; keych := '{}'; dirch := '{}';
          FOR s IN SELECT value FROM jsonb_array_elements(after_songs) LOOP
            sid := s->>'songId';
            t := COALESCE((SELECT sg.title FROM public.songs sg WHERE sg.id::text = sid), 'una canción');
            SELECT value INTO b FROM jsonb_array_elements(before_songs) WHERE value->>'songId' = sid LIMIT 1;
            IF b IS NULL THEN
              added := added || t;
            ELSE
              IF (b->>'key') IS DISTINCT FROM (s->>'key') THEN
                keych := keych || (t || ' (' || COALESCE(b->>'key', '?') || ' → ' || COALESCE(s->>'key', '?') || ')');
              END IF;
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
        IF real_keys && ARRAY['status'] THEN
          prio := 80; stem := 'cambió el estado de órdenes';
          item := 'del ' || v_when || ' → ' || CASE e.after->>'status'
                    WHEN 'completed' THEN 'completado' WHEN 'cancelled' THEN 'cancelado'
                    WHEN 'scheduled' THEN 'reabierto (programado)' ELSE COALESCE(e.after->>'status', '?') END;
          RETURN NEXT;
        END IF;
        SELECT array_agg(DISTINCT lbl) INTO fields FROM (
          SELECT CASE k
            WHEN 'date' THEN 'fecha' WHEN 'time' THEN 'hora' WHEN 'band_id' THEN 'banda'
            WHEN 'meeting_type' THEN 'tipo de reunión' WHEN 'rehearsal_date' THEN 'ensamble'
            WHEN 'rehearsal_time' THEN 'ensamble' WHEN 'feedback' THEN 'comentario' END AS lbl
          FROM unnest(real_keys) k
        ) x WHERE lbl IS NOT NULL;
        IF array_length(fields, 1) IS NOT NULL THEN
          prio := 90; stem := 'editó datos de órdenes';
          item := 'del ' || v_when || ' (' || array_to_string(fields, ', ') || ')'; RETURN NEXT;
        END IF;
      END IF;

    -- ================= BANDAS =================
    ELSIF e.table_name = 'bands' THEN
      bname := COALESCE((SELECT bd.name FROM public.bands bd WHERE bd.id = e.record_id),
                        e.after->>'name', e.before->>'name', 'una banda');
      IF e.action = 'insert' THEN
        prio := 110; stem := 'creó bandas'; item := bname; RETURN NEXT;
      ELSIF e.action = 'delete' THEN
        prio := 140; stem := 'eliminó bandas'; item := bname; RETURN NEXT;
      ELSIF e.action = 'update' THEN
        IF array_length(real_keys, 1) IS NULL THEN CONTINUE; END IF;
        IF real_keys && ARRAY['members'] THEN
          SELECT COALESCE(array_agg(x::uuid), '{}'::uuid[]) INTO bm FROM jsonb_array_elements_text(COALESCE(e.before->'members', '[]'::jsonb)) x;
          SELECT COALESCE(array_agg(x::uuid), '{}'::uuid[]) INTO am FROM jsonb_array_elements_text(COALESCE(e.after->'members',  '[]'::jsonb)) x;
          SELECT COALESCE(array_agg(mm.name), '{}'::text[]) INTO addm FROM public.members mm WHERE mm.id = ANY(am) AND NOT (mm.id = ANY(bm));
          SELECT COALESCE(array_agg(mm.name), '{}'::text[]) INTO remm FROM public.members mm WHERE mm.id = ANY(bm) AND NOT (mm.id = ANY(am));
          IF array_length(addm, 1) IS NOT NULL THEN
            prio := 120; stem := 'sumó integrantes a bandas';
            item := public._join_names(addm[1:9], array_length(addm, 1)) || ' a ' || bname; RETURN NEXT;
          END IF;
          IF array_length(remm, 1) IS NOT NULL THEN
            prio := 121; stem := 'quitó integrantes de bandas';
            item := public._join_names(remm[1:9], array_length(remm, 1)) || ' de ' || bname; RETURN NEXT;
          END IF;
        END IF;
        IF real_keys && ARRAY['name', 'meeting_type', 'meeting_day', 'meeting_time', 'active'] THEN
          prio := 130; stem := 'editó datos de bandas'; item := bname; RETURN NEXT;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- ================= INTEGRANTES TEMPORALES (tabla propia, sin trigger de auditoría) =================
  -- Los líderes pueden sumar temporales (band_temporary_members). Como esa tabla no
  -- pasa por audit_log_trigger, se lee directo: alta = fila creada en la ventana.
  FOR e IN
    SELECT t.band_id, t.member_id, t.expires_at, t.created_at,
           a.name AS who_name, a.role AS who_role, a.editor AS who_editor
    FROM public.band_temporary_members t
    JOIN public.members a ON a.id = t.added_by
    WHERE t.created_at >= p_start AND t.created_at < p_end
      AND a.role IS DISTINCT FROM 'pastor'
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

CREATE OR REPLACE FUNCTION public.send_leader_activity_digest(p_now timestamptz DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_end    timestamptz;
  v_start  timestamptz;
  v_fecha  text;
  v_total  int := 0;
  v_html   text := '';
  v_actor  text := NULL;
  v_claim  int;
  g        record;
  v_pastor record;
BEGIN
  v_end   := COALESCE(p_now, now());
  v_start := v_end - interval '24 hours';
  v_fecha := to_char((v_end AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 'DD/MM/YYYY');

  FOR g IN
    SELECT i.actor_name, i.prio, i.stem,
           array_agg(DISTINCT i.item) FILTER (WHERE i.item IS NOT NULL) AS items,
           count(DISTINCT i.item)::int AS n
    FROM public.activity_digest_items(v_start, v_end) i
    GROUP BY i.actor_name, i.prio, i.stem
    ORDER BY i.actor_name, i.prio, i.stem
  LOOP
    IF g.actor_name IS DISTINCT FROM v_actor THEN
      v_actor := g.actor_name;
      v_html := v_html || '• <strong>' || public._html_escape(v_actor) || '</strong><br>';
    END IF;
    v_html := v_html || '&nbsp;&nbsp;&nbsp;– ' || public._html_escape(g.stem);
    IF g.n > 0 THEN
      v_html := v_html || ': ' || public._html_escape(public._join_names((g.items)[1:9], g.n));
    END IF;
    v_html := v_html || '<br>';
    v_total := v_total + GREATEST(g.n, 1);
  END LOOP;

  IF v_total = 0 THEN RETURN; END IF;

  -- Nota fija: la duda de Paul (asignar/transportar en un orden NO es editar la canción).
  v_html := v_html || '<br><span style="color:#8a8a8a;font-size:12px;line-height:1.5">'
    || 'Cómo leerlo: <em>armar un orden</em> o <em>cambiar el tono de una canción dentro de un orden</em> es asignación '
    || '(usa el transportador) y NO modifica la canción del repertorio. Solo las líneas marcadas con ⚠️ tocan el repertorio '
    || '(tonalidad o acordes de canciones que ya existían).</span><br>';

  INSERT INTO public.email_throttle (key, last_sent_at)
  VALUES ('leader_digest:' || v_fecha, now())
  ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS v_claim = ROW_COUNT;
  IF v_claim = 0 THEN RETURN; END IF;

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
$$;

REVOKE EXECUTE ON FUNCTION public.send_leader_activity_digest(timestamptz) FROM PUBLIC, anon, authenticated;

-- El armador viejo de frases ya no se usa (solo lo usaba el digest).
DROP FUNCTION IF EXISTS public._activity_subphrase(text, text, integer, integer, text[], integer);
