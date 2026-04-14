-- =====================================================
-- Song Key History Table for AdorAPP
-- =====================================================
-- This table tracks the musical key used by each member
-- for each song in service orders, enabling automatic
-- key preselection based on historical preferences.
-- =====================================================

-- Create the song_key_history table
CREATE TABLE IF NOT EXISTS song_key_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  key VARCHAR(9) NOT NULL, -- Musical key (e.g., 'C', 'Am', 'G#')
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_date DATE NOT NULL, -- Date of the service order
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint: only one key history per member-song combination
  CONSTRAINT unique_member_song_key UNIQUE (member_id, song_id)
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_song_key_history_member_song
ON song_key_history(member_id, song_id);

CREATE INDEX IF NOT EXISTS idx_song_key_history_song
ON song_key_history(song_id);

CREATE INDEX IF NOT EXISTS idx_song_key_history_member
ON song_key_history(member_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
DROP TRIGGER IF EXISTS update_song_key_history_updated_at ON song_key_history;
CREATE TRIGGER update_song_key_history_updated_at
    BEFORE UPDATE ON song_key_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Row Level Security (RLS)
-- =====================================================

-- Enable RLS
ALTER TABLE song_key_history ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read key history (for lookup)
DROP POLICY IF EXISTS "Allow read song_key_history" ON song_key_history;
CREATE POLICY "Allow read song_key_history" ON song_key_history
    FOR SELECT
    USING (
      -- All authenticated users can read
      auth.role() IN ('authenticated', 'anon')
    );

-- Allow insert/update for authenticated users
DROP POLICY IF EXISTS "Allow insert song_key_history" ON song_key_history;
CREATE POLICY "Allow insert song_key_history" ON song_key_history
    FOR INSERT
    WITH CHECK (
      auth.role() IN ('authenticated', 'anon')
    );

-- Allow update for authenticated users (for upserts)
DROP POLICY IF EXISTS "Allow update song_key_history" ON song_key_history;
CREATE POLICY "Allow update song_key_history" ON song_key_history
    FOR UPDATE
    USING (
      auth.role() IN ('authenticated', 'anon')
    );

-- =====================================================
-- Comments for documentation
-- =====================================================

COMMENT ON TABLE song_key_history IS 'Tracks the musical key used by each member for each song in service orders';
COMMENT ON COLUMN song_key_history.member_id IS 'Reference to the member who directed the song';
COMMENT ON COLUMN song_key_history.song_id IS 'Reference to the song';
COMMENT ON COLUMN song_key_history.key IS 'Musical key (e.g., C, Am, G#)';
COMMENT ON COLUMN song_key_history.order_id IS 'Reference to the service order where this key was used';
COMMENT ON COLUMN song_key_history.order_date IS 'Date of the service order for ordering/filtering';