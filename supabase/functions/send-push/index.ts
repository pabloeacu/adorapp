// send-push — Web Push fan-out with encrypted payload (RFC 8291 aes128gcm).
//
// Accepts a list of member_ids (or "all" for every subscribed member) and a
// title/body/url payload. The payload is encrypted per-subscription using
// the subscription's p256dh + auth keys, signed with VAPID, and POSTed to the
// push service. The service worker reads the JSON payload and shows a native
// notification with the custom text.
//
// Auth: dual mode. Either
//   - Authorization: Bearer <push_internal_secret>   (server-to-server: DB triggers, other EFs)
//   - Authorization: Bearer <user_jwt>               (a pastor/leader user)
// The shared secret lets the DB trigger fire pushes without minting a user JWT.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ---------------- base64url helpers ----------------
function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

// ---------------- VAPID JWT (ES256) ----------------
async function importVapidPrivate(d: string, x: string, y: string) {
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', d, x, y, ext: true };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}
function publicKeyToXY(rawB64Url: string): { x: string; y: string } {
  const raw = b64urlToBytes(rawB64Url);
  if (raw.length !== 65 || raw[0] !== 0x04) throw new Error('Bad VAPID public key');
  return { x: bytesToB64url(raw.slice(1, 33)), y: bytesToB64url(raw.slice(33, 65)) };
}
async function vapidJWT(privateD: string, pub: string, audience: string, subject: string) {
  const { x, y } = publicKeyToXY(pub);
  const key = await importVapidPrivate(privateD, x, y);
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject };
  const enc = new TextEncoder();
  const h = bytesToB64url(enc.encode(JSON.stringify(header)));
  const p = bytesToB64url(enc.encode(JSON.stringify(payload)));
  const data = enc.encode(`${h}.${p}`);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data));
  return `${h}.${p}.${bytesToB64url(sig)}`;
}

// ---------------- HKDF helpers ----------------
async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  // HMAC(salt, ikm) — single block since outputs <= 32 bytes everywhere we use it.
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm));
}
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  // For the lengths we need (16, 12, 32) one HMAC block (32 bytes) is enough.
  if (length > 32) throw new Error('hkdfExpand only single-block');
  const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const t1 = new Uint8Array(await crypto.subtle.sign('HMAC', key, concat(info, new Uint8Array([0x01]))));
  return t1.slice(0, length);
}

// ---------------- raw EC point <-> CryptoKey (P-256) ----------------
function rawPubToJwk(raw: Uint8Array): JsonWebKey {
  if (raw.length !== 65 || raw[0] !== 0x04) throw new Error('Bad EC public key');
  return { kty: 'EC', crv: 'P-256', x: bytesToB64url(raw.slice(1, 33)), y: bytesToB64url(raw.slice(33, 65)), ext: true };
}
async function importEcPub(raw: Uint8Array) {
  return crypto.subtle.importKey('jwk', rawPubToJwk(raw), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}
async function exportEcPubRaw(key: CryptoKey): Promise<Uint8Array> {
  const jwk = await crypto.subtle.exportKey('jwk', key);
  if (!jwk.x || !jwk.y) throw new Error('exportEcPubRaw: missing coords');
  return concat(new Uint8Array([0x04]), b64urlToBytes(jwk.x), b64urlToBytes(jwk.y));
}

// ---------------- aes128gcm payload encryption (RFC 8291) ----------------
async function encryptPayload(
  plaintext: Uint8Array,
  uaPubRaw: Uint8Array,   // subscription.p256dh, 65 bytes
  authSecret: Uint8Array, // subscription.auth, 16 bytes
): Promise<Uint8Array> {
  // 1. Ephemeral ECDH keypair
  const eph = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  ) as CryptoKeyPair;
  const asPubRaw = await exportEcPubRaw(eph.publicKey);

  // 2. Shared ECDH secret (32 bytes)
  const uaPub = await importEcPub(uaPubRaw);
  const ikmEcdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPub }, eph.privateKey, 256));

  // 3. PRK_key = HKDF(authSecret, ikmEcdh)
  const prkKey = await hkdfExtract(authSecret, ikmEcdh);

  // 4. key_info = "WebPush: info\0" || ua_public || as_public ; IKM = HKDF-Expand(PRK_key, key_info, 32)
  const enc = new TextEncoder();
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPubRaw, asPubRaw);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  // 5. salt random 16 bytes ; PRK = HKDF(salt, IKM)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdfExtract(salt, ikm);

  // 6. CEK = HKDF-Expand(PRK, "Content-Encoding: aes128gcm\0", 16)
  const cek = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);

  // 7. NONCE = HKDF-Expand(PRK, "Content-Encoding: nonce\0", 12)
  const nonce = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\0'), 12);

  // 8. AES-128-GCM(CEK, NONCE, plaintext || 0x02)  — 0x02 = last record padding delimiter
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const padded = concat(plaintext, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  // 9. Body framing: salt(16) || rs(4 BE = 4096) || idlen(1 = 65) || keyid(65 = as_public) || ciphertext
  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096
  const idlen = new Uint8Array([0x41]); // 65
  return concat(salt, rs, idlen, asPubRaw, ciphertext);
}

