# AdorAPP - Documentación Técnica Completa

## Tabla de Contenidos
1. [Información General](#información-general)
2. [Credenciales y APIs](#credenciales-y-apis)
3. [Arquitectura del Proyecto](#arquitectura-del-proyecto)
4. [Base de Datos Supabase](#base-de-datos-supabase)
5. [Sistema de Roles y Permisos](#sistema-de-roles-y-permisos)
6. [Estructura de Archivos](#estructura-de-archivos)
7. [Funcionalidades por Sección](#funcionalidades-por-sección)
8. [Deployment y CI/CD](#deployment-y-cicd)
9. [Gestión de Usuarios](#gestión-de-usuarios)
10. [Notas Importantes para Mantenimiento](#notas-importantes-para-mantenimiento)

---

## 1. Información General

### Proyecto
- **Nombre:** AdorAPP
- **Subtítulo:** "La plataforma de Adoración CAF"
- **Descripción:** Plataforma web responsiva para la gestión integral del Ministerio de Adoración de la Iglesia Centro de Avivamiento Familiar (CAF)
- **URL Producción:** https://adorapp.net.ar

### Tecnologías
- **Frontend:** React 18 + Vite + TailwindCSS
- **Estado:** Zustand
- **Backend:** Supabase (Auth + Database + Storage)
- **CI/CD:** GitHub Actions
- **Hosting:** Vercel
- **Repositorio:** https://github.com/pabloeacu/adorapp

---

## 2. Credenciales y APIs

### 2.1 Supabase

| Variable | Valor |
|----------|-------|
| **Project URL** | `https://gvsoexomzfaimagnaqzm.supabase.co` |
| **Anon Key (Público)** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NjAzOTcsImV4cCI6MjA5MTUzNjM5N30.5O0SQVIMqlzfw7rEgC9Sz_02i6p3BjXk9EfU_9x20tA` |
| **Service Role Key (Admin)** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2c29leG9temZhaW1hZ25hcXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk2MDM5NywiZXhwIjoyMDkxNTM2Mzk3fQ.CCm4Rcjl8J5Zu1BamAbQosriTjd_RsEPH24mgpnj7Pc` |

### 2.2 Google Maps (Opcional)

| Variable | Valor |
|----------|-------|
| **API Key** | `AIzaSyCO0kKndUNlmQi3B5mxy4dblg_8WYcuKuk` |

### 2.3 Vercel

- **Proyecto:** adorapp
- **Equipo:** pabloeacu
- **Dominio personalizado:** adorapp.net.ar (configurado y verificado)

---

## 3. Arquitectura del Proyecto

### 3.1 Stack Tecnológico

```
adorapp/
├── src/
│   ├── components/
│   │   ├── layout/          # Header, Sidebar, Layout
│   │   └── ui/             # Avatar, Badge, Button, Card, Input, Modal
│   ├── pages/              # Bandas, Dashboard, Login, Miembros, Ordenes, Repertorio
│   ├── stores/             # appStore.js (datos), authStore.js (autenticación)
│   ├── lib/                # supabase.js, useAuth.js
│   ├── data/               # sampleData.js
│   └── App.jsx, main.jsx
├── public/
├── vercel.json
├── vite.config.js
├── tailwind.config.js
└── package.json
```

### 3.2 Flujo de Autenticación

1. Usuario accede a `/login`
2. Credenciales se envían a `supabase.auth.signInWithPassword()`
3. Supabase valida y retorna `session` con `user`
4. Se consulta la tabla `members` para obtener `profile` (role, name, etc.)
5. El `profile` se almacena en `authStore` y persistido en `localStorage`

### 3.3 Estructura de Stores

**authStore.js:**
```javascript
{
  user: { id, email, name, ... },
  profile: { id, name, role, email, phone, instruments, active, avatar_url, user_id },
  isAuthenticated: boolean
}
```

**appStore.js:**
```javascript
{
  members: [],    // Todos los miembros
  bands: [],     // Bandas de adoración
  songs: [],     // Repertorio de canciones
  orders: [],    // Órdenes de servicio
  loading: boolean,
  error: string
}
```

---

## 4. Base de Datos Supabase

### 4.1 Tablas

#### `members`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único |
| user_id | uuid | Referencia a auth.users |
| name | text | Nombre completo |
| email | text | Email |
| phone | text | Teléfono |
| role | text | 'pastor', 'leader', 'member' |
| instruments | text[] | Array de instrumentos |
| active | boolean | Si está activo |
| avatar_url | text | URL de avatar en Supabase Storage |
| created_at | timestamp | Fecha de creación |

#### `bands`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único |
| name | text | Nombre de la banda |
| meetingType | text | Tipo de reunión |
| meetingDay | text | Día de reunión |
| meetingTime | text | Hora |
| members | jsonb | Array de IDs de miembros |
| active | boolean | Si está activa |
| created_at | timestamp | Fecha de creación |

#### `songs`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único |
| title | text | Título |
| artist | text | Artista |
| key | text | Tonalidad |
| originalKey | text | Tonalidad original |
| category | text | Categoría |
| youtubeUrl | text | URL de YouTube |
| structure | jsonb | Estructura con acordes y letras |
| lastUsed | timestamp | Última vez usada |
| created_at | timestamp | Fecha de creación |

#### `orders`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | ID único |
| bandId | uuid | ID de la banda |
| date | date | Fecha del servicio |
| time | text | Hora |
| meetingType | text | Tipo de reunión |
| songs | jsonb | Array de canciones con director y tonalidad |
| status | text | 'scheduled', 'completed', 'cancelled' |
| feedback | text | Devolución del pastor |
| created_at | timestamp | Fecha de creación |

### 4.2 Storage

**Bucket:** `avatars`
- Path: `avatars/{user_id}-{timestamp}.png`
- Políticas: Público lectura, autenticado escritura

---

## 5. Sistema de Roles y Permisos

### 5.1 Roles Definidos

| Rol | Descripción | Permisos |
|----|-------------|----------|
| **pastor** | Pastor del ministerio | Crear/eliminar miembros, bandas, canciones, órdenes. Restablecer contraseñas. Agregar devolución. |
| **leader** | Líder de alabanza | Crear/editar bandas, canciones, órdenes. Ver todo. |
| **member** | Miembro regular | Solo visualizar contenido. Sin permisos de creación. |

### 5.2 Permisos por Componente

**Miembros.jsx:**
- Pastors: Pueden ver todos los botones de acción (reset password, editar, eliminar, agregar miembro)
- Leaders: No ven botones de acción de miembros
- Members: No ven botones de acción de miembros

**Bandas.jsx:**
- `(isPastor || isLeader)` → Ve botón "Crear Banda"
- Solo `isPastor` → Ve botones "Editar" y "Eliminar"

**Repertorio.jsx:**
- `(isPastor || isLeader)` → Ve botón "Nueva Canción"
- `(isPastor || isLeader)` → Ve botones "Editar" y "Eliminar"

**Ordenes.jsx:**
- `(isPastor || isLeader)` → Ve botón "Nueva Orden"
- Solo `isPastor` → Ve botón "Eliminar"
- `(isPastor || isLeader)` → Ve botón "Repetir"
- Solo `isPastor` → Ve textarea de "Devolución"

---

## 6. Estructura de Archivos

### 6.1 Archivos Principales

| Archivo | Propósito |
|---------|-----------|
| `src/lib/supabase.js` | Configuración de cliente Supabase (anon + admin) |
| `src/stores/authStore.js` | Estado de autenticación y perfil |
| `src/stores/appStore.js` | Estado global de datos |
| `src/App.jsx` | Router principal |
| `src/pages/Login.jsx` | Página de login |

### 6.2 Clientes Supabase

```javascript
// Cliente público (para operaciones normales)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente admin (para crear usuarios, reset passwords)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
```

---

## 7. Funcionalidades por Sección

### 7.1 Login
- Autenticación con email/contraseña vía Supabase Auth
- Redirección a dashboard tras login exitoso
- Logo CAF en el header
- Texto: "Usa las credenciales que te proporcionaron tus pastors"
- Footer: "© 2026 Centro de Avivamiento Familiar"

### 7.2 Dashboard
- Vista general del ministerio
- Estadísticas de miembros activos, bandas, canciones, órdenes
- Quick actions para navegación

### 7.3 Miembros
- Lista de miembros con filtros (rol, estado, instrumentos)
- Vistas: tarjetas y grilla
- Modal de creación/edición con:
  - Nombre, email, teléfono
  - Selección de rol (Pastor/Líder/Miembro)
  - Selección múltiple de instrumentos
- **Al crear miembro:**
  - Se crea usuario en Supabase Auth (con supabaseAdmin)
  - Se muestra modal con contraseña generada
  - Contraseña se puede copiar al portapapeles
- **Opciones para Pastors:**
  - Reset contraseña (ícono llave morada)
  - Editar miembro
  - Eliminar miembro

### 7.4 Bandas
- Lista de bandas con expand/collapse
- Miembros asignados visualizados con avatares
- Modal de creación/edición:
  - Nombre, día, hora, tipo de reunión
  - Selección de miembros activos
- Estadísticas: cantidad de servicios por banda

### 7.5 Repertorio
- Lista de canciones con filtros (categoría, "sin usar")
- Vistas: tarjetas y grilla
- Modal de canción:
  - Título, artista, tonalidad original, categoría, YouTube
  - Estructura de canción (versos, coros, puentes, etc.)
  - Acordes en cifrado americano por sección
- Visor de canción con transposición en tiempo real
- Exportación a PDF con tonalidad seleccionada

### 7.6 Órdenes de Servicio
- Lista de órdenes con filtros (estado, banda)
- Modal de creación:
  - Fecha, hora, banda
  - Agregar canciones del repertorio
  - Buscador inteligente de canciones
  - Sugerencia de canciones sin usar (últimas 4 semanas)
  - Selección de director y tonalidad por canción
- Detalle de orden:
  - Ver canción con transposición
  - Exportar a PDF
- Funciones:
  - Repetir orden (clonar)
  - Devolución del pastor (solo pastors)

---

## 8. Deployment y CI/CD

### 8.1 Flujo de Deployment

1. Push a GitHub (`git push`)
2. GitHub Actions ejecuta workflow:
   - Instala dependencias (`pnpm install`)
   - Build de producción (`pnpm build`)
   - Deploy a Vercel
3. Vercel despliega automáticamente

### 8.2 Comandos

```bash
# Desarrollo local
cd /workspace/adorapp
pnpm install
pnpm dev

# Build producción
pnpm build

# Push a GitHub
git add -A && git commit -m "mensaje" && git push
```

### 8.3 Variables de Entorno (Vercel)

Configuradas en el dashboard de Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## 9. Gestión de Usuarios

### 9.1 Crear Nuevo Miembro (Flujo Completo)

1. Pastor abre Miembros → "Agregar Miembro"
2. Completa: nombre, email, teléfono, rol, instrumentos
3. Ingresa contraseña inicial
4. Al guardar:
   - `supabaseAdmin.auth.admin.createUser()` crea auth user
   - Se inserta en tabla `members`
   - Se retorna contraseña generada
5. Modal muestra contraseña para compartir

### 9.2 Restablecer Contraseña

1. Pastor hace hover sobre miembro → ícono llave
2. Modal permite ingresar nueva contraseña
3. `supabaseAdmin.auth.admin.updateUserById()` actualiza
4. Se muestra confirmación con contraseña

### 9.3 Usuarios Existentes en Supabase

| Email | Rol | Estado |
|-------|-----|--------|
| pabloeacu@gmail.com | pastor | Activo |
| anacolinab@gmail.com | member | Activo |

---

## 10. Notas Importantes para Mantenimiento

### 10.1 Importante: El Rol Viene del Perfil

**ERROR COMÚN:** Usar `user?.role` en lugar de `profile?.role`

En todos los componentes, verificar que se usa:
```javascript
const { profile } = useAuthStore();
const isPastor = profile?.role === 'pastor';
const isLeader = profile?.role === 'leader';
```

NO usar:
```javascript
const { user } = useAuthStore(); // ❌ INCORRECTO
const isPastor = user?.role === 'pastor';
```

### 10.2 Clientes Supabase

- `supabase` → Cliente normal (usado en toda la app)
- `supabaseAdmin` → Cliente admin (solo para crear/actualizar usuarios auth)

Importar desde:
```javascript
import { supabase, supabaseAdmin } from '../lib/supabase';
```

### 10.3 Storage de Avatars

El bucket `avatars` en Supabase Storage debe tener:
- **Lectura:** Pública
- **Escritura:** Autenticada (solo usuarios logueados)

### 10.4 Row Level Security (RLS)

Las tablas en Supabase tienen RLS habilitado. Verificar políticas si hay problemas de acceso.

### 10.5 Debugging

Para revisar problemas:
1. **Console del navegador:** Ver errores de red
2. **Supabase Dashboard:** Revisar logs de autenticación
3. **Vercel Dashboard:** Revisar logs de deployment

### 10.6 Actualizar Contraseña de Auth User

```javascript
const { supabaseAdmin } = await import('../lib/supabase');
const { error } = await supabaseAdmin.auth.admin.updateUserById(
  userId,
  { password: 'newPassword' }
);
```

### 10.7 Crear Auth User Manual

```javascript
const { data, error } = await supabaseAdmin.auth.admin.createUser({
  email: 'user@example.com',
  password: 'initialPassword',
  email_confirm: true,
  user_metadata: { name: 'User Name' }
});
```

---

## Contactos de Emergencia

| Servicio | URL | Notas |
|----------|-----|-------|
| Supabase Dashboard | https://supabase.com/dashboard |
| Vercel Dashboard | https://vercel.com/dashboard |
| GitHub Repository | https://github.com/pabloeacu/adorapp |
| Producción | https://adorapp.net.ar |

---

*Documento generado: Abril 2026*
*Versión: 1.0*
