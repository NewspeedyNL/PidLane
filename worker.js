/* ════════════════════════════════════════════════════════════════════
   PidLane Worker — VOLLEDIGE code
   Build: 2026-07-19 (CET) — KORTE MEEKIJK-CODE + VOERTUIGPROFIEL (vstate)

   NIEUW — KORTE SESSIECODE (naast QR en link):
     - POST /code/create  (account-auth, eigenaar): ruilt {sessionId, joinToken}
       in voor een 10-cijferige code. De code leeft precies zolang het
       joinToken/de sessie. Opgeslagen in een DO-instance met 'code:'-naam.
     - POST /code/resolve (account-auth, per-IP rate-limited): ruilt de code
       terug in voor {sessionId, joinToken} zodat de expert live kan aansluiten.
       Meervoudig bruikbaar binnen de looptijd (meerdere experts, één code).
     De code is nooit een schrijf-credential; de expert blijft alleen-lezen.

   NIEUW t.o.v. 2026-07-18 (alleen binnen RemoteSessionDO, alles verder
   byte-voor-byte gelijk):
     - de local mag 'vstate' sturen: zijn voertuigprofiel (supported PIDs,
       voertuiginfo, actieve selectie, sensor-gezondheid, foutcodes).
       De DO cachet het laatste snapshot (persistent) en fan-out't het live
       naar de expert(s); een later aanhakende expert krijgt het direct bij
       de WebSocket-handshake, meteen na de backfill.
     - sanitizeRequest kent 'request-vstate': de expert vraagt het snapshot
       opnieuw op. Puur lezen — geen enkel veld raakt de bus.

   NIEUW t.o.v. 2026-07-15 (alleen binnen RemoteSessionDO, alles verder
   byte-voor-byte gelijk):
     - sanitizeRequest kent nu ook:
         request-record  {action:'start'|'stop'|'csv', pids?≤24}
         request-analyze {problem:string≤500}
       Beide zijn puur lezen: de local start/stopt zijn EIGEN recorder en
       draait zijn EIGEN AI-analyse. Er blijft geen enkel veld waarin een
       schrijfactie (mode 04/08, UDS, rauwe hex) kan zitten.
     - de expert-branch accepteert die twee types (zelfde rate-limit + audit)
     - de local mag naast 'telemetry'/'response' nu ook 'record-status'
       sturen (live opname-teller) → fan-out naar de expert(s)

   NIEUW t.o.v. 2026-07-13: additieve remote-diagnose sessielaag.
     - Durable Object RemoteSessionDO (één per sessie)
     - POST /session/create, POST /session/telemetry, GET /session/state
     - sessie-scoped joinToken (sessierol 'expert', los van accountrol)
   Er verandert NIETS aan /auth, /v1/messages, /airtable/* of /admin/*.

   NIEUW: er staat geen vast APP_TOKEN meer in de client. De app logt in bij
   de Worker; die controleert het wachtwoord en geeft een HMAC-ondertekend
   sessietoken terug met vervaldatum. Dat token vervangt het oude APP_TOKEN
   als X-App-Token op alle routes. config.js mag daardoor publiek in de repo.

   Eén Worker die alles afhandelt tussen de PidLane-app en de externe API's,
   zodat er NOOIT geheimen (Anthropic-key, Airtable-token, wachtwoordhashes)
   in de client-app staan. De app praat alleen met deze Worker.

   ── ENDPOINTS ─────────────────────────────────────────────────────────
     POST /auth/login       → {user,pass} → sessietoken
     POST /v1/messages      → proxy naar Anthropic Claude API (AI-rapporten)
     POST /airtable/log     → schrijft logs/usage naar Airtable (Logs-tabel)
     POST /airtable/veldlab → schrijft veldlab-sessies/surveys (Veldlab-base, Sessies)
     POST /airtable/reference → UPSERT van gepromoveerde referentiedata per
                              voertuigcel (Veldlab-base, tabel Referentie). Merge
                              op RefID: een nieuwe bevestiging werkt de bestaande
                              rij bij i.p.v. een duplicaat aan te maken.
     POST /session/create   → start remote sessie → {sessionId, joinToken, localToken}
     POST /session/telemetry→ push telemetrie-frame de sessie in
     GET  /session/state    → lees metadata + recente frames (verificatie)
     GET  /session/connect  → WebSocket: expert sluit live aan (joinToken)
     POST /session/close    → eigenaar/admin sluit de sessie netjes af
     POST /code/create      → korte 10-cijferige meekijk-code → {code, exp}
     POST /code/resolve     → code → {sessionId, joinToken} (voor de expert)
     GET  /proxy?url=…      → doorgeef-proxy RDW/NHTSA (allowlist)
     GET  /api/config       → app haalt remote config op (gecached)
     POST /api/config       → admin.html schrijft config weg (admin-token)
     GET  /                 → simpele health-check

   ── ENV VARIABLES / SECRETS (Cloudflare → Settings → Variables) ────────
   Secrets (encrypted):
     SESSION_SECRET       Lange willekeurige string; ondertekent de
                          sessietokens EN de remote joinTokens.  openssl rand -base64 48
     USERS_JSON           De accounts als JSON op één regel:
                          {"Nico":{"passHash":"<sha256 hex>","role":"admin","label":"Nico"}}
                          passHash = SHA-256 (hex, lowercase) van het wachtwoord.
     ANTHROPIC_KEY        Anthropic API-key (sk-ant-…). Server-side fallback;
                          als de app zelf een key meestuurt, wint die.
     AIRTABLE_TOKEN       Airtable Personal Access Token (pat…). Moet toegang
                          hebben tot ALLE DRIE de bases hieronder.
     ADMIN_TOKEN          Lang, willekeurig admin-geheim. Vereist voor
                          POST /api/config.
     APP_TOKEN            LEGACY. Blijft tijdens de overgang geaccepteerd zodat
                          oude APK's niet breken. VERWIJDER dit secret zodra
                          alle apparaten de nieuwe app draaien — pas dán is het
                          publieke-token-gat echt dicht.

   ── DURABLE OBJECT BINDING ─────────────────────────────────────────────
     binding name  REMOTE_SESSION   class  RemoteSessionDO
     migratie      new_sqlite_classes = ["RemoteSessionDO"]
   Geen nieuw secret nodig — de joinTokens gebruiken het bestaande SESSION_SECRET.

   Plain vars (mogen gewoon zichtbaar):
     TOKEN_TTL_HOURS      = 12                 (optioneel, geldigheid sessietoken)
     AIRTABLE_LOG_BASE    = appdRasY8ZVJCMkPJ   (bestaande base met Logs)
     AIRTABLE_LOG_TABLE   = tblJiG83blVfRgPwi   (Logs-tabel)
     AIRTABLE_CONFIG_BASE = appUAuyRxK18T7ImK   (PidLane Config base)
     AIRTABLE_CONFIG_TABLE= AppConfig           (of tblNaQumXEuBMto1b)
     AIRTABLE_VL_BASE     = apphsUwG4WAeWjEwH   (PidLane Veldlab base)
     AIRTABLE_VL_TABLE    = tblwbyWN1L6AKwgoy   (Sessies-tabel — ruwe observaties)
     AIRTABLE_REF_TABLE   = tblkfxKcjR6gf0Ahe   (Referentie-tabel — alleen clean,
                                                 gepromoveerd na 2 bevestigingen)

   Als een var ontbreekt vallen we terug op de hardcoded defaults hieronder,
   zodat de Worker ook zonder alle vars blijft draaien.
   ════════════════════════════════════════════════════════════════════ */

// ── Vaste fallbacks (worden overschreven door env-vars als die bestaan) ──
const DEFAULTS = {
  AIRTABLE_LOG_BASE:     'appdRasY8ZVJCMkPJ',
  AIRTABLE_LOG_TABLE:    'tblJiG83blVfRgPwi',
  AIRTABLE_CONFIG_BASE:  'appUAuyRxK18T7ImK',
  AIRTABLE_CONFIG_TABLE: 'AppConfig',
  AIRTABLE_USERS_TABLE:  'Users',              // gebruikers (Config-base)
  AIRTABLE_VL_BASE:      'apphsUwG4WAeWjEwH',
  AIRTABLE_VL_TABLE:     'tblwbyWN1L6AKwgoy',
  AIRTABLE_REF_TABLE:    'tblkfxKcjR6gf0Ahe',   // Referentie-tabel (zelfde Veldlab-base)
};
function cfg(env, key) { return (env && env[key]) || DEFAULTS[key]; }

// Airtable base-id's beginnen ALTIJD met 'app'. Vangt typo's op (bv. een extra
// teken vooraan) door terug te vallen op een geldige bron of de default.
function resolveBase(env, primaryKey, fallbackKey) {
  const ok = v => typeof v === 'string' && /^app[A-Za-z0-9]{10,}$/.test(v);
  const cand = [env && env[primaryKey], fallbackKey && env && env[fallbackKey],
                DEFAULTS[primaryKey]].filter(Boolean);
  for (const c of cand) if (ok(c)) return c;
  return DEFAULTS[primaryKey];
}

