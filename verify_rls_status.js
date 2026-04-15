/**
 * Verify RLS Status - Check current policies via API
 */

const SUPABASE_URL = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjAzOTcsImV4cCI6MjA5MTUzNjM5N30.5O0SQVIMqlzfw7rEgC9Sz_02i6p3BjXk9EfU_9x20tA';

async function testAnonymousAccess() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           RLS SECURITY VERIFICATION TEST                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  console.log('Testing if anonymous users can access data...\n');
  
  // Test 1: Try to read members table (should be blocked if RLS works)
  console.log('TEST 1: Reading members table (SELECT)...');
  const membersRes = await fetch(`${SUPABASE_URL}/rest/v1/members?select=id,email&limit=1`, {
    method: 'GET',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    }
  });
  
  const membersText = await membersRes.text();
  const membersBlocked = membersRes.status === 406 || membersText.includes('PGRST116') || membersText.includes('permission denied');
  
  console.log(`  Status: ${membersRes.status}`);
  console.log(`  Response: ${membersText.substring(0, 100)}`);
  console.log(`  Result: ${membersBlocked ? '✅ BLOCKED (RLS Working)' : '❌ ALLOWED (RLS BROKEN)'}\n`);
  
  // Test 2: Try to insert (should be blocked)
  console.log('TEST 2: Inserting into members table (INSERT)...');
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/members`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      id: 'test-id-12345',
      email: 'hacker@evil.com',
      name: 'Hacker Test'
    })
  });
  
  const insertText = await insertRes.text();
  const insertBlocked = insertRes.status === 406 || insertRes.status === 400 || insertText.includes('permission denied');
  
  console.log(`  Status: ${insertRes.status}`);
  console.log(`  Response: ${insertText.substring(0, 100)}`);
  console.log(`  Result: ${insertBlocked ? '✅ BLOCKED (RLS Working)' : '❌ ALLOWED (RLS BROKEN)'}\n`);
  
  // Test 3: Check pending_registrations INSERT (should be ALLOWED for anonymous)
  console.log('TEST 3: Inserting into pending_registrations (should be ALLOWED)...');
  const pendingRes = await fetch(`${SUPABASE_URL}/rest/v1/pending_registrations`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      id: 'test-pending-12345',
      email: 'test@test.com',
      name: 'Test User',
      token: 'abc123'
    })
  });
  
  const pendingText = await pendingRes.text();
  const pendingAllowed = pendingRes.status === 201 || pendingRes.status === 200 || pendingRes.status === 204;
  
  console.log(`  Status: ${pendingRes.status}`);
  console.log(`  Response: ${pendingText.substring(0, 100)}`);
  console.log(`  Result: ${pendingAllowed ? '✅ ALLOWED (Correct for registration)' : '❌ BLOCKED (Should allow anonymous INSERT)'}\n`);
  
  // Summary
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    VERIFICATION SUMMARY                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  if (!membersBlocked && !insertBlocked) {
    console.log('\n🚨 CRITICAL: RLS IS NOT WORKING!');
    console.log('   Anonymous users can access all data!');
    console.log('\n⚠️  IMMEDIATE ACTION REQUIRED:');
    console.log('   Run the SQL fix in Supabase Dashboard SQL Editor');
  } else if (membersBlocked) {
    console.log('\n✅ RLS IS WORKING!');
    console.log('   Anonymous access is properly blocked.');
  } else {
    console.log('\n⚠️  PARTIAL RLS: Only SELECT is blocked but INSERT is allowed.');
  }
}

testAnonymousAccess().catch(console.error);
