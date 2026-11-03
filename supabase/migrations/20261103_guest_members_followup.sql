-- Follow-up de invitados (hallazgos de la auditoría adversarial):
-- (1) Crear un invitado NO debe difundir el aviso GLOBAL "Nuevo miembro · ¡Bienvenido!"
--     (campanita a todos + push a todos los dispositivos). Un invitado de un evento no
--     es un miembro nuevo que se suma a la familia. Se gatea notify_on_member_insert.
-- (2) El reporte quincenal a los pastores (send_engagement_nudge_report) NO debe contar
--     a los invitados como "les falta instalar la app" (un invitado no tiene login, nunca
--     ve el cartel): se excluyen del CTE base.
-- 100% backend, aditivo, sin impacto para los miembros normales.

-- (1) Gate de bienvenida: los invitados no disparan el broadcast.
CREATE OR REPLACE FUNCTION public.notify_on_member_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_obs text;
  v_msg text;
BEGIN
  -- Los invitados (guest_until no nulo) NO difunden "Nuevo miembro · Bienvenido"
  -- (campanita + push a todo el ministerio). Son temporales de un evento.
  IF NEW.guest_until IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_obs := public._member_push_area_label(NEW.areas);
  IF v_obs IS NOT NULL THEN
    v_msg := '¡Bienvenido/a a bordo, ' || COALESCE(NEW.name, '') || ' (' || v_obs || ')! Somos una familia en Cristo.';
  ELSE
    v_msg := 'Bienvenido/a ' || COALESCE(NEW.name, 'a la familia') || ' a la familia de adoración';
  END IF;

  INSERT INTO public.notifications (title, message, type, is_global, created_at, expires_at)
  VALUES ('Nuevo miembro', v_msg, 'member', true, NOW(), NOW() + INTERVAL '7 days');
  RETURN NEW;
END;
$function$;

-- (2) Reporte de recordatorio: excluir invitados del conteo/listas de "sin instalar".
CREATE OR REPLACE FUNCTION public.send_engagement_nudge_report(p_now timestamp with time zone DEFAULT now(), p_force boolean DEFAULT false)
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
  IF NOT p_force THEN
    IF v_today < v_anchor OR ((v_today - v_anchor) % 10) <> 0 THEN RETURN; END IF;
  END IF;
  INSERT INTO public.email_throttle (key, last_sent_at) VALUES ('nudge_report:' || v_today::text, now())
    ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN; END IF;
  v_fecha := to_char(v_today, 'DD/MM/YYYY');
  WITH base AS (
    SELECT m.id, m.name,
      (EXISTS (SELECT 1 FROM public.member_activity a WHERE a.member_id = m.id AND a.app_installed_at IS NOT NULL)) AS installed,
      (EXISTS (SELECT 1 FROM public.push_subscriptions p WHERE p.member_id = m.id)) AS has_notif
    FROM public.members m
    WHERE m.active = true
      AND m.guest_until IS NULL  -- los invitados no tienen login: nunca ven el cartel ni cuentan como "sin instalar"
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

-- Re-asertar la ACL endurecida (landmine #39: CREATE OR REPLACE puede resetear grants).
-- Objetivo: EXECUTE solo postgres/service_role (ninguno expuesto a anon/authenticated).
REVOKE ALL ON FUNCTION public.notify_on_member_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_engagement_nudge_report(timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_engagement_nudge_report(timestamptz, boolean) TO service_role;