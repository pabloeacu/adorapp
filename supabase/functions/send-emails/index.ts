// send-emails — worker/dispatcher de emails transaccionales por Gmail API.
//
// Diseño (handoff Gmail §5-§6):
//   * Lo pincha pg_cron cada ~1 min. Procesa como MUCHO 1 mail por corrida
//     (pace humano) salvo carril rápido de prioridad alta.
//   * Throttle de dos pisos: GLOBAL (ritmo) + POR-DESTINATARIO (5 min, anti-ráfaga).
//   * Reintentos con backoff exponencial; el estado vive en la DB.
//   * Envía por Gmail API (users.messages.send) con OAuth2 refresh_token.
//
// Seguridad:
//   * verify_jwt:false (el cron no trae JWT de usuario) → validamos el secreto
//     interno (email_internal_secret) DENTRO del handler (landmine verify_jwt, §5.1).
//   * Credenciales de Gmail + remitente + secreto interno viven en private.app_secrets
//     y se leen por get_email_config() (mismo patrón que el push). Nunca en el repo
//     ni en el cliente.
//   * Corre con service_role (bypassa RLS para leer/escribir la cola).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// --- Config / secretos -----------------------------------------------------
// Solo SUPABASE_URL y SERVICE_ROLE_KEY vienen de Deno.env (los inyecta Supabase).
// El resto (credenciales de Gmail, remitente, secreto interno del cron) vive en
// private.app_secrets y se lee por RPC get_email_config() — mismo patrón que el
// push con get_push_config. No usamos Deno.env para esos secretos porque no se
// pueden setear vía MCP; así queda todo centralizado, versionable y consistente.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface EmailConfig {
  gmail_client_id: string;
  gmail_client_secret: string;
  gmail_refresh_token: string;
  email_from: string;
  email_from_name: string;
  email_internal_secret: string;
}

// Throttle (handoff §5): por-destinatario 5 min fijo; global bajo para que los
// transaccionales lleguen en segundos; carril rápido para prioridad <= 1.
const PER_RECIPIENT_FLOOR_MIN = 5;
const GLOBAL_FLOOR_SECONDS = 10;
const FAST_LANE_MAX_PRIORITY = 1;
const CANDIDATE_LIMIT = 10;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// --- Utilidades de render (handoff §6.1) -----------------------------------
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
// {{clave}} → valor. `escape=true` para texto dentro del HTML; `false` (RAW) para
// URLs (que después se escapan UNA vez en el href) y para el texto plano.
function renderVars(tpl: string, vars: Record<string, unknown>, escape: boolean): string {
  if (!tpl) return "";
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = vars[key];
    const s = v === undefined || v === null ? "" : String(v);
    return escape ? escapeHtml(s) : s;
  });
}

// --- Layout del email (handoff §6.2): table-based, inline, sobrio -----------
const LOGO_URL = "https://adorapp.net.ar/adorapp-logo.png";

