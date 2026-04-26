-- =====================================================
-- Daily Reflections Table for AdorAPP
-- =====================================================
-- 365 daily devotional/reflection quotes with authors
-- Automatically sent via notification system
-- =====================================================

-- Create daily_reflections table
CREATE TABLE IF NOT EXISTS daily_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_year INTEGER NOT NULL CHECK (day_of_year >= 1 AND day_of_year <= 366),
  date DATE NOT NULL UNIQUE,
  quote TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient date lookups
CREATE INDEX IF NOT EXISTS idx_daily_reflections_date ON daily_reflections(date);
CREATE INDEX IF NOT EXISTS idx_daily_reflections_day_of_year ON daily_reflections(day_of_year);

-- =====================================================
-- Notifications Table for AdorAPP Bell
-- =====================================================
-- Stores notifications to be displayed in the bell icon
-- Each user sees notifications addressed to them or all users
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'reflection', 'alert', 'reminder')),
  is_read BOOLEAN DEFAULT false,
  is_global BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Create index for efficient user lookups
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_global ON notifications(is_global);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================

-- Enable RLS on both tables
ALTER TABLE daily_reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- daily_reflections: Allow all authenticated users to read
DROP POLICY IF EXISTS "Allow read daily_reflections" ON daily_reflections;
CREATE POLICY "Allow read daily_reflections" ON daily_reflections
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- notifications: Users can read their own notifications AND global notifications
DROP POLICY IF EXISTS "Allow read notifications" ON notifications;
CREATE POLICY "Allow read notifications" ON notifications
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            user_id = auth.uid()
            OR is_global = true
        )
    );

-- notifications: Authenticated users can insert global notifications (for system use)
DROP POLICY IF EXISTS "Allow insert notifications" ON notifications;
CREATE POLICY "Allow insert notifications" ON notifications
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- notifications: Users can update their own notifications (mark as read)
DROP POLICY IF EXISTS "Allow update notifications" ON notifications;
CREATE POLICY "Allow update notifications" ON notifications
    FOR UPDATE
    USING (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
    );

-- notifications: Users can delete their own notifications
DROP POLICY IF EXISTS "Allow delete notifications" ON notifications;
CREATE POLICY "Allow delete notifications" ON notifications
    FOR DELETE
    USING (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
    );

-- =====================================================
-- Comments for documentation
-- =====================================================

COMMENT ON TABLE daily_reflections IS '365 daily devotional quotes with authors for notification system';
COMMENT ON COLUMN daily_reflections.day_of_year IS 'Day of year (1-366)';
COMMENT ON COLUMN daily_reflections.date IS 'Specific calendar date';
COMMENT ON COLUMN daily_reflections.quote IS 'The devotional quote/reflection text';
COMMENT ON COLUMN daily_reflections.author IS 'Quote author name';

COMMENT ON TABLE notifications IS 'User notifications displayed in bell icon';
COMMENT ON COLUMN notifications.user_id IS 'User who should see this notification (NULL for global)';
COMMENT ON COLUMN notifications.is_global IS 'If true, all authenticated users see this notification';
COMMENT ON COLUMN notifications.expires_at IS 'When notification expires (NULL = never)';
