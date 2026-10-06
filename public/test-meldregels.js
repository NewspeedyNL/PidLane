// ══════════════════════════════════════════════════════════════════
// test-meldregels.js — twee regels die nooit klopten (06-10-2026)
// ──────────────────────────────────────────────────────────────────
// Gevonden bij een brede controle op dode aanroepen:
//   • de bugmelding zei bij "Verbinding" altijd "onbekend": _bugDiag() las
//     `isConnected`, een naam die nergens bestaat (pidlane-auth.js);
//   • het rapport zonder AI meldde nooit "n PID(s) gaven herhaald geen data":
//     het las `window._deadPIDs`, die nergens gezet wordt (pidlane-fuel.js).
// Beide staan nu in een eigen functie; deze test laadt die uit de bron en
// toetst ze met de echte namen (`connected`, `demoMode`, `_pidDead`).
// Tegenproef: met de oude namen erin wordt elke toets rood.
//
// Draaien vanuit public/:  node test-meldregels.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, ok, detail) {
  n++;
  if (ok) { console.log('  ok    ' + naam); return; }
  fout++; console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : ''));
}
function knip(bestand, van, tot) {
  const b = fs.readFileSync(bestand, 'utf8'), i = b.indexOf(van), j = b.indexOf(tot, i + 1);
  if (i < 0 || j < 0) { console.log('FOUT: anker ' + JSON.stringify(van) + ' niet gevonden in ' + bestand); process.exit(1); }
  return b.slice(i, j);
}
const VERB = knip('pidlane-auth.js', 'function _bugVerbinding(){', 'function _bugDiag(){');
const DOOD = knip('pidlane-fuel.js', 'function _rapportDodePids(){', 'function buildFallbackReport(');

function verbinding(ctx, bron) {
  const c = Object.assign({}, ctx); vm.createContext(c);
  vm.runInContext(bron + '\nthis.r = _bugVerbinding();', c);
  return c.r;
}
function dodeRegel(ctx, bron) {
  // _pidDead is in de app een top-level const (pidlane-plload.js): bij naam
  // bereikbaar, niet op window. Zo staat hij hier ook.
  const c = { window: {} }; vm.createContext(c);
  vm.runInContext((ctx.dood ? 'const _pidDead = new Set(' + JSON.stringify(ctx.dood) + ');\n' : '') + bron + '\nthis.r = _rapportDodePids();', c);
  return c.r;
}

console.log('\nBugmelding: de verbinding');
toets('verbonden met een auto: "verbonden"', verbinding({ connected: true, demoMode: false }, VERB) === 'verbonden');
toets('niet verbonden: "niet verbonden"', verbinding({ connected: false }, VERB) === 'niet verbonden');
toets('in de demo: "demo", geen echte auto', verbinding({ connected: true, demoMode: true }, VERB) === 'demo');
toets('zonder de vlag (losse pagina): "onbekend"', verbinding({}, VERB) === 'onbekend');

console.log('\nRapport: PIDs zonder data');
const r = dodeRegel({ dood: ['0146', '015C', '0167'] }, DOOD);
toets('drie dode PIDs: de regel staat er, met het aantal', /^🟡 3 PID\(s\) gaven herhaald geen data/.test(r || ''), r);
toets('geen dode PIDs: geen regel', dodeRegel({ dood: [] }, DOOD) === null);
toets('zonder de lijst (losse pagina): geen regel, geen fout', dodeRegel({}, DOOD) === null);

console.log('\nTegenproef: de oude namen');
const OUD_VERB = VERB.replace(/typeof connected==='undefined'/, "typeof isConnected==='undefined'");
toets('met `isConnected` zegt hij weer "onbekend" terwijl er een auto hangt', verbinding({ connected: true }, OUD_VERB) === 'onbekend');
const OUD_DOOD = DOOD.replace("(typeof _pidDead!=='undefined' && _pidDead) ? _pidDead : null", "window._deadPIDs || null");
toets('met `window._deadPIDs` verdwijnt de regel weer', OUD_DOOD !== DOOD && dodeRegel({ dood: ['0146'] }, OUD_DOOD) === null);

console.log('\nDe aanroepers gebruiken ze ook');
// Broncode lezen, met reden: _bugDiag() en buildFallbackReport() bouwen hun
// tekst uit tientallen globale bronnen en de DOM; die na te bouwen om één
// regel te zien is een tweede kopie van de app. Wat hier telt is dat de oude
// naam niet terugkomt en de nieuwe functie gebruikt wordt.
const DIAG = knip('pidlane-auth.js', 'function _bugDiag(){', '\n}\n');
const RAP = knip('pidlane-fuel.js', 'function buildFallbackReport(', '\n}\n');
toets('_bugDiag() vraagt _bugVerbinding(), niet isConnected', /_bugVerbinding\(\)/.test(DIAG) && !/isConnected/.test(DIAG));
toets('buildFallbackReport() vraagt _rapportDodePids(), niet window._deadPIDs', /_rapportDodePids\(\)/.test(RAP) && !/_deadPIDs/.test(RAP));

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'alle ' + n + ' goed'));
process.exit(fout ? 1 : 0);
