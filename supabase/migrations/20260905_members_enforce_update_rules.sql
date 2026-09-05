-- Cierra el hueco de ESCALADA DE PRIVILEGIOS en members (hallado en el estudio
-- de membresías de banda, análogo al #36 de bands). La política RLS
-- members_update_self_or_pastor = (is_pastor() OR user_id = auth.uid()) NO
-- restringe columnas, así que un miembro, editando su PROPIA ficha, podía:
--   - setear role='pastor'  → escalada directa a pastor
--   - setear editor=true    → escritura del repertorio (policy songs_update_editors)
--   - reactivarse (active), o tocar user_id / pastor_area / leader_of.
-- La RLS decide QUÉ fila puede tocar; este trigger decide QUÉ columnas.
--
-- Patrón espejo de enforce_band_update_rules, con una diferencia CLAVE: acá los
-- Edge Functions admin-* SÍ hacen UPDATE de members como service_role
-- (admin-update-member cambia role/editor/active). Por eso eximimos a los roles
-- con rolbypassrls (service_role, postgres, crons) — y para que `current_user`
-- sea el ACTOR REAL, la función es SECURITY INVOKER (NO definer): con definer,
-- current_user sería el dueño (postgres) y el candado nunca aplicaría.

-- Endurecimiento previo: role/editor/active son "moralmente NOT NULL" (tienen
-- default y ninguna fila los tiene NULL). Fijarlos NOT NULL elimina el ÚNICO
-- falso-positivo teórico del trigger: si una columna congelada fuera NULL, el
-- round-trip del cliente (convertMemberToDB coacciona role||'member',
-- editor||false, active??true) emitiría un valor no-null y bloquearía por error
-- un self-edit legítimo. Verificado: 0 NULLs en las 22 filas antes de aplicar.
ALTER TABLE public.members
  ALTER COLUMN role   SET NOT NULL,
  ALTER COLUMN editor SET NOT NULL,
  ALTER COLUMN active SET NOT NULL;

-- SECURITY INVOKER EXPLÍCITO (load-bearing, NO tocar): el candado depende de que
-- `current_user` sea el ACTOR REAL (authenticated/service_role). Con SECURITY
-- DEFINER, la función correría como su dueño `postgres` (rolbypassrls=true) y la
-- PRIMERA línea eximiría a TODOS → el trigger sería un no-op silencioso y el
-- hueco de escalada volvería a abrirse sin ningún error. Jamás cambiar a DEFINER.
CREATE OR REPLACE FUNCTION public.enforce_member_update_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Backend confiable (Edge Functions service_role, crons, postgres): sin
  -- restricción. Estos roles tienen rolbypassrls=true; los clientes
  -- (authenticated/anon) no. admin-update-member (service_role) cae acá.
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RETURN NEW;
  END IF;

  -- Pastor autenticado: puede cambiar rol, estado, permiso de editor, etc.
  IF (SELECT public.is_pastor()) THEN
    RETURN NEW;
  END IF;

  -- Cualquier otro actor autenticado (miembro/líder editando su PROPIA ficha por
  -- la RLS members_update_self_or_pastor): las columnas privilegiadas quedan
  -- CONGELADAS (deben permanecer idénticas). Un self-edit legítimo del cliente
  -- reenvía estos mismos valores desde el snapshot del store (convertMemberFromDB
  -- los transporta fieles) → NEW = OLD → pasa. Editar nombre/email/teléfono/
  -- instrumentos/avatar/cumpleaños/onboarded sigue permitido.
  IF (NEW.role          IS DISTINCT FROM OLD.role)
     OR (NEW.editor        IS DISTINCT FROM OLD.editor)
     OR (NEW.active        IS DISTINCT FROM OLD.active)
     OR (NEW.user_id       IS DISTINCT FROM OLD.user_id)
     OR (NEW.id            IS DISTINCT FROM OLD.id)
     OR (NEW.pastor_area   IS DISTINCT FROM OLD.pastor_area)
     OR (NEW.leader_of     IS DISTINCT FROM OLD.leader_of)
     OR (NEW.password_hash IS DISTINCT FROM OLD.password_hash)
     OR (NEW.created_at    IS DISTINCT FROM OLD.created_at)
  THEN
    RAISE EXCEPTION 'No tenés permiso para cambiar rol, estado, permisos de edición ni el vínculo de cuenta de un miembro. Solo un pastor puede hacerlo.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_member_update_rules ON public.members;
CREATE TRIGGER enforce_member_update_rules
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_member_update_rules();

-- Rollback:
--   DROP TRIGGER IF EXISTS enforce_member_update_rules ON public.members;
--   DROP FUNCTION IF EXISTS public.enforce_member_update_rules();
