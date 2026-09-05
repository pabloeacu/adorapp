# Plan: miembros de banda agregados por líderes (permanentes y temporales)

> Estado: **IMPLEMENTADO (2026-09-05)** en 3 PRs (§2.8). PR A y PR B aplicados a producción y verificados en vivo; PR C (cliente) commiteado, a la espera del merge. Decisiones de producto tomadas por Paul el 2026-09-05.
>
> **Desvíos verificados en vivo respecto de este contrato (Regla de Oro):**
> - §2.5: el "agregar permanente" del líder usa un **update DIRIGIDO solo a `members`** (`addPermanentBandMember`), no `updateBand`. Motivo verificado: `convertBandToDB` coerce `meeting_time` null→'20:00' y normaliza el nombre; con el trigger append-only del PR A, cualquier campo que difiera del row real haría rechazar el append del líder. El update dirigido no toca otros campos → inmune. (Hoy 0 bandas tienen esos valores, pero es a prueba de futuro.)
> - §2.1: el CHECK enforce el rango **completo 1–90 días** (piso Y techo), no solo el techo (hallazgo de la auditoría; el plan pedía "validado por el CHECK"). El guard anti-duplicado suma un **`pg_advisory_xact_lock`** por par (airtight bajo concurrencia). La tabla lleva **FORCE RLS** (consistencia con bands/members). Contrato cliente↔base: el cliente manda `starts_at` y `expires_at` del mismo instante (documentado en la migración) para que el CHECK no dependa del reloj del server.
> - §2.3/§2.7: el `band_effective_member_ids` SQL quedó `REVOKE`ado de authenticated (solo lo usan los crons como owner); el cliente calcula su propio efectivo en JS (paridad testeada).

## 0. Decisiones de producto (cerradas)

| # | Pregunta | Decisión |
|---|---|---|
| 1 | ¿A qué bandas puede agregar un líder? | **A cualquier banda.** |
| 2 | ¿El temporal cuenta como director/voz al armar un orden? | **Sí.** Es miembro pleno durante su ventana. |
| 3 | ¿Qué pasa al vencer? | **Desaparece en silencio** (deja de contar; sin aviso). |
| 4 | Tope de días del temporal | **1 a 90 días.** |
| — | Reglas fijas de Paul | El líder **solo agrega** (permanente o temporal). **No edita** la banda. **No quita** a nadie. **Solo el pastor** quita/edita. |

Glosario: "ensamble" = encuentro de la banda; "ensayo" = práctica personal. "Orden" es masculino.

## 1. Hallazgos del estudio (estado REAL verificado en código y base, 2026-09-05)

### 1.1 Hueco de seguridad preexistente (hay que cerrarlo sí o sí)
- Políticas RLS de `bands` hoy: INSERT / UPDATE / DELETE = `is_pastor_or_leader()`; SELECT = todos los autenticados.
- La UI (`src/pages/Bandas.jsx:237`) muestra "Editar"/"Eliminar" **solo al pastor**, pero la base deja que **un líder edite cualquier campo, agregue Y quite miembros, y elimine bandas** por la API. Misma clase que el hueco de órdenes (landmine 19: gate de UI más estricto que la RLS). No hay indicios de abuso, pero el candado real no existe.
- Consecuencia: mostrarle al líder un botón "Agregar" confiando en la RLS actual **no restringiría nada** (el "no puede quitar" sería cosmético). La regla "solo agregar" DEBE vivir en la base.

### 1.2 Modelo actual de pertenencia
- `bands.members` es un **`uuid[]`** dentro de la fila de la banda (sin metadata por miembro). No puede guardar "temporal hasta X".
- "Agregar sí / quitar no" no se puede expresar con RLS por fila sobre un array: para la base, agregar y quitar son el mismo UPDATE. Hace falta un **trigger** (o RPC) que valide la naturaleza del cambio.
- `members.leader_of` es **texto libre** ("Jóvenes", "Daniel", "Lider de área"): no liga al líder con una banda. Irrelevante ahora (decisión 1 = cualquier banda), pero NO usarlo para scoping.
- `orders` SELECT = `true`: la agenda/órdenes ya los ve todo el mundo. La membresía NO gobierna eso.

