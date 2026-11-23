-- =============================================================================
-- Recuperar contraseña (autoservicio) — base para la Edge Function `auth-password-reset`
-- -----------------------------------------------------------------------------
-- Circuito (ver CLAUDE.md · Estado 2026-11-23):
--   1) /recuperar  → EF action=request  → gate (esta migración) → generateLink(recovery)
--                    → correo `recuperar-contrasena` (carril exprés, prioridad 0)
--   2) /restablecer?th=<token_hash> → EF action=complete → verifyOtp + updateUser
--                    → cierra las otras sesiones → correo `contrasena-actualizada`
--
-- Lo que vive acá (APLICADA a prod el 2026-11-23 vía execute_sql):
--   * `private.password_reset_requests`: auditoría + freno anti-abuso. Vive en `private`
--     (esquema NO expuesto por la API: anon/authenticated/service_role no tienen USAGE),
--     así no necesita RLS ni REVOKE para estar fuera del alcance del cliente.
--   * `private.is_server_call()`: true solo sin JWT (SQL directo/cron) o con rol service_role.
--   * RPCs en public (SECURITY DEFINER) con esa guarda ADENTRO del cuerpo → aunque tengan
--     el EXECUTE por defecto para anon/authenticated, un cliente recibe 42501:
--     `password_reset_gate` (frenos + lookup de ficha elegible), `password_reset_mark`,
--     `password_reset_complete`.
--   * Dos plantillas de correo (editables por los pastores como las demás).
-- La migración hermana `20261123_recuperar_contrasena_hardening.sql` suma el REVOKE
-- explícito de las RPCs y la poda (defensa en profundidad; la guarda interna ya alcanza).
--
-- Seguridad: el token de recuperación lo genera/valida Supabase Auth (hasheado, un solo
-- uso, vence por otp_expiry); acá NUNCA se guarda.
-- =============================================================================

