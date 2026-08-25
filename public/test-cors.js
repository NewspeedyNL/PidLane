// ══════════════════════════════════════════════════════════════════
// test-cors.js — elke gevoelige route is ook echt origin-locked
// ──────────────────────────────────────────────────────────────────
// WAAROM
// De Worker heeft twee losse mechanismen die samen moeten werken:
//
//   isRestrictedPath(pad)   bepaalt of de preflight (OPTIONS) gelockt wordt
//   lockOrigin(req, resp)   lockt het ANTWOORD van de route zelf
//
// Ze staan honderden regels uit elkaar en niets koppelt ze. Zet je een route
// wel in isRestrictedPath maar vergeet je lockOrigin in de router, dan gaat de
// preflight goed en lekt het antwoord alsnog met Access-Control-Allow-Origin: *.
// Andersom net zo. Precies dat was tot 25-08-2026 het geval voor /v1/messages
// en /copilot — de twee routes die tegoed verbruiken.
//
// Deze test knipt isRestrictedPath uit worker.js en voert hem uit, en leest
// daarna de router om te controleren dat beide kanten kloppen.
//
// Draaien vanuit public/:  node test-cors.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

const src = fs.readFileSync(__dirname + '/../worker.js', 'utf8');

let fout = 0, n = 0;
function toets(naam, ok, detail) {
  n++;
  if (ok) { console.log('  ok    ' + naam); return; }
  console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : ''));
  fout++;
}

console.log('\nCORS — origin-lock op gevoelige routes\n');

// ── 1. isRestrictedPath echt uitvoeren ──
const van = src.indexOf('function isRestrictedPath');
const tot = src.indexOf('__name(isRestrictedPath');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: isRestrictedPath niet gevonden in worker.js'); process.exit(1);
}
const isRestrictedPath = new Function(
  src.slice(van, tot) + '\nreturn isRestrictedPath;')();

const MOET_DICHT = [
  ['/auth/login',        'inloggen levert een sessietoken op'],
  ['/v1/messages',       'verbruikt tegoed van de klant'],
  ['/copilot',           'beheerderstoegang tot de AI'],
  ['/airtable/log',      'schrijft in de logbase'],
  ['/airtable/veldlab',  'schrijft meetdata weg'],
  ['/airtable/reference','leest referentiewaarden'],
  ['/proxy',             'praat namens ons met RDW'],
  ['/api/config',        'feature-flags en instellingen'],
  ['/admin/users',       'beheer'],
  ['/admin/klanten',     'klantgegevens'],
  ['/klant/login',       'klantaccounts'],
  ['/klant/mij',         'saldo en profiel'],
  ['/credits/redeem',    'wisselt een activatiecode in'],
  ['/session/create',    'remote-sessie'],
  ['/pair/create',       'koppelcode'],
  ['/code/resolve',      'meekijkcode'],
];
for (const [pad, waarom] of MOET_DICHT) {
  toets('dicht: ' + pad + '  (' + waarom + ')', isRestrictedPath(pad) === true);
}

// Deze mogen bewust open: ze serveren publieke bestanden aan de updater en
// aan mensen die de app nog moeten installeren.
const MAG_OPEN = [
  ['/download/pidlane.apk', 'de APK moet zonder account te halen zijn'],
  ['/version.json',         'de updatecontrole draait voor het inloggen'],
  ['/health',               'statuscontrole'],
];
for (const [pad, waarom] of MAG_OPEN) {
  toets('open: ' + pad + '  (' + waarom + ')', isRestrictedPath(pad) === false);
}

// ── 2. de router moet lockOrigin gebruiken waar het moet ──
// De WebSocket-upgrade is de ene gerechtvaardigde uitzondering: lockOrigin
// bouwt de respons opnieuw op met new Response(), en daarbij sneuvelt zowel
// status 101 als het webSocket-veld. CORS geldt sowieso niet voor WebSockets,
// en handleSessionConnect controleert zijn eigen join-token.
const UITZONDERING = { 'handleSessionConnect': 'WebSocket-upgrade, zie hierboven' };

const routerVan = src.indexOf('var worker_default');
if (routerVan < 0) { console.error('FOUT: router niet gevonden'); process.exit(1); }
const router = src.slice(routerVan);

// De router opknippen PER route. Een vast venster van een paar regels werkt
// hier niet: dat leest de lockOrigin van de VOLGENDE route mee, en dan is de
// controle stil waardeloos. Gemerkt door deze test zelf te muteren: hij bleef
// groen terwijl /v1/messages ongelockt was. Een controle die niet kan falen is
// erger dan geen controle, want je vertrouwt erop.
const brokken = router.split(/if \(url\.pathname/).slice(1);
const ongelockt = [];
for (const brok of brokken) {
  const m = brok.match(/^ === "([^"]+)"/);
  if (!m) continue;
  const pad = m[1];
  if (!isRestrictedPath(pad)) continue;
  // Een brok kan meerdere returns hebben (/api/config doet GET en POST, en
  // /admin/users net zo); ze moeten allemaal gelockt zijn, niet alleen de eerste.
  const returns = brok.split('\n').filter(r => /return .*await handle\w+\(/.test(r));
  for (const r of returns) {
    const h = r.match(/await (handle\w+)\(/);
    if (!h || UITZONDERING[h[1]]) continue;
    if (r.indexOf('lockOrigin') < 0) ongelockt.push(pad + ' \u2192 ' + h[1] + '()');
  }
}
toets('elke gevoelige route in de router gaat door lockOrigin',
      ongelockt.length === 0,
      ongelockt.length ? 'zonder lockOrigin:\n        · ' + ongelockt.join('\n        · ') : '');

// ── 3. de helper zelf mag niet stilletjes verdwijnen ──
toets('lockOrigin leest de allowlist via originToegestaan',
      /if \(origin && originToegestaan\(origin\)\)/.test(src),
      'lockOrigin controleert de herkomst niet meer zoals verwacht');
toets('alleen loopback in de localhost-uitzondering',
      /LOCALHOST_ORIGIN = \/\^http:/.test(src) && !/LOCALHOST_ORIGIN[\s\S]{0,120}https\?/.test(src),
      'LOCALHOST_ORIGIN mag alleen http op localhost/127.0.0.1 toestaan');

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'alle ' + n + ' tests geslaagd') + '\n');
process.exit(fout ? 1 : 0);
