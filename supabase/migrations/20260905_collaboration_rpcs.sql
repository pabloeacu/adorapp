-- Lógica atómica de "Solicitar colaboración". SECURITY DEFINER + blindaje
-- (REVOKE PUBLIC/anon/authenticated, GRANT service_role): SOLO la Edge Function
-- collab (service_role) las llama. El cliente nunca las ejecuta directo.
-- La autorización real la hace la EF (rol del que llama, vía JWT); estas RPCs
-- re-chequean por defensa en profundidad.

-- 'collaboration' como tipo de notificación (para push + campanita).
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['info','reflection','alert','reminder','devotional',
    'song','band','member','request','order','birthday','collaboration']));

-- ---------- CREAR: inserta la solicitud + invita a los elegibles ----------
-- Elegible = activo, con user_id, con al menos una categoría pedida, que NO sea
-- el solicitante y que NO esté en la banda (permanente ∪ temporal vigente).
CREATE OR REPLACE FUNCTION public.collab_create(
  p_band_id uuid, p_order_id uuid, p_categories text[], p_requested_by uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_req uuid; v_invited jsonb;
BEGIN
  IF p_categories IS NULL OR cardinality(p_categories) < 1 THEN
    RAISE EXCEPTION 'Elegí al menos una categoría.' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.collaboration_requests (band_id, order_id, categories, requested_by)
  VALUES (p_band_id, p_order_id, p_categories, p_requested_by)
  RETURNING id INTO v_req;

  INSERT INTO public.collaboration_participants (request_id, member_id, status)
  SELECT v_req, m.id, 'invited'
  FROM public.members m
  WHERE m.active AND m.user_id IS NOT NULL
    AND m.id <> p_requested_by
    AND m.instruments && p_categories
    AND NOT EXISTS (SELECT 1 FROM public.bands b WHERE b.id = p_band_id AND m.id = ANY(b.members))
    AND NOT EXISTS (SELECT 1 FROM public.band_temporary_members t
                    WHERE t.band_id = p_band_id AND t.member_id = m.id AND t.expires_at > now());

  SELECT jsonb_agg(jsonb_build_object('member_id', m.id, 'user_id', m.user_id, 'email', m.email, 'name', m.name))
  INTO v_invited
  FROM public.collaboration_participants p JOIN public.members m ON m.id = p.member_id
  WHERE p.request_id = v_req;

  RETURN jsonb_build_object('request_id', v_req, 'invited', COALESCE(v_invited, '[]'::jsonb));
END; $$;

-- ---------- OFRECERSE: el invitado se postula (idempotente) ----------
CREATE OR REPLACE FUNCTION public.collab_offer(p_request_id uuid, p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_req record; v_part record; v_requester record; v_already boolean := false; v_n int;
BEGIN
  SELECT * INTO v_req FROM public.collaboration_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'La solicitud no existe.' USING ERRCODE='P0001'; END IF;
  IF v_req.status <> 'open' THEN RAISE EXCEPTION 'Esta solicitud ya no está abierta.' USING ERRCODE='P0001'; END IF;

  SELECT * INTO v_part FROM public.collaboration_participants
  WHERE request_id = p_request_id AND member_id = p_member_id;
  IF v_part.id IS NULL THEN RAISE EXCEPTION 'No estás invitado a esta colaboración.' USING ERRCODE='42501'; END IF;
  IF v_part.status IN ('accepted','declined') THEN
    RAISE EXCEPTION 'Tu participación en esta solicitud ya se resolvió.' USING ERRCODE='P0001';
  END IF;

  -- Idempotente y a prueba de doble-tap/carrera: la transición invited→offered va
  -- con predicado de estado; si otra ejecución ya la hizo, ROW_COUNT=0 → ya ofrecido
  -- (no se re-notifica al que pidió). Bajo READ COMMITTED el 2º UPDATE se serializa
  -- por el lock de fila y re-evalúa el WHERE contra la fila ya 'offered'.
  UPDATE public.collaboration_participants
  SET status='offered', offered_at=now(), updated_at=now()
  WHERE id = v_part.id AND status='invited';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN v_already := true; END IF;

  SELECT m.user_id, m.email, m.name INTO v_requester FROM public.members m WHERE m.id = v_req.requested_by;

  RETURN jsonb_build_object(
    'requester', jsonb_build_object('user_id', v_requester.user_id, 'email', v_requester.email, 'name', v_requester.name),
    'volunteer_name', (SELECT name FROM public.members WHERE id = p_member_id),
    'band_id', v_req.band_id, 'categories', v_req.categories, 'already_offered', v_already
  );
END; $$;

-- ---------- CUBRIR: el que pidió (o un pastor) elige un voluntario ----------
-- Advisory lock por solicitud → un solo ganador si dos cubren a la vez.
-- Agrega al elegido como TEMPORAL (hereda el CHECK 1-90 y el anti-dup trigger).
CREATE OR REPLACE FUNCTION public.collab_cover(
  p_request_id uuid, p_member_id uuid, p_days int, p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_req record; v_accepted record; v_declined jsonb;
        v_starts timestamptz := now(); v_expires timestamptz;
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 90 THEN
    RAISE EXCEPTION 'Los días deben ser un número entre 1 y 90.' USING ERRCODE='P0001';
  END IF;
  v_expires := v_starts + (p_days || ' days')::interval;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  SELECT * INTO v_req FROM public.collaboration_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'La solicitud no existe.' USING ERRCODE='P0001'; END IF;
  IF NOT (v_req.requested_by = p_actor
          OR EXISTS (SELECT 1 FROM public.members WHERE id = p_actor AND role='pastor' AND active)) THEN
    RAISE EXCEPTION 'No tenés permiso para cubrir esta solicitud.' USING ERRCODE='42501';
  END IF;
  IF v_req.status <> 'open' THEN
    RAISE EXCEPTION 'Esta solicitud ya fue cubierta o cerrada.' USING ERRCODE='P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.collaboration_participants
                 WHERE request_id = p_request_id AND member_id = p_member_id AND status='offered') THEN
    RAISE EXCEPTION 'Ese voluntario no está disponible para esta solicitud.' USING ERRCODE='P0001';
  END IF;

  -- Alta temporal (anti-dup trigger + CHECK 1-90 aplican; si ya tiene una vigente, rollback total).
  INSERT INTO public.band_temporary_members (band_id, member_id, added_by, starts_at, expires_at)
  VALUES (v_req.band_id, p_member_id, p_actor, v_starts, v_expires);

  UPDATE public.collaboration_requests
  SET status='covered', covered_member_id=p_member_id, covered_at=now(), updated_at=now()
  WHERE id = p_request_id;
  UPDATE public.collaboration_participants SET status='accepted', updated_at=now()
  WHERE request_id = p_request_id AND member_id = p_member_id;
  UPDATE public.collaboration_participants SET status='declined', updated_at=now()
  WHERE request_id = p_request_id AND status='offered' AND member_id <> p_member_id;

  SELECT m.user_id, m.email, m.name INTO v_accepted FROM public.members m WHERE m.id = p_member_id;
  SELECT jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', m.email, 'name', m.name))
  INTO v_declined
  FROM public.collaboration_participants p JOIN public.members m ON m.id = p.member_id
  WHERE p.request_id = p_request_id AND p.status='declined';

  RETURN jsonb_build_object(
    'accepted', jsonb_build_object('user_id', v_accepted.user_id, 'email', v_accepted.email, 'name', v_accepted.name),
    'declined', COALESCE(v_declined, '[]'::jsonb),
    'band_id', v_req.band_id, 'order_id', v_req.order_id
  );
END; $$;

-- ---------- CANCELAR ----------
CREATE OR REPLACE FUNCTION public.collab_cancel(p_request_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_req record;
BEGIN
  SELECT * INTO v_req FROM public.collaboration_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'La solicitud no existe.' USING ERRCODE='P0001'; END IF;
  IF NOT (v_req.requested_by = p_actor
          OR EXISTS (SELECT 1 FROM public.members WHERE id = p_actor AND role='pastor' AND active)) THEN
    RAISE EXCEPTION 'No tenés permiso.' USING ERRCODE='42501';
  END IF;
  IF v_req.status <> 'open' THEN RAISE EXCEPTION 'La solicitud ya no está abierta.' USING ERRCODE='P0001'; END IF;
  UPDATE public.collaboration_requests SET status='cancelled', updated_at=now() WHERE id = p_request_id;
  RETURN jsonb_build_object('ok', true);
END; $$;

-- ---------- VENCER (cron): cierra las abiertas cuyo orden ya pasó ----------
CREATE OR REPLACE FUNCTION public.collab_expire() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.collaboration_requests r SET status='expired', updated_at=now()
  FROM public.orders o
  WHERE r.order_id = o.id AND r.status='open'
    AND o.date::date < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

-- Blindaje de ACL (solo service_role; el cron corre como owner postgres).
REVOKE EXECUTE ON FUNCTION public.collab_create(uuid,uuid,text[],uuid)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.collab_offer(uuid,uuid)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.collab_cover(uuid,uuid,int,uuid)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.collab_cancel(uuid,uuid)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.collab_expire()                       FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.collab_create(uuid,uuid,text[],uuid)  TO service_role;
GRANT  EXECUTE ON FUNCTION public.collab_offer(uuid,uuid)               TO service_role;
GRANT  EXECUTE ON FUNCTION public.collab_cover(uuid,uuid,int,uuid)      TO service_role;
GRANT  EXECUTE ON FUNCTION public.collab_cancel(uuid,uuid)              TO service_role;
GRANT  EXECUTE ON FUNCTION public.collab_expire()                       TO service_role;

-- Cron diario 04:00 ART (07:00 UTC) para vencer solicitudes de órdenes pasados.
DO $$ BEGIN PERFORM cron.unschedule('collab-expire'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('collab-expire', '0 7 * * *', 'SELECT public.collab_expire();');

-- Rollback:
--   SELECT cron.unschedule('collab-expire');
--   DROP FUNCTION public.collab_create(uuid,uuid,text[],uuid), public.collab_offer(uuid,uuid),
--     public.collab_cover(uuid,uuid,int,uuid), public.collab_cancel(uuid,uuid), public.collab_expire();
--   (notifications_type_check: re-add without 'collaboration' si se revierte)
