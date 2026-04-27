# 01 — Notas sobre la documentación existente vs. el código real

Lectura comparada de `TECHNICAL_DOCUMENTATION.md` y `PROJECT_DOCUMENTATION.md` contra el código actual. Cuando hay conflicto, **el código manda**.

---

## Lo que la doc dice bien

- Stack confirmado: Vite + React 18 SPA, Tailwind, Zustand, React Router v6, Supabase JS, Vercel, dominio `adorapp.net.ar`.
- Modelo de datos `members` / `bands` / `songs` / `orders` / `notifications` / `daily_reflections` está bien descrito.
- Los flujos de UI (órdenes con director y tono, repertorio con transposición, comunicaciones, solicitudes) coinciden con el código.
- Roles `pastor` / `leader` / `member` y la semántica de cada uno son correctas.
- La descripción de transposición de acordes (semitone steps, slash chords, accidentals) coincide con `appStore.js:6-113`.

## Lo que la doc dice mal o de forma engañosa

| Tema | Doc dice | Realidad en código |
|---|---|---|
| `service_role` key | "hardcodeada en `/src/lib/supabase.js` para simplificar el despliegue" (Tech doc §11.4) | Es una vulnerabilidad crítica, no un trade-off de DX. La doc presenta el bug como decisión de diseño. |
| `password_hash` en `pending_registrations` | "Will be hashed by trigger" (comentario en código) | No existe ningún trigger. Las passwords se guardan en cleartext. |
| RLS | "Tablas con RLS habilitado y políticas que permiten operaciones para autenticados" (Tech doc §4.3) | Las policies son `USING (true)` para `authenticated`, lo cual es **equivalente a no tener RLS** en cuanto al rol. Cualquier user autenticado puede borrar todo. |
| Auto-sync | "Cada 30 segundos" (Tech doc §9.2) | Confirmado. Pero la doc no menciona que **además** hay sync en cada cambio de ruta + 5min PWA, lo que multiplica el costo. |
| Caché localStorage | "Cache para modo offline" (Tech doc §7) | También retiene datos sensibles post-logout. La doc no advierte el problema. |
| `tabla_pending_registrations` | No la menciona en el diagrama de entidades (Tech doc §3.1) | Existe en el código y es central al flujo de registro. La doc también omite `communications`, `communication_notifications`, `song_key_history`. |
| Variables de entorno | "No hay archivos `.env` - las credenciales están hardcodeadas" (Tech doc §11.4) | `.env.local` existe (con `VERCEL_OIDC_TOKEN`). La doc dice que no hay `.env` y eso lleva al siguiente equipo a hardcodear más cosas. |
| `signUp` flow | Solo describe el flujo pending_registrations (Tech doc §5.7) | Hay **dos** paths: el modal de Login → `pending_registrations` (con aprobación), y `authStore.signUp` (sin aprobación, crea member directo con role='member'). El segundo no está documentado y es bypassable si signup está abierto. |
| Endpoints "API" | "Status codes 200/400/401/403/404/500" (Auditoría previa §5) | No hay backend ni API custom. Todo va directo a Supabase REST/RPC. La auditoría previa parece haber confundido eso. |
| Página `/reset-password` | El método `resetPassword` redirige a `/reset-password` (`authStore.js:223`) | **No existe esa ruta** en `App.jsx`. El email de reset llega y al hacer click el usuario va a una 404. |

## Tablas y archivos no documentados (existen en código pero no en doc)

- `pending_registrations` (tabla)
- `communications` y `communication_notifications` (tablas, ver `supabase_communications.sql`)
- `song_key_history` (tabla, ver migration `20260414`)
- Migration `20260423_fix_song_key_history_rls.sql`
- `useAuth.js` en `src/lib/` (hook viejo, pero ya no se usa — `authStore.js` lo reemplazó). Es código muerto.
- `data/sampleData.js` (a confirmar si se usa)
- 30+ archivos SQL/JS de "fix RLS" sueltos en el root, restos de los varios intentos del agente anterior (ULTIMATE_FIX, DEFINITIVE_FIX, SUPER_RESET, etc.). Ninguno está referenciado por código y no son ejecutados automáticamente. Son ruido.

## Dependencias entre doc

- `PROJECT_DOCUMENTATION.md` y `TECHNICAL_DOCUMENTATION.md` se solapan ~70% pero discrepan en detalles (estructura de carpetas, lista de tablas). La existencia de dos docs paralelas es un anti-patrón en sí.
- `AUDITORIA_COMPLETA.md` declara "✅ NO EXISTE vector de XSS" pero React solo escapa por default; la app usa innerHTML/dangerouslySetInnerHTML? → confirmé con `grep`: no aparece `dangerouslySetInnerHTML`. OK, ese punto es correcto.
- `SOLUTION_GUIDE.md` describe el problema "Olga y Paul no tienen cuenta". Es info operativa, debería mover-se a `/docs/RUNBOOK.md` cuando lleguemos a Fase 5.

## Conclusión para Fase 5 (documentación viva)

Cuando hagamos la documentación final, vamos a:
1. **Borrar** `PROJECT_DOCUMENTATION.md` y `AUDITORIA_COMPLETA.md` (obsoletos / inexactos / con secrets).
2. **Reescribir** `TECHNICAL_DOCUMENTATION.md` desde cero, sin secrets, basado en el código real, con sección de tablas completa y secciones a corregir según los hallazgos de esta auditoría.
3. **Crear** `/docs/ARCHITECTURE.md`, `/docs/RUNBOOK.md`, `/docs/ONBOARDING.md`, `/docs/DECISIONS/`.
4. **Crear** `.env.example` real.
