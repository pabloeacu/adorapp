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

---
