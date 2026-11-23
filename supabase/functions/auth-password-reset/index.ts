// auth-password-reset — recuperación de contraseña en AUTOSERVICIO.
//
// Abierta a anon (verify_jwt:false): quien la usa es justamente alguien que NO puede
// iniciar sesión. Dos acciones:
//
//   POST { action: "request",  email }
//     → compuerta anti-abuso + lookup de ficha elegible (RPC `password_reset_gate`,
//       service_role-only) → `auth.admin.generateLink({type:'recovery'})` (token hasheado,
//       un solo uso, vence por otp_expiry de Supabase Auth) → correo `recuperar-contrasena`
//       por NUESTRO pipeline (encolar_email, prioridad 0 = carril exprés) + latido inmediato
//       del worker. Responde SIEMPRE { ok:true } con tiempo de respuesta parejo: nunca
//       revela si el correo existe (anti-enumeración por contenido y por cronómetro).
//
//   POST { action: "complete", token_hash, password }
//     → `verifyOtp({ token_hash, type:'recovery' })` (consume el token) → ficha ACTIVA →
//       `updateUser({ password })` con la sesión recién creada → cierra las OTRAS sesiones
//       → correo `contrasena-actualizada` (fecha/hora ART + dispositivo) → devuelve la
//       sesión para que el cliente quede adentro de la app.
//
// Reglas (CLAUDE.md · landmine de este flujo):
//   * El token NUNCA se loguea ni se guarda en nuestras tablas (solo viaja en el enlace).
//   * Todo dato de usuario que entra a un correo se escapa acá (cuerpo_html es RAW, #70).
//   * El freno firme es la RPC (advisory lock por correo); el de memoria es best-effort.
//   * La política de contraseña (8–72, letra + número) vive en PASSWORD_RULES y se
//     espeja en src/lib/passwordPolicy.js.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
// Dominio público de la app (el enlace del correo apunta acá). Fijo a prod salvo override.
const APP_URL = (Deno.env.get("APP_PUBLIC_URL") || "https://adorapp.net.ar").replace(/\/+$/, "");
const LINK_MINUTES = 60;                 // informativo (la vigencia real es otp_expiry de Auth, 1 h)
const MIN_REQUEST_RESPONSE_MS = 900;     // respuesta pareja para `request` (anti-enumeración por tiempo)
const MAX_BODY_BYTES = 8_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,255}$/; // token_hash de GoTrue (hex / base64url)
const PASSWORD_RULES = { min: 8, max: 72 };

// Freno best-effort en memoria del isolate (el firme es la RPC en la base).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_IP = 20;
const RATE_MAX_GLOBAL = 200;
const hits = new Map<string, number[]>();
let globalHits: number[] = [];
function rateLimited(ip: string): boolean {
  const now = Date.now();
  globalHits = globalHits.filter((t) => now - t < RATE_WINDOW_MS);
  if (globalHits.length >= RATE_MAX_GLOBAL) return true;
  const mine = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (mine.length >= RATE_MAX_PER_IP) return true;
  mine.push(now); hits.set(ip, mine); globalHits.push(now);
  if (hits.size > 5000) hits.clear();
  return false;
}
function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...corsHeaders },
  });
}

const escapeHtml = (s: unknown): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const normalizeEmail = (s: unknown): string => String(s ?? "").trim().toLowerCase().slice(0, 254);
const isEmail = (s: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const firstName = (name: unknown): string => {
  const n = String(name ?? "").trim().split(/\s+/)[0];
  return n || "";
};

// Política de contraseña (espejo de src/lib/passwordPolicy.js). Devuelve código o null.
function passwordProblem(pw: string): string | null {
  if (typeof pw !== "string" || pw.length < PASSWORD_RULES.min) return "corta";
  if (pw.length > PASSWORD_RULES.max) return "larga";
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(pw)) return "sin_letra";
  if (!/\d/.test(pw)) return "sin_numero";
  if (/^\s+$/.test(pw)) return "corta";
  return null;
}

