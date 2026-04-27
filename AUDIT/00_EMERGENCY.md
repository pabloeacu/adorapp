# 🚨 EMERGENCIA DE SEGURIDAD — AdorAPP

**Fecha de detección:** 2026-04-27
**Detectado por:** Claude (nuevo tech lead) durante Fase 1 de onboarding
**Severidad:** **CRÍTICA — el sistema en producción está actualmente vulnerable.**

Este documento describe los hallazgos críticos, su impacto real, y el plan de remediación paso-a-paso. Está pensado para que cualquier humano con acceso al stack pueda ejecutarlo en orden.

---

## 1. Lo que pasa hoy en producción

`adorapp.net.ar` está en producción y servido desde Vercel. **Cualquier persona en internet** —sin necesidad de tener cuenta— puede hacer lo siguiente:

1. Abrir `adorapp.net.ar`
2. Abrir DevTools del navegador
3. Buscar la palabra `service_role` en el bundle JS (está literalmente ahí, hardcoded)
4. Copiar el JWT y usarlo desde `curl` para hacer cualquier operación contra la DB de Supabase, **bypasseando todas las RLS policies**.

Con esa key, un atacante puede:
- Leer toda la tabla `members` (nombres, emails, teléfonos, fechas de nacimiento, áreas pastorales)
- Leer toda la tabla `pending_registrations` incluyendo los **passwords en cleartext** de quien se haya registrado y aún no fue aprobado
- Borrar/modificar miembros, bandas, canciones, órdenes
- Crear usuarios admin nuevos vía `auth.admin.createUser`
- Borrar usuarios existentes vía `auth.admin.deleteUser`
- Cambiar contraseñas de cualquier usuario

Adicionalmente, el repo público `github.com/pabloeacu/adorapp` también contiene la key (en `src/lib/supabase.js` y en `PROJECT_DOCUMENTATION.md`), por lo que cualquier scraper de GitHub que indexe secrets ya pudo haberla recopilado.

**No tengo evidencia de que haya sido explotada todavía**, pero la ventana de exposición empezó cuando se hizo el primer `git push` con esa key (commit inicial, ~2026-04-13). Han pasado ~14 días.

---

## 2. Hallazgos detallados

### 2.1 [CRÍTICO] Service Role Key de Supabase pública

**Archivo:** `src/lib/supabase.js` (versión previa al refactor)
```js
const supabaseServiceKey = '<service_role JWT redacted>';
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { ... });
```

**Cómo se usa:** importada desde `appStore.js`, `Login.jsx` (registro), `Solicitudes.jsx` (aprobar/rechazar), `Miembros.jsx` (reset password). Por lo tanto está en el bundle JS final.

**Por qué es catastrófico:** la `service_role` key de Supabase **bypassea todas las RLS policies por diseño**. Es el equivalente a tener la contraseña de `postgres` superuser en un campo `<input value="...">` en la home.

**Impacto:** Compromiso total de la base de datos.

### 2.2 [CRÍTICO] Passwords en cleartext en `pending_registrations`

**Archivo:** `src/pages/Login.jsx:316`
```js
.insert({
  ...
  password_hash: formData.password,  // Will be hashed by trigger
  ...
})
```

El comentario dice "Will be hashed by trigger" pero **no existe ningún trigger que la hashee**. Lo confirmé revisando todas las migrations en `supabase/migrations/` y los SQL del root. La columna se llama `password_hash` pero contiene la password en cleartext.

Y luego en `src/pages/Solicitudes.jsx:132`:
```js
password: selectedRequest.password_hash,  // <-- usa el cleartext directamente
```

Lo que confirma que es plaintext: si fuera hash, no podría usarse para crear el auth user.

**Impacto:** las contraseñas de toda persona que solicitó registrarse y aún no fue aprobada o rechazada están en cleartext en la DB. Combinado con 2.1, son legibles desde internet.

### 2.3 [ALTO] RLS policies inútiles + signup abierto

**Archivos:** todas las migrations + `supabase/config.toml:133` (`enable_signup = true`).

Las policies son del tipo:
```sql
CREATE POLICY "..." ON members FOR SELECT TO authenticated USING (true);
CREATE POLICY "..." ON members FOR DELETE TO authenticated USING (true);
```

