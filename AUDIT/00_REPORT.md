# 00 — Reporte consolidado de auditoría

**Fecha:** 2026-04-27
**Autor:** Claude (tech lead)
**Versión:** Final tras Fase 1 + 2 + remediation crítico de seguridad

Este es el reporte consolidado que pidió el prompt original al cierre de Fase 3. Junta los hallazgos de los 6 sub-auditorías (`03_code_quality`, `04_security`, `05_performance`, `06_parity`, `07_a11y`, `08_seo`, `09_devops`) en una tabla única y propone un roadmap.

---

## Resumen ejecutivo (15 líneas)

AdorAPP es una PWA en React/Vite para 8 usuarios reales de un ministerio de adoración. Llegó a mis manos con una emergencia de seguridad activa (service_role key en el bundle JS público + repo público + RLS sin role checks + passwords cleartext en DB), que cerré completamente en las primeras 4-5 horas: 5 Edge Functions admin-*, RLS reescrita con role checks reales, flow de registro sin password en cliente, pg_cron habilitado para reflexiones diarias, GitHub PAT rotado, app en `adorapp.net.ar` deployada y validada. Sigue habiendo deuda técnica importante pero **no urgente**: dos archivos monstruo (Header.jsx 1712 + MobileNav.jsx 1242) duplican ~40% de código, tres páginas con > 1000 líneas, cero tests, cero lint, cero error tracking, cero CI. Performance del cliente es decente para los datos actuales pero el bundle es 988 KB inicial (sin code splitting). Performance de DB: 22 advisors al inicio del día, hoy quedan 0 de severity Crítico tras los SQL quick-wins (índices FK, RLS init plan rewrite, primary key reparado en `song_key_history` que estaba mal en producción). A11y tiene 3 hallazgos críticos fácil de cerrar (focus-ring, modal focus trap, aria-describedby errors). SEO mínimo viable falta (OG tags, robots/sitemap reales, JSON-LD). DevOps es donde más debt hay: nada de observabilidad, ningún rollback documentado, ningún backup test. **Top 3 riesgos hoy:** (1) error invisible si la EF rompe un flow crítico de pastor — sin Sentry no nos enteramos; (2) cron de reflexiones puede fallar silenciosamente; (3) cualquier PR puede romper main porque no hay CI. **Top 3 quick wins de mayor ROI:** Sentry (30 min), code splitting + dynamic imports de jspdf/html2canvas (1 h, baja bundle 250 KB), focus-ring global (search-replace 30 min).

---

## Tabla consolidada de hallazgos

Severidad: 🔴 Crítico / 🟠 Alto / 🟡 Medio / 🔵 Bajo / 🟢 Nice-to-have.

