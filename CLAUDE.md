# AdorAPP — guía para el agente

Este archivo se carga automáticamente al iniciar cualquier sesión de Claude Code en este repo. Es el contrato mínimo para no perder contexto entre sesiones.

## Qué es esto

PWA en Vite/React 18 + Supabase + Vercel para ~8 usuarios reales del **ministerio de adoración de Adoración CAF**. Los líderes arman **órdenes** (la lista de canciones de cada reunión/culto). Pastores son Paul y Ana.

- **Dominio prod:** https://adorapp.net.ar (Vercel project `adorapp`, region `gru1`).
- **Repo:** github.com/pabloeacu/adorapp (público, branch `main` protegida).
- **Backend:** Supabase plan **Pro**.
- **Working dir:** este directorio (`adorapp/`). La carpeta padre `Desktop/Adorapp/` es un wrapper con scripts viejos — no operes desde ahí.

## Reglas no negociables

1. **No commitees a `main` directo.** Trabajá en ramas con prefijo (`audit/`, `fix/`, `perf/`, `refactor/`, `feat/`, `docs/`).
2. **Antes de cualquier acción destructiva o irreversible** (drop tablas, cambiar RLS prod, modificar DNS, rotar secrets, eliminar branches Vercel), pará y pediendo confirmación con el cambio exacto.
3. **No le pidas a Paul pasos manuales en Supabase, Vercel o GitHub.** Usá los MCPs (`mcp__c5073f58-...` para Supabase, `mcp__a9edc114-...` para Vercel, `gh` para GitHub) o tomá control de Chrome (`mcp__Claude_in_Chrome__*`).
4. **Cierre narrativo no-técnico al terminar cada fase.** "Qué pasaba → qué hice → qué cambia para vos como pastor". El detalle técnico va al `AUDIT_LOG.md` y a los commits.
5. **Testeá que no se rompa lo que funciona** antes de cerrar una fase: lint + build + tests + smoke en prod.
6. **Sin `service_role` en cliente.** Las operaciones privilegiadas pasan por Edge Functions admin-* (ya hay 7 desplegadas).
7. **Toda migración que `CREATE TABLE` en `public` debe incluir explícitamente `GRANT SELECT, INSERT, UPDATE, DELETE ON <tabla> TO authenticated;`** (y `TO anon` si corresponde). Desde el 30-oct-2026 Supabase deja de exponer tablas nuevas al Data API por defecto; este paso anticipa el cambio y evita "tabla creada que el cliente no puede leer".
8. **NUNCA llamar `supabase.from(...).update(convertXToDB(partial))`.** Los `convertXToDB` en `src/stores/appStore.js` generan rows completos con defaults para INSERTs. Si un partial pasa por ahí, Postgres SOBRESCRIBE TODA la fila con esos defaults — pérdida silenciosa de letra/acordes/tono/etc. Siempre rutear vía `updateMember/Band/Song/Order` del store, que mergean el partial con el snapshot del store antes del converter. Incidente raíz: 15-jun-2026, PR #20. Si agregás una nueva tabla con su propio converter, replicar este patrón (merge primero) y dejar el comentario "DATA-LOSS LANDMINE" sobre el converter.

## Vocabulario eclesial (importa)

- "**orden**" (no "culto") = lista de canciones de la reunión.
- "**ministerio de adoración**" (no "iglesia entera") cuando hablás del alcance de comunicación.
- "**estándares de seguridad**" (no "seguridad de tipo empresa").
- "hecha **a medida** del ministerio" (no "única en Hispanoamérica").
- Cierre canónico para presentaciones a pastores generales: *"siguiendo la visión de los pastores generales de la iglesia, Claudio y Claudia Tomaselli, perseguimos la excelencia con el único afán de que brille el Rey y se extienda Su reino"*.

## Estética

- Negro plano queda simplón. Preferí gradientes radiales aurora (azul/violeta) sobre fondos oscuros.
- Para PDFs e iOS: nunca confiar en `radial-gradient + mask-image` — generá PNG real con `scripts/gen-aurora-bg.cjs` y embebelo.
- Logos PNG sobre fondo dark: `mix-blend-mode: lighten` para eliminar el cuadrado negro.
- Spinners de carga: usar `<PageLoader />` (logo + pulso + "Cargando…"), no spinners circulares genéricos.

## Stack y archivos clave

