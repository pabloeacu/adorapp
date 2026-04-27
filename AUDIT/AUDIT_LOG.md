# AUDIT_LOG — AdorAPP

Bitácora viva de la auditoría y refactor liderada por el nuevo tech lead (Claude). Cada acción queda registrada acá con hora, alcance y resultado.

**Ubicación del repo de trabajo:** `/Users/paulair/Desktop/Adorapp/adorapp/` (el repo git real está acá adentro; la carpeta `/Users/paulair/Desktop/Adorapp/` es solo un wrapper con scripts sueltos del agente anterior).

---

## 2026-04-27

### 10:50 — Onboarding Fase 1 iniciada
- Contexto: el usuario (Paul) me transfiere control total del proyecto. Última actividad del agente anterior: commit `1a4b679` (2026-04-27, sistema de reflexiones).
- Repo: `github.com/pabloeacu/adorapp` (verificado **público** vía API).
- Stack confirmado leyendo código (no solo doc): Vite 5 + React 18 SPA, Tailwind, Zustand, React Router v6, Supabase JS v2.45 (DB + Auth + Storage), Vercel hosting (proyecto `adorapp`, equipo `pabloeacus-projects`, dominio `adorapp.net.ar`).
- Branch `main`, sin worktrees adicionales. Cambios sin commitear: `src/components/layout/Header.jsx` (solo console.log de debug — irrelevante), `TECHNICAL_DOCUMENTATION.md` y `pnpm-lock.yaml` untracked.

### 10:52 — Lecturas realizadas (solo lectura, sin modificar nada)
- `TECHNICAL_DOCUMENTATION.md` (904 líneas) — completo
- `PROJECT_DOCUMENTATION.md` (448 líneas) — completo
- `AUDITORIA_COMPLETA.md` — auditoría previa del agente anterior
- `SOLUTION_GUIDE.md`
- `package.json`, `vite.config.cjs`, `vercel.json`, `index.html`, `manifest.json`, `.gitignore`, `.env.local`
- `src/lib/supabase.js`, `src/lib/useAuth.js`
- `src/App.jsx`, `src/main.jsx`
- `src/stores/authStore.js`, `src/stores/appStore.js`
- `src/components/layout/{Layout,Sidebar,MobileNav}.jsx` (Header.jsx parcial — 1712 líneas, demasiado grande)
- `src/pages/{Login,Solicitudes,Miembros,Comunicaciones,Dashboard}.jsx` (parciales/completos)
- `supabase/config.toml`, todas las migrations (`20240101...add_profile_fields`, `20260414...song_key_history`, `20260421...member_editor`, `20260421...song_compass_bpm`, `20260423...fix_song_key_history_rls`, `20260427...daily_reflections_and_notifications`, `20260427...daily_notification_function`)
- SQL files raíz: `supabase_schema.sql`, `FIX_SECURITY_VULNERABILITIES.sql`, `supabase_communications.sql`
- Git log completo (102 commits, primer commit ~2026-04-13)

### 10:55 — Hallazgos críticos (resumen, detalle en `00_EMERGENCY.md`)
1. 🚨 **CRÍTICO ABSOLUTO** — `service_role` key de Supabase hardcodeada en `src/lib/supabase.js:5`, exportada como `supabaseAdmin`, usada desde 4 archivos de cliente. Va al bundle JS público de `adorapp.net.ar` y al repo público de GitHub.
2. 🚨 **CRÍTICO** — `password_hash` en `pending_registrations` guarda **contraseñas en cleartext** (no hay trigger que las hashee, comprobado en migrations).
3. 🚨 **ALTO** — RLS policies son `USING (true)` para `authenticated` en todas las tablas + `enable_signup = true` → cualquiera puede registrarse y leer/borrar TODO.
4. 🚨 **ALTO** — GitHub PAT (`ghp_Cuv3R...`) embebido en `.git/config` local (no commiteado, pero igual hay que rotarlo).
5. **MEDIO** — Sin protección de rutas backend: el rol pastor/leader/member solo se chequea en frontend.
6. **MEDIO** — Auto-sync agresivo: SELECT * de 4 tablas cada 30s + cada cambio de ruta + cada 5min PWA. Va a quemar cuota de Supabase free.
7. **MEDIO** — localStorage cachea data sensible y NO se limpia en logout (comentario explícito en `appStore.js:804`).
8. **BAJO** — Doc `TECHNICAL_DOCUMENTATION.md` y `PROJECT_DOCUMENTATION.md` contienen `service_role` en texto plano. `PROJECT_DOCUMENTATION.md` está commiteado al repo público.

### 10:58 — Acciones tomadas
- Creada estructura `/AUDIT/` en `adorapp/AUDIT/`.
- Creados archivos: `AUDIT_LOG.md` (este), `00_EMERGENCY.md`, `01_doc_notes.md`, `02_project_map.md`.
- **No se ha modificado código fuente, ni la DB, ni Vercel, ni Cloudflare, ni `nic.ar`.**
- Esperando autorización del usuario para ejecutar el plan de remediación de la emergencia.

### 11:30–17:30 — Plan de emergencia ejecutado, refactor de consistencia, fortificación general

Acciones autónomas (yo) y co-operadas con el usuario, en orden:

