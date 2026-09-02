// ══════════════════════════════════════════════════════════════════
// test-token.js — de sessietokens van de worker
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT (02-09-2026)
//
// `verifyToken()` beslist of een verzoek is wie het zegt te zijn. Twaalf
// regels, met een `catch` die `null` teruggeeft — en tot vandaag zonder
// enkele test. Dat gold voor de hele authenticatiekant: `makeToken`,
// `verifyToken`, `makeJoinToken`, `verifyJoinToken`, `safeEqual` en `auth()`
// werden in geen enkele test bij naam genoemd.
//
// Dat is een ander soort gat dan een meetfout. Een verkeerd gelezen sensor
// merk je tijdens een rit; een handtekeningcontrole die stilzwijgend
// "akkoord" gaat merkt niemand, en elke push naar main is deployen. De
// gevaarlijkste variant is bovendien onzichtbaar in het gebruik: als
// `safeEqual` op lengte-ongelijkheid `true` zou geven, of als de
// vervaldatum niet meer wordt nagekeken, blijft de app precies hetzelfde
// werken.
//
// Er wordt hier niets nagebouwd: het blok uit worker.js met de
// cryptografie, de tokens en `auth()` wordt uitgeknipt en in een sandbox
// gedraaid met de echte WebCrypto van Node. `env` is nep, want dat is in
// Cloudflare ook maar een object.
//
// Draaien vanuit public/:  node test-token.js       (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

let ok = 0, fout = 0;
function t(naam, gemeten, verwacht) {
  if (String(gemeten) === String(verwacht)) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + gemeten + ', wilde ' + verwacht); }
}

const WORKER = path.join(__dirname, '..', 'worker.js');
const bron = fs.readFileSync(WORKER, 'utf8');

function knip(van, tot, naam) {
  const a = bron.indexOf(van), b = bron.indexOf(tot);
  if (a < 0 || b < a) {
    console.error('FOUT: knipbereik "' + naam + '" niet gevonden in worker.js — verplaatst of hernoemd?');
    process.exit(1);
  }
  return bron.slice(a, b);
}

// ── de sandbox ────────────────────────────────────────────────────
// Cloudflare Workers draaien op webstandaarden; Node levert dezelfde
// crypto.subtle, btoa/atob en TextEncoder. Er wordt dus met de échte
// HMAC-SHA256 ondertekend, niet met een nepfunctie.
function bouw() {
  const s = {
    crypto, btoa, atob, TextEncoder, TextDecoder,
    console: { log() { }, warn() { }, error() { } },
    Date, Math, JSON, String, Number, Object, Array, Uint8Array, Promise,
    setTimeout, clearTimeout
  };
  s.globalThis = s;
  s.__name = (fn) => fn;          // in worker.js een esbuild-restant
  vm.createContext(s);
  // Twee blokken: de cryptografie met de sessietokens en auth() staan
  // bovenin worker.js, de join-tokens verderop bij de sessiedeling.
  vm.runInContext(knip('var _enc = new TextEncoder();', 'var RL = {', 'tokenblok'),
    s, { filename: 'worker.js (tokenblok)' });
  vm.runInContext(knip('async function makeJoinToken', 'async function handleSessionCreate', 'jointokens'),
    s, { filename: 'worker.js (jointokens)' });

  ['b64url', 'b64urlToString', 'safeEqual', 'hmacSign',
    'makeToken', 'verifyToken', 'makeJoinToken', 'verifyJoinToken', 'auth'].forEach(fn => {
      if (typeof s[fn] !== 'function') {
        console.error('FOUT: ' + fn + '() niet gevonden in het uitgeknipte blok');
        process.exit(1);
      }
    });
  return s;
}

// Een nep-Request: alleen de headers die auth() leest.
function verzoek(headers) {
  const h = headers || {};
  return { headers: { get: naam => (naam in h ? h[naam] : null) } };
}

const GEHEIM = 'een-geheim-dat-alleen-cloudflare-kent';

// ══════════════════════════════════════════════════════════════════
(async function () {
  const w = bouw();

  console.log('\n— een vers token wordt geaccepteerd —');
  {
    const env = { SESSION_SECRET: GEHEIM, TOKEN_TTL_HOURS: 12 };
    const m = await w.makeToken(env, 'jan', 'user', 'Jan de Monteur');

    t('het token heeft twee delen', m.token.split('.').length, 2);
    const p = await w.verifyToken(env, m.token);
    t('en wordt geaccepteerd', p !== null, true);
    t('de gebruiker komt terug', p.u, 'jan');
    t('de rol komt terug', p.r, 'user');
    t('het label komt terug', p.l, 'Jan de Monteur');
    t('de vervaldatum ligt ~12 uur vooruit',
      Math.abs((p.exp - Math.floor(Date.now() / 1e3)) - 12 * 3600) < 5, true);
  }

  console.log('\n— een geknoeide handtekening wordt geweigerd —');
  {
    const env = { SESSION_SECRET: GEHEIM };
    const m = await w.makeToken(env, 'jan', 'user', 'Jan');
    const [payload, sig] = m.token.split('.');

    t('handtekening van één teken veranderd',
      await w.verifyToken(env, payload + '.' + (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)), null);
    t('handtekening weggelaten', await w.verifyToken(env, payload), null);
    t('lege handtekening', await w.verifyToken(env, payload + '.'), null);
    t('handtekening van een ander token', await w.verifyToken(env,
      payload + '.' + (await w.makeToken(env, 'piet', 'user', 'Piet')).token.split('.')[1]), null);
  }

  console.log('\n— DE KERN: de inhoud kan niet worden herschreven —');
  {
    // Wie zichzelf tot admin wil bombarderen herschrijft de payload en laat
    // de handtekening staan. Dat moet stuklopen op de HMAC.
    const env = { SESSION_SECRET: GEHEIM };
    const m = await w.makeToken(env, 'jan', 'user', 'Jan');
    const [payload, sig] = m.token.split('.');

    const echt = JSON.parse(w.b64urlToString(payload));
    t('het echte token zegt user', echt.r, 'user');

    const vervalst = Buffer.from(JSON.stringify({ u: 'jan', r: 'admin', l: 'Jan', exp: echt.exp }))
      .toString('base64url');
    t('rol opgehoogd naar admin wordt geweigerd',
      await w.verifyToken(env, vervalst + '.' + sig), null);

    // En zonder handtekening al helemaal niet.
    t('een token zonder geldige handtekening telt niet',
      await w.verifyToken(env, vervalst + '.' + 'x'.repeat(sig.length)), null);
  }

  console.log('\n— een verlopen token wordt geweigerd —');
  {
    const env = { SESSION_SECRET: GEHEIM };

    // Een handmatig verlopen token met een geldige handtekening.
    const oud = Buffer.from(JSON.stringify({ u: 'jan', r: 'user', l: 'Jan', exp: 1000 }))
      .toString('base64url');
    const sig = await w.hmacSign(GEHEIM, oud);
    t('een correct ondertekend maar verlopen token telt niet',
      await w.verifyToken(env, oud + '.' + sig), null);

    // Zónder exp mag hij ook niet door — anders is een token zonder
    // vervaldatum eeuwig geldig.
    const geenExp = Buffer.from(JSON.stringify({ u: 'jan', r: 'user' })).toString('base64url');
    t('een token zonder vervaldatum telt niet',
      await w.verifyToken(env, geenExp + '.' + await w.hmacSign(GEHEIM, geenExp)), null);

    // De TTL komt uit de omgeving met een terugval van 12 uur. Let op de vorm:
    // `Number(env.TOKEN_TTL_HOURS || 12)` betekent dat óók een uitdrukkelijke
    // 0 op 12 uur uitkomt — een TTL van nul is dus niet in te stellen. Dat is
    // hier vastgelegd omdat het niet is wat de naam suggereert.
    const uur = async ttl => {
      const e = { SESSION_SECRET: GEHEIM };
      if (ttl !== undefined) e.TOKEN_TTL_HOURS = ttl;
      const p = await w.verifyToken(e, (await w.makeToken(e, 'jan', 'user', 'Jan')).token);
      return Math.round((p.exp - Math.floor(Date.now() / 1e3)) / 3600);
    };
    t('niets ingesteld geeft 12 uur', await uur(undefined), 12);
    t('1 uur geeft 1 uur', await uur(1), 1);
    t('0 valt terug op 12 uur, niet op nul', await uur(0), 12);
  }

  console.log('\n— een ander geheim geeft een ander oordeel —');
  {
    const m = await w.makeToken({ SESSION_SECRET: GEHEIM }, 'jan', 'user', 'Jan');
    t('token van geheim A geldt niet onder geheim B',
      await w.verifyToken({ SESSION_SECRET: 'een-ander-geheim' }, m.token), null);
    // Zonder geheim mag er niets door: anders zou een misconfiguratie op de
    // server iedereen binnenlaten in plaats van niemand.
    t('zonder SESSION_SECRET wordt niets geaccepteerd',
      await w.verifyToken({}, m.token), null);
  }

  console.log('\n— rommel in plaats van een token —');
  {
    const env = { SESSION_SECRET: GEHEIM };
    for (const rommel of ['', null, undefined, 'geen-token', '...', 'a.b',
      '{}', 'null.null', 'x'.repeat(5000)]) {
      t('"' + String(rommel).slice(0, 12) + '" wordt geweigerd', await w.verifyToken(env, rommel), null);
    }
  }

  console.log('\n— safeEqual vergelijkt zonder lengte te verklappen —');
  {
    t('gelijk is gelijk', w.safeEqual('abc123', 'abc123'), true);
    t('één teken anders', w.safeEqual('abc123', 'abc124'), false);
    t('korter is niet gelijk', w.safeEqual('abc', 'abc123'), false);
    t('langer is niet gelijk', w.safeEqual('abc123', 'abc'), false);
    t('leeg tegen leeg', w.safeEqual('', ''), true);
    t('leeg tegen iets', w.safeEqual('', 'a'), false);
    t('null tegen null', w.safeEqual(null, null), true);
    t('null tegen iets', w.safeEqual(null, 'a'), false);
  }

  console.log('\n— het join-token draagt een sessie, geen gebruiker —');
  {
    const env = { SESSION_SECRET: GEHEIM };
    const straks = Math.floor(Date.now() / 1e3) + 600;
    const jt = await w.makeJoinToken(env, 'sess-abc', 'monteur', straks);

    const p = await w.verifyJoinToken(env, jt);
    t('een vers join-token geldt', p !== null, true);
    t('de sessie komt terug', p.sid, 'sess-abc');
    t('de sessierol komt terug', p.sr, 'monteur');

    t('een verlopen join-token telt niet',
      await w.verifyJoinToken(env, await w.makeJoinToken(env, 'sess-abc', 'monteur', 1000)), null);

    // Zonder sid is het geen join-token: die controle staat er apart in en
    // hoort er te blijven, anders geeft een leeg token toegang tot "een" sessie.
    const geenSid = Buffer.from(JSON.stringify({ sr: 'monteur', exp: straks })).toString('base64url');
    t('een join-token zonder sessie telt niet',
      await w.verifyJoinToken(env, geenSid + '.' + await w.hmacSign(GEHEIM, geenSid)), null);

    // Een gewoon sessietoken is geen join-token en andersom.
    const gewoon = (await w.makeToken(env, 'jan', 'user', 'Jan')).token;
    t('een gewoon token is geen join-token', await w.verifyJoinToken(env, gewoon), null);
  }

  console.log('\n— auth(): wie mag er binnen —');
  {
    const env = { SESSION_SECRET: GEHEIM, ADMIN_TOKEN: 'admin-geheim' };

    t('geen enkele header = niemand', await w.auth(verzoek({}), env), null);
    t('onzin in X-App-Token = niemand',
      await w.auth(verzoek({ 'X-App-Token': 'onzin' }), env), null);

    const a = await w.auth(verzoek({ 'X-Admin-Token': 'admin-geheim' }), env);
    t('het admin-token geeft admin', a && a.r, 'admin');

    const b = await w.auth(verzoek({ 'X-Admin-Token': 'bijna-admin-geheim' }), env);
    t('een bijna-goed admin-token geeft niets', b, null);

    const m = await w.makeToken(env, 'jan', 'user', 'Jan');
    const c = await w.auth(verzoek({ 'X-App-Token': m.token }), env);
    t('een geldig sessietoken geeft de gebruiker', c && c.u, 'jan');
    t('en niet de rol admin', c && c.r, 'user');
  }

  console.log('\n— auth(): het legacy-token zit achter een schakelaar —');
  {
    // Zonder ALLOW_LEGACY_APP_TOKEN='true' mag het oude gedeelde token niets.
    // Dat is de hele reden dat die vlag bestaat.
    const uit = { SESSION_SECRET: GEHEIM, APP_TOKEN: 'oud-gedeeld-token' };
    t('legacy uit: het oude token doet niets',
      await w.auth(verzoek({ 'X-App-Token': 'oud-gedeeld-token' }), uit), null);

    const aan = Object.assign({}, uit, { ALLOW_LEGACY_APP_TOKEN: 'true' });
    const r = await w.auth(verzoek({ 'X-App-Token': 'oud-gedeeld-token' }), aan);
    t('legacy aan: het oude token geeft toegang', r && r.u, 'legacy');
    t('maar nooit als admin', r && r.r, 'user');

    const half = Object.assign({}, uit, { ALLOW_LEGACY_APP_TOKEN: 'ja' });
    t('alleen de letterlijke waarde "true" telt',
      await w.auth(verzoek({ 'X-App-Token': 'oud-gedeeld-token' }), half), null);
  }

  console.log('\n─────────────────────────────────────────');
  console.log(ok + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})();
