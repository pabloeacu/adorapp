-- Rate limit the public "solicitar registro" form (pending_registrations).
--
-- Why: RLS lets `anon` INSERT into pending_registrations (that's the public
-- join form, by design). With no throttle, a bot could flood it with junk
-- requests. This is abuse/spam protection, not a data-leak fix.
--
-- How: a BEFORE INSERT trigger that (a) caps new requests to 10 per minute
-- (global) and (b) refuses once there are already 200 unprocessed pending
-- requests. Both raise HTTP 429 via PostgREST's PT<status> convention, so the
-- client gets a clean "too many requests" instead of a generic 500.
--
-- Thresholds are deliberately generous: a ~8-person ministry never registers
-- 10 people in one minute, so legit use is never blocked; a spam flood is.
--
-- Security: cron/trigger-only helper, not exposed as public RPC (REVOKE). The
-- trigger fires as its owner (SECURITY DEFINER) so it can COUNT the table even
-- though `anon` can't SELECT it.

CREATE OR REPLACE FUNCTION public.rate_limit_pending_registrations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count int;
  pending_total int;
BEGIN
  SELECT count(*) INTO recent_count
  FROM public.pending_registrations
  WHERE created_at > now() - interval '1 minute';
  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'Demasiadas solicitudes en poco tiempo. Esperá un momento e intentá de nuevo.'
      USING ERRCODE = 'PT429';
  END IF;

  SELECT count(*) INTO pending_total
  FROM public.pending_registrations
  WHERE status = 'pending';
  IF pending_total >= 200 THEN
    RAISE EXCEPTION 'Hay demasiadas solicitudes pendientes en este momento. Probá más tarde.'
      USING ERRCODE = 'PT429';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rate_limit_pending_registrations ON public.pending_registrations;
CREATE TRIGGER rate_limit_pending_registrations
  BEFORE INSERT ON public.pending_registrations
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_pending_registrations();

REVOKE EXECUTE ON FUNCTION public.rate_limit_pending_registrations() FROM PUBLIC, anon, authenticated;
