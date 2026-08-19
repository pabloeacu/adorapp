-- ============================================================================
-- Email transaccional con Gmail — Fase 1: infraestructura de datos
-- ============================================================================
-- Cola + plantillas + throttle + log de enviados, según el handoff de
-- entregabilidad (Adorapp-Emails-Gmail-Handoff.md §4).
--
-- Diseño:
--   * Toda la app encola por UNA puerta: la función `encolar_email(...)`.
--   * El worker (Edge Function `send-emails`, Fase 3) corre con service_role
--     (bypassa RLS) y es el único que marca `enviado_at` / escribe `sent_emails`
--     / mueve el throttle.
--   * Los pastores ven el panel (SELECT) y editan las plantillas (UPDATE).
--   * Nada de secretos acá. El worker lee las credenciales de Google de sus
--     secrets (Fase 2), nunca de la DB ni del cliente.
--
-- Seguridad (CLAUDE.md): RLS en las 4 tablas, GRANT explícito a authenticated
-- (regla #7), y la función `encolar_email` es SECURITY DEFINER con search_path
-- fijo y REVOKE del RPC público (landmine de funciones internas).
-- Cero impacto en tablas existentes: es puro agregado.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) email_templates — plantillas por slug (layout "opción B" + fallback)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_templates (
  slug          text PRIMARY KEY,
  descripcion   text,                              -- nombre humano para el panel
  asunto        text NOT NULL,                     -- soporta {{variables}}
  from_label    text NOT NULL DEFAULT 'adorapp',   -- etiqueta → dirección real en el worker
  reply_to      text,                              -- override opcional
  activo        boolean NOT NULL DEFAULT true,
  -- Cuerpo, opción B (el worker arma el HTML final desde estos campos):
  kicker        text,                              -- línea corta en mayúsculas
  titulo        text,
  cuerpo_html   text,                              -- párrafo(s) con {{variables}}
  cta_text      text,                              -- texto del botón (opcional)
  cta_url       text,                              -- URL del botón (RAW, con {{variables}})
  color_acento  text NOT NULL DEFAULT '#6366f1',   -- validado ^#[0-9a-fA-F]{6}$ en el worker
  mostrar_logo  boolean NOT NULL DEFAULT true,
  firma         text,
  -- Fallback (opción A) por si una plantilla trae HTML entero (lección E-GG-74):
  body_html     text,
  body_text     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_templates IS
  'Plantillas de email transaccional por slug. Editables por pastores en Comunicaciones. El worker arma el HTML desde los campos de layout (o cae a body_html/body_text).';

-- ---------------------------------------------------------------------------
-- 2) email_queue — la cola
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_slug   text NOT NULL REFERENCES public.email_templates(slug) ON DELETE RESTRICT,
  to_email        text NOT NULL,
  to_nombre       text,
  variables       jsonb NOT NULL DEFAULT '{}'::jsonb,
  prioridad       smallint NOT NULL DEFAULT 5,     -- menor = antes (signup/reset alto)
  programado_para timestamptz NOT NULL DEFAULT now(),
  enviado_at      timestamptz,                     -- marca de "no reprocesar"
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sending','sent','failed','cancelled')),
  intento         smallint NOT NULL DEFAULT 0,
  max_intentos    smallint NOT NULL DEFAULT 5,
  ultimo_error    text,
  attachments     jsonb,                           -- opcional; la mayoría no lleva
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- El worker toma el próximo job barato con este índice parcial:
CREATE INDEX IF NOT EXISTS idx_email_queue_next
  ON public.email_queue (prioridad, programado_para)
  WHERE enviado_at IS NULL;

COMMENT ON TABLE public.email_queue IS
  'Cola de emails. Se escribe SOLO vía encolar_email() o el worker (service_role). enviado_at IS NULL = pendiente.';

