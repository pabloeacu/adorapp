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
   SELECT * FROM cron.job WHERE jobname = 'daily-reflection-notification';
   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
   ```
2. Si el job está pero falla: leer `return_message` de la última run.
3. Disparar manualmente para popular hoy:
   ```sql
   SELECT public.send_daily_reflection_notification();
   ```
4. Si pg_cron está caído: verificar extensión `CREATE EXTENSION IF NOT EXISTS pg_cron;`.

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
