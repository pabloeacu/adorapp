# 03 — Calidad de código

**Estado de tooling:** sin lint (no hay `.eslintrc*` ni `eslint.config.*`), sin formatter (no hay `.prettierrc*`), sin type-checker (no hay `tsconfig.json`), sin tests (cero `*.test.*`/`*.spec.*`), sin pre-commit (no hay `.husky/`). El único script en `package.json` aparte de `vite` es `build`. Todo lo demás se hace a mano.

**Dependencias:** ningún paquete está catastróficamente desactualizado, pero hay 5 vulnerabilidades de severity moderada en `npm audit` (4 moderate dev-only en `vite`/`esbuild`, 1 en `uuid` < 14 con buffer-bounds). Major releases pendientes: React 18→19, Vite 5→8, Tailwind 3→4, lucide-react 0.294→1.x, react-router-dom 6→7. Detalle en `05_performance.md`.

---

## Hallazgos por severidad

### 🔴 Crítico

**C1 · Duplicación masiva entre `Header.jsx` (1712 líneas) y `MobileNav.jsx` (1242)**
Ambos componentes implementan **independientemente**: cropper de foto (zoom/rotación/posición/drag), carga de notificaciones (`loadNotifications` con misma estructura en `Header.jsx:300-422` y `MobileNav.jsx:71-149`), edit-profile form, password change. Aproximadamente **35-40% del código** es paralelo. Cualquier bug arreglado en uno persiste en el otro — por eso encontré el `photo_url` muerto en MobileNav 10× pero solo 0× en Header.
*Fix:* extraer 3 hooks: `useNotifications()`, `useProfileSheet()`, `usePhotoCropper()` en `src/hooks/`. Reduce ~600 líneas.

### 🟠 Alto

**A1 · Componentes monolíticos: `Repertorio.jsx` 1327, `Ordenes.jsx` 1297, `Miembros.jsx` 1058**
Cada uno mezcla lista + form modal + viewer + export PDF en un solo archivo. Difícil de testear, peligroso de modificar.
*Fix concreto:* en `Repertorio.jsx:600-850` (render del listado de canciones) → extraer `<SongCard>`; líneas ~700-900 (modal de creación/edición) → `<SongForm>`. Mismo patrón para `Ordenes.jsx` (`<OrderCard>`, `<SongPickerDropdown>`, `<KeyHistoryTooltip>`).

**A2 · 11 `useState` relacionados para el cropper de foto** en `Header.jsx:50-66` y `MobileNav.jsx:44-58`
`showCropper`, `previewUrl`, `zoom`, `rotation`, `position`, `isDragging`, `dragStart`, `isSaving`… todos cambian juntos. Riesgo de stale closures y orden de renders impredecible.
*Fix:* `useReducer` con acciones `OPEN_CROPPER` / `SET_ZOOM` / `DRAG_START` / `SAVE_START` / `CLOSE`. Encaja con C1 — mismo `usePhotoCropper` hook.

**A3 · `.then()` sin `.catch()` en queries críticas**
`Ordenes.jsx:589` (`fetchKeyHistory(directorId, songId).then(...)`) no tiene catch — un fallo de red es silencioso y deja la UI con datos viejos sin que el usuario sepa.
*Fix:* convertir a `try/await/catch` o agregar `.catch()` que muestre toast de error.

**A4 · Lookup frágil de perfil por email** en `authStore.js:67-83`
Si el `members.user_id` lookup falla, cae a buscar por email en `appStore`. Funciona hoy pero si un user cambia de email o no tiene email, todo el flow se rompe sin logging claro.
*Fix:* documentar en código que `user_id` es la PK lógica; el fallback por email solo aplica durante la transición de seed legacy.

### 🟡 Medio

**M1 · `console.log` de debug en producción** (limpiamos los peores hoy, quedan algunos)
Todavía hay logs en `Header.jsx:872-957` (canvas processed, upload info, member id debug) y `MobileNav.jsx:289-435` (image debug, save photo, upload info). Los `console.error` en catch están bien — esos quedan.
*Fix:* grep `console\.log` y eliminar todos los que no estén dentro de un `catch`.

