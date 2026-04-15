-- AdorAPP - Add categories array column to songs table
-- Run this SQL in Supabase SQL Editor to add the new categories column

-- Step 1: Add the categories column (text array)
ALTER TABLE songs ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT ARRAY['adoracion'];

-- Step 2: Migrate existing single category to the new array format
UPDATE songs
SET categories = ARRAY[category]
WHERE category IS NOT NULL AND categories IS NULL;

-- Step 3: Create index for better search performance on categories
CREATE INDEX IF NOT EXISTS idx_songs_categories ON songs USING GIN(categories);

-- Step 4: Verify the column was added correctly
-- SELECT id, title, category, categories FROM songs LIMIT 10;

-- Done! The songs table now supports multiple categories per song.
-- Existing songs with a single category will have that category in the categories array.
-- New songs can have multiple categories as an array.