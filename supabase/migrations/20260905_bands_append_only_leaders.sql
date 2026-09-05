-- PR A (Higiene) — Cierra el hueco de seguridad de `bands`: la base era MÁS
-- permisiva que la pantalla (landmine #36).
--
-- Estado previo (verificado en vivo 2026-09-05):
--   bands INSERT/UPDATE/DELETE = is_pastor_or_leader(); SELECT = true.
--   La UI (Bandas.jsx:237) muestra "Editar"/"Eliminar" SOLO al pastor, pero la
--   base dejaba que un LÍDER, por la API, editara cualquier campo, QUITARA
--   integrantes y ELIMINARA bandas. Misma clase que el hueco de órdenes
--   (landmine #19: gate de UI más estricto que la RLS). Sin indicios de abuso,
--   pero el candado real no existía.
--
-- Regla de producto (cerrada por Paul, docs/PLAN_membresias_bandas.md):
--   el líder SOLO agrega integrantes (append-only). No edita la banda. No quita
--   a nadie. Solo el pastor quita/edita/elimina.
--
-- Como "agregar sí / quitar no" no se puede expresar con RLS por fila sobre un
-- uuid[] (para la base agregar y quitar son el mismo UPDATE), la regla vive en:
--   (1) política DELETE restringida a is_pastor(); y
--   (2) un trigger BEFORE UPDATE que, para el rol 'leader', exige que el cambio
--       sea SOLO un append a members (NEW.members ⊇ OLD.members) y que ningún
--       otro campo cambie. El pastor queda sin restricciones.
--
-- El cliente sigue usando updateBand() (merge-safe: manda la fila completa con
-- los demás campos sin cambiar → el trigger los ve iguales → OK). No hace falta
-- RPC nuevo ni tocar el contrato anti DATA-LOSS (landmine #8).

-- ── (1) DELETE de bandas: solo pastor ────────────────────────────────────────
DROP POLICY IF EXISTS bands_delete_pastor_or_leader ON public.bands;
CREATE POLICY bands_delete_pastor ON public.bands
  FOR DELETE TO authenticated
  USING ( (SELECT public.is_pastor()) );

-- ── (2) UPDATE append-only para líderes (trigger BEFORE UPDATE) ───────────────
-- SECURITY INVOKER: corre como el rol que hace el UPDATE. auth_role() es
-- SECURITY DEFINER y resuelve el rol correctamente bajo RLS.
CREATE OR REPLACE FUNCTION public.enforce_band_update_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role text := public.auth_role();
BEGIN
  -- Pastor: control total sobre la banda.
  IF v_role = 'pastor' THEN
    RETURN NEW;
  END IF;

  -- Líder: SOLO puede AGREGAR integrantes; ningún otro cambio.
  IF v_role = 'leader' THEN
    -- No puede quitar: NEW.members debe contener a TODOS los de OLD.members.
    IF NOT (COALESCE(NEW.members, '{}'::uuid[]) @> COALESCE(OLD.members, '{}'::uuid[])) THEN
      RAISE EXCEPTION 'Como líder solo podés agregar integrantes a la banda, no quitarlos. Pedile al pastor que quite o edite integrantes.'
        USING ERRCODE = 'P0001';
    END IF;
    -- No puede tocar ningún otro campo (name, meeting_*, active, id, created_at).
    IF (NEW.id            IS DISTINCT FROM OLD.id)
       OR (NEW.name         IS DISTINCT FROM OLD.name)
       OR (NEW.meeting_type IS DISTINCT FROM OLD.meeting_type)
       OR (NEW.meeting_day  IS DISTINCT FROM OLD.meeting_day)
       OR (NEW.meeting_time IS DISTINCT FROM OLD.meeting_time)
       OR (NEW.active       IS DISTINCT FROM OLD.active)
       OR (NEW.created_at   IS DISTINCT FROM OLD.created_at) THEN
      RAISE EXCEPTION 'Como líder solo podés agregar integrantes; el resto de los datos de la banda los edita el pastor.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- Cualquier otro rol (o sin rol activo): la RLS ya bloquea el UPDATE;
  -- defensa en profundidad — rechazar igual si algún cambio de política lo dejara pasar.
  RAISE EXCEPTION 'No tenés permiso para modificar bandas.'
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS enforce_band_update_rules ON public.bands;
CREATE TRIGGER enforce_band_update_rules
  BEFORE UPDATE ON public.bands
  FOR EACH ROW EXECUTE FUNCTION public.enforce_band_update_rules();

-- Nota de rollback: DROP TRIGGER enforce_band_update_rules ON public.bands;
--                   DROP FUNCTION public.enforce_band_update_rules();
--                   DROP POLICY bands_delete_pastor ON public.bands;
--                   CREATE POLICY bands_delete_pastor_or_leader ON public.bands
--                     FOR DELETE TO authenticated USING ((SELECT public.is_pastor_or_leader()));
-- No hay pérdida de datos: es solo política + trigger, no toca filas.
