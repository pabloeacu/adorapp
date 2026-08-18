# Edge Functions

Fuente versionada de las Edge Functions desplegadas en Supabase (`gvsoexomzfaimagnaqzm`).
Hasta esta incorporación, solo `send-push` estaba en el repo; las otras 8 vivían
únicamente desplegadas. Se recuperaron desde el runtime de Supabase (fuente TS
original, sin bundlear) para que el repo sea la fuente de verdad completa.

| Función | `verify_jwt` | Rol |
|---|:---:|---|
| `admin-create-member` | ✅ | Crea auth user + fila `members` (service_role). Verifica pastor. **Única puerta para test users.** |
| `admin-delete-member` | ✅ | Borra auth user (primero) + fila `members`. No permite auto-borrado. |
| `admin-reset-password` | ✅ | Resetea la contraseña de un usuario. |
| `admin-approve-registration` | ✅ | `pending_registrations` → auth user + `members` (flujo real de alta). |
| `admin-reject-registration` | ✅ | Marca la solicitud como `rejected`. |
| `admin-send-communication` | ✅ | Inserta `communications` + fan-out a `communication_notifications` (rollback si falla). |
| `log-error` | ❌ | Recibe errores del cliente → `error_log`. Anon-callable (captura errores pre-login). |
| `record-health-check` | ❌ | Recibe pings de uptime de GitHub Actions → `health_checks`. |
| `send-push` | ❌ | Envía Web Push (VAPID). Invocada por triggers vía pg_net. |

## Secretos

Ninguna función hardcodea secretos: todas leen `SUPABASE_URL`, `SUPABASE_ANON_KEY`
y `SUPABASE_SERVICE_ROLE_KEY` de `Deno.env`. Las VAPID keys de `send-push` se leen
de Supabase Vault vía `get_push_config()`. **Nunca** poner `service_role` en el cliente.

## Deploy

```bash
supabase functions deploy <slug> --project-ref gvsoexomzfaimagnaqzm
```

El `verify_jwt` de cada función está fijado en `supabase/config.toml`
(`[functions.<slug>]`) — respetarlo o las 3 funciones anon (`send-push`,
`log-error`, `record-health-check`) se romperían al redeployar.