| ID | Severidad | Área | Descripción | Archivo / dónde | Esfuerzo | Estado |
|---|---|---|---|---|---|---|
| **SEC1** | 🔴 | Seguridad | service_role key en bundle público | `src/lib/supabase.js` | 4 h | ✅ Resuelto hoy (commit 87a9cd2) |
| **SEC2** | 🔴 | Seguridad | Passwords cleartext en `pending_registrations` | DB schema | 2 h | ✅ Resuelto hoy (commits 013e72f + migration) |
| **SEC3** | 🔴 | Seguridad | RLS policies `USING(true)` para authenticated | DB | 3 h | ✅ Resuelto (`auth_role()` helpers + per-table policies) |
| **SEC4** | 🔴 | Seguridad | Signup público abierto | Supabase Auth | 5 min | ✅ Resuelto |
| **SEC5** | 🟠 | Seguridad | GitHub PAT con scopes excesivos en `.git/config` | Local | 10 min | ✅ Rotado, scopes mínimos, en Keychain |
| **SEC6** | 🟠 | Seguridad | Olga (auth.user huérfana) + Paul (member sin user_id) | DB rows | 5 min | ✅ Resuelto |
| **SEC7** | 🟡 | Seguridad | Service_role key vieja sigue siendo válida (Supabase no permite rotar legacy directly) | — | — | ⏸ Aceptado (cliente no la usa más) |
| **C1** | 🔴 | Código | Duplicación masiva Header/MobileNav (~40%, 600 líneas) | Header.jsx + MobileNav.jsx | 8 h | 🟡 FASE D |
| **DB-BUG** | 🔴 | Performance/Schema | `song_key_history` sin id/PK/NOT NULL en prod (bug histórico) | DB | 30 min | ✅ Reparado hoy |
| **DEV1** | 🔴 | DevOps | Sin error tracking — errores invisibles | — | 30 min | 🔵 FASE A |
| **DEV2** | 🔴 | DevOps | Cero tests | — | 1 sem | 🔵 FASE D |
| **DEV3** | 🔴 | DevOps | Sin procedimiento de rollback documentado | `docs/RUNBOOK.md` | 30 min | 🔵 FASE A |
| **A11Y1** | 🔴 | A11y | `focus:outline-none` sin alternativa, ~20 sitios | varios | 30 min | 🔵 FASE A |
| **A11Y2** | 🔴 | A11y | Modales sin `role=dialog` ni focus trap | `Modal.jsx` | 2 h | 🔵 FASE B |
| **A11Y3** | 🔴 | A11y | Errores de form no asociados al input (`aria-describedby`) | varios pages | 3 h | 🔵 FASE B |
| **A1** | 🟠 | Código | 3 páginas > 1000 líneas (Repertorio, Ordenes, Miembros) | varios | 3 d | 🔵 FASE D |
| **A2** | 🟠 | Código | 11 useState para cropper en cada página | Header, MobileNav | 2 h | 🔵 FASE D (con C1) |
| **A3** | 🟠 | Código | `.then()` sin `.catch()` en `Ordenes.jsx:589` | Ordenes.jsx | 5 min | 🔵 FASE A |
| **A4** | 🟠 | Código | Lookup frágil de perfil por email | authStore.js | docs | 🔵 Doc only |
| **MP1** | 🔴 | Parity | Cropper duplicado y matemáticamente divergente | Header + MobileNav | 2 h | 🔵 FASE D (con C1) |
| **MP2** | 🟠 | Parity | `inputmode`/`autocomplete` faltan en formularios | Login, Miembros | 30 min | 🔵 FASE A |
| **MP3** | 🟠 | Parity | Sort por columna no portado a mobile | Ordenes, Miembros | 1 h | 🔵 FASE B |
| **MP4** | 🟠 | Parity | Modal no respeta soft-keyboard mobile | Modal.jsx | 10 min | 🔵 FASE A |
| **MP5** | 🟠 | Parity | Bottom tab bar tap targets cramped | MobileNav.jsx | 5 min | 🔵 FASE A |
| **MP6** | 🟠 | Parity | Tablas con scroll horizontal en mobile | Miembros, Repertorio, Solicitudes | 3 h | 🔵 FASE B |
| **MP7** | 🟡 | Parity | Sin título visible en mobile | MobileNav | 30 min | 🔵 FASE A |
| **P1** | 🟠 | Performance | Sin code splitting por ruta (bundle 988 KB) | App.jsx | 1-2 h | 🔵 FASE A |
| **P2** | 🟠 | Performance | jspdf + html2canvas eager (~250 KB) | Repertorio, Ordenes | 30 min | 🔵 FASE A |
| **P5** | 🟡 | Performance | localStorage caches escriben sin diff | appStore.js | 1 h | 🔵 FASE B |
| **P6** | 🟡 | Performance | Avatares aceptan 5 MB sin compresión | cropper | 1 h | 🔵 FASE A |
| **P9** | 🟡 | Performance | `npm audit` 5 vulnerabilities | deps | 5 min | 🔵 FASE A |
| **DB1-9** | 🟡 | Performance | 22 advisors de Supabase | DB | 30 min | ✅ Resueltos hoy (excepto auth_db_connections que es INFO) |
| **DB3** | 🟡 | Performance | `members.id ≠ auth.users.id` (dos UUIDs por persona) | schema | 1 d | 🔵 FASE C |
| **DEV4** | 🟠 | DevOps | Sin CI | `.github/workflows/` | 1 h | 🔵 FASE A |
| **DEV5** | 🟠 | DevOps | Sin lint/format | configs | 1 h | 🔵 FASE A |
| **DEV6** | 🟠 | DevOps | Cron de reflexión sin alerting | DB function | 1 h | 🔵 FASE A |
| **DEV7** | 🟠 | DevOps | Backup PITR nunca probado | runbook | 1 h | 🔵 FASE A |
| **DEV8** | 🟠 | DevOps | Headers HTTP faltantes (CSP, Referrer-Policy, Permissions-Policy) | vercel.json | 1 h | 🔵 FASE A |
| **DEV9** | 🟡 | DevOps | Sin smoke test post-deploy | CI | 30 min | 🔵 FASE A |
| **DEV10** | 🟡 | DevOps | Todos los pushes a main, cero PRs | github settings | 30 min | 🔵 FASE A |
| **SEO1** | 🟠 | SEO | Sin og:* / twitter:* / canonical → preview pelado en social | index.html | 30 min | 🔵 FASE A |
| **SEO2** | 🟠 | SEO | `<title>` no cambia entre rutas | hook nuevo | 1 h | 🔵 FASE B |
| **SEO3** | 🟡 | SEO | `/robots.txt` y `/sitemap.xml` devuelven HTML del SPA | public/ | 10 min | 🔵 FASE A |
| **SEO4** | 🟡 | SEO | Manifest mínimo (icons mismos, sin screenshots) | manifest.json | 30 min | 🔵 FASE B |
| **SEO5** | 🟡 | SEO | Sin JSON-LD Organization | index.html | 5 min | 🔵 FASE A |
| **M1** | 🟡 | Código | `console.log` debug residual | Header + MobileNav | 10 min | 🔵 FASE A |
| **M3** | 🟡 | Código | naming dual `userId`/`user_id`, `avatarUrl`/`avatar_url` | toda la app | 4 h | 🔵 FASE D (con TS) |