// Anthropic-key kan onder verschillende secret-namen staan. Probeer ze allemaal,
// zodat een naamverschil (ANTHROPIC_API_KEY vs ANTHROPIC_KEY) niet de AI breekt.
function resolveAnthropicKey(env) {
  if (!env) return '';
  const names = ['ANTHROPIC_API_KEY', 'ANTHROPIC_KEY', 'CLAUDE_API_KEY', 'CLAUDE_KEY', 'Antrop Key', 'API_KEY'];
  for (const n of names) {
    const v = env[n];
    if (typeof v === 'string' && v.startsWith('sk-ant-')) return v;
  }
  // Laatste kans: elke sk-ant-… waarde in env
  for (const k in env) {
    const v = env[k];
    if (typeof v === 'string' && v.startsWith('sk-ant-')) return v;
  }
  return '';
}

// ── CORS ──
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-App-Token, X-Admin-Token, X-Join-Token, Authorization, anthropic-version',
  'Access-Control-Max-Age':       '86400',
};
function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  });
}

// ════════════════════════════════════════════════════════════════════
//  AUTH v2 — server-login met ondertekend sessietoken
//
//  Het oude model (één vast APP_TOKEN in de client) was onhoudbaar: de client
//  is publiek, dus het token was dat ook. Nu:
//    1. app POST /auth/login {user, pass}
//    2. Worker checkt SHA-256(pass) tegen USERS_JSON (secret)
//    3. Worker geeft HMAC-ondertekend token terug met vervaldatum
//    4. app stuurt dat token als X-App-Token mee naar alle routes
//
//  NIEUWE SECRETS:
//    SESSION_SECRET   lange willekeurige string (openssl rand -base64 48)
//    USERS_JSON       {"Nico":{"passHash":"<sha256 hex>","role":"admin","label":"Nico"}}
//  OPTIONEEL:
//    TOKEN_TTL_HOURS  geldigheidsduur, standaard 12
//
//  APP_TOKEN blijft tijdens de overgang geaccepteerd (zodat een oude APK niet
//  meteen breekt). Verwijder dat secret zodra alle apparaten geüpdatet zijn —
//  dán pas is het gat echt dicht.
// ════════════════════════════════════════════════════════════════════
const _enc = new TextEncoder();

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256hex(s) {
  const b = await crypto.subtle.digest('SHA-256', _enc.encode(String(s)));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

// ── R2: bestandsopslag (APK + later rapporten/logs) ───────────────────────
// Binding "FILES" → bucket "pidlane-files". Keys met prefix: apk/, reports/, logs/.

// Publieke APK-download: app.pidlane.nl/download/pidlane.apk
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

// Optioneel: version.json vanuit R2 serveren (dan bump je 'm met een r2 put,
// zonder redeploy). app.pidlane.nl/version.json
async function handleVersionJson(request, env) {
  if (!env.FILES) return json({ error: "no_r2_binding" }, 500);
  const obj = await env.FILES.get("apk/version.json");
  if (!obj || !obj.body) return json({ error: "version_not_found" }, 404);
  const headers = new Headers(CORS);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "public, max-age=60");
  return new Response(obj.body, { headers });
}


async function hmacSign(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw', _enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return b64url(await crypto.subtle.sign('HMAC', key, _enc.encode(msg)));
}

// Constante-tijd vergelijking — geen timing-lek op de handtekening.
function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function makeToken(env, user, role, label) {
  const ttl = Number(env.TOKEN_TTL_HOURS || 12) * 3600;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const payload = b64url(_enc.encode(JSON.stringify({ u: user, r: role, l: label, exp })));
  const sig = await hmacSign(env.SESSION_SECRET, payload);
  return { token: `${payload}.${sig}`, exp, user, role, label };
}

