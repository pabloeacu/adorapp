-- Fase 3 · Chunk 2 — guarda de concurrencia en el REPERTORIO.
-- Sello de versión para songs (espejo de orders.content_changed_at): se mueve SOLO
-- cuando cambia el CONTENIDO editable de la canción, NO cuando addOrder actualiza
-- last_used → así la guarda de concurrencia optimista (updateSong) no da falsos choques.
-- Aplicado a prod vía MCP + QA transaccional. Ver landmine #85.

ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS content_changed_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_song_content_changed()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.title        IS DISTINCT FROM OLD.title
   OR NEW.artist       IS DISTINCT FROM OLD.artist
   OR NEW.key          IS DISTINCT FROM OLD.key
   OR NEW.original_key IS DISTINCT FROM OLD.original_key
   OR NEW.categories   IS DISTINCT FROM OLD.categories
   OR NEW.structure    IS DISTINCT FROM OLD.structure
   OR NEW.youtube_url  IS DISTINCT FROM OLD.youtube_url
   OR NEW.compass      IS DISTINCT FROM OLD.compass
   OR NEW.bpm          IS DISTINCT FROM OLD.bpm) THEN
    NEW.content_changed_at := now();
  ELSE
    NEW.content_changed_at := OLD.content_changed_at;  -- sin cambio de contenido (p. ej. last_used) → congelar
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_song_content_changed ON public.songs;
CREATE TRIGGER set_song_content_changed BEFORE UPDATE ON public.songs
  FOR EACH ROW EXECUTE FUNCTION public.set_song_content_changed();
