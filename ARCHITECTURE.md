# AdorAPP — Mapa de Arquitectura

> Documento generado el 2026-08-06 por un barrido exhaustivo del código (11 agentes en paralelo) + foto autoritativa de la base en producción. Es el **mapa completo de cada sección y función** de la plataforma. Complementa a `CLAUDE.md` (que es el **contrato obligatorio**: Regla de Oro, reglas no negociables, vocabulario, estética y los 34 *landmines*). Si algo acá contradice al código actual, gana el código — actualizá este doc.

## Cómo usar este documento (para una sesión nueva)

1. **Primero leé `CLAUDE.md`** de punta a punta: es el método de trabajo innegociable (la **Regla de Oro**), las reglas de seguridad, el vocabulario eclesial ("orden" es masculino, "ensamble" vs "ensayo") y el historial con los **34 landmines** numerados. Este `ARCHITECTURE.md` NO los repite; los referencia por número.
2. **Después usá este doc como mapa**: cada página, store, componente, librería, migración y cron, con sus funciones y flujo de datos.
3. La sección **"Estado real de la base (prod)"** es la verdad viva de Supabase (tablas/RLS/crons/FKs/funciones), más confiable que leer las migraciones acumuladas.

## Panorama en 60 segundos

- **Stack:** PWA en **Vite + React 18 + Zustand** (estado) + **Supabase** (Postgres + Auth + Storage + Edge Functions + pg_cron + Realtime) + **Vercel** (hosting, región `gru1`). Casi todo JS; sólo `src/lib/csv.ts` y `src/lib/orders.ts` son TS.
- **Prod:** https://adorapp.net.ar · **Repo:** github.com/pabloeacu/adorapp (branch `main` protegida) · **Rama de desarrollo:** `claude/mobile-photo-upload-3asq58` · **Supabase project id:** `gvsoexomzfaimagnaqzm`.
- **Dominio:** ~8 usuarios reales del ministerio de adoración de Adoración CAF. Los líderes arman **órdenes** (la lista de canciones de cada reunión). Roles: `pastor` (Paul, Ana) / `leader` / `member`, más un flag `editor` para el repertorio.
- **Arranque de sesión (cliente):** `authStore.refreshProfile()` → dispara `appStore.initialize()` → carga members/bands/songs/orders + se suscribe a Realtime. `src/App.jsx` hace routing con `React.lazy` por ruta + *route guards* por rol.
- **La landmine madre (regla #8):** **NUNCA** `supabase.from(...).update(convertXToDB(partial))`. Los `convertXToDB` de `appStore.js` generan filas completas con defaults; un partial pisa toda la fila. Siempre rutear por `updateMember/Band/Song/Order`, que mergean el partial con el snapshot del store ANTES del converter.
- **Los dos archivos monstruo:** `src/components/layout/Header.jsx` (desktop) y `MobileNav.jsx` (móvil), ~40% duplicado. Todo cambio de perfil/notificaciones/cropper va en LOS DOS.
- **Motor musical:** transposición de acordes en `appStore.js` (regex case-insensitive `[A-Ga-g]`), compartido por viewer, PDFs y el Ensayómetro.
- **El Ensayómetro** (`src/pages/Practica.jsx`, 3 fases): práctica personal por orden, alarma opt-in con push diario 18:00 ART, y metrónomo Web Audio + festejo al 100%.
- **QA canónico:** navegador real (Chromium vía `playwright-core` + `/opt/pw-browsers/chromium`) para timing/scroll/DnD/gestos; DB con `BEGIN … ROLLBACK` impersonando roles (SIEMPRE con usuario `active=true`); 43 tests Vitest; CI = lint + build + test + smoke prod.

## Índice de secciones

1. Página Órdenes (`src/pages/Ordenes.jsx`, 1768 líneas)
2. Página Repertorio (`src/pages/Repertorio.jsx`)
3. Página Practica — Ensayómetro (`src/pages/Practica.jsx`)
4. Páginas Bandas y Miembros
5. Páginas: Dashboard, Login, Solicitudes, Comunicaciones
6. Store central — `src/stores/appStore.js`
7. Auth Store, Routing y Hooks
8. Layout: `Layout`, `Sidebar`, `Header`, `MobileNav`
9. Componentes UI y compartidos (`src/components/ui/*`, `src/components/*.jsx`)
10. Librerías `src/lib/*`
11. Backend — migraciones, Edge Functions, crons, CI y config

---

# Estado real de la base (prod · `gvsoexomzfaimagnaqzm` · 2026-08-06)

**18 tablas, todas con RLS habilitado.**

| Tabla | Políticas | Propósito |
|---|---|---|
| `members` | 2 | Miembros: roles `pastor/leader/member`, flag `editor`, `user_id`→auth, avatar. |
| `bands` | 4 | Bandas/equipos: `meeting_day/time/type`, `members[]`. |
| `songs` | 4 | Repertorio (~128): `structure`, `categories[]`, `compass`, `bpm`, `original_key/key`. |
| `orders` | 4 | Órdenes (lista de canciones): `songs[]`, `status`, `rehearsal_date/time/reminder_sent`. |
| `song_key_history` | 4 | Memoria de tono por (miembro, canción). |
| `practice_logs` | 4 | Registro de práctica personal (owner-only, efímero). |
| `practice_alarms` | 4 | Opt-in alarma de ensayo (owner-only, sin fila = apagada). |
| `pending_registrations` | 5 | Solicitudes de registro público (anon INSERT, rate-limited). |
| `communications` / `communication_notifications` | 2 / 3 | Comunicaciones del pastorado + su entrega por destinatario (`is_read`). |
| `notifications` / `notifications_read` | 4 / 3 | Notificaciones globales/por-usuario + estado leído cross-device. |
| `push_subscriptions` | 3 | Suscripciones Web-Push por miembro. |
| `daily_devotionals` (300) / `daily_reflections` (365) | 2 / 1 | Contenido devocional diario. |
| `notifications`→push, `audit_events` (306) | 4 / 1 | Auditoría (trigger). |
| `error_log` | 2 | Errores + monitor de frescura de crons. |
| `health_checks` (602) | 1 | Pings de uptime (GitHub Actions). |

**8 crons pg_cron activos** (schedule en UTC; ART = UTC−3):

| Job | Cron (UTC) | ART | Qué hace |
|---|---|---|---|
| `daily-devotional-notification` | `0 9 * * *` | 06:00 | Push devocional del día. |
| `daily-birthday-notification` | `0 12 * * *` | 09:00 | Push a pastores por cumpleaños. |
| `daily-afternoon-reflection` | `0 20 * * *` | 17:00 | Push reflexión de la tarde. |
| `practice-reminders` | `0 21 * * *` | 18:00 | Alarma de ensayo (1/día si hay pendientes). |
| `auto-complete-orders` | `0 6 * * *` | 03:00 | `scheduled`→`completed` órdenes pasadas. |
| `practice-cleanup` | `30 7 * * *` | 04:30 | Poda `practice_logs` de órdenes viejas (gracia 7d). |
| `rehearsal-reminders` | `*/15 * * * *` | — | Push a la banda 2 h antes del ensamble. |
| `notification-monitor` | `0 */6 * * *` | cada 6 h | Escribe a `error_log` si falta contenido. |

**FKs críticas hacia bands/songs/members/orders** (reglas de DELETE post PR #42/#59 — nunca volver a `NO ACTION`):

| Origen | Destino | ON DELETE |
|---|---|---|
| `orders.band_id` | `bands` | **SET NULL** (los órdenes sobreviven; UI: "Banda eliminada") |
| `song_key_history.song_id` | `songs` | **CASCADE** |
| `song_key_history.member_id` | `members` | **CASCADE** |
| `song_key_history.order_id` | `orders` | **SET NULL** |
| `practice_logs.song_id` | `songs` | **CASCADE** |
| `practice_logs.order_id` | `orders` | **CASCADE** |
| `pending_registrations.approved_by` / `rejected_by` | `members` | **SET NULL** |
| `push_subscriptions.member_id` | `members` | **CASCADE** |
| `error_log.resolved_by` | `members` | **SET NULL** |

**21 funciones `SECURITY DEFINER`.** Sólo 3 son ejecutables por `authenticated` (helpers de RLS, intencional): `auth_role()`, `is_pastor()`, `is_pastor_or_leader()`. El resto (crons `send_*`/`auto_*`/`cleanup_*`, triggers `notify_*`, `rate_limit_pending_registrations`, `get_push_config`, etc.) están **blindadas con `REVOKE`** (no ejecutables por anon/authenticated). `CREATE OR REPLACE` resetea grants → re-asertar el REVOKE al tocarlas.

**Edge Functions:** en el repo sólo está `supabase/functions/send-push`. Las 7 `admin-*` (crear/eliminar miembro, resetear password, etc.) están **desplegadas en Supabase pero NO versionadas en el repo** — se invocan desde el cliente vía `callAdminFunction()` (`src/lib/supabase.js`). NUNCA crear test users por SQL crudo: usar `admin-create-member`.

---

## Página Órdenes (`src/pages/Ordenes.jsx`, 1768 líneas)

Pantalla más grande del repo. CRUD completo de órdenes (listas de canciones por reunión), reutiliza un solo modal para crear/editar, tiene modal-detalle con control de estado, exporta 2 tipos de PDF, gestiona historial de tonos por (director, canción) y reordena canciones con drag & drop. Roles: `pastor`/`leader` mutan; `member` es solo-lectura (ve/exporta).

### Componente auxiliar (mismo archivo)

- **`SortableSongRow({ id, children })`** — `Ordenes.jsx:45`. Envuelve cada fila de canción del editor; usa `useSortable` de @dnd-kit. El único drag surface es el `<button>` "⋮⋮" (recibe `attributes`+`listeners`, `touch-none`), así que clicks en selects/botones internos nunca inician drag. `opacity: 0.6` mientras arrastra.

### Constante de módulo

- **`statusConfig`** — `Ordenes.jsx:68`. Mapa `scheduled|completed|cancelled → { label, color, bg }`. `label` en MASCULINO ("Programado/Completado/Cancelado") por el vocabulario eclesial. Usado en badges de tarjeta y detalle.

### Componente principal `Ordenes` (`Ordenes.jsx:74`)

`useDocumentTitle('Órdenes')`. Del store (`useAppStore`) toma: `orders, bands, songs, members, addOrder, updateOrder, deleteOrder, cloneOrder, getUnusedByBand, getSongById, getBandById, getMemberById`. Rol vía `useCurrentRole()` → `isPastor`/`isLeader` (`Ordenes.jsx:77-79`).

#### Estado (useState)
- `isModalOpen` / `editingOrder` — modal crear-editar; `editingOrder=null` ⇒ modo crear (`Ordenes.jsx:81-82`).
- `isDetailOpen` / `viewingOrder` — modal detalle y su snapshot (`Ordenes.jsx:83-84`).
- `filterStatus` (default `'scheduled'`, no `'all'` — evita listar históricas), `filterBand` (`'all'`), `sortBy` (`'date_desc'`), `viewMode` (`'list'|'calendar'`) (`Ordenes.jsx:85-86,147-148`).
- `showUnused` / `selectedBandForUnused` — sugeridor de canciones sin usar (`Ordenes.jsx:87-88`).
- `songSearchTerm` / `showSongDropdown` / `songDropdownPosition` — buscador de repertorio; viven FUERA de `formData` (por eso se blanquean aparte, landmine 8) (`Ordenes.jsx:89-91`).
- `keyHistoryLoading` / `keyHistoryTooltip` — estado del lookup de historial de tonos (`Ordenes.jsx:94-95`).
- `formData` — `{ date, time:'20:00', bandId, meetingType:'culto_general', songs:[], feedback, rehearsalEnabled, rehearsalDate, rehearsalTime:'18:00' }` (`Ordenes.jsx:97-107`).
- `confirmModal` / `successModal` / `errorModal` — modales genéricos (`Ordenes.jsx:126-145`).
- `searchParams`/`setSearchParams` de react-router (deep-link) (`Ordenes.jsx:149`).

#### Derivados (useMemo)
- **`singers`** — `Ordenes.jsx:113`. Miembros elegibles para dirigir: activos, en la banda elegida, con instrumento `'Voz'`. Vacío si no hay banda (bloquea el buscador de canciones).
- **`filteredOrders`** — `Ordenes.jsx:151`. Filtra por status+banda y ordena: `date_asc`/`date_desc`/`band` (band desempata por `localeCompare('es')` y luego fecha desc).
- **`filteredSongsForDropdown`** — `Ordenes.jsx:176`. Busca en título/artista/tono con **null-guards defensivos** (`(song.title||'')`); un NULL en datos legacy crashearía toda la página. Corta a 10 (sin término) / 15 (con término).
- `unusedSongs` — `getUnusedByBand(selectedBandForUnused, 4)` (`Ordenes.jsx:171`).

#### Handlers de modal
- **`handleOpenModal(order = null)`** — `Ordenes.jsx:186`. `order` truthy ⇒ precarga `formData` (clona `order.songs` con `.map(s=>({...s}))`, deriva `rehearsalEnabled = !!order.rehearsalDate`) y setea `editingOrder`; `null` ⇒ resetea a defaults. Siempre blanquea `songSearchTerm/showSongDropdown/keyHistoryTooltip`. **LANDMINE 12**: los botones "Nuevo Orden" DEBEN llamar `() => handleOpenModal()` — pasar el handler directo hace que React mande el evento como `order` y abra edición con basura.
- **`handleCloseModal()`** — `Ordenes.jsx:223`. Cierra + limpia `editingOrder/showUnused/selectedBandForUnused/songSearchTerm/showSongDropdown/keyHistoryTooltip`.
- **`handleViewOrder(order)`** — `Ordenes.jsx:297`. Abre detalle (`viewingOrder`+`isDetailOpen`).

#### Deep-link `?order=<id>` (useEffect)
- `Ordenes.jsx:242`. Card del dashboard "Hoy tenés ensamble" navega a `/ordenes?order=<id>`; el effect espera a que `orders` cargue, abre el detalle de ese id y limpia el param con `setSearchParams(..., {replace:true})`.

#### Submit / CRUD
- **`handleSubmit(e)`** — `Ordenes.jsx:255`. Valida `date`+`bandId`. Arma `orderPayload` adjuntando `rehearsalDate/Time` SOLO si el switch está on y hay fecha (si no, ambos `null`). Si `editingOrder`: `await updateOrder(id, payload)` (merge-safe, NO toca `rehearsal_reminder_sent`, landmine 9/13). Si no: `await addOrder(payload)` PRIMERO para obtener `order.id` real (satisface FK `song_key_history.order_id`). Luego, en paralelo, `saveKeyHistory(...)` por cada canción con `directorId`. Cierra al final.
- **`handleChangeStatus(order, status)`** — `Ordenes.jsx:235`. `await updateOrder(id,{status})` + parchea `viewingOrder` local. Botones Marcar completado / Cancelar / Reabrir (solo pastor/líder, detalle).
- **`handleCloneOrder(order)`** — `Ordenes.jsx:302`. ConfirmModal → `cloneOrder(order.id)` (store: copia con fecha hoy, `status:'scheduled'`, `feedback:''`) → SuccessModal. (NO awaitea el clone; fire-and-confirm.)
- **`handleDeleteOrder(order)`** — `Ordenes.jsx:324`. ConfirmModal → **`const ok = await deleteOrder(order.id)`** → SuccessModal si `ok`, **ErrorModal si falla** (LANDMINES 19,32: nunca fire-and-forget; antes mostraba "eliminada" aunque la FK rechazara con 23503).
- **`handleUpdateFeedback(orderId, feedback)`** — `Ordenes.jsx:357`. `updateOrder(orderId, {feedback})` desde el textarea del pastor (detalle).

#### Export PDF (async, landmine 14)
- **`runPdfExport(promise)`** — `Ordenes.jsx:364`. `Promise.resolve(promise).catch(...)` → ErrorModal. Envoltura obligatoria: los generadores son async y un rejection fire-and-forget se traga en silencio.
- **`generateOrderPDF(order)`** — `Ordenes.jsx:375`. `import('jspdf')` on-demand (~140KB). Resumen SIN acordes (fondo oscuro, tabla #/Canción/Tono/Director, feedback del pastor si hay). `doc.save(...)`. Tono por fila: `songRef.key || song?.originalKey || song?.key || 'C'`.
- **`generateSongsPDF(order)`** — `Ordenes.jsx:540`. Una canción por página CON acordes; transpone estructura con `transposeSongStructure(structure, originalKey, key)` si `key !== originalKey`. Parte acordes largos por ancho; maneja secciones vacías ("Silencio musical"/"Sin contenido disponible").
- Botones: en tarjeta "Exportar"/"Imprimir" (`Ordenes.jsx:1093-1110`) y en detalle "Exportar PDF"/"Imprimir" (`Ordenes.jsx:1597-1608`), todos vía `runPdfExport(...)`.

#### Canciones dentro del orden
- **`addSongToOrder(song)`** — `Ordenes.jsx:725`. Sugiere director con `suggestDirectorForSong({singerIds, orders, songId, bandId})` (`src/lib/orders.ts`); `key` default = `song.key||song.originalKey||'C'`; agrega `_pendingHistory`, `_suggestedDirector` y **`_localId`** (crypto.randomUUID, id estable para DnD). Si hay director sugerido, en background `fetchKeyHistory(...)` y actualiza `key` de esa fila.
- **`handleDirectorChange(index, directorId, songId)`** — `Ordenes.jsx:769`. Fija `directorId` ya; luego `fetchKeyHistory` → si `found` usa la tonalidad guardada, si no la del song; `.catch` deja el tono actual. Sin director ⇒ limpia tooltip.
- **`handleKeyChange(index, newKey)`** — `Ordenes.jsx:815`. Wrapper de `updateSongInOrder(index,'key',newKey)`.
- **`updateSongInOrder(index, field, value)`** / **`removeSongFromOrder(index)`** — `Ordenes.jsx:847,839`. Mutan `formData.songs` inmutablemente; remove también limpia tooltip.

#### Drag & drop (@dnd-kit)
- **`dndSensors`** — `Ordenes.jsx:822`. `PointerSensor` (umbral 6px) + `KeyboardSensor` (`sortableKeyboardCoordinates`).
- **`handleSongDragEnd(event)`** — `Ordenes.jsx:827`. Resuelve ids por `s._localId || \`${s.songId}-${i}\`` y `arrayMove`. `DndContext`/`SortableContext` (verticalListSortingStrategy) envuelven la lista (`Ordenes.jsx:1338-1481`).

#### Historial de tonos (Supabase directo, tabla `song_key_history`)
- **`fetchKeyHistory(directorId, songId)`** — `Ordenes.jsx:872`. `supabase.from('song_key_history').select('*').eq(member_id).eq(song_id).order('order_date' desc).limit(1).single()`. Ignora `PGRST116` (sin filas). Si hay dato: setea `keyHistoryTooltip` con tono/banda/fecha (la fecha sale de buscar `order_id` en el store; tolera `order_id` null → "fecha no disponible", landmine 18) y devuelve `{found, key, date}`. Si no: tooltip "primera vez". Retorna `{found:false,key:null}` en error.
- **`saveKeyHistory(directorId, songId, key, orderId)`** — `Ordenes.jsx:929`. **`upsert(..., { onConflict: 'member_id,song_id' })`** ⇒ idempotente, editar no duplica historial. Se llama en `handleSubmit` por cada canción con director.

#### Helpers de presentación
- **`formatDate(dateStr)`** — `Ordenes.jsx:856`. `toLocaleDateString('es-ES', {weekday,year,month,day})`.
- **`getMeetingTypeLabel(typeId)`** — `Ordenes.jsx:866`. Busca en `MEETING_TYPES` (culto_general/jovenes/mujeres/hombres/ninos/evento).

#### UI destacada
- Header con toggle Lista/Calendario y botón "Nuevo Orden" (solo pastor/líder) (`Ordenes.jsx:958-996`).
- Filtros: estado / banda / orden (`Ordenes.jsx:999-1030`). Vista calendario delega en `<OrderCalendar>` (`Ordenes.jsx:1032`).
- Tarjeta de orden: badge de estado + `band?.name || 'Banda eliminada'` (fallback `band_id` null, landmine 32) (`Ordenes.jsx:1072`); fila de acciones con **`flex-wrap`** para que "Imprimir" no se desborde en móvil (`Ordenes.jsx:1089`); feedback visible solo a pastor.
- Modal crear/editar (`size="xl"`, footer con "Crear Orden"/"Guardar cambios"): grid Fecha/Hora/Banda; al cambiar banda se **descartan directores que ya no pertenecen** a la nueva banda (`Ordenes.jsx:1220-1240`).
- **Switch "Programar ensamble" iOS-safe** (`Ordenes.jsx:1264-1274`): patrón `<label>` + `<input type=checkbox class="sr-only peer">` + dos `<span>` (track `w-[52px] h-8`, knob `h-7 w-7`, `peer-checked:translate-x-5`). NO usar `<button>` (landmine 23 — iOS lo deforma). "Ensamble" = encuentro de la banda (glosario, landmine 26).
- Buscador de repertorio bloqueado hasta elegir banda (foco/click ⇒ ErrorModal "Elegí la banda primero") (`Ordenes.jsx:1502-1537`); dropdown se auto-posiciona arriba/abajo según `spaceBelow` (`Ordenes.jsx:1488-1493`).
- Selector de tono con botón de lookup (íconos History/Check/Award/Clock según estado) y **tooltip anclado a la derecha** (`right-0`, `max-w-[13rem]`, sin `whitespace-nowrap`) para no desbordar en móvil (`Ordenes.jsx:1442-1467`).
- Modal detalle (`viewingOrder`): card "Practicar este orden" → `/practica/:id` solo si `status==='scheduled'` (`Ordenes.jsx:1630`); control de estado (pastor/líder); textarea de feedback (pastor); `<OrderHistoryTimeline orderId>` (pastor, gateado por RLS) (`Ordenes.jsx:1730`).

### Flujo de datos (resumen)
- **Store (`appStore.js`)**: `addOrder` inserta con `uuidv4()` id, hace `updateSong(..., {lastUsed})` por canción, devuelve la row; `updateOrder` **mergea con el snapshot del store ANTES** de `convertOrderToDB` (evita data-loss, `appStore.js:685`); `deleteOrder` devuelve `true/false`; `cloneOrder` copia y delega en `addOrder`. `convertOrderToDB` (`appStore.js:237`) NUNCA escribe `rehearsal_reminder_sent` (lo maneja el cron).
- **Supabase directo desde la página**: tabla `song_key_history` (SELECT en `fetchKeyHistory`, UPSERT en `saveKeyHistory`). El resto pasa por el store.
- **Realtime**: cambios en `orders` entran vía `mergeRealtimeChange` del store (`appStore.js:890`, la página no se suscribe directo).
- **Crons relacionados** (no en este archivo): `send_rehearsal_reminders` (push 2h antes del ensamble), `auto_complete_past_orders` (scheduled→completed cuando `date < hoy`).

### Trampas y landmines
- **12** — Botones "Nuevo Orden"/"Crear primer orden" DEBEN ser `() => handleOpenModal()`. Pasar `handleOpenModal` directo ⇒ el evento entra como `order` y abre edición con basura (`Ordenes.jsx:991,1177`).
- **8/reset de búsqueda** — `songSearchTerm/showSongDropdown/keyHistoryTooltip` viven fuera de `formData`; hay que blanquearlos manualmente en open/close o el modal "recuerda" lo tipeado.
- **9/13** — `rehearsal_reminder_sent` es del cron; `convertOrderToDB` no lo escribe. Reprogramar el ensamble de una orden cuyo flag ya es `true` NO re-dispara el push (caso borde aceptado).
- **14 (PDF async)** — Nunca `try/catch` síncrono ni `setTimeout` alrededor de `generateOrderPDF/generateSongsPDF`; usar `runPdfExport(...)`. Generar ANTES de cerrar el modal.
- **DATA-LOSS (regla #8 / `appStore.js:175`)** — Nunca `supabase.from('orders').update(convertOrderToDB(partial))`; siempre `updateOrder` (mergea primero).
- **18** — `song_key_history.order_id` es `ON DELETE SET NULL`; `fetchKeyHistory` tolera `order_id` null (muestra "fecha no disponible"). No volver a `NO ACTION`.
- **19/32** — DELETE de `orders` es `is_pastor_or_leader()`; mantené el gate UI `(isPastor||isLeader)` alineado con la RLS y `await deleteOrder()` con rama éxito/error (nunca fire-and-forget).
- **23** — El switch "Programar ensamble" NO debe ser `<button>` (iOS lo deforma). Patrón label+checkbox sr-only+spans con px fijos.
- **26 (glosario)** — "ensamble" = encuentro de la banda (lo que se programa acá); "ensayo" = práctica personal (pantalla `/practica`). No confundir en copy nuevo.
- **32 (fallback band_id null)** — Mostrar "Banda eliminada" cuando `getBandById(...)` es null (tarjeta y detalle; los PDFs ya tienen su propio fallback "Banda").
- **DnD `_localId`** — Es id efímero de cliente para @dnd-kit; se persiste tal cual dentro de `songs` (a diferencia de Repertorio, aquí NO se stripea). El grip "⋮⋮" es el único drag handle; sin `useSortable` sería decorativo.
- **null-guards del buscador** — `filteredSongsForDropdown` protege título/artista/tono null; un NULL legacy crashea toda la página.

---

## Página Repertorio (`src/pages/Repertorio.jsx`)

CRUD de canciones del ministerio: alta/edición/borrado, editor de estructura con drag-and-drop por sección, filtros por categoría, buscador diacrítico-insensible, dos vistas (cards/tabla), viewer con transposición en vivo, y export a PDF con transporte de tono. Único componente exportado: `Repertorio` (`src/pages/Repertorio.jsx:84`).

### Constantes y config de módulo
- `sectionTypes` (`:57`) — 8 tipos de sección con `{id,label}`: intro/verse/pre-chorus/chorus/bridge/interlude/coda/ending. Alimenta los `<select>` de tipo dentro del editor de estructura.
- `categoryConfig` (`:68`) — mapa `catId → {label,color,bg}` para pintar badges de categoría. **Ojo:** la clave de "Adoración" es `adoraci` (no `adoracion`) — no coincide con el `id 'adoracion'` de `SONG_CATEGORIES`; ver Trampas.

### Helpers importados clave
- `SONG_CATEGORIES`, `MUSICAL_KEYS`, `transposeSongStructure` desde `appStore` (`:9`). `MUSICAL_KEYS` = 24 tonos (mayores + menores); `SONG_CATEGORIES` = 13 categorías con `id/label/color/bg`.
- `transposeSongStructure(structure, fromKey, toKey)` (`appStore.js:100`) — devuelve una nueva structure con `chords` transpuestos por diferencia de semitonos (`transposeChordToken`, `appStore.js:30`, acepta raíz `[A-Ga-g]`, slash chords y accidentales). Es el mismo motor que usa el PDF y el viewer.
- `useCurrentMember()` (`src/hooks/useCurrentMember.js:10`) — resuelve la fila `members` del usuario logueado por email; de ahí sale `role` + `editor`.
- `foldText/toCSV/downloadCSV` desde `src/lib/csv.ts` — `foldText` (minúsculas + sin acentos) potencia la búsqueda; `toCSV/downloadCSV` para "Exportar CSV".

### SortableSection (`:39`)
- `function SortableSection({ id, children })` — envuelve una sección para el DnD (`@dnd-kit/sortable`). Usa render-prop: `children({ attributes, listeners })` para que **solo** el `<GripVertical>` reciba los listeners de arrastre y editar los inputs/selects no dispare drag. `opacity 0.6` mientras se arrastra. Mismo patrón que el DnD de canciones en `Ordenes.jsx`.

### Componente `Repertorio` — estado (useState/useRef)
- `songs, addSong, updateSong, deleteSong, getUnusedSongs` del store (`:86`).
- `currentMember` → `userRole` (default `'member'`), `isPastor`, `isLeader` (`:87-90`).
- `searchTerm` (`:92`) — texto del buscador.
- `filterCategories` (`:93`) — array multiselect; canción debe matchear **TODAS** las seleccionadas (AND).
- `showUnused` (`:94`) — toggle "Sin usar" (canciones sin uso ≥4 semanas).
- `isModalOpen` (`:95`) — modal alta/edición.
- `isViewerOpen`, `viewingSong`, `viewingKey` (`:96-98`) — viewer de canción + tono mostrado.
- `editingSong` (`:99`) — null = alta, objeto = edición.
- `viewMode` (`:100`) — `'cards'` | `'table'`.
- `exportModalSong`, `exportSongKey` (`:101-102`) — modal PDF + tono elegido (default `'C'`).
- `showCategoryDropdown` (`:103`) — **compartido** por el dropdown de filtro y el del formulario (ver Trampas).
- `newSectionIndex` (`:104`) + `structureContainerRef` (`:105`) — para scroll/focus a la sección recién agregada.
- `localIdRef` (`:109`) + `nextLocalId()` (`:110`) — contador `useRef` que genera `_localId` efímeros (`sec-N`) por sección para el DnD.
- `sectionSensors` (`:114`) — `PointerSensor` (umbral 6px) + `KeyboardSensor`.
- `formData` (`:131`) — `{title, artist, key, categories:['adoracion'], youtubeUrl, compass, bpm, structure:[...]}`. Cada sección lleva `{type,label,content,chords,_localId}`.
- `confirmModal`/`successModal`/`errorModal` (`:143/152/158`) — estados de los modales de confirmación/éxito/error (incluye `loading` para el borrado).

### Funciones internas (una línea cada una)
- `unusedSongs = getUnusedSongs(4)` (`:164`) — canciones sin uso hace ≥4 semanas (store, filtra por `lastUsed`).
- `filteredSongs` (`useMemo`, `:166`) — aplica búsqueda diacrítico-insensible (título/artista + `content`/`chords` de cada sección vía `foldText`), filtro AND por categorías, y filtro "sin usar". Recalcula ante `songs/searchTerm/filterCategories/showUnused/unusedSongs`.
- `toggleFilterCategory(catId)` (`:204`) / `clearCategoryFilters()` (`:211`) — mutan `filterCategories`.
- `toggleFormCategory(catId)` (`:216`) — muta `formData.categories`.
- `handleOpenModal(song = null)` (`:225`) — precarga `formData` desde la canción (o defaults) y **asigna `_localId` fresco a cada sección** con `nextLocalId()`; setea `editingSong`; abre modal. Alta arranca con 1 sección `intro`; edición mapea `song.structure`.
- `handleCloseModal()` (`:255`) — cierra modal, limpia `editingSong` y **resetea `showCategoryDropdown`** (evita que el dropdown quede abierto al reabrir).
- `handleSubmit(e)` (`:261`) — valida `title.trim()`; **stripea `_localId`** (`structure.map(({_localId, ...rest}) => rest)`), setea `originalKey = formData.key` y conserva `lastUsed`; rutea a `updateSong(id, songData)` (edición) o `addSong(songData)` (alta); cierra modal.
- `handleDelete(song)` (`:281`) — abre `confirmModal`; en `onConfirm` (async) pone `loading`, hace **`await deleteSong(song.id)`** y ramifica: éxito → `successModal`, fallo → `errorModal`. Patrón anti fire-and-forget (PR #42/#59, landmines 19/32).
- `handleViewSong(song)` (`:313`) — abre viewer con `viewingKey = originalKey || key`.
- `getDefaultSectionLabel(type, existingSections, currentIndex)` (`:320`) — etiqueta por defecto; numera solo verse/chorus/bridge contando las del mismo tipo.
- `addStructureSection()` (`:347`) — agrega una sección `verse` con `_localId` nuevo; setea `newSectionIndex` para scroll/focus.
- `useEffect [newSectionIndex]` (`:360`) — scrollea a la sección nueva (`.structure-section`) y enfoca su input de acordes (setTimeout 50ms).
- `removeStructureSection(index)` (`:377`) — quita una sección por índice (la UI solo muestra la X si hay >1 sección).
- `updateStructureSection(index, field, value)` (`:384`) — edita un campo; si cambia `type`, recalcula `label` con `getDefaultSectionLabel`.
- `handleSectionDragEnd(event)` (`:119`) — reordena `formData.structure` con `arrayMove` matcheando por `_localId`.
- `generateSongPDF(song, key)` (`:401`, **async**) — importa `jspdf` on-demand, transpone la structure si `key !== originalKey`, dibuja título/artista/meta/secciones (acordes en courier con word-wrap, letra con `splitTextToSize`, paginación a A4), y `doc.save(...)`. Filename = título saneado + tono.

### Flujo de datos (store / Supabase)
- **Lectura:** `songs` viene de `useAppStore` (cargado en `initialize()` desde tabla `songs`, `convertSongFromDB`).
- **Alta:** `addSong(songData)` → `supabase.from('songs').insert(convertSongToDB + uuid).select().single()` (`appStore.js:566`); agrega al store.
- **Edición:** `updateSong(id, updates)` → **merge con snapshot del store ANTES del converter** y `supabase.from('songs').update(convertSongToDB(merged))` (`appStore.js:593`). Crítico: nunca pasar un partial directo al converter (landmine data-loss, regla #8).
- **Borrado:** `deleteSong(id)` → `supabase.from('songs').delete().eq('id', id)` (`appStore.js:629`); devuelve `true/false`.
- **Realtime:** cambios en la tabla `songs` entran por `mergeRealtimeChange` (`appStore.js:890`, key `songs`, `convertSongFromDB`, `lsKey 'appSongs'`) — parche en sitio + mirror en localStorage; la lista se re-renderiza sin refetch.
- **Sin RPC ni Edge Functions** en esta pantalla: todo pasa por PostgREST (`from('songs')`) bajo RLS. Export CSV/PDF son 100% cliente.

### Permisos (fuente de verdad: `currentMember`)
- **Ver / Exportar PDF:** todos los roles (botones "Ver" y "PDF" siempre visibles).
- **Nueva/Editar/Eliminar canción:** `isPastor || isLeader || currentMember?.editor` (`:606, :796, :894, :926`). El flag `editor` (columna `members.editor`, `convertMemberFromDB:121`) habilita a un `member` común a editar repertorio.
- **Exportar CSV:** solo `isPastor || isLeader` (`:584`).

### Categorías (array)
- Campo `categories` es array; hay retro-compat con `category` legacy single en todas las lecturas (`s.categories || (s.category ? [s.category] : [...])`). `convertSongToDB` escribe **ambos** `categories` (array) y `category` (primer elemento) para compatibilidad (`appStore.js:228-229`).

### Viewer y transposición (`:1211`)
- Modal viewer: `<select>` de `MUSICAL_KEYS` cambia `viewingKey`; si `≠ originalKey`, muestra `transposeSongStructure(structure, originalKey, viewingKey)` + banner amarillo "tono transportado". Botón "Exportar PDF" arranca desde `viewingKey`.

### Export PDF modal (`:1312`)
- `<select>` de tono → `exportSongKey`; botón "Descargar PDF" es **async con `await generateSongPDF` + try/catch real**, cierra el modal DESPUÉS de disparar la descarga (nunca setTimeout + catch síncrono — landmine 14, PR #38).

### Vista tabla (`:820`)
- Columna "Tono" es **read-only** (`<Badge>{song.key || song.originalKey}</Badge>`), no un `<select>`. Antes había un select bound a `exportKey` que mostraba "C" en todas las filas y las cambiaba todas juntas — corregido (comentario `:862-867`).

### Trampas y landmines
- **Landmine 22 — `_localId` NUNCA se persiste.** El editor asigna `_localId` efímero por sección para el DnD; `handleSubmit` (`:268`) lo stripea antes de `addSong/updateSong`. Si agregás campos al editor, mantené el strip o `_localId` se filtra a la DB. Un `<GripVertical>` sin `useSortable`+`DndContext` es puramente decorativo (era el bug original, PR #46) — testear el reorden en Chromium real, jsdom no simula el pointer drag.
- **Regla #8 / data-loss — jamás `supabase.from('songs').update(convertSongToDB(partial))`.** Siempre rutear por `updateSong` del store, que mergea con el snapshot antes del converter. Un partial directo (p. ej. solo `lastUsed`) haría que Postgres pise `structure/chords/tono/etc.` con defaults. Fue el incidente que borró letras al guardar órdenes (`appStore.js:595`).
- **Borrado debe `await` + ramificar (landmines 19/32).** `handleDelete` espera el bool de `deleteSong` y muestra `errorModal` si la base rechaza (p. ej. FK 23503). Las FKs de canciones ya son `song_key_history.song_id → CASCADE` (PR #59); no volver a NO ACTION o el borrado de canciones con historial de tono rompe.
- **`showCategoryDropdown` es un único estado compartido** entre el dropdown de filtro (header) y el del formulario (modal). Si ambos coexistieran abiertos se pisan; `handleCloseModal` lo resetea al cerrar el modal (parte del "reset de dropdowns", contexto PR #32 sobre reseteo de estado fuera de `formData`).
- **`categoryConfig` usa clave `adoraci` mientras el id real es `adoracion`.** Al pintar badges por `categoryConfig[catId]`, una canción con categoría `'adoracion'` cae en `undefined` y no muestra label/color (bug latente a verificar). El resto de claves sí coincide con `SONG_CATEGORIES`.
- **Motor de transposición case-insensitive (landmine 15).** `transposeChordToken` acepta raíz `[A-Ga-g]` y la pasa a mayúscula; typos como `c9` (presentes en datos reales) igual transponen. Cubierto por `src/stores/transpose.test.js`. Si tocás el regex, mantené el case-insensitive.
- **PDF export es async (landmine 14).** Nunca envolver `generateSongPDF` en try/catch síncrono ni dispararla en `setTimeout`; el rejection se traga y el usuario ve "no pasa nada". Generar ANTES de cerrar el modal (`:1321-1343`).
- **Filtro de categorías es AND, no OR** (`:188-193`): la canción debe tener todas las categorías seleccionadas. Fácil de confundir con "cualquiera de".
- **iOS/inputs (landmine 23, global en `index.css`):** los `<input>`/`<select>` de este form heredan el `min-height:50px` y `appearance:none` de botones; no fijar alturas chicas propias que rompan el fix de WebKit.

---

## Página Practica — Ensayómetro (`src/pages/Practica.jsx`)

Registro PERSONAL de práctica por orden. Ruta `/practica/:orderId`, cargada lazy en `App.jsx`, título "Mi Ensayo". Glosario del ministerio (`Practica.jsx:27-33`): **ensamble** = encuentro de toda la banda (lo que se programa en el orden); **ensayo** = práctica personal previa de cada músico (esta pantalla). Datos privados por usuario (RLS `user_id = auth.uid()`) y efímeros (viven mientras el orden está programado; el cron `practice-cleanup` los borra). Cubre las 3 fases del Ensayómetro en un solo componente.

### Constantes y helpers de módulo

- `DIFFICULTIES` (`:35-39`) — 3 opciones de dificultad percibida (`easy`/`medium`/`hard`) con su clase Tailwind al estar seleccionada (verde/ámbar/rojo).
- `MASTERY_CHECKS` (`:41-45`) — los 3 checks de dominio: `knowsLyrics` (Mic2), `knowsStructure` (ListMusic), `knowsArrangements` (Sparkles).
- `milestonesOf(log) → 0..4` (`:48-56`) — cuenta los 4 hitos de una canción: ≥1 pasada + los 3 checks booleanos. **Debe mantenerse en sincronía con el progreso server-side de `send_practice_reminders()`** (landmine 27).
- `emptyLog(orderId, songId) → log` (`:58-67`) — log en cero: `timesPracticed:0`, 3 checks `false`, `difficulty:null`, `lastPracticedAt:null`. Se usa cuando aún no hay fila para esa canción.
- `beatsPerBarOf(compass) → n` (`:112-115`) — parsea el numerador de `song.compass` (ej. "4/4"→4); default 4 si inválido o fuera de 1..12. Alimenta el acento del metrónomo.
- `encouragement(percent) → string` (`:168-173`) — mensaje de ánimo por tramo (0 / <50 / <100 / 100).

### `ProgressRing({ percent })` (`:71-105`)

Anillo SVG de progreso con degradé aurora (`#818cf8`→`#a78bfa`→`#60a5fa`, id `ensayometro-grad`). R=52, circunferencia `C=2πR`; el `strokeDashoffset = C - C*percent/100` transiciona con CSS (`stroke-dashoffset 0.6s ease`, `:96`) → cada hito "avanza" el anillo. Rotado −90° para arrancar arriba. Muestra `{percent}%` centrado. Componente puro sin estado.

### `useMetronome()` hook (F3, `:117-166`)

Metrónomo Web Audio sin dependencias. Devuelve `{ active, start, stop }`.
- Estado/refs: `active` (useState, `{songId,bpm}` o `null` — cuál está sonando), `ctxRef` (AudioContext perezoso), `timerRef` (setInterval scheduler), `nextBeatRef` (tiempo del próximo beat en el reloj del ctx), `beatCountRef` (contador para el acento).
- `start(songId, bpm, beatsPerBar)` (`:130-157`) — para el anterior; crea el `AudioContext` **recién en el primer tap** (`ctxRef.current || new Ctx()`, `:135`) por la política de autoplay móvil; `resume()` si está suspendido. Loop `setInterval(30ms)` con **lookahead 0.15s** (`:141`): agenda osciladores por adelantado en el reloj del ctx. Acento en el beat 1 del compás (`beatCountRef % beatsPerBar === 0`, `:142`) → 1568 Hz / gain 0.5 vs 1047 Hz / gain 0.28 el resto; envolvente con `exponentialRampToValueAtTime` (beep de ~80ms). Setea `active={songId,bpm}`.
- `stop()` (`:124-128`) — `clearInterval` + `active=null`.
- Cleanup al desmontar (`:160-163`) — `clearInterval` + `ctx.close()` (silencio garantizado al salir de la pantalla).
- **Un solo metrónomo activo**: `start` llama `stop()` primero; en el render, `metronome.active?.songId === songRef.songId` decide si un botón está "ticking".

### `Practica` componente (`:175-660`)

Estado (`useState`):
- `logs` (`:184`) — mapa `songId → log completo` (siempre completo, apto para el upsert directo).
- `logsLoaded` (`:185`) — gate; muestra `<PageLoader/>` hasta que cargan los logs.
- `saveState` (`:186`) — `idle | saving | saved`, alimenta el indicador de autoguardado.
- `viewerSong` (`:187`) — `{song, orderKey}` del modal de acordes, o `null`.
- `alarmEnabled` (`:190`) — `null` mientras carga (toggle deshabilitado) → `true`/`false`.
- `celebrating` (`:211`) — flag del festejo 100%.

Refs: `saveTimers` (`:229`, timers de debounce por canción `{timer, flush}`), `latestLogs` (`:230`, espejo de `logs` para leer el valor fresco en el flush sin recrear callbacks), `prevPercentRef` (`:212`, percent anterior para detectar la transición a 100%).

Derivados: `order = orders.find(id===orderId)` (`:180`), `band = getBandById(order.bandId)` (`:181`), `uniqueSongIds` (`:299-302`, songIds distintos del orden), `percent` (`:304-309`, `done/(N*4)*100` redondeado), `totalPasses` (`:311-314`, suma de pasadas).

Del store (`:178`): `orders`, `loading`, `getSongById`, `getBandById`, `getMemberById`, `fetchPracticeLogs`, `upsertPracticeLog`, `fetchPracticeAlarm`, `setPracticeAlarm`. Import directo `transposeSongStructure` (`:19`).

#### Flujo de datos

- **Carga de logs** (`:233-249`): al montar/cambiar `orderId` → resetea `logs={}`+`logsLoaded=false`, luego `fetchPracticeLogs(orderId)` (SELECT `practice_logs` por `order_id`) → arma el mapa. El reset evita mostrar un log de OTRO orden con la misma canción (guard `alive` anti-race).
- **Autoguardado con debounce** (`scheduleSave`, `:262-280`): por canción, `setTimeout(flush, 500ms)`. `flush` lee `latestLogs.current[songId]`, marca `saving`, `await upsertPracticeLog(log)` (upsert `onConflict user_id,order_id,song_id`) → conserva el `id` devuelto sin pisar clics nuevos (`:273`), marca `saved` (o `idle` si falla).
- **Flush al desmontar** (`:252-260`): recorre `saveTimers`, `clearTimeout` + dispara los `flush()` pendientes (no espera el debounce).
- `updateLog(songId, patch)` (`:282-288`) — mergea el patch sobre el log actual (o `emptyLog`) y agenda guardado. Único punto de escritura de checks/dificultad.
- `addPractice(songId, delta)` (`:290-297`) — pasadas `max(0, actual+delta)`; si `delta>0` sella `lastPracticedAt=now`. Usado por "La practiqué" (+1) y el botón restar (−1, disabled en 0).

#### F2 — Alarma de ensayo (`:192-204`, `:417-443`)

- `useEffect` inicial (`:192-196`): `fetchPracticeAlarm()` (SELECT `practice_alarms.enabled` con `maybeSingle`; sin fila = `false`) → setea `alarmEnabled`. Guard `alive`.
- `toggleAlarm` (`:198-204`): **optimista** — setea `!alarmEnabled` ya, `await setPracticeAlarm(next)` (upsert `onConflict user_id`); **si devuelve `null` (error) revierte** al valor anterior. No hace nada si aún carga (`alarmEnabled===null`).
- UI: switch con el patrón iOS-safe `label + input.sr-only.peer + dos span (track/knob)` (landmine 23), deshabilitado y semi-opaco mientras `alarmEnabled===null`. Preferencia GLOBAL del usuario (no por orden); el push diario 18:00 ART lo manda el cron server-side sólo si hay pendientes.

#### F3 — Festejo 100% (`:209-224`, `:316-327`, `:344-370`)

- `useEffect` de detección (`:317-327`): sólo con `logsLoaded`; compara `prevPercentRef.current` con `percent`, actualiza el ref, y **dispara sólo en la transición en vivo `prev<100 → percent===100`** (`:321`). Entrar a una pantalla ya al 100% NO festeja (prev arranca `null`). Auto-oculta a los 4200 ms.
- `confetti` (`useMemo`, `:213-224`): 44 piezas con `left/color/delay/duration/drift/size` deterministas; recomputa sólo al cambiar `celebrating`.
- Overlay (`:345-370`): `fixed inset-0 z-50 pointer-events-none`, `data-testid="celebration"`, cada pieza `animate-confetti-fall` con `--confetti-drift` inline; card "🏆 ¡Orden dominado!".

#### Render por canción (`:447-600`) y metrónomo en UI (`:547-575`)

Itera `order.songs` (respeta duplicados vía `key `songId-index``). Por canción: cabecera (título, artista, `Tono: {songRef.key}`, `BPM`, director vía `getMemberById(songRef.directorId)`); contador de pasadas; 3 checks de dominio (`MASTERY_CHECKS`, toggle vía `updateLog`); dificultad (`DIFFICULTIES`, click en la activa la deselecciona → `null`); metrónomo (sólo si `song.bpm`): toggla `metronome.start(songId, Number(bpm), beatsPerBarOf(song.compass))` / `stop()`, punto `animate-metronome-beat` con `animationDuration = 60/bpm` inline; botón "Acordes" (abre viewer); link YouTube si `song.youtubeUrl`. `done = milestonesOf(log)===4` pinta la Card verde y ✓ en el índice. Estado vacío si `order.songs.length===0` (`:602-608`).

#### Viewer de acordes (`:611-657`)

`<Modal size="xl">` abierto por `viewerSong`. Transpone al tono del orden: si `orderKey && orderKey !== originalKey` → `transposeSongStructure(song.structure, originalKey, orderKey)`, si no usa la estructura original. `originalKey = song.originalKey || song.key`. Muestra badges (tono del orden, original si difiere, compás, BPM) y cada `section` (`label`, `chords` mono violeta, `content` con `whitespace-pre-line`). Mensaje si no hay acordes.

#### Redirect por orden inexistente (`:329-336`)

Si `!order`: mientras `loading || orders.length===0` → `<PageLoader/>` (espera al store); ya cargado y ausente (borrado/id inválido) → `<Navigate to="/ordenes" replace/>`. Luego, si `!logsLoaded` → `<PageLoader/>`.

### Keyframes en `src/index.css` (`:257-283`)

- `@keyframes confetti-fall` (`:260-269`) — de `translate3d(0,-12vh) rotate(0)` a `translate3d(calc(var(--confetti-drift,0)*1px), 112vh) rotate(720deg)`, opacidad 1→0.65. El drift horizontal por pieza llega vía la custom property `--confetti-drift` (px), seteada inline en `Practica.jsx`. Clase `.animate-confetti-fall` = `confetti-fall 2.8s linear forwards`.
- `@keyframes metronome-beat` (`:276-279`) — pulso `scale(0.6)→scale(1.25)→scale(0.6)`, opacidad 0.5→1→0.5. Clase `.animate-metronome-beat` = `metronome-beat 0.5s ease-out infinite`, pero **la duración real se sobrescribe inline** a `60/bpm s` (`:569`) para latir al tempo.

### Flujo de datos (resumen tablas/RPC)

- Tabla `practice_logs`: SELECT por `order_id` (`fetchPracticeLogs`), UPSERT `onConflict user_id,order_id,song_id` (`upsertPracticeLog`). RLS owner-only; `user_id` lo pone el DEFAULT `auth.uid()`, el cliente NUNCA lo manda. Converters con patrón anti data-loss (`appStore.js:272-282`).
- Tabla `practice_alarms`: SELECT `enabled` `maybeSingle` (`fetchPracticeAlarm`), UPSERT `onConflict user_id` (`setPracticeAlarm`). Una fila por usuario, RLS owner-only.
- **Sin realtime, sin localStorage, deliberadamente FUERA de `initialize()`** — dato personal por-orden que sólo usa esta pantalla.
- Consumo server-side (no en este archivo): cron `practice-reminders` (`send_practice_reminders()`, push 18:00 ART) y cron `practice-cleanup` (`cleanup_practice_logs()`, borra logs de órdenes no-programados con fecha < hoy−7).

### Trampas y landmines

- **Landmine 25 (`practice_logs` owner-only):** el cliente NUNCA escribe `user_id` (DEFAULT `auth.uid()` + WITH CHECK). `upsertPracticeLog` exige el objeto COMPLETO — por eso `logs[songId]` siempre guarda el log entero (`updateLog` mergea sobre `emptyLog`/actual). No agregar SELECT de práctica ajena "para el pastor": es herramienta personal, no de auditoría.
- **Landmine 26 (glosario):** "ensamble" = evento de la banda (programado en el orden), "ensayo" = práctica personal (esta pantalla). No renombrar al revés en copy nuevo.
- **Landmine 27 (dedup + progreso):** el dedup del push matchea por TÍTULO (`'🎸 Tu ensayo te espera'`); el progreso server-side replica los 4 hitos de `milestonesOf` contando SOLO canciones vigentes del orden. Si tocás `milestonesOf`/`percent`, mantené sincronía con `send_practice_reminders()`.
- **Landmine 28 (`practice_alarms` opt-in):** sin fila = apagada; no crear filas por default (sería spam masivo). El toggle optimista DEBE revertir si `setPracticeAlarm` devuelve `null` (`:203`).
- **Landmine 29 (metrónomo):** el `AudioContext` se crea recién en el primer tap (autoplay móvil: nace de un gesto; no en un `useEffect` de montaje o iOS queda mudo). Beeps agendados con lookahead en el reloj del ctx, NUNCA directo en el tick del `setInterval` (drift audible). Para testear en Chromium headless: `--autoplay-policy=no-user-gesture-required` + instrumentar `createOscillator`.
- **Landmine 30 (festejo 100%):** dispara sólo en la transición `prevPercentRef` `<100→100`; entrar ya al 100% no re-festeja. Si tocás el cálculo de `percent`, cuidá no re-disparar en carga (por eso el gate `logsLoaded` y el `prev !== null`).
- **Reset al cambiar de `:orderId`:** el mismo componente sirve distintos órdenes; sin el reset de `logs`/`logsLoaded` (`:239-240`), un log de otro orden con la misma canción se mostraría como propio. Guards `alive` en ambos fetch anti-race.
- **Flush al desmontar:** los guardados pendientes con debounce se disparan en el cleanup (`:252-260`); salir rápido de la pantalla no pierde el último cambio.
- **Switch iOS-safe (landmine 23):** el toggle de alarma NO es un `<button>` sino `label + input.sr-only.peer + span`; no volver a un `<button>` pill o iOS lo deforma.

---

## Páginas Bandas y Miembros

Dos pantallas CRUD del panel: `src/pages/Bandas.jsx` (bandas de adoración) y `src/pages/Miembros.jsx` (personas del ministerio). Ambas son componentes de página con estado local + modales `ConfirmModal/SuccessModal/ErrorModal`, gateadas por rol vía `useCurrentRole()`. Constantes de dominio (`MEETING_TYPES`, `MEMBER_ROLES`, `INSTRUMENTS`) viven en `src/stores/appStore.js:963-980`.

### `Bandas` — `src/pages/Bandas.jsx:19`

CRUD de bandas + asignación de miembros. Roles: pastor y líder pueden **crear/editar** (botón "Crear Banda"), pero **sólo pastor** ve Editar/Eliminar dentro del panel expandido (`Bandas.jsx:234`).

**Estado (useState):**
- `isModalOpen`, `editingBand` (`null`=crear / banda=editar), `expandedBand` (id de la card abierta) — `Bandas.jsx:26-28`.
- `formData` `{name, meetingType, meetingDay, meetingTime, members[]}` — default `culto_general`/`domingo`/`20:00` (`Bandas.jsx:30-36`).
- `confirmModal`/`successModal`/`errorModal` — objetos con `isOpen/title/message/...` (`Bandas.jsx:39-58`); `confirmModal` incluye `loading`.

**Store (Zustand `useAppStore`, `Bandas.jsx:21`):** `bands, members, orders, addBand, updateBand, deleteBand, getBandMembers`. Rol vía `useCurrentRole()`.

**Funciones/handlers:**
- `activeBands` — `bands.filter(active).sort(compareBandsByCalendar)` → cards en **orden calendario** (lunes→domingo), no orden de carga DB (`Bandas.jsx:62`).
- `getBandSongCount(bandId)` → `orders.filter(o => o.bandId === bandId).length`; se muestra como "N servicios" (`Bandas.jsx:64`).
- `getMeetingTypeLabel(typeId)` → busca en `MEETING_TYPES`, fallback al id (`Bandas.jsx:68`).
- `handleOpenModal(band=null)` — precarga `formData` en edición (copia `[...band.members]`) o resetea en alta; abre modal (`Bandas.jsx:73`). **Los botones "Crear Banda" llaman `() => handleOpenModal()`** (envuelto), no el handler directo — landmine 12.
- `handleCloseModal()` — cierra y limpia `editingBand` (`Bandas.jsx:96`).
- `handleSubmit(e)` — valida `name.trim()`; rutea a `updateBand(id, formData)` o `addBand(formData)`; **NO es async** (`Bandas.jsx:101`).
- `handleDelete(band)` — abre `confirmModal`; en `onConfirm` (async) setea `loading`, `await deleteBand(band.id)`, y ramifica SuccessModal/ErrorModal según el booleano (`Bandas.jsx:113`). Patrón anti fire-and-forget (landmine 32).
- `toggleMemberSelection(memberId)` — agrega/quita del `formData.members` en el picker (`Bandas.jsx:145`).
- `availableMembers = members.filter(active)` — universo del picker (`Bandas.jsx:154`).

**Render clave:**
- Card colapsable: click togglea `expandedBand`; día vía `dayPluralLabels[meetingDay] || dayLabels[meetingDay]` (`Bandas.jsx:196`), hora, badge de tipo, avatares (`getBandMembers`, hasta 4 + "+N"), badge "N servicios".
- Panel expandido: acciones pastor con `e.stopPropagation()` (para no togglear el colapso) + grid de miembros con instrumentos.
- Modal crear/editar: `Input` nombre; selects día (`dayLabels`), hora (`type=time`), tipo (`MEETING_TYPES`); grid de miembros toggleables. Submit **deshabilitado** si `!name.trim() || members.length === 0` (`Bandas.jsx:320`) — una banda exige ≥1 miembro.

**Flujo de datos:** `addBand`→INSERT `bands` (uuid client-side, `convertBandToDB`) `appStore.js:485`; `updateBand`→merge snapshot + UPDATE `bands` `appStore.js:512`; `deleteBand`→DELETE `bands` devuelve true/false `appStore.js:544`. `getBandMembers` filtra `members` activos cuyo id está en `band.members` (`appStore.js:835`). Sin llamadas realtime ni edge functions propias.

### `Miembros` — `src/pages/Miembros.jsx:41`

CRUD de miembros con **visibilidad por rol** y operaciones privilegiadas vía edge functions `admin-*`. Un `member` plano nunca llega (route guard `<MembersOnlyRoles>` en `App.jsx` lo redirige); acá `isPastor` distingue pastor (ve/actúa todo) de líder (vista recortada, sin acciones).

**Estado (useState):**
- Filtros/orden/vista: `searchTerm`, `filterRole` ('all'), `filterActive` ('all'/'true'/'false'), `showFilters`, `selectedInstruments[]`, `sortBy` ('name_asc'), `viewMode` ('cards'/'table') — `Miembros.jsx:52-60`.
- Modal alta/edición: `isModalOpen`, `editingMember`, `formData` (`Miembros.jsx:62-74`) con `role, editor, instruments[], active, password, birthdate, pastor_area, leader_of` — **`avatar_url` NO se incluye** a propósito (el store lo preserva, `Miembros.jsx:146`).
- Post-creación: `showPasswordModal`, `createdMemberData` (muestra la pass generada una sola vez) — `Miembros.jsx:77-78`.
- Reset pass: `showResetPasswordModal`, `memberToReset`, `newPassword` — `Miembros.jsx:81-83`.
- `confirmModal`/`successModal`/`errorModal` — `Miembros.jsx:86-105`.

**Store/auth:** `members, addMember, updateMember, deleteMember, toggleMemberActive` (`useAppStore`) + `user` (`useAuthStore`) + `useCurrentRole()`. `useSearchParams` para `?edit=self`.

**Funciones/handlers:**
- `formatDateLocal(dateStr)` (módulo, `Miembros.jsx:22`) — parsea `YYYY-MM-DD` a `Date` local **sin corrimiento de TZ** (evita off-by-one en cumpleaños/fechas).
- `roleConfig` (`Miembros.jsx:35`) — label+color+bg por rol para badges.
- `filteredMembers` (`useMemo`, `Miembros.jsx:107`) — filtra por búsqueda (nombre/email/instrumento), rol, activo, instrumentos; luego ordena por `sortBy` (name_asc/desc, role, active), `localeCompare('es')`.
- `handleOpenModal(member=null)` — precarga o resetea `formData`; `password:''` siempre (`Miembros.jsx:132`).
- `useEffect ?edit=self` (`Miembros.jsx:171`) — si el query param es `self`, busca `members.find(m => m.userId === user.id)` y abre su edición, luego limpia el param. Deps intencionalmente sin `handleOpenModal` (eslint-disable).
- `handleSubmit(e)` **async** (`Miembros.jsx:193`): en edición `await updateMember(id, formData)` y **si el editado es el usuario logueado** llama `useAuthStore.getState().refreshProfile()` para propagar rol/permisos al instante (`Miembros.jsx:204`); en alta `await addMember(formData)` y si hay `result` muestra `showPasswordModal` con la contraseña.
- `toggleInstrument(instrument)` — arma `formData.instruments` (`Miembros.jsx:224`).
- `handleDelete(memberId, memberName)` — **soft delete** (desactivar): confirm→`await deleteMember(id, false)`, ramifica Success/Error (`Miembros.jsx:234`).
- `handlePermanentlyDelete(memberId, memberName)` — **hard delete** (sólo pastor, tipo `danger`): confirm→`await deleteMember(id, true)` (`Miembros.jsx:265`).
- `handleResetPassword(member)` — abre modal de reset (`Miembros.jsx:295`).
- `handleSaveNewPassword()` async — resuelve `userId = memberToReset.userId || .user_id`; si falta, ErrorModal; si no, `import('../lib/supabase')` + `callAdminFunction('admin-reset-password', {userId, newPassword})`; ramifica (`Miembros.jsx:301`).
- `handleToggleActive(memberId)` → `toggleMemberActive(id)` (`Miembros.jsx:337`).
- Export CSV (pastor, `Miembros.jsx:372`) — `toCSV(filteredMembers, cols)` + `downloadCSV('miembros-YYYY-MM-DD.csv')`; exporta **la lista ya filtrada**.

**Visibilidad por rol (crítico):**
- Header: botones "Exportar CSV" y "Agregar Miembro" sólo `isPastor` (`Miembros.jsx:372,396`). Toggle cards/tabla y búsqueda: todos.
- Cards (`Miembros.jsx:557`): acciones pastor (reset pass/editar/eliminar) con `opacity-100 lg:opacity-0 lg:group-hover:opacity-100` — **visibles al tacto en móvil**, hover sólo desktop (landmine 3). Contacto+campos privados (email/teléfono/pastor_area/leader_of/birthdate) **sólo pastor** (`Miembros.jsx:610`); líder ve nombre+rol+instrumentos. Toggle activo/inactivo sólo pastor.
- Tabla (`Miembros.jsx:683`): columnas Email/Teléfono/Pastor/Líder/Estado/Acciones sólo pastor; responsive con `hidden md/lg/xl:table-cell`. En tabla el botón papelera hace **soft delete** (`handleDelete`), en cards hace **hard delete** (`handlePermanentlyDelete`).
- Switch "Permiso de Editor" sólo pastor y sólo cuando `role === 'member'` (`Miembros.jsx:926`).
- Submit del modal deshabilitado si `!name.trim() || (!editingMember && email && !password)` — miembro nuevo con email exige contraseña (`Miembros.jsx:820`).

**Flujo de datos:**
- `addMember`→edge function **`admin-create-member`** (NUNCA SQL crudo — evita "Database error querying schema"); devuelve `{member, generatedPassword}` y agrega al store con `convertMemberFromDB` (`appStore.js:355`).
- `updateMember`→merge snapshot + UPDATE `members` (`convertMemberToDB`) + actualiza cache `localStorage 'appMembers'` (`appStore.js:390`).
- `deleteMember(id, permanent)`→ si `permanent`: edge function **`admin-delete-member`** (borra auth user + row atómico, verifica rol pastor server-side); si no: UPDATE `members SET active=false` (`appStore.js:437`).
- `toggleMemberActive`→ delega en `updateMember` con `active` invertido (`appStore.js:476`).
- `admin-reset-password` vía `callAdminFunction` (import dinámico en la página).
- Sin realtime propio en estas páginas (los datos llegan por `initialize()`/realtime del store).

### Trampas y landmines

- **Landmine 32 (borrado await + ramificar):** todo handler de borrado DEBE `await deleteBand/deleteMember` y ramificar Success/Error. Fire-and-forget + "eliminada" = mentira si la DB rechaza (FK 23503). `deleteBand`/`deleteMember` devuelven `true/false`; `Bandas.jsx:126` y `Miembros.jsx:245,276` ya lo hacen. FKs relevantes: `orders.band_id → SET NULL` (por eso el mensaje "las órdenes permanecerán", `Bandas.jsx:117`); `song_key_history.{song_id,member_id} → CASCADE`.
- **Landmine 33 (plural de días):** NUNCA `${label}s` (daba "Martess"/"Juevess"). Usar `dayPluralLabels`/`dayLabels` de `src/lib/days.js`; el orden de cards usa `compareBandsByCalendar` (lunes primero). Tests en `days.test.js`.
- **Landmine 12 (handleOpenModal):** los botones "Crear Banda"/"Agregar Miembro" deben llamar `() => handleOpenModal()` envuelto; el handler directo recibiría el evento React como `band`/`member` y abriría en modo edición con basura.
- **Landmine 3 (acciones touch):** nunca esconder acciones con `opacity-0 group-hover` sin `lg:` — en touch no hay hover. Las cards de Miembros usan `opacity-100 lg:opacity-0 lg:group-hover:opacity-100` (`Miembros.jsx:581`).
- **Regla #6 / crear miembro:** alta SIEMPRE por `admin-create-member` (misma puerta que el UI), nunca INSERT SQL crudo a `auth.users` (rompe `auth.identities` + tokens). Borrado permanente y reset pass también por edge functions `admin-*` (service_role sólo server-side, regla #6).
- **DATA-LOSS LANDMINE (regla #8):** `Bandas.handleSubmit`/`Miembros.handleSubmit` rutean por `updateBand`/`updateMember` del store, que **mergean el partial sobre el snapshot** antes de `convertXToDB`. NUNCA llamar `supabase.from('members'/'bands').update(convertXToDB(partial))` directo — sobrescribe la fila con defaults. En Miembros, `formData` omite `avatar_url` deliberadamente para que el store preserve el existente (`Miembros.jsx:146`).
- **`toggleMemberActive` reenvía el objeto completo** (`{...member, active: !active}`) a `updateMember` (`appStore.js:479`) — depende del merge para no perder campos.
- **Refresh de perfil propio:** al editar el usuario logueado hay que `refreshProfile()` o el rol/permisos no se actualizan en el resto de la app hasta recargar (`Miembros.jsx:204`).
- **Contraseña generada se muestra una sola vez** (`showPasswordModal`): al cerrar no se puede recuperar (aviso explícito, `Miembros.jsx:1033`); reset genera una nueva vía `admin-reset-password`.
- **Trampa de QA (roles inactivos):** hay filas viejas `role='pastor'` con `active=false`; `auth_role()` exige `active=true`, así que impersonarlas hace que TODA la RLS dé false y los DELETE/UPDATE matcheen 0 filas sin error. Al testear borrado/edición transaccional, elegir siempre usuario `AND active=true`.
- **Banda exige ≥1 miembro** (submit disabled, `Bandas.jsx:320`); miembro nuevo con email exige contraseña (`Miembros.jsx:820`).

---

## Páginas: Dashboard, Login, Solicitudes, Comunicaciones

Cuatro páginas de nivel-ruta (`src/pages/`). Dashboard es la home leída por todos; Login es la puerta pública (auth + registro anónimo); Solicitudes y Comunicaciones son pantallas **solo-pastor** (gate en cliente + RLS/EF en servidor). Todas usan `useDocumentTitle(...)` para el título del tab.

---

### `Dashboard.jsx` — Inicio (home de todos los roles)

Componente `Dashboard` (`Dashboard.jsx:35`). Sin props. Panel de cards de estadística (links por permiso), card de ensamble del día, y 4 paneles de resumen. Puramente lectura del store; no muta nada ni toca Supabase directo.

**Estado / fuentes de datos:**
- `useAppStore()` (`Dashboard.jsx:37`) → `members, bands, songs, orders, getUnusedSongs`. No usa `useState` local (todo derivado por render).
- `useCurrentRole()` (`Dashboard.jsx:38`) → rol efectivo (`member`/`leader`/`pastor`), resuelto por email desde la fila `members`, con fallback a `authStore.profile.role` (`useCurrentMember.js:24`).

**Derivaciones clave:**
- `activeMembers` = `members.filter(m => m.active).length` (`:40`).
- `upcomingOrders` = `orders.filter(o => o.status === 'scheduled')` (`:41`) — base del card Órdenes y del panel "Próximos Servicios".
- `unusedSongs` = `getUnusedSongs(4)` (`:42`) → del store: canciones sin `lastUsed` o con `lastUsed` < hace 4 semanas (`appStore.js:857`).
- `recentSongs` = `songs.slice(0, 4)` (`:43`).

**Card de ensamble del día** (`:45-97`): calcula la wall-clock ART vía `toLocaleString('en-US', {timeZone: 'America/Argentina/Buenos_Aires'})` (ART es UTC-3, sin DST) → `todayART` (YYYY-MM-DD) + `artHour`. `todaysRehearsal` = primer order cuyo `rehearsalDate.slice(0,10) === todayART` (`:53`). Se muestra (`showRehearsalCard`) solo si hay ensamble hoy **y** `8 <= artHour < 23` (`:56`). Es un `<Link to={/ordenes?order=<id>}>` full-width ámbar; copy "¡Hoy tenés ensamble!" (glosario: **ensamble** = encuentro de banda, no "ensayo", landmine 26).

**Stats grid (cards = accesos directos por permiso)** (`:68-126`): array `stats` con `{label, value, icon, color, bg, to, roles?}`. El card **Órdenes** cuenta `upcomingOrders.length` (SOLO scheduled), NO `orders.length` (landmine 24). Miembros lleva `roles: ['pastor','leader']`; los otros 3 no tienen `roles` (abiertos). Render: `canAccess = !stat.roles || stat.roles.includes(role)` (`:102`); si accesible → `<Link to={stat.to}>` envolviendo `<Card>`; si no → `<Card>` plano informativo (`:114-124`). Espeja el criterio de nav/route-guards de `App.jsx`.

**Paneles inferiores:** "Canciones Recientes" (`recentSongs` + badge `unusedSongs.length`), "Próximos Servicios" (`upcomingOrders.slice(0,3)`, resuelve `band` por `order.bandId`, formatea fecha es-ES), "Resumen Rápido" (completados = `orders.filter(o=>o.status==='completed').length` + `unusedSongs.length`), "Miembros Activos" (lista scrolleable con `Avatar`, `getInstrumentIcon`, badge por rol).

- `getInstrumentIcon(instrument)` (`:26`) — helper local; matchea substring lower-case del instrumento → ícono lucide (Guitar/Mic2/Drum/Piano), default `User`.

---

### `Login.jsx` — Iniciar sesión + registro público anónimo

Ruta pública. Exporta `Login` (`:10`); define dos componentes locales no exportados: `RegisterModal` (`:234`) e `Input` (`:445`).

**`Login` — estado (`:12-17`):** `email, password, showPassword, rememberMe, showRegisterModal, showSuccessModal` (todos `useState`).
- Auth desde `useAuthStore` (selectores individuales, `:19-23`): `login, loading, error, clearError, user`.
- `useNavigate()` para redirigir tras login.

**Flujo:**
- Si `user` ya existe → `<Navigate to="/" replace />` (`:46`) (bloquea la pantalla para logueados).
- `useEffect` de montaje (`:29-44`): borra `rememberedPassword` legacy de localStorage (nunca se guarda pass), hidrata `email` desde `rememberedEmail` si `rememberMe==='true'`. **Solo recuerda email, jamás password** (nota de seguridad explícita).
- `handleSubmit` (`:48`): `clearError()`, valida email+password no vacíos, persiste/borra `rememberedEmail`+`rememberMe` en localStorage, `await login(email, password)` → si ok `navigate('/')`. El `error` se pinta desde el store (`:162`).
- `handleOpenRegister` (`:74`) abre `RegisterModal`; `handleRegistrationSuccess` (`:78`) cierra el modal de registro y abre `showSuccessModal`.

**UI:** logos CAF/AdorAPP, form email/password (con toggle `showPassword`), switch custom "Recordar mi email", botón submit con spinner, botón "Quiero registrarme". Modal de éxito post-solicitud (`:207`).

**`RegisterModal({ isOpen, onClose, onSuccess })` (`:234`)** — solicitud de registro anónima.
- Estado: `formData` (`name, email, phone, birthdate, pastor_area, leader_of, instruments[]`), `loading`, `error` (`:235-245`).
- `handleChange` (`:247`) genérico por `name`; `toggleInstrument` (`:252`) togglea del array `instruments` (usa `INSTRUMENTS` de appStore, `:396`).
- `handleSubmit` (`:261`): valida name+email obligatorios; **import dinámico** `../lib/supabase` (`:277`); INSERT anónimo en **`pending_registrations`** (`:282-293`) con `status:'pending'`, email normalizado a lower-case, sin password (el pastor la genera al aprobar).
  - **Manejo de errores del INSERT:** `code === '23505'` → "Ya existe una solicitud/cuenta con ese email"; **`code === 'PT429'`** → mensaje de rate-limit "Estás enviando solicitudes muy seguido…" (`:299-301`); otro → genérico. En éxito llama `onSuccess()`.
- **Data flow servidor:** el INSERT lo permite RLS `anon` (único punto de escritura anónima por diseño); dispara trigger `notify_on_pending_registration_insert` (push a pastores) y pasa por el trigger `BEFORE INSERT rate_limit_pending_registrations()` que lanza HTTP 429 con `ERRCODE='PT429'` (máx 10/min + backstop 200 pendientes; landmine 16).

- `Input({label,name,type,placeholder,value,onChange,required})` (`:445`) — input estilizado reutilizable interno del modal.

---

### `Solicitudes.jsx` — aprobar/rechazar registros pendientes (solo pastor)

Exporta `Solicitudes` (`:31`). Sin props. Gate: si `profile?.role !== 'pastor'` → pantalla "Acceso Restringido" (`:210-220`).

**Estado (`:33-72`):**
- `useAuthStore` → `profile`; `useAppStore` → `initialize` (se re-llama tras aprobar para refrescar el store global).
- UI: `searchTerm`, `filterStatus` (default `'pending'`), `pendingRequests[]`, `loading` (init `true`), `showFilters`, `viewMode` (`'cards'`/`'table'`).
- Aprobación: `selectedRequest`, `showApproveModal`, `selectedRole` (default `'member'`), `generatedPassword`, `createdMember`, `showPasswordReveal`.
- Modales genéricos: `confirmModal`, `successModal`, `errorModal` (objetos `{isOpen,title,message,...}`).

**Carga de datos (`:75-102`):** `useEffect` de montaje: SELECT `pending_registrations.*` order `created_at desc` → `pendingRequests`. **Polling cada 30 s** (`setInterval(loadRequests, 30000)`, cleanup al desmontar). Es polling, NO realtime.
- `filteredRequests` (`useMemo`, `:104`): filtra por `searchTerm` (nombre/email) y `filterStatus` (`all` o match de `status`).

**Acciones:**
- `generateRandomPassword()` (`:117`) — 12 chars alfanuméricos sin ambiguos, vía `crypto.getRandomValues` (entropía sin sesgo).
- `handleApprove(request)` (`:126`): setea `selectedRequest`, rol `member`, genera password, abre `showApproveModal`.
- `handleConfirmApproval` (`:133`): valida password ≥6; **`callAdminFunction('admin-approve-registration', {requestId, role, password})`** (`:146`) → EF admin (no service_role en cliente). En éxito: saca la request del array, cierra modales, muestra `showPasswordReveal` con credenciales (email+password, visible **una sola vez**), y `await initialize()` para traer el nuevo miembro al store.
- `handleReject(request)` (`:175`): abre `ConfirmModal` danger cuyo `onConfirm` llama **`callAdminFunction('admin-reject-registration', {requestId})`** (`:187`); en éxito saca del array + `SuccessModal`.

**UI:** header con toggle cards/tabla; búsqueda + panel de filtros por `statusConfig` (pending/approved/rejected/all); `PageLoader` mientras `loading`; grilla de cards o tabla responsive (columnas ocultas por breakpoint). Modal "Aprobar" (selector de rol vía `MEMBER_ROLES` de appStore + campo password editable + botón "Regenerar"); Modal "Credenciales" (copiar al clipboard, aviso de que no se vuelve a ver); Confirm/Success/Error modals compartidos.
- `formatDateLocal(dateStr)` (`:18`) — helper: parsea YYYY-MM-DD sin desfase de TZ, formatea es-AR.

**Tablas/RPC/EF que toca:** SELECT `pending_registrations`; EFs `admin-approve-registration`, `admin-reject-registration`. La aprobación crea el usuario auth server-side (misma puerta que `admin-create-member`).

---

### `Comunicaciones.jsx` — enviar comunicaciones a miembros (solo pastor)

Exporta `Comunicaciones` (`:12`). Sin props. Gate: `profile?.role !== 'pastor'` → "Acceso Denegado" (`:182-194`).

**Estado (`:14-34`):**
- `useAuthStore` → `profile`; `useAppStore` → `bands, members`.
- Form: `recipientType` (`''|'bands'|'users'|'roles'|'all'`), `selectedBands[]`, `selectedUsers[]` (guarda **userIds**, no member ids), `selectedRoles[]`, `subject`, `message`, `isSending`.
- Modales (todos ad-hoc con divs, NO el `<Modal>` compartido): `showSuccess`, `showError`+`errorMessage`, `showBandSelector`, `showUserSelector`.

**Derivaciones (`useMemo`):**
- `activeMembers` = miembros `active===true` (`:37`); `membersWithAccounts` = activos con `m.userId` (`:42`) — **solo estos pueden recibir push**; `activeBands` = bandas activas (`:47`).
- `membersInSelectedBands` (`:53`): junta member ids de `band.members` de las bandas elegidas, filtra a los que tienen cuenta.

**Lógica de destinatarios:**
- `toggleBand`/`toggleUser` (`:70`,`:78`) togglean selección; el toggle de roles es inline en el botón "Por Rol" (`:257`, precarga los 3 roles).
- `getRecipientIds()` (`:97`): resuelve un `Set` de **userIds** según `recipientType` (all → todos con cuenta; bands → miembros de bandas elegidas; users → `selectedUsers` tal cual; roles → miembros con cuenta cuyo `role` está en `selectedRoles`). Usado tanto en el resumen ("llegará a N") como en el envío.
- `resetForm` (`:87`) limpia todo tras enviar.

**Envío — `handleSend` (`:128`):** valida `subject`, `message`, `recipientType` y que haya ≥1 destinatario; **`callAdminFunction('admin-send-communication', {recipientType, recipientIds, subject, message})`** (`:158`). La EF hace el insert padre + fan-out atómico (rollback si algo falla); la identidad del pastor sale del JWT server-side. En éxito: `window.lastSentCount = data?.inserted ?? recipientIds.length` (`:174`), `showSuccess`, `resetForm`.
- **Data flow servidor:** la EF inserta en **`communication_notifications`**; el push fan-out lo dispara el trigger AFTER INSERT (migración `20260428_push_triggers.sql`, comentado en `:177`). El cliente NO manda push directo.

**UI:** grid de 4 tipos de destinatario (bandas/usuarios/roles/todos), multi-select de roles inline, inputs Asunto (max 100) y Mensaje (textarea max 1000, contador), resumen dinámico de N destinatarios, botón Enviar (deshabilitado si falta type/subject/message o `isSending`). Modales propios: BandSelector, UserSelector (solo `membersWithAccounts`), Success, Error — todos con backdrop-click para cerrar (a diferencia del `<Modal>` compartido).

---

### Trampas y landmines

- **Landmine 24 (Dashboard):** el card "Órdenes" cuenta SOLO `status==='scheduled'` (`upcomingOrders.length`), nunca `orders.length` (crecería sin techo). Cada card es `<Link>` solo si el rol tiene acceso (`canAccess`, fuente de verdad = criterio de `App.jsx`/nav: `/miembros` es pastor/líder); si no, `<Card>` plano. Card nuevo → definir `to`+`roles` alineado al route-guard.
- **Landmine 26 (glosario):** en Dashboard el card del día dice "¡Hoy tenés **ensamble**!" (encuentro de banda). No renombrarlo "ensayo" (eso es la práctica personal en Mi Ensayo).
- **Ensamble del día — TZ:** `Dashboard.jsx:48` calcula la fecha/hora ART vía `toLocaleString` a propósito para no depender del TZ del dispositivo. El `rehearsalDate` es `date` (no `timestamptz`) justamente para evitar el off-by-one de TZ (landmine 11). La ventana de visibilidad es dura: 08:00 ≤ hora ART < 23:00.
- **Landmine 16 (Login/registro):** el rate limit es un trigger `BEFORE INSERT` en `pending_registrations` que devuelve 429 vía `ERRCODE='PT429'`. `Login.jsx:299` mapea `insertError.code === 'PT429'` a un mensaje amable — si cambiás el ERRCODE server-side, actualizá este `if` o el usuario ve error genérico. También maneja `23505` (duplicado). El INSERT es el ÚNICO punto de escritura `anon` por diseño; no se manda password (la genera el pastor al aprobar).
- **Login — nunca password en localStorage:** el `useEffect` borra `rememberedPassword` legacy y solo persiste `rememberedEmail`. No reintroducir guardado de contraseña.
- **Solicitudes — polling, no realtime:** refresca por `setInterval` cada 30 s (`:100`); no hay suscripción realtime. Si esperás actualización instantánea, es por ese intervalo. Cleanup del interval está y debe quedar.
- **Solicitudes — sin `service_role` en cliente (regla #6):** aprobar/rechazar van SIEMPRE por `callAdminFunction` (EFs `admin-approve/reject-registration`); nunca crear el user auth con SQL crudo (rompe `auth.identities`, ver nota "Estado al 2026-05-16"). Tras aprobar, `initialize()` re-hidrata el store. La password se muestra UNA vez en `showPasswordReveal`; al cerrar se pierde (`createdMember` se nulea).
- **Comunicaciones — solo `membersWithAccounts` reciben:** `getRecipientIds()` filtra por `m.userId`; un miembro activo sin cuenta NO recibe (el resumen y el UserSelector ya lo reflejan). `selectedUsers` guarda **userIds**, no member ids — no confundir al agregar lógica.
- **Comunicaciones — envío atómico vía EF + trigger:** el fan-out y el push los hace la EF `admin-send-communication` + trigger AFTER INSERT en `communication_notifications`. El cliente no orquesta push ni identidad del emisor (sale del JWT). `window.lastSentCount` es un global usado solo para el copy del modal de éxito.
- **Modales inconsistentes:** Solicitudes usa el `<Modal>` compartido (history+portal, landmines 20/31), pero Comunicaciones usa divs `fixed inset-0` propios con cierre por backdrop-click. Si unificás, cuidá que los overlays altos en iPhone sumen `env(safe-area-inset-top)` (landmine 31) — los de Comunicaciones no lo hacen hoy.
- **Gate en cliente NO es la seguridad real:** los `isPastor` de Solicitudes/Comunicaciones son UX; la protección efectiva es RLS + las EFs admin. No relajar el gate esperando que el cliente frene a un no-pastor.

---

## Store central — `src/stores/appStore.js`

El corazón de datos de la app: un único store Zustand (`useAppStore`) con las 4 colecciones globales (`members`, `bands`, `songs`, `orders`) más el motor de transposición musical, los converters snake_case↔camelCase, el CRUD contra Supabase y los subsistemas de práctica (Ensayómetro). Casi todo el estado compartido de AdorAPP vive acá. `authStore.refreshProfile()` dispara `initialize()`.

### Exports del módulo
- `transposeSongStructure(structure, fromKey, toKey)` — línea 100, único helper de transposición exportado (el resto son internos).
- `useAppStore` — línea 284, el store Zustand.
- Constantes: `SONG_CATEGORIES` (947), `MEETING_TYPES` (963), `MEMBER_ROLES` (972), `INSTRUMENTS` (978), `MUSICAL_KEYS` (982).
- Imports: `supabase` + `callAdminFunction` de `../lib/supabase` (línea 2), `uuidv4` (línea 3).

### Motor de transposición (interno + 1 export)
- `semitoneSteps` (6) — tabla nota→semitono para mayores (C..B) y menores (Am..G#m). `notes` (11) = 12 cromáticas en sostenidos. `flatToSharp` (14) — mapea bemoles (Db→C#, etc.).
- `getSemitoneIndex(note)` (19) — devuelve índice de semitono; resuelve sostenido, bemol vía `flatToSharp`, o `notes.indexOf`; `null` si no matchea.
- `getNoteFromIndex(index)` (27) — `notes[(index+12)%12]`, siempre sostenidos.
- `transposeChordToken(token, semitones)` (30) — transpone UN acorde. Separa slash-chords (`C/E`) en main+bass, parsea con regex `/^([A-Ga-g])([#b]?)(.*)$/` (46), pasa la raíz a MAYÚSCULA (49) y preserva el sufijo. **Regex case-insensitive `[A-Ga-g]`** para que typos en minúscula (`c9`) igual transpongan — landmine 15. Si no matchea, o el índice es null, devuelve el token intacto (fail-safe). El bajo se transpone con la misma lógica (66-76).
- `transposeChordString(chordString, semitones)` (87) — splitea por espacios, transpone cada token, rejunta con espacios. Preserva string vacío.
- `transposeSongStructure(structure, fromKey, toKey)` (100) — **exportado**. Calcula `semitones = toSemitones - fromSemitones` (usa `semitoneSteps` con fallback 0), mapea cada sección transponiendo su `chords`. Usado por el viewer, PDFs (Repertorio/Órdenes) y `Practica.jsx`. Motor compartido → un bug acá afecta a todos.

### Converters DB↔frontend (internos) — ⚠️ DATA-LOSS LANDMINE
Bloque de comentario clave en líneas 175-189 (regla #8, incidente 15-jun-2026 / PR #20).
- `convertMemberFromDB(m)` (112) → camelCase. Notas: `editor` default false; `onboarded: m.onboarded !== false` (default true para filas viejas); expone **`avatar_url` Y `avatarUrl`** (ambos apuntan al mismo valor, por compatibilidad).
- `convertBandFromDB(b)` (132), `convertSongFromDB(s)` (144), `convertOrderFromDB(o)` (160). Song soporta `categories` array o legacy `category` single (150); `compass`/`bpm` default `''`. Order expone `rehearsalDate`/`rehearsalTime` (169-170).
- `convertMemberToDB(m)` (192) → snake_case, rellena **defaults para TODA la fila** (`role:'member'`, `active:true`, etc.). Sutileza: **`onboarded` sólo se forwardea si el caller lo pasó explícito** (210), si no la columna conserva su valor.
- `convertBandToDB(b)` (214), `convertSongToDB(s)` (223), `convertOrderToDB(o)` (237). Song genera BOTH `categories` (array) y `category` (single, `categories[0]`) por compat (228-229). **`convertOrderToDB` NO escribe `rehearsal_reminder_sent`** (comentario 245-247; landmine 9): lo maneja sólo el cron.
- **Contrato (regla #8, landmine crítico):** estos `*ToDB` regeneran una fila COMPLETA con defaults → correcto para INSERT, catastrófico para UPDATE. **NUNCA `supabase.from(...).update(convertXToDB(partial))`.** Siempre rutear por `updateMember/Band/Song/Order`, que mergean `{...current, ...updates}` contra el snapshot del store ANTES del converter.

### Estado del store (líneas 285-290)
`members: []`, `bands: []`, `songs: []`, `orders: []`, `loading: false`, `error: null`. (Zustand plano, no persist middleware; la persistencia se hace a mano vía localStorage.)

### `initialize()` (293) — carga inicial
- Firma `async () => void`. Setea `loading`, hace `Promise.all` de 4 selects (`members` order name, `bands` order name, `songs` order title, `orders` order date desc). Convierte con los `*FromDB`, **espeja a localStorage** (`appMembers/Bands/Songs/Orders`, 315-318) y setea el estado.
- **Fallback:** si Supabase falla, lee la cache de localStorage y la usa si tiene algo (330-346); si tampoco, setea `error`.

### CRUD Members (admin via Edge Functions)
- `addMember(member)` (355) — async → objeto miembro o `null`. **No inserta directo:** llama `callAdminFunction('admin-create-member', {...})` (nunca SQL crudo, evita el "Database error querying schema"). Agrega al store y devuelve `{...newMember, generatedPassword}`.
- `updateMember(id, updates)` (390) — async → data o `null`. **Merge-safe:** busca `current` en el store, aborta si no está, `merged = {...current, ...updates}`, `supabase.from('members').update(convertMemberToDB(merged)).eq('id',id).select().single()`. Actualiza store **y localStorage cache** (421-427).
- `deleteMember(id, permanent=false)` (437) — async → `true/false`. Si `permanent`: `callAdminFunction('admin-delete-member', {memberId})` (borra auth user + fila server-side). Si no: soft-delete `update({active:false})`.
- `toggleMemberActive(id)` (476) — async → rutea a `updateMember(id, {...member, active:!active})`.

### CRUD Bands / Songs / Orders (directo a Supabase, merge-safe en update)
- `addBand(band)` (485) — inserta `{...convertBandToDB(band), id: uuidv4()}` en `bands`, agrega al store, devuelve data o `null`.
- `updateBand(id, updates)` (512) — merge-safe (busca current, aborta si falta) → `update(convertBandToDB(merged))`. → data/`null`.
- `deleteBand(id)` (544) — `delete().eq('id',id)` → `true/false`.
- `addSong(song)` (566) — inserta `{...convertSongToDB(song), id: uuidv4()}` en `songs`.
- `updateSong(id, updates)` (593) — merge-safe. Comentario 595-600: fue la **raíz del wipe-out de `structure=[]`** — `updateSong(id,{lastUsed})` desde `addOrder` mandaba la fila entera defaulteada. → data/`null`.
- `deleteSong(id)` (629) — `delete` → `true/false`.
- `addOrder(order)` (651) — inserta `{...convertOrderToDB(order), id: uuidv4()}` en `orders` (lo prepende: `[nuevo, ...orders]`). **Efecto lateral:** por cada `songs[]` de la orden llama `updateSong(songEntry.songId, {lastUsed: order.date})` (671-675, merge-safe, no pisa datos). → data/`null`.
- `updateOrder(id, updates)` (685) — merge-safe (sin el merge, guardar sólo `feedback` borraría date/band/songs). Usado también por edición de orden y control de estado manual (Completar/Cancelar/Reabrir). → data/`null`.
- `deleteOrder(id)` (717) — `delete` → `true/false`. (FKs a `orders` deben ser SET NULL/CASCADE — landmine 18/32; el handler llamante DEBE `await` + ramificar.)
- `cloneOrder(id)` (738) — clona quitando `id`, fecha = hoy, `status:'scheduled'`, `feedback:''`, rutea a `addOrder`. → data/`null`.

Todos los `add/update/delete` devuelven data/true en éxito y `null`/false en error (setean `error` en el store). Nunca lanzan.

### Ensayómetro — practice_logs (personal, owner-only)
Comentario 753-756: **deliberadamente FUERA de `initialize()`/realtime/localStorage** — dato personal por-orden que sólo usa la pantalla Practica; RLS ya scopea al usuario logueado.
- `convertPracticeLogFromDB(p)` (253) / `convertPracticeLogToDB(p)` (272) — el `ToDB` **NO escribe `user_id`** (lo pone el DEFAULT `auth.uid()`, RLS lo fija; landmine 25). ⚠️ DATA-LOSS LANDMINE (266-271): construye fila completa → sólo aceptar objetos log COMPLETOS.
- `fetchPracticeLogs(orderId)` (758) — async → array (o `[]` en error). `select('*').eq('order_id', orderId)` sobre `practice_logs`.
- `upsertPracticeLog(log)` (775) — async → log convertido o `null`. `upsert(convertPracticeLogToDB(log), {onConflict:'user_id,order_id,song_id'})`. El upsert crea o actualiza transparentemente (user_id lo pone el DEFAULT). **Exige el objeto completo** — Practica.jsx siempre tiene el log completo en state.

### Ensayómetro F2 — practice_alarms (opt-in, owner-only)
Comentario 790-794: preferencia personal, push diario 18:00 ART lo manda el cron `send_practice_reminders()`, no el cliente.
- `fetchPracticeAlarm()` (796) — async → bool. `select('enabled').maybeSingle()`; **sin fila = `false`** (nunca la activó; landmine 28).
- `setPracticeAlarm(enabled)` (811) — async → `enabled` (bool) o `null`. `upsert({enabled, updated_at}, {onConflict:'user_id'}).select('enabled').single()`. El toggle en la UI es optimista y REVIERTE si devuelve `null`.

### Selectores / helpers derivados
- `getMemberById(id)` (830), `getBandById(id)` (831), `getSongById(id)` (832) — find por id.
- `getBandMembers(bandId)` (835) — miembros ACTIVOS cuyo id está en `band.members`.
- `getSongWithKey(songId, key)` (842) — devuelve `{...song, displayStructure}`; si `key===originalKey` o sin key, `displayStructure = structure` (sin transponer); si no, `transposeSongStructure(structure, originalKey, key)`.
- `getUnusedSongs(weeks=4)` (857) — canciones sin `lastUsed` o con `lastUsed` anterior al corte.
- `getUnusedByBand(bandId, weeks=4)` (869) — canciones no usadas en las órdenes recientes de esa banda.

### Realtime + reset
- `mergeRealtimeChange({table, eventType, newRow, oldRow})` (890) — llamado por `src/lib/realtimeSync.js`. Parchea en el lugar (sin refetch). `tableSpec` mapea las 4 tablas a su converter + lsKey (894-899). DELETE filtra por id; INSERT prepende **evitando duplicados** si el path optimista ya insertó (910); UPDATE reemplaza por índice o prepende si no está. Espeja al localStorage. Ignora tablas fuera del spec (ej. `practice_logs`, `practice_alarms` no tienen realtime).
- `reset()` (926) — logout: borra las 4 caches de localStorage y vacía el store. Evita que el usuario siguiente vea datos del anterior.

### Flujo de datos (resumen)
- **Tablas Supabase que toca directo:** `members`, `bands`, `songs`, `orders` (CRUD + realtime), `practice_logs`, `practice_alarms` (fetch/upsert). Todo por PostgREST (`supabase.from(...)`), sin SQL crudo.
- **Edge Functions (privilegiadas):** `admin-create-member`, `admin-delete-member` vía `callAdminFunction` (nunca `service_role` en cliente).
- **localStorage:** mirror de las 4 colecciones globales (`appMembers/Bands/Songs/Orders`) escrito en `initialize`, `updateMember`, `mergeRealtimeChange`; borrado en `reset`. Practice queda fuera.
- **Realtime:** entra por `realtimeSync.js` → `mergeRealtimeChange`.
- **No escrito nunca desde el cliente:** `orders.rehearsal_reminder_sent` (lo maneja el cron; landmine 9) y `user_id` de `practice_logs`/`practice_alarms` (DEFAULT `auth.uid()`; landmine 25).

### Trampas y landmines
- **Regla #8 / DATA-LOSS (converters):** nunca `update(convertXToDB(partial))`. Rutear por `updateMember/Band/Song/Order` que mergean `{...current, ...updates}` contra el snapshot ANTES del converter. Si el id no está en el store, el update ABORTA (`null`). Vale igual para `upsertPracticeLog` (objeto completo). Incidente raíz 15-jun-2026 / PR #20 (comentario en 175-189).
- **Landmine 9 — `rehearsal_reminder_sent`:** lo escribe SÓLO el cron `send_rehearsal_reminders`. `convertOrderToDB` lo omite a propósito (245-247). No agregarlo o una edición de orden re-dispararía el push. Caso borde: reprogramar un ensayo con el flag ya `true` no vuelve a avisar (landmine 13).
- **Landmine 15 — acordes minúscula:** el regex de `transposeChordToken` (46, 66) es `[A-Ga-g]` + `toUpperCase`. Si lo tocás, mantené el case-insensitive o typos como `c9` dejan de transportar. Cubierto por `src/stores/transpose.test.js`.
- **Landmine 25 — `practice_logs` owner-only:** el cliente NUNCA manda `user_id` (DEFAULT `auth.uid()` + RLS WITH CHECK). `upsertPracticeLog` exige objeto COMPLETO. No agregar SELECT de práctica ajena "para el pastor" (decisión de producto).
- **Landmine 28 — `practice_alarms` opt-in:** `fetchPracticeAlarm` sin fila = `false`; no crear filas por default (sería spam masivo el día 1). El toggle optimista DEBE revertir si `setPracticeAlarm` devuelve `null`.
- **Landmine 32 (borrado) — no afecta al store en sí pero sí a callers:** `deleteBand/Song/Order` devuelven true/false; el handler llamante debe `await` + ramificar (fire-and-forget + modal de éxito = mentira cuando la DB rechaza con 23503). Las FKs quedaron: `orders.band_id` SET NULL, `song_key_history.{song_id,member_id}` CASCADE / `.order_id` SET NULL, `practice_logs.*` CASCADE.
- **`avatar_url` duplicado:** `convertMemberFromDB` expone `avatar_url` Y `avatarUrl`; si tocás uno mantené ambos sincronizados o el cropper (Header/MobileNav) lee stale.
- **`song_key_history` NO lo maneja este store:** el fetch/save de historial de tonos vive fuera de `appStore.js` (buscar `song_key_history` en `Ordenes.jsx`/otros); acá sólo se referencia indirecto vía las FKs de borrado. No hay `fetchKeyHistory`/`saveKeyHistory` en este archivo.
- **`mergeRealtimeChange` sólo cubre las 4 tablas globales:** `practice_logs`/`practice_alarms` no tienen realtime ni localStorage por diseño (dato personal).

---

## Auth Store, Routing y Hooks

Subsistema de arranque de la app: cómo se inicializa la sesión, cómo se resuelve el rol del usuario, cómo se montan las rutas (lazy + guards) y los hooks compartidos. Casi todo JS.

### `src/stores/authStore.js` — Zustand store de autenticación

Store Zustand (`useAuthStore`). Estado: `user` (objeto de `supabase.auth`), `profile` (fila de `members`), `loading`, `error`, `isRefreshing` (declarado pero nunca usado en el código actual — `authStore.js:10`).

- **`initialize()`** `async` — Limpia `user_profile`/`user` de localStorage, lee `supabase.auth.getSession()`; si hay sesión, setea `user` y llama `fetchProfile(session.user.id)`. Registra `supabase.auth.onAuthStateChange` que **sólo** actúa en `SIGNED_OUT`/`INITIAL_SESSION` sin sesión (limpia `user`/`profile`); ignora `TOKEN_REFRESHED` a propósito para evitar loops infinitos (`authStore.js:33-42`).
- **`refreshProfile()`** `async` — Camino canónico para propagar un cambio de perfil/avatar/rol sin navegar: limpia cache, `fetchProfile(userId)` y luego `useAppStore.getState().initialize()` (`authStore.js:48-60`). **Cross-store**: authStore → appStore.
- **`fetchProfile(userId)`** `async` — SIEMPRE lee fresco de DB (borra `user_profile` de localStorage). Query `members.select('*').eq('user_id', userId).single()`; si falla, fallback por email buscando en `appStore.members` y re-consultando por `id` (`authStore.js:63-92`). Nunca cachea en localStorage (evita datos stale). Loguea el rol/nombre cargado (`authStore.js:101`).
- **`login(email, password)`** `async → bool` — Limpia caches, `supabase.auth.signInWithPassword`, setea `user`, `fetchProfile`. Devuelve `true`/`false`; errores quedan en `error` (`authStore.js:112-144`).
- **`signUp(email, password, name)`** `async → bool` — `supabase.auth.signUp` + INSERT directo en `members` (`role:'member'`, `active:true`, `id/user_id = data.user.id`) (`authStore.js:147-187`). Nota: inserta con `.from('members').insert(...)` crudo, no vía el store.
- **`logout()`** `async` — `supabase.auth.signOut` + borrado exhaustivo de todo rastro del usuario en el device: lista de `staticKeys` (incluye claves legacy y `sb-gvsoexomzfaimagnaqzm-auth-token`), barre claves `readNotificationIds_*` por usuario, `sessionStorage.clear()`, y `useAppStore.getState().reset()` (`authStore.js:193-233`).
- **`resetPassword(email)`** `async → bool` — `supabase.auth.resetPasswordForEmail` con `redirectTo` a `/reset-password` (`authStore.js:236-255`).
- **`clearError()`** — `set({ error: null })`.

Tablas/servicios Supabase: `auth.*` (getSession, signIn/Up/Out, resetPassword, onAuthStateChange) y tabla `members` (SELECT en fetchProfile, INSERT en signUp).

### `src/main.jsx` — bootstrap

Antes de montar React: `installGlobalErrorReporter()`, `registerSW()`, `initInstallPrompt()` (`main.jsx:12-15`) — el install prompt se registra ANTES de React porque Chrome puede disparar `beforeinstallprompt` antes del mount. Monta `<App/>` envuelto en `<ErrorBoundary>` dentro de `React.StrictMode` (`main.jsx:17-23`).

### `src/App.jsx` — routing con React.lazy + guards

- **`lazyPage(importer, name)`** helper — `lazy(() => importer().then(m => ({ default: m[name] })))`; necesario porque las páginas usan named exports, no default (`App.jsx:15-16`). Cada página (Login, Dashboard, Ordenes, Repertorio, Bandas, Miembros, Solicitudes, Comunicaciones, Practica) es su propio chunk (`App.jsx:18-26`).
- **`MembersOnlyRoles({children})`** guard — lee `useCurrentRole()`; si `role === 'member'` → `<Navigate to="/" replace/>`, si no pasa (`App.jsx:34-38`). Sólo envuelve `/miembros`.
- **`RouteSync({children})`** — auto-sync con throttle global de 15s (`REFRESH_THROTTLE_MS`, var módulo `lastRefreshAt`, `App.jsx:49-50`). `refreshIfStale()` llama `initializeApp()` (appStore) + `refreshProfile()` (authStore) si pasó el throttle (`App.jsx:58-64`). Se dispara en cambio de `location.pathname` (`App.jsx:66-69`) y en `focus`/`visibilitychange→visible` (`App.jsx:71-82`). El realtime (`realtimeSync.js`) es el camino primario; esto es red de seguridad.
- **`App()`** — estado `initialized` (useState). En mount: `await initializeAuth()` → `await initializeApp()` → `setInitialized(true)` (`App.jsx:93-100`). Mientras `!initialized || authLoading` muestra `<PageLoader fullscreen label="Cargando AdorAPP..."/>` (`App.jsx:102-104`).

**Mapa ruta → componente → guard/rol** (`App.jsx:110-122`):

| Ruta | Componente | Guard / rol |
|---|---|---|
| `/login` | Login | público (fuera del Layout) |
| `/` (index) | Dashboard | dentro de `<Layout/>` |
| `/ordenes` | Ordenes | todos |
| `/practica/:orderId` | Practica (Ensayómetro) | todos; ruta dinámica |
| `/repertorio` | Repertorio | todos |
| `/bandas` | Bandas | todos |
| `/miembros` | Miembros | **`<MembersOnlyRoles>`** (pastor/leader; member → `/`) |
| `/solicitudes` | Solicitudes | todos (la UI interna filtra por rol) |
| `/comunicaciones` | Comunicaciones | todos (la UI interna filtra por rol) |

Nota: el gate de rol en `App.jsx` sólo existe para `/miembros`; el resto de la restricción por rol vive dentro de cada página/nav, no en el router. `<Layout/>` es el shell (Header/Sidebar/MobileNav + `<Outlet/>`) y es donde se monta `startRealtimeSync`.

### `src/hooks/useCurrentMember.js`

- **`useCurrentMember()`** — resuelve la fila `members` del usuario logueado **por email** (`members.find(m => m.email === user.email)`), memoizado (`useCurrentMember.js:10-17`). Por email porque `members.user_id` es null en filas legacy. Lee `authStore.user` + `appStore.members`.
- **`useCurrentRole()`** — rol efectivo: `member?.role || profile?.role || 'member'` (`useCurrentMember.js:24-28`). Prioriza la fila `members` (fuente de verdad post-wizard) y cae a `authStore.profile.role` en la ventana entre session-restore y appStore listo. **Este es el hook de rol que buscabas** — no vive en un store, es un hook derivado. Usado por `MembersOnlyRoles`, Dashboard, Ordenes, Bandas, Repertorio, Miembros, Header, MobileNav, etc.

### `src/hooks/useInstallPrompt.js`

- **`useInstallPrompt()`** — envuelve `src/lib/installPrompt.js` en estado React: `{canPrompt, installed, platform, install}`. Estado inicial vía lazy init; se suscribe a `subscribeInstallPrompt(update)` en `useEffect` y re-lee al notificar (`useInstallPrompt.js:10-27`). `install` = `triggerInstall`.
- Lib subyacente (`installPrompt.js`): var módulo `deferredPrompt` capturada de `beforeinstallprompt` (con `preventDefault` para controlar cuándo mostrar), `installed` flag desde `appinstalled`. `isInstalled()` chequea `display-mode:standalone` + `navigator.standalone` (iOS). `getPlatform()` → `'ios'|'android'|'desktop'` (detecta iPadOS 13+ como Mac con touch). `triggerInstall()` `async` → `'accepted'|'dismissed'|'unavailable'`, consume el prompt una sola vez (`installPrompt.js:64-76`).

### `src/hooks/useDocumentTitle.js`

- **`useDocumentTitle(title)`** — setea `document.title = title + ' | AdorAPP'` en mount, restaura el previo en unmount; una por página. Valor falsy = no toca el título (`useDocumentTitle.js:11-20`). El mapeo ruta→título vive en `src/lib/pageTitles.js`: `pageTitles` (objeto) + `titleForPath(pathname)` que trata `/practica*` → `'Mi Ensayo'` y cae a `'AdorAPP'` (`pageTitles.js:5-19`). Header/MobileNav consumen `titleForPath` para mantener paridad desktop↔móvil.

### Libs de arranque acopladas (contexto de flujo)

- **`realtimeSync.js`** (`startRealtimeSync()`/`stopRealtimeSync()`) — un canal Supabase `app-data-sync` con `postgres_changes event:'*'` sobre `members/bands/songs/orders`; cada evento llama `appStore.mergeRealtimeChange({table,eventType,newRow,oldRow})` (patch in-place, sin refetch). En `visibilitychange→visible`, si `lastStatus !== 'SUBSCRIBED'`, detach+attach (móvil suspende WS). Idempotente. Se monta desde `Layout.jsx`.
- **`registerSW.js`** — registra `/sw.js` sólo en prod; detecta SW `waiting` → dispara `CustomEvent('adorapp:sw-update-available')` (lo escucha `UpdateBanner.jsx`); `applyUpdate()` postea `SKIP_WAITING` y `controllerchange` recarga la página (`registerSW.js`).
- **`errorReporter.js`** — `installGlobalErrorReporter()` cablea `window.onerror` + `unhandledrejection` → `reportError()` que invoca la Edge Function `log-error` (anon-callable, `verify_jwt:false`). Rate-limit por hash de mensaje: máx 5/min por key (`errorReporter.js:13-26`). Los fallos de logging se tragan para no re-disparar el handler global (riesgo de loop).

### Flujo de datos (resumen)

Arranque: `main.jsx` → `App.init()` → `authStore.initialize()` (sesión + `fetchProfile` sobre `members`) → `appStore.initialize()`. Rol: `useCurrentRole()` deriva de `appStore.members` (por email) con fallback a `authStore.profile`. Propagación de cambios: realtime (`mergeRealtimeChange`) como camino primario + `RouteSync` (throttle 15s en navegación/focus) como safety net → ambos terminan llamando `appStore.initialize()`/`refreshProfile()`. Logout limpia todo storage + `appStore.reset()`.

### Trampas y landmines

- **`fetchProfile` resuelve por email como fallback**: `members.user_id` puede ser null en filas legacy. `useCurrentMember` resuelve SIEMPRE por email por la misma razón — no cambiar a lookup por `user_id` hasta que todo migre a `id == auth.uid` (comentario en `useCurrentMember.js:1-4`).
- **`onAuthStateChange` ignora `TOKEN_REFRESHED` a propósito** (`authStore.js:34-41`): procesar refresh events causaba loops infinitos. Sólo actúa en `SIGNED_OUT`/`INITIAL_SESSION` sin sesión.
- **Nunca se cachea el profile en localStorage** (`authStore.js:103`): decisión deliberada anti-stale; `fetchProfile` borra `user_profile` en cada llamada. No reintroducir cache de perfil.
- **`signUp` inserta en `members` con `.insert()` crudo** (`authStore.js:166`), no vía el store — no pasa por los converters. Este es el único INSERT de member fuera del flujo admin; para crear usuarios de prueba usar la EF `admin-create-member`, NUNCA SQL crudo (rompe `auth.identities`, ver "Estado 2026-05-16" en CLAUDE.md).
- **`refreshProfile` es cross-store** (dispara `appStore.initialize()`): es el camino canónico para propagar avatar/rol/perfil (`authStore.js:48`). El comentario del CLAUDE.md ("`authStore.refreshProfile()` dispara `appStore.initialize()`") describe exactamente esto.
- **Throttle global de `RouteSync` es una var de módulo** (`lastRefreshAt`, `App.jsx:50`), compartida entre navegación y focus. 15s. Bajarlo re-spamea la DB y causa flicker en redes lentas (comentario `App.jsx:41-48`).
- **`MembersOnlyRoles` depende de `useCurrentRole`**, que durante el arranque puede devolver `'member'` transitoriamente (antes de que `appStore.members` cargue) → cae a `profile.role`. Si ambos faltan, default `'member'` redirige a `/`. El gate de rol del router SÓLO cubre `/miembros`; el resto de la seguridad por rol está en las páginas y en la RLS de Supabase, no acá.
- **Landmine #24 (Dashboard/nav)**: la fuente de verdad de "qué rol accede a qué ruta" debe alinearse entre `App.jsx` (guards), `MobileNav`/`Header` (nav) y las cards del Dashboard. `/miembros` = pastor/leader. Si agregás una ruta con restricción, replicá el criterio en los tres lados.
- **`initInstallPrompt` corre antes de React** (`main.jsx:15`): Chrome dispara `beforeinstallprompt` apenas se cumplen los criterios PWA, posiblemente antes de cualquier componente. No mover dentro de un componente o se pierde el evento.
- **`errorReporter` traga sus propios fallos** (`errorReporter.js:44-47`): si el reporte fallara y re-lanzara, el handler global lo recapturaría → loop infinito. No agregar logging que pueda tirar dentro del catch.
- **`getPlatform` trata iPadOS 13+ como iOS** (Mac + `ontouchend`, `installPrompt.js:52-53`): no confiar sólo en el UA "Mac" para desktop.

---

## Layout: `Layout`, `Sidebar`, `Header`, `MobileNav`

Los cuatro archivos de `src/components/layout/` forman el chrome de la app. `Layout` es el shell que decide desktop-vs-móvil por breakpoint Tailwind `lg` (1024px); `Sidebar` + `Header` son la navegación de escritorio; `MobileNav` es TODO el chrome móvil (top bar + bottom tab bar + overlays). **Header (1598 líneas) y MobileNav (1780 líneas) son los dos archivos monstruo con ~40% duplicado** (notificaciones, perfil, cropper de foto, cambio de contraseña) — ver la subsección "Duplicación Header↔MobileNav".

Fuentes de verdad compartidas: `useCurrentMember()`/`useCurrentRole()` (hooks, `src/hooks/useCurrentMember.js`), `titleForPath()` (`src/lib/pageTitles.js`), `sortNotificationsByDateDesc()` (`src/lib/notifications.js`), `<Modal>` (`src/components/ui/Modal.jsx`, solo Header), `<PushToggle>`, `<Avatar>`.

---

### `Layout.jsx` (shell raíz, 88 líneas)

`export const Layout = () => {…}` — layout route de React Router; renderiza `<Outlet/>` para las páginas hijas.

- **Estado/hooks:** `user = useAuthStore(s=>s.user)`; `wizardDismissed` (`useState(false)`); `currentMember = useCurrentMember()`.
- **Guard de auth:** si `!user` → `<Navigate to="/login" replace/>` (`Layout.jsx:27-29`).
- **Realtime sync:** `useEffect([user])` llama `startRealtimeSync()` al montar con user y `stopRealtimeSync()` en cleanup/logout (`Layout.jsx:21-25`, de `src/lib/realtimeSync`). Sincroniza members/bands/songs/orders.
- **Monta siempre:** `<CommandPalette/>` (paleta ⌘K/Ctrl+K, una sola vez), `<UpdateBanner/>` (toast de nuevo build del service worker), `<MobileNav/>`, y `<Sidebar/>`+`<Header/>` fijos (`hidden lg:block`).
- **OnboardingWizard:** se muestra solo si `currentMember.onboarded === false && !wizardDismissed` (`Layout.jsx:40-45`).
- **Doble árbol de contenido** (desktop `hidden lg:block` vs móvil `lg:hidden`), cada uno con su propio `<Outlet/>`.
- **Safe-area móvil (landmine PR24):** el contenedor de contenido móvil usa `paddingTop: calc(56px + env(safe-area-inset-top,0px))` y **`paddingBottom: calc(80px + env(safe-area-inset-bottom,0px))`** (`Layout.jsx:70-84`). El `80px` limpia la bottom nav (`h-20`) más la gesture-bar; el `pb-16` anterior (64px) ignoraba el safe-area y cortaba la última fila en teléfonos con barra de gestos.

### `Sidebar.jsx` (nav desktop, 88 líneas)

`export const Sidebar = () => {…}` — `<aside w-64>` fija a la izquierda (montada por Layout dentro de `hidden lg:block fixed inset-y-0 left-0 z-30`).

- **Estado/flujo:** `logout` de `useAuthStore()`; `role = useCurrentRole()` (fuente de verdad = fila `members`, fallback `authStore.profile.role`). `isPastor = role==='pastor'`; `canSeeMembers = pastor||leader`.
- **`navItems` por rol** (`Sidebar.jsx:27-37`): base `['/', '/ordenes', '/repertorio', '/bandas']` para todos; `/miembros` solo pastor/líder; `/solicitudes` + `/comunicaciones` solo pastor. Debe alinearse con `MembersOnlyRoles` de `App.jsx` y con `SECONDARY_NAV` de MobileNav.
- `<NavLink>` con `data-tour` para el tour de onboarding; activo = `bg-white text-black`.
- Logout: `onClick={() => { logout(); window.location.href='/login'; }}` (`Sidebar.jsx:79`).

### `Header.jsx` (top bar desktop + todos los modales, 1598 líneas)

`export const Header = () => {…}` — barra `h-16` con título, búsqueda, sincronizar, campana y bloque de perfil; renderiza 6 `<Modal>` (Perfil, Opciones de foto, Cropper, Cambiar contraseña, Notificaciones, Success, Error).

**Estado (useState/useRef):** perfil (`showProfile`, `isEditing`, `editName/Phone/PastorArea/LeaderOf/Birthdate`); cropper (`showCropper`, `showPhotoOptions`, `previewUrl`, `userPhoto`, `zoom`, `rotation`, `position`, `isDragging`, `dragStart`, `isSaving`); password (`showPasswordChange`, `newPassword`, `confirmPassword`, `showNewPassword`, `showConfirmPassword`, `passwordSaving`); `isSyncing`; notifs (`showNotifications`, `notifications`, `unreadCount`, `readNotificationIds`); modales (`successModal`, `errorModal`); `fileInputRef`.

**Derivados (fuente de verdad = appStore.members, NO authStore.profile):**
- `currentUserMember = useMemo(() => members.find(m=>m.email===user.email))` (`Header.jsx:124-131`) — comentario CRITICAL: la fila de members es la verdad del rol/nombre/foto.
- `displayName`/`displayRole`/`displayPhoto` con fallback en cascada a `profile`/`user` (`Header.jsx:135-137`).

**Funciones clave:**
- `formatDateLocal(dateStr)` (módulo, `Header.jsx:18`) — formatea `YYYY-MM-DD` en es-AR **sin shift de timezone** (parsea manual). Duplicado idéntico en MobileNav.
- `iconForType(t)` (dentro del efecto de carga) — mapea `type`→nombre de ícono (devotional→cross, reflection→sunset, song→music, band→users, member→heart, request→file, order→calendar, birthday→cake).
- `loadNotifications()` (`Header.jsx:171`) — **flujo de datos crítico:**
  - Query 1: tabla `notifications` con `.select('id,title,message,type,user_id,is_global,created_at,expires_at')`, filtro `expires_at is null OR > now`, `is_global OR user_id=user.id`, `order created_at desc limit 20`.
  - Query 2 (si hay user): tabla `communication_notifications` (`recipient_id=user.id`, `is_read=false`, limit 10) — shape distinta (sender+subject+preview+full_message).
  - **Mezcla ambas fuentes con `sortNotificationsByDateDesc(notifs)`** por `createdAt` real (landmine 34a); calcula `unreadCount` contra `readNotificationIds`.
- **`useEffect([readNotificationIds, user?.id])`** (`Header.jsx:159-293`): `loadNotifications()` inmediato + poll fallback cada 2 min + canal Realtime `bell-${user.id}-desktop` con 4 subscripciones: INSERT en `notifications`, INSERT/UPDATE en `communication_notifications` (filtro recipient), INSERT en `notifications_read` (parchea `readNotificationIds` local para sync cross-device).
- **`useEffect([user?.id])`** (`Header.jsx:75-113`): hidrata `readNotificationIds` desde `localStorage['readNotificationIds_<uid>']` (anti-flicker) y luego reemplaza con la verdad de la tabla `notifications_read` (unión con cache). Migra la key global legacy.
- `markAsRead(id)` (`Header.jsx:296`) — optimista (state+cache+`unreadCount--`); comunicaciones → `communication_notifications.update({is_read:true})`; el resto → `notifications_read.upsert({user_id,notification_id}, onConflict, ignoreDuplicates)` (persiste cross-device por PK).
- `markAllAsRead()` (`Header.jsx:329`) — separa comm vs global y hace update/upsert en lote.
- `handleEditProfile()` / `handleSaveExtendedProfile()` (`Header.jsx:363/372`) — save escribe **`supabase.from('members').update(updateData).eq('id', currentUserMember.id)`** (update directo de columnas sueltas, NO pasa por convertXToDB → seguro anti DATA-LOSS), luego parcha `appStore.setState` + `localStorage['appMembers']` + `authRefreshProfile()`. Muestra `successModal`/`errorModal`.
- `handleChangePassword()` (`Header.jsx:461`) — valida (≥6, match) → `supabase.auth.updateUser({password})`; feedback vía Modales.
- Cropper: `handleCameraClick`, `handleReplacePhoto`, `handleDeletePhoto` (borra de Storage `avatars` + nulea `members.avatar_url` + parcha store), `handleFileSelect` (valida tipo/≤5MB → `URL.createObjectURL` → abre cropper), `handlePointerDown/Move/Up` (Pointer Events para mouse+touch+pen; efecto engancha listeners globales mientras `isDragging`), y **`handleSavePhoto()`** (`Header.jsx:637`) — dibuja canvas 400×400 replicando el transform CSS. **Ojo:** el cropper desktop calcula el tamaño mostrado con **constantes** (`previewCircleSize=256`, `previewMaxHeight=260`, `Header.jsx:664-692`) — la matemática frágil que el móvil ya reemplazó por medición real (backlog abierto, ver landmines).
- **Sincronizar** (botón, `Header.jsx:848`): `useAppStore.getState().initialize()` + `authRefreshProfile()`, spinner `isSyncing`.
- **Búsqueda** (`Header.jsx:842`): `window.dispatchEvent(new CustomEvent('openCommandPalette'))` (el botón desktop antes estaba muerto, arreglado en PR #26).
- **Modal Notificaciones** (`Header.jsx:1431-1548`): filtra a no-leídas; cada card tiene su **✕** (`onClick` con `stopPropagation → markAsRead`); el **tap en el card NO descarta** (solo navega a `/solicitudes` si `type==='request'`) — landmine 34b.

### `MobileNav.jsx` (chrome móvil completo, 1780 líneas)

`export const MobileNav = () => {…}` — renderiza top bar (`fixed top-0`), bottom tab bar (`fixed bottom-0 h-20`) y 5 overlays custom (NO usa `<Modal>`): sheet de perfil, modal de foto, cropper fullscreen, menú "Más", modal de contraseña, sheet de notificaciones.

**Nav config (módulo):**
- `PRIMARY_NAV` (`MobileNav.jsx:66-71`) — 4 tabs visibles a TODOS: Inicio, Órdenes, Repertorio, Bandas.
- `SECONDARY_NAV` (`MobileNav.jsx:72-76`) — detrás de la hamburguesa, filtrados por rol: `/miembros` (pastor/leader), `/solicitudes` + `/comunicaciones` (pastor). `secondaryNavItems = useMemo(filter by role)`; `hasSecondary` decide si se muestra el 5º tab "Más" (los miembros comunes no ven hamburguesa → strip limpio de 4).

**Estado:** menús (`menuOpen`, `profileOpen`); foto/cropper (`showPhotoModal`, `showCropper`, `previewUrl`, `isDragging`, `dragStart`, `zoom`, `rotation`, `position`); password (`showPasswordChange`, `pwNew`, `pwConfirm`, `pwSaving`, `pwShowNew`, `pwShowConfirm`); `editMode` + campos edit; notifs (`showNotifications`, `notifications`, `unreadCount`, `readNotificationIds`); refs `profileSheetRef`, `fileInputRef`, **`cropImgRef`** (mide el `<img>` real del cropper).

**Derivados:** `currentUserMember = useCurrentMember()`; `displayName/Role/Photo/Phone/PastorArea/LeaderOf/Birthdate` con fallback a `profile` (`MobileNav.jsx:352-362`). `role = currentUserMember?.role || profile?.role || 'member'`.

**Funciones clave (espejo de Header, con diferencias):**
- `loadNotifications()` + `useEffect([readNotificationIds])` (`MobileNav.jsx:145-278`) — **idéntico a Header** salvo: obtiene `user` con `useAuthStore.getState()` (no del render), canal Realtime `bell-${user.id}-mobile`. Mezcla con `sortNotificationsByDateDesc`.
- `markAsRead`/`markAllAsRead` — mismas tablas (`communication_notifications`, `notifications_read`), misma lógica optimista.
- `handleSaveProfile()` (`MobileNav.jsx:439`) — `members.update(updateData).eq('id', currentUserMember.id)` (comentario: usa `members.id` como Header, NO `user_id` que podía fallar); usa `alert()` (no Modales — landmine de UX, backlog).
- `handleChangePassword()` — igual que Header pero con `alert()`.
- `handleDeletePhoto()` (`MobileNav.jsx:562`) — parsea la key de Storage buscando `/object/public/avatars/`, borra el archivo, nulea `members.avatar_url` con **update directo de una columna** (comentario explícito: no pasa por `convertXToDB`, sin riesgo DATA-LOSS), `refreshProfile()`.
- `handleFileSelect`, `handlePointerDown/Move/Up` + efecto de listeners globales.
- **`handleSavePhoto()`** (`MobileNav.jsx:586`) — la versión **correcta** del cropper (landmines 1-2): dibuja desde `previewUrl` (NO de `fileInputRef`, que se desmonta al cerrar el photo-modal), **mide `cropImgRef.current.offsetWidth/Height`** (tamaño real renderizado, inmune al transform) en vez de constantes, y replica el pipeline exacto: `translate(center) → scale(k) → scale(zoom) → rotate → translate(px/zoom,py/zoom) → drawImage centrado`, `k = canvasSize/previewCircleSize(200)`. Sube a Storage `avatars` como PNG y actualiza `members.avatar_url` (con fallback `id` si `user_id` null).
- **Sheet de perfil scrolleable (landmine 21):** el contenedor `max-h-[90vh] overflow-y-auto` (`MobileNav.jsx:831-843`) **NO lleva `touch-action:none`** (bloqueaba el scroll táctil en algunos celulares); usa `overscrollBehavior:'contain'`.
- Efectos de UX: cerrar overlays con Escape (`MobileNav.jsx:727-738`) y `document.body.style.overflow='hidden'` mientras hay overlay abierto (`741-750`).
- **Bottom tab bar** (`MobileNav.jsx:1732-1777`): 4 `<NavLink>` de `PRIMARY_NAV` + botón hamburguesa "Más" (solo si `hasSecondary`) que abre `menuOpen`. `paddingBottom: env(safe-area-inset-bottom)`.
- **Top bar** (`MobileNav.jsx:755-817`): logo + título (`titleForPath(location.pathname)`) + búsqueda (CustomEvent `openCommandPalette`) + campana + botón de perfil; `paddingTop: env(safe-area-inset-top)`.
- **Sheet de notificaciones** (`MobileNav.jsx:1576-1727`): misma lógica de ✕ por card + tap-no-descarta; `type==='request'` navega vía `window.location.href='/solicitudes'` (Header usa `navigate()`).

---

### Flujo de datos (resumen transversal)

- **Stores:** `useAuthStore` (`user`, `profile`, `logout`, `refreshProfile`); `useAppStore` (`members`, `.getState().initialize()`, `.setState(...)` para parches optimistas). `refreshProfile()` dispara `appStore.initialize()`.
- **Tablas Supabase tocadas directamente (SQL, no via store):** `notifications` (SELECT), `communication_notifications` (SELECT/UPDATE is_read), `notifications_read` (SELECT/UPSERT), `members` (UPDATE de perfil/avatar — columnas sueltas, nunca converters). Storage bucket `avatars` (upload/remove/getPublicUrl). `supabase.auth.updateUser` (password).
- **Realtime:** un canal por layout (`bell-<uid>-desktop` / `bell-<uid>-mobile`) escuchando INSERT en `notifications`, INSERT/UPDATE en `communication_notifications`, INSERT en `notifications_read`. Cross-device: marcar leído en un dispositivo baja el badge en el otro.
- **localStorage:** `readNotificationIds_<uid>` (cache anti-flicker de leídos), `userPhoto` (solo Header), `appMembers` (cache de members).

### Duplicación Header ↔ MobileNav (explícita)

Ambos archivos re-implementan **el mismo subsistema** sin compartir código (refactor pendiente en backlog):

| Bloque | Header.jsx | MobileNav.jsx | Diferencias |
|---|---|---|---|
| `formatDateLocal` | módulo :18 | módulo :48 | idéntico, copiado |
| `iconForType` + `loadNotifications` + efecto Realtime | :159-293 | :145-278 | canal `-desktop` vs `-mobile`; `user` del render vs `getState()` |
| `markAsRead`/`markAllAsRead` | :296-361 | :280-338 | idéntico |
| Panel de notificaciones (✕ por card, tap-no-descarta) | Modal :1431 | overlay custom :1576 | Header `<Modal>` + `navigate()`; Mobile `<div>` + `window.location.href` |
| Perfil ver/editar + save a `members` | :363-458 | :439-480 | Header usa `<Modal>`+successModal; Mobile usa `<div>` sheet + `alert()` |
| Cropper de foto (`handleSavePhoto`, pointer drag) | :601-830 | :405-724 | **Header usa constantes (frágil); Mobile mide `cropImgRef` (correcto)** |
| Cambiar contraseña | Modal :1316 | overlay :1475 | Header Modales; Mobile `alert()` + `<div>` propio |
| Sincronizar / búsqueda / campana | sí | sí | mismo CustomEvent `openCommandPalette` |

Regla operativa (landmine 34): cualquier cambio al panel de notificaciones o al perfil **debe aplicarse en los DOS archivos** — no están unificados.

### Trampas y landmines

- **Landmine 1-2 (cropper):** en MobileNav `handleSavePhoto` NO debe leer `fileInputRef` (el input se desmonta al abrir el cropper → null → guardado no-op silencioso); dibujar desde `previewUrl`. Y medir el `<img>` real (`cropImgRef.offsetWidth/Height`) + replicar el mismo pipeline de transform, nunca constantes. **El cropper de Header AÚN usa constantes** (`Header.jsx:664-692`) — backlog abierto: aplicar la medición real si aparece el bug en desktop.
- **Landmine 3 (touch):** nunca esconder acciones con `opacity-0 group-hover` sin `lg:` (no hay hover en touch).
- **Landmine 21 (bottom-sheets):** un sheet scrolleable (`overflow-y-auto`) NO lleva `touch-action:none` (bloquea scroll táctil en varios navegadores). `touch-action:none` es SOLO para superficies con drag propio (los dos croppers, que sí lo usan para pan). El sheet de perfil usa default + `overscroll-behavior:contain`.
- **Landmine PR24 (safe-area):** el contenido móvil de `Layout` usa `paddingBottom: calc(80px + env(safe-area-inset-bottom))`; no volver a `pb-16` o se corta la última fila con gesture bar.
- **Landmine 23 (iOS form controls):** los `input[type=date]`/`[time]` vacíos colapsan en iOS (fix global `min-height` en index.css); los toggles pill no deben ser `<button>`. Aplica a los inputs de perfil/password de ambos archivos.
- **Landmine 31 (overlays altos en iPhone):** overlays `fixed inset-0` con controles cerca del borde superior necesitan `env(safe-area-inset-top)` (el cropper móvil ya lo suma en su top bar, `MobileNav.jsx:1231`). El `<Modal>` compartido (usado por Header) ya lo hace.
- **Landmine 34 (panel de notifs):** (a) todo ítem del panel DEBE llevar `createdAt` y pasar por `sortNotificationsByDateDesc` — no hay orden implícito por origen (las comunicaciones ya no van al fondo). (b) El tap en un aviso NO marca leído/descarta (anti-roce accidental); el descarte es solo por la ✕ de cada card o "Marcar todas". Cambio **duplicado en Header Y MobileNav**.
- **DATA-LOSS (regla #8):** los saves de perfil/avatar usan `supabase.from('members').update({columnas sueltas})` a propósito — NUNCA rutear por `convertXToDB`, que sobrescribiría toda la fila con defaults. Ambos archivos lo respetan con comentarios explícitos.
- **Fuente de verdad del rol:** siempre `currentUserMember` (fila `members` por email vía `useCurrentMember`), no `authStore.profile` (puede quedar stale tras un cambio de rol en DB). Sidebar/Header/MobileNav deben mantener alineados sus filtros de nav con los route guards de `App.jsx` (ej. `MembersOnlyRoles` para `/miembros`).
- **`useCurrentMember` resuelve por email** (no por `user_id`, que es null en filas legacy) — si `members` aún no cargó, devuelve null y los `display*` caen al fallback de `profile`.

---

## Componentes UI y compartidos (`src/components/ui/*`, `src/components/*.jsx`)

Design tokens comunes: dark theme fijo (`bg-neutral-900`, borders `neutral-800`, texto `white`/`gray-400`), radios `rounded-lg/xl/2xl`, y aurora/gradientes por fuera de estos primitivos. Todos son presentacionales salvo los que se documentan con flujo de datos (Modal, OnboardingWizard, PushToggle, OrderHistoryTimeline, CommandPalette). Ninguno usa TS (todo `.jsx`).

### Primitivos de estilo (stateless, sin flujo de datos)

- **`Avatar`** (`ui/Avatar.jsx:3`) — props `{ name, src, size='md', className }`. Si hay `src` renderiza `<img object-cover>`, si no muestra iniciales. `getInitials` toma primeras letras de las 2 primeras palabras o `slice(0,2)` (`Avatar.jsx:16`); `getColorFromName` (`Avatar.jsx:25`) elige color determinísticamente por suma de charCodes mod 6 (mismo nombre → mismo color). Tamaños `sm/md/lg/xl` = w-8..w-16.
- **`Badge`** (`ui/Badge.jsx:3`) — props `{ children, variant='default', size='md', className }`. Variantes `default/primary/success/warning/danger`; pill `rounded-full`. Puramente estético.
- **`Button`** (`ui/Button.jsx:3`) — props `{ children, variant='primary', size='md', icon, iconPosition='left', ...props }`. Variantes `primary/secondary/ghost/danger`, tamaños `sm/md/lg`. `icon` es un componente lucide; el tamaño del ícono se deriva del `size` (14/16/20). Hace spread de `...props` al `<button>` (así reciben `onClick/disabled/type`). No fuerza `type`, cuidado dentro de `<form>` (default `submit`).
- **`Card`** (`ui/Card.jsx:3`) — props `{ children, className, hover=false, padding='md', ...props }`. `hover` agrega estados interactivos + `cursor-pointer`. `padding` `none/sm/md/lg`. Spread de props (se usa envuelto en `<Link>` o con `onClick` en Dashboard).
- **`Input`** (`ui/Input.jsx:12`) — props `{ label, icon, error, id, className, containerClassName, ...props }`. A11y cableada: `label htmlFor` → `input id` (id de `useId()` si no se pasa, evita colisiones — `Input.jsx:21`); si hay `error` se renderiza con `role="alert"` + `aria-describedby` + `aria-invalid` (`Input.jsx:43-51`). El `icon` se posiciona absoluto a la izquierda con `pl-10`.
- **`PageLoader`** (`ui/PageLoader.jsx:14`) — props `{ label='Cargando AdorAPP…', fullscreen=false }`. Logo `/logo.png` con `animate-pulse` + texto. `fullscreen` → `min-h-screen bg-black` (matchea la boot screen), si no `min-h-[50vh]`. `role="status" aria-live="polite"`. Loader canónico del proyecto (no usar spinners circulares genéricos).

### `Modal` (`ui/Modal.jsx:34`) — CRÍTICO

Props `{ isOpen, onClose, title, children, size='md', footer }`. `size` mapea a `max-w-md/lg/2xl/4xl` (`Modal.jsx:93`). Es la base de ConfirmModal/SuccessModal/ErrorModal y de casi todos los formularios de la app.

Comportamientos delicados:
- **Portal a `document.body`** (`Modal.jsx:104,167`): evita que un ancestro con `transform`/animación se vuelva el containing block y saque el overlay (y su botón Cerrar) de vista en móvil.
- **Historia global de `popstate` — pila + contador** (`Modal.jsx:16-32`): estado a nivel de **módulo** (no por instancia): `openModalStack` (pila de `{close}`), `programmaticBackPending` (cuántos `history.back()` disparamos nosotros), `popstateListenerBound`. UN solo listener (`ensureModalPopstateListener`, `Modal.jsx:20`) cierra el modal top en un back real del usuario; si `programmaticBackPending>0` **absorbe** ese popstate en vez de tratarlo como back. Esto es lo que arregla la transición modal→modal (ej. Perfil → Cambiar Contraseña): sin esto, el `back()` del que se cierra cerraba al recién abierto (bug histórico PR #43).
- **Efecto de historia keyed sólo en `isOpen`** (`Modal.jsx:70-89`): al abrir hace `pushState({adorappModal:true})` + push a la pila; el cleanup saca su entrada y, si su dummy sigue en top, incrementa `programmaticBackPending` y hace `history.back()`. `onClose` vive en un `onCloseRef` (`Modal.jsx:45-48`) para que el efecto NO dependa del arrow inline recreado cada render (evita pushState por render).
- **Body scroll lock** mientras está abierto (`Modal.jsx:51-60`).
- **safe-area-inset-top** (`Modal.jsx:117`): el overlay suma `env(safe-area-inset-top)` al padding superior y el card lo descuenta de su `maxHeight` (`Modal.jsx:133`) — evita que iOS PWA standalone (`black-translucent`) se coma el primer tap del botón "Cerrar" bajo el status bar (PR #58). Sin notch `env()=0`, idéntico a antes.
- **Layout flex de 3 zonas**: header `shrink-0` (Cerrar siempre visible), content `flex-1 overflow-y-auto`, footer `shrink-0` en-flujo (NO `absolute`) con `env(safe-area-inset-bottom)` (`Modal.jsx:137-164`). `max-h` usa `100dvh` para que el teclado iOS no empuje el footer.
- **No hay cierre por click en backdrop** (intencional: rompería forms con pérdida de input). Cierre = botón X/Cerrar, back gesture, o `onClose` programático.

### `ConfirmModal` / `SuccessModal` / `ErrorModal` (`ui/ConfirmModal.jsx`)

Tres exports desde el mismo archivo, todos envuelven `<Modal size="md">` con un ícono circular + mensaje centrado.
- **`ConfirmModal`** (`ConfirmModal.jsx:6`) — props `{ isOpen, onClose, onConfirm, title, message, confirmText='Confirmar', cancelText='Cancelar', type='warning', icon=AlertTriangle, loading=false }`. `type` `warning/danger/success` cambia colores del ícono y del botón confirmar (`typeStyles`, `ConfirmModal.jsx:18`). `loading` deshabilita ambos botones y muestra spinner + "Eliminando..." en confirmar. Usado por los borrados (Bandas/Repertorio/Órdenes/Miembros).
- **`SuccessModal`** (`ConfirmModal.jsx:89`) — props `{ isOpen, onClose, title, message, icon=Check }`. Un solo botón "Entendido" full-width.
- **`ErrorModal`** (`ConfirmModal.jsx:125`) — props `{ isOpen, onClose, title, message, icon=AlertTriangle }`. Un botón "Cerrar". Es el modal que muestran los handlers de borrado cuando la DB rechaza (patrón `await deleteX()` + rama error, landmines 19/32).

### `CommandPalette` (`components/CommandPalette.jsx:37`)

Búsqueda global cmd/ctrl+K (o evento `openCommandPalette` para móvil sin teclado). Basado en `cmdk` (nav teclado + fuzzy filter + a11y gratis).
- **Estado:** `open` (`useState`). **Flujo de datos:** lee `{ members, songs, orders, bands }` de `useAppStore` (`CommandPalette.jsx:40`), `user` de `useAuthStore`, rol de `useCurrentRole()`. Navega con `useNavigate` de react-router (SPA in-app). NO toca Supabase directo — todo desde el store (instantáneo/offline).
- **Gating por rol** (`CommandPalette.jsx:70-74`): base = Inicio/Órdenes/Repertorio/Bandas; `canSeeMembers` (pastor|leader) agrega Miembros + su grupo de resultados; pastor agrega Solicitudes/Comunicaciones. Coherente con nav y route guards. `if (!user) return null` oculta antes del login (`CommandPalette.jsx:84`).
- **Delicado:** todos los hooks corren antes del early-return (`CommandPalette.jsx:67` respeta rules-of-hooks). `recentOrders` = top 8 por fecha desc (`useMemo`, `CommandPalette.jsx:76`). Canciones/miembros limitados a 50; miembros/bandas filtran `active !== false`; email de miembro sólo lo ve pastor (`CommandPalette.jsx:166,173`). Cada `onSelect` navega con querystring (`/repertorio?song=`, `/miembros?member=`, `/bandas?band=`, `/ordenes?order=`) que las páginas destino leen para abrir el detalle.

### `ErrorBoundary` (`components/ErrorBoundary.jsx:8`)

Class component (único en el subsistema). `getDerivedStateFromError` (`ErrorBoundary.jsx:14`) setea fallback; `componentDidCatch` (`ErrorBoundary.jsx:18`) reporta a la Edge Function `log-error` vía `reportError()` de `../lib/errorReporter` con `severity:'fatal'` + `componentStack`. Fallback: pantalla con `<details>` técnico + botón "Recargar la app" (`window.location.reload`). Envuelve el árbol top-level.

### `OnboardingWizard` (`components/OnboardingWizard.jsx:48`)

Flujo de bienvenida primer-login (5 pasos). Props `{ member, onClose }`. Se dispara desde `Layout.jsx` cuando el member tiene `onboarded=false` (`OnboardingWizard.jsx:12-14`).
- **Estado (mucho):** `step` (0-4), `tourIndex`, `dataSubStep` (0 contacto / 1 instrumentos), `saving`, `error`; campos `phone/birthdate/pastorArea/instruments` precargados del `member`; `pushBusy/pushError/pushDone`; `installBusy/installError`. Hook `useInstallPrompt()` da `{ canPrompt, installed, platform, install }` (`OnboardingWizard.jsx:66`).
- **Flujo de datos:** `finish()` (`OnboardingWizard.jsx:78`) hace `supabase.from('members').update({...campos, onboarded:true}).eq('id', member.id)` — escritura DIRECTA a `members`, NO por el store; luego `refreshProfile()` (authStore) + `initialize()` (appStore, alias `reloadApp`) y avanza a instalar (o cierra si ya instalada). `skipAll()` (`OnboardingWizard.jsx:107`) sólo marca `onboarded:true`. Push vía `subscribePush(member.id)`/`isPushSupported` de `../lib/push`; auto-finish 600ms tras activar (`OnboardingWizard.jsx:333`).
- **Pasos:** 0 Bienvenida; 1 Tour (renderiza `WizardSpotlight` sobre `TOUR_STOPS` con selectores `[data-tour='nav-ordenes'|'nav-repertorio']`, el 3º sin selector = card centrada, `OnboardingWizard.jsx:28-46`); 2 Datos (2 sub-pasos, instrumentos desde `INSTRUMENTS` del appStore); 3 Notificaciones (opt-in, "Más tarde" llama `finish`); 4 Instalar PWA (Chrome/Android prompt nativo, iOS mini-tutorial Compartir→Agregar a inicio, otros genérico). Modal propio `fixed inset-0 z-[150]` con `<input type=date>` — NO usa `<Modal>` (sin history integration).

### `WizardSpotlight` (`components/WizardSpotlight.jsx:27`)

Overlay que oscurece la pantalla, recorta un hueco alrededor de un elemento `[data-tour]` y muestra un tooltip. Props `{ targetSelector, title, body, stepIndex, stepCount, nextLabel='Siguiente', onNext, onSkip }`.
- **Estado:** `rect` (bounding box del target + PADDING) y `viewport` (w/h). `measure` (`WizardSpotlight.jsx:40`) hace `document.querySelector(targetSelector).getBoundingClientRect()`.
- **Delicado:** re-mide en `ResizeObserver(body)` + `resize` + `scroll` (capture) + timeouts 50/250ms porque el target puede montar después del spotlight (`WizardSpotlight.jsx:56-76`). Si el target no está en el DOM (ej. bottom-nav oculto en desktop) → `rect=null` → overlay full-screen centrado sin cutout, el mensaje igual llega. El backdrop se dibuja con **4 rectángulos** formando marco alrededor del hueco (`WizardSpotlight.jsx:99-113`), + ring highlight `pointer-events-none`. `tooltipPos` (`WizardSpotlight.jsx:80`) coloca arriba si `rect.top>240`, si no abajo, clamp a viewport.

### `OrderCalendar` (`components/OrderCalendar.jsx:30`)

Vista mensual de órdenes, sin lib de fechas. Props `{ orders, getBandById, onSelectOrder }`.
- **Estado:** `today` (`useMemo`), `cursor` `{year, month}`. Navegación `goPrev/goNext/goToday` con wraparound de mes/año (`OrderCalendar.jsx:83-96`).
- **Flujo de datos:** dos buckets `useMemo`: `byDay` (órdenes por `dayKey(o.date)`, ordenadas por `time` dentro del día, `OrderCalendar.jsx:38`) y `rehearsalsByDay` (por `dayKey(o.rehearsalDate)`, `OrderCalendar.jsx:56`). `dayKey` viene de `../lib/orders` (normaliza a `YYYY-MM-DD`, `orders.ts:10`). No toca Supabase; recibe todo por props.
- **Delicado:** grilla fija **6×7 (42 celdas)** con padding prev/next-month para que el layout no reflote al paginar (`OrderCalendar.jsx:70-81`); weekday **lunes-first** (`weekdayMonFirst`, `OrderCalendar.jsx:20`). Pills de estado con `STATUS_COLOR` (scheduled azul / completed verde / cancelled rojo tachado, `OrderCalendar.jsx:24`); máx 3 órdenes por día + "+N más". Los ensambles = pill **ámbar** aparte, con copy "Ensamble · banda" (glosario: ensamble = encuentro de banda, landmine 26). Click en cualquier pill → `onSelectOrder(o)`.

### `OrderHistoryTimeline` (`components/OrderHistoryTimeline.jsx:49`)

Historial de mutaciones de una orden (pastor-only). Props `{ orderId }`.
- **Estado:** `events` (`null`=cargando, `[]`=vacío) + `error`.
- **Flujo de datos:** `useEffect` consulta **directo a Supabase** `audit_events` filtrando `table_name='orders'` + `record_id=orderId`, order `occurred_at desc` limit 50 (`OrderHistoryTimeline.jsx:57-63`). RLS impone pastor-only en el SELECT → un no-pastor ve lista vacía (no error). Flag `cancelled` evita setState tras unmount (`OrderHistoryTimeline.jsx:64,72`).
- **Delicado:** `ACTION_META` mapea insert/update/delete a ícono+color+label; `FIELD_LABELS` traduce campos y **omite ruido** (`updated_at`/`created_at` → `null`, `OrderHistoryTimeline.jsx:24-25`). `summarizeChanges` (`OrderHistoryTimeline.jsx:42`) lista sólo campos significativos. `formatRelativeAR` da tiempo relativo en español (recién/hace N min/h/d, luego fecha).

### `PushToggle` (`components/PushToggle.jsx:21`)

Toggle de permiso + suscripción push para el sheet de perfil. Props `{ memberId }`.
- **Estado:** `supported`/`perm` hidratados lazy de las APIs al montar (evita setState-in-effect); `subscribed` (async, único `useEffect` que llama `isCurrentlySubscribed()`, `PushToggle.jsx:31`); `busy`, `error`.
- **Flujo de datos:** usa `isPushSupported/notificationPermission/subscribePush/unsubscribePush/isCurrentlySubscribed` de `../lib/push`. `onActivate` → `subscribePush(memberId)` + refresca perm; `onDeactivate` → `unsubscribePush()`.
- **Delicado:** 3 estados de UI — `!supported` (mensaje gris, sin botón, ej. iOS Safari viejo), `perm==='denied'` (tratado como unsupported con hint de reactivar desde el navegador, porque `requestPermission()` no vuelve a preguntar), y activado/no. Botón deshabilitado si `busy || !memberId`.

### `UpdateBanner` (`components/UpdateBanner.jsx:8`)

Toast cuando el service worker tiene un build nuevo esperando. Sin props.
- **Estado:** `visible`. **Flujo de datos:** escucha `window` evento `adorapp:sw-update-available` (`UpdateBanner.jsx:11`, lo dispara `../lib/registerSW`); botón "Actualizar" → `applyUpdate()` (SKIP_WAITING → controllerchange → reload). X sólo oculta el toast. `z-[300]` (por encima de modales). Tiene test (`UpdateBanner.test.jsx`).

### Trampas y landmines

- **Landmine 20 — `<Modal>` usa historia GLOBAL:** UN listener de `popstate` a nivel de módulo + `openModalStack` + `programmaticBackPending`. NO volver a un listener por-instancia: rompe toda transición modal→modal (abrir B cerrando A, ej. Perfil→Cambiar Contraseña). jsdom NO modela el `popstate` async del navegador → validar esta lógica en Chromium real (así se hizo en PR #43/#58).
- **Landmine 7 — footer del `<Modal>`:** es hijo flex `shrink-0`, NO `absolute` (si no tapa los últimos campos). El content es `flex-1 overflow-y-auto`; no volver a meter `pb-32` ni footer absoluto.
- **Landmine 31 — overlays altos en iPhone:** cualquier overlay `fixed inset-0` con controles cerca del borde superior debe sumar `env(safe-area-inset-top)` al padding (PWA standalone + `black-translucent`: iOS se come el primer tap en la zona del status bar → síntoma "el primer tap no anda"). El `<Modal>` ya lo hace. `OnboardingWizard`, `WizardSpotlight` y `CommandPalette` son overlays propios que NO usan `<Modal>` ni suman este inset — si se les agregan controles pegados al top, replicar el patrón.
- **Landmine 6 (relacionado) — no agregar cierre por backdrop al `<Modal>`:** rompería forms con pérdida de input. (`CommandPalette` sí cierra por backdrop, pero no tiene form con estado que perder.)
- **Cropper vs Modal:** el cropper de foto NO vive acá (está duplicado en `Header.jsx` y `MobileNav.jsx`); usa `touch-action:none` propio. No confundir con estos primitivos. Los sheets scrolleables NO deben llevar `touch-action:none` (landmine 21) — este subsistema no lo tiene, mantenerlo así.
- **`Button` sin `type` explícito:** dentro de un `<form>` un `<Button>` es `submit` por defecto; pasar `type="button"` cuando sólo dispara acciones (varias pantallas dependen de esto).
- **Escrituras que saltean el store:** `OnboardingWizard.finish/skipAll` y `OrderHistoryTimeline` van DIRECTO a Supabase (no por `appStore`). `finish` hace un `update` completo con objeto explícito (no pasa por `convertXToDB`, así que no aplica el data-loss landmine #8), pero cualquier campo nuevo del wizard debe agregarse a mano a ese `.update()`.
- **Gating de rol repetido:** `CommandPalette` re-implementa el criterio de acceso (`/miembros` = pastor|leader; Solicitudes/Comunicaciones = pastor). Si cambia el criterio en `App.jsx`/nav, actualizar también acá o la búsqueda navega a una ruta que redirige.
- **Glosario (landmine 26):** en `OrderCalendar` el evento de banda es "**Ensamble**" (no "ensayo"). El "ensayo" es la práctica personal (pantalla Mi Ensayo). No renombrar.

---

## Librerías `src/lib/*`

Módulos utilitarios puros y de infraestructura. Casi todo es JS salvo `csv.ts` y `orders.ts` (los dos únicos TS del repo). Se dividen en: cliente de datos (`supabase`), helpers puros testeables (`csv`, `orders`, `days`, `notifications`, `pageTitles`) e infraestructura PWA/runtime con efectos secundarios (`push`, `realtimeSync`, `registerSW`, `errorReporter`, `installPrompt`).

### `supabase.js` — cliente público + puerta a Edge Functions

- `supabase` (export const) — `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)`; cliente **anon/público** único de toda la app. Al importar, si falta alguna env var **lanza `Error`** en carga (fail-fast). `supabase.js:6-13`.
- `callAdminFunction(name, body)` `async → { data } | { error: <mensaje humano> }` — invoca una Edge Function (`supabase.functions.invoke`) adjuntando el JWT del usuario; el rol se verifica **server-side**. **Nunca throwea**: intenta extraer el mensaje real del error (`error.context.json()` → `parsed.error || parsed.detail`) y si el body trae `data.error` también lo trata como error. `supabase.js:23-41`.
  - **Flujo de datos:** es la única vía cliente a operaciones privilegiadas (sin `service_role` en cliente, regla #6). Consumidores reales: `admin-create-member` y `admin-delete-member` (`appStore.js:357,442`), `admin-reset-password` (`Miembros.jsx:315`), `admin-approve-registration`/`admin-reject-registration` (`Solicitudes.jsx:146,187`), `admin-send-communication` (`Comunicaciones.jsx:158`).

### `csv.ts` — helpers CSV + plegado de diacríticos

- `foldText(s: unknown): string` — normaliza para comparación insensible a acentos/mayúsculas: `lowercase → NFD → quita \p{Diacritic}`. `null/undefined → ''`. Reutilizado por la búsqueda difusa y el orden de exportación. `csv.ts:9-12`.
- `type CSVColumn<Row> = { header, get(row) }` — spec de columna para exportación. `csv.ts:14-17`.
- `escapeField(v)` (interno, no exportado) — escapa un campo CSV: quotea si hay `" , \n \r`, y **antipone `'` a campos que empiezan con `= + - @`** para prevenir CSV-injection en Excel/Sheets. `csv.ts:23-31`.
- `toCSV<Row>(rows, columns): string` — arma el CSV completo (header + filas) escapando cada celda; **prefija BOM UTF-8** (`\uFEFF`) para que Excel abra acentos sin importación manual. `csv.ts:42-49`.
- `downloadCSV(filename, csvText): void` — dispara la descarga en el navegador vía `Blob` + `<a download>` temporal + `revokeObjectURL`. Efecto DOM puro. `csv.ts:54-65`.

### `orders.ts` — helpers puros de órdenes/calendario

- `dayKey(dateLike): string` — clave de día local `YYYY-MM-DD`. **Delicado/anti off-by-one:** si el string ya empieza con forma `YYYY-MM-DD` lo **slicea directo** (evita el drift de `toISOString()` a UTC); si no, parsea `Date` y usa componentes **locales** (`getFullYear/getMonth/getDate`). Inválido/nulo → `''`. `orders.ts:10-20`. Consumido por `OrderCalendar.jsx` (buckets por día, ensambles, hoy) `OrderCalendar.jsx:41,60,98,141`.
- `type OrderSongRef`, `OrderForSuggestion`, `SuggestDirectorArgs` — tipos de apoyo. `orders.ts:22-37`.
- `suggestDirectorForSong({ singerIds, orders, songId, bandId }): string | null` — sugiere el director más probable de una canción por historial: primero el que más la dirigió **en la banda elegida**, si no el más frecuente en **cualquier** banda. Solo cuenta candidatos presentes en `singerIds` (cantantes activos). `null` si nunca se dirigió o ningún candidato está activo. `orders.ts:46-74`. Usado en `Ordenes.jsx:727` al agregar canción.

### `days.js` — etiquetas y orden de días (español correcto)

- `dayLabels` (obj) — clave interna → etiqueta capitalizada (`miercoles → 'Miércoles'`). `days.js:8-16`.
- `dayPluralLabels` (obj) — plural español **correcto**: solo `sabado→Sábados` y `domingo→Domingos` agregan "s"; lunes–viernes son **invariantes** ("los martes", nunca "Martess"). `days.js:18-26`.
- `DAY_ORDER` / `dayIndex(day)` (internos) — semana empezando en **lunes** (domingo último); día desconocido/vacío va al final. `days.js:30-35`.
- `compareBandsByCalendar(a, b)` — comparator de tarjetas de Bandas: por día de la semana → a igual día por `meetingTime` → a igual hora alfabético por `name` (locale `'es'`, estable y predecible). `days.js:39-45`. Usado en `Bandas.jsx`.

### `notifications.js` — orden del panel de avisos

- `sortNotificationsByDateDesc(items)` — devuelve **copia** (`[...items]`) ordenada por `createdAt` (ISO) descendente, `createdAt` ausente → epoch 0 (al fondo). Punto único de orden del panel: mezcla globales + personales + comunicaciones por fecha real (arregla el bug de comunicaciones empujadas al final). `notifications.js:9-14`. Consumido duplicado en `Header.jsx` y `MobileNav.jsx` (landmine #34).

### `pageTitles.js` — título de la barra superior

- `pageTitles` (obj) — mapa ruta→título para las 7 rutas estáticas (`/`→'Inicio', `/ordenes`→'Órdenes', etc.). Fuente única para desktop y móvil (regla de paridad). `pageTitles.js:5-13`.
- `titleForPath(pathname): string` — resuelve el título; **caso dinámico:** `/practica*` → `'Mi Ensayo'`; fallback `'AdorAPP'`. `pageTitles.js:15-19`.

### `push.js` — Web Push del lado cliente

- `VAPID_PUBLIC_KEY` (const) — clave pública VAPID **hardcodeada a propósito** (no es secreto; evita round-trip de red). `push.js:9-10`.
- `isPushSupported()` — `true` si hay `serviceWorker` + `PushManager` + `Notification` (guard SSR). `push.js:12-19`.
- `notificationPermission()` — `Notification.permission` (`'default'|'granted'|'denied'`) o `'unsupported'`. `push.js:21-24`.
- `urlBase64ToUint8Array(b64)` / `bufferToB64Url(buf)` (internos) — conversión base64url ↔ bytes para la applicationServerKey y las claves de la suscripción. `push.js:26-40`.
- `subscribePush(memberId): Promise<endpoint>` — suscribe el dispositivo. **Idempotente:** reutiliza la suscripción existente; si no hay, pide permiso (throw `'Permiso denegado'` si no `granted`) y suscribe con `userVisibleOnly:true`. **Upsert** a `push_subscriptions` (onConflict `endpoint`) con `member_id, endpoint, p256dh, auth, user_agent, last_seen_at` — el upsert refresca `last_seen_at` aun si ya estaba suscripto. Throws si falta soporte/memberId o si el upsert falla. `push.js:45-78`. Usado en `PushToggle.jsx:55` y `OnboardingWizard.jsx:330`.
- `unsubscribePush(): Promise<void>` — borra la fila de `push_subscriptions` por `endpoint` y llama `sub.unsubscribe()`; no-op si no hay suscripción. `push.js:80-86`. Usado en `PushToggle.jsx:69`.
- `isCurrentlySubscribed(): Promise<boolean>` — `true` si `pushManager.getSubscription()` existe; tolerante a errores (`catch → false`). `push.js:88-97`. Usado en `PushToggle.jsx:32`.
  - **Tablas tocadas:** `push_subscriptions` (upsert/delete). Los pushes reales los envían triggers/EF server-side; este módulo solo administra la suscripción del dispositivo.

### `realtimeSync.js` — sincronización realtime de las 4 tablas core

- **Estado a nivel módulo:** `channel`, `visibilityHandler`, `lastStatus`; `TABLES = ['members','bands','songs','orders']`. `realtimeSync.js:20-24`.
- `attach()` (interno) — crea **un** canal `'app-data-sync'` que escucha `postgres_changes` `event:'*'` en las 4 tablas; en cada evento llama `appStore.mergeRealtimeChange({ table, eventType, newRow, oldRow })` (parchea el array del store in-place, sin refetch). Guarda `lastStatus` en `subscribe`. Idempotente (reusa `channel`). `realtimeSync.js:26-51`.
- `detach()` (interno) — `removeChannel` + resetea `channel`/`lastStatus`. `realtimeSync.js:53-59`.
- `startRealtimeSync(): stopFn` — llama `attach()` y registra un handler de `visibilitychange`: al volver a `visible`, si `lastStatus !== 'SUBSCRIBED'` (móvil suspende el WS) hace `detach()+attach()` (belt-and-suspenders sobre el auto-reconnect del SDK). **Idempotente**; retorna `stopRealtimeSync`. `realtimeSync.js:65-83`.
- `stopRealtimeSync()` — `detach()` + quita el listener de visibilidad. `realtimeSync.js:85-91`.
  - **Flujo:** montado/desmontado en `Layout.jsx:23-24` (efecto). Sink: `appStore.mergeRealtimeChange` (`appStore.js:890`). Cubierto por `appStore.realtime.test.js`.

### `registerSW.js` — registro del Service Worker + prompt de actualización

- **Estado módulo:** `pendingWorker`; `SW_PATH = '/sw.js'`. `registerSW.js:8-10`.
- `registerSW()` — registra `/sw.js` en `load`. **Solo en prod** (`import.meta.env.DEV` → return; guards SSR + `serviceWorker`). Detecta SW en `waiting` (al inicio y vía `updatefound`+`statechange==='installed'` con controller activo) → `onWaiting`. En `controllerchange` recarga **una sola vez** (`reloaded` flag) para tomar el nuevo build. Errores tragados (`.catch(()=>{})`). `registerSW.js:12-44`.
- `onWaiting(worker)` (interno) — guarda `pendingWorker` y dispara `CustomEvent('adorapp:sw-update-available')`. `registerSW.js:46-49`.
- `applyUpdate()` — postea `'SKIP_WAITING'` al worker pendiente (dispara la activación → controllerchange → reload). `registerSW.js:51-53`.
  - **Flujo:** invocado en `main.jsx:13`. El evento `adorapp:sw-update-available` lo escucha `UpdateBanner.jsx` (muestra toast "Actualizar" → `applyUpdate`). Testeado en `UpdateBanner.test.jsx`.

### `errorReporter.js` — reporte de errores no capturados

- **Estado módulo:** `seen` (Map key→{count,firstAt}), `installed`; `RATE_LIMIT_WINDOW_MS=60_000`, `RATE_LIMIT_MAX=5`. `errorReporter.js:13-15`.
- `shouldSend(key)` (interno) — rate-limit por hash de mensaje: ≤5 envíos del mismo error por minuto (evita inundar la tabla en un render-loop que throwea cada frame). `errorReporter.js:17-26`.
- `reportError(payload): Promise<void>` — arma el body (`message/stack/componentStack` truncados a 8000, `url` = pathname+search, `severity` default `'error'`, `context`), aplica `shouldSend` por key `(message|primera-línea-stack)` y postea a la EF **`log-error`** (adjunta JWT si existe; endpoint `verify_jwt:false` para capturar sin login). **Todo envuelto en try/catch vacío** (un fallo de logging no debe re-disparar el handler global → riesgo de loop infinito). `errorReporter.js:28-48`.
- `installGlobalErrorReporter()` — idempotente (`installed`); cablea `window 'error'` y `window 'unhandledrejection'` → `reportError`. `errorReporter.js:51-79`. Invocado en `main.jsx:12`; también lo usa el `ErrorBoundary` para llamadas explícitas.
  - **EF/tabla:** `log-error` → `error_log`.

### `installPrompt.js` — plumbing de instalación PWA

- **Estado módulo:** `deferredPrompt`, `installed`, `subscribers` (Set); `notify()` corre cada subscriber en try/catch aislado. `installPrompt.js:11-19`.
- `initInstallPrompt()` — captura `beforeinstallprompt` (Chrome/Edge/Android) con `preventDefault` para **decidir cuándo** mostrar el diálogo, guarda el evento y `notify()`; en `appinstalled` limpia y marca `installed`. **Se llama antes de montar React** (`main.jsx:15`) porque Chrome puede disparar el evento apenas se cumplen los criterios PWA. `installPrompt.js:21-38`.
- `isInstalled()` — `true` si `display-mode: standalone`, o `navigator.standalone` (iOS Safari), o flag `installed`. `installPrompt.js:40-46`.
- `getPlatform()` — `'ios'` (incluye iPadOS 13+ que se reporta como Mac con touch) | `'android'` | `'desktop'` | `'unknown'`. `installPrompt.js:48-57`.
- `canPromptInstall()` — `true` si hay `deferredPrompt` y no está instalado. `installPrompt.js:59-61`.
- `triggerInstall(): Promise<'accepted'|'dismissed'|'unavailable'>` — dispara el diálogo nativo (consume `deferredPrompt` una sola vez, `notify()`), devuelve el `outcome`; `'unavailable'` si no hay prompt (iOS muestra instrucciones en su lugar). `installPrompt.js:64-76`.
- `subscribeInstallPrompt(cb): unsubscribe` — suscribe una UI a cambios de disponibilidad; retorna la función de baja. `installPrompt.js:78-81`.

### Trampas y landmines

- **`supabase` es el cliente anon; nada de `service_role` en cliente** (regla #6, CI grepea `service_role`/`supabaseAdmin`). Toda operación privilegiada pasa por `callAdminFunction` (7 EF admin-*). El módulo **throwea en import** si faltan las env vars — no atrapar eso silenciosamente.
- **`callAdminFunction` nunca throwea:** siempre chequeá el `{ error }` de retorno, no uses try/catch esperando excepción. Cubre dos formas de error (el `error` del SDK y `data.error` del body).
- **`dayKey` es anti off-by-one de TZ:** slicea el prefijo si el string ya es `YYYY-MM-DD`; si lo cambiás a `new Date(...).toISOString()` reaparece el corrimiento de día por UTC. Alineado con landmine #11 (fecha+hora de ensamble como `date`+`text`, no `timestamptz`).
- **`escapeField` (csv) defusa CSV-injection** anteponiendo `'` a `= + - @` y el BOM UTF-8 es lo que hace que Excel abra acentos — no quitarlos.
- **Días de la semana:** NUNCA pluralizar concatenando "s" (`${label}s` → "Martess"); usá `dayPluralLabels`/`dayLabels`. El orden de tarjetas por día es `compareBandsByCalendar` (lunes primero) (landmine #33).
- **Panel de notificaciones:** todo ítem DEBE llevar `createdAt` y pasar por `sortNotificationsByDateDesc`; no hay orden implícito por origen. El uso está **duplicado en `Header.jsx` y `MobileNav.jsx`** (paneles sin unificar) — cualquier cambio va en los dos (landmine #34).
- **`realtimeSync` es singleton a nivel módulo:** un solo `channel`, `start/stop` idempotentes; el sink `mergeRealtimeChange` parchea in-place (sin refetch). El reattach por `visibilitychange` existe porque **móvil Safari suspende el WS** dejándolo en `CHANNEL_ERROR/CLOSED` silenciosamente. Solo cubre las 4 tablas core (`members/bands/songs/orders`) — `practice_logs`/`practice_alarms` están deliberadamente fuera de realtime (landmine #25).
- **`registerSW` solo corre en prod** (`import.meta.env.DEV` return; el dev server no tiene SW y HMR pelea con él). El reload en `controllerchange` está guardado por `reloaded` para no recargar en loop.
- **`errorReporter` traga todos sus propios fallos** a propósito: un error al loguear no debe re-entrar al handler global (loop infinito). Rate-limit 5/min por hash de mensaje. Endpoint `log-error` es anon-callable (`verify_jwt:false`) para capturar sin sesión.
- **`installPrompt` se inicializa antes de React** (`main.jsx`) porque `beforeinstallprompt` puede llegar antes de que monte cualquier componente; si lo movés dentro de React perdés el evento. iOS no tiene API de install → `triggerInstall` da `'unavailable'` y la UI debe mostrar instrucciones (`getPlatform()==='ios'`).
- **`push.subscribePush` es idempotente y upsertea por `endpoint`** (refresca `last_seen_at`); `VAPID_PUBLIC_KEY` hardcodeada es intencional (pública, no secreta). No confundir esta gestión de suscripción con el envío de push (que es server-side vía triggers/cron).

---

## Backend — migraciones, Edge Functions, crons, CI y config

Área de infraestructura: 25 migraciones SQL (`supabase/migrations/`), 1 Edge Function en el repo (`send-push`) más varias desplegadas fuera del repo, workflows de GitHub Actions, headers de seguridad en `vercel.json` y los fixes globales de iOS en `src/index.css`. El proyecto Supabase es `gvsoexomzfaimagnaqzm` (Pro, region implícita; app en `gru1`).

### Migraciones — agrupadas por feature

Las migraciones son **acumulativas por nombre de archivo** (orden lexicográfico por fecha). Varias `CREATE OR REPLACE` una función anterior o `ALTER` un CHECK, así que la definición vigente es la del archivo más nuevo.

**Perfil y esquema base de `members`/`songs`**
- `20240101000000_add_profile_fields.sql` — `ALTER members ADD` `pastor_area`, `leader_of`, `birthdate` (todos nullable, `IF NOT EXISTS`).
- `20260421_add_member_editor.sql` — `members.editor BOOLEAN DEFAULT false` (permite a un `member` crear/editar canciones sin ser líder).
- `20260421_add_song_compass_bpm.sql` — `songs.compass TEXT` + `songs.bpm INTEGER` (usados por el metrónomo del Ensayómetro y por el compás del acento).

**Historial de tonalidad (`song_key_history`)**
- `20260414_create_song_key_history.sql` — **crea la tabla** `song_key_history` (`member_id`→members CASCADE, `song_id`→songs CASCADE, `key VARCHAR(9)`, `order_id`→orders SET NULL, `order_date`, `created_at/updated_at`). `UNIQUE (member_id, song_id)` (una tonalidad por miembro-canción). Trigger `update_updated_at_column()` en BEFORE UPDATE. RLS inicial **laxa** (permitía `anon`). :10-22, :35-48
- `20260423_fix_song_key_history_rls.sql` — **supera** el RLS anterior: reemplaza las políticas por versiones que exigen `auth.uid() IS NOT NULL` y, en insert/update/delete, que la fila pertenezca al `member` del usuario (`EXISTS ... members.user_id = auth.uid()`). Agrega policy DELETE (antes no existía). :20-58

**Reflexiones diarias + campana de notificaciones (subsistema central de push)**
- `20260427_create_daily_reflections_and_notifications.sql` — **crea 2 tablas**: `daily_reflections` (365 citas, `day_of_year 1-366`, `date UNIQUE`, `quote`, `author`) y `notifications` (la campana: `user_id`→auth.users CASCADE nullable, `title`, `message`, `type` con CHECK, `is_read`, `is_global`, `expires_at`). RLS: cada usuario lee lo suyo + lo `is_global`; inserta cualquier autenticado; update/delete sólo lo propio. :29-94
- `20260427_create_daily_notification_function.sql` — **crea** `send_daily_reflection_notification()` (SECURITY DEFINER): busca la reflexión de hoy (por `date`, fallback `day_of_year`), borra las globales viejas e inserta una nueva `type='reflection' is_global=true`. :7-53
- `20260428_synth_notifs_to_rows.sql` — convierte los "avisos sintéticos" (canción/banda/miembro/solicitud) en **filas reales** de `notifications` para que hereden el push. Amplía el CHECK de `type` con `devotional,song,band,member,request`. Crea 4 trigger-funcs AFTER INSERT: `notify_on_song_insert` (global), `notify_on_band_insert` (global), `notify_on_member_insert` (global), `notify_on_pending_registration_insert` (una fila por-pastor, `user_id` seteado, sólo si `status='pending'`). :13-138
- `20260428_orders_push_trigger.sql` — cierra el hueco de órdenes: amplía CHECK con `order`, crea `notify_on_order_insert()` (global, arma "Reunión del DD/MM · banda") + trigger AFTER INSERT en `orders`. :5-51

**Pipeline de Web Push (triggers → Edge Function)**
- `20260428_push_config_rpc.sql` — **crea** `get_push_config()` (SECURITY DEFINER, `search_path=''`): devuelve `vapid_public/private/subject` + `push_internal_secret` desde `private.app_secrets` como jsonb. **Sólo `service_role`** puede llamarla (RAISE si `auth.role() <> 'service_role'`; REVOKE de PUBLIC/anon/authenticated, GRANT a service_role). :6-29
- `20260428_push_triggers.sql` — **el corazón del push**: `notify_push_on_notification_insert()` y `notify_push_on_communication_insert()`, ambos AFTER INSERT, SECURITY DEFINER `search_path=''`. Leen `push_internal_secret` de `private.app_secrets` y hacen `net.http_post` (pg_net, **async**, no bloquea el INSERT) a `https://gvsoexomzfaimagnaqzm.supabase.co/functions/v1/send-push` con `Bearer <secret>`. En `notifications`: `is_global`→`"all"`, sino resuelve `member_id` desde `user_id`. En `communication_notifications`: una fila por destinatario, body = `preview` o primeros 140 chars de `full_message`. :12-121
- `20260428_audit_trigger_null_safe.sql` — **supera** `audit_log_trigger()`: reemplaza el `RECORD` por variables tipadas para no crashear cuando `auth.uid()` es NULL (contexto service_role/cron). Escribe a `audit_events` con actor_* nulos en el camino del sistema. :13-80

**Read-state cross-device**
- `20260429_notifications_read_cross_device.sql` — **crea** `notifications_read` (PK `(user_id, notification_id)`, ambos FK CASCADE). RLS owner-only (select/insert/delete). **La agrega a la publicación `supabase_realtime`** (guardado idempotente) para que la campana reaccione a los "leído" de otro dispositivo sin esperar el poll de 2 min. :13-57

**Cumpleaños**
- `20260516_birthday_push_notifications.sql` — amplía CHECK con `birthday`. Crea `send_daily_birthday_notifications()` (SECURITY DEFINER `search_path=public`): busca cumpleaños de hoy (mes+día en ART), inserta una notif por (pastor activo)×(cumpleañero activo), saltando al propio pastor; expira a la próxima medianoche ART. **Programa el cron `daily-birthday-notification` `0 12 * * *` (09:00 ART)**. :36-103

**Lockdown de RPC interno**
- `20260530_revoke_internal_function_rpc.sql` — REVOKE EXECUTE de PUBLIC/anon/authenticated sobre las 7 trigger-funcs + 3 helpers de cron (`check_notification_freshness`, `send_daily_birthday_notifications`, `send_daily_devotional_notification`). Nota clave: **`auth_role()`, `is_pastor()`, `is_pastor_or_leader()` NO se tocan** (son helpers de RLS y deben quedar callable por authenticated). :22-33

**Storage de avatares**
- `20260618_avatars_storage_rls.sql` — el bucket `avatars` tenía RLS ON con **cero políticas** (nadie podía subir foto). Agrega 4 policies sobre `storage.objects` scoped a `bucket_id='avatars'`: `avatars_public_read` (SELECT público), `_authenticated_insert/update/delete` (TO authenticated). :16-42

**Ensamble / recordatorios de banda**
- `20260620_rehearsal_reminders.sql` — 3 columnas aditivas nullable en `orders` (`rehearsal_date date`, `rehearsal_time text` 'HH:MM', `rehearsal_reminder_sent bool DEFAULT false` dedup). Crea `send_rehearsal_reminders()` (SECURITY DEFINER `search_path=public`): en la ventana `[ensayo-2h, ensayo)` ART inserta 1 notif `reminder` por integrante activo con cuenta, marca dedup. REVOKE del RPC. **Programa cron `rehearsal-reminders` `*/15 * * * *`**. :29-115
- `20260803_ensamble_push_copy.sql` — **copy-only supersede** de `send_rehearsal_reminders()`: cambia sólo título/mensaje de "ensayo" a "**ensamble**" ('🎶 ¡Hoy tenés ensamble!'). Body byte-idéntico salvo el copy; re-asserta el REVOKE porque `CREATE OR REPLACE` resetea grants. :16-77

**Auto-completar órdenes**
- `20260621_auto_complete_past_orders.sql` — crea `auto_complete_past_orders()`: `UPDATE orders SET status='completed' WHERE status='scheduled' AND date < hoy ART` (no toca canceladas; UPDATE no dispara push). REVOKE. **Programa cron `auto-complete-orders` `0 6 * * *` (03:00 ART)**. :18-47

**Rate limiting del registro público**
- `20260710_rate_limit_pending_registrations.sql` — crea `rate_limit_pending_registrations()` (SECURITY DEFINER, BEFORE INSERT): **máx 10 solicitudes/min** + backstop **200 pendientes**, ambos `RAISE EXCEPTION ... USING ERRCODE='PT429'` (convención PostgREST → HTTP 429). REVOKE. :19-54

**Fix de borrado de órdenes + FKs**
- `20260720_fix_order_delete_leader_and_fk.sql` — `song_key_history.order_id` NO ACTION → **SET NULL** (borrar orden con historial ya no lanza 23503). Reemplaza policy DELETE de `orders`: `orders_delete_pastor` (`is_pastor()`) → `orders_delete_pastor_or_leader` (`is_pastor_or_leader()`). :11-23
- `20260803_fix_delete_fks.sql` — **familia completa** de FKs NO ACTION que bloqueaban deletes: `orders.band_id`→**SET NULL**, `song_key_history.song_id`→**CASCADE**, `song_key_history.member_id`→**CASCADE**, `pending_registrations.approved_by/rejected_by`→**SET NULL**. :27-50

**Ensayómetro (3 fases)**
- `20260803_practice_logs.sql` (F1) — **crea** `practice_logs` (`user_id DEFAULT auth.uid()` — el cliente nunca lo manda, `order_id`/`song_id` FK CASCADE, `times_practiced`, 3 bools de dominio, `difficulty` CHECK easy/medium/hard, `last_practiced_at`). `UNIQUE (user_id, order_id, song_id)`. RLS **owner-only** en los 4 verbos (WITH CHECK pin a `auth.uid()`). GRANT explícito a authenticated (regla #7). Sin triggers. :23-74
- `20260803_practice_alarms.sql` (F2) — **crea** `practice_alarms` (`user_id PK DEFAULT auth.uid()`, `enabled DEFAULT true`), RLS owner-only + GRANT. Crea `send_practice_reminders()` (SECURITY DEFINER): CTE que manda 1 push `reminder` por usuario con alarma ON, integrante de banda de ≥1 orden `scheduled` con fecha ≥ hoy y canciones, cuyo Ensayómetro (4 hitos/canción, sólo canciones vigentes) < 100%, **dedup diario matcheando el título `'🎸 Tu ensayo te espera'`**. REVOKE. **Programa cron `practice-reminders` `0 21 * * *` (18:00 ART)**. :15-136
- `20260803_practice_cleanup.sql` (F3) — crea `cleanup_practice_logs()`: `DELETE` de logs de órdenes no-`scheduled` con `date < hoy ART - 7` (gracia de 7 días). REVOKE. **Programa cron `practice-cleanup` `30 7 * * *` (04:30 ART)**. :13-38

### Edge Functions

**En el repo:** sólo `supabase/functions/send-push/index.ts`.
- `send-push` — fan-out de Web Push con payload cifrado **RFC 8291 aes128gcm** + VAPID (ES256), sin dependencias externas más allá de `@supabase/supabase-js`. Doble auth: `Bearer <push_internal_secret>` (server-to-server, el camino de los triggers) **o** `Bearer <user_jwt>` de un pastor/leader (valida rol contra `members`). :9-13, :196-201
  - Lee la config vía RPC `get_push_config()` con el service_role key (no toca `private` directo). :189
  - `body.to`: array de `member_id` o `'all'`; título ≤200, body ≤500, url ≤500 chars. Consulta `push_subscriptions` (`endpoint,p256dh,auth,member_id`). :204-219
  - **Autolimpieza:** si el push service responde **404/410** (endpoint muerto), borra esa fila de `push_subscriptions`. :230-234
  - Cripto: HKDF single-block (`hkdfExtract/Expand`), ECDH efímero P-256, framing `salt(16)||rs(4=4096)||idlen(1=65)||as_public(65)||ciphertext`. VAPID JWT exp +12h. :71-143, :57-68

**Desplegadas en Supabase pero NO en el repo** (documentadas por referencia en el código/CLAUDE.md):
- `admin-*` — 7 Edge Functions admin (ej. `admin-create-member`, `admin-delete-member`) que encapsulan operaciones con `service_role` (regla #6: sin service_role en cliente). `admin-create-member` es la **única** vía correcta para crear usuarios (crear vía SQL crudo rompe `auth.identities`). `service_role` **no exime FKs**, por eso `admin-delete-member` también dependía del fix `20260803_fix_delete_fks.sql`.
- `record-health-check` — la invoca `uptime.yml` con el anon key; escribe a `health_checks`. No está en el repo.
- Funciones DB referenciadas pero **sin migración en el repo**: `send_daily_devotional_notification()` y `check_notification_freshness()` (aparecen en el REVOKE de `20260530` pero se crearon vía MCP directo), igual que los crons `daily-devotional-notification`, `daily-reflection-notification` y `reflection-monitor`.

### Crons pg_cron (conocidos por las migraciones + CLAUDE.md)

| Cron | Schedule (UTC) | Hora ART | Función | Origen |
|---|---|---|---|---|
| `daily-devotional-notification` | 06:00 ART | 06:00 | `send_daily_devotional_notification()` | fuera del repo |
| `daily-reflection-notification` | 17:00 ART | 17:00 | `send_daily_reflection_notification()` | func en `20260427`, cron fuera del repo |
| `reflection-monitor` | cada 6 h | — | `check_notification_freshness()` (escribe a `error_log` si falta reflexión >25 h) | fuera del repo |
| `daily-birthday-notification` (jobid 7) | `0 12 * * *` | 09:00 | `send_daily_birthday_notifications()` | `20260516` |
| `rehearsal-reminders` | `*/15 * * * *` | c/15 min | `send_rehearsal_reminders()` | `20260620` |
| `auto-complete-orders` | `0 6 * * *` | 03:00 | `auto_complete_past_orders()` | `20260621` |
| `practice-reminders` | `0 21 * * *` | 18:00 | `send_practice_reminders()` | `20260803_practice_alarms` |
| `practice-cleanup` | `30 7 * * *` | 04:30 | `cleanup_practice_logs()` | `20260803_practice_cleanup` |

Nota TZ: ART es UTC-3 sin DST; los crons "diarios" convierten a mano (18:00 ART = 21:00 UTC). Las fechas ART se calculan con `now() AT TIME ZONE 'America/Argentina/Buenos_Aires'`.

### CI y uptime (GitHub Actions)

`.github/workflows/ci.yml` — job **`ci`** en push/PR a `main`: Node 24, `npm ci --legacy-peer-deps`, luego `lint` → `typecheck` (`tsc --noEmit`) → `test` (vitest) → `build`. El anon key y URL van como **repo variables** (no secrets) porque son públicos por diseño (RLS es el límite). :24-43
- Paso **"Smoke check bundle integrity"**: `grep -rE "service_role|supabaseAdmin" dist/assets/*.js` → **falla el build** si aparece (regla #6, control de regresión). :45-54
- Job **`smoke-prod`** (sólo push a `main`): espera 60 s el deploy de Vercel, luego hasta 5 intentos `curl -sSL` a `https://adorapp.net.ar/` esperando 200 + `<title>AdorAPP` + `/assets/index-` en el HTML. `-L` es necesario porque el apex hace 307 a www. :56-81

`.github/workflows/uptime.yml` — cron `*/5 * * * *` (reemplaza un pg_net cron viejo que no alcanzaba Vercel desde la red de Supabase). Mide latencia, valida 200 + shell SPA, y hace POST a la EF `record-health-check` con anon key. :8-55

Scripts npm relevantes (`package.json`): `lint` = `eslint src/ --max-warnings=90`, `typecheck` = `tsc --noEmit`, `test` = `vitest run`, `build` = `vite build`.

### `vercel.json` — headers de seguridad y CSP

- **Rewrites**: SPA fallback a `/index.html` excepto assets estáticos, `robots.txt`, `sw.js`, logos, `login-bg.jpg`, `assets/*`, `api/*`.
- **Headers globales** (`/(.*)`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera=self, mic/geo off, `interest-cohort=()`), **HSTS** `max-age=63072000; includeSubDomains; preload`.
- **CSP** estricta: `default-src 'self'`; `script-src 'self' 'unsafe-inline' 'unsafe-eval'`; `style-src` + `font-src` con Google Fonts; `img-src 'self' data: blob: https:`; `media-src` + `frame-src` limitados a YouTube; **`connect-src 'self' + el dominio Supabase (https + wss)`** (el `wss://` habilita Realtime); `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`.
- **Cache**: `/assets/*` immutable 1 año; `/sw.js` `max-age=0, must-revalidate` + `Service-Worker-Allowed: /`.

### `src/index.css` — fixes globales (varios de iOS/WebKit)

- Inputs/selects: `-webkit-appearance:none` + `min-height: 50px` para todos salvo `checkbox/radio/range/file/color` (iOS colapsa la altura de un `input[type=date]/[time]` vacío → Fecha se veía chica). :114-137
- `font-size: 16px` en inputs (evita el zoom de iOS al enfocar). :120
- `button` global: `-webkit-appearance:none` (iOS le impone forma push-button y deformaba los toggles pill) + **`touch-action: manipulation`** (mata el double-tap-to-zoom que "comía" el primer tap; los drag handles usan la clase `.touch-none` que gana por especificidad). :150-172
- `body`/`#root` `position:fixed inset:0` (app-feel, sin bounce); `env(safe-area-inset-*)` en `@supports`. :27-49, :180-190
- `@media (prefers-reduced-motion: reduce)` neutraliza animaciones. :102-111
- Keyframes del Ensayómetro F3: `confetti-fall` (drift por `--confetti-drift` inline) y `metronome-beat` (`animation-duration = 60/bpm` inline). :257-283

### Trampas y landmines

- **Regla #7 (GRANT de tablas nuevas):** toda tabla nueva en `public` necesita `GRANT ... TO authenticated` explícito (desde 30-oct-2026 Supabase no expone tablas nuevas al Data API por default). `practice_logs`/`practice_alarms` lo hacen; seguir el patrón.
- **Buckets de Storage necesitan RLS explícito** (landmine #5): un bucket con RLS ON y cero políticas rechaza todo INSERT. `avatars` lo sufrió (`20260618`). Además del GRANT de tablas, un bucket nuevo requiere policies sobre `storage.objects`.
- **`get_push_config()` sólo service_role** — `send-push` la usa con el service_role key; nunca exponerla a authenticated. El `push_internal_secret` vive en `private.app_secrets` (esquema no expuesto por PostgREST).
- **Funciones de cron blindadas** (landmine implícito, patrón repetido): SECURITY DEFINER + `search_path` fijo + `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`. `CREATE OR REPLACE` **resetea los grants**, así que hay que **re-assertar el REVOKE** después de cada replace (ver `20260803_ensamble_push_copy.sql`).
- **QA de funciones que insertan en `notifications`** (landmine #10): el INSERT dispara `notify_push_on_notification_insert` → push real. Probar SIEMPRE dentro de `BEGIN; SET LOCAL session_replication_role = replica; … ROLLBACK;`. **Excepción** (landmine #17): para probar el rate-limit de `pending_registrations` NO usar `replica` (apagaría el trigger que se quiere probar) — deshabilitar SÓLO `notify_on_pending_registration_insert` con `ALTER TABLE … DISABLE TRIGGER` dentro del `BEGIN…ROLLBACK`.
- **`orders.rehearsal_reminder_sent` lo escribe SÓLO el cron** (landmines #9, #13): nunca incluirlo en `convertOrderToDB`; una edición de orden lo pisaría y re-enviaría push. Reprogramar un ensamble con el flag ya `true` no re-avisa.
- **Fecha+hora del ensamble como `date` + `text`** (landmine #11), NO `timestamptz`: evita el off-by-one de TZ (un `timestamptz` 22:00 ART cae en el día UTC siguiente). El cron combina ambos en ART.
- **Dedup del push de práctica matchea por TÍTULO** (landmine #27): `send_practice_reminders()` deduplica con `n.title = '🎸 Tu ensayo te espera'`. Si cambia el copy del título, cambiar también el string del `NOT EXISTS` o se rompe el dedup (doble push el día del deploy). El progreso server-side (4 hitos/canción, sólo canciones vigentes) debe seguir en sync con `milestonesOf` de `Practica.jsx`.
- **`practice_alarms` opt-in, sin fila = apagada** (landmine #28): no crear filas por default para todos (spam masivo el primer día). El toggle optimista revierte si `setPracticeAlarm` devuelve null.
- **`practice_logs` owner-only por diseño** (landmine #25): el cliente NUNCA escribe `user_id` (lo pone el DEFAULT `auth.uid()`, RLS lo verifica con WITH CHECK). No agregar SELECT de práctica ajena "para el pastor": decisión de producto (herramienta personal, no auditoría).
- **FKs: nunca NO ACTION por default** (landmine #32): borrar una fila referenciada por una FK NO ACTION lanza 23503 y el handler fire-and-forget miente al usuario. Estado actual de FKs: `orders.band_id` SET NULL, `song_key_history.{song_id,member_id}` CASCADE, `song_key_history.order_id` SET NULL, `pending_registrations.{approved_by,rejected_by}` SET NULL, `practice_logs.*` CASCADE. Toda FK nueva hacia bands/songs/members/orders define su regla de DELETE explícita y se prueba impersonando un usuario **ACTIVO**.
- **Trampa de QA de RLS** (Estado 2026-08-03 V): hay filas de prueba con `role='pastor'` pero `active=false`; `auth_role()` exige `active=true`, así que impersonarlas hace que TODA la RLS dé false y los DELETE matcheen 0 filas sin error (falso negativo). Al impersonar, elegir siempre `AND active = true`.
- **Rate limit del registro es server-side** (landmine #16): el freno es el trigger `BEFORE INSERT`, no lógica de cliente. El `ERRCODE='PT429'` es lo que hace que PostgREST devuelva 429; si se cambia, actualizar el `if (insertError.code === 'PT429')` de `Login.jsx`.
- **iOS/WebKit en `index.css`** (landmines #23, #31): (a) el `min-height` global de inputs debe excluir checkbox/radio/range/file/color (se deformarían); (b) los toggles pill NO deben ser `<button>` (iOS los ovala aun con `appearance:none`) — usar el patrón `<label>` + checkbox `sr-only peer` + `<span>` track/knob; (c) `button` lleva `touch-action: manipulation` global (no quitarlo) y los drag handles deben seguir usando `.touch-none` (clase > elemento). Estos bugs NO se reproducen en Chromium; validar en iPhone real.
- **CI: integrity grep** — el build **falla** si `service_role`/`supabaseAdmin` aparecen en el bundle. No importar ni referenciar esos símbolos en código de cliente.
- **CSP `connect-src`** — sólo permite `'self'` + el dominio Supabase (https + wss). Cualquier host nuevo (otra API, otro Supabase) debe agregarse explícitamente a `vercel.json` o las requests se bloquean silenciosamente en prod.
