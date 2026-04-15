/**
 * Diagnose RLS State - Using Service Key to see true state
 */

const SUPABASE_URL = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MDM5NywiZXhwIjoyMDkxNTM2Mzk3fQ.CCm4Rcjl8J5Zu1BamAbQosriTjd_RsEPH24mgpnj7Pc';

async function query(sql) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pg_parse_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({ 
      p_sql: sql 
    })
  });
  
  const text = await response.text();
  console.log(`Status: ${response.status}`);
  console.log(`Response: ${text.substring(0, 500)}`);
  return { status: response.status, text };
}

async function diagnose() {
  console.log('=== Diagnosing RLS State ===\n');
  
  // Check if there's a function to run arbitrary SQL
  console.log('1. Testing RPC endpoint...');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'GET',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  });
  console.log(`API Status: ${response.status}`);
  const apiText = await response.text();
  console.log(`API Info: ${apiText.substring(0, 500)}`);
  
  // Check if we can query pg_* tables directly
  console.log('\n2. Trying direct pg_* query...');
  try {
    const pgResponse = await fetch(`${SUPABASE_URL}/rest/v1/pg_tables?select=*&schema=eq.public`, {
      method: 'GET',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      }
    });
    console.log(`pg_tables Status: ${pgResponse.status}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
  
  console.log('\n3. Checking if service key can see all data...');
  const dataResponse = await fetch(`${SUPABASE_URL}/rest/v1/members?select=id,email&limit=1`, {
    method: 'GET',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  });
  const dataText = await dataResponse.text();
  console.log(`Service Key Access: ${dataText}`);
}

diagnose().catch(console.error);
