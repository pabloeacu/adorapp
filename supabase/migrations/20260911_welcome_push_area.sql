-- ============================================================================
-- Push de bienvenida por área: cuando el nuevo miembro es de un área observadora
-- (Multimedia/Sonido) el texto cambia a "¡Bienvenido/a a bordo, X (Sonido)! ...".
-- Para Adoración y el resto, el mensaje queda igual que hoy. Solo texto; sigue
-- siendo un aviso global (lo ve todo el ministerio), tipo 'member'.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_on_member_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_obs text;
  v_msg text;
BEGIN
  v_obs := public._member_observer_area_labels(NEW.areas);
  IF v_obs IS NOT NULL THEN
    v_msg := '¡Bienvenido/a a bordo, ' || COALESCE(NEW.name, '') || ' (' || v_obs || ')! Somos una familia en Cristo.';
  ELSE
    v_msg := 'Bienvenido/a ' || COALESCE(NEW.name, 'a la familia') || ' a la familia de adoración';
  END IF;

  INSERT INTO public.notifications (title, message, type, is_global, created_at, expires_at)
  VALUES ('Nuevo miembro', v_msg, 'member', true, NOW(), NOW() + INTERVAL '7 days');
  RETURN NEW;
END;
$function$;
