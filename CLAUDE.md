# AdorAPP — guía para el agente

Este archivo se carga automáticamente al iniciar cualquier sesión de Claude Code en este repo. Es el contrato mínimo para no perder contexto entre sesiones.

> 📐 **Mapa completo del proyecto:** `ARCHITECTURE.md` (raíz) documenta **cada página, store, componente, librería, migración y cron** con sus funciones y flujo de datos, más la foto autoritativa de la base (tablas/RLS/crons/FKs/funciones). Leé PRIMERO este `CLAUDE.md` (el contrato: Regla de Oro + reglas + los 42 landmines), y usá `ARCHITECTURE.md` como el mapa exhaustivo del código.

## ⭐ REGLA DE ORO — método obligatorio para CADA pedido (innegociable)

Aplica a **toda** solicitud de Paul, **sin importar cuán chica o trivial parezca**. No es opcional ni por caso: es el estándar permanente del proyecto. Vale para esta sesión y para cualquier sesión futura.

**Cada chunk arranca por el panorama y cierra por el informe.** Antes de tocar código: analizá TODO el panorama, evaluá todas las alternativas posibles y traé sugerencias, correcciones o preguntas ANTES de avanzar. La plataforma está **EN VIVO con usuarios reales**, así que cada cambio se hace con **precisión quirúrgica** y con la garantía absoluta de no romper nada. Al terminar, cerrá con un **informe breve en lenguaje sencillo** que le permita a Paul entender que todo se hizo según lo acordado y, si quedara algo, qué queda pendiente y por qué. (Confirmado y reforzado por Paul el 2026-09-05: es innegociable.)

1. **Alcance total, nunca aislado.** Lo que Paul reporta es el *síntoma*, no el límite del trabajo. Pensá transversalmente: investigá TODO lo que pueda estar relacionado (misma causa raíz, mismo patrón, mismo componente, mismos datos, mismas capas). Resolvé el problema **y toda su familia**, aunque no esté denunciado.
2. **Todas las hipótesis, incluso las remotas y descabelladas.** Enumerá causas posibles antes de decidir. No descartes una por improbable sin evidencia. La causa real suele no ser la obvia.
3. **No des por sentado que algo funciona: probalo EN VIVO.** Nada se declara resuelto ni "ya andaba" sin verificación empírica. Reproducí el bug (control negativo) y validá el fix en un navegador real (Chromium/Playwright, gestos táctiles por CDP si aplica), contra prod cuando corresponda, y en la base de datos real (QA transaccional con `ROLLBACK`). jsdom no alcanza para timing/scroll/DnD/history. **Nunca alcanza con mirar tablas o lógica: hay que ejecutarlo.**
3-bis. **Pruebas destructivas, no solo de cobertura.** El testeo no busca únicamente "no dejar cabos sueltos": es **adversarial** — pone a prueba la seguridad, la robustez y la certeza absoluta del sistema. Intentá ROMPERLO a propósito: escalar privilegios, saltar RLS, doble-submit / carreras, inputs hostiles, roles equivocados, datos corruptos, actores no autorizados. Un cambio recién se declara sólido cuando resistió el ataque, no cuando pasó el caso feliz. Para trabajo de seguridad, desplegá una auditoría con subagentes (Workflow) que red-teamee el diseño y barra la familia entera de huecos.
4. **Auditoría doble y triple, a fondo.** Después de arreglar, barré el resto del código buscando el mismo patrón en otros lugares (grep del anti-patrón), y verificá que no rompiste nada de lo que ya funcionaba. Garantía **100%** de no-regresión.
5. **Optimización en el camino.** Cazá cada detalle y falla que cruces aunque no sea el pedido — corregí o registralo. Dejá el código mejor de como lo encontraste.
6. **Cero intervención de Paul.** Desplegá los agentes/subagentes que hagan falta, usá el navegador, los MCP (Supabase, Vercel, GitHub, Chrome), instalá herramientas (ffmpeg, playwright-core) — lo que sea necesario para obtener el resultado **vos**. Paul no ejecuta pasos manuales ni valida por vos.
7. **Sin excusas, sin reserva de esfuerzo ni talento.** Certeza completa de la resolución con alcance total antes de cerrar. Si algo no se puede garantizar, decilo explícito y por qué — pero primero agotá todo.

> Guía práctica ya probada en este repo: reproducir en Chromium con `playwright-core` + el Chromium de `/opt/pw-browsers` (ver `scratchpad/run_*.mjs`); QA de DB con `BEGIN … ROLLBACK` impersonando roles; PR por parte con CI verde + smoke prod; y auditar el anti-patrón con `grep -rn` en todo `src/`.

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

- "**orden**" (no "culto") = lista de canciones de la reunión. **Es MASCULINO** ("*el* orden de las canciones", "*un nuevo* orden", "*primer* orden", "orden elimina*do*/duplica*do*/programa*do*"), NO femenino ("~~la orden~~" = mandato/pedido). Toda concordancia en el texto visible (artículos, adjetivos, participios, pronombres "lo/los") va en masculino. Los `label` de estado y los filtros ya están así (Programado/Completado/Cancelado). Corregido en PR #52 (commit `61eb133`); si agregás copy nuevo sobre órdenes, mantené el masculino.
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
- `rehearsal-reminders` cada 15 min (push a la banda 2 h antes de un ensayo programado en una orden; ver "Estado al 2026-06-20")
- `auto-complete-orders` `0 6 * * *` (03:00 ART): pasa a `completed` las órdenes `scheduled` con `date < hoy ART` (no toca canceladas; UPDATE no dispara push). Ver "Estado al 2026-06-21".

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
- **PR #32** (`1a2daaf`): (a) en los modales de formulario el **footer tapaba el contenido** → en `Modal.jsx` el footer pasó de `absolute bottom-0` a **hijo flex `shrink-0`** (content `flex-1` scrollea entre header y footer; se quitó el `pb-32`). (b) **'Nueva Orden' recordaba la canción tipeada** al reabrir → `handleOpenModal`/`handleCloseModal` de `Ordenes.jsx` blanquean `songSearchTerm`/`showSongDropdown`/`keyHistoryTooltip` (vivían fuera de `formData`); `Repertorio.jsx` cierra su dropdown de categorías al cerrar. Auditado: Bandas/Repertorio/Miembros ya reseteaban `formData` en `handleOpenModal`.

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
7. **Footer del `<Modal>`**: es un hijo flex `shrink-0` (NO `absolute`), si no se superpone al contenido y tapa los últimos campos. El contenido es `flex-1 overflow-y-auto`; no volver a meterle `pb-32` ni footer absoluto.
8. **Reset de formularios**: `handleOpenModal` resetea `formData`, pero el estado de búsqueda/dropdown que vive FUERA de `formData` (ej. `songSearchTerm` en Ordenes) hay que blanquearlo aparte en open/close o el modal "recuerda" lo tipeado al reabrir.

**Operativa:** PRs creados y mergeados (squash) vía GitHub MCP; CI gated por branch protection en `main` (workflow "CI": Lint+Build+Test + Smoke test prod). Validación visual la hace el usuario en su celular (sin Claude-in-Chrome en este entorno; Leandro no puede abrir previews de Vercel si tienen protección). Auditoría de paridad detallada: `AUDIT/06_parity.md`.

**Backlog abierto:**
- El cropper desktop (`Header.jsx`) tiene la **misma matemática frágil con constantes** que tenía el móvil (no se tocó; el reporte fue sólo móvil). Aplicar el mismo fix de medición si aparece el problema en compu.
- Extraer el cropper a un hook/componente compartido (hoy duplicado Header+MobileNav ~40%).
- Convertir los `alert()` del perfil móvil a modales (UX; en desktop ya son modales).
- Migrar la foto base64 de Paul a Storage.

## Estado al 2026-06-20

