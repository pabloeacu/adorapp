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

function trim(value: unknown, max = MAX_FIELD_LEN): string | null {
  if (value === null || value === undefined) return null;
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? s.slice(0, max) + "…" : s;
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

  let body: any;
  try { body = await req.json(); } catch {
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
    context: body.context && typeof body.context === "object" ? body.context : {},
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
