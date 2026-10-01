// ══════════════════════════════════════════════════════════════════
// test-berekend.js — de rekenregels van pidlane-berekend.js (27-09-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de ECHTE module in een vm-context en toetst bereken() en bronset().
// De bedrading (keuzelijst, pollus, sendCmd) toetst bproef-berekend.js.
//
// Wat hier rood hoort te worden:
//   • een verbruik uit de luchtmassa op een diesel (die loopt arm, λ≠1);
//   • liters per 100 km bij stilstand (delen door bijna nul);
//   • een ontbrekende bron die als 0 doorrekent in plaats van null;
//   • een laaddruk die de gemeten omgevingsdruk negeert;
//   • een versnelling "neutraal" die als "weet niet" leest.
//
// Draaien vanuit public/:  node test-berekend.js
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
if (!B) throw new Error('PLBerekend niet gezet — anker weg?');

console.log('\n— versnelling (CA01) —');
ok(B.bereken('CA01', {}, { gear: 4 }) === 4, 'de 4e is 4');
ok(B.bereken('CA01', {}, { gear: 0 }) === 0, 'neutraal is 0 en niet null');
ok(B.bereken('CA01', {}, { gear: null }) === null, 'geen cijfer is null');

console.log('\n— brandstof (CA02, CA03) —');
ok(B.bereken('CA02', { '015E': 6.4 }, {}) === 6.4, '015E gaat direct door');
const maf = B.bereken('CA02', { '0110': 10 }, {});
ok(Math.abs(maf - 10 * 3600 / (14.7 * 745)) < 0.01, 'luchtmassa bij λ=1 op benzine', maf);
ok(B.bereken('CA02', { '0110': 10 }, { diesel: true }) === null, 'diesel: niet uit de luchtmassa');
ok(B.bereken('CA02', { '015E': 3 }, { diesel: true }) === 3, 'diesel mét 015E: wel');
ok(B.bereken('CA03', { '015E': 6, '010D': 100 }, {}) === 6, '6 l/u bij 100 km/u is 6 l/100 km');
ok(B.bereken('CA03', { '015E': 1, '010D': 3 }, {}) === null, 'onder 5 km/u geen l/100 km');
ok(B.bereken('CA03', { '010D': 100 }, {}) === null, 'zonder brandstofbron null, niet 0');

console.log('\n— laaddruk (CA04), trim (CA05), vermogen (CA06) —');
ok(B.bereken('CA04', { '010B': 181.3 }, {}) === 0.8, 'zonder 0133: tegen 101,3 kPa');
ok(B.bereken('CA04', { '010B': 181.3, '0133': 85 }, {}) === 0.96, 'met 0133 (hoogte): die telt');
ok(B.bereken('CA04', { '010B': 30 }, { baro: 100 }) === -0.7, 'onderdruk is negatief');
ok(B.bereken('CA05', { '0106': 3.1, '0107': -1.6 }, {}) === 1.5, 'kort + lang');
ok(B.bereken('CA05', { '0106': 3.1 }, {}) === null, 'één trim is geen totaal');
const kw = B.bereken('CA06', { '0162': 50, '0163': 300, '010C': 3000 }, {});
ok(Math.abs(kw - 47.1) < 0.05, '50% van 300 Nm bij 3000 tpm ≈ 47,1 kW', kw);
ok(B.bereken('CA06', { '0162': -10, '0163': 300, '010C': 3000 }, {}) === 0, 'motorremmen is 0 kW, niet negatief');