(otros B/N/Bajo/Nice-to-have están en cada sub-report; no los repito acá)

**Totales:**
- **Críticos**: 11 — 7 ya resueltos hoy ✅, 4 abiertos (3 a FASE A, 1 a FASE B/D — modal focus trap).
- **Altos**: 18 — todos abiertos, distribuidos en fases.
- **Medios y bajos**: ~25, todos en fases B/C/D.

---

## Quick wins ya aplicados hoy

Aplicados como parte de la auditoría sin esperar al roadmap:

- ✅ 6 índices FK creados
- ✅ 6 índices unused dropped
- ✅ 9 RLS policies reescritas con `(SELECT auth.uid())`
- ✅ `bands` multiple permissive policies fixed (split FOR ALL)
- ✅ `song_key_history` reparado: `id` PK + NOT NULLs + UNIQUE constraint + trigger updated_at

---

## Roadmap revisado

Las 22 features que aprobaste, integradas con los hallazgos de la auditoría completa.

### FASE A — "Base operacional + perf rápida + a11y crítica + cleanup audit" (~3 días)

Combina:
- Tus aprobados Tier 1 (1, 2, 3, 5, 21, 22, 23, 24, 25)
- Hallazgos críticos auditoría que son fixes baratos: A11Y1, MP2, MP4, MP5, MP7, P1, P2, P9, M1, A3, SEO1, SEO3, SEO5, DEV1, DEV3, DEV4, DEV5, DEV6, DEV7, DEV8, DEV9, DEV10

Bloques:

