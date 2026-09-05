-- "Solicitar colaboración": un pastor/líder pide un reemplazo (una vacante) para
-- un servicio. Los elegibles (activos, con la categoría, que NO estén en la banda)
-- reciben correo+push+banner con "Yo me ofrezco". El que pide recibe aviso por
-- cada voluntario; al elegir uno y "Cubrir", ese voluntario se suma TEMPORAL
-- (reusa band_temporary_members) y se avisa a aceptado y no-aceptados.
--
-- SEGURIDAD (coherente con el barrido del 2026-09-05): TODA escritura pasa por
-- Edge Functions service_role (calcular elegibles, mandar avisos, cubrir con
-- candado). El cliente SOLO lee (SELECT RLS-acotado para pintar sus banners).
-- No hay policies de INSERT/UPDATE/DELETE para authenticated → deny by default,
-- y REVOCAMOS explícitamente el DML del cliente (Supabase por default-ACL le da
-- arwdDxtm a authenticated/anon en tablas nuevas; sin REVOKE, quedaría el GRANT
-- aunque la RLS lo tape — el mismo patrón que cerramos hoy en notifications).

CREATE TABLE public.collaboration_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id           uuid NOT NULL REFERENCES public.bands(id)   ON DELETE CASCADE,
  order_id          uuid NOT NULL REFERENCES public.orders(id)  ON DELETE CASCADE,
  categories        text[] NOT NULL,
  requested_by      uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','covered','cancelled','expired')),
  covered_member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  covered_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collab_categories_nonempty CHECK (cardinality(categories) >= 1)
);
CREATE INDEX idx_collab_req_status ON public.collaboration_requests (status);
CREATE INDEX idx_collab_req_by     ON public.collaboration_requests (requested_by);
CREATE INDEX idx_collab_req_order  ON public.collaboration_requests (order_id);

CREATE TABLE public.collaboration_participants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES public.collaboration_requests(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'invited'
                 CHECK (status IN ('invited','offered','accepted','declined')),
  offered_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, member_id)
);
CREATE INDEX idx_collab_part_member ON public.collaboration_participants (member_id);
CREATE INDEX idx_collab_part_request_status ON public.collaboration_participants (request_id, status);

-- Helpers SECURITY DEFINER para la RLS. CLAVE: las policies NO pueden referenciar
-- la tabla hermana con un EXISTS directo (Postgres expande la RLS de esa tabla en
-- tiempo de reescritura → recursión 42P17 en TODA lectura autenticada). Envueltos
-- en funciones DEFINER (corren como postgres, rolbypassrls) la subconsulta NO
-- dispara RLS y es opaca al reescritor → cero recursión. Mismo patrón que is_pastor().
CREATE OR REPLACE FUNCTION public.my_member_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT id FROM public.members WHERE user_id = auth.uid() AND active LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.collab_is_participant(p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT EXISTS (SELECT 1 FROM public.collaboration_participants p
       WHERE p.request_id = p_request_id AND p.member_id = public.my_member_id()) $$;

CREATE OR REPLACE FUNCTION public.collab_is_requester(p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ SELECT EXISTS (SELECT 1 FROM public.collaboration_requests r
       WHERE r.id = p_request_id AND r.requested_by = public.my_member_id()) $$;

REVOKE EXECUTE ON FUNCTION public.my_member_id()               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.collab_is_participant(uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.collab_is_requester(uuid)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_member_id()               TO authenticated;
GRANT  EXECUTE ON FUNCTION public.collab_is_participant(uuid)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.collab_is_requester(uuid)    TO authenticated;

-- Grants: cliente SOLO lee; escritura es service_role. REVOKE explícito del DML
-- del cliente (por si el default-ACL lo otorgó) y de todo lo de anon.
GRANT  SELECT ON public.collaboration_requests     TO authenticated;
GRANT  SELECT ON public.collaboration_participants TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.collaboration_requests     FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.collaboration_participants FROM authenticated;
REVOKE ALL ON public.collaboration_requests     FROM anon;
REVOKE ALL ON public.collaboration_participants FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.collaboration_requests     TO service_role;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.collaboration_participants TO service_role;

ALTER TABLE public.collaboration_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_requests     FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_participants FORCE  ROW LEVEL SECURITY;

-- SELECT: la solicitud la ve el que pidió, un pastor, o un participante suyo.
-- Los helpers no correlacionados van en (SELECT …) (initplan, una vez por query);
-- el correlacionado (usa la columna de la fila) se llama directo (por fila).
CREATE POLICY collab_req_select ON public.collaboration_requests
  FOR SELECT TO authenticated USING (
    requested_by = (SELECT public.my_member_id())
    OR (SELECT public.is_pastor())
    OR public.collab_is_participant(id)
  );

-- SELECT: el participante lo ve el propio miembro, un pastor, o quien pidió.
CREATE POLICY collab_part_select ON public.collaboration_participants
  FOR SELECT TO authenticated USING (
    member_id = (SELECT public.my_member_id())
    OR (SELECT public.is_pastor())
    OR public.collab_is_requester(request_id)
  );

-- Realtime para banners en vivo (ofrecerse → el que pide ve; cubrir → banners caen).
ALTER PUBLICATION supabase_realtime ADD TABLE public.collaboration_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.collaboration_participants;

-- Rollback:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.collaboration_participants, public.collaboration_requests;
--   DROP FUNCTION public.collab_is_participant(uuid), public.collab_is_requester(uuid), public.my_member_id();
--   DROP TABLE public.collaboration_participants; DROP TABLE public.collaboration_requests;
