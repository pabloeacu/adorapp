-- ============================================================================
-- Plan de canales (micrófonos) por orden — editable por Sonido. Una fila por orden
-- con el mapa {"<memberId>:<instrumento>": <nro de canal>} (overrides del autonumerado).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_channel_plans (
  order_id   uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  plan       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_channel_plans ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_channel_plans TO authenticated;

-- Helper: ¿el usuario es observador de Sonido? (INVOKER: lee su PROPIA ficha; members
-- SELECT=true → sin DEFINER y sin advisor nuevo).
CREATE OR REPLACE FUNCTION public.is_sonido_observer()
  RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public','pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = (SELECT auth.uid()) AND m.active = true AND 'sonido' = ANY(m.areas)
  );
$$;

-- Lectura: cualquier autenticado (el plan no es sensible).
DROP POLICY IF EXISTS ocp_select ON public.order_channel_plans;
CREATE POLICY ocp_select ON public.order_channel_plans FOR SELECT TO authenticated USING (true);

-- Escritura: pastor/líder O observador de Sonido.
DROP POLICY IF EXISTS ocp_insert ON public.order_channel_plans;
CREATE POLICY ocp_insert ON public.order_channel_plans FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_pastor_or_leader()) OR (SELECT public.is_sonido_observer()));

DROP POLICY IF EXISTS ocp_update ON public.order_channel_plans;
CREATE POLICY ocp_update ON public.order_channel_plans FOR UPDATE TO authenticated
  USING      ((SELECT public.is_pastor_or_leader()) OR (SELECT public.is_sonido_observer()))
  WITH CHECK ((SELECT public.is_pastor_or_leader()) OR (SELECT public.is_sonido_observer()));

DROP POLICY IF EXISTS ocp_delete ON public.order_channel_plans;
CREATE POLICY ocp_delete ON public.order_channel_plans FOR DELETE TO authenticated
  USING ((SELECT public.is_pastor_or_leader()) OR (SELECT public.is_sonido_observer()));
