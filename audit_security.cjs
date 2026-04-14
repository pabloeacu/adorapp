/**
 * AUDITORÍA DE SEGURIDAD - FASE 3
 * SQL Injection, XSS, IDOR, Auth
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjAzOTcsImV4cCI6MjA5MTUzNjM5N30.5O0SQVIMqlzfw7rEgC9Sz_02i6p3BjXk9EfU_9x20tA';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function auditSecurity() {
  console.log('\n' + '='.repeat(80));
  console.log('🔐 AUDITORÍA DE SEGURIDAD - FASE 3');
  console.log('='.repeat(80));

  // ============================================================================
  // 1. SQL INJECTION - Supabase JS client uses parameterized queries
  // ============================================================================
  console.log('\n1. SQL INJECTION TEST');
  console.log('-'.repeat(40));

  // Test with malicious email
  const maliciousEmails = [
    "test' OR '1'='1",
    "test\"; DROP TABLE members; --",
    "test' UNION SELECT * FROM users--",
    "<script>alert('xss')</script>"
  ];

  for (const email of maliciousEmails) {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .ilike('email', `%${email}%`);

      if (error) {
        console.log(`   ✅ Bloqueado: ${email.substring(0, 20)}...`);
      } else {
        console.log(`   ⚠️  Posible SQLi: ${email.substring(0, 20)}... (${data?.length || 0} resultados)`);
      }
    } catch (e) {
      console.log(`   ✅ Error protegido: ${e.message}`);
    }
  }

  // ============================================================================
  // 2. XSS - Cross-Site Scripting
  // ============================================================================
  console.log('\n2. XSS TEST');
  console.log('-'.repeat(40));

  // Check if Supabase sanitizes input
  const xssPayloads = [
    '<script>alert(1)</script>',
    'javascript:alert(1)',
    '<img src=x onerror=alert(1)>',
    '{{constructor.constructor("alert(1)")()}}'
  ];

  console.log('   ℹ️  XSS depende de cómo React renderiza los datos');
  console.log('   ℹ️  Verificar que member.name se renderice con textContent, no dangerouslySetInnerHTML');

  // ============================================================================
  // 3. IDOR - Insecure Direct Object Reference
  // ============================================================================
  console.log('\n3. IDOR TEST');
  console.log('-'.repeat(40));

  // Try to access member by ID directly
  const testIds = [
    '00000000-0000-0000-0000-000000000001',
    'ae87b73d-369e-4f00-8ccc-c1e2b70ad4dd', // Ana Colina
    '91944386-43a6-4b31-92f4-6554c05b1cfa'  // Paul Acuña
  ];

  for (const id of testIds) {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.log(`   ✅ ID ${id.substring(0, 8)}...: Bloqueado`);
      } else {
        console.log(`   🚨 ID ${id.substring(0, 8)}...: ACCESO PERMITIDO (nombre: ${data?.name})`);
      }
    } catch (e) {
      console.log(`   ✅ Error: ${e.message}`);
    }
  }

  // ============================================================================
  // 4. RATE LIMITING
  // ============================================================================
  console.log('\n4. RATE LIMITING TEST');
  console.log('-'.repeat(40));

  // Make rapid requests to test rate limiting
  const requests = [];
  for (let i = 0; i < 10; i++) {
    requests.push(
      supabase.from('members').select('*').limit(1)
    );
  }

  const start = Date.now();
  const results = await Promise.all(requests);
  const duration = Date.now() - start;

  console.log(`   ℹ️  10 requests paralelas completadas en ${duration}ms`);
  if (results.every(r => !r.error)) {
    console.log('   ⚠️  No se detectó rate limiting en consultas');
  }

  // ============================================================================
  // 5. AUTHENTICATION SECURITY
  // ============================================================================
  console.log('\n5. AUTHENTICATION SECURITY');
  console.log('-'.repeat(40));

  // Test weak password
  console.log('   ℹ️  Verificar política de contraseñas en Supabase Auth');
  console.log('   ℹ️  Revisar configuración de rate limiting en Auth');

  // ============================================================================
  // 6. DATA EXPOSURE
  // ============================================================================
  console.log('\n6. DATA EXPOSURE TEST');
  console.log('-'.repeat(40));

  // Check if sensitive fields are exposed
  const { data: memberData } = await supabase
    .from('members')
    .select('*')
    .limit(1);

  if (memberData && memberData[0]) {
    const sensitiveFields = ['password_hash', 'password', 'secret', 'token'];
    const exposedFields = [];

    for (const field of sensitiveFields) {
      if (field in memberData[0] && memberData[0][field]) {
        exposedFields.push(field);
      }
    }

    if (exposedFields.length > 0) {
      console.log(`   🚨 CAMPOS SENSIBLES EXPUESTOS: ${exposedFields.join(', ')}`);
    } else {
      console.log('   ✅ No se detectaron campos sensibles directamente expuestos');
    }

    console.log(`   ℹ️  Campos disponibles: ${Object.keys(memberData[0]).join(', ')}`);
  }

  // ============================================================================
  // 7. CORS AND HEADERS
  // ============================================================================
  console.log('\n7. CORS CONFIGURATION');
  console.log('-'.repeat(40));
  console.log('   ℹ️  Supabase maneja CORS automáticamente');
  console.log('   ℹ️  Verificar headers de seguridad en producción');

  console.log('\n' + '='.repeat(80));
  console.log('FIN DE AUDITORÍA DE SEGURIDAD');
  console.log('='.repeat(80));
}

auditSecurity().catch(console.error);
