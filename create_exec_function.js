/**
 * Create exec function using Service Key with superuser privileges
 */

const SUPABASE_URL = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MDM5NywiZXhwIjoyMDkxNTM2Mzk3fQ.CCm4Rcjl8J5Zu1BamAbQosriTjd_RsEPH24mgpnj7Pc';

// First, create the exec function by calling it - it will fail but might work
async function tryCreateExec() {
  console.log('=== Creating exec Function ===\n');
  
  // Try to call exec - if it doesn't exist, we'll need a different approach
  console.log('1. Testing if exec exists...');
  const testResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({ query: 'SELECT 1' })
  });
  
  console.log(`Status: ${testResponse.status}`);
  const text = await testResponse.text();
  console.log(`Response: ${text}`);
  
  // Parse error to see if function doesn't exist
  if (text.includes('PGRST202') || text.includes('not found')) {
    console.log('\n❌ Function does not exist - need to create it');
    console.log('\n📋 SOLUTION: Please run this SQL in Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/gvsoexomzfaimagnaqzm/sql/new');
    
    const createSQL = `
-- Create exec function for running arbitrary SQL
CREATE OR REPLACE FUNCTION exec(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE query;
END;
$$;
`;
    console.log('\n--- COPY THIS SQL ---');
    console.log(createSQL);
    console.log('--- END COPY ---\n');
    
    return false;
  }
  
  return true;
}

tryCreateExec().then(exists => {
  if (exists) {
    console.log('\n✅ exec function exists!');
  }
}).catch(console.error);
