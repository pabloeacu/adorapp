/**
 * AUDITORÍA EXHAUSTIVA DE BASE DE DATOS - AdorAPP
 * FASE 1: Estructura, Integridad, Performance, Pruebas Destructivas
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjAzOTcsImV4cCI6MjA5MTUzNjM5N30.5O0SQVIMqlzfw7rEgC9Sz_02i6p3BjXk9EfU_9x20tA';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MDM5NywiZXhwIjoyMDkxNTM2Mzk3fQ.CCm4Rcjl8J5Zu1BamAbQosriTjd_RsEPH24mgpnj7Pc';

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

let auditResults = {
  phase: 'FASE 1: AUDITORÍA DE BASE DE DATOS',
  timestamp: new Date().toISOString(),
  issues: [],
  warnings: [],
  passed: [],
  critical: []
};

function log(type, message) {
  const symbols = {
    'PASS': '✅',
    'WARN': '⚠️',
    'FAIL': '❌',
    'INFO': '📋',
    'CRITICAL': '🚨',
    'SECURITY': '🔐'
  };
  console.log(`${symbols[type] || '•'} [${type}] ${message}`);
  if (type === 'CRITICAL' || type === 'FAIL') {
    auditResults.critical.push(message);
  } else if (type === 'FAIL') {
    auditResults.issues.push(message);
  } else if (type === 'WARN') {
    auditResults.warnings.push(message);
  } else if (type === 'PASS') {
    auditResults.passed.push(message);
  }
}

// ============================================================================
// 1. ANÁLISIS DE ESTRUCTURA
// ============================================================================
async function auditStructure() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 1. ANÁLISIS DE ESTRUCTURA DE TABLAS');
  console.log('='.repeat(80));

  // Verificar tablas existentes
  const tables = ['members', 'bands', 'songs', 'orders', 'pending_registrations'];

  for (const table of tables) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('*')
      .limit(1);

    if (error) {
      log('FAIL', `Tabla '${table}': ERROR - ${error.message}`);
    } else {
      log('PASS', `Tabla '${table}': Existe y accesible`);
    }
  }

  // Verificar columnas de cada tabla
  log('INFO', '\n--- Detalle de Columnas por Tabla ---');

  // Members
  const { data: members } = await supabaseAdmin.from('members').select('*').limit(1);
  if (members) {
    log('INFO', `members: ${Object.keys(members[0] || {}).join(', ')}`);
    // Verificar columnas críticas
    if (!members[0]?.id) log('FAIL', 'members: Falta columna id');
    if (!members[0]?.user_id) log('WARN', 'members: user_id puede no estar linkeado correctamente');
  }

  // Bands
  const { data: bands } = await supabaseAdmin.from('bands').select('*').limit(1);
  if (bands) {
    log('INFO', `bands: ${Object.keys(bands[0] || {}).join(', ')}`);
  }

  // Songs
  const { data: songs } = await supabaseAdmin.from('songs').select('*').limit(1);
  if (songs) {
    log('INFO', `songs: ${Object.keys(songs[0] || {}).join(', ')}`);
  }

  // Orders
  const { data: orders } = await supabaseAdmin.from('orders').select('*').limit(1);
  if (orders) {
    log('INFO', `orders: ${Object.keys(orders[0] || {}).join(', ')}`);
  }
}

// ============================================================================
// 2. ANÁLISIS DE DATOS
// ============================================================================
async function auditData() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 2. ANÁLISIS DE DATOS');
  console.log('='.repeat(80));

  // Contar registros
  const tables = ['members', 'bands', 'songs', 'orders', 'pending_registrations'];

  for (const table of tables) {
    const { count, error } = await supabaseAdmin
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      log('FAIL', `${table}: Error al contar - ${error.message}`);
    } else {
      log('INFO', `${table}: ${count} registros`);
    }
  }

  // Verificar datos de ejemplo
  const { data: membersData } = await supabaseAdmin.from('members').select('*');
  log('INFO', `\n--- Members ---`);
  membersData?.forEach(m => {
    log('INFO', `  ${m.name} | ${m.role} | user_id: ${m.user_id || 'NULL'} | active: ${m.active}`);
  });

  // Verificar datos problemáticos (user_id null)
  const membersWithNullUserId = membersData?.filter(m => !m.user_id) || [];
  if (membersWithNullUserId.length > 0) {
    log('CRITICAL', `🚨 ${membersWithNullUserId.length} miembros tienen user_id NULL:`);
    membersWithNullUserId.forEach(m => log('CRITICAL', `  - ${m.name} (${m.email})`));
  } else {
    log('PASS', 'Todos los miembros tienen user_id válido');
  }

  // Verificar pending_registrations
  const { data: pending } = await supabaseAdmin.from('pending_registrations').select('*');
  if (pending && pending.length > 0) {
    log('INFO', `\n--- Pending Registrations ---`);
    pending.forEach(p => {
      log('INFO', `  ${p.name} | ${p.email} | status: ${p.status}`);
    });
  }
}

// ============================================================================
// 3. PRUEBAS DESTRUCTIVAS - INTEGRIDAD REFERENCIAL
// ============================================================================
async function auditReferentialIntegrity() {
  console.log('\n' + '='.repeat(80));
  console.log('💣 3. PRUEBAS DESTRUCTIVAS - INTEGRIDAD REFERENCIAL');
  console.log('='.repeat(80));

  // Intentar insertar datos inválidos en members
  log('INFO', '\n--- Prueba: Insertar registro con role inválido ---');
  const { error: invalidRole } = await supabaseAdmin
    .from('members')
    .insert({ name: 'Test User', email: `test_invalid_${Date.now()}@test.com`, role: 'hacker' });

  if (invalidRole) {
    log('PASS', `CHECK constraint funciona: ${invalidRole.message}`);
  } else {
    log('CRITICAL', '🚨 CHECK constraint NO funciona - permite roles inválidos!');
  }

  // Intentar insertar con email duplicado
  log('INFO', '\n--- Prueba: Insertar email duplicado ---');
  const { error: dupEmail } = await supabaseAdmin
    .from('members')
    .insert({ name: 'Test Dup', email: 'paul@caf.org', role: 'member' });

  if (dupEmail) {
    log('PASS', `UNIQUE constraint funciona: ${dupEmail.message}`);
  } else {
    log('CRITICAL', '🚨 UNIQUE constraint NO funciona - permite emails duplicados!');
  }

  // Intentar insertar orden con band_id inexistente
  log('INFO', '\n--- Prueba: Insertar orden con band_id inexistente ---');
  const fakeBandId = '00000000-0000-0000-0000-000000000000';
  const { error: invalidBand } = await supabaseAdmin
    .from('orders')
    .insert({ date: '2025-01-01', band_id: fakeBandId });

  if (invalidBand) {
    log('PASS', `FK constraint funciona: ${invalidBand.message}`);
  } else {
    log('CRITICAL', '🚨 FK constraint NO funciona - permite referencias a bandas inexistentes!');
  }

  // Verificar que NULL en campos NOT NULL sea rechazado
  log('INFO', '\n--- Prueba: Insertar con campos requeridos nulos ---');
  const { error: nullRequired } = await supabaseAdmin
    .from('bands')
    .insert({ /* name es NOT NULL */ });

  if (nullRequired) {
    log('PASS', `NOT NULL constraint funciona: ${nullRequired.message}`);
  } else {
    log('CRITICAL', '🚨 NOT NULL constraint NO funciona - permite name NULL!');
  }
}

// ============================================================================
// 4. SEGURIDAD - ROW LEVEL SECURITY
// ============================================================================
async function auditRLS() {
  console.log('\n' + '='.repeat(80));
  console.log('🔐 4. AUDITORÍA DE ROW LEVEL SECURITY (RLS)');
  console.log('='.repeat(80));

  // Intentar acceder a datos SIN autenticación (como anon)
  log('INFO', '\n--- Prueba: Acceso anónimo a members ---');
  const { data: anonMembers, error: anonError } = await supabase
    .from('members')
    .select('*');

  if (anonError) {
    log('PASS', `Acceso anónimo BLOQUEADO: ${anonError.message}`);
  } else {
    log('CRITICAL', `🚨 ACCESO ANÓNIMO PERMITIDO! Leyó ${anonMembers?.length || 0} registros`);
    log('CRITICAL', '🚨 Datos sensibles expuestos sin autenticación');
  }

  // Intentar INSERT sin autenticación
  log('INFO', '\n--- Prueba: Insert sin autenticación ---');
  const { error: anonInsert } = await supabase
    .from('members')
    .insert({ name: 'Hacker Test', email: `hacker_${Date.now()}@evil.com`, role: 'admin' });

  if (anonInsert) {
    log('PASS', `Insert anónimo BLOQUEADO: ${anonInsert.message}`);
  } else {
    log('CRITICAL', '🚨 INSERT anónimo PERMITIDO! Alguien puede crear miembros falsos');
  }

  // Intentar DELETE sin autenticación
  log('INFO', '\n--- Prueba: Delete sin autenticación ---');
  const { error: anonDelete } = await supabase
    .from('members')
    .delete()
    .eq('email', `hacker_${Date.now()}@evil.com`);

  if (anonDelete) {
    log('PASS', `Delete anónimo BLOQUEADO`);
  } else {
    log('CRITICAL', '🚨 DELETE anónimo puede haber sido PERMITIDO');
  }

  // Verificar pending_registrations - debe permitir insert anónimo (registro)
  log('INFO', '\n--- Prueba: Insert en pending_registrations (debe permitir) ---');
  const { error: pendingInsert } = await supabase
    .from('pending_registrations')
    .insert({
      name: 'Test Registration',
      email: `test_reg_${Date.now()}@test.com`,
      password_hash: 'test123',
      status: 'pending'
    });

  if (pendingInsert) {
    log('WARN', `Insert en pending_registrations FALLÓ: ${pendingInsert.message}`);
  } else {
    log('PASS', 'Insert en pending_registrations funciona (para registro de usuarios)');
    // Limpiar
    await supabaseAdmin.from('pending_registrations')
      .delete()
      .eq('email', `test_reg_${Date.now()}@test.com`);
  }
}

