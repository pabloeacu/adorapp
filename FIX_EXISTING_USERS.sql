-- =============================================
-- FIX EXISTING USERS - Run in Supabase SQL Editor
-- =============================================
-- This script will:
-- 1. Create auth.users accounts for existing members
-- 2. Link members table to auth.users by email
-- 3. Verify the links
-- =============================================

-- STEP 1: Check current status (run this first to see what needs fixing)
SELECT
  m.id as member_id,
  m.name,
  m.email,
  m.role,
  m.active,
  m.user_id,
  CASE WHEN au.id IS NOT NULL THEN 'Yes' ELSE 'No' END as has_auth_account
FROM members m
LEFT JOIN auth.users au ON m.email = au.email
WHERE m.active = true
ORDER BY m.name;

-- STEP 2: Create auth users for members who don't have them
-- IMPORTANT: Change 'YourTempPassword123!' to a real temporary password
-- You can use the same password for all users initially

-- For each member without a auth account, run this (replace email):
DO $$
DECLARE
  member_record RECORD;
  new_user_id UUID;
BEGIN
  -- Find members who are active but don't have auth accounts linked
  FOR member_record IN
    SELECT m.email, m.name, m.id as member_id
    FROM members m
    WHERE m.active = true
    AND m.email NOT IN (SELECT email FROM auth.users)
    AND m.user_id IS NULL
  LOOP
    -- Create auth user (you'll need to handle password manually)
    RAISE NOTICE 'Need to create account for: % (%)', member_record.name, member_record.email;

    -- For actual creation, you'd need to use a service role key or Admin UI
    -- The Supabase dashboard allows creating users manually
  END LOOP;
END $$;

-- STEP 3: Link existing members to auth.users by email
-- This runs AFTER users are created
UPDATE members m
SET user_id = au.id
FROM auth.users au
WHERE m.email = au.email
  AND m.user_id IS NULL;

-- STEP 4: Verify the fix
SELECT
  name,
  email,
  role,
  user_id IS NOT NULL as has_user_id
FROM members
WHERE active = true
ORDER BY name;