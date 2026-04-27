# Sub-audit 3.7: DevOps / Observability / Resiliency

## Executive Summary

AdorAPP deploys successfully to Vercel with zero downtime, but observability and incident response are minimal. No test suite, no linting, no pre-commit hooks, no GitHub Actions—only Vercel's auto-deploy from `main`. Error tracking is console-only (unwired). Cron jobs are configured in Supabase but resilience is untested. Backup/restore procedures are not documented. For a small, single-operator team, this is acceptable day-to-day, but a single bad deploy or database corruption would have no recovery path.

---

## Critical Findings

**3.7.1 | No automated tests (0% coverage)**
- **Where:** No test files found (grep for `*.test.js`, `*.spec.js` returned only node_modules)
- **What:** Zero test infrastructure. Changes deploy directly to production with no validation.
- **Impact:** Crítico. Any regression (e.g., broken login, corrupt member record) goes live immediately.
- **Fix:** Set up Jest or Vitest with at least smoke tests for auth, member CRUD, and repo functions. Target 40%+ coverage. Add to CI (GitHub Actions or Vercel CI).

**3.7.2 | No error tracking / observability**
- **Where:** `src/stores/authStore.js`, `appStore.js`, and other files use only `console.error()`
- **What:** Errors logged to browser console only. Vercel runtime logs not wired to external service (no Sentry, Logtail, Datadog, etc.). No production error context.
- **Impact:** Crítico. When a user reports "I can't save my song," there's no way to find the error. Each incident requires asking the user to check their console.
- **Fix:** Integrate Sentry (free tier for small apps) or Vercel's native observability. Even a logging edge function would help capture errors server-side.

**3.7.3 | No deployment rollback procedure documented**
- **Where:** Not in README, AUDIT, or TECHNICAL_DOCUMENTATION
- **What:** If a deploy breaks production, no documented rollback steps. Manual process unknown.
- **Impact:** Alto. RTO = unknown; could be hours of manual investigation.
- **Fix:** Document in a `DEPLOYMENT.md`: (1) Vercel has "Revert" button on Deployments tab (< 1 min), (2) database rollback via Supabase's Point-In-Time Recovery (PITR) if data corruption (requires Pro plan, assumed present), (3) smoke tests to run post-deploy.

---

## High-Severity Findings

**3.7.4 | No linting or code formatting enforced**
- **Where:** No `.eslintrc`, `.prettierrc`, or `.editorconfig` in project root
- **What:** Code style is manual. Potential for style drift, unused imports, console.logs in production.
- **Impact:** Alto. Increases code review friction and bug surface area (e.g., accidental `console.log` in prod, dead code).
- **Fix:** Add ESLint + Prettier to `package.json`. Add pre-commit hook (Husky) to lint on `git commit`. Add GitHub Actions to lint PRs.

**3.7.5 | No pre-commit hooks (Husky)**
- **Where:** No `husky/` directory, no `.git/hooks/` customization
- **What:** Nothing prevents committing lint errors, console.logs, or formatted code.
- **Impact:** Alto. Allows bad code into main without friction.
- **Fix:** `npm install husky --save-dev && npx husky install && npx husky add .husky/pre-commit "npm run lint"`

**3.7.6 | No CI/CD pipeline (GitHub Actions or Vercel Build)**
- **Where:** No `.github/workflows/`, Vercel set to auto-deploy all branches to production
- **What:** Every commit to `main` auto-deploys. No explicit approval, no pre-deploy checks (tests, lint, build).
- **Impact:** Alto. Breaking changes merge and deploy without review or validation.
- **Fix:** Add GitHub Actions workflow to run tests + lint on PR. Vercel can block merges until checks pass. Or configure Vercel to require manual approval for `main` deploys.

**3.7.7 | Cron job resilience untested**
- **Where:** `src/stores/appStore.js` mentions daily reflection feature; Supabase cron enabled
- **What:** Daily cron job configured in pg_cron, but no alerting if job fails, no SLA documented, no test run.
- **Impact:** Alto. If the daily reflection delivery fails silently, users see no data and have no way to know. Job could be broken for days undetected.
- **Fix:** (1) Query `SELECT * FROM cron.job WHERE active = true` to list jobs and verify they exist. (2) Add a success/failure email notification to the Edge Function. (3) Document SLA (e.g., "must deliver by 8am CAF timezone"). (4) Manual test run: trigger job manually, verify output.

**3.7.8 | No RTO / RPO targets defined**
- **Where:** Not in project docs
- **What:** No agreed-upon Recovery Time Objective or Recovery Point Objective. "How long is downtime acceptable?" and "How much data loss is acceptable?" unanswered.
- **Impact:** Alto. On incident, no SLA to guide recovery priority.
- **Fix:** Agree with stakeholder: e.g., "RTO: 2 hours (manual Vercel rollback), RPO: 24 hours (daily DB snapshot)." Document in `DEPLOYMENT.md`.

---

## Medium-Severity Findings

**3.7.9 | No documented Supabase backup / restore procedure**
- **Where:** TECHNICAL_DOCUMENTATION mentions Supabase Pro but no restore steps
- **What:** Supabase PITR (Point-In-Time Recovery) is available on Pro, but no documented process to restore (where to click, how to test).
- **Impact:** Medio. If DB corruption occurs, recovery is manual and error-prone. Untested procedure may not work when needed.
- **Fix:** Document restore process: (1) Go to Supabase dashboard > Backups. (2) Select target point in time. (3) Test restore on a branch first (Supabase allows branching). (4) Verify data, cut over. Add to runbook.

