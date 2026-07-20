-- Fix: "eliminar orden" no funcionaba y los líderes no podían eliminar.
--
-- Bug 1 (borrado era un no-op silencioso): al eliminar una orden que ya tenía
-- tonalidades guardadas, Postgres lanzaba un error 23503 (violación de FK) sobre
-- song_key_history_order_id_fkey, porque la FK estaba en NO ACTION. El cliente se
-- tragaba ese error (llamada fire-and-forget), así que "Sí, eliminar" no hacía nada.
-- Se pasa la FK a ON DELETE SET NULL: se conserva la "memoria" de tonalidad por
-- (miembro, canción) y sólo se suelta la referencia a la orden borrada. order_id
-- ya es nullable y el lector (fetchKeyHistory) tolera un order_id null (muestra la
-- tonalidad con "fecha no disponible").
ALTER TABLE public.song_key_history
  DROP CONSTRAINT song_key_history_order_id_fkey;
ALTER TABLE public.song_key_history
  ADD CONSTRAINT song_key_history_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

-- Bug 2 (los líderes no podían eliminar): la política DELETE era is_pastor() sola,
-- así que un líder quedaba bloqueado en la base aunque viera el botón. Se alinea con
-- las políticas de insert/update (is_pastor_or_leader) y con la UI actualizada.
DROP POLICY IF EXISTS orders_delete_pastor ON public.orders;
CREATE POLICY orders_delete_pastor_or_leader ON public.orders
  FOR DELETE TO authenticated
  USING (public.is_pastor_or_leader());
