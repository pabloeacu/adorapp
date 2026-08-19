-- ============================================================================
-- Comunicaciones multicanal — la sección "Enviar" de Comunicaciones puede mandar
-- por campanita (push), por correo, o por ambos. Aditivo, no rompe el flujo push.
-- ============================================================================

-- (1) Registrar en communications qué canales se usaron. Aditivo; las filas viejas
-- (que eran solo push) quedan con el default ['push'].
ALTER TABLE public.communications
  ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT ARRAY['push']::text[];

-- (2) Plantilla de correo para las comunicaciones del pastor. El título es FIJO
-- ("Comunicación Adoración CAF"); el asunto y el mensaje los completa el pastor en
-- cada envío (variables {{asunto}} / {{mensaje}} que llena la Edge Function
-- admin-send-communication). Respeta el layout con logo como el resto de los correos.
-- Es una plantilla de SISTEMA: no se muestra en el editor de "Plantillas de correo".
INSERT INTO public.email_templates
  (slug, descripcion, asunto, from_label, reply_to, kicker, titulo, cuerpo_html,
   cta_text, cta_url, color_acento, mostrar_logo, firma, body_html, body_text, activo)
VALUES
  ('comunicacion', 'Comunicación del ministerio (multicanal)', '{{asunto}}', 'adorapp', NULL,
   'ADORACIÓN CAF', 'Comunicación Adoración CAF', '{{mensaje}}',
   NULL, NULL, '#b7791f', true, 'Ministerio de Adoración · Adoración CAF', NULL,
   '{{mensaje_texto}}' || E'\n\n— Ministerio de Adoración · Adoración CAF' || E'\nadorapp.net.ar',
   true)
ON CONFLICT (slug) DO NOTHING;