// b64url → string, UTF-8-veilig. (atob geeft ruwe bytes als 'binary string';
// direct JSON.parsen breekt op niet-ASCII zoals accenten in labels.)
function b64urlToString(s) {
  const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// Geldig token → payload-object {u,r,l,exp}. Anders null.
async function verifyToken(env, token) {
  try {
    if (!env.SESSION_SECRET) return null;
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    if (!safeEqual(sig, await hmacSign(env.SESSION_SECRET, payload))) return null;
    const p = JSON.parse(b64urlToString(payload));
    if (!p.exp || Math.floor(Date.now() / 1000) >= p.exp) return null;   // verlopen
    return p;
  } catch (_) { return null; }
}

// ── Centrale toegangscheck voor álle app-endpoints ──
// Retourneert een sessie-object bij toegang, anders null.
//   {u:'Nico', r:'admin'}  → server-login
//   {u:'legacy', r:'user'} → oud vast APP_TOKEN (overgangsperiode)
//   {u:'admin',  r:'admin'}→ admin.html met X-Admin-Token
async function auth(request, env) {
  const appTok   = request.headers.get('X-App-Token')   || '';
  const adminTok = request.headers.get('X-Admin-Token') || '';

  if (env.ADMIN_TOKEN && adminTok && safeEqual(adminTok, env.ADMIN_TOKEN))
    return { u: 'admin', r: 'admin', l: 'Admin' };
  if (env.ADMIN_TOKEN && appTok && safeEqual(appTok, env.ADMIN_TOKEN))
    return { u: 'admin', r: 'admin', l: 'Admin' };

  const s = await verifyToken(env, appTok);
  if (s) return s;

  // Overgang: oud vast token nog even toestaan zolang het secret bestaat.
  if (env.APP_TOKEN && appTok && safeEqual(appTok, env.APP_TOKEN))
    return { u: 'legacy', r: 'user', l: 'Legacy token' };

  // Niets ingesteld (verse Worker) → check overslaan i.p.v. alles blokkeren.
  if (!env.SESSION_SECRET && !env.APP_TOKEN && !env.ADMIN_TOKEN)
    return { u: 'open', r: 'admin', l: 'Geen auth ingesteld' };

  return null;
}

// ── Brute-force-rem op /auth/login (per isolate, per IP) ──
const _loginHits = new Map();
function loginRateLimited(ip) {
  const now = Date.now(), windowMs = 60_000, maxHits = 8;
  const arr = (_loginHits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now);
  _loginHits.set(ip, arr);
  return arr.length > maxHits;
}

// ════════════════════════════════════════════════════════════════════
//  GEBRUIKERSBRONNEN
//
//  1. USERS_JSON (Worker-secret) — de NOODINGANG. Blijft altijd werken, ook
//     als Airtable plat ligt of je per ongeluk je eigen account wist. Hierin
//     hoort alleen jouw admin-account te staan.
//  2. Airtable-tabel "Users" (Config-base) — beheerd via admin.html.
//
//  Bij een naamconflict wint USERS_JSON: je kunt jezelf dus niet buitensluiten
//  door in admin.html iets stoms te doen.
//
//  Tabel "Users" in base AIRTABLE_CONFIG_BASE, velden:
//    User (single line text)  – inlognaam, uniek
//    PassHash (single line)   – SHA-256 hex van het wachtwoord
//    Role (single line)       – admin | user | demo
//    Label (single line)      – weergavenaam
//    Active (checkbox)        – uit = kan niet inloggen
//
//  Deze tabel wordt NOOIT via /api/config uitgeserveerd — die route leest
//  alleen AIRTABLE_CONFIG_TABLE. De hashes blijven dus binnen de Worker.
// ════════════════════════════════════════════════════════════════════
async function airtableUsers(env) {
  if (!env.AIRTABLE_TOKEN) return {};
  const base  = resolveBase(env, 'AIRTABLE_CONFIG_BASE');
  const table = cfg(env, 'AIRTABLE_USERS_TABLE');
  const url   = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?pageSize=100`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
    if (!r.ok) return {};                       // tabel bestaat nog niet → fail-soft
    const data = await r.json();
    const out = {};
    for (const rec of (data.records || [])) {
      const f = rec.fields || {};
      const name = String(f.User || '').trim();
      if (!name) continue;
      if (f.Active === false) continue;         // uitgevinkt = geblokkeerd
      out[name] = {
        passHash: String(f.PassHash || '').trim().toLowerCase(),
        role:     String(f.Role || 'user').trim(),
        label:    String(f.Label || name).trim(),
        _id:      rec.id,
      };
    }
    return out;
  } catch (_) { return {}; }
}

async function allUsers(env) {
  const fromAirtable = await airtableUsers(env);
  let fromSecret = {};
  try { fromSecret = JSON.parse(env.USERS_JSON || '{}'); } catch (_) {}
  return { ...fromAirtable, ...fromSecret };    // secret wint altijd
}

// ════════════════════════════════════════════════════════════════════
//  0) POST /auth/login — wachtwoordcontrole → sessietoken
// ════════════════════════════════════════════════════════════════════
async function handleLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (loginRateLimited(ip)) return json({ error: 'rate_limited' }, 429);

  if (!env.SESSION_SECRET) return json({ error: 'no_session_secret' }, 500);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'bad_json' }, 400); }

  const user = String(body.user || '').trim();
  const pass = String(body.pass || '');

  const users = await allUsers(env);

  // Tolerant op de naam (hoofdletters/spaties/underscores), streng op het wachtwoord.
  const norm = s => String(s || '').trim().toLowerCase().replace(/[\s_]+/g, '');
  const key = Object.keys(users).find(k => k === user)
           || Object.keys(users).find(k => norm(k) === norm(user))
           || Object.keys(users).find(k => norm(users[k].label || '') === norm(user));

  const acc  = key ? users[key] : null;
  const hash = acc ? String(acc.passHash || '').trim().toLowerCase() : '';
  const ok   = acc && hash && safeEqual(await sha256hex(pass), hash);

  if (!ok) {
    await new Promise(r => setTimeout(r, 500)); // rem
    return json({ error: 'invalid_credentials' }, 401);
  }

  const t = await makeToken(env, key, acc.role || 'user', acc.label || key);
  return json(t, 200);
}

// ── Legacy-wrapper: bestaande routes blijven `appTokenOk` aanroepen ──
// (nu async → alle aanroepers gebruiken await)
async function appTokenOk(request, env) {
  return !!(await auth(request, env));
}

// ── In-memory rate-limit voor admin-POST (brute-force-rem, per isolate) ──
const _adminHits = new Map();
function adminRateLimited(ip) {
  const now = Date.now(), windowMs = 60_000, maxHits = 10;
  const arr = (_adminHits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now);
  _adminHits.set(ip, arr);
  return arr.length > maxHits;
}

// ── Brute-force-rem op /code/resolve (per isolate, per IP) ──
// Een 10-cijferige code is per definitie kort; deze rem + account-auth +
// korte looptijd maken blind raden onhaalbaar.
const _codeHits = new Map();
function codeResolveLimited(ip) {
  const now = Date.now(), windowMs = 60_000, maxHits = 20;
  const arr = (_codeHits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now);
  _codeHits.set(ip, arr);
  return arr.length > maxHits;
}

// ════════════════════════════════════════════════════════════════════
//  1) POST /v1/messages — Anthropic-proxy
// ════════════════════════════════════════════════════════════════════
async function handleMessages(request, env) {
  // Toegang via sessietoken (server-login), admin-token, of — tijdelijk — het
  // oude vaste APP_TOKEN. Zie auth() hierboven.
  const session = await auth(request, env);
  if (!session) return json({ error: 'unauthorized' }, 401);

  let payload;
  try { payload = await request.json(); }
  catch { return json({ error: 'bad_json' }, 400); }

  // Key-prioriteit: door de app meegestuurde key (Authorization/x-api-key) wint;
  // anders de server-side key (onder welke secret-naam dan ook opgeslagen).
  const clientKey =
    (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '') ||
    request.headers.get('x-api-key') || '';
  const apiKey = clientKey || resolveAnthropicKey(env);
  if (!apiKey) return json({ error: { message: 'Geen API-key beschikbaar in de Worker (check ANTHROPIC_API_KEY secret)' } }, 401);

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': request.headers.get('anthropic-version') || '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ════════════════════════════════════════════════════════════════════
//  2) POST /airtable/log — logs/usage naar Airtable (Logs-tabel)
//     De app stuurt de kale Airtable-body: {records:[...], typecast:true}
// ════════════════════════════════════════════════════════════════════
async function handleAirtableLog(request, env) {
  if (!(await appTokenOk(request, env))) return json({ error: 'unauthorized' }, 401);
  if (!env.AIRTABLE_TOKEN) return json({ error: 'no_airtable_token' }, 500);

  let payload;
  try { payload = await request.json(); }
  catch { return json({ error: 'bad_json' }, 400); }

  const base  = resolveBase(env, 'AIRTABLE_LOG_BASE', 'AIRTABLE_BASE');
  const table = cfg(env, 'AIRTABLE_LOG_TABLE');
  const url   = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      records: payload.records || [],
      typecast: payload.typecast !== false, // default true
    }),
  });

  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ════════════════════════════════════════════════════════════════════
//  2c) POST /airtable/veldlab — veldlab-sessies & full surveys naar de
//      base "PidLane Veldlab" (Sessies-tabel). Zelfde vorm als /airtable/log:
//      {records:[{fields:{...}}, ...]}. Max 10 records per request; het
//      JSON-veld wordt server-side begrensd op 95k tekens.
// ════════════════════════════════════════════════════════════════════
async function handleAirtableVeldlab(request, env) {
  if (!(await appTokenOk(request, env))) return json({ error: 'unauthorized' }, 401);
  if (!env.AIRTABLE_TOKEN) return json({ error: 'no_airtable_token' }, 500);

  let payload;
  try { payload = await request.json(); }
  catch { return json({ error: 'bad_json' }, 400); }

  const records = Array.isArray(payload.records) ? payload.records.slice(0, 10) : [];
  if (!records.length) return json({ error: 'no_records' }, 400);

  // Sanity: alleen fields-objecten doorlaten, JSON-veld begrenzen
  const clean = records.map(r => ({ fields: (r && typeof r.fields === 'object') ? r.fields : {} }));
  for (const r of clean) {
    if (typeof r.fields.JSON === 'string' && r.fields.JSON.length > 95000)
      r.fields.JSON = r.fields.JSON.slice(0, 95000);
  }

  const base  = resolveBase(env, 'AIRTABLE_VL_BASE');
  const table = cfg(env, 'AIRTABLE_VL_TABLE');
  const url   = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ records: clean, typecast: true }),
  });

  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ════════════════════════════════════════════════════════════════════
//  2d) POST /airtable/reference — gepromoveerde referentiedata (tabel
//      "Referentie" in de Veldlab-base). Payload als de andere Airtable-routes:
//      {records:[{fields:{...}}, ...]}.
//
//      VERSCHIL met /airtable/veldlab: dit is een UPSERT (PATCH met
//      performUpsert.fieldsToMergeOn = RefID). De app stuurt bij élke nieuwe
//      bevestiging de volledige, herberekende referentierij voor die
//      voertuigcel. Zonder merge geeft dat een duplicaat per bevestiging.
//
//      De kwaliteitspoort zit in de app (alleen quality clean/clean_warn en
//      >= 2 bevestigingen komen hier). Deze route checkt alleen het app-token
//      en de vorm van de payload.
// ════════════════════════════════════════════════════════════════════
async function handleAirtableReference(request, env) {
  if (!(await appTokenOk(request, env))) return json({ error: 'unauthorized' }, 401);
  if (!env.AIRTABLE_TOKEN) return json({ error: 'no_airtable_token' }, 500);

  let payload;
  try { payload = await request.json(); }
  catch { return json({ error: 'bad_json' }, 400); }

  const records = Array.isArray(payload.records) ? payload.records.slice(0, 10) : [];
  if (!records.length) return json({ error: 'no_records' }, 400);

  // Sanity: alleen fields-objecten, JSON begrenzen, en RefID verplicht — zonder
  // merge-sleutel zou Airtable stilzwijgend duplicaten aanmaken.
  const clean = [];
  for (const r of records) {
    const f = (r && typeof r.fields === 'object' && r.fields) ? r.fields : null;
    if (!f || typeof f.RefID !== 'string' || !f.RefID.trim()) continue;
    if (typeof f.JSON === 'string' && f.JSON.length > 95000) f.JSON = f.JSON.slice(0, 95000);
    clean.push({ fields: f });
  }
  if (!clean.length) return json({ error: 'no_valid_records', hint: 'RefID ontbreekt' }, 400);

  const base  = resolveBase(env, 'AIRTABLE_VL_BASE');
  const table = cfg(env, 'AIRTABLE_REF_TABLE');
  const url   = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;

  const r = await fetch(url, {
    method: 'PATCH',                                   // PATCH + performUpsert = upsert
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      performUpsert: { fieldsToMergeOn: ['RefID'] },
      records: clean,
      typecast: true,
    }),
  });

  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ════════════════════════════════════════════════════════════════════
//  2b) GET /proxy?url=… — generieke doorgeef-proxy voor publieke open data
//      (RDW kenteken/brandstof/recall + NHTSA VIN-decoder). Allowlist zodat
//      dit GEEN open proxy is. Zonder deze route faalt de RDW-lookup ("niet
//      bereikbaar") en de VIN-decode.
// ════════════════════════════════════════════════════════════════════
const PROXY_ALLOWED_HOSTS = ['opendata.rdw.nl', 'vpic.nhtsa.dot.gov'];

async function handleProxy(request, env) {
  if (!(await appTokenOk(request, env))) return json({ error: 'unauthorized' }, 401);

  const url = new URL(request.url);
  const target = url.searchParams.get('url') || '';
  if (!target) return json({ error: 'missing_url' }, 400);

  let t;
  try { t = new URL(target); }
  catch { return json({ error: 'bad_url' }, 400); }

  // Alleen https + toegestane hosts
  if (t.protocol !== 'https:' || !PROXY_ALLOWED_HOSTS.includes(t.hostname)) {
    return json({ error: 'host_not_allowed', host: t.hostname }, 403);
  }

  const r = await fetch(t.toString(), { headers: { Accept: 'application/json' } });
  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: {
      'Content-Type': r.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'public, max-age=300', // RDW-data verandert zelden
      ...CORS,
    },
  });
}

// ════════════════════════════════════════════════════════════════════
//  3a) GET /api/config — app haalt config op (publiek + app-token, gecached)
// ════════════════════════════════════════════════════════════════════
const CONFIG_CACHE_TTL = 60; // seconden edge-cache

async function handleConfigGet(request, env, ctx) {
  // Sessietoken, admin-token of (tijdelijk) het oude APP_TOKEN.
  if (!(await auth(request, env))) return json({ error: 'unauthorized' }, 401);

  // Edge-cache
  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/config', request.url).toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const base  = resolveBase(env, 'AIRTABLE_CONFIG_BASE');
  const table = cfg(env, 'AIRTABLE_CONFIG_TABLE');
  const url   = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?pageSize=100`;

  const r = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
  if (!r.ok) {
    // Fail-soft: lege config → app draait op z'n hardcoded fallback
    return json({}, 200);
  }
  const data = await r.json();
  const out = {};
  for (const rec of (data.records || [])) {
    const k = rec.fields?.Key;
    if (k) out[k] = rec.fields?.Value ?? '';
  }
  const resp = new Response(JSON.stringify(out), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CONFIG_CACHE_TTL}`,
      ...CORS,
    },
  });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

// ════════════════════════════════════════════════════════════════════
//  3b) POST /api/config — admin schrijft config (admin-token vereist)
//      Body: { items: [ {Key, Value, Description?}, ... ] }
// ════════════════════════════════════════════════════════════════════
async function handleConfigPost(request, env, ctx) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (adminRateLimited(ip)) return json({ error: 'rate_limited' }, 429);

  const adminTok = request.headers.get('X-Admin-Token') || '';
  if (!env.ADMIN_TOKEN || adminTok !== env.ADMIN_TOKEN) return json({ error: 'forbidden' }, 403);
  if (!env.AIRTABLE_TOKEN) return json({ error: 'no_airtable_token' }, 500);

  let payload;
  try { payload = await request.json(); }
  catch { return json({ error: 'bad_json' }, 400); }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return json({ error: 'no_items' }, 400);

  // Validatie
  const ALLOWED_KEYS = /^[a-z0-9_]{1,60}$/i;
  for (const it of items) {
    if (!it.Key || !ALLOWED_KEYS.test(it.Key)) return json({ error: 'invalid_key', key: it.Key }, 400);
    if (typeof it.Value === 'string' && it.Value.length > 5000) return json({ error: 'value_too_long', key: it.Key }, 400);
  }

  const base  = resolveBase(env, 'AIRTABLE_CONFIG_BASE');
  const table = cfg(env, 'AIRTABLE_CONFIG_TABLE');
  const baseUrl = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;

  // Bestaande records ophalen → bepalen update vs create (op Key)
  const lr = await fetch(`${baseUrl}?pageSize=100`, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
  if (!lr.ok) {
    const t = await lr.text().catch(() => '');
    return json({ error: 'airtable_list_failed', detail: t.slice(0, 200) }, 502);
  }
  const existing = await lr.json();
  const byKey = {};
  for (const rec of (existing.records || [])) {
    if (rec.fields?.Key) byKey[rec.fields.Key] = rec.id;
  }

  const toUpdate = [], toCreate = [];
  for (const it of items) {
    const fields = { Key: it.Key, Value: it.Value ?? '' };
    if (it.Description !== undefined) fields.Description = it.Description;
    if (byKey[it.Key]) toUpdate.push({ id: byKey[it.Key], fields });
    else toCreate.push({ fields });
  }

  const chunk = (arr, n) => arr.length ? [arr.slice(0, n), ...chunk(arr.slice(n), n)] : [];
  const results = [];

  for (const batch of chunk(toUpdate, 10)) {
    const r = await fetch(baseUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: batch, typecast: true }),
    });
    results.push({ op: 'update', ok: r.ok, status: r.status });
  }
  for (const batch of chunk(toCreate, 10)) {
    const r = await fetch(baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: batch, typecast: true }),
    });
    results.push({ op: 'create', ok: r.ok, status: r.status });
  }

  // Edge-cache van GET /api/config invalideren
  try {
    const cache = caches.default;
    const cacheKey = new Request(new URL('/api/config', request.url).toString(), { method: 'GET' });
    ctx.waitUntil(cache.delete(cacheKey));
  } catch (_) {}

  const allOk = results.every(x => x.ok);
  return json({ ok: allOk, results }, allOk ? 200 : 502);
}

// ════════════════════════════════════════════════════════════════════
//  4) /admin/users — gebruikersbeheer vanuit admin.html (ADMIN_TOKEN vereist)
//
//     GET  → lijst met gebruikers ZONDER hashes. Een wachtwoord is nergens
//            uitleesbaar, ook niet voor de admin — alleen te overschrijven.
//     POST → { action:'save',   user, pass?, role, label, active }
//            { action:'delete', user }
//
//     De Worker hasht het wachtwoord zelf (SHA-256), zodat admin.html geen
//     crypto hoeft te doen en er nooit een plaintext-wachtwoord in Airtable
//     belandt. Bestaand wachtwoord ongemoeid laten = pass leeg laten.
// ════════════════════════════════════════════════════════════════════
function adminOnly(request, env) {
  const t = request.headers.get('X-Admin-Token') || '';
  return !!(env.ADMIN_TOKEN && t && safeEqual(t, env.ADMIN_TOKEN));
}

async function handleUsersGet(request, env) {
  if (!adminOnly(request, env)) return json({ error: 'forbidden' }, 403);
  if (!env.AIRTABLE_TOKEN)      return json({ error: 'no_airtable_token' }, 500);

  const base  = resolveBase(env, 'AIRTABLE_CONFIG_BASE');
  const table = cfg(env, 'AIRTABLE_USERS_TABLE');
  const url   = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?pageSize=100`;

  const r = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    return json({ error: 'airtable_list_failed', detail: t.slice(0, 300) }, 502);
  }
  const data = await r.json();
  const users = (data.records || []).map(rec => {
    const f = rec.fields || {};
    return {
      id:      rec.id,
      user:    f.User  || '',
      role:    f.Role  || 'user',
      label:   f.Label || f.User || '',
      active:  f.Active !== false,
      hasPass: !!(f.PassHash && String(f.PassHash).trim()),
    };
  }).filter(u => u.user);

  // Noodingang tonen zodat je ziet dat hij bestaat — maar niet bewerkbaar.
  let locked = [];
  try {
    const s = JSON.parse(env.USERS_JSON || '{}');
    locked = Object.keys(s).map(k => ({
      user: k, role: s[k].role || 'user', label: s[k].label || k, locked: true,
    }));
  } catch (_) {}

  return json({ users, locked }, 200);
}

