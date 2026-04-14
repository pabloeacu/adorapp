/**
 * EJECUTAR CORRECCIONES DE SEGURIDAD EN SUPABASE
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MDM5NywiZXhwIjoyMDkxNTM2Mzk3fQ.CCm4Rcjl8J5Zu1BamAbQosriTjd_RsEPH24mgpnj7Pc';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function fixSecurityIssues() {
  console.log('🔧 Aplicando correcciones de seguridad...\n');

  // ============================================================================
  // 1. BLOQUEAR ACCESO ANÓNIMO A MEMBERS
  // ============================================================================
  console.log('1. Bloqueando acceso anónimo a members...');

  const dropMemberPolicies = `
    DROP POLICY IF EXISTS "Enable read access for authenticated users" ON members;
    DROP POLICY IF EXISTS "Enable insert for authenticated users" ON members;
    DROP POLICY IF EXISTS "Enable update for authenticated users" ON members;
    DROP POLICY IF EXISTS "Enable delete for authenticated users" ON members;
  `;

  const createMemberPolicies = `
    CREATE POLICY "members_select_authenticated" ON members FOR SELECT TO authenticated USING (true);
    CREATE POLICY "members_insert_authenticated" ON members FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "members_update_authenticated" ON members FOR UPDATE TO authenticated USING (true);
    CREATE POLICY "members_delete_authenticated" ON members FOR DELETE TO authenticated USING (true);
  `;

  try {
    await supabaseAdmin.rpc('exec', { query: dropMemberPolicies + createMemberPolicies });
    console.log('   ✅ Members policies actualizadas');
  } catch (e) {
    console.log('   ⚠️  Error (policies ya actualizadas o RPC no disponible):', e.message);
  }

  // ============================================================================
  // 2. BLOQUEAR ACCESO ANÓNIMO A BANDS
  // ============================================================================
  console.log('2. Bloqueando acceso anónimo a bands...');

  const dropBandPolicies = `
    DROP POLICY IF EXISTS "Enable read access for authenticated users" ON bands;
    DROP POLICY IF EXISTS "Enable insert for authenticated users" ON bands;
    DROP POLICY IF EXISTS "Enable update for authenticated users" ON bands;
    DROP POLICY IF EXISTS "Enable delete for authenticated users" ON bands;
  `;

  const createBandPolicies = `
    CREATE POLICY "bands_select_authenticated" ON bands FOR SELECT TO authenticated USING (true);
    CREATE POLICY "bands_insert_authenticated" ON bands FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "bands_update_authenticated" ON bands FOR UPDATE TO authenticated USING (true);
    CREATE POLICY "bands_delete_authenticated" ON bands FOR DELETE TO authenticated USING (true);
  `;

  try {
    await supabaseAdmin.rpc('exec', { query: dropBandPolicies + createBandPolicies });
    console.log('   ✅ Bands policies actualizadas');
  } catch (e) {
    console.log('   ⚠️  Error:', e.message);
  }

  // ============================================================================
  // 3. BLOQUEAR ACCESO ANÓNIMO A SONGS
  // ============================================================================
  console.log('3. Bloqueando acceso anónimo a songs...');

  const dropSongPolicies = `
    DROP POLICY IF EXISTS "Enable read access for authenticated users" ON songs;
    DROP POLICY IF EXISTS "Enable insert for authenticated users" ON songs;
    DROP POLICY IF EXISTS "Enable update for authenticated users" ON songs;
    DROP POLICY IF EXISTS "Enable delete for authenticated users" ON songs;
  `;

  const createSongPolicies = `
    CREATE POLICY "songs_select_authenticated" ON songs FOR SELECT TO authenticated USING (true);
    CREATE POLICY "songs_insert_authenticated" ON songs FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "songs_update_authenticated" ON songs FOR UPDATE TO authenticated USING (true);
    CREATE POLICY "songs_delete_authenticated" ON songs FOR DELETE TO authenticated USING (true);
  `;

  try {
    await supabaseAdmin.rpc('exec', { query: dropSongPolicies + createSongPolicies });
    console.log('   ✅ Songs policies actualizadas');
  } catch (e) {
    console.log('   ⚠️  Error:', e.message);
  }

  // ============================================================================
  // 4. BLOQUEAR ACCESO ANÓNIMO A ORDERS
  // ============================================================================
  console.log('4. Bloqueando acceso anónimo a orders...');

  const dropOrderPolicies = `
    DROP POLICY IF EXISTS "Enable read access for authenticated users" ON orders;
    DROP POLICY IF EXISTS "Enable insert for authenticated users" ON orders;
    DROP POLICY IF EXISTS "Enable update for authenticated users" ON orders;
    DROP POLICY IF EXISTS "Enable delete for authenticated users" ON orders;
  `;

  const createOrderPolicies = `
    CREATE POLICY "orders_select_authenticated" ON orders FOR SELECT TO authenticated USING (true);
    CREATE POLICY "orders_insert_authenticated" ON orders FOR INSERT TO authenticated WITH CHECK (true);
    CREATE POLICY "orders_update_authenticated" ON orders FOR UPDATE TO authenticated USING (true);
    CREATE POLICY "orders_delete_authenticated" ON orders FOR DELETE TO authenticated USING (true);
  `;

  try {
    await supabaseAdmin.rpc('exec', { query: dropOrderPolicies + createOrderPolicies });
    console.log('   ✅ Orders policies actualizadas');
  } catch (e) {
    console.log('   ⚠️  Error:', e.message);
  }

  // ============================================================================
  // 5. PENDING REGISTRATIONS - Solo INSERT anónimo
  // ============================================================================
  console.log('5. Configurando pending_registrations...');

  const dropPendingPolicies = `
    DROP POLICY IF EXISTS "Enable insert for anonymous users" ON pending_registrations;
    DROP POLICY IF EXISTS "Enable read for authenticated users" ON pending_registrations;
    DROP POLICY IF EXISTS "Enable update for authenticated users" ON pending_registrations;
    DROP POLICY IF EXISTS "Enable delete for authenticated users" ON pending_registrations;
  `;

  const createPendingPolicies = `
    CREATE POLICY "pending_reg_insert_anonymous" ON pending_registrations FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "pending_reg_select_authenticated" ON pending_registrations FOR SELECT TO authenticated USING (true);
    CREATE POLICY "pending_reg_update_authenticated" ON pending_registrations FOR UPDATE TO authenticated USING (true);
    CREATE POLICY "pending_reg_delete_authenticated" ON pending_registrations FOR DELETE TO authenticated USING (true);
  `;

  try {
    await supabaseAdmin.rpc('exec', { query: dropPendingPolicies + createPendingPolicies });
    console.log('   ✅ Pending registrations policies actualizadas');
  } catch (e) {
    console.log('   ⚠️  Error:', e.message);
  }

  // ============================================================================
  // 6. CREAR ÍNDICES
  // ============================================================================
  console.log('6. Creando índices...');

  const createIndexes = `
    CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
    CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
    CREATE INDEX IF NOT EXISTS idx_songs_category ON songs(category);
    CREATE INDEX IF NOT EXISTS idx_songs_key ON songs(key);
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  `;

  try {
    await supabaseAdmin.rpc('exec', { query: createIndexes });
    console.log('   ✅ Índices creados');
  } catch (e) {
    console.log('   ⚠️  Error:', e.message);
  }

  console.log('\n✅ Correcciones aplicadas. Ahora debes ejecutar FIX_SECURITY_VULNERABILITIES.sql manualmente en Supabase Dashboard.');
}

fixSecurityIssues().catch(console.error);
