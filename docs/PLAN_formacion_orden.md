# Plan: Formación del orden (quiénes tocan en cada servicio, y en qué)

> Estado: **IMPLEMENTADO (2026-09-11)** — PR #104 (base, migración `20260911_order_lineup.sql`), PR #105 (cliente) y PR de docs. Resumen de lo hecho, decisiones finales de Paul y landmines #52–#57 en `CLAUDE.md` → "Estado al 2026-09-11 (II)". Lo que sigue es el estudio original, conservado como contrato de diseño.
>
> Estado original: **ESTUDIO TERMINADO, SIN CÓDIGO (2026-09-11).** Pedido de Paul: al armar un orden, un asistente para definir la **formación** (qué integrantes de la banda tocan ese día y con qué instrumento), que se informe en el mismo mail del orden y que los avisos de práctica (ensamble/ensayo) lleguen **solo** a los que participan. Este documento es el contrato para implementarlo. Las preguntas de §1 las decide Paul antes de escribir código.

Glosario: "ensamble" = encuentro de la banda; "ensayo" = práctica personal (Mi Ensayo). "Orden" es masculino. "Formación" = la lista de quiénes participan de un orden y con qué instrumento.

---

## 0. En una página (para Paul)

**Qué pasa hoy.** Cada banda tiene integrantes permanentes y temporales. Cuando se guarda un orden, TODOS los integrantes reciben lo mismo: el mail del orden, el push "Nuevo orden", el aviso 2 h antes del ensamble y la alarma de ensayo de las 18:00. Si en Banda Sábado hay dos bateristas (Luca y Marcos) y ese sábado toca uno solo, el otro igual recibe "hoy tenés ensamble" y "tu ensayo te espera".

**Qué propongo.** Que al guardar un orden aparezca la **Formación**: un solo toque para "Participan todos", o un selector premium para marcar quiénes y con qué instrumento. Esa formación:
- se guarda dentro del propio orden (una columna nueva, no una tabla aparte);
- aparece en el detalle del orden, en el mail del orden (bloque "Formación", con una línea personal: *"Vos participás como Batería"* / *"Esta vez no estás en la formación"*), y en el PDF;
- **limita** el aviso de ensamble y la alarma de ensayo a los participantes;
- **no limita** la información general: el orden, las canciones, el mail "nuevo orden" y el push siguen llegando a toda la banda;
- si un orden no tiene formación (los viejos, o si el líder decide no definirla), todo funciona exactamente como hoy.

**Lo que más importa decidir (§1):** en qué momento aparece el asistente. Vos dijiste "una vez guardado". Verificado en la base: el mail "nuevo orden" **se dispara en el mismo instante en que se guarda el orden** (trigger de INSERT). Si la formación se define después de guardar, ese mail ya salió sin ella. Mi recomendación: que el asistente aparezca **al tocar "Guardar"** y que el orden se grabe con la formación adentro (para el líder es la misma experiencia: arma el orden → toca Guardar → elige formación → listo). Detalle y alternativas en §3.2.

**Valor agregado que sugiero (§5):** sugerencia de rotación ("le toca a Marcos: la última vez tocó Luca el 29/08"), directores de canción incluidos automáticamente en la formación, alerta de cobertura ("esta formación no tiene bajo"), aviso puntual solo a quien entra/sale de una formación si se cambia después, la formación en el presentador "Iniciar servicio", y el arreglo de dos huecos que encontré de paso (el mail "nuevo orden" no llega a los temporales ni a los pastores; el detalle del orden no muestra el ensamble).

---

## 1. Decisiones de producto (a cerrar por Paul antes de codear)