console.log('\n— bronset: wat kan op deze auto —');
const heeft = s => p => s.indexOf(p) >= 0;
ok(JSON.stringify(B.bronset('CA03', heeft(['0110', '010D']), false)) === '["0110","010D"]', 'benzine zonder 015E: via de luchtmassa');
ok(B.bronset('CA03', heeft(['0110', '010D']), true) === null, 'diesel zonder 015E: niet');
ok(JSON.stringify(B.bronset('CA03', heeft(['015E', '0110', '010D']), true)) === '["015E","010D"]', 'diesel met 015E: wel');
ok(B.bronset('CA06', heeft(['0162', '010C']), false) === null, 'vermogen zonder referentiekoppel: niet');
ok(B.isBerekend('ca01') && !B.isBerekend('010C') && !B.isBerekend('2101'), 'isBerekend kent alleen CA..');
ok(ctx.ALL_PID_DEFS.CA01 && ctx.ALL_PID_DEFS.CA01.berekend === true && ctx.ALL_PID_DEFS['010C'].name === 'Toerental', 'geregistreerd in ALL_PID_DEFS zonder iets te overschrijven');
ok(Object.keys(B.DEFS).every(p => /^CA[0-9A-F]{2}$/.test(p) && B.DEFS[p].unit !== 'raw' && !/^PID\s/.test(B.DEFS[p].name)),
  'elke naam is CA+hex en duidbaar (de PID-gate laat hem door, pid_selectie op de server ook)');

console.log('\n— nieuwe berekeningen (ronde 2) —');
ok(B.bereken('CA07', { '0162': 50, '0163': 300 }, {}) === 150, 'koppel: 50% van 300 Nm is 150 Nm');
ok(B.bereken('CA08', { '015E': 6 }, { prijs: 2 }) === 12, 'kosten: 6 l/u × € 2 = € 12 per uur');
ok(B.bereken('CA08', { '015E': 6 }, {}) === null, 'zonder prijs geen kosten (null, geen 0)');
ok(B.bereken('CA09', { '012F': 50 }, { tank: 60, verbruikGem: 6 }) === 500, 'bereik: halve tank van 60 l bij 6 l/100 = 500 km');
ok(B.bereken('CA09', { '012F': 50 }, { verbruikGem: 6 }) === null, 'bereik zonder tankinhoud: null');
const rend = B.bereken('CA10', { '0162': 50, '0163': 300, '010C': 3000, '015E': 15 }, { kwhPerL: 8.9 });
ok(Math.abs(rend - 35.3) < 0.2, 'rendement: 47,1 kW uit 15 l/u benzine ≈ 35 %', rend);
ok(B.bereken('CA10', { '0162': 50, '0163': 300, '010C': 3000, '015E': 0.2 }, { kwhPerL: 8.9 }) === null, 'rendement bij bijna nul debiet: geen waarde (delen door bijna nul)');
ok(B.bereken('CA13', { '0105': 92, '0146': 18 }, {}) === 74, 'koelwater min buiten');
ok(B.bereken('CA14', { '0108': 2, '0109': -1 }, {}) === 1, 'trim B2');
ok(B.bereken('CA15', { '0106': 4, '0107': 3, '0108': 1, '0109': 0 }, {}) === 6, 'trimverschil B1 − B2');
ok(B.bereken('CA16', {}, { slip: 12.34 }) === 12.3 && B.bereken('CA16', {}, {}) === null, 'slip komt uit PLGear, zonder slip null');
ok(B.bereken('CA17', {}, { kosten: 3.456, prijs: 2 }) === 3.46, 'kosten deze rit');
ok(B.bereken('CA01', {}, { gear: -1 }) === -1, 'achteruit is -1');

console.log('\n— schakeladvies: alleen omhoog —');
const R = { 1: 7.4, 2: 13.1, 3: 19.6, 4: 25.8, 5: 31.9, 6: 38.2 };
ok(B.schakelAdvies(50, 3800, 2, R, false, 30) === 4, '2e bij 3800 tpm, rustig: naar de 4e (2600 → 1930 tpm blijft boven 1700)');
ok(B.schakelAdvies(50, 2000, 2, R, false, 30) === 2, 'onder 2400 tpm: blijven');
ok(B.schakelAdvies(50, 3800, 2, R, false, 90) === 2, 'zwaar belast (klim, caravan): blijven');
ok(B.schakelAdvies(100, 1200, 6, R, false, 30) === 6, 'laag toerental in de 6e: NOOIT terugschakelen');
ok(B.schakelAdvies(80, 1300, 5, R, true, 95) === 5, 'diesel op een klim met lage toeren: geen terugschakeladvies');
let lager = null;
for (let g = 1; g <= 6; g++) for (let rpm = 800; rpm <= 6500; rpm += 300) for (const bel of [undefined, 10, 60, 99]) for (const di of [false, true]) {
  const a = B.schakelAdvies(40, rpm, g, R, di, bel);
  if (a !== null && a < g && !lager) lager = { g, rpm, bel, di, a };
}
ok(lager === null, 'over alle versnellingen, toerentallen, belastingen en motoren: nooit een lagere versnelling', lager);
ok(B.schakelAdvies(10, 3800, 2, R, false, 30) === null, 'stapvoets: geen uitspraak');
ok(B.bronset('CA11', () => true, false, { automaat: true }) === null, 'automaat: geen schakeladvies');
ok(B.bronset('CA16', () => true, false, { automaat: false }) === null, 'handbak: geen omvormerslip');
ok(B.bronset('CA12', () => true, false, {}) === null, 'benzine: geen roetfilterteller');
ok(B.bronset('CA09', () => true, false, {}) === null && !!B.bronset('CA09', () => true, false, { tank: 50 }), 'bereik alleen met tankinhoud in het profiel');

