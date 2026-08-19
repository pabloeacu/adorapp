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

// El cuerpo del correo (plantilla 'comunicacion') se renderiza RAW, así que el
// mensaje del pastor se escapa una vez y los saltos de línea pasan a <br>.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

  const { recipientType, recipientIds, subject, message, channels } = body || {};
  if (!recipientType || !["bands", "users", "roles", "all"].includes(recipientType)) {
    return json({ error: "recipientType must be bands|users|roles|all" }, 400);
  }
  // Canales: por defecto (clientes viejos) solo campanita. Requiere al menos uno.
  let doPush = true, doMail = false;
  if (channels && typeof channels === "object") {
    doPush = !!channels.push;
    doMail = !!channels.mail;
  }
  if (!doPush && !doMail) {
    return json({ error: "seleccioná al menos un canal (campanita o correo)" }, 400);
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

  const usedChannels = [doPush ? "push" : null, doMail ? "mail" : null].filter(Boolean) as string[];

  // Step 1: insert the parent communication row (registro de lo enviado). El padre
  // NO tiene triggers, así que insertarlo NO dispara push (el push vive en el
  // trigger AFTER INSERT de communication_notifications).
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
      channels: usedChannels,
    })
    .select()
    .single();
  if (commErr) return json({ error: "failed to create communication", detail: commErr.message }, 500);

  // Step 2 (canal CAMPANITA): insertar una notificación por destinatario. El trigger
  // push_on_communication_insert la reparte por push. Si falla, se hace rollback del
  // padre para no dejar un parent sin hijos (modo de fallo histórico del fan-out cliente).
  let pushCount = 0;
  if (doPush) {
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
    pushCount = count ?? rows.length;
  }

  // Step 3 (canal CORREO): resolver el email de cada destinatario (por user_id) y
  // encolar el correo con la plantilla 'comunicacion' (título fijo, asunto+mensaje
  // del pastor). Los que no tengan email se saltean. El fallo de un correo no aborta
  // el resto ni el envío por campanita.
  let mailQueued = 0, mailSkipped = 0;
  if (doMail) {
    const mensajeHtml = escapeHtml(trimmedMessage).replace(/\r\n|\r|\n/g, "<br>");
    const { data: mems, error: memErr } = await admin
      .from("members")
      .select("name, email, user_id")
      .in("user_id", uniqueRecipients);
    if (memErr) {
      // El correo es best-effort: si no pudimos resolver emails, seguimos (push ya salió).
      mailSkipped = uniqueRecipients.length;
    } else {
      for (const m of (mems || [])) {
        const email = (m.email || "").trim();
        if (!email) { mailSkipped++; continue; }
        try {
          await admin.rpc("encolar_email", {
            p_slug: "comunicacion",
            p_to_email: email,
            p_to_nombre: m.name,
            p_variables: { asunto: trimmedSubject, mensaje: mensajeHtml, mensaje_texto: trimmedMessage },
            p_prioridad: 5,
          });
          mailQueued++;
        } catch (_) { mailSkipped++; }
      }
    }
  }

  return json({
    ok: true,
    communication: comm,
    channels: usedChannels,
    inserted: pushCount,          // compat: clientes viejos leen "inserted"
    pushCount,
    mailQueued,
    mailSkipped,
  });
});
