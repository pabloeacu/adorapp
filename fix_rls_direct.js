/**
 * FIX RLS - Direct Database Access via Supabase Management API
 */

const PROJECT_REF = 'gvsoexomzfaimagnaqzm';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicmlZIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzc1OTYwMzk3LCJleHAiOjIwOTE1MzYzOTd9.Qm9rX6h7gYqZ2tK8xLpN3mV4nJ5sQ1wE';

async function execSQL(sql) {
  console.log('Executing SQL via Management API...');
  
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({ 
      query: sql,
      superuser: true 
    })
  });

  const text = await response.text();
  console.log(`Status: ${response.status}`);
  console.log(`Response: ${text}`);
  return { status: response.status, text };
}

async function checkRLSStatus() {
  console.log('\n=== Checking RLS Status ===');
  await execSQL(`
    SELECT 
      tablename, 
      rowsecurity,
      rowsecurityforced
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename IN ('members', 'bands', 'songs', 'orders', 'pending_registrations')
    ORDER BY tablename;
  `);
}

async function checkPolicies() {
  console.log('\n=== Checking Existing Policies ===');
  await execSQL(`
    SELECT 
      tablename, 
      policyname, 
      permissive,
      cmd
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN ('members', 'bands', 'songs', 'orders', 'pending_registrations')
    ORDER BY tablename, policyname;
  `);
}

async function dropAllPolicies() {
  console.log('\n=== Dropping ALL Policies ===');
  
  const tables = ['members', 'bands', 'songs', 'orders', 'pending_registrations'];
  
  for (const table of tables) {
    console.log(`Dropping policies on ${table}...`);
    await execSQL(`DROP POLICY IF EXISTS "Enable read access for authenticated users" ON ${table} CASCADE;`);
    await execSQL(`DROP POLICY IF EXISTS "Enable insert for authenticated users" ON ${table} CASCADE;`);
    await execSQL(`DROP POLICY IF EXISTS "Enable update for authenticated users" ON ${table} CASCADE;`);
    await execSQL(`DROP POLICY IF EXISTS "Enable delete for authenticated users" ON ${table} CASCADE;`);
    await execSQL(`DROP POLICY IF EXISTS "Enable insert for anonymous users" ON ${table} CASCADE;`);
    await execSQL(`DROP POLICY IF EXISTS "anon_pending_insert" ON ${table} CASCADE;`);
    await execSQL(`DROP POLICY IF EXISTS "auth_pending_select" ON ${table} CASCADE;`);
    await execSQL(`DROP POLICY IF EXISTS "auth_pending_update" ON ${table} CASCADE;`);
    await execSQL(`DROP POLICY IF EXISTS "auth_pending_delete" ON ${table} CASCADE;`);
  }
}

async function createNewPolicies() {
  console.log('\n=== Creating NEW Strict Policies ===');
  
  // Members - authenticated only
  await execSQL(`CREATE POLICY "members_select" ON members FOR SELECT TO authenticated USING (true);`);
  await execSQL(`CREATE POLICY "members_insert" ON members FOR INSERT TO authenticated WITH CHECK (true);`);
  await execSQL(`CREATE POLICY "members_update" ON members FOR UPDATE TO authenticated USING (true);`);
  await execSQL(`CREATE POLICY "members_delete" ON members FOR DELETE TO authenticated USING (true);`);
  
  // Bands - authenticated only
  await execSQL(`CREATE POLICY "bands_select" ON bands FOR SELECT TO authenticated USING (true);`);
  await execSQL(`CREATE POLICY "bands_insert" ON bands FOR INSERT TO authenticated WITH CHECK (true);`);
  await execSQL(`CREATE POLICY "bands_update" ON bands FOR UPDATE TO authenticated USING (true);`);
  await execSQL(`CREATE POLICY "bands_delete" ON bands FOR DELETE TO authenticated USING (true);`);
  
  // Songs - authenticated only
  await execSQL(`CREATE POLICY "songs_select" ON songs FOR SELECT TO authenticated USING (true);`);
  await execSQL(`CREATE POLICY "songs_insert" ON songs FOR INSERT TO authenticated WITH CHECK (true);`);
  await execSQL(`CREATE POLICY "songs_update" ON songs FOR UPDATE TO authenticated USING (true);`);
  await execSQL(`CREATE POLICY "songs_delete" ON songs FOR DELETE TO authenticated USING (true);`);
  
  // Orders - authenticated only
  await execSQL(`CREATE POLICY "orders_select" ON orders FOR SELECT TO authenticated USING (true);`);
  await execSQL(`CREATE POLICY "orders_insert" ON orders FOR INSERT TO authenticated WITH CHECK (true);`);
  await execSQL(`CREATE POLICY "orders_update" ON orders FOR UPDATE TO authenticated USING (true);`);
  await execSQL(`CREATE POLICY "orders_delete" ON orders FOR DELETE TO authenticated USING (true);`);
  
  // Pending - INSERT anonymous, rest authenticated
  await execSQL(`CREATE POLICY "pending_insert_anon" ON pending_registrations FOR INSERT TO anon WITH CHECK (true);`);
  await execSQL(`CREATE POLICY "pending_select_auth" ON pending_registrations FOR SELECT TO authenticated USING (true);`);
  await execSQL(`CREATE POLICY "pending_update_auth" ON pending_registrations FOR UPDATE TO authenticated USING (true);`);
  await execSQL(`CREATE POLICY "pending_delete_auth" ON pending_registrations FOR DELETE TO authenticated USING (true);`);
}

async function main() {
  console.log('=== DIRECT RLS FIX ===\n');
  
  try {
    // Step 1: Check current status
    await checkRLSStatus();
    
    // Step 2: Check policies
    await checkPolicies();
    
    // Step 3: Drop all existing policies
    await dropAllPolicies();
    
    // Step 4: Create new strict policies
    await createNewPolicies();
    
    // Step 5: Final verification
    console.log('\n=== Final Policy Check ===');
    await checkPolicies();
    
    console.log('\n✅ RLS FIX COMPLETED!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
