-- ============================================================================
-- SUPER RESET RLS - Forzamos RLS a funcionar en Supabase
-- ============================================================================

-- 1. Verificar que las tablas existen
SELECT '1. Verificando tablas...' as step;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('members', 'bands', 'songs', 'orders', 'pending_registrations');

-- 2. Habilitar RLS en todas las tablas
SELECT '2. Habilitando RLS...' as step;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;

-- 3. Forzar RLS (esto es clave)
SELECT '3. Forzando RLS...' as step;
ALTER TABLE members FORCE ROW LEVEL SECURITY;
ALTER TABLE bands FORCE ROW LEVEL SECURITY;
ALTER TABLE songs FORCE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE pending_registrations FORCE ROW LEVEL SECURITY;

-- 4. Eliminar TODAS las políticas con CASCADE
SELECT '4. Eliminando políticas antiguas...' as step;

DROP POLICY IF EXISTS p1 ON members CASCADE;
DROP POLICY IF EXISTS p2 ON members CASCADE;
DROP POLICY IF EXISTS p3 ON members CASCADE;
DROP POLICY IF EXISTS p4 ON members CASCADE;

DROP POLICY IF EXISTS p1 ON bands CASCADE;
DROP POLICY IF EXISTS p2 ON bands CASCADE;
DROP POLICY IF EXISTS p3 ON bands CASCADE;
DROP POLICY IF EXISTS p4 ON bands CASCADE;

DROP POLICY IF EXISTS p1 ON songs CASCADE;
DROP POLICY IF EXISTS p2 ON songs CASCADE;
DROP POLICY IF EXISTS p3 ON songs CASCADE;
DROP POLICY IF EXISTS p4 ON songs CASCADE;

DROP POLICY IF EXISTS p1 ON orders CASCADE;
DROP POLICY IF EXISTS p2 ON orders CASCADE;
DROP POLICY IF EXISTS p3 ON orders CASCADE;
DROP POLICY IF EXISTS p4 ON orders CASCADE;

DROP POLICY IF EXISTS p1 ON pending_registrations CASCADE;
DROP POLICY IF EXISTS p2 ON pending_registrations CASCADE;
DROP POLICY IF EXISTS p3 ON pending_registrations CASCADE;
DROP POLICY IF EXISTS p4 ON pending_registrations CASCADE;

DROP POLICY IF EXISTS "Enable read" ON members CASCADE;
DROP POLICY IF EXISTS "Enable insert" ON members CASCADE;
DROP POLICY IF EXISTS "Enable update" ON members CASCADE;
DROP POLICY IF EXISTS "Enable delete" ON members CASCADE;
DROP POLICY IF EXISTS "Enable read access" ON members CASCADE;
DROP POLICY IF EXISTS "Enable insert access" ON members CASCADE;
DROP POLICY IF EXISTS "Enable update access" ON members CASCADE;
DROP POLICY IF EXISTS "Enable delete access" ON members CASCADE;

DROP POLICY IF EXISTS "Enable read" ON bands CASCADE;
DROP POLICY IF EXISTS "Enable insert" ON bands CASCADE;
DROP POLICY IF EXISTS "Enable update" ON bands CASCADE;
DROP POLICY IF EXISTS "Enable delete" ON bands CASCADE;
DROP POLICY IF EXISTS "Enable read access" ON bands CASCADE;
DROP POLICY IF EXISTS "Enable insert access" ON bands CASCADE;
DROP POLICY IF EXISTS "Enable update access" ON bands CASCADE;
DROP POLICY IF EXISTS "Enable delete access" ON bands CASCADE;

DROP POLICY IF EXISTS "Enable read" ON songs CASCADE;
DROP POLICY IF EXISTS "Enable insert" ON songs CASCADE;
DROP POLICY IF EXISTS "Enable update" ON songs CASCADE;
DROP POLICY IF EXISTS "Enable delete" ON songs CASCADE;
DROP POLICY IF EXISTS "Enable read access" ON songs CASCADE;
DROP POLICY IF EXISTS "Enable insert access" ON songs CASCADE;
DROP POLICY IF EXISTS "Enable update access" ON songs CASCADE;
DROP POLICY IF EXISTS "Enable delete access" ON songs CASCADE;

DROP POLICY IF EXISTS "Enable read" ON orders CASCADE;
DROP POLICY IF EXISTS "Enable insert" ON orders CASCADE;
DROP POLICY IF EXISTS "Enable update" ON orders CASCADE;
DROP POLICY IF EXISTS "Enable delete" ON orders CASCADE;
DROP POLICY IF EXISTS "Enable read access" ON orders CASCADE;
DROP POLICY IF EXISTS "Enable insert access" ON orders CASCADE;
DROP POLICY IF EXISTS "Enable update access" ON orders CASCADE;
DROP POLICY IF EXISTS "Enable delete access" ON orders CASCADE;

