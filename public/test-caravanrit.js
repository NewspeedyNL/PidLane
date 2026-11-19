// ══════════════════════════════════════════════════════════════════
// test-caravanrit.js — de caravanrit zonder eigen dashboard (19-11-2026)
// ──────────────────────────────────────────────────────────────────
// Knipt de echte functies uit pidlane-caravan.js en laadt pidlane-vispaneel.js.
// Wat hier rood hoort te worden: een rit die start zonder klare adapter, een
// rit die na een handmatige stop meteen weer start, een met de hand gestarte
// rit die stopt als de rijsituatie uitgaat, een limiet die blijft hangen, en
// een ritregel bij "beladen" zonder caravan.
//
// Draaien vanuit public/:  node test-caravanrit.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fouten = 0, n = 0;
function ok(v, wat, extra){ n++; if (v) console.log('  ok  ' + wat); else { fouten++; console.log('  FOUT  ' + wat + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); } }
function knip(bestand, kop, eind){
  const src = fs.readFileSync(path.join(__dirname, bestand), 'utf8');
  const a = src.indexOf(kop);
  if (a < 0) { console.log('  FOUT  "' + kop + '" niet gevonden in ' + bestand + ' — deze test toetst niets meer'); process.exit(1); }
  return src.slice(a, src.indexOf(eind || '\n}\n', a) + (eind ? eind.length : 3));
}
const c = { console, Math, Number, String };
vm.createContext(c);
vm.runInContext([
  knip('pidlane-caravan.js', 'const CARAVAN_LIMIETEN', '\n'),
  knip('pidlane-caravan.js', 'function caravanLimietVolgende('),
  knip('pidlane-caravan.js', 'function caravanAutoBesluit('),
  'this.L = CARAVAN_LIMIETEN;'
].join('\n'), c, { filename: 'caravan-knip.js' });
const B = o => c.caravanAutoBesluit(Object.assign({ situatie: false, actief: false, bezig: false, klaar: false, handUit: false, auto: false }, o));

console.log('\n— starten en stoppen via de rijsituatie —');
ok(B({ situatie: true, klaar: true }) === 'start', 'rijsituatie caravan en de adapter klaar: start');
ok(B({ situatie: true, klaar: false }) === null, 'adapter nog niet klaar: wachten (geen toast-regen van preAnalysisCheck)');
ok(B({ situatie: true, klaar: true, bezig: true }) === null, 'een start die nog loopt: niet nog een');
ok(B({ situatie: true, klaar: true, actief: true }) === null, 'loopt al: niets');
ok(B({ situatie: true, klaar: true, handUit: true }) === null, 'met de hand gestopt: niet meteen opnieuw');
ok(B({ situatie: false, actief: true, auto: true }) === 'stop', 'rijsituatie uit: de automatisch gestarte rit stopt (met rapport)');
ok(B({ situatie: false, actief: true, auto: false }) === null, 'een met de hand gestarte rit stopt niet als de situatie uit staat');

console.log('\n— de limiet —');
ok(c.caravanLimietVolgende(80) === 90 && c.caravanLimietVolgende(100) === 110 && c.caravanLimietVolgende(110) === 80, '80 → 90 … 110 → 80');
ok(c.caravanLimietVolgende(95) === c.L[0], 'een onbekende waarde begint vooraan');

console.log('\n— de ritregel in het trekpaneel —');
const ctx = { window: {}, console, Math, Number, String, Array, Date, isFinite, JSON };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-vispaneel.js'), 'utf8'), ctx);
const P = ctx.window.PLVisPaneel;
ok(P.caravanModel(null) === null && !/vtp-rit/.test(P.trekHtml(P.trekModel({}))), 'zonder caravan (alleen beladen) geen ritregel');
let m = P.caravanModel({ actief: true, sec: 2525, km: 38.24, limiet: 90 });
ok(m.tekst === '42:05 · 38,2 km' && m.limiet === 90, 'loopt: tijd en afstand', m);
m = P.caravanModel({ actief: false, limiet: 100 });
ok(m.tekst === 'start zodra de adapter klaar is', 'klaar maar nog niet gestart: dat staat er', m);
const h = P.trekHtml(P.trekModel({ caravan: { actief: true, sec: 60, km: 1, limiet: 90 } }));
ok(/class="vtp-limiet"[^>]*onclick="PLVisueel\.limiet\(\)"/.test(h) && />90</.test(h), 'de limiet is een knop met het getal', h.slice(h.indexOf('vtp-rit')));

console.log('\n' + (fouten ? fouten + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
process.exit(fouten ? 1 : 0);
