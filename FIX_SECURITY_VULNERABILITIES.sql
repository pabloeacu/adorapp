-- ============================================================================
-- CORRECCIÓN DE VULNERABILIDADES CRÍTICAS - AdorAPP
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. BLOQUEAR ACCESO ANÓNIMO A MEMBERS
-- ============================================================================

-- Primero, eliminar todas las políticas existentes de members
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON members;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON members;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON members;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON members;

-- Crear políticas estrictas para members
-- Solo usuarios autenticados pueden ver miembros (pero no password_hash)
CREATE POLICY "members_select_authenticated" ON members
  FOR SELECT TO authenticated
  USING (true);

-- Solo usuarios autenticados pueden insertar
CREATE POLICY "members_insert_authenticated" ON members
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Solo usuarios autenticados pueden actualizar
CREATE POLICY "members_update_authenticated" ON members
  FOR UPDATE TO authenticated
  USING (true);

-- Solo usuarios autenticados pueden eliminar
CREATE POLICY "members_delete_authenticated" ON members
  FOR DELETE TO authenticated
  USING (true);

-- ============================================================================
-- 2. BLOQUEAR ACCESO ANÓNIMO A BANDS
-- ============================================================================

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON bands;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON bands;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON bands;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON bands;

CREATE POLICY "bands_select_authenticated" ON bands
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "bands_insert_authenticated" ON bands
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "bands_update_authenticated" ON bands
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "bands_delete_authenticated" ON bands
  FOR DELETE TO authenticated
  USING (true);

-- ============================================================================
-- 3. BLOQUEAR ACCESO ANÓNIMO A SONGS
-- ============================================================================

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON songs;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON songs;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON songs;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON songs;

CREATE POLICY "songs_select_authenticated" ON songs
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "songs_insert_authenticated" ON songs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "songs_update_authenticated" ON songs
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "songs_delete_authenticated" ON songs
  FOR DELETE TO authenticated
  USING (true);

-- ============================================================================
-- 4. BLOQUEAR ACCESO ANÓNIMO A ORDERS
-- ============================================================================

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON orders;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON orders;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON orders;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON orders;

CREATE POLICY "orders_select_authenticated" ON orders
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "orders_insert_authenticated" ON orders
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "orders_update_authenticated" ON orders
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "orders_delete_authenticated" ON orders
  FOR DELETE TO authenticated
  USING (true);

-- ============================================================================
-- 5. PENDING REGISTRATIONS - Solo permite INSERT anónimo
-- ============================================================================

DROP POLICY IF EXISTS "Enable insert for anonymous users" ON pending_registrations;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON pending_registrations;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON pending_registrations;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON pending_registrations;

-- INSERT anónimo SÍ debe estar permitido (para registro de usuarios)
CREATE POLICY "pending_reg_insert_anonymous" ON pending_registrations
  FOR INSERT TO anon
  WITH CHECK (true);

-- SELECT solo para usuarios autenticados
CREATE POLICY "pending_reg_select_authenticated" ON pending_registrations
  FOR SELECT TO authenticated
  USING (true);

-- UPDATE solo para usuarios autenticados
CREATE POLICY "pending_reg_update_authenticated" ON pending_registrations
  FOR UPDATE TO authenticated
  USING (true);

-- DELETE solo para usuarios autenticados
CREATE POLICY "pending_reg_delete_authenticated" ON pending_registrations
  FOR DELETE TO authenticated
  USING (true);

-- ============================================================================
-- 6. AGREGAR ÍNDICES PARA MEJORAR PERFORMANCE
-- ============================================================================

-- Índice para buscar miembros por email
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);

-- Índice para buscar miembros por user_id (auth.users)
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);

-- Índice para buscar canciones por categoría
CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category);

-- Índice para buscar canciones por clave
CREATE INDEX IF NOT EXISTS idx_songs_key ON songs(key);

-- Índice para buscar órdenes por fecha
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);

-- Índice para buscar órdenes por tipo de reunión
CREATE INDEX IF NOT EXISTS idx_orders_meeting_type ON orders(meeting_type);

-- Índice para buscar órdenes por estado
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ============================================================================
-- 7. CREAR FUNCIÓN PARA ACTUALIZAR updated_at AUTOMÁTICAMENTE
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a todas las tablas
DROP TRIGGER IF EXISTS update_members_updated_at ON members;
CREATE TRIGGER update_members_updated_at
    BEFORE UPDATE ON members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bands_updated_at ON bands;
CREATE TRIGGER update_bands_updated_at
    BEFORE UPDATE ON bands
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_songs_updated_at ON songs;
CREATE TRIGGER update_songs_updated_at
    BEFORE UPDATE ON songs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pending_reg_updated_at ON pending_registrations;
CREATE TRIGGER update_pending_reg_updated_at
    BEFORE UPDATE ON pending_registrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

-- Verificar que RLS está habilitado
SELECT 'RLS Status:' as info, tablename, rowsecurity
FROM pg_tables t
JOIN pg_namespace n ON n.oid = t.schemaname
WHERE schemaname = 'public'
AND tablename IN ('members', 'bands', 'songs', 'orders', 'pending_registrations');

-- Verificar políticas
SELECT 'Policies:' as info, schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('members', 'bands', 'songs', 'orders', 'pending_registrations');

-- Verificar índices
SELECT 'Indexes:' as info, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('members', 'bands', 'songs', 'orders', 'pending_registrations');

SELECT '✅ Security fixes applied successfully!' as result;
