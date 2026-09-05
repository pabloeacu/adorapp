-- Plantillas de correo para "Solicitar colaboración". Estilo dorado del ministerio.
-- Variables entre {{ }} las completa la Edge Function collab por destinatario.
-- ON CONFLICT (slug) DO NOTHING: no pisa nada existente.

INSERT INTO public.email_templates
  (slug, descripcion, asunto, kicker, titulo, cuerpo_html, cta_text, cta_url, color_acento, mostrar_logo, firma, activo)
VALUES
  ('colaboracion-solicitud',
   'Aviso a los elegibles: se busca un reemplazo para un servicio',
   'Se busca {{categorias}} para {{banda}}',
   'Colaboración | Adoración CAF',
   '¿Nos das una mano?',
   'Hola {{nombre}}, en <strong>{{banda}}</strong> se necesita <strong>{{categorias}}</strong> para el servicio del <strong>{{fecha}}</strong>.<br><br>Si podés colaborar, ofrecete con un toque desde la app.',
   'Yo me ofrezco', 'https://adorapp.net.ar/',
   '#b8860b', true, 'Ministerio de Adoración · Adoración CAF', true),

  ('colaboracion-voluntario',
   'Aviso al que pidió: un voluntario se ofreció',
   '{{voluntario}} se ofreció a colaborar',
   'Colaboración | Adoración CAF',
   'Tenés un voluntario',
   'Hola {{nombre}}, <strong>{{voluntario}}</strong> se ofreció para tu solicitud de <strong>{{categorias}}</strong> en <strong>{{banda}}</strong>.<br><br>Entrá para elegir y cubrir la colaboración.',
   'Ver voluntarios', 'https://adorapp.net.ar/',
   '#b8860b', true, 'Ministerio de Adoración · Adoración CAF', true),

  ('colaboracion-aceptado',
   'Aviso al voluntario elegido: gracias + ya tenés acceso',
   '¡Gracias! Ya sos parte de {{banda}}',
   'Colaboración | Adoración CAF',
   '¡Gracias por colaborar!',
   'Hola {{nombre}}, ya estás sumado a <strong>{{banda}}</strong> para el servicio del <strong>{{fecha}}</strong>. Tenés acceso a todo lo que necesitás en la app. ¡Gracias por servir! 🙏',
   'Ir a la app', 'https://adorapp.net.ar/',
   '#b8860b', true, 'Ministerio de Adoración · Adoración CAF', true),

  ('colaboracion-cubierto',
   'Aviso a los voluntarios no elegidos: gracias + la vacante se cubrió',
   '¡Gracias por ofrecerte!',
   'Colaboración | Adoración CAF',
   'La colaboración ya está cubierta',
   'Hola {{nombre}}, ¡gracias por ofrecerte para <strong>{{banda}}</strong>! Esta vez la vacante ya quedó cubierta, pero tu disposición vale muchísimo. 🙏',
   NULL, NULL,
   '#b8860b', true, 'Ministerio de Adoración · Adoración CAF', true)
ON CONFLICT (slug) DO NOTHING;

-- Rollback: DELETE FROM public.email_templates WHERE slug IN
--   ('colaboracion-solicitud','colaboracion-voluntario','colaboracion-aceptado','colaboracion-cubierto');
