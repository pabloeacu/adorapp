-- Ensayómetro: personal practice log, per (user, order, song).
--
-- Why: the "ensamble" (the band-wide rehearsal scheduled on an order) only
-- works if each musician did their personal "ensayo" (practice) first. This
-- table stores that personal practice state: how many times each song of an
-- order was practiced, which mastery checks are done (lyrics / structure /
-- arrangements), and the perceived difficulty.
--
-- Design principles:
-- * STRICTLY PERSONAL: RLS restricts every operation to the owner
--   (user_id = auth.uid()). Nobody — not even pastors — can read another
--   member's practice log through the Data API. It is a personal tool, not an
--   audit surface.
-- * EPHEMERAL BY DESIGN: rows are tied to an order. ON DELETE CASCADE cleans
--   them when the order goes away, and the UI only surfaces logs for orders
--   that are still 'scheduled'. (A periodic cleanup cron may prune logs of
--   long-past orders later — additive, not required for correctness.)
-- * ADDITIVE: no existing table, policy or function is modified.
--
-- Per project rule #7: new public tables need explicit GRANTs (Data API stops
-- exposing new tables by default starting 2026-10-30).

CREATE TABLE IF NOT EXISTS public.practice_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  times_practiced integer NOT NULL DEFAULT 0 CHECK (times_practiced >= 0),
  knows_lyrics boolean NOT NULL DEFAULT false,
  knows_structure boolean NOT NULL DEFAULT false,
  knows_arrangements boolean NOT NULL DEFAULT false,
  difficulty text CHECK (difficulty IN ('easy', 'medium', 'hard')),
  last_practiced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_id, song_id)
);

-- Lookup patterns: "my logs for this order" (page load) and cascade cleanups.
CREATE INDEX IF NOT EXISTS idx_practice_logs_user_order
  ON public.practice_logs (user_id, order_id);
CREATE INDEX IF NOT EXISTS idx_practice_logs_order
  ON public.practice_logs (order_id);
CREATE INDEX IF NOT EXISTS idx_practice_logs_song
  ON public.practice_logs (song_id);

ALTER TABLE public.practice_logs ENABLE ROW LEVEL SECURITY;

-- Owner-only, for every verb. WITH CHECK pins inserts/updates to the caller's
-- own uid so nobody can write a row on someone else's behalf.
DROP POLICY IF EXISTS practice_logs_select_own ON public.practice_logs;
CREATE POLICY practice_logs_select_own ON public.practice_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS practice_logs_insert_own ON public.practice_logs;
CREATE POLICY practice_logs_insert_own ON public.practice_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS practice_logs_update_own ON public.practice_logs;
CREATE POLICY practice_logs_update_own ON public.practice_logs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS practice_logs_delete_own ON public.practice_logs;
CREATE POLICY practice_logs_delete_own ON public.practice_logs
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Project rule #7: explicit grants for the Data API roles. anon gets nothing
-- (practice is for logged-in members only; RLS would block it anyway).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_logs TO authenticated;
