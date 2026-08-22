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

// --- Formato seguro del mensaje (barra de formato del cliente) ---------------
// El editor manda HTML de contentEditable. NUNCA se confía en el cliente: acá se
// reconstruye el mensaje permitiendo SOLO negrita/cursiva/subrayado/saltos de
// línea (strong/em/u/br); cualquier otra tag queda escapada como texto visible.
// Devuelve el HTML seguro (cuerpo del correo, que la plantilla 'comunicacion'
// renderiza RAW) y el texto plano (campanita, registro, parte text/plain del
// correo y validaciones). Back-compat: texto plano de clientes viejos produce
// exactamente el mismo resultado que el escape+<br> anterior.
const MARK = {
  br: "\uE000",
  bOpen: "\uE001", bClose: "\uE002",
  iOpen: "\uE003", iClose: "\uE004",
  uOpen: "\uE005", uClose: "\uE006",
} as const;

function sanitizeRichMessage(input: string): { html: string; text: string } {
  let s = String(input);
  // Anti-spoof: los marcadores internos usan área privada Unicode; se purgan del input.
  // deno-lint-ignore no-control-regex
  s = s.replace(/[\uE000-\uE00F]/g, "");
  // contentEditable: línea en blanco = <div><br></div> → debe contar como UN salto.
  // Los patrones de <br> usan [^>]* (clase negada + terminador) en vez de \s*\/?\s*
  // para ser LINEALES: `\s*\/?\s*>` sufre backtracking cuadrático ante un input
  // crudo con muchos espacios y sin `>` de cierre (ReDoS). [^>]* no backtrackea.
  s = s.replace(/<div[^>]*>\s*<br\b[^>]*>\s*<\/div>/gi, "<div></div>");
  // Tags permitidas → marcadores (los atributos se descartan siempre).
  s = s.replace(/<br\b[^>]*>/gi, MARK.br);
  s = s.replace(/<div[^>]*>/gi, MARK.br).replace(/<\/div\s*>/gi, "");
  s = s.replace(/<p[^>]*>/gi, MARK.br).replace(/<\/p\s*>/gi, "");
  s = s.replace(/<(?:strong|b)(?:\s[^>]*)?>/gi, MARK.bOpen).replace(/<\/(?:strong|b)\s*>/gi, MARK.bClose);
  s = s.replace(/<(?:em|i)(?:\s[^>]*)?>/gi, MARK.iOpen).replace(/<\/(?:em|i)\s*>/gi, MARK.iClose);
  s = s.replace(/<u(?:\s[^>]*)?>/gi, MARK.uOpen).replace(/<\/u\s*>/gi, MARK.uClose);
  // Wrappers inocuos que meten contentEditable/pegados: fuera la tag, queda el texto.
  s = s.replace(/<\/?(?:span|font|a)(?:\s[^>]*)?>/gi, "");
  // Si TODO venía envuelto en divs, el primer div no es un Enter del usuario.
  if (s.startsWith(MARK.br)) s = s.slice(1);
  // Clientes viejos / API cruda mandan saltos reales.
  s = s.replace(/\r\n|\r|\n/g, MARK.br);
  // innerHTML trae entidades ("5 < 10" llega como "5 &lt; 10"): decodificar las
  // básicas ANTES de escapar (amp al final para no doble-decodificar).
  s = s.replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'")
    .replace(/&amp;/gi, "&");
  // TEXTO PLANO: saltos reales, sin marcadores de formato.
  const text = s
    .split(MARK.br).join("\n")
    .replace(/[\uE001-\uE006]/g, "")
    .trim();
  // HTML: escapar TODO y reconstruir los marcadores con balanceo estricto
  // (los cierres huérfanos se ignoran; lo abierto se cierra al final).
  const escaped = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const OPEN: Record<string, string> = { [MARK.bOpen]: "strong", [MARK.iOpen]: "em", [MARK.uOpen]: "u" };
  const CLOSE: Record<string, string> = { [MARK.bClose]: "strong", [MARK.iClose]: "em", [MARK.uClose]: "u" };
  let html = "";
  const stack: string[] = [];
  for (const ch of escaped) {
    if (ch === MARK.br) {
      html += "<br>";
    } else if (OPEN[ch]) {
      stack.push(OPEN[ch]);
      html += `<${OPEN[ch]}>`;
    } else if (CLOSE[ch]) {
      if (stack[stack.length - 1] === CLOSE[ch]) {
        stack.pop();
        html += `</${CLOSE[ch]}>`;
      } // cierre desbalanceado → se ignora
    } else {
      html += ch;
    }
  }
  while (stack.length) html += `</${stack.pop()}>`;
  // Saltos decorativos al borde (contentEditable suele dejar un <br> final).
  html = html.replace(/^(<br>)+/, "").replace(/(<br>)+$/, "");
  return { html, text };
}