async function handleUsersPost(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (adminRateLimited(ip))     return json({ error: 'rate_limited' }, 429);
  if (!adminOnly(request, env)) return json({ error: 'forbidden' }, 403);
  if (!env.AIRTABLE_TOKEN)      return json({ error: 'no_airtable_token' }, 500);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'bad_json' }, 400); }

  const action = String(body.action || 'save');
  const user   = String(body.user || '').trim();
  if (!user) return json({ error: 'no_user' }, 400);
  if (!/^[A-Za-z0-9 ._-]{2,40}$/.test(user)) return json({ error: 'invalid_user' }, 400);

  // Namen uit USERS_JSON zijn niet via Airtable te overschrijven of te wissen:
  // dat zou de noodingang stiekem kunnen ondermijnen.
  try {
    const s = JSON.parse(env.USERS_JSON || '{}');
    if (Object.keys(s).some(k => k.toLowerCase() === user.toLowerCase()))
      return json({ error: 'locked_user', hint: 'Deze naam staat in USERS_JSON en wordt daar beheerd.' }, 409);
  } catch (_) {}

  const base    = resolveBase(env, 'AIRTABLE_CONFIG_BASE');
  const table   = cfg(env, 'AIRTABLE_USERS_TABLE');
  const baseUrl = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;

  // Bestaande rij zoeken (op naam)
  const lr = await fetch(`${baseUrl}?pageSize=100`, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
  if (!lr.ok) {
    const t = await lr.text().catch(() => '');
    return json({ error: 'airtable_list_failed', detail: t.slice(0, 300) }, 502);
  }
  const existing = await lr.json();
  const hit = (existing.records || []).find(
    rec => String(rec.fields?.User || '').trim().toLowerCase() === user.toLowerCase()
  );

  // ── verwijderen ──
  if (action === 'delete') {
    if (!hit) return json({ error: 'not_found' }, 404);
    const dr = await fetch(`${baseUrl}?records[]=${hit.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` },
    });
    if (!dr.ok) {
      const t = await dr.text().catch(() => '');
      return json({ error: 'airtable_delete_failed', detail: t.slice(0, 300) }, 502);
    }
    return json({ ok: true, deleted: user }, 200);
  }

  // ── opslaan / bijwerken ──
  const pass = String(body.pass || '');
  const role = ['admin', 'user', 'demo'].includes(String(body.role)) ? String(body.role) : 'user';

  if (!hit && !pass) return json({ error: 'pass_required', hint: 'Nieuwe gebruiker heeft een wachtwoord nodig.' }, 400);
  if (pass && pass.length < 8) return json({ error: 'pass_too_short', hint: 'Minimaal 8 tekens.' }, 400);

  const fields = {
    User:   user,
    Role:   role,
    Label:  String(body.label || user).trim(),
    Active: body.active !== false,
  };
  if (pass) fields.PassHash = await sha256hex(pass);   // leeg = huidige hash blijft

  const r = hit
    ? await fetch(baseUrl, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: [{ id: hit.id, fields }], typecast: true }),
      })
    : await fetch(baseUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: [{ fields }], typecast: true }),
      });

  if (!r.ok) {
    const t = await r.text().catch(() => '');
    return json({ error: 'airtable_write_failed', detail: t.slice(0, 300) }, 502);
  }
  return json({ ok: true, user, created: !hit, passChanged: !!pass }, 200);
}

