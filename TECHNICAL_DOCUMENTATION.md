# AdorAPP - Documentación Técnica Completa

**Versión:** 1.0.0
**Fecha:** Abril 2026
**Autor:** MiniMax Agent (para Centro de Avivamiento Familiar)

---

## 1. Visión General del Proyecto

### 1.1 Descripción

AdorAPP es una plataforma web Progressive Web App (PWA) diseñada para gestionar las operaciones musicales y administrativas del Centro de Avivamiento Familiar (CAF). La aplicación permite coordinar equipos de adoración, gestionar repertorio de canciones, crear órdenes de servicio y facilitar la comunicación entre miembros del equipo.

### 1.2 Objetivos Principales

- **Gestión de Órdenes de Servicio**: Planificar y organizar servicios de adoración con selección de canciones, asignación de directores y tonos musicales.
- **Repertorio de Canciones**: Mantener una base de datos completa de canciones con acordes, letras, categorías y metadatos musicales.
- **Gestión de Equipos (Bandas)**: Organizar grupos de adoración por tipo de reunión con horarios y miembros asignados.
- **Administración de Miembros**: Registrar participantes del equipo de adoración con roles, instrumentos y datos de contacto.
- **Sistema de Notificaciones**: Mantener informados a los usuarios sobre nuevas canciones, bandas, miembros y reflexiones diarias.
- **Comunicación**: Facilitar el envío de mensajes y notificaciones entre usuarios.

### 1.3 Público Objetivo

- Pastores y líderes de alabanza (acceso completo)
- Miembros del equipo de adoración (acceso limitado)
- Administradores del sistema

---

## 2. Stack Tecnológico

### 2.1 Frontend

| Tecnología | Versión | Propósito |
|------------|---------|----------|
| **React** | 18.x | Framework principal de UI |
| **React Router DOM** | v6 | Navegación entre páginas |
| **Zustand** | latest | Gestión de estado global |
| **Tailwind CSS** | latest | Estilos CSS (configuración personalizada) |
| **Lucide React** | latest | Biblioteca de iconos SVG |
| **jsPDF** | latest | Generación de documentos PDF |
| **Vite** | latest | Herramienta de build y desarrollo |
| **pnpm** | latest | Gestor de paquetes (preferido sobre npm) |

### 2.2 Backend

| Tecnología | Servicio | Propósito |
|------------|----------|----------|
| **Supabase** | PostgreSQL | Base de datos relacional |
| **Supabase Auth** | Integrado | Sistema de autenticación |
| **Supabase Storage** | Integrado | Almacenamiento de archivos (avatares) |
| **Row Level Security (RLS)** | Integrado | Seguridad a nivel de fila |

### 2.3 Configuración de Supabase

- Project ref: `gvsoexomzfaimagnaqzm`
- Project URL: `https://gvsoexomzfaimagnaqzm.supabase.co`
- Anon key (cliente): leída desde `VITE_SUPABASE_ANON_KEY`. Está en `.env.local` para dev y en Vercel env vars para prod. Es pública por diseño (la seguridad real viene de RLS).
- Service role key: **nunca en el cliente.** Vive solo en los secrets de las Edge Functions de Supabase, donde se inyecta como `SUPABASE_SERVICE_ROLE_KEY` automáticamente.

> Las Edge Functions `admin-create-member`, `admin-delete-member`, `admin-reset-password`, `admin-approve-registration`, `admin-reject-registration` son las únicas que usan service_role; verifican que el caller sea pastor antes de operar.

### 2.4 Estructura de Archivos del Proyecto

