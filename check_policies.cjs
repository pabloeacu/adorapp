const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MDM5NywiZXhwIjoyMDkxNTM2Mzk3fQ.CCm4Rcjl8J5Zu1BamAbQosriTjd_RsEPH24mgpnj7Pc';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkPolicies() {
  console.log('\n📋 CONSULTANDO POLÍTICAS RLS ACTUALES\n');

  // Query to check RLS policies
  const { data, error } = await supabase.rpc('pg_catalog', {
    query: `
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname;
    `
  }).select();

  console.log('Políticas encontradas:', data?.length || 0);
  console.log('Error:', error?.message || 'Ninguno');

  // Alternative: check via direct query
  console.log('\n--- Verificando tablas ---');
  const tables = ['members', 'bands', 'songs', 'orders', 'pending_registrations'];

  for (const table of tables) {
    const { count, error: countErr } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    console.log(`${table}: ${count} registros, error: ${countErr?.message || 'ninguno'}`);
  }
}

checkPolicies().catch(console.error);
