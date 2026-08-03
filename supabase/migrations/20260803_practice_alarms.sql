-- Ensayómetro F2: alarma personal de ensayo + push diario 18:00 ART con anti-spam.
--
-- La alarma es OPT-IN y personal: cada usuario la activa desde "Mi Ensayo".
-- Un cron diario (18:00 ART) manda UN push por usuario, solo si:
--   * tiene la alarma activada (fila en practice_alarms con enabled = true),
--   * es integrante de la banda de >=1 orden 'scheduled' con fecha >= hoy ART
--     y con canciones cargadas,
--   * su Ensayómetro para ese orden está incompleto (< 4 hitos por canción),
--   * y todavía no recibió la alarma de hoy (dedup por día ART).
-- Anti-spam garantizado: máximo 1 push/día/usuario, cero si no hay nada
-- pendiente, cero si está al 100%, cero si no activó la alarma.
--
-- Per project rule #7: GRANT explícito para la Data API.

CREATE TABLE IF NOT EXISTS public.practice_alarms (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practice_alarms ENABLE ROW LEVEL SECURITY;

-- Owner-only en los 4 verbos (mismo contrato que practice_logs).
DROP POLICY IF EXISTS practice_alarms_select_own ON public.practice_alarms;
CREATE POLICY practice_alarms_select_own ON public.practice_alarms
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS practice_alarms_insert_own ON public.practice_alarms;
CREATE POLICY practice_alarms_insert_own ON public.practice_alarms
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS practice_alarms_update_own ON public.practice_alarms;
CREATE POLICY practice_alarms_update_own ON public.practice_alarms
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS practice_alarms_delete_own ON public.practice_alarms;
CREATE POLICY practice_alarms_delete_own ON public.practice_alarms
  FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_alarms TO authenticated;

-- Push diario. Patrón blindado de las otras funciones de cron:
-- SECURITY DEFINER + search_path fijo + REVOKE del RPC.
CREATE OR REPLACE FUNCTION public.send_practice_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  today_art date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  FOR rec IN
    WITH member_users AS (
      -- Usuarios activos, con cuenta y con la alarma encendida
      SELECT m.id AS member_id, m.user_id
      FROM public.members m
      JOIN public.practice_alarms pa ON pa.user_id = m.user_id AND pa.enabled
      WHERE m.active = true AND m.user_id IS NOT NULL
    ),
    upcoming AS (
      -- Órdenes programados (hoy o futuros) donde el usuario toca, con canciones
      SELECT mu.user_id, o.id AS order_id, o.date,
             (SELECT count(DISTINCT s->>'songId')
              FROM jsonb_array_elements(to_jsonb(o.songs)) s) AS song_count
      FROM public.orders o
      JOIN public.bands b ON b.id = o.band_id
      JOIN member_users mu
        ON mu.member_id::text IN (SELECT jsonb_array_elements_text(to_jsonb(b.members)))
      WHERE o.status = 'scheduled'
        AND o.date >= today_art
        AND jsonb_array_length(to_jsonb(o.songs)) > 0
    ),
    progress AS (
      -- 4 hitos por canción (>=1 pasada + 3 checks), igual que la pantalla.
      -- Solo cuentan logs de canciones que SIGUEN en el orden (si se quitó una
      -- canción practicada, su log no infla el progreso).
      SELECT u.user_id, u.order_id, u.date, u.song_count * 4 AS total,
        COALESCE((
          SELECT sum((pl.times_practiced > 0)::int + pl.knows_lyrics::int
                     + pl.knows_structure::int + pl.knows_arrangements::int)
          FROM public.practice_logs pl
          WHERE pl.user_id = u.user_id
            AND pl.order_id = u.order_id
            AND pl.song_id::text IN (
              SELECT DISTINCT s->>'songId'
              FROM public.orders o2, jsonb_array_elements(to_jsonb(o2.songs)) s
              WHERE o2.id = u.order_id
            )
        ), 0) AS done
      FROM upcoming u
    ),
    pending AS (
      SELECT user_id, min(date) AS next_date
      FROM progress
      WHERE done < total
      GROUP BY user_id
    )
    SELECT p.* FROM pending p
    -- Dedup diario: si ya recibió la alarma hoy (hora ART), no se repite.
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = p.user_id
        AND n.type = 'reminder'
        AND n.title = '🎸 Tu ensayo te espera'
        AND (n.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = today_art
    )
  LOOP
    INSERT INTO public.notifications (
      title, message, type, user_id, is_global, created_at, expires_at
    ) VALUES (
      '🎸 Tu ensayo te espera',
      'Tenés canciones por practicar para el orden del '
        || to_char(rec.next_date, 'DD/MM')
        || '. Entrá a Mi Ensayo y sumá una pasada. ¡Cada pasada suma!',
      'reminder',
      rec.user_id,
      false,
      now(),
      now() + INTERVAL '24 hours'
    );
  END LOOP;
END;
$$;

-- Solo el cron la ejecuta (mismo lockdown que las demás funciones de cron).
REVOKE EXECUTE ON FUNCTION public.send_practice_reminders() FROM PUBLIC, anon, authenticated;

-- 18:00 ART = 21:00 UTC (ART es UTC-3 sin DST), como los otros crons diarios.
SELECT cron.schedule(
  'practice-reminders',
  '0 21 * * *',
  $cron$SELECT public.send_practice_reminders()$cron$
);
