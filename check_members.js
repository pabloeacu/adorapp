import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MDM5NywiZXhwIjoyMDkxNTM2Mzk3fQ.CCm4Rcjl8J5Zu1BamAbQosriTjd_RsEPH24mgpnj7Pc';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkMembers() {
  const { data, error } = await supabase
    .from('members')
    .select('id, name, email, role, active, user_id')
    .order('name');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('All Members:');
  console.table(data);
}

checkMembers();
