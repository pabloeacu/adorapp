-- Alerta de seguridad: avisar a los pastores cuando se CREA o ELEVA a un pastor.
--
-- Contexto (landmine #108): las EFs admin-* tienen rate-limit, pero un pastor
-- comprometido igual puede crear MÁS pastores (cada uno con cupo fresco) — es una
-- limitación INHERENTE al privilegio. La defensa contra eso es DETECCIÓN: que el
-- resto de los pastores se enteren cada vez que alguien pasa a ser pastor y puedan
-- reaccionar si no lo esperaban.
--
-- 100% backend, ADITIVO y best-effort: un trigger AFTER que NUNCA rompe el alta/
-- edición del miembro (todo en BEGIN/EXCEPTION, igual que los otros notify_on_*).
-- Espeja el patrón de check_system_health (mismos destinatarios, mismas columnas de
-- notifications, mismo encolar_email + _html_escape, mismo email_throttle).

-- ── Plantilla de correo ────────────────────────────────────────────────────────
INSERT INTO public.email_templates
  (slug, descripcion, asunto, from_label, activo, kicker, titulo, cuerpo_html,
   color_acento, mostrar_logo, firma)
VALUES (
  'nuevo-pastor',
  'Aviso de seguridad a los pastores cuando se crea o eleva a un nuevo pastor',
  '⚠️ Nuevo pastor en AdorAPP',
  'adorapp',
  true,
  'ADORACIÓN CAF',
  'Nuevo pastor',
  'Hola {{nombre}}, se registró un <strong>nuevo pastor</strong> en AdorAPP: <strong>{{nuevo}}</strong>.<br><br>'
    || '{{por_linea}}'
    || 'Si vos o el equipo hicieron este cambio, no hay nada que hacer. <strong>Si no lo esperabas</strong>, '
    || 'revisá la ficha en <em>Miembros</em> y, ante cualquier duda, cambiá tu contraseña y avisá al equipo.<br><br>'
    || '<em style="color:#6b7280;font-size:13px;line-height:1.5">Recibís este aviso porque sos pastor: es un '
    || 'control de seguridad, ya que los pastores tienen acceso total. Se envía una vez cada vez que alguien pasa a ser pastor.</em>',
  '#c0392b',
  true,
  'Control de seguridad · AdorAPP'
)
ON CONFLICT (slug) DO UPDATE SET
  descripcion = EXCLUDED.descripcion, asunto = EXCLUDED.asunto, from_label = EXCLUDED.from_label,
  activo = EXCLUDED.activo, kicker = EXCLUDED.kicker, titulo = EXCLUDED.titulo,
  cuerpo_html = EXCLUDED.cuerpo_html, color_acento = EXCLUDED.color_acento,
  mostrar_logo = EXCLUDED.mostrar_logo, firma = EXCLUDED.firma, updated_at = now();

-- ── Función del trigger ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_pastor_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_id uuid;
  v_actor_name text;
  v_new_name text;
  v_by_plain text := '';   -- push/campanita (texto plano)
  v_por_linea text := '';  -- correo (HTML ya escapado, o vacío)
  v_title text := 'Nuevo pastor en AdorAPP';
  v_msg text;
  v_c int;
  v_pastor record;
BEGIN
  -- Solo en la TRANSICIÓN a pastor. (role es NOT NULL; en INSERT no se toca OLD.)
  IF NEW.role <> 'pastor' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.role = 'pastor' THEN RETURN NEW; END IF; -- ya era pastor

  BEGIN
    v_new_name := COALESCE(NULLIF(btrim(NEW.name), ''), 'Un miembro');

    -- Actor best-effort: auth.uid() suele ser NULL cuando el cambio viene de una EF
    -- (service_role) o un cron. Si mapea a una ficha, lo nombramos.
    v_actor_id := auth.uid();
    IF v_actor_id IS NOT NULL THEN
      SELECT m.name INTO v_actor_name FROM public.members m WHERE m.user_id = v_actor_id LIMIT 1;
    END IF;
    IF v_actor_name IS NOT NULL AND btrim(v_actor_name) <> '' THEN
      v_by_plain := ' (lo hizo ' || v_actor_name || ')';
      v_por_linea := 'El cambio lo hizo <strong>' || public._html_escape(v_actor_name) || '</strong>.<br><br>';
    END IF;

    v_msg := v_new_name || ' ahora es pastor' || v_by_plain
             || '. Si no esperabas este cambio, revisalo cuanto antes.';

    -- Throttle por miembro + día ART (evita doble aviso ante un re-guardado inmediato).
    INSERT INTO public.email_throttle (key, last_sent_at)
    VALUES ('new_pastor:' || NEW.id::text || ':'
            || to_char((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM-DD'), now())
    ON CONFLICT (key) DO NOTHING;
    GET DIAGNOSTICS v_c = ROW_COUNT;
    IF v_c = 0 THEN RETURN NEW; END IF; -- ya se avisó hoy por este miembro

    -- A cada OTRO pastor activo (excluye al nuevo pastor y al actor identificable).
    FOR v_pastor IN
      SELECT user_id, email, name FROM public.members
      WHERE role='pastor' AND active=true AND user_id IS NOT NULL AND email IS NOT NULL AND email <> ''
        AND id <> NEW.id
        AND (v_actor_id IS NULL OR user_id IS DISTINCT FROM v_actor_id)
    LOOP
      BEGIN
        INSERT INTO public.notifications (user_id, title, message, type, is_global)
        VALUES (v_pastor.user_id, v_title, v_msg, 'alert', false);
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.error_log (message, severity, context)
        VALUES ('notify_on_pastor_created: fallo push a un pastor', 'warning',
                jsonb_build_object('user_id', v_pastor.user_id, 'error', SQLERRM));
      END;
      BEGIN
        PERFORM public.encolar_email('nuevo-pastor', v_pastor.email, v_pastor.name,
          jsonb_build_object(
            'nombre', public._html_escape(COALESCE(v_pastor.name,'')),
            'nuevo', public._html_escape(v_new_name),
            'por_linea', v_por_linea
          ), 1::smallint);
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.error_log (message, severity, context)
        VALUES ('notify_on_pastor_created: fallo mail a un pastor', 'warning',
                jsonb_build_object('email', v_pastor.email, 'error', SQLERRM));
      END;
    END LOOP;

  EXCEPTION WHEN OTHERS THEN
    -- best-effort: el aviso jamás rompe el alta/edición del miembro
    BEGIN
      INSERT INTO public.error_log (message, severity, context)
      VALUES ('notify_on_pastor_created: fallo general', 'warning',
              jsonb_build_object('error', SQLERRM, 'member', NEW.id));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END;

  RETURN NEW;
END;
$function$;

-- La función trigger no se llama nunca directo desde el cliente.
REVOKE ALL ON FUNCTION public.notify_on_pastor_created() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_on_pastor_created() FROM anon, authenticated;

-- ── Trigger ────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS notify_on_pastor_created ON public.members;
CREATE TRIGGER notify_on_pastor_created
  AFTER INSERT OR UPDATE OF role ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_pastor_created();