Dos cosas: (a) fix de modales de formulario (PR #32, ya arriba) y (b) **feature nueva "Programar ensayo"** (PR #34, commit `2053b19`).

**Programar ensayo (por orden):** en "Nueva Orden" un switch **"Programar ensayo"** habilita día + hora. Si se programa:
- **Push 2 h antes** a todos los integrantes de la banda el día del ensayo.
- **Evento en el calendario** ("Ensayo · banda", ámbar) ligado a la orden.
- **Card en el inicio** ("¡Hoy tenés ensayo!", amarillo, full-width) visible el día del ensayo 08:00–23:00 ART, con link directo `/ordenes?order=<id>`.

**Implementación:**
- DB (`supabase/migrations/20260620_rehearsal_reminders.sql`): columnas aditivas nullable en `orders` (`rehearsal_date date`, `rehearsal_time text` 'HH:MM', `rehearsal_reminder_sent bool` dedup). Función `send_rehearsal_reminders()` (SECURITY DEFINER, `search_path` fijo, **REVOKE** del RPC como las otras de cron) + cron `rehearsal-reminders` `*/15 * * * *`. En la ventana `[ensayo-2h, ensayo)` ART, una sola vez (dedup flag), inserta 1 notificación `'reminder'` por integrante activo con cuenta → dispara el push existente (trigger `notify_push_on_notification_insert`).
- `appStore.js`: `rehearsalDate/Time` en `convertOrderFromDB/ToDB`. **`rehearsal_reminder_sent` NO se escribe desde el cliente** (lo maneja sólo el cron).
- `Ordenes.jsx`: switch + campos; reset en open; submit adjunta ensayo sólo si está activo; lee `?order=` y abre el detalle.
- `OrderCalendar.jsx`: bucket `rehearsalsByDay` + pill ámbar. `Dashboard.jsx`: card con cálculo de hora ART vía `toLocaleString`.

**QA hecho (en prod, sin push real):** la función se probó dentro de `BEGIN; SET LOCAL session_replication_role=replica; … ROLLBACK;` (triggers off + rollback = doble blindaje, cero push). Verificado: inserta 1 notif por miembro (3 en Banda Test), marca dedup, 2º llamado no duplica, ventana 2h OK, sin residuos, y alta de orden normal sigue andando. Advisors de seguridad: 0 alertas nuevas (la función no aparece en `function_search_path_mutable` ni en `authenticated_security_definer_function_executable`).

**Landmines nuevos:**
9. **`orders.rehearsal_reminder_sent`**: lo escribe SÓLO el cron. Nunca incluirlo en `convertOrderToDB` (si no, una edición de orden lo pisaría y re-enviaría el push).
10. **Probar funciones que insertan en `notifications`**: el INSERT en `orders`/`bands`/`notifications` dispara triggers que mandan push global/real. Para QA, SIEMPRE `BEGIN; SET LOCAL session_replication_role = replica; … ROLLBACK;` — desactiva triggers (no encola push) y revierte. Nunca correr `send_rehearsal_reminders()` "en vivo" contra una banda con miembros reales fuera de ese envoltorio.
11. **Fecha+hora del ensayo como `date` + `text`** (no `timestamptz`): evita el off-by-one de TZ en el calendario/dashboard (un `timestamptz` 22:00 ART cae en el día UTC siguiente). El cron combina ambos en ART.

## Estado al 2026-06-21

**Órdenes — 3 mejoras (PR #36, commit `bad2e06`):**
- **Editar orden:** se reutiliza el modal de "Nueva Orden". `handleOpenModal(order)` precarga `formData` + setea `editingOrder`; `handleSubmit` rutea a `updateOrder` (merge-safe) en vez de `addOrder`. Botón "Editar" en tarjeta y detalle (pastor/líder). `saveKeyHistory` es upsert (`onConflict member_id,song_id`) → editar no duplica historial.
- **Control de estado manual** en el detalle (pastor/líder): Marcar completada / Cancelar / Reabrir, vía `updateOrder({status})` + patch del snapshot `viewingOrder`.
- **Auto-completar pasadas (DB):** `auto_complete_past_orders()` + cron `auto-complete-orders` `0 6 * * *`. UPDATE `scheduled → completed` donde `date < hoy ART`. No toca canceladas; UPDATE NO dispara push (el trigger de orden es sólo INSERT). Blindada del RPC (REVOKE). Migración `20260621_auto_complete_past_orders.sql`. Corrida una vez al aplicar (la orden del 16-jun pasó a completada → el contador "Servicios completados" del Dashboard ya tiene sentido).
- **Filtro por defecto de Órdenes:** `all → scheduled` (`Ordenes.jsx`), como Solicitudes con `pending`. Evita la lista infinita de pasadas.

**Landmines nuevos:**
12. **`handleOpenModal(order = null)`** en Ordenes: los botones "Nueva Orden" DEBEN llamar `() => handleOpenModal()` — si pasan el handler directo, React les manda el evento como `order` y abren en modo edición con basura. (Mismo patrón si se reusa el modal para editar en otras pantallas.)
13. **Editar orden NO re-arma el recordatorio de ensayo:** `convertOrderToDB` no escribe `rehearsal_reminder_sent` (landmine #9), así que si reprogramás el ensayo de una orden cuyo flag ya está `true`, el cron no vuelve a avisar. Caso borde conocido (los ensayos se setean casi siempre al crear). Si hiciera falta, resetear el flag server-side, no desde el cliente.

## Estado al 2026-07-01

**Exportar PDF fallaba al transportar el tono (PR #38, commit `db1e818`).** Reportado por Daniel (Córdoba): exportar anda en tono original, "no funciona" al transportar.

- **Causa real (NO era un crash):** reproduje `generateSongPDF` en Node con jsPDF + datos reales → genera OK en todos los tonos. El "no descarga" era el **manejo async**: el botón "Descargar PDF" tenía `try/catch` **síncrono** alrededor de una función **async**, dentro de un `setTimeout` que cerraba el modal antes → cualquier rejection tras el primer `await` se tragaba en silencio. Fix: handler `async` + `await generateSongPDF()` con catch real + cerrar el modal DESPUÉS de disparar la descarga (se quitó el setTimeout).
- **Bug de correctitud (motor de transposición):** el regex de acorde exigía raíz MAYÚSCULA `[A-G]`, así que un `c9` en minúscula (typo, presente en "A Ti Me Rindo") NO se transportaba y salía mal en cualquier tono. Fix en `appStore.js`: `[A-Ga-g]` + `toUpperCase` en raíz y bajo. Motor compartido → beneficia viewer, PDF Repertorio y PDF Órdenes.
- **Preventivo:** los 4 botones de PDF de Órdenes se llamaban fire-and-forget → se envuelven en `runPdfExport()` que surfacea el error. Test nuevo `src/stores/transpose.test.js` (7 casos) fija el motor de transposición.

**Landmines nuevos:**
14. **PDF export es `async`:** nunca envolver `generateSongPDF/generateSongsPDF/generateOrderPDF` en un `try/catch` síncrono ni dispararlas en `setTimeout` — el rejection se traga y el usuario ve "no pasa nada". Usar `await` con catch, o `runPdfExport()` (Ordenes). Generar ANTES de cerrar el modal.
15. **Acordes en minúscula:** el motor de transposición ahora acepta raíz `[A-Ga-g]` y la pasa a mayúscula. Si tocás el regex de `transposeChordToken`, mantené el case-insensitive o los typos tipo `c9` dejan de transportar. Cubierto por `transpose.test.js`.

## Estado al 2026-07-10

**Revisión de seguridad + rate limiting del registro público (PR #40, commit `b7d124e`).** Paul trajo un reel de un influencer con 6 consejos de seguridad (RLS, CORS, security headers, rate limiting, API keys en `.env`, anti SQL-injection) y pidió asegurar que la plataforma esté "blindada".

- **Auditoría (sin código):** 5 de los 6 puntos ya estaban sólidos —RLS en las 16 tablas públicas; headers fuertes en `vercel.json` (HSTS preload, CSP, X-Frame-Options DENY, nosniff); `service_role` sólo server-side (CI lo grepea); sin secretos filtrados; sin SQL crudo con input de usuario (todo via PostgREST/RPC parametrizado); CORS `*` en `send-push` es seguro porque no usa credenciales, sólo token. El único hueco real era **rate limiting**.
- **Rate limiting (lo único que Paul aprobó implementar):** el formulario público "solicitar registro" (`pending_registrations`) es el único lugar donde `anon` puede escribir por diseño. Sin freno, un bot podía inundarlo. Se agregó un trigger `BEFORE INSERT` `rate_limit_pending_registrations()`: **máx 10 solicitudes/min** (global) + backstop de **200 pendientes**; ambos devuelven **HTTP 429** vía `PT429` (convención PostgREST) con mensaje amable en español. `Login.jsx` mapea `code === 'PT429'` a un mensaje claro. Umbrales generosos: un ministerio de ~8 nunca los toca, un flood sí. Migración `supabase/migrations/20260710_rate_limit_pending_registrations.sql`.
- **QA (prod, sin push real):** función `SECURITY DEFINER` con `search_path` fijo + `REVOKE EXECUTE` de PUBLIC/anon/authenticated (patrón blindado). Test transaccional (`BEGIN … ROLLBACK`, deshabilitando SÓLO el trigger de push `notify_on_pending_registration_insert`, no todos): 10 inserts pasan, el 11º se bloquea con PT429; sin residuos, triggers restaurados. `get_advisors` security: 0 alertas nuevas (la función no aparece en `function_search_path_mutable` ni en `authenticated_security_definer_function_executable`).

**Landmines nuevos:**
16. **Rate limit del registro:** el límite es un trigger `BEFORE INSERT` sobre `pending_registrations`, no lógica de cliente (el cliente no se puede confiar). Si subís el volumen real del ministerio, subí el umbral de 10/min en la función. El `RAISE … USING ERRCODE='PT429'` es lo que hace que PostgREST devuelva 429; si cambiás el código, actualizá el `if (insertError.code === 'PT429')` de `Login.jsx` o el usuario ve un error genérico.
17. **QA de triggers en `pending_registrations`:** el INSERT dispara `notify_on_pending_registration_insert` (push a pastores). Para probar el rate limit NO se puede usar `session_replication_role=replica` (apagaría también el trigger que querés probar). Deshabilitar SÓLO el trigger de push con `ALTER TABLE … DISABLE TRIGGER notify_on_pending_registration_insert` dentro del `BEGIN … ROLLBACK` (el ROLLBACK revierte el DISABLE).

## Estado al 2026-07-20

Dos fixes reportados por líderes reales, ambos a producción en la rama `claude/mobile-photo-upload-3asq58`.

**(a) Eliminar orden — líderes sin botón + borrado no-op (PR #42, commit `d19cffd`).** Reportado con capturas: (1) los líderes no veían "Eliminar" y (2) el borrado "no hacía nada" ni como pastor.
- **Bug 1 (dos capas):** el botón en `Ordenes.jsx` estaba gateado `{isPastor && …}` **y** la política RLS de DELETE era `is_pastor()` sola → el líder quedaba bloqueado en la base aunque viera el botón. Fix: UI `(isPastor || isLeader)` + política `orders_delete_pastor_or_leader` (`is_pastor_or_leader()`).
- **Bug 2 (no-op silencioso):** la FK `song_key_history.order_id → orders.id` estaba en `NO ACTION`; cada orden guarda tonalidades al crearse/editarse, así que borrar una orden con historial lanzaba `23503` (violación de FK). El handler llamaba `deleteOrder()` **fire-and-forget** y mostraba "eliminada" igual. Fix: FK a `ON DELETE SET NULL` (conserva la memoria de tono, suelta la referencia) + el handler ahora hace `await deleteOrder()` y muestra un `ErrorModal` real si falla. Migración `20260720_fix_order_delete_leader_and_fk.sql`. QA transaccional (BEGIN…ROLLBACK, impersonando roles con `set_config('request.jwt.claims',…)`): pastor y líder borran 1 fila, miembro 0; `song_key_history` pasa de 8→8 (no se pierde ninguna), las de la orden quedan con `order_id` null.

**(b) "Cambiar Contraseña" no abría desde "Mi Perfil" en escritorio (PR #43, commit `0d838ef`).** Reportado por Daniel Córdoba (video): clic en "Cambiar Contraseña" cerraba el menú y volvía al inicio, sin abrir el formulario.
- **Causa:** el `<Modal>` compartido integra el historial (pushState al abrir; back → cierra). El botón hace `setShowPasswordChange(true)` + `setShowProfile(false)` a la vez; al cerrarse el modal de Perfil, su cleanup llamaba `history.back()`, cuyo `popstate` era capturado por el listener del modal de Contraseña **recién montado**, cerrándolo al instante.
- **Fix (en `Modal.jsx`):** un **único** listener de `popstate` a nivel de módulo + una **pila** de modales abiertos + un **contador de backs programáticos**. Cuando un modal que se cierra saca su entrada dummy con `history.back()`, ese `popstate` se absorbe con el contador en vez de tratarse como un back del usuario. El back gesture real sigue cerrando el modal top. El modal de contraseña **móvil** (MobileNav) usa un `<div>` propio sin historial → no sufría el bug.
- **Verificación:** jsdom NO reproduce el timing de `history.back()` de un navegador real, así que se validó el `Modal.jsx` real en **Chromium (Playwright)** con control negativo: código anterior → el modal de contraseña se cierra solo; con el fix → permanece abierto y el back real lo cierra.

**Landmines nuevos:**
18. **`song_key_history.order_id` es `ON DELETE SET NULL`** (no `NO ACTION`, no `CASCADE`): borrar una orden conserva la "memoria de tono" por (miembro, canción) y sólo suelta la referencia. `order_id` es nullable y `fetchKeyHistory` tolera null (muestra el tono con "fecha no disponible"). No volver a `NO ACTION` o el borrado de órdenes con historial rompe con `23503`.
19. **DELETE de `orders` es `is_pastor_or_leader()`** (línea con insert/update). Si tocás la visibilidad del botón "Eliminar" en `Ordenes.jsx`, mantené el gate `(isPastor || isLeader)` alineado con la RLS. El handler de borrado DEBE `await deleteOrder()` y ramificar (éxito/error) — nunca fire-and-forget (mismo patrón que landmine #14 de PDFs).
20. **`<Modal>` usa historial GLOBAL** (`src/components/ui/Modal.jsx`): hay UN listener de `popstate` a nivel de módulo + pila + contador `programmaticBackPending`. NO volver a un listener `popstate` por-instancia: rompe cualquier transición modal→modal (abrir B cerrando A, ej. Perfil→Cambiar Contraseña), porque el `back()` del que se cierra cierra al recién abierto. Para testear esta lógica NO sirve jsdom (no modela el `popstate` async del navegador); validar en Chromium real.

## Estado al 2026-07-25

**Sheet "Mi Perfil" móvil no scrolleaba en algunos celulares (PR #44, commit `5b003d7`).** Reportado con captura: varios usuarios veían el perfil cortado y sin poder scrollear → no llegaban a "Activar notificaciones", "Cambiar contraseña" ni "Cerrar sesión" (todo debajo de "Sincronizar"). A otros les andaba → dependía del navegador/celular.
- **Causa:** el contenedor scrolleable del sheet (`MobileNav.jsx`, `max-h-[90vh] overflow-y-auto`) tenía `touch-action: none` en el `style`, que en varios navegadores/versiones **bloquea el scroll táctil** aunque haya `overflow-y-auto`. El sheet NO tiene gesto de arrastre propio (el `ref` no engancha touch/drag), así que ese `touch-action:none` era un remanente sin función.
- **Fix:** quitar `touch-action:none` (scroll táctil por defecto) + `overscroll-behavior:contain` (evita scroll chaining al fondo). Cambio **estrictamente aditivo** (none→auto sólo agrega scroll, no afecta a quienes ya veían bien).
- **Verificación:** Chromium real (Playwright, viewport móvil + `hasTouch`) con swipe táctil sintetizado por CDP (respeta `touch-action`): con `none` el scroll queda en 0 y "Activar notificaciones" oculto; con el fix scrollea hasta el fondo y la opción queda visible.

**Landmines nuevos:**
21. **Bottom-sheets móviles scrolleables (`overflow-y-auto`) NO deben llevar `touch-action: none`** — bloquea el scroll táctil en algunos navegadores/celulares. `touch-action:none` es SÓLO para superficies con gesto de arrastre propio (el recortador de foto en `MobileNav.jsx` y `Header.jsx`, que sí lo necesitan para pan de la imagen). Para un sheet que scrollea, dejar el default + `overscroll-behavior:contain`. Testear el scroll táctil en Chromium real con `hasTouch` + gesto por CDP (jsdom no sirve).

## Estado al 2026-07-26

**Tooltip de tonalidad del director se desbordaba del marco en móvil (PR #45, commit `15e014c`).** Reportado con captura (estético): en Nueva/Editar Orden, el tooltip "Esta es la primera vez que el director la va a cantar…" se salía de la pantalla a la derecha en el celular.
- **Causa:** el tooltip (`Ordenes.jsx`, key-history) tenía `whitespace-nowrap` (una sola línea) y estaba centrado (`left-1/2 -translate-x-1/2`) sobre el botón de tonalidad, que vive pegado al borde derecho de la fila → el texto largo desbordaba fuera del viewport.
- **Fix:** anclar a la derecha (`right-0`) + permitir wrap (quitar `whitespace-nowrap`) con `max-w-[13rem] w-max`; el caret pasa a `right-3`. Sólo visual. Verificado en Chromium 390px: antes llegaba a x=445 (fuera de 390), con el fix queda en [131,339] en 3 renglones. Auditado: no hay otros tooltips con este patrón (los de Repertorio son dropdowns `left-0 right-0`).

**Drag & drop de secciones de canción no funcionaba (PR #46, commit `0633ba6`).** Reportado: en Editar Canción, el handle (GripVertical) de las secciones no reordenaba nada (ni celu ni compu).
- **Causa:** el `<GripVertical>` era **puramente decorativo** — el editor de estructura en `Repertorio.jsx` nunca tuvo lógica de DnD conectada.
- **Fix:** se conectó `@dnd-kit` (mismo patrón ya probado en `Ordenes.jsx` para reordenar canciones): `SortableSection` envuelve cada sección, el GripVertical pasa a ser el ÚNICO drag handle (recibe los `listeners`), `PointerSensor` (umbral 6px) + `KeyboardSensor`, `touch-none` en el handle. IDs estables `_localId` por sección (contador `useRef`), **stripeados en `handleSubmit`** (nunca se persisten).
- **Verificación:** Chromium real (Playwright, drag por puntero): arrastrar 'Coro' al tope → [Coro, Intro, Verso 1]; arrastrar desde el input NO reordena.

**Landmines nuevos:**
22. **`song.structure` NO se persiste con `_localId`.** El editor de Repertorio asigna un `_localId` efímero a cada sección para el drag-and-drop; `handleSubmit` lo stripea (`structure.map(({_localId, ...rest}) => rest)`) antes de `addSong/updateSong`. Si agregás campos al editor, mantené ese strip o el `_localId` se filtra a la DB. El DnD de secciones usa el MISMO patrón que las canciones de Ordenes (`@dnd-kit`, handle-only con GripVertical/⋮⋮). Un GripVertical sin `useSortable`+`DndContext` es decorativo y no arrastra — testear el reorden en Chromium real (jsdom no simula el pointer drag).

## Estado al 2026-07-27

**Dos glitches estéticos de iOS Safari en "Nueva Orden" (PR #48, commit `<pendiente>`).** Reportado con captura (iPhone): (a) el campo Fecha se veía mucho más chico que Hora/Banda; (b) el switch "Programar ensayo" se veía deformado/ovalado. Ambos son bugs de **WebKit/iOS** (Chromium no los reproduce), arreglados en `src/index.css` (global → alcance total, beneficia a toda la app):
- **Fecha chica:** iOS Safari colapsa la altura de un `input[type=date]`/`[time]` **vacío** (no hay contenido que sostenga la línea; Hora tenía "20:00" y no colapsaba). Fix: `min-height: 50px` para `input:not([checkbox/radio/range/file/color])` y `select`. **Auditado:** se EXCLUYEN checkbox/radio/range/file/color (si no, el checkbox de `Login.jsx` y los `range` de zoom del recortador se deformarían — verificado en Chromium que quedan en 30/46px, no 50); ningún input/select fija `h-*` chico; los textarea quedan fuera. Bonus: mejora el target táctil.
- **Switch ovalado:** el track es un `<button>` y el reset global de `button` NO tenía `appearance: none`, así que iOS le aplicaba `-webkit-appearance: push-button` (forma nativa) y lo deformaba. Fix: `-webkit-appearance: none; appearance: none;` en `button` (todos los botones ya tienen estilo propio → seguro; arregla cualquier toggle/pill en iOS).
- **Verificación:** WebKit de Playwright no se pudo instalar (el proxy bloquea la descarga con 403), así que el bug iOS no se pudo reproducir con el motor real. Se reprodujo el MECANISMO en Chromium (`appearance:auto` vs `none`; medición de alturas con/sin `min-height`) y se aplicaron los fixes canónicos; no-regresión verificada en Chromium (inputs parejos a ~50px, switch 48×28, checkbox/range intactos). La validación visual final en un iPhone real queda para confirmar, pero son los fixes estándar de estos bugs.

**Seguimiento (PR #49, commit `<pendiente>`):** la Fecha quedó perfecta, pero el switch **seguía ovalado en iOS** aun con `appearance: none` (WebKit igual lo deformaba/comprimía). Fix definitivo en `Ordenes.jsx`: se reemplazó el `<button>` del switch por el patrón **`<label>` + `<input type="checkbox" class="sr-only peer">` + dos `<span>` (track/knob)** con tamaños fijos en px (track `w-[52px] h-8`, knob `h-7 w-7`, `peer-checked:translate-x-5`). Un `<span>` con dimensiones explícitas es **inmune** al `-webkit-appearance` de iOS (no es un control nativo); `shrink-0` + el texto en `flex-1 min-w-0` evitan que el track se comprima. Verificado en Chromium: toggle OFF→ON (gris→verde, knob 2→22px), track constante 52×32, sin comprimirse junto al texto largo.

**Landmine nuevo:**
23. **iOS Safari y los form controls:** (a) un `input[type=date]`/`[time]` **vacío** colapsa su altura en iOS → mantené el `min-height` global (excluyendo checkbox/radio/range/file/color, que se deforman con altura mínima). (b) **Los toggles/switches tipo pill NO deben ser un `<button>`** — iOS Safari les impone forma nativa y los deforma aunque pongas `appearance: none`. Usá el patrón `<label>` + checkbox `sr-only peer` + `<span>` track/knob con tamaños fijos (ver switch "Programar ensayo" en `Ordenes.jsx`). El `-webkit-appearance: none` global en `button` (index.css) igual conviene para los demás botones. Estos bugs NO se ven en Chromium (son de WebKit); validá el toggle (OFF/ON, no-compresión) en Chromium con el patrón exacto.

## Estado al 2026-08-02

**Dashboard/Inicio — card Órdenes contaba de más + cards ahora son accesos directos (PR #50, commit `61ab098`).** Reportado con captura: el card "Órdenes" del inicio contabilizaba TODAS las órdenes (`orders.length`) — con el tiempo serán cientos (pasadas, completadas, canceladas) y el número deja de significar "lo que viene". Además ninguno de los 4 cards era clickeable.
- **Fix 1 (conteo):** el card Órdenes ahora cuenta sólo `status === 'scheduled'` (`upcomingOrders`, que ya existía y usa "Próximos Servicios"). Los otros 3 (Miembros activos, Bandas, Canciones) ya contaban bien.
- **Fix 2 (cards como acceso directo por permiso):** cada card enlaza a su sección **sólo si el rol tiene acceso**, con el MISMO criterio que la navegación (`MobileNav`/`Header`) y los route guards de `App.jsx`: **Miembros** → `/miembros` sólo `['pastor','leader']` (a un `member` le queda **informativo/no-clickeable**, igual que `<MembersOnlyRoles>` lo redirige); **Bandas/Repertorio/Órdenes** abiertos a todos. Se agregó `useCurrentRole()` en `Dashboard.jsx`; `canAccess = !stat.roles || stat.roles.includes(role)`; card accesible se envuelve en `<Link>`, si no queda `<Card>` plano.
- **Verificación:** Chromium real (Playwright) renderizando el `Dashboard.jsx` real con los 3 roles (mock del store + router): con 5 órdenes (2 scheduled, 2 completed, 1 cancelled) el card muestra **2** (control negativo: `orders.length` daba 5); pastor/líder ven los 4 cards como link; miembro ve "Miembros" informativo y el resto como link; 0 errores de consola. lint + 35 tests + build OK.

**Landmine nuevo:**
24. **Cards de estadística del Dashboard = links con permiso.** El conteo de "Órdenes" cuenta SÓLO `scheduled` (no `orders.length`, que crecería sin techo). Cada card es `<Link>` sólo si el rol tiene acceso a la ruta (fuente de verdad: mismo criterio que `App.jsx`/nav — `/miembros` es pastor/líder); si no, `<Card>` plano informativo. Si agregás un card nuevo, definí su `to` + `roles` y respetá el gate `canAccess`, alineado con el route guard correspondiente, o un rol sin acceso clickearía a una ruta que lo redirige.

## Estado al 2026-08-03

**Ensayómetro Fase 1 — práctica personal por orden + glosario "ensamble" (PR #54).** Feature nueva pedida por Paul, primera de 3 fases (F2 pendiente: alarma personal + push diario 18:00 anti-spam; F3: metrónomo BPM + festejo 100% + limpieza automática).

- **Glosario del ministerio (¡importa para todo copy futuro!):** el **"ensamble"** es el encuentro de TODA la banda para ensamblar las canciones (lo que se programa en el orden); el **"ensayo"** es la práctica PERSONAL previa de cada músico. Renombrado en: switch "Programar ensamble" (Nueva/Editar Orden), calendario ("Ensamble · banda"), card del inicio ("¡Hoy tenés ensamble!"), wizard de bienvenida y el push 2 h antes (migración `20260803_ensamble_push_copy.sql`, copy-only: ventana/dedup/REVOKE intactos — el REVOKE se re-asertó porque `CREATE OR REPLACE` resetea grants).
- **Pantalla "Mi Ensayo"** (`/practica/:orderId`, `src/pages/Practica.jsx`, lazy en `App.jsx`; título dinámico en `pageTitles.js`): por canción del orden → contador de **pasadas** ("La practiqué" / botón restar), 3 **checks de dominio** (letra/estructura/frases y arreglos), **dificultad percibida** (toggle Fácil/Media/Difícil), viewer de **acordes en el tono del orden** (usa `transposeSongStructure`) y link YouTube. Arriba, el **Ensayómetro**: anillo SVG de progreso (4 hitos por canción: ≥1 pasada + 3 checks) + mensajes de ánimo + badge con fecha/hora del ensamble. Autoguardado con debounce 500 ms por canción + flush al desmontar; indicador "Guardando…/Guardado". Acceso: card "Practicar este orden" en el detalle del orden (sólo `scheduled`); orden inexistente → redirect a /ordenes (espera al store si aún carga).
- **DB:** tabla `practice_logs` (migración `20260803_practice_logs.sql`) — `UNIQUE (user_id, order_id, song_id)`, `user_id DEFAULT auth.uid()` (el cliente NUNCA lo manda), FK a orders/songs con `ON DELETE CASCADE`, RLS owner-only en los 4 verbos, GRANT explícito a authenticated (regla #7), sin triggers. En el store: `fetchPracticeLogs(orderId)` + `upsertPracticeLog(log)` (upsert `onConflict: 'user_id,order_id,song_id'`), converters con el patrón DATA-LOSS LANDMINE documentado. Deliberadamente FUERA de `initialize()`/realtime/localStorage (dato personal por-orden, sólo lo usa la pantalla).
- **QA:** RLS transaccional en prod 9/9 (BEGIN…ROLLBACK impersonando 2 usuarios reales + anon: owner correcto vía DEFAULT, upsert no duplica, cross-write bloqueado por WITH CHECK, el otro ve/actualiza/borra 0, anon 0, sin residuos). Chromium real 18/18 (viewport 390px + hasTouch, `Practica.jsx` REAL con store mockeado vía plugin `resolveId` de vite: precarga, %, upsert con objeto COMPLETO, restar deshabilita en 0, dificultad toggle, viewer transpuesto C→D y no-transpuesto, redirect, 0 errores de consola). Advisors: 0 alertas nuevas. Lint + 35 tests + build OK.
- **Operativa git:** la rama remota `claude/mobile-photo-upload-3asq58` conserva historia pre-squash de PRs viejos (árbol == main); el force-push está bloqueado en este entorno → rebasar el commit nuevo SOBRE la punta remota (`git rebase --onto origin/<rama> origin/main <rama>`) y pushear fast-forward.

**Landmines nuevos:**
25. **`practice_logs` es owner-only por diseño:** el cliente NUNCA escribe `user_id` (lo pone el DEFAULT `auth.uid()` y RLS lo verifica con WITH CHECK). `upsertPracticeLog` exige el objeto COMPLETO (mismo contrato anti data-loss que los otros converters — `Practica.jsx` siempre guarda logs completos en su estado `logs`). No agregar SELECT de práctica ajena "para el pastor": es herramienta personal, no de auditoría (decisión de producto).
26. **Glosario ensamble vs ensayo:** en TODO copy nuevo, "ensamble" = encuentro de la banda (programado en el orden), "ensayo" = práctica personal (pantalla Mi Ensayo). No volver a llamar "ensayo" al evento de la banda.

## Estado al 2026-08-03 (II)

**Ensayómetro Fase 2 — alarma personal + push diario 18:00 con anti-spam (PR #55).** Segunda de 3 fases (F3 pendiente: metrónomo BPM + festejo 100% + limpieza automática).

- **Alarma de ensayo (opt-in, personal):** toggle en "Mi Ensayo" ("Te recordamos todos los días a las 18:00 mientras tengas canciones por practicar"). Tabla `practice_alarms` (migración `20260803_practice_alarms.sql`): `user_id` PK con DEFAULT `auth.uid()` (el cliente nunca lo manda), RLS owner-only en los 4 verbos, GRANT explícito. Store: `fetchPracticeAlarm()` (sin fila = apagada) + `setPracticeAlarm(enabled)` (upsert `onConflict: 'user_id'`); el toggle es optimista y REVIERTE si el guardado falla. Switch con el patrón iOS-safe (landmine 23).
- **Push diario:** `send_practice_reminders()` (SECURITY DEFINER, search_path fijo, REVOKE del RPC) + cron `practice-reminders` `0 21 * * *` (18:00 ART). Manda UNA notificación `'reminder'` por usuario/día SOLO si: alarma activada + integra la banda de ≥1 orden `scheduled` con fecha ≥ hoy ART y canciones cargadas + su Ensayómetro < 100% en ese orden. El progreso server-side replica los 4 hitos de la pantalla y SOLO cuenta logs de canciones que siguen en el orden. Dedup por día ART matcheando el título `'🎸 Tu ensayo te espera'`.
- **QA:** función 6/6 en prod (`session_replication_role=replica` + ROLLBACK: manda 1, dedup diario, 100% no manda, alarma off no manda, sin opt-in no recibe, sin órdenes no manda, 0 residuos). RLS de `practice_alarms` 9/9 (impersonando 2 usuarios + anon). Chromium real 23/23 (los 18 de F1 + 5 del toggle, incluido el revert en fallo). Advisors 0 nuevas. Lint + 35 tests + build OK. La tabla arranca vacía → el cron no molesta a nadie hasta que alguien active su alarma.

**Landmines nuevos:**
27. **El dedup diario del push de práctica matchea por TÍTULO** (`'🎸 Tu ensayo te espera'` en `send_practice_reminders()`): si cambiás el copy del título, cambiá TAMBIÉN el string del `NOT EXISTS` o el dedup se rompe (doble push el día del deploy). El progreso server-side (4 hitos/canción, solo canciones vigentes del orden) debe mantenerse en sincronía con `milestonesOf` de `Practica.jsx`.
28. **`practice_alarms` es opt-in y sin fila = apagada:** `fetchPracticeAlarm` devuelve `false` si no hay fila; no crear filas por default para todos (sería spam masivo el primer día). El toggle optimista DEBE revertir si `setPracticeAlarm` devuelve null (patrón anti-mentira, testeado en Chromium).

## Estado al 2026-08-03 (III)

**Ensayómetro Fase 3 — metrónomo BPM + festejo 100% + limpieza automática (PR #57).** Cierra las 3 fases del Ensayómetro. Además, PR #56: `.claude/settings.json` con allowlist de permisos de solo-lectura para Claude Code (menos prompts en sesiones web; nada mutante en la lista).

- **Metrónomo por canción** (`Practica.jsx`, hook `useMetronome`): botón con ícono Timer + BPM en cada canción que tenga `bpm`. Web Audio API sin dependencias: beeps agendados por adelantado en el reloj del AudioContext (preciso, no setInterval); acento en el beat 1 del compás (numerador de `song.compass`, default 4); punto visual que late con `animation-duration = 60/bpm`. UN solo metrónomo activo a la vez; al desmontar la pantalla se apaga y cierra el AudioContext.
- **Festejo 100%:** overlay de confeti (44 piezas CSS, keyframes `confetti-fall` en `index.css` con drift por custom property) + card "🏆 ¡Orden dominado!", 4,2 s y se auto-oculta. Dispara SOLO en la transición en vivo `<100 → 100` (ref del percent previo); entrar a una pantalla ya al 100% NO re-festeja.
- **Limpieza automática (DB):** `cleanup_practice_logs()` + cron `practice-cleanup` `30 7 * * *` (04:30 ART): borra `practice_logs` de órdenes NO-`scheduled` con `date < hoy ART - 7` (gracia de 7 días por si un orden se "Reabre"; el borrado de orden ya limpia por CASCADE). Blindada (SECURITY DEFINER + search_path + REVOKE). Migración `20260803_practice_cleanup.sql`.
- **QA:** limpieza 4/4 en prod (replica + ROLLBACK con 3 órdenes sintéticos: borra el completado viejo, conserva el reciente en gracia y el programado, idempotente). Chromium real 35/35 (los 23 de F1+F2 sin regresión + 12 de F3: beeps contados instrumentando AudioContext, un-solo-activo, stop real, festejo en la transición exacta 7/8→8/8, auto-ocultado, no re-festeja tras reload al 100%). Lint + 35 tests + build OK.

**Landmines nuevos:**
29. **Metrónomo:** el AudioContext se crea recién en el primer tap (política de autoplay móvil: el audio DEBE nacer de un gesto del usuario — no crearlo en un useEffect de montaje o iOS lo deja mudo). Los beeps se agendan en el reloj del AudioContext con lookahead, NUNCA sonar directo en el tick del setInterval (drift audible). Para testear audio en Chromium headless: `--autoplay-policy=no-user-gesture-required` + instrumentar `createOscillator` vía `addInitScript`.
30. **Limpieza de práctica con gracia de 7 días:** el cron borra logs de órdenes no-programados con fecha < hoy-7. Si se "Reabre" un orden con más de una semana, la práctica previa de los músicos ya no está (aceptado por diseño: los datos son efímeros). No achicar la gracia sin avisar a Paul. El festejo del 100% dispara sólo en la transición (ref `prevPercentRef`): si tocás el cálculo de `percent`, cuidá no re-disparar en carga.

## Estado al 2026-08-03 (IV)

**"Cerrar" del modal pedía DOS taps en iPhone (PR #58).** Reportado por Paul con captura (Detalle de Orden): el primer tap sobre "Cerrar" no hacía nada, el segundo cerraba.
- **Descartado con repro en Chromium real** (Modal.jsx REAL + BrowserRouter + cableado exacto de Ordenes con `?order=`, ida/vuelta a Practicar, back del navegador): los 6 flujos cierran con UN tap y un tap táctil real también → la lógica historial/pila/counter NO era la causa.
- **Causa (iOS, misma clase que el "Guardar" del recortador de PR #28):** la PWA corre standalone con status bar `black-translucent` → el contenido fluye DEBAJO del status bar. Con contenido alto, el card del modal queda pegado al borde superior y el botón "Cerrar" roza la **zona del status bar / gesto del sistema**, donde iOS se come el primer tap. Además iOS **ignora `user-scalable=no`** desde iOS 10 → el double-tap-to-zoom sigue vivo y puede retener taps sobre controles.
- **Fix doble:** (a) `Modal.jsx`: el overlay suma `env(safe-area-inset-top)` al padding superior (y el card lo descuenta de su `max-height`) → todo el modal queda por debajo de la zona del sistema; sin notch `env()=0`, idéntico a antes. (b) `index.css`: `touch-action: manipulation` en el reset global de `button` → elimina el doble-tap sobre botones (el tap dispara el click al toque) sin afectar scroll/pinch; los drag handles usan la clase `.touch-none` que le gana por especificidad.
- **Auditoría del patrón:** header móvil y menú de MobileNav ya respetaban el inset; sheets son bottom-anchored; el cropper ya estaba arreglado (PR #28). El único expuesto era el `<Modal>` compartido → el fix beneficia a TODOS los modales.
- **Verificación:** Chromium no reproduce el mecanismo iOS (como landmine 23); se validó el repro 6/6 sin regresión, estilos computados correctos (calc con env() parsea: 16px/684px sin notch), QA de Practica 35/35, lint + 35 tests + build. Confirmación visual final en iPhone queda para Paul.

**Landmine nuevo:**
31. **Overlays con contenido alto en iPhone:** cualquier overlay `fixed inset-0` con elementos interactivos cerca del borde superior debe sumar `env(safe-area-inset-top)` a su padding (la PWA es standalone + `black-translucent`: el contenido fluye bajo el status bar y iOS se come los taps en esa zona — síntoma: "el primer tap no anda"). El `<Modal>` compartido ya lo hace; si creás un overlay nuevo, replicalo. Y `button` lleva `touch-action: manipulation` global (index.css): no lo quites, y los drag handles deben seguir usando la clase `.touch-none` (clase > elemento) para conservar su `touch-action: none`.

## Estado al 2026-08-03 (V)

**Eliminar bandas no funcionaba — y canciones y miembros estaban igual (PR #59).** Reportado por Paul: eliminar "Banda Test" confirma, dice "eliminada", pero la banda sigue. Misma clase que el bug de órdenes (PR #42).
- **Causa doble:** (a) `orders.band_id → bands` era `NO ACTION` → borrar una banda con órdenes lanza 23503; (b) el handler de `Bandas.jsx` llamaba `deleteBand()` **fire-and-forget** y mostraba éxito igual. Control negativo transaccional (impersonando pastor ACTIVO): banda, canción con historial y miembro con historial fallaban los tres con 23503.
- **Familia auditada y arreglada** (migración `20260803_fix_delete_fks.sql`): `orders.band_id → SET NULL` (los órdenes históricos permanecen, la UI muestra "Banda eliminada"); `song_key_history.song_id → CASCADE` y `song_key_history.member_id → CASCADE` (la memoria de tono sin esa canción/miembro no referencia nada; 9 de 107 canciones y 2 miembros estaban bloqueados); `pending_registrations.approved_by/rejected_by → SET NULL` (la solicitud histórica se conserva). La EF `admin-delete-member` también chocaba con las FKs (service_role no exime FKs) → ahora funciona.
- **Cliente:** `Bandas.jsx` y `Repertorio.jsx` pasan a `await` + rama éxito/error con `ErrorModal` (patrón PR #42). `Ordenes.jsx` muestra "Banda eliminada" en tarjeta y detalle cuando `band_id` es null (los PDFs ya tenían fallback). `Miembros.jsx` ya esperaba el resultado.
- **QA transaccional en prod (BEGIN…ROLLBACK):** control negativo 3×23503 antes del fix; después: Banda Test se borra y sus 2 órdenes permanecen con `band_id` null, canción y miembro se borran con historial cascadeado, y un rol `member` sigue borrando 0 filas (RLS intacta). Advisors 0 nuevas. Lint + 35 tests + build OK.
- **Trampa de QA descubierta:** hay filas de prueba viejas con `role='pastor'` pero `active=false`; `auth_role()` exige `active=true`, así que impersonarlas hace que TODA la RLS dé false y los DELETE matcheen 0 filas sin error (falso negativo). Al impersonar en QA, SIEMPRE elegir el usuario con `AND active = true`.

**Landmine nuevo:**
32. **Todo handler de borrado DEBE `await` + ramificar** (`deleteBand/Song/Order` devuelven true/false): fire-and-forget + modal de éxito = mentira al usuario cuando la base rechaza (23503 u otro). Las FKs de la app quedaron: `orders.band_id` SET NULL, `song_key_history.{song_id,member_id}` CASCADE, `song_key_history.order_id` SET NULL, `pending_registrations.{approved_by,rejected_by}` SET NULL, `practice_logs.*` CASCADE. Si agregás una FK nueva hacia `bands/songs/members/orders`, decidí la regla de DELETE explícitamente (nunca NO ACTION por defecto) y probá el borrado transaccionalmente impersonando un usuario ACTIVO (ver trampa arriba).

## Estado al 2026-08-06

**Cuatro reportes de Paul con capturas, en dos chunks (PR #60).**

**Chunk A — Bandas:** (a) "Martess"/"Juevess": el card pluralizaba `${label}s` a ciegas; los días terminados en s son invariantes en español. Nuevo `src/lib/days.js` con `dayPluralLabels` (solo sábado/domingo pluralizan) — auditado, era el único lugar con esa concatenación. (b) Las tarjetas de Bandas ahora se ordenan por calendario (semana desde lunes → martes, jueves, sábado, domingo con las bandas reales), desempate por horario y nombre (`compareBandsByCalendar`). 8 tests unitarios con el dataset de las capturas.

**Chunk B — Panel de push (MobileNav móvil + Header desktop, los DOS):** (a) las comunicaciones se pusheaban AL FINAL del array ya ordenado → siempre al fondo aunque fueran lo más nuevo. Ahora cada ítem lleva `createdAt` y todo se mezcla por fecha real (`sortNotificationsByDateDesc` en `src/lib/notifications.js`, con test); los eventos realtime recargan por el mismo loader → camino único. (b) tocar un aviso lo marcaba leído y lo hacía desaparecer (roce accidental = borrado): ahora el tap NO descarta (solo navega en solicitudes), cada card tiene su **✕** (`stopPropagation` → `markAsRead`) y el "Marcar todas como leídas" sigue arriba.

**Landmines nuevos:**
33. **Días de la semana:** NUNCA pluralizar concatenando "s" (`${label}s` → "Martess"). Usar `dayPluralLabels`/`dayLabels` de `src/lib/days.js`. El orden de tarjetas/listas por día usa `compareBandsByCalendar` (lunes primero, domingo último); si agregás una vista nueva ordenada por día, reutilizá esos helpers (tests en `days.test.js`).
34. **Panel de notificaciones:** (a) todo lo que entre al panel DEBE llevar `createdAt` y pasar por `sortNotificationsByDateDesc` — no hay orden implícito por origen; las comunicaciones NO van después. (b) El tap sobre un aviso NO debe marcar leído/descartar (decisión de producto anti-roce): el descarte es SOLO vía la ✕ de cada card o "Marcar todas". El cambio vive duplicado en `MobileNav.jsx` Y `Header.jsx` (los paneles siguen sin unificar): cualquier cambio va en los dos.

## Estado al 2026-09-05

**Avatar mostraba "YUNDEFINED" (PR #77).** Reportado por Paul con captura (ficha de Yessica). Causa raíz: el nombre estaba cargado con **doble espacio**; `getInitials` hacía `name.split(' ')` y `parts[1][0]` sobre el string vacío daba `undefined` → `"Y"+"undefined"`. Fix: `getInitials` movido a `src/lib/initials.js`, robusto a cualquier whitespace (trim + `split(/\s+/)` + filter), **fuente única** de iniciales (el diseño dorado del `<Avatar>` quedó intacto); `normalizeName` en `convertMemberToDB/BandToDB/SongToDB` (trim + colapso) para prevenir; datos limpiados en prod (1 miembro + 98 títulos con espacios sobrantes, whitespace only, migración `20260902_normalize_member_song_names.sql`). Verificado: nada compara por `name`/`title` en el código; 8 tests nuevos; 76 tests + build OK.

**Estudio terminado (sin código): miembros de banda agregados por líderes, permanentes y temporales.** Plan de implementación completo en **`docs/PLAN_membresias_bandas.md`** (decisiones cerradas por Paul, hallazgos verificados, diseño aditivo, migración, QA y orden de PRs). Hallazgo crítico del estudio: la RLS de `bands` permite UPDATE/DELETE a `pastor_or_leader` mientras la UI lo oculta al líder (hueco tipo landmine 19) → el plan lo cierra con política DELETE→pastor + trigger append-only. **Se desarrolla en la sesión local de Paul** siguiendo ese doc.

**Operativa git (aprendido hoy):** la rama de sesión `claude/mobile-photo-upload-3asq58` quedó vieja frente a `main` (main avanzó hasta #76 desde otras sesiones) y el **force-push está bloqueado**; los fixes nuevos salen desde ramas frescas `fix/`/`docs/` creadas de `origin/main` (PR #77 = `fix/avatar-iniciales-espacios`). Con usuarios reales en vivo, **cada PR se mergea solo con el ok explícito de Paul.**

**Landmines nuevos:**
35. **Iniciales/nombres con espacios sucios:** las iniciales salen SOLO de `getInitials` (`src/lib/initials.js`), robusta a dobles/leading/trailing spaces. Los `convertXToDB` normalizan `name`/`title` (`normalizeName`) — la creación de miembros vía EF `admin-create-member` NO pasa por ahí (aceptado: la visualización es a prueba de balas igual). Si agregás una tabla con nombre visible, normalizá en su converter. Nunca volver a `name.split(' ')[i][0]`.
36. **`bands`: la base es MÁS permisiva que la pantalla** (UPDATE/DELETE = `pastor_or_leader`, UI solo pastor). Cualquier trabajo sobre bandas/miembros DEBE empezar por `docs/PLAN_membresias_bandas.md` §2.2 (cerrar el hueco con la regla en la base). No agregar botones "solo pastor" confiando en que la RLS los respalda sin verificarlo con `pg_policies`. **CERRADO por PR A (ver abajo).**

## Estado al 2026-09-05 (II) — miembros de banda por líderes (permanentes/temporales)

Implementada la feature del estudio (`docs/PLAN_membresias_bandas.md`) en **3 PRs**, en el orden §2.8. **PR A y PR B ya están aplicados a producción** (backend, cero impacto para el usuario hasta que el cliente los use); el cliente (PR C) queda a la espera del merge. Todos verificados en vivo; cada PR se mergea solo con el ok de Paul.

- **PR A — Higiene** (`feat/bandas-rls-append-only`, migración `20260905_bands_append_only_leaders.sql`): cierra el hueco #36. Política DELETE de `bands` → `is_pastor()`; trigger `enforce_band_update_rules` (BEFORE UPDATE) que al rol `leader` le exige que el cambio sea SOLO un append a `members` (`NEW.members @> OLD.members`) y ningún otro campo distinto; pastor sin restricciones. QA 10/10 impersonando roles.
- **PR B — Backend** (`feat/bandas-temporales-backend`, migración `20260905_band_temporary_members.sql`): tabla `band_temporary_members` (ventana 1–90 días por CHECK, FORCE RLS, 4 políticas, guard anti-duplicado con advisory lock); helper `band_effective_member_ids(uuid)` = permanentes ∪ temporales vigentes; los 2 crons pasan a usar el helper (cambio quirúrgico + re-REVOKE). QA 14/14 + cron real en replica (temporal recibe, permanente sin regresión) + advisors 0 nuevas.
- **PR C — Cliente** (`feat/bandas-temporales-cliente`): store (carga tolerante + realtime + `getEffectiveBandMemberIds`/`getBandMembers` con `{temporary,expiresAt}` + `addPermanentBandMember`/`addTemporaryBandMember`/`removeTemporaryBandMember`); los 7 consumidores usan miembro efectivo; UI de Bandas (botón "Agregar miembro" líder+pastor, modal permanente/temporal, badge, ✕ del pastor). Lint + build OK; test de paridad; E2E de UI pendiente sobre el preview de Vercel.

**Landmines nuevos:**
37. **Pertenencia de banda = permanentes ∪ temporales vigentes.** `bands.members` (uuid[]) son SOLO permanentes; los temporales viven en `band_temporary_members` (vigente = `expires_at > now()`). NUNCA leer `band.members` directo en lógica de avisos/elegibilidad: usar `public.band_effective_member_ids(bandId)` (SQL, en los crons) o `getEffectiveBandMemberIds(bandId)`/`getBandMembers(bandId)` (cliente). Los 7 consumidores (§1.3 del plan) ya están migrados; **rehacé el grep `\.members\b|getBandMembers|getEffectiveBandMemberIds` antes de tocar pertenencia** por si aparece uno nuevo. El vencimiento es por FILTRADO (nada se borra); un temporal vencido desaparece en silencio.
38. **El candado "líder solo agrega" vive en la base, no en la UI** (trigger `enforce_band_update_rules` + DELETE→pastor). No lo quites ni relajes el superset check. El líder agrega un PERMANENTE con un update DIRIGIDO solo a `members` (`addPermanentBandMember`), **NO `updateBand`**: `convertBandToDB` coerce `meeting_time` null→'20:00' y normaliza el nombre, lo que haría que el trigger vea "un campo cambió" y rechace el append del líder. (Hoy ningún banda tiene esos valores, pero el update dirigido es a prueba de futuro.)
39. **`CREATE OR REPLACE` de `send_rehearsal_reminders`/`send_practice_reminders` resetea grants** → re-asertar SIEMPRE `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE … TO service_role` (ACL objetivo `{postgres, service_role}`). Mismo patrón que el REVOKE de PR #54. Verificar con `proacl` que no quede `authenticated`/PUBLIC.
40. **`band_temporary_members`:** ventana 1–90 días por CHECK (piso Y techo, fuente de verdad además de la UI). El **cliente DEBE mandar `starts_at` y `expires_at` del mismo instante** (`starts_at`=now cliente, `expires_at`=starts+N días); si manda solo `expires_at` (dejando `starts_at` al default `now()` del server), el skew de reloj puede romper el CHECK. Duplicado-vigente lo frena un trigger BEFORE INSERT con `pg_advisory_xact_lock` por par (airtight bajo doble tap). Tabla con FORCE RLS (como bands/members). `INSERT` = pastor/líder firmando como uno mismo (`added_by` = mi member id); `UPDATE/DELETE` = solo pastor.

## Estado al 2026-09-05 (III) — cierre de huecos de escalada (auditoría adversarial)

Barrido de seguridad destructivo (Workflow de 5 agentes: RLS sweep + SECURITY DEFINER ACL + red-team del diseño, con verificación adversarial de cada hallazgo). Cerró DOS huecos reales explotables por cualquier miembro autenticado, en **una PR** (migraciones ya aplicadas a prod). QA transaccional 15/15 (ataque bloqueado + flujos legítimos intactos) + 4/4 backend sin regresión + advisors 0 nuevas.

- **Escalada de privilegios en `members` (cierra #36 para members):** la RLS `members_update_self_or_pastor` no restringía columnas → un miembro, en su PROPIA ficha, podía `role='pastor'` (escalada directa) o `editor=true` (escritura del repertorio vía `songs_update_editors`). Fix: trigger `enforce_member_update_rules` (BEFORE UPDATE, migración `20260905_members_enforce_update_rules.sql`) que **congela** las columnas privilegiadas (`role, editor, active, user_id, id, pastor_area, leader_of, password_hash, created_at`) para actores autenticados no-pastores; exime backend por `rolbypassrls` (service_role/postgres/crons) y pastores por `is_pastor()`. + `role/editor/active` ahora `NOT NULL`. La RLS decide QUÉ fila; el trigger, QUÉ columnas.
- **Suplantación/spam en `notifications`:** la policy de INSERT (roles {public}, `with_check auth.uid() IS NOT NULL`) no tenía guarda de columnas → un miembro podía POSTear `{is_global:true,...}` y aparecer en el feed de TODOS + disparar un **push web arbitrario a todos los dispositivos** (trigger `notify_push_on_notification_insert` con `to:'all'`). Fix (migración `20260905_notifications_insert_guard.sql`): `REVOKE INSERT ... FROM authenticated, anon` + `DROP POLICY "Allow insert notifications"`. Toda creación legítima es server-side (12 funciones SECURITY DEFINER owner postgres); el cliente nunca inserta en `notifications`.

**Landmines nuevos:**
41. **`enforce_member_update_rules` DEBE ser SECURITY INVOKER** (nunca DEFINER): el candado usa `current_user` para eximir al backend `rolbypassrls`. Con DEFINER correría como el dueño `postgres` (rolbypassrls=true) → la 1ª línea eximiría a TODOS → **no-op silencioso que reabre el hueco sin ningún error**. Columnas congeladas: `role/editor/active/user_id/id/pastor_area/leader_of/password_hash/created_at`. Un self-edit legítimo pasa porque el cliente reenvía valores idénticos (convertMemberFromDB↔ToDB fieles → NEW=OLD). Los EF admin-* que cambian role/editor/active corren como service_role (exentos). **RIESGO LATENTE:** el trigger es UPDATE-only; hoy es suficiente porque `members` NO tiene policy de INSERT/DELETE para authenticated. Si alguna vez se agrega una policy de INSERT (p.ej. revivir auto-registro), DEBE `WITH CHECK` forzar `role='member' AND editor=false AND user_id=auth.uid()`, agregar `UNIQUE(user_id) WHERE user_id IS NOT NULL` (auth_role() usa LIMIT 1 sin ORDER BY) y espejar el freeze en una rama BEFORE INSERT.
42. **`notifications`: el cliente NUNCA inserta** (INSERT revocado de authenticated/anon; sin policy de INSERT). Toda notificación nace server-side de 12 funciones SECURITY DEFINER (owner postgres) — triggers de alta de order/band/member/song/pending + crons devocional/reflexión/cumpleaños/ensayo/práctica. Nunca re-otorgar INSERT al cliente; cualquier notificación originada en cliente va por una EF service_role que valide el rol del emisor. El cliente solo SELECT + marcar-leído (en `notifications_read`/`communication_notifications`).