// ════════════════════════════════════════════════════════════════════
//  REMOTE DIAGNOSE — sessie aanmaken + telemetrie pushen
//
//  Volledig additief. Niets aan bestaande routes verandert.
//
//    POST /session/create      (account-auth: user/admin, niet demo)
//        body: { ttlMin?, vehicle? }
//        → { sessionId, sessionRole:'local', joinToken, exp }
//        Maakt een RemoteSessionDO (één DO per sessie) en geeft een
//        sessie-scoped joinToken terug voor de expert.
//
//    POST /session/telemetry   (account-auth; caller moet de eigenaar zijn)
//        body: { sessionId, data }
//        → { ok, n, t }   — pusht één telemetrie-frame de sessie in.
//
//    GET  /session/state?id=…&since=…   (eigenaar via X-App-Token
//        OF geldig X-Join-Token / ?jt= voor precies deze sessie)
//        → { meta, frames, serverTime } — puur om te verifiëren dat de
//        datastroom loopt.
//
//  Accountrol (admin/user/demo) en sessierol (local/expert) zijn hier al
//  gescheiden: het joinToken draagt de sessierol, los van het account.
//
//  Nodig buiten dit bestand (zie deploy-notitie):
//    durable_objects binding  name="REMOTE_SESSION"  class_name="RemoteSessionDO"
//    migratie                 new_sqlite_classes = ["RemoteSessionDO"]
//  Gebruikt het bestaande SESSION_SECRET — geen nieuw secret nodig.
// ════════════════════════════════════════════════════════════════════

// Eén DO-stub per sessie-id (stabiele naam → altijd dezelfde instance).
function sessionStub(env, sid) {
  const id = env.REMOTE_SESSION.idFromName(sid);
  return env.REMOTE_SESSION.get(id);
}

// Sessie-scoped token (draagt de SESSIEROL, los van de accountrol).
// exp in seconden, net als makeToken() hierboven.
async function makeJoinToken(env, sid, sessionRole, exp) {
  const payload = b64url(_enc.encode(JSON.stringify({ sid, sr: sessionRole, exp })));
  const sig = await hmacSign(env.SESSION_SECRET, payload);
  return `${payload}.${sig}`;
}
async function verifyJoinToken(env, token) {
  try {
    if (!env.SESSION_SECRET) return null;
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    if (!safeEqual(sig, await hmacSign(env.SESSION_SECRET, payload))) return null;
    const p = JSON.parse(b64urlToString(payload));
    if (!p.sid || !p.exp || Math.floor(Date.now() / 1000) >= p.exp) return null;
    return p; // { sid, sr, exp }
  } catch (_) { return null; }
}

// ── POST /session/create ──
async function handleSessionCreate(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (session.r === 'demo') return json({ error: 'forbidden_role', hint: 'demo mag geen sessie delen' }, 403);
  if (!env.REMOTE_SESSION) return json({ error: 'no_do_binding', hint: 'REMOTE_SESSION binding ontbreekt' }, 500);

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const nowS = Math.floor(Date.now() / 1000);
  const ttlM = Math.min(Math.max(Number(body.ttlMin) || 120, 5), 480);   // 5min–8u
  const exp  = nowS + ttlM * 60;

  // 12 hex-tekens + de DO weigert create op een nog-open sessie (409). Zo kan
  // een botsend id nooit stilletjes andermans lopende sessie overschrijven.
  let sid = '', created = false;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    sid = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const r = await sessionStub(env, sid).fetch('https://do/create', {
      method: 'POST',
      body: JSON.stringify({
        sid,
        owner:      session.u,
        ownerLabel: session.l || session.u,
        exp,
        vehicle:    body.vehicle || null,
      }),
    });
    if (r.ok) created = true;
    else if (r.status !== 409) return json({ error: 'session_create_failed', status: r.status }, 502);
  }
  if (!created) return json({ error: 'session_create_failed', hint: 'sid-botsingen' }, 502);

  const joinToken  = await makeJoinToken(env, sid, 'expert', exp);
  const localToken = await makeJoinToken(env, sid, 'local',  exp);
  return json({ ok: true, sessionId: sid, sessionRole: 'local', joinToken, localToken, exp }, 200);
}

// ── POST /session/telemetry ──
async function handleSessionTelemetry(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (!env.REMOTE_SESSION) return json({ error: 'no_do_binding' }, 500);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'bad_json' }, 400); }
  const sid = String(body.sessionId || '').trim();
  if (!sid) return json({ error: 'no_session_id' }, 400);

  const stub = sessionStub(env, sid);
  const r = await stub.fetch('https://do/telemetry', {
    method: 'POST',
    body: JSON.stringify({ by: session.u, data: body.data }),
  });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

// ── GET /session/state?id=…&since=… ──
async function handleSessionState(request, env) {
  const url = new URL(request.url);
  const sid = String(url.searchParams.get('id') || '').trim();
  if (!sid) return json({ error: 'no_session_id' }, 400);
  if (!env.REMOTE_SESSION) return json({ error: 'no_do_binding' }, 500);

  // Toegang: geldig joinToken voor precies deze sessie, óf een ingelogd account.
  // De DO dwingt daarna eigenaarschap af: alleen de eigenaar of een admin mag
  // via account-auth lezen — een willekeurige ingelogde gebruiker dus niet.
  const session = await auth(request, env);
  const jt = request.headers.get('X-Join-Token') || url.searchParams.get('jt') || '';
  let viaJt = false;
  if (jt) {
    const p = await verifyJoinToken(env, jt);
    viaJt = !!(p && p.sid === sid);
  }
  if (!session && !viaJt) return json({ error: 'unauthorized' }, 401);

  const stub  = sessionStub(env, sid);
  const since = url.searchParams.get('since') || '0';
  const doUrl = new URL('https://do/state');
  doUrl.searchParams.set('since', since);
  if (viaJt) doUrl.searchParams.set('via', 'jt');
  else { doUrl.searchParams.set('u', session.u); doUrl.searchParams.set('r', session.r); }
  const r = await stub.fetch(doUrl.toString());
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

// ── GET /session/connect (WebSocket) — expert sluit live aan op de sessie ──
// De expert legitimeert zich met het sessie-scoped joinToken (query ?jt=…),
// niet met een account. De Worker valideert het token en reikt de upgrade door
// aan de DO, die de WebSocket accepteert, meteen backfill stuurt en daarna live
// frames fan-out. (Token in de URL: het is kortlevend en enkel geldig voor deze
// ene sessie; browsers laten geen custom headers toe op een WebSocket-handshake,
// vandaar de query-param i.p.v. een X-Join-Token header.)
async function handleSessionConnect(request, env) {
  if (request.headers.get('Upgrade') !== 'websocket')
    return json({ error: 'expected_websocket' }, 426);

  const url = new URL(request.url);
  const sid = String(url.searchParams.get('id') || '').trim();
  const jt  = url.searchParams.get('jt') || request.headers.get('X-Join-Token') || '';
  if (!sid) return json({ error: 'no_session_id' }, 400);
  if (!env.REMOTE_SESSION) return json({ error: 'no_do_binding' }, 500);

  // Rol bepalen: geldig joinToken voor deze sessie → sessierol (expert). Anders
  // de eigenaar via app-token (werkt niet vanuit een browser, wel voor niet-
  // browser clients). Zonder één van beide: geen toegang.
  let role = null;
  const p = await verifyJoinToken(env, jt);
  if (p && p.sid === sid) role = p.sr || 'expert';
  else if (await auth(request, env)) role = 'owner';
  if (!role) return json({ error: 'unauthorized' }, 401);

  const stub  = sessionStub(env, sid);
  const doUrl = new URL('https://do/connect');
  doUrl.searchParams.set('role', role);
  return stub.fetch(new Request(doUrl, request));   // reik de WS-upgrade door aan de DO
}

// ── POST /session/close — eigenaar (of admin) sluit de sessie netjes af ──
async function handleSessionClose(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (!env.REMOTE_SESSION) return json({ error: 'no_do_binding' }, 500);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'bad_json' }, 400); }
  const sid = String(body.sessionId || '').trim();
  if (!sid) return json({ error: 'no_session_id' }, 400);

  const r = await sessionStub(env, sid).fetch('https://do/close', {
    method: 'POST',
    body: JSON.stringify({ u: session.u, r: session.r }),
  });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

