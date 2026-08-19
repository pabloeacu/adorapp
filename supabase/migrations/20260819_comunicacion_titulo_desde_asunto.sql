-- ============================================================================
-- Comunicaciones multicanal — el asunto del pastor pasa a ser el TÍTULO del correo.
-- ============================================================================
-- Antes: el título grande del correo era fijo ("Comunicación Adoración CAF") y el
-- kicker dorado decía "ADORACIÓN CAF".
-- Ahora: el TÍTULO grande = el asunto que escribe el pastor ({{asunto}}), y el kicker
-- fijo pasa a "Comunicación | Adoración CAF". El cuerpo sigue siendo el mensaje.
-- Solo cambia la COPIA de la plantilla 'comunicacion'; el worker send-emails ya
-- sustituye {{asunto}} en el título (renderVars con escape) y ya recibe esa variable
-- desde admin-send-communication. Sin cambios de código.
-- ============================================================================
UPDATE public.email_templates
SET kicker = 'Comunicación | Adoración CAF',
    titulo = '{{asunto}}'
WHERE slug = 'comunicacion';
