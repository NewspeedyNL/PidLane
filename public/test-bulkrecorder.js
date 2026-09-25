// ══════════════════════════════════════════════════════════════════
// test-bulkrecorder.js — wat de bulk-recorder per seconde wegschrijft
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT (26-09-2026)
//
// De recorder kopieerde elke seconde álles uit pidVals. pidVals houdt de
// laatste waarde van elke PID vast, ook als die PID één keer antwoordde en
// daarna nooit meer. Op de telefoon stond daardoor in de bulk-analyse
// "NOx doseerpomp 52,9 % · 600 metingen · 100% dekking" en "AdBlue
// injectiedruk" — op een auto zonder SCR, en zonder dat er ooit een tweede
// meting kwam. De PID-gate die dat afkeurt bestond al; de recorder vroeg het
// hem alleen niet.
//
// Getoetst op de echte bestanden: pidlane-data.js (de definities),
// pidlane-pidgate.js (de gate) en pidlane-bulk.js (de recorder). Geen eigen
// lijst van "diesel-PIDs" hier — die staat in de gate, en een kopie zou
// uit de pas lopen zonder dat iemand het ziet.
//
// Draaien vanuit public/:  node test-bulkrecorder.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
function lees(f) { return fs.readFileSync(__dirname + '/' + f, 'utf8'); }

function maak(brandstof) {
  const T = { t: 5000000 };
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {},
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], setAttribute() {} });
  const c = {
    console: { log() {}, warn() {}, error() {} },
    Date: Object.assign(function () { return new Date(T.t); }, { now: () => T.t }),
    setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, clearTimeout() {},
    document: { getElementById: () => null, createElement: el, body: el(), head: el(), addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    vehicleInfo: { brandstof: brandstof },
    pidVals: {}, _pidLastUpd: {}, _pidHealth: {}, _pidOpgeruimd: new Set(),
    activePIDs: new Set(), hiddenPIDs: new Set(), PIDS: [], discoveredPIDDefs: []
  };
  c.window = c; c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(lees('pidlane-data.js'), c, { filename: 'pidlane-data.js' });
  // De bitmaplijst staat in pidlane-rijsituatie.js; alleen die regel, uit de echte bron.
  const rs = lees('pidlane-rijsituatie.js'), i = rs.indexOf('const GEEN_SENSOR_PIDS'), j = rs.indexOf(';', i);
  if (i < 0 || j < 0) { console.error('FOUT: GEEN_SENSOR_PIDS niet te knippen — is hij hernoemd?'); process.exit(1); }
  vm.runInContext(rs.slice(i, j + 1).replace('const ', 'var '), c, { filename: 'rijsituatie-knip.js' });
  vm.runInContext(lees('pidlane-pidgate.js'), c, { filename: 'pidlane-pidgate.js' });
  vm.runInContext(lees('pidlane-bulk.js'), c, { filename: 'pidlane-bulk.js' });
  c.T = T;
  return c;
}
function meet(c, pid, v, geledenMs) { c.pidVals[pid] = v; c._pidLastUpd[pid] = c.T.t - (geledenMs || 0); }

const B = maak('Benzine');
if (!B.PLBulk || typeof B.PLBulk._pakPidVals !== 'function') { console.error('FOUT: PLBulk._pakPidVals ontbreekt — is de export gewijzigd?'); process.exit(1); }
if (typeof B.pidGate !== 'function') { console.error('FOUT: pidGate niet geladen'); process.exit(1); }

console.log('\n── 1. wat niet bij dit voertuig past, gaat niet mee ──');
meet(B, '010C', 820); meet(B, '0105', 71);
meet(B, '018E', 52.9); meet(B, '01A4', 8.2);       // NOx doseerpomp, AdBlue injectiedruk
meet(B, '0160', 107); meet(B, '01A0', 16);          // ondersteuningsbitmaps, geen sensor
let r = B.PLBulk._pakPidVals();
waar('toerental en koelwater gaan mee', r['010C'] === 820 && r['0105'] === 71, JSON.stringify(r));
waar('NOx doseerpomp gaat op een benzineauto niet mee', !('018E' in r), JSON.stringify(r));
waar('AdBlue injectiedruk gaat op een benzineauto niet mee', !('01A4' in r), JSON.stringify(r));
waar('een ondersteuningsbitmap (0160, 01A0) is geen meting', !('0160' in r) && !('01A0' in r), JSON.stringify(r));
B._pidHealth['0105'] = 'onzin';
r = B.PLBulk._pakPidVals();
waar('een sensor die de app als onzin heeft beoordeeld gaat niet mee', !('0105' in r), JSON.stringify(r));

const D = maak('Diesel');
meet(D, '018E', 52.9); meet(D, '010C', 820);
r = D.PLBulk._pakPidVals();
waar('op een diesel gaat de NOx-doseerpomp wél mee (tegenproef: de poort kijkt naar het voertuig)', r['018E'] === 52.9, JSON.stringify(r));

console.log('\n── 2. een oude waarde is geen meting ──');
const O = maak('Benzine');
meet(O, '010C', 820, 500);
meet(O, '0105', 71, O.PLBulk.VERS_MS + 1000);
r = O.PLBulk._pakPidVals();
waar('net gemeten: mee', r['010C'] === 820, JSON.stringify(r));
waar('langer dan ' + (O.PLBulk.VERS_MS / 1000) + ' s niet bijgewerkt: niet mee', !('0105' in r), JSON.stringify(r));
O._pidLastUpd['0105'] = O.T.t - (O.PLBulk.VERS_MS - 1000);
r = O.PLBulk._pakPidVals();
waar('binnen het venster: mee', r['0105'] === 71, JSON.stringify(r));

console.log('\n── 3. een opname van vóór deze fix: de analyse laat het weg, en zegt dat ──');
vm.runInContext(lees('pidlane-bulkvenster.js'), B, { filename: 'pidlane-bulkvenster.js' });
const regels = [];
for (let i = 0; i < 600; i++) regels.push({ t: 1000000 + i * 1000, seg: 'stil', n: 3, v: { '010C': 800 + i % 7, '018E': 52.9, '01A4': 8.2 } });
const an = B.PLBulkUI._analyseer('oud', regels);
waar('toerental staat in de analyse', an.pids['010C'] && an.pids['010C'].n === 600, JSON.stringify(Object.keys(an.pids)));
waar('NOx en AdBlue staan er op een benzineauto niet in', !an.pids['018E'] && !an.pids['01A4'], JSON.stringify(Object.keys(an.pids)));
const zin = B.PLBulkUI._conclusies(an).filter(z => z.kop === 'Weggelaten')[0];
waar('de conclusies zeggen dat er twee sensoren zijn weggelaten, met naam',
  zin && /^2 sensoren/.test(zin.tekst) && /NOx doseerpomp/.test(zin.tekst), JSON.stringify(zin));

console.log('\n' + (fout ? 'FOUT: ' : 'goed: ') + ok + ' ok, ' + fout + ' fout\n');
process.exit(fout ? 1 : 0);
