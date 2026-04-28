-- public.get_push_config: returns the push-related secrets as jsonb.
-- SECURITY DEFINER so the function can read private.app_secrets even though
-- the schema is not exposed via PostgREST. Only the service_role may call it
-- (the EF send-push uses the service role key).

CREATE OR REPLACE FUNCTION public.get_push_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO result
  FROM private.app_secrets
  WHERE key IN ('vapid_public', 'vapid_private', 'vapid_subject', 'push_internal_secret');

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_push_config() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_push_config() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_push_config() TO service_role;
