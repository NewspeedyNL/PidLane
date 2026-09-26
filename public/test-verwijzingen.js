// ══════════════════════════════════════════════════════════════════
// test-verwijzingen.js — bestaat elk bestand waar een pagina naar wijst?
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Tot 26-09-2026 wees index.html naar favicon-32.png, favicon.ico,
// apple-touch-icon.png en manifest.webmanifest. Geen van die vier heeft
// ooit in de repo gestaan. Elke paginalading gaf dus vier 404's, en omdat
// een ontbrekend asset naar de Worker doorvalt was dat ook vier keer
// worker.js die "not_found" antwoordde. Niemand zag het: een ontbrekend
// icoon breekt niets, het staat alleen rood in de console en in het
// pre-launch-rapport van Play.
//
// Wat hier getoetst wordt:
//   1. elke lokale src= en href= in index.html, privacy.html en
//      verwijderen.html bestaat in public/ of is een route die
//      wrangler.toml naar de Worker stuurt — behalve capacitor.js, die
//      alleen in de APK bestaat en in de browser met onerror wordt
//      opgevangen (PIDLANE.md §4)
//   2. het manifest is geldige JSON, en elk icoon erin bestaat en is
//      echt zo groot als het manifest zegt (gelezen uit de PNG-kop)
//   3. TEGENPROEF IN DE TOETS ZELF: een pagina met een verwijzing naar
//      een bestand dat er niet is, wordt afgekeurd
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

const PUB = __dirname;
const ALLEEN_IN_APK = new Set(['capacitor.js']);
// Wat wrangler.toml naar de Worker stuurt, is geen bestand maar een route.
const toml = fs.readFileSync(path.join(PUB, '..', 'wrangler.toml'), 'utf8');
const blok = toml.match(/run_worker_first\s*=\s*\[([\s\S]*?)\]/);
if (!blok) { console.log('  FOUT  run_worker_first niet gevonden in wrangler.toml'); process.exit(1); }
const ROUTES = [...blok[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
function isRoute(p) { return ROUTES.some(r => r.endsWith('/*') ? p.startsWith(r.slice(0, -1)) : p === r); }
let fout = 0;
function ok(msg) { console.log('  ok    ' + msg); }
function faal(msg) { console.log('  FOUT  ' + msg); fout++; }

function ontbrekend(html) {
  const mist = [];
  for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const v = m[1];
    if (/^(?:[a-z]+:|#|\/\/)/i.test(v)) continue;        // extern, mailto:, anker
    const pad = v.split(/[?#]/)[0];
    if (pad.startsWith('/') && isRoute(pad)) continue;     // Worker-route (/download/…)
    const bestand = pad.replace(/^\//, '') || 'index.html';
    if (ALLEEN_IN_APK.has(bestand)) continue;
    if (!fs.existsSync(path.join(PUB, bestand))) mist.push(bestand);
  }
  return mist;
}

// 1. elke pagina
for (const pagina of ['index.html', 'privacy.html', 'verwijderen.html']) {
  const p = path.join(PUB, pagina);
  if (!fs.existsSync(p)) { faal(pagina + ' ontbreekt'); continue; }
  const mist = ontbrekend(fs.readFileSync(p, 'utf8'));
  if (mist.length) faal(pagina + ' wijst naar wat er niet is: ' + mist.join(', '));
  else ok(pagina + ': elke lokale verwijzing bestaat');
}

// 2. het manifest en zijn iconen
function pngMaat(bestand) {
  const b = fs.readFileSync(bestand);
  if (b.toString('latin1', 1, 4) !== 'PNG') return null;
  return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20);
}
let manifest = null;
try { manifest = JSON.parse(fs.readFileSync(path.join(PUB, 'manifest.webmanifest'), 'utf8')); }
catch (e) { faal('manifest.webmanifest is niet te lezen: ' + e.message); }
if (manifest) {
  const iconen = manifest.icons || [];
  if (!iconen.length) faal('het manifest noemt geen iconen');
  for (const ic of iconen) {
    const p = path.join(PUB, ic.src);
    if (!fs.existsSync(p)) { faal('manifest-icoon ontbreekt: ' + ic.src); continue; }
    const maat = pngMaat(p);
    if (maat !== ic.sizes) faal(ic.src + ' is ' + maat + ', het manifest zegt ' + ic.sizes);
    else ok(ic.src + ' bestaat en is ' + maat);
  }
}

// 3. tegenproef
const nep = ontbrekend('<link rel="icon" href="bestaat-niet.png"><script src="config.js"></script>' +
  '<a href="/weg.html"></a><a href="/download/pidlane.apk"></a><a href="/privacy.html"></a>');
if (nep.join() === 'bestaat-niet.png,weg.html') ok('tegenproef: een verwijzing naar niets wordt gezien');
else faal('tegenproef: de controle ziet een ontbrekend bestand niet (' + JSON.stringify(nep) + ')');

if (fout) { console.log('\n  ' + fout + ' fout(en)'); process.exit(1); }
console.log('\n  Alles goed.');
