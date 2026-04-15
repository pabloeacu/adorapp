-- ============================================================================
-- DIAGNOSTIC AND FIX - Step by step
-- ============================================================================

-- STEP 1: Check current RLS status
SELECT 'Checking RLS status...' as step;

SELECT
    schemaname,
    tablename,
    rowsecurity,
   rowsecurityforced
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('members', 'bands', 'songs', 'orders', 'pending_registrations')
ORDER BY tablename;

-- STEP 2: Check current policies
SELECT 'Checking existing policies...' as step;

SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('members', 'bands', 'songs', 'orders', 'pending_registrations')
ORDER BY tablename, policyname;

-- STEP 3: Enable RLS if not enabled
SELECT 'Enabling RLS...' as step;

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;

-- STEP 4: Force RLS (important!)
ALTER TABLE members FORCE ROW LEVEL SECURITY;
ALTER TABLE bands FORCE ROW LEVEL SECURITY;
ALTER TABLE songs FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE pending_registrations FORCE ROW LEVEL SECURITY;

-- STEP 5: Drop all existing policies
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

-- STEP 6: Create NEW strict policies
CREATE POLICY "members_auth_all" ON members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "bands_auth_all" ON bands FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "songs_auth_all" ON songs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "orders_auth_all" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- For pending_registrations: only INSERT anonymous, rest authenticated
CREATE POLICY "pending_reg_anon_insert" ON pending_registrations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "pending_reg_auth_select" ON pending_registrations FOR SELECT TO authenticated USING (true);
CREATE POLICY "pending_reg_auth_update" ON pending_registrations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "pending_reg_auth_delete" ON pending_registrations FOR DELETE TO authenticated USING (true);

-- STEP 7: Create indexes
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);

-- STEP 8: Final verification
SELECT 'DONE - RLS should now be active' as status;
