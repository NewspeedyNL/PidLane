// ══════════════════════════════════════════════════════════════════
// test-assetsignore.js — de tests gaan niet mee naar app.pidlane.nl
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// public/ is de map die Cloudflare als statische site uitlevert
// (wrangler.toml, [assets]). De tests staan daar óók, omdat ze de
// modules naast zich inlezen. Tot 26-09-2026 stonden daardoor 160
// test-*.js en bproef-*.js — 2,3 MB, met de hele binnenkant van de app
// erin uitgelegd — openbaar op app.pidlane.nl.
//
// public/.assetsignore houdt ze tegen. Die lijst heeft twee manieren om
// stil fout te gaan, en allebei zie je pas als het live staat:
//   - een patroon te smal: een nieuwe testsoort gaat alsnog online
//   - een patroon te breed: een module van de app zelf wordt niet
//     geüpload, en de app start met een 404 in de <head>
//
// Wat hier getoetst wordt — met git zelf als patroonmotor, want
// .assetsignore gebruikt gitignore-syntax:
//   1. elke test-*.js en bproef-*.js in public/ valt eronder
//   2. niets waar index.html, privacy.html of verwijderen.html naar
//      verwijst valt eronder, en ook geen pidlane-*.js of config.js
//   3. TEGENPROEF IN DE TOETS ZELF: met een lege lijst valt er niets
//      onder. Anders zou stap 1 ook groen staan als git om een andere
//      reden alles negeerde, en dan meet deze test niets.
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PUB = __dirname;
const LIJST = path.join(PUB, '.assetsignore');
let fout = 0;
function ok(msg) { console.log('  ok    ' + msg); }
function faal(msg) { console.log('  FOUT  ' + msg); fout++; }

if (!fs.existsSync(LIJST)) {
  console.log('  FOUT  public/.assetsignore ontbreekt — de tests gaan mee online');
  process.exit(1);
}

// git check-ignore geeft exit 1 als niets eronder valt; dat is geen fout.
function genegeerd(lijst, bestanden) {
  try {
    const uit = execFileSync('git',
      ['-c', 'core.excludesFile=' + lijst, 'check-ignore', '--no-index', '--', ...bestanden],
      { cwd: PUB, encoding: 'utf8' });
    return new Set(uit.split('\n').filter(Boolean));
  } catch (e) {
    if (e.status === 1) return new Set();
    throw e;
  }
}

const alles = fs.readdirSync(PUB).filter(f => fs.statSync(path.join(PUB, f)).isFile());
const weg = genegeerd(LIJST, alles);

// 1. elke test gaat niet mee
const tests = alles.filter(f => /^(test|bproef)-.*\.js$/.test(f));
const lekt = tests.filter(f => !weg.has(f));
if (tests.length === 0) faal('geen enkele test gevonden in public/ — kijkt deze toets wel op de goede plek?');
else if (lekt.length) faal('gaan toch online: ' + lekt.join(', '));
else ok(tests.length + ' testbestanden vallen onder .assetsignore');

// 2. niets wat de site zelf nodig heeft valt eronder
const nodig = new Set(['config.js', 'index.html']);
for (const f of alles) if (/^pidlane-.*\.js$/.test(f) || f === 'pidlane.css') nodig.add(f);
for (const pagina of ['index.html', 'privacy.html', 'verwijderen.html']) {
  const p = path.join(PUB, pagina);
  if (!fs.existsSync(p)) continue;
  nodig.add(pagina);
  const html = fs.readFileSync(p, 'utf8');
  for (const m of html.matchAll(/\b(?:src|href)="([^"#?:]+)"/g)) nodig.add(m[1].replace(/^\.?\//, ''));
}
const kwijt = [...nodig].filter(f => weg.has(f));
if (kwijt.length) faal('de site verwijst ernaar maar hij wordt niet geüpload: ' + kwijt.join(', '));
else ok(nodig.size + ' bestanden die de site gebruikt blijven geüpload');

// 3. tegenproef: een lege lijst negeert niets
const leeg = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'plassets-')), 'leeg');
fs.writeFileSync(leeg, '');
const zonder = genegeerd(leeg, tests.slice(0, 3));
if (zonder.size) faal('tegenproef: met een lege lijst negeert git toch ' + [...zonder].join(', '));
else ok('tegenproef: zonder lijst gaan de tests wél mee — stap 1 meet dus de lijst');

if (fout) { console.log('\n  ' + fout + ' fout(en)'); process.exit(1); }
console.log('\n  Alles goed.');
