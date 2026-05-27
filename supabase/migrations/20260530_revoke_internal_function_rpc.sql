-- Lock down internal SECURITY DEFINER functions so they're not callable as
-- public RPC via /rest/v1/rpc/<name>.
--
-- Why: trigger handlers and cron-only helpers were exposed because Postgres
-- grants EXECUTE to PUBLIC by default. The Supabase advisor flagged 10 such
-- functions as callable by `anon` and `authenticated`. None of these need
-- public RPC access — triggers fire as the function owner regardless of
-- caller EXECUTE permission, and cron jobs run as the schedule's creator
-- (postgres), which keeps its EXECUTE rights because it owns the functions.
--
-- What stays callable as-is (NOT touched here):
--   - auth_role(), is_pastor(), is_pastor_or_leader() — RLS helpers; MUST be
--     callable by authenticated.
--   - audit_log_trigger() — already locked down (postgres + service_role).
--   - get_push_config() — already locked down.
--   - send_daily_reflection_notification() — already locked down (the only
--     cron that was set up correctly from the start).
--
-- Safe to re-run: REVOKE on permissions that aren't granted is a no-op.

-- Trigger handlers (7)
REVOKE EXECUTE ON FUNCTION public.notify_on_band_insert()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_member_insert()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_order_insert()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_pending_registration_insert()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_song_insert()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_push_on_communication_insert()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_push_on_notification_insert()     FROM PUBLIC, anon, authenticated;

-- Cron-only helpers (3)
REVOKE EXECUTE ON FUNCTION public.check_notification_freshness()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_daily_birthday_notifications()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_daily_devotional_notification()     FROM PUBLIC, anon, authenticated;
