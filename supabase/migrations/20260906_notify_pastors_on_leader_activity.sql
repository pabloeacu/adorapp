-- Resumen DIARIO a los PASTORES (un correo + un aviso en la campanita) de los
-- movimientos (alta / edición / eliminación) que hicieron LÍDERES o miembros
-- EDITORES sobre canciones del repertorio, órdenes de servicio o bandas. Un solo
-- envío por día (22:00 ART), y SOLO los días en que hubo movimientos → sin spam.
--
-- Se apoya en el log de auditoría YA existente (audit_events), que captura
-- actor_name / actor_role / occurred_at / table_name / action. Un cron diario a
-- las 22:00 ART resume las ÚLTIMAS 24 h (ventana móvil, sin huecos ni solapes),
-- agrupando por autor + tabla + acción.
--
-- Como es un cron (fuera de la transacción del usuario), NO puede romper ninguna
-- acción en vivo. Igual, el envío por pastor está en BEGIN/EXCEPTION.

--------------------------------------------------------------------------------
-- 0) Hardening: audit_events solo lo escribe el trigger de auditoría (SECURITY
--    DEFINER, owner postgres). La RLS ya bloquea al cliente (sin policy de
--    INSERT/UPDATE/DELETE); revocamos el grant redundante — landmine #45.
--------------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_events FROM authenticated, anon;

--------------------------------------------------------------------------------
-- 1) Nuevo type 'activity' permitido en notifications (si no, el INSERT falla 23514).
--------------------------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'info','reflection','alert','reminder','devotional','song','band','member',
    'request','order','birthday','collaboration','activity']));

--------------------------------------------------------------------------------
-- 2) Plantilla de correo del resumen (layout estándar del ministerio, dorado).
--    {{items}} se inyecta como HTML ya armado y escapado por la función.
--------------------------------------------------------------------------------
INSERT INTO public.email_templates
  (slug, descripcion, asunto, kicker, titulo, cuerpo_html, cta_text, cta_url,
   color_acento, mostrar_logo, firma, from_label, activo)
VALUES (
  'actividad-lider',
  'Resumen diario a pastores de la actividad de lideres y editores',
  'Resumen de actividad · {{fecha}}',
  'Actividad del ministerio · Adoración CAF',
  'Movimientos del día',
  'Hola {{nombre}}, el <strong>{{fecha}}</strong> hubo <strong>{{cantidad}}</strong> '
    || 'movimiento(s) de líderes o editores en la plataforma:'
    || '<br><br>{{items}}'
    || '<br>Podés ver el detalle completo cuando quieras desde la plataforma.',
  'Abrir AdorAPP', 'https://adorapp.net.ar/',
  '#b8860b', true, 'AdorAPP · Ministerio de Adoración', 'adorapp', true
)
ON CONFLICT (slug) DO UPDATE SET
  descripcion = EXCLUDED.descripcion, asunto = EXCLUDED.asunto, kicker = EXCLUDED.kicker,
  titulo = EXCLUDED.titulo, cuerpo_html = EXCLUDED.cuerpo_html, cta_text = EXCLUDED.cta_text,
  cta_url = EXCLUDED.cta_url, color_acento = EXCLUDED.color_acento, firma = EXCLUDED.firma,
  activo = true, updated_at = now();

