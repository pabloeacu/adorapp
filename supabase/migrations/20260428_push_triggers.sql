-- Push notifications trigger pipeline.
--
-- Goal: every row inserted into notifications or communication_notifications
-- automatically fires a Web Push via the send-push Edge Function. The trigger
-- uses pg_net (async http) so the originating INSERT is not blocked.
--
-- Auth: the trigger forwards the push_internal_secret stored in
-- private.app_secrets as a Bearer token; send-push validates it via
-- get_push_config() (SECURITY DEFINER) and bypasses the user-JWT path.

-- ---------------- notifications: global broadcast or per-user ----------------
CREATE OR REPLACE FUNCTION public.notify_push_on_notification_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
  v_url    text := 'https://gvsoexomzfaimagnaqzm.supabase.co/functions/v1/send-push';
  v_to     jsonb;
  v_mid    uuid;
BEGIN
  SELECT value INTO v_secret FROM private.app_secrets WHERE key = 'push_internal_secret';
  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_push: missing push_internal_secret';
    RETURN NEW;
  END IF;

  IF NEW.is_global IS TRUE THEN
    v_to := '"all"'::jsonb;
  ELSIF NEW.user_id IS NOT NULL THEN
    SELECT id INTO v_mid FROM public.members WHERE user_id = NEW.user_id LIMIT 1;
    IF v_mid IS NULL THEN
      RAISE WARNING 'notify_push: no member for user_id %', NEW.user_id;
      RETURN NEW;
    END IF;
    v_to := jsonb_build_array(v_mid::text);
  ELSE
    -- No audience → nothing to push.
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'to',    v_to,
      'title', NEW.title,
      'body',  NEW.message,
      'url',   '/'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_on_notification_insert ON public.notifications;
CREATE TRIGGER push_on_notification_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_notification_insert();

-- ---------------- communication_notifications: one row per recipient ----------------
CREATE OR REPLACE FUNCTION public.notify_push_on_communication_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
  v_url    text := 'https://gvsoexomzfaimagnaqzm.supabase.co/functions/v1/send-push';
  v_mid    uuid;
  v_body   text;
BEGIN
  SELECT value INTO v_secret FROM private.app_secrets WHERE key = 'push_internal_secret';
  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_push: missing push_internal_secret';
    RETURN NEW;
  END IF;

  IF NEW.recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_mid FROM public.members WHERE user_id = NEW.recipient_id LIMIT 1;
  IF v_mid IS NULL THEN
    RAISE WARNING 'notify_push: no member for user_id %', NEW.recipient_id;
    RETURN NEW;
  END IF;

  v_body := COALESCE(NULLIF(NEW.preview, ''), substring(COALESCE(NEW.full_message, '') FROM 1 FOR 140));

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'to',    jsonb_build_array(v_mid::text),
      'title', NEW.subject,
      'body',  v_body,
      'url',   '/'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_on_communication_insert ON public.communication_notifications;
CREATE TRIGGER push_on_communication_insert
  AFTER INSERT ON public.communication_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_communication_insert();
