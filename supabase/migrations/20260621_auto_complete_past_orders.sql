-- Auto-complete past scheduled orders.
--
-- Why: an order is born 'scheduled' and nothing ever moved it forward, so old
-- orders stayed "Programado" forever and the dashboard "completados" counter
-- was always 0. This flips orders whose date is already in the past (ART) from
-- 'scheduled' to 'completed'. Cancelled orders are left untouched.
--
-- Manual override still works from the UI (pastor/leader can set
-- completed/cancelled/scheduled), so this only auto-advances the ones nobody
-- touched.
--
-- Security: cron-only helper, not exposed as public RPC (REVOKE), like the
-- other scheduled functions. Runs as its owner (postgres) via cron.
--
-- Note: UPDATE on orders does not fire the order push trigger (that's INSERT
-- only), so this never sends a notification.

CREATE OR REPLACE FUNCTION public.auto_complete_past_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET status = 'completed'
  WHERE status = 'scheduled'
    AND date < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_complete_past_orders() FROM PUBLIC, anon, authenticated;

-- Daily at 06:00 UTC = 03:00 ART (just after midnight, so yesterday's orders flip).
DO $$
BEGIN
  PERFORM cron.unschedule('auto-complete-orders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

SELECT cron.schedule(
  'auto-complete-orders',
  '0 6 * * *',
  $$ SELECT public.auto_complete_past_orders(); $$
);
