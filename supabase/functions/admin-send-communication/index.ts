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
    .select("id, role, active, name, email, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();
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

  const { recipientType, recipientIds, subject, message } = body || {};
  if (!recipientType || !["bands", "users", "roles", "all"].includes(recipientType)) {
    return json({ error: "recipientType must be bands|users|roles|all" }, 400);
  }
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
    return json({ error: "recipientIds must be a non-empty array" }, 400);
  }
  if (typeof subject !== "string" || subject.trim().length === 0) {
    return json({ error: "subject required" }, 400);
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    return json({ error: "message required" }, 400);
  }
  if (recipientIds.length > 1000) {
    return json({ error: "too many recipients (max 1000)" }, 400);
  }

  // Deduplicate recipientIds (defense in depth — UI also de-dupes).
  const uniqueRecipients = Array.from(new Set(recipientIds.map(String)));

  const trimmedSubject = subject.trim();
  const trimmedMessage = message.trim();
  const senderName = caller.name || caller.email || "Pastor";
  const senderPhoto = caller.avatar_url || null;

  // Step 1: insert the parent communication row.
  const { data: comm, error: commErr } = await admin
    .from("communications")
    .insert({
      sender_id: caller.user_id || null,
      sender_name: senderName,
      sender_photo: senderPhoto,
      subject: trimmedSubject,
      message: trimmedMessage,
      recipient_type: recipientType,
      recipient_ids: uniqueRecipients,
      recipient_count: uniqueRecipients.length,
    })
    .select()
    .single();
  if (commErr) return json({ error: "failed to create communication", detail: commErr.message }, 500);

  // Step 2: insert all per-recipient notifications. If this fails, roll back the
  // communication row so we don't leave a parent without children — the historical
  // failure mode the previous client-side fan-out had under network blips.
  const rows = uniqueRecipients.map(recipientId => ({
    communication_id: comm.id,
    recipient_id: recipientId,
    sender_name: senderName,
    sender_photo: senderPhoto,
    subject: trimmedSubject,
    preview: trimmedMessage.slice(0, 100),
    full_message: trimmedMessage,
    is_read: false,
  }));

  // Single round trip — Postgres handles arrays of inserts efficiently.
  const { error: notifErr, count } = await admin
    .from("communication_notifications")
    .insert(rows, { count: "exact" });

  if (notifErr) {
    await admin.from("communications").delete().eq("id", comm.id);
    return json({
      error: "failed to fan out notifications — communication rolled back",
      detail: notifErr.message,
    }, 500);
  }

  return json({
    ok: true,
    communication: comm,
    inserted: count ?? rows.length,
  });
});
