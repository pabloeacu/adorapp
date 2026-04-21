-- Add compass and bpm fields to songs table
ALTER TABLE songs ADD COLUMN IF NOT EXISTS compass TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS bpm INTEGER;
