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

## Estado al 2026-06-18

Sesión "mobile" grande, **7 PRs a producción** (rama `claude/mobile-photo-upload-3asq58`), todos validados en vivo por Leandro (líder) en su celular real. Foco: que la versión móvil tenga paridad y funcione de punta a punta. CI verde (lint+build+28 tests+smoke prod) en cada merge.

- **PR #24** (`91963bc`): (a) **foto de perfil no guardaba** → el bucket `avatars` tenía RLS habilitado con **CERO políticas**; se agregaron 4 (ver "Subsistema avatars"). (b) **contenido tapado por la barra inferior** → `Layout.jsx` mobile usaba `pb-16` sin contemplar `env(safe-area-inset-bottom)`; ahora `paddingBottom: calc(80px + env(safe-area-inset-bottom))`.
- **PR #25** (`3dacc10`): botón **"Imprimir"** (PDF de canciones con acordes, `generateSongsPDF`) inalcanzable en celular → la fila de acciones de la orden se desbordaba sin `flex-wrap`. Header de tarjeta apila en móvil + `flex-wrap`. También se agregó "Imprimir" en la vista de detalle.
- **PR #26** (`ebf4a3b`): **auditoría completa de paridad web↔móvil** (HIGH+MEDIUM+LOW). Lo más grave: en /miembros las acciones del pastor (resetear pass/editar/eliminar) estaban `opacity-0 group-hover` → **invisibles al tacto** (ahora `opacity-100 lg:opacity-0 lg:group-hover:...`). Además: botón búsqueda del Header desktop estaba muerto (sin onClick); "Eliminar foto" faltaba en móvil; tablas con `min-w`+columnas ocultas en móvil; `flex-wrap` en clusters varios; grids responsive; "Sincronizar" en MobileNav; email/rol en perfil móvil; limpieza de código muerto. **Verificado OK:** navegación por rol Sidebar==MobileNav (idéntica) y el `<Modal>` compartido ya era mobile-safe.
- **PR #27** (`9413711`): **los modales no se cerraban en celular** (el gesto "atrás" navegaba de sección) → el `<Modal>` compartido ahora se integra con el historial (`pushState` al abrir, `popstate`/back → cierra) y se renderiza con `createPortal` a `document.body`. Cabecera con botón "Cerrar" visible. **Beneficia a TODOS los modales.**
- **PR #28** (`ec09740`): botón **Guardar** del recortador quedaba bajo el notch/status bar → se movió a una **barra inferior fija** ("Guardar cambios") con `env(safe-area-inset-bottom)`, y la barra superior respeta `env(safe-area-inset-top)`.
- **PR #29** (`d753f79`): **el guardado de foto era un no-op silencioso en móvil** → `handleSavePhoto` leía `fileInputRef.current?.files?.[0]` y salía si era null; pero ese `<input>` vive dentro del modal "Cambiar foto" que se **desmonta** al abrir el recortador → `fileInputRef.current` null → return. Fix: el guardado dibuja desde `previewUrl` (que persiste), no del input.
- **PR #30** (`3f0b983`): **el recorte guardado no coincidía con la vista previa** (bug recurrente histórico) → el guardado adivinaba el tamaño con constantes (200/280) que no coincidían con el render real, y la preview centraba con `margin: -50%` irreproducible. Fix: preview con `transform: translate(-50%,-50%)`; el guardado **mide `cropImgRef.current.offsetWidth/Height`** (tamaño real renderizado) y replica el pipeline exacto en canvas (`center → scale(k) → scale(zoom) → rotate → translate(px/zoom,py/zoom) → drawImage` centrado, `k=canvas/circle`).

**Subsistema avatars (importante):**
- Bucket `avatars` es **público**, mime `image/png|jpeg|gif|webp`, límite 5MB. Hasta el 18-jun-2026 tenía RLS ON sin políticas → ningún upload funcionaba para nadie. Políticas actuales sobre `storage.objects`: `avatars_public_read` (SELECT public), `avatars_authenticated_insert/update/delete` (TO authenticated, `bucket_id='avatars'`). Migración `supabase/migrations/20260618_avatars_storage_rls.sql`.
- La foto de Paul es un **data-URI base64 embebido en `members.avatar_url`** (~58k chars) de antes de migrar a Storage. Funciona pero infla la fila. Backlog: migrarla a Storage.
- Flujo móvil de foto vive en `MobileNav.jsx` (`handleCameraClick`→modal `showPhotoModal`→`handleFileSelect`→recortador `showCropper`→`handleSavePhoto`). El desktop es **otro** cropper en `Header.jsx` (duplicado ~40%).

**Landmines nuevos (no re-romper):**
1. **Cropper móvil**: `handleSavePhoto` NO debe depender de `fileInputRef` (el input se desmonta al cerrar el photo-modal). Dibujar siempre desde `previewUrl`.
2. **Cropper accuracy**: para que el recorte guardado == preview, medir el tamaño REAL del `<img>` (`offsetWidth/Height`, no afectado por transform) y replicar el MISMO pipeline de transform. No usar constantes de tamaño.
3. **Acciones touch**: nunca esconder acciones con `opacity-0 group-hover` sin un `lg:` que las deje visibles en móvil (no hay hover en touch).
4. **Filas de botones**: usar `flex-wrap` en clusters de acciones dentro de `justify-between`; en pantallas angostas se recortan fuera de la tarjeta.
5. **Bucket nuevo público**: además del GRANT de tablas (regla #7), un bucket de Storage necesita sus **políticas RLS explícitas** sobre `storage.objects` o nadie puede subir.
6. **`<Modal>` compartido** (`src/components/ui/Modal.jsx`): ahora usa history+portal. Si tocás modales, el back gesture los cierra; no agregar cierre por backdrop (rompería forms con pérdida de input).

**Operativa:** PRs creados y mergeados (squash) vía GitHub MCP; CI gated por branch protection en `main` (workflow "CI": Lint+Build+Test + Smoke test prod). Validación visual la hace el usuario en su celular (sin Claude-in-Chrome en este entorno; Leandro no puede abrir previews de Vercel si tienen protección). Auditoría de paridad detallada: `AUDIT/06_parity.md`.

**Backlog abierto:**
- El cropper desktop (`Header.jsx`) tiene la **misma matemática frágil con constantes** que tenía el móvil (no se tocó; el reporte fue sólo móvil). Aplicar el mismo fix de medición si aparece el problema en compu.
- Extraer el cropper a un hook/componente compartido (hoy duplicado Header+MobileNav ~40%).
- Convertir los `alert()` del perfil móvil a modales (UX; en desktop ya son modales).
- Migrar la foto base64 de Paul a Storage.
