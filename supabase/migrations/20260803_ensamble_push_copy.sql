-- Glossary fix in the rehearsal push copy: "ensayo" → "ensamble".
--
-- Project glossary (2026-08-03): the band-wide rehearsal scheduled on an order
-- is the "ensamble" (everyone assembles the songs together); the "ensayo" is
-- each musician's PERSONAL practice beforehand (see the Ensayómetro feature).
-- The push sent 2 hours before the band rehearsal therefore announces the
-- ensamble.
--
-- This is a copy-only change: the function body is byte-identical to
-- 20260620_rehearsal_reminders.sql except for the notification title/message.
-- Window logic, dedup flag, security posture (SECURITY DEFINER, fixed
-- search_path, EXECUTE revoked from PUBLIC/anon/authenticated) are unchanged,
-- and the REVOKE is re-asserted because CREATE OR REPLACE re-applies default
-- EXECUTE grants.

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
          '🎶 ¡Hoy tenés ensamble!',
          '¡Hoy tenés ensamble! Es hora de ensamblar con la banda las canciones que practicaste. ¡No faltes!',
          'reminder',
          band_member.user_id,
          false,
          NOW(),
          rehearsal_ts + INTERVAL '3 hours'  -- drops off the bell after the ensamble
        );
      END LOOP;

      -- Dedup: one reminder per rehearsal, even if 0 members had accounts.
      UPDATE public.orders SET rehearsal_reminder_sent = true WHERE id = ord.id;
    END IF;
  END LOOP;
END;
$$;

-- Re-assert the cron-only lockdown (CREATE OR REPLACE resets grants).
REVOKE EXECUTE ON FUNCTION public.send_rehearsal_reminders() FROM PUBLIC, anon, authenticated;
