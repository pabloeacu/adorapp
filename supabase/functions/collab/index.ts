import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...corsHeaders } });
}

// Debe coincidir con INSTRUMENTS del store (src/stores/appStore.js).
const INSTRUMENTS = new Set([
  "Voz", "Guitarra Eléctrica", "Guitarra Acústica", "Piano", "Teclado",
  "Batería", "Bajo", "Violín", "Flauta", "Saxofón", "Trompeta", "Coros",
]);

// Identidad + rol del que llama, SIEMPRE desde el JWT/DB (nunca del body).
async function resolveCaller(req: Request) {
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
    .from("members").select("id, role, active, user_id, name, email").eq("user_id", user.id).maybeSingle();
  if (cErr) return { error: json({ error: "Auth lookup failed", detail: cErr.message }, 500) };
  if (!caller || caller.active === false) return { error: json({ error: "Forbidden" }, 403) };
  return { admin, caller };
}

function fmtFecha(dateStr: string): string {
  try {
    const d = new Date(String(dateStr).slice(0, 10) + "T12:00:00Z");
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" });
  } catch { return String(dateStr); }
}
const joinCats = (cats: string[]) => (cats || []).join(", ");
const firstName = (n: string) => String(n || "").trim().split(/\s+/)[0] || "";

// Push + campanita: una fila en notifications (el trigger empuja al device del user).
async function pushNotify(admin: any, rows: Array<{ user_id: string | null; title: string; message: string }>) {
  const valid = rows.filter((r) => r.user_id).map((r) => ({
    user_id: r.user_id, title: r.title, message: r.message, type: "collaboration", is_global: false,
  }));
  if (!valid.length) return;
  try { await admin.from("notifications").insert(valid); } catch (_) { /* best-effort */ }
}
async function mail(admin: any, slug: string, email: string | null, name: string | null, vars: Record<string, string>) {
  if (!email) return;
  try {
    await admin.rpc("encolar_email", {
      p_slug: slug, p_to_email: email, p_to_nombre: name || null, p_variables: vars, p_prioridad: 5,
    });
  } catch (_) { /* best-effort: el correo no bloquea el flujo */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await resolveCaller(req);
  if ("error" in auth) return auth.error;
  const { admin, caller } = auth;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = body?.action;
  const isPastorOrLeader = (caller.role === "pastor" || caller.role === "leader");

  // ---------------- CREAR ----------------
  if (action === "create") {
    if (!isPastorOrLeader) return json({ error: "Forbidden" }, 403);
    const { bandId, orderId } = body;
    let categories = Array.isArray(body?.categories) ? body.categories.map(String) : [];
    categories = Array.from(new Set(categories)).filter((c) => INSTRUMENTS.has(c));
    if (!bandId || typeof bandId !== "string") return json({ error: "bandId requerido" }, 400);
    if (!orderId || typeof orderId !== "string") return json({ error: "orderId requerido" }, 400);
    if (!categories.length) return json({ error: "Elegí al menos una categoría válida." }, 400);

    const { data: band } = await admin.from("bands").select("id, name").eq("id", bandId).maybeSingle();
    if (!band) return json({ error: "La banda no existe." }, 404);
    const { data: order } = await admin.from("orders").select("id, date, status, band_id").eq("id", orderId).maybeSingle();
    if (!order) return json({ error: "El orden no existe." }, 404);
    if (order.status !== "scheduled") return json({ error: "El orden ya no está activo." }, 400);
    // La banda debe ser la del orden: los recordatorios de ensamble/práctica se
    // resuelven por order.band_id, así que el temporal tiene que caer en esa banda.
    if (!order.band_id) return json({ error: "Ese orden no tiene banda asignada. Asignale una banda en Órdenes primero." }, 400);
    if (order.band_id !== bandId) return json({ error: "La banda no coincide con la del orden elegido." }, 400);

    const { data: res, error: rErr } = await admin.rpc("collab_create", {
      p_band_id: bandId, p_order_id: orderId, p_categories: categories, p_requested_by: caller.id,
    });
    if (rErr) return json({ error: rErr.message }, 400);

    const invited: any[] = res?.invited || [];
    const fecha = fmtFecha(order.date);
    const cats = joinCats(categories);
    await pushNotify(admin, invited.map((m) => ({
      user_id: m.user_id,
      title: "Se busca colaboración",
      message: `Se necesita ${cats} para ${band.name} el ${fecha}. ¿Te ofrecés?`,
    })));
    for (const m of invited) {
      await mail(admin, "colaboracion-solicitud", m.email, m.name, {
        nombre: firstName(m.name), banda: band.name, categorias: cats, fecha,
      });
    }
    return json({ ok: true, requestId: res?.request_id, invitedCount: invited.length });
  }

  // ---------------- OFRECERSE ----------------
  if (action === "offer") {
    const { requestId } = body;
    if (!requestId || typeof requestId !== "string") return json({ error: "requestId requerido" }, 400);
    const { data: res, error: rErr } = await admin.rpc("collab_offer", {
      p_request_id: requestId, p_member_id: caller.id,
    });
    if (rErr) return json({ error: rErr.message }, 400);

    if (!res?.already_offered && res?.requester) {
      const { data: band } = await admin.from("bands").select("name").eq("id", res.band_id).maybeSingle();
      const cats = joinCats(res.categories || []);
      const bandName = band?.name || "la banda";
      await pushNotify(admin, [{
        user_id: res.requester.user_id,
        title: "Nuevo voluntario",
        message: `${res.volunteer_name} se ofreció para tu solicitud de ${cats} en ${bandName}.`,
      }]);
      await mail(admin, "colaboracion-voluntario", res.requester.email, res.requester.name, {
        nombre: firstName(res.requester.name), voluntario: res.volunteer_name, categorias: cats, banda: bandName,
      });
    }
    return json({ ok: true, alreadyOffered: !!res?.already_offered });
  }

  // ---------------- CUBRIR ----------------
  if (action === "cover") {
    if (!isPastorOrLeader) return json({ error: "Forbidden" }, 403);
    const { requestId, memberId } = body;
    const days = Number(body?.days);
    if (!requestId || typeof requestId !== "string") return json({ error: "requestId requerido" }, 400);
    if (!memberId || typeof memberId !== "string") return json({ error: "memberId requerido" }, 400);
    if (!Number.isInteger(days) || days < 1 || days > 90) return json({ error: "Los días deben ser entre 1 y 90." }, 400);

    const { data: res, error: rErr } = await admin.rpc("collab_cover", {
      p_request_id: requestId, p_member_id: memberId, p_days: days, p_actor: caller.id,
    });
    if (rErr) return json({ error: rErr.message }, 400);

    const { data: band } = await admin.from("bands").select("name").eq("id", res.band_id).maybeSingle();
    const { data: order } = await admin.from("orders").select("date").eq("id", res.order_id).maybeSingle();
    const bandName = band?.name || "la banda";
    const fecha = order?.date ? fmtFecha(order.date) : "";
    const declined: any[] = res?.declined || [];

    await pushNotify(admin, [
      { user_id: res.accepted?.user_id, title: "¡Gracias por colaborar!", message: `Ya sos parte de ${bandName} para el servicio del ${fecha}. Tenés acceso a todo.` },
      ...declined.map((m) => ({ user_id: m.user_id, title: "Colaboración cubierta", message: `¡Gracias por ofrecerte para ${bandName}! La vacante ya se cubrió.` })),
    ]);
    await mail(admin, "colaboracion-aceptado", res.accepted?.email, res.accepted?.name, {
      nombre: firstName(res.accepted?.name), banda: bandName, fecha,
    });
    for (const m of declined) {
      await mail(admin, "colaboracion-cubierto", m.email, m.name, { nombre: firstName(m.name), banda: bandName });
    }
    return json({ ok: true, declinedCount: declined.length });
  }

  // ---------------- CANCELAR ----------------
  if (action === "cancel") {
    if (!isPastorOrLeader) return json({ error: "Forbidden" }, 403);
    const { requestId } = body;
    if (!requestId || typeof requestId !== "string") return json({ error: "requestId requerido" }, 400);
    const { error: rErr } = await admin.rpc("collab_cancel", { p_request_id: requestId, p_actor: caller.id });
    if (rErr) return json({ error: rErr.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Acción inválida" }, 400);
});