--------------------------------------------------------------------------------
-- 3) Helper de escape HTML (el cuerpo del email se renderiza RAW → un título de
--    canción con < > & no debe inyectar HTML en el correo del pastor).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._html_escape(t text)
  RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT replace(replace(replace(COALESCE($1, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

--------------------------------------------------------------------------------
-- 4) Helper: frase legible por grupo (autor + verbo + objeto/cantidad). Texto
--    PLANO (se escapa aparte para el email). n=1 muestra el título puntual.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._leader_activity_phrase(
  p_actor text, p_table text, p_action text, p_n int, p_title text)
  RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(p_actor, 'Alguien') || ' ' || CASE
    WHEN p_table='songs' AND p_action='insert' THEN
      CASE WHEN p_n=1 THEN 'agregó la canción' || COALESCE(' «'||p_title||'»','') || ' al repertorio'
           ELSE 'agregó ' || p_n::text || ' canciones al repertorio' END
    WHEN p_table='songs' AND p_action='update' THEN
      CASE WHEN p_n=1 THEN 'editó la canción' || COALESCE(' «'||p_title||'»','')
           ELSE 'editó ' || p_n::text || ' canciones' END
    WHEN p_table='songs' AND p_action='delete' THEN
      CASE WHEN p_n=1 THEN 'eliminó la canción' || COALESCE(' «'||p_title||'»','') || ' del repertorio'
           ELSE 'eliminó ' || p_n::text || ' canciones del repertorio' END
    WHEN p_table='orders' AND p_action='insert' THEN
      CASE WHEN p_n=1 THEN 'creó un orden de servicio' || COALESCE(' del '||p_title,'')
           ELSE 'creó ' || p_n::text || ' órdenes de servicio' END
    WHEN p_table='orders' AND p_action='update' THEN
      CASE WHEN p_n=1 THEN 'editó un orden de servicio' || COALESCE(' del '||p_title,'')
           ELSE 'editó ' || p_n::text || ' órdenes de servicio' END
    WHEN p_table='orders' AND p_action='delete' THEN
      CASE WHEN p_n=1 THEN 'eliminó un orden de servicio' || COALESCE(' del '||p_title,'')
           ELSE 'eliminó ' || p_n::text || ' órdenes de servicio' END
    WHEN p_table='bands' AND p_action='insert' THEN
      CASE WHEN p_n=1 THEN 'creó la banda' || COALESCE(' «'||p_title||'»','')
           ELSE 'creó ' || p_n::text || ' bandas' END
    WHEN p_table='bands' AND p_action='update' THEN
      CASE WHEN p_n=1 THEN 'sumó un integrante a la banda' || COALESCE(' «'||p_title||'»','')
           ELSE 'sumó ' || p_n::text || ' integrantes a las bandas' END
    WHEN p_table='bands' AND p_action='delete' THEN
      CASE WHEN p_n=1 THEN 'eliminó la banda' || COALESCE(' «'||p_title||'»','')
           ELSE 'eliminó ' || p_n::text || ' bandas' END
    ELSE 'hizo ' || p_n::text || ' cambio(s)'
  END;
$$;

--------------------------------------------------------------------------------
-- 5) Función del resumen diario. Resume la ventana [p_now - 24h, p_now).
--    p_now = fin de ventana (NULL → now()); parametrizable para testeo.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_leader_activity_digest(p_now timestamptz DEFAULT NULL)
  RETURNS void LANGUAGE plpgsql
  SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_end    timestamptz;
  v_start  timestamptz;
  v_fecha  text;
  v_total  int := 0;
  v_html   text := '';
  v_plain  text := '';
  v_line   text;
  v_g      record;
  v_pastor record;
BEGIN
  v_end   := COALESCE(p_now, now());
  v_start := v_end - interval '24 hours';
  v_fecha := to_char((v_end AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 'DD/MM/YYYY');

  -- Movimientos de las últimas 24 h, agrupados por autor + tabla + acción.
  -- Incluye LÍDERES (actor_role='leader') y miembros EDITORES (members.editor=true).
  -- Excluye pastores y a crons/service_role (actor_member_id NULL).
  FOR v_g IN
    SELECT ae.actor_name, ae.table_name, ae.action, count(*)::int AS n,
           CASE WHEN count(*) = 1 THEN
             max(COALESCE(ae.after->>'title', ae.after->>'name', ae.after->>'date',
                          ae.before->>'title', ae.before->>'name', ae.before->>'date'))
           END AS single_title
    FROM public.audit_events ae
    LEFT JOIN public.members m ON m.id = ae.actor_member_id
    WHERE ae.table_name IN ('songs', 'orders', 'bands')
      AND ae.action IN ('insert', 'update', 'delete')
      AND ae.actor_member_id IS NOT NULL
      AND ae.actor_role IS DISTINCT FROM 'pastor'
      AND (ae.actor_role = 'leader' OR COALESCE(m.editor, false) = true)
      AND ae.occurred_at >= v_start AND ae.occurred_at < v_end
    GROUP BY ae.actor_name, ae.table_name, ae.action
    ORDER BY ae.actor_name, ae.table_name, ae.action
  LOOP
    v_total := v_total + v_g.n;
    v_line := public._leader_activity_phrase(v_g.actor_name, v_g.table_name, v_g.action, v_g.n, v_g.single_title);
    v_plain := v_plain || CASE WHEN v_plain = '' THEN '' ELSE ' · ' END || v_line;
    v_html  := v_html  || '• ' || public._html_escape(v_line) || '<br>';
  END LOOP;

  IF v_total = 0 THEN RETURN; END IF;  -- día sin movimientos: no se envía nada

  FOR v_pastor IN
    SELECT user_id, email, name FROM public.members
    WHERE role = 'pastor' AND active = true AND user_id IS NOT NULL
  LOOP
    BEGIN
      -- Aviso en la campanita (dispara el push web por notify_push_on_notification_insert).
      INSERT INTO public.notifications (user_id, title, message, type, is_global, created_at, expires_at)
      VALUES (v_pastor.user_id, 'Resumen de actividad · ' || v_fecha, v_plain, 'activity', false,
              now(), now() + interval '30 days');

      -- Correo del resumen (best-effort). Contenido de usuario escapado.
      IF v_pastor.email IS NOT NULL AND v_pastor.email <> '' THEN
        PERFORM public.encolar_email('actividad-lider', v_pastor.email, v_pastor.name,
          jsonb_build_object(
            'nombre',   public._html_escape(COALESCE(v_pastor.name, '')),
            'fecha',    v_fecha,
            'cantidad', v_total::text,
            'items',    v_html),
          5::smallint);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- un pastor que falla no frena al otro
    END;
  END LOOP;
END;
$function$;

--------------------------------------------------------------------------------
-- 6) Cron diario 22:00 ART (= 01:00 UTC del día siguiente) + blindaje de ejecutables.
--------------------------------------------------------------------------------
SELECT cron.unschedule('leader-activity-digest')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'leader-activity-digest');
SELECT cron.schedule('leader-activity-digest', '0 1 * * *',
  $$SELECT public.send_leader_activity_digest()$$);

REVOKE ALL ON FUNCTION public.send_leader_activity_digest(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._html_escape(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._leader_activity_phrase(text, text, text, int, text) FROM PUBLIC, anon, authenticated;
