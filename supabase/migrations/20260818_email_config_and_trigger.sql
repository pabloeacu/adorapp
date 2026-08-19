-- ============================================================================
-- Emails Gmail — Fase 2/3: config del worker + trigger del cron
-- ============================================================================
-- Mismo patrón que el sistema de push (get_push_config + net.http_post):
--   * Los secretos (credenciales Gmail, remitente, secreto interno) viven en
--     `private.app_secrets` — NO en el repo. Se cargan una vez por fuera.
--   * `get_email_config()` los lee para el worker (solo service_role).
--   * `trigger_send_emails()` lo pincha pg_cron cada minuto y hace POST al worker.
-- ============================================================================

-- El worker (service_role) lee la config de Gmail + remitente + secreto interno.
CREATE OR REPLACE FUNCTION public.get_email_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO result
  FROM private.app_secrets
  WHERE key IN ('gmail_client_id','gmail_client_secret','gmail_refresh_token',
                'email_from','email_from_name','email_internal_secret');
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_email_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_config() TO service_role;

-- pg_cron lo llama cada minuto: lee el secreto interno y hace POST al worker
-- send-emails (que valida ese mismo secreto). Idéntico al pipeline de push.
CREATE OR REPLACE FUNCTION public.trigger_send_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_secret text;
  v_url    text := 'https://gvsoexomzfaimagnaqzm.supabase.co/functions/v1/send-emails';
BEGIN
  SELECT value INTO v_secret FROM private.app_secrets WHERE key = 'email_internal_secret';
  IF v_secret IS NULL THEN
    RAISE WARNING 'trigger_send_emails: missing email_internal_secret';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION public.trigger_send_emails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_send_emails() TO service_role;

-- Cron cada minuto (drena la cola de a 1 por corrida; carril rápido para prioridad<=1).
SELECT cron.schedule('send-emails-worker', '* * * * *', 'SELECT public.trigger_send_emails();');
