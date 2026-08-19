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

async function requirePastor(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: json({ error: "Missing Authorization" }, 401) };
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return { error: json({ error: "Invalid token" }, 401) };
  const admin = createClient(url, serviceKey);
  const { data: caller, error: cErr } = await admin.from("members").select("role, active, id").eq("user_id", user.id).maybeSingle();
  if (cErr) return { error: json({ error: "Auth lookup failed", detail: cErr.message }, 500) };
  if (!caller || caller.role !== "pastor" || caller.active === false) return { error: json({ error: "Forbidden" }, 403) };
  return { admin, caller, user };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requirePastor(req);
  if ("error" in auth) return auth.error;
  const { admin, caller } = auth;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { requestId, role, password } = body || {};
  if (!requestId || typeof requestId !== "string") return json({ error: "requestId required" }, 400);
  if (!role || !["pastor", "leader", "member"].includes(role)) return json({ error: "valid role required" }, 400);
  if (!password || typeof password !== "string" || password.length < 6) {
    return json({ error: "password required (min 6 chars)" }, 400);
  }

  const { data: request, error: getErr } = await admin
    .from("pending_registrations")
    .select("id, name, email, phone, pastor_area, leader_of, birthdate, instruments, status")
    .eq("id", requestId)
    .maybeSingle();
  if (getErr) return json({ error: "request lookup failed", detail: getErr.message }, 500);
  if (!request) return json({ error: "request not found" }, 404);
  if (request.status !== "pending") return json({ error: `request already ${request.status}` }, 400);

  const { data: existingMember } = await admin
    .from("members")
    .select("id")
    .eq("email", request.email)
    .maybeSingle();
  if (existingMember) {
    return json({ error: "a member with this email already exists" }, 409);
  }

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: request.email,
    password,
    email_confirm: true,
    user_metadata: { name: request.name },
  });
  if (authErr) return json({ error: "auth creation failed", detail: authErr.message }, 400);
  const userId = authData.user?.id;

  const { data: member, error: memberErr } = await admin
    .from("members")
    .insert({
      id: userId,                 // pin members.id = auth.users.id for new rows
      name: request.name,
      email: request.email,
      phone: request.phone,
      pastor_area: request.pastor_area,
      leader_of: request.leader_of,
      birthdate: request.birthdate,
      instruments: request.instruments || [],
      role,
      active: true,
      user_id: userId,
      onboarded: false,
    })
    .select()
    .single();
  if (memberErr) {
    if (userId) { try { await admin.auth.admin.deleteUser(userId); } catch (_) {} }
    return json({ error: "member insert failed", detail: memberErr.message }, 500);
  }

  await admin
    .from("pending_registrations")
    .update({
      status: "approved",
      approved_by: caller.id,
      approved_at: new Date().toISOString(),
      assigned_role: role,
    })
    .eq("id", requestId);

  // Email de bienvenida con usuario + contraseña + link al manual. No crítico:
  // si el encolado falla, la aprobación ya está hecha igual.
  try {
    await admin.rpc("encolar_email", {
      p_slug: "registro-aprobado",
      p_to_email: request.email,
      p_to_nombre: request.name,
      p_variables: {
        nombre: request.name,
        email: request.email,
        password,
        url_login: "https://adorapp.net.ar/login",
        url_manual: "https://adorapp.net.ar/AdorAPP-Instructivo.pdf",
      },
      p_prioridad: 1,
    });
  } catch (_) { /* email no bloquea la aprobación */ }

  return json({ ok: true, member, userId });
});