### 1.3 Los 7 consumidores de "es miembro de la banda" (radio de impacto exacto)
Todos deben pasar a usar **miembro efectivo = permanentes ∪ temporales vigentes**. Si uno queda afuera, el temporal recibe unos avisos y otros no.

**Servidor (SQL, corren por cron):**
1. `send_rehearsal_reminders()` — lee `b.members AS band_members` (push 2 h antes del ensamble).
2. `send_practice_reminders()` — matchea `jsonb_array_elements_text(to_jsonb(b.members))` (alarma de ensayo 18:00).
   - `notify_on_order_insert()` NO depende de miembros (solo usa `bands.name`): no tocar.

**Cliente (React):**
3. `src/pages/Ordenes.jsx:126` — `singers` (elegibles director/voz) = `band.members` ∩ activos con 'Voz'.
4. `src/pages/Ordenes.jsx:1246` — al cambiar de banda, limpia directores que no están en `band.members`.
5. `src/pages/Comunicaciones.jsx:259` y `:912` — destinatarios por banda y contador "miembros con cuenta".
6. `src/components/dashboard/PrepBanner.jsx:41` — banner "practicá tu orden" (gate por pertenencia; hoy replica el cron, landmine 27).
7. `src/components/dashboard/ServiceFeedbackPrompt.jsx:52` — pedido de feedback post-servicio (gate por pertenencia).
   - Además: `src/stores/appStore.js:917 getBandMembers()` (helper usado por `Bandas.jsx` para listar) y el formulario de edición de `Bandas.jsx` (`formData.members`).

### 1.4 Triggers existentes en `bands`
`audit_bands` (INSERT, auditoría), `notify_on_band_insert` (INSERT, push), `update_bands_updated_at` (UPDATE). Ninguno valida membresía. No hay conflicto con agregar un trigger BEFORE UPDATE nuevo.

## 2. Diseño (aditivo, sin mover datos existentes)

