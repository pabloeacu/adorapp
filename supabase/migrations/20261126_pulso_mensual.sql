-- =====================================================================
-- Pulso mensual de AdorAPP — informe consolidado a los pastores
-- =====================================================================
-- Un correo mensual (día 1, cubre el mes anterior) que junta en un solo
-- lugar lo que hoy estaba suelto o no existía:
--   1) Correos enviados en el mes, por causa y cantidad (de sent_emails).
--   2) Enganche: sin instalar / instalada sin notif / completo
--      (MISMA definición que send_engagement_nudge_report → nunca se
--       contradicen).
--   3) Ensayómetro (Adoración): de los que tuvieron servicio con formación
--      en el mes, cuántos registraron práctica y quiénes no  ← HOY SIN INFORME.
--   4) Actividad: conectados en 7 / 30 días e inactivos (member_activity).
--
-- 100% backend, read-only salvo el encolado de correo. SECURITY DEFINER,
-- service_role-only (REVOKE del cliente). TODO dato de usuario pasa por
-- _html_escape (landmine #70; el body_html se renderiza RAW). El cron se
-- agenda en una migración aparte, DESPUÉS de que Paul apruebe el diseño.
-- =====================================================================

-- 1) Plantilla premium (dorado sobre crema). body_html presente → la EF
--    send-emails usa este HTML tal cual; los {{...}} se sustituyen RAW.
INSERT INTO public.email_templates (slug, descripcion, asunto, color_acento, activo, body_html, body_text)
VALUES (
  'pulso-mensual',
  'Informe mensual consolidado a los pastores: correos enviados, enganche, Ensayómetro y actividad.',
  'Pulso de AdorAPP — {{mes}}',
  '#d8b23f',
  true,
  $html$<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0e8d8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0e8d8;">
<tr><td align="center" style="padding:22px 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fbf8f1;border-radius:16px;overflow:hidden;border:1px solid #e6dcc3;">

  <!-- encabezado -->
  <tr><td style="background:#17130c;padding:26px 30px;">
    <div style="font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#d8b23f;">AdorAPP · Pulso mensual</div>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;color:#fbf8f1;margin-top:6px;">{{mes}}</div>
  </td></tr>

  <tr><td style="padding:26px 30px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#3a342b;">
    <p style="margin:0 0 6px;font-size:16px;">Hola <b style="color:#1d1813;">{{nombre}}</b>,</p>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.6;color:#4a4335;">Este es el pulso del ministerio del mes pasado: qué se envió, cómo venimos con la app, el uso del Ensayómetro y la actividad general.</p>
  </td></tr>

  <!-- 1 · Correos enviados -->
  <tr><td style="padding:18px 30px 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="border-left:3px solid #d8b23f;padding-left:12px;">
      <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#b8860b;font-weight:700;">✉️ Correos enviados</div>
      <div style="font-size:15px;color:#4a4335;margin-top:2px;">Salieron <b style="color:#1d1813;">{{total_correos}}</b> correos en total.</div>
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 4px;font-size:14px;color:#4a4335;">{{lista_correos}}</table>
  </td></tr>

  <!-- 2 · Enganche -->
  <tr><td style="padding:18px 30px 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="border-left:3px solid #d8b23f;padding-left:12px;">
      <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#b8860b;font-weight:700;">📲 Enganche con la app</div>
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 2px;">
      <tr>
        <td style="padding:6px;text-align:center;"><div style="font-size:24px;font-weight:800;color:#b45309;">{{eng_instalar}}</div><div style="font-size:12px;color:#6f6552;">sin instalar</div></td>
        <td style="padding:6px;text-align:center;"><div style="font-size:24px;font-weight:800;color:#a16207;">{{eng_notif}}</div><div style="font-size:12px;color:#6f6552;">sin notificaciones</div></td>
        <td style="padding:6px;text-align:center;"><div style="font-size:24px;font-weight:800;color:#15803d;">{{eng_completo}}</div><div style="font-size:12px;color:#6f6552;">completos</div></td>
      </tr>
    </table>
    <p style="margin:8px 0 0;font-size:13.5px;line-height:1.55;color:#4a4335;"><b style="color:#1d1813;">Sin instalar:</b> {{lista_instalar}}</p>
    <p style="margin:6px 0 0;font-size:13.5px;line-height:1.55;color:#4a4335;"><b style="color:#1d1813;">Instalada sin notificaciones:</b> {{lista_notif}}</p>
  </td></tr>

  <!-- 3 · Ensayómetro -->
  <tr><td style="padding:18px 30px 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="border-left:3px solid #d8b23f;padding-left:12px;">
      <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#b8860b;font-weight:700;">🎸 Ensayómetro · Adoración</div>
      <div style="font-size:15px;color:#4a4335;margin-top:2px;"><b style="color:#1d1813;">{{ens_practicaron}}</b> de <b style="color:#1d1813;">{{ens_con}}</b> músicos con servicio registraron práctica.</div>
    </div>
    <p style="margin:10px 0 0;font-size:13.5px;line-height:1.55;color:#4a4335;"><b style="color:#1d1813;">Tuvieron servicio y no registraron práctica:</b> {{lista_ens_no}}</p>
  </td></tr>

  <!-- 4 · Actividad -->
  <tr><td style="padding:18px 30px 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="border-left:3px solid #d8b23f;padding-left:12px;">
      <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#b8860b;font-weight:700;">📈 Actividad</div>
      <div style="font-size:15px;color:#4a4335;margin-top:2px;"><b style="color:#1d1813;">{{act7}}</b> entraron en los últimos 7 días · <b style="color:#1d1813;">{{act30}}</b> en los últimos 30, de {{total_miembros}} con cuenta.</div>
    </div>
    <p style="margin:10px 0 0;font-size:13.5px;line-height:1.55;color:#4a4335;"><b style="color:#1d1813;">Hace más de 30 días que no entran ({{inact30}}):</b> {{lista_inact}}</p>
  </td></tr>

  <!-- pie -->
  <tr><td style="padding:22px 30px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <p style="margin:0;padding-top:16px;border-top:1px solid #ece3cf;font-size:13px;color:#6f6552;line-height:1.6;">Este pulso llega cada día 1 y cubre el mes anterior. Es un informe interno para los pastores.<br><b style="color:#5a5140;">Pastores de Adoración CAF</b></p>
  </td></tr>

</table>
<p style="margin:14px 0 0;font-family:Arial,sans-serif;font-size:11px;color:#a79e8b;">AdorAPP · Ministerio de Adoración — Adoración CAF · adorapp.net.ar</p>
</td></tr></table></body></html>$html$,
  $txt$Pulso de AdorAPP — {{mes}}

Hola {{nombre}},

Este es el pulso del ministerio del mes pasado.

CORREOS ENVIADOS: {{total_correos}} en total.

ENGANCHE
- Sin instalar: {{eng_instalar}}
- Instalada sin notificaciones: {{eng_notif}}
- Completos: {{eng_completo}}

ENSAYOMETRO (Adoración): {{ens_practicaron}} de {{ens_con}} músicos con servicio registraron práctica.

ACTIVIDAD: {{act7}} entraron en los últimos 7 días; {{act30}} en los últimos 30, de {{total_miembros}} con cuenta. Inactivos +30 días: {{inact30}}.

Este pulso llega cada día 1 y cubre el mes anterior.
Pastores de Adoración CAF — adorapp.net.ar$txt$
)
ON CONFLICT (slug) DO UPDATE SET
  descripcion=EXCLUDED.descripcion, asunto=EXCLUDED.asunto, color_acento=EXCLUDED.color_acento,
  activo=EXCLUDED.activo, body_html=EXCLUDED.body_html, body_text=EXCLUDED.body_text, updated_at=now();

