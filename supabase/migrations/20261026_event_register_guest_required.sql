-- Datos mínimos OBLIGATORIOS para cada acompañante (nombre + email + celular),
-- igual que el titular. Antes el servidor aceptaba acompañantes sin correo/celular.
-- Iglesia y "cómo te enteraste" siguen siendo SOLO del titular (y opcionales).
-- Construye sobre la versión de 20261025 (idempotencia por correo + clamp del goteo);
-- el índice idx_event_reg_email_queued ya existe de esa migración.
CREATE OR REPLACE FUNCTION public.event_register(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_slug    text := coalesce(nullif(public._event_clean(p_payload->>'event_slug', 60), ''), 'thechosen');
  v_ev      public.event_events%ROWTYPE;
  v_nombre  text := public._event_clean(p_payload->>'nombre', 120);
  v_email   text := lower(public._event_clean(p_payload->>'email', 160));
  v_celu    text := public._event_clean(p_payload->>'celular', 40);
  v_iglesia text := public._event_clean(p_payload->>'iglesia', 120);
  v_como    text := public._event_clean(p_payload->>'como_se_entero', 60);
  v_guests  jsonb := coalesce(p_payload->'acompanantes', '[]'::jsonb);
  v_nacomp  int;
  v_cnt     int;
  v_total   int;
  v_reg     public.event_registrations%ROWTYPE;
  v_slot    timestamptz;
  v_queue_id uuid;
  g         jsonb;
  v_gnom    text;
  v_gmail   text;
  v_gcelu   text;
  v_grupo_txt text;
  v_url     text;
BEGIN
  SELECT * INTO v_ev FROM public.event_events WHERE slug = v_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'evento_inexistente' USING ERRCODE='22023'; END IF;
  IF NOT v_ev.registration_open THEN RAISE EXCEPTION 'inscripciones_cerradas' USING ERRCODE='22023'; END IF;
  IF v_ev.closes_at IS NOT NULL AND now() >= v_ev.closes_at THEN
    RAISE EXCEPTION 'inscripciones_cerradas' USING ERRCODE='22023';
  END IF;

  IF v_nombre IS NULL OR length(v_nombre) < 2 THEN RAISE EXCEPTION 'nombre_invalido' USING ERRCODE='22023'; END IF;
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'email_invalido' USING ERRCODE='22023'; END IF;
  IF v_celu IS NULL OR length(regexp_replace(v_celu, '\D', '', 'g')) < 6 THEN RAISE EXCEPTION 'celular_invalido' USING ERRCODE='22023'; END IF;

  IF jsonb_typeof(v_guests) IS DISTINCT FROM 'array' THEN v_guests := '[]'::jsonb; END IF;
  v_nacomp := jsonb_array_length(v_guests);
  IF v_nacomp > 20 THEN RAISE EXCEPTION 'demasiados_acompanantes' USING ERRCODE='22023'; END IF;

  -- Cada acompañante DEBE traer nombre + email + celular válidos (igual que el titular).
  FOR g IN SELECT jsonb_array_elements(v_guests) LOOP
    v_gnom  := public._event_clean(g->>'nombre', 120);
    v_gmail := lower(public._event_clean(g->>'email', 160));
    v_gcelu := public._event_clean(g->>'celular', 40);
    IF v_gnom IS NULL OR length(v_gnom) < 2
       OR v_gmail IS NULL OR v_gmail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
       OR v_gcelu IS NULL OR length(regexp_replace(v_gcelu, '\D', '', 'g')) < 6 THEN
      RAISE EXCEPTION 'acompanante_invalido' USING ERRCODE='22023';
    END IF;
  END LOOP;

  -- Idempotencia por correo (anti doble-submit / email-bomb / veneno del goteo).
  PERFORM pg_advisory_xact_lock(hashtext('event_reg:' || v_slug || ':' || v_email));
  SELECT * INTO v_reg FROM public.event_registrations
    WHERE event_slug = v_slug AND lower(email) = v_email AND status <> 'cancelled'
    ORDER BY created_at
    LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'token', v_reg.ticket_token,
      'code', upper(left(v_reg.ticket_token, 6)),
      'nombre', v_reg.nombre,
      'acompanantes', v_reg.acompanantes,
      'already', true
    );
  END IF;

  SELECT count(*) INTO v_cnt FROM public.event_registrations
    WHERE event_slug = v_slug AND created_at > now() - interval '1 minute';
  IF v_cnt >= 20 THEN RAISE EXCEPTION 'demasiadas_solicitudes' USING ERRCODE='PT429'; END IF;

  SELECT count(*) INTO v_total FROM public.event_registrations
    WHERE event_slug = v_slug AND status <> 'cancelled';
  IF v_total >= 10000 THEN RAISE EXCEPTION 'demasiadas_solicitudes' USING ERRCODE='PT429'; END IF;

  IF v_ev.capacity IS NOT NULL THEN
    SELECT coalesce(sum(1 + acompanantes), 0) INTO v_cnt FROM public.event_registrations
      WHERE event_slug = v_slug AND status <> 'cancelled';
    IF v_cnt + 1 + v_nacomp > v_ev.capacity THEN RAISE EXCEPTION 'cupo_completo' USING ERRCODE='22023'; END IF;
  END IF;

  INSERT INTO public.event_registrations (event_slug, nombre, email, celular, iglesia, como_se_entero, acompanantes)
  VALUES (v_slug, v_nombre, v_email, v_celu, nullif(v_iglesia,''), nullif(v_como,''), v_nacomp)
  RETURNING * INTO v_reg;

  FOR g IN SELECT jsonb_array_elements(v_guests) LOOP
    INSERT INTO public.event_guests (registration_id, nombre, email, celular)
    VALUES (v_reg.id,
            nullif(public._event_clean(g->>'nombre', 120), ''),
            nullif(lower(public._event_clean(g->>'email', 160)), ''),
            nullif(public._event_clean(g->>'celular', 40), ''));
  END LOOP;

  BEGIN
    INSERT INTO public.email_throttle (key, last_sent_at)
    VALUES ('event_drip:' || v_slug, now())
    ON CONFLICT (key) DO UPDATE
      SET last_sent_at = least(
            greatest(now(), email_throttle.last_sent_at) + interval '10 minutes',
            now() + interval '1 hour');
    SELECT last_sent_at INTO v_slot FROM public.email_throttle WHERE key = 'event_drip:' || v_slug;

    v_grupo_txt := CASE WHEN v_nacomp = 0 THEN 'una entrada (vos)'
                        ELSE 'una entrada para vos y ' || v_nacomp || ' acompañante' ||
                             CASE WHEN v_nacomp = 1 THEN '' ELSE 's' END ||
                             ' (' || (1 + v_nacomp) || ' personas)' END;
    v_url := 'https://adorapp.net.ar/thechosen/entrada/' || v_reg.ticket_token;

    INSERT INTO public.email_queue (template_slug, to_email, to_nombre, variables, prioridad, programado_para, status)
    VALUES ('evento-entrada-thechosen', v_reg.email, v_nombre,
            jsonb_build_object(
              'nombre',   public._html_escape(split_part(v_nombre, ' ', 1)),
              'grupo',    v_grupo_txt,
              'ticket_url', v_url,
              'fecha',    public._html_escape(v_ev.fecha_texto),
              'lugar',    public._html_escape(v_ev.lugar_texto)),
            9, v_slot, 'pending')
    RETURNING id INTO v_queue_id;

    UPDATE public.event_registrations SET email_queued_id = v_queue_id WHERE id = v_reg.id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'token', v_reg.ticket_token,
    'code', upper(left(v_reg.ticket_token, 6)),
    'nombre', v_reg.nombre,
    'acompanantes', v_nacomp
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.event_register(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_register(jsonb) TO anon, authenticated, service_role;
