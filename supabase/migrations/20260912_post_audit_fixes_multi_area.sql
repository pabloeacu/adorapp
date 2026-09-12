-- ============================================================================
-- Remediaciones de la auditoría adversarial de la feature multi-área (2026-09-12).
-- Ya aplicadas a producción vía MCP; este archivo las deja registradas y es idempotente
-- (seguro de re-correr y en una base fresca). Ordena DESPUÉS de 20260912_order_channel_plans.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FIX A (MEDIUM) — Aviso/banner "¡Ojo! Hubo cambios" FALSO al guardar por primera vez un
-- orden cuyo `songs` todavía guardaba basura de UI (_localId/_pendingHistory/_suggestedDirector).
-- Como `convertOrderToDB` ahora corre `stripSongRefs`, el primer guardado del cliente escribía
-- `songs` limpio ≠ el guardado con basura → disparaba `set_order_content_changed` (sella
-- content_changed_at) + la rama de contenido de `notify_on_order_update` (correo+push a toda la
-- banda ∪ pastores ∪ observadores) SIN cambio real. Limpiamos la basura de una vez, con los
-- triggers de sello y de aviso deshabilitados para que la propia limpieza no misfire.
-- (Corre como SQL → auth.uid() NULL → notify_on_order_update se auto-corta igual; el DISABLE del
-- BEFORE set_order_content_changed evita el sello.) La limpieza preserva songId/key/directorId.
DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    ALTER TABLE public.orders DISABLE TRIGGER set_order_content_changed;
    ALTER TABLE public.orders DISABLE TRIGGER notify_order_update;

    UPDATE public.orders o
    SET songs = (
      SELECT COALESCE(
        jsonb_agg(elem.val - '_localId' - '_pendingHistory' - '_suggestedDirector' ORDER BY elem.ord),
        '[]'::jsonb)
      FROM jsonb_array_elements(o.songs) WITH ORDINALITY AS elem(val, ord)
    )
    WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(o.songs, '[]'::jsonb)) e, jsonb_object_keys(e) k
      WHERE k LIKE '\_%'
    );

    ALTER TABLE public.orders ENABLE TRIGGER notify_order_update;
    ALTER TABLE public.orders ENABLE TRIGGER set_order_content_changed;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- FIX B (low) — `_ensamble_html` dejaba " a las " colgando cuando había fecha de ensamble pero
-- rehearsal_time NULL/''. `_html_escape` devuelve '' (no NULL) → el COALESCE externo no atrapaba
-- ' a las ' || ''. Se resuelve con un CASE sobre el time crudo. (Hoy 0 órdenes en ese estado; es
-- blindaje ante escrituras no-UI/import.)
CREATE OR REPLACE FUNCTION public._ensamble_html(p_date date, p_time text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN p_date IS NULL THEN '' ELSE
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;"><tr>'
    || '<td style="padding:10px 14px;border:1px solid #e8d9a8;border-left:4px solid #b8860b;border-radius:8px;background:#fbf7ea;font-size:14px;line-height:1.5;color:#374151;">'
    || '<strong style="color:#8a6508;">Ensamble</strong> · '
    || (CASE extract(isodow from p_date)
          WHEN 1 THEN 'lunes' WHEN 2 THEN 'martes' WHEN 3 THEN 'miércoles'
          WHEN 4 THEN 'jueves' WHEN 5 THEN 'viernes' WHEN 6 THEN 'sábado'
          WHEN 7 THEN 'domingo' ELSE '' END)
    || ' ' || to_char(p_date,'DD/MM')
    || (CASE WHEN NULLIF(p_time,'') IS NOT NULL THEN ' a las ' || public._html_escape(p_time) ELSE '' END)
    || '</td></tr></table>' END
$function$;

-- ----------------------------------------------------------------------------
-- FIX C (low) — Blindaje de `order_channel_plans`: alinear con el patrón landmine #45 (REVOKE del
-- GRANT por defecto de anon que Supabase asigna a toda tabla nueva) + FORCE ROW LEVEL SECURITY
-- como members/orders/bands/collaboration_*/service_schemas. Inerte hoy (RLS ya default-deny a
-- anon; ninguna policy anon), puro defense-in-depth: si una migración futura agregara una policy
-- {public}/{anon} el GRANT crudo no quedaría vivo.
DO $$
BEGIN
  IF to_regclass('public.order_channel_plans') IS NOT NULL THEN
    REVOKE ALL ON public.order_channel_plans FROM anon;
    ALTER TABLE public.order_channel_plans FORCE ROW LEVEL SECURITY;
  END IF;
END $$;