// ════════════════════════════════════════════════════════════════════
//  QR-PAIRING — omgekeerde koppeling: expert toont QR, local scant.
//
//  Twee gescheiden geheimen, bewust asymmetrisch:
//    claimToken  → zit in de QR. Mag ALLEEN sessie-info deponeren.
//    pollToken   → blijft op het expert-toestel. Mag ALLEEN ophalen.
//  Een foto van de QR levert dus nooit meekijkrechten op — het joinToken
//  reist uitsluitend via de poll-kant terug naar wie de pairing aanmaakte.
//
//  Opslag: hergebruik van de RemoteSessionDO-binding met een 'pair:'-prefix
//  in de DO-naam (aparte namespace, geen nieuwe class → geen migratie).
//  TTL 10 minuten; een pairing is éénmalig (claim op een al-geclaimde of
//  verlopen pairing wordt geweigerd).
//
//    POST /pair/create           (account-auth, niet demo) → {pairId, claimToken, pollToken, exp}
//    POST /pair/claim            (account-auth) {pairId, claimToken, sessionId, joinToken} → {ok}
//    GET  /pair/poll?id=…&pt=…   (pollToken) → {status:'waiting'|'ready'|'expired', sessionId?, joinToken?}
// ════════════════════════════════════════════════════════════════════
function pairStub(env, pairId) {
  const id = env.REMOTE_SESSION.idFromName('pair:' + pairId);
  return env.REMOTE_SESSION.get(id);
}
function randHex(n) {
  const b = new Uint8Array(n); crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function handlePairCreate(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (session.r === 'demo') return json({ error: 'forbidden_role' }, 403);
  if (!env.REMOTE_SESSION) return json({ error: 'no_do_binding' }, 500);

  const pairId     = randHex(5);          // 10 hex-tekens
  const claimToken = randHex(16);
  const pollToken  = randHex(16);
  const exp        = Math.floor(Date.now() / 1000) + 600;   // 10 min

  const r = await pairStub(env, pairId).fetch('https://do/pair-create', {
    method: 'POST',
    body: JSON.stringify({ claimToken, pollToken, exp, by: session.u }),
  });
  if (!r.ok) return json({ error: 'pair_create_failed', status: r.status }, 502);
  return json({ ok: true, pairId, claimToken, pollToken, exp }, 200);
}

async function handlePairClaim(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (!env.REMOTE_SESSION) return json({ error: 'no_do_binding' }, 500);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'bad_json' }, 400); }
  const pairId = String(body.pairId || '').trim();
  if (!/^[0-9a-f]{10}$/.test(pairId)) return json({ error: 'bad_pair_id' }, 400);

  const r = await pairStub(env, pairId).fetch('https://do/pair-claim', {
    method: 'POST',
    body: JSON.stringify({
      claimToken: String(body.claimToken || ''),
      sessionId:  String(body.sessionId  || '').slice(0, 20),
      joinToken:  String(body.joinToken  || '').slice(0, 600),
      by: session.u,
    }),
  });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