console.log('\n— roetfilterteller —');
const d = { kmSinds: null, laatste: null, heetSinds: null };
let t = 0, regen = 0;
for (let i = 0; i < 60; i++) { t += 1000; if (B.dpfTik(d, { temp: 620, belasting: 95, km: 0.02, t })) regen++; }
ok(regen === 0, 'heet onder zware last (trekken) is geen regeneratie');
for (let i = 0; i < 100; i++) { t += 1000; if (B.dpfTik(d, { temp: 610, belasting: 40, km: 0.02, t })) regen++; }
ok(regen === 1 && d.kmSinds < 1, '90 s heet bij lage last: één regeneratie, teller terug naar 0', d);
for (let i = 0; i < 100; i++) { t += 1000; B.dpfTik(d, { temp: 300, belasting: 40, km: 0.02, t }); }
ok(d.kmSinds > 1.5, 'daarna telt hij de km op', d.kmSinds);
const nooit = { kmSinds: null, laatste: null, heetSinds: null };
B.dpfTik(nooit, { temp: 200, km: 5, t: 1 });
ok(nooit.kmSinds === null && B.bereken('CA12', {}, { dpfKm: null }) === null, 'vóór de eerste gezien regeneratie: geen waarde, geen 0');

console.log('\n— oordeel voor blok 5 —');
const goed = { pids: { CA05: { n: 400, min: -3, max: 4, buiten: 0 } }, geweigerd: [], vermogen: {} };
ok(B.oordeel(goed).staat === 'ok', 'binnen bereik en geen weigeringen: ok');
ok(B.oordeel({ pids: goed.pids, geweigerd: [{ cmd: 'CA01', waar: 'x' }], vermogen: {} }).staat === 'FOUT', 'één weigering in sendCmd: FOUT, met het pad');
ok(B.oordeel({ pids: { CA05: { n: 3, min: -60, max: 0, buiten: 1 } }, geweigerd: [], vermogen: {} }).staat === 'FOUT', 'buiten bereik: FOUT');
ok(B.oordeel({ pids: { CA10: { n: 30, min: 5, max: 61, buiten: 0 } }, geweigerd: [], vermogen: {} }).staat === 'FOUT', 'rendement boven 45%: FOUT');
const vmo = { pids: { CA06: { n: 90, min: 0, max: 140, buiten: 0 } }, geweigerd: [], voertuig: { vermogen: 110 } };
ok(B.oordeel(Object.assign({}, vmo, { vermogen: { volgasN: 0 } })).staat === 'LET OP', 'vermogen zonder vol gas: LET OP met wat er nodig is');
ok(/vol gas/.test(B.oordeel(Object.assign({}, vmo, { vermogen: { volgasN: 0 } })).detail), 'en die zegt "vol gas"');
ok(B.oordeel(Object.assign({}, vmo, { vermogen: { volgas: 140, volgasN: 5 } })).staat === 'FOUT', '140 kW bij een auto van 110 kW: FOUT');
ok(B.oordeel(Object.assign({}, vmo, { vermogen: { volgas: 104, volgasN: 5 } })).staat === 'ok', '104 kW bij 110 kW: ok');
ok(B.oordeel({ pids: {}, geweigerd: [], vermogen: {} }).staat === 'LET OP', 'niets gerekend: LET OP');

