/**
 * VERIFICAR QUE LAS CORRECCIONES DE RLS FUNCIONAN
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjAzOTcsImV4cCI6MjA5MTUzNjM5N30.5O0SQVIMqlzfw7rEgC9Sz_02i6p3BjXk9EfU_9x20tA';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifyRLS() {
  console.log('\n🔍 VERIFICACIÓN DE RLS DESPUÉS DE CORRECCIÓN\n');
  console.log('Probando acceso ANÓNIMO (sin login)...\n');

  // Test 1: Intentar SELECT en members
  console.log('1. SELECT en members (debe ser BLOQUEADO):');
  const { data: members, error: membersErr } = await supabase
    .from('members')
    .select('*')
    .limit(3);

  if (membersErr) {
    console.log('   ✅ BLOQUEADO - ' + membersErr.message);
  } else {
    console.log('   ❌ PERMITIDO - ' + (members?.length || 0) + ' registros leídos');
    console.log('   ⚠️  Datos: ' + JSON.stringify(members));
  }

  // Test 2: Intentar SELECT en bands
  console.log('\n2. SELECT en bands (debe ser BLOQUEADO):');
  const { data: bands, error: bandsErr } = await supabase
    .from('bands')
    .select('*')
    .limit(3);

  if (bandsErr) {
    console.log('   ✅ BLOQUEADO - ' + bandsErr.message);
  } else {
    console.log('   ❌ PERMITIDO - ' + (bands?.length || 0) + ' registros leídos');
  }

  // Test 3: Intentar SELECT en songs
  console.log('\n3. SELECT en songs (debe ser BLOQUEADO):');
  const { data: songs, error: songsErr } = await supabase
    .from('songs')
    .select('*')
    .limit(3);

  if (songsErr) {
    console.log('   ✅ BLOQUEADO - ' + songsErr.message);
  } else {
    console.log('   ❌ PERMITIDO - ' + (songs?.length || 0) + ' registros leídos');
  }

  // Test 4: Intentar SELECT en orders
  console.log('\n4. SELECT en orders (debe ser BLOQUEADO):');
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('*')
    .limit(3);

  if (ordersErr) {
    console.log('   ✅ BLOQUEADO - ' + ordersErr.message);
  } else {
    console.log('   ❌ PERMITIDO - ' + (orders?.length || 0) + ' registros leídos');
  }

  // Test 5: INSERT en pending_registrations (DEBE funcionar)
  console.log('\n5. INSERT en pending_registrations (debe funcionar):');
  const testEmail = `verify_test_${Date.now()}@test.com`;
  const { error: pendingErr } = await supabase
    .from('pending_registrations')
    .insert({
      name: 'Verification Test',
      email: testEmail,
      password_hash: 'test123',
      status: 'pending'
    });

  if (pendingErr) {
    console.log('   ❌ FALLO - ' + pendingErr.message);
  } else {
    console.log('   ✅ PERMITIDO - Registro de usuario funciona');
    // Limpiar
    await supabase.from('pending_registrations').delete().eq('email', testEmail);
  }

  console.log('\n' + '='.repeat(60));
  console.log('RESULTADO DE VERIFICACIÓN');
  console.log('='.repeat(60));
}

verifyRLS().catch(console.error);
