-- Migrate the synthetic bell items (new song / band / member / pending registration)
-- to real rows in `notifications`. Doing so means they automatically inherit
-- the push pipeline added in 20260428_push_triggers.sql — every notification
-- row, no matter who creates it, fans out as a Web Push.
--
-- Design:
--   * songs / bands / members → is_global = true (everyone in the ministry hears).
--     expires_at = +7 days so the bell doesn't grow forever.
--   * pending_registrations → one per-pastor row (user_id set), since only
--     pastors care about pending requests.

-- ---------------- expand the type CHECK ----------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['info','reflection','alert','reminder','devotional','song','band','member','request']));

-- ---------------- songs ----------------
CREATE OR REPLACE FUNCTION public.notify_on_song_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.notifications (title, message, type, is_global, created_at, expires_at)
  VALUES (
    'Nueva canción',
    '"' || COALESCE(NEW.title, 'sin título') || '" se sumó al repertorio',
    'song',
    true,
    NOW(),
    NOW() + INTERVAL '7 days'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_song_insert ON public.songs;
CREATE TRIGGER notify_on_song_insert
  AFTER INSERT ON public.songs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_song_insert();

-- ---------------- bands ----------------
CREATE OR REPLACE FUNCTION public.notify_on_band_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.notifications (title, message, type, is_global, created_at, expires_at)
  VALUES (
    'Nueva banda',
    '"' || COALESCE(NEW.name, 'sin nombre') || '" se sumó al ministerio',
    'band',
    true,
    NOW(),
    NOW() + INTERVAL '7 days'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_band_insert ON public.bands;
CREATE TRIGGER notify_on_band_insert
  AFTER INSERT ON public.bands
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_band_insert();

-- ---------------- members ----------------
CREATE OR REPLACE FUNCTION public.notify_on_member_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.notifications (title, message, type, is_global, created_at, expires_at)
  VALUES (
    'Nuevo miembro',
    'Bienvenido/a ' || COALESCE(NEW.name, 'a la familia') || ' a la familia de adoración',
    'member',
    true,
    NOW(),
    NOW() + INTERVAL '7 days'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_member_insert ON public.members;
CREATE TRIGGER notify_on_member_insert
  AFTER INSERT ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_member_insert();

-- ---------------- pending_registrations: one per-pastor row ----------------
CREATE OR REPLACE FUNCTION public.notify_on_pending_registration_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pastor RECORD;
BEGIN
  -- Skip if the row was created already-decided (defensive — usually new rows
  -- come in as 'pending').
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  FOR pastor IN
    SELECT user_id FROM public.members WHERE role = 'pastor' AND user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, is_global, created_at, expires_at)
    VALUES (
      pastor.user_id,
      'Solicitud de registro',
      COALESCE(NEW.name, 'Alguien') || ' se quiere registrar al ministerio',
      'request',
      false,
      NOW(),
      NOW() + INTERVAL '30 days'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_pending_registration_insert ON public.pending_registrations;
CREATE TRIGGER notify_on_pending_registration_insert
  AFTER INSERT ON public.pending_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_pending_registration_insert();
