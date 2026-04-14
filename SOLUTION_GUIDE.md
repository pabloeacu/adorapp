# Guía para Solucionar Usuarios sin Cuenta en AdorAPP

## Problema Actual
- **Olga** y **Paul** no tienen cuentas de autenticación en Supabase
- Por eso no pueden recibir notificaciones
- Ana sí tiene porque fue creada correctamente

## Solución Requerida

### Paso 1: Verificar el estado actual
En el SQL Editor de Supabase, ejecuta:

```sql
SELECT name, email, role, user_id IS NOT NULL as has_account
FROM members
WHERE active = true
ORDER BY name;
```

Esto te mostrará cuáles miembros tienen cuenta.

### Paso 2: Crear cuentas para Olga y Paul
Como Olga y Paul no tienen cuentas de auth, tienes dos opciones:

**Opción A: Crear manualmente en Supabase Dashboard**
1. Ve a **Authentication** → **Users**
2. Click **Add user**
3. Ingresa el email y un password temporal
4. Una vez creado, el usuario tendrá un `id` (UUID)
5. Copia ese `id`

**Opción B: Crear mediante API (para desarrolladores)**
Se necesita usar `supabaseAdmin.auth.admin.createUser()` con la clave de servicio.

### Paso 3: Vincular members con auth.users
Una vez que Olga y Paul tengan cuentas en Supabase Auth:

```sql
-- Vincular Olga (reemplaza con el email real)
UPDATE members
SET user_id = au.id
FROM auth.users au
WHERE members.email = 'olga@email.com'
  AND au.email = 'olga@email.com'
  AND members.user_id IS NULL;

-- Vincular Paul (reemplaza con el email real)
UPDATE members
SET user_id = au.id
FROM auth.users au
WHERE members.email = 'paul@email.com'
  AND au.email = 'paul@email.com'
  AND members.user_id IS NULL;
```

### Paso 4: Verificar la solución
```sql
SELECT name, email, role, user_id
FROM members
WHERE active = true
ORDER BY name;
```

Todos deberían tener un `user_id` (UUID).

---

## Para Nuevas Registraciones (Futuro)
El sistema actual ya maneja esto correctamente en `Solicitudes.jsx`:
- Cuando se aprueba una solicitud, se crea el usuario en auth.users PRIMERO
- Luego se crea el member con el `user_id` del nuevo usuario
- Así que todos los miembros que se registren desde ahora tendrán la vinculación automática

---

## Archivos SQL de Referencia
- `supabase_communications.sql` - Tablas de comunicaciones y migración automática
- `FIX_EXISTING_USERS.sql` - Script con los comandos parafixar usuarios existentes