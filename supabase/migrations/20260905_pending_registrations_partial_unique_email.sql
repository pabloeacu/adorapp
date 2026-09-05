-- Rechazar una solicitud dejaba el mail "ocupado" para siempre.
--
-- Reporte de Paul (Nicolás Calvento): se registró con un error, el pastor lo
-- rechazó, y al querer registrarse de nuevo con el mismo mail saltaba "Ya existe
-- una solicitud o cuenta con ese email".
--
-- Causa raíz: `pending_registrations` tenía `UNIQUE (email)` TOTAL, y el rechazo
-- (EF admin-reject-registration) solo cambia `status='rejected'` — NO borra la
-- fila. Entonces una solicitud rechazada seguía reservando el mail y el nuevo
-- INSERT anónimo del registro chocaba con 23505.
--
-- Fix root-cause: la unicidad del mail debe valer SOLO para solicitudes ACTIVAS
-- (pending/approved), no para las rechazadas. Índice único PARCIAL que excluye
-- 'rejected'. Así:
--   * una solicitud rechazada NO bloquea el re-registro (el caso reportado);
--   * se conserva el historial de "Rechazadas" que ven los pastores en Solicitudes;
--   * una solicitud pending o una cuenta approved SIGUE bloqueando un duplicado
--     (comportamiento correcto: no dos solicitudes activas para el mismo mail).
--
-- `IS DISTINCT FROM 'rejected'` (no `<> 'rejected'`) para que un eventual
-- status NULL cuente como activo (incluido en la unicidad), nunca excluido.
-- No hay emails duplicados hoy (la unique total lo impedía) → la creación del
-- índice no puede fallar por violación.

ALTER TABLE public.pending_registrations DROP CONSTRAINT pending_registrations_email_key;

CREATE UNIQUE INDEX pending_registrations_email_active_key
  ON public.pending_registrations (email)
  WHERE status IS DISTINCT FROM 'rejected';

-- Rollback: DROP INDEX pending_registrations_email_active_key;
--   ALTER TABLE public.pending_registrations ADD CONSTRAINT pending_registrations_email_key UNIQUE (email);
--   (solo posible si no quedaron mails duplicados por re-registros tras rechazo).
