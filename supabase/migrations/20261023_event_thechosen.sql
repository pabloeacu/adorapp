-- ============================================================================
-- EVENTO "The Chosen" — sistema de reservas AISLADO (sección "eventos").
-- ============================================================================
-- Principio innegociable: NADA de lo que ya funciona en AdorApp entra en riesgo.
-- Todo vive en tablas/funciones NUEVAS con prefijo event_*. No toca members,
-- orders, songs, bands, el login, el arranque ni el service worker.
--
-- Modelo:
--   event_events        -> definición del/los evento(s) (reusable, multi-evento).
--   event_registrations -> una fila por RESERVA (grupo). El ticket es del grupo.
--   event_guests        -> acompañantes (datos de cada uno; sin ticket propio).
--
-- Seguridad:
--   * RLS FORZADA en las 3 tablas. El cliente NUNCA escribe directo.
--   * Toda escritura pasa por RPC SECURITY DEFINER con search_path fijo,
--     rate-limit y saneo (mismo espíritu que pending_registrations).
--   * Lectura de inscriptos: SOLO pastor (is_pastor()).
--   * La entrada pública se lee por token vía RPC (sin exponer email/teléfono).
--
-- Correo: se ENCOLA en email_queue con programado_para escalonado (goteo ~1/10min)
--   reusando el worker existente (send-emails). CERO cron nuevo, cero cambios al
--   pipeline. El cursor del goteo vive en email_throttle.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) TABLAS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_events (
  slug              text PRIMARY KEY,
  titulo            text NOT NULL,
  fecha_texto       text NOT NULL,
  lugar_texto       text NOT NULL,
  registration_open boolean NOT NULL DEFAULT true,
  closes_at         timestamptz,
  capacity          integer,                 -- NULL = sin tope (monitorear)
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_registrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug      text NOT NULL REFERENCES public.event_events(slug),
  nombre          text NOT NULL,
  email           text NOT NULL,
  celular         text NOT NULL,
  iglesia         text,
  como_se_entero  text,
  acompanantes    smallint NOT NULL DEFAULT 0,
  ticket_token    text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  status          text NOT NULL DEFAULT 'confirmed',   -- confirmed | cancelled
  email_status    text NOT NULL DEFAULT 'pending',     -- pending | sent | failed | bounced
  email_queued_id uuid,
  checked_in_at   timestamptz,
  checked_in_by   uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_reg_status_chk CHECK (status IN ('confirmed','cancelled')),
  CONSTRAINT event_reg_email_status_chk CHECK (email_status IN ('pending','sent','failed','bounced')),
  CONSTRAINT event_reg_acomp_chk CHECK (acompanantes >= 0 AND acompanantes <= 20)
);

