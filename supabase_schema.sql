-- =====================================================
-- ADORAPP - SQL Schema for Supabase
-- Run this in: Supabase Dashboard > SQL Editor
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: members
-- =====================================================
CREATE TABLE IF NOT EXISTS members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  role TEXT DEFAULT 'member' CHECK (role IN ('pastor', 'leader', 'member')),
  instruments TEXT[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  user_id UUID REFERENCES auth.users(id),
  avatar_url TEXT,
  password_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLE: bands
-- =====================================================
CREATE TABLE IF NOT EXISTS bands (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  meeting_type TEXT DEFAULT 'culto_general',
  meeting_day TEXT,
  meeting_time TEXT DEFAULT '20:00',
  members UUID[] DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLE: songs
-- =====================================================
CREATE TABLE IF NOT EXISTS songs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT,
  original_key TEXT DEFAULT 'C',
  key TEXT DEFAULT 'C',
  category TEXT DEFAULT 'adoracion',
  youtube_url TEXT,
  structure JSONB DEFAULT '[]'::jsonb,
  last_used DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLE: orders
-- =====================================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  date DATE NOT NULL,
  time TEXT DEFAULT '20:00',
  band_id UUID REFERENCES bands(id),
  meeting_type TEXT DEFAULT 'culto_general',
  songs JSONB DEFAULT '[]'::jsonb,
  feedback TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Members policies
DROP POLICY IF EXISTS "Allow all read on members" ON members;
CREATE POLICY "Allow all read on members" ON members FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all insert on members" ON members;
CREATE POLICY "Allow all insert on members" ON members FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all update on members" ON members;
CREATE POLICY "Allow all update on members" ON members FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow all delete on members" ON members;
CREATE POLICY "Allow all delete on members" ON members FOR DELETE USING (true);

-- Bands policies
DROP POLICY IF EXISTS "Allow all read on bands" ON bands;
CREATE POLICY "Allow all read on bands" ON bands FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all insert on bands" ON bands;
CREATE POLICY "Allow all insert on bands" ON bands FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all update on bands" ON bands;
CREATE POLICY "Allow all update on bands" ON bands FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow all delete on bands" ON bands;
CREATE POLICY "Allow all delete on bands" ON bands FOR DELETE USING (true);

-- Songs policies
DROP POLICY IF EXISTS "Allow all read on songs" ON songs;
CREATE POLICY "Allow all read on songs" ON songs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all insert on songs" ON songs;
CREATE POLICY "Allow all insert on songs" ON songs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all update on songs" ON songs;
CREATE POLICY "Allow all update on songs" ON songs FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow all delete on songs" ON songs;
CREATE POLICY "Allow all delete on songs" ON songs FOR DELETE USING (true);

-- Orders policies
DROP POLICY IF EXISTS "Allow all read on orders" ON orders;
CREATE POLICY "Allow all read on orders" ON orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all insert on orders" ON orders;
CREATE POLICY "Allow all insert on orders" ON orders FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all update on orders" ON orders;
CREATE POLICY "Allow all update on orders" ON orders FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow all delete on orders" ON orders;
CREATE POLICY "Allow all delete on orders" ON orders FOR DELETE USING (true);

-- =====================================================
-- SAMPLE DATA: Members
-- =====================================================
INSERT INTO members (id, name, email, role, instruments, active, phone) VALUES
  (uuid_generate_v4(), 'Paul Acuña', 'paul@caf.org', 'pastor', ARRAY['Voz'], true, '+1 555 123 4567'),
  (uuid_generate_v4(), 'Ana Colina', 'ana.colina@caf.org', 'leader', ARRAY['Piano', 'Teclado'], true, '+1 555 234 5678'),
  (uuid_generate_v4(), 'Olga Romero', 'olga.romero@caf.org', 'member', ARRAY['Guitarra Eléctrica'], true, '+1 555 345 6789'),
  (uuid_generate_v4(), 'Gustavo Godoy', 'gustavo.godoy@caf.org', 'member', ARRAY['Batería'], true, '+1 555 456 7890'),
  (uuid_generate_v4(), 'Daniel Córdoba', 'daniel.cordoba@caf.org', 'member', ARRAY['Bajo'], true, '+1 555 567 8901'),
  (uuid_generate_v4(), 'María Elena Pérez', 'maria.perez@caf.org', 'member', ARRAY['Teclado', 'Piano'], true, '+1 555 678 9012'),
  (uuid_generate_v4(), 'Roberto Silva', 'roberto.silva@caf.org', 'member', ARRAY['Guitarra Acústica', 'Guitarra Eléctrica'], true, '+1 555 789 0123'),
  (uuid_generate_v4(), 'Carmen Torres', 'carmen.torres@caf.org', 'member', ARRAY['Voz'], true, '+1 555 890 1234')
ON CONFLICT (email) DO NOTHING;

-- =====================================================
-- SAMPLE DATA: Bands
-- =====================================================
INSERT INTO bands (name, meeting_type, meeting_day, meeting_time) VALUES
  ('Banda Principal', 'culto_general', 'domingo', '20:00'),
  ('Banda Jóvenes', 'jovenes', 'sabado', '19:00'),
  ('Banda Acústica', 'mujeres', 'miercoles', '18:00')
ON CONFLICT DO NOTHING;

-- =====================================================
-- SAMPLE DATA: Songs
-- =====================================================
INSERT INTO songs (title, artist, original_key, key, category, structure, youtube_url) VALUES
  ('Océanos', 'Hillsong United', 'D', 'D', 'intimidad',
   '[{"type":"intro","label":"Intro","content":"","chords":"D D/F# G A"},{"type":"verse","label":"Verso 1","content":"Tú llamas más fuerte que el silencio que hay en mí","chords":"D D/F# G A"},{"type":"chorus","label":"Coro","content":"Y me levanto sobre las olas buscando Tu rostro","chords":"G D A G D A"},{"type":"bridge","label":"Puente","content":"Espíritu Santo, ven","chords":"Bm A G D"},{"type":"chorus","label":"Coro Final","content":"Y me levanto sobre las olas","chords":"G D A G D A"}]'::jsonb,
   'https://www.youtube.com/watch?v=ef2j2C7CqJw'),
  ('Way Maker', 'Sinach', 'A', 'A', 'guerra',
   '[{"type":"intro","label":"Intro","content":"","chords":"A E/G# F#m D"},{"type":"verse","label":"Verso 1","content":"Aún cuando no te veo, aún cuando no te siento","chords":"A E/G# F#m D"},{"type":"chorus","label":"Coro","content":"Eres mi refugio, mi proveedor","chords":"E F#m D A"}]'::jsonb,
   'https://www.youtube.com/watch?v=something'),
  ('Rey de Reyes', 'Hillsong', 'E', 'E', 'adoracion',
   '[{"type":"intro","label":"Intro","content":"","chords":"E B C#m A"},{"type":"verse","label":"Verso 1","content":"Tú que estás sentado en el trono","chords":"E B C#m A"},{"type":"chorus","label":"Coro","content":"Rey de reyes, Señor de señores","chords":"E B C#m A"}]'::jsonb,
   ''),
  ('Grande y Fuerte', 'Marcela Gandara', 'A', 'A', 'intimidad',
   '[{"type":"verse","label":"Verso","content":"Hay cosas que no puedo entender","chords":"F#m D E"},{"type":"chorus","label":"Coro","content":"Grande y fuerte es Tu nombre","chords":"A E F#m D"}]'::jsonb,
   ''),
  ('Santo es el Señor', 'Alberto Lenord', 'G', 'G', 'adoracion',
   '[{"type":"intro","label":"Intro","content":"","chords":"G C D"},{"type":"verse","label":"Verso 1","content":"Santo, santo, santo","chords":"G C D"},{"type":"chorus","label":"Coro","content":"Santo es el Señor","chords":"G D Em C"}]'::jsonb,
   '')
ON CONFLICT DO NOTHING;

-- =====================================================
-- FUNCTION: Auto-update updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
DROP TRIGGER IF EXISTS update_members_updated_at ON members;
CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bands_updated_at ON bands;
CREATE TRIGGER update_bands_updated_at BEFORE UPDATE ON bands
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_songs_updated_at ON songs;
CREATE TRIGGER update_songs_updated_at BEFORE UPDATE ON songs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Done!
-- =====================================================
SELECT 'AdorAPP database schema created successfully!' as status;
