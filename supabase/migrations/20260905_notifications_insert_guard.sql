-- Cierra un hueco de ABUSO encontrado en la auditoría adversarial del 2026-09-05
-- (mismo barrido que el candado de members): la política de INSERT de
-- notifications no tenía guarda de columnas.
--
--   Política "Allow insert notifications": roles {public}, with_check
--   (auth.uid() IS NOT NULL) — sin restricción de user_id ni is_global.
--
-- Impacto real (reproducido en vivo): CUALQUIER miembro autenticado podía
-- POSTear a /rest/v1/notifications {is_global:true, title, message} y:
--   (1) aparecer en el feed de TODOS los usuarios (la policy de SELECT expone
--       is_global=true a todos), suplantando un aviso oficial/pastoral; y
--   (2) disparar el trigger AFTER INSERT notify_push_on_notification_insert(),
--       que con is_global=true hace net.http_post a la EF send-push con to:'all'
--       → un PUSH WEB con título/cuerpo arbitrario a TODOS los dispositivos.
--   O con user_id=<víctima> inyectar en el feed privado de otro y pushearlo.
--   Sin límite de tasa (no hay trigger BEFORE en esta tabla).
--
-- FIX: revocar el INSERT del cliente por completo. Toda creación LEGÍTIMA de
-- notificaciones es SERVER-SIDE: 12 funciones SECURITY DEFINER (owner postgres,
-- rolbypassrls) — triggers de alta de order/band/member/song/pending_registration
-- y crons devocional/reflexión/cumpleaños/ensayo/práctica — que corren como
-- postgres y NO dependen del GRANT ni de las policies del cliente. El cliente
-- NUNCA inserta en notifications (solo SELECT + marcar leído en
-- notifications_read / communication_notifications). Verificado por grep en src/.

REVOKE INSERT ON public.notifications FROM authenticated, anon;
DROP POLICY IF EXISTS "Allow insert notifications" ON public.notifications;

-- Rollback (reabre el hueco, NO hacer salvo emergencia):
--   GRANT INSERT ON public.notifications TO authenticated, anon;
--   CREATE POLICY "Allow insert notifications" ON public.notifications
--     FOR INSERT TO public WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
