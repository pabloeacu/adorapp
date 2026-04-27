# Sub-audit 3.6: SEO & Metadata

## Executive Summary

AdorAPP is correctly configured for a private, auth-walled app with ~8 users. PWA basics are solid: manifest is valid, icons marked maskable, theme colors consistent. Main gaps are lack of per-route dynamic titles (all routes show identical title), missing structured data (Organization JSON-LD), no `robots.txt` or `sitemap.xml`, and no OpenGraph/Twitter Card metadata. For social sharing (the actual need here), OG tags would help. Impact is low—this is not SEO-driven—but quick wins exist.

---

## Critical Findings

None identified. TLS, HSTS, and security headers are properly set.

---

## High-Severity Findings

**3.6.1 | Missing OpenGraph & Twitter Card metadata**
- **Where:** `index.html` (lines 1–28)
- **What:** No `og:title`, `og:description`, `og:image`, `og:url`, or Twitter Card (`twitter:card`, `twitter:image`) tags. Social sharing (WhatsApp, Slack, email) will show placeholder previews.
- **Impact:** When users share links to the app with peers (e.g., "check out the new Solicititudes feature"), preview will be blank or generic.
- **Fix:** Add static OG meta tags to `index.html` with the app name, description, and a 1200×630px image. Optionally, implement per-route dynamic tags (see Medium findings).

---

## Medium-Severity Findings

**3.6.2 | Per-route page titles not dynamic**
- **Where:** `src/App.jsx` (lines 54–105), all route components
- **What:** `<title>` in `index.html` is static "AdorAPP - La plataforma de Adoración CAF". No `document.title` updates on route change (no grep hits for `document.title`). Browser tab always shows same title.
- **Impact:** Low for this app (user rarely shares tabs), but poor UX for multi-tab workflows. Useful for browser history too.
- **Fix:** Add `useEffect` in each route component to set `document.title` to a unique label (e.g., "Órdenes | AdorAPP", "Repertorio | AdorAPP").

**3.6.3 | Missing structured data (JSON-LD)**
- **Where:** Not present in `index.html` or src files
- **What:** No `<script type="application/ld+json">` with `Organization` schema. Helpful for search engines and social platforms to recognize the entity.
- **Impact:** Low for a private app, but enables richer previews on some platforms.
- **Fix:** Add a single `Organization` JSON-LD block to `index.html` with name, description, logo URL, and URL. Example:
  ```json
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "AdorAPP",
    "description": "La plataforma de Adoración CAF",
    "url": "https://adorapp.net.ar",
    "logo": "https://adorapp.net.ar/adoracion-caf-logo.png"
  }
  ```

**3.6.4 | Missing `robots.txt` and `sitemap.xml`**
- **Where:** `public/` directory (not found)
- **What:** No `robots.txt` or `sitemap.xml` present. Crawler behavior not explicitly declared.
- **Impact:** Low—Vercel rewrite to `/index.html` makes all routes crawlable anyway—but signals intent.
- **Fix:** Create `public/robots.txt`:
  ```
  User-agent: *
  Allow: /
  Sitemap: https://adorapp.net.ar/sitemap.xml
  ```
  For `sitemap.xml`: since this is a SPA with dynamic routes, generate a static one with key pages (`/`, `/login`). Or skip if privacy is a concern.

---

## Low-Severity & Nice-to-Have Findings

**3.6.5 | Favicon and touch icon consolidation**
- **Where:** `index.html` (lines 14–19)
- **What:** Same `adorapp-logo.png` used for all favicon and apple-touch-icon sizes (192x192, 512x512 in manifest; single PNG in favicon links). Works, but using distinct sizes prevents browser scaling artifacts.
- **Impact:** Negligible—current approach works on mobile and desktop.
- **Fix:** Optional. If desired, use separate pre-sized PNGs (192×192 and 512×512 as distinct files) and reference them separately.

**3.6.6 | Manifest missing `categories` and `screenshots`**
- **Where:** `public/manifest.json` (lines 1–24)
- **What:** No `categories` (optional but helpful for install prompt) and no `screenshots` array (improves Chrome install UI).
- **Impact:** Minor—install prompt will still appear on mobile Chrome, but screenshots improve CTR.
- **Fix:** Add `"categories": ["productivity", "utilities"]` and optional `screenshots` array (portrait and landscape).

**3.6.7 | theme-color applies only to Chrome address bar**
- **Where:** `index.html` line 10, `manifest.json` line 8
- **What:** Both set to `#000000`. Works, but Safari/other browsers may not respect it universally.
- **Impact:** Cosmetic. Current choice (black) matches the app's dark theme.
- **Fix:** No action needed; current state is intentional and appropriate.

---

## URL Verification Results

- **`adorapp.net.ar`** → HTTP 307 redirect to `www.adorapp.net.ar`
- **`www.adorapp.net.ar`** → HTTP 200 OK
- **TLS:** ✓ HTTPS enforced, `strict-transport-security: max-age=63072000` (2 years)
- **Headers:** ✓ `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (set in `vercel.json`)
- **Cache:** `cache-control: public, max-age=0, must-revalidate` (no caching—appropriate for SPA index.html)
- **ETag:** Present (`1f99940cc2e2d8072a057e8f25d92c11`), enables browser cache validation
- **Server:** Vercel (via Vercel Edge)

---

## Login Page Information Leakage

**3.6.8 | No sensitive information leakage on `/login`**
- **Where:** All routes, including `/login` (verified via `curl -s https://www.adorapp.net.ar/login`)
- **What:** Login page serves the same `index.html` SPA shell. No member names, song titles, or internal data visible before authentication.
- **Impact:** None—good practice.
- **Verdict:** ✓ Pass. Access control is enforced client-side by Router + RLS.

---

## Quick Wins (1–2 hours)

1. Add OpenGraph meta tags to `index.html` (name, description, image 1200×630).
2. Add static `robots.txt` to `public/`.
3. Add Organization JSON-LD block to `index.html`.

---

## Larger Projects (4–6 hours)

1. Implement per-route `document.title` updates via `useEffect` in each route component.
2. Generate and deploy `sitemap.xml` (optional, only if browsability matters).
3. Add `screenshots` and `categories` to `manifest.json`.

