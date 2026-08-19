-- ============================================================================
-- Emails Gmail — Fase 4: enganchar 3 de los 4 correos a los eventos reales.
-- ============================================================================
-- Se AUMENTAN las funciones existentes: se preserva TODA su lógica de
-- notificaciones/push y se agrega el encolado de email envuelto en EXCEPTION →
-- si el mail falla, NUNCA rompe el alta del registro ni la del orden ni el cron.
-- (El 4º correo, registro-aprobado, se encola en la EF admin-approve-registration
-- porque necesita la contraseña en claro.)
-- CREATE OR REPLACE preserva los triggers/cron que referencian estas funciones.
-- Se re-asierta el REVOKE (los DEFINER internos no deben ser ejecutables por RPC).
-- ============================================================================

-- 1) registro-pendiente: al crear una solicitud, email al solicitante.
CREATE OR REPLACE FUNCTION public.notify_on_pending_registration_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  pastor RECORD;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  FOR pastor IN
    SELECT user_id FROM public.members WHERE role = 'pastor' AND user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, is_global, created_at, expires_at)
    VALUES (
      pastor.user_id,
      'Solicitud de registro',
      COALESCE(NEW.name, 'Alguien') || ' se quiere registrar al ministerio',
      'request', false, NOW(), NOW() + INTERVAL '30 days'
    );
  END LOOP;

  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    BEGIN
      PERFORM public.encolar_email(
        'registro-pendiente', NEW.email, NEW.name,
        jsonb_build_object('nombre', COALESCE(NEW.name, '')), 1::smallint
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_on_pending_registration_insert: email enqueue failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.notify_on_pending_registration_insert() FROM PUBLIC, anon, authenticated;

-- 2) nuevo-orden: al crear un orden, email a cada miembro de la banda con email.
CREATE OR REPLACE FUNCTION public.notify_on_order_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_band   text;
  v_label  text;
  v_when   text;
  v_msg    text;
  v_sufijo text;
  v_member RECORD;
BEGIN
  IF NEW.band_id IS NOT NULL THEN
    SELECT name INTO v_band FROM public.bands WHERE id = NEW.band_id;
  END IF;

  v_label := COALESCE(NULLIF(NEW.meeting_type, ''), 'Reunión');
  v_when  := to_char(NEW.date, 'DD/MM');
  v_msg   := v_label || ' del ' || v_when;
  IF v_band IS NOT NULL THEN
    v_msg := v_msg || ' · ' || v_band;
  END IF;

  INSERT INTO public.notifications (title, message, type, is_global, created_at, expires_at)
  VALUES ('Nueva orden', v_msg, 'order', true, NOW(), NOW() + INTERVAL '7 days');

  v_sufijo := CASE WHEN v_band IS NOT NULL THEN ' · ' || v_band ELSE '' END;
  IF NEW.band_id IS NOT NULL THEN
    FOR v_member IN
      SELECT m.name, m.email FROM public.members m
      WHERE m.active = true AND m.email IS NOT NULL AND m.email <> ''
        AND m.id::text IN (
          SELECT jsonb_array_elements_text(to_jsonb((SELECT members FROM public.bands WHERE id = NEW.band_id)))
        )
    LOOP
      BEGIN
        PERFORM public.encolar_email(
          'nuevo-orden', v_member.email, v_member.name,
          jsonb_build_object(
            'nombre', COALESCE(v_member.name, ''),
            'fecha', v_when,
            'banda_sufijo', v_sufijo,
            'url', 'https://adorapp.net.ar/ordenes'
          ), 5::smallint
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_on_order_insert: email enqueue failed for %: %', v_member.email, SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.notify_on_order_insert() FROM PUBLIC, anon, authenticated;

-- 3) recordatorio-ensayo: en el cron de recordatorios (2h antes), además del push,
-- email a cada miembro de la banda con link a Mi Ensayo.
CREATE OR REPLACE FUNCTION public.send_rehearsal_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ord RECORD;
  band_member RECORD;
  rehearsal_ts timestamptz;
BEGIN
  FOR ord IN
    SELECT o.id, o.rehearsal_date, o.rehearsal_time, b.members AS band_members
    FROM public.orders o
    JOIN public.bands b ON b.id = o.band_id
    WHERE o.rehearsal_date IS NOT NULL
      AND o.rehearsal_time IS NOT NULL
      AND o.rehearsal_reminder_sent = false
  LOOP
    BEGIN
      rehearsal_ts := (ord.rehearsal_date::text || ' ' || ord.rehearsal_time)::timestamp
                      AT TIME ZONE 'America/Argentina/Buenos_Aires';
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.orders SET rehearsal_reminder_sent = true WHERE id = ord.id;
      CONTINUE;
    END;

    IF NOW() >= rehearsal_ts - INTERVAL '2 hours' AND NOW() < rehearsal_ts THEN
      FOR band_member IN
        SELECT m.user_id, m.name, m.email
        FROM public.members m
        WHERE m.active = true
          AND m.user_id IS NOT NULL
          AND m.id::text IN (
            SELECT jsonb_array_elements_text(to_jsonb(ord.band_members))
          )
      LOOP
        INSERT INTO public.notifications (
          title, message, type, user_id, is_global, created_at, expires_at
        ) VALUES (
          '🎶 ¡Hoy tenés ensamble!',
          '¡Hoy tenés ensamble! Es hora de ensamblar con la banda las canciones que practicaste. ¡No faltes!',
          'reminder', band_member.user_id, false, NOW(), rehearsal_ts + INTERVAL '3 hours'
        );

        IF band_member.email IS NOT NULL AND band_member.email <> '' THEN
          BEGIN
            PERFORM public.encolar_email(
              'recordatorio-ensayo', band_member.email, band_member.name,
              jsonb_build_object(
                'nombre', COALESCE(band_member.name, ''),
                'fecha', to_char(ord.rehearsal_date, 'DD/MM'),
                'url', 'https://adorapp.net.ar/practica/' || ord.id
              ), 3::smallint
            );
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'send_rehearsal_reminders: email enqueue failed for %: %', band_member.email, SQLERRM;
          END;
        END IF;
      END LOOP;

      UPDATE public.orders SET rehearsal_reminder_sent = true WHERE id = ord.id;
    END IF;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.send_rehearsal_reminders() FROM PUBLIC, anon, authenticated;
