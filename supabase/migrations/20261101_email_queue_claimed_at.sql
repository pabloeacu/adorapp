-- ─────────────────────────────────────────────────────────────────────────────
-- Reaper del worker de correo: columna de marca de reclamo (claimed_at)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cierra un hueco de confiabilidad PREEXISTENTE del worker send-emails (lo detectó
-- la auditoría adversarial del carril exprés): una fila reclamada (status='sending')
-- queda varada para siempre si el isolate muere entre el claim y el estado terminal
-- (ningún carril re-toma 'sending'; el monitor es ciego a 'sending'). En un aviso de
-- culto EN VIVO eso sería un correo perdido sin alerta.
--
-- El worker (supabase/functions/send-emails/index.ts) ahora:
--   (1) sella claimed_at = now() al reclamar una fila (pending→sending), en ambos carriles;
--   (2) al inicio de cada latido re-penea las filas 'sending' con claimed_at más viejo
--       que STUCK_CLAIM_MINUTES (un envío real dura <1s → ese margen garantiza que el
--       isolate murió). Re-claim idempotente (CAS on 'pending'); entrega at-least-once.
-- claimed_at sobre una fila en vuelo (claim reciente) NO se re-penea → sin doble envío.
--
-- Columna de uso exclusivo del worker (service_role). El panel de pastores la lee por
-- el GRANT SELECT de tabla ya existente (email_queue), sin grant nuevo. Nullable,
-- aditiva, sin default: cero impacto en filas existentes.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

COMMENT ON COLUMN public.email_queue.claimed_at IS
  'Instante en que el worker send-emails reclamó la fila (pending→sending). Lo usa el reaper para recuperar filas varadas en sending si el isolate murió. Lo escribe SOLO el worker (service_role).';
