const { Client } = require('/tmp/pg-test/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres:[PASSWORD]@db.gvsoexomzfaimagnaqzm.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function fixRLS() {
  console.log('Conectando a Supabase...');

  try {
    await client.connect();
    console.log('Conectado!');

    // Get RLS status
    const rlsStatus = await client.query(`
      SELECT tablename, rowsecurity, rowsecurityforced
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename IN ('members', 'bands', 'songs', 'orders')
    `);
    console.log('\nEstado RLS actual:');
    console.log(rlsStatus.rows);

    // Check existing policies
    const policies = await client.query(`
      SELECT policyname, cmd, roles
      FROM pg_policies
      WHERE schemaname = 'public'
      AND tablename = 'members'
    `);
    console.log('\nPolíticas en members:');
    console.log(policies.rows);

    await client.end();
    console.log('\nConexión cerrada');

  } catch (err) {
    console.error('Error:', err.message);
  }
}

fixRLS();