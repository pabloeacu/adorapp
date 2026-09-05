-- PR B (Backend de temporales) — Miembros de banda temporales agregados por líderes.
--
-- Modelo (docs/PLAN_membresias_bandas.md §2.1–2.3, aditivo, cero migración de datos):
--   - Permanentes: siguen en bands.members uuid[] EXACTAMENTE como hoy.
--   - Temporales:  tabla nueva band_temporary_members (ventana 1–90 días).
--   - "Miembro efectivo" = permanentes ∪ temporales vigentes (expires_at > now()).
--
-- El vencimiento es por FILTRADO (nunca por borrado): un temporal vencido deja
-- de contar en todos los consumidores y desaparece en silencio (decisión 3).

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Tabla band_temporary_members + índice + GRANT + RLS
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE public.band_temporary_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id     uuid NOT NULL REFERENCES public.bands(id)   ON DELETE CASCADE,
  member_id   uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  added_by    uuid          REFERENCES public.members(id) ON DELETE SET NULL,
  -- ⚠️ CONTRATO cliente↔base: el cliente (addTemporaryBandMember) DEBE mandar
  -- starts_at y expires_at derivados del MISMO instante (starts_at = now cliente,
  -- expires_at = starts_at + N días). Así el CHECK es determinístico y no
  -- depende del reloj del servidor. Si un futuro cliente manda solo expires_at
  -- (dejando starts_at al default now() del server), el skew de reloj podría
  -- romper el CHECK: mandar SIEMPRE los dos.
  starts_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Ventana 1–90 días: FUENTE DE VERDAD del rango completo (piso Y techo),
  -- además de la validación de UI. (plan §2.4: "validado en UI y por el CHECK").
  CONSTRAINT btm_window CHECK (
    expires_at >= starts_at + INTERVAL '1 day'
    AND expires_at <= starts_at + INTERVAL '90 days'
  )
);

-- Sin UNIQUE(band_id, member_id): un nuevo período temporal = fila nueva
-- (el líder no puede UPDATE). "Vigente" = expires_at > now().
CREATE INDEX idx_btm_band_member_expires
  ON public.band_temporary_members (band_id, member_id, expires_at);

-- Regla #7 de CLAUDE.md: exponer la tabla nueva al Data API para authenticated.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.band_temporary_members TO authenticated;

ALTER TABLE public.band_temporary_members ENABLE ROW LEVEL SECURITY;
-- FORCE: consistencia con la familia de datos de pertenencia (bands/members/orders/songs
-- están con FORCE). postgres/service_role igual bypassan RLS (rolbypassrls), así que el
-- helper leído por los crons no se ve afectado; defensa en profundidad para cualquier
-- acceso futuro en contexto owner sin bypass.
ALTER TABLE public.band_temporary_members FORCE ROW LEVEL SECURITY;

-- SELECT: cualquier autenticado (los consumidores necesitan ver los efectivos).
CREATE POLICY btm_select_auth ON public.band_temporary_members
  FOR SELECT TO authenticated USING ( true );

-- INSERT: pastor o líder, Y firmando como uno mismo (no se puede firmar por otro).
CREATE POLICY btm_insert_pastor_or_leader ON public.band_temporary_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_pastor_or_leader())
    AND added_by = (SELECT id FROM public.members WHERE user_id = auth.uid() AND active LIMIT 1)
  );

-- UPDATE / DELETE: solo pastor (el líder solo agrega; quitar/editar es del pastor).
CREATE POLICY btm_update_pastor ON public.band_temporary_members
  FOR UPDATE TO authenticated USING ( (SELECT public.is_pastor()) ) WITH CHECK ( (SELECT public.is_pastor()) );
CREATE POLICY btm_delete_pastor ON public.band_temporary_members
  FOR DELETE TO authenticated USING ( (SELECT public.is_pastor()) );

-- Guard server-side: no permitir DOS asignaciones temporales vigentes para el
-- mismo (banda, persona). Defensa en profundidad (además de la validación de UI).
CREATE OR REPLACE FUNCTION public.enforce_no_duplicate_active_temp()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Lock advisory transaccional por (banda, persona): serializa inserts
  -- concurrentes del MISMO par (p. ej. doble tap en "Agregar") para que el
  -- EXISTS de abajo sea airtight bajo READ COMMITTED. Sin UNIQUE porque
  -- "vigente" depende de now() (no indexable). Distintos pares → hash distinto,
  -- sin contención. Se libera al commit/rollback.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.band_id::text || ':' || NEW.member_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.band_temporary_members t
    WHERE t.band_id = NEW.band_id
      AND t.member_id = NEW.member_id
      AND t.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'Esta persona ya tiene una asignación temporal vigente en esta banda.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_no_duplicate_active_temp
  BEFORE INSERT ON public.band_temporary_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_no_duplicate_active_temp();

-- Realtime: el cliente se suscribe a esta tabla (como members/bands/songs/orders).
ALTER PUBLICATION supabase_realtime ADD TABLE public.band_temporary_members;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Helper "miembro efectivo": una sola definición para el servidor.
--    permanentes (bands.members) ∪ temporales vigentes (expires_at > now()).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.band_effective_member_ids(p_band_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT ARRAY(
    SELECT unnest(b.members) FROM public.bands b WHERE b.id = p_band_id
    UNION
    SELECT t.member_id FROM public.band_temporary_members t
    WHERE t.band_id = p_band_id AND t.expires_at > now()
  );
$$;
-- Solo la usan los crons (SECURITY DEFINER, corren como owner). Superficie mínima.
REVOKE EXECUTE ON FUNCTION public.band_effective_member_ids(uuid) FROM PUBLIC, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Los 2 crons pasan a usar el helper. Cambio QUIRÚRGICO: solo el origen de
--    miembros; toda la demás lógica (ventana, dedup por título, encolado de
--    email, etc.) queda BYTE-IDÉNTICA. CREATE OR REPLACE resetea grants →
--    re-aserto el ACL exacto (landmine #54): {postgres owner, service_role}.
-- ════════════════════════════════════════════════════════════════════════════

-- 3a) send_rehearsal_reminders: b.members → band_effective_member_ids(b.id)
CREATE OR REPLACE FUNCTION public.send_rehearsal_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ord RECORD;
  band_member RECORD;
  rehearsal_ts timestamptz;
BEGIN
  FOR ord IN
    SELECT o.id, o.rehearsal_date, o.rehearsal_time, public.band_effective_member_ids(b.id) AS band_members
    FROM public.orders o
    JOIN public.bands b ON b.id = o.band_id
    WHERE o.rehearsal_date IS NOT NULL
      AND o.rehearsal_time IS NOT NULL
      AND o.rehearsal_reminder_sent = false
  LOOP
    BEGIN
      rehearsal_ts := (ord.rehearsal_date::text || ' ' || ord.rehearsal_time)::timestamp
                      AT TIME ZONE 'America/Argentina/Buenos_Aires';
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.orders SET rehearsal_reminder_sent = true WHERE id = ord.id;
      CONTINUE;
    END;

    IF NOW() >= rehearsal_ts - INTERVAL '2 hours' AND NOW() < rehearsal_ts THEN
      FOR band_member IN
        SELECT m.user_id, m.name, m.email
        FROM public.members m
        WHERE m.active = true
          AND m.user_id IS NOT NULL
          AND m.id::text IN (
            SELECT jsonb_array_elements_text(to_jsonb(ord.band_members))
          )
      LOOP
        INSERT INTO public.notifications (
          title, message, type, user_id, is_global, created_at, expires_at
        ) VALUES (
          '🎶 ¡Hoy tenés ensamble!',
          '¡Hoy tenés ensamble! Es hora de ensamblar con la banda las canciones que practicaste. ¡No faltes!',
          'reminder', band_member.user_id, false, NOW(), rehearsal_ts + INTERVAL '3 hours'
        );

        IF band_member.email IS NOT NULL AND band_member.email <> '' THEN
          BEGIN
            PERFORM public.encolar_email(
              'recordatorio-ensayo', band_member.email, band_member.name,
              jsonb_build_object(
                'nombre', COALESCE(band_member.name, ''),
                'fecha', to_char(ord.rehearsal_date, 'DD/MM'),
                'url', 'https://adorapp.net.ar/practica/' || ord.id
              ), 3::smallint
            );
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'send_rehearsal_reminders: email enqueue failed for %: %', band_member.email, SQLERRM;
          END;
        END IF;
      END LOOP;

      UPDATE public.orders SET rehearsal_reminder_sent = true WHERE id = ord.id;
    END IF;
  END LOOP;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.send_rehearsal_reminders() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.send_rehearsal_reminders() TO service_role;

-- 3b) send_practice_reminders: to_jsonb(b.members) → to_jsonb(band_effective_member_ids(b.id))
CREATE OR REPLACE FUNCTION public.send_practice_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  today_art date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  FOR rec IN
    WITH member_users AS (
      SELECT m.id AS member_id, m.user_id
      FROM public.members m
      JOIN public.practice_alarms pa ON pa.user_id = m.user_id AND pa.enabled
      WHERE m.active = true AND m.user_id IS NOT NULL
    ),
    upcoming AS (
      SELECT mu.user_id, o.id AS order_id, o.date,
             (SELECT count(DISTINCT s->>'songId')
              FROM jsonb_array_elements(to_jsonb(o.songs)) s) AS song_count
      FROM public.orders o
      JOIN public.bands b ON b.id = o.band_id
      JOIN member_users mu
        ON mu.member_id::text IN (SELECT jsonb_array_elements_text(to_jsonb(public.band_effective_member_ids(b.id))))
      WHERE o.status = 'scheduled'
        AND o.date >= today_art
        AND jsonb_array_length(to_jsonb(o.songs)) > 0
    ),
    progress AS (
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
$function$;
REVOKE EXECUTE ON FUNCTION public.send_practice_reminders() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.send_practice_reminders() TO service_role;

-- Rollback: ALTER PUBLICATION supabase_realtime DROP TABLE public.band_temporary_members;
--   restaurar send_rehearsal_reminders/send_practice_reminders con b.members;
--   DROP FUNCTION band_effective_member_ids(uuid), enforce_no_duplicate_active_temp() CASCADE;
--   DROP TABLE public.band_temporary_members;  (no hay pérdida: permanentes intactos en bands.members)
