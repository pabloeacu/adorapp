-- =====================================================
-- CRON JOB: Daily Reflection Notification at 00:00
-- Run this as a Supabase pg_cron job or external scheduler
-- =====================================================

-- Function to send daily notification
CREATE OR REPLACE FUNCTION send_daily_reflection_notification()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    today_date DATE;
    reflection RECORD;
    notification_id UUID;
BEGIN
    -- Get today's date
    today_date := CURRENT_DATE;

    -- Get the reflection for today
    SELECT * INTO reflection
    FROM daily_reflections
    WHERE date = today_date;

    -- If no reflection for today, use day_of_year (for looping)
    IF NOT FOUND THEN
        SELECT * INTO reflection
        FROM daily_reflections
        WHERE day_of_year = (
            SELECT EXTRACT(DOY FROM today_date)::int
        );
    END IF;

    -- Delete previous global reflection notifications (if any)
    DELETE FROM notifications
    WHERE is_global = true
    AND type = 'reflection'
    AND created_at < NOW() - INTERVAL '1 day';

    -- Insert new notification
    INSERT INTO notifications (title, message, type, is_global, created_at)
    VALUES (
        'Reflexión del Día',
        reflection.quote || ' — ' || reflection.author,
        'reflection',
        true,
        NOW()
    )
    RETURNING id INTO notification_id;

    RAISE NOTICE 'Daily notification sent: %', notification_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION send_daily_reflection_notification() TO anon;
GRANT EXECUTE ON FUNCTION send_daily_reflection_notification() TO authenticated;