### 2.1 Modelo de datos
- **Permanentes:** siguen en `bands.members uuid[]` exactamente como hoy. **Cero migración de datos.**
- **Temporales:** tabla nueva `public.band_temporary_members`:
  ```sql
  id          uuid primary key default gen_random_uuid(),
  band_id     uuid not null references public.bands(id)   on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  added_by    uuid          references public.members(id) on delete set null,
  starts_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  constraint btm_window check (expires_at > starts_at and expires_at <= starts_at + interval '90 days')
  ```
  - Índice: `(band_id, member_id, expires_at)`.
  - **Sin UNIQUE(band_id, member_id)**: un nuevo período temporal = fila nueva (el líder no puede UPDATE). "Vigente" = `expires_at > now()`. Al insertar, rechazar si ya hay una vigente para ese par (validación en cliente + opcionalmente trigger BEFORE INSERT).
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON public.band_temporary_members TO authenticated;` (regla #7 de CLAUDE.md).
  - RLS (4 verbos, ON):
    - SELECT: `authenticated` → `true`.
    - INSERT: `is_pastor_or_leader()` **y** `added_by = (select id from public.members where user_id = auth.uid() and active)` (no se puede firmar como otro).
    - UPDATE: `is_pastor()`.
    - DELETE: `is_pastor()`.
- **FK de DELETE explícitas** (landmine 32): CASCADE en band/member (si se borra la banda o el miembro, la temporal no tiene sentido), SET NULL en `added_by`.

### 2.2 Cierre del hueco + "solo agregar" para líderes (en la base)
- `bands` DELETE: cambiar la política a `is_pastor()` (la UI ya lo oculta al líder).
- `bands` UPDATE: mantener la política `is_pastor_or_leader()` PERO agregar **trigger `BEFORE UPDATE`** `enforce_band_update_rules()`:
  - Si `public.auth_role() = 'leader'`: exigir `NEW.members @> OLD.members` (solo puede **agregar**; nunca quitar) **y** `NEW.name, meeting_type, meeting_day, meeting_time, active` idénticos a OLD. Si no → `RAISE EXCEPTION` con mensaje claro en español (código propio, p. ej. `ERRCODE = 'P0001'`).
  - Si pastor: todo permitido. Si otro rol: la RLS ya lo bloquea (defensa en profundidad: rechazar igual).
  - Ventaja: el cliente sigue usando `updateBand()` (merge-safe, envía la fila completa con los demás campos sin cambios → el trigger los ve iguales → OK). No hace falta RPC nuevo ni tocar el contrato anti DATA-LOSS.
- Nota: el trigger corre como invoker; `auth_role()` es SECURITY DEFINER y resuelve bien bajo RLS.

### 2.3 "Miembro efectivo": una sola definición, servidor y cliente
- **SQL:** `public.band_effective_member_ids(p_band_id uuid) RETURNS uuid[]` — `SELECT array(SELECT unnest(b.members) UNION SELECT t.member_id FROM band_temporary_members t WHERE t.band_id = p_band_id AND t.expires_at > now())`. SECURITY INVOKER (ambas tablas legibles por authenticated). STABLE.
  - Reemplazar en `send_rehearsal_reminders` (donde usa `b.members`) y en `send_practice_reminders` (donde usa `jsonb_array_elements_text(to_jsonb(b.members))`) por `unnest(public.band_effective_member_ids(b.id))`.
  - ⚠️ `CREATE OR REPLACE` de esas funciones **resetea grants**: re-asertar `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` (landmine documentado en CLAUDE.md, PR #54).
- **Cliente:** el store carga `band_temporary_members` en `initialize()` (+ realtime, como el resto) y expone:
  - `getEffectiveBandMemberIds(bandId): Set<uuid>` = `band.members ∪ temporales vigentes` (vigente evaluado con `Date.now()`; se re-evalúa al abrir la pantalla — sin timers).
  - `getBandMembers(bandId)` pasa a devolver los efectivos, marcando `{ temporary: true, expiresAt }` para los temporales (la UI muestra badge "Temporal · vence DD/MM").
  - Los 7 consumidores (§1.3) usan **solo** estas dos funciones. Prohibido leer `band.members` directo en lógica de avisos/elegibilidad.
- **Paridad:** test unitario que fija que la semántica cliente == SQL (vigente si `expires_at > now`, expirado excluido), mismo espíritu que landmine 27.

### 2.4 Vencimiento
- Por **filtrado**, nunca por borrado: vencido ⇒ no cuenta en ningún consumidor. Desaparece en silencio (decisión 3).
- Sin cron de borrado en v1. Opcional a futuro: limpieza de filas vencidas hace > 30 días (patrón `practice-cleanup`).
- `expires_at = now() + N días` (exacto); mostrar en ART con `toLocaleString('es-AR', {timeZone:'America/Argentina/Buenos_Aires'})`. N ∈ [1, 90] validado en UI **y** por el CHECK.

### 2.5 UI (`src/pages/Bandas.jsx`)
- **Líder y pastor:** botón "Agregar miembro" en cada tarjeta de banda → modal (usar el `<Modal>` compartido, ya integra historial/safe-area):
  - Selector de miembro: activos, **excluyendo** a los que ya son miembros efectivos.
  - Tipo: **Permanente** / **Temporal** (switch con el patrón iOS-safe `label + checkbox sr-only peer`, landmine 23). Si temporal: campo "días" (1–90, default sugerido 7).
  - Guardar: permanente → `updateBand(id, { members: [...band.members, memberId] })`; temporal → insert en `band_temporary_members` (`added_by` = miembro actual). `await` + rama éxito/error con `SuccessModal/ErrorModal` (landmine 32). Nunca fire-and-forget.
- **Líder:** NO ve "Editar", NO ve "Eliminar", NO ve ✕ para quitar. (Hoy ya está así; conservar.)
- **Pastor:** conserva "Editar" (edición completa) y puede quitar temporales con una ✕ en el chip (DELETE en la tabla).
- Chips de miembros: los temporales con badge "Temporal · vence DD/MM".
- Recordar landmines de UI: `flex-wrap` en filas de acciones (4), acciones visibles al tacto (3), reset de estado de búsqueda al abrir/cerrar (8).

### 2.6 Migración (una, aditiva): `supabase/migrations/2026MMDD_band_temporary_members.sql`
Orden interno:
1. `CREATE TABLE band_temporary_members` + índice + `GRANT` + `ENABLE ROW LEVEL SECURITY` + 4 políticas.
2. `CREATE FUNCTION band_effective_member_ids(uuid)`.
3. `CREATE OR REPLACE` de `send_rehearsal_reminders` y `send_practice_reminders` usando el helper + **re-REVOKE**.
4. `CREATE FUNCTION enforce_band_update_rules()` + `CREATE TRIGGER ... BEFORE UPDATE ON bands`.
5. `DROP POLICY bands_delete_pastor_or_leader; CREATE POLICY bands_delete_pastor ... USING (is_pastor())`.
Aplicar en prod vía MCP `apply_migration`. Rollback: `DROP TRIGGER`, `DROP FUNCTION`s, restaurar política de DELETE, `DROP TABLE` — no hay pérdida de datos porque los permanentes nunca se movieron.

### 2.7 QA obligatorio (Regla de Oro — nada se declara resuelto sin esto)
**Base (transaccional, `BEGIN … ROLLBACK`, impersonando SIEMPRE usuarios `active = true` — trampa documentada en CLAUDE.md):**
- Líder: INSERT temporal en cualquier banda → OK; con 91 días → falla el CHECK; con `added_by` de otro → falla WITH CHECK; UPDATE/DELETE de temporal → 0 filas.
- Líder: `updateBand` **agregando** a `members` → OK; **quitando** uno → el trigger rechaza; cambiando `name`/`meeting_*` → rechaza; DELETE de banda → 0 filas.
- Pastor: todo OK (agregar, quitar, editar, borrar temporal).
- Miembro / anon: INSERT temporal → 0 filas.
- `band_effective_member_ids`: incluye temporal vigente, excluye vencida (setear `expires_at` en el pasado dentro de la transacción).
- `send_rehearsal_reminders` / `send_practice_reminders` con `SET LOCAL session_replication_role = replica` + ROLLBACK (landmine 10, cero push real): el temporal vigente recibe; el vencido no; el permanente sigue recibiendo igual que hoy (no-regresión).
- `get_advisors` security: 0 alertas nuevas.

**Cliente:**
- Unit: paridad `getEffectiveBandMemberIds` vs semántica SQL; rango 1–90.
- Chromium real (`playwright-core` + `/opt/pw-browsers/chromium`, viewport móvil): como líder ve "Agregar miembro" y NO Editar/Eliminar; agrega permanente y temporal (validación de días); chips con badge; como pastor ve Editar y la ✕ del temporal; un temporal vencido no aparece; en "Nuevo Orden" el temporal figura como director; en Comunicaciones el contador lo incluye.
- `lint` + `test` + `build` en verde; CI (lint+build+test+smoke prod) verde en cada PR.

### 2.8 Orden de trabajo (PRs chicos, cada uno verificable; **cada PR se mergea solo con el ok de Paul**)
- **PR A — Higiene (independiente, chico):** política DELETE → pastor + trigger append-only para líderes. Verificar que todos los flujos actuales del pastor siguen intactos. Vale aunque la feature se posponga.
- **PR B — Backend de temporales:** tabla + helper + las 2 funciones de cron + QA transaccional.
- **PR C — Cliente:** store (carga + realtime + helpers) + los 7 consumidores + UI de Bandas + Chromium.
  (B y C pueden ir juntos si el diff queda legible; separados es más seguro para revisar.)

### 2.9 Landmines nuevos a registrar en CLAUDE.md al cerrar
- `bands.members` = SOLO permanentes; temporales SOLO en `band_temporary_members`; "miembro efectivo" = unión con `expires_at > now()`. Nunca leer `band.members` directo en avisos/elegibilidad (usar `band_effective_member_ids` / `getEffectiveBandMemberIds`).
- Trigger `enforce_band_update_rules` es el candado real del "líder solo agrega": no quitarlo ni relajar el superset check.
- `CREATE OR REPLACE` de `send_rehearsal_reminders`/`send_practice_reminders` resetea grants → re-REVOKE.
- Ventana temporal 1–90 días por CHECK (fuente de verdad) + UI.
- Rehacer el estudio de consumidores (§1.3, `grep -rn "\.members\b\|getBandMembers"`) antes de tocar pertenencia: si aparece un consumidor nuevo, sumarlo.

## 3. Riesgo residual y por qué es aceptable
- Cambio **aditivo**: los datos actuales no se mueven; rollback limpio.
- La regla de negocio vive en la **base** (trigger + RLS), no en la pantalla.
- Radio de impacto **enumerado** (7 consumidores) y cubierto por pruebas de paridad.
- Vencimiento por filtrado: ningún proceso borra nada.
- Bonus: cierra un hueco de seguridad que ya existe hoy.
