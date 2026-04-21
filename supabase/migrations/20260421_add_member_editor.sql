-- Add editor permission field to members table
-- This allows members to add/edit songs while still being regular members
ALTER TABLE members ADD COLUMN IF NOT EXISTS editor BOOLEAN DEFAULT false;