```
adorapp/
├── public/
│   ├── logo.png                    # Logo de la aplicación
│   └── manifest.json               # Manifesto PWA
├── src/
│   ├── App.jsx                     # Componente raíz con rutas
│   ├── main.jsx                    # Punto de entrada
│   ├── index.css                   # Estilos globales
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.jsx          # Header con notificaciones y perfil
│   │   │   ├── Sidebar.jsx         # Barra lateral (escritorio)
│   │   │   ├── MobileNav.jsx       # Navegación móvil
│   │   │   └── Layout.jsx           # Layout principal
│   │   └── ui/
│   │       ├── Avatar.jsx          # Componente de avatar
│   │       ├── Badge.jsx           # Etiquetas decorativas
│   │       ├── Button.jsx          # Botones personalizados
│   │       ├── Card.jsx            # Tarjetas de contenido
│   │       ├── ConfirmModal.jsx    # Modales de confirmación
│   │       ├── Input.jsx           # Campos de entrada
│   │       └── Modal.jsx           # Modal genérico
│   ├── pages/
│   │   ├── Dashboard.jsx           # Panel principal
│   │   ├── Ordenes.jsx             # Gestión de órdenes
│   │   ├── Repertorio.jsx           # Gestión de canciones
│   │   ├── Bandas.jsx              # Gestión de bandas
│   │   ├── Miembros.jsx            # Gestión de miembros
│   │   ├── Solicitudes.jsx          # Solicitudes de registro
│   │   ├── Comunicaciones.jsx      # Sistema de mensajería
│   │   └── Login.jsx               # Página de inicio de sesión
│   ├── stores/
│   │   ├── authStore.js            # Estado de autenticación (Zustand)
│   │   └── appStore.js             # Estado de la aplicación (Zustand)
│   └── lib/
│       └── supabase.js            # Cliente de Supabase
├── supabase/
│   ├── migrations/                # Scripts SQL de migraciones
│   │   ├── 20260427_create_daily_reflections_and_notifications.sql
│   │   └── 20260427_create_daily_notification_function.sql
│   └── schema.sql                # Esquema principal de base de datos
├── daily_reflections_inserts.sql # 365 reflexiones diarias
├── send_today_notification.sql   # SQL para disparar primera notificación
└── package.json
```

---

## 3. Arquitectura de Base de Datos

### 3.1 Diagrama de Entidades

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   members    │       │    bands     │       │    songs     │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (PK)      │◄──────│ members[]    │       │ id (PK)      │
│ name         │       │ id (PK)      │       │ title        │
│ email        │       │ name         │       │ artist       │
│ phone        │       │ meeting_type │       │ original_key │
│ role         │       │ meeting_day  │       │ key          │
│ pastor_area  │       │ meeting_time │       │ categories   │
│ leader_of    │       │ active       │       │ structure    │
│ birthdate    │       └──────────────┘       │ compass      │
│ instruments  │                               │ bpm          │
│ avatar_url   │       ┌──────────────┐       │ last_used    │
│ user_id (FK) │──────►│    orders    │       └──────────────┘
│ active       │       ├──────────────┤
└──────────────┘       │ id (PK)      │
       │               │ date        │
       │               │ time        │
       ▼               │ band_id (FK)│
┌──────────────┐       │ meeting_type│
│ auth.users   │       │ songs[]      │
├──────────────┤       │ feedback     │
│ id (PK)      │       │ status       │
│ email        │       └──────────────┘
│ created_at   │
└──────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│ daily_reflections    │  │    notifications    │
├──────────────────────┤  ├──────────────────────┤
│ id (PK)              │  │ id (PK)              │
│ day_of_year          │  │ user_id (FK)         │
│ date                 │  │ title                │
│ quote                │  │ message              │
│ author               │  │ type                │
│ created_at           │  │ is_global           │
└──────────────────────┘  │ is_read             │
                          │ created_at           │
                          │ expires_at           │
                          └──────────────────────┘
```

### 3.2 Tablas de la Base de Datos

#### 3.2.1 members (Miembros)

```sql
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  role TEXT DEFAULT 'member' CHECK (role IN ('pastor', 'leader', 'member')),
  editor BOOLEAN DEFAULT false,                          -- Permiso para editar canciones
  pastor_area TEXT,                                      -- Área pastoral asignada
  leader_of TEXT,                                        -- Grupo/área que lidera
  birthdate DATE,
  instruments TEXT[] DEFAULT '{}',                       -- Array: ['Voz', 'Guitarra Eléctrica']
  avatar_url TEXT,
  active BOOLEAN DEFAULT true,
  user_id UUID REFERENCES auth.users(id),               -- Vinculación a cuenta de auth
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Roles:**
- `pastor`: Acceso total (crear, editar, eliminar órdenes, miembros, bandas)
- `leader`: Puede gestionar órdenes y repertorio
- `member`: Acceso de solo lectura

