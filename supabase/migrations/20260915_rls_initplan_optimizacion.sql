-- Fase 3 · Chunk 8 — RLS init-plan (performance, semántica IDÉNTICA).
-- Cierra el lint `auth_rls_initplan` (16 policies): envolver cada `auth.<fn>()`
-- en `(select auth.<fn>())` para que el planner lo evalúe UNA vez por consulta
-- (InitPlan) en vez de una vez por FILA. Es la optimización documentada por
-- Supabase; NO cambia QUIÉN ve/escribe qué (mismos resultados). Solo se toca la
-- forma de la expresión (se envuelve la llamada de auth); todo lo demás queda igual.
-- QA transaccional (rollback) impersonando usuarios reales: lectura BEFORE==AFTER
-- (18/243/1/0), aislamiento intacto (18 de 219; 243 de 1300), y escritura
-- (self admitida, cross-user rechazada, ajeno no visible). Ver landmine #90.

ALTER POLICY notifications_read_select_own ON public.notifications_read USING (((select auth.uid()) = user_id));
ALTER POLICY notifications_read_insert_own ON public.notifications_read WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY notifications_read_delete_own ON public.notifications_read USING (((select auth.uid()) = user_id));

ALTER POLICY practice_alarms_select_own ON public.practice_alarms USING ((user_id = (select auth.uid())));
ALTER POLICY practice_alarms_insert_own ON public.practice_alarms WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY practice_alarms_update_own ON public.practice_alarms USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY practice_alarms_delete_own ON public.practice_alarms USING ((user_id = (select auth.uid())));

ALTER POLICY push_subs_self_select ON public.push_subscriptions USING ((member_id IN ( SELECT members.id FROM members WHERE (members.user_id = (select auth.uid())))));
ALTER POLICY push_subs_self_insert ON public.push_subscriptions WITH CHECK ((member_id IN ( SELECT members.id FROM members WHERE (members.user_id = (select auth.uid())))));
ALTER POLICY push_subs_self_delete ON public.push_subscriptions USING ((member_id IN ( SELECT members.id FROM members WHERE (members.user_id = (select auth.uid())))));

ALTER POLICY practice_logs_select_own ON public.practice_logs USING ((user_id = (select auth.uid())));
ALTER POLICY practice_logs_insert_own ON public.practice_logs WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY practice_logs_update_own ON public.practice_logs USING ((user_id = (select auth.uid()))) WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY practice_logs_delete_own ON public.practice_logs USING ((user_id = (select auth.uid())));

ALTER POLICY daily_devotionals_select ON public.daily_devotionals USING (((select auth.role()) = 'authenticated'::text));

ALTER POLICY btm_insert_pastor_or_leader ON public.band_temporary_members WITH CHECK ((( SELECT is_pastor_or_leader() AS is_pastor_or_leader) AND (added_by = ( SELECT members.id FROM members WHERE ((members.user_id = (select auth.uid())) AND members.active) LIMIT 1))));
