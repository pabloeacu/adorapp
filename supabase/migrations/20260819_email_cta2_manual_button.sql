-- ============================================================================
-- Emails Gmail — 2º botón (CTA secundaria) para los correos.
-- ============================================================================
-- Motivo: en el correo de bienvenida (registro-aprobado) el manual iba como un
-- enlace de texto inline dentro del cuerpo — fácil de no ver, y sin la URL en la
-- versión de texto plano. Paul pidió un BOTÓN propio y claro, separado del de
-- "Entrar a AdorAPP". Se agrega soporte genérico de una 2ª CTA (outline) que el
-- worker send-emails renderiza debajo de la CTA primaria.
--
-- Aditivo: columnas nullable; los otros 3 correos quedan con cta2 NULL → sin 2º
-- botón, sin cambios. Sin GRANT nuevo (columnas heredan el de la tabla). RLS intacta.
-- ============================================================================

ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS cta2_text text,
  ADD COLUMN IF NOT EXISTS cta2_url  text;

-- registro-aprobado: botón separado para el manual + se quita el link inline del
-- cuerpo (era un enlace de texto fácil de no ver y sin URL en el texto plano).
UPDATE public.email_templates SET
  cuerpo_html = 'Hola {{nombre}}, ¡tu solicitud fue aprobada! 🎉 Ya podés entrar a AdorAPP con estos datos:<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;border-left:3px solid #b7791f;background:#faf7ef;border-radius:6px;"><tr><td style="padding:14px 16px;font-size:15px;color:#111827;line-height:1.8;"><strong>Usuario:</strong> {{email}}<br><strong>Contraseña:</strong> {{password}}</td></tr></table>Te recomendamos cambiar la contraseña la primera vez que entres, desde tu perfil.<br><br>Con los botones de abajo entrás a la plataforma y descargás el instructivo, que te lleva de la mano por los primeros pasos y por todas las secciones.',
  cta2_text = 'Hacé click acá para descargar el manual',
  cta2_url  = '{{url_manual}}'
WHERE slug = 'registro-aprobado';
