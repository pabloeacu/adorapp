-- Eliminar bandas/canciones/miembros fallaba en silencio por FKs NO ACTION.
--
-- Reporte de Paul: eliminar "Banda Test" confirma pero no elimina. Causa:
-- orders.band_id → bands.id estaba en NO ACTION; una banda con órdenes lanza
-- 23503 y el handler del cliente (fire-and-forget) tragaba el error y mostraba
-- "eliminada" igual. MISMA CLASE que el bug de eliminar órdenes (PR #42).
--
-- Auditoría de la familia completa (todas las FKs NO ACTION que bloquean
-- deletes reales, confirmadas con control negativo 23503 impersonando pastor):
--   1. orders.band_id → bands              : borrar banda con órdenes.
--   2. song_key_history.song_id → songs    : borrar canción con historial de
--      tonos (9 de 107 canciones ya están en ese estado).
--   3. song_key_history.member_id → members: borrar miembro con historial
--      (la EF admin-delete-member también choca: service_role no exime FKs).
--   4. pending_registrations.approved_by/rejected_by → members: borrar un
--      miembro que aprobó/rechazó solicitudes.
--
-- Semántica elegida (consistente con PR #42 y con el copy del confirm de
-- Bandas, que promete "las órdenes permanecerán"):
--   - orders.band_id → SET NULL: el orden histórico sobrevive sin banda
--     (la UI muestra "Banda eliminada").
--   - song_key_history.song_id / member_id → CASCADE: la memoria de tono es
--     de un (miembro, canción); sin ese miembro o canción no referencia nada.
--   - pending_registrations.approved_by / rejected_by → SET NULL: la
--     solicitud histórica se conserva, se suelta la referencia al aprobador.

ALTER TABLE public.orders
  DROP CONSTRAINT orders_band_id_fkey,
  ADD CONSTRAINT orders_band_id_fkey
    FOREIGN KEY (band_id) REFERENCES public.bands(id) ON DELETE SET NULL;

ALTER TABLE public.song_key_history
  DROP CONSTRAINT song_key_history_song_id_fkey,
  ADD CONSTRAINT song_key_history_song_id_fkey
    FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE CASCADE;

ALTER TABLE public.song_key_history
  DROP CONSTRAINT song_key_history_member_id_fkey,
  ADD CONSTRAINT song_key_history_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;

ALTER TABLE public.pending_registrations
  DROP CONSTRAINT pending_registrations_approved_by_fkey,
  ADD CONSTRAINT pending_registrations_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES public.members(id) ON DELETE SET NULL;

ALTER TABLE public.pending_registrations
  DROP CONSTRAINT pending_registrations_rejected_by_fkey,
  ADD CONSTRAINT pending_registrations_rejected_by_fkey
    FOREIGN KEY (rejected_by) REFERENCES public.members(id) ON DELETE SET NULL;