console.log('\n— bronnen van één moment (#337) —');
// De echte tik(), in een eigen context: pidHist met tijden, een verbonden
// auto, en de bronnen die de CX-5 geeft. Testrun 8.3 zag CA10 tot 96,7%:
// 0110 al gezakt na gas los, 0162 nog van een seconde eerder.
function rit(hist, geenTik){
  const nu = Date.now();
  const c = { console: { log(){}, warn(){} }, Math, JSON, Object, Array, String, Number, Set, Date, isFinite,
    ALL_PID_DEFS: {}, connected: true, demoMode: false,
    supportedPIDs: new Set(['010C', '010D', '0110', '0162', '0163']), activePIDs: new Set(), pidHist: {} };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-berekend.js'), 'utf8'), c, { filename: 'pidlane-berekend.js' });
  Object.keys(hist).forEach(p => { c.pidHist[p] = [{ t: nu - hist[p][1], v: hist[p][0] }]; });
  if (!geenTik) c.PLBerekend.tik();
  return c.PLBerekend;
}
// Gas los: 0110 vers en laag (2 g/s), 0162 nog 60% van 2,5 s eerder.
let Q = rit({ '010C': [2500, 50], '010D': [80, 100], '0110': [2, 50], '0162': [60, 2500], '0163': [250, 50] });
let st = Q.stats();
ok(!st.pids.CA10, 'gas los: 0162 van 2,5 s eerder naast een verse 0110 geeft geen rendement', st.pids.CA10);
ok(st.scheef && st.scheef.CA10 === 1, 'en dat wordt geteld als overgeslagen', st.scheef);
ok(st.pids.CA03 && st.pids.CA03.n === 1, 'CA03 (0110 en 010D binnen 50 ms) rekent gewoon door', st.pids.CA03);
// TEGENPROEF: dezelfde waarden, nu van één moment — dan rekent hij wel, en
// het rendement is dan hoog: de klem ervoor bestaat en blijft rood melden.
Q = rit({ '010C': [2500, 50], '010D': [80, 100], '0110': [2, 50], '0162': [60, 300], '0163': [250, 50] });
ok(Q.stats().pids.CA10 && Q.stats().pids.CA10.n === 1, 'TEGENPROEF: dezelfde bronnen binnen 1 s: CA10 wordt wel gerekend', Q.stats().pids);
ok(Q.maat('berekend-buiten') >= 1 && Q.maat('berekend-rendement-max') > 45,
   'en dan meldt de app-maat het onmogelijke rendement (buiten ' + Q.maat('berekend-buiten') + ', max ' + Q.maat('berekend-rendement-max') + ')');
ok(Q.samen([0, 1000]) && !Q.samen([0, 1001]) && Q.samen([5]) && Q.samen([]), 'samen(): grens op precies ' + Q.SAMEN_MS + ' ms');
ok(rit({}, true).maat('berekend-buiten') === null && rit({}, true).maat('berekend-n') === null && rit({}, true).maat('berekend-rendement-max') === null,
   'vóór de eerste berekening: de app-maten zijn null (niet gemeten), niet 0');
// Optrekken rond 5 km/u: CA03 kan echt boven 50 komen, en dat is de rand van
// de tegel en geen fout in de som.
ok(B.bereken('CA03', { '015E': 6, '010D': 6 }, {}) === B.DEFS.CA03.max, 'CA03 klemt op het bereik van de tegel (' + B.DEFS.CA03.max + '), niet op 99', B.bereken('CA03', { '015E': 6, '010D': 6 }, {}));
Q = rit({ '010C': [1500, 50], '010D': [6, 100], '0110': [30, 50] });
ok(Q.stats().pids.CA03 && Q.stats().pids.CA03.buiten === 0, 'optrekken bij 6 km/u telt niet meer als buiten bereik', Q.stats().pids.CA03);

console.log(fouten ? `\n${fouten} van ${n} FOUT` : `\nAlle ${n} goed`);
process.exit(fouten ? 1 : 0);