**Instrumentos Disponibles:**
```javascript
['Voz', 'Guitarra Eléctrica', 'Guitarra Acústica', 'Piano', 'Teclado',
 'Batería', 'Bajo', 'Violín', 'Flauta', 'Saxofón', 'Trombta', 'Coros']
```

#### 3.2.2 bands (Bandas)

```sql
CREATE TABLE bands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  meeting_type TEXT DEFAULT 'culto_general',
  meeting_day TEXT,                   -- 'domingo', 'sabado', 'miercoles', etc.
  meeting_time TEXT DEFAULT '20:00',
  members UUID[] DEFAULT '{}',        -- Array de IDs de miembros
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Tipos de Reunión:**
```javascript
[
  { id: 'culto_general', label: 'Culto General', icon: 'Church' },
  { id: 'jovenes', label: 'Reunión de Jóvenes', icon: 'Users' },
  { id: 'mujeres', label: 'Reunión de Mujeres', icon: 'Heart' },
  { id: 'hombres', label: 'Reunión de Hombres', icon: 'Shield' },
  { id: 'ninos', label: 'Escuela Dominical', icon: 'BookOpen' },
  { id: 'evento', label: 'Evento Especial', icon: 'Star' }
]
```

#### 3.2.3 songs (Canciones)

```sql
CREATE TABLE songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT,
  original_key TEXT DEFAULT 'C',    -- Tono original de la canción
  key TEXT DEFAULT 'C',             -- Tono actual (puede diferir por orden)
  category TEXT DEFAULT 'adoracion', -- Categoría única (legacy)
  categories TEXT[] DEFAULT ARRAY['adoracion'], -- Categorías múltiples
  youtube_url TEXT,
  structure JSONB DEFAULT '[]',     -- Array de secciones con acordes y letra
  compass TEXT,                      -- Compás (ej: '4/4', '3/4')
  bpm INTEGER,                      -- Beats per minute
  last_used DATE,                   -- Última vez usada en una orden
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Estructura de una canción (JSONB):**
```javascript
[
  {
    "type": "intro",              // intro, verse, pre-chorus, chorus, bridge, interlude, coda, ending
    "label": "Intro",
    "content": "",               // Letra (opcional)
    "chords": "Am G F C"          // Acordes (opcional)
  },
  {
    "type": "verse",
    "label": "Verso 1",
    "content": "Tú llamas más fuerte que el silencio que hay en mí",
    "chords": "D D/F# G A"
  }
]
```

**Categorías de Canciones:**
```javascript
[
  { id: 'adoracion', label: 'Adoración', icon: 'Heart' },
  { id: 'intimidad', label: 'Intimidad', icon: 'Sparkles' },
  { id: 'guerra', label: 'Guerra Espiritual', icon: 'Sword' },
  { id: 'rapida', label: 'Rápida', icon: 'Zap' },
  { id: 'lenta', label: 'Lenta', icon: 'Moon' },
  { id: 'alabanza', label: 'Alabanza', icon: 'Music2' },
  { id: 'humillacion', label: 'Humillación', icon: 'Cross' },
  { id: 'pascua', label: 'Pascua', icon: 'Egg' },
  { id: 'santa_cena', label: 'Santa Cena', icon: 'Wine' },
  { id: 'testimonial', label: 'Testimonial', icon: 'Mic' },
  { id: 'ofrenda', label: 'Ofrenda', icon: 'Gift' },
  { id: 'coritos', label: 'Coritos', icon: 'Baby' },
  { id: 'festivas', label: 'Festivas', icon: 'PartyPopper' }
]
```

**Tonos Musicales (Transposición):**
```javascript
// Tonos mayores
['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
// Tonos menores
['Am', 'A#m', 'Bm', 'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m']
```

#### 3.2.4 orders (Órdenes de Servicio)

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  time TEXT DEFAULT '20:00',
  band_id UUID REFERENCES bands(id),
  meeting_type TEXT DEFAULT 'culto_general',
  songs JSONB DEFAULT '[]',        -- Array de canciones con director y tono
  feedback TEXT,                  -- Devolución del pastor
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Estructura de canciones en orden (JSONB):**
```javascript
[
  {
    "songId": "uuid-de-la-cancion",
    "directorId": "uuid-del-director", // Puede ser null
    "key": "G"                          // Tono para esta orden
  }
]
```

