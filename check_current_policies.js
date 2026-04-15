/**
 * Check Current RLS Policies using Service Key via REST
 */

const SUPABASE_URL = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjAzOTcsImV4cCI6MjA5MTUzNjM5N30.5O0SQVIMqlzfw7rEgC9Sz_02i6p3BjXk9EfU_9x20tA';

async function checkTable(tableName) {
  console.log(`\n=== Checking ${tableName} ===`);
  
  // Try to select - should be blocked if RLS works
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=id&limit=1`, {
    method: 'GET',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    }
  });
  
  console.log(`Status: ${response.status}`);
  console.log(`Headers:`, Object.fromEntries(response.headers.entries()));
  
  const text = await response.text();
  console.log(`Response: ${text}`);
  
  return { status: response.status, body: text };
}

async function main() {
  console.log('=== Checking RLS Status (Anonymous Access Test) ===\n');
  console.log('If RLS is working: status should be 406 or body should be empty/error');
  console.log('If RLS is NOT working: status should be 200 and body contains data\n');
  
  const tables = ['members', 'bands', 'songs', 'orders', 'pending_registrations'];
  
  for (const table of tables) {
    await checkTable(table);
  }
  
  console.log('\n=== Summary ===');
  console.log('If all show status 200 with data = RLS BROKEN');
  console.log('If all show status 406 or error = RLS WORKING');
}

main().catch(console.error);