// Descripción amable del dispositivo para el correo de confirmación (sin datos sensibles).
function describeDevice(ua: string): string {
  const u = ua || "";
  let os = "";
  if (/iPhone|iPad|iPod/i.test(u)) os = "iPhone";
  else if (/Android/i.test(u)) os = "Android";
  else if (/Windows/i.test(u)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(u)) os = "Mac";
  else if (/Linux/i.test(u)) os = "Linux";
  let browser = "";
  if (/Edg\//i.test(u)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(u)) browser = "Opera";
  else if (/Chrome\//i.test(u) && !/Chromium/i.test(u)) browser = "Chrome";
  else if (/Firefox\//i.test(u)) browser = "Firefox";
  else if (/Safari\//i.test(u)) browser = "Safari";
  const parts = [os, browser].filter(Boolean);
  return parts.length ? parts.join(" · ") : "";
}

// Fecha/hora en Argentina (UTC-3, sin DST) para el correo de confirmación.
function nowART(): { fecha: string; hora: string } {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return { fecha: `${dd}/${mm}/${yyyy}`, hora: `${hh}:${mi}` };
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function markRequest(id: unknown, patch: Record<string, unknown>) {
  if (id === null || id === undefined) return;
  try {
    await admin.from("password_reset_requests").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  } catch (_) { /* best-effort: la auditoría nunca rompe el flujo */ }
}

async function logWarning(message: string, context: Record<string, unknown>) {
  try {
    await admin.from("error_log").insert({ message, severity: "warning", context: { kind: "password-reset", ...context } });
  } catch (_) { /* best-effort */ }
}

// Encola por el pipeline propio (carril exprés) y despierta al worker para que salga
// en segundos, no en el próximo latido del cron (hasta 60 s).
async function enqueueExpress(slug: string, toEmail: string, toName: string | null, vars: Record<string, unknown>) {
  const { error } = await admin.rpc("encolar_email", {
    p_slug: slug, p_to_email: toEmail, p_to_nombre: toName, p_variables: vars, p_prioridad: 0,
  });
  if (error) throw new Error(`encolar_email(${slug}): ${error.message}`);
  try { await admin.rpc("trigger_send_emails"); } catch (_) { /* el cron lo toma en ≤60 s */ }
}

const padTo = async (startedAt: number, minMs: number) => {
  const left = minMs - (Date.now() - startedAt);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
};

// --- action: request ---------------------------------------------------------------
async function handleRequest(body: any, req: Request): Promise<Response> {
  const startedAt = Date.now();
  const email = normalizeEmail(body?.email);
  if (!isEmail(email)) return json({ ok: false, code: "email_invalido" }, 400);
  const ip = clientIp(req);
  const ua = (req.headers.get("user-agent") || "").slice(0, 300);

  // Respuesta genérica, SIEMPRE igual (contenido y tiempo), pase lo que pase adentro.
  const generic = async () => { await padTo(startedAt, MIN_REQUEST_RESPONSE_MS); return json({ ok: true }); };

  let gateId: unknown = null;
  let member: { id: string; name: string; user_id: string; auth_email: string } | null = null;
  try {
    const { data: gate, error } = await admin.rpc("password_reset_gate", { p_email: email, p_ip: ip, p_user_agent: ua });
    if (error) throw error;
    gateId = gate?.id ?? null;
    if (!gate?.ok) return await generic();         // limitado → silencio (ya quedó auditado)
    member = gate?.member ?? null;
  } catch (e) {
    await logWarning("auth-password-reset: fallo en password_reset_gate", { error: String((e as Error)?.message ?? e).slice(0, 300) });
    return await generic();                          // ante un hipo de la base, no revelar nada
  }
  if (!member?.user_id || !member?.auth_email) return await generic(); // sin ficha elegible → skipped

  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: member.auth_email });
    if (error) throw error;
    const token = data?.properties?.hashed_token;
    if (!token || !TOKEN_RE.test(token)) throw new Error("generateLink sin hashed_token válido");
    const enlace = `${APP_URL}/restablecer?th=${encodeURIComponent(token)}`;
    await enqueueExpress("recuperar-contrasena", member.auth_email, member.name, {
      nombre: escapeHtml(firstName(member.name)),
      minutos: String(LINK_MINUTES),
      enlace,
    });
    await markRequest(gateId, { stage: "sent" });
  } catch (e) {
    await markRequest(gateId, { stage: "failed", reason: String((e as Error)?.message ?? e).slice(0, 200) });
    await logWarning("auth-password-reset: no se pudo generar/enviar el enlace", { error: String((e as Error)?.message ?? e).slice(0, 300) });
  }
  return await generic();
}

// --- action: complete --------------------------------------------------------------
async function handleComplete(body: any, req: Request): Promise<Response> {
  const token = String(body?.token_hash ?? "");
  const password = typeof body?.password === "string" ? body.password : "";
  if (!TOKEN_RE.test(token)) return json({ ok: false, code: "enlace_invalido" }, 400);
  const pwProblem = passwordProblem(password);
  if (pwProblem) return json({ ok: false, code: "contrasena_debil", detail: pwProblem }, 400);

  // Cliente anónimo propio de este pedido: verifyOtp le deja la sesión en memoria.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: v, error: vErr } = await userClient.auth.verifyOtp({ token_hash: token, type: "recovery" });
  if (vErr || !v?.session || !v?.user) {
    return json({ ok: false, code: "enlace_invalido" }, 400); // vencido, ya usado o inválido
  }
  const user = v.user;
  const session = v.session;

  // La ficha tiene que seguir ACTIVA (una cuenta desactivada no recupera nada).
  const { data: m } = await admin.from("members").select("id, name, active").eq("user_id", user.id).maybeSingle();
  if (!m || m.active === false) {
    try { await userClient.auth.signOut(); } catch (_) { /* best-effort */ }
    return json({ ok: false, code: "cuenta_desactivada" }, 403);
  }

  // Nueva contraseña con la sesión recién creada (misma vía que el perfil).
  const { error: uErr } = await userClient.auth.updateUser({ password });
  if (uErr) {
    const msg = (uErr.message || "").toLowerCase();
    const code = (uErr as any)?.code === "same_password" || msg.includes("different from the old")
      ? "misma_contrasena"
      : (uErr as any)?.code === "weak_password" || msg.includes("password")
        ? "contrasena_debil"
        : "error";
    return json({ ok: false, code, detail: (uErr.message || "").slice(0, 200) }, 400);
  }

  // Cierra las OTRAS sesiones de la cuenta (la de este pedido sigue viva para entrar).
  try { await userClient.auth.signOut({ scope: "others" }); } catch (_) { /* best-effort */ }

  // Confirmación de seguridad por correo (carril exprés).
  const ua = (req.headers.get("user-agent") || "").slice(0, 300);
  const { fecha, hora } = nowART();
  const device = describeDevice(ua);
  try {
    await enqueueExpress("contrasena-actualizada", user.email!, m.name, {
      nombre: escapeHtml(firstName(m.name)),
      fecha, hora,
      dispositivo: device ? ` desde ${escapeHtml(device)}` : "",
    });
  } catch (e) {
    await logWarning("auth-password-reset: no se pudo encolar la confirmación", { error: String((e as Error)?.message ?? e).slice(0, 300) });
  }

  // Auditoría: el último pedido enviado de esta cuenta pasa a 'completed'.
  try {
    const { data: last } = await admin.from("password_reset_requests")
      .select("id").eq("user_id", user.id).eq("stage", "sent")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last?.id) await markRequest(last.id, { stage: "completed" });
  } catch (_) { /* best-effort */ }

  return json({
    ok: true,
    email: user.email,
    session: { access_token: session.access_token, refresh_token: session.refresh_token },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (rateLimited(clientIp(req))) {
    return new Response(JSON.stringify({ ok: false, code: "rate_limited" }), {
      status: 429, headers: { "content-type": "application/json", "retry-after": "60", ...corsHeaders },
    });
  }

  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ ok: false, code: "payload" }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, code: "json" }, 400);
  }

  try {
    switch (body?.action) {
      case "request": return await handleRequest(body, req);
      case "complete": return await handleComplete(body, req);
      default: return json({ ok: false, code: "accion" }, 400);
    }
  } catch (e) {
    await logWarning("auth-password-reset: error inesperado", { action: String(body?.action ?? ""), error: String((e as Error)?.message ?? e).slice(0, 300) });
    return json({ ok: false, code: "error" }, 500);
  }
});
