-- Pulido del aviso de ALTA de orden (notify_on_order_insert):
--   1) El título del push era "Nueva orden" → "Nuevo orden" ("orden" es MASCULINO).
--   2) El mensaje mostraba el slug crudo del tipo de reunión ('culto_general') en
--      vez del nombre visible ("Culto General"). Se mapea con _meeting_label.
-- El resto del trigger (email a la banda) queda intacto.

--------------------------------------------------------------------------------
-- Helper: slug de meeting_type → etiqueta visible (espejo de MEETING_TYPES del
-- front, src/stores/appStore.js).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._meeting_label(p_type text)
  RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_type
    WHEN 'culto_general' THEN 'Culto General'
    WHEN 'jovenes'       THEN 'Reunión de Jóvenes'
    WHEN 'mujeres'       THEN 'Reunión de Mujeres'
    WHEN 'hombres'       THEN 'Reunión de Hombres'
    WHEN 'ninos'         THEN 'Escuela Dominical'
    WHEN 'evento'        THEN 'Evento Especial'
    ELSE COALESCE(NULLIF(p_type, ''), 'Reunión')
  END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_order_insert()
  RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_band   text;
  v_label  text;
  v_when   text;
  v_msg    text;
  v_sufijo text;
  v_member RECORD;
BEGIN
  IF NEW.band_id IS NOT NULL THEN
    SELECT name INTO v_band FROM public.bands WHERE id = NEW.band_id;
  END IF;

  v_label := public._meeting_label(NEW.meeting_type);   -- "Culto General", no 'culto_general'
  v_when  := to_char(NEW.date, 'DD/MM');
  v_msg   := v_label || ' del ' || v_when;
  IF v_band IS NOT NULL THEN
    v_msg := v_msg || ' · ' || v_band;
  END IF;

  INSERT INTO public.notifications (title, message, type, is_global, created_at, expires_at)
  VALUES ('Nuevo orden', v_msg, 'order', true, NOW(), NOW() + INTERVAL '7 days');

  v_sufijo := CASE WHEN v_band IS NOT NULL THEN ' · ' || v_band ELSE '' END;
  IF NEW.band_id IS NOT NULL THEN
    FOR v_member IN
      SELECT m.name, m.email FROM public.members m
      WHERE m.active = true AND m.email IS NOT NULL AND m.email <> ''
        AND m.id::text IN (
          SELECT jsonb_array_elements_text(to_jsonb((SELECT members FROM public.bands WHERE id = NEW.band_id)))
        )
    LOOP
      BEGIN
        PERFORM public.encolar_email(
          'nuevo-orden', v_member.email, v_member.name,
          jsonb_build_object(
            'nombre', COALESCE(v_member.name, ''),
            'fecha', v_when,
            'banda_sufijo', v_sufijo,
            'url', 'https://adorapp.net.ar/ordenes'
          ), 5::smallint
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_on_order_insert: email enqueue failed for %: %', v_member.email, SQLERRM;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public._meeting_label(text) FROM PUBLIC, anon, authenticated;
