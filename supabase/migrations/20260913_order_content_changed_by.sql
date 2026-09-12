-- Banners con vencimiento (2026-09-13): quién hizo el último cambio de contenido/formación
-- del orden, para que el propio editor NO vea el aviso "Hubo cambios en el orden" en su
-- Inicio (ni el pastor que editó vea el "¡Ojo! Hubo cambios" de las áreas).
--
-- Columna server-owned (la escribe SOLO el trigger BEFORE set_order_content_changed,
-- como content_changed_at). Va en convertOrderFromDB y NUNCA en convertOrderToDB.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS content_changed_by uuid
    REFERENCES public.members(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.orders.content_changed_by IS
  'Miembro que hizo el último cambio de contenido/formación (my_member_id() al momento del trigger). Server-owned.';

-- El trigger sella AMBAS columnas cuando cambia el contenido; si NO cambió, las fuerza a
-- OLD (un PATCH del cliente no puede inventar ni borrar el sello). my_member_id() es NULL
-- para crons/service_role → sello sin autor (nadie queda excluido del aviso).
CREATE OR REPLACE FUNCTION public.set_order_content_changed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.songs        IS DISTINCT FROM OLD.songs
      OR NEW.date         IS DISTINCT FROM OLD.date
      OR NEW.time         IS DISTINCT FROM OLD.time
      OR NEW.band_id      IS DISTINCT FROM OLD.band_id
      OR NEW.meeting_type IS DISTINCT FROM OLD.meeting_type
      OR NEW.lineup       IS DISTINCT FROM OLD.lineup) THEN
    NEW.content_changed_at := now();
    NEW.content_changed_by := public.my_member_id();
  ELSE
    NEW.content_changed_at := OLD.content_changed_at;
    NEW.content_changed_by := OLD.content_changed_by;
  END IF;
  RETURN NEW;
END;
$function$;

-- Higiene del resumen diario (landmine #51): ambos sellos son columnas "automáticas" que
-- acompañan a un cambio real y nunca aparecen solas; igual van a la lista de exclusión
-- de activity_digest_items para que jamás cuenten como edición. Reemplazo quirúrgico del
-- literal (falla explícito si el texto esperado no está).
DO $do$
DECLARE
  def text;
  needle text := $n$('updated_at', 'last_used', 'rehearsal_reminder_sent')$n$;
  repl   text := $r$('updated_at', 'last_used', 'rehearsal_reminder_sent', 'content_changed_at', 'content_changed_by')$r$;
BEGIN
  def := pg_get_functiondef('public.activity_digest_items'::regproc);
  IF position(needle in def) = 0 THEN
    IF position('content_changed_by' in def) > 0 THEN
      RETURN; -- ya aplicado
    END IF;
    RAISE EXCEPTION 'activity_digest_items: no se encontró la lista de exclusión esperada';
  END IF;
  EXECUTE replace(def, needle, repl);
END
$do$;

REVOKE EXECUTE ON FUNCTION public.activity_digest_items(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
