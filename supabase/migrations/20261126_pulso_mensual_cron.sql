-- Cron del Pulso mensual: día 1 de cada mes, 12:00 UTC = 09:00 ART.
-- Cubre el mes anterior completo. La función se auto-deduplica por mes
-- (email_throttle 'pulso:<YYYY-MM>'), así que una segunda corrida el mismo
-- mes no reenvía. Se activó el 2026-11-26 tras la aprobación del diseño por Paul.
SELECT cron.schedule('pulso-mensual-report', '0 12 1 * *', $$SELECT public.send_pulso_mensual();$$);
