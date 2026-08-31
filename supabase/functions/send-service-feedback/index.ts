import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// send-service-feedback — envía la devolución post-servicio ("¿Cómo estuvimos?")
// por correo a la banda que tocó, con COPIA a los pastores. Chunk 3.
//
// Quién puede enviar: un PASTOR (cualquier banda) o el LÍDER integrante de la banda
// del orden. La identidad del remitente se toma del JWT server-side (NUNCA del
// cliente) → la firma del correo no se puede falsificar.
//
// Seguridad:
//  * Valida rol + pertenencia a la banda con service_role (el rol NO se confía al
//    cliente).
//  * El feedback es texto plano (textareas) → escape ESTRICTO de HTML (ninguna tag
//    permitida) + saltos → <br>. No usa formato rico.
//  * Encola por `encolar_email` (SECURITY DEFINER, valida plantilla + email). Nunca
//    escribe email_queue directo. El worker `send-emails` ya throttlea por
//    destinatario (5 min) y global.
//  * Anti doble-envío: inserta el registro `service_feedback` (unique order_id+autor)
//    ANTES de encolar; si ya existe → 409 sin mandar nada.

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

// Texto plano → HTML seguro para el cuerpo del correo (que la plantilla renderiza
// RAW): escapa TODO (ninguna tag sobrevive) y convierte saltos reales en <br>.
function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function toSafeHtml(s: string): string {
  return escapeHtml(s).replace(/\r\n|\r|\n/g, "<br>");
}

const MAXLEN = 2000; // por sección; generoso para una devolución, frena abuso
const ROLE_LABEL: Record<string, string> = { pastor: "Pastor", leader: "Líder" };

