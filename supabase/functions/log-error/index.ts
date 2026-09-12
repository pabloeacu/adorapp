// log-error: any error from the client (uncaught exception, ErrorBoundary,
// explicit log) lands here. Open to anon (verify_jwt:false) because we want
// to capture errors even before login. We extract the user from a Supabase
// JWT if it's present, but missing JWT is not an error.
//
// Body shape:
//   { message: string, stack?: string, url?: string,
//     componentStack?: string, severity?: 'info'|'warning'|'error'|'fatal',
//     context?: object }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_FIELD_LEN = 8000;
const MAX_CONTEXT_LEN = 8000;   // `context` serializado (antes no tenía tope)
const MAX_BODY_BYTES = 64_000;  // cuerpo completo del pedido

function trim(value: unknown, max = MAX_FIELD_LEN): string | null {
  if (value === null || value === undefined) return null;
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// `context` es un objeto libre del cliente: se guarda tal cual solo si entra en el tope;
// si no, se reemplaza por un recorte marcado (nunca se rechaza el reporte por esto).
function boundedContext(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  let serialized: string;
  try { serialized = JSON.stringify(value); } catch { return { truncated: true }; }
  if (serialized.length <= MAX_CONTEXT_LEN) return value as Record<string, unknown>;
  return { truncated: true, preview: serialized.slice(0, MAX_CONTEXT_LEN) + "…" };
}

// Freno básico por origen (memoria del isolate; best-effort — el freno firme es el
// trigger `rate_limit_error_log` en la base, 300/min global). Un teléfono con la app
// rota manda unos pocos reportes por minuto; un bot, cientos.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_IP = 30;
const RATE_MAX_GLOBAL = 300;
const hits = new Map<string, number[]>();
let globalHits: number[] = [];
function rateLimited(ip: string): boolean {
  const now = Date.now();
  globalHits = globalHits.filter((t) => now - t < RATE_WINDOW_MS);
  if (globalHits.length >= RATE_MAX_GLOBAL) return true;
  const mine = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (mine.length >= RATE_MAX_PER_IP) return true;
  mine.push(now); hits.set(ip, mine); globalHits.push(now);
  if (hits.size > 5000) hits.clear(); // higiene de memoria ante un enjambre de IPs
  return false;
}
function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "content-type": "application/json", ...corsHeaders },
  });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, serviceKey);

  if (rateLimited(clientIp(req))) {
    return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
      status: 429, headers: { "content-type": "application/json", "retry-after": "60", ...corsHeaders },
    });
  }

  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413, headers: { "content-type": "application/json", ...corsHeaders },
      });
    }
    body = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  if (!body || typeof body.message !== "string" || body.message.length === 0) {
    return new Response(JSON.stringify({ error: "message required" }), {
      status: 400, headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  // Best-effort user extraction from optional JWT.
  let userId: string | null = null;
  let userEmail: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ") && !authHeader.endsWith(anon)) {
    try {
      const userClient = createClient(url, anon, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        userId = user.id;
        userEmail = user.email ?? null;
      }
    } catch (_) { /* anonymous error — fine */ }
  }

  const severity = (typeof body.severity === "string"
    && ["info", "warning", "error", "fatal"].includes(body.severity))
    ? body.severity
    : "error";

  const { error } = await admin.from("error_log").insert({
    user_id: userId,
    user_email: userEmail,
    url: trim(body.url, 1000),
    user_agent: trim(req.headers.get("user-agent"), 500),
    message: trim(body.message)!,
    stack: trim(body.stack),
    component_stack: trim(body.componentStack),
    severity,
    context: boundedContext(body.context),
  });

  if (error) {
    // Don't echo a 500 — the caller can't do anything about a logging failure.
    // We accept the loss; production monitoring would alert separately.
    return new Response(JSON.stringify({ ok: false }), {
      status: 200, headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "content-type": "application/json", ...corsHeaders },
  });
});