**M2 · 15+ `useState` por página** en Repertorio, Ordenes, Miembros
`isModalOpen`, `editingSong`, `viewingSong`, `confirmModal`, `successModal`, `errorModal` cada uno con `{isOpen, title, message, type, onConfirm}`. Estado muy distribuido, fácil mostrar 2 modales a la vez por accidente.
*Fix:* reducer `useFormModal` con `state.type ∈ {none, confirm, success, error, form}`.

**M3 · Naming dual `userId` ↔ `user_id` y `avatarUrl` ↔ `avatar_url`** en `appStore.js:128-131` y todo el código
`convertMemberFromDB` setea ambos a propósito para "compatibilidad". `convertMemberToDB` lee solo `avatarUrl`. Si alguien escribe `member.avatar_url = X` en JS, el guardar en DB pasa `null` y se pierde.
*Fix:* estandarizar **todo** a camelCase en JS, snake_case solo en queries SQL. Los converters son el único lugar de traducción.

**M4 · Validación de formularios sólo en backend**
Los formularios de `Repertorio` y `Ordenes` no validan en cliente — submit con campos vacíos llega a la EF/RLS y rebota con error genérico. UX pobre.
*Fix:* validación con Zod o un esquema simple antes del submit, mensajes específicos por campo.

**M5 · Imports no usados** (varios archivos)
`Dashboard.jsx` importa `useAppStore` pero ya no lo usa después de la refactorización. Misc otros.
*Fix:* ESLint con `no-unused-vars` resuelve esto en todo el árbol al activarse.

**M6 · `transposeChordString` siempre devuelve sostenidos, nunca bemoles** (`appStore.js:11-103`)
El algoritmo es **funcionalmente correcto** (`Db→C#→D` cuando se transpone +1 está bien) pero el output prefiere sharps siempre. Si el director está acostumbrado a leer "Bb" en lugar de "A#", la transposición se siente "rara" pero no incorrecta.
*Fix:* agregar `preferFlats` opcional (basado en la tonalidad destino: F/Bb/Eb/Ab favorecen flats).

### 🔵 Bajo

**B1 · Magic numbers**
`getUnusedSongs(4)` en `Repertorio.jsx`: hardcodeado. Mismo `weeks=4` repartido.
`pageTitles` en `Header.jsx:30-36`: rutas literales, fácil quedar fuera de sync con `App.jsx`.
*Fix:* exportar constantes desde `appStore.js`, generar pageTitles del config de rutas.

**B2 · localStorage keys dispersas**
La nueva `authStore.logout()` ya las centraliza en una lista, pero el código que las **escribe** sigue distribuido. Si alguien agrega una nueva key, logout puede olvidarla.
*Fix:* `src/lib/storageKeys.js` exportando todas las keys; usarlo desde quien escribe y desde quien limpia.

**B3 · No hay paginación**
Ahora hay 21 canciones — escala. Cuando lleguen a 200 y haya 50 órdenes, el render inicial va a empezar a sentirse. No urgente.

### 🟢 Nice-to-have

**N1 · Tailwind class soup** en MobileNav.jsx (varios `className=` >150 chars). Refactor cosmético.
**N2 · Falta `key={song.id}` en algunos `.map()`** (usan index implícito). React funciona pero rompe en reorder de listas.

---

## Top 3 refactors recomendados

1. **`src/hooks/usePhotoCropper.js` + `useNotifications.js` + `useProfileSheet.js`** — extrae lo duplicado entre Header.jsx y MobileNav.jsx. Probablemente una semana de trabajo bien planeado, baja ~600 líneas, hace los 2 archivos manejables.

2. **Decomponer `Repertorio.jsx` y `Ordenes.jsx`** en sub-componentes (`<SongCard>`, `<OrderCard>`, `<SongForm>`, `<KeyHistoryTooltip>`). 3 días. Cada nuevo file < 300 líneas, testeable.

3. **`useFormModal` reducer hook** — unifica las 5+ modales por página en una sola pieza de estado. Medio día. Elimina ~100 líneas por página.

## Quick wins (≤30 min cada uno)

- Limpiar los `console.log` restantes en Header/MobileNav (10 min).
- Agregar `.catch()` al `fetchKeyHistory` de `Ordenes.jsx:589` (5 min).
- Constantes para magic numbers (`UNUSED_SONG_WEEKS`, etc.) (5 min).
- Crear `src/lib/storageKeys.js` (10 min).
- Agregar `eslint` + `prettier` con configs estándar para Vite/React, run inicial (30 min).