function buildHtml(t: EmailTemplate, vars: Record<string, unknown>): string {
  const accent = /^#[0-9a-fA-F]{6}$/.test(t.color_acento || "") ? t.color_acento : "#b7791f";
  const kicker = renderVars(t.kicker || "", vars, true);
  const titulo = renderVars(t.titulo || "", vars, true);
  const cuerpo = renderVars(t.cuerpo_html || "", vars, false); // cuerpo_html ya es HTML curado por el pastor
  const ctaText = renderVars(t.cta_text || "", vars, true);
  const ctaUrlRaw = renderVars(t.cta_url || "", vars, false);  // RAW; se escapa una vez abajo
  const cta2Text = renderVars(t.cta2_text || "", vars, true);
  const cta2UrlRaw = renderVars(t.cta2_url || "", vars, false); // 2º botón (ej. descargar manual)
  const firma = renderVars(t.firma || "", vars, true);

  // Encabezado oscuro con el logo de AdorAPP (el PNG trae fondo negro → banda dark).
  // Gated en mostrar_logo; imagen chica (no banner) para no castigar entregabilidad.
  const logoBlock = t.mostrar_logo !== false
    ? `<tr><td style="background:#0b0b12;padding:22px 0;text-align:center;">
         <img src="${LOGO_URL}" width="180" alt="AdorAPP" style="width:180px;max-width:62%;height:auto;display:inline-block;border:0;">
       </td></tr>`
    : "";

  const ctaBlock = ctaText && ctaUrlRaw
    ? `<tr><td style="padding:10px 0 4px;">
         <table role="presentation" cellpadding="0" cellspacing="0"><tr>
           <td style="border-radius:8px;background-color:${accent};">
             <a href="${escapeAttr(ctaUrlRaw)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${ctaText}</a>
           </td></tr></table></td></tr>`
    : "";

  // 2º botón, estilo "outline" (borde de acento, texto de acento) → claramente
  // distinto del CTA primario. Lo usa registro-aprobado para "descargar el manual".
  const cta2Block = cta2Text && cta2UrlRaw
    ? `<tr><td style="padding:6px 0 4px;">
         <table role="presentation" cellpadding="0" cellspacing="0"><tr>
           <td style="border-radius:8px;border:2px solid ${accent};">
             <a href="${escapeAttr(cta2UrlRaw)}" style="display:inline-block;padding:11px 22px;font-size:15px;font-weight:600;color:${accent};text-decoration:none;border-radius:8px;">${cta2Text}</a>
           </td></tr></table></td></tr>`
    : "";

  const kickerBlock = kicker
    ? `<tr><td style="padding:0 0 6px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${accent};font-weight:700;">${kicker}</td></tr>`
    : "";

  const firmaBlock = firma
    ? `<tr><td style="padding:24px 0 0;font-size:13px;color:#6b7280;">${firma}</td></tr>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
${logoBlock}
<tr><td style="padding:30px 34px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${kickerBlock}
${titulo ? `<tr><td style="padding:0 0 14px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">${titulo}</td></tr>` : ""}
<tr><td style="font-size:15px;line-height:1.65;color:#374151;">${cuerpo}</td></tr>
${ctaBlock}
${cta2Block}
${firmaBlock}
</table>
</td></tr>
<tr><td style="padding:16px 34px;border-top:1px solid #f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#9ca3af;text-align:center;">
AdorAPP · Ministerio de Adoración — Adoración CAF<br>adorapp.net.ar
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function buildText(t: EmailTemplate, vars: Record<string, unknown>): string {
  if (t.body_text) return renderVars(t.body_text, vars, false);
  // Fallback: derivar texto del cuerpo (sin tags) — RAW, nunca escapado (E-GG-79).
  const cuerpo = renderVars(t.cuerpo_html || "", vars, false).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
  const cta = t.cta_url ? `\n\n${renderVars(t.cta_text || "", vars, false)}: ${renderVars(t.cta_url, vars, false)}` : "";
  const cta2 = t.cta2_url ? `\n\n${renderVars(t.cta2_text || "", vars, false)}: ${renderVars(t.cta2_url, vars, false)}` : "";
  const firma = t.firma ? `\n\n${renderVars(t.firma, vars, false)}` : "";
  return `${cuerpo}${cta}${cta2}${firma}\n\nAdorAPP — Adoración CAF · adorapp.net.ar`;
}

// --- MIME (handoff §6.3) ----------------------------------------------------
function b64(s: string): string {
  // base64 estándar, líneas a 76 chars.
  const raw = btoa(unescape(encodeURIComponent(s)));
  return raw.replace(/(.{76})/g, "$1\r\n");
}
function b64urlRaw(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function encodeHeader(s: string): string {
  // RFC 2047 para asuntos con acentos/ñ.
  // deno-lint-ignore no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  const b = btoa(unescape(encodeURIComponent(s)));
  return `=?UTF-8?B?${b}?=`;
}
function encodeName(name: string): string {
  // deno-lint-ignore no-control-regex
  return /^[\x00-\x7F]*$/.test(name) ? name : encodeHeader(name);
}

function buildMime(opts: {
  fromName: string; fromEmail: string; to: string; toName?: string | null;
  replyTo: string; subject: string; html: string; text: string;
}): string {
  const boundary = `bnd_${crypto.randomUUID().replace(/-/g, "")}`;
  const toHeader = opts.toName ? `${encodeName(opts.toName)} <${opts.to}>` : opts.to;
  const headers = [
    `From: ${encodeName(opts.fromName)} <${opts.fromEmail}>`,
    `To: ${toHeader}`,
    `Reply-To: ${opts.replyTo}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    `MIME-Version: 1.0`,
    `X-Auto-Response-Suppress: All`,
    `X-Mailer: AdorAPP Platform`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");

  const body = [
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    b64(opts.text),
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    b64(opts.html),
    `--${boundary}--`,
    ``,
  ].join("\r\n");

  return headers + "\r\n" + body;
}

