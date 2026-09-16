-- FIX: un pastor DESACTIVADO seguía recibiendo notificaciones.
--
-- Causa raíz #1 (esta migración): notify_on_pending_registration_insert crea una
-- notificación (campanita + push) por cada pastor cuando entra una solicitud de
-- registro, pero seleccionaba `role='pastor' AND user_id IS NOT NULL` SIN
-- `active=true`. Un pastor inactivo (Claudio Tomaselli) recibía una por cada
-- solicitud (33 en 14 días). Se agrega el filtro `active = true`.
--
-- (Causa raíz #2 — los push GLOBALES que llegaban a su dispositivo por su
-- suscripción viva — se arregla en la Edge Function send-push, que ahora sólo
-- manda a suscripciones de miembros ACTIVOS. Ver ese cambio.)
--
-- Todo lo demás de la función queda idéntico (SET search_path TO '' → refs
-- schema-qualified; el correo al SOLICITANTE no cambia).

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
    SELECT user_id FROM public.members
    WHERE role = 'pastor' AND active = true AND user_id IS NOT NULL
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
        jsonb_build_object('nombre', public._html_escape(COALESCE(NEW.name, ''))), 1::smallint
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_on_pending_registration_insert: email enqueue failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;
