-- ============================================================================
-- "Salud de los ensambles" — reporte trimestral (100% backend, análogo al leader-activity-digest).
-- Cron DIARIO que dispara SOLO cada 90 días contados desde el 1/10/2026, con la estadística de
-- los últimos 90 días. Mail a pastores (todas las bandas) y líderes (su banda).
-- Métrica por banda: % de ensambles CONCRETADOS = servicios cuyo ensamble no quedó suspendido.
--   concretado  = rehearsal_date IS NOT NULL AND rehearsal_suspended_at IS NULL
--     (reprogramado limpia la suspensión → cuenta; reactivado también; suspendido-y-abandonado NO;
--      un servicio SIN ensamble programado tampoco cuenta — "cada servicio supone un ensamble").
--   denominador = servicios (órdenes no canceladas) de la banda en la ventana.
-- ============================================================================

-- Frase por tramo (exhaustivo para % entero) + versículo. Las frases son las de Paul.
CREATE OR REPLACE FUNCTION public._ensamble_health_phrase(p_pct int)
  RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_temp'
AS $$
  SELECT CASE
    WHEN p_pct <= 49 THEN 'Es peligroso el nivel tan bajo de ensambles concretados. Hace falta revisar por qué sucede esto. <em style="color:#8a6508;">«Todo lo que te viniere a la mano para hacer, hazlo según tus fuerzas» (Eclesiastés 9:10).</em>'
    WHEN p_pct <= 70 THEN 'Falta ajustar la disciplina y el compromiso. <em style="color:#8a6508;">«La mano de los diligentes señoreará» (Proverbios 12:24).</em>'
    WHEN p_pct <= 90 THEN 'Muy bien. Es un buen promedio. <em style="color:#8a6508;">«Y todo lo que hagáis, hacedlo de corazón, como para el Señor» (Colosenses 3:23).</em>'
    ELSE '¡Excelente! <em style="color:#8a6508;">«Bien, buen siervo y fiel» (Mateo 25:21).</em>'
  END
$$;

CREATE OR REPLACE FUNCTION public.send_ensamble_health_report(p_now timestamptz DEFAULT now(), p_force boolean DEFAULT false)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_today date; v_anchor date := DATE '2026-10-01'; v_start date; v_n int;
  v_stats jsonb; v_periodo text; v_member record; v_items text; v_bandrec record; v_relevant jsonb;
