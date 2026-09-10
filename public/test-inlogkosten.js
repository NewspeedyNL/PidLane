// ══════════════════════════════════════════════════════════════════
// test-inlogkosten.js — inloggen kost geen credit (#179)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
// Het saldo stond op 40 en direct na het inloggen op 39. Elke keer precies 1.
// Inloggen zelf raakt het tegoed niet; de keten-test erachter wel:
// testApiKey() deed een echte /v1/messages-call om "🤖 AI-sleutel ✓" te kunnen
// tonen, en tegoedTarief() heeft een ondergrens van één credit per call. Het
// antwoord is drie woorden lang — dat maakt voor het minimumtarief niets uit.
//
// Dit is de tweede keer dat dezelfde functie geld kostte. Op 31-07-2026 deed
// testApiKey() hetzelfde bij élke app-start (§8 van PIDLANE.md, #83). Toen is
// hij verplaatst naar de login; nu is de call zelf weg. Zonder een test die
// eraan vasthoudt is dit het soort wijziging dat over een halfjaar terugkomt
// als "even controleren of het model antwoordt".
//
// WAT HIER ONDERSCHEIDEN MOET WORDEN, en wat een naïeve test niet doet:
//
//   1. Dat er GEEN /v1/messages meer wordt aangeroepen is de halve uitspraak.
//      De andere helft is dat de app nog steeds iets zinnigs toetst — een
//      chip die altijd groen wordt is erger dan een chip die een credit kost.
//      Deel 2 en 4.
//   2. De ping moet weigeren wat /v1/messages ook weigert. Zou hij dat niet
//      doen, dan meldt de chip een werkende keten waar de eerste echte
//      analyse 401 of 403 geeft. Deel 4 vergelijkt de statuscodes van de
//      ECHTE handleMessages en de ECHTE handlePing naast elkaar.
//   3. "Er ging niets af" moet iets kunnen betekenen. Deel 6 laat één login
//      door de echte router lopen en kijkt naar het saldo; de tegenproef
//      ernaast stuurt dezelfde login door /v1/messages en laat zien dat de
//      opzet een afboeking van precies 1 wél ziet. Zonder die tweede helft
//      bewijst de eerste alleen dat er niets gemeten is.
//
// De echte functies worden uit de bron geknipt met ankers, niet overgetypt:
// verdwijnt of hernoemt er iets, dan stopt deze test in plaats van groen te
// blijven staan op code die niet meer draait.
//
// Draaien vanuit public/:  node test-inlogkosten.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const bronWorker = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const bronAuth = fs.readFileSync(path.join(__dirname, 'pidlane-auth.js'), 'utf8');

function knip(bron, vanAnker, totAnker, wat, waar) {
  const van = bron.indexOf(vanAnker);
  const tot = bron.indexOf(totAnker);
  if (van < 0 || tot < 0 || tot < van) {
    console.error('FOUT: ' + wat + ' niet gevonden in ' + waar + ' (anker verschoven?).');
    process.exit(1);
  }
  return bron.slice(van, tot);
}

// Eén slice voor de hele keten: het tarief, de afboeking, handleMessages en
// handlePing komen uit hetzelfde stuk bron. Dat is met opzet — deel 4 en 6
// vergelijken die twee handlers met elkaar, en dat kan alleen als het de
// echte twee zijn.
const srcKeten = knip(bronWorker, 'function tegoedTarief(env) {', '__name(handlePing, "handlePing");',
                      'de tegoed- en pingketen', 'worker.js');
// De router erbij, tot aan de cron eronder. Alleen de tak die matcht wordt
// uitgevoerd, dus de handlers van de andere routes hoeven niet te bestaan.
const srcRouter = knip(bronWorker, 'var worker_default = {', '  // ── De dagelijkse opruimronde',
                       'de router', 'worker.js') + '};';
const srcTest = knip(bronAuth, 'async function testApiKey(){', '// ── Extra logfunctie (admin-only)',
                     'testApiKey()', 'pidlane-auth.js');

