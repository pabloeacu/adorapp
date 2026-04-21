import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gvsoexomzfaimagnaqzm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjAzOTcsImV4cCI6MjA5MTUzNjM5N30.5O0SQVIMqlzfw7rEgC9Sz_02i6p3BjXk9EfU_9x20tA';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MDM5NywiZXhwIjoyMDkxNTM2Mzk3fQ.CCm4Rcjl8J5Zu1BamAbQosriTjd_RsEPH24mgpnj7Pc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Database schema SQL to run in Supabase Dashboard > SQL Editor
export const databaseSchema = `
-- Members table
CREATE TABLE IF NOT EXISTS members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  role TEXT DEFAULT 'member' CHECK (role IN ('pastor', 'leader', 'member')),
  instruments TEXT[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pending Registrations table
CREATE TABLE IF NOT EXISTS pending_registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  birthdate DATE,
  pastor_area TEXT,
  leader_of TEXT,
  instruments TEXT[] DEFAULT '{}',
  password_hash TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  assigned_role TEXT CHECK (assigned_role IN ('pastor', 'leader', 'member')),
  approved_by UUID REFERENCES members(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_by UUID REFERENCES members(id),
  rejected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bands table
CREATE TABLE IF NOT EXISTS bands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  meeting_type TEXT DEFAULT 'culto_general',
  meeting_day TEXT,
  meeting_time TEXT DEFAULT '20:00',
  members UUID[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Songs table
CREATE TABLE IF NOT EXISTS songs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT,
  original_key TEXT DEFAULT 'C',
  key TEXT DEFAULT 'C',
  category TEXT DEFAULT 'adoracion',
  categories TEXT[] DEFAULT ARRAY['adoracion'],
  youtube_url TEXT,
  structure JSONB DEFAULT '[]',
  compass TEXT,
  bpm INTEGER,
  last_used DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  time TEXT DEFAULT '20:00',
  band_id UUID REFERENCES bands(id),
  meeting_type TEXT DEFAULT 'culto_general',
  songs JSONB DEFAULT '[]',
  feedback TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all operations for authenticated users)
CREATE POLICY "Enable read access for authenticated users" ON members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON members FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON members FOR DELETE TO authenticated USING (true);

CREATE POLICY "Enable read access for authenticated users" ON bands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON bands FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON bands FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON bands FOR DELETE TO authenticated USING (true);

CREATE POLICY "Enable read access for authenticated users" ON songs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON songs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON songs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON songs FOR DELETE TO authenticated USING (true);

CREATE POLICY "Enable read access for authenticated users" ON orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON orders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON orders FOR DELETE TO authenticated USING (true);

-- Pending Registrations Policies
-- Anyone can insert (for registration), but only authenticated users can read/update/delete
CREATE POLICY "Enable insert for anonymous users" ON pending_registrations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Enable read for authenticated users" ON pending_registrations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable update for authenticated users" ON pending_registrations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON pending_registrations FOR DELETE TO authenticated USING (true);

-- Insert sample data
INSERT INTO members (name, email, role, instruments, active) VALUES
  ('Paul Acuña', 'paul@caf.org', 'pastor', ARRAY['Voz'], true),
  ('Ana Colina', 'ana.colina@caf.org', 'leader', ARRAY['Piano', 'Teclado'], true),
  ('Olga Romero', 'olga.romero@caf.org', 'member', ARRAY['Guitarra Eléctrica'], true),
  ('Gustavo Godoy', 'gustavo.godoy@caf.org', 'member', ARRAY['Batería'], true),
  ('Daniel Córdoba', 'daniel.cordoba@caf.org', 'member', ARRAY['Bajo'], true),
  ('María Elena Pérez', 'maria.perez@caf.org', 'member', ARRAY['Teclado', 'Piano'], true),
  ('Roberto Silva', 'roberto.silva@caf.org', 'member', ARRAY['Guitarra Acústica', 'Guitarra Eléctrica'], true),
  ('Carmen Torres', 'carmen.torres@caf.org', 'member', ARRAY['Voz'], true);

INSERT INTO bands (name, meeting_type, meeting_day, meeting_time, members) VALUES
  ('Banda Principal', 'culto_general', 'domingo', '20:00', ARRAY[]::UUID[]),
  ('Banda Jóvenes', 'jovenes', 'sabado', '19:00', ARRAY[]::UUID[]),
  ('Banda Acústica', 'mujeres', 'miercoles', '18:00', ARRAY[]::UUID[]);

INSERT INTO songs (title, artist, original_key, key, category, structure) VALUES
  ('Océanos', 'Hillsong United', 'D', 'D', 'intimidad', ARRAY[
    '{"type":"intro","label":"Intro","content":"","chords":"D D/F# G A"}',
    '{"type":"verse","label":"Verso 1","content":"Tú llamas más fuerte que el silencio que hay en mí","chords":"D D/F# G A"}',
    '{"type":"chorus","label":"Coro","content":"Y me levanto sobre las olas buscando Tu rostro","chords":"G D A G D A"}'
  ]::JSONB),
  ('Way Maker', 'Sinach', 'A', 'A', 'guerra', ARRAY[
    '{"type":"verse","label":"Verso 1","content":"Aún cuando no te veo, aún cuando no te siento","chords":"A E/G# F#m D"}',
    '{"type":"chorus","label":"Coro","content":"Eres mi refugio, mi proveedor","chords":"E F#m D A"}'
  ]::JSONB),
  ('Rey de Reyes', 'Hillsong', 'E', 'E', 'adoracion', ARRAY[
    '{"type":"verse","label":"Verso 1","content":"Tú que estás sentado en el trono con toda dignidad","chords":"E B C#m A"}',
    '{"type":"chorus","label":"Coro","content":"Rey de reyes, Señor de señores, Tú eres digno","chords":"E B C#m A"}'
  ]::JSONB);
`;