**3.7.10 | Branching strategy unclear; all work on main**
- **Where:** `git log` shows all commits on `main`; no evidence of feature branches
- **What:** No PR workflow. Commits merged directly to main. History shows ~30 commits over dev period, no branches listed.
- **Impact:** Medio. Lack of code review increases risk. Hard to track "what changed in this release."
- **Fix:** Adopt GitHub Flow: create feature branches, open PRs, require 1 approval, merge to main. Vercel auto-deploys main.

**3.7.11 | Vercel Preview deployments not explicitly tested**
- **Where:** Vercel config and project settings (not readable from CLI)
- **What:** Vercel supports PR preview deployments. Not clear if configured or being used.
- **Impact:** Medio. PRs could be tested in production-like environment before merging, but it's unclear if this is set up.
- **Fix:** Verify Vercel project settings: "Git Integration" > "Preview Deployments." If not set, enable. Document: "Each PR gets a preview URL automatically; test before merging."

---

## Low-Severity & Nice-to-Have Findings

**3.7.12 | Secrets management via `.env.local` and Vercel env vars**
- **Where:** `.env.example` (readable), `.env.local` (in `.gitignore`), Vercel project settings
- **What:** Pattern is correct: `.env.example` documents variables, `.env.local` is gitignored, production vars in Vercel. Verified `.gitignore` excludes `.env*`.
- **Impact:** None. ✓ Pass.
- **Verdict:** Secrets are not committed; approach is sound.

**3.7.13 | No external uptime monitoring**
- **Where:** System level (not in code)
- **What:** No Pingdom, Uptime Robot, or similar to alert if adorapp.net.ar becomes unavailable.
- **Impact:** Bajo. For a ~8-user internal app, manual checks suffice, but external monitor is cheap insurance.
- **Fix:** Optional. Use free tier of Uptime Robot or Pingdom. Alert if down for > 5 min.

**3.7.14 | Client-side polling instead of Realtime subscriptions (partial fix)**
- **Where:** `src/components/layout/Header.jsx`, `MobileNav.jsx`, `Solicitudes.jsx` use `setInterval()` (2–5 min intervals)
- **What:** Some data still polled (notifications, requests). Realtime subscriptions are present but not universal.
- **Impact:** Bajo. Intervals are reasonable (not spamming), and realtime is implemented for critical tables. Incremental improvement only.
- **Fix:** Move remaining `setInterval()` calls to Realtime subscriptions to reduce latency and egress (already partially done per audit log entry `1e4c50c`).

---

## Vercel Config Review

**`vercel.json` (verified):**
- `regions: ["iad1"]` — Single US region (Virginia). No global fallback. Acceptable for CAF-only audience.
- `rewrites: [{ "source": "/(.*)", "destination": "/index.html" }]` — SPA routing. Correct.
- `headers` — Only two headers set: `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`. Missing:
  - `X-XSS-Protection: 1; mode=block` (deprecated but good for legacy browsers).
  - `Referrer-Policy: strict-origin-when-cross-origin` (avoid leaking to external sites).
  - `Permissions-Policy` (formerly Feature-Policy, control camera/mic/geolocation).
  - See finding 3.7.15 below.

**3.7.15 | Missing Vercel security headers (low priority)**
- **Where:** `vercel.json` headers section
- **What:** Only `X-Content-Type-Options` and `X-Frame-Options` set. Missing `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection`.
- **Impact:** Bajo. HSTS is set (via TLS), CSP not needed for a same-origin app. Additions are defensive posture.
- **Fix:** Add to `vercel.json`:
  ```json
  { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
  { "key": "Permissions-Policy", "value": "geolocation=(), microphone=(), camera=()" },
  { "key": "X-XSS-Protection", "value": "1; mode=block" }
  ```

---

## Infrastructure Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Hosting | ✓ Vercel | Auto-deploy main, single region (iad1), HSTS enabled |
| Build | ✓ npm run build | Vite, ~30s build time |
| Database | ✓ Supabase (Pro assumed) | PITR available, migrations table present |
| Auth | ✓ Supabase Auth | RLS enforced |
| Logs | ✗ Console only | No external sink (Sentry, Logtail, etc.) |
| Tests | ✗ None | 0% coverage |
| Lint/Format | ✗ None | No ESLint, Prettier, Husky |
| CI/CD | ✗ Vercel auto-deploy | No GitHub Actions, no pre-deploy checks |
| Monitoring | ✗ None | No uptime monitor, no cron alerting |
| Backup/Restore | ✓ PITR (untested) | Procedure not documented |
| Rollback | ✓ Vercel Revert (manual) | Not documented |

---

## Quick Wins (2–3 hours)

1. Add ESLint + Prettier to `package.json`. Run `npm run lint` on CI.
2. Create `DEPLOYMENT.md` with Vercel rollback + PITR restore steps.
3. Add Sentry (free tier) to capture production errors.
4. Document RTO/RPO SLA.

---

## Larger Projects (1–2 weeks)

1. Set up Jest + Vitest with smoke tests (auth, CRUD, key functions). Target 40%+ coverage.
2. Add GitHub Actions workflow for lint + test on PR.
3. Implement Husky pre-commit hooks.
4. Enable Vercel Preview deployments and document PR workflow.
5. Set up external uptime monitoring (Uptime Robot).
6. Test Supabase PITR restore on a branch; document steps.
7. Audit cron job logs; add failure alerting.
8. Add missing security headers to `vercel.json`.