**Estados de Orden:**
- `scheduled`: Programada (futura)
- `completed`: Completada (ya pasó)
- `cancelled`: Cancelada

#### 3.2.5 daily_reflections (Reflexiones Diarias)

```sql
CREATE TABLE daily_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_year INTEGER NOT NULL CHECK (day_of_year >= 1 AND day_of_year <= 366),
  date DATE NOT NULL UNIQUE,
  quote TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

Esta tabla contiene 365 reflexiones protestantes que se muestran diariamente. El sistema itera en ciclo (después del día 366 vuelve al día 1).

#### 3.2.6 notifications (Notificaciones)

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'reflection', 'alert', 'reminder')),
  is_read BOOLEAN DEFAULT false,
  is_global BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);
```

**Tipos:**
- `info`: Información general
- `reflection`: Reflexión del día
- `alert`: Alerta
- `reminder`: Recordatorio

**Notificaciones Globales vs Personales:**
- `is_global = true`: Se muestra a todos los usuarios (ej: reflexión diaria)
- `is_global = false` + `user_id = UUID`: Solo para un usuario específico

---

## 4. API de Supabase

### 4.1 Autenticación

**Iniciar sesión:**
```javascript
supabase.auth.signInWithPassword({ email, password })
```

**Cerrar sesión:**
```javascript
supabase.auth.signOut()
```

**Obtener sesión actual:**
```javascript
supabase.auth.getSession()
```

### 4.2 Operaciones CRUD

Todas las tablas soportan operaciones CRUD estándar de Supabase:

```javascript
// SELECT
supabase.from('table').select('*')
supabase.from('table').select('*').eq('column', value)
supabase.from('table').select('*').order('column', { ascending: false })

// INSERT
supabase.from('table').insert(data)
supabase.from('table').insert(data).select().single()

// UPDATE
supabase.from('table').update(data).eq('id', id)

// DELETE
supabase.from('table').delete().eq('id', id)
```

### 4.3 Row Level Security (RLS)

Todas las tablas tienen RLS habilitado con políticas que permiten operaciones completas para usuarios autenticados:

```sql
-- Ejemplo para tabla members
CREATE POLICY "Enable read access for authenticated users" ON members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON members FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for authenticated users" ON members FOR DELETE TO authenticated USING (true);
```

---

## 5. Guía de Funcionalidades

### 5.1 Autenticación

**Página de Login (`/login`):**
- Ingreso con email y contraseña
- Enlace "Olvidé mi contraseña"
- Opción de registro para nuevos usuarios (requiere aprobación de pastor)

**Flujo de autenticación:**
1. Usuario ingresa credenciales
2. Supabase valida against `auth.users`
3. Si es válido, se busca el usuario en tabla `members` por `user_id`
4. Se carga el perfil y se otorgan permisos basados en `role`

### 5.2 Dashboard (`/`)

**Componentes:**
- Estadísticas generales (órdenes, canciones, miembros)
- Próximas órdenes programadas
- Acceso rápido a funciones principales

### 5.3 Órdenes de Servicio (`/ordenes`)

**Funcionalidades:**

1. **Crear Orden:**
   - Seleccionar fecha y hora
   - Elegir banda
   - Agregar canciones del repertorio
   - Asignar director a cada canción
   - Sistema de historial de tonos: al seleccionar director, busca el último tono usado

2. **Ver Orden:**
   - Muestra todas las canciones con directores y tonos
   - Permite exportar a PDF (resumen sin acordes)
   - Permite imprimir canciones con acordes (una por página)

3. **Duplicar Orden:**
   - Copia una orden existente a una nueva fecha
   - Preserva canciones, directores y bandas

4. **Devolución del Pastor:**
   - Pastores pueden agregar comentarios
   - Visible solo para usuarios con rol `pastor`

**Generación de PDF:**

*Resumen (Exportar):*
- Fecha, hora, banda
- Tabla: # | Canción | Artista | Tono | Director
- Devolución del pastor (si existe)