Es decir: cualquier user autenticado tiene permisos completos sobre todas las tablas. Como el signup está abierto en Supabase Auth, **cualquier persona** puede crearse una cuenta vía `supabase.auth.signUp()` y obtener inmediatamente lectura/escritura/borrado de toda la app, incluso sin la service_role key.

El `authStore.js:139-179` (`signUp` method) usa esta vía y crea automáticamente un member con `role: 'member'`. Esto bypassea el flujo de `pending_registrations` que requiere aprobación.

**Impacto:** un atacante con un email descartable puede borrar la base entera con un script de 5 líneas.

### 2.4 [ALTO] GitHub PAT embebido en `.git/config`

El remote configurado en `.git/config` tiene un Personal Access Token de GitHub embebido en la URL (`https://ghp_<REDACTED>@github.com/pabloeacu/adorapp.git`). El PAT real fue redactado de este documento por seguridad — el valor crudo está en `.git/config` localmente.

El token está **solo en disco local**, no en commits. Pero si la máquina se ve comprometida, alguien con acceso a este path tiene poder de pushear como vos.

**Impacto:** menor que 2.1 porque requiere acceso físico/RAT a la máquina, pero corregible en 30 segundos.

### 2.5 [ALTO] Sin enforcement de roles en backend

Las verificaciones `isPastor`, `isLeader` solo están en frontend (`Sidebar.jsx`, `MobileNav.jsx`, `Solicitudes.jsx:247`, etc.). RLS no chequea `role`. Por lo tanto, un user con rol `member` puede hacer requests directamente a la API REST de Supabase y borrar miembros, órdenes, canciones — el frontend solo le oculta los botones.

### 2.6 [MEDIO] Documentación con secrets

- `PROJECT_DOCUMENTATION.md` (commiteado) contiene `service_role` y `anon` keys, además de la API key de Google Maps.
- `TECHNICAL_DOCUMENTATION.md` (untracked) idem.

### 2.7 [MEDIO] localStorage filtra datos post-logout

`src/stores/appStore.js:788-805` (`reset()`):
```js
console.log('✅ App store reset on logout (localStorage preserved)');
```

El comentario es honesto pero la decisión es incorrecta: después de logout, `localStorage.appMembers/appBands/appSongs/appOrders` siguen accesibles desde DevTools. Si se usa la app en una compu compartida (un cibercafé, una compu prestada), todos esos datos quedan visibles.

### 2.8 [MEDIO] Auto-sync agresivo

`App.jsx:23-44` y `appStore.js:setAutoRefresh`: SELECT * de `members` + `bands` + `songs` + `orders` cada vez que cambia la ruta + cada 30 segundos + cada 5 minutos en PWA. Sin paginación, sin filtros, sin diff. Esto va a saturar la cuota free de Supabase rápido (egress y compute).

### 2.9 [BAJO/MEDIO] Otros hallazgos a confirmar

- `enable_confirmations = false` en `auth.email` → cualquiera con un email puede registrarse sin confirmarlo.
- `minimum_password_length = 6` → débil para producción.
- Sin captcha en el formulario de registro.
- Sin rate limiting visible más allá del default de Supabase.
- 2 paths paralelos de signup (Login modal vía `pending_registrations` vs `authStore.signUp` directo) → confusión y bypass.
- `daily_reflections_inserts.sql` tiene 365 INSERTs en SQL plano commiteado al repo (~93KB, no sensible pero no escala).
- Código de debug con `console.log` masivos en producción (`MobileNav.jsx`, `Comunicaciones.jsx`, `Header.jsx` modificado).

---

## 3. Plan de remediación

Ordenado por dependencia. **Pasos 1-3 son cosas que solo el dueño humano puede hacer.** Después yo puedo ejecutar el resto del refactor de código.

### Paso 1 — [HUMANO] Rotar la `service_role` key de Supabase