BEGIN
  v_today := (p_now AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  -- Cadencia: solo días que son múltiplo de 90 desde el ancla (1/10/2026). p_force salta el gate (QA).
  IF NOT p_force THEN
    IF v_today < v_anchor OR ((v_today - v_anchor) % 90) <> 0 THEN RETURN; END IF;
  END IF;
  -- Dedup del día (idempotente si el cron corre dos veces).
  INSERT INTO public.email_throttle (key, last_sent_at) VALUES ('ensamble_health:' || v_today::text, now())
    ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN; END IF;

  v_start := v_today - 90;
  v_periodo := to_char(v_start, 'DD/MM/YYYY') || ' al ' || to_char(v_today - 1, 'DD/MM/YYYY');

  -- Stats por banda (solo bandas con >=1 servicio no-cancelado en la ventana).
  SELECT jsonb_agg(jsonb_build_object('band_id', s.band_id, 'name', s.name,
           'denom', s.denom, 'numer', s.numer, 'pct', s.pct) ORDER BY s.name)
    INTO v_stats
    FROM (
      SELECT b.id AS band_id, b.name,
             count(*) AS denom,
             count(*) FILTER (WHERE o.rehearsal_date IS NOT NULL AND o.rehearsal_suspended_at IS NULL) AS numer,
             round(100.0 * count(*) FILTER (WHERE o.rehearsal_date IS NOT NULL AND o.rehearsal_suspended_at IS NULL) / count(*))::int AS pct
        FROM public.orders o JOIN public.bands b ON b.id = o.band_id
       WHERE o.date >= v_start AND o.date < v_today AND o.status <> 'cancelled'
       GROUP BY b.id, b.name
    ) s;

  IF v_stats IS NULL THEN RETURN; END IF;  -- ninguna banda con servicios en la ventana

  FOR v_member IN
    SELECT m.id, m.name, m.email, m.role FROM public.members m
    WHERE m.active AND m.role IN ('pastor','leader') AND m.email IS NOT NULL AND m.email <> ''
  LOOP
    IF v_member.role = 'pastor' THEN
      v_relevant := v_stats;
    ELSE
      SELECT jsonb_agg(e) INTO v_relevant
        FROM jsonb_array_elements(v_stats) e
       WHERE EXISTS (SELECT 1 FROM public.bands b
                     WHERE b.id = (e->>'band_id')::uuid AND v_member.id = ANY(b.members));
    END IF;
    IF v_relevant IS NULL OR jsonb_array_length(v_relevant) = 0 THEN CONTINUE; END IF;

    v_items := '';
    FOR v_bandrec IN SELECT value FROM jsonb_array_elements(v_relevant) LOOP
      v_items := v_items
        || '<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #e8d9a8;border-left:4px solid #b8860b;border-radius:8px;background:#fbf7ea;color:#374151;font-size:14px;line-height:1.55;">'
        || '<strong style="color:#8a6508;">' || public._html_escape(v_bandrec.value->>'name') || '</strong> — '
        || '<strong>' || (v_bandrec.value->>'pct') || '%</strong> de ensambles concretados '
        || '(' || (v_bandrec.value->>'numer') || ' de ' || (v_bandrec.value->>'denom') || ' servicios).<br>'
        || public._ensamble_health_phrase((v_bandrec.value->>'pct')::int)
        || '</div>';
    END LOOP;

    BEGIN
      PERFORM public.encolar_email('salud-ensambles', v_member.email, v_member.name,
        jsonb_build_object('nombre', COALESCE(v_member.name, ''), 'periodo', v_periodo,
                           'items', v_items, 'url', 'https://adorapp.net.ar/ordenes'), 5::smallint);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'send_ensamble_health_report: fallo para %: %', v_member.email, SQLERRM;
    END;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_ensamble_health_report(timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.send_ensamble_health_report(timestamptz, boolean) TO service_role;

-- Plantilla de correo.
INSERT INTO public.email_templates (slug, descripcion, asunto, from_label, activo, kicker, titulo,
  color_acento, mostrar_logo, firma, cta_text, cta_url, cuerpo_html)
VALUES
('salud-ensambles', 'Reporte trimestral de salud de los ensambles (pastores + líderes)',
 'Salud de los ensambles — reporte trimestral', 'adorapp', true, 'ADORACIÓN CAF', 'Salud de los ensambles',
 '#b8860b', true, 'Pastores de Adoración CAF', 'Ver las órdenes', '{{url}}',
 'Hola {{nombre}}, este es el reporte de <strong>salud de los ensambles</strong> del período <strong>{{periodo}}</strong>.<br><br>{{items}}<em style="color:#6b7280;font-size:13px;">Cómo se calcula: cada servicio supone un ensamble. Un ensamble <strong>reprogramado</strong> cuenta como realizado; uno <strong>suspendido y no recuperado</strong>, no. Un servicio sin ensamble programado tampoco cuenta.</em><br><br>Sigamos buscando la excelencia para que brille el Rey.')
ON CONFLICT (slug) DO UPDATE SET
  descripcion=EXCLUDED.descripcion, asunto=EXCLUDED.asunto, from_label=EXCLUDED.from_label,
  activo=EXCLUDED.activo, kicker=EXCLUDED.kicker, titulo=EXCLUDED.titulo, color_acento=EXCLUDED.color_acento,
  mostrar_logo=EXCLUDED.mostrar_logo, firma=EXCLUDED.firma, cta_text=EXCLUDED.cta_text,
  cta_url=EXCLUDED.cta_url, cuerpo_html=EXCLUDED.cuerpo_html, updated_at=now();

-- Cron diario 08:00 ART (11:00 UTC); la función se auto-gatea a cada 90 días desde el 1/10.
SELECT cron.schedule('ensamble-health-report', '0 11 * * *', 'SELECT public.send_ensamble_health_report()');
