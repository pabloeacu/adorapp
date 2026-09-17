-- Defensa en profundidad: freno de velocidad para las Edge Functions admin-*.
--
-- La frontera de seguridad REAL de las admin-* es el gate de pastor (requirePastor:
-- valida el JWT + exige role='pastor' AND active). Esto es una SEGUNDA barrera: si
-- una cuenta de pastor se viera comprometida, acota el daño por unidad de tiempo
-- (no puede crear/borrar miembros ni spamear comunicaciones sin límite).
--
-- Diseño FAIL-OPEN: si el chequeo de rate-limit falla (hipo de la base), la EF
-- SIGUE (nunca bloquea a un pastor legítimo por un bug del limitador). Las EFs
-- llaman admin_action_gate() como service_role tras autenticar.

CREATE TABLE IF NOT EXISTS public.admin_action_events (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor   uuid NOT NULL,          -- auth.users.id del pastor que llamó
  action  text NOT NULL,          -- 'create-member' | 'delete-member' | 'send-communication' | ...
  at      timestamptz NOT NULL DEFAULT now()
);

-- Índice para el conteo por ventana (actor + action + tiempo).
CREATE INDEX IF NOT EXISTS idx_admin_action_events_actor_action_at
  ON public.admin_action_events (actor, action, at DESC);

-- Solo el backend escribe/lee (vía la RPC DEFINER). Nada de cliente.
REVOKE ALL ON public.admin_action_events FROM PUBLIC, anon, authenticated;
-- Defensa en profundidad (norma del repo, landmine #45): FORCE RLS sin políticas
-- = default-deny incluso si algún día se re-otorga un GRANT por error. El RPC es
-- SECURITY DEFINER (owner postgres, bypassa RLS) y service_role también → sigue
-- funcionando; el cliente queda bloqueado por partida doble (REVOKE + RLS).
ALTER TABLE public.admin_action_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_action_events FORCE ROW LEVEL SECURITY;

-- Gate: devuelve true (permitido, y REGISTRA el evento) o false (bloqueado).
-- p_max      = tope por acción por ventana para ese actor.
-- p_total_max= backstop: tope de TODAS las acciones admin del actor en la ventana.
CREATE OR REPLACE FUNCTION public.admin_action_gate(
  p_actor uuid,
  p_action text,
  p_max int DEFAULT 20,
  p_window_secs int DEFAULT 60,
  p_total_max int DEFAULT 40
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_since timestamptz := now() - make_interval(secs => GREATEST(p_window_secs, 1));
  v_action_count int;
  v_total_count int;
BEGIN
  IF p_actor IS NULL OR p_action IS NULL OR p_action = '' THEN
    -- Sin identidad/acción no podemos limitar: fail-open (la EF ya autenticó).
    RETURN true;
  END IF;

  SELECT count(*) INTO v_action_count FROM public.admin_action_events
    WHERE actor = p_actor AND action = p_action AND at > v_since;
  IF v_action_count >= GREATEST(p_max, 1) THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_total_count FROM public.admin_action_events
    WHERE actor = p_actor AND at > v_since;
  IF v_total_count >= GREATEST(p_total_max, 1) THEN
    RETURN false;
  END IF;

  INSERT INTO public.admin_action_events (actor, action) VALUES (p_actor, p_action);
  RETURN true;
END;
$function$;

-- Solo service_role (las EFs). Nunca el cliente.
REVOKE ALL ON FUNCTION public.admin_action_gate(uuid, text, int, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_action_gate(uuid, text, int, int, int) TO service_role;

-- Retención: sumar admin_action_events (>1 día) a la poda técnica diaria.
CREATE OR REPLACE FUNCTION public.purge_technical_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  DELETE FROM public.health_checks WHERE checked_at < now() - interval '90 days';
  DELETE FROM public.email_queue WHERE status IN ('sent','failed') AND created_at < now() - interval '90 days';
  DELETE FROM public.sent_emails WHERE created_at < now() - interval '90 days';
  -- El rate-limit solo mira la última ventana (segundos): más de 1 día es basura.
  DELETE FROM public.admin_action_events WHERE at < now() - interval '1 day';
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.error_log (message, severity, context)
    VALUES ('purge_technical_logs: fallo', 'error', jsonb_build_object('error', SQLERRM));
  EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$function$;
