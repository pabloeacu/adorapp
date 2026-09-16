# RUNBOOK — AdorAPP

Procedimientos operativos. La idea es que cualquier persona (humano o agente) que tome este proyecto sin contexto pueda restaurar servicio en minutos siguiendo estos pasos.

---

## Stack

- **Hosting**: Vercel proyecto `adorapp` (team `pabloeacus-projects`), región `gru1` (São Paulo).
- **DB / Auth / Storage**: Supabase Pro proyecto `gvsoexomzfaimagnaqzm` (us-east-2).
- **Repo**: `github.com/pabloeacu/adorapp`, branch `main` auto-deploya a Vercel.
- **Dominio**: `adorapp.net.ar` registrado en `nic.ar`, DNS / CDN en Cloudflare.
- **CI**: `.github/workflows/ci.yml` corre lint + build en cada push y PR.

---

## Rollback de deploy roto (RTO < 2 minutos)

**Cuándo**: el último deploy a `main` rompe producción y necesitás volver al anterior **ya**.

1. Abrir https://vercel.com/pabloeacus-projects/adorapp/deployments
2. Localizar el deploy *anterior* al actual con state READY (cualquiera con badge **READY** verde y target **production**).
3. Click en los 3 puntos → **Promote to Production** (instant, < 30 s, sin rebuild).
4. Verificar https://adorapp.net.ar carga.
5. Crear un issue en GitHub con `[bug]` describiendo qué falló del deploy roto, así no lo volvemos a pushear.

**Alternativa por CLI** (si no podés abrir el dashboard):
```bash
# Necesita: PAT de Vercel en Keychain o env var VERCEL_TOKEN
vercel rollback --token <TOKEN>
```

---

## Restaurar la base (RTO ~10-30 min, RPO < 24 h)

**Cuándo**: corrupción o borrado masivo de datos.

Supabase Pro tiene **Point-in-Time Recovery** (PITR) con retención de 7 días.

1. Abrir https://supabase.com/dashboard/project/gvsoexomzfaimagnaqzm/settings/addons → confirmar que PITR está activo.
2. Ir a https://supabase.com/dashboard/project/gvsoexomzfaimagnaqzm/database/backups → tab "PITR".
3. Seleccionar timestamp deseado (idealmente justo antes del incidente).
4. **Crear branch** desde ese punto (NO restaurar a producción directo todavía — primero validar).
5. Conectar al branch con SQL Editor, correr smoke queries:
   ```sql
   SELECT count(*) FROM members;
   SELECT count(*) FROM songs;
   SELECT count(*) FROM orders;
   SELECT count(*) FROM auth.users;
   ```
6. Si los datos lucen sanos, **promover el branch a producción** desde el dashboard.
7. Avisar a los usuarios — sus sesiones siguen vivas; la app sigue funcionando con la data restaurada.

**Drill mensual recomendado**: hacer los pasos 1-5 sin paso 6, eliminar el branch al final. Confirma que el procedimiento funciona y descubre problemas antes de un incidente real.

---

## Rotar service_role key

**Cuándo**: sospecha de leak.

> Nota: Supabase ya no permite rotar la legacy `service_role` directly; el flujo es **migrar al nuevo sistema** de keys (`sb_publishable_*` cliente + `sb_secret_*` server).

1. https://supabase.com/dashboard/project/gvsoexomzfaimagnaqzm/settings/api-keys → tab "Publishable Keys".
2. Crear `sb_secret_*` nuevo si no existe; deshabilitar el legacy `service_role`.
3. En Supabase Edge Functions secrets, actualizar `SUPABASE_SERVICE_ROLE_KEY` al `sb_secret_*` nuevo (Supabase la pisa automáticamente para legacy).
4. Si el cliente usa la legacy `anon` key, hacer lo mismo: crear `sb_publishable_*`, actualizar Vercel env var `VITE_SUPABASE_ANON_KEY`, redeploy.
5. Verificar `adorapp.net.ar` login funciona.

---

## Rotar GitHub PAT

1. https://github.com/settings/tokens → revocar token "AdorAPP Deploy".
2. **Generate new token (classic)** → scope solo `repo`, expiración 90 días.
3. En la máquina del dev:
   ```bash
   git credential approve <<EOF
   protocol=https
   host=github.com
   username=pabloeacu
   password=<NUEVO_PAT>

   EOF
   ```
4. Confirmar `git fetch` funciona.

---

## Restaurar reflexión diaria si pg_cron falla

**Síntoma**: el bell de la campanita no muestra reflexión nueva en varios días.

1. Verificar el job:
   ```sql
   -- Nombres reales en cron.job: 'daily-afternoon-reflection' (jobid 5) y el monitor 'notification-monitor' (jobid 6).
   SELECT * FROM cron.job WHERE jobname IN ('daily-afternoon-reflection', 'notification-monitor');
   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
   ```
2. Si el job está pero falla: leer `return_message` de la última run.
3. Disparar manualmente para popular hoy:
   ```sql
   SELECT public.send_daily_reflection_notification();
   ```
4. Si pg_cron está caído: verificar extensión `CREATE EXTENSION IF NOT EXISTS pg_cron;`.

---

## Si se traba el correo (el "latido" que envía TODOS los mails)

**Qué es**: NINGÚN correo se manda en el acto. Se ENCOLA en `email_queue` y un cron
lo procesa. La cadena es: SQL → `encolar_email(...)` → fila en `email_queue` → cron
**`send-emails-worker`** (jobid 14, corre cada minuto) → `trigger_send_emails()` → Edge
Function **`send-emails`** → Gmail. Si esa cadena se traba, se frena TODO: aprobaciones
de registro, recordatorios de ensamble, feedback, comunicaciones, alertas.

