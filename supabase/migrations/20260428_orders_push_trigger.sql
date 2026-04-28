-- Add 'order' to the notifications.type CHECK and trigger AFTER INSERT on
-- orders so creating an order fires a fan-out push the same way songs/bands/
-- members do. Closes the gap missed in 20260428_synth_notifs_to_rows.sql.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['info','reflection','alert','reminder','devotional','song','band','member','request','order']));

CREATE OR REPLACE FUNCTION public.notify_on_order_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_band   text;
  v_label  text;
  v_when   text;
  v_msg    text;
BEGIN
  IF NEW.band_id IS NOT NULL THEN
    SELECT name INTO v_band FROM public.bands WHERE id = NEW.band_id;
  END IF;

  v_label := COALESCE(NULLIF(NEW.meeting_type, ''), 'Reunión');
  v_when  := to_char(NEW.date, 'DD/MM');
  v_msg   := v_label || ' del ' || v_when;
  IF v_band IS NOT NULL THEN
    v_msg := v_msg || ' · ' || v_band;
  END IF;

  INSERT INTO public.notifications (title, message, type, is_global, created_at, expires_at)
  VALUES (
    'Nueva orden',
    v_msg,
    'order',
    true,
    NOW(),
    NOW() + INTERVAL '7 days'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_order_insert ON public.orders;
CREATE TRIGGER notify_on_order_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_order_insert();