1. Ir a https://supabase.com/dashboard/project/gvsoexomzfaimagnaqzm/settings/api
2. Sección "Project API keys" → al lado de `service_role` → click en **Reset / Roll**
3. Copiar la nueva key. **No la pegues en chat ni en archivos del repo.**
4. Guardarla solo en:
   - **Vercel** → Settings → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY` (Production + Preview, no Development a menos que sea estrictamente necesario)
   - Local: en `.env.local` (que ya está en `.gitignore`)
5. La `anon` key también podemos rotarla por precaución, pero es menos urgente porque es legítimamente pública.

> **Después de hacer este paso, la app de producción VA A ROMPERSE** porque el JS hardcoded sigue intentando usar la key vieja. Eso está bien — es señal de que la rotación funcionó. La app vuelve a funcionar después del Paso 4.

### Paso 2 — [HUMANO] Cerrar el signup público de Supabase

Ir a https://supabase.com/dashboard/project/gvsoexomzfaimagnaqzm/auth/providers → Email → desactivar **"Allow new users to sign up"**.

Esto bloquea el ataque del 2.3. El registro legítimo sigue funcionando vía `pending_registrations` + aprobación manual del pastor (que internamente usa `auth.admin.createUser`, que no requiere signup público).

### Paso 3 — [HUMANO] Rotar GitHub PAT

1. https://github.com/settings/tokens → revocar `ghp_Cuv3R...IPg5`
2. Crear uno nuevo con scope `repo` solamente, expiración 90 días
3. En la máquina local: `git remote set-url origin https://github.com/pabloeacu/adorapp.git` y reconfigurar el credential helper de macOS para que guarde el nuevo PAT en Keychain en vez de en `.git/config`.

### Paso 4 — [CLAUDE] Refactor del código para sacar `service_role` del cliente

Esto es trabajo grande. La forma correcta:

**Opción A (recomendada):** Crear API routes serverless en Vercel (`/api/admin/*`) que sean las únicas que tocan la `service_role`. El cliente llama a esos endpoints autenticado con su JWT de Supabase, y el endpoint:
1. Verifica el JWT
2. Verifica que el caller tenga `role = 'pastor'` consultando `members`
3. Recién entonces hace la operación admin

**Opción B (más liviana, igual de segura):** Edge Functions de Supabase con la misma lógica de verificación. Más cerca de la DB y no requiere tocar el deploy de Vercel.

**Mi recomendación:** Opción A. Vercel ya está configurado, agregar una `api/` folder es trivial, y Edge Functions de Supabase son una superficie nueva que mantener.

Endpoints necesarios:
- `POST /api/admin/members/create` — reemplaza `addMember` con `supabaseAdmin.auth.admin.createUser`
- `POST /api/admin/members/delete` — reemplaza `deleteMember(permanent=true)`
- `POST /api/admin/members/reset-password` — reemplaza el flujo de reset de `Miembros.jsx`
- `POST /api/admin/registrations/approve` — reemplaza el flujo de `Solicitudes.jsx`
- `POST /api/admin/registrations/reject`
- `GET  /api/admin/registrations` — listar pendientes (porque usaba `supabaseAdmin` para evitar RLS, pero con RLS bien hecha se podría usar el cliente normal)

Los emails y `anon` key seguirán siendo lo único expuesto en cliente, vía env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

### Paso 5 — [CLAUDE] RLS policies reales y enforcement de roles en DB

Reescribir las policies para que el rol importe:

```sql
-- Helper function: obtener role del user actual desde members
CREATE OR REPLACE FUNCTION auth_role() RETURNS text AS $$
  SELECT role FROM members WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Ejemplo para members:
CREATE POLICY members_read   ON members FOR SELECT TO authenticated USING (true);
CREATE POLICY members_modify ON members FOR ALL    TO authenticated
  USING (auth_role() = 'pastor') WITH CHECK (auth_role() = 'pastor');
```

Y similares para `bands`, `songs`, `orders` (donde leaders pueden modificar pero solo pastors borran), etc. Detalle exacto va en `04_security.md` cuando hagamos la auditoría completa.

### Paso 6 — [CLAUDE] Hashear las passwords pendientes y eliminar el campo cleartext

- Migration que renombra `password_hash` → quitarla porque el flujo correcto es: el solicitante hace `supabase.auth.signUp` (con signup deshabilitado para anon, esto requiere un endpoint público específico para registro), Supabase hashea, y `pending_registrations` solo guarda los datos del miembro y un puntero al `auth.users.id` ya creado pero deshabilitado.
- Variante más simple: mantener `pending_registrations` como hoy pero **sin password**. Cuando el pastor aprueba, le mostramos al pastor que tiene que generar una contraseña inicial y comunicársela al usuario por canal seguro (lo cual ya hace `Miembros.jsx` para creación directa).

### Paso 7 — [CLAUDE] Limpieza y endurecimiento adicional

