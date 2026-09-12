-- D2 (segunda parte, se aplica DESPUÉS de publicar el cliente que lee `members_directory`):
-- el cliente deja de poder leer correo/teléfono/cumpleaños de la tabla `members`.
--
-- Postgres no permite "revocar una columna" mientras exista el SELECT de tabla: se
-- revoca el SELECT de tabla y se otorga columna por columna (todas menos las tres
-- personales). INSERT/UPDATE/REFERENCES de tabla quedan como estaban (la RLS y el
-- freeze `enforce_member_update_rules` siguen mandando). `anon` nunca leyó `members`
-- (no tiene política): se le quita el SELECT entero.
--
-- Efecto: `SELECT * FROM members` como authenticated → 42501; la vista
-- `members_directory` es la lectura del cliente. Realtime (walrus) respeta los
-- privilegios de columna: los eventos de `members` llegan SIN esas tres columnas para
-- todos (el cliente re-lee la ficha desde la vista al recibir un evento).
-- Una columna NUEVA en `members` hay que sumarla acá (GRANT SELECT (col)) y en la vista.

BEGIN;

REVOKE SELECT ON public.members FROM anon, authenticated;
GRANT SELECT (id, name, role, instruments, active, user_id, avatar_url, created_at,
              updated_at, pastor_area, leader_of, editor, onboarded, areas)
  ON public.members TO authenticated;

COMMIT;
