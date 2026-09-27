-- Reporte "estado del recordatorio" a los pastores, cada 10 días.
--
-- Pedido de Paul: saber a quiénes les corresponde ver el cartel recordatorio
-- (EngagementNudge, landmine #107) y con qué mensaje. Como el cartel es 100% cliente
-- (aparece cuando la persona abre la app; no hay "envío" que registrar), este reporte
-- informa el ESTADO: quiénes todavía no instalaron la app, quiénes la tienen pero sin
-- notificaciones, y cuántos ya tienen todo — con nombres y el mensaje de cada cartel.
--
-- 100% backend, aditivo, read-only (solo lee members / member_activity /
-- push_subscriptions; escribe únicamente en email_queue + email_throttle). Espeja el
-- patrón de send_ensamble_health_report (auto-gate cada N días + dedup + envío a
-- pastores + _html_escape). Los mensajes de los carteles son un espejo de
-- src/lib/engagementNudge.js (NUDGE_COPY).

-- ── Plantilla de correo ────────────────────────────────────────────────────────
INSERT INTO public.email_templates
  (slug, descripcion, asunto, from_label, activo, kicker, titulo, cuerpo_html,
   color_acento, mostrar_logo, firma)
VALUES (
  'recordatorio-estado',
  'Reporte cada 10 días a los pastores: quién ve el cartel de instalar / de notificaciones',
  '📲 Estado del recordatorio — AdorAPP',
  'adorapp',
  true,
  'ADORACIÓN CAF',
  'Estado del recordatorio',
  'Hola {{nombre}}, este es el estado del recordatorio de instalación y notificaciones al <strong>{{fecha}}</strong>.<br><br>'
    || '<strong>📲 Todavía sin instalar la app ({{n_instalar}})</strong><br>'
    || '<span style="color:#6b7280;font-size:13px;line-height:1.5">Cuando abren la app en el teléfono ven el cartel para instalarla: <em>“Llevá AdorAPP con vos — instalala en tu inicio y tenés el ministerio a un toque, sin buscar el navegador”</em>.</span><br>'
    || '{{lista_instalar}}<br><br>'
    || '<strong>🔔 Con la app pero sin notificaciones ({{n_notif}})</strong><br>'
    || '<span style="color:#6b7280;font-size:13px;line-height:1.5">Ven el cartel para activarlas: <em>“Activá las notificaciones y enterate al instante: órdenes nuevas, ensambles, cambios y avisos del ministerio”</em>.</span><br>'
    || '{{lista_notif}}<br><br>'
    || '<strong>✅ Ya tienen todo: {{n_completo}}</strong> — a ellos no les aparece ningún cartel.<br><br>'
    || '<em style="color:#6b7280;font-size:13px;line-height:1.5">Cómo leerlo: el cartel aparece en el teléfono, solo, cuando la persona abre la app (una vez cada 10 días). Este reporte te muestra a quiénes les toca verlo y con qué mensaje, para que también los puedas acompañar en persona.</em>',
  '#d4af37',
  true,
  'Reporte automático · AdorAPP'
)
ON CONFLICT (slug) DO UPDATE SET
  descripcion = EXCLUDED.descripcion, asunto = EXCLUDED.asunto, from_label = EXCLUDED.from_label,
  activo = EXCLUDED.activo, kicker = EXCLUDED.kicker, titulo = EXCLUDED.titulo,
  cuerpo_html = EXCLUDED.cuerpo_html, color_acento = EXCLUDED.color_acento,
  mostrar_logo = EXCLUDED.mostrar_logo, firma = EXCLUDED.firma, updated_at = now();

-- ── Función del reporte ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_engagement_nudge_report(p_now timestamptz DEFAULT now(), p_force boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_today date; v_anchor date := DATE '2026-09-28'; v_n int;
  v_lista_instalar text; v_lista_notif text;
  v_n_instalar int; v_n_notif int; v_n_completo int;
  v_fecha text; v_member record;
BEGIN
  v_today := (p_now AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;

  -- Auto-gate: cada 10 días desde el ancla (salvo p_force para QA). El cron corre a
  -- diario y esta guarda decide si toca hoy.
  IF NOT p_force THEN
    IF v_today < v_anchor OR ((v_today - v_anchor) % 10) <> 0 THEN RETURN; END IF;
  END IF;

  -- Dedup por día (un reporte por día como máximo).
  INSERT INTO public.email_throttle (key, last_sent_at) VALUES ('nudge_report:' || v_today::text, now())
    ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN; END IF;

  v_fecha := to_char(v_today, 'DD/MM/YYYY');

  -- Grupos + listas de nombres (escapados) sobre TODOS los miembros activos.
  --   instalada = tiene fila en member_activity con app_installed_at (abrió en modo app)
  --   con notif = tiene al menos una suscripción push activa
  WITH base AS (
    SELECT m.id, m.name,
      (EXISTS (SELECT 1 FROM public.member_activity a WHERE a.member_id = m.id AND a.app_installed_at IS NOT NULL)) AS installed,
      (EXISTS (SELECT 1 FROM public.push_subscriptions p WHERE p.member_id = m.id)) AS has_notif
    FROM public.members m
    WHERE m.active = true
  )
  SELECT
    count(*) FILTER (WHERE NOT installed),
    count(*) FILTER (WHERE installed AND NOT has_notif),
    count(*) FILTER (WHERE installed AND has_notif),
    COALESCE(string_agg(public._html_escape(name), ' · ' ORDER BY name) FILTER (WHERE NOT installed), ''),
    COALESCE(string_agg(public._html_escape(name), ' · ' ORDER BY name) FILTER (WHERE installed AND NOT has_notif), '')
  INTO v_n_instalar, v_n_notif, v_n_completo, v_lista_instalar, v_lista_notif
  FROM base;

  IF v_lista_instalar = '' THEN v_lista_instalar := '<em style="color:#6b7280">— nadie por ahora 🎉</em>'; END IF;
  IF v_lista_notif = '' THEN v_lista_notif := '<em style="color:#6b7280">— nadie por ahora 🎉</em>'; END IF;

  -- A cada pastor activo con correo.
  FOR v_member IN
    SELECT m.id, m.name, m.email FROM public.members m
    WHERE m.active AND m.role = 'pastor' AND m.email IS NOT NULL AND m.email <> ''
  LOOP
    BEGIN
      PERFORM public.encolar_email('recordatorio-estado', v_member.email, v_member.name,
        jsonb_build_object(
          'nombre', public._html_escape(COALESCE(v_member.name, '')),
          'fecha', v_fecha,
          'n_instalar', v_n_instalar::text,
          'lista_instalar', v_lista_instalar,
          'n_notif', v_n_notif::text,
          'lista_notif', v_lista_notif,
          'n_completo', v_n_completo::text
        ), 5::smallint);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'send_engagement_nudge_report: fallo para %: %', v_member.email, SQLERRM;
    END;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.send_engagement_nudge_report(timestamptz, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_engagement_nudge_report(timestamptz, boolean) FROM anon, authenticated;