// ---------------- send one push ----------------
async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string },
  vapidPub: string,
  vapidPriv: string,
  vapidSub: string,
  payload: { title: string; body: string; url: string },
): Promise<{ ok: boolean; status: number }> {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await vapidJWT(vapidPriv, vapidPub, audience, vapidSub);
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(payload));
  const body = await encryptPayload(plaintext, b64urlToBytes(sub.p256dh), b64urlToBytes(sub.auth));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${vapidPub}`,
      TTL: '86400',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.length),
    },
    body,
  });
  return { ok: res.ok, status: res.status };
}

// ---------------- handler ----------------
function jres(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const auth = req.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token) return jres({ error: 'no_auth' }, 401);

    // ---- Read push config (VAPID + internal secret) via SECURITY DEFINER RPC ----
    // We don't query private.app_secrets directly because the `private` schema is
    // not exposed via PostgREST. The RPC encapsulates that access.
    const { data: cfgRaw, error: cfgErr } = await sb.rpc('get_push_config');
    if (cfgErr) return jres({ error: 'config_read_failed', detail: cfgErr.message }, 500);
    const cfg = (cfgRaw || {}) as Record<string, string>;
    const internalSecret = cfg.push_internal_secret;
    const isInternal = internalSecret && token === internalSecret;

    // ---- Auth path B: pastor/leader JWT ----
    if (!isInternal) {
      const { data: userRes, error: uErr } = await sb.auth.getUser(token);
      if (uErr || !userRes?.user) return jres({ error: 'invalid_jwt' }, 401);
      const { data: caller } = await sb.from('members').select('id, role').eq('user_id', userRes.user.id).maybeSingle();
      if (!caller || !['pastor', 'leader'].includes(caller.role)) return jres({ error: 'forbidden' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const memberIds: string[] | 'all' = body.to ?? 'all';
    const title: string = (body.title || 'AdorAPP').toString().slice(0, 200);
    const messageBody: string = (body.body || 'Tenés una novedad').toString().slice(0, 500);
    const url: string = (body.url || '/').toString().slice(0, 500);

    const vapidPub = cfg.vapid_public;
    const vapidPriv = cfg.vapid_private;
    const vapidSub = cfg.vapid_subject || 'mailto:hi@adorapp.net.ar';
    if (!vapidPub || !vapidPriv) return jres({ error: 'no_vapid' }, 500);

    let q = sb.from('push_subscriptions').select('id, endpoint, p256dh, auth, member_id');
    if (Array.isArray(memberIds)) {
      if (memberIds.length === 0) return jres({ sent: 0, results: [] });
      q = q.in('member_id', memberIds);
    }
    const { data: subs, error: sErr } = await q;
    if (sErr) return jres({ error: sErr.message }, 500);

    const results = await Promise.all(
      (subs || []).map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
        try {
          const r = await sendOne(
            { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
            vapidPub, vapidPriv, vapidSub,
            { title, body: messageBody, url },
          );
          // Push services use 404/410 to signal a retired endpoint — prune so we
          // don't keep retrying dead subscribers forever.
          if (r.status === 404 || r.status === 410) {
            await sb.from('push_subscriptions').delete().eq('id', s.id);
          }
          return { id: s.id, status: r.status };
        } catch (e) {
          return { id: s.id, error: String(e) };
        }
      }),
    );

    return jres({ sent: results.length, results });
  } catch (e) {
    return jres({ error: String(e) }, 500);
  }
});
