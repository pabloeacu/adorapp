ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE members FORCE ROW LEVEL SECURITY;
ALTER TABLE bands FORCE ROW LEVEL SECURITY;
ALTER TABLE songs FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE pending_registrations FORCE ROW LEVEL SECURITY;

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

CREATE POLICY members_auth_all ON members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY bands_auth_all ON bands FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY songs_auth_all ON songs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY orders_auth_all ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY pending_reg_anon_insert ON pending_registrations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY pending_reg_auth_select ON pending_registrations FOR SELECT TO authenticated USING (true);
CREATE POLICY pending_reg_auth_update ON pending_registrations FOR UPDATE TO authenticated USING (true);
CREATE POLICY pending_reg_auth_delete ON pending_registrations FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);

SELECT 'DONE' as status;