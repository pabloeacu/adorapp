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