*Canciones (Imprimir):*
- Una canción por página
- Acordes transpuestos al tono seleccionado
- Letra completa

### 5.4 Repertorio (`/repertorio`)

**Funcionalidades:**

1. **Crear/Editar Canción:**
   - Título y artista
   - Tono original
   - Categorías múltiples
   - URL de YouTube
   - Compás (ej: 4/4)
   - BPM
   - Estructura: secciones con acordes y letra

2. **Estructura de Canción:**
   - Agregar secciones (Intro, Verso, Coro, Puente, etc.)
   - Cada sección tiene: tipo, label, acordes, letra
   - Reordenar secciones arrastrando (drag & drop futuro)

3. **Visualización:**
   - Vista de tarjetas (cards)
   - Vista de tabla (table)
   - Transposición en tiempo real

4. **Búsqueda y Filtros:**
   - Buscar por título, artista, acorde, letra
   - Filtrar por múltiples categorías
   - Filtrar canciones sin usar (últimas 4 semanas)

5. **Exportar a PDF:**
   - Seleccionar tonalidad de exportación
   - Incluye acordes transpuestos
   - Formato optimizado para impresión

### 5.5 Bandas (`/bandas`)

**Funcionalidades:**

1. **Gestión de Bandas:**
   - Crear, editar, eliminar bandas
   - Nombre, tipo de reunión, día y hora
   - Asignar miembros a la banda

2. **Miembros de Banda:**
   - Seleccionar de la lista de miembros activos
   - Ver qué bandas tiene asignadas en perfil

### 5.6 Miembros (`/miembros`)

**Funcionalidades:**

1. **Lista de Miembros:**
   - Ver todos los miembros
   - Filtrar por rol, instrumentos, área
   - Estado activo/inactivo

2. **Gestión de Miembro:**
   - Datos personales: nombre, email, teléfono
   - Datos ministeriales: rol, pastor de área, líder de
   - Fecha de nacimiento
   - Instrumentos que toca
   - Foto de perfil
   - Editor (permiso especial para editar canciones)

3. **Edición de Contraseña:**
   - Solo el propio usuario puede cambiar su contraseña
   - Requiere contraseña actual (no en Supabase, vía auth.updateUser)

### 5.7 Solicitudes (`/solicitudes`)

**Flujo de Registro:**

1. **Solicitante:**
   - Completa formulario de registro
   - Datos personales, instrumentos, etc.
   - Se crea registro en `pending_registrations`

2. **Pastor/Líder:**
   - Ve solicitudes pendientes
   - Aprueba o rechaza
   - Al aprobar: crea cuenta auth + registro en `members`

### 5.8 Comunicaciones (`/comunicaciones`)

**Sistema de Mensajería:**

1. **Enviar Mensaje:**
   - Seleccionar destinatario(s)
   - Asunto y mensaje
   - Se guarda en `communication_notifications`

2. **Recibir Notificaciones:**
   - Aparece en campanita cuando hay nuevos mensajes
   - Muestra remitente, asunto, preview

---

## 6. Sistema de Notificaciones

### 6.1 Tipos de Notificaciones

| Tipo | Descripción | Origen |
|------|-------------|--------|
| **Devocional** | Versículo bíblico diario | Código (74 versículos en Salmos y Cantar) |
| **Nueva canción** | Cuando se agrega canción al repertorio | Base de datos |
| **Nueva banda** | Cuando se crea una banda | Base de datos |
| **Nuevo miembro** | Cuando se registra un miembro | Base de datos |
| **Solicitud pendiente** | Cuando hay solicitud de registro | Base de datos |
| **Comunicación** | Mensaje de otro usuario | Base de datos |
| **Reflexión del Día** | Reflexión protestantediurna | Base de datos (`daily_reflections`) |

### 6.2 Notificaciones de Base de Datos

Las notificaciones se cargan cada 2 minutos desde Supabase:

```javascript
// Cargar notificaciones personales
supabase.from('notifications')
  .select('*')
  .eq('user_id', userId)
  .eq('is_read', false)

// Cargar notificaciones globales
supabase.from('notifications')
  .select('*')
  .eq('is_global', true)
  .order('created_at', { ascending: false })
  .limit(5)
```