async function handlePairPoll(request, env) {
  if (!env.REMOTE_SESSION) return json({ error: 'no_do_binding' }, 500);
  const url = new URL(request.url);
  const pairId = String(url.searchParams.get('id') || '').trim();
  const pt     = String(url.searchParams.get('pt') || '');
  if (!/^[0-9a-f]{10}$/.test(pairId)) return json({ error: 'bad_pair_id' }, 400);

  const doUrl = new URL('https://do/pair-poll');
  doUrl.searchParams.set('pt', pt);
  const r = await pairStub(env, pairId).fetch(doUrl.toString());
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

// ════════════════════════════════════════════════════════════════════
//  KORTE MEEKIJK-CODE — 10 cijfers, makkelijk voor te lezen/door te bellen.
//
//  De local (eigenaar) ruilt zijn {sessionId, joinToken} in voor een korte
//  code (/code/create). De expert typt de code en ruilt hem terug in voor
//  het joinToken (/code/resolve), waarna de normale WebSocket-flow start.
//  Beveiliging: het joinToken wordt server-side geverifieerd tegen de sid
//  vóór er een code uitgaat; resolve vereist een account-login én is per-IP
//  gerate-limit; de code vervalt met de sessie. Read-only blijft read-only.
// ════════════════════════════════════════════════════════════════════
function codeStub(env, code) {
  const id = env.REMOTE_SESSION.idFromName('code:' + code);
  return env.REMOTE_SESSION.get(id);
}
// Uniforme cijfers zonder modulo-bias (bytes ≥250 verwerpen: 250 = 25×10).
function randDigits(n) {
  let out = '';
  while (out.length < n) {
    const b = new Uint8Array(n);
    crypto.getRandomValues(b);
    for (let i = 0; i < b.length && out.length < n; i++) if (b[i] < 250) out += (b[i] % 10);
  }
  return out;
}

async function handleCodeCreate(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (session.r === 'demo') return json({ error: 'forbidden_role', hint: 'demo mag geen sessie delen' }, 403);
  if (!env.REMOTE_SESSION) return json({ error: 'no_do_binding' }, 500);

  let body = {};
  try { body = await request.json(); } catch (_) {}
  const sessionId = String(body.sessionId || '').trim();
  const joinToken = String(body.joinToken || '').trim();
  if (!sessionId || !joinToken) return json({ error: 'missing_session' }, 400);

  // Het joinToken moet echt zijn ÉN bij deze sid horen (sessierol expert).
  // Zo kan niemand een verzonnen code→sessie-mapping parkeren.
  const p = await verifyJoinToken(env, joinToken);
  if (!p || p.sid !== sessionId || p.sr !== 'expert') return json({ error: 'bad_join_token' }, 403);
  const exp = p.exp;   // code leeft precies zolang het joinToken/de sessie

  // 10-cijferige code; de DO weigert een botsende, nog-geldige code (409) →
  // een paar pogingen, dan opgeven. Botsing is met 10^10 sowieso zeldzaam.
  let code = '', ok = false;
  for (let i = 0; i < 5 && !ok; i++) {
    code = randDigits(10);
    const r = await codeStub(env, code).fetch('https://do/code-put', {
      method: 'POST',
      body: JSON.stringify({ sessionId, joinToken, exp, by: session.u }),
    });
    if (r.ok) ok = true;
    else if (r.status !== 409) return json({ error: 'code_create_failed', status: r.status }, 502);
  }
  if (!ok) return json({ error: 'code_create_failed', hint: 'botsingen' }, 502);
  return json({ ok: true, code, exp }, 200);
}

async function handleCodeResolve(request, env) {
  const session = await auth(request, env);
  if (!session) return json({ error: 'unauthorized' }, 401);
  if (!env.REMOTE_SESSION) return json({ error: 'no_do_binding' }, 500);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (codeResolveLimited(ip)) return json({ error: 'rate_limited' }, 429);

  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const code = String(body.code || '').replace(/\D/g, '');   // scheidingstekens weg
  if (!/^\d{10}$/.test(code)) return json({ error: 'bad_code' }, 400);

  const r = await codeStub(env, code).fetch('https://do/code-get');
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

// ════════════════════════════════════════════════════════════════════
//  Durable Object: RemoteSessionDO — één instance per sessie.
//  Houdt de sessie-metadata (persistent in DO-storage) en een ring van
//  recente telemetrie-frames. Expert-WebSocket(s) krijgen frames meteen
//  ge-fan-out.
//
//  Interne ops (alleen bereikbaar via de Worker, niet publiek):
//    POST create     {sid, owner, ownerLabel, exp, vehicle}
//    POST telemetry  {by, data}
//    GET  state?since=…
//    POST close
// ════════════════════════════════════════════════════════════════════
export class RemoteSessionDO {
  constructor(ctx, env) {
    this.ctx   = ctx;
    this.env   = env;
    this.frames = [];
    this.MAX_FRAMES = 50;      // kleine recente ring — genoeg voor backfill bij join
    this._meta = null;
    this.vstate = null;        // laatst bekende voertuigprofiel van de local
    // Laad persistente staat bij (her)start, zodat een recycle van de DO
    // transparant is: zowel meta ALS de recente frames overleven eviction.
    // blockConcurrencyWhile houdt inkomende requests tegen tot dit klaar is.
    this.ctx.blockConcurrencyWhile(async () => {
      this._meta  = (await this.ctx.storage.get('meta'))   || null;
      this.frames = (await this.ctx.storage.get('frames')) || [];
      this.audit  = (await this.ctx.storage.get('audit'))  || [];
      this.vstate = (await this.ctx.storage.get('vstate')) || null;
    });
  }

  async fetch(request) {
    // WebSocket-handshake (expert/owner sluit live aan) — vóór de op-routing.
    if (request.headers.get('Upgrade') === 'websocket') return this.handleConnect(request);

    const url = new URL(request.url);
    const op  = url.pathname.split('/').pop();

    // ── QR-pairing-ops (DO-instances met 'pair:'-naam; eigen storage-keys) ──
    if (op === 'pair-create') {
      const b = await request.json();
      await this.ctx.storage.put('pair', {
        claimToken: b.claimToken, pollToken: b.pollToken,
        exp: b.exp, by: b.by, status: 'waiting',
      });
      return Response.json({ ok: true });
    }
    if (op === 'pair-claim') {
      const b = await request.json();
      const p = await this.ctx.storage.get('pair');
      if (!p) return Response.json({ error: 'no_pairing' }, { status: 404 });
      if (Math.floor(Date.now() / 1000) >= p.exp) return Response.json({ error: 'expired' }, { status: 410 });
      if (p.status !== 'waiting') return Response.json({ error: 'already_claimed' }, { status: 409 });
      if (!safeEqual(b.claimToken, p.claimToken)) return Response.json({ error: 'bad_claim_token' }, { status: 403 });
      if (!b.sessionId || !b.joinToken) return Response.json({ error: 'missing_session' }, { status: 400 });
      p.status = 'ready'; p.sessionId = b.sessionId; p.joinToken = b.joinToken; p.claimedBy = b.by;
      await this.ctx.storage.put('pair', p);
      return Response.json({ ok: true });
    }
    if (op === 'pair-poll') {
      const p = await this.ctx.storage.get('pair');
      if (!p) return Response.json({ error: 'no_pairing' }, { status: 404 });
      if (!safeEqual(url.searchParams.get('pt') || '', p.pollToken))
        return Response.json({ error: 'bad_poll_token' }, { status: 403 });
      if (Math.floor(Date.now() / 1000) >= p.exp && p.status !== 'ready')
        return Response.json({ status: 'expired' });
      if (p.status !== 'ready') return Response.json({ status: 'waiting' });
      // Eénmalig uitleveren en meteen opruimen — daarna is de pairing op.
      await this.ctx.storage.delete('pair');
      return Response.json({ status: 'ready', sessionId: p.sessionId, joinToken: p.joinToken });
    }

    // ── Korte-code-ops (DO-instances met 'code:'-naam; eigen storage-key) ──
    if (op === 'code-put') {
      const b = await request.json();
      const cur = await this.ctx.storage.get('code');
      // Nog-geldige code op deze naam? Dan is het een botsing → 409, Worker
      // probeert een andere code. Een verlopen restant mag wél overschreven.
      if (cur && Math.floor(Date.now() / 1000) < cur.exp)
        return Response.json({ error: 'code_in_use' }, { status: 409 });
      await this.ctx.storage.put('code', {
        sessionId: b.sessionId, joinToken: b.joinToken, exp: b.exp, by: b.by,
      });
      return Response.json({ ok: true });
    }
    if (op === 'code-get') {
      const c = await this.ctx.storage.get('code');
      if (!c) return Response.json({ error: 'unknown_code' }, { status: 404 });
      if (Math.floor(Date.now() / 1000) >= c.exp) {
        await this.ctx.storage.delete('code');
        return Response.json({ error: 'expired' }, { status: 410 });
      }
      // Meervoudig bruikbaar binnen de looptijd (meerdere experts, één code).
      return Response.json({ ok: true, sessionId: c.sessionId, joinToken: c.joinToken });
    }

    if (op === 'create') {
      const b = await request.json();
      // Botsingsbescherming: een nog-open, niet-verlopen sessie mag nooit
      // stilletjes overschreven worden door een botsend id.
      const cur = this._meta;
      if (cur && cur.status === 'open' && (!cur.exp || Math.floor(Date.now() / 1000) < cur.exp))
        return Response.json({ error: 'sid_in_use' }, { status: 409 });
      const meta = {
        sid:        b.sid,
        owner:      b.owner,
        ownerLabel: b.ownerLabel || b.owner,
        vehicle:    b.vehicle || null,
        created:    Date.now(),
        exp:        b.exp,              // seconden
        status:     'open',
      };
      this._meta  = meta;
      this.frames = [];               // verse sessie → oude frames/audit wissen
      this.audit  = [];
      this.vstate = null;             // en het voertuigprofiel van de vorige sessie
      await this.ctx.storage.put('meta', meta);
      await this.ctx.storage.delete('frames');
      await this.ctx.storage.delete('audit');
      await this.ctx.storage.delete('vstate');
      return Response.json({ ok: true, meta });
    }

    if (op === 'telemetry') {
      const b = await request.json();
      if (b.by && this._meta && this._meta.owner && b.by !== this._meta.owner)
        return Response.json({ error: 'not_owner' }, { status: 403 });
      const r = await this.ingestFrame(b.data !== undefined ? b.data : b);
      const status = r.status || 200; delete r.status;
      return Response.json(r, { status });
    }

    if (op === 'state') {
      const meta = this._meta;
      if (!meta) return Response.json({ error: 'no_session' }, { status: 404 });
      // Eigenaarschap: via joinToken (worker heeft sid al gematcht) is prima;
      // via account-auth alleen de eigenaar zelf of een admin.
      if (url.searchParams.get('via') !== 'jt') {
        const u = url.searchParams.get('u') || '';
        const r = url.searchParams.get('r') || '';
        if (r !== 'admin' && u !== meta.owner)
          return Response.json({ error: 'not_owner' }, { status: 403 });
      }
      const since  = Number(url.searchParams.get('since') || 0);
      const frames = since ? this.frames.filter(f => f.t > since) : this.frames.slice(-50);
      return Response.json({ ok: true, meta, frames, audit: this.audit.slice(-20), serverTime: Date.now() });
    }

    if (op === 'close') {
      let b = {}; try { b = await request.json(); } catch (_) {}
      // Extern bereikbaar via /session/close → alleen eigenaar of admin.
      if (this._meta && b.u && b.r !== 'admin' && b.u !== this._meta.owner)
        return Response.json({ error: 'not_owner' }, { status: 403 });
      if (this._meta) {
        this._meta.status = 'closed';
        await this.ctx.storage.put('meta', this._meta);
      }
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(JSON.stringify({ type: 'closed' })); ws.close(1000, 'session closed'); } catch (_) {}
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'unknown_op', op }, { status: 400 });
  }

  // Stuur een bericht naar alle aangesloten sockets.
  broadcast(obj) {
    const msg = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(msg); } catch (_) {} }
  }

  // Stuur naar alle sockets met een bepaalde rol-tag (bijv. alleen 'expert').
  broadcastTo(tag, obj) {
    const msg = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets(tag)) { try { ws.send(msg); } catch (_) {} }
  }

  // Eén telemetrie-frame verwerken: bufferen (throttled naar storage) en live
  // naar de expert(s) fan-outen. Gedeeld door de HTTP-route én de local-WS.
  async ingestFrame(data) {
    const meta = this._meta;
    if (!meta || meta.status !== 'open') return { error: 'no_session', status: 404 };
    if (meta.exp && Math.floor(Date.now() / 1000) >= meta.exp) return { error: 'expired', status: 410 };

    const frame = { t: Date.now(), data };
    this.frames.push(frame);
    if (this.frames.length > this.MAX_FRAMES)
      this.frames.splice(0, this.frames.length - this.MAX_FRAMES);

    // Het live-pad (fan-out naar de expert) is altijd meteen. De storage-schrijf
    // is enkel de backfill en mag achterlopen — hooguit ~1s frames kwijt bij een
    // recycle, prima. Zo schrijven we niet meer per frame bij WS-telemetrie.
    this.broadcastTo('expert', { type: 'frame', frame });
    if (!this._lastPersist || Date.now() - this._lastPersist > 1000) {
      this._lastPersist = Date.now();
      await this.ctx.storage.put('frames', this.frames);
    } else {
      // Overgeslagen schrijf → korte flush-alarm, zodat ook de allerlaatste
      // frames van een burst gepersist worden als er daarna niks meer komt.
      this.ctx.storage.setAlarm(Date.now() + 1500);
    }
    return { ok: true, n: this.frames.length, t: frame.t };
  }

  // Flush van de throttled frame-ring (gezet in ingestFrame).
  async alarm() {
    this._lastPersist = Date.now();
    await this.ctx.storage.put('frames', this.frames);
  }

  // Safety-by-construction: alleen leesverzoeken passen in dit formaat. Er is
  // geen veld waarin een schrijfactie (mode 04/08, UDS, rauwe hex) kan zitten.
  // NIEUW 2026-07-18: request-record en request-analyze. Ook die zijn puur
  // lezen — de local start/stopt zijn EIGEN recorder en draait zijn EIGEN
  // AI-analyse; er gaat nog steeds geen enkel commando richting de auto dat
  // niet al in het standaard-leesrepertoire van de local zit.
  sanitizeRequest(m) {
    const reqId = (typeof m.reqId === 'string' && m.reqId.slice(0, 40)) || crypto.randomUUID().slice(0, 8);
    if (m.type === 'request-dtc') return { type: 'request-dtc', reqId };
    // Snapshot van het voertuigprofiel (her)opvragen: supported PIDs, voertuig-
    // info, actieve set, sensor-gezondheid. Puur lezen — de local stuurt alleen
    // zijn eigen, al bekende staat terug; er gaat niets richting de bus.
    if (m.type === 'request-vstate') return { type: 'request-vstate', reqId };
    if (m.type === 'request-pids') {
      if (!Array.isArray(m.pids)) return null;
      const pids = m.pids.filter(p => typeof p === 'string' && /^[0-9A-Fa-f]{2}$/.test(p)).slice(0, 12);
      if (!pids.length) return null;
      return { type: 'request-pids', pids, reqId };
    }
    // "Poll deze PIDs voortaan mee" — selectie voor analyses. Nog steeds puur
    // lezen: het zegt alleen wélke standaard-PIDs de local moet blijven lezen.
    if (m.type === 'request-poll') {
      if (!Array.isArray(m.pids)) return null;
      const pids = m.pids.filter(p => typeof p === 'string' && /^[0-9A-Fa-f]{2}$/.test(p)).slice(0, 24);
      if (!pids.length) return null;
      return { type: 'request-poll', pids, reqId };
    }
    // Start/stop van de PID-recorder op de local, of het opvragen van de CSV
    // van de laatste opname. pids optioneel (leeg = actieve set van de local).
    if (m.type === 'request-record') {
      const action = String(m.action || '');
      if (!['start', 'stop', 'csv'].includes(action)) return null;
      let pids;
      if (action === 'start' && Array.isArray(m.pids)) {
        pids = m.pids.filter(p => typeof p === 'string' && /^[0-9A-Fa-f]{2}$/.test(p)).slice(0, 24);
      }
      const out = { type: 'request-record', action, reqId };
      if (pids && pids.length) out.pids = pids;
      return out;
    }
    // AI-analyse van de laatste opname, op de local (diens API-tegoed). Alleen
    // een vrije-tekst klacht — geen enkel veld dat de bus kan raken.
    if (m.type === 'request-analyze') {
      const problem = (typeof m.problem === 'string' ? m.problem : '').slice(0, 500);
      return { type: 'request-analyze', problem, reqId };
    }
    return null;
  }

  // WebSocket-handshake: accepteer hibernatable, stuur backfill, houd open.
  handleConnect(request) {
    const meta = this._meta;
    if (!meta || meta.status !== 'open')
      return new Response('no_session', { status: 404 });

    const role = new URL(request.url).searchParams.get('role') || 'expert';
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, joinedAt: Date.now() });   // overleeft hibernation

    // Meta krijgt iedereen; de recente frames (backfill) alleen een expert —
    // de local is zelf de bron en heeft die niet nodig.
    try {
      server.send(JSON.stringify({ type: 'meta', meta, role }));
      if (role === 'expert') {
        server.send(JSON.stringify({ type: 'backfill', frames: this.frames, serverTime: Date.now() }));
        // Voertuigprofiel van de local (indien al bekend) meteen meegeven,
        // zodat de expert-app zonder wachten een gevulde PID-lijst heeft.
        if (this.vstate) server.send(JSON.stringify({ type: 'vstate', data: this.vstate, t: Date.now() }));
      }
    } catch (_) {}

    // Presence: de local hoort altijd te weten dat/hoeveel er meegekeken wordt.
    try {
      const experts = this.ctx.getWebSockets('expert').length;
      if (role === 'expert') this.broadcastTo('local', { type: 'presence', experts });
      else server.send(JSON.stringify({ type: 'presence', experts }));
    } catch (_) {}

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Hibernation-handlers (worden ook na een recycle door de runtime aangeroepen) ──
  async webSocketMessage(ws, message) {
    let m; try { m = JSON.parse(typeof message === 'string' ? message : ''); } catch (_) { return; }
    if (!m || !m.type) return;
    const role = (ws.deserializeAttachment() || {}).role || 'expert';

    if (m.type === 'ping') { try { ws.send(JSON.stringify({ type: 'pong', t: Date.now() })); } catch (_) {} return; }

    // Local stuurt telemetrie over de WS (alternatief voor de HTTP-route).
    if (role === 'local' && m.type === 'telemetry') { await this.ingestFrame(m.data); return; }

    // Local beantwoordt een read-verzoek: apart berichttype, gaat rechtstreeks
    // naar de expert(s) en vervuilt de telemetrie-ring/backfill dus niet.
    if (role === 'local' && m.type === 'response') {
      this.broadcastTo('expert', {
        type: 'response',
        reqId: String(m.reqId || '').slice(0, 40),
        data: m.data,
        t: Date.now(),
      });
      return;
    }

    // Local meldt de opname-voortgang (live teller op de expert). Zelfde pad
    // als 'response': rechtstreeks fan-out, niet de telemetrie-ring in.
    if (role === 'local' && m.type === 'record-status') {
      this.broadcastTo('expert', { type: 'record-status', data: m.data, t: Date.now() });
      return;
    }

    // Local stuurt zijn voertuigprofiel (vstate: supported PIDs, voertuiginfo,
    // actieve set, sensor-gezondheid, foutcodes). Cachen + persist zodat een
    // later aanhakende expert het bij connect meteen krijgt, en live fan-out.
    // Grootte-guard: alles boven 32 kB wordt genegeerd (hoort ~2-6 kB te zijn).
    if (role === 'local' && m.type === 'vstate') {
      let d = m.data;
      try { if (!d || typeof d !== 'object' || JSON.stringify(d).length > 32768) d = null; } catch (_) { d = null; }
      if (d) {
        this.vstate = d;
        await this.ctx.storage.put('vstate', d);
        this.broadcastTo('expert', { type: 'vstate', data: d, t: Date.now() });
      }
      return;
    }

    // Expert vraagt reads op → valideren en doorzetten naar de local(s). Alleen
    // leesverzoeken passen in dit formaat; al het andere valt er hier uit.
    if (role === 'expert' && (m.type === 'request-pids' || m.type === 'request-dtc' ||
        m.type === 'request-poll' || m.type === 'request-record' || m.type === 'request-analyze' ||
        m.type === 'request-vstate')) {
      // Lichte rem: max 20 verzoeken per 10s over alle experts samen.
      const now = Date.now();
      this._reqTimes = (this._reqTimes || []).filter(t => now - t < 10_000);
      if (this._reqTimes.length >= 20) {
        try { ws.send(JSON.stringify({ type: 'request-rejected', reason: 'rate_limited' })); } catch (_) {}
        return;
      }
      this._reqTimes.push(now);

      const req = this.sanitizeRequest(m);
      if (!req) { try { ws.send(JSON.stringify({ type: 'request-rejected', reason: 'invalid' })); } catch (_) {} return; }
      const locals = this.ctx.getWebSockets('local');
      if (!locals.length) {
        try { ws.send(JSON.stringify({ type: 'request-rejected', reason: 'local_offline', reqId: req.reqId })); } catch (_) {}
        return;
      }
      // Audit: wíe vroeg wát op in deze sessie (persistent, laatste 100).
      this.audit.push({ t: now, action: req.type + (req.action ? (':' + req.action) : ''), pids: req.pids || null, reqId: req.reqId });
      if (this.audit.length > 100) this.audit.splice(0, this.audit.length - 100);
      await this.ctx.storage.put('audit', this.audit);

      const out = JSON.stringify(req);
      for (const l of locals) { try { l.send(out); } catch (_) {} }
      try { ws.send(JSON.stringify({ type: 'request-sent', reqId: req.reqId, pids: req.pids || null })); } catch (_) {}
      return;
    }
    // Geen ander pad — er bestaat hier geen manier om een schrijfactie te doen.
  }

  async webSocketClose(ws, code, reason, wasClean) {
    // Op compat-dates < 2026-04-07 is deze close nodig om 1006-fouten te vermijden.
    try { ws.close(code, reason); } catch (_) {}
    // Presence bijwerken als er een expert wegvalt.
    try {
      const att = ws.deserializeAttachment() || {};
      if (att.role === 'expert') {
        const experts = this.ctx.getWebSockets('expert').filter(s => s !== ws).length;
        this.broadcastTo('local', { type: 'presence', experts });
      }
    } catch (_) {}
  }

  async webSocketError(ws, error) {
    // De runtime ruimt de socket op; niets te doen.
  }
}