// 'YYYY-MM-DD' → "sábado, 30 de agosto" en horario de Argentina, sin off-by-one
// (se ancla a mediodía UTC para que el día no se corra al cambiar de zona).
function fechaLegible(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T12:00:00Z`);
    return d.toLocaleDateString("es-ES", {
      weekday: "long", day: "numeric", month: "long",
      timeZone: "America/Argentina/Buenos_Aires",
    });
  } catch {
    return dateStr;
  }
}

// Fecha de hoy en ART (YYYY-MM-DD) para el guard "el servicio ya ocurrió".
function todayART(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return json({ error: "Invalid token" }, 401);

  const admin = createClient(url, serviceKey);

  // Autor (remitente) — identidad y rol tomados del server, no del cliente.
  const { data: caller, error: cErr } = await admin
    .from("members")
    .select("id, role, active, name, user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (cErr) return json({ error: "Auth lookup failed", detail: cErr.message }, 500);
  if (!caller || caller.active === false) return json({ error: "Forbidden" }, 403);
  if (caller.role !== "pastor" && caller.role !== "leader") return json({ error: "Forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const orderId = String(body?.orderId || "");
  if (!orderId) return json({ error: "orderId required" }, 400);

  const rawFunciono = typeof body?.queFunciono === "string" ? body.queFunciono : "";
  const rawAjustamos = typeof body?.queAjustamos === "string" ? body.queAjustamos : "";
  const rawReflexion = typeof body?.reflexion === "string" ? body.reflexion : "";
  if (rawFunciono.length > MAXLEN || rawAjustamos.length > MAXLEN || rawReflexion.length > MAXLEN) {
    return json({ error: "el texto es demasiado largo" }, 400);
  }
  const funcionoT = rawFunciono.trim();
  const ajustamosT = rawAjustamos.trim();
  const reflexionT = rawReflexion.trim();
  if (!funcionoT && !ajustamosT && !reflexionT) {
    return json({ error: "escribí al menos una sección" }, 400);
  }

  // Orden + banda (con service_role; RLS no aplica).
  const { data: order, error: oErr } = await admin
    .from("orders")
    .select("id, band_id, date, time, status")
    .eq("id", orderId)
    .maybeSingle();
  if (oErr) return json({ error: "order lookup failed", detail: oErr.message }, 500);
  if (!order) return json({ error: "orden inexistente" }, 404);
  if (!order.band_id) return json({ error: "el orden no tiene banda asignada" }, 400);

  const { data: band, error: bErr } = await admin
    .from("bands")
    .select("id, name, members")
    .eq("id", order.band_id)
    .maybeSingle();
  if (bErr) return json({ error: "band lookup failed", detail: bErr.message }, 500);
  if (!band) return json({ error: "la banda del orden ya no existe" }, 400);

  const bandMemberIds: string[] = Array.isArray(band.members) ? band.members.map(String) : [];
  const isPastor = caller.role === "pastor";
  const isLeaderOfBand = caller.role === "leader" && bandMemberIds.includes(String(caller.id));
  if (!isPastor && !isLeaderOfBand) return json({ error: "Forbidden" }, 403);

  // Defensa en profundidad: el servicio ya ocurrió (el cliente además exige +4h).
  if (String(order.date) > todayART()) return json({ error: "el servicio todavía no ocurrió" }, 400);

  // Anti doble-envío: insertar el registro PRIMERO (unique order_id+autor). Si ya
  // existe, cortar con 409 antes de encolar ningún correo.
  const { data: fbRow, error: insErr } = await admin
    .from("service_feedback")
    .insert({
      order_id: order.id,
      author_id: caller.user_id,
      author_name: caller.name || "—",
      author_role: caller.role,
      que_funciono: funcionoT || null,
      que_ajustamos: ajustamosT || null,
      reflexion: reflexionT || null,
      recipient_count: 0,
    })
    .select("id")
    .single();
  if (insErr) {
    // 23505 = unique_violation → ya envió feedback para este orden.
    if ((insErr as any).code === "23505") return json({ error: "ya_enviado" }, 409);
    return json({ error: "no se pudo registrar el feedback", detail: insErr.message }, 500);
  }

  // Destinatarios: integrantes ACTIVOS de la banda con email ∪ TODOS los pastores
  // activos con email (copia). Dedup por email en minúsculas.
  const { data: bandMembers } = await admin
    .from("members")
    .select("name, email")
    .in("id", bandMemberIds.length ? bandMemberIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("active", true);
  const { data: pastors } = await admin
    .from("members")
    .select("name, email")
    .eq("role", "pastor")
    .eq("active", true);

  const byEmail = new Map<string, { name: string; email: string }>();
  for (const m of [...(bandMembers || []), ...(pastors || [])]) {
    const email = (m.email || "").trim().toLowerCase();
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, { name: m.name || "", email });
  }
  const recipients = [...byEmail.values()];

  // Variables del correo:
  //  * cuerpo_html se renderiza RAW → textos YA escapados (nombre, fecha, secciones).
  //  * firma se renderiza ESCAPADA por el worker → remitente_* van en CRUDO.
  const fecha = fechaLegible(String(order.date));
  const roleLabel = ROLE_LABEL[caller.role] || caller.role;
  const DASH = "—";
  const sectionVars = {
    fecha: escapeHtml(fecha),
    que_funciono: funcionoT ? toSafeHtml(funcionoT) : DASH,
    que_ajustamos: ajustamosT ? toSafeHtml(ajustamosT) : DASH,
    reflexion: reflexionT ? toSafeHtml(reflexionT) : DASH,
    remitente_nombre: caller.name || DASH, // firma → el worker lo escapa
    remitente_rol: roleLabel,
  };

  let queued = 0;
  for (const r of recipients) {
    const firstName = (r.name || "").split(/\s+/)[0] || "";
    try {
      await admin.rpc("encolar_email", {
        p_slug: "feedback-post-servicio",
        p_to_email: r.email,
        p_to_nombre: r.name,
        p_variables: { ...sectionVars, nombre: escapeHtml(firstName) },
        p_prioridad: 5,
      });
      queued++;
    } catch (_) {
      // best-effort: el fallo de un correo no aborta el resto.
    }
  }

  await admin.from("service_feedback").update({ recipient_count: queued }).eq("id", fbRow.id);

  return json({ ok: true, recipient_count: queued });
});
