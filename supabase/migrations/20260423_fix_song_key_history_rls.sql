-- =====================================================
-- FIX: Song Key History Table Security
-- =====================================================
-- This migration enables RLS on song_key_history table
-- and creates secure policies for authenticated users only
-- =====================================================

-- Step 1: Enable RLS on song_key_history
ALTER TABLE song_key_history ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing insecure policies
DROP POLICY IF EXISTS "Allow read song_key_history" ON song_key_history;
DROP POLICY IF EXISTS "Allow insert song_key_history" ON song_key_history;
DROP POLICY IF EXISTS "Allow update song_key_history" ON song_key_history;
DROP POLICY IF EXISTS "Allow delete song_key_history" ON song_key_history;

-- Step 3: Create secure policies (authenticated users only, no anonymous access)

-- Read policy: All authenticated users can read key history
CREATE POLICY "Allow read song_key_history" ON song_key_history
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Insert policy: Authenticated users can insert their own key history
CREATE POLICY "Allow insert song_key_history" ON song_key_history
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM members
            WHERE members.id = song_key_history.member_id
            AND members.user_id = auth.uid()
        )
    );

-- Update policy: Users can only update their own key history entries
CREATE POLICY "Allow update song_key_history" ON song_key_history
    FOR UPDATE
    USING (
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM members
            WHERE members.id = song_key_history.member_id
            AND members.user_id = auth.uid()
        )
    );

-- Delete policy: Users can only delete their own key history entries
CREATE POLICY "Allow delete song_key_history" ON song_key_history
    FOR DELETE
    USING (
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM members
            WHERE members.id = song_key_history.member_id
            AND members.user_id = auth.uid()
        )
    );

-- Step 4: Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON song_key_history TO authenticated;
GRANT ALL ON song_key_history TO anon;

-- Step 5: Verify RLS is enabled
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'song_key_history'
        AND relrowsecurity = true
    ) THEN
        RAISE WARNING 'RLS may not be properly enabled on song_key_history';
    END IF;
END $$;

-- Success message
SELECT 'song_key_history RLS security fixed successfully!' as status;
