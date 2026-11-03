-- Invitados: miembro TEMPORAL sin credenciales (sin login) que vence por fecha.
-- Pedido de Paul (2026-11-03): el pastor crea un "invitado" (cantante de un evento
-- único) que aparece en "miembros activos" y puede sumarse como integrante temporal
-- de una banda para ser director/voz de la formación. Al vencer su plazo desaparece
-- de todos los combos, PERO la ficha NO se borra (los órdenes históricos conservan
-- su nombre y su tonalidad).
--
-- Modelo: UNA columna `members.guest_until date` (NULL = no es invitado). No tiene
-- user_id ni email (la base ya soporta miembros sin credenciales). El vencimiento
-- es por FILTRADO en el cliente (idéntico al de los integrantes temporales de banda,
-- landmine #37): nada se borra ni muta. 100% aditivo; no toca ningún flujo existente.

-- 1) La columna. Aditiva, nullable.
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS guest_until date;
COMMENT ON COLUMN public.members.guest_until IS
  'Invitado: fecha (inclusive) hasta la que el miembro-invitado aparece en los combos. NULL = no es invitado. Solo el pastor la cambia (freeze enforce_member_update_rules); la creación va por la EF admin-create-member.';

-- 2) GRANT de columna (landmine #73: una columna nueva en members necesita su GRANT
--    SELECT o el cliente no la ve y no hay error). guest_until NO es dato personal
--    (no va por member_private_fields): se expone a cualquier autenticado como el
--    resto de las columnas no personales. UPDATE para que el pastor pueda extender
--    la invitación por updateMember directo (el freeze de abajo lo gatea a pastor).
GRANT SELECT (guest_until) ON public.members TO authenticated;
GRANT UPDATE (guest_until) ON public.members TO authenticated;

-- 3) La vista members_directory (fuente de lectura del cliente, landmine #73) debe
--    incluir guest_until. CREATE OR REPLACE conserva columnas/orden y SOLO agrega al
--    final (guest_until último) → sin ventana sin-vista durante el deploy. Se preserva
--    security_invoker=true (la RLS de members sigue decidiendo las filas).
CREATE OR REPLACE VIEW public.members_directory
  WITH (security_invoker = true) AS
  SELECT m.id,
         m.name,
         m.role,
         m.instruments,
         m.active,
         m.user_id,
         m.avatar_url,
         m.created_at,
         m.updated_at,
         m.pastor_area,
         m.leader_of,
         m.editor,
         m.onboarded,
         m.areas,
         p.email,
         p.phone,
         p.birthdate,
         m.guest_until
  FROM public.members m
  LEFT JOIN LATERAL public.member_private_fields(m.id) p(email, phone, birthdate) ON true;

-- 4) Freeze: solo un pastor (o el backend service_role) puede cambiar guest_until.
--    Se suma guest_until al conjunto congelado de enforce_member_update_rules
--    (SECURITY INVOKER — landmine #41: NO cambiar a DEFINER). Un miembro que intente
--    tocar su propio guest_until (o el de otro) recibe 42501. Un self-edit legítimo
--    reenvía el mismo valor (null→null) → NEW = OLD → pasa.
CREATE OR REPLACE FUNCTION public.enforce_member_update_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RETURN NEW;
  END IF;
  IF (SELECT public.is_pastor()) THEN
    RETURN NEW;
  END IF;
  IF (NEW.role        IS DISTINCT FROM OLD.role)
     OR (NEW.editor      IS DISTINCT FROM OLD.editor)
     OR (NEW.active      IS DISTINCT FROM OLD.active)
     OR (NEW.user_id     IS DISTINCT FROM OLD.user_id)
     OR (NEW.id          IS DISTINCT FROM OLD.id)
     OR (NEW.email       IS DISTINCT FROM OLD.email)
     OR (NEW.created_at  IS DISTINCT FROM OLD.created_at)
     OR (NEW.areas       IS DISTINCT FROM OLD.areas)
     OR (NEW.guest_until IS DISTINCT FROM OLD.guest_until)
  THEN
    RAISE EXCEPTION 'No tenés permiso para cambiar rol, estado, permisos de edición, área, correo, invitación ni el vínculo de cuenta de un miembro. Solo un pastor puede hacerlo.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
