-- Ensayómetro F3: limpieza automática de registros de práctica viejos.
--
-- practice_logs es efímero por diseño (acompaña la preparación de un orden
-- programado; la pantalla Mi Ensayo solo se ofrece para órdenes 'scheduled').
-- Cuando un orden se completa o cancela, sus logs quedan como peso muerto.
-- Este cron los poda con una GRACIA de 7 días desde la fecha del orden:
-- si un pastor/líder "Reabre" un orden dentro de la semana, la práctica de
-- cada músico sigue intacta. Pasada la semana, se limpia.
--
-- (El borrado de un orden ya limpia por ON DELETE CASCADE; esto cubre los
-- que quedan completados/cancelados sin borrarse, que es el caso normal.)

CREATE OR REPLACE FUNCTION public.cleanup_practice_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_art date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  DELETE FROM public.practice_logs pl
  USING public.orders o
  WHERE o.id = pl.order_id
    AND o.status <> 'scheduled'
    AND o.date < today_art - 7;
END;
$$;

-- Cron-only, como todas las funciones de mantenimiento.
REVOKE EXECUTE ON FUNCTION public.cleanup_practice_logs() FROM PUBLIC, anon, authenticated;

-- 04:30 ART diario (07:30 UTC), después de auto-complete-orders (03:00 ART).
SELECT cron.schedule(
  'practice-cleanup',
  '30 7 * * *',
  $cron$SELECT public.cleanup_practice_logs()$cron$
);
