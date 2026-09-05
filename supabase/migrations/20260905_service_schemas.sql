-- "Esquema de reunión" (run-of-show por orden) + plantillas (de pastores).
-- 100% ACCESORIO: tablas NUEVAS, no toca orders/songs/bands/members. El cliente
-- escribe directo (gateado por RLS) — no hay notificaciones ni fan-out
-- privilegiado, así que no hace falta Edge Function.

-- Un esquema por orden (UNIQUE order_id → "crear o editar" = upsert onConflict).
CREATE TABLE public.service_schemas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES public.members(id) ON DELETE SET NULL,
  sections    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Plantillas: las arma el pastor; el líder las puede USAR (no guardar).
CREATE TABLE public.schema_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid REFERENCES public.members(id) ON DELETE SET NULL,
  sections    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ¿El usuario actual está en la banda EFECTIVA del orden (permanentes ∪
-- temporales vigentes)? SECURITY DEFINER (corre como postgres): puede llamar a
-- band_effective_member_ids (REVOKEada del cliente) y evita cross-table RLS.
-- Mismo patrón blindado que is_pastor()/my_member_id().
CREATE OR REPLACE FUNCTION public.am_i_in_order_band(p_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id
      AND public.my_member_id() = ANY (public.band_effective_member_ids(o.band_id))
  );
$$;
REVOKE EXECUTE ON FUNCTION public.am_i_in_order_band(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.am_i_in_order_band(uuid) TO authenticated;

-- Grants (RLS acota). REVOKE de anon (nada de esto es público).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_schemas  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schema_templates TO authenticated;
REVOKE ALL ON public.service_schemas  FROM anon;
REVOKE ALL ON public.schema_templates FROM anon;

ALTER TABLE public.service_schemas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_schemas  FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.schema_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_templates FORCE  ROW LEVEL SECURITY;

-- service_schemas: SELECT = pastor/líder O integrante de la banda del orden
-- (para ver "Iniciar servicio"). Escritura (crear/editar) = pastor/líder.
CREATE POLICY ss_select ON public.service_schemas FOR SELECT TO authenticated
  USING ( (SELECT public.is_pastor_or_leader()) OR public.am_i_in_order_band(order_id) );
CREATE POLICY ss_insert ON public.service_schemas FOR INSERT TO authenticated
  WITH CHECK ( (SELECT public.is_pastor_or_leader()) );
CREATE POLICY ss_update ON public.service_schemas FOR UPDATE TO authenticated
  USING ( (SELECT public.is_pastor_or_leader()) ) WITH CHECK ( (SELECT public.is_pastor_or_leader()) );
CREATE POLICY ss_delete ON public.service_schemas FOR DELETE TO authenticated
  USING ( (SELECT public.is_pastor_or_leader()) );

-- schema_templates: SELECT = pastor/líder (las usan); escritura = SOLO pastor.
CREATE POLICY st_select ON public.schema_templates FOR SELECT TO authenticated
  USING ( (SELECT public.is_pastor_or_leader()) );
CREATE POLICY st_insert ON public.schema_templates FOR INSERT TO authenticated
  WITH CHECK ( (SELECT public.is_pastor()) );
CREATE POLICY st_update ON public.schema_templates FOR UPDATE TO authenticated
  USING ( (SELECT public.is_pastor()) ) WITH CHECK ( (SELECT public.is_pastor()) );
CREATE POLICY st_delete ON public.schema_templates FOR DELETE TO authenticated
  USING ( (SELECT public.is_pastor()) );

-- Realtime: el botón "Iniciar servicio" aparece en vivo al crear el esquema.
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_schemas;

-- Rollback:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.service_schemas;
--   DROP FUNCTION public.am_i_in_order_band(uuid);
--   DROP TABLE public.schema_templates; DROP TABLE public.service_schemas;
