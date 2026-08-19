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

  const { memberId } = body || {};
  if (!memberId || typeof memberId !== "string") return json({ error: "memberId required" }, 400);
  if (memberId === caller.id) return json({ error: "Cannot delete your own member record" }, 400);

  const { data: member, error: getErr } = await admin
    .from("members")
    .select("id, user_id, name, email")
    .eq("id", memberId)
    .maybeSingle();
  if (getErr) return json({ error: "member lookup failed", detail: getErr.message }, 500);
  if (!member) return json({ error: "member not found" }, 404);

  // Order matters: delete the auth user FIRST. If that fails, abort and leave the
  // member row in place so we never end up with the historical bug of an orphaned
  // auth.user that could keep logging in.
  if (member.user_id) {
    const { error: authErr } = await admin.auth.admin.deleteUser(member.user_id);
    if (authErr) {
      // Some accounts have already been deleted upstream; treat "not found" as success.
      const msg = (authErr.message || "").toLowerCase();
      const alreadyGone = msg.includes("not found") || msg.includes("user_not_found");
      if (!alreadyGone) {
        return json({
          error: "could not delete auth user — member NOT removed",
          detail: authErr.message,
        }, 500);
      }
    }
  }

  const { error: delErr } = await admin.from("members").delete().eq("id", memberId);
  if (delErr) {
    return json({
      error: "member row delete failed (auth user already removed) — please retry from the dashboard",
      detail: delErr.message,
    }, 500);
  }

  return json({ ok: true, memberId, name: member.name });
});
