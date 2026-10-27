-- Reporte de avance del correo recordatorio The Chosen (monitoreo, one-shot).
-- El 30/10 y 31/10 a las 22:00 ART manda a los pastores una campanita + push con el
-- avance del envío (enviados / procesados / en cola). Se autodesprograma el 1/11.
-- 100% backend, best-effort, patrón de check_system_health. Push por el trigger existente.

create or replace function public.send_event_reminder_report(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_art   date := (coalesce(p_now, now()) at time zone 'America/Argentina/Buenos_Aires')::date;
  v_event date := date '2026-10-31';
  v_total int; v_proc int; v_conf int; v_cola int;
  v_fase text; v_title text; v_msg text; v_new int; v_p record;
begin
  if v_art < v_event - 1 then
    return jsonb_build_object('ok', true, 'skip', 'antes', 'dia', v_art);
  end if;
  if v_art > v_event then
    begin perform cron.unschedule('event-reminder-report'); exception when others then null; end;
    return jsonb_build_object('ok', true, 'skip', 'fin_unscheduled');
  end if;

  insert into public.email_throttle(key, last_sent_at)
    values('reminder_report:'||v_art::text, now())
    on conflict (key) do nothing;
  get diagnostics v_new = row_count;
  if v_new = 0 then
    return jsonb_build_object('ok', true, 'skip', 'ya_reportado', 'dia', v_art);
  end if;

  select count(*) into v_total from public.event_registrations
    where event_slug='thechosen' and coalesce(status,'')<>'cancelled';
  select count(*) into v_proc from public.event_registrations
    where event_slug='thechosen' and coalesce(status,'')<>'cancelled' and reminder_sent_at is not null;
  select count(*) into v_conf from public.sent_emails
    where template_slug='evento-recordatorio-thechosen' and estado='sent';
  select count(*) into v_cola from public.email_queue
    where template_slug='evento-recordatorio-thechosen' and status in ('pending','sending');

  if v_art = v_event then v_fase := 'día del evento (Hoy) 🎬'; else v_fase := 'día anterior (Mañana)'; end if;
  v_title := '📬 Recordatorios The Chosen';
  v_msg := 'Avance del '||v_fase||': '||v_conf||' enviados de '||v_total||' · '||v_proc||' procesados · '||v_cola||' en cola.';
  if v_proc = 0 then
    v_msg := v_msg || ' ⚠️ Nadie procesado todavía: revisá que el envío esté activo.';
  end if;

  for v_p in
    select user_id from public.members
    where role='pastor' and active=true and user_id is not null
  loop
    begin
      insert into public.notifications (user_id, title, message, type, is_global)
      values (v_p.user_id, v_title, v_msg, 'alert', false);
    exception when others then
      begin
        insert into public.error_log (message, severity, context)
        values ('send_event_reminder_report: fallo push a un pastor', 'warning',
                jsonb_build_object('user_id', v_p.user_id, 'error', sqlerrm));
      exception when others then null; end;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'dia', v_art, 'total', v_total,
    'procesados', v_proc, 'enviados', v_conf, 'en_cola', v_cola);
exception when others then
  begin
    insert into public.error_log (message, severity, context)
    values ('send_event_reminder_report: fallo general', 'error', jsonb_build_object('error', sqlerrm));
  exception when others then null; end;
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end
$fn$;

revoke all on function public.send_event_reminder_report(timestamptz) from public, anon, authenticated;
grant execute on function public.send_event_reminder_report(timestamptz) to service_role;

-- Cron diario 01:00 UTC (= 22:00 ART). La función se autogatea al 30/10-31/10 ART
-- y se autodesprograma el 1/11.
do $cron$
begin
  perform cron.unschedule('event-reminder-report');
exception when others then null;
end
$cron$;
select cron.schedule('event-reminder-report', '0 1 * * *', $job$select public.send_event_reminder_report();$job$);
