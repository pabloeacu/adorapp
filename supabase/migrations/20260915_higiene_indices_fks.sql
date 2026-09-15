-- Fase 3 · Chunk 6 — HIGIENE DE ÍNDICES (backend, riesgo cero, aditivo).
-- Cierra el lint de performance `unindexed_foreign_keys` (10 FKs sin índice de
-- cobertura en su columna líder) + elimina UN índice único DUPLICADO idéntico.
--
-- Por qué importa: una FK sin índice hace que borrar/actualizar la fila PADRE
-- escanee secuencialmente la tabla HIJA (p. ej. borrar una notificación escanea
-- las 1225 filas de notifications_read), y ralentiza los JOINs por esa FK. Hoy
-- las tablas son chicas (imperceptible), pero es la preparación canónica para
-- crecer 10×-100× sin degradar. Agregar un índice NO cambia ningún comportamiento;
-- solo acelera. `IF NOT EXISTS` → idempotente. Tablas chicas → build instantáneo,
-- lock SHARE de milisegundos (sin CONCURRENTLY, que no corre dentro de la tx de la
-- migración; innecesario a esta escala).

-- 1) Índices de cobertura para las 10 foreign keys sin índice.
CREATE INDEX IF NOT EXISTS idx_btm_added_by                    ON public.band_temporary_members (added_by);
CREATE INDEX IF NOT EXISTS idx_btm_member_id                   ON public.band_temporary_members (member_id);
CREATE INDEX IF NOT EXISTS idx_collab_req_band_id              ON public.collaboration_requests (band_id);
CREATE INDEX IF NOT EXISTS idx_collab_req_covered_member       ON public.collaboration_requests (covered_member_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_template_slug       ON public.email_queue (template_slug);
CREATE INDEX IF NOT EXISTS idx_error_log_resolved_by           ON public.error_log (resolved_by);
CREATE INDEX IF NOT EXISTS idx_notifications_read_notification ON public.notifications_read (notification_id);
CREATE INDEX IF NOT EXISTS idx_orders_content_changed_by       ON public.orders (content_changed_by);
CREATE INDEX IF NOT EXISTS idx_schema_templates_created_by     ON public.schema_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_service_schemas_created_by      ON public.service_schemas (created_by);

-- 2) Índice único DUPLICADO en song_key_history: existen DOS constraints únicos
--    idénticos sobre (member_id, song_id). Se conserva `unique_member_song_key`
--    (nombre intencional) y se elimina el auto-generado. El upsert de tonos usa
--    onConflict por COLUMNAS (member_id,song_id) → sigue resuelto por el que queda.
--    Verificado: ninguna FK ni objeto depende de estos constraints (0 dependientes).
ALTER TABLE public.song_key_history DROP CONSTRAINT IF EXISTS song_key_history_member_id_song_id_key;
