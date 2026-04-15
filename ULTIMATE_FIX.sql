-- ============================================================================
-- ULTIMATE FIX - Force semua policies to block anonymous access
-- ============================================================================

-- DROP ALL EXISTING POLICIES
DROP POLICY IF EXISTS "members_select_authenticated" ON members CASCADE;
DROP POLICY IF EXISTS "members_insert_authenticated" ON members CASCADE;
DROP POLICY IF EXISTS "members_update_authenticated" ON members CASCADE;
DROP POLICY IF EXISTS "members_delete_authenticated" ON members CASCADE;
DROP POLICY IF EXISTS "auth_members_all" ON members CASCADE;
DROP POLICY IF EXISTS "members_auth_all" ON members CASCADE;
DROP POLICY IF EXISTS "block_anon_members_select" ON members CASCADE;
DROP POLICY IF EXISTS "block_anon_members_insert" ON members CASCADE;
DROP POLICY IF EXISTS "block_anon_members_update" ON members CASCADE;
DROP POLICY IF EXISTS "block_anon_members_delete" ON members CASCADE;

DROP POLICY IF EXISTS "bands_select_authenticated" ON bands CASCADE;
DROP POLICY IF EXISTS "bands_insert_authenticated" ON bands CASCADE;
DROP POLICY IF EXISTS "bands_update_authenticated" ON bands CASCADE;
DROP POLICY IF EXISTS "bands_delete_authenticated" ON bands CASCADE;
DROP POLICY IF EXISTS "auth_bands_all" ON bands CASCADE;
DROP POLICY IF EXISTS "bands_auth_all" ON bands CASCADE;
DROP POLICY IF EXISTS "block_anon_bands_select" ON bands CASCADE;
DROP POLICY IF EXISTS "block_anon_bands_insert" ON bands CASCADE;
DROP POLICY IF EXISTS "block_anon_bands_update" ON bands CASCADE;
DROP POLICY IF EXISTS "block_anon_bands_delete" ON bands CASCADE;

DROP POLICY IF EXISTS "songs_select_authenticated" ON songs CASCADE;
DROP POLICY IF EXISTS "songs_insert_authenticated" ON songs CASCADE;
DROP POLICY IF EXISTS "songs_update_authenticated" ON songs CASCADE;
DROP POLICY IF EXISTS "songs_delete_authenticated" ON songs CASCADE;
DROP POLICY IF EXISTS "auth_songs_all" ON songs CASCADE;
DROP POLICY IF EXISTS "songs_auth_all" ON songs CASCADE;
DROP POLICY IF EXISTS "block_anon_songs_select" ON songs CASCADE;
DROP POLICY IF EXISTS "block_anon_songs_insert" ON songs CASCADE;
DROP POLICY IF EXISTS "block_anon_songs_update" ON songs CASCADE;
DROP POLICY IF EXISTS "block_anon_songs_delete" ON songs CASCADE;

DROP POLICY IF EXISTS "orders_select_authenticated" ON orders CASCADE;
DROP POLICY IF EXISTS "orders_insert_authenticated" ON orders CASCADE;
DROP POLICY IF EXISTS "orders_update_authenticated" ON orders CASCADE;
DROP POLICY IF EXISTS "orders_delete_authenticated" ON orders CASCADE;
DROP POLICY IF EXISTS "auth_orders_all" ON orders CASCADE;
DROP POLICY IF EXISTS "orders_auth_all" ON orders CASCADE;
DROP POLICY IF EXISTS "block_anon_orders_select" ON orders CASCADE;
DROP POLICY IF EXISTS "block_anon_orders_insert" ON orders CASCADE;
DROP POLICY IF EXISTS "block_anon_orders_update" ON orders CASCADE;
DROP POLICY IF EXISTS "block_anon_orders_delete" ON orders CASCADE;

-- CREATE NEW STRICT POLICIES USING SIMPLE NAMES
-- Members: Only authenticated users can do anything
CREATE POLICY m_auth ON members TO authenticated USING (true) WITH CHECK (true);

-- Bands: Only authenticated users can do anything
CREATE POLICY b_auth ON bands TO authenticated USING (true) WITH CHECK (true);

-- Songs: Only authenticated users can do anything
CREATE POLICY s_auth ON songs TO authenticated USING (true) WITH CHECK (true);

-- Orders: Only authenticated users can do anything
CREATE POLICY o_auth ON orders TO authenticated USING (true) WITH CHECK (true);

-- Pending: Only INSERT is allowed for anonymous (for registration)
CREATE POLICY pr_insert ON pending_registrations TO anon WITH CHECK (true);
CREATE POLICY pr_select ON pending_registrations TO authenticated USING (true);
CREATE POLICY pr_update ON pending_registrations TO authenticated USING (true);
CREATE POLICY pr_delete ON pending_registrations TO authenticated USING (true);

SELECT 'DONE' as result;