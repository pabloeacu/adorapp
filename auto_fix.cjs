/**
 * AUTO RLS FIX - Executing SQL via Supabase API
 */

const fetch = require('node-fetch');

const supabaseUrl = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MDM5NywiZXhwIjoyMDkxNTM2Mzk3fQ.CCm4Rcjl8J5Zu1BamAbQosriTjd_RsEPH24mgpnj7Pc';

async function executeSQL(sql) {
  console.log('Executing SQL...');

  const response = await fetch(supabaseUrl + '/rest/v1/rpc/exec', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': 'Bearer ' + serviceKey
    },
    body: JSON.stringify({ query: sql })
  });

  const text = await response.text();
  console.log('Status:', response.status);
  console.log('Response:', text);
  return { status: response.status, text };
}

async function checkRLS() {
  // Test with anon key - should return empty if RLS works
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjAzOTcsImV4cCI6MjA5MTUzNjM5N30.5O0SQVIMqlzfw7rEgC9Sz_02i6p3BjXk9EfU_9x20tA';

  const response = await fetch(
    supabaseUrl + '/rest/v1/members?select=id&limit=1',
    {
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey
      }
    }
  );

  const text = await response.text();
  console.log('RLS Check - Status:', response.status);
  console.log('RLS Check - Response:', text);

  if (response.status === 200 && text.includes('id')) {
    console.log('RLS NOT WORKING - Anonymous can access data');
    return false;
  } else {
    console.log('RLS WORKING - Anonymous blocked');
    return true;
  }
}

async function main() {
  console.log('=== AUTO RLS FIX ===\n');

  // First check current status
  await checkRLS();
}

main().catch(console.error);