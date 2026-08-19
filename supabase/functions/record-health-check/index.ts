// record-health-check: receives an uptime ping result from the GitHub Actions
// workflow and inserts it into health_checks (RLS pastor-only on SELECT;
// service_role bypasses for INSERT). verify_jwt:false because the GitHub
// runner only carries the anon key.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  if (typeof body.endpoint !== "string" || typeof body.ok !== "boolean") {
    return new Response(JSON.stringify({ error: "endpoint:string and ok:boolean required" }), {
      status: 400, headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  const { error } = await admin.from("health_checks").insert({
    endpoint: body.endpoint,
    status_code: typeof body.status_code === "number" ? body.status_code : null,
    response_time_ms: typeof body.response_time_ms === "number" ? body.response_time_ms : null,
    ok: body.ok,
    error_message: typeof body.error_message === "string" ? body.error_message : null,
  });

  // Trim to last 30 days at every insert; cheap on a small table.
  await admin.from("health_checks")
    .delete()
    .lt("checked_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  if (error) {
    return new Response(JSON.stringify({ ok: false, detail: error.message }), {
      status: 500, headers: { "content-type": "application/json", ...corsHeaders },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "content-type": "application/json", ...corsHeaders },
  });
});
