-- AdorAPP - Communications Feature
-- Run this SQL in Supabase SQL Editor to create the communications tables

-- =============================================
-- Table: communications
-- Stores the main communication sent by pastors
-- =============================================
CREATE TABLE IF NOT EXISTS communications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  sender_photo TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('bands', 'users', 'roles', 'all')),
  recipient_ids UUID[] DEFAULT '{}',
  recipient_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can read communications
CREATE POLICY "Authenticated users can read communications"
  ON communications FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only pastors can insert communications
CREATE POLICY "Pastors can insert communications"
  ON communications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members
      WHERE members.user_id = auth.uid()
      AND members.role = 'pastor'
    )
  );

-- =============================================
-- Table: communication_notifications
-- Individual notifications for each recipient
-- =============================================
CREATE TABLE IF NOT EXISTS communication_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  communication_id UUID REFERENCES communications(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_photo TEXT,
  subject TEXT NOT NULL,
  preview TEXT,
  full_message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE communication_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own notifications
CREATE POLICY "Users can read their own notifications"
  ON communication_notifications FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

-- Policy: Only pastors can insert notifications (system will handle this)
CREATE POLICY "Authenticated users can insert notifications"
  ON communication_notifications FOR INSERT
  TO authenticated
  WITH CHECK (recipient_id IS NOT NULL);

-- Policy: Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
  ON communication_notifications FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- =============================================
-- Index for faster queries
-- =============================================
CREATE INDEX IF NOT EXISTS idx_communication_notifications_recipient
  ON communication_notifications(recipient_id, is_read);

CREATE INDEX IF NOT EXISTS idx_communication_notifications_created
  ON communication_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communications_sender
  ON communications(sender_id);

CREATE INDEX IF NOT EXISTS idx_communications_created
  ON communications(created_at DESC);

-- =============================================
-- STEP 0: Create auth users for existing members
-- =============================================
-- Run this ONLY for members who need auth accounts
-- The following users need accounts:
-- - Olga (olga@example.com)
-- - Paul (paul@example.com)
-- - Any other member with user_id NULL

-- IMPORTANT: Replace 'TempPassword123!' with actual temporary passwords
-- and communicate them securely to the users

-- For Olga (adjust email as per your data):
-- INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, user_metadata)
-- SELECT gen_random_uuid(), email,
--        crypto.gen_salt('bf'), NOW(),
--        jsonb_build_object('name', name)
-- FROM members WHERE email = 'olga@example.com' AND user_id IS NULL;

-- For Paul:
-- INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, user_metadata)
-- SELECT gen_random_uuid(), email,
--        crypto.gen_salt('bf'), NOW(),
--        jsonb_build_object('name', name)
-- FROM members WHERE email = 'paul@example.com' AND user_id IS NULL;

-- =============================================
-- MIGRATION: Link existing members to auth.users
-- =============================================
-- This migration fixes members who don't have user_id set
-- It matches members to auth.users by email address
-- Run this AFTER creating auth.users for existing members

-- Step 1: Update members with matching email from auth.users
UPDATE members
SET user_id = au.id
FROM auth.users au
WHERE members.email = au.email
  AND members.user_id IS NULL;

-- Step 2: Verify the update (you can check rows affected)
-- This is informational only
DO $$
DECLARE
  linked_count INTEGER;
  total_without_user_id INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_without_user_id FROM members WHERE user_id IS NULL;
  SELECT COUNT(*) INTO linked_count FROM members WHERE user_id IS NOT NULL;
  RAISE NOTICE 'Members linked: % remaining without user_id: %', linked_count, total_without_user_id;
END $$;

-- =============================================
-- VIEW: View for checking member-user relationships
-- =============================================
CREATE OR REPLACE VIEW member_user_relationships AS
SELECT
  m.id,
  m.name,
  m.email,
  m.role,
  m.active,
  m.user_id,
  CASE WHEN au.id IS NOT NULL THEN 'Linked' ELSE 'Not Linked' END as link_status,
  au.email as auth_email
FROM members m
LEFT JOIN auth.users au ON m.user_id = au.id;
