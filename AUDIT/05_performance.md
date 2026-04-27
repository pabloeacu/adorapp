# 05 — Performance

Resumen: la app hoy responde rápido por el tamaño chico de los datos (~3 miembros, 21 canciones), pero acumula deuda de performance que va a doler cuando crezca o si abre con 4G en mobile. Dos categorías: cliente (bundle, render) y backend (RLS y queries).

---

## Cliente / bundle

**Build local actual** (post refactor de hoy):
```
dist/assets/index-B8H9kBth.js          966 KB    (gzip 284 KB)
dist/assets/html2canvas.esm-CBrSDip1.js 198 KB    (gzip 48 KB)
dist/assets/index.es-D1wTxVXN.js        147 KB    (gzip 51 KB)
dist/assets/purify.es-BwoZCkIS.js        22 KB    (gzip 9 KB)
dist/assets/index-BLZETK51.css           37 KB    (gzip 7 KB)
                            TOTAL gzip: ~399 KB
```

Vite avisa: `Some chunks are larger than 500 kB after minification`. El bundle principal tiene **TODO en uno** porque no hay code splitting por ruta.

### Hallazgos

🟠 **P1 · Sin code splitting por ruta**. Todas las páginas (`Dashboard`, `Ordenes`, `Repertorio`, `Bandas`, `Miembros`, `Solicitudes`, `Comunicaciones`, `Login`) están en el bundle principal. El usuario que abre login descarga el código completo de Repertorio/Ordenes que probablemente ni use ese día.
*Fix:* `lazy()` por ruta en `App.jsx` + `<Suspense fallback>`. Estimado: bundle inicial cae a ~250-300 KB gzip. Esfuerzo: 1-2 horas.

🟠 **P2 · `jspdf` y `html2canvas` cargados eager**. Estos dos pesan ~250 KB sumados y solo se usan al exportar PDF (acción puntual, no on-load).
*Fix:* dynamic `import()` dentro de la función que genera el PDF. Esos chunks se descargan solo cuando el usuario clicketa "Exportar". Esfuerzo: 30 minutos.

🟡 **P3 · `lucide-react` versión 0.294** importa cada icono. Lucide moderno tiene tree-shaking mucho mejor en versión 1.x.
*Fix:* `npm install lucide-react@latest` (con tests, hay breaking changes menores en nombres de iconos). Estimado: ~50 KB menos en bundle.

🟡 **P4 · Sync agresivo eliminado pero queda tracking de fix**. Yo ya saqué el setInterval de 30s y el setAutoRefresh de 5min hoy. Lo dejo anotado porque era un drenaje real de la cuota de Supabase.

🟡 **P5 · localStorage caches escriben todo cada init**. `appStore.initialize()` setea `appMembers/Bands/Songs/Orders` cada vez que corre. Para 200 canciones × 4 secciones cada una = ~150 KB de JSON serializado en cada nav. La escritura es síncrona y bloquea el main thread.
*Fix:* solo guardar si los datos cambiaron (deep-equal o hash) o usar IndexedDB para data >100 KB.

🟡 **P6 · Sin imagenes optimizadas**. Avatares aceptan 5 MB. La mayoría de fotos de perfil deberían pesar <100 KB.
*Fix:* compresión client-side en el cropper antes de subir (canvas a JPEG quality 0.85). Esfuerzo: 1 hora.

🔵 **P7 · Render de listas sin virtualización**. Con 21 songs hoy es trivial; con 500 va a tener jank. No urgente.

🔵 **P8 · Sin pre-fetching**. Cuando hover sobre un link de nav, Vite no pre-carga el chunk de la siguiente página. Mejora subjetiva chiquita pero gratis con `react-router` v7.

---

## Backend / Supabase

Después de aplicar los **quick wins de hoy** (índices FK, drop unused indexes, RLS init plan optimization, fix multiple permissive policies, primary key reparado):

### Estado de los advisors

