# Plan — Multi-área (observadores de Multimedia y Sonido + área universal)

> Estudio y contrato de implementación. **Sin código aplicado todavía.** Escrito el 2026-09-11.
> Metodología: Regla de Oro (panorama total, verificación empírica, pruebas adversariales, cero-romper, informe en criollo).

## 0. Qué pidió Paul (decisiones cerradas)

1. **Área universal.** Todos los miembros/líderes actuales pasan a área **"Adoración"** (son de esa área). Los **pastores** son **"multiárea"** (alcanzan todo).
2. **Dos áreas observadoras nuevas: Multimedia y Sonido.** Usuarios que NO son de banda, con acceso de **solo-lectura a todo** lo que ve un miembro común, que **exportan lo exportable**, y que **no pueden editar ni eliminar nada**.
3. **Correo de TODOS los órdenes** (de todas las bandas) para Multimedia y Sonido. Recomendación aceptada.
4. **Al mail del orden se agrega fecha/hora del ENSAMBLE** — para **todos** (banda, pastores y áreas), no solo las áreas.
5. **Presentador "Iniciar servicio"** habilitado para **ambas** áreas (Multimedia y Sonido).
6. **Cambio SOLO de formación** después de publicado → avisar por mail también a **Sonido**. Y **cualquier cambio en el orden de canciones** → avisar por mail a **ambas** áreas.
7. **Un usuario puede pertenecer a banda Y a área a la vez** y quedarse con **la unión** de lo que cada categoría le permite (ej.: músico de Adoración que también hace Sonido). Si fuera peligroso, una sola área por miembro — pero se resuelve sin riesgo (ver §2).
8. **Estructura lista para más áreas** (intercesión, danza, anfitriones…), pero cada área nueva se aborda **individualmente** en cuanto a sus funciones. Se deja el andamiaje, no las áreas.
9. **Devocionales y reflexiones por push = universales** para cualquier miembro. **Ya es así** (ver §1): no requiere código.
10. Estándar: **exquisito, premium y seguro; aditivo; sin romper ni dejar nada inestable; doble certeza.**

## 1. Hallazgos verificados en vivo (hoy, prod `gvsoexomzfaimagnaqzm`)

