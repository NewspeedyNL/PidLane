var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var DEFAULTS = {
  AIRTABLE_LOG_BASE: "appdRasY8ZVJCMkPJ",
  AIRTABLE_LOG_TABLE: "tblJiG83blVfRgPwi",
  AIRTABLE_CONFIG_BASE: "appUAuyRxK18T7ImK",
  AIRTABLE_CONFIG_TABLE: "AppConfig",
  AIRTABLE_USERS_TABLE: "Users",
  // gebruikers (Config-base)
  AIRTABLE_CODES_TABLE: "TokenCodes",
  // prepaid activatiecodes voor de tegoedmodule (Config-base)
  AIRTABLE_KLANTEN_TABLE: "Klanten",
  // consumentenaccounts met tokensaldo (Config-base) — nog niet in gebruik
  AIRTABLE_VL_BASE: "apphsUwG4WAeWjEwH",
  AIRTABLE_VL_TABLE: "tblwbyWN1L6AKwgoy",
  AIRTABLE_REF_TABLE: "tblkfxKcjR6gf0Ahe"
  // Referentie-tabel (zelfde Veldlab-base)
};
function cfg(env, key) {
  return env && env[key] || DEFAULTS[key];
}
__name(cfg, "cfg");
function resolveBase(env, primaryKey, fallbackKey) {
  const ok = /* @__PURE__ */ __name((v) => typeof v === "string" && /^app[A-Za-z0-9]{10,}$/.test(v), "ok");
  const cand = [
    env && env[primaryKey],
    fallbackKey && env && env[fallbackKey],
    DEFAULTS[primaryKey]
  ].filter(Boolean);
  for (const c of cand) if (ok(c)) return c;
  return DEFAULTS[primaryKey];
}
__name(resolveBase, "resolveBase");
function resolveAnthropicKey(env) {
  if (!env) return "";
  const names = ["ANTHROPIC_API_KEY", "ANTHROPIC_KEY", "CLAUDE_API_KEY", "CLAUDE_KEY", "Antrop Key", "API_KEY"];
  for (const n of names) {
    const v = env[n];
    if (typeof v === "string" && v.startsWith("sk-ant-")) return v;
  }
  for (const k in env) {
    const v = env[k];
    if (typeof v === "string" && v.startsWith("sk-ant-")) return v;
  }
  return "";
}
__name(resolveAnthropicKey, "resolveAnthropicKey");
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-App-Token, X-Admin-Token, X-Join-Token, Authorization, anthropic-version",
  // Zonder Expose-Headers mag browser-JS eigen headers niet uitlezen, ook niet
  // bij een geslaagd verzoek. X-PidLane-Saldo is het saldo NA afboeking van een
  // AI-call (zie handleMessages).
  "Access-Control-Expose-Headers": "X-PidLane-Saldo",
  "Access-Control-Max-Age": "86400"
};
function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra }
  });
}
__name(json, "json");
var ALLOWED_ORIGINS = [
  "https://app.pidlane.nl",
  "https://newspeedynl.github.io",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost"
];
function isRestrictedPath(pathname) {
  return pathname.startsWith("/admin/") || pathname.startsWith("/session/") || pathname.startsWith("/pair/") || pathname.startsWith("/code/") || pathname.startsWith("/klant/") || pathname.startsWith("/credits/") || pathname === "/api/config";
}
__name(isRestrictedPath, "isRestrictedPath");
function lockOrigin(request, resp) {
  const origin = request.headers.get("Origin") || "";
  const headers = new Headers(resp.headers);
  headers.delete("Access-Control-Allow-Origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}
__name(lockOrigin, "lockOrigin");
var _enc = new TextEncoder();
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64url, "b64url");
async function sha256hex(s) {
  const b = await crypto.subtle.digest("SHA-256", _enc.encode(String(s)));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(sha256hex, "sha256hex");
// LET OP — Cloudflare Workers ondersteunt maximaal 100.000 PBKDF2-iteraties.
// Vraag je meer, dan gooit crypto.subtle een fout ("iteration counts above
// 100000 are not supported") en mislukt élke wachtwoord-hash. Dit is de
// platformgrens, niet iets wat je kunt verhogen.
var PBKDF2_MAX = 1e5;
var PBKDF2_ITERS_DEFAULT = 1e5;
function bytesToHex(b) {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex, "bytesToHex");
function hexToBytes(h) {
  const s = String(h || "");
  const out = new Uint8Array(s.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}
__name(hexToBytes, "hexToBytes");
function pbkdf2Iters(env) {
  const n = Number(env && env.PBKDF2_ITERS);
  const gewenst = Number.isFinite(n) && n >= 5e4 ? Math.floor(n) : PBKDF2_ITERS_DEFAULT;
  // Begrenzen in plaats van weigeren: een te hoge instelling in de omgeving
  // mag nooit betekenen dat niemand meer kan inloggen of registreren.
  return Math.min(gewenst, PBKDF2_MAX);
}
__name(pbkdf2Iters, "pbkdf2Iters");
async function pbkdf2Hex(pass, saltBytes, iters) {
  const key = await crypto.subtle.importKey(
    "raw",
    _enc.encode(String(pass)),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: iters, hash: "SHA-256" },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}
__name(pbkdf2Hex, "pbkdf2Hex");
async function hashPassword(pass, env) {
  const iters = pbkdf2Iters(env);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hex = await pbkdf2Hex(pass, salt, iters);
  return "pbkdf2_sha256$" + iters + "$" + bytesToHex(salt) + "$" + hex;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(pass, stored) {
  const s = String(stored || "").trim();
  if (!s) return { ok: false, legacy: false };
  const p = s.split("$");
  if (p.length === 4 && p[0] === "pbkdf2_sha256") {
    const iters = Number(p[1]);
    // Bij verifiëren de oude bovengrens aanhouden: hashes die elders met meer
    // iteraties zijn gemaakt moeten leesbaar blijven. Alleen bij het máken
    // van een nieuwe hash geldt de Workers-limiet van 100.000.
    if (!Number.isFinite(iters) || iters < 1e3 || iters > 1e6)
      return { ok: false, legacy: false };
    const hex = await pbkdf2Hex(pass, hexToBytes(p[2]), iters);
    return { ok: safeEqual(hex, String(p[3]).toLowerCase()), legacy: false };
  }
  const low = s.toLowerCase();
  if (/^[0-9a-f]{64}$/.test(low))
    return { ok: safeEqual(await sha256hex(pass), low), legacy: true };
  return { ok: false, legacy: false };
}
__name(verifyPassword, "verifyPassword");
async function handleApkDownload(request, env) {
  if (!env.FILES) return json({ error: "no_r2_binding", hint: "FILES-binding ontbreekt" }, 500);
  const obj = await env.FILES.get("apk/pidlane.apk");
  if (!obj || !obj.body) return json({ error: "apk_not_found" }, 404);
  const headers = new Headers(CORS);
  obj.writeHttpMetadata(headers);
  headers.set("Content-Type", "application/vnd.android.package-archive");
  headers.set("Content-Disposition", 'attachment; filename="pidlane.apk"');
  headers.set("Cache-Control", "public, max-age=300");
  if (obj.httpEtag) headers.set("etag", obj.httpEtag);
  return new Response(obj.body, { headers });
}
__name(handleApkDownload, "handleApkDownload");
async function handleVersionJson(request, env) {
  if (!env.FILES) return json({ error: "no_r2_binding" }, 500);
  const obj = await env.FILES.get("apk/version.json");
  if (!obj || !obj.body) return json({ error: "version_not_found" }, 404);
  const headers = new Headers(CORS);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "public, max-age=60");
  return new Response(obj.body, { headers });
}
__name(handleVersionJson, "handleVersionJson");
async function hmacSign(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    _enc.encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return b64url(await crypto.subtle.sign("HMAC", key, _enc.encode(msg)));
}
__name(hmacSign, "hmacSign");
function safeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(safeEqual, "safeEqual");
async function makeToken(env, user, role, label) {
  const ttl = Number(env.TOKEN_TTL_HOURS || 12) * 3600;
  const exp = Math.floor(Date.now() / 1e3) + ttl;
  const payload = b64url(_enc.encode(JSON.stringify({ u: user, r: role, l: label, exp })));
  const sig = await hmacSign(env.SESSION_SECRET, payload);
  return { token: `${payload}.${sig}`, exp, user, role, label };
}
__name(makeToken, "makeToken");
function b64urlToString(s) {
  const bin = atob(String(s).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
__name(b64urlToString, "b64urlToString");
async function verifyToken(env, token) {
  try {
    if (!env.SESSION_SECRET) return null;
    const [payload, sig] = String(token || "").split(".");
    if (!payload || !sig) return null;
    if (!safeEqual(sig, await hmacSign(env.SESSION_SECRET, payload))) return null;
    const p = JSON.parse(b64urlToString(payload));
    if (!p.exp || Math.floor(Date.now() / 1e3) >= p.exp) return null;
    return p;
  } catch (_) {
    return null;
  }
}
__name(verifyToken, "verifyToken");
async function auth(request, env) {
  const appTok = request.headers.get("X-App-Token") || "";
  const adminTok = request.headers.get("X-Admin-Token") || "";
  if (env.ADMIN_TOKEN && adminTok && safeEqual(adminTok, env.ADMIN_TOKEN))
    return { u: "admin", r: "admin", l: "Admin" };
  if (env.ADMIN_TOKEN && appTok && safeEqual(appTok, env.ADMIN_TOKEN))
    return { u: "admin", r: "admin", l: "Admin" };
  const s = await verifyToken(env, appTok);
  if (s) return s;
  const legacyEnabled = String(env.ALLOW_LEGACY_APP_TOKEN || "").toLowerCase() === "true";
  if (legacyEnabled && env.APP_TOKEN && appTok && safeEqual(appTok, env.APP_TOKEN))
    return { u: "legacy", r: "user", l: "Legacy token" };
  return null;
}
__name(auth, "auth");
var RL = {
  loginAccount: { limit: 8, windowMs: 6e4 },
  // per inlognaam, alleen missers
  loginIp: { limit: 100, windowMs: 6e4 },
  // ruim: carrier-NAT / kantoor-IP
  adminWrite: { limit: 20, windowMs: 6e4 },
  // admin.html schrijfacties
  codeAccount: { limit: 30, windowMs: 6e4 },
  // meekijk-code per account
  codeIp: { limit: 200, windowMs: 6e4 }
  // meekijk-code per IP (ruim)
};
async function rlKey(env, scope, id) {
  const raw = scope + ":" + String(id || "unknown").toLowerCase();
  if (env && env.SESSION_SECRET) return (await hmacSign(env.SESSION_SECRET, raw)).replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
  return (await sha256hex(raw)).slice(0, 32);
}
__name(rlKey, "rlKey");
var _rlMem = /* @__PURE__ */ new Map();
function rlMem(key, limit, windowMs, record) {
  const now = Date.now();
  const arr = (_rlMem.get(key) || []).filter((x) => now - x < windowMs);
  const limited = arr.length >= limit;
  if (!limited && record) arr.push(now);
  _rlMem.set(key, arr);
  if (_rlMem.size > 5e3) _rlMem.clear();
  return {
    limited,
    remaining: Math.max(0, limit - arr.length),
    retryAfter: limited ? Math.ceil(windowMs / 1e3) : 0,
    local: true
  };
}
__name(rlMem, "rlMem");
async function rateLimit(env, scope, id, spec, record = true) {
  const limit = spec.limit, windowMs = spec.windowMs;
  const key = await rlKey(env, scope, id);
  const memKey = scope + ":" + key;
  if (!env || !env.REMOTE_SESSION) return rlMem(memKey, limit, windowMs, record);
  try {
    const stub = env.REMOTE_SESSION.get(env.REMOTE_SESSION.idFromName("ratelimit:" + scope + ":" + key));
    const r = await stub.fetch("https://do/rate-limit", {
      method: "POST",
      body: JSON.stringify({ limit, windowMs, now: Date.now(), record: !!record })
    });
    if (!r.ok) return rlMem(memKey, limit, windowMs, record);
    return await r.json();
  } catch (_) {
    return rlMem(memKey, limit, windowMs, record);
  }
}
__name(rateLimit, "rateLimit");
function rateLimitResponse(rl) {
  const secs = Math.max(1, Number(rl && rl.retryAfter) || 60);
  return json({ error: "rate_limited", retryAfter: secs }, 429, { "Retry-After": String(secs) });
}
__name(rateLimitResponse, "rateLimitResponse");
async function airtableUsers(env) {
  if (!env.AIRTABLE_TOKEN) return {};
  const base = resolveBase(env, "AIRTABLE_CONFIG_BASE");
  const table = cfg(env, "AIRTABLE_USERS_TABLE");
  const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?pageSize=100`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
    if (!r.ok) return {};
    const data = await r.json();
    const out = {};
    for (const rec of data.records || []) {
      const f = rec.fields || {};
      const name = String(f.User || "").trim();
      if (!name) continue;
      if (f.Active === false) continue;
      out[name] = {
        passHash: String(f.PassHash || "").trim().toLowerCase(),
        role: String(f.Role || "user").trim(),
        label: String(f.Label || name).trim(),
        _id: rec.id
      };
    }
    return out;
  } catch (_) {
    return {};
  }
}
__name(airtableUsers, "airtableUsers");
async function allUsers(env) {
  const fromAirtable = await airtableUsers(env);
  let fromSecret = {};
  try {
    fromSecret = JSON.parse(env.USERS_JSON || "{}");
  } catch (_) {
  }
  return { ...fromAirtable, ...fromSecret };
}
__name(allUsers, "allUsers");
async function rehashAirtablePassword(env, recId, pass) {
  if (!env.AIRTABLE_TOKEN || !recId) return;
  try {
    const base = resolveBase(env, "AIRTABLE_CONFIG_BASE");
    const table = cfg(env, "AIRTABLE_USERS_TABLE");
    const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;
    const PassHash = await hashPassword(pass, env);
    await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ id: recId, fields: { PassHash } }], typecast: true })
    });
  } catch (_) {
  }
}
__name(rehashAirtablePassword, "rehashAirtablePassword");
async function handleLogin(request, env, ctx) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!env.SESSION_SECRET) return json({ error: "no_session_secret" }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const user = String(body.user || "").trim();
  const pass = String(body.pass || "");
  const norm = /* @__PURE__ */ __name((s) => String(s || "").trim().toLowerCase().replace(/[\s_]+/g, ""), "norm");
  const acctId = norm(user) || "leeg";
  const [rlAcc, rlIp] = await Promise.all([
    rateLimit(env, "login-account", acctId, RL.loginAccount, false),
    rateLimit(env, "login-ip", ip, RL.loginIp, false)
  ]);
  if (rlAcc.limited) return rateLimitResponse(rlAcc);
  if (rlIp.limited) return rateLimitResponse(rlIp);
  const users = await allUsers(env);
  const key = Object.keys(users).find((k) => k === user) || Object.keys(users).find((k) => norm(k) === norm(user)) || Object.keys(users).find((k) => norm(users[k].label || "") === norm(user));
  const acc = key ? users[key] : null;
  const res = acc ? await verifyPassword(pass, acc.passHash) : { ok: false, legacy: false };
  if (!res.ok) {
    await Promise.all([
      rateLimit(env, "login-account", acctId, RL.loginAccount, true),
      rateLimit(env, "login-ip", ip, RL.loginIp, true)
    ]);
    await new Promise((r) => setTimeout(r, 500));
    return json({ error: "invalid_credentials" }, 401);
  }
  if (res.legacy && acc._id) {
    const job = rehashAirtablePassword(env, acc._id, pass);
    if (ctx && ctx.waitUntil) ctx.waitUntil(job);
    else await job;
  }
  const t = await makeToken(env, key, acc.role || "user", acc.label || key);
  return json(t, 200);
}
__name(handleLogin, "handleLogin");
async function appTokenOk(request, env) {
  return !!await auth(request, env);
}
__name(appTokenOk, "appTokenOk");
async function adminWriteLimited(env, ip) {
  return await rateLimit(env, "admin-write", ip, RL.adminWrite, true);
}
__name(adminWriteLimited, "adminWriteLimited");
var COPILOT_BRIEFING = [
  "Je bent de ingebouwde ontwikkelassistent van PidLane, een OBD2-diagnose-webapp.",
  "Je praat met de ontwikkelaar (admin) TIJDENS live gebruik in een auto. Antwoord in het Nederlands, kort en concreet.",
  "",
  "ARCHITECTUUR (vast):",
  "- Losse JS-modules geladen vanuit index.html; scheduler, batchparser en snoei zitten in index.html zelf.",
  "- PLBus = bus-mutex + statistiek (venGemMs, foutPct, belasting, perSec).",
  "- PLSched = cadans-register per PID (interval, laatstePoging, laatsteSucces, dood, kwaliteit).",
  "- PLLoad = automatische busbelasting-regeling (AIMD). Handmatige snelheidskeuze bestaat NIET meer.",
  "- Watchers/monitor/verify zitten achter closures; van buiten NIET te patchen. Scheduler en parser (window.*) wel.",
  "",
  "BESLISSINGEN DIE VASTLIGGEN (niet opnieuw voorstellen):",
  "- Uitvaldetectie is cadans-relatief (3x eigen interval), nooit een vaste drempel.",
  "- Snoeien vereist reeks missers EN lage score EN verstreken tijd (>=3x interval) EN gezonde bus.",
  "- Batch-multiframe komt op EEN regel; splits op elke framemarker, niet alleen regelbegin.",
  "- STAT_RPM/RPM_CONST gebruiken IQR + richtingswisselingen, nooit rauwe max-min.",
  "- Rit-monitor start alleen handmatig. Full Survey start nooit automatisch.",
  "",
  "WERKWIJZE: vraag om de diagnosebundel als je bytes nodig hebt. Lever nooit een fix zonder bewijs uit de data;",
  "zeg het als je bewijs mist en vraag dan eerst om een meting. Wees zuinig met woorden."
].join("\n");
async function handleCopilot(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: "unauthorized" }, 401);
  if (session.r !== "admin")
    return json({ error: "forbidden_role", hint: "Copiloot is alleen voor beheerders." }, 403);
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > 4e5) return json({ error: "payload_too_large" }, 413);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  if (!body || !Array.isArray(body.messages))
    return json({ error: "bad_payload", hint: "messages-array ontbreekt" }, 400);
  if (body.messages.length > 40) return json({ error: "too_many_messages" }, 413);
  let ctxBlok = "";
  try {
    if (body.context && typeof body.context === "object") {
      const c = JSON.stringify(body.context);
      ctxBlok = "HUIDIGE TOESTAND (momentopname uit de app):\n" + (c.length > 6e4 ? c.slice(0, 6e4) + " \u2026(afgekapt)" : c);
    }
  } catch (_) {
  }
  const messages = ctxBlok ? [{ role: "user", content: ctxBlok }, ...body.messages] : body.messages;
  const payload = {
    model: typeof body.model === "string" ? body.model : "claude-sonnet-4-6",
    max_tokens: Math.min(Math.max(Number(body.max_tokens) || 2048, 1), 8192),
    system: COPILOT_BRIEFING,
    messages
  };
  if (JSON.stringify(payload).length > 35e4) return json({ error: "payload_too_large" }, 413);
  const apiKey = resolveAnthropicKey(env);
  if (!apiKey) return json({ error: { message: "Geen API-key in de Worker" } }, 401);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(payload)
  });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { "Content-Type": "application/json", ...CORS } });
}
__name(handleCopilot, "handleCopilot");
// ── Tegoed: afrekenen gebeurt HIER, niet in de app ──────────────────
// De app rekende zichzelf af: pidlane-credits.js schatte de kosten en riep
// daarna /klant/saldo-muteer aan. Dat is een verzoek, geen controle — wie dat
// verzoek blokkeert of localStorage wist, gebruikt de AI gratis. De Worker is
// de enige plek die de klant niet kan omzeilen, dus daar wordt geteld.
//
// We rekenen op ECHT verbruik uit usage in de respons, niet op de schatting
// van de app. Dat is het enige eerlijke getal, en het maakt vervolgcalls bij
// max_tokens meteen meetelbaar — die waren voorheen gratis omdat de app maar
// één keer per apiFetch afboekte.
//
// De tarieven staan bewust dubbel: CFG in pidlane-credits.js is voor het
// kostenvenster vóóraf, deze voor de echte afboeking. Wijzig je er één, pas
// dan de ander aan, of overschrijf ze met Worker-variabelen zodat alleen de
// schatting nog in de app staat.
function tegoedTarief(env) {
  const g = /* @__PURE__ */ __name((naam, standaard) => {
    const v = Number(env && env[naam]);
    return Number.isFinite(v) && v >= 0 ? v : standaard;
  }, "g");
  return {
    per1kIn: g("CREDIT_PER_1K_IN", 0.7),
    per1kUit: g("CREDIT_PER_1K_UIT", 3.5),
    min: Math.max(1, Math.round(g("CREDIT_MIN", 1)))
  };
}
__name(tegoedTarief, "tegoedTarief");
// Zelfde formule als _credits() in pidlane-credits.js. Wijken ze uiteen, dan
// klopt het kostenvenster niet meer met wat er daadwerkelijk afgaat.
function tegoedKosten(usage, tarief) {
  const inTok = Number(usage && usage.input_tokens) || 0;
  const uitTok = Number(usage && usage.output_tokens) || 0;
  const ruw = inTok / 1e3 * tarief.per1kIn + uitTok / 1e3 * tarief.per1kUit;
  return Math.max(tarief.min, Math.ceil(ruw));
}
__name(tegoedKosten, "tegoedKosten");
async function handleMessages(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: "unauthorized" }, 401);
  if (session.r === "demo" || session.u === "legacy")
    return json({ error: "forbidden_role", hint: "Dit account heeft geen AI-toegang." }, 403);
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > 3e5) return json({ error: "payload_too_large" }, 413);
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.messages))
    return json({ error: "bad_payload", hint: "messages-array ontbreekt" }, 400);
  if (payload.messages.length > 40) return json({ error: "too_many_messages" }, 413);
  if (JSON.stringify(payload).length > 25e4) return json({ error: "payload_too_large" }, 413);
  payload.max_tokens = Math.min(Math.max(Number(payload.max_tokens) || 2048, 1), 8192);
  const clientKey = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") || request.headers.get("x-api-key") || "";
  const apiKey = clientKey || resolveAnthropicKey(env);
  if (!apiKey) return json({ error: { message: "Geen API-key beschikbaar in de Worker (check ANTHROPIC_API_KEY secret)" } }, 401);

  // ── Tegoedcontrole vooraf ────────────────────────────────────────
  // Alleen voor klantaccounts (tabel Klanten). Accounts uit de tabel Users
  // zijn zakelijk met abonnement en betalen niet per analyse. Brengt de klant
  // zijn eigen sleutel mee, dan betaalt hij Anthropic al rechtstreeks en
  // rekenen we hier niets af.
  const tarief = tegoedTarief(env);
  let klantRec = null, saldoVoor = 0;
  if (session.r === "klant" && !clientKey) {
    if (!env.AIRTABLE_TOKEN) return json({ error: "no_airtable_token" }, 500);
    // De foutvorm hieronder is bewust {error:{message}} en niet de {error:"..."}
    // van de andere klantroutes: apiFetch in pidlane-fuel.js leest
    // err?.error?.message uit en toont anders een kaal "HTTP 402". Zo krijgt de
    // gebruiker een leesbare melding zonder dat fuel.js mee hoeft te wijzigen.
    // `code` staat ernaast voor als de app er ooit op wil sturen.
    try {
      klantRec = await klantZoek(env, session.u);
    } catch (e) {
      // Bewust dichtklappen in plaats van doorlaten: een storing bij Airtable
      // mag geen gratis AI opleveren. Wil je liever dat de app blijft werken
      // als Airtable hapert, geef hier dan klantRec = null terug in plaats van
      // een foutmelding — dan gaat de call door zonder afboeking.
      try {
        console.error("[tegoed] saldo niet leesbaar voor " + session.u + " :: " + String(e && e.message || e));
      } catch (_) {
      }
      return json({
        ok: false,
        code: "tegoed_onbekend",
        error: { message: "Je tegoed kon even niet gecontroleerd worden. Probeer het zo opnieuw." }
      }, 503);
    }
    if (!klantRec)
      return json({ ok: false, code: "geen_account", error: { message: "Account niet gevonden." } }, 404);
    const kf = klantRec.fields || {};
    if (kf.Status === "geblokkeerd")
      return json({ ok: false, code: "geblokkeerd", error: { message: "Dit account is geblokkeerd." } }, 403);
    saldoVoor = Number(kf.Saldo || 0);
    if (saldoVoor < tarief.min)
      return json({
        ok: false,
        code: "onvoldoende_tegoed",
        saldo: saldoVoor,
        error: { message: "Je tokens zijn op. Wissel een activatiecode in om verder te gaan." }
      }, 402);
  }

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": request.headers.get("anthropic-version") || "2023-06-01"
    },
    body: JSON.stringify(payload)
  });
  const text = await r.text();
  const kop = { "Content-Type": "application/json", ...CORS };

  // ── Afboeken op echt verbruik ────────────────────────────────────
  // Alleen bij een geslaagd antwoord: een 429 of 500 van Anthropic levert de
  // klant niets op en kost hem dus ook niets. De afboeking wordt afgewacht
  // (niet in waitUntil), zodat vervolgcalls bij max_tokens een saldo zien dat
  // al is bijgewerkt. Dat kost een paar honderd ms op een call die er toch al
  // seconden over doet.
  //
  // Mislukt de schrijfactie, dan gaat het antwoord alsnog naar de klant: de
  // call is al betaald bij Anthropic en achterhouden helpt niemand. Het gemis
  // gaat naar de logs.
  //
  // BEKENDE GRENS: Airtable kent geen transacties. Twee gelijktijdige calls
  // van hetzelfde account (twee apparaten) kunnen elkaars afboeking
  // overschrijven. Bij normaal gebruik lopen calls netjes achter elkaar; wordt
  // dit ooit een probleem, dan is de Durable Object de plek om het saldo te
  // serialiseren.
  if (klantRec && r.ok) {
    let kosten = tarief.min;
    try {
      const d = JSON.parse(text);
      kosten = tegoedKosten(d && d.usage, tarief);
    } catch (_) {
    }
    const saldoNa = Math.max(0, saldoVoor - kosten);
    try {
      await klantPatch(env, klantRec.id, { Saldo: saldoNa });
      kop["X-PidLane-Saldo"] = String(saldoNa);
    } catch (e) {
      try {
        console.error("[tegoed] afboeken mislukt voor " + session.u + " (" + kosten + " credits) :: " + String(e && e.message || e));
      } catch (_) {
      }
      kop["X-PidLane-Saldo"] = String(saldoVoor);
    }
  }

  return new Response(text, { status: r.status, headers: kop });
}
__name(handleMessages, "handleMessages");
async function handleAirtableLog(request, env) {
  if (!await appTokenOk(request, env)) return json({ error: "unauthorized" }, 401);
  if (!env.AIRTABLE_TOKEN) return json({ error: "no_airtable_token" }, 500);
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const records = Array.isArray(payload.records) ? payload.records.slice(0, 10) : [];
  if (!records.length) return json({ error: "no_records" }, 400);
  const clean = records.map((rec) => {
    const f = rec && typeof rec.fields === "object" && rec.fields ? rec.fields : {};
    const out = {};
    let n = 0;
    for (const k of Object.keys(f)) {
      if (++n > 40) break;
      if (String(k).length > 100) continue;
      const v = f[k];
      out[k] = typeof v === "string" && v.length > 95e3 ? v.slice(0, 95e3) : v;
    }
    return { fields: out };
  });
  const base = resolveBase(env, "AIRTABLE_LOG_BASE", "AIRTABLE_BASE");
  const table = cfg(env, "AIRTABLE_LOG_TABLE");
  const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      records: clean,
      typecast: payload.typecast !== false
      // default true
    })
  });
  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}
__name(handleAirtableLog, "handleAirtableLog");
async function handleAirtableVeldlab(request, env) {
  if (!await appTokenOk(request, env)) return json({ error: "unauthorized" }, 401);
  if (!env.AIRTABLE_TOKEN) return json({ error: "no_airtable_token" }, 500);
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const records = Array.isArray(payload.records) ? payload.records.slice(0, 10) : [];
  if (!records.length) return json({ error: "no_records" }, 400);
  const clean = records.map((r2) => ({ fields: r2 && typeof r2.fields === "object" ? r2.fields : {} }));
  for (const r2 of clean) {
    if (typeof r2.fields.JSON === "string" && r2.fields.JSON.length > 95e3)
      r2.fields.JSON = r2.fields.JSON.slice(0, 95e3);
  }
  const base = resolveBase(env, "AIRTABLE_VL_BASE");
  const table = cfg(env, "AIRTABLE_VL_TABLE");
  const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ records: clean, typecast: true })
  });
  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}
__name(handleAirtableVeldlab, "handleAirtableVeldlab");
async function handleAirtableReference(request, env) {
  if (!await appTokenOk(request, env)) return json({ error: "unauthorized" }, 401);
  if (!env.AIRTABLE_TOKEN) return json({ error: "no_airtable_token" }, 500);
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const records = Array.isArray(payload.records) ? payload.records.slice(0, 10) : [];
  if (!records.length) return json({ error: "no_records" }, 400);
  const clean = [];
  for (const r2 of records) {
    const f = r2 && typeof r2.fields === "object" && r2.fields ? r2.fields : null;
    if (!f || typeof f.RefID !== "string" || !f.RefID.trim()) continue;
    if (typeof f.JSON === "string" && f.JSON.length > 95e3) f.JSON = f.JSON.slice(0, 95e3);
    clean.push({ fields: f });
  }
  if (!clean.length) return json({ error: "no_valid_records", hint: "RefID ontbreekt" }, 400);
  const base = resolveBase(env, "AIRTABLE_VL_BASE");
  const table = cfg(env, "AIRTABLE_REF_TABLE");
  const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;
  const r = await fetch(url, {
    method: "PATCH",
    // PATCH + performUpsert = upsert
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      performUpsert: { fieldsToMergeOn: ["RefID"] },
      records: clean,
      typecast: true
    })
  });
  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}
__name(handleAirtableReference, "handleAirtableReference");
var PROXY_ALLOWED_HOSTS = ["opendata.rdw.nl", "vpic.nhtsa.dot.gov"];
async function handleProxy(request, env) {
  if (!await appTokenOk(request, env)) return json({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  const target = url.searchParams.get("url") || "";
  if (!target) return json({ error: "missing_url" }, 400);
  let t;
  try {
    t = new URL(target);
  } catch {
    return json({ error: "bad_url" }, 400);
  }
  if (t.protocol !== "https:" || !PROXY_ALLOWED_HOSTS.includes(t.hostname)) {
    return json({ error: "host_not_allowed", host: t.hostname }, 403);
  }
  const r = await fetch(t.toString(), { headers: { Accept: "application/json" } });
  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: {
      "Content-Type": r.headers.get("Content-Type") || "application/json",
      "Cache-Control": "public, max-age=300",
      // RDW-data verandert zelden
      ...CORS
    }
  });
}
__name(handleProxy, "handleProxy");
var CONFIG_CACHE_TTL = 60;
async function handleConfigGet(request, env, ctx) {
  if (!await auth(request, env)) return json({ error: "unauthorized" }, 401);
  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/config", request.url).toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const base = resolveBase(env, "AIRTABLE_CONFIG_BASE");
  const table = cfg(env, "AIRTABLE_CONFIG_TABLE");
  const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?pageSize=100`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
  if (!r.ok) {
    return json({}, 200);
  }
  const data = await r.json();
  const out = {};
  for (const rec of data.records || []) {
    const k = rec.fields?.Key;
    if (k) out[k] = rec.fields?.Value ?? "";
  }
  const resp = new Response(JSON.stringify(out), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CONFIG_CACHE_TTL}`,
      ...CORS
    }
  });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}
__name(handleConfigGet, "handleConfigGet");
async function handleConfigPost(request, env, ctx) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlCfg = await adminWriteLimited(env, ip);
  if (rlCfg.limited) return rateLimitResponse(rlCfg);
  const adminTok = request.headers.get("X-Admin-Token") || "";
  if (!env.ADMIN_TOKEN || !safeEqual(adminTok, env.ADMIN_TOKEN)) return json({ error: "forbidden" }, 403);
  if (!env.AIRTABLE_TOKEN) return json({ error: "no_airtable_token" }, 500);
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return json({ error: "no_items" }, 400);
  const ALLOWED_KEYS = /^[a-z0-9_]{1,60}$/i;
  for (const it of items) {
    if (!it.Key || !ALLOWED_KEYS.test(it.Key)) return json({ error: "invalid_key", key: it.Key }, 400);
    if (typeof it.Value === "string" && it.Value.length > 5e3) return json({ error: "value_too_long", key: it.Key }, 400);
  }
  const base = resolveBase(env, "AIRTABLE_CONFIG_BASE");
  const table = cfg(env, "AIRTABLE_CONFIG_TABLE");
  const baseUrl = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;
  const lr = await fetch(`${baseUrl}?pageSize=100`, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
  if (!lr.ok) {
    const t = await lr.text().catch(() => "");
    return json({ error: "airtable_list_failed", detail: t.slice(0, 200) }, 502);
  }
  const existing = await lr.json();
  const byKey = {};
  for (const rec of existing.records || []) {
    if (rec.fields?.Key) byKey[rec.fields.Key] = rec.id;
  }
  const toUpdate = [], toCreate = [];
  for (const it of items) {
    const fields = { Key: it.Key, Value: it.Value ?? "" };
    if (it.Description !== void 0) fields.Description = it.Description;
    if (byKey[it.Key]) toUpdate.push({ id: byKey[it.Key], fields });
    else toCreate.push({ fields });
  }
  const chunk = /* @__PURE__ */ __name((arr, n) => arr.length ? [arr.slice(0, n), ...chunk(arr.slice(n), n)] : [], "chunk");
  const results = [];
  for (const batch of chunk(toUpdate, 10)) {
    const r = await fetch(baseUrl, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: batch, typecast: true })
    });
    results.push({ op: "update", ok: r.ok, status: r.status });
  }
  for (const batch of chunk(toCreate, 10)) {
    const r = await fetch(baseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: batch, typecast: true })
    });
    results.push({ op: "create", ok: r.ok, status: r.status });
  }
  try {
    const cache = caches.default;
    const cacheKey = new Request(new URL("/api/config", request.url).toString(), { method: "GET" });
    ctx.waitUntil(cache.delete(cacheKey));
  } catch (_) {
  }
  const allOk = results.every((x) => x.ok);
  return json({ ok: allOk, results }, allOk ? 200 : 502);
}
__name(handleConfigPost, "handleConfigPost");
function adminOnly(request, env) {
  const t = request.headers.get("X-Admin-Token") || "";
  return !!(env.ADMIN_TOKEN && t && safeEqual(t, env.ADMIN_TOKEN));
}
__name(adminOnly, "adminOnly");
async function handleUsersGet(request, env) {
  if (!adminOnly(request, env)) return json({ error: "forbidden" }, 403);
  if (!env.AIRTABLE_TOKEN) return json({ error: "no_airtable_token" }, 500);
  const base = resolveBase(env, "AIRTABLE_CONFIG_BASE");
  const table = cfg(env, "AIRTABLE_USERS_TABLE");
  const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?pageSize=100`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return json({ error: "airtable_list_failed", detail: t.slice(0, 300) }, 502);
  }
  const data = await r.json();
  const users = (data.records || []).map((rec) => {
    const f = rec.fields || {};
    return {
      id: rec.id,
      user: f.User || "",
      role: f.Role || "user",
      label: f.Label || f.User || "",
      active: f.Active !== false,
      hasPass: !!(f.PassHash && String(f.PassHash).trim())
    };
  }).filter((u) => u.user);
  let locked = [];
  try {
    const s = JSON.parse(env.USERS_JSON || "{}");
    locked = Object.keys(s).map((k) => ({
      user: k,
      role: s[k].role || "user",
      label: s[k].label || k,
      locked: true
    }));
  } catch (_) {
  }
  return json({ users, locked }, 200);
}
__name(handleUsersGet, "handleUsersGet");
async function handleUsersPost(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlUsr = await adminWriteLimited(env, ip);
  if (rlUsr.limited) return rateLimitResponse(rlUsr);
  if (!adminOnly(request, env)) return json({ error: "forbidden" }, 403);
  if (!env.AIRTABLE_TOKEN) return json({ error: "no_airtable_token" }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const action = String(body.action || "save");
  const user = String(body.user || "").trim();
  if (!user) return json({ error: "no_user" }, 400);
  if (!/^[A-Za-z0-9 ._-]{2,40}$/.test(user)) return json({ error: "invalid_user" }, 400);
  try {
    const s = JSON.parse(env.USERS_JSON || "{}");
    if (Object.keys(s).some((k) => k.toLowerCase() === user.toLowerCase()))
      return json({ error: "locked_user", hint: "Deze naam staat in USERS_JSON en wordt daar beheerd." }, 409);
  } catch (_) {
  }
  const base = resolveBase(env, "AIRTABLE_CONFIG_BASE");
  const table = cfg(env, "AIRTABLE_USERS_TABLE");
  const baseUrl = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;
  const lr = await fetch(`${baseUrl}?pageSize=100`, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
  if (!lr.ok) {
    const t = await lr.text().catch(() => "");
    return json({ error: "airtable_list_failed", detail: t.slice(0, 300) }, 502);
  }
  const existing = await lr.json();
  const hit = (existing.records || []).find(
    (rec) => String(rec.fields?.User || "").trim().toLowerCase() === user.toLowerCase()
  );
  if (action === "delete") {
    if (!hit) return json({ error: "not_found" }, 404);
    const dr = await fetch(`${baseUrl}?records[]=${hit.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` }
    });
    if (!dr.ok) {
      const t = await dr.text().catch(() => "");
      return json({ error: "airtable_delete_failed", detail: t.slice(0, 300) }, 502);
    }
    return json({ ok: true, deleted: user }, 200);
  }
  const pass = String(body.pass || "");
  const role = ["admin", "user", "demo"].includes(String(body.role)) ? String(body.role) : "user";
  if (!hit && !pass) return json({ error: "pass_required", hint: "Nieuwe gebruiker heeft een wachtwoord nodig." }, 400);
  if (pass && pass.length < 8) return json({ error: "pass_too_short", hint: "Minimaal 8 tekens." }, 400);
  const fields = {
    User: user,
    Role: role,
    Label: String(body.label || user).trim(),
    Active: body.active !== false
  };
  if (pass) fields.PassHash = await hashPassword(pass, env);
  const r = hit ? await fetch(baseUrl, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ id: hit.id, fields }], typecast: true })
  }) : await fetch(baseUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: true })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return json({ error: "airtable_write_failed", detail: t.slice(0, 300) }, 502);
  }
  return json({ ok: true, user, created: !hit, passChanged: !!pass }, 200);
}
__name(handleUsersPost, "handleUsersPost");
function sessionStub(env, sid) {
  const id = env.REMOTE_SESSION.idFromName(sid);
  return env.REMOTE_SESSION.get(id);
}
__name(sessionStub, "sessionStub");
async function makeJoinToken(env, sid, sessionRole, exp) {
  const payload = b64url(_enc.encode(JSON.stringify({ sid, sr: sessionRole, exp })));
  const sig = await hmacSign(env.SESSION_SECRET, payload);
  return `${payload}.${sig}`;
}
__name(makeJoinToken, "makeJoinToken");
async function verifyJoinToken(env, token) {
  try {
    if (!env.SESSION_SECRET) return null;
    const [payload, sig] = String(token || "").split(".");
    if (!payload || !sig) return null;
    if (!safeEqual(sig, await hmacSign(env.SESSION_SECRET, payload))) return null;
    const p = JSON.parse(b64urlToString(payload));
    if (!p.sid || !p.exp || Math.floor(Date.now() / 1e3) >= p.exp) return null;
    return p;
  } catch (_) {
    return null;
  }
}
__name(verifyJoinToken, "verifyJoinToken");
async function handleSessionCreate(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: "unauthorized" }, 401);
  if (session.r === "demo") return json({ error: "forbidden_role", hint: "demo mag geen sessie delen" }, 403);
  if (!env.REMOTE_SESSION) return json({ error: "no_do_binding", hint: "REMOTE_SESSION binding ontbreekt" }, 500);
  let body = {};
  try {
    body = await request.json();
  } catch (_) {
  }
  const nowS = Math.floor(Date.now() / 1e3);
  const ttlM = Math.min(Math.max(Number(body.ttlMin) || 120, 5), 480);
  const exp = nowS + ttlM * 60;
  let sid = "", created = false;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    sid = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const r = await sessionStub(env, sid).fetch("https://do/create", {
      method: "POST",
      body: JSON.stringify({
        sid,
        owner: session.u,
        ownerLabel: session.l || session.u,
        exp,
        vehicle: body.vehicle || null
      })
    });
    if (r.ok) created = true;
    else if (r.status !== 409) return json({ error: "session_create_failed", status: r.status }, 502);
  }
  if (!created) return json({ error: "session_create_failed", hint: "sid-botsingen" }, 502);
  const joinToken = await makeJoinToken(env, sid, "expert", exp);
  const localToken = await makeJoinToken(env, sid, "local", exp);
  return json({ ok: true, sessionId: sid, sessionRole: "local", joinToken, localToken, exp }, 200);
}
__name(handleSessionCreate, "handleSessionCreate");
async function handleSessionTelemetry(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: "unauthorized" }, 401);
  if (!env.REMOTE_SESSION) return json({ error: "no_do_binding" }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const sid = String(body.sessionId || "").trim();
  if (!sid) return json({ error: "no_session_id" }, 400);
  const stub = sessionStub(env, sid);
  const r = await stub.fetch("https://do/telemetry", {
    method: "POST",
    body: JSON.stringify({ by: session.u, data: body.data })
  });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { "Content-Type": "application/json", ...CORS } });
}
__name(handleSessionTelemetry, "handleSessionTelemetry");
async function handleSessionState(request, env) {
  const url = new URL(request.url);
  const sid = String(url.searchParams.get("id") || "").trim();
  if (!sid) return json({ error: "no_session_id" }, 400);
  if (!env.REMOTE_SESSION) return json({ error: "no_do_binding" }, 500);
  const session = await auth(request, env);
  const jt = request.headers.get("X-Join-Token") || url.searchParams.get("jt") || "";
  let viaJt = false;
  if (jt) {
    const p = await verifyJoinToken(env, jt);
    viaJt = !!(p && p.sid === sid);
  }
  if (!session && !viaJt) return json({ error: "unauthorized" }, 401);
  const stub = sessionStub(env, sid);
  const since = url.searchParams.get("since") || "0";
  const doUrl = new URL("https://do/state");
  doUrl.searchParams.set("since", since);
  if (viaJt) doUrl.searchParams.set("via", "jt");
  else {
    doUrl.searchParams.set("u", session.u);
    doUrl.searchParams.set("r", session.r);
  }
  const r = await stub.fetch(doUrl.toString());
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { "Content-Type": "application/json", ...CORS } });
}
__name(handleSessionState, "handleSessionState");
async function handleSessionConnect(request, env) {
  if (request.headers.get("Upgrade") !== "websocket")
    return json({ error: "expected_websocket" }, 426);
  const url = new URL(request.url);
  const sid = String(url.searchParams.get("id") || "").trim();
  const jt = url.searchParams.get("jt") || request.headers.get("X-Join-Token") || "";
  if (!sid) return json({ error: "no_session_id" }, 400);
  if (!env.REMOTE_SESSION) return json({ error: "no_do_binding" }, 500);
  let role = null;
  const p = await verifyJoinToken(env, jt);
  if (p && p.sid === sid) role = p.sr || "expert";
  else if (await auth(request, env)) role = "owner";
  if (!role) return json({ error: "unauthorized" }, 401);
  const stub = sessionStub(env, sid);
  const doUrl = new URL("https://do/connect");
  doUrl.searchParams.set("role", role);
  return stub.fetch(new Request(doUrl, request));
}
__name(handleSessionConnect, "handleSessionConnect");
async function handleSessionClose(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: "unauthorized" }, 401);
  if (!env.REMOTE_SESSION) return json({ error: "no_do_binding" }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const sid = String(body.sessionId || "").trim();
  if (!sid) return json({ error: "no_session_id" }, 400);
  const r = await sessionStub(env, sid).fetch("https://do/close", {
    method: "POST",
    body: JSON.stringify({ u: session.u, r: session.r })
  });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { "Content-Type": "application/json", ...CORS } });
}
__name(handleSessionClose, "handleSessionClose");
function pairStub(env, pairId) {
  const id = env.REMOTE_SESSION.idFromName("pair:" + pairId);
  return env.REMOTE_SESSION.get(id);
}
__name(pairStub, "pairStub");
function randHex(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(randHex, "randHex");
async function handlePairCreate(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: "unauthorized" }, 401);
  if (session.r === "demo") return json({ error: "forbidden_role" }, 403);
  if (!env.REMOTE_SESSION) return json({ error: "no_do_binding" }, 500);
  const pairId = randHex(5);
  const claimToken = randHex(16);
  const pollToken = randHex(16);
  const exp = Math.floor(Date.now() / 1e3) + 600;
  const r = await pairStub(env, pairId).fetch("https://do/pair-create", {
    method: "POST",
    body: JSON.stringify({ claimToken, pollToken, exp, by: session.u })
  });
  if (!r.ok) return json({ error: "pair_create_failed", status: r.status }, 502);
  return json({ ok: true, pairId, claimToken, pollToken, exp }, 200);
}
__name(handlePairCreate, "handlePairCreate");
async function handlePairClaim(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: "unauthorized" }, 401);
  if (!env.REMOTE_SESSION) return json({ error: "no_do_binding" }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const pairId = String(body.pairId || "").trim();
  if (!/^[0-9a-f]{10}$/.test(pairId)) return json({ error: "bad_pair_id" }, 400);
  const r = await pairStub(env, pairId).fetch("https://do/pair-claim", {
    method: "POST",
    body: JSON.stringify({
      claimToken: String(body.claimToken || ""),
      sessionId: String(body.sessionId || "").slice(0, 20),
      joinToken: String(body.joinToken || "").slice(0, 600),
      by: session.u
    })
  });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { "Content-Type": "application/json", ...CORS } });
}
__name(handlePairClaim, "handlePairClaim");
async function handlePairPoll(request, env) {
  if (!env.REMOTE_SESSION) return json({ error: "no_do_binding" }, 500);
  const url = new URL(request.url);
  const pairId = String(url.searchParams.get("id") || "").trim();
  const pt = String(url.searchParams.get("pt") || "");
  if (!/^[0-9a-f]{10}$/.test(pairId)) return json({ error: "bad_pair_id" }, 400);
  const doUrl = new URL("https://do/pair-poll");
  doUrl.searchParams.set("pt", pt);
  const r = await pairStub(env, pairId).fetch(doUrl.toString());
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { "Content-Type": "application/json", ...CORS } });
}
__name(handlePairPoll, "handlePairPoll");
function codeStub(env, code) {
  const id = env.REMOTE_SESSION.idFromName("code:" + code);
  return env.REMOTE_SESSION.get(id);
}
__name(codeStub, "codeStub");
// Aparte instance-naamruimte voor activatiecodes, zodat een meekijk-sessiecode
// en een activatiecode elkaar nooit in de weg kunnen zitten.
function redeemStub(env, code) {
  return env.REMOTE_SESSION.get(env.REMOTE_SESSION.idFromName("redeem:" + code));
}
__name(redeemStub, "redeemStub");
function randDigits(n) {
  let out = "";
  while (out.length < n) {
    const b = new Uint8Array(n);
    crypto.getRandomValues(b);
    for (let i = 0; i < b.length && out.length < n; i++) if (b[i] < 250) out += b[i] % 10;
  }
  return out;
}
__name(randDigits, "randDigits");
async function handleCodeCreate(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: "unauthorized" }, 401);
  if (session.r === "demo") return json({ error: "forbidden_role", hint: "demo mag geen sessie delen" }, 403);
  if (!env.REMOTE_SESSION) return json({ error: "no_do_binding" }, 500);
  let body = {};
  try {
    body = await request.json();
  } catch (_) {
  }
  const sessionId = String(body.sessionId || "").trim();
  const joinToken = String(body.joinToken || "").trim();
  if (!sessionId || !joinToken) return json({ error: "missing_session" }, 400);
  const p = await verifyJoinToken(env, joinToken);
  if (!p || p.sid !== sessionId || p.sr !== "expert") return json({ error: "bad_join_token" }, 403);
  const exp = p.exp;
  let code = "", ok = false;
  for (let i = 0; i < 5 && !ok; i++) {
    code = randDigits(10);
    const r = await codeStub(env, code).fetch("https://do/code-put", {
      method: "POST",
      body: JSON.stringify({ sessionId, joinToken, exp, by: session.u })
    });
    if (r.ok) ok = true;
    else if (r.status !== 409) return json({ error: "code_create_failed", status: r.status }, 502);
  }
  if (!ok) return json({ error: "code_create_failed", hint: "botsingen" }, 502);
  return json({ ok: true, code, exp }, 200);
}
__name(handleCodeCreate, "handleCodeCreate");
async function handleCodeResolve(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: "unauthorized" }, 401);
  if (!env.REMOTE_SESSION) return json({ error: "no_do_binding" }, 500);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const [rlAcc, rlIp] = await Promise.all([
    rateLimit(env, "code-account", session.u || "onbekend", RL.codeAccount, true),
    rateLimit(env, "code-ip", ip, RL.codeIp, true)
  ]);
  if (rlAcc.limited) return rateLimitResponse(rlAcc);
  if (rlIp.limited) return rateLimitResponse(rlIp);
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const code = String(body.code || "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(code)) return json({ error: "bad_code" }, 400);
  const r = await codeStub(env, code).fetch("https://do/code-get");
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { "Content-Type": "application/json", ...CORS } });
}
__name(handleCodeResolve, "handleCodeResolve");
var RemoteSessionDO = class {
  static {
    __name(this, "RemoteSessionDO");
  }
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.frames = [];
    this.MAX_FRAMES = 50;
    this._meta = null;
    this.vstate = null;
    this.ctx.blockConcurrencyWhile(async () => {
      this._meta = await this.ctx.storage.get("meta") || null;
      this.frames = await this.ctx.storage.get("frames") || [];
      this.audit = await this.ctx.storage.get("audit") || [];
      this.vstate = await this.ctx.storage.get("vstate") || null;
    });
  }
  async fetch(request) {
    if (request.headers.get("Upgrade") === "websocket") return this.handleConnect(request);
    const url = new URL(request.url);
    const op = url.pathname.split("/").pop();
    if (op === "rate-limit") {
      let b = {};
      try {
        b = await request.json();
      } catch (_) {
        return Response.json({ error: "bad_json" }, { status: 400 });
      }
      const limit = Math.min(Math.max(Number(b.limit) || 1, 1), 1e3);
      const windowMs = Math.min(Math.max(Number(b.windowMs) || 6e4, 1e3), 864e5);
      const now = Math.min(Math.max(Number(b.now) || Date.now(), Date.now() - 6e4), Date.now() + 6e4);
      const record = b.record !== false;
      const cutoff = now - windowMs;
      let hits = await this.ctx.storage.get("rateHits") || [];
      hits = hits.filter((x) => Number.isFinite(x) && x > cutoff);
      const limited = hits.length >= limit;
      if (!limited && record) hits.push(now);
      if (record || hits.length) {
        await this.ctx.storage.put("rateHits", hits);
        await this.ctx.storage.put("rateWindow", windowMs);
        this.ctx.storage.setAlarm(Date.now() + windowMs + 5e3);
      }
      const oldest = hits.length ? hits[0] : now;
      const resetAt = oldest + windowMs;
      return Response.json({
        limited,
        remaining: limited ? 0 : Math.max(0, limit - hits.length),
        resetAt,
        retryAfter: limited ? Math.max(1, Math.ceil((resetAt - now) / 1e3)) : 0
      });
    }
    if (op === "pair-create") {
      const b = await request.json();
      await this.ctx.storage.put("pair", {
        claimToken: b.claimToken,
        pollToken: b.pollToken,
        exp: b.exp,
        by: b.by,
        status: "waiting"
      });
      return Response.json({ ok: true });
    }
    if (op === "pair-claim") {
      const b = await request.json();
      const p = await this.ctx.storage.get("pair");
      if (!p) return Response.json({ error: "no_pairing" }, { status: 404 });
      if (Math.floor(Date.now() / 1e3) >= p.exp) return Response.json({ error: "expired" }, { status: 410 });
      if (p.status !== "waiting") return Response.json({ error: "already_claimed" }, { status: 409 });
      if (!safeEqual(b.claimToken, p.claimToken)) return Response.json({ error: "bad_claim_token" }, { status: 403 });
      if (!b.sessionId || !b.joinToken) return Response.json({ error: "missing_session" }, { status: 400 });
      p.status = "ready";
      p.sessionId = b.sessionId;
      p.joinToken = b.joinToken;
      p.claimedBy = b.by;
      await this.ctx.storage.put("pair", p);
      return Response.json({ ok: true });
    }
    if (op === "pair-poll") {
      const p = await this.ctx.storage.get("pair");
      if (!p) return Response.json({ error: "no_pairing" }, { status: 404 });
      if (!safeEqual(url.searchParams.get("pt") || "", p.pollToken))
        return Response.json({ error: "bad_poll_token" }, { status: 403 });
      if (Math.floor(Date.now() / 1e3) >= p.exp && p.status !== "ready")
        return Response.json({ status: "expired" });
      if (p.status !== "ready") return Response.json({ status: "waiting" });
      await this.ctx.storage.delete("pair");
      return Response.json({ status: "ready", sessionId: p.sessionId, joinToken: p.joinToken });
    }
    // Kortstondig slot rond het inwisselen van één activatiecode. Airtable
    // kent geen transacties, dus twee gelijktijdige verzoeken met dezelfde
    // code konden allebei slagen. Eén DO-instance per code (naam
    // "redeem:<code>") serialiseert dat wél echt.
    //
    // Het slot is BEWUST kort en niet de administratie van "code is op": dat
    // blijft het veld Gebruikt in Airtable. Zo blijft handmatig uitvinken in
    // Airtable werken zoals je gewend bent, en blokkeert een afgebroken
    // verzoek een code niet voorgoed.
    if (op === "redeem-lock") {
      const nu = Date.now();
      let gelukt = false;
      await this.ctx.blockConcurrencyWhile(async () => {
        const cur = Number(await this.ctx.storage.get("redeemLock")) || 0;
        // Slot ouder dan 30 s is een restant van een verzoek dat halverwege
        // is gesneuveld; dat mag verlopen.
        if (cur && nu - cur < 3e4) return;
        await this.ctx.storage.put("redeemLock", nu);
        gelukt = true;
      });
      return Response.json({ ok: gelukt }, { status: gelukt ? 200 : 409 });
    }
    if (op === "redeem-unlock") {
      await this.ctx.storage.delete("redeemLock");
      return Response.json({ ok: true });
    }
    if (op === "code-put") {
      const b = await request.json();
      const cur = await this.ctx.storage.get("code");
      if (cur && Math.floor(Date.now() / 1e3) < cur.exp)
        return Response.json({ error: "code_in_use" }, { status: 409 });
      await this.ctx.storage.put("code", {
        sessionId: b.sessionId,
        joinToken: b.joinToken,
        exp: b.exp,
        by: b.by
      });
      return Response.json({ ok: true });
    }
    if (op === "code-get") {
      const c = await this.ctx.storage.get("code");
      if (!c) return Response.json({ error: "unknown_code" }, { status: 404 });
      if (Math.floor(Date.now() / 1e3) >= c.exp) {
        await this.ctx.storage.delete("code");
        return Response.json({ error: "expired" }, { status: 410 });
      }
      return Response.json({ ok: true, sessionId: c.sessionId, joinToken: c.joinToken });
    }
    if (op === "create") {
      const b = await request.json();
      const cur = this._meta;
      if (cur && cur.status === "open" && (!cur.exp || Math.floor(Date.now() / 1e3) < cur.exp))
        return Response.json({ error: "sid_in_use" }, { status: 409 });
      const meta = {
        sid: b.sid,
        owner: b.owner,
        ownerLabel: b.ownerLabel || b.owner,
        vehicle: b.vehicle || null,
        created: Date.now(),
        exp: b.exp,
        // seconden
        status: "open"
      };
      this._meta = meta;
      this.frames = [];
      this.audit = [];
      this.vstate = null;
      await this.ctx.storage.put("meta", meta);
      await this.ctx.storage.delete("frames");
      await this.ctx.storage.delete("audit");
      await this.ctx.storage.delete("vstate");
      return Response.json({ ok: true, meta });
    }
    if (op === "telemetry") {
      const b = await request.json();
      if (b.by && this._meta && this._meta.owner && b.by !== this._meta.owner)
        return Response.json({ error: "not_owner" }, { status: 403 });
      const r = await this.ingestFrame(b.data !== void 0 ? b.data : b);
      const status = r.status || 200;
      delete r.status;
      return Response.json(r, { status });
    }
    if (op === "state") {
      const meta = this._meta;
      if (!meta) return Response.json({ error: "no_session" }, { status: 404 });
      if (url.searchParams.get("via") !== "jt") {
        const u = url.searchParams.get("u") || "";
        const r = url.searchParams.get("r") || "";
        if (r !== "admin" && u !== meta.owner)
          return Response.json({ error: "not_owner" }, { status: 403 });
      }
      const since = Number(url.searchParams.get("since") || 0);
      const frames = since ? this.frames.filter((f) => f.t > since) : this.frames.slice(-50);
      return Response.json({ ok: true, meta, frames, audit: this.audit.slice(-20), serverTime: Date.now() });
    }
    if (op === "close") {
      let b = {};
      try {
        b = await request.json();
      } catch (_) {
      }
      if (this._meta && b.u && b.r !== "admin" && b.u !== this._meta.owner)
        return Response.json({ error: "not_owner" }, { status: 403 });
      if (this._meta) {
        this._meta.status = "closed";
        await this.ctx.storage.put("meta", this._meta);
      }
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(JSON.stringify({ type: "closed" }));
          ws.close(1e3, "session closed");
        } catch (_) {
        }
      }
      return Response.json({ ok: true });
    }
    return Response.json({ error: "unknown_op", op }, { status: 400 });
  }
  // Stuur een bericht naar alle aangesloten sockets.
  broadcast(obj) {
    const msg = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
      } catch (_) {
      }
    }
  }
  // Stuur naar alle sockets met een bepaalde rol-tag (bijv. alleen 'expert').
  broadcastTo(tag, obj) {
    const msg = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets(tag)) {
      try {
        ws.send(msg);
      } catch (_) {
      }
    }
  }
  // Eén telemetrie-frame verwerken: bufferen (throttled naar storage) en live
  // naar de expert(s) fan-outen. Gedeeld door de HTTP-route én de local-WS.
  async ingestFrame(data) {
    const meta = this._meta;
    if (!meta || meta.status !== "open") return { error: "no_session", status: 404 };
    if (meta.exp && Math.floor(Date.now() / 1e3) >= meta.exp) return { error: "expired", status: 410 };
    const frame = { t: Date.now(), data };
    this.frames.push(frame);
    if (this.frames.length > this.MAX_FRAMES)
      this.frames.splice(0, this.frames.length - this.MAX_FRAMES);
    this.broadcastTo("expert", { type: "frame", frame });
    if (!this._lastPersist || Date.now() - this._lastPersist > 1e3) {
      this._lastPersist = Date.now();
      await this.ctx.storage.put("frames", this.frames);
    } else {
      this.ctx.storage.setAlarm(Date.now() + 1500);
    }
    return { ok: true, n: this.frames.length, t: frame.t };
  }
  // Twee soorten alarm:
  //  a) rate-limit-instance -> verlopen tikken opruimen, en als er niets meer
  //     over is de hele instance-opslag wissen. Zonder dit groeit het aantal
  //     rate-limit-objecten met opslag onbeperkt door.
  //  b) sessie-instance -> flush van de throttled frame-ring (gezet in
  //     ingestFrame).
  async alarm() {
    const rl = await this.ctx.storage.get("rateHits");
    if (rl !== void 0) {
      const win = Number(await this.ctx.storage.get("rateWindow")) || 6e4;
      const hits = (rl || []).filter((x) => Number.isFinite(x) && Date.now() - x < win);
      if (hits.length) {
        await this.ctx.storage.put("rateHits", hits);
        this.ctx.storage.setAlarm(Date.now() + win + 5e3);
      } else {
        await this.ctx.storage.deleteAll();
      }
      return;
    }
    this._lastPersist = Date.now();
    await this.ctx.storage.put("frames", this.frames);
  }
  // Safety-by-construction: alleen leesverzoeken passen in dit formaat. Er is
  // geen veld waarin een schrijfactie (mode 04/08, UDS, rauwe hex) kan zitten.
  // NIEUW 2026-07-18: request-record en request-analyze. Ook die zijn puur
  // lezen — de local start/stopt zijn EIGEN recorder en draait zijn EIGEN
  // AI-analyse; er gaat nog steeds geen enkel commando richting de auto dat
  // niet al in het standaard-leesrepertoire van de local zit.
  sanitizeRequest(m) {
    const reqId = typeof m.reqId === "string" && m.reqId.slice(0, 40) || crypto.randomUUID().slice(0, 8);
    if (m.type === "request-dtc") return { type: "request-dtc", reqId };
    if (m.type === "request-vstate") return { type: "request-vstate", reqId };
    if (m.type === "request-pids") {
      if (!Array.isArray(m.pids)) return null;
      const pids = m.pids.filter((p) => typeof p === "string" && /^[0-9A-Fa-f]{2}$/.test(p)).slice(0, 12);
      if (!pids.length) return null;
      return { type: "request-pids", pids, reqId };
    }
    if (m.type === "request-poll") {
      if (!Array.isArray(m.pids)) return null;
      const pids = m.pids.filter((p) => typeof p === "string" && /^[0-9A-Fa-f]{2}$/.test(p)).slice(0, 24);
      if (!pids.length) return null;
      return { type: "request-poll", pids, reqId };
    }
    if (m.type === "request-record") {
      const action = String(m.action || "");
      if (!["start", "stop", "csv"].includes(action)) return null;
      let pids;
      if (action === "start" && Array.isArray(m.pids)) {
        pids = m.pids.filter((p) => typeof p === "string" && /^[0-9A-Fa-f]{2}$/.test(p)).slice(0, 24);
      }
      const out = { type: "request-record", action, reqId };
      if (pids && pids.length) out.pids = pids;
      return out;
    }
    if (m.type === "request-analyze") {
      const problem = (typeof m.problem === "string" ? m.problem : "").slice(0, 500);
      return { type: "request-analyze", problem, reqId };
    }
    return null;
  }
  // WebSocket-handshake: accepteer hibernatable, stuur backfill, houd open.
  handleConnect(request) {
    const meta = this._meta;
    if (!meta || meta.status !== "open")
      return new Response("no_session", { status: 404 });
    const role = new URL(request.url).searchParams.get("role") || "expert";
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, joinedAt: Date.now() });
    try {
      server.send(JSON.stringify({ type: "meta", meta, role }));
      if (role === "expert") {
        server.send(JSON.stringify({ type: "backfill", frames: this.frames, serverTime: Date.now() }));
        if (this.vstate) server.send(JSON.stringify({ type: "vstate", data: this.vstate, t: Date.now() }));
      }
    } catch (_) {
    }
    try {
      const experts = this.ctx.getWebSockets("expert").length;
      if (role === "expert") this.broadcastTo("local", { type: "presence", experts });
      else server.send(JSON.stringify({ type: "presence", experts }));
    } catch (_) {
    }
    return new Response(null, { status: 101, webSocket: client });
  }
  // ── Hibernation-handlers (worden ook na een recycle door de runtime aangeroepen) ──
  async webSocketMessage(ws, message) {
    let m;
    try {
      m = JSON.parse(typeof message === "string" ? message : "");
    } catch (_) {
      return;
    }
    if (!m || !m.type) return;
    const role = (ws.deserializeAttachment() || {}).role || "expert";
    if (m.type === "ping") {
      try {
        ws.send(JSON.stringify({ type: "pong", t: Date.now() }));
      } catch (_) {
      }
      return;
    }
    if (role === "local" && m.type === "telemetry") {
      await this.ingestFrame(m.data);
      return;
    }
    if (role === "local" && m.type === "response") {
      this.broadcastTo("expert", {
        type: "response",
        reqId: String(m.reqId || "").slice(0, 40),
        data: m.data,
        t: Date.now()
      });
      return;
    }
    if (role === "local" && m.type === "record-status") {
      this.broadcastTo("expert", { type: "record-status", data: m.data, t: Date.now() });
      return;
    }
    if (role === "local" && m.type === "vstate") {
      let d = m.data;
      try {
        if (!d || typeof d !== "object" || JSON.stringify(d).length > 32768) d = null;
      } catch (_) {
        d = null;
      }
      if (d) {
        this.vstate = d;
        await this.ctx.storage.put("vstate", d);
        this.broadcastTo("expert", { type: "vstate", data: d, t: Date.now() });
      }
      return;
    }
    if (role === "expert" && (m.type === "request-pids" || m.type === "request-dtc" || m.type === "request-poll" || m.type === "request-record" || m.type === "request-analyze" || m.type === "request-vstate")) {
      const now = Date.now();
      this._reqTimes = (this._reqTimes || []).filter((t) => now - t < 1e4);
      if (this._reqTimes.length >= 20) {
        try {
          ws.send(JSON.stringify({ type: "request-rejected", reason: "rate_limited" }));
        } catch (_) {
        }
        return;
      }
      this._reqTimes.push(now);
      const req = this.sanitizeRequest(m);
      if (!req) {
        try {
          ws.send(JSON.stringify({ type: "request-rejected", reason: "invalid" }));
        } catch (_) {
        }
        return;
      }
      const locals = this.ctx.getWebSockets("local");
      if (!locals.length) {
        try {
          ws.send(JSON.stringify({ type: "request-rejected", reason: "local_offline", reqId: req.reqId }));
        } catch (_) {
        }
        return;
      }
      this.audit.push({ t: now, action: req.type + (req.action ? ":" + req.action : ""), pids: req.pids || null, reqId: req.reqId });
      if (this.audit.length > 100) this.audit.splice(0, this.audit.length - 100);
      await this.ctx.storage.put("audit", this.audit);
      const out = JSON.stringify(req);
      for (const l of locals) {
        try {
          l.send(out);
        } catch (_) {
        }
      }
      try {
        ws.send(JSON.stringify({ type: "request-sent", reqId: req.reqId, pids: req.pids || null }));
      } catch (_) {
      }
      return;
    }
  }
  async webSocketClose(ws, code, reason, wasClean) {
    try {
      ws.close(code, reason);
    } catch (_) {
    }
    try {
      const att = ws.deserializeAttachment() || {};
      if (att.role === "expert") {
        const experts = this.ctx.getWebSockets("expert").filter((s) => s !== ws).length;
        this.broadcastTo("local", { type: "presence", experts });
      }
    } catch (_) {
    }
  }
  async webSocketError(ws, error) {
  }
};
// ── Tegoed: activatiecode inwisselen ────────────────────────────────
// POST /credits/redeem  { code: "PIDL-XXXX-XXXXXX" }
//   → 200 { ok:true, credits:100 }
//   → 400/404/409/429 { ok:false, error:"..." }
//
// Werkt BEWUST zonder account (stap B van het plan): de gratis proef en de
// eerste aankopen moeten drempelloos zijn. Zodra de Klanten-tabel in gebruik
// is, kan hier optioneel een e-mailadres bij om het saldo aan een account te
// hangen in plaats van aan localStorage.
//
// RACE-BEVEILIGING — Airtable kent geen transacties, dus twee gelijktijdige
// verzoeken met dezelfde code zouden allebei kunnen slagen. Opgelost met een
// compare-and-set: we schrijven eerst een unieke stempel weg, lezen daarna
// terug, en boeken ALLEEN bij wanneer onze eigen stempel er nog staat. Bij een
// race wint precies één verzoek; de ander ziet een vreemde stempel en stopt.
async function handleCreditsRedeem(request, env) {
  if (!env.AIRTABLE_TOKEN) return json({ ok: false, error: "no_airtable_token" }, 500);

  // Brute-force-rem: een code is kort, dus raden moet duur zijn.
  const ip = request.headers.get("CF-Connecting-IP") || "onbekend";
  const rl = await rateLimit(env, "credits-redeem", ip, { limit: 12, windowMs: 6e5 }, true);
  if (rl.limited) return rateLimitResponse(rl);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const code = String(body && body.code || "").trim().toUpperCase();
  const door = String(body && body.email || "").trim().toLowerCase() || "anoniem";

  if (!/^[A-Z0-9][A-Z0-9-]{5,23}$/.test(code))
    return json({ ok: false, error: "Ongeldig codeformaat." }, 400);

  const base = resolveBase(env, "AIRTABLE_CONFIG_BASE");
  const table = cfg(env, "AIRTABLE_CODES_TABLE");
  const hdr = { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" };
  const esc = code.replace(/'/g, "\\'");

  // Zonder Durable Object geen atomair slot, en zonder slot kan dezelfde code
  // bij twee gelijktijdige verzoeken twee keer worden ingewisseld. Bewust
  // dichtklappen: bij geld is niets doen beter dan misschien dubbel boeken.
  if (!env.REMOTE_SESSION)
    return json({ ok: false, error: "Inwisselen kan nu even niet. Probeer het zo opnieuw." }, 503);

  let slot = null;
  try {
    // 1. Code opzoeken
    const zoek = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}` +
      `?maxRecords=1&filterByFormula=${encodeURIComponent(`UPPER({Code})='${esc}'`)}`;
    const r1 = await fetch(zoek, { headers: hdr });
    if (!r1.ok) return json({ ok: false, error: "Controle mislukt, probeer later opnieuw." }, 502);
    const d1 = await r1.json();
    const rec = d1 && d1.records && d1.records[0];
    if (!rec) return json({ ok: false, error: "Code niet gevonden. Controleer de spelling." }, 404);

    const f = rec.fields || {};
    if (f.Gebruikt === true)
      return json({ ok: false, error: "Deze code is al gebruikt." }, 409);

    const credits = Number(f.Credits || 0);
    if (!(credits > 0))
      return json({ ok: false, error: "Deze code heeft geen waarde." }, 409);

    // Vervalt is in Airtable een date-veld en komt dus binnen als YYYY-MM-DD;
    // die maken we heel om middernacht. Zet iemand het veld ooit om naar
    // dateTime, dan komt er een volledige ISO-tijd binnen en zou "+T23:59:59Z"
    // een onparseerbare string opleveren — waarna de vervalcontrole stilletjes
    // wegviel en verlopen codes gewoon werkten. Vandaar beide vormen.
    if (f.Vervalt) {
      const rauw = String(f.Vervalt).trim();
      const verval = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(rauw) ? rauw + "T23:59:59Z" : rauw);
      if (!Number.isFinite(verval)) {
        // Onleesbare datum niet negeren: dan weet je niet of de code geldig is.
        try { console.error("[credits] onleesbare vervaldatum: " + rauw); } catch (_) {}
        return json({ ok: false, error: "Deze code kan nu niet gecontroleerd worden." }, 409);
      }
      if (Date.now() > verval)
        return json({ ok: false, error: "Deze code is verlopen." }, 409);
    }

    // 2. Claimen met unieke stempel
    slot = redeemStub(env, code);
    const grendel = await slot.fetch("https://do/redeem-lock", { method: "POST" });
    if (!grendel.ok) {
      slot = null;
      return json({ ok: false, error: "Deze code wordt op dit moment al ingewisseld." }, 409);
    }

    // 3. Binnen het slot opnieuw lezen. DIT is de eigenlijke race-beveiliging:
    //    een tweede verzoek komt hier pas als het eerste klaar is en ziet
    //    Gebruikt dan al aanstaan. De controle bij stap 1 blijft staan omdat
    //    die de meeste verzoeken al afvangt zonder slot te pakken.
    const rc = await fetch(
      `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}/${rec.id}`,
      { headers: hdr }
    );
    if (!rc.ok) return json({ ok: false, error: "Controle mislukt, probeer later opnieuw." }, 502);
    const dc = await rc.json();
    if ((dc && dc.fields || {}).Gebruikt === true)
      return json({ ok: false, error: "Deze code is zojuist al gebruikt." }, 409);

    // 4. Afstempelen. GebruiktOp is een dateTime-veld, dus hier hoort een
    //    geldige ISO-tijd. Er stond eerder een zelfgemaakte "stempel" met een
    //    willekeurig staartje in ("…T21:15:00.a1b2c3Z"); dat is als datum
    //    ongeldig, en omdat deze PATCH zonder typecast ging antwoordde Airtable
    //    met 422 — inwisselen werkte dus vermoedelijk helemaal niet. typecast
    //    staat nu aan zodat het ook goed blijft gaan als het veld ooit naar
    //    tekst wordt omgezet.
    const r2 = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`, {
      method: "PATCH",
      headers: hdr,
      body: JSON.stringify({
        records: [{
          id: rec.id,
          fields: {
            Gebruikt: true,
            GebruiktOp: new Date().toISOString(),
            GebruiktDoor: door
          }
        }],
        typecast: true
      })
    });
    if (!r2.ok) {
      const t2 = await r2.text().catch(() => "");
      try {
        console.error("[credits] afstempelen mislukt :: " + r2.status + " " + t2.slice(0, 200));
      } catch (_) {
      }
      return json({ ok: false, error: "Inwisselen mislukt, probeer later opnieuw." }, 502);
    }

    // 4. Is er een ingelogde klant, dan gaan de tokens naar het account in
    //    plaats van naar localStorage. Lukt dat bijboeken niet, dan is de
    //    code al verbruikt — daarom melden we dat expliciet in plaats van
    //    stilletjes ok:true terug te geven en het tegoed te laten verdampen.
    let saldo = null;
    try {
      const p = await klantAuth(request, env);
      if (p) {
        const kr = await klantZoek(env, p.u);
        if (kr) {
          const kf = kr.fields || {};
          saldo = Number(kf.Saldo || 0) + credits;
          await klantPatch(env, kr.id, {
            Saldo: saldo,
            TotaalGekocht: Number(kf.TotaalGekocht || 0) + credits
          });
          await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`, {
            method: "PATCH",
            headers: hdr,
            body: JSON.stringify({ records: [{ id: rec.id, fields: { GebruiktDoor: kf.Email || door } }] })
          }).catch(() => {});
        }
      }
    } catch (e) {
      return json({
        ok: false,
        error: "Code is geldig, maar bijboeken op je account is mislukt. Neem contact op — de code is nu verbruikt."
      }, 500);
    }

    return json({ ok: true, credits, code, saldo });
  } catch (e) {
    return klantFout(e, "Onverwachte fout bij inwisselen.");
  } finally {
    // Slot hoe dan ook loslaten. Gebeurt dat niet — bijvoorbeeld doordat de
    // Worker ertussenuit klapt — dan verloopt het vanzelf na 30 s, zodat een
    // code nooit permanent op slot komt te staan.
    if (slot) {
      try {
        await slot.fetch("https://do/redeem-unlock", { method: "POST" });
      } catch (_) {
      }
    }
  }
}
__name(handleCreditsRedeem, "handleCreditsRedeem");

// ═══════════════════════════════════════════════════════════════════
// KLANTACCOUNTS — consumentenzijde van de tegoedmodule
// ═══════════════════════════════════════════════════════════════════
// Staat BEWUST los van de tabel Users en van USERS_JSON. Die zijn voor
// B2B/garage-logins met een vaste userlijst; hier registreert het publiek
// zichzelf. Twee losse systemen naast elkaar is hier de veilige keuze:
// een lek of fout aan de consumentenkant raakt de zakelijke accounts niet.
//
// WACHTWOORDEN gaan door dezelfde hashPassword/verifyPassword als de rest
// van de Worker: PBKDF2-SHA256 met een willekeurige salt per account en het
// aantal iteraties uit PBKDF2_ITERS. De salt zit ingebakken in de PassHash-
// string, dus het losse Salt-veld in de tabel blijft leeg.
//
// SESSIETOKENS hergebruiken makeToken/verifyToken, maar met rol "klant".
// Daardoor kan een klanttoken nooit doorgaan voor een beheerderstoken.

// Fouten in de klantroutes niet stil inslikken. De melding voor de gebruiker
// blijft kort, maar de echte oorzaak gaat mee als `detail` en naar de logs
// (Workers Logs staat aan in wrangler.toml). Zonder dit is een 500 alleen met
// gokwerk te diagnosticeren — precies waar dit misging.
function klantFout(e, bericht, code) {
  const det = String(e && (e.message || e) || "onbekend").slice(0, 300);
  try { console.error("[klant] " + bericht + " :: " + det); } catch (_) {}
  return json({ ok: false, error: bericht, detail: det }, code || 500);
}
__name(klantFout, "klantFout");

function klantEmailOk(e) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(e || "").trim());
}
__name(klantEmailOk, "klantEmailOk");

// Minimale eisen. Lengte weegt zwaarder dan tekensoorten — een lange
// zin is sterker dan "Wachtw00rd!" en wordt beter onthouden.
function klantWachtwoordProbleem(pass, email) {
  const p = String(pass || "");
  if (p.length < 10) return "Wachtwoord moet minstens 10 tekens zijn.";
  if (p.length > 200) return "Wachtwoord is te lang.";
  const e = String(email || "").toLowerCase();
  if (e && p.toLowerCase().includes(e.split("@")[0])) return "Gebruik je e-mailadres niet in je wachtwoord.";
  if (/^(.)\1+$/.test(p)) return "Kies een minder voorspelbaar wachtwoord.";
  return null;
}
__name(klantWachtwoordProbleem, "klantWachtwoordProbleem");

function klantTabel(env) {
  return {
    base: resolveBase(env, "AIRTABLE_CONFIG_BASE"),
    table: cfg(env, "AIRTABLE_KLANTEN_TABLE"),
    hdr: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" }
  };
}
__name(klantTabel, "klantTabel");

async function klantZoek(env, email) {
  const { base, table, hdr } = klantTabel(env);
  const e = String(email || "").trim().toLowerCase().replace(/'/g, "\\'");
  const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}` +
    `?maxRecords=1&filterByFormula=${encodeURIComponent(`LOWER({Email})='${e}'`)}`;
  const r = await fetch(url, { headers: hdr });
  if (!r.ok) throw new Error("airtable_zoek_" + r.status);
  const d = await r.json();
  return d && d.records && d.records[0] || null;
}
__name(klantZoek, "klantZoek");

async function klantPatch(env, id, fields) {
  const { base, table, hdr } = klantTabel(env);
  const r = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`, {
    method: "PATCH",
    headers: hdr,
    body: JSON.stringify({ records: [{ id, fields }], typecast: true })
  });
  if (!r.ok) throw new Error("airtable_patch_" + r.status);
  return await r.json();
}
__name(klantPatch, "klantPatch");

// Verifieert een klanttoken uit X-App-Token of Authorization: Bearer.
async function klantAuth(request, env) {
  const tok = request.headers.get("X-App-Token") ||
    String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tok) return null;
  const p = await verifyToken(env, tok);
  if (!p || p.r !== "klant") return null;
  return p;
}
__name(klantAuth, "klantAuth");

function klantPubliek(rec) {
  const f = rec && rec.fields || {};
  return {
    email: f.Email || "",
    naam: f.Naam || "",
    saldo: Number(f.Saldo || 0),
    status: f.Status || "actief",
    // Vertelt de app of het scherm met akkoorden nog getoond moet worden.
    startTegoed: f.StartTegoedGegeven === true,
    akkoorden: Array.isArray(f.Akkoorden) ? f.Akkoorden.slice() : []
  };
}
__name(klantPubliek, "klantPubliek");

// ── POST /klant/registreer  { email, pass, naam? } ──────────────────
async function handleKlantRegistreer(request, env) {
  if (!env.SESSION_SECRET) return json({ ok: false, error: "no_session_secret" }, 500);
  if (!env.AIRTABLE_TOKEN) return json({ ok: false, error: "no_airtable_token" }, 500);

  const ip = request.headers.get("CF-Connecting-IP") || "onbekend";
  // Ruim genoeg voor een garage met meerdere medewerkers achter één
  // internetverbinding, en voor jezelf tijdens testen. Bijstellen kan met de
  // Worker-variabele RL_REGISTREER zonder de code aan te raken.
  const rlMax = Math.max(1, Number(env.RL_REGISTREER || 25));
  const rl = await rateLimit(env, "klant-registreer", ip, { limit: rlMax, windowMs: 36e5 }, true);
  if (rl.limited) return rateLimitResponse(rl);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const email = String(body.email || "").trim().toLowerCase();
  const pass = String(body.pass || "");
  const naam = String(body.naam || "").trim().slice(0, 80);

  if (!klantEmailOk(email)) return json({ ok: false, error: "Vul een geldig e-mailadres in." }, 400);
  const probleem = klantWachtwoordProbleem(pass, email);
  if (probleem) return json({ ok: false, error: probleem }, 400);

  try {
    // Airtable dwingt uniekheid niet af, dus zelf controleren. Er blijft een
    // minieme race als twee registraties binnen milliseconden binnenkomen;
    // dat levert een dubbele rij op, geen beveiligingsprobleem. Login pakt
    // dan de eerste. Opruimen kan handmatig.
    if (await klantZoek(env, email))
      return json({ ok: false, error: "Dit e-mailadres is al geregistreerd." }, 409);

    const { base, table, hdr } = klantTabel(env);
    const nu = new Date().toISOString();
    const r = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: hdr,
      body: JSON.stringify({
        records: [{
          fields: {
            Email: email,
            PassHash: await hashPassword(pass, env),
            Naam: naam,
            // Nog geen tegoed: dat wordt uitgekeerd via /klant/onboarding,
            // pas nadat de klant de akkoorden heeft gegeven.
            Saldo: 0,
            TotaalGekocht: 0,
            Status: "actief",
            Aangemaakt: nu,
            LaatsteLogin: nu
          }
        }],
        typecast: true
      })
    });
    if (!r.ok) return json({ ok: false, error: "Aanmaken mislukt, probeer later opnieuw." }, 502);
    const d = await r.json();
    const rec = d && d.records && d.records[0];

    const t = await makeToken(env, email, "klant", naam || email);
    return json({ ok: true, ...t, klant: klantPubliek(rec) }, 201);
  } catch (e) {
    return klantFout(e, "Registratie mislukt.");
  }
}
__name(handleKlantRegistreer, "handleKlantRegistreer");

// ── POST /klant/login  { email, pass } ──────────────────────────────
async function handleKlantLogin(request, env, ctx) {
  if (!env.SESSION_SECRET) return json({ ok: false, error: "no_session_secret" }, 500);
  if (!env.AIRTABLE_TOKEN) return json({ ok: false, error: "no_airtable_token" }, 500);

  const ip = request.headers.get("CF-Connecting-IP") || "onbekend";
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const email = String(body.email || "").trim().toLowerCase();
  const pass = String(body.pass || "");

  const [rlA, rlI] = await Promise.all([
    rateLimit(env, "klant-login-acct", email || "leeg", RL.loginAccount, false),
    rateLimit(env, "klant-login-ip", ip, RL.loginIp, false)
  ]);
  if (rlA.limited) return rateLimitResponse(rlA);
  if (rlI.limited) return rateLimitResponse(rlI);

  const misser = async () => {
    await Promise.all([
      rateLimit(env, "klant-login-acct", email || "leeg", RL.loginAccount, true),
      rateLimit(env, "klant-login-ip", ip, RL.loginIp, true)
    ]);
    // Vertraging houdt het antwoord voor bestaande en niet-bestaande
    // accounts even traag, zodat de timing niets verraadt.
    await new Promise((r) => setTimeout(r, 500));
    return json({ ok: false, error: "E-mailadres of wachtwoord klopt niet." }, 401);
  };

  try {
    // Eerst het formaat controleren, pas daarna zoeken. klantZoek bouwt een
    // filterByFormula met de invoer erin, en de \'-escaping die daar gebruikt
    // wordt kent Airtable niet echt: een adres met een apostrof maakte er een
    // kapotte formule van. Dat gaf een 500 in plaats van een nette afwijzing —
    // en verraadde meteen dat je invoer iets deed. Nu valt het net als een
    // onbekend adres door naar misser(), inclusief dezelfde vertraging.
    const rec = klantEmailOk(email) ? await klantZoek(env, email) : null;
    if (!rec) return await misser();

    const f = rec.fields || {};
    const res = await verifyPassword(pass, f.PassHash);
    if (!res.ok) return await misser();

    if (f.Status === "geblokkeerd")
      return json({ ok: false, error: "Dit account is geblokkeerd." }, 403);

    // Oude hash tegengekomen? Stilletjes omzetten naar PBKDF2.
    const werk = [];
    if (res.legacy) werk.push(klantPatch(env, rec.id, { PassHash: await hashPassword(pass, env) }));
    werk.push(klantPatch(env, rec.id, { LaatsteLogin: new Date().toISOString() }));
    const job = Promise.all(werk).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;

    const t = await makeToken(env, email, "klant", f.Naam || email);
    return json({ ok: true, ...t, klant: klantPubliek(rec) });
  } catch (e) {
    return klantFout(e, "Inloggen mislukt.");
  }
}
__name(handleKlantLogin, "handleKlantLogin");

// ── GET /klant/mij ──────────────────────────────────────────────────
async function handleKlantMij(request, env) {
  const p = await klantAuth(request, env);
  if (!p) return json({ ok: false, error: "Niet ingelogd." }, 401);
  if (!env.AIRTABLE_TOKEN) return json({ ok: false, error: "no_airtable_token" }, 500);
  try {
    const rec = await klantZoek(env, p.u);
    if (!rec) return json({ ok: false, error: "Account niet gevonden." }, 404);
    return json({ ok: true, klant: klantPubliek(rec) });
  } catch (e) {
    return klantFout(e, "Ophalen mislukt.");
  }
}
__name(handleKlantMij, "handleKlantMij");

// ── POST /klant/wachtwoord  { huidig, nieuw }  (ingelogd) ───────────
async function handleKlantWachtwoord(request, env) {
  const p = await klantAuth(request, env);
  if (!p) return json({ ok: false, error: "Niet ingelogd." }, 401);

  const ip = request.headers.get("CF-Connecting-IP") || "onbekend";
  const rl = await rateLimit(env, "klant-pwwijzig", ip, { limit: 10, windowMs: 36e5 }, true);
  if (rl.limited) return rateLimitResponse(rl);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const huidig = String(body.huidig || "");
  const nieuw = String(body.nieuw || "");

  const probleem = klantWachtwoordProbleem(nieuw, p.u);
  if (probleem) return json({ ok: false, error: probleem }, 400);

  try {
    const rec = await klantZoek(env, p.u);
    if (!rec) return json({ ok: false, error: "Account niet gevonden." }, 404);
    const res = await verifyPassword(huidig, (rec.fields || {}).PassHash);
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, 500));
      return json({ ok: false, error: "Huidig wachtwoord klopt niet." }, 401);
    }
    // Openstaand herstelverzoek vervalt bij een geslaagde wijziging.
    await klantPatch(env, rec.id, {
      PassHash: await hashPassword(nieuw, env),
      ResetToken: "",
      ResetVerloopt: null
    });
    return json({ ok: true });
  } catch (e) {
    return klantFout(e, "Wijzigen mislukt.");
  }
}
__name(handleKlantWachtwoord, "handleKlantWachtwoord");

// ── POST /klant/reset-aanvraag  { email } ───────────────────────────
// Stuurt een herstelmail. In Airtable komt alleen de HASH van het token te
// staan: lekt de base ooit uit, dan kan niemand daarmee een account kapen.
async function handleKlantResetAanvraag(request, env) {
  if (!env.AIRTABLE_TOKEN) return json({ ok: false, error: "no_airtable_token" }, 500);

  const ip = request.headers.get("CF-Connecting-IP") || "onbekend";
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const email = String(body.email || "").trim().toLowerCase();

  // Per adres bewust streng: anders is dit endpoint een manier om iemands
  // mailbox vol te gooien. Tijdens testen kun je het tijdelijk verhogen met
  // de Worker-variabele RL_RESET.
  const rlReset = Math.max(1, Number(env.RL_RESET || 3));
  const [rlA, rlI] = await Promise.all([
    rateLimit(env, "klant-reset-acct", email || "leeg", { limit: rlReset, windowMs: 36e5 }, true),
    rateLimit(env, "klant-reset-ip", ip, { limit: Math.max(10, rlReset * 4), windowMs: 36e5 }, true)
  ]);
  if (rlA.limited) return rateLimitResponse(rlA);
  if (rlI.limited) return rateLimitResponse(rlI);

  if (!env.MAIL_API_KEY || !env.MAIL_FROM)
    return json({ ok: false, error: "mail_not_configured" }, 503);

  // Altijd hetzelfde antwoord, ongeacht of het account bestaat — anders is
  // dit endpoint een gratis controle of iemand klant is.
  const algemeen = json({ ok: true, bericht: "Als dit adres bij ons bekend is, staat er een herstelmail klaar." });
  if (!klantEmailOk(email)) return algemeen;

  try {
    const rec = await klantZoek(env, email);
    if (!rec) return algemeen;

    const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    const verloopt = new Date(Date.now() + 36e5);   // 1 uur
    await klantPatch(env, rec.id, {
      ResetToken: await sha256hex(token),
      ResetVerloopt: verloopt.toISOString()
    });

    const basis = String(env.APP_BASE_URL || "https://app.pidlane.nl").replace(/\/+$/, "");
    const link = `${basis}/?herstel=${token}`;
    const verstuurd = await klantMailVersturen(env, email, link);
    if (!verstuurd.ok) {
      // Naar buiten toe hetzelfde antwoord als bij een onbekend adres. Gaf dit
      // een 502 mét toelichting, dan was van buitenaf te zien of een adres bij
      // ons bekend is — een mislukte mail kan immers alleen bij een bestaand
      // account gebeuren. Dat is precies de gratis klantcontrole die de rest
      // van deze route juist probeert te voorkomen.
      //
      // De oorzaak gaat niet verloren: hij staat in de Workers Logs, en met een
      // geldig X-Admin-Token krijg je hem hier gewoon te zien.
      try {
        console.error("[klant] herstelmail mislukt (" + verstuurd.status + "): " + (verstuurd.detail || "geen toelichting"));
      } catch (_) {
      }
      if (adminOnly(request, env))
        return json({
          ok: false,
          error: "Versturen van de herstelmail mislukte.",
          detail: "mailprovider " + verstuurd.status + ": " + (verstuurd.detail || "geen toelichting")
        }, 502);
    }
    return algemeen;
  } catch (e) {
    return algemeen;
  }
}
__name(handleKlantResetAanvraag, "handleKlantResetAanvraag");

// Verstuurt via een REST-mailprovider (standaard Resend-formaat). Instelbaar
// met MAIL_API_URL, MAIL_API_KEY en MAIL_FROM. Geen provider = geen herstel
// per mail; gebruik dan /klant/admin-wachtwoord als noodklep.
async function klantMailVersturen(env, email, link) {
  try {
    const url = env.MAIL_API_URL || "https://api.resend.com/emails";
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MAIL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [email],
        subject: "Nieuw wachtwoord instellen voor PidLane",
        text:
          "Je hebt gevraagd om je PidLane-wachtwoord opnieuw in te stellen.\n\n" +
          link + "\n\n" +
          "Deze link verloopt over een uur en werkt eenmalig.\n" +
          "Heb je dit niet aangevraagd, dan hoef je niets te doen — je huidige " +
          "wachtwoord blijft gewoon geldig.\n"
      })
    });
    if (r.ok) return { ok: true };
    // De reden meenemen. Typische oorzaken: afzenderdomein niet geverifieerd,
    // sleutel zonder verzendrecht, of een adres dat de provider weigert.
    // Zonder deze tekst is een mislukte mail niet te diagnosticeren.
    const tekst = await r.text().catch(() => "");
    try { console.error("[klant] mail " + r.status + " :: " + tekst.slice(0, 300)); } catch (_) {}
    return { ok: false, status: r.status, detail: tekst.slice(0, 250) };
  } catch (e) {
    const det = String(e && e.message || e);
    try { console.error("[klant] mail netwerkfout :: " + det); } catch (_) {}
    return { ok: false, status: 0, detail: det };
  }
}
__name(klantMailVersturen, "klantMailVersturen");

// ── POST /klant/reset-uitvoeren  { token, pass } ────────────────────
async function handleKlantResetUitvoeren(request, env) {
  if (!env.AIRTABLE_TOKEN) return json({ ok: false, error: "no_airtable_token" }, 500);

  const ip = request.headers.get("CF-Connecting-IP") || "onbekend";
  const rl = await rateLimit(env, "klant-reset-doe", ip, { limit: 10, windowMs: 36e5 }, true);
  if (rl.limited) return rateLimitResponse(rl);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const token = String(body.token || "").trim().toLowerCase();
  const pass = String(body.pass || "");

  if (!/^[0-9a-f]{64}$/.test(token))
    return json({ ok: false, error: "Herstellink is ongeldig of verlopen." }, 400);

  try {
    const hash = await sha256hex(token);
    const { base, table, hdr } = klantTabel(env);
    const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}` +
      `?maxRecords=1&filterByFormula=${encodeURIComponent(`{ResetToken}='${hash}'`)}`;
    const r = await fetch(url, { headers: hdr });
    if (!r.ok) return json({ ok: false, error: "Controle mislukt." }, 502);
    const d = await r.json();
    const rec = d && d.records && d.records[0];
    if (!rec) return json({ ok: false, error: "Herstellink is ongeldig of verlopen." }, 400);

    const f = rec.fields || {};
    const verloopt = Date.parse(f.ResetVerloopt || "");
    if (!isFinite(verloopt) || Date.now() > verloopt) {
      await klantPatch(env, rec.id, { ResetToken: "", ResetVerloopt: null });
      return json({ ok: false, error: "Herstellink is verlopen. Vraag een nieuwe aan." }, 400);
    }

    // Wachtwoordeisen pas hier controleren: eerst moet het token kloppen,
    // anders is dit endpoint een manier om te testen of een token leeft.
    const probleem = klantWachtwoordProbleem(pass, f.Email);
    if (probleem) return json({ ok: false, error: probleem }, 400);

    await klantPatch(env, rec.id, {
      PassHash: await hashPassword(pass, env),
      ResetToken: "",
      ResetVerloopt: null
    });
    return json({ ok: true, bericht: "Wachtwoord is aangepast. Je kunt nu inloggen." });
  } catch (e) {
    return klantFout(e, "Herstellen mislukt.");
  }
}
__name(handleKlantResetUitvoeren, "handleKlantResetUitvoeren");

// ── POST /klant/admin-wachtwoord  { email, pass }  (X-Admin-Token) ──
// Noodklep zolang er geen mailprovider is ingesteld: jij zet handmatig een
// nieuw wachtwoord en geeft dat door. Ook bruikbaar als een klant vastloopt.
async function handleKlantAdminWachtwoord(request, env) {
  if (!adminOnly(request, env)) return json({ ok: false, error: "forbidden" }, 403);
  if (!env.AIRTABLE_TOKEN) return json({ ok: false, error: "no_airtable_token" }, 500);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const email = String(body.email || "").trim().toLowerCase();
  const pass = String(body.pass || "");

  if (!klantEmailOk(email)) return json({ ok: false, error: "Ongeldig e-mailadres." }, 400);
  const probleem = klantWachtwoordProbleem(pass, email);
  if (probleem) return json({ ok: false, error: probleem }, 400);

  try {
    const rec = await klantZoek(env, email);
    if (!rec) return json({ ok: false, error: "Account niet gevonden." }, 404);
    await klantPatch(env, rec.id, {
      PassHash: await hashPassword(pass, env),
      ResetToken: "",
      ResetVerloopt: null
    });
    return json({ ok: true });
  } catch (e) {
    return klantFout(e, "Wijzigen mislukt.");
  }
}
__name(handleKlantAdminWachtwoord, "handleKlantAdminWachtwoord");

// /klant/saldo-muteer is op 31-07-2026 verwijderd. Die route liet de app zelf
// tokens afboeken, maar afrekenen vanuit de client is een verzoek en geen
// controle. Sinds handleMessages serverzijdig afboekt op echt verbruik was hij
// niet alleen overbodig maar ook een risico: een oude, in de cache achtergebleven
// app-versie zou er dubbel mee boeken. Bijboeken kon er nooit mee — dat kan
// alleen via een geldige activatiecode op /credits/redeem.

// ═══════════════════════════════════════════════════════════════════
// ADMINBEHEER — klantaccounts en activatiecodes
// ═══════════════════════════════════════════════════════════════════
// Voor admin.html. Alles achter X-Admin-Token.

// ── GET /admin/klanten?q=zoekterm ───────────────────────────────────
async function handleAdminKlantenGet(request, env) {
  if (!adminOnly(request, env)) return json({ ok: false, error: "forbidden" }, 403);
  if (!env.AIRTABLE_TOKEN) return json({ ok: false, error: "no_airtable_token" }, 500);

  const q = String(new URL(request.url).searchParams.get("q") || "").trim().toLowerCase();
  const { base, table, hdr } = klantTabel(env);

  let url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?pageSize=100` +
    `&sort%5B0%5D%5Bfield%5D=Aangemaakt&sort%5B0%5D%5Bdirection%5D=desc`;
  if (q) {
    const e = q.replace(/'/g, "\\'");
    url += `&filterByFormula=${encodeURIComponent(
      `OR(SEARCH('${e}',LOWER({Email})),SEARCH('${e}',LOWER({Naam})))`
    )}`;
  }

  try {
    const r = await fetch(url, { headers: hdr });
    if (!r.ok) return json({ ok: false, error: "airtable_" + r.status }, 502);
    const d = await r.json();
    const klanten = (d.records || []).map((rec) => {
      const f = rec.fields || {};
      return {
        id: rec.id,
        email: f.Email || "",
        naam: f.Naam || "",
        saldo: Number(f.Saldo || 0),
        totaal: Number(f.TotaalGekocht || 0),
        status: f.Status || "actief",
        aangemaakt: f.Aangemaakt || "",
        laatsteLogin: f.LaatsteLogin || "",
        heeftReset: !!f.ResetToken
      };
    });
    const totaalSaldo = klanten.reduce((s, k) => s + k.saldo, 0);
    return json({ ok: true, klanten, stats: { aantal: klanten.length, totaalSaldo } });
  } catch (e) {
    return klantFout(e, "Ophalen mislukt.");
  }
}
__name(handleAdminKlantenGet, "handleAdminKlantenGet");

// ── POST /admin/klanten  { actie, ... } ─────────────────────────────
async function handleAdminKlantenPost(request, env) {
  if (!adminOnly(request, env)) return json({ ok: false, error: "forbidden" }, 403);
  if (!env.AIRTABLE_TOKEN) return json({ ok: false, error: "no_airtable_token" }, 500);

  let b = {};
  try { b = await request.json(); } catch (e) {}
  const actie = String(b.actie || "");
  const id = String(b.id || "");
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return json({ ok: false, error: "Ongeldig record-id." }, 400);

  const { base, table, hdr } = klantTabel(env);

  try {
    if (actie === "update") {
      const f = {};
      if (b.saldo !== undefined) {
        const s = Math.round(Number(b.saldo));
        if (!isFinite(s) || s < 0 || s > 1e6) return json({ ok: false, error: "Saldo buiten bereik." }, 400);
        f.Saldo = s;
      }
      if (b.status !== undefined) {
        if (!["actief", "ongeverifieerd", "geblokkeerd"].includes(String(b.status)))
          return json({ ok: false, error: "Onbekende status." }, 400);
        f.Status = String(b.status);
      }
      if (b.naam !== undefined) f.Naam = String(b.naam).slice(0, 80);
      if (b.opmerking !== undefined) f.Opmerking = String(b.opmerking).slice(0, 2000);
      if (!Object.keys(f).length) return json({ ok: false, error: "Niets om te wijzigen." }, 400);
      await klantPatch(env, id, f);
      return json({ ok: true });
    }

    if (actie === "wachtwoord") {
      const pass = String(b.pass || "");
      const probleem = klantWachtwoordProbleem(pass, "");
      if (probleem) return json({ ok: false, error: probleem }, 400);
      await klantPatch(env, id, {
        PassHash: await hashPassword(pass, env),
        ResetToken: "",
        ResetVerloopt: null
      });
      return json({ ok: true });
    }

    if (actie === "verwijder") {
      const r = await fetch(
        `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}/${id}`,
        { method: "DELETE", headers: hdr }
      );
      if (!r.ok) return json({ ok: false, error: "Verwijderen mislukt." }, 502);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Onbekende actie." }, 400);
  } catch (e) {
    return klantFout(e, "Bewerking mislukt.");
  }
}
__name(handleAdminKlantenPost, "handleAdminKlantenPost");

// ── GET /admin/codes?status=alle|open|gebruikt ───────────────────────
async function handleAdminCodesGet(request, env) {
  if (!adminOnly(request, env)) return json({ ok: false, error: "forbidden" }, 403);
  if (!env.AIRTABLE_TOKEN) return json({ ok: false, error: "no_airtable_token" }, 500);

  const sp = new URL(request.url).searchParams;
  const status = String(sp.get("status") || "alle");
  const base = resolveBase(env, "AIRTABLE_CONFIG_BASE");
  const table = cfg(env, "AIRTABLE_CODES_TABLE");
  const hdr = { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" };

  let url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?pageSize=100` +
    `&sort%5B0%5D%5Bfield%5D=Aangemaakt&sort%5B0%5D%5Bdirection%5D=desc`;
  if (status === "open") url += `&filterByFormula=${encodeURIComponent("NOT({Gebruikt})")}`;
  if (status === "gebruikt") url += `&filterByFormula=${encodeURIComponent("{Gebruikt}")}`;

  try {
    const r = await fetch(url, { headers: hdr });
    if (!r.ok) return json({ ok: false, error: "airtable_" + r.status }, 502);
    const d = await r.json();
    const codes = (d.records || []).map((rec) => {
      const f = rec.fields || {};
      return {
        id: rec.id,
        code: f.Code || "",
        credits: Number(f.Credits || 0),
        gebruikt: f.Gebruikt === true,
        gebruiktOp: f.GebruiktOp || "",
        gebruiktDoor: f.GebruiktDoor || "",
        batch: f.Batch || "",
        waarde: Number(f.Waarde || 0),
        vervalt: f.Vervalt || ""
      };
    });
    const open = codes.filter((c) => !c.gebruikt);
    const gebruikt = codes.filter((c) => c.gebruikt);
    return json({
      ok: true,
      codes,
      stats: {
        totaal: codes.length,
        open: open.length,
        gebruikt: gebruikt.length,
        openCredits: open.reduce((s, c) => s + c.credits, 0),
        omzet: gebruikt.reduce((s, c) => s + c.waarde, 0)
      }
    });
  } catch (e) {
    return klantFout(e, "Ophalen mislukt.");
  }
}
__name(handleAdminCodesGet, "handleAdminCodesGet");

// Tekenset zonder I, L, O, 0 en 1 — die worden verkeerd overgetypt.
var CODE_TEKENS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function maakActivatieCode() {
  const b = crypto.getRandomValues(new Uint8Array(10));
  let s = "PIDL-";
  for (let i = 0; i < 10; i++) {
    if (i === 4) s += "-";
    s += CODE_TEKENS[b[i] % CODE_TEKENS.length];
  }
  return s;
}
__name(maakActivatieCode, "maakActivatieCode");

// ── POST /admin/codes  { actie:'genereer'|'verwijder', ... } ─────────
async function handleAdminCodesPost(request, env) {
  if (!adminOnly(request, env)) return json({ ok: false, error: "forbidden" }, 403);
  if (!env.AIRTABLE_TOKEN) return json({ ok: false, error: "no_airtable_token" }, 500);

  let b = {};
  try { b = await request.json(); } catch (e) {}
  const actie = String(b.actie || "");
  const base = resolveBase(env, "AIRTABLE_CONFIG_BASE");
  const table = cfg(env, "AIRTABLE_CODES_TABLE");
  const hdr = { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" };

  try {
    if (actie === "verwijder") {
      const id = String(b.id || "");
      if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return json({ ok: false, error: "Ongeldig record-id." }, 400);
      const r = await fetch(
        `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}/${id}`,
        { method: "DELETE", headers: hdr }
      );
      if (!r.ok) return json({ ok: false, error: "Verwijderen mislukt." }, 502);
      return json({ ok: true });
    }

    if (actie === "genereer") {
      const aantal = Math.round(Number(b.aantal) || 0);
      const credits = Math.round(Number(b.credits) || 0);
      const prijs = Number(b.prijs) || 0;
      const batch = String(b.batch || "").trim().slice(0, 60) ||
        new Date().toISOString().slice(0, 10) + "-batch";
      const vervalt = String(b.vervalt || "").trim();

      if (aantal < 1 || aantal > 200) return json({ ok: false, error: "Aantal moet tussen 1 en 200 liggen." }, 400);
      if (credits < 1 || credits > 100000) return json({ ok: false, error: "Tokens per code buiten bereik." }, 400);
      if (vervalt && !/^\d{4}-\d{2}-\d{2}$/.test(vervalt))
        return json({ ok: false, error: "Vervaldatum moet JJJJ-MM-DD zijn." }, 400);

      const nu = new Date().toISOString();
      const nieuw = [];
      const gezien = new Set();
      while (nieuw.length < aantal) {
        const c = maakActivatieCode();
        if (gezien.has(c)) continue;
        gezien.add(c);
        nieuw.push(c);
      }

      // Airtable neemt maximaal 10 records per verzoek betrouwbaar aan bij
      // create; we doen 10 per keer zodat een grote batch niet halverwege
      // afbreekt op een limiet.
      const gemaakt = [];
      for (let i = 0; i < nieuw.length; i += 10) {
        const deel = nieuw.slice(i, i + 10).map((code) => ({
          fields: Object.assign(
            { Code: code, Credits: credits, Gebruikt: false, Batch: batch, Aangemaakt: nu },
            prijs > 0 ? { Waarde: prijs } : {},
            vervalt ? { Vervalt: vervalt } : {}
          )
        }));
        const r = await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`, {
          method: "POST",
          headers: hdr,
          body: JSON.stringify({ records: deel, typecast: true })
        });
        if (!r.ok) {
          const tekst = await r.text().catch(() => "");
          return json({
            ok: false,
            error: `Aanmaken gestopt na ${gemaakt.length} codes (Airtable ${r.status}). ` +
              `De al aangemaakte codes zijn geldig.`,
            codes: gemaakt,
            detail: tekst.slice(0, 300)
          }, 502);
        }
        const d = await r.json();
        (d.records || []).forEach((rec) => gemaakt.push((rec.fields || {}).Code));
      }

      return json({ ok: true, aantal: gemaakt.length, batch, credits, prijs, codes: gemaakt });
    }

    return json({ ok: false, error: "Onbekende actie." }, 400);
  } catch (e) {
    return klantFout(e, "Bewerking mislukt.");
  }
}
__name(handleAdminCodesPost, "handleAdminCodesPost");

// ── POST /klant/onboarding  { survey, anon, nieuwsbrief } ───────────
// Legt de akkoorden vast en keert daarna eenmalig het proeftegoed uit.
//
// AVG — twee soorten toestemming, bewust uit elkaar gehouden:
//   survey + anondata → functioneel. Dit is wat PidLane doet: je auto
//     uitlezen en geanonimiseerde meetwaarden gebruiken om de
//     referentiedatabase te voeden. Zonder dat is de app zinloos, dus dit
//     mag voorwaarde zijn.
//   nieuwsbrief → marketing. Dit mag NOOIT voorwaarde zijn voor het
//     proeftegoed. Toestemming moet vrij gegeven zijn (AVG art. 7 lid 4);
//     een beloning eraan koppelen maakt haar aanvechtbaar. De vraag staat
//     daarom in hetzelfde scherm, maar het vinkje is optioneel en het
//     tegoed komt er hoe dan ook.
async function handleKlantOnboarding(request, env) {
  const p = await klantAuth(request, env);
  if (!p) return json({ ok: false, error: "Niet ingelogd." }, 401);
  if (!env.AIRTABLE_TOKEN) return json({ ok: false, error: "no_airtable_token" }, 500);

  const ip = request.headers.get("CF-Connecting-IP") || "onbekend";
  const rl = await rateLimit(env, "klant-onboarding", ip, { limit: 20, windowMs: 36e5 }, true);
  if (rl.limited) return rateLimitResponse(rl);

  let b = {};
  try { b = await request.json(); } catch (e) {}

  if (b.survey !== true || b.anon !== true)
    return json({ ok: false, error: "Akkoord met uitlezen en geanonimiseerde data is nodig om PidLane te gebruiken." }, 400);

  try {
    const rec = await klantZoek(env, p.u);
    if (!rec) return json({ ok: false, error: "Account niet gevonden." }, 404);
    const f = rec.fields || {};

    const akkoorden = ["survey", "anondata"];
    if (b.nieuwsbrief === true) akkoorden.push("nieuwsbrief");

    const alGehad = f.StartTegoedGegeven === true;
    const bedrag = Math.max(0, Math.round(Number(env.KLANT_START_SALDO || 20)));
    const huidig = Number(f.Saldo || 0);
    const nieuw = alGehad ? huidig : huidig + bedrag;

    await klantPatch(env, rec.id, {
      Akkoorden: akkoorden,
      AkkoordOp: new Date().toISOString(),
      StartTegoedGegeven: true,
      Saldo: nieuw
    });

    return json({
      ok: true,
      saldo: nieuw,
      toegekend: alGehad ? 0 : bedrag,
      akkoorden
    });
  } catch (e) {
    return klantFout(e, "Vastleggen van je keuzes mislukte.");
  }
}
__name(handleKlantOnboarding, "handleKlantOnboarding");

var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      if (isRestrictedPath(url.pathname)) return lockOrigin(request, new Response(null, { headers: CORS }));
      return new Response(null, { headers: CORS });
    }
    try {
      if (url.pathname === "/auth/login" && request.method === "POST")
        return await handleLogin(request, env, ctx);
      if (url.pathname === "/v1/messages" && request.method === "POST")
        return await handleMessages(request, env);
      if (url.pathname === "/copilot" && request.method === "POST")
        return await handleCopilot(request, env);
      if (url.pathname === "/airtable/log" && request.method === "POST")
        return await handleAirtableLog(request, env);
      if (url.pathname === "/airtable/veldlab" && request.method === "POST")
        return await handleAirtableVeldlab(request, env);
      if (url.pathname === "/airtable/reference" && request.method === "POST")
        return await handleAirtableReference(request, env);
      if (url.pathname === "/session/create" && request.method === "POST")
        return lockOrigin(request, await handleSessionCreate(request, env));
      if (url.pathname === "/session/telemetry" && request.method === "POST")
        return lockOrigin(request, await handleSessionTelemetry(request, env));
      if (url.pathname === "/session/state" && request.method === "GET")
        return lockOrigin(request, await handleSessionState(request, env));
      if (url.pathname === "/session/connect" && request.method === "GET")
        return await handleSessionConnect(request, env);
      if (url.pathname === "/session/close" && request.method === "POST")
        return lockOrigin(request, await handleSessionClose(request, env));
      if (url.pathname === "/pair/create" && request.method === "POST")
        return lockOrigin(request, await handlePairCreate(request, env));
      if (url.pathname === "/pair/claim" && request.method === "POST")
        return lockOrigin(request, await handlePairClaim(request, env));
      if (url.pathname === "/pair/poll" && request.method === "GET")
        return lockOrigin(request, await handlePairPoll(request, env));
      if (url.pathname === "/code/create" && request.method === "POST")
        return lockOrigin(request, await handleCodeCreate(request, env));
      if (url.pathname === "/code/resolve" && request.method === "POST")
        return lockOrigin(request, await handleCodeResolve(request, env));
      if (url.pathname === "/admin/klanten" && request.method === "GET")
        return lockOrigin(request, await handleAdminKlantenGet(request, env));
      if (url.pathname === "/admin/klanten" && request.method === "POST")
        return lockOrigin(request, await handleAdminKlantenPost(request, env));
      if (url.pathname === "/admin/codes" && request.method === "GET")
        return lockOrigin(request, await handleAdminCodesGet(request, env));
      if (url.pathname === "/admin/codes" && request.method === "POST")
        return lockOrigin(request, await handleAdminCodesPost(request, env));
      if (url.pathname === "/klant/registreer" && request.method === "POST")
        return lockOrigin(request, await handleKlantRegistreer(request, env));
      if (url.pathname === "/klant/login" && request.method === "POST")
        return lockOrigin(request, await handleKlantLogin(request, env, ctx));
      if (url.pathname === "/klant/onboarding" && request.method === "POST")
        return lockOrigin(request, await handleKlantOnboarding(request, env));
      if (url.pathname === "/klant/mij" && request.method === "GET")
        return lockOrigin(request, await handleKlantMij(request, env));
      if (url.pathname === "/klant/wachtwoord" && request.method === "POST")
        return lockOrigin(request, await handleKlantWachtwoord(request, env));
      if (url.pathname === "/klant/reset-aanvraag" && request.method === "POST")
        return lockOrigin(request, await handleKlantResetAanvraag(request, env));
      if (url.pathname === "/klant/reset-uitvoeren" && request.method === "POST")
        return lockOrigin(request, await handleKlantResetUitvoeren(request, env));
      if (url.pathname === "/klant/admin-wachtwoord" && request.method === "POST")
        return lockOrigin(request, await handleKlantAdminWachtwoord(request, env));
      if (url.pathname === "/credits/redeem" && request.method === "POST")
        return lockOrigin(request, await handleCreditsRedeem(request, env));
      if (url.pathname === "/proxy" && request.method === "GET")
        return await handleProxy(request, env);
      if (url.pathname === "/api/config") {
        if (request.method === "GET") return lockOrigin(request, await handleConfigGet(request, env, ctx));
        if (request.method === "POST") return lockOrigin(request, await handleConfigPost(request, env, ctx));
      }
      if (url.pathname === "/admin/users") {
        if (request.method === "GET") return lockOrigin(request, await handleUsersGet(request, env));
        if (request.method === "POST") return lockOrigin(request, await handleUsersPost(request, env));
      }
      if (url.pathname === "/download/pidlane.apk" && request.method === "GET")
        return await handleApkDownload(request, env);
      if (url.pathname === "/version.json" && request.method === "GET")
        return await handleVersionJson(request, env);
      if (url.pathname === "/" || url.pathname === "/health")
        return json({ ok: true, service: "pidlane-proxy", ts: (/* @__PURE__ */ new Date()).toISOString() });
      return json({ error: "not_found", path: url.pathname }, 404);
    } catch (e) {
      return json({ error: "worker_exception", message: String(e && e.message || e) }, 500);
    }
  }
};
export {
  RemoteSessionDO,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
