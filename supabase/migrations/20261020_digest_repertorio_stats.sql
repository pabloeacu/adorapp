-- Seguimiento del repertorio en el digest nocturno de actividad (pedido de Paul 2026-10-20).
-- Se le suma al reporte 'actividad-lider' (que ya llega a los pastores cada noche con lo que
-- tocan líderes/editores) UNA línea de estadística: canciones sumadas en los últimos 7 días,
-- en lo que va del mes, y el total. Nada más cambia: mismo cron, misma condición (solo días
-- con movimientos), mismos destinatarios. Variable nueva {{repertorio}} en la plantilla.

CREATE OR REPLACE FUNCTION public.send_leader_activity_digest(p_now timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_rep_semana int;
  v_rep_mes    int;
  v_rep_total  int;
  v_repertorio text;
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

  v_html := v_html || '<br><span style="color:#8a8a8a;font-size:12px;line-height:1.5">'
    || 'Cómo leerlo: <em>armar un orden</em> o <em>cambiar el tono de una canción dentro de un orden</em> es asignación '
    || '(usa el transportador) y NO modifica la canción del repertorio. Solo las líneas marcadas con ⚠️ tocan el repertorio '
    || '(tonalidad o acordes de canciones que ya existían).</span><br>';

  -- Seguimiento del repertorio: canciones sumadas semana / mes / total.
  SELECT count(*) INTO v_rep_semana FROM public.songs WHERE created_at >= v_end - interval '7 days';
  SELECT count(*) INTO v_rep_mes FROM public.songs
    WHERE created_at >= (date_trunc('month', (v_end AT TIME ZONE 'America/Argentina/Buenos_Aires')) AT TIME ZONE 'America/Argentina/Buenos_Aires');
  SELECT count(*) INTO v_rep_total FROM public.songs;
  v_repertorio := '<div style="margin:4px 0 14px;padding:11px 13px;background:#faf6ea;border-left:3px solid #d4af37;border-radius:0 8px 8px 0;font-size:13.5px;color:#4a4335;line-height:1.55">'
    || '🎵 <strong>Repertorio</strong>: +' || v_rep_semana || ' en los últimos 7 días &middot; +' || v_rep_mes
    || ' en lo que va del mes &middot; <strong>' || v_rep_total || '</strong> canciones en total.</div>';

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
          'items',    v_html,
          'repertorio', v_repertorio),
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

REVOKE ALL ON FUNCTION public.send_leader_activity_digest(timestamptz) FROM PUBLIC, anon, authenticated;

-- Plantilla: insertar {{repertorio}} después de {{items}}.
UPDATE public.email_templates
SET cuerpo_html = 'Hola {{nombre}}, el <strong>{{fecha}}</strong> hubo actividad de líderes o editores en la plataforma:<br><br>{{items}}<br>{{repertorio}}Podés ver el detalle completo cuando quieras desde la plataforma.',
    updated_at = now()
WHERE slug = 'actividad-lider';
