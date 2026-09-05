-- Endurece la base del control de roles: auth_role() hace
--   SELECT role FROM members WHERE user_id=auth.uid() AND active LIMIT 1  (sin ORDER BY)
-- → dos filas con el mismo user_id volverían el rol efectivo NO determinista
-- (podría resolver a la fila de mayor privilegio). Hoy no puede pasar (members no
-- tiene policy de INSERT para el cliente y los EF admin crean 1 fila por
-- aprobación) y 0 duplicados verificados antes de aplicar. Este índice único
-- parcial lo hace ESTRUCTURALMENTE imposible (y frena una doble-alta accidental
-- de un miembro por un Edge Function). Recomendación de la auditoría adversarial
-- del 2026-09-05; refuerza el candado enforce_member_update_rules (landmine #41).
CREATE UNIQUE INDEX IF NOT EXISTS members_user_id_unique
  ON public.members (user_id) WHERE user_id IS NOT NULL;

-- Rollback: DROP INDEX IF EXISTS public.members_user_id_unique;
