-- audit_log_trigger() crashed with "record v_member is not assigned yet" any
-- time it fired without a logged-in user (e.g. INSERT executed via MCP/SQL
-- with the service_role, or a future pg_cron writing to one of the audited
-- tables). The original tried to read v_member.id/name/role even when the
-- preceding `SELECT INTO v_member` had been skipped (auth.uid() IS NULL) or
-- returned no rows.
--
-- Fix: replace the RECORD with three discrete typed variables. SELECT INTO
-- leaves them as NULL when no row matches, and they start NULL if we skip the
-- lookup entirely. The audit_events.actor_* columns are already nullable, so
-- the rows just land with anonymous-actor metadata in the system path.

CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id     UUID;
  v_member_id   UUID;
  v_member_name TEXT;
  v_member_role TEXT;
  v_action      TEXT;
  v_record_id   UUID;
  v_before      JSONB;
  v_after       JSONB;
  v_changes     JSONB;
BEGIN
  v_action := lower(TG_OP);

  -- Resolve actor. auth.uid() is NULL whenever the trigger fires from a
  -- service_role / system context; we record the row but leave actor_* NULL.
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF v_user_id IS NOT NULL THEN
    -- SELECT INTO leaves v_member_* as NULL when no member row matches the
    -- auth user (e.g. the user exists in auth.users but isn't a ministry
    -- member yet). That's fine — we still log the change with the user_id.
    SELECT id, name, role
      INTO v_member_id, v_member_name, v_member_role
    FROM public.members
    WHERE user_id = v_user_id
    LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_record_id := (NEW.id);
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := (NEW.id);
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    SELECT jsonb_object_agg(key, value)
      INTO v_changes
    FROM jsonb_each(v_after)
    WHERE NOT (v_before ? key) OR v_before -> key IS DISTINCT FROM value;
  ELSIF TG_OP = 'DELETE' THEN
    v_record_id := (OLD.id);
    v_before := to_jsonb(OLD);
  END IF;

  INSERT INTO public.audit_events
    (actor_user_id, actor_member_id, actor_name, actor_role,
     table_name, record_id, action, before, after, changes)
  VALUES
    (v_user_id, v_member_id, v_member_name, v_member_role,
     TG_TABLE_NAME, v_record_id, v_action, v_before, v_after, v_changes);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;
