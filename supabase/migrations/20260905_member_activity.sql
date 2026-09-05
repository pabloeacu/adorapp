-- Actividad del miembro para la ficha (SOLO pastor): última conexión, app
-- instalada, notificaciones. En TABLA SEPARADA (no columnas en members) porque:
--   - members está auditado (audit_members → audit_log_trigger, load-bearing:
--     incidente #20 se recuperó de audit_events.before). Un ping diario de
--     presencia en members contaminaría el audit y churnearía su updated_at.
--   - Así el "solo pastor" se cumple en la BASE (RLS is_pastor()), no solo en UI.
--   - No ejercita el self-update directo de members (hoy más permisivo de lo
--     debido — hueco de escalada de rol preexistente, a cerrar aparte).

CREATE TABLE public.member_activity (
  member_id        uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  last_seen_at     timestamptz,
  app_installed_at timestamptz,
  notifications_on boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Regla #7: exponer al Data API. La RLS de abajo la acota a pastor para SELECT.
GRANT SELECT ON public.member_activity TO authenticated;
ALTER TABLE public.member_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_activity FORCE ROW LEVEL SECURITY;

-- SELECT: SOLO pastor. Las escrituras van por la RPC/trigger SECURITY DEFINER
-- (no hay política de INSERT/UPDATE/DELETE → el cliente no escribe directo).
CREATE POLICY member_activity_select_pastor ON public.member_activity
  FOR SELECT TO authenticated USING ( (SELECT public.is_pastor()) );

-- El miembro registra su PROPIA actividad: última conexión (cada apertura) y
-- app instalada (set-once, COALESCE server-side). Acotada a su propia ficha por
-- user_id = auth.uid(); no puede firmar por otro ni tocar filas ajenas.
CREATE OR REPLACE FUNCTION public.record_member_activity(p_installed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  INSERT INTO public.member_activity (member_id, last_seen_at, app_installed_at)
  SELECT m.id, now(), CASE WHEN p_installed THEN now() ELSE NULL END
  FROM public.members m
  WHERE m.user_id = auth.uid() AND m.active
  ON CONFLICT (member_id) DO UPDATE SET
    last_seen_at     = now(),
    app_installed_at = COALESCE(public.member_activity.app_installed_at, EXCLUDED.app_installed_at),
    updated_at       = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_member_activity(boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_member_activity(boolean) TO authenticated;

-- notifications_on: espejo de push_subscriptions (owner-only, el pastor no la lee).
-- Trigger que lo mantiene en sync ante alta/baja del cliente Y la limpieza
-- server-side de suscripciones muertas (send-push borra las que fallan).
CREATE OR REPLACE FUNCTION public.sync_member_notifications_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_member uuid := COALESCE(NEW.member_id, OLD.member_id);
  v_on boolean;
BEGIN
  IF v_member IS NOT NULL THEN
    v_on := EXISTS (SELECT 1 FROM public.push_subscriptions p WHERE p.member_id = v_member);
    INSERT INTO public.member_activity (member_id, notifications_on)
    VALUES (v_member, v_on)
    ON CONFLICT (member_id) DO UPDATE SET notifications_on = EXCLUDED.notifications_on, updated_at = now()
    WHERE public.member_activity.notifications_on IS DISTINCT FROM EXCLUDED.notifications_on;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_member_notifications_flag() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sync_member_notifications_flag() TO service_role;

DROP TRIGGER IF EXISTS sync_member_notifications_flag ON public.push_subscriptions;
CREATE TRIGGER sync_member_notifications_flag
  AFTER INSERT OR DELETE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_member_notifications_flag();

-- Backfill del estado real de notificaciones (cero caveat).
INSERT INTO public.member_activity (member_id, notifications_on)
SELECT DISTINCT member_id, true FROM public.push_subscriptions
ON CONFLICT (member_id) DO UPDATE SET notifications_on = true;

-- Rollback: DROP TRIGGER sync_member_notifications_flag ON public.push_subscriptions;
--           DROP FUNCTION public.sync_member_notifications_flag(), public.record_member_activity(boolean);
--           DROP TABLE public.member_activity;