// Ruta legacy: clientes viejos (bundle cacheado) / API cruda mandan TEXTO PLANO,
// sin `format:'rich'`. Reproduce EXACTO el comportamiento anterior a la barra de
// formato: escape de HTML + saltos → <br> para el cuerpo del correo; texto crudo
// trimmeado para campanita/registro/parte text. Así el corpus histórico no cambia
// ni un byte al introducir el formato seguro (el sanitizador rico corre SOLO para
// el cliente nuevo, que declara `format:'rich'`).
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function legacyPlainMessage(input: string): { html: string; text: string } {
  const text = String(input).trim();
  const html = escapeHtml(text).replace(/\r\n|\r|\n/g, "<br>");
  return { html, text };
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
    .select("id, role, active, name, email, avatar_url, user_id")
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

  const { recipientType, recipientIds, subject, message, channels, format } = body || {};
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
  // Guarda de tamaño ANTES de sanitizar: acota el trabajo del sanitizador (defensa
  // en profundidad junto a los regex lineales) y frena payloads absurdos por API
  // cruda. 50 KB es amplísimo para un mensaje de <=1000 chars con formato liviano.
  if (message.length > 50000) {
    return json({ error: "el mensaje es demasiado largo" }, 400);
  }
  if (recipientIds.length > 1000) {
    return json({ error: "too many recipients (max 1000)" }, 400);
  }

  // Deduplicate recipientIds (defense in depth — UI also de-dupes).
  const uniqueRecipients = Array.from(new Set(recipientIds.map(String)));

  const trimmedSubject = subject.trim();
  // Formato del mensaje según el origen:
  //  • Cliente NUEVO (barra de formato) declara `format:'rich'` y manda el HTML del
  //    editor → sanitizeRichMessage: whitelist ESTRICTA (strong/em/u/br) para el
  //    cuerpo del correo (messageHtml) + texto plano (messageText) para campanita,
  //    registro y parte text/plain del mail.
  //  • Cliente VIEJO / API cruda (sin `format`, o 'plain') manda texto plano →
  //    legacyPlainMessage: escape+<br> EXACTO como antes de la barra (back-compat
  //    byte-idéntico; el sanitizador rico nunca toca el corpus histórico).
  const { html: messageHtml, text: messageText } = format === "rich"
    ? sanitizeRichMessage(message)
    : legacyPlainMessage(message);
  if (messageText.length === 0) {
    return json({ error: "message required" }, 400);
  }
  if (messageText.length > 1000) {
    return json({ error: "el mensaje supera los 1000 caracteres" }, 400);
  }
  // Cap del HTML como cota de abuso. 20000 deja pasar cualquier mensaje de <=1000
  // chars aun con formato denso (peor caso realista ~9.5 KB), evitando el rechazo
  // "válido en cliente / 400 en server" que daría un tope más bajo.
  if (messageHtml.length > 20000) {
    return json({ error: "el mensaje es demasiado largo" }, 400);
  }
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
      message: messageText, // texto plano: el registro se muestra limpio en cualquier UI
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
      // La campanita muestra TEXTO PLANO (sin tags): formato solo en el correo.
      preview: messageText.slice(0, 100),
      full_message: messageText,
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
            p_variables: { asunto: trimmedSubject, mensaje: messageHtml, mensaje_texto: messageText },
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