### 6.3 Reflexiones Diarias

**Tabla `daily_reflections`:**
- Contiene 365 reflexiones protestantes
- Se accede por fecha (`date`) o día del año (`day_of_year`)
- Después de día 366, vuelve al día 1 (comportamiento cíclico)

**SQL para insertar primera notificación:**
```sql
INSERT INTO notifications (title, message, type, is_global, created_at)
SELECT
    'Reflexión del Día',
    dr.quote || ' — ' || dr.author,
    'reflection',
    true,
    NOW()
FROM daily_reflections dr
WHERE dr.date = CURRENT_DATE;
```

**Función automática (para pg_cron):**
```sql
CREATE OR REPLACE FUNCTION send_daily_reflection_notification()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
-- Obtiene reflexión del día, elimina antiguas globales,
-- inserta nueva notificación
$$;
```

---

## 7. Almacenamiento Local (localStorage)

La aplicación usa localStorage para persistencia offline:

| Clave | Contenido | Uso |
|-------|-----------|-----|
| `appMembers` | Lista de miembros en JSON | Cache para modo offline |
| `appBands` | Lista de bandas en JSON | Cache para modo offline |
| `appSongs` | Lista de canciones en JSON | Cache para modo offline |
| `appOrders` | Lista de órdenes en JSON | Cache para modo offline |
| `userPhoto` | Foto de perfil en data URL | Persistencia de avatar |
| `user_profile` | Perfil del usuario | Cache de sesión |
| `readNotificationIds_{userId}` | IDs de notificaciones leídas | Marcar como leídas |
| `lastDevocionalDate` | Fecha último devocional visto | No repetir en día |

---

## 8. Estado de la Aplicación (Zustand)

### 8.1 authStore

```javascript
{
  user: null,                    // Usuario de Supabase Auth
  profile: null,                 // Perfil de tabla members
  loading: true,                  // Estado de carga
  error: null,                   // Mensaje de error
  isRefreshing: false,          // Flag anti-bucle infinito

  // Métodos
  initialize(),                  // Inicializar auth
  refreshProfile(),             // Forzar actualización de perfil
  fetchProfile(userId),         // Cargar desde members
  login(email, password),       // Iniciar sesión
  signUp(email, password, name),// Registrarse
  logout(),                     // Cerrar sesión
  resetPassword(email),        // Recuperar contraseña
}
```

### 8.2 appStore

```javascript
{
  members: [],                  // Lista de miembros
  bands: [],                    // Lista de bandas
  songs: [],                    // Lista de canciones
  orders: [],                   // Lista de órdenes
  loading: false,
  error: null,
  autoRefreshInterval: null,    // Para PWA
  autoRefreshMinutes: 5,

  // CRUD Miembros
  addMember(member),
  updateMember(id, updates),
  deleteMember(id, permanent),
  toggleMemberActive(id),

  // CRUD Bandas
  addBand(band),
  updateBand(id, updates),
  deleteBand(id),

  // CRUD Canciones
  addSong(song),
  updateSong(id, updates),
  deleteSong(id),

  // CRUD Órdenes
  addOrder(order),
  updateOrder(id, updates),
  deleteOrder(id),
  cloneOrder(id),

  // Helpers
  getMemberById(id),
  getBandById(id),
  getSongById(id),
  getBandMembers(bandId),
  getSongWithKey(songId, key),
  getUnusedSongs(weeks),
  getUnusedByBand(bandId, weeks),
  transposeSongStructure(structure, fromKey, toKey),

  // Sincronización
  initialize(),                 // Cargar todo de Supabase
  setAutoRefresh(minutes),     // Activar auto-refresh PWA
  clearAutoRefresh(),         // Desactivar
  reset(),                     // Limpiar todo
}
```

---

## 9. Auto-Sincronización

La aplicación tiene mecanismos de sincronización para mantener datos actualizados:

### 9.1 Sincronización por Ruta

```javascript
useEffect(() => {
  // Se ejecuta en cada cambio de ruta
  const syncData = async () => {
    if (user) {
      await initializeApp();      // Recarga miembros, bandas, canciones, órdenes
      await refreshProfile();     // Recarga perfil
    }
  };
  syncData();
}, [location.pathname, user]);
```