// ════════════════════════════════════════════════════════════════════
//  ROUTER
// ════════════════════════════════════════════════════════════════════
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      if (url.pathname === '/auth/login' && request.method === 'POST')
        return await handleLogin(request, env);

      if (url.pathname === '/v1/messages' && request.method === 'POST')
        return await handleMessages(request, env);

      if (url.pathname === '/airtable/log' && request.method === 'POST')
        return await handleAirtableLog(request, env);

      if (url.pathname === '/airtable/veldlab' && request.method === 'POST')
        return await handleAirtableVeldlab(request, env);

      if (url.pathname === '/airtable/reference' && request.method === 'POST')
        return await handleAirtableReference(request, env);

      // ── Remote diagnose ──
      if (url.pathname === '/session/create' && request.method === 'POST')
        return await handleSessionCreate(request, env);

      if (url.pathname === '/session/telemetry' && request.method === 'POST')
        return await handleSessionTelemetry(request, env);

      if (url.pathname === '/session/state' && request.method === 'GET')
        return await handleSessionState(request, env);

      if (url.pathname === '/session/connect' && request.method === 'GET')
        return await handleSessionConnect(request, env);

      if (url.pathname === '/session/close' && request.method === 'POST')
        return await handleSessionClose(request, env);

      // ── QR-pairing (omgekeerde koppeling) ──
      if (url.pathname === '/pair/create' && request.method === 'POST')
        return await handlePairCreate(request, env);

      if (url.pathname === '/pair/claim' && request.method === 'POST')
        return await handlePairClaim(request, env);

      if (url.pathname === '/pair/poll' && request.method === 'GET')
        return await handlePairPoll(request, env);

      // ── Korte meekijk-code (10 cijfers) ──
      if (url.pathname === '/code/create' && request.method === 'POST')
        return await handleCodeCreate(request, env);

      if (url.pathname === '/code/resolve' && request.method === 'POST')
        return await handleCodeResolve(request, env);

      if (url.pathname === '/proxy' && request.method === 'GET')
        return await handleProxy(request, env);

      if (url.pathname === '/api/config') {
        if (request.method === 'GET')  return await handleConfigGet(request, env, ctx);
        if (request.method === 'POST') return await handleConfigPost(request, env, ctx);
      }

      if (url.pathname === '/admin/users') {
        if (request.method === 'GET')  return await handleUsersGet(request, env);
        if (request.method === 'POST') return await handleUsersPost(request, env);
      }

      // Health-check
      if (url.pathname === '/' || url.pathname === '/health')
        return json({ ok: true, service: 'pidlane-proxy', ts: new Date().toISOString() });

      return json({ error: 'not_found', path: url.pathname }, 404);
    } catch (e) {
      return json({ error: 'worker_exception', message: String(e && e.message || e) }, 500);
    }
  },
};