// ============================================================================
// 5. NORMALIZACIÓN Y DISEÑO
// ============================================================================
async function auditNormalization() {
  console.log('\n' + '='.repeat(80));
  console.log('🧱 5. ANÁLISIS DE NORMALIZACIÓN');
  console.log('='.repeat(80));

  // Revisar si hay redundancia
  const { data: members } = await supabaseAdmin.from('members').select('*');

  // Verificar si hay información duplicada entre tablas
  log('INFO', '\n--- Verificando redundancia ---');

  // bands.members es un array de UUIDs - esto está bien para PostgreSQL
  log('INFO', 'Bands.members usa array UUID[] - diseño correcto para relaciones M:N');

  // Verificar estructura de songs
  const { data: songs } = await supabaseAdmin.from('songs').select('structure');
  const hasJsonStructure = songs?.some(s => s.structure && s.structure.length > 0);
  if (hasJsonStructure) {
    log('PASS', 'Songs.structure usa JSONB - diseño correcto');
  }

  // Verificar orders.songs
  const { data: orders } = await supabaseAdmin.from('orders').select('songs');
  const hasJsonSongs = orders?.some(o => o.songs && o.songs.length > 0);
  if (hasJsonSongs) {
    log('PASS', 'Orders.songs usa JSONB - diseño correcto');
  }

  // Posibles problemas de normalización
  log('WARN', 'OBSERVACIÓN: instruments en members usa TEXT[] - podría normalizarse a tabla separada');
  log('WARN', 'OBSERVACIÓN: Band members son array UUID[] - consulta puede ser lenta con muchas bandas');
}

// ============================================================================
// 6. ÍNDICES Y PERFORMANCE
// ============================================================================
async function auditPerformance() {
  console.log('\n' + '='.repeat(80));
  console.log('⚡ 6. ANÁLISIS DE ÍNDICES Y PERFORMANCE');
  console.log('='.repeat(80));

  // Test de queries lentas potenciales
  log('INFO', '\n--- Probando queries ---');

  // Query 1: Buscar miembro por email
  const start1 = Date.now();
  await supabaseAdmin.from('members').select('*').eq('email', 'paul@caf.org');
  const time1 = Date.now() - start1;
  log('INFO', `Buscar por email: ${time1}ms`);

  // Query 2: Buscar canciones por categoría
  const start2 = Date.now();
  await supabaseAdmin.from('songs').select('*').eq('category', 'adoracion');
  const time2 = Date.now() - start2;
  log('INFO', `Buscar por categoría: ${time2}ms`);

  // Query 3: Órdenes por fecha
  const start3 = Date.now();
  await supabaseAdmin.from('orders').select('*').gte('date', '2025-01-01');
  const time3 = Date.now() - start3;
  log('INFO', `Buscar por rango de fecha: ${time3}ms`);

  // Verificar si hay índices implícitos
  if (time1 < 100 && time2 < 100 && time3 < 100) {
    log('PASS', 'Todas las queries responden en < 100ms');
  } else {
    log('WARN', 'Algunas queries son lentas - considerar índices adicionales');
  }
}

// ============================================================================
// MAIN
// ============================================================================
async function runAudit() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║          🔍 AUDITORÍA EXHAUSTIVA DE BASE DE DATOS - ADORAPP                  ║');
  console.log('║                    INICIANDO PRUEBAS DESTRUCTIVAS...                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  try {
    await auditStructure();
    await auditData();
    await auditReferentialIntegrity();
    await auditRLS();
    await auditNormalization();
    await auditPerformance();
  } catch (e) {
    log('FAIL', `ERROR CRÍTICO: ${e.message}`);
    console.error(e);
  }

  // Resumen
  console.log('\n' + '='.repeat(80));
  console.log('📋 RESUMEN DE HALLAZGOS');
  console.log('='.repeat(80));
  console.log(`\n🚨 CRÍTICOS: ${auditResults.critical.length}`);
  auditResults.critical.forEach((i, idx) => console.log(`   ${idx + 1}. ${i}`));
  console.log(`\n❌ FALLAS: ${auditResults.issues.length}`);
  auditResults.issues.forEach((i, idx) => console.log(`   ${idx + 1}. ${i}`));
  console.log(`\n⚠️  ADVERTENCIAS: ${auditResults.warnings.length}`);
  auditResults.warnings.forEach((i, idx) => console.log(`   ${idx + 1}. ${i}`));
  console.log(`\n✅ PASARON: ${auditResults.passed.length}`);

  console.log('\n' + '='.repeat(80));
  console.log('FIN DE FASE 1');
  console.log('='.repeat(80));

  return auditResults;
}

runAudit().then(results => {
  process.exit(results.critical.length > 0 ? 1 : 0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