// ── de nagemaakte omgeving om de Worker heen ──────────────────────
// `staat` legt vast wat er WERKELIJK gebeurd is: welke paden de router zag,
// hoe vaak er naar Anthropic gebeld is, en wat er van het saldo af ging. Daar
// kijkt deze test naar, niet naar wat een functie teruggeeft.
function bouwWorker(opties) {
  const o = opties || {};
  const staat = {
    paden: [], aiCalls: 0, patches: [], airtable: [],
    saldo: o.saldo === undefined ? 40 : o.saldo
  };
  // Klein antwoord met kleine usage: 8 in, 3 uit. De formule geeft daar
  // afgerond 0 credits voor — het minimumtarief van 1 is dus de énige reden
  // dat er iets af gaat, precies zoals in #179.
  const aiAntwoord = JSON.stringify({
    id: 'msg_01', model: 'claude-sonnet-5',
    content: [{ type: 'text', text: 'yes' }],
    usage: { input_tokens: 8, output_tokens: 3 }
  });
  const omg = {
    __name: (fn) => fn,
    CORS: {},
    auth: async () => (o.session === undefined ? { u: 'klant@voorbeeld.nl', r: 'klant' } : o.session),
    json: (body, status, extra) => ({
      body, status: status || 200, ok: (status || 200) < 400, kop: extra || {},
      json: async () => body
    }),
    resolveAnthropicKey: () => (o.geenSleutel ? '' : 'sk-ant-van-de-worker'),
    resolveBase: (env, k) => 'app_' + k,
    cfg: (env, k) => 'tbl_' + k,
    klantZoek: async () => ({
      id: 'recKLANT000000001',
      fields: { Email: 'klant@voorbeeld.nl', Saldo: staat.saldo, Status: 'actief' }
    }),
    klantToegangProbleem: () => null,
    klantPatch: async (env, id, f) => {
      staat.patches.push(f);
      if (f.Saldo !== undefined) staat.saldo = f.Saldo;
    },
    metSaldoSlot: async (env, email, fn) => ({ bezet: false, result: await fn() }),
    fetch: async (url, init) => {
      const u = String(url);
      if (u.indexOf('api.anthropic.com') >= 0) {
        staat.aiCalls++;
        return { ok: true, status: 200, text: async () => aiAntwoord };
      }
      staat.airtable.push(u);
      return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
    },
    isRestrictedPath: () => true,
    lockOrigin: (request, resp) => resp,
    console: { error() {}, warn() {}, log() {} }
  };
  const maak = new Function(...Object.keys(omg),
    srcKeten + '\n__name(handlePing, "handlePing");\n' + srcRouter +
    '\nreturn { handleMessages, handlePing, router: worker_default, tegoedTarief };');
  const api = maak(...Object.values(omg));
  const env = { AIRTABLE_TOKEN: 'x' };
  const ctx = { waitUntil: (p) => p };

  // Een verzoek zoals de router het krijgt. Meer heeft geen van beide
  // handlers nodig: een pad, een methode, een paar koppen en een body.
  const verzoek = (pad, method, body) => ({
    url: 'https://pidlane-proxy.example' + pad,
    method: method || 'GET',
    headers: { get: (naam) => (String(naam).toLowerCase() === 'content-length'
      ? String(JSON.stringify(body || {}).length) : null) },
    json: async () => (body || {})
  });

  return { staat, api, env, ctx, verzoek,
           viaRouter: (pad, method, body) => api.router.fetch(verzoek(pad, method, body), env, ctx) };
}

// ── de nagemaakte omgeving om testApiKey() heen ───────────────────
// plFetch is het enige punt waar de app het net op gaat (#117), dus dat is
// ook het enige punt dat hier nagemaakt hoeft te worden. Alles erboven —
// welke sleutel er gekozen wordt, wat er gelogd wordt, wat de chip doet —
// blijft echte code uit pidlane-auth.js.
function bouwApp(plFetch) {
  const pil = { textContent: '', className: '' };
  const regels = [];
  const opslag = {};
  const venster = { anthropicKey: '' };
  const doc = { getElementById: (id) => (id === 'apiPill' ? pil : null) };
  const opslagApi = {
    getItem: (k) => (k in opslag ? opslag[k] : null),
    setItem: (k, v) => { opslag[k] = String(v); }
  };
  const log = (tekst, soort) => { regels.push({ tekst: String(tekst), soort: soort || '' }); };
  const maak = new Function('window', 'document', 'localStorage', 'log', 'plFetch', 'console',
                            'currentUser', srcTest + '\nreturn testApiKey;');
  const fn = maak(venster, doc, opslagApi, log, plFetch, { warn() {}, error() {}, log() {} },
                  { name: 'klant@voorbeeld.nl', role: 'klant' });
  return { pil, regels, venster, testApiKey: fn };
}