-- ---------------------------------------------------------------------------
-- 3) email_throttle — 1 fila, el ritmo global
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_throttle (
  key           text PRIMARY KEY,
  last_sent_at  timestamptz
);
INSERT INTO public.email_throttle (key, last_sent_at)
  VALUES ('global', NULL)
  ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4) sent_emails — log de lo enviado (auditoría + base para rebotes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sent_emails (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email        text NOT NULL,
  from_email      text,
  reply_to        text,
  asunto          text,
  template_slug   text,
  estado          text NOT NULL DEFAULT 'sent'
                    CHECK (estado IN ('sent','bounced','complaint')),
  provider_msg_id text,                            -- id que devuelve Gmail
  dsn_msg_id      text UNIQUE,                     -- idempotencia de rebotes (Fase 8)
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sent_emails_to_email ON public.sent_emails (to_email);
CREATE INDEX IF NOT EXISTS idx_sent_emails_created  ON public.sent_emails (created_at);

COMMENT ON TABLE public.sent_emails IS
  'Log de emails efectivamente enviados. Base para rebotes/DSN (Fase 8). Escrito por el worker (service_role).';

-- ---------------------------------------------------------------------------
-- updated_at automático en email_templates (reusa el trigger existente)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- RLS — todas las tablas con RLS habilitado
-- ============================================================================
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_queue     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_throttle  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sent_emails     ENABLE ROW LEVEL SECURITY;

-- email_templates: los pastores leen y editan la copia. No INSERT/DELETE desde
-- el cliente (los slugs son un contrato fijo, los crea/borra la migración).
-- El worker lee vía service_role (bypassa RLS).
CREATE POLICY email_templates_select_pastor ON public.email_templates
  FOR SELECT TO authenticated USING ((SELECT public.is_pastor()));
CREATE POLICY email_templates_update_pastor ON public.email_templates
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_pastor())) WITH CHECK ((SELECT public.is_pastor()));

-- email_queue / sent_emails / throttle: solo lectura para pastores (panel).
-- La escritura pasa por encolar_email() (SECURITY DEFINER) o el worker.
CREATE POLICY email_queue_select_pastor ON public.email_queue
  FOR SELECT TO authenticated USING ((SELECT public.is_pastor()));
CREATE POLICY sent_emails_select_pastor ON public.sent_emails
  FOR SELECT TO authenticated USING ((SELECT public.is_pastor()));
CREATE POLICY email_throttle_select_pastor ON public.email_throttle
  FOR SELECT TO authenticated USING ((SELECT public.is_pastor()));

