-- Fase 1 (observabilidad) · Aviso de CAÍDA del sitio.
--
-- Hoy, cuando el chequeo externo (GitHub Actions → EF record-health-check) detecta
-- que adorapp.net.ar no responde, SOLO lo anota en health_checks: nadie se entera.
-- Este trigger avisa a los pastores (campanita + push + correo) cuando un chequeo
-- viene ok=false, y les avisa la RECUPERACIÓN cuando vuelve ok=true.
--
-- Importante (verificado en vivo): el ping de GitHub corre irregular (cada ~3-5 h,
-- no cada 5 min — GitHub estrangula los cron programados). Por eso NO se puede
-- exigir "N fallos seguidos" (tardaría horas): el disparador es un ok=false, con
-- dedup por `email_throttle` (a lo sumo un aviso cada 3 h mientras esté caído) para
-- no spamear. La app refuerza el ping con reintentos (uptime.yml) para que un
-- ok=false sea confiable. La cobertura 100% (detección en 1-5 min aunque se caiga
-- todo) sigue necesitando un vigía externo tipo UptimeRobot (fuera de este cambio).
--
-- Best-effort: todo va en BEGIN/EXCEPTION → un fallo del aviso NUNCA rompe el
-- registro del health_check. SECURITY DEFINER (owner postgres), como los demás
-- triggers de notificación.

CREATE OR REPLACE FUNCTION public.notify_on_health_check()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_last timestamptz; v_pastor record; v_fecha text; v_msg text;
BEGIN
  v_fecha := to_char((now() AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'DD/MM/YYYY HH24:MI');

  IF NEW.ok IS FALSE THEN
    -- Dedup: avisar a lo sumo una vez cada 3 h mientras el sitio siga caído.
    SELECT last_sent_at INTO v_last FROM public.email_throttle WHERE key='site_down';
    IF v_last IS NULL OR v_last < now() - interval '3 hours' THEN
      v_msg := 'El sitio '||COALESCE(NEW.endpoint,'adorapp.net.ar')||' no respondió al chequeo automático'
             ||CASE WHEN NEW.status_code IS NOT NULL THEN ' (código '||NEW.status_code||')' ELSE '' END
             ||'. Es posible que la app esté caída para los usuarios. Si recién se publicó una versión '
             ||'puede ser momentáneo; si persiste, revisá el estado en Vercel.';
      FOR v_pastor IN
        SELECT user_id, email, name FROM public.members
        WHERE role='pastor' AND active=true AND user_id IS NOT NULL AND email IS NOT NULL AND email<>''
      LOOP
        BEGIN
          INSERT INTO public.notifications (user_id, title, message, type, is_global)
          VALUES (v_pastor.user_id, '⚠️ AdorAPP podría estar caída', v_msg, 'alert', false);
        EXCEPTION WHEN OTHERS THEN
          INSERT INTO public.error_log (message, severity, context)
          VALUES ('notify_on_health_check: fallo push (down)', 'warning', jsonb_build_object('error', SQLERRM));
        END;
        BEGIN
          PERFORM public.encolar_email('sistema-alerta', v_pastor.email, v_pastor.name,
            jsonb_build_object('nombre', public._html_escape(COALESCE(v_pastor.name,'')), 'fecha', v_fecha,
              'problemas', '• <strong>'||public._html_escape(v_msg)||'</strong><br>'), 1::smallint);
        EXCEPTION WHEN OTHERS THEN
          INSERT INTO public.error_log (message, severity, context)
          VALUES ('notify_on_health_check: fallo mail (down)', 'warning', jsonb_build_object('error', SQLERRM));
        END;
      END LOOP;
      INSERT INTO public.email_throttle (key, last_sent_at) VALUES ('site_down', now())
        ON CONFLICT (key) DO UPDATE SET last_sent_at=now();
    END IF;

  ELSIF NEW.ok IS TRUE THEN
    -- Recuperación: sólo si veníamos de un aviso de caída (existe la marca).
    IF EXISTS (SELECT 1 FROM public.email_throttle WHERE key='site_down') THEN
      FOR v_pastor IN
        SELECT user_id, name FROM public.members
        WHERE role='pastor' AND active=true AND user_id IS NOT NULL
      LOOP
        BEGIN
          INSERT INTO public.notifications (user_id, title, message, type, is_global)
          VALUES (v_pastor.user_id, '✅ AdorAPP volvió a estar en línea',
                  'El sitio volvió a responder normalmente ('||v_fecha||' ART).', 'alert', false);
        EXCEPTION WHEN OTHERS THEN NULL; END;
      END LOOP;
      DELETE FROM public.email_throttle WHERE key='site_down';
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.error_log (message, severity, context)
    VALUES ('notify_on_health_check: fallo general', 'warning', jsonb_build_object('error', SQLERRM));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_health_check_notify ON public.health_checks;
CREATE TRIGGER on_health_check_notify AFTER INSERT ON public.health_checks
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_health_check();

REVOKE ALL ON FUNCTION public.notify_on_health_check() FROM PUBLIC, anon, authenticated;