// plFetch die op de echte router uitkomt: app → router → handler, alle drie
// de lagen echt. Dit is de enige manier om "een login kost niets" te meten
// zonder het antwoord zelf te verzinnen.
function plFetchNaar(w, staat) {
  return async function (pad, opties) {
    const o = opties || {};
    staat.paden.push({ pad, method: o.method || 'GET' });
    return await w.viaRouter(pad, o.method || 'GET', o.json);
  };
}

(async function () {

  // ── 1. de login vraagt /v1/ping en niet /v1/messages ────────────
  console.log('\n1. testApiKey() gaat naar /v1/ping, niet naar /v1/messages');
  {
    const gezien = [];
    const app = bouwApp(async function (pad, opties) {
      gezien.push({ pad, method: (opties || {}).method || 'GET', json: (opties || {}).json || null });
      return { ok: true, status: 200, json: async () => ({ ok: true, sleutel: 'worker', kosten: 0 }) };
    });
    await app.testApiKey();
    toets('er is precies één verzoek gedaan', gezien.length === 1, gezien.length + ' verzoek(en)');
    toets('en dat gaat naar /v1/ping', gezien[0] && gezien[0].pad === '/v1/ping',
          String(gezien[0] && gezien[0].pad));
    toets('geen enkel verzoek naar /v1/messages',
          !gezien.some(g => String(g.pad).indexOf('/v1/messages') >= 0),
          'elke call daarheen kost minstens één credit');
    // Een GET zonder body: dat is wat een controle zonder model nodig heeft.
    // Staat hier weer een messages-array, dan is de route wel nieuw maar de
    // kosten niet weg.
    toets('zonder messages-body', !(gezien[0] && gezien[0].json && gezien[0].json.messages),
          JSON.stringify(gezien[0] && gezien[0].json));
  }

  // ── 2. de chip zegt nog steeds iets ─────────────────────────────
  // Dit is de helft die vergeten wordt: een controle weghalen is makkelijk,
  // maar de chip moet blijven onderscheiden tussen een keten die werkt en
  // een die dat niet doet.
  console.log('\n2. De chip volgt de uitkomst van de ping');
  {
    const goed = bouwApp(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, sleutel: 'worker' }) }));
    await goed.testApiKey();
    toets('geslaagde ping → 🤖 AI-sleutel ✓', goed.pil.textContent.indexOf('✓') >= 0, goed.pil.textContent);
    toets('en de chip staat op "set"', goed.pil.className.indexOf('set') >= 0 &&
          goed.pil.className.indexOf('unset') < 0, goed.pil.className);

    const fout = bouwApp(async () => ({ ok: false, status: 403,
      json: async () => ({ ok: false, error: 'forbidden_role', hint: 'Dit account heeft geen AI-toegang.' }) }));
    await fout.testApiKey();
    toets('geweigerde ping → 🤖 AI-sleutel ❌', fout.pil.textContent.indexOf('❌') >= 0, fout.pil.textContent);
    toets('en de reden staat in de log',
          fout.regels.some(r => r.soort === 'err' && r.tekst.indexOf('403') >= 0),
          JSON.stringify(fout.regels.map(r => r.tekst)));

    // Een onbereikbare proxy is geen kapotte sleutel. Zou de chip hier rood
    // worden, dan wijst hij bij elke haperende verbinding de verkeerde kant op.
    const weg = bouwApp(async () => { throw new Error('netwerk onbereikbaar bij /v1/ping'); });
    await weg.testApiKey();
    toets('een netwerkfout laat de chip staan en meldt het als waarschuwing',
          weg.pil.textContent === '' && weg.regels.some(r => r.soort === 'warn'),
          weg.pil.textContent + ' / ' + JSON.stringify(weg.regels.map(r => r.soort)));
  }

  // ── 3. de ping raakt het model niet aan ─────────────────────────
  console.log('\n3. /v1/ping belt Anthropic niet en boekt niets af');
  {
    const w = bouwWorker();
    const resp = await w.api.handlePing(w.verzoek('/v1/ping'), w.env);
    toets('de ping slaagt', resp.status === 200 && resp.body.ok === true, JSON.stringify(resp.body));
    toets('er is geen enkele call naar api.anthropic.com gedaan', w.staat.aiCalls === 0,
          w.staat.aiCalls + ' call(s) — dan kost de ping alsnog een credit');
    toets('er is niets naar Airtable geschreven', w.staat.airtable.length === 0 && w.staat.patches.length === 0,
          JSON.stringify(w.staat.airtable));
    toets('het saldo staat er nog', w.staat.saldo === 40, String(w.staat.saldo));
    toets('en de ping zegt zelf dat hij niets kost', resp.body.kosten === 0, String(resp.body.kosten));
    toets('hij meldt waar de sleutel vandaan komt', resp.body.sleutel === 'worker', String(resp.body.sleutel));
  }

  // ── 4. de ping weigert wat /v1/messages ook weigert ─────────────
  // Vier poorten, twee handlers, dezelfde uitkomst. Wijkt er één af, dan
  // belooft de chip iets wat de eerste echte analyse niet waarmaakt.
  console.log('\n4. Dezelfde poorten als /v1/messages, met dezelfde statuscode');
  {
    const gevallen = [
      ['geen sessie', { session: null }],
      ['demo-account', { session: { u: 'demo@pidlane.nl', r: 'demo' } }],
      ['legacy-token', { session: { u: 'legacy', r: 'user' } }],
      ['geen sleutel in de Worker', { session: { u: 'monteur', r: 'user' }, geenSleutel: true }]
    ];
    for (const [naam, opzet] of gevallen) {
      const a = bouwWorker(opzet);
      const b = bouwWorker(opzet);
      const ping = await a.api.handlePing(a.verzoek('/v1/ping'), a.env);
      const msg = await b.api.handleMessages(
        b.verzoek('/v1/messages', 'POST', { messages: [{ role: 'user', content: 'ping' }] }), b.env, b.ctx);
      toets(naam + ': ping ' + ping.status + ' = messages ' + msg.status,
            ping.status === msg.status,
            'de ping oordeelt anders dan de route die hij namaakt');
      toets(naam + ': en de ping belt niemand', a.staat.aiCalls === 0, String(a.staat.aiCalls));
    }
  }

  // ── 5. de route hangt in de router ──────────────────────────────
  // Een handler die nergens aan hangt is precies zo duur als geen handler:
  // dan geeft /v1/ping een 404, valt de chip om, en staat de verleiding om
  // "even terug naar /v1/messages" er meteen weer.
  console.log('\n5. GET /v1/ping komt bij handlePing uit');
  {
    const w = bouwWorker();
    const resp = await w.viaRouter('/v1/ping', 'GET');
    toets('de router beantwoordt GET /v1/ping', resp.status === 200 && resp.body.ok === true,
          JSON.stringify(resp.body || resp.status));
    const post = await w.viaRouter('/v1/ping', 'POST', {});
    toets('POST /v1/ping bestaat niet (één vorm, niet twee)', post.status === 404, String(post.status));
  }

  // ── 6. één login door de hele keten: het saldo blijft staan ─────
  // En de tegenproef ernaast, want anders bewijst dit alleen dat er niets
  // gemeten is: dezelfde opzet, maar via /v1/messages — dan gaat er precies
  // één credit af, en dat is de waarneming uit #179.
  console.log('\n6. Een login laat het saldo op 40 staan; via /v1/messages was het 39');
  {
    const w = bouwWorker({ saldo: 40 });
    const app = bouwApp(plFetchNaar(w, w.staat));
    await app.testApiKey();
    toets('de app is via de router bij /v1/ping uitgekomen',
          w.staat.paden.length === 1 && w.staat.paden[0].pad === '/v1/ping',
          JSON.stringify(w.staat.paden));
    toets('het saldo staat na de login nog op 40', w.staat.saldo === 40, String(w.staat.saldo));
    toets('er is geen AI-call gedaan', w.staat.aiCalls === 0, String(w.staat.aiCalls));
    toets('en de chip staat groen', app.pil.textContent.indexOf('✓') >= 0, app.pil.textContent);

    const oud = bouwWorker({ saldo: 40 });
    await oud.viaRouter('/v1/messages', 'POST',
      { model: 'claude-sonnet-5', max_tokens: 20, messages: [{ role: 'user', content: 'ping' }] });
    toets('tegenproef: dezelfde drie woorden via /v1/messages kosten er wél één',
          oud.staat.saldo === 39, String(oud.staat.saldo) +
          ' — als dit geen 39 is, meet deel 6 hierboven niets');
    toets('tegenproef: en dáár ging de call wél naar Anthropic', oud.staat.aiCalls === 1,
          String(oud.staat.aiCalls));
  }

  console.log('\n' + (fouten ? fouten + ' van ' + n + ' FOUT' : 'alle ' + n + ' tests geslaagd') + '\n');
  process.exit(fouten ? 1 : 0);
})();
