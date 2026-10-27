-- Correo recordatorio del evento The Chosen (goteo 1 c/5 min, HOY/MAÑANA al enviar).
-- Aislado del resto: nueva columna server-owned + plantilla + función SECURITY DEFINER + cron.
-- El cron se autodesprograma pasado el evento. 100% backend.

-- 1) Marca de "recordatorio enviado" (la escribe SOLO el backend; authenticated no tiene UPDATE).
alter table public.event_registrations
  add column if not exists reminder_sent_at timestamptz;

-- 2) Plantilla (body_html propio, como evento-entrada-thechosen). Asunto e imagen del
--    sello varían por {{dia_asunto}}/{{sello_url}} que setea la función al encolar.
insert into public.email_templates
  (slug, descripcion, asunto, from_label, reply_to, activo,
   kicker, titulo, cuerpo_html, cta_text, cta_url, color_acento, mostrar_logo, firma,
   body_html, body_text, cta2_text, cta2_url)
values
  ('evento-recordatorio-thechosen',
   'Recordatorio del evento The Chosen (día anterior/día del evento, goteo).',
   '{{dia_asunto}} nos vemos en The Chosen 🎬',
   'adorapp', null, true,
   null, null, null, null, null, '#d9b45a', false, null,
   $html$<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0806;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0806;">
<tr><td align="center" style="padding:26px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#120d07;border-radius:16px;border:1px solid rgba(217,180,90,.26);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center" style="padding:24px 0 2px;">
    <img src="https://adorapp.net.ar/thechosen-avivamiento.png" width="100" height="100" alt="Avivamiento Jóvenes" style="width:100px;height:100px;display:inline-block;border:0;">
  </td></tr>
  <tr><td align="center" style="padding:6px 20px 2px;">
    <img src="{{sello_url}}" width="300" height="300" alt="" style="width:300px;max-width:84%;height:auto;display:inline-block;border:0;">
  </td></tr>
  <tr><td style="padding:8px 34px 2px;text-align:center;">
    <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#d9b45a;font-weight:700;">Cinema · Full Experience</div>
    <div style="font-size:25px;font-weight:700;color:#f3ecdc;line-height:1.3;margin-top:10px;">{{titulo}}</div>
    <p style="font-size:15px;line-height:1.75;color:#b7ac93;margin:14px 0 0;">{{intro_linea}}</p>
  </td></tr>
  <tr><td style="padding:18px 34px 2px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(240,205,114,.07);border:1px solid rgba(217,180,90,.22);border-radius:12px;">
      <tr>
        <td width="44" valign="top" style="padding:14px 0 14px 16px;font-size:22px;">📱</td>
        <td style="padding:14px 16px 14px 10px;font-size:14px;line-height:1.6;color:#e7ddc6;">
          <strong style="color:#f3ecdc;">Tené tu celular a mano.</strong> En la puerta mostrás tu <strong style="color:#f0cd72;">entrada con código QR</strong> para ingresar — rapidito y sin filas.
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:16px 34px 2px;text-align:center;">
    <p style="font-size:15px;line-height:1.75;color:#b7ac93;margin:0;">
      Estamos preparando una <strong style="color:#f0cd72;">CINEMA FULL EXPERIENCE</strong> junto a <strong style="color:#f3ecdc;">Avivamiento Jóvenes</strong>: pantalla grande, una noche para encontrarte con el amor que lo cambió todo. 🎬
    </p>
  </td></tr>
  <tr><td align="center" style="padding:22px 34px 6px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="border-radius:10px;background:linear-gradient(180deg,#f0cd72,#d9b45a);">
        <a href="{{ticket_url}}" style="display:inline-block;padding:15px 30px;font-size:16px;font-weight:800;color:#2a1e07;text-decoration:none;border-radius:10px;">Ver mi entrada con QR</a>
      </td></tr></table>
  </td></tr>
  <tr><td style="padding:16px 34px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(217,180,90,.14);">
      <tr><td style="padding:16px 0 2px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#7d745f;">Cuándo</td></tr>
      <tr><td style="padding:0 0 10px;font-size:15px;color:#f3ecdc;font-weight:600;">Sábado 31 de octubre · 19:30 hs</td></tr>
      <tr><td style="padding:0 0 2px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#7d745f;">Dónde</td></tr>
      <tr><td style="padding:0 0 10px;font-size:15px;color:#f3ecdc;font-weight:600;">Auditorio CAF · San Lorenzo 2738, San Martín</td></tr>
      <tr><td style="padding:0 0 2px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#7d745f;">Entrada</td></tr>
      <tr><td style="padding:0 0 4px;font-size:15px;color:#f0cd72;font-weight:600;">100% gratuita · Cortesía de Come and See</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:22px 34px 26px;border-top:1px solid rgba(217,180,90,.14);text-align:center;">
    <div style="font-size:12px;color:#7d745f;line-height:1.7;">¡Te esperamos! ✨<br>
      Organiza <strong style="color:#b7ac93;">Avivamiento Jóvenes</strong> · Centro de Avivamiento Familiar</div>
    <div style="margin-top:16px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6f6650;">Powered by</div>
    <img src="https://adorapp.net.ar/thechosen-adorapp.png" width="132" alt="AdorApp" style="width:132px;max-width:46%;height:auto;display:inline-block;border:0;margin-top:6px;">
  </td></tr>
</table>
</td></tr>
</table>
</body></html>$html$,
   $txt${{dia_asunto}} nos vemos en The Chosen.

Te recordamos el estreno del Episodio 1 de la Temporada 6 de The Chosen en pantalla grande.
Tené tu celular a mano: en la puerta mostrás tu entrada con código QR para ingresar.
Estamos preparando una CINEMA FULL EXPERIENCE junto a Avivamiento Jóvenes.

Tu entrada: {{ticket_url}}

Cuándo: Sábado 31 de octubre · 19:30 hs
Dónde: Auditorio CAF · San Lorenzo 2738, San Martín
Entrada: 100% gratuita · Cortesía de Come and See

¡Te esperamos!
Avivamiento Jóvenes · Centro de Avivamiento Familiar$txt$,
   null, null)
on conflict (slug) do update set
  descripcion = excluded.descripcion,
  asunto      = excluded.asunto,
  from_label  = excluded.from_label,
  activo      = excluded.activo,
  mostrar_logo= excluded.mostrar_logo,
  body_html   = excluded.body_html,
  body_text   = excluded.body_text,
  updated_at  = now();

-- 3) Función del goteo. Despacha 1 recordatorio por corrida (el cron corre c/5 min).
--    La etiqueta HOY/MAÑANA se calcula AHORA (en el día real del envío), no se congela.
create or replace function public.send_event_reminders(
  p_now   timestamptz default now(),
  p_force boolean     default false,
  p_batch integer     default 1
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_slug       text := 'thechosen';
  v_event_date date := date '2026-10-31';
  v_art        timestamp := (p_now at time zone 'America/Argentina/Buenos_Aires');
  v_today      date := v_art::date;
  v_hour       numeric := extract(hour from v_art) + extract(minute from v_art) / 60.0;
  v_dia        text;
  v_dia_asunto text;
  v_titulo     text;
  v_intro      text;
  v_sello      text;
  v_reg        record;
  v_nombre1    text;
  v_url        text;
  v_sent       integer := 0;
begin
  -- Pasado el evento: el cron se autodesprograma (one-shot, no queda colgado).
  if v_today > v_event_date then
    begin perform cron.unschedule('event-thechosen-reminder'); exception when others then null; end;
    return jsonb_build_object('ok', true, 'sent', 0, 'reason', 'evento_pasado');
  end if;

  -- Ventana: solo el día anterior y el día del evento, horario diurno 08:00-21:30 ART.
  if not p_force then
    if v_today <> (v_event_date - 1) and v_today <> v_event_date then
      return jsonb_build_object('ok', true, 'sent', 0, 'reason', 'fuera_de_ventana', 'today', v_today);
    end if;
    if v_hour < 8 or v_hour >= 21.5 then
      return jsonb_build_object('ok', true, 'sent', 0, 'reason', 'fuera_de_horario', 'hour', round(v_hour, 2));
    end if;
  end if;

  if v_today >= v_event_date then
    v_dia := 'HOY'; v_dia_asunto := 'Hoy';
    v_titulo := '¡Llegó el día! Hoy nos vemos 🎬';
    v_sello  := 'https://adorapp.net.ar/thechosen-hoy.png';
  else
    v_dia := 'MANANA'; v_dia_asunto := 'Mañana';
    v_titulo := '¡Mañana lo vivimos juntos! 🎬';
    v_sello  := 'https://adorapp.net.ar/thechosen-manana.png';
  end if;

  for v_reg in
    select id, nombre, email, ticket_token
    from public.event_registrations
    where event_slug = v_slug
      and coalesce(status, '') <> 'cancelled'   -- NULL hipotético -> incluido (no sub-enviar)
      and reminder_sent_at is null
    order by created_at
    limit least(greatest(0, coalesce(p_batch, 1)), 25)  -- 0 = smoke; tope 25 (anti-blast)
    for update skip locked
  loop
    -- Defensivo: email o token inválido -> se marca (no bloquea el goteo) y NO se encola.
    if coalesce(v_reg.email, '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       or coalesce(v_reg.ticket_token, '') = '' then
      update public.event_registrations set reminder_sent_at = p_now where id = v_reg.id;
      continue;
    end if;

    v_nombre1 := public._html_escape(split_part(coalesce(v_reg.nombre, ''), ' ', 1));
    v_url := 'https://adorapp.net.ar/thechosen/entrada/' || v_reg.ticket_token;

    if v_dia = 'HOY' then
      v_intro := 'Hola <strong style="color:#f3ecdc;">' || v_nombre1 ||
        '</strong>, <strong style="color:#f0cd72;">es hoy</strong>. Esta noche vivimos juntos el estreno del Episodio 1 de la Temporada 6 de The Chosen en pantalla grande.';
    else
      v_intro := 'Hola <strong style="color:#f3ecdc;">' || v_nombre1 ||
        '</strong>, falta muy poquito. <strong style="color:#f3ecdc;">Mañana</strong> nos encontramos para vivir el estreno del Episodio 1 de la Temporada 6 de The Chosen en pantalla grande.';
    end if;

    -- Encolar + marcar como unidad atómica POR REGISTRO. Si encolar falla, NO se
    -- revienta toda la corrida (evita el bloqueo head-of-line que congelaría el
    -- goteo para siempre en un registro): se avisa, se marca para saltearlo y se sigue.
    begin
      perform public.encolar_email(
        'evento-recordatorio-thechosen',
        v_reg.email,
        v_reg.nombre,
        jsonb_build_object(
          'dia_asunto',  v_dia_asunto,
          'titulo',      v_titulo,
          'intro_linea', v_intro,
          'sello_url',   v_sello,
          'ticket_url',  v_url
        ),
        5::smallint
      );
      update public.event_registrations set reminder_sent_at = p_now where id = v_reg.id;
      v_sent := v_sent + 1;
    exception when others then
      raise warning 'send_event_reminders: fallo encolando reg %: %', v_reg.id, sqlerrm;
      update public.event_registrations set reminder_sent_at = p_now where id = v_reg.id;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'sent', v_sent, 'dia', v_dia, 'today', v_today);
end
$fn$;

revoke all on function public.send_event_reminders(timestamptz, boolean, integer) from public, anon, authenticated;
grant execute on function public.send_event_reminders(timestamptz, boolean, integer) to service_role;

-- 4) Cron cada 5 minutos (la función se autogatea a la ventana del evento y se
--    autodesprograma pasado el 31/10). Goteo neto = 1 correo cada 5 min.
do $cron$
begin
  perform cron.unschedule('event-thechosen-reminder');
exception when others then null;
end
$cron$;
select cron.schedule('event-thechosen-reminder', '*/5 * * * *', $job$select public.send_event_reminders();$job$);