- `src/App.jsx` — routing con React.lazy por ruta.
- `src/stores/{authStore,appStore}.js` — Zustand. `authStore.refreshProfile()` dispara `appStore.initialize()`.
- `src/lib/supabase.js` — cliente público, `callAdminFunction()` para Edge Functions.
- `src/lib/{csv,orders}.ts` — únicos archivos TS hasta ahora; resto del código es JS.
- `src/components/layout/{Header,MobileNav}.jsx` — los dos archivos monstruo (1712 + 1242 líneas, ~40% duplicado). Refactor pendiente en backlog.
- `src/components/ui/PageLoader.jsx` — loader unificado.
- `supabase/` — migrations + edge functions.
- `presentation/` — generador del PDF para pastores generales (`render.cjs` + `render-mobile.cjs`).
- `scripts/seed-devotionals.cjs` — fuente de verdad para los 365 versículos RV60.
- `AUDIT/` — auditoría inicial; ver `AUDIT_LOG.md` y `00_REPORT.md`.
- `docs/RUNBOOK.md` — rollback, restore PITR, rotación de keys, recuperación cron.

## Crons activos (Supabase pg_cron)

- `daily-devotional-notification` 06:00 ART
- `daily-reflection-notification` 17:00 ART
- `reflection-monitor` cada 6 h (escribe a `error_log` si falta reflexión >25 h)
- `daily-birthday-notification` 09:00 ART (push a pastores con cumpleaños del día; jobid 7)

## Comandos útiles

- `pnpm dev` (o `npm run dev`) — dev server.
- `npm run lint` / `npm run lint:fix`.
- `npm test` — Vitest.
- `npm run build` — build de prod (CI lo corre + integrity grep contra `service_role`/`supabaseAdmin`).
- `node presentation/render-mobile.cjs` — regenerar PDF mobile de la presentación.
- `node scripts/gen-aurora-bg.cjs` — regenerar imagen aurora base.
- `node scripts/seed-devotionals.cjs` — regenerar SQL de devocionales.

## Estado al 2026-04-28

Fases A, B, C, D, E1 cerradas en producción. Última sesión grande quedó clavada por capturas >2000 px acumuladas; el contexto se preservó en `~/.claude/projects/-Users-paulair-Desktop-Adorapp/memory/`. Untracked al cierre: `AdorAPP-PresentacionFinal-Movil.pdf`, `scripts/gen-aurora-bg.cjs`. Hilo abierto: Paul reportó "tengo un tema con la notificación de hoy" — preguntar de qué se trataba al retomar.

## Estado al 2026-05-16

Sesión grande, 5 PRs cerrados a producción + validados online con 3 roles reales:
- PR #14 ícono CAF en home screen (commit `5f26c81`).
- PR #15 paso 5 del wizard "guardar como app" (commit `378a945`). Wizard ahora tiene 5 pasos: Bienvenida → Tour → Datos → Notifs → Instalar.
- PR #16 visibilidad por rol en /miembros (commit `f5ac2b6`): líder ve sólo nombre/rol/instrumentos; miembro no ve la sección + route guard `<MembersOnlyRoles>` en `App.jsx` redirige a `/`.
- PR #17 push diario cumpleaños 09:00 ART para pastores (commit `0f0999e`): `send_daily_birthday_notifications()` + cron job 7 + tipo `'birthday'` + ícono Cake rosa.
- PR #18 mobile bottom nav 4 fijos + hamburguesa secundaria (commit `0316347`): pastor ve 3 ítems en hamburguesa, líder sólo Miembros, miembro sin hamburguesa.

**Operativa nueva:**
- Mergeo de PRs vía GitHub API REST con PAT del Keychain (`security find-internet-password -s "github.com" -w`). Sin `gh` CLI.
- Migrations a Supabase prod vía MCP `apply_migration` (proyecto AdorAPP id `gvsoexomzfaimagnaqzm`).
- Tests E2E con Claude in Chrome MCP contra prod, leyendo DOM del MobileNav vía `javascript_tool` (Tailwind `lg:hidden` no renderiza visualmente pero el HTML está, perfecto para auditoría).

**Regla importante para no romper:** NUNCA crear test users vía SQL crudo. Genera error "Database error querying schema" porque se saltea `auth.identities` + inicialización de tokens como ''. Usar siempre `admin-create-member` EF (misma puerta que el UI del pastor). Detalle completo en `memory/project_state_20260516.md`.