- **`members` NO tiene columna de área.** Tiene `pastor_area` (texto libre = **el pastor que cubre** a la persona: "Abel Casals", "Pastores Tomaselli"…). **No es un área de ministerio** → el campo nuevo es independiente y no toca `pastor_area`.
- `members` ya tiene un patrón de array: **`instruments text[]`** → el área nueva se modela igual (`areas text[]`), idiomático y de mínima superficie.
- **A etiquetar Adoración:** `role IN ('leader','member') AND active` = **28** (4 líderes + 24 miembros). Pastores activos: **2**.
- **Ensamble** = `orders.rehearsal_date date` + `orders.rehearsal_time text` ('HH:MM'). (No hay timestamptz — evita el off-by-one, landmine #11.)
- **Políticas SELECT:** `orders/songs/bands/members` = `true` (cualquier autenticado lee todo, solo-lectura). `service_schemas` SELECT = `is_pastor_or_leader() OR am_i_in_order_band(order_id)` → **único lugar cerrado a un no-banda**. `schema_templates` SELECT = `is_pastor_or_leader` (biblioteca de plantillas del pastor; NO se toca).
- **Devocionales/Reflexiones:** en `notifications` ambos son `is_global=true, user_id NULL` → el trigger `push_on_notification_insert` los manda a **todos** los dispositivos. Un usuario de área, al ser `member`, ya los recibe. **Nada que construir.**
- **Escrituras** (todas): songs/orders/bands/members write = pastor/líder (+ editor en songs). Un `role='member'` **no puede escribir nada** → los observadores son read-only **por diseño existente, sin cambios**.
- `enforce_member_update_rules` (SECURITY INVOKER, landmine #41) congela `role/editor/active/user_id/id/pastor_area/leader_of/password_hash/created_at` para no-pastores. **Hay que sumar `areas`** a esa lista.
- Triggers de aviso ya leídos enteros: `notify_on_order_insert` (banda efectiva ∪ pastores + `{{formacion}}`), `notify_on_order_update` (rama contenido con throttle 90 s + rama solo-formación a afectados), `_lineup_html` (bloque + línea personal). Son los puntos exactos donde se enganchan las áreas.

## 2. Modelo de datos — mínima superficie

**UN solo cambio de esquema:** columna nueva

```sql
ALTER TABLE public.members
  ADD COLUMN areas text[] NOT NULL DEFAULT '{}'::text[];
```

- Espeja `instruments text[]`: **multi-área nativo** (un músico puede ser `{'adoracion','sonido'}`) → resuelve la decisión #7 **sin junction table ni RLS nueva**.
- `'{}'` = sin área (comportamiento idéntico a hoy). **Nada obligatorio, todo aditivo.**
- **No** creo tabla `areas`. El "registro de áreas" (qué hace cada una) vive **en código**, en un solo lugar por lado, porque Paul confirmó que **cada área nueva necesita tratamiento específico** (código igual) → una tabla de config daría falsa sensación de "agregar por dato" y sumaría superficie a asegurar.

**Registro de capacidades (fuente única por lado):**

- **SQL** — helpers inmutables con las listas de slugs por capacidad:
  - `_area_email_slugs()` → `ARRAY['multimedia','sonido']` (reciben mail de todo orden).
  - `_area_formation_slugs()` → `ARRAY['sonido']` (reciben aviso de cambio solo-formación).
  - `_area_presenter_slugs()` → `ARRAY['multimedia','sonido']` (abren el presentador).
  - `_area_label(slug)` → etiqueta visible ('Adoración'/'Multimedia'/'Sonido').
  Agregar/mover una capacidad = editar **un literal**.
- **Cliente** — `src/lib/areas.js`: `AREAS` (slug→{label, orden}) + los mismos sets de capacidad, espejo del SQL (patrón `lineup.js`↔SQL). Para badges y formulario.

**Pastores = multiárea por ROL, sin dato.** Ya alcanzan todo (los avisos incluyen `role='pastor'`, la lectura del presentador ya es `is_pastor_or_leader`). Su badge "Multiárea" se deriva de `role='pastor'` → **no se les guarda `areas`** (dato redundante que podría desincronizar). *(Alternativa si Paul prefiere: sellar `areas = {'adoracion','multimedia','sonido'}` en pastores; inocuo porque el DISTINCT dedup-ea. Recomiendo la derivada.)*

## 3. Backend (una migración aditiva)

1. **Columna `members.areas`** (arriba) + **backfill** en la misma migración:
   ```sql
   UPDATE public.members SET areas = ARRAY['adoracion']
   WHERE role IN ('leader','member') AND (areas IS NULL OR areas = '{}');
   ```
   (Pastores quedan `'{}'` → badge multiárea por rol.)
2. **Freeze de seguridad:** sumar `NEW.areas IS DISTINCT FROM OLD.areas` a `enforce_member_update_rules` → **solo un pastor** (o backend service_role) cambia el área de alguien. Impide que un miembro se auto-asigne Multimedia para pescar el mail de todos los órdenes y el presentador. Un self-edit legítimo reenvía `areas` idéntico → NEW=OLD → pasa (requiere que el converter round-trip sea fiel, §4).
3. **Helpers** (SECURITY DEFINER, `search_path` fijo, REVOKE anon/authenticated):
   - `area_observers_for_order_email()` → `setof (id,name,email)` de miembros **activos, con email**, `areas && _area_email_slugs()`.
   - `area_observers_for_formation()` → ídem con `_area_formation_slugs()`.
   - `can_open_service_presenter()` → boolean: el miembro del `auth.uid()` tiene `areas && _area_presenter_slugs()`.
4. **`notify_on_order_insert`** (alta): al loop de destinatarios se suman los `area_observers_for_order_email()` (DISTINCT por id → sin duplicar a quien ya es banda/pastor). Nuevas variables en el mail:
   - `{{ensamble}}` = línea "🗓️ Ensamble: <día> DD/MM a las HH:MM" (escapada; '' si no hay). **Para todos.**
   - `{{area_nota}}` = por-destinatario: si es observador de área y **no** está en la banda efectiva → "Recibís este orden como parte del área de <etiquetas>." (banda/pastor → ''). El `_lineup_html` ya deja la línea personal vacía para quien no es participante ni banda → sin línea confusa.
5. **`notify_on_order_update`:**
   - **Rama contenido** (songs/date/time/band/meeting_type — incluye "cambió el orden/tono de canciones"): sumar `area_observers_for_order_email()` a los destinatarios + `{{ensamble}}` + `{{area_nota}}`. Cubre la regla "cualquier cambio en el orden de canciones → ambas áreas".
   - **Rama solo-formación:** después de avisar a los afectados (sin cambios), un segundo loop notifica a `area_observers_for_formation()` (Sonido) con un mensaje NO-personal: "Cambió la formación del orden del DD/MM" + bloque de formación (reusa plantilla `formacion-cambio` con un `detalle` de observador). Excluir al editor.
6. **Ensamble line helper** `_ensamble_html(rehearsal_date, rehearsal_time)` (STABLE) → arma la línea amigable con `parseLocalDate`-equivalente en SQL (día en ART) y escape.
7. **Presentador (única relajación de lectura):** `ss_select` pasa a
   `is_pastor_or_leader() OR am_i_in_order_band(order_id) OR public.can_open_service_presenter()`.
   Solo **SELECT**. `ss_insert/update/delete` y `schema_templates` **NO se tocan** → el observador ve el esquema/presentador pero **no lo edita**.
8. **Plantillas** `nuevo-orden` y `orden-editado`: insertar los placeholders `{{ensamble}}` y `{{area_nota}}` con reemplazo quirúrgico (como se hizo con `{{formacion}}`), verificando que no queden `{{x}}` sin cerrar. Toda llamada a `encolar_email` de esas plantillas pasa SIEMPRE las dos variables (aunque sean '').

**Todo el cuerpo nuevo va dentro de BEGIN/EXCEPTION** (los triggers de order corren en la transacción del usuario, landmine #49): un fallo de aviso **jamás** rompe el alta/edición.

## 4. Cliente

- `appStore.js`: `areas` en `convertMemberFromDB` **y** `convertMemberToDB` (round-trip fiel para que el freeze pase en self-edit; orden estable). Getter `getMemberAreas(member)`.
- `src/lib/areas.js`: registro (labels + sets de capacidad, espejo del SQL) + `areaLabels(member)`.
- **Alta/edición de miembro (pastor):** multi-select "Área(s)" (default Adoración para músicos; para un observador el pastor elige Multimedia/Sonido y **no** lo pone en ninguna banda). La EF `admin-create-member`/`admin-update-member` (service_role, exenta del freeze) persiste `areas`.
- **Badges:** `/miembros`, saludo del Dashboard y ficha muestran el badge de área (observador → su área en vez de instrumento; pastor → "Multiárea").
- **Presentador:** exponer el botón "Iniciar servicio" y el acceso al esquema a los observadores (gate cliente espejo de `can_open_service_presenter`); la RLS ya respalda la lectura.
- **Exportar:** los PDF (orden/canciones/repertorio) son client-side y ya disponibles a cualquier miembro → **el observador ya exporta**. Nada que construir; solo verificar en QA.

## 5. Seguridad y pruebas adversariales (doble certeza)

- **Escalada:** intentar que un `member` se ponga `areas={'multimedia'}` a sí mismo → debe fallar 42501 (freeze). Verificar que tampoco pueda por la EF sin ser pastor.
- **Observador no escribe:** impersonar un observador y probar UPDATE/DELETE/INSERT en orders/songs/bands/service_schemas/members → 0 filas / rechazo (RLS existente). Confirmar que **NO** hereda escritura por el área.
- **Presentador:** el observador **lee** cualquier `service_schemas` (SELECT ok) pero **no** inserta/edita/borra esquema ni plantillas. Un `member` sin área sigue sin ver esquemas de bandas ajenas.
- **Mails:** alta y edición encolan a banda ∪ pastores ∪ observadores, **sin duplicar** al músico que también es observador; observador no-banda recibe con `area_nota` y sin línea "no estás en la formación"; `{{ensamble}}` correcto y vacío si no hay ensamble; solo-formación llega a Sonido y NO dispara el mail general a la banda.
- **No-spam a Adoración:** confirmar que etiquetar 28 personas como Adoración **no** cambia a quién le llegan los mails (Adoración NO está en `_area_email_slugs`) → los músicos siguen recibiendo solo por pertenencia de banda, como hoy.
- **Regresión:** órdenes con `lineup` NULL/`all`/`custom` siguen igual; `parseLocalDate`/fecha ok; advisors **0 nuevos**; `error_log` limpio tras desplegar (landmine #56).
- Todo con QA transaccional (`BEGIN … RAISE EXCEPTION` → rollback) impersonando roles reales, con `push_on_notification_insert` deshabilitado; y UI real en Chromium 390px (arnés `scratchpad/qa`). Auditoría adversarial con subagentes sobre el diseño antes de aplicar.

## 6. Garantía de no-romper (qué NO cambia)

- **Cero roles nuevos** (`role` sigue con su CHECK). **Cero cambios de escritura.** **Cero** cambios a quien ya recibe qué, salvo el agregado de observadores y la línea de ensamble.
- Una sola relajación de **lectura** (presentador), acotada a áreas con esa capacidad, solo SELECT.
- Una sola columna nueva, nullable-por-defecto-vacía. Sin tablas nuevas. Sin tocar `pastor_area`, bandas, formación, digest de orders/songs/bands (la columna es de `members`, fuera del digest).

## 7. Orden de PRs (surgical, merge solo con OK de Paul)

- **PR 1 — Backend** (migración única): columna + backfill + freeze + helpers + triggers + RLS presentador + plantillas + ensamble. QA transaccional + advisors. (Aditivo, sin impacto hasta que el cliente lo use / hasta que un pastor asigne un área observadora.)
- **PR 2 — Cliente:** converters + `areas.js` + form de área + badges + acceso al presentador para observadores. QA Chromium.
- **PR 3 — EF admin-\*:** aceptar/persistir `areas` en create/update member. (Puede ir con PR 2.)

## 8. Recordatorios / landmines a agregar al cierre

- `members.areas` es **read-only para el propio miembro** (freeze en `enforce_member_update_rules`); solo pastor/EF lo cambian. Debe estar en **ambos** converters (round-trip fiel o el self-edit rompe).
- Capacidades por área viven en **un** helper SQL + `src/lib/areas.js` (espejo). Agregar un área = editar labels + decidir sus capacidades **explícitamente** (Paul: tratamiento individual).
- Adoración es **tag informativo**: NO está en `_area_email_slugs`/`_presenter_slugs` → etiquetar no cambia envíos ni accesos.
- `pastor_area` ≠ área de ministerio (es el pastor que cubre). No confundir.
