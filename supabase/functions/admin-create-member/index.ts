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
  const { data: caller, error: cErr } = await admin
    .from("members")
    .select("role, active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (cErr) return { error: json({ error: "Auth lookup failed", detail: cErr.message }, 500) };
  if (!caller || caller.role !== "pastor" || caller.active === false) {
    return { error: json({ error: "Forbidden: pastor role required" }, 403) };
  }
  return { admin, caller, user };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requirePastor(req);
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { name, email, password, phone, pastor_area, leader_of, birthdate, role, editor, instruments, active } = body || {};
  if (!name || typeof name !== "string") return json({ error: "name required" }, 400);
  if (email && typeof email !== "string") return json({ error: "invalid email" }, 400);
  if (email && (!password || typeof password !== "string" || password.length < 6)) {
    return json({ error: "password required when email is present (min 6 chars)" }, 400);
  }
  if (role && !["pastor", "leader", "member"].includes(role)) return json({ error: "invalid role" }, 400);

  let userId: string | null = null;
  if (email && password) {
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (authErr) return json({ error: "auth creation failed", detail: authErr.message }, 400);
    userId = authData.user?.id ?? null;
  }

  // Pin members.id = auth.users.id when an auth user exists, so the two ids
  // never drift. Members without auth still get a fresh uuid via the column
  // default. Existing rows pre-migration may have unrelated ids; that's fine.
  const memberInsert: Record<string, unknown> = {
    name,
    email: email || null,
    phone: phone || null,
    pastor_area: pastor_area || null,
    leader_of: leader_of || null,
    birthdate: birthdate || null,
    role: role || "member",
    editor: editor || false,
    instruments: Array.isArray(instruments) ? instruments : [],
    active: active !== false,
    user_id: userId,
    onboarded: false,
  };
  if (userId) memberInsert.id = userId;

  const { data: member, error: memberErr } = await admin
    .from("members")
    .insert(memberInsert)
    .select()
    .single();

  if (memberErr) {
    if (userId) { try { await admin.auth.admin.deleteUser(userId); } catch (_) {} }
    return json({ error: "member insert failed", detail: memberErr.message }, 500);
  }

  return json({ member, generatedPassword: password || null });
});
