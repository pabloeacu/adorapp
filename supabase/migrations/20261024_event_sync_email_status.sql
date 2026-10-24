-- Sincroniza event_registrations.email_status con el estado real del correo en
-- email_queue (para que el panel de pastores muestre "Enviado"/"Falló" y no quede
-- siempre en "En cola"). BLINDADO: todo el cuerpo en BEGIN/EXCEPTION -> jamás puede
-- romper el pipeline de correo (si fallara, el UPDATE de email_queue sigue igual).
-- Solo afecta filas de evento (match por email_queued_id); para el resto es no-op.
CREATE OR REPLACE FUNCTION public.event_sync_email_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('sent','failed') THEN
    BEGIN
      UPDATE public.event_registrations
        SET email_status = NEW.status, updated_at = now()
        WHERE email_queued_id = NEW.id AND email_status IS DISTINCT FROM NEW.status;
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- nunca romper el envío de correo por un problema de sincronización
    END;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS event_sync_email_status ON public.email_queue;
CREATE TRIGGER event_sync_email_status
  AFTER UPDATE OF status ON public.email_queue
  FOR EACH ROW EXECUTE FUNCTION public.event_sync_email_status();

REVOKE ALL ON FUNCTION public.event_sync_email_status() FROM PUBLIC, anon, authenticated;
