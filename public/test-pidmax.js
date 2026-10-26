// ══════════════════════════════════════════════════════════════════
// test-pidmax.js — "Max haalbaar" kiest naar wat de adapter haalt
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// Het doel 'Aanbevolen' was een vaste lijst van kern + zeven extra's. Op
// 26-10-2026 gevraagd: "hoe beter de adapter, hoe beter de app werkt" — een
// MX+ moet dus meer krijgen dan een kloon van zes PIDs/s, op volgorde van
// belang, en eigen PIDs tellen mee.
//
// Wat hier getoetst wordt, op de echte functies uit pidlane-rijsituatie.js
// en de echte tabellen uit pidlane-data.js:
//   1. de capaciteit komt uit de beste meting die er is, in volgorde;
//   2. een snelle adapter krijgt méér sensoren dan een trage;
//   3. de kern blijft altijd, ook als hij alleen al te duur is;
//   4. eigen PIDs gaan vóór de standaard-extra's;
//   5. de volgorde is die van belang: wat wegvalt, valt achteraan weg.
//
// Draaien vanuit public/:  node test-pidmax.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');
const lees = f => fs.readFileSync(__dirname + '/' + f, 'utf8');

let fouten = 0;
function toets(naam, ok, extra) {
  console.log((ok ? 'ok   ' : 'FOUT ') + naam + (ok || extra === undefined ? '' : ' — ' + JSON.stringify(extra)));
  if (!ok) fouten++;
}

const src = lees('pidlane-rijsituatie.js');
const a = src.indexOf('function _pidMotor(){');
const b = src.indexOf('function applyPidPreset(id){');
const c = src.indexOf('// ── MAX HAALBAAR');
if (a < 0 || b < 0 || c < 0 || !(a < c && c < b)) { console.log('FOUT: knippad niet gevonden in pidlane-rijsituatie.js'); process.exit(1); }

function wereld(opt) {
  const s = { console: { log() { }, warn() { } } };
  s.window = s;
  s.document = { getElementById: () => null };
  vm.createContext(s);
  vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });
  s.detectEngineType = () => 'benzine';
  s.pidGate = () => true;
  s.activePIDs = new Set();
  s.discoveredPIDDefs = opt.pids.map(pid => ({ pid }));
  if (opt.eigen) s.PLEigen = { is: p => opt.eigen.includes(p), interval: () => 2000 };
  s.PLBus = { stats: () => opt.stats || {} };
  if (opt.adapter) s.PLAdapter = opt.adapter;
  vm.runInContext('const PID_VEEL=20;\n' + src.slice(a, b), s, { filename: 'pidlane-rijsituatie.js' });
  return s;
}

// Een realistische Mazda-lijst: de kern plus alles uit de focusblokken.
const d0 = wereld({ pids: [] });
const ALLES = [...new Set([...d0.KERN_PIDS, ...d0.PID_PRESETS.flatMap(p => p.extra)])];
const MAX = d0.PID_PRESETS.find(p => p.max);
toets('er is precies één max-doel, het oude Aanbevolen', d0.PID_PRESETS.filter(p => p.max).length === 1 && MAX.id === 'plus' && /max/i.test(MAX.kort));

// 1. de bron van de capaciteit
const C = wereld({ pids: [] })._pidMaxCapaciteit;
const gp = { advies: { groep: 4, groepen: [{ groep: 3, pidsPerSec: 80 }, { groep: 4, pidsPerSec: 96 }] } };
const snel = { groep: 3, advies: { veiligPerSec: 20 } };
const live = { venGemMs: 28, perSec: 34.3, batchGroep: 3, onvolPct: 0 };
toets('groepsproef wint, en dan de groep die hij adviseerde', C({ gp, snel, stats: live }).pidsPerSec === 96 && C({ gp, snel }).bron === 'groepsproef');
toets('zonder groepsproef: snelheidstest × groep', C({ snel, stats: live }).pidsPerSec === 60);
toets('zonder proeven: live responstijd × groep (28 ms, groep 3 ≈ 107)', Math.round(C({ stats: live }).pidsPerSec) === 107, C({ stats: live }));
toets('live telt pas bij genoeg verkeer', C({ stats: { venGemMs: 28, perSec: 1, batchGroep: 3 } }).bron === 'schatting');
toets('onvolledige batches drukken de live capaciteit', C({ stats: Object.assign({}, live, { onvolPct: 50 }) }).pidsPerSec < 60);
toets('zonder groep-advies valt de groepsproef af', C({ gp: { advies: { groep: null, groepen: [] } }, snel }).bron === 'snelheidstest');

// 2 en 3. MX+ tegen een kloon
const mx = wereld({ pids: ALLES, stats: live })._pidMax(MAX);
const kloon = wereld({ pids: ALLES, stats: { venGemMs: 160, perSec: 5, batchGroep: 1 } })._pidMax(MAX);
const midden = wereld({ pids: ALLES, stats: { venGemMs: 60, perSec: 10, batchGroep: 3 } })._pidMax(MAX);
console.log('     MX+ '+mx.ids.length+', midden '+midden.ids.length+', kloon '+kloon.ids.length+' van '+ALLES.length);
toets('MX+ krijgt (bijna) alles', mx.ids.length >= ALLES.length * 0.9, { n: mx.ids.length, van: ALLES.length });
toets('kloon krijgt minder dan MX+', kloon.ids.length < mx.ids.length, { kloon: kloon.ids.length, mx: mx.ids.length });
toets('middenklasse zit ertussen', kloon.ids.length < midden.ids.length && midden.ids.length < mx.ids.length,
  [kloon.ids.length, midden.ids.length, mx.ids.length]);
toets('kern blijft altijd staan, ook op de kloon', d0.KERN_PIDS.every(p => kloon.ids.includes(p)), kloon.ids);
toets('MX+ blijft binnen zijn budget', mx.kost <= mx.budget, mx);

// 4. eigen PIDs voor de standaard-extra's
const eigen = ['2201AB', '2201CD'];
const we = wereld({ pids: [...ALLES, ...eigen], eigen, stats: { venGemMs: 60, perSec: 10, batchGroep: 3 } })._pidMax(MAX);
toets('eigen PIDs tellen mee', eigen.every(p => we.ids.includes(p)), we.ids);
const pos = p => we.ids.indexOf(p);
toets('eigen PIDs staan direct na de kern', eigen.every(p => pos(p) < pos(MAX.extra.find(x => we.ids.includes(x)))), we.ids);

// 5. volgorde van belang: wat wegvalt komt van achteren
const K = d0._pidMaxKies || wereld({ pids: [] })._pidMaxKies;
const r = K(['A', 'B', 'C', 'D'], ['A'], () => 1, 2);
toets('budget 2 bij kosten 1: A en B, niet C en D', r.ids.join() === 'A,B', r);
const r2 = K(['A', 'B', 'C'], [], p => ({ A: 0.5, B: 3, C: 0.1 })[p], 1);
toets('dure slaat over, goedkope erna past nog', r2.ids.join() === 'A,C', r2);
const r5 = K(['A', 'C'], ['A'], p => ({ A: 5, C: 0.1 })[p], 1);
toets('kern al boven budget: er komt niets bij', r5.ids.join() === 'A', r5);
const r3 = K(['A', 'B'], ['A', 'B'], () => 9, 1);
toets('kern boven budget blijft toch', r3.ids.join() === 'A,B', r3);
const r4 = K(['A', 'X'], ['A'], p => p === 'X' ? 0 : 9, 1);
toets('een PID zonder buskosten (berekend) kost niets', r4.ids.join() === 'A,X', r4);

// kosten uit de echte pollklasse
const w = wereld({ pids: [] });
toets('toerental (120 ms) kost ±8/s, koelwater (10 s) 0,1/s',
  Math.round(w._pidMaxKost('010C')) === 8 && w._pidMaxKost('0105') === 0.1);
toets('een niet-bus-PID kost niets', w._pidMaxKost('TEL_HELLING') === 0);

console.log(fouten ? '\n' + fouten + ' FOUT' : '\nAlles goed');
process.exit(fouten ? 1 : 0);