- Borrar/limpiar `PROJECT_DOCUMENTATION.md`, `TECHNICAL_DOCUMENTATION.md` (sacar keys, dejar referencias a env vars)
- Borrar todos los archivos de "fix RLS" del root (`DEFINITIVE_FIX_RLS.sql`, `ULTIMATE_FIX.sql`, `SUPER_RESET_RLS.sql`, etc.) que ya no aplican
- Borrar scripts del agente anterior (`audit_db.cjs`, `connect_db.cjs`, etc.)
- Limpiar `console.log` de debug
- Ajustar headers HTTP en `vercel.json` (CSP, HSTS, Referrer-Policy, Permissions-Policy)
- Reducir el auto-sync de 30s a algo razonable (Realtime de Supabase, o solo en focus de ventana, o pull explícito)
- Limpiar `localStorage` en logout
- `minimum_password_length` a 8+, considerar `password_requirements = "lower_upper_letters_digits"`

### Paso 8 — [HUMANO] Purgar history de GitHub (opcional pero recomendado)

Como las keys vivieron en commits anteriores, la forma "completa" sería:
1. `git filter-repo` o BFG para reescribir history y borrar las strings de la service_role + Google Maps key
2. Force-push a `main`
3. Comunicar a otros colaboradores (si los hay)

Pero como ya rotaste las keys (Paso 1), las que están en history son **inválidas** y no representan riesgo real. El único motivo para purgarlas sería estética / cumplimiento. **Mi recomendación: NO hacer la purga de history.** No vale la pena el riesgo de force-push y resetear todo el repo. Solo asegurarse que **a partir de hoy** no entran más secrets.

---

## 4. Plan de ejecución sugerido (cronograma)

| Bloque | Quién | Tiempo | Acción |
|--------|-------|--------|--------|
| **Hoy / próximos 30 min** | Humano | 5 min | Paso 1 (rotar service_role) |
| Hoy | Humano | 2 min | Paso 2 (cerrar signup) |
| Hoy | Humano | 5 min | Paso 3 (rotar PAT) |
| Hoy | Claude | 2-4 hs | Paso 4 (API routes + refactor de cliente) |
| Mañana | Claude | 1-2 hs | Paso 5 (RLS reales) — requiere coordinación con humano para aplicar las migrations en prod |
| Mañana | Claude | 30 min | Paso 6 (eliminar cleartext passwords) |
| Esta semana | Claude | 2 hs | Paso 7 (limpieza general) |

Mientras los Pasos 4-6 están en curso, la app de producción va a estar en uno de estos estados:
- **Antes del Paso 1:** funcional pero vulnerable.
- **Después del Paso 1, antes del Paso 4:** rota (intencional). Esto es el "downtime planificado". Si querés evitar downtime, podemos hacer un deploy hotfix que use la nueva service_role key todavía en cliente (sigue siendo vulnerable a la nueva key, pero ya no a la vieja); luego refactor; luego rotar de nuevo. Más laborioso, evita downtime de horas.
- **Después del Paso 4:** funcional y segura en lo grueso.

---

## 5. Decisión que necesito de tu lado AHORA

Ya tenés el panorama. Dame uno de estos caminos:

- **A) "Dale, hacé Pasos 1-3 vos en el dashboard ahora, y después seguís Claude con 4 en adelante."** ← Esta es la opción más limpia. Tiene downtime de prod de ~2-4 hs mientras Claude refactoriza, pero es honesto: la app está rota porque era insegura, no porque rompimos algo.
- **B) "Pasos 1-3 ahora, pero quiero evitar downtime."** ← Hacemos un hotfix intermedio que rotemos la key dos veces. Más trabajo, sin downtime.
- **C) "Pará, no quiero rotar todavía. Primero terminá Fase 1 y mostrame el reporte completo, y después decidimos."** ← Significa dejar la app vulnerable algunas horas más. Aceptable si no creés que el riesgo se materialice en ese tiempo, pero es tu llamada.
- **D) "Otra cosa: explicame X / dame opciones de Y."**

Mi recomendación firme: **A**. Es la única que cierra la ventana de exposición rápido. Los usuarios reales son ~8 personas (los del seed: Paul, Ana, Olga, etc.) — el costo de "AdorAPP cae 3 horas un domingo a la tarde" es bajísimo comparado con el riesgo de que un scraper de GitHub te haya copiado la key y mañana borre todo.

Mientras esperás para responder, sigo armando el resto del AUDIT (project map, doc notes, etc.) sin tocar prod.
