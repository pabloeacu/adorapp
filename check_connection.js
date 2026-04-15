import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function checkPostgresAccess() {
  console.log('=== Checking PostgreSQL Direct Access ===\n');
  
  // Check if psql is available
  try {
    const { stdout } = await execAsync('which psql');
    console.log('psql found at:', stdout.trim());
  } catch {
    console.log('psql not found');
  }
  
  // Check environment for any postgres connection info
  console.log('\nChecking environment variables...');
  const envVars = ['DATABASE_URL', 'POSTGRES_PASSWORD', 'PGPASSWORD', 'SUPABASE_DB_PASSWORD'];
  for (const v of envVars) {
    if (process.env[v]) {
      console.log(`${v} is set`);
    }
  }
  
  // Check for .env file
  try {
    const fs = await import('fs');
    if (fs.existsSync('.env')) {
      console.log('\n.env file exists');
      const content = fs.readFileSync('.env', 'utf8');
      if (content.includes('DATABASE_URL') || content.includes('POSTGRES')) {
        console.log('.env contains database references');
      }
    }
  } catch {}
}

checkPostgresAccess();