**Síntoma**: no llegan correos que deberían; o el monitor avisa "correo(s) atascados sin
enviarse (>1 h)".

1. Ver cuántos hay encolados y fallados (SQL Editor de Supabase):
   ```sql
   SELECT status, count(*), min(created_at) AS mas_viejo
   FROM public.email_queue GROUP BY status ORDER BY status;
   ```
   - Muchos `pending` viejos → el worker no está corriendo o la EF falla.
   - Muchos `failed` → problema de credenciales/cupo de Gmail (ver paso 4).
2. Ver el cron y su última corrida:
   ```sql
   SELECT jobid, schedule, active FROM cron.job WHERE jobname='send-emails-worker';
   SELECT status, return_message, start_time
   FROM cron.job_run_details
   WHERE jobid=(SELECT jobid FROM cron.job WHERE jobname='send-emails-worker')
   ORDER BY start_time DESC LIMIT 10;
   ```
   - Si `active=false`: re-activar con `SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='send-emails-worker'), active:=true);`
   - Si el job no existe: re-crear `SELECT cron.schedule('send-emails-worker','* * * * *',$$select public.trigger_send_emails()$$);`
3. Empujar la cola a mano una vez (seguro; hace lo mismo que el cron):
   ```sql
   SELECT public.trigger_send_emails();
   ```
   Volvé a mirar `email_queue`: los `pending` deberían bajar. Si no, el problema está en la EF.
4. Si la EF `send-emails` falla (credenciales/cupo de Gmail): revisar sus logs en
   Supabase → Edge Functions → `send-emails` → Logs. La config de Gmail la lee
   `get_email_config()`; si Gmail rechaza (cupo diario, token vencido), los correos
   quedan `failed`. **No reintentar en loop**: corregir la credencial y recién ahí
   re-encolar. En una QA NUNCA dispares correos reales a los 8 usuarios: pausá el
   worker (`active:=false`) antes de probar cualquier flujo de correo.

---

## Cuando salta una alerta del monitor (⚠️ "Alerta del sistema AdorAPP")

**Qué es**: el cron **`check_system_health()`** (jobid 18, cada 15 min) vigila 4 señales
y, ante una anomalía real, te avisa por **campanita + push + correo** (plantilla
`sistema-alerta`). Está en silencio cuando todo está sano. El correo dice cuál de las 4
señales se disparó. Qué hacer según cuál sea:

1. **"correo(s) atascados sin enviarse (>1 h)"** → seguí la sección **"Si se traba el
   correo"** de arriba. Es lo más urgente (frena todo el correo).
2. **"correo(s) fallaron"** → algo rebotó en Gmail. Mirá los `failed`:
   ```sql
   SELECT to_email, template_slug, ultimo_error, created_at FROM public.email_queue
   WHERE status='failed' AND created_at > now()-interval '24 hours' ORDER BY created_at DESC;
   ```
   Suele ser un correo mal escrito de un miembro o un cupo de Gmail. Si es un solo
   destinatario, no es grave; si son muchos, revisá credenciales (sección anterior).
3. **"corrida(s) de tareas automáticas fallaron"** → un cron falló. Cuál y por qué:
   ```sql
   SELECT j.jobname, d.return_message, d.start_time
   FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
   WHERE d.status='failed' AND d.start_time > now()-interval '24 hours'
   ORDER BY d.start_time DESC;
   ```
   El `return_message` dice el error. Muchos crons son idempotentes: se pueden re-correr
   a mano (p. ej. `SELECT public.send_daily_reflection_notification();`).
4. **"error(es) nuevos serios"** → errores del cliente/servidor sin resolver:
   ```sql
   SELECT message, severity, context->>'kind' AS kind, occurred_at
   FROM public.error_log
   WHERE severity IN ('error','fatal') AND COALESCE(resolved,false)=false
     AND occurred_at > now()-interval '24 hours' ORDER BY occurred_at DESC;
   ```
   Cuando lo resolviste (o si es ruido), marcalo: `UPDATE public.error_log SET resolved=true WHERE id=<id>;`

> **Nota**: hoy la alerta te manda a la base. Está planificado un panel de **"Salud del
> sistema"** dentro de la app (solo lectura, solo pastor) para no depender del SQL Editor.
> Y para QA: **nunca** llames a `check_system_health()` "en vivo" — puede mandar un correo
> real; probalo siempre dentro de una transacción con `RAISE` que revierta y el trigger
> `push_on_notification_insert` deshabilitado (landmine #84).

---

## Despliegue manual (escape hatch)

**Cuándo**: GitHub Actions caído y necesitás pushear un fix.

```bash
cd /Users/paulair/Desktop/Adorapp/adorapp
npm run lint      # verificar local
npm run build     # verificar local
git push origin main
# Vercel auto-deploya. Verificar en https://vercel.com/pabloeacus-projects/adorapp/deployments
```

Si hay urgencia y CI no funciona: el deploy de Vercel NO depende de GitHub Actions; va con el push.

---

## Contactos / recursos

| Servicio | URL |
|---|---|
| Supabase Dashboard | https://supabase.com/dashboard/project/gvsoexomzfaimagnaqzm |
| Vercel Dashboard | https://vercel.com/pabloeacus-projects/adorapp |
| GitHub Repo | https://github.com/pabloeacu/adorapp |
| Producción | https://adorapp.net.ar |
| Status Vercel | https://www.vercel-status.com/ |
| Status Supabase | https://status.supabase.com/ |
