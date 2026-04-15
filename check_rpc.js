/**
 * Check available RPC functions
 */

const SUPABASE_URL = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MDM5NywiZXhwIjoyMDkxNTM2Mzk3fQ.CCm4Rcjl8J5Zu1BamAbQosriTjd_RsEPH24mgpnj7Pc';

async function main() {
  console.log('=== Checking RPC Functions ===\n');
  
  // Try to call exec function
  console.log('1. Trying to call "exec" function...');
  const execResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({ query: 'SELECT 1 as test' })
  });
  const execText = await execResponse.text();
  console.log(`exec Status: ${execResponse.status}`);
  console.log(`exec Response: ${execText}`);
  
  // Try pg_terminate_backend if it exists
  console.log('\n2. Trying pg_terminate_backend...');
  const termResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pg_terminate_backend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({ pid: 12345 })
  });
  const termText = await termResponse.text();
  console.log(`pg_terminate_backend Status: ${termResponse.status}`);
  console.log(`pg_terminate_backend Response: ${termText}`);
  
  // Check what's available in rpc
  console.log('\n3. Checking OpenAPI spec for RPC functions...');
  const specResponse = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'GET',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  });
  const specText = await specResponse.text();
  
  // Parse for RPC endpoints
  const rpcMatches = specText.match(/"\/rpc\/[^"]+"/g);
  console.log('Found RPC endpoints:');
  if (rpcMatches) {
    rpcMatches.forEach(m => console.log('  ' + m));
  } else {
    console.log('  No RPC endpoints found in OpenAPI spec');
  }
}

main().catch(console.error);