| # | Pregunta | Recomendación | Por qué |
|---|---|---|---|
| 1 | **¿Cuándo aparece el asistente?** (a) al tocar "Guardar", antes de grabar; (b) después de guardar, demorando el mail unos minutos; (c) después de guardar, con un segundo mail "Formación". | **(a)** | Es la única forma de que el mail del orden lleve la formación sin trucos. Para el usuario es un paso más del mismo guardado. (b) funciona pero es frágil (si el líder tarda más que la demora, el mail sale sin formación); (c) duplica mails. |
| 2 | ¿Quién define/edita la formación? | **Pastor y líder** (los mismos que crean/editan el orden). | Misma regla y misma RLS de `orders`. |
| 3 | Los directores de canciones del orden, ¿entran solos a la formación? | **Sí, y no se pueden quitar** (chip "dirige N canciones"). | Un director que no participa es un orden inconsistente. Si hay que sacarlo, se cambia el director en el orden. |
| 4 | ¿Un integrante sin instrumento cargado (hoy: Damaris) puede participar? | **Sí**, como "participa" sin instrumento, con un recordatorio suave para completar la ficha. | No bloquear el armado por un dato de perfil. |
| 5 | Si la formación se cambia después de publicado el orden, ¿a quién se avisa? | **Solo a los afectados**: al que entra ("Te sumaron a la formación del 12/09 · Batería") y al que sale ("Ya no estás en la formación del 12/09"). Sin mail a toda la banda. | Evita spam; el cambio no altera el orden en sí. |
| 6 | ¿Mi Ensayo (Practicar este orden) para los que NO están en la formación? | **Visible**, con una nota "Esta vez no estás en la formación"; sin alarma de 18:00 ni aviso de ensamble. | Info general para todos, práctica puntual para los que tocan. |
| 7 | Sugerencia de rotación al abrir el selector | **Sí** (sección §5.1). Sin historial, no sugiere nada. | Es justo el caso de los bateristas del sábado. |
| 8 | Línea personal en el mail ("Vos participás como…") | **Sí**. | El mail ya se arma por destinatario; no cuesta nada y es la parte más clara para cada músico. |
| 9 | Arreglar de paso el mail "nuevo orden" (hoy NO llega a los temporales ni a los pastores) | **Sí**, en el mismo PR de servidor. | Ya estaba anotado como hueco en CLAUDE.md (Estado 2026-09-06); tocamos esa función igual. |
| 10 | Mostrar la formación en el PDF del orden y en "Iniciar servicio" | **Sí** (barato, misma fuente de datos). | Coherencia: todo lo que muestra el orden muestra su formación. |
| 11 | **Formación ≠ membresía.** Un líder que arma una formación `custom` deja fuera a alguien *para ese servicio*. ¿Choca con la regla "el líder solo agrega, no quita" (plan de membresías)? | **No choca, pero hay que decirlo explícito:** la persona sigue en la banda, sigue viendo el orden, sigue recibiendo la info general; solo no recibe los avisos de práctica de ese servicio. Confirmar que Paul lo acepta así. | La regla protege la pertenencia (estructural). La formación es operativa y por orden. |

---

## 2. Hallazgos verificados (código y base, 2026-09-11)

