-- Fase 3 · Chunk 3 — DEFENSA EN PROFUNDIDAD: quitar la escritura anónima (anon)
-- que Supabase deja por defecto en tablas sensibles. HOY el RLS ya bloquea a anon
-- en todas (sus policies de escritura o niegan, o exigen auth.uid(), que anon no
-- tiene) — esto agrega una SEGUNDA barrera a nivel de GRANT (mínimo privilegio).
-- INVISIBLE: nadie sin login escribe estas tablas legítimamente.
-- ÚNICA excepción legítima: el formulario público de registro → se conserva
-- `INSERT` de anon en `pending_registrations` (policy pending_reg_insert_anon).
-- NO se toca a `authenticated` (los usuarios logueados siguen escribiendo igual),
-- ni los SELECT (lecturas). Aplicado a prod vía MCP.

REVOKE INSERT, UPDATE, DELETE ON
  public.band_temporary_members,
  public.bands,
  public.communication_notifications,
  public.communications,
  public.daily_devotionals,
  public.daily_reflections,
  public.email_queue,
  public.email_templates,
  public.email_throttle,
  public.member_activity,
  public.members,
  public.notifications_read,
  public.orders,
  public.practice_alarms,
  public.practice_logs,
  public.push_subscriptions,
  public.sent_emails,
  public.service_feedback,
  public.song_key_history,
  public.songs
FROM anon;

REVOKE UPDATE ON public.error_log FROM anon;

-- pending_registrations: conservar SOLO INSERT (formulario público "Solicitar registro").
REVOKE UPDATE, DELETE ON public.pending_registrations FROM anon;
