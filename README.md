# AdorAPP

**La plataforma del ministerio de adoración de Adoración CAF.**
Los líderes arman las **órdenes** (la lista de canciones de cada reunión), la banda ensaya con acordes y tono a medida, y todo el equipo recibe los avisos que le corresponden — sin planillas ni grupos de WhatsApp perdidos.

🌎 **En vivo:** [adorapp.net.ar](https://adorapp.net.ar) · PWA (se instala como app en el celular).

> Hecha **a medida** del ministerio, siguiendo la visión de los pastores generales de la iglesia — perseguimos la excelencia con el único afán de que brille el Rey y se extienda Su reino.

---

## Qué hace

- **Repertorio** con letra y acordes, transporte de tono en vivo, y export a PDF.
- **Órdenes** de servicio: canciones, banda, director y tono por canción, con historial.
- **Formación del servicio**: quién toca y con qué instrumento; los avisos de ensamble/ensayo van solo a quienes participan.
- **Mi Ensayo** (Ensayómetro): práctica personal por orden, con metrónomo y recordatorios opt‑in.
- **Bandas** con integrantes permanentes y temporales, y **colaboración** (pedir un reemplazo para un servicio).
- **Multi‑área**: además de Adoración, roles de solo lectura para **Multimedia** y **Sonido** (plan de canales incluido).
- **Comunicaciones** del pastor, **correos** transaccionales (Gmail) y **notificaciones push**.
- **Iniciar servicio**: presentador a pantalla completa con acordes en el tono del orden.
- **Salud del sistema** (solo pastores): un semáforo del estado de la plataforma.

## Stack

- **Frontend:** React 18 + Vite 5, [Zustand](https://github.com/pmndrs/zustand) (estado), React Router 6, Tailwind CSS 3, PWA (service worker).
- **Backend:** [Supabase](https://supabase.com) (Postgres + RLS + Auth + Storage) con **Edge Functions** (Deno) para todo lo privilegiado. **RLS en todas las tablas**; el `service_role` vive **solo** en los secrets de las Edge Functions, nunca en el cliente.
- **Infra:** desplegada en **Vercel**; correo por la **Gmail API** (encolado + worker por cron); tareas automáticas con **pg_cron**.
- **Tests:** [Vitest](https://vitest.dev). Lint con ESLint, formato con Prettier.

## Estructura

```
src/
  pages/        Pantallas (Órdenes, Repertorio, Bandas, Miembros, …)
  components/   UI compartida (ui/, layout/, dashboard/, orders/, …)
  stores/       Estado Zustand (authStore, appStore)
  lib/          Lógica pura y helpers (transposición, converters, formación, …)
  hooks/        Hooks compartidos
supabase/
  migrations/   Esquema e historia de la base (SQL)
  functions/    Edge Functions (admin-*, send-emails, send-push, collab, …)
docs/           RUNBOOK y planes de features
presentation/   Generador del PDF de presentación
scripts/        Utilidades (seed de devocionales, imágenes)
```

## Cómo correrlo

Requiere **Node 20+** (la CI usa Node 24) y un proyecto de Supabase.

```bash
npm install
cp .env.example .env.local   # y completá las dos variables VITE_SUPABASE_*
npm run dev                  # http://localhost:5173
```

Las variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) están descritas en [`.env.example`](.env.example). La **anon key es pública a propósito**: la frontera de seguridad es RLS + Edge Functions, no la clave.

### Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite). |
| `npm run build` | Build de producción. |
| `npm test` | Corre la batería de pruebas (Vitest). |
| `npm run lint` | ESLint sobre `src/`. |
| `npm run typecheck` | Chequeo de tipos de los archivos TS. |
| `npm run format` | Formatea con Prettier. |

## Desarrollo y despliegue

- **Rama protegida `main`.** Todo cambio va por una rama (`feat/`, `fix/`, `refactor/`, `docs/`, `test/`) → Pull Request → CI en verde → merge (squash).
- **CI** (`.github/workflows/ci.yml`): ESLint + Vitest + build, y un smoke test contra producción tras el deploy.
- **Migraciones:** cada cambio de esquema es un `.sql` en `supabase/migrations/` (aplicado también a la base).
- La plataforma está **en vivo con usuarios reales**, así que cada cambio se hace con precisión quirúrgica y verificación empírica.

## Documentación

- **[`CLAUDE.md`](CLAUDE.md)** — el **contrato** del proyecto: metodología obligatoria, reglas y las "trampas conocidas" (landmines) acumuladas. Es la fuente de verdad para cualquier persona (o agente) que trabaje acá.
- **[`ARCHITECTURE.md`](ARCHITECTURE.md)** — mapa de subsistemas (núcleo previo; parcialmente desactualizado — ver `CLAUDE.md` para lo más nuevo).
- **[`docs/RUNBOOK.md`](docs/RUNBOOK.md)** — qué hacer ante una alerta o incidente (recuperar el worker de correo, restore, rotación de claves).
- **[`docs/`](docs/)** — planes de features (formación, membresías de banda, multi‑área).

---

<sub>Proyecto privado del ministerio de adoración de Adoración CAF. No afiliado a Anthropic.</sub>