// --- OAuth + Gmail API (handoff §6.4) --------------------------------------
async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!r.ok) throw new Error(`oauth token ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.access_token as string;
}
async function gmailSend(accessToken: string, mime: string): Promise<string> {
  const raw = b64urlRaw(new TextEncoder().encode(mime));
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!r.ok) throw new Error(`gmail ${r.status}: ${await r.text()}`);
  return (await r.json()).id as string;
}

// --- Tipos ------------------------------------------------------------------
interface EmailTemplate {
  slug: string; asunto: string; from_label: string; reply_to: string | null;
  kicker: string | null; titulo: string | null; cuerpo_html: string | null;
  cta_text: string | null; cta_url: string | null;
  cta2_text: string | null; cta2_url: string | null; color_acento: string | null;
  firma: string | null; body_html: string | null; body_text: string | null;
  mostrar_logo: boolean | null;
}
interface QueueJob {
  id: string; template_slug: string; to_email: string; to_nombre: string | null;
  variables: Record<string, unknown>; prioridad: number; intento: number; max_intentos: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// --- Handler ----------------------------------------------------------------
Deno.serve(async (req: Request) => {
  // Config (credenciales Gmail + remitente + secreto interno) desde la RPC.
  const { data: cfg, error: cfgErr } = await admin.rpc("get_email_config");
  if (cfgErr || !cfg) return json({ error: "config unavailable", detail: cfgErr?.message }, 500);
  const config = cfg as EmailConfig;

  // Auth del cron: secreto DENTRO del handler (verify_jwt:false).
  const auth = req.headers.get("Authorization") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "");
  if (!config.email_internal_secret || provided !== config.email_internal_secret) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    // 1) Candidatos pendientes por prioridad.
    const { data: candidates, error: cErr } = await admin
      .from("email_queue")
      .select("id, template_slug, to_email, to_nombre, variables, prioridad, intento, max_intentos")
      .is("enviado_at", null)
      .eq("status", "pending")
      .lte("programado_para", new Date().toISOString())
      .order("prioridad", { ascending: true })
      .order("programado_para", { ascending: true })
      .limit(CANDIDATE_LIMIT);
    if (cErr) throw cErr;
    if (!candidates || candidates.length === 0) return json({ ok: true, sent: 0, reason: "empty" });

    // 2) Throttle GLOBAL (salvo carril rápido de prioridad alta).
    const { data: thr } = await admin.from("email_throttle").select("last_sent_at").eq("key", "global").maybeSingle();
    const lastGlobal = thr?.last_sent_at ? new Date(thr.last_sent_at).getTime() : 0;
    const globalReady = Date.now() - lastGlobal >= GLOBAL_FLOOR_SECONDS * 1000;

    // 3) Elegir el primer candidato que respete el piso POR-DESTINATARIO (5 min).
    const floorIso = new Date(Date.now() - PER_RECIPIENT_FLOOR_MIN * 60_000).toISOString();
    let job: QueueJob | null = null;
    for (const cand of candidates as QueueJob[]) {
      const isFast = cand.prioridad <= FAST_LANE_MAX_PRIORITY;
      if (!isFast && !globalReady) continue; // el global frena a los no-prioritarios
      const { count } = await admin
        .from("sent_emails")
        .select("id", { count: "exact", head: true })
        .eq("to_email", cand.to_email)
        .eq("estado", "sent")
        .gte("created_at", floorIso);
      if ((count ?? 0) === 0) { job = cand; break; }
    }
    if (!job) return json({ ok: true, sent: 0, reason: globalReady ? "per_recipient_floor" : "global_throttled" });

    // 4) Claim atómico: pasar a 'sending' solo si sigue pending (evita doble envío).
    const { data: claimed } = await admin
      .from("email_queue").update({ status: "sending" })
      .eq("id", job.id).eq("status", "pending").is("enviado_at", null).select("id").maybeSingle();
    if (!claimed) return json({ ok: true, sent: 0, reason: "already_claimed" });

    // 5) Plantilla + render + envío.
    try {
      const { data: tpl, error: tErr } = await admin
        .from("email_templates").select("*").eq("slug", job.template_slug).eq("activo", true).maybeSingle();
      if (tErr) throw tErr;
      if (!tpl) throw new Error(`plantilla inexistente/inactiva: ${job.template_slug}`);

      const vars = job.variables || {};
      const subject = renderVars((tpl as EmailTemplate).asunto, vars, false);
      const html = (tpl as EmailTemplate).body_html
        ? renderVars((tpl as EmailTemplate).body_html!, vars, false)
        : buildHtml(tpl as EmailTemplate, vars);
      const text = buildText(tpl as EmailTemplate, vars);
      const replyTo = (tpl as EmailTemplate).reply_to || config.email_from;

      const mime = buildMime({
        fromName: config.email_from_name || "AdorAPP", fromEmail: config.email_from,
        to: job.to_email, toName: job.to_nombre, replyTo,
        subject, html, text,
      });

      const accessToken = await getAccessToken(config.gmail_client_id, config.gmail_client_secret, config.gmail_refresh_token);
      const providerMsgId = await gmailSend(accessToken, mime);

      // 6) Post-envío: marcar enviado + log + throttle.
      await admin.from("email_queue").update({
        status: "sent", enviado_at: new Date().toISOString(), intento: job.intento + 1, ultimo_error: null,
      }).eq("id", job.id);
      await admin.from("sent_emails").insert({
        to_email: job.to_email, from_email: config.email_from, reply_to: replyTo,
        asunto: subject, template_slug: job.template_slug, estado: "sent", provider_msg_id: providerMsgId,
      });
      await admin.from("email_throttle").update({ last_sent_at: new Date().toISOString() }).eq("key", "global");

      return json({ ok: true, sent: 1, id: job.id, provider_msg_id: providerMsgId });
    } catch (sendErr) {
      // 7) Fallo: backoff exponencial o 'failed' al agotar (handoff §5.7).
      const intento = job.intento + 1;
      const msg = String((sendErr as Error)?.message ?? sendErr).slice(0, 2000);
      if (intento < job.max_intentos) {
        const backoffMin = Math.min(Math.pow(2, intento), 60);
        await admin.from("email_queue").update({
          status: "pending", intento, ultimo_error: msg,
          programado_para: new Date(Date.now() + backoffMin * 60_000).toISOString(),
        }).eq("id", job.id);
        return json({ ok: false, retry_in_min: backoffMin, error: msg }, 200);
      } else {
        await admin.from("email_queue").update({
          status: "failed", enviado_at: new Date().toISOString(), intento, ultimo_error: msg,
        }).eq("id", job.id);
        return json({ ok: false, failed: true, error: msg }, 200);
      }
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
