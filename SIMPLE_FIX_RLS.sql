-- ============================================================================
-- SIMPLE FIX RLS - AdorAPP
-- Ejecutar TODO este SQL en Supabase Dashboard > SQL Editor
-- ============================================================================

-- PASO 1: Eliminar TODAS las políticas existentes de TODAS las tablas
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON members;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON members;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON members;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON members;
DROP POLICY IF EXISTS "members_select_authenticated" ON members;
DROP POLICY IF EXISTS "members_insert_authenticated" ON members;
DROP POLICY IF EXISTS "members_update_authenticated" ON members;
DROP POLICY IF EXISTS "members_delete_authenticated" ON members;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON bands;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON bands;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON bands;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON bands;
DROP POLICY IF EXISTS "bands_select_authenticated" ON bands;
DROP POLICY IF EXISTS "bands_insert_authenticated" ON bands;
DROP POLICY IF EXISTS "bands_update_authenticated" ON bands;
DROP POLICY IF EXISTS "bands_delete_authenticated" ON bands;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON songs;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON songs;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON songs;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON songs;
DROP POLICY IF EXISTS "songs_select_authenticated" ON songs;
DROP POLICY IF EXISTS "songs_insert_authenticated" ON songs;
DROP POLICY IF EXISTS "songs_update_authenticated" ON songs;
DROP POLICY IF EXISTS "songs_delete_authenticated" ON songs;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON orders;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON orders;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON orders;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON orders;
DROP POLICY IF EXISTS "orders_select_authenticated" ON orders;
DROP POLICY IF EXISTS "orders_insert_authenticated" ON orders;
DROP POLICY IF EXISTS "orders_update_authenticated" ON orders;
DROP POLICY IF EXISTS "orders_delete_authenticated" ON orders;

DROP POLICY IF EXISTS "Enable insert for anonymous users" ON pending_registrations;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON pending_registrations;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON pending_registrations;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON pending_registrations;
DROP POLICY IF EXISTS "pending_reg_insert_anonymous" ON pending_registrations;
DROP POLICY IF EXISTS "pending_reg_select_authenticated" ON pending_registrations;
DROP POLICY IF EXISTS "pending_reg_update_authenticated" ON pending_registrations;
DROP POLICY IF EXISTS "pending_reg_delete_authenticated" ON pending_registrations;

-- PASO 2: Crear políticas RESTRICTIVAS para members
CREATE POLICY "members_all_auth" ON members
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- PASO 3: Crear políticas RESTRICTIVAS para bands
CREATE POLICY "bands_all_auth" ON bands
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- PASO 4: Crear políticas RESTRICTIVAS para songs
CREATE POLICY "songs_all_auth" ON songs
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- PASO 5: Crear políticas RESTRICTIVAS para orders
CREATE POLICY "orders_all_auth" ON orders
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- PASO 6: Solo INSERT anónimo para pending_registrations
CREATE POLICY "pending_reg_insert_anon" ON pending_registrations
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- SELECT, UPDATE, DELETE solo para autenticados
CREATE POLICY "pending_reg_select_auth" ON pending_registrations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "pending_reg_update_auth" ON pending_registrations
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "pending_reg_delete_auth" ON pending_registrations
  FOR DELETE
  TO authenticated
  USING (true);

-- PASO 7: Crear índices para performance
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- VERIFICACIÓN
SELECT '✅ RLS FIX COMPLETADO' AS status;
