const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MDM5NywiZXhwIjoyMDkxNTM2Mzk3fQ.CCm4Rcjl8J5Zu1BamAbQosriTjd_RsEPH24mgpnj7Pc';

async function updateDatabase() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('🔄 Updating database schema...');
  
  // Try to update a record with new columns - will fail if columns don't exist
  const { error: updateError } = await supabase
    .from('members')
    .update({ 
      pastor_area: 'Test Pastor',
      leader_of: 'Test Leader',
      birthdate: '2000-01-01'
    })
    .eq('active', true)
    .limit(1);
  
  if (updateError) {
    console.log('❌ Error:', updateError.message);
    console.log('');
    console.log('📋 Las columnas nuevas necesitan ser agregadas manualmente en Supabase.');
    console.log('');
    console.log('Pasos:');
    console.log('1. Ve a: https://supabase.com/dashboard/project/gvsoexomzfaimagnaqzm');
    console.log('2. SQL Editor > New Query');
    console.log('3. Ejecuta este SQL:');
    console.log('');
    console.log('ALTER TABLE members ADD COLUMN IF NOT EXISTS pastor_area TEXT;');
    console.log('ALTER TABLE members ADD COLUMN IF NOT EXISTS leader_of TEXT;');
    console.log('ALTER TABLE members ADD COLUMN IF NOT EXISTS birthdate DATE;');
    return;
  }
  
  console.log('✅ Database schema updated successfully!');
  
  // Verify
  const { data, error } = await supabase
    .from('members')
    .select('id,name,pastor_area,leader_of,birthdate')
    .limit(1);
  
  if (error) {
    console.log('❌ Verification failed:', error.message);
  } else {
    console.log('✅ Verificación exitosa!');
    console.log('Datos de ejemplo:', JSON.stringify(data, null, 2));
  }
}

updateDatabase();