-- 2) Función
CREATE OR REPLACE FUNCTION public.send_pulso_mensual(
  p_now timestamptz DEFAULT now(),
  p_force boolean DEFAULT false,
  p_preview_to text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_bsas timestamp;
  v_m_start date; v_m_end date;
  v_m_start_ts timestamptz; v_m_end_ts timestamptz;
  v_mes text; v_month_key text;
  v_total_correos int; v_lista_correos text;
  v_eng_instalar int; v_eng_notif int; v_eng_completo int;
  v_lista_instalar text; v_lista_notif text;
  v_ens_practicaron int; v_ens_no int; v_ens_con int; v_lista_ens_no text;
  v_act7 int; v_act30 int; v_inact30 int; v_total_miembros int; v_lista_inact text;
  v_payload jsonb; v_n int; v_member record;
  v_meses text[] := ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
BEGIN
  v_bsas   := p_now AT TIME ZONE 'America/Argentina/Buenos_Aires';
  v_m_end  := date_trunc('month', v_bsas)::date;              -- 1° del mes actual (ART)
  v_m_start:= (v_m_end - interval '1 month')::date;           -- 1° del mes anterior
  v_m_start_ts := v_m_start::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires';
  v_m_end_ts   := v_m_end::timestamp   AT TIME ZONE 'America/Argentina/Buenos_Aires';
  v_mes := v_meses[extract(month from v_m_start)::int] || ' ' || extract(year from v_m_start)::text;
  v_month_key := to_char(v_m_start,'YYYY-MM');

  -- 1) Correos enviados en el mes (sent_emails = enviados de verdad; la cola
  --    guarda pendientes/fallidos). Etiqueta amable por causa.
  WITH e AS (
    SELECT template_slug AS slug, count(*) AS n
    FROM public.sent_emails
    WHERE created_at >= v_m_start_ts AND created_at < v_m_end_ts
    GROUP BY template_slug
  ), labeled AS (
    SELECT n, CASE slug
      WHEN 'nuevo-orden' THEN 'Nuevo orden'
      WHEN 'orden-editado' THEN 'Orden editado'
      WHEN 'formacion-cambio' THEN 'Cambio de formación'
      WHEN 'recordatorio-ensayo' THEN 'Recordatorio de ensamble'
      WHEN 'ministracion' THEN 'Canción de ministración'
      WHEN 'ensamble-suspendido' THEN 'Ensamble suspendido'
      WHEN 'ensamble-reprogramado' THEN 'Ensamble reprogramado'
      WHEN 'ensamble-reactivado' THEN 'Ensamble reactivado'
      WHEN 'feedback-post-servicio' THEN '¿Cómo estuvimos? (feedback)'
      WHEN 'colaboracion-solicitud' THEN 'Pedido de colaboración'
      WHEN 'colaboracion-voluntario' THEN 'Voluntario de colaboración'
      WHEN 'colaboracion-aceptado' THEN 'Colaboración aceptada'
      WHEN 'colaboracion-cubierto' THEN 'Colaboración cubierta'
      WHEN 'engagement-instalar' THEN 'Campaña: instalar la app'
      WHEN 'engagement-instalar-notif' THEN 'Campaña: instalar + notificaciones'
      WHEN 'engagement-notificaciones' THEN 'Campaña: activar notificaciones'
      WHEN 'engagement-volve' THEN 'Campaña: te extrañamos (inactivos)'
      WHEN 'ensayometro-invitar' THEN 'Ensayómetro: invitación'
      WHEN 'ensayometro-estimular' THEN 'Ensayómetro: estímulo'
      WHEN 'ensayometro-felicitar' THEN 'Ensayómetro: felicitación'
      WHEN 'repertorio-lideres' THEN 'Líderes: reactivar repertorio'
      WHEN 'comunicacion' THEN 'Comunicación del pastor'
      WHEN 'registro-pendiente' THEN 'Solicitud de registro'
      WHEN 'registro-aprobado' THEN 'Acceso aprobado'
      WHEN 'recuperar-contrasena' THEN 'Recuperar contraseña'
      WHEN 'contrasena-actualizada' THEN 'Contraseña actualizada'
      WHEN 'tutorial-institucional' THEN 'Video institucional'
      WHEN 'salud-ensambles' THEN 'Informe: salud de ensambles'
      WHEN 'actividad-lider' THEN 'Informe: actividad de líderes'
      WHEN 'recordatorio-estado' THEN 'Informe: estado del recordatorio'
      WHEN 'sistema-alerta' THEN 'Alerta del sistema'
      WHEN 'nuevo-pastor' THEN 'Alta de pastor'
      WHEN 'pulso-mensual' THEN 'Este pulso'
      WHEN 'evento-entrada-thechosen' THEN 'Evento: entrada'
      WHEN 'evento-recordatorio-thechosen' THEN 'Evento: recordatorio'
      ELSE slug END AS label
    FROM e
  )
  SELECT COALESCE(sum(n),0)::int,
    COALESCE(string_agg(
      '<tr><td style="padding:5px 10px 5px 0;border-bottom:1px solid #efe7d4;color:#4a4335">'||public._html_escape(label)||
      '</td><td style="padding:5px 0;border-bottom:1px solid #efe7d4;text-align:right;font-weight:700;color:#1d1813;font-variant-numeric:tabular-nums">'||n||'</td></tr>',
      '' ORDER BY n DESC), '')
  INTO v_total_correos, v_lista_correos FROM labeled;
  IF v_total_correos = 0 THEN
    v_lista_correos := '<tr><td colspan="2" style="padding:6px 0;color:#6b7280"><em>No se envió ningún correo en el período.</em></td></tr>';
  END IF;

  -- 2) Enganche (MISMA definición que send_engagement_nudge_report)
  WITH base AS (
    SELECT m.id, m.name,
      EXISTS(SELECT 1 FROM public.member_activity a WHERE a.member_id=m.id AND a.app_installed_at IS NOT NULL) AS installed,
      EXISTS(SELECT 1 FROM public.push_subscriptions p WHERE p.member_id=m.id) AS has_notif
    FROM public.members m
    WHERE m.active AND m.guest_until IS NULL AND m.user_id IS NOT NULL
  )
  SELECT
    count(*) FILTER (WHERE NOT installed),
    count(*) FILTER (WHERE installed AND NOT has_notif),
    count(*) FILTER (WHERE installed AND has_notif),
    COALESCE(string_agg(public._html_escape(name),' · ' ORDER BY name) FILTER (WHERE NOT installed),''),
    COALESCE(string_agg(public._html_escape(name),' · ' ORDER BY name) FILTER (WHERE installed AND NOT has_notif),'')
  INTO v_eng_instalar, v_eng_notif, v_eng_completo, v_lista_instalar, v_lista_notif
  FROM base;
  IF v_lista_instalar='' THEN v_lista_instalar:='<em style="color:#6b7280">— nadie 🎉</em>'; END IF;
  IF v_lista_notif='' THEN v_lista_notif:='<em style="color:#6b7280">— nadie 🎉</em>'; END IF;

  -- 3) Ensayómetro (Adoración): participantes de órdenes del mes vs. práctica
  --    registrada. order_participant_ids = fuente de verdad de participantes
  --    (landmine #53). user_id de practice_logs ↔ members.user_id.
  WITH mo AS (
    SELECT o.id FROM public.orders o
    WHERE o.band_id IS NOT NULL AND o.status IS DISTINCT FROM 'cancelled'
      AND o.date >= v_m_start AND o.date < v_m_end
  ), parts AS (
    SELECT DISTINCT m.id AS member_id, m.name, m.user_id, mo.id AS order_id
    FROM mo CROSS JOIN LATERAL unnest(public.order_participant_ids(mo.id)) AS pid
    JOIN public.members m ON m.id = pid
    WHERE m.active AND m.user_id IS NOT NULL AND m.guest_until IS NULL AND m.areas @> ARRAY['adoracion']
  ), per_member AS (
    SELECT p.member_id, p.name,
      bool_or(EXISTS(
        SELECT 1 FROM public.practice_logs pl
        WHERE pl.order_id=p.order_id AND pl.user_id=p.user_id
          AND (pl.times_practiced>0 OR pl.knows_lyrics OR pl.knows_structure OR pl.knows_arrangements)
      )) AS practiced
    FROM parts p GROUP BY p.member_id, p.name
  )
  SELECT count(*) FILTER (WHERE practiced), count(*) FILTER (WHERE NOT practiced), count(*),
    COALESCE(string_agg(public._html_escape(name),' · ' ORDER BY name) FILTER (WHERE NOT practiced),'')
  INTO v_ens_practicaron, v_ens_no, v_ens_con, v_lista_ens_no FROM per_member;
  IF v_ens_con=0 THEN v_lista_ens_no := '<em style="color:#6b7280">No hubo servicios con formación en el mes.</em>';
  ELSIF v_lista_ens_no='' THEN v_lista_ens_no := '<em style="color:#6b7280">— todos practicaron 🎉</em>'; END IF;

  -- 4) Actividad general (última conexión)
  WITH b AS (
    SELECT m.id, m.name, a.last_seen_at
    FROM public.members m LEFT JOIN public.member_activity a ON a.member_id=m.id
    WHERE m.active AND m.user_id IS NOT NULL AND m.guest_until IS NULL
  )
  SELECT
    count(*) FILTER (WHERE last_seen_at >= p_now - interval '7 days'),
    count(*) FILTER (WHERE last_seen_at >= p_now - interval '30 days'),
    count(*) FILTER (WHERE last_seen_at IS NULL OR last_seen_at < p_now - interval '30 days'),
    count(*),
    COALESCE(string_agg(public._html_escape(name),' · ' ORDER BY name) FILTER (WHERE last_seen_at IS NULL OR last_seen_at < p_now - interval '30 days'),'')
  INTO v_act7, v_act30, v_inact30, v_total_miembros, v_lista_inact FROM b;
  IF v_lista_inact='' THEN v_lista_inact:='<em style="color:#6b7280">— nadie 🎉</em>'; END IF;

  -- payload base (nombre se setea por destinatario)
  v_payload := jsonb_build_object(
    'mes', v_mes,
    'total_correos', v_total_correos::text, 'lista_correos', v_lista_correos,
    'eng_instalar', v_eng_instalar::text, 'eng_notif', v_eng_notif::text, 'eng_completo', v_eng_completo::text,
    'lista_instalar', v_lista_instalar, 'lista_notif', v_lista_notif,
    'ens_practicaron', v_ens_practicaron::text, 'ens_no', v_ens_no::text, 'ens_con', v_ens_con::text, 'lista_ens_no', v_lista_ens_no,
    'act7', v_act7::text, 'act30', v_act30::text, 'inact30', v_inact30::text,
    'total_miembros', v_total_miembros::text, 'lista_inact', v_lista_inact
  );

  -- PREVIEW: manda SOLO a esa dirección, no consume el dedup, carril rápido.
  IF p_preview_to IS NOT NULL THEN
    PERFORM public.encolar_email('pulso-mensual', p_preview_to, 'Paul',
      v_payload || jsonb_build_object('nombre', public._html_escape('Paul')), 1::smallint);
    RETURN;
  END IF;

  -- Dedup por mes (el cron corre día 1). p_force salta el dedup (QA).
  INSERT INTO public.email_throttle (key, last_sent_at) VALUES ('pulso:'||v_month_key, now())
    ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 AND NOT p_force THEN RETURN; END IF;

  FOR v_member IN
    SELECT m.name, m.email FROM public.members m
    WHERE m.active AND m.role='pastor' AND m.email IS NOT NULL AND m.email<>''
  LOOP
    BEGIN
      PERFORM public.encolar_email('pulso-mensual', v_member.email, v_member.name,
        v_payload || jsonb_build_object('nombre', public._html_escape(COALESCE(v_member.name,''))), 5::smallint);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'send_pulso_mensual: fallo para %: %', v_member.email, SQLERRM;
    END;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.send_pulso_mensual(timestamptz,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_pulso_mensual(timestamptz,boolean,text) TO service_role;