CREATE TABLE IF NOT EXISTS private.password_reset_requests (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       text NOT NULL,                       -- normalizado (lower/trim)
  ip          text,
  user_agent  text,
  stage       text NOT NULL DEFAULT 'requested'
              CHECK (stage IN ('requested','sent','skipped','limited','completed','failed')),
  reason      text,                                -- motivo cuando no se envía (limited/skipped/failed)
  user_id     uuid,                                -- cuenta de auth (si existía ficha elegible)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prr_email_created ON private.password_reset_requests (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prr_ip_created    ON private.password_reset_requests (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prr_created       ON private.password_reset_requests (created_at);
CREATE INDEX IF NOT EXISTS idx_prr_user_id       ON private.password_reset_requests (user_id);
COMMENT ON TABLE private.password_reset_requests IS
  'Pedidos de recuperación de contraseña (autoservicio). Fuera de la API; la escribe la EF auth-password-reset vía RPCs password_reset_gate/_mark/_complete. Freno anti-abuso + auditoría.';

-- ¿La llamada viene del servidor? (service_role por PostgREST, o SQL directo/cron sin JWT)
CREATE OR REPLACE FUNCTION private.is_server_call()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_temp'
AS $function$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' IS NULL
      OR (COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role') = 'service_role';
$function$;

-- Compuerta atómica. Devuelve jsonb: { ok, id, reason, member: {id, name, user_id, auth_email} | null }
--   ok=false → la EF responde igual que si hubiera enviado (anti-enumeración) y NO manda nada.
--   ok=true y member=null → correo no registrado / ficha inactiva / sin cuenta → tampoco manda.
-- Límites (server-side): mismo correo 3 atendidos / 15 min y 6 / 24 h (los 'limited' no
-- extienden el bloqueo); misma IP 10 / 15 min; global 120 / hora.
CREATE OR REPLACE FUNCTION public.password_reset_gate(p_email text, p_ip text DEFAULT NULL, p_user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_email   text := lower(trim(COALESCE(p_email, '')));
  v_ip      text := left(COALESCE(p_ip, ''), 64);
  v_ua      text := left(COALESCE(p_user_agent, ''), 300);
  v_id      bigint;
  v_n_15    int;
  v_n_24h   int;
  v_n_ip    int;
  v_n_glob  int;
  v_reason  text := NULL;
  v_member  jsonb := NULL;
BEGIN
  IF NOT COALESCE(private.is_server_call(), false) THEN
    RAISE EXCEPTION 'password_reset_gate: solo servidor' USING ERRCODE = '42501';
  END IF;
  IF v_email = '' OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('ok', false, 'id', NULL, 'reason', 'email_invalido', 'member', NULL);
  END IF;

  -- Serializa pedidos simultáneos del mismo correo (doble tap / ráfaga).
  PERFORM pg_advisory_xact_lock(hashtext('password_reset_gate:' || v_email)::bigint);

  SELECT count(*) INTO v_n_15 FROM private.password_reset_requests
    WHERE email = v_email AND stage IN ('requested','sent','completed','failed')
      AND created_at > now() - interval '15 minutes';
  SELECT count(*) INTO v_n_24h FROM private.password_reset_requests
    WHERE email = v_email AND stage IN ('requested','sent','completed','failed')
      AND created_at > now() - interval '24 hours';
  SELECT count(*) INTO v_n_ip FROM private.password_reset_requests
    WHERE v_ip <> '' AND ip = v_ip AND created_at > now() - interval '15 minutes';
  SELECT count(*) INTO v_n_glob FROM private.password_reset_requests
    WHERE created_at > now() - interval '1 hour';

  IF v_n_glob >= 120 THEN v_reason := 'global_limited';
  ELSIF v_n_ip >= 10 THEN v_reason := 'ip_limited';
  ELSIF v_n_15 >= 3 OR v_n_24h >= 6 THEN v_reason := 'email_cooldown';
  END IF;

  IF v_reason IS NOT NULL THEN
    INSERT INTO private.password_reset_requests (email, ip, user_agent, stage, reason)
    VALUES (v_email, NULLIF(v_ip, ''), NULLIF(v_ua, ''), 'limited', v_reason)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', false, 'id', v_id, 'reason', v_reason, 'member', NULL);
  END IF;

  -- Ficha elegible: ACTIVA, con cuenta de auth vinculada, no baneada y con el mismo correo.
  SELECT jsonb_build_object('id', m.id, 'name', m.name, 'user_id', m.user_id, 'auth_email', u.email)
    INTO v_member
  FROM public.members m
  JOIN auth.users u ON u.id = m.user_id
  WHERE lower(m.email) = v_email
    AND m.active = true
    AND m.user_id IS NOT NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now())
    AND u.deleted_at IS NULL
  ORDER BY m.updated_at DESC
  LIMIT 1;

  INSERT INTO private.password_reset_requests (email, ip, user_agent, stage, reason, user_id)
  VALUES (
    v_email, NULLIF(v_ip, ''), NULLIF(v_ua, ''),
    CASE WHEN v_member IS NULL THEN 'skipped' ELSE 'requested' END,
    CASE WHEN v_member IS NULL THEN 'sin_ficha_elegible' ELSE NULL END,
    (v_member->>'user_id')::uuid
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'reason', NULL, 'member', v_member);
END;
$function$;
COMMENT ON FUNCTION public.password_reset_gate(text, text, text) IS
  'Compuerta anti-abuso + lookup de ficha elegible para la recuperación de contraseña. Solo servidor (guarda interna; la llama la EF auth-password-reset). Inserta la fila de auditoría.';

-- Marca una fila de auditoría (sent / failed / completed).
CREATE OR REPLACE FUNCTION public.password_reset_mark(p_id bigint, p_stage text, p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_n int;
BEGIN
  IF NOT COALESCE(private.is_server_call(), false) THEN
    RAISE EXCEPTION 'password_reset_mark: solo servidor' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_stage NOT IN ('sent','failed','completed') THEN RETURN false; END IF;
  UPDATE private.password_reset_requests
     SET stage = p_stage, reason = COALESCE(left(p_reason, 200), reason), updated_at = now()
   WHERE id = p_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$function$;

-- Al completar: el último pedido 'sent' de esa cuenta pasa a 'completed'.
CREATE OR REPLACE FUNCTION public.password_reset_complete(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id bigint;
BEGIN
  IF NOT COALESCE(private.is_server_call(), false) THEN
    RAISE EXCEPTION 'password_reset_complete: solo servidor' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN RETURN false; END IF;
  SELECT id INTO v_id FROM private.password_reset_requests
   WHERE user_id = p_user_id AND stage = 'sent'
   ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NULL THEN RETURN false; END IF;
  UPDATE private.password_reset_requests SET stage = 'completed', updated_at = now() WHERE id = v_id;
  RETURN true;
END;
$function$;

-- 3) Plantillas de correo ------------------------------------------------------
-- Heredan from_label/color/logo de `registro-aprobado` para que se vean como el resto.
-- TODO dato de usuario ({{nombre}}, {{dispositivo}}) llega ya escapado desde la EF
-- (cuerpo_html se renderiza RAW, landmine #70). {{enlace}} es nuestra URL + token hex.
INSERT INTO public.email_templates
  (slug, descripcion, asunto, from_label, reply_to, activo, kicker, titulo, cuerpo_html,
   cta_text, cta_url, color_acento, mostrar_logo, firma)
SELECT
  'recuperar-contrasena',
  'Recuperación de contraseña (autoservicio): enlace de un solo uso que vence en {{minutos}} minutos',
  'Restablecé tu contraseña de AdorAPP',
  t.from_label, t.reply_to, true,
  'ADORACIÓN CAF',
  'Restablecé tu contraseña',
  'Hola {{nombre}}, recibimos un pedido para crear una <strong>nueva contraseña</strong> de tu cuenta de AdorAPP.<br><br>'
  || 'Tocá el botón de abajo para elegirla. El enlace vale por <strong>{{minutos}} minutos</strong> y sirve una sola vez.'
  || '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 6px;width:100%;border-left:3px solid #b7791f;background:#faf7ef;border-radius:6px;"><tr><td style="padding:12px 16px;font-size:14px;color:#374151;line-height:1.6;">'
  || '🔒 <strong>¿No fuiste vos?</strong> Ignorá este correo: tu contraseña sigue siendo la misma y nadie puede cambiarla sin este enlace.'
  || '</td></tr></table>'
  || '<span style="font-size:13px;color:#6b7280;">Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br><span style="word-break:break-all;">{{enlace}}</span></span>',
  'Crear nueva contraseña',
  '{{enlace}}',
  COALESCE(t.color_acento, '#b8860b'), COALESCE(t.mostrar_logo, true),
  'Pastores de Adoración CAF'
FROM public.email_templates t WHERE t.slug = 'registro-aprobado'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.email_templates
  (slug, descripcion, asunto, from_label, reply_to, activo, kicker, titulo, cuerpo_html,
   cta_text, cta_url, color_acento, mostrar_logo, firma)
SELECT
  'contrasena-actualizada',
  'Confirmación de seguridad: la contraseña de la cuenta fue cambiada (autoservicio)',
  'Tu contraseña de AdorAPP fue actualizada',
  t.from_label, t.reply_to, true,
  'ADORACIÓN CAF · SEGURIDAD',
  'Tu contraseña fue actualizada',
  'Hola {{nombre}}, te avisamos que la contraseña de tu cuenta de AdorAPP se cambió el <strong>{{fecha}}</strong> a las <strong>{{hora}}</strong> (hora de Argentina){{dispositivo}}.<br><br>'
  || 'Por seguridad cerramos las demás sesiones abiertas de tu cuenta: si usás la app en otro teléfono o computadora, vas a tener que volver a ingresar con la contraseña nueva.'
  || '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 6px;width:100%;border-left:3px solid #c0392b;background:#fdf3f2;border-radius:6px;"><tr><td style="padding:12px 16px;font-size:14px;color:#374151;line-height:1.6;">'
  || '⚠️ <strong>¿No fuiste vos?</strong> Escribile a un pastor de inmediato para que protejamos tu cuenta.'
  || '</td></tr></table>',
  'Ingresar a AdorAPP',
  'https://adorapp.net.ar/login',
  COALESCE(t.color_acento, '#b8860b'), COALESCE(t.mostrar_logo, true),
  'Pastores de Adoración CAF'
FROM public.email_templates t WHERE t.slug = 'registro-aprobado'
ON CONFLICT (slug) DO NOTHING;