### 9.2 Auto-Refresh Periódico

```javascript
useEffect(() => {
  const interval = setInterval(async () => {
    await initializeApp();
    await refreshProfile();
  }, 30000); // Cada 30 segundos
}, [user, initializeApp]);
```

### 9.3 PWA Auto-Refresh

```javascript
// En App.jsx
setAutoRefresh(5); // Cada 5 minutos cuando app está en segundo plano
```

---

## 10. Transposición de Acordes

### 10.1 Algoritmo

La transposición funciona mediante pasos de semitonos:

```javascript
const semitoneSteps = {
  'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7,
  'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
  'Am': 0, 'A#m': 1, 'Bm': 2, 'Cm': 3, 'C#m': 4, 'Dm': 5,
  'D#m': 6, 'Em': 7, 'Fm': 8, 'F#m': 9, 'Gm': 10, 'G#m': 11
};

// Transponer de C a G:
// Semitonos de C = 0, Semitonos de G = 7
// Diferencia = 7
// Cada acorde suma 7 semitonos (módulo 12)
```

### 10.2 Manejo de Acordes

El algoritmo maneja:
- Notas naturales y accidentales (#, b)
- Acordes con sufijos (maj7, add9, etc.)
- Acordes con bajo (slash chords, ej: C/E)
- Conversión automática de bemoles a sostenidos

---

## 11. Despliegue

### 11.1 Build

```bash
cd adorapp
pnpm install --force
pnpm build
```

### 11.2 Estructura de Build

El build genera archivos estáticos en `/dist`:
- `index.html`
- CSS compilado
- JavaScript bundle
- Assets estáticos

### 11.3 Despliegue Web

La aplicación se despliega usando la herramienta `deploy`:
- URL de producción: varies
- Es una PWA instalable en dispositivos

### 11.4 Variables de Entorno

No hay archivos `.env` - las credenciales de Supabase están hardcodeadas en `/src/lib/supabase.js` para simplificar el despliegue.

---

## 12. Mantenimiento

### 12.1 Agregar Nuevas Tablas

1. Crear tabla en Supabase Dashboard > SQL Editor
2. Agregar políticas RLS
3. Agregar funciones CRUD en `appStore.js` (si aplica)
4. Opcional: crear migración SQL en `/supabase/migrations/`

### 12.2 Agregar Nuevas Páginas

1. Crear archivo en `/src/pages/`
2. Importar en `App.jsx`
3. Agregar ruta en `<Routes>`

### 12.3 Agregar Nuevas Categorías de Canciones

1. Agregar en `SONG_CATEGORIES` en `appStore.js`
2. Agregar config en `categoryConfig` en `Repertorio.jsx`

### 12.4 Agregar Nuevos Tipos de Reunión

1. Agregar en `MEETING_TYPES` en `appStore.js`

### 12.5 Agregar Nuevos Instrumentos

1. Agregar en `INSTRUMENTS` en `appStore.js`

---

## 13. Troubleshooting Común

### 13.1 Error de Permisos en Storage

Si falla la subida de avatares:
1. Verificar políticas RLS del bucket `avatars`
2. Verificar que el bucket permite operaciones de anon

### 13.2 Notificaciones No Aparecen

1. Verificar que la tabla `notifications` existe
2. Verificar que hay datos en `daily_reflections`
3. Verificar RLS de tabla notifications permite leer `is_global = true`

### 13.3 Cache Desactualizado

Si los datos no se actualizan:
1. Hacer logout y login de nuevo
2. Limpiar localStorage del navegador
3. Verificar en Supabase que los datos son correctos

### 13.4 Build Falla

Si `pnpm build` falla:
1. Limpiar node_modules: `rm -rf node_modules`
2. Reinstalar: `pnpm install --force`
3. Reintentar build

---

## 14. Créditos

**Desarrollado para:** Centro de Avivamiento Familiar (CAF)
**Herramienta de IA:** MiniMax Agent
**Stack:** React 18 + Supabase + Tailwind CSS + Zustand

---

*Documento generado automáticamente. Actualizado: Abril 2026*
