import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Autentica al llamador y devuelve su ficha de miembro (rol/activo/user_id).
async function authCaller(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: json({ error: "Missing Authorization" }, 401) };
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return { error: json({ error: "Invalid token" }, 401) };
  const admin = createClient(url, serviceKey);
  const { data: caller, error: cErr } = await admin
    .from("members").select("id, role, active, user_id").eq("user_id", user.id).maybeSingle();
  if (cErr) return { error: json({ error: "Auth lookup failed", detail: cErr.message }, 500) };
  if (!caller) return { error: json({ error: "Forbidden" }, 403) };
  return { admin, caller, user };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await authCaller(req);
  if ("error" in auth) return auth.error;
  const { admin, caller } = auth;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { memberId, updates } = body || {};
  if (!memberId || typeof memberId !== "string") return json({ error: "memberId required" }, 400);
  if (!updates || typeof updates !== "object") return json({ error: "updates required" }, 400);

  // Ficha objetivo
  const { data: target, error: tErr } = await admin
    .from("members").select("id, user_id, email, name").eq("id", memberId).maybeSingle();
  if (tErr) return json({ error: "member lookup failed", detail: tErr.message }, 500);
  if (!target) return json({ error: "member not found" }, 404);

  // Autorización: pastor ACTIVO (active === true, igual que auth_role()/is_pastor())
  // edita a cualquiera; o el propio dueño de la ficha.
  const isPastor = caller.role === "pastor" && caller.active === true;
  const isSelf = caller.user_id === target.user_id;
  if (!isPastor && !isSelf) return json({ error: "Forbidden" }, 403);

  // El email es login (auth.users) + identidad + contacto (members), y la app matchea
  // usuario↔ficha por email. GoTrue SIEMPRE canonicaliza auth.users.email a minúscula
  // (y auth.identities.email es GENERATED lower()), así que members.email DEBE quedar
  // en minúscula o divergiría y rompería el match. Normalizamos en este borde.
  const curEmail = (target.email || "").trim();
  const newEmail = (typeof updates.email === "string" ? updates.email : curEmail).trim().toLowerCase();
  const emailChanged = newEmail.length > 0 && newEmail !== curEmail.toLowerCase();

  // 1) Cambio de email → Admin API (sincroniza auth.users + auth.identities).
  let canonicalEmail = newEmail;
  if (emailChanged) {
    if (!EMAIL_RE.test(newEmail)) return json({ error: "email inválido" }, 400);
    if (!target.user_id) return json({ error: "el miembro no tiene usuario de acceso asociado" }, 409);

    // Colisión en members: match EXACTO (eq), no ilike (ilike trata `_`/`%` como
    // comodines y daría falsos positivos con emails que llevan guion bajo).
    const { data: dup, error: dupErr } = await admin
      .from("members").select("id").eq("email", newEmail).neq("id", memberId).maybeSingle();
    if (dupErr) return json({ error: "no se pudo verificar el correo", detail: dupErr.message }, 500);
    if (dup) return json({ error: "Ya existe un miembro con ese correo" }, 409);

    // Cambiar el email de login (auth). email_confirm: true → sin re-confirmación.
    const { data: authData, error: authErr } = await admin.auth.admin.updateUserById(target.user_id, {
      email: newEmail,
      email_confirm: true,
    });
    if (authErr) {
      const msg = /registered|already|exists|taken/i.test(authErr.message || "")
        ? "Ese correo ya está en uso por otra cuenta"
        : (authErr.message || "no se pudo actualizar el correo de acceso");
      return json({ error: msg }, 409);
    }
    // Espejar el email canónico que devuelve GoTrue (no asumir la normalización).
    canonicalEmail = ((authData?.user?.email as string) || newEmail).toLowerCase();
  }

  // 2) Actualizar la fila de members (update PARCIAL de columnas explícitas — NUNCA
  //    convertMemberToDB, que rellena defaults y borraría columnas: landmine #8).
  const db: Record<string, unknown> = {};
  const setIf = (k: string, v: unknown) => { if (k in updates) db[k] = v; };
  setIf("name", updates.name);
  if (emailChanged || ("email" in updates)) db.email = canonicalEmail; // members.email == login (minúscula)
  setIf("phone", updates.phone || null);
  setIf("pastor_area", updates.pastor_area || null);
  setIf("leader_of", updates.leader_of || null);
  setIf("birthdate", updates.birthdate || null);
  setIf("instruments", updates.instruments || []);
  // Campos SENSIBLES: solo un pastor puede cambiarlos. Un auto-edit de no-pastor
  // NO puede escalar su rol / activarse / darse permiso de editor por esta vía.
  if (isPastor) {
    setIf("role", updates.role || "member");
    setIf("editor", !!updates.editor);
    if ("active" in updates) db.active = updates.active ?? true;
  }
  // NUNCA se tocan user_id / avatar_url / onboarded (no vienen en updates).

  const { data: member, error: updErr } = await admin
    .from("members").update(db).eq("id", memberId).select().single();

  if (updErr) {
    // Compensación best-effort: si ya cambiamos el email de auth, revertirlo para
    // no dejar login≠contacto. (Las sesiones NO se revocaron todavía — ver abajo.)
    if (emailChanged && curEmail) {
      try {
        await admin.auth.admin.updateUserById(target.user_id, { email: curEmail.toLowerCase(), email_confirm: true });
      } catch (_) { /* si el revert falla, queda un desync raro pero ya devolvemos 500 */ }
    }
    return json({ error: "no se pudo guardar el miembro", detail: updErr.message }, 500);
  }

  // 3) Revocar sesiones SOLO tras el éxito COMPLETO del cambio de email (así no
  //    dejamos al target deslogueado por un cambio que finalmente se abortó). Evita
  //    la ventana en que su JWT vivo lleva el email viejo y rompería el match.
  //    Best-effort: si falla, el token se auto-corrige al refrescar (≤1h).
  if (emailChanged && target.user_id) {
    try { await admin.rpc("revoke_user_sessions", { p_user_id: target.user_id }); } catch (_) { /* no bloquea */ }
  }

  return json({ ok: true, member, emailChanged });
});
