// ═════════════════════════════════════════════════════════════════
// test-demopakket.js — de demo-Mazda rijdt met het pakket van een echte CX-5
// ─────────────────────────────────────────────────────────────────
// Tot 15-11-2026 kreeg elke benzine-demo dezelfde 25 PID's. Nu draagt de
// Mazda in DEMO_CARS de mode 01-PID's die de motor-ECU 7E8 van een CX-5 2018
// meldt (nepauto-profiel cx5), en geeft demo() elk ervan een gezonde waarde.
// Wat moet onderscheiden:
//   • het pakket is precies het profiel (min wat de app niet kent): een PID
//     die erbij verzonnen wordt of wegvalt, wordt rood
//   • elke PID heeft een waarde binnen zijn bereik, en een die beweegt waar
//     dat moet (looptijd loopt op)
//   • status-PID's zijn vast en gezond: het motorlampje staat nooit aan
//
// Draaien vanuit public/:  node test-demopakket.js     (exit 0 = goed)
// ═════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function t(naam, waar, uitleg) {
  if (waar) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
const lees = (f) => fs.readFileSync(__dirname + '/' + f, 'utf8');

// De echte tabellen
const c = { console: { warn() { } }, Math, Date }; c.window = c; vm.createContext(c);
vm.runInContext(lees('pidlane-data.js'), c);
const DEFS = c.ALL_PID_DEFS;
const getPidDef = (p) => Array.isArray(DEFS) ? DEFS.find(d => d.pid === p) : DEFS[p];
const PROF = require('./nepauto-profielen.js');
const cx5 = (Array.isArray(PROF) ? PROF : c.PL_NEPAUTO_PROFIELEN).find(p => p.id === 'cx5');
if (!cx5) { console.log('FOUT: profiel cx5 niet gevonden in nepauto-profielen.js'); process.exit(1); }
const ecu = cx5.ecus.find(e => e.adres === '7E8');
const verwacht = ecu.pids.split(' ').map(x => '01' + x).filter(p => getPidDef(p));

const mazda = c.DEMO_CARS.find(x => x.merk === 'Mazda' && x.model === 'CX-5');
t('de demo-Mazda draagt een eigen pakket', mazda && Array.isArray(mazda.pids));
const pk = (mazda && mazda.pids) || [];
const teveel = pk.filter(p => !verwacht.includes(p)), mist = verwacht.filter(p => !pk.includes(p));
t('pakket = het CX-5-profiel van 7E8 (' + verwacht.length + ' PID\'s)', !teveel.length && !mist.length,
  'te veel: ' + (teveel.join(' ') || '—') + ' · ontbreekt: ' + (mist.join(' ') || '—'));

// _startDemoCore gebruikt dat pakket
const DM = lees('pidlane-demo.js');
t('_startDemoCore neemt car.pids als die er is', /car && Array\.isArray\(car\.pids\) && car\.pids\.length\)\s*\n\s*\? car\.pids\.filter\(p=>getPidDef\(p\)\)/.test(DM));

// demo() uit pidlane-auth.js, met de echte definities
const AU = lees('pidlane-auth.js');
const a = AU.indexOf('const _ds={};'), b = AU.indexOf('\n}\n', AU.indexOf('function demo(pid){', a)) + 3;
if (a < 0 || b < 3) { console.log('FOUT: demo() niet gevonden in pidlane-auth.js'); process.exit(1); }
function nieuweDemo(rnd) {
  const d = { console: { warn() { } }, getPidDef, demoAandrijving: () => undefined };
  d.Math = Object.create(Math); if (rnd !== undefined) d.Math.random = () => rnd;
  d.Date = { now: () => d._nu }; d._nu = 1e12;
  vm.createContext(d);
  vm.runInContext(AU.slice(a, b) + ';this.demo=demo;', d);
  return d;
}
const d = nieuweDemo();

const buiten = [], ruis = [];
for (const p of pk) {
  const def = getPidDef(p), w = [];
  for (let i = 0; i < 40; i++) { d._nu = 1e12 + i * 997; w.push(d.demo(p)); }
  if (w.some(v => !(v >= def.min && v <= def.max))) buiten.push(p + ' (' + Math.min(...w) + '…' + Math.max(...w) + ')');
  // Zonder eigen regel begint een PID op het midden van zijn bereik en zet hij
  // één stap van (random-.5)*3% van dat bereik. Met een vaste random in een
  // verse demo is die waarde precies uit te rekenen; een eigen regel geeft
  // iets anders.
  const R = 0.73, v = nieuweDemo(R), mid = (def.min + def.max) / 2;
  const alsRuis = Math.round(Math.max(def.min, Math.min(def.max, mid + (R - .5) * (def.max - def.min) * .03)) * 100) / 100;
  if (v.demo(p) === alsRuis) ruis.push(p);
}
t('elke PID blijft binnen zijn bereik', !buiten.length, buiten.join(', '));
t('geen PID loopt als ruis rond het midden', !ruis.length, ruis.join(', '));

d._nu = 1e12; const mil = [];
for (let i = 0; i < 50; i++) mil.push(d.demo('0101'));
t('het motorlampje (0101) staat nooit aan', mil.every(v => v === 0), 'gezien: ' + [...new Set(mil)].join(','));
d._nu = 1e12; const r1 = d.demo('011F'); d._nu = 1e12 + 60000; const r2 = d.demo('011F');
t('de motorlooptijd (011F) loopt op met de klok', r2 - r1 === 60, r1 + ' → ' + r2);

console.log('\n' + ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
