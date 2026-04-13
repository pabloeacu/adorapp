-- Add new profile fields to members table
ALTER TABLE members ADD COLUMN IF NOT EXISTS pastor_area TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS leader_of TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS birthdate DATE;
