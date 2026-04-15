/**
 * DIAGNOSTIC COMPLETO DE RLS
 * Usamos service role para ver el estado real de la base de datos
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MDM5NywiZXhwIjoyMDkxNTM2Mzk3fQ.CCm4Rcjl8J5Zu1BamAbQosriTjd_RsEPH24mgpnj7Pc';

const supabaseService = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function diagnoseRLS() {
  console.log('=== DIAGNOSTICO COMPLETO DE RLS ===\n');

  // 1. Verificar si RLS está habilitado en las tablas
  console.log('1. Verificando estado de RLS en tablas:');

  const tables = ['members', 'bands', 'songs', 'orders', 'pending_registrations'];

  for (const table of tables) {
    // Verificar si existe alguna policy
    const { data: policies } = await supabaseService.rpc('pg_catalog', {
      query: `
        SELECT policyname, cmd, roles::text as roles
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = '${table}'
        ORDER BY policyname;
      `
    }).select();

    console.log(`   ${table}: ${policies?.length || 0} policies`);
  }

  // 2. Verificar RLS status directamente
  console.log('\n2. Verificando RLS status:');

  const { data: rlsStatus } = await supabaseService.rpc('pg_catalog', {
    query: `
      SELECT
        t.tablename,
        t.rowsecurity as rls_enabled,
        t.rowsecurityforced as rls_forced
      FROM pg_tables t
      WHERE t.schemaname = 'public'
      AND t.tablename IN ('members', 'bands', 'songs', 'orders', 'pending_registrations')
      ORDER BY t.tablename;
    `
  }).select();

  console.log('   RLS Status:', JSON.stringify(rlsStatus, null, 2));

  // 3. Test de acceso anónimo (debería estar bloqueado si RLS funciona)
  console.log('\n3. Test de acceso anónimo:');

  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjAzOTcsImV4cCI6MjA5MTUzNjM5N30.5O0SQVIMqlzfw7rEgC9Sz_02i6p3BjXk9EfU_9x20tA';
  const supabaseAnon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: anonData, error: anonError } = await supabaseAnon
    .from('members')
    .select('id, email')
    .limit(1);

  console.log('   Acceso anónimo:', anonError ? 'BLOQUEADO (' + anonError.message + ')' : 'PERMITIDO (' + anonData?.length + ' registros)');

  // 4. Verificar todas las políticas existentes
  console.log('\n4. Listando TODAS las políticas:');

  const { data: allPolicies } = await supabaseService.rpc('pg_catalog', {
    query: `
      SELECT
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname;
    `
  }).select();

  console.log('   Total policies:', allPolicies?.length || 0);
  if (allPolicies) {
    allPolicies.forEach(p => {
      console.log(`   - ${p.tablename}.${p.policyname}: cmd=${p.cmd}, roles=${p.roles}`);
    });
  }

  // 5. Verificar si existe el rol 'authenticated'
  console.log('\n5. Verificando roles en PostgreSQL:');

  const { data: roles } = await supabaseService.rpc('pg_catalog', {
    query: `SELECT rolname, rolsuper, rolinherit, rolcreaterole FROM pg_roles WHERE rolname IN ('authenticated', 'anon', 'authenticated');`
  }).select();

  console.log('   Roles:', JSON.stringify(roles, null, 2));

  console.log('\n=== FIN DIAGNOSTICO ===');
}

diagnoseRLS().catch(console.error);