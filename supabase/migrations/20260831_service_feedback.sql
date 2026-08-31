-- Feedback post-servicio ("¿Cómo estuvimos?") — Chunk 3 de las ideas de valor.
--
-- Un PASTOR (cualquier banda) o el LÍDER integrante de la banda de un orden ya
-- ocurrido puede enviar una devolución del servicio por CORREO a la banda que tocó,
-- con COPIA a todos los pastores. Es OPTATIVO. La plantilla del correo sigue la
-- estructura que pidió Paul: pregunta de encabezado ("¿Cómo estuvimos?") + tres
-- secciones cortas (¿Qué funcionó? · ¿Qué ajustamos? · Reflexión final) + firma con
-- el nombre y rol de quien la envió.
--
-- Seguridad:
--  * Las ESCRITURAS van SOLO por la Edge Function `send-service-feedback`
--    (service_role): valida rol server-side, sanitiza el texto y encola los correos
--    por el portón `encolar_email` (mismo pipeline probado de Comunicaciones).
--  * El CLIENTE solo LEE (para saber si ya envió y no volver a ofrecer el modal).
--  * Registro self-contained: guarda nombre/rol del autor denormalizados, así el
--    registro perdura aunque el miembro se elimine después (author_id SIN FK a
--    auth.users a propósito — evita el landmine de borrado members.user_id→auth).

create table if not exists public.service_feedback (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  author_id       uuid not null,            -- auth.users.id del autor (sin FK: el registro perdura)
  author_name     text not null,
  author_role     text not null,            -- 'pastor' | 'leader' (rol al momento de enviar)
  que_funciono    text,
  que_ajustamos   text,
  reflexion       text,
  recipient_count integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (order_id, author_id)              -- un envío por autor y por orden (dedup / anti doble-envío)
);

alter table public.service_feedback enable row level security;

-- Lectura: el autor ve lo suyo; los pastores ven todo. SIN políticas de escritura
-- para authenticated → INSERT/UPDATE/DELETE quedan denegados al cliente (RLS). Solo
-- service_role (la Edge Function) puede escribir, ya que bypassa RLS.
create policy service_feedback_select_author_or_pastor
  on public.service_feedback
  for select
  to authenticated
  using (author_id = (select auth.uid()) or (select public.is_pastor()));

-- Regla #7 del proyecto: GRANT explícito de los 4 verbos a authenticated (la RLS es
-- la que restringe fila-a-fila; sin política de escritura, el cliente no escribe).
grant select, insert, update, delete on public.service_feedback to authenticated;

create index if not exists idx_service_feedback_order on public.service_feedback(order_id);

-- Plantilla del correo. El worker `send-emails` renderiza {{clave}}:
--  * cuerpo_html se renderiza RAW → la Edge Function manda los textos YA escapados.
--  * firma se renderiza ESCAPADA → la EF manda remitente_nombre/rol en crudo.
-- Estructura pedida por Paul: título = pregunta de encabezado; 3 secciones; firma
-- con quién envió (para diferenciar líder vs pastor y cuál).
insert into public.email_templates
  (slug, descripcion, asunto, from_label, reply_to, activo, kicker, titulo, cuerpo_html, color_acento, mostrar_logo, firma)
values (
  'feedback-post-servicio',
  'Feedback post-servicio que un líder o pastor envía a la banda (con copia a pastores)',
  '¿Cómo estuvimos? · Servicio del {{fecha}}',
  'adorapp',
  null,
  true,
  'Feedback del servicio | Adoración CAF',
  '¿Cómo estuvimos?',
  'Hola {{nombre}}, esta es la devolución del servicio del {{fecha}}.<br><br>'
  || '<strong style="color:#0f766e;">¿Qué funcionó?</strong><br>{{que_funciono}}<br><br>'
  || '<strong style="color:#b45309;">¿Qué ajustamos?</strong><br>{{que_ajustamos}}<br><br>'
  || '<strong style="color:#6d28d9;">Reflexión final</strong><br>{{reflexion}}',
  '#6d28d9',
  true,
  'Enviado por {{remitente_nombre}} · {{remitente_rol}}<br>Ministerio de Adoración · Adoración CAF'
)
on conflict (slug) do nothing;
