-- Band rehearsal reminders, scheduled per-order.
--
-- Why: when a leader schedules a rehearsal for an order, every member of that
-- band should get a push 2 hours before, the same day, reminding them to come.
--
-- How (mirrors the birthday pattern, no new push pipeline needed):
-- 1. Three additive, nullable columns on `orders`:
--      rehearsal_date (date), rehearsal_time (text 'HH:MM'),
--      rehearsal_reminder_sent (bool, dedup). Orders without a rehearsal are
--      unaffected (all NULL / false).
-- 2. Function send_rehearsal_reminders(): for each order whose rehearsal is
--    inside the [rehearsal-2h, rehearsal) window in ART and not yet reminded,
--    insert ONE notification per active band member that has a user account.
--    The existing AFTER INSERT trigger on `notifications` fires the web push
--    automatically. Then mark the order reminded (dedup), so it's sent once.
-- 3. Cron every 15 min (rehearsal times are arbitrary, unlike the fixed daily
--    crons, so we need finer granularity; the dedup flag keeps it to one send).
--
-- Security: like the other cron-only helpers (see 20260530), this function is
-- NOT exposed as public RPC — EXECUTE is revoked from PUBLIC/anon/authenticated.
-- The cron job runs as its creator (postgres, the owner), so it still works.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, unschedule+schedule.
-- Reuses the existing 'reminder' notification type (no CHECK change needed).

-- ----------------------------------------------------------------
-- 1. Additive columns on orders
-- ----------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rehearsal_date date,
  ADD COLUMN IF NOT EXISTS rehearsal_time text,
  ADD COLUMN IF NOT EXISTS rehearsal_reminder_sent boolean NOT NULL DEFAULT false;

-- ----------------------------------------------------------------
-- 2. Reminder function
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_rehearsal_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Absolute rehearsal moment in ART (UTC-3, no DST).
    BEGIN
      rehearsal_ts := (ord.rehearsal_date::text || ' ' || ord.rehearsal_time)::timestamp
                      AT TIME ZONE 'America/Argentina/Buenos_Aires';
    EXCEPTION WHEN OTHERS THEN
      -- Malformed time — mark sent so we don't rescan it forever.
      UPDATE public.orders SET rehearsal_reminder_sent = true WHERE id = ord.id;
      CONTINUE;
    END;

    -- Only inside the 2h-before → start window. Past rehearsals never fire.
    IF NOW() >= rehearsal_ts - INTERVAL '2 hours' AND NOW() < rehearsal_ts THEN
      FOR band_member IN
        SELECT m.user_id
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
          '🎶 Hoy tenés ensayo!',
          'Hoy tenés ensayo!! es hora de ensamblar las canciones que practicaste. No faltes!',
          'reminder',
          band_member.user_id,
          false,
          NOW(),
          rehearsal_ts + INTERVAL '3 hours'  -- drops off the bell after rehearsal
        );
      END LOOP;

      -- Dedup: one reminder per rehearsal, even if 0 members had accounts.
      UPDATE public.orders SET rehearsal_reminder_sent = true WHERE id = ord.id;
    END IF;
  END LOOP;
END;
$$;

-- Cron-only helper: not callable as public RPC (matches 20260530 lockdown).
REVOKE EXECUTE ON FUNCTION public.send_rehearsal_reminders() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- 3. Schedule every 15 minutes
-- ----------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('rehearsal-reminders');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- not scheduled yet
END
$$;

SELECT cron.schedule(
  'rehearsal-reminders',
  '*/15 * * * *',
  $$ SELECT public.send_rehearsal_reminders(); $$
);
