-- =============================================================================
-- Recuperar contraseña (autoservicio) — base para la Edge Function `auth-password-reset`
-- -----------------------------------------------------------------------------
-- Circuito (ver CLAUDE.md · Estado 2026-11-23):
--   1) /recuperar  → EF action=request  → gate (esta migración) → generateLink(recovery)
--                    → correo `recuperar-contrasena` (carril exprés, prioridad 0)
--   2) /restablecer?th=<token_hash> → EF action=complete → verifyOtp + updateUser
--                    → cierra las otras sesiones → correo `contrasena-actualizada`
--
-- Lo que vive acá:
--   * `password_reset_requests`: auditoría + freno anti-abuso (server-only).
--   * `password_reset_gate(email, ip, ua)`: compuerta atómica (advisory lock por correo)
--     que aplica los límites y devuelve la ficha elegible SOLO al servidor.
--   * Dos plantillas de correo (editables por los pastores como las demás).
--   * `purge_technical_logs` poda la tabla nueva (>90 días).
--
-- Seguridad: la tabla y la RPC son service_role-only (REVOKE de anon/authenticated,
-- FORCE RLS sin policies). El token de recuperación lo genera/valida Supabase Auth
-- (hasheado, un solo uso, vence por otp_expiry); acá NUNCA se guarda.
-- =============================================================================

-- 1) Auditoría + freno ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.password_reset_requests (
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

CREATE INDEX IF NOT EXISTS idx_prr_email_created ON public.password_reset_requests (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prr_ip_created    ON public.password_reset_requests (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prr_created       ON public.password_reset_requests (created_at);
CREATE INDEX IF NOT EXISTS idx_prr_user_id       ON public.password_reset_requests (user_id);

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_reset_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.password_reset_requests_id_seq TO service_role;

COMMENT ON TABLE public.password_reset_requests IS
  'Pedidos de recuperación de contraseña (autoservicio). Server-only: lo escribe la EF auth-password-reset vía password_reset_gate. Sirve de freno anti-abuso y de auditoría. Podada a 90 días por purge_technical_logs.';

-- 2) Compuerta atómica ---------------------------------------------------------
-- Devuelve jsonb: { ok, id, reason, member: {id, name, user_id, auth_email} | null }
--   ok=false → la EF responde igual que si hubiera enviado (anti-enumeración) y NO manda nada.
--   ok=true y member=null → correo no registrado / ficha inactiva / sin cuenta → tampoco manda.
-- Límites (todos server-side; el cliente no se puede confiar):
--   * mismo correo: 3 pedidos atendidos cada 15 min y 6 cada 24 h (solo cuentan los que
--     pasaron la compuerta: requested/sent/completed/failed; los 'limited' no extienden el
--     bloqueo, así un atacante no puede dejar a la víctima sin poder pedir para siempre).
--   * misma IP: 10 pedidos (de cualquier tipo) cada 15 min.
--   * global: 120 pedidos por hora (backstop ante un enjambre).
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
  IF v_email = '' OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('ok', false, 'id', NULL, 'reason', 'email_invalido', 'member', NULL);
  END IF;

  -- Serializa pedidos simultáneos del mismo correo (doble tap / ráfaga).
  PERFORM pg_advisory_xact_lock(hashtext('password_reset_gate:' || v_email)::bigint);

  SELECT count(*) INTO v_n_15 FROM public.password_reset_requests
    WHERE email = v_email AND stage IN ('requested','sent','completed','failed')
      AND created_at > now() - interval '15 minutes';
  SELECT count(*) INTO v_n_24h FROM public.password_reset_requests
    WHERE email = v_email AND stage IN ('requested','sent','completed','failed')
      AND created_at > now() - interval '24 hours';
  SELECT count(*) INTO v_n_ip FROM public.password_reset_requests
    WHERE v_ip <> '' AND ip = v_ip AND created_at > now() - interval '15 minutes';
  SELECT count(*) INTO v_n_glob FROM public.password_reset_requests
    WHERE created_at > now() - interval '1 hour';

  IF v_n_glob >= 120 THEN v_reason := 'global_limited';
  ELSIF v_n_ip >= 10 THEN v_reason := 'ip_limited';
  ELSIF v_n_15 >= 3 OR v_n_24h >= 6 THEN v_reason := 'email_cooldown';
  END IF;

  IF v_reason IS NOT NULL THEN
    INSERT INTO public.password_reset_requests (email, ip, user_agent, stage, reason)
    VALUES (v_email, NULLIF(v_ip, ''), NULLIF(v_ua, ''), 'limited', v_reason)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', false, 'id', v_id, 'reason', v_reason, 'member', NULL);
  END IF;

  -- Ficha elegible: ACTIVA, con cuenta de auth vinculada, no baneada y con el mismo correo.
  -- Se lee auth.users como owner (postgres): la EF nunca ve nada de otros correos.
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

  INSERT INTO public.password_reset_requests (email, ip, user_agent, stage, reason, user_id)
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

REVOKE EXECUTE ON FUNCTION public.password_reset_gate(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.password_reset_gate(text, text, text) TO service_role;

COMMENT ON FUNCTION public.password_reset_gate(text, text, text) IS
  'Compuerta anti-abuso + lookup de ficha elegible para la recuperación de contraseña. Service_role-only (la llama la EF auth-password-reset). Inserta la fila de auditoría.';

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

-- 4) Poda (retención 90 días, igual que el resto de los logs técnicos) -----------
-- Mismo cuerpo que la versión vigente + la tabla nueva. Se re-asertan los grants
-- (landmine #39): ACL objetivo {postgres, service_role}.
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
  DELETE FROM public.error_log WHERE occurred_at < now() - interval '90 days';
  DELETE FROM public.admin_action_events WHERE at < now() - interval '1 day';
  DELETE FROM public.event_staff_hits WHERE at < now() - interval '30 days';
  DELETE FROM public.password_reset_requests WHERE created_at < now() - interval '90 days';
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.error_log (message, severity, context)
    VALUES ('purge_technical_logs: fallo', 'error', jsonb_build_object('error', SQLERRM));
  EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.purge_technical_logs() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_technical_logs() TO service_role;
