-- Video institucional / tutorial de AdorAPP (2026-11-26).
-- Ya APLICADA a prod vía MCP; este archivo deja el repo como fuente de verdad.
--
-- NOTA: el video (~213 MB) y su póster viven en Supabase Storage (bucket público
-- `tutoriales`), NO en el repo (un binario grande ensuciaría git). El límite GLOBAL
-- de subida del proyecto se elevó de 50 MB → 500 MB vía Management API
-- (config de Storage, no es SQL). URLs públicas:
--   .../storage/v1/object/public/tutoriales/institucional-v1.mp4
--   .../storage/v1/object/public/tutoriales/institucional-poster-v1.png

-- 1) Bucket público para videos institucionales/tutoriales (lectura pública,
--    escritura solo server-side por service_role).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tutoriales', 'tutoriales', true, 262144000, array['video/mp4','image/png','image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tutoriales_public_read" on storage.objects;
create policy "tutoriales_public_read" on storage.objects
  for select to public
  using (bucket_id = 'tutoriales');

-- 2) Registro "visto por persona" de anuncios de ÚNICA VEZ (reutilizable).
--    Dueño-only en los 4 verbos (como practice_alarms); anon revocado (#86).
create table if not exists public.announcement_dismissals (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key          text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.announcement_dismissals enable row level security;
alter table public.announcement_dismissals force row level security;
grant select, insert, update, delete on public.announcement_dismissals to authenticated;
revoke all on public.announcement_dismissals from anon;

drop policy if exists ad_select_own on public.announcement_dismissals;
drop policy if exists ad_insert_own on public.announcement_dismissals;
drop policy if exists ad_update_own on public.announcement_dismissals;
drop policy if exists ad_delete_own on public.announcement_dismissals;
create policy ad_select_own on public.announcement_dismissals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy ad_insert_own on public.announcement_dismissals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy ad_update_own on public.announcement_dismissals
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ad_delete_own on public.announcement_dismissals
  for delete to authenticated using ((select auth.uid()) = user_id);

-- 3) Plantilla de correo del tutorial (botón → https://adorapp.net.ar/tutorial).
insert into email_templates
  (slug, descripcion, asunto, from_label, kicker, titulo, cuerpo_html, cta_text, cta_url, color_acento, mostrar_logo, firma, activo)
values (
  'tutorial-institucional',
  'Video institucional/tutorial de AdorAPP (recorrido completo). Botón → /tutorial.',
  'Lo que tenés en las manos, en 10 minutos 🎬',
  'adorapp',
  'ADORACIÓN CAF',
  'Conocé AdorAPP a fondo',
  $cuerpo$Hola {{nombre}}. Hay algo que queremos que veas: un recorrido completo por AdorAPP, la plataforma <strong>hecha a medida</strong> de nuestro ministerio. No es casualidad todo lo que podés hacer acá — y es tuyo.<br><br>Grabamos este video —institucional y tutorial— para que la aproveches al máximo y no te quede <strong>ninguna</strong> función sin descubrir. Son solo diez minutos, y valen oro.<br><br>Miralo con calma y descubrí cada recurso para darle el máximo aprovechamiento.$cuerpo$,
  'Ver el recorrido',
  '{{url}}',
  '#b8860b',
  true,
  'Pastores de Adoración CAF',
  true
)
on conflict (slug) do update set
  descripcion = excluded.descripcion,
  asunto = excluded.asunto,
  from_label = excluded.from_label,
  kicker = excluded.kicker,
  titulo = excluded.titulo,
  cuerpo_html = excluded.cuerpo_html,
  cta_text = excluded.cta_text,
  cta_url = excluded.cta_url,
  color_acento = excluded.color_acento,
  mostrar_logo = excluded.mostrar_logo,
  firma = excluded.firma,
  activo = excluded.activo,
  updated_at = now();