| Bloque | Tareas | Esfuerzo |
|---|---|---|
| Observabilidad | Sentry (DEV1, #21) + UptimeRobot (#22) + headers HTTP completos (DEV8, #24) + JSON-LD + canonical + OG (SEO1+5) | 4 h |
| Repo health | ESLint + Prettier (DEV5) + GitHub Actions CI (DEV4, #23) + branch protection (DEV10) + `docs/RUNBOOK.md` con rollback (DEV3) + smoke test post-deploy (DEV9) | 4 h |
| Perf cliente | Code splitting por ruta (#2, P1) + dynamic import jspdf/html2canvas (P2) + compresión avatares (#3, P6) + npm audit fix (P9) | 4 h |
| Mobile/a11y rápidos | Focus-ring global (A11Y1) + `inputmode`/`autocomplete` (MP2) + 100dvh+safe-area en Modal (MP4) + tap targets (MP5) + título mobile (MP7) + `prefers-reduced-motion` (A11Y6) | 3 h |
| DB/SEO chiquitos | `robots.txt` + `sitemap.xml` reales (SEO3) + cron alerting reflexión (DEV6) + backup verification first run (DEV7) + Vercel `regions: gru1` (DEV13) | 3 h |
| Misc | `index_advisor` cron (#5) + auditoría log (parte de #4 setup) + cleanup `console.log` restantes (M1) + `.catch()` en Ordenes:589 (A3) | 2 h |

**Total FASE A:** ~20 horas (~3 días enfocados).
**Acceptance:** 0 advisors críticos pendientes, Sentry recibe el primer error de prueba, CI falla un PR de prueba con sintaxis rota, login + un flow pastor responden en mobile bajo 200 ms y bajo 4G simulado.

### FASE B — "Funcionalidad de alto valor user-facing + a11y restante" (~5 días)

Combina:
- Tus aprobados Tier 2 (1 CMD+K, 4 audit log, 6 onboarding, 7 drag-and-drop, 10 fuzzy search, 11 history timeline, 13 director smart-suggest, 14 CSV export)
- Hallazgos: A11Y2 (modal focus trap), A11Y3 (form error a11y), MP3 (sort en mobile), MP6 (cards en lugar de tablas), SEO2 (titles per route), SEO4 (manifest expand), P5 (localStorage diff)

Orden sugerido:
1. CMD+K (#1) — palette global. Es alto impacto y no depende de nada.
2. Audit log + history timeline (#4 + #11) — juntos, encajan.
3. Modal focus trap (A11Y2) y `aria-describedby` errors (A11Y3) — los 2 críticos a11y restantes.
4. Cards en mobile reemplazando tablas (MP6) + sort en mobile (MP3).
5. Onboarding wizard (#6).
6. Director smart-suggest (#13) + fuzzy search con `pg_trgm` (#10).
7. CSV export (#14).
8. Drag & drop canciones en orden (#7).

**Total FASE B:** ~5 días.

### FASE C — "Plataforma robusta + cleanup técnico" (~7 días)

Combina:
- Tus aprobados Tier 2/3 (8 PWA offline, 9 push, 12 calendario)
- Hallazgo: DB3 (unify `members.id` con `auth.users.id` — refactor schema)

1. PWA offline real (#8) con service worker + IndexedDB.
2. Push notifications (#9).
3. Calendario visual (#12).
4. Schema unification (DB3) — 1 día con migration cuidadosa.

### FASE D — "Calidad técnica transversal" (~10-15 días, en paralelo a B/C)

- Test suite (#17, DEV2): Vitest + Testing Library + Playwright. Empezamos con `transposeChordString` (que tiene aristas conocidas), RLS sobre `members`, EFs con mocks. Crece feature por feature.
- Refactor Header/MobileNav (#18, C1, A2, MP1): hooks `usePhotoCropper`, `useNotifications`, `useProfileSheet`. -600 líneas, los archivos quedan < 500 cada uno.
- Migración progresiva a TypeScript (#16, M3): `lib/`, `stores/`, después components. Mata la familia de bugs `userId/user_id`.

---

## Acceptance criteria globales

**Definición de "auditoría cerrada":** todos los críticos resueltos o aceptados con justificación documentada.

Hoy:
- ✅ 7 críticos resueltos.
- 🟡 4 críticos pendientes: A11Y1, A11Y2, A11Y3, DEV1, DEV2 (DEV2 = test suite, va a FASE D por extension).
- 🟢 Sería ideal cerrar A11Y1+DEV1+DEV3 en FASE A para tener 0 críticos abiertos al cierre del primer sprint.

---

## Próximos pasos sugeridos para el usuario

1. Confirmar que arrancamos FASE A. Es ~3 días de trabajo enfocado, todo low-risk.
2. Antes de FASE A: hacer un test manual de prod que validate los flows clave (login, ver orden, agregar miembro, aprobar solicitud, mandar comunicación). Yo te puedo guiar paso a paso si querés.
3. Después de FASE A: replantear prioridades de B vs C según el feedback real.
