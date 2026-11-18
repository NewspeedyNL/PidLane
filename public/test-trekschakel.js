// ══════════════════════════════════════════════════════════════════
// test-trekschakel.js — schakeladvies met een caravan (18-11-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-berekend.js en knipt caravanSchakel() uit
// pidlane-caravan.js. Het punt: op een klim met vol gas en wegzakkende
// snelheid zei de app "blijven" (schakelAdvies bij belasting > 75) of niets
// (de caravanregel wachtte op < 1900 tpm). Nu: één lager, mits het toerental
// daarna niet te hoog wordt, en bergop nooit opschakelen.
//
// Wat hier rood hoort te worden: de klimpoort die wegvalt, een omgedraaide
// verhouding (te hoog toerental na terugschakelen), opschakelen bergop, en
// een caravanrit die de versnelling negeert.
//
// Draaien vanuit public/:  node test-trekschakel.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fouten = 0, n = 0;
function ok(v, wat, extra){ n++; if (v) console.log('  ok  ' + wat); else { fouten++; console.log('  FOUT  ' + wat + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); } }

const ctx = { console: { log(){}, warn(){} }, Math, JSON, Object, Array, String, Number, Set, Date, isFinite,
  ALL_PID_DEFS: { '010C': { name: 'Toerental' } } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-berekend.js'), 'utf8'), ctx, { filename: 'pidlane-berekend.js' });
const B = ctx.PLBerekend;
if (!B || typeof B.schakelTrek !== 'function') { console.log('  FOUT  PLBerekend.schakelTrek ontbreekt — deze test toetst niets meer'); process.exit(1); }

// km/u per 1000 tpm, zesbak (dezelfde als test-berekend.js)
const R = { 1: 7.4, 2: 13.1, 3: 19.6, 4: 25.8, 5: 31.9, 6: 38.2 };
const t = o => B.schakelTrek(Object.assign({ kmh: 80, ratios: R, diesel: false }, o));

console.log('\n— klim met caravan —');
ok(t({ gear: 5, rpm: 2600, belasting: 95, trend: -0.6, klim: true }) === 4, '5e, 2600 tpm, vol gas, snelheid zakt: terug naar 4 (≈ 3215 tpm)');
ok(B.schakelAdvies(80, 2600, 5, R, false, 95) === 5, 'TEGENPROEF: het gewone advies zegt hier "blijven" — daarom bestaat schakelTrek');
ok(t({ gear: 5, rpm: 2600, belasting: 95, trend: 0, klim: true }) === 5, 'snelheid houdt stand: blijven');
ok(t({ gear: 5, rpm: 2600, belasting: 95, trend: -0.6, klim: false }) === 5, 'snelheid zakt op vlakke weg (tegenwind, remmen): geen terugschakelen boven min');
ok(t({ gear: 5, rpm: 2500, belasting: 60, pedaal: 85, trend: -0.5, klim: true }) === 4, 'pedaal diep zonder hoge belasting telt ook als zwaar');
ok(t({ gear: 5, rpm: 2500, belasting: 60, pedaal: 40, trend: -0.5, klim: true }) === 5, 'licht gas en snelheid zakt: rustig rijden, geen advies');
ok(t({ gear: 4, rpm: 3800, belasting: 95, trend: -0.6, klim: true }) === 4, '4e bij 3800: in de 3e wordt het ≈ 5000 tpm, boven max 4500 → blijven');
ok(t({ gear: 1, rpm: 2600, belasting: 95, trend: -0.6, klim: true }) === 1, 'in de 1e is er niets lager');
ok(t({ gear: 4, rpm: 3500, belasting: 50, trend: 0, klim: true }) === 4, 'bergop nooit opschakelen');
ok(B.schakelAdvies(80, 3500, 4, R, false, 50) === 6, 'TEGENPROEF: zonder klim zou hetzelfde moment naar de 6e gaan');

console.log('\n— zwoegen en diesel —');
ok(t({ gear: 5, rpm: 1800, belasting: 90 }) === 4, 'benzine onder 2000 tpm en zwaar: terug, ook op vlakke weg');
ok(t({ gear: 5, rpm: 1800, belasting: 50 }) === 5, 'laag toerental bij licht werk: geen zwoegen');
ok(t({ gear: 5, rpm: 2000, belasting: 95, trend: -0.5, klim: true, diesel: true }) === 4, 'diesel 5e, 2000 tpm, klim zakt: terug (≈ 2470 tpm)');
ok(t({ gear: 4, rpm: 3000, belasting: 95, trend: -0.5, klim: true, diesel: true }) === 4, 'diesel 4e bij 3000: 3e wordt ≈ 3950, boven 3500 → blijven');

console.log('\n— buiten de klim het gewone advies —');
for (const [g, rpm, bel] of [[2, 3800, 30], [2, 2000, 30], [3, 3000, 40], [6, 2500, 20]])
  ok(t({ gear: g, rpm, belasting: bel }) === B.schakelAdvies(80, rpm, g, R, false, bel), `vlak ${g}e ${rpm} tpm: gelijk aan schakelAdvies`);
ok(t({ gear: null, rpm: 2600 }) === null && t({ gear: 5, rpm: 2600, kmh: 5 }) === null, 'zonder versnelling of in stilstand geen uitspraak');

// ── caravanSchakel uit pidlane-caravan.js ──
function knip(bestand, kop){
  const src = fs.readFileSync(path.join(__dirname, bestand), 'utf8');
  const a = src.indexOf(kop);
  if (a < 0) { console.log('  FOUT  "' + kop + '" niet gevonden in ' + bestand + ' — deze test toetst niets meer'); process.exit(1); }
  return src.slice(a, src.indexOf('\n}\n', a) + 3);
}
const car = { window: { PLBerekend: B }, console: { warn(){} }, Math, Number };
vm.createContext(car);
vm.runInContext(knip('pidlane-caravan.js', 'function caravanSchakel('), car, { filename: 'caravan-knip.js' });
const S = car.caravanSchakel;

console.log('\n— caravanrit —');
const klim = { speed: 80, rpm: 2600, load: 95, trend: -0.6, climb: 'klim', fuelType: 'benzine' };
let s = S(Object.assign({ gear: 5, ratios: R }, klim));
ok(s && s.advies === 'terug' && s.doel === 4, 'met versnelling: terug naar 4', s);
s = S(klim);
ok(s && s.advies === 'terug' && s.doel === null, 'zonder versnelling: de klimregel zegt ook terug (2600 < 3300)', s);
s = S(Object.assign({}, klim, { trend: 0 }));
ok(s && s.advies === 'ok', 'zonder versnelling, snelheid houdt stand: geen advies', s);
s = S(Object.assign({}, klim, { rpm: 3600 }));
ok(s && s.advies === 'ok', 'zonder versnelling al boven 3300 tpm: niet terug (anders te hoog)', s);
s = S({ speed: 80, rpm: 3000, load: 30, trend: 0, climb: 'vlak', fuelType: 'benzine', gear: 3, ratios: R });
ok(s && s.advies === 'op' && s.doel > 3, 'vlak en licht: op, met doelversnelling', s);
ok(S({ speed: 80 }) === null, 'zonder toerental geen advies');

console.log('\n' + (fouten ? fouten + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
process.exit(fouten ? 1 : 0);
