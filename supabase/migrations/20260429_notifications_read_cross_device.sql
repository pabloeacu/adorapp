-- notifications_read — cross-device read state for global notifications.
--
-- Until now, "leído" for devotional/reflection/song/band/member/order/request
-- notifications lived in localStorage per device. If a user opened the app on
-- their phone and marked the daily devotional as read, the desktop tab still
-- showed the badge until the 2-min poll cleared it (and even then, the
-- per-device localStorage kept saying "unread"). With this table, the read
-- state lives in the DB and syncs everywhere via Realtime.
--
-- Communications already track is_read on their own row, so they aren't
-- affected by this migration.

CREATE TABLE IF NOT EXISTS public.notifications_read (
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS notifications_read_user_idx
  ON public.notifications_read(user_id);

ALTER TABLE public.notifications_read ENABLE ROW LEVEL SECURITY;

-- A user may only see / write / delete their own read marks.
DROP POLICY IF EXISTS notifications_read_select_own ON public.notifications_read;
CREATE POLICY notifications_read_select_own ON public.notifications_read
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_read_insert_own ON public.notifications_read;
CREATE POLICY notifications_read_insert_own ON public.notifications_read
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_read_delete_own ON public.notifications_read;
CREATE POLICY notifications_read_delete_own ON public.notifications_read
  FOR DELETE USING (auth.uid() = user_id);

-- Expose to Realtime so the bell can react to INSERTs from another device
-- without waiting for the next 2-minute poll.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    -- ALTER PUBLICATION ... ADD TABLE is idempotent only if not already added;
    -- guard with a not-in-publication check.
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'notifications_read'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications_read;
    END IF;
  END IF;
END $$;