DROP POLICY IF EXISTS "Enable insert" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "Enable read" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "Enable update" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "Enable delete" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "Enable insert access" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "Enable read access" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "Enable update access" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "Enable delete access" ON pending_registrations CASCADE;

DROP POLICY IF EXISTS "auth_members_all" ON members CASCADE;
DROP POLICY IF EXISTS "auth_bands_all" ON bands CASCADE;
DROP POLICY IF EXISTS "auth_songs_all" ON songs CASCADE;
DROP POLICY IF EXISTS "auth_orders_all" ON orders CASCADE;
DROP POLICY IF EXISTS "auth_pending_all" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "pending_reg_anon_insert" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "pending_reg_auth_select" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "pending_reg_auth_update" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "pending_reg_auth_delete" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "members_auth_all" ON members CASCADE;
DROP POLICY IF EXISTS "bands_auth_all" ON bands CASCADE;
DROP POLICY IF EXISTS "songs_auth_all" ON songs CASCADE;
DROP POLICY IF EXISTS "orders_auth_all" ON orders CASCADE;

-- 5. Crear políticas nuevas PARA EL ROL anon (QUE BLOQUEE TODO)
SELECT '5. Creando políticas de bloqueo para anon...' as step;

-- Bloquear TODAS las operaciones de anon en members
CREATE POLICY block_anon_members_select ON members FOR SELECT TO anon USING (false);
CREATE POLICY block_anon_members_insert ON members FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY block_anon_members_update ON members FOR UPDATE TO anon USING (false);
CREATE POLICY block_anon_members_delete ON members FOR DELETE TO anon USING (false);

-- Bloquear TODAS las operaciones de anon en bands
CREATE POLICY block_anon_bands_select ON bands FOR SELECT TO anon USING (false);
CREATE POLICY block_anon_bands_insert ON bands FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY block_anon_bands_update ON bands FOR UPDATE TO anon USING (false);
CREATE POLICY block_anon_bands_delete ON bands FOR DELETE TO anon USING (false);

-- Bloquear TODAS las operaciones de anon en songs
CREATE POLICY block_anon_songs_select ON songs FOR SELECT TO anon USING (false);
CREATE POLICY block_anon_songs_insert ON songs FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY block_anon_songs_update ON songs FOR UPDATE TO anon USING (false);
CREATE POLICY block_anon_songs_delete ON songs FOR DELETE TO anon USING (false);

-- Bloquear TODAS las operaciones de anon en orders
CREATE POLICY block_anon_orders_select ON orders FOR SELECT TO anon USING (false);
CREATE POLICY block_anon_orders_insert ON orders FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY block_anon_orders_update ON orders FOR UPDATE TO anon USING (false);
CREATE POLICY block_anon_orders_delete ON orders FOR DELETE TO anon USING (false);

-- 6. Crear políticas para authenticated (QUE PERMITA TODO)
SELECT '6. Creando políticas para usuarios autenticados...' as step;

-- Members: solo usuarios autenticados pueden hacer todo
CREATE POLICY allow_auth_members_all ON members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Bands: solo usuarios autenticados pueden hacer todo
CREATE POLICY allow_auth_bands_all ON bands FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Songs: solo usuarios autenticados pueden hacer todo
CREATE POLICY allow_auth_songs_all ON songs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Orders: solo usuarios autenticados pueden hacer todo
CREATE POLICY allow_auth_orders_all ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. Políticas especiales para pending_registrations
-- INSERT anónimo SÍ debe funcionar (para registro de usuarios)
CREATE POLICY allow_anon_pending_insert ON pending_registrations FOR INSERT TO anon WITH CHECK (true);

-- SELECT, UPDATE, DELETE solo para autenticados
CREATE POLICY allow_auth_pending_select ON pending_registrations FOR SELECT TO authenticated USING (true);
CREATE POLICY allow_auth_pending_update ON pending_registrations FOR UPDATE TO authenticated USING (true);
CREATE POLICY allow_auth_pending_delete ON pending_registrations FOR DELETE TO authenticated USING (true);

-- 8. Crear índices
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);

-- 9. Verificación final
SELECT '9. Verificación final...' as step;
SELECT tablename, rowsecurity, rowsecurityforced FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('members', 'bands', 'songs', 'orders', 'pending_registrations');

SELECT 'FINALIZADO - RLS debe estar activo ahora' as status;