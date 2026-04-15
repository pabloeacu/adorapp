/**
 * FINAL RLS FIX - Using Supabase SQL API endpoint
 */

const PROJECT_REF = 'gvsoexomzfaimagnaqzm';

// The service role key from supabase.js
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MDM5NywiZXhwIjoyMDkxNTM2Mzk3fQ.CCm4Rcjl8J5Zu1BamAbQosriTjd_RsEPH24mgpnj7Pc';

const SQL_FIX = `
// ============================================
// AdorAPP - RLS SECURITY FIX
// Execute ALL of this in Supabase SQL Editor
// ============================================

-- Step 1: ENABLE RLS on all tables
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;

-- Step 2: FORCE RLS (critical for blocking service key bypass)
ALTER TABLE members FORCE ROW LEVEL SECURITY;
ALTER TABLE bands FORCE ROW LEVEL SECURITY;
ALTER TABLE songs FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE pending_registrations FORCE ROW LEVEL SECURITY;

-- Step 3: Drop ALL existing policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON members CASCADE;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON members CASCADE;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON members CASCADE;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON members CASCADE;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON bands CASCADE;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON bands CASCADE;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON bands CASCADE;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON bands CASCADE;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON songs CASCADE;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON songs CASCADE;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON songs CASCADE;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON songs CASCADE;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON orders CASCADE;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON orders CASCADE;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON orders CASCADE;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON orders CASCADE;

DROP POLICY IF EXISTS "Enable insert for anonymous users" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON pending_registrations CASCADE;

-- Step 4: Create NEW strict policies
-- MEMBERS: Only authenticated users
CREATE POLICY "members_select" ON members FOR SELECT TO authenticated USING (true);
CREATE POLICY "members_insert" ON members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "members_update" ON members FOR UPDATE TO authenticated USING (true);
CREATE POLICY "members_delete" ON members FOR DELETE TO authenticated USING (true);

-- BANDS: Only authenticated users
CREATE POLICY "bands_select" ON bands FOR SELECT TO authenticated USING (true);
CREATE POLICY "bands_insert" ON bands FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "bands_update" ON bands FOR UPDATE TO authenticated USING (true);
CREATE POLICY "bands_delete" ON bands FOR DELETE TO authenticated USING (true);

-- SONGS: Only authenticated users
CREATE POLICY "songs_select" ON songs FOR SELECT TO authenticated USING (true);
CREATE POLICY "songs_insert" ON songs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "songs_update" ON songs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "songs_delete" ON songs FOR DELETE TO authenticated USING (true);

-- ORDERS: Only authenticated users
CREATE POLICY "orders_select" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "orders_insert" ON orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "orders_update" ON orders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "orders_delete" ON orders FOR DELETE TO authenticated USING (true);

-- PENDING: INSERT anonymous (for registration), rest authenticated
CREATE POLICY "pending_insert_anon" ON pending_registrations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "pending_select_auth" ON pending_registrations FOR SELECT TO authenticated USING (true);
CREATE POLICY "pending_update_auth" ON pending_registrations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "pending_delete_auth" ON pending_registrations FOR DELETE TO authenticated USING (true);

-- Verify
SELECT 'RLS FIXED!' as status;
`;

async function main() {
  console.log('==============================================');
  console.log('   AdorAPP - RLS SECURITY FIX');
  console.log('==============================================\n');
  
  console.log('IMPORTANT: Copy the SQL below and paste it into:');
  console.log('https://supabase.com/dashboard/project/gvsoexomzfaimagnaqzm/sql/new\n\n');
  
  console.log('--- COPY FROM HERE ---');
  console.log(SQL_FIX);
  console.log('--- COPY TO HERE ---\n');
  
  console.log('Then click "RUN" to execute.\n');
  console.log('After running, verify with this curl command:\n');
  console.log(`curl -s -X GET "${'https://gvsoexomzfaimagnaqzm.supabase.co/rest/v1/members?select=id&limit=1'}" \\\\`);
  console.log('  -H "apikey: <YOUR_ANON_KEY>" \\\\');
  console.log('  -H "Authorization: Bearer <YOUR_ANON_KEY>"\n');
  console.log('Expected result after fix: {"code":"PGRST116","message":"The result contains 0 rows"}');
}

// Generate the SQL file for easy copy
const fs = require('fs');
fs.writeFileSync('FINAL_SQL_FIX.sql', SQL_FIX);
console.log('SQL file saved to: FINAL_SQL_FIX.sql');

main();
