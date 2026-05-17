-- Daily birthday push notifications for pastors.
--
-- Why: pastors should be reminded each morning if it's a ministry member's
-- birthday so they can bless them. Other roles don't receive these.
--
-- How:
-- 1. New notification type 'birthday' (CHECK ampliado).
-- 2. Function send_daily_birthday_notifications() finds today's birthdays
--    (matching month+day in America/Argentina/Buenos_Aires) and inserts one
--    row in `notifications` per (active pastor) × (active birthday member),
--    skipping the case where the birthday member IS the pastor (no one
--    auto-pings themselves).
-- 3. Cron schedule at 12:00 UTC = 09:00 ART daily.
-- 4. The existing AFTER INSERT trigger on `notifications` calls the
--    send-push edge function automatically — no new push pipeline needed.
-- 5. Notifications expire at the next ART midnight so they drop off the bell.
--
-- Idempotent: drops + recreates the function, drops + recreates the schedule.
-- The CHECK constraint expansion is safe because it strictly adds an allowed
-- value (no existing row can violate it).

-- ----------------------------------------------------------------
-- 1. Expand notifications.type CHECK to include 'birthday'
-- ----------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'info','reflection','alert','reminder',
    'devotional','song','band','member','request','order','birthday'
  ]));

-- ----------------------------------------------------------------
-- 2. Function that inserts per-pastor birthday notifications
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_daily_birthday_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_local DATE := (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  -- Bell shows notifs whose expires_at > now() OR is null. We expire at
  -- the next ART midnight so the cumpleaños drops off the bell same-day.
  expires TIMESTAMPTZ := (
    (today_local + INTERVAL '1 day')::timestamp
    AT TIME ZONE 'America/Argentina/Buenos_Aires'
  );
  birthday_member RECORD;
  pastor RECORD;
BEGIN
  FOR birthday_member IN
    SELECT id, name
    FROM public.members
    WHERE birthdate IS NOT NULL
      AND active = true
      AND EXTRACT(MONTH FROM birthdate) = EXTRACT(MONTH FROM today_local)
      AND EXTRACT(DAY   FROM birthdate) = EXTRACT(DAY   FROM today_local)
  LOOP
    FOR pastor IN
      SELECT user_id, id
      FROM public.members
      WHERE role = 'pastor'
        AND active = true
        AND user_id IS NOT NULL
        AND id <> birthday_member.id   -- don't ping a pastor about their own birthday
    LOOP
      INSERT INTO public.notifications (
        title, message, type, user_id, is_global, created_at, expires_at
      ) VALUES (
        '🎂 Cumpleaños',
        'Hoy es el cumpleaños de ' || birthday_member.name || '! Bendecilo en su día!',
        'birthday',
        pastor.user_id,
        false,
        NOW(),
        expires
      );
    END LOOP;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_daily_birthday_notifications() TO anon, authenticated;

-- ----------------------------------------------------------------
-- 3. Schedule daily at 09:00 ART (12:00 UTC)
-- ----------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('daily-birthday-notification');
EXCEPTION WHEN OTHERS THEN
  -- Job didn't exist yet — nothing to remove.
  NULL;
END
$$;

SELECT cron.schedule(
  'daily-birthday-notification',
  '0 12 * * *',
  $$ SELECT public.send_daily_birthday_notifications(); $$
);