-- ============================================================================
-- GRANTs (CLAUDE.md regla #7): exponer las tablas nuevas al Data API para
-- `authenticated`. RLS ya restringe el alcance real a pastores.
-- ============================================================================
GRANT SELECT, UPDATE ON public.email_templates TO authenticated;
GRANT SELECT         ON public.email_queue      TO authenticated;
GRANT SELECT         ON public.sent_emails      TO authenticated;
GRANT SELECT         ON public.email_throttle   TO authenticated;

-- ============================================================================
-- Función de encolado — la ÚNICA puerta de entrada a la cola
-- ============================================================================
CREATE OR REPLACE FUNCTION public.encolar_email(
  p_slug      text,
  p_to_email  text,
  p_to_nombre text DEFAULT NULL,
  p_variables jsonb DEFAULT '{}'::jsonb,
  p_prioridad smallint DEFAULT 5
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id    uuid;
  v_email text;
BEGIN
  -- La plantilla debe existir y estar activa.
  IF NOT EXISTS (
    SELECT 1 FROM public.email_templates
    WHERE slug = p_slug AND activo = true
  ) THEN
    RAISE EXCEPTION 'encolar_email: plantilla inexistente o inactiva: %', p_slug
      USING ERRCODE = 'P0001';
  END IF;

  -- Normalizar PRIMERO (trim + lower), validar DESPUÉS: así un email con espacios
  -- o mayúsculas del caller se acepta y se guarda canónico. (Bug de orden que
  -- cazó la QA transaccional el 18-ago.)
  v_email := lower(trim(COALESCE(p_to_email, '')));
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'encolar_email: email destino invalido: %', p_to_email
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.email_queue (template_slug, to_email, to_nombre, variables, prioridad)
  VALUES (p_slug, v_email, p_to_nombre, COALESCE(p_variables, '{}'::jsonb),
          COALESCE(p_prioridad, 5))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.encolar_email(text, text, text, jsonb, smallint) IS
  'Única puerta de entrada a email_queue. La llaman los triggers/crons (definer) y el worker (service_role). Blindada del RPC público con REVOKE.';

-- Blindaje del RPC público (landmine): solo service_role (y postgres) ejecutan.
-- Los triggers/crons que la llaman corren como su propio definer (postgres).
REVOKE ALL ON FUNCTION public.encolar_email(text, text, text, jsonb, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encolar_email(text, text, text, jsonb, smallint) TO service_role;

-- ============================================================================
-- Seed de las 4 plantillas (copia inicial sobria/transaccional — editable
-- luego desde Comunicaciones en la Fase 5). Slugs = contrato estable.
-- ============================================================================
INSERT INTO public.email_templates
  (slug, descripcion, asunto, kicker, titulo, cuerpo_html, cta_text, cta_url, firma, body_text)
VALUES
  ('registro-pendiente',
   'Registro recibido — en espera de aprobación',
   'Recibimos tu solicitud para AdorAPP',
   'ADORACIÓN CAF',
   'Tu solicitud está en revisión',
   'Hola {{nombre}}, recibimos tu solicitud para sumarte a AdorAPP, la plataforma del ministerio de adoración. Un pastor la va a revisar y, cuando la apruebe, te vamos a enviar tus datos de acceso a este mismo correo.',
   NULL, NULL,
   'Ministerio de Adoración · Adoración CAF',
   'Hola {{nombre}}, recibimos tu solicitud para AdorAPP. Un pastor la va a revisar y, cuando la apruebe, te enviaremos tus datos de acceso a este correo. — Ministerio de Adoración · Adoración CAF'),

  ('registro-aprobado',
   'Aprobación con usuario + contraseña + manual',
   'Tu acceso a AdorAPP ya está listo',
   'ADORACIÓN CAF',
   '¡Bienvenido/a a AdorAPP!',
   'Hola {{nombre}}, tu solicitud fue aprobada. Ya podés entrar a AdorAPP con estos datos:<br><br><strong>Usuario:</strong> {{email}}<br><strong>Contraseña:</strong> {{password}}<br><br>Te recomendamos cambiar la contraseña la primera vez que entres, desde tu perfil. También preparamos un instructivo para ayudarte a empezar.',
   'Entrar a AdorAPP',
   '{{url_login}}',
   'Ministerio de Adoración · Adoración CAF',
   'Hola {{nombre}}, tu solicitud fue aprobada. Entrá a AdorAPP en {{url_login}} con usuario {{email}} y contraseña {{password}} (cambiala la primera vez). Instructivo: {{url_manual}} — Ministerio de Adoración · Adoración CAF'),

  ('nuevo-orden',
   'Aviso de nuevo orden programado',
   'Nuevo orden programado en AdorAPP',
   'ADORACIÓN CAF',
   'Se programó un nuevo orden',
   'Hola {{nombre}}, se programó un nuevo orden para el {{fecha}}{{banda_sufijo}}. Podés ver las canciones, tu tono y prepararte desde la plataforma.',
   'Ver el orden',
   '{{url}}',
   'Ministerio de Adoración · Adoración CAF',
   'Hola {{nombre}}, se programó un nuevo orden para el {{fecha}}{{banda_sufijo}}. Velo en {{url}} — Ministerio de Adoración · Adoración CAF'),

  ('recordatorio-ensayo',
   'Recordatorio de ensayo personal',
   'Recordatorio: preparate para el próximo orden',
   'ADORACIÓN CAF',
   'Tu ensayo te espera',
   'Hola {{nombre}}, se acerca el orden del {{fecha}}. Aprovechá para repasar tus canciones en "Mi Ensayo": marcá tus pasadas, escuchá los acordes en tu tono y llegá listo/a al ensamble.',
   'Ir a Mi Ensayo',
   '{{url}}',
   'Ministerio de Adoración · Adoración CAF',
   'Hola {{nombre}}, se acerca el orden del {{fecha}}. Repasá en Mi Ensayo: {{url}} — Ministerio de Adoración · Adoración CAF')
ON CONFLICT (slug) DO NOTHING;