### 2.1 Cómo viaja hoy un orden
- Cliente: `Ordenes.jsx` `handleSubmit` (:276-326) → `addOrder(orderPayload)` (`appStore.js:883`) hace `INSERT` con `id` generado en el cliente; después sella `songs.last_used` y guarda `song_key_history` por director; **cierra el modal sin modal de éxito**. Editar → `updateOrder` (merge anti-DATA-LOSS + `convertOrderToDB`, :917).
- `orders.songs` es jsonb `[{songId, key, directorId, _localId, _pendingHistory, _suggestedDirector}]`: los tres `_` son basura de UI que hoy se persiste (deuda anotada en landmine #51). `_pendingHistory` no lo lee nadie.
- `convertOrderFromDB/ToDB` (:218 / :306) mapean 12 campos; **cualquier columna nueva en `orders` DEBE entrar en los dos converters** o `updateOrder` la pisa con NULL (regla #8).
- Triggers en `orders`: `audit_orders`, `notify_on_order_insert` (AFTER INSERT), `notify_order_update` (AFTER UPDATE), `update_orders_updated_at`.
- RLS de `orders`: INSERT/UPDATE/DELETE `is_pastor_or_leader()`, SELECT `true`.

### 2.2 Quién recibe qué hoy (fuente: definiciones vivas en la base)
| Envío | Momento | Destinatarios hoy | Qué debería pasar con formación |
|---|---|---|---|
| Push global "Nuevo orden" | INSERT | `is_global=true` → todos los dispositivos | Igual (info general). |
| Mail `nuevo-orden` | INSERT (mismo trigger) | **`bands.members` crudo** (solo permanentes; **sin temporales, sin pastores**) — hueco conocido | Miembro efectivo ∪ pastores + bloque **Formación** + línea personal. |
| Mail `orden-editado` + campanita/push | UPDATE de contenido (`songs/date/time/band_id/meeting_type`), throttle 90 s | `band_effective_member_ids ∪ pastores − editor` | Igual + bloque Formación. Un cambio SOLO de formación NO dispara esto (aviso puntual a afectados, §3.5). |
| Push+mail "¡Hoy tenés ensamble!" (`send_rehearsal_reminders`, cron 15 min) | 2 h antes del ensamble, una vez | `band_effective_member_ids` | **Solo participantes.** |
| Push "🎸 Tu ensayo te espera" (`send_practice_reminders`, 18:00) | diario, con alarma activada, Ensayómetro < 100 % | `band_effective_member_ids` | **Solo participantes.** |
| Card "¡Hoy tenés ensamble!" (Dashboard) | día del ensamble 08–23 h | **cualquier orden con ensamble hoy, sin filtrar por banda ni miembro** (hallazgo: hoy se lo muestra a todos) | Solo participantes. |
| PrepBanner "Tu preparación" (Dashboard) | próximo orden programado | miembro efectivo de la banda | Solo participantes. |
| `ServiceFeedbackPrompt` | post-servicio | pastor/líder de la banda | Igual. |
| Colaboración (`collab_create`) | pedido de reemplazo | elegibles = fuera de la banda efectiva | Igual. |
| Esquema / Iniciar servicio (`am_i_in_order_band`) | RLS de lectura | miembro efectivo de la banda | Igual (info general). |

### 2.3 Modelo de personas e instrumentos
- `members.instruments text[]` con valores de `INSTRUMENTS` (`appStore.js:1418`): Voz, Guitarra Eléctrica, Guitarra Acústica, Piano, Teclado, Batería, Bajo, Violín, Flauta, Saxofón, Trompeta, Coros. En vivo hoy: 9 valores usados. **Damaris tiene `[]`.** Leandro tiene 4 (el caso que citó Paul).
- Bandas reales: Martes 7, Av. Mujer 2, Sábado 10 (bateristas: Luca Molina y Marcos Vazquez; bajistas: Gustavo, Juan Emanuel y Luca), Jóvenes 12, Domingo 11. Hay 1 temporal vigente.
- El selector de director de canción (`singers`, `Ordenes.jsx:134`) = miembros efectivos activos con "Voz". **Usa un `<select>` nativo del navegador** (contra la regla estética de Paul); ver §5.6.

### 2.4 Infraestructura reutilizable
- **Modal "Agregar miembro" de Bandas** (`Bandas.jsx:547-652`): lista de personas con Avatar + nombre + instrumentos, tarjeta seleccionada con borde dorado y check en círculo `bg-gold-gradient`, buscador con normalización de acentos, switch iOS-safe. Es la base estética del selector de formación.
- `SelectMenu` (desplegable propio, bottom-sheet en móvil), `Button` (primary dorado / secondary / ghost), `Badge` (`gold`, `primary`), `IconBadge` (Phosphor duotone dorado), `GoldWave`, `Avatar` dorado, `ConfirmModal/SuccessModal/ErrorModal`, `Modal` (portal + historial; `size` sm/md/lg/xl; footer flex).
- `SchemaBuilderModal` como precedente de "armador" que se abre desde el detalle del orden.
- Correo: `encolar_email(slug, to, nombre, variables jsonb, prioridad)` → `email_queue` (`programado_para` lo respeta el worker; prioridad ≤ 1 = carril rápido). Plantillas en `email_templates.cuerpo_html` con `{{variables}}` **RAW** (escapar siempre; no hay condicionales → los bloques opcionales se pasan como HTML ya armado o cadena vacía).
- Push: `notifications` con `is_global` o `user_id`; `type` en CHECK (`order`, `reminder`, …). El cliente nunca inserta.
- Digest diario (`activity_digest_items`) clasifica por campos reales: **una columna nueva debe mapearse** (landmine #51).

### 2.5 Hallazgos colaterales (se arreglan en el camino, Regla de Oro §5)
1. Mail `nuevo-orden` no llega a temporales ni pastores (§2.2).
2. Card "¡Hoy tenés ensamble!" del Dashboard no filtra por banda/miembro: cualquiera con la app ve el ensamble de cualquier banda.
3. El **detalle del orden no muestra fecha/hora del ensamble** (ni el PDF), aunque la card del inicio te manda ahí "para ver el orden".
4. `cloneOrder` copia `rehearsalDate/Time` del original (ensamble viejo en el clon).
5. `orders.songs` persiste `_localId/_pendingHistory/_suggestedDirector` (landmine #51).
6. Selector de director = `<select>` nativo.
7. La Edge Function `send-service-feedback` (mail post-servicio) también lee `bands.members` crudo (sin temporales). Fuera de alcance, pero anotado.
8. El push de `notifications` lleva `url: '/'` fijo (trigger `notify_push_on_notification_insert`): un aviso de formación no puede deep-linkear al orden sin tocar ese trigger. Se acepta (el aviso dice fecha y banda; la campanita alcanza).
9. La plantilla `nuevo-orden` **viva** difiere del repo (los pastores pueden editar plantillas desde la UI; el seed es `ON CONFLICT DO NOTHING`). Cualquier cambio de plantilla se hace con `UPDATE … SET cuerpo_html = replace(...)`/concatenación sobre el cuerpo vivo, verificado antes en la base, nunca pisando con el texto del repo.
10. `INSTRUMENTS` está duplicado en cliente y en la EF `collab`. El validador de formación **no** necesita una tercera copia: valida contra `members.instruments` de cada persona (lo que no tenga cargado, se descarta).

---

## 3. Diseño

### 3.1 Modelo de datos: columna `orders.lineup jsonb` (no una tabla aparte)

```json
{
  "mode": "all" | "custom",
  "members": [ { "memberId": "<uuid>", "instruments": ["Batería"] }, ... ],
  "definedBy": "<member uuid>",
  "definedAt": "2026-09-11T14:02:00Z"
}
```
- `NULL` = sin formación (órdenes viejos / no definida) → **se comporta como hoy**.
- `mode: "all"` → participantes = `band_effective_member_ids(order.band_id)` **al momento de cada envío** (dinámico: un temporal que se sume después queda incluido). `members` vacío.
- `mode: "custom"` → participantes = `members[]` (estático; `instruments` puede ser `[]` para el caso Damaris).
- **Por qué columna y no tabla:** (1) viaja en el **mismo INSERT** → el trigger del mail ya la tiene (decisión 1a); (2) la auditoría y el digest de `orders` la cubren sin trigger nuevo; (3) `updateOrder` merge-safe ya existe; (4) la RLS de `orders` ya da la regla pastor/líder. Una tabla `order_lineups` obligaría a dos escrituras no atómicas y a repetir GRANT/RLS/realtime/localStorage.
- Helper SQL **`order_participant_ids(p_order_id uuid) RETURNS uuid[]`** (STABLE, `search_path` fijo, REVOKE de authenticated; lo usan crons y triggers como owner): `custom` → miembros de la lista que sigan activos; si no → `band_effective_member_ids(band_id)`. Espejo JS en el store: `getOrderParticipantIds(order)` + `isOrderParticipant(order, memberId)` (test de paridad con casos null/all/custom).

### 3.2 Momento y flujo del asistente (decisión 1)
**Crear orden (recomendado, 1a):** el botón "Guardar orden" del formulario pasa a abrir el paso **Formación** dentro del mismo modal (cabecera "Paso 2 de 2 · Formación", con un resumen del orden arriba: fecha, banda, N canciones, ensamble si hay). Dos acciones grandes, a la altura del pulgar:
1. **"Participan todos"** — tarjeta dorada (primary): guarda el orden con `lineup.mode='all'`. Un toque.
2. **"Elegir la formación"** — tarjeta secundaria: abre el selector (§3.3). Su "Guardar formación" graba orden + formación juntos.
Un "Volver" arriba permite retocar el orden. Cerrar el modal en este paso = cancelar el guardado (con `ConfirmModal`: "El orden todavía no se guardó. ¿Salir sin guardar?"). No hay "saltear": "Participan todos" es el atajo (equivale al comportamiento de hoy).

**Alternativa 1b (si Paul prefiere después del guardado):** el trigger encola el mail con `programado_para = now() + 5 min` y un trigger `AFTER UPDATE OF lineup` re-arma las filas `pending` de ese orden con el bloque. Funciona, pero si el líder tarda > 5 min el mail sale sin formación y la ventana hay que explicarla. **Descartada salvo pedido expreso.**

**Editar orden existente:** el modal de edición NO fuerza el paso Formación (para no molestar en cada retoque); al guardar, si el orden ya tiene formación `custom` y cambió la banda o se quitó un director, se avisa y se ajusta. La formación se edita desde el **detalle del orden** (bloque "Formación" → botón "Definir formación"/"Editar formación", pastor/líder), que abre el mismo selector en modo standalone → `updateOrder(id, { lineup })`.

### 3.3 El selector de formación (UX premium, sin controles del navegador)
- **Cabecera**: `IconBadge` (Phosphor `UsersThree` duotone) + "Formación · Banda Sábado · sáb 12/09" + contador vivo "7 de 10 participan". Botones chip "Todos" / "Ninguno". Buscador (mismo patrón de Bandas, normaliza acentos) que aparece si la banda tiene > 6 integrantes.
- **Resumen por instrumento** (fila de chips dorados): "Batería 1 · Bajo 1 · Voz 3 · Guitarra Eléctrica 1…". Chip **ámbar** si un instrumento que existe en la banda quedó sin nadie: "Sin bajo" (alerta de cobertura, no bloquea).
- **Lista de integrantes** (tarjetas como las del modal de Bandas): `Avatar` dorado, nombre, rol (`Badge`), badge "Temporal · vence DD/MM" si corresponde, chip "dirige N canciones" (bloqueado como participante, decisión 3). Tocar la tarjeta alterna participa/no participa (borde dorado + check `bg-gold-gradient`). Al participar, debajo aparecen sus **instrumentos como chips toggle** (todos marcados por defecto; el que tiene 4 desmarca 3). Sin instrumentos → chip gris "Sin instrumento cargado" + link "Completar ficha" (solo pastor) o texto para pedirlo.
- **Sugerencia de rotación** (§5.1): tarjeta sutil arriba de la lista: "Sugerencia por rotación: Batería → Marcos Vazquez (la última vez tocó Luca, 29/08)". Botón "Aplicar sugerencia". Nunca pre-marca sola; el líder decide.
- **Orden de la lista**: participantes sugeridos/marcados primero, después por instrumento principal, después por nombre. Temporales al final de su grupo con badge.
- **Footer fijo**: "Volver" (ghost) · "Guardar formación" (primary, deshabilitado si 0 participantes). Móvil: `size="lg"`, lista scrolleable entre header y footer (Modal ya lo resuelve), tarjetas con alto ≥ 56 px.
- Estética: fondo `bg-neutral-900`, bordes `border-neutral-800`, seleccionado `border-gold-500/60 bg-gold-500/10`, `GoldWave` decorativa en la cabecera del paso "Participan todos" (opacidad baja). Nada de `<select>`, `<input type=checkbox>` visibles ni `alert()`.

### 3.4 Dónde se ve la formación
- **Detalle del orden**: bloque "Formación" debajo de las canciones: si `all` → `Badge gold` "Participan todos (N)"; si `custom` → grupos por instrumento con avatares chicos + nombres ("Batería: Marcos Vazquez · Bajo: Gustavo Godoy · Voz: Melanie Tomaselli, Karen García"); miembros sin instrumento en "Participan". Botón Definir/Editar (pastor/líder). Se aprovecha para mostrar también **Ensamble: fecha · hora** (hallazgo 2.5.3).
- **Tarjeta del orden en la lista**: pill "👥 7" o "Todos".
- **Dashboard**: en "Próximos servicios", para el usuario actual, chip "Tocás: Batería" / "No estás en la formación". La card "¡Hoy tenés ensamble!" y el PrepBanner pasan a usar `isOrderParticipant` (y la card además filtra por banda del usuario: hallazgo 2.5.2).
- **Mi Ensayo**: si no participa, banda superior sobria "Esta vez no estás en la formación de este orden. Podés practicar igual." (decisión 6).
- **PDF del orden** y **Iniciar servicio** (primera pantalla): sección "Formación" (decisión 10).
- **Mail**: bloque `{{formacion}}` (HTML armado en la base, escapado): título "Formación para este servicio", líneas por instrumento, y `{{tu_participacion}}` personal: "Vos participás como Batería." / "Esta vez no estás en la formación; te avisamos igual para que estés al tanto." Si `all`: "Participa toda la banda." Si `NULL`: bloque vacío (mail idéntico al de hoy).

### 3.5 Servidor (migración única, 100 % aditiva)
1. `ALTER TABLE orders ADD COLUMN lineup jsonb NULL` (sin default; `NULL` = hoy).
2. Trigger `BEFORE INSERT OR UPDATE OF lineup` **`validate_order_lineup`** (SECURITY INVOKER): normaliza y valida — `mode` ∈ {all, custom}; `members[].memberId` ⊆ `band_effective_member_ids(NEW.band_id)` (si no → `RAISE` P0001 con mensaje claro); `instruments` ⊆ `members.instruments` del miembro (los que no correspondan se descartan); sin duplicados; `definedBy` = `my_member_id()` cuando hay JWT (nunca confiar en el cliente); `definedAt = now()`. Si `mode='all'` → `members := []`. Cambiar `band_id` con `custom` → el trigger filtra los que ya no están en la banda nueva (y avisa vía `RAISE NOTICE`; el cliente muestra el ajuste).
3. `order_participant_ids(uuid)` (§3.1) + `_lineup_html(order, member_id)` (arma el bloque y la línea personal, escapado con `_html_escape`).
4. `send_rehearsal_reminders` y `send_practice_reminders`: reemplazar `band_effective_member_ids(b.id)` por `order_participant_ids(o.id)` (re-asertar REVOKE/GRANT: landmine #39).
5. `notify_on_order_insert`: destinatarios `band_effective_member_ids ∪ pastores activos` (cierra hueco 2.5.1); variables `formacion`, `tu_participacion`. Plantilla `nuevo-orden`: agregar `{{formacion}}` en el cuerpo (UPDATE de `email_templates`; si la variable llega vacía, no se ve nada).
6. `notify_on_order_update`: (a) guard actual intacto para contenido; suma `formacion/tu_participacion` al mail `orden-editado`; (b) **rama nueva** solo-formación: si `NEW.lineup IS DISTINCT FROM OLD.lineup` y nada más cambió → diff de participantes (resolviendo `all` contra la banda efectiva) → notificación `type='order'` + mail corto (`formacion-cambio`, plantilla nueva) SOLO a los que entran/salen, excluyendo al editor; throttle `lineup_edit:<order>` 90 s. Todo en BEGIN/EXCEPTION (landmine #49).
7. Digest: `activity_digest_items` → clave `lineup` → prio 65 "definió la formación de órdenes: del DD/MM (N integrantes / todos)" (landmine #51).
8. Plantilla nueva `formacion-cambio` (asunto "Cambio en la formación del {{fecha}}"), `INSERT ... ON CONFLICT (slug) DO NOTHING`.
9. Notificaciones del aviso puntual: `type='order'` (ya está en el CHECK `notifications_type_check`; un tipo nuevo obligaría a extenderlo, landmine 23514). Push sin deep-link (hallazgo 2.5.8).
10. `instruments` de la formación es una **foto** al momento de definirla (validada contra `members.instruments` de ese momento). Si después el músico cambia sus instrumentos en su ficha, la formación no se reescribe; el selector avisa si al editar hay chips que ya no coinciden.

### 3.6 Cliente
- Store: `lineup` en `convertOrderFromDB/ToDB` (**obligatorio**, regla #8; `lineup: o.lineup ?? null` en ambos sentidos); `getOrderParticipantIds`, `isOrderParticipant`, `getOrderLineupView(order)` (agrupa por instrumento con objetos de miembro); `suggestLineupRotation(bandId, orderDate)` (§5.1). De paso, `convertOrderToDB` **stripea `_localId/_pendingHistory/_suggestedDirector`** de `songs[]` (hallazgo 2.5.5; `_suggestedDirector` se recalcula en el form al abrir).
- `Ordenes.jsx`: el "Guardar" del modal es un `Button onClick={handleSubmit}` (no hay `<form>`), así que interceptar el paso Formación es directo: `handleSubmit` valida y, en vez de grabar, pasa a `step='lineup'`; el grabado real se hace desde el asistente con `orderPayload` + `lineup`. Bloque Formación + Ensamble en el detalle; pill en la tarjeta; PDF. **`viewingOrder` es una foto, no el store**: al guardar formación desde el detalle hay que parchearla como hace `handleChangeStatus`.
- Chips de instrumento: reutilizar el pill de `RequestCollaborationButton.jsx:104-117` (`rounded-full`, dorado al activar, `Check` 14 px).
- Componente nuevo `src/components/orders/LineupAssistant.jsx` (paso "todos / elegir") + `LineupPicker.jsx` (selector) + `LineupSummary.jsx` (vista compacta reutilizada en detalle, Dashboard, presentador). Lógica pura en `src/lib/lineup.js` (participantes, cobertura, rotación, agrupado) con tests.
- Dashboard/PrepBanner/Practica/IniciarServicio: `isOrderParticipant` (§3.4).
- `cloneOrder`: no copiar `rehearsalDate/Time` ni `lineup` (el clon arranca sin formación → el asistente aparece al guardar). Hallazgo 2.5.4.
- Selector de director → `SelectMenu` (hallazgo 2.5.6), mismo PR de cliente, verificado en Chromium que sigue guardando `directorId` y disparando el historial de tono.

---

## 4. Seguridad y pruebas adversariales (Regla de Oro §3-bis)
- **Un líder mete a alguien ajeno a la banda en la formación** (POST directo con un `memberId` de otra banda) → `validate_order_lineup` rechaza. Sin el trigger, esa persona recibiría avisos de una banda que no integra.
- **JSON malformado / claves extra / instrumentos inventados** → el trigger normaliza o rechaza; nunca llega basura a los crons.
- **`definedBy` falsificado** → lo pisa el trigger con `my_member_id()`.
- **Rol `member` intenta escribir `lineup`** → RLS de `orders` (UPDATE = pastor/líder) lo frena (verificar con impersonación, usuario `active=true`, trampa de landmine #32).
- **Cambio de banda con formación custom** → participantes filtrados; no quedan "fantasmas".
- **Doble submit / carrera** en el asistente: botón deshabilitado + `submitting`; el INSERT tiene id de cliente → un reintento es idempotente por PK.
- **Fallo del aviso puntual** (rama solo-formación) jamás rompe el `UPDATE` (BEGIN/EXCEPTION, verificado rompiendo `encolar_email` a propósito).
- **Un miembro que dejó de estar activo** en una formación custom → `order_participant_ids` lo filtra por `active`.
- **Digest**: cambiar solo `lineup` no se reporta como "editó datos de órdenes" (mapeo explícito).
- Advisors de Supabase: 0 alertas nuevas (helpers con REVOKE).
- **Volumen de correo**: el worker manda un mail por corrida con piso de 5 min por destinatario; el aviso solo-formación es chico (los afectados, típicamente 1-3 personas). El fix del mail `nuevo-orden` suma temporales + pastores (2-3 destinatarios más por orden).

## 5. Valor agregado propuesto
1. **Rotación asistida.** Al abrir el selector, para cada instrumento con ≥ 2 candidatos en la banda, mirar las formaciones `custom` anteriores de esa banda (`orders.lineup`, últimos 120 días) y sugerir al que **menos recientemente** tocó ese instrumento. Texto: "Batería → Marcos Vazquez (la última vez tocó Luca, 29/08)". Sin historial → sin sugerencia. Botón "Aplicar sugerencia". Con el tiempo, esto es el "cada 15 días" que hoy lleva alguien en la cabeza.
2. **Directores incluidos y bloqueados** (decisión 3): coherencia orden ↔ formación.
3. **Alerta de cobertura**: "Sin bajo / Sin batería" en ámbar; no bloquea.
4. **Aviso puntual al cambiar la formación** (decisión 5): el que entra recibe push + mail cortos con fecha e instrumento; el que sale, un aviso sobrio. Nada a los demás.
5. **Línea personal en el mail** (decisión 8) y chip "Tocás: Batería" en el inicio.
6. **Optimización de paso**: `SelectMenu` para el director (adiós `<select>` nativo), ensamble visible en el detalle y en el PDF, `cloneOrder` sin ensamble/formación heredados, limpieza de `_localId` en `orders.songs`, card de ensamble filtrada por banda.
7. **Para después (no en este alcance)**: contador de participaciones por integrante (equidad de rotación), plantillas de formación por banda ("Formación A / Formación B" para alternar con un toque), y el mismo asistente en la Colaboración (el voluntario aceptado entra directo a la formación del orden).

## 6. QA (obligatorio antes de cada merge)
- **DB transaccional** (`BEGIN … RAISE EXCEPTION` → rollback): helper con `NULL/all/custom`; trigger de validación (casos §4); crons en `session_replication_role=replica` con órdenes sintéticos (participante recibe, no participante no, `all` incluye temporal vigente, `custom` excluye inactivo); insert/update con mails leídos de `email_queue.variables` (bloque y línea personal por destinatario; `NULL` → mail idéntico al de hoy, byte a byte); rama solo-formación (entra/sale, throttle, editor excluido); digest.
- **Chromium real (390 px + hasTouch)**: crear → "Participan todos"; crear → selector (toggle persona, toggle instrumento, buscador, Todos/Ninguno, director bloqueado, cobertura ámbar, sugerencia aplicada, guardar 0 participantes deshabilitado); editar formación desde el detalle; cancelar en paso 2 no guarda; detalle/Dashboard/Mi Ensayo/PDF muestran lo correcto para participante y no participante; `SelectMenu` de director guarda y dispara historial; 0 errores de consola.
- **Paridad** JS↔SQL de `order_participant_ids` (test unitario con fixtures compartidas).
- Lint + build + tests + smoke prod; advisors 0 nuevas.

## 7. Orden de PRs (cada uno se mergea solo con OK de Paul)
- **PR 1 — Servidor** (`feat/formacion-orden-db`): columna + trigger de validación + helpers + crons + triggers de mail + plantillas + digest. Con `lineup` NULL nada cambia para nadie; con el fix de destinatarios del mail `nuevo-orden`, los temporales y pastores empiezan a recibirlo (único cambio visible, deseado).
- **PR 2 — Cliente** (`feat/formacion-orden-cliente`): store + asistente + selector + detalle + Dashboard + Mi Ensayo + PDF + presentador + `SelectMenu` de director + `cloneOrder` + strip de `_localId`.
- **PR 3 — Docs** (`docs/...`): CLAUDE.md (Estado + landmines nuevos: "toda columna nueva de orders va en los dos converters y en el digest"; "formación = `order_participant_ids`, nunca `band_effective_member_ids` para avisos del servicio"; "aviso solo-formación NO pasa por la rama de contenido"), ARCHITECTURE.md, este plan marcado como implementado.

## 8. Riesgos y no-regresión
- Cero impacto hasta que un orden tenga `lineup`. Los 8 órdenes existentes quedan `NULL` → comportamiento actual.
- Los 7 consumidores de pertenencia (plan de membresías §1.3) NO se tocan salvo los 2 crons y las 3 vistas del Dashboard/Mi Ensayo; el grep `band_effective_member_ids|getEffectiveBandMemberIds` se repite al cerrar para confirmar que la info general sigue siendo banda-completa.
- `CREATE OR REPLACE` de los crons resetea grants → re-asertar (landmine #39). `email_templates` es RAW → escapar (landmine #48).
