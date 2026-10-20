-- Correos mensuales automáticos (server-side, pg_cron — sin computadora prendida).
--
-- (1) ENGANCHE: barre la plataforma y manda, una vez por mes, a cada miembro el
--     correo que corresponde a su situación (1 por persona, dedup por prioridad):
--       - sin conectarse hace +10 días            -> engagement-volve
--       - sin app NI notificaciones               -> engagement-instalar-notif
--       - sin app (pero con notificaciones)        -> engagement-instalar
--       - con app pero sin notificaciones          -> engagement-notificaciones
--     Todas las áreas, sin pastores. Cron día 20 08:00 ART (primer disparo: mañana).
--
-- (2) ENSAYÓMETRO (solo Adoración): una vez por mes, las 3 consignas del último correo:
--       - con práctica cargada                     -> ensayometro-felicitar
--       - con alarma activada pero sin práctica    -> ensayometro-estimular
--       - sin nada                                 -> ensayometro-invitar
--     Cron día 15 08:00 ART (primer disparo: 15/11; ya salió manual el 13/10).
--
-- Patrón de las demás funciones de cron: SECURITY DEFINER + search_path fijo + REVOKE.
-- Dedup mensual por email_throttle. Encola en email_queue (prioridad 9, cede a los
-- correos transaccionales); el worker send-emails-worker lo despacha de a uno por minuto
-- (goteo natural). Nombre escapado (_html_escape) porque body_html se renderiza RAW.

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_engagement_emails(p_now timestamptz DEFAULT now(), p_force boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_month text; v_n int; v_m record;
BEGIN
  v_month := to_char(p_now AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM');
  IF NOT p_force THEN
    INSERT INTO public.email_throttle (key, last_sent_at) VALUES ('engagement:' || v_month, now())
      ON CONFLICT (key) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RETURN; END IF;   -- ya se mandó este mes
  END IF;

  FOR v_m IN
    WITH elig AS (
      SELECT m.id, m.name, m.email,
        (a.app_installed_at IS NOT NULL) AS installed,
        EXISTS (SELECT 1 FROM public.push_subscriptions p WHERE p.member_id = m.id) AS has_notif,
        (a.last_seen_at IS NULL OR a.last_seen_at < p_now - interval '10 days') AS inactive10
      FROM public.members m
      LEFT JOIN public.member_activity a ON a.member_id = m.id
      WHERE m.active = true AND m.role <> 'pastor'
        AND m.email IS NOT NULL AND btrim(m.email) <> ''
    )
    SELECT id, name, email,
      CASE
        WHEN inactive10                        THEN 'engagement-volve'
        WHEN NOT installed AND NOT has_notif    THEN 'engagement-instalar-notif'
        WHEN NOT installed AND has_notif        THEN 'engagement-instalar'
        WHEN installed AND NOT has_notif        THEN 'engagement-notificaciones'
        ELSE NULL
      END AS slug
    FROM elig
  LOOP
    IF v_m.slug IS NULL THEN CONTINUE; END IF;   -- ya está al día: no recibe nada
    BEGIN
      INSERT INTO public.email_queue (template_slug, to_email, to_nombre, variables, prioridad, programado_para, status)
      VALUES (v_m.slug, v_m.email, v_m.name,
        jsonb_build_object('nombre', public._html_escape(split_part(coalesce(v_m.name, ''), ' ', 1))),
        9, p_now, 'pending');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'send_engagement_emails: fallo para %: %', v_m.email, SQLERRM;
    END;
  END LOOP;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_ensayometro_emails(p_now timestamptz DEFAULT now(), p_force boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_month text; v_n int; v_m record;
BEGIN
  v_month := to_char(p_now AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM');
  IF NOT p_force THEN
    INSERT INTO public.email_throttle (key, last_sent_at) VALUES ('ensayometro:' || v_month, now())
      ON CONFLICT (key) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RETURN; END IF;
  END IF;

  FOR v_m IN
    WITH elig AS (
      SELECT m.id, m.name, m.email,
        EXISTS (SELECT 1 FROM public.practice_logs pl WHERE pl.user_id = m.user_id) AS has_practice,
        EXISTS (SELECT 1 FROM public.practice_alarms pa WHERE pa.user_id = m.user_id AND pa.enabled) AS has_alarm
      FROM public.members m
      WHERE m.active = true AND m.role IN ('member', 'leader')
        AND m.areas @> ARRAY['adoracion']::text[]
        AND m.email IS NOT NULL AND btrim(m.email) <> ''
    )
    SELECT id, name, email,
      CASE
        WHEN has_practice THEN 'ensayometro-felicitar'
        WHEN has_alarm    THEN 'ensayometro-estimular'
        ELSE                   'ensayometro-invitar'
      END AS slug
    FROM elig
  LOOP
    BEGIN
      INSERT INTO public.email_queue (template_slug, to_email, to_nombre, variables, prioridad, programado_para, status)
      VALUES (v_m.slug, v_m.email, v_m.name,
        jsonb_build_object('nombre', public._html_escape(split_part(coalesce(v_m.name, ''), ' ', 1))),
        9, p_now, 'pending');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'send_ensayometro_emails: fallo para %: %', v_m.email, SQLERRM;
    END;
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION public.send_engagement_emails(timestamptz, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_ensayometro_emails(timestamptz, boolean) FROM PUBLIC, anon, authenticated;

-- Crons (08:00 ART = 11:00 UTC). Días separados para no encimar dos correos el mismo día.
SELECT cron.schedule('engagement-emails-monthly', '0 11 20 * *', $$ SELECT public.send_engagement_emails(); $$);
SELECT cron.schedule('ensayometro-emails-monthly', '0 11 15 * *', $$ SELECT public.send_ensayometro_emails(); $$);