✅ Resueltos hoy:
- 6 unindexed_foreign_keys (FK indexes added)
- 6 unused_index (dropped)
- 9 auth_rls_initplan (rewritten with `(SELECT auth.uid())`)
- 1 multiple_permissive_policies en `bands` (split FOR ALL into per-action)
- 1 no_primary_key en `song_key_history` (column id repaired + PK added)

🟡 **DB1 · `auth_db_connections_absolute`** (INFO).
Auth usa hasta 10 connections fijas en lugar de % del pool. Si subimos el plan o crecemos el tráfico, conviene cambiar a percentage-based. No urgente con 8 users.

### Hallazgos adicionales mientras leía esto

🟠 **DB2 · BUG histórico encontrado**: la tabla `song_key_history` estaba en producción **sin la columna `id`, sin PK, y sin NOT NULL** en `member_id/song_id/key/order_date`. La migration original (`20260414_create_song_key_history.sql`) la declaraba bien — alguien hizo un `DROP COLUMN id` o aplicó el schema parcialmente. Reparado hoy con la migration `repair_song_key_history_schema`.

🟡 **DB3 · `members.id` y `auth.users.id` no son la misma columna**. Hoy hay dos UUIDs por persona: `members.id` (de la app) y `auth.users.id` (del login), unidos por `members.user_id = auth.users.id`. Funcional pero genera el lookup-by-email que vimos en código, y una clase entera de bugs (caso Olga, caso Paul).
*Fix considerable:* migrar a `members.id = auth.users.id` (deduplicate). Es semántica de "1 member ↔ 1 auth user". Trabajo de Fase 2 alta porque toca FKs, pero elimina toda la familia de bugs.

🟡 **DB4 · `songs.structure JSONB`** sin índice GIN. Si más adelante hacemos full-text search sobre acordes/letras (feature aprobada #10 con `pg_trgm`), va a ser lenta sin índice.
*Fix:* `CREATE INDEX songs_structure_gin ON songs USING GIN (structure);` cuando agreguemos search. No urgente ahora.

🔵 **DB5 · Sin `cache-control` headers en responses de Supabase REST**. Cada SELECT viaja completo. Opcional poner ETags via PostgREST.

---

## Vulnerabilidades de dependencias (`npm audit`)

```
5 vulnerabilities (4 moderate, 1 critical)
- esbuild <= 0.24.2 (vía vite, dev-only) — moderate
- uuid < 14 — moderate (buffer bounds check)
```

🟡 **P9 · `npm audit` reporta 1 critical y 4 moderates**. La crítica es `uuid <14` (buffer bounds check). El uso real en el proyecto es `uuid()` para generar IDs, no `uuid(buf)` con buffer pre-asignado, así que el riesgo práctico es **bajo**, pero el flag persiste.
*Fix:* `npm install uuid@latest`. Sin breaking changes para el uso actual. 5 min.

Para vite/esbuild: solo afecta el dev server (ataque XSS sobre devs), no producción. Lo dejamos hasta el upgrade general a Vite 6/7 (Fase 2 alta).

---

## Quick wins (todos < 1 hora)

1. ✅ **Aplicado hoy**: 6 índices FK, 6 unused index drops, 9 RLS init plan rewrites, fix bands multiple permissive policies, song_key_history PK reparado.
2. **`npm install uuid@latest`** y test rápido (cierra `critical` advisory).
3. **Dynamic import de jspdf + html2canvas** (#P2) → bundle inicial baja ~250 KB.
4. **Code splitting por ruta** (#P1) → otros 200-300 KB menos en first paint.
5. **Compresión client-side de avatares** (#P6) → ahorra egress y mejora UX en mobile.

## Trabajo más grande

- Lighthouse runs reales mobile + desktop (necesito sacar del browser sandbox bloqueado, lo hago al inicio de FASE A).
- IndexedDB para caches grandes (#P5).
- Migración de FE assets a CDN edge (Vercel ya lo hace, pero validar cache hit ratio).
- Fase 2: índice GIN en `songs.structure` cuando habilitemos fuzzy search.
