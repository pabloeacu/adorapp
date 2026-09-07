-- Avisar INSTANTÁNEAMENTE (mail + campanita/push) a los miembros de la banda del
-- orden ∪ los pastores cuando una PERSONA edita el CONTENIDO de un orden
-- (canciones, fecha, hora, banda o tipo de reunión). Espeja el aviso de ALTA
-- (notify_on_order_insert), pedido por Paul: "que actúe del mismo modo si se
-- agrega o edita el orden".
--
-- Mejoras sobre el alta: usa la banda EFECTIVA (permanentes ∪ temporales vigentes,
-- band_effective_member_ids) e incluye explícitamente a los PASTORES; excluye a
-- quien hizo la edición. NO toca el trigger de alta (cambio 100% aditivo).
--
-- Corre DENTRO de la transacción del usuario → todo el cuerpo está en
-- BEGIN/EXCEPTION: cualquier error del aviso jamás rompe la edición del orden.

--------------------------------------------------------------------------------
-- 1) Plantilla de correo de edición (misma estética que 'nuevo-orden').
--------------------------------------------------------------------------------
INSERT INTO public.email_templates
  (slug, descripcion, asunto, kicker, titulo, cuerpo_html, cta_text, cta_url,
   color_acento, mostrar_logo, firma, from_label, activo)
VALUES (
  'orden-editado',
  'Aviso a la banda + pastores cuando se edita el contenido de un orden',
  'Se actualizó un orden en AdorAPP',
  'ADORACIÓN CAF',
  'Se actualizó un orden',
  'Hola {{nombre}}, se actualizó el orden del <strong>{{fecha}}</strong>{{banda_sufijo}}. '
    || 'Puede que hayan cambiado las canciones, los tonos o algún dato del servicio '
    || '— revisá los cambios y prepará tu servicio desde la plataforma.<br><br>'
    || 'Cada elemento de la plataforma está hecho para ayudarte a alcanzar mayor '
    || 'excelencia para tu servicio a Dios.<br><br>Un abrazo!<br><br>',
  'Ver el orden', '{{url}}',
  '#b8860b', true, 'Pastores de Adoración CAF', 'adorapp', true
)
ON CONFLICT (slug) DO UPDATE SET
  descripcion = EXCLUDED.descripcion, asunto = EXCLUDED.asunto, kicker = EXCLUDED.kicker,
  titulo = EXCLUDED.titulo, cuerpo_html = EXCLUDED.cuerpo_html, cta_text = EXCLUDED.cta_text,
  cta_url = EXCLUDED.cta_url, color_acento = EXCLUDED.color_acento, firma = EXCLUDED.firma,
  activo = true, updated_at = now();

--------------------------------------------------------------------------------
-- 2) Función del trigger de edición.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_order_update()
  RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid;
  v_key    text;
  v_fire   int;
  v_band   text;
  v_when   text;
  v_sufijo text;
  v_label  text;
  v_msg    text;
  v_member record;
BEGIN
  -- Solo ediciones hechas por una PERSONA (excluye el cron auto-complete y
  -- cualquier update server-side: auth.uid() es NULL para ellos).
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  -- Solo si cambió algo RELEVANTE del contenido (no un no-op, ni feedback, ni
  -- rehearsal_reminder_sent, ni solo updated_at). El status queda fuera a
  -- propósito (completar/cancelar es otro tipo de acción).
  IF NOT (NEW.songs        IS DISTINCT FROM OLD.songs
       OR NEW.date         IS DISTINCT FROM OLD.date
       OR NEW.time         IS DISTINCT FROM OLD.time
       OR NEW.band_id      IS DISTINCT FROM OLD.band_id
       OR NEW.meeting_type IS DISTINCT FROM OLD.meeting_type) THEN
    RETURN NEW;
  END IF;

  BEGIN  -- ===== a partir de acá NADA rompe la edición del orden =====
    -- Throttle por orden (90s): agrupa re-guardados rápidos de la misma sesión.
    v_key := 'order_edit:' || NEW.id::text;
    INSERT INTO public.email_throttle (key, last_sent_at) VALUES (v_key, now())
    ON CONFLICT (key) DO UPDATE SET last_sent_at = now()
      WHERE email_throttle.last_sent_at < now() - interval '90 seconds';
    GET DIAGNOSTICS v_fire = ROW_COUNT;
    IF v_fire = 0 THEN RETURN NEW; END IF;

    IF NEW.band_id IS NOT NULL THEN
      SELECT name INTO v_band FROM public.bands WHERE id = NEW.band_id;
    END IF;
    v_label  := COALESCE(NULLIF(NEW.meeting_type, ''), 'Reunión');
    v_when   := to_char(NEW.date, 'DD/MM');
    v_sufijo := CASE WHEN v_band IS NOT NULL THEN ' · ' || v_band ELSE '' END;
    v_msg    := v_label || ' del ' || v_when || v_sufijo;

    -- Destinatarios: banda EFECTIVA (permanentes ∪ temporales vigentes) ∪ pastores,
    -- activos, con email; EXCLUYENDO a quien hizo la edición.
    FOR v_member IN
      SELECT DISTINCT m.id, m.name, m.email, m.user_id
      FROM public.members m
      WHERE m.active = true
        AND m.user_id IS DISTINCT FROM v_uid
        AND ( m.id = ANY (public.band_effective_member_ids(NEW.band_id)) OR m.role = 'pastor' )
    LOOP
      BEGIN
        -- Campanita + push (solo quien tenga login).
        IF v_member.user_id IS NOT NULL THEN
          INSERT INTO public.notifications (user_id, title, message, type, is_global, created_at, expires_at)
          VALUES (v_member.user_id, 'Orden actualizado', v_msg, 'order', false, now(), now() + interval '7 days');
        END IF;
        -- Correo.
        IF v_member.email IS NOT NULL AND v_member.email <> '' THEN
          PERFORM public.encolar_email('orden-editado', v_member.email, v_member.name,
            jsonb_build_object('nombre', COALESCE(v_member.name, ''), 'fecha', v_when,
              'banda_sufijo', v_sufijo, 'url', 'https://adorapp.net.ar/ordenes'), 5::smallint);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_on_order_update: fallo para %: %', v_member.email, SQLERRM;
      END;
    END LOOP;

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.error_log (message, severity, context)
      VALUES ('notify_on_order_update: fallo general', 'warning',
              jsonb_build_object('order', NEW.id, 'error', SQLERRM));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END;

  RETURN NEW;
END;
$function$;

--------------------------------------------------------------------------------
-- 3) Trigger AFTER UPDATE + blindaje del ejecutable.
--------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS notify_order_update ON public.orders;
CREATE TRIGGER notify_order_update
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_order_update();

REVOKE ALL ON FUNCTION public.notify_on_order_update() FROM PUBLIC, anon, authenticated;