**Seguridad (cerrar la emergencia)**
- Disabled signup público en Supabase Auth (vía Chrome).
- 5 Edge Functions deployadas (`admin-create-member`, `admin-delete-member`, `admin-reset-password`, `admin-approve-registration`, `admin-reject-registration`).
- Refactor cliente: borrada `supabaseAdmin` del bundle. `src/lib/supabase.js` reescrito para leer env vars Vite y exponer `callAdminFunction()`.
- Vercel env vars seteadas (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- Migrations: helpers `auth_role()`, `is_pastor()`, `is_pastor_or_leader()` + RLS policies con role checks por tabla. Drop & recreate de las 60+ policies legacy del agente anterior.
- Migration: `pending_registrations.password_hash` nulleada y marcada como DEPRECATED.
- Refactor flow registro: el RegisterModal ya no pide password; pastor genera 12-char random al aprobar y la revela one-shot.
- EF `admin-approve-registration` v2 con password obligatorio (sin fallback al campo deprecado).
- Service_role key — **descartada la rotación** porque Supabase ya no permite rotar la legacy directly. Mitigación: ningún cliente la usa más; solo las EFs (que la inyecta Supabase como secret default que se actualiza solo).
- **Caso Olga**: era un orphan auth.user de un delete que falló silently con la lógica vieja. Borrada del `auth.users`. Bug de raíz arreglado: `admin-delete-member` v2 ahora borra el auth.user PRIMERO y aborta si falla, en lugar de seguir y dejar zombies.

**GitHub PAT**
- PAT viejo "AdorAPP Deploy" con scopes excesivos (admin:enterprise, delete_repo, etc.) revocado.
- Nuevo PAT con scope mínimo `repo`, expiración 90 días, almacenado en macOS Keychain. `.git/config` limpio sin token embebido.

**Consistencia / single source of truth**
- Verificado y vinculado: Paul y Andres tenían `member.user_id IS NULL` — vinculados a sus auth.users. Paul recuperó permisos de pastor sin re-loguear.
- `authStore.refreshProfile()` ahora también dispara `appStore.initialize()` — cualquier cambio de perfil/foto/rol se propaga a todo el árbol en el mismo tick.
- `authStore.logout()` ampliado: limpia 16+ claves de localStorage incluyendo todos los `readNotificationIds_*` per-user, `appMembers/Bands/Songs/Orders`, flags `rememberMe`, etc. Cero data del usuario anterior visible al next login en el mismo dispositivo.
- 12 referencias a `photo_url` (columna que no existe) eliminadas. Toda lectura/escritura va por `avatar_url`.

**Edge Functions atómicas**
- Nueva EF `admin-send-communication`: el fan-out de un mensaje a N destinatarios (parent + per-recipient inserts) ahora es server-side y atómico — si falla la inserción de los notifications, hace rollback del parent. Antes el cliente lo hacía en N round-trips y podía dejar mensajes huérfanos.

**Notificaciones bell — Realtime**
- Header.jsx y MobileNav.jsx suscriben vía `supabase.channel()` a INSERT en `notifications` (is_global), `communication_notifications` (recipient_id=me), `songs`. Latencia: 2 minutos → ~1 segundo.
- Publication `supabase_realtime` extendida para incluir las 5 tablas relevantes (sin esto las suscripciones nunca disparan).
- 2-minute fallback poll mantenido para "derived" notifications (cuento de canciones recientes, etc.) que no tienen Realtime hook directo.

**Reflexión diaria automatizada**
- pg_cron habilitado.
- `send_daily_reflection_notification()` reescrita con `search_path` lockeado e idempotente (replaces today's reflection en lugar de stackear).
- Cron job `daily-reflection-notification` agendado: `5 0 * * *` (00:05 UTC, ≈ 21:05 Argentina). Disparado una vez al deploy para popular el bell ya.

**Auto-sync optimizado**
- App.jsx: removido el setInterval de 30s y el setAutoRefresh PWA de 5min. Reemplazado por:
  - sync on route change (mantenido)
  - sync on window focus / visibilitychange (nuevo)
  - Realtime subscriptions para data sensible al cambio
- appStore: borrada toda la lógica de `setAutoRefresh`/`autoRefreshInterval` que ya no se usa.

**Cleanup repo**
- 38 archivos legacy del agente anterior borrados (`*FIX_RLS*.sql`, scripts ad-hoc, daily_reflections_inserts.sql 93KB, etc.).
- `PROJECT_DOCUMENTATION.md` (con service_role en plaintext) eliminado del repo.
- `TECHNICAL_DOCUMENTATION.md` sanitizado.
- `src/lib/useAuth.js` (dead code) eliminado.
- `package-lock.json` agregado al repo.
- console.log de debug innecesarios limpiados de Header.jsx y Comunicaciones.jsx.

**Secret Scanning**
- GitHub Push Protection bloqueó un commit que tenía el PAT viejo citado en `00_EMERGENCY.md`. Sanitizado y re-pusheado.

### 17:35 — Estado final
- 4 commits en `main`: `87a9cd2` (security refactor), `013e72f` (registration flow), `b4cff54` (cleanup), `1e4c50c` (realtime + atomic + single-source).
- Vercel: último deploy `dpl_9jEjKeDnSt1CVd5RcTjgcTfSLB6m` READY en `adorapp.net.ar`.
- Bundle de producción verificado: 0 referencias a `service_role` / `supabaseAdmin`.
- Advisors Supabase: 6 warnings restantes, todos esperables (2 INSERT-anon en pending_registrations es el formulario público; 3 SECURITY DEFINER helpers que las RLS usan; 1 HIBP toggle omitido por decisión de diseño).

### Pendiente del lado del usuario / decisiones
- HIBP password protection: omitido. Reabrir solo si se agrega un flow self-set-password en Fase 2.
- Test end-to-end manual con Paul logueado en producción para confirmar que las RLS apretadas no bloquean ningún flow legítimo.

---
