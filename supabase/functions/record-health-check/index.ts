// record-health-check: receives an uptime ping result from the GitHub Actions
// workflow (.github/workflows/uptime.yml, every 5 min) and inserts it into
// health_checks (RLS pastor-only on SELECT; service_role bypasses for INSERT).
// verify_jwt:false because the GitHub runner only carries the anon key.
//
// Blindaje (auditoría 2026-09-12, D6): (a) el pedido debe traer una clave de ESTE
// proyecto (anon o service_role) en Authorization — el runner manda la anon key, un
// POST cualquiera de internet no; (b) el payload se valida estricto (endpoint de la
// app, códigos y tiempos acotados, mensaje corto); (c) freno de volumen en memoria +
// trigger `rate_limit_health_checks` en la base (30/min). El ping real es 12/hora.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json", ...corsHeaders } });

const ALLOWED_ENDPOINT_PREFIXES = ["https://adorapp.net.ar", "https://www.adorapp.net.ar"];
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
let recent: number[] = [];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // (a) Solo con una clave del proyecto (el runner manda la anon key). OJO: en el
  // runtime de las EFs `SUPABASE_ANON_KEY` puede ser la clave publishable nueva
  // (`sb_publishable_…`) mientras el runner manda la anon key legacy (JWT): por eso,
  // si no coincide con las del entorno, se valida contra el gateway del proyecto:
  // `GET /auth/v1/settings` con `apikey` responde 200 a la anon/publishable de ESTE
  // proyecto y 401 a cualquier otra cosa (verificado: legacy 200, publishable 200,
  // basura 401, JWT forjado con el mismo ref 401). `/rest/v1/` NO sirve: hoy exige
  // service_role para el OpenAPI.
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ error: "Unauthorized" }, 401);
  let keyOk = token === anon || token === serviceKey;
  if (!keyOk && token.length < 2048) {
    try {
      const probe = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: token } });
      keyOk = probe.status === 200;
    } catch { keyOk = false; }
  }
  if (!keyOk) return json({ error: "Unauthorized" }, 401);

  // (c) Freno de volumen (best-effort en memoria; el firme es el trigger en la base).
  const now = Date.now();
  recent = recent.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
      status: 429, headers: { "content-type": "application/json", "retry-after": "60", ...corsHeaders },
    });
  }
  recent.push(now);

  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > 4000) return json({ error: "Payload too large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // (b) Payload estricto.
  if (!body || typeof body.endpoint !== "string" || typeof body.ok !== "boolean") {
    return json({ error: "endpoint:string and ok:boolean required" }, 400);
  }
  const endpoint = body.endpoint.trim();
  if (endpoint.length > 200 || !ALLOWED_ENDPOINT_PREFIXES.some((p) => endpoint === p || endpoint.startsWith(p + "/"))) {
    return json({ error: "endpoint not allowed" }, 400);
  }
  const statusCode = Number.isInteger(body.status_code) && body.status_code >= 100 && body.status_code <= 599
    ? body.status_code : null;
  const responseTimeMs = Number.isFinite(body.response_time_ms) && body.response_time_ms >= 0 && body.response_time_ms <= 600_000
    ? Math.round(body.response_time_ms) : null;
  const errorMessage = typeof body.error_message === "string"
    ? body.error_message.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 500) : null;

  const admin = createClient(url, serviceKey);

  const { error } = await admin.from("health_checks").insert({
    endpoint,
    status_code: statusCode,
    response_time_ms: responseTimeMs,
    ok: body.ok,
    error_message: errorMessage,
  });

  // Trim to last 30 days at every insert; cheap on a small table.
  await admin.from("health_checks")
    .delete()
    .lt("checked_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  if (error) {
    // PT429 = freno de volumen de la base (trigger rate_limit_health_checks).
    if (error.code === "PT429") return json({ ok: false, error: "rate_limited" }, 429);
    return json({ ok: false, detail: error.message }, 500);
  }
  return json({ ok: true });
});