CREATE TABLE IF NOT EXISTS public.event_guests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  nombre          text,
  email           text,
  celular         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_reg_slug_created ON public.event_registrations (event_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_reg_email        ON public.event_registrations (lower(email));
CREATE INDEX IF NOT EXISTS idx_event_reg_status       ON public.event_registrations (status);
CREATE INDEX IF NOT EXISTS idx_event_guests_reg       ON public.event_guests (registration_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) RLS + GRANTS (regla #7: GRANT explícito; escritura solo por RPC)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.event_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_events        FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.event_guests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_guests        FORCE  ROW LEVEL SECURITY;

-- event_events: info pública del evento (la landing la lee). Escritura: pastor.
DROP POLICY IF EXISTS event_events_select_public ON public.event_events;
CREATE POLICY event_events_select_public ON public.event_events FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS event_events_write_pastor ON public.event_events;
CREATE POLICY event_events_write_pastor ON public.event_events FOR ALL
  TO authenticated USING (public.is_pastor()) WITH CHECK (public.is_pastor());

-- event_registrations / event_guests: lectura SOLO pastor; nada de DML de cliente.
DROP POLICY IF EXISTS event_reg_select_pastor ON public.event_registrations;
CREATE POLICY event_reg_select_pastor ON public.event_registrations FOR SELECT
  TO authenticated USING (public.is_pastor());
DROP POLICY IF EXISTS event_guests_select_pastor ON public.event_guests;
CREATE POLICY event_guests_select_pastor ON public.event_guests FOR SELECT
  TO authenticated USING (public.is_pastor());

-- GRANTs de tabla. SELECT a authenticated (RLS filtra a pastor). event_events
-- lee también anon. Escrituras REVOCADAS (van por RPC SECURITY DEFINER).
GRANT SELECT ON public.event_events TO anon, authenticated;
GRANT SELECT ON public.event_registrations TO authenticated;
GRANT SELECT ON public.event_guests TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.event_events        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.event_registrations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.event_guests        FROM anon, authenticated;
-- Supabase default-ACL concede a anon SELECT/EXECUTE directo en objetos nuevos
-- (no via PUBLIC). anon NO debe leer inscriptos/acompañantes: lo sacamos entero.
REVOKE ALL ON public.event_registrations FROM anon;
REVOKE ALL ON public.event_guests        FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) HELPER de saneo (strip control chars + trim + cap)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._event_clean(p_text text, p_max int DEFAULT 200)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE WHEN p_text IS NULL THEN NULL
    ELSE left(btrim(regexp_replace(p_text, '[\x00-\x1F\x7F]+', ' ', 'g')), p_max) END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RPC event_register(payload) — alta pública de una reserva (grupo).
--    anon/authenticated. Rate-limit + saneo + alta atómica + encolado por goteo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.event_register(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
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
  v_grupo_txt text;
  v_url     text;
BEGIN
  -- Evento válido + abierto
  SELECT * INTO v_ev FROM public.event_events WHERE slug = v_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'evento_inexistente' USING ERRCODE='22023'; END IF;
  IF NOT v_ev.registration_open THEN RAISE EXCEPTION 'inscripciones_cerradas' USING ERRCODE='22023'; END IF;
  IF v_ev.closes_at IS NOT NULL AND now() >= v_ev.closes_at THEN
    RAISE EXCEPTION 'inscripciones_cerradas' USING ERRCODE='22023';
  END IF;

  -- Validaciones mínimas de datos
  IF v_nombre IS NULL OR length(v_nombre) < 2 THEN RAISE EXCEPTION 'nombre_invalido' USING ERRCODE='22023'; END IF;
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'email_invalido' USING ERRCODE='22023'; END IF;
  IF v_celu IS NULL OR length(regexp_replace(v_celu, '\D', '', 'g')) < 6 THEN RAISE EXCEPTION 'celular_invalido' USING ERRCODE='22023'; END IF;

  -- Acompañantes: la lista manda; tope 20
  IF jsonb_typeof(v_guests) IS DISTINCT FROM 'array' THEN v_guests := '[]'::jsonb; END IF;
  v_nacomp := jsonb_array_length(v_guests);
  IF v_nacomp > 20 THEN RAISE EXCEPTION 'demasiados_acompanantes' USING ERRCODE='22023'; END IF;

  -- Rate-limit: global (20/min) + backstop total (anti-flood, no es el cupo real)
  SELECT count(*) INTO v_cnt FROM public.event_registrations
    WHERE event_slug = v_slug AND created_at > now() - interval '1 minute';
  IF v_cnt >= 20 THEN RAISE EXCEPTION 'demasiadas_solicitudes' USING ERRCODE='PT429'; END IF;

  SELECT count(*) INTO v_total FROM public.event_registrations
    WHERE event_slug = v_slug AND status <> 'cancelled';
  IF v_total >= 10000 THEN RAISE EXCEPTION 'demasiadas_solicitudes' USING ERRCODE='PT429'; END IF;

  -- Cupo real (si el evento tiene capacity). acompañantes cuentan como asistentes.
  IF v_ev.capacity IS NOT NULL THEN
    SELECT coalesce(sum(1 + acompanantes), 0) INTO v_cnt FROM public.event_registrations
      WHERE event_slug = v_slug AND status <> 'cancelled';
    IF v_cnt + 1 + v_nacomp > v_ev.capacity THEN RAISE EXCEPTION 'cupo_completo' USING ERRCODE='22023'; END IF;
  END IF;

  -- Alta de la reserva (el server pone token/code/status/email_status)
  INSERT INTO public.event_registrations (event_slug, nombre, email, celular, iglesia, como_se_entero, acompanantes)
  VALUES (v_slug, v_nombre, v_email, v_celu, nullif(v_iglesia,''), nullif(v_como,''), v_nacomp)
  RETURNING * INTO v_reg;

  -- Acompañantes
  FOR g IN SELECT jsonb_array_elements(v_guests) LOOP
    INSERT INTO public.event_guests (registration_id, nombre, email, celular)
    VALUES (v_reg.id,
            nullif(public._event_clean(g->>'nombre', 120), ''),
            nullif(lower(public._event_clean(g->>'email', 160)), ''),
            nullif(public._event_clean(g->>'celular', 40), ''));
  END LOOP;

  -- Encolado del correo (best-effort: si falla, la reserva sigue válida y el
  -- pastor puede reenviar; la persona igual ve su entrada por el token).
  BEGIN
    -- Cursor de goteo: ~1 correo cada 10 min (reusa email_throttle). El primero ~ahora.
    INSERT INTO public.email_throttle (key, last_sent_at)
    VALUES ('event_drip:' || v_slug, now())
    ON CONFLICT (key) DO UPDATE
      SET last_sent_at = greatest(now(), email_throttle.last_sent_at) + interval '10 minutes';
    SELECT last_sent_at INTO v_slot FROM public.email_throttle WHERE key = 'event_drip:' || v_slug;
    -- La 1ra vez el ON CONFLICT no corre -> last_sent_at=now(); si corrió, ya sumó 10'.

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
    -- no abortamos la reserva por un problema de encolado
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
$fn$;

REVOKE ALL ON FUNCTION public.event_register(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_register(jsonb) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) RPC event_ticket(token) — datos SEGUROS de la entrada (sin email/teléfono).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.event_ticket(p_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'nombre', r.nombre,
    'acompanantes', r.acompanantes,
    'personas', 1 + r.acompanantes,
    'code', upper(left(r.ticket_token, 6)),
    'status', r.status,
    'checked_in_at', r.checked_in_at,
    'titulo', e.titulo,
    'fecha', e.fecha_texto,
    'lugar', e.lugar_texto,
    'token', r.ticket_token
  )
  FROM public.event_registrations r
  JOIN public.event_events e ON e.slug = r.event_slug
  WHERE r.ticket_token = p_token;
$$;

REVOKE ALL ON FUNCTION public.event_ticket(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_ticket(text) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) RPC event_check_in(token) — marca ingreso en la puerta. Pastor o líder.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.event_check_in(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_reg public.event_registrations%ROWTYPE; v_already boolean := false;
BEGIN
  IF coalesce((SELECT public.auth_role()) IN ('pastor','leader'), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'no_autorizado' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_reg FROM public.event_registrations WHERE ticket_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_existe'); END IF;
  IF v_reg.status = 'cancelled' THEN RETURN jsonb_build_object('ok', false, 'reason', 'cancelada', 'nombre', v_reg.nombre); END IF;
  IF v_reg.checked_in_at IS NOT NULL THEN
    v_already := true;
  ELSE
    UPDATE public.event_registrations
      SET checked_in_at = now(), checked_in_by = public.my_member_id(), updated_at = now()
      WHERE id = v_reg.id
      RETURNING * INTO v_reg;
  END IF;
  RETURN jsonb_build_object(
    'ok', true, 'already', v_already,
    'nombre', v_reg.nombre, 'personas', 1 + v_reg.acompanantes,
    'checked_in_at', v_reg.checked_in_at);
END;
$fn$;

REVOKE ALL ON FUNCTION public.event_check_in(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_check_in(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.event_check_in(text) FROM anon;  -- default-ACL de Supabase

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) RPC event_resend(id, new_email?) — pastor: edita el correo y reencola.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.event_resend(p_id uuid, p_new_email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE
  v_reg public.event_registrations%ROWTYPE; v_ev public.event_events%ROWTYPE;
  v_email text; v_queue_id uuid; v_grupo_txt text; v_url text;
BEGIN
  IF coalesce(public.is_pastor(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'no_autorizado' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_reg FROM public.event_registrations WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_existe' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_ev FROM public.event_events WHERE slug = v_reg.event_slug;

  v_email := lower(public._event_clean(coalesce(p_new_email, v_reg.email), 160));
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'email_invalido' USING ERRCODE='22023'; END IF;

  IF p_new_email IS NOT NULL AND v_email <> v_reg.email THEN
    UPDATE public.event_registrations SET email = v_email, updated_at = now() WHERE id = p_id;
  END IF;

  v_grupo_txt := CASE WHEN v_reg.acompanantes = 0 THEN 'una entrada (vos)'
                      ELSE 'una entrada para vos y ' || v_reg.acompanantes || ' acompañante' ||
                           CASE WHEN v_reg.acompanantes = 1 THEN '' ELSE 's' END ||
                           ' (' || (1 + v_reg.acompanantes) || ' personas)' END;
  v_url := 'https://adorapp.net.ar/thechosen/entrada/' || v_reg.ticket_token;

  INSERT INTO public.email_queue (template_slug, to_email, to_nombre, variables, prioridad, programado_para, status)
  VALUES ('evento-entrada-thechosen', v_email, v_reg.nombre,
          jsonb_build_object(
            'nombre', public._html_escape(split_part(v_reg.nombre, ' ', 1)),
            'grupo', v_grupo_txt, 'ticket_url', v_url,
            'fecha', public._html_escape(v_ev.fecha_texto),
            'lugar', public._html_escape(v_ev.lugar_texto)),
          9, now(), 'pending')
  RETURNING id INTO v_queue_id;

  UPDATE public.event_registrations SET email_status = 'pending', email_queued_id = v_queue_id, updated_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'email', v_email);
END;
$fn$;

REVOKE ALL ON FUNCTION public.event_resend(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_resend(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.event_resend(uuid, text) FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) RPC event_set_open(slug, open) — pastor: abrir/cerrar inscripciones.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.event_set_open(p_slug text, p_open boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
  IF coalesce(public.is_pastor(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'no_autorizado' USING ERRCODE='42501';
  END IF;
  UPDATE public.event_events SET registration_open = p_open, updated_at = now() WHERE slug = p_slug;
  RETURN jsonb_build_object('ok', FOUND, 'open', p_open);
END;
$fn$;

REVOKE ALL ON FUNCTION public.event_set_open(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_set_open(text, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.event_set_open(text, boolean) FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) SEED del evento + plantilla de correo
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.event_events (slug, titulo, fecha_texto, lugar_texto, registration_open, closes_at, capacity)
VALUES ('thechosen',
        'The Chosen — Temporada 6 · Episodio 1',
        'Sábado 31 de octubre · 19:30 hs',
        'Auditorio CAF — San Lorenzo 2738, San Martín',
        true,
        '2026-10-30 23:59:00-03'::timestamptz,   -- cierre: un día antes
        NULL)
ON CONFLICT (slug) DO NOTHING;

-- Plantilla de correo (body_html full-custom, oscuro/cine). El send-emails la
-- renderiza RAW con {{var}}; el nombre ya viene escapado desde la RPC (landmine #70).
INSERT INTO public.email_templates (slug, asunto, from_label, body_html, activo, mostrar_logo, descripcion)
VALUES (
  'evento-entrada-thechosen',
  'Tu entrada para The Chosen (Temporada 6) ya está lista 🎬',
  'adorapp',
  $body$<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0806;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0806;">
<tr><td align="center" style="padding:26px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#120d07;border-radius:16px;border:1px solid rgba(217,180,90,.26);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td style="padding:0;"><img src="https://adorapp.net.ar/thechosen-email.jpg" width="600" alt="The Chosen — Temporada 6" style="width:100%;max-width:600px;height:auto;display:block;border:0;"></td></tr>
  <tr><td style="padding:30px 34px 10px;">
    <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#a9863c;font-weight:700;">Tu entrada está lista</div>
    <div style="font-size:24px;font-weight:700;color:#f3ecdc;line-height:1.3;margin-top:8px;">¡Hola {{nombre}}! Nos vemos el 31.</div>
    <p style="font-size:15px;line-height:1.7;color:#b7ac93;margin:14px 0 0;">Reservaste {{grupo}}. Guardá este correo: tu entrada con <strong style="color:#f3ecdc;">código QR</strong> te espera en el botón de abajo. La mostrás en la puerta el día del evento.</p>
  </td></tr>
  <tr><td style="padding:16px 34px 6px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="border-radius:10px;background:linear-gradient(180deg,#f0cd72,#d9b45a);">
        <a href="{{ticket_url}}" style="display:inline-block;padding:15px 30px;font-size:16px;font-weight:800;color:#2a1e07;text-decoration:none;border-radius:10px;">Ver mi entrada con QR</a>
      </td></tr></table>
  </td></tr>
  <tr><td style="padding:18px 34px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(217,180,90,.14);">
      <tr><td style="padding:16px 0 2px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#7d745f;">Cuándo</td></tr>
      <tr><td style="padding:0 0 10px;font-size:15px;color:#f3ecdc;font-weight:600;">{{fecha}}</td></tr>
      <tr><td style="padding:0 0 2px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#7d745f;">Dónde</td></tr>
      <tr><td style="padding:0 0 10px;font-size:15px;color:#f3ecdc;font-weight:600;">{{lugar}}</td></tr>
      <tr><td style="padding:0 0 2px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#7d745f;">Entrada</td></tr>
      <tr><td style="padding:0 0 4px;font-size:15px;color:#f0cd72;font-weight:600;">100% gratuita · Cortesía de Come and See</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:22px 34px 28px;border-top:1px solid rgba(217,180,90,.14);text-align:center;font-size:12px;color:#7d745f;line-height:1.7;">
    Organiza <strong style="color:#b7ac93;">Avivamiento Jóvenes</strong> · Centro de Avivamiento Familiar<br>
    Powered by <strong style="color:#a9863c;">AdorApp</strong>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>$body$,
  true, false,
  'Entrada del evento The Chosen T6 — correo con botón a la entrada web con QR'
)
ON CONFLICT (slug) DO UPDATE
  SET asunto = EXCLUDED.asunto, body_html = EXCLUDED.body_html, from_label = EXCLUDED.from_label,
      mostrar_logo = EXCLUDED.mostrar_logo, descripcion = EXCLUDED.descripcion, activo = true, updated_at = now();
