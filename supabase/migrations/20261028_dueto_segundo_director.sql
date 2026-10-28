-- Dueto: segundo director/cantante por canción (orders.songs[].directorId2).
-- 100% aditivo. El modelo de datos ya persiste directorId2 solo (jsonb, sin converter;
-- stripSongRefs lo conserva). Acá se ajusta el BACKEND para que el 2º director se trate
-- EXACTAMENTE igual que el 1º:
--   1) validate_order_lineup: se fuerza a la formación también el 2º director (es un
--      cantante de la banda, participante siempre — mismo riel que el 1º).
--   2) activity_digest_items: el resumen reporta el cambio de director(es) como "A y B".
--
-- Se parchean las definiciones VIVAS con replace() sobre pg_get_functiondef para no
-- reproducir funciones grandes a mano: si el snippet no matchea, RAISE → no cambia nada
-- (fail-safe). Mismo estilo que los UPDATE ... replace() de plantillas del repo.

do $patch$
declare v_def text; v_new text;
begin
  -- 1) validate_order_lineup: forzar a la formación también el 2º director (directorId2).
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'validate_order_lineup';
  if v_def is null then raise exception 'dueto: validate_order_lineup no existe'; end if;

  v_new := replace(v_def,
$old$      SELECT DISTINCT public._safe_uuid(s->>'directorId')
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.songs) = 'array' THEN NEW.songs ELSE '[]'::jsonb END) s
    LOOP$old$,
$new$      SELECT DISTINCT public._safe_uuid(did)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.songs) = 'array' THEN NEW.songs ELSE '[]'::jsonb END) s
      CROSS JOIN LATERAL (VALUES (s->>'directorId'), (s->>'directorId2')) AS d(did)
    LOOP$new$);
  if v_new = v_def then raise exception 'dueto: no se pudo parchear validate_order_lineup (snippet no encontrado)'; end if;
  execute v_new;
  revoke execute on function public.validate_order_lineup() from public, anon, authenticated;

  -- 2) activity_digest_items: reportar el cambio de director(es) con "A y B".
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'activity_digest_items';
  if v_def is null then raise exception 'dueto: activity_digest_items no existe'; end if;

  v_new := replace(v_def,
$old$              IF (b->>'directorId') IS DISTINCT FROM (s->>'directorId') THEN
                dirch := dirch || (t || ' → ' || COALESCE((SELECT mm.name FROM public.members mm WHERE mm.id::text = s->>'directorId'), 'sin director'));
              END IF;$old$,
$new$              IF (b->>'directorId') IS DISTINCT FROM (s->>'directorId') OR (b->>'directorId2') IS DISTINCT FROM (s->>'directorId2') THEN
                dirch := dirch || (t || ' → ' || COALESCE(NULLIF(concat_ws(' y ', (SELECT mm.name FROM public.members mm WHERE mm.id::text = s->>'directorId'), (SELECT mm.name FROM public.members mm WHERE mm.id::text = s->>'directorId2')), ''), 'sin director'));
              END IF;$new$);
  if v_new = v_def then raise exception 'dueto: no se pudo parchear activity_digest_items (snippet no encontrado)'; end if;
  execute v_new;
  revoke execute on function public.activity_digest_items(timestamptz, timestamptz) from public, anon, authenticated;
end
$patch$;
