-- ============================================================================
-- DEFINITIVE RLS FIX - AdorAPP
-- ============================================================================

-- PASO 1: Habilitar RLS en todas las tablas (si no está habilitado)
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;

-- PASO 2: Eliminar TODAS las políticas existentes
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON members CASCADE;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON members CASCADE;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON members CASCADE;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON members CASCADE;
DROP POLICY IF EXISTS "members_select_authenticated" ON members CASCADE;
DROP POLICY IF EXISTS "members_insert_authenticated" ON members CASCADE;
DROP POLICY IF EXISTS "members_update_authenticated" ON members CASCADE;
DROP POLICY IF EXISTS "members_delete_authenticated" ON members CASCADE;
DROP POLICY IF EXISTS "members_all_auth" ON members CASCADE;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON bands CASCADE;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON bands CASCADE;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON bands CASCADE;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON bands CASCADE;
DROP POLICY IF EXISTS "bands_select_authenticated" ON bands CASCADE;
DROP POLICY IF EXISTS "bands_insert_authenticated" ON bands CASCADE;
DROP POLICY IF EXISTS "bands_update_authenticated" ON bands CASCADE;
DROP POLICY IF EXISTS "bands_delete_authenticated" ON bands CASCADE;
DROP POLICY IF EXISTS "bands_all_auth" ON bands CASCADE;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON songs CASCADE;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON songs CASCADE;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON songs CASCADE;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON songs CASCADE;
DROP POLICY IF EXISTS "songs_select_authenticated" ON songs CASCADE;
DROP POLICY IF EXISTS "songs_insert_authenticated" ON songs CASCADE;
DROP POLICY IF EXISTS "songs_update_authenticated" ON songs CASCADE;
DROP POLICY IF EXISTS "songs_delete_authenticated" ON songs CASCADE;
DROP POLICY IF EXISTS "songs_all_auth" ON songs CASCADE;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON orders CASCADE;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON orders CASCADE;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON orders CASCADE;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON orders CASCADE;
DROP POLICY IF EXISTS "orders_select_authenticated" ON orders CASCADE;
DROP POLICY IF EXISTS "orders_insert_authenticated" ON orders CASCADE;
DROP POLICY IF EXISTS "orders_update_authenticated" ON orders CASCADE;
DROP POLICY IF EXISTS "orders_delete_authenticated" ON orders CASCADE;
DROP POLICY IF EXISTS "orders_all_auth" ON orders CASCADE;

DROP POLICY IF EXISTS "Enable insert for anonymous users" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "pending_reg_insert_anonymous" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "pending_reg_select_authenticated" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "pending_reg_update_authenticated" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "pending_reg_delete_authenticated" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "pending_reg_insert_anon" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "pending_reg_select_auth" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "pending_reg_update_auth" ON pending_registrations CASCADE;
DROP POLICY IF EXISTS "pending_reg_delete_auth" ON pending_registrations CASCADE;

-- PASO 3: Crear políticas NUEVAS y EXPLICITAS
-- MEMBERS: Solo usuarios autenticados
CREATE POLICY "auth_members_select" ON members FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_members_insert" ON members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_members_update" ON members FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_members_delete" ON members FOR DELETE TO authenticated USING (true);

-- BANDS: Solo usuarios autenticados
CREATE POLICY "auth_bands_select" ON bands FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_bands_insert" ON bands FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_bands_update" ON bands FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_bands_delete" ON bands FOR DELETE TO authenticated USING (true);

-- SONGS: Solo usuarios autenticados
CREATE POLICY "auth_songs_select" ON songs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_songs_insert" ON songs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_songs_update" ON songs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_songs_delete" ON songs FOR DELETE TO authenticated USING (true);

-- ORDERS: Solo usuarios autenticados
CREATE POLICY "auth_orders_select" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_orders_insert" ON orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_orders_update" ON orders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_orders_delete" ON orders FOR DELETE TO authenticated USING (true);

-- PENDING_REGISTRATIONS: INSERT anónimo, resto autenticado
CREATE POLICY "anon_pending_insert" ON pending_registrations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "auth_pending_select" ON pending_registrations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_pending_update" ON pending_registrations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_pending_delete" ON pending_registrations FOR DELETE TO authenticated USING (true);

-- PASO 4: Índices para performance
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- VERIFICACIÓN
SELECT '✅ RLS DEFINITIVAMENTE HABILITADO' AS status;

-- Verificar RLS status
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('members', 'bands', 'songs', 'orders', 'pending_registrations');
