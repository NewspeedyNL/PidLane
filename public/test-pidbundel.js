// ══════════════════════════════════════════════════════════════════
// test-pidbundel.js — eigen PID-selecties op naam bewaren en wisselen
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// 26-10-2026 gevraagd: "huidige PID-selectie opslaan als een naam, en kunnen
// wisselen". Getoetst op de echte functies uit pidlane-rijsituatie.js:
//   1. de pure lijstbewerkingen (schoon, zet, weg) — dubbel, leeg, hoofdletters;
//   2. bewaren → toepassen zet precies die selectie terug, en filtert wat
//      deze auto niet levert;
//   3. zonder naam of zonder sensoren wordt er niets bewaard.
// Draaien vanuit public/:  node test-pidbundel.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(__dirname + '/pidlane-rijsituatie.js', 'utf8');

let fouten = 0;
function toets(naam, ok, extra) {
  console.log((ok ? 'ok   ' : 'FOUT ') + naam + (ok || extra === undefined ? '' : ' — ' + JSON.stringify(extra)));
  if (!ok) fouten++;
}

const a = src.indexOf('// ── EIGEN SELECTIES OP NAAM');
const b = src.indexOf('// ── PID PANEL — nu dynamisch vanuit discovery ──');
const k = src.indexOf('function _pidSetSleutel(){');
if (a < 0 || b < 0 || k < 0 || a > b) { console.log('FOUT: knippad niet gevonden in pidlane-rijsituatie.js'); process.exit(1); }
const sleutelSrc = src.slice(k, src.indexOf('\n', k) + 1);

function wereld(beschikbaar) {
  const opslag = {}, el = {}, toasts = [], meld = [];
  const s = { console: { log() { }, warn() { } }, setTimeout() { } };
  s.window = s;
  s.localStorage = { getItem: x => (x in opslag ? opslag[x] : null), setItem: (x, w) => { opslag[x] = String(w); } };
  s.document = { getElementById: id => el[id] || (el[id] = { id, value: '', textContent: '', innerHTML: '', focus() { } }), activeElement: null };
  s.activePIDs = new Set(); s.manualPIDs = new Set();
  s.discoveredPIDDefs = beschikbaar.map(pid => ({ pid }));
  s.pidGate = () => true;
  s.plSelectieVoor = () => 'voor'; s.plSelectieMeld = (v, w) => meld.push(w);
  s.buildPIDList = () => { }; s.renderGauges = () => { }; s.rebuildGSel = () => { };
  s._pidDoelenBij = () => { }; s.showToast = t => toasts.push(t);
  s.confirm = () => true;
  vm.createContext(s);
  vm.runInContext('let _pidPresetNu=null;\n' + sleutelSrc + src.slice(a, b) +
    '\nthis._f={_pidBundelsSchoon,_pidBundelZet,_pidBundelWeg,_pidBundels,pidBundelBewaar,pidBundelToepassen,pidBundelWeg};', s, { filename: 'pidlane-rijsituatie.js' });
  return { s, f: s._f, el, opslag, toasts, meld };
}

// 1. pure lijstbewerkingen
const w0 = wereld([]);
const { _pidBundelsSchoon: schoon, _pidBundelZet: zet, _pidBundelWeg: weg } = w0.f;
toets('onleesbaar wordt een lege lijst', schoon(null).length === 0 && schoon('x').length === 0);
toets('lege naam of lege pids vallen eruit', schoon([{ naam: ' ', pids: ['010C'] }, { naam: 'a', pids: [] }, { naam: 'b', pids: ['010C'] }]).length === 1);
let l = zet([], 'Snelweg', ['010C', '010D', '010C']);
toets('dubbele PIDs binnen één selectie worden er één', l.length === 1 && l[0].pids.length === 2, l);
l = zet(l, 'Stad', ['0105']);
l = zet(l, 'snelweg', ['0111']);
toets('zelfde naam (hoofdletters los) overschrijft, nieuwste voorop', l.length === 2 && l[0].naam === 'snelweg' && l[0].pids.join() === '0111', l);
toets('weghalen op naam, hoofdletters los', weg(l, 'STAD').map(x => x.naam).join() === 'snelweg');
toets('zet zonder naam verandert niets', zet(l, '  ', ['010C']).length === 2);

// 2. bewaren → wisselen → terugzetten, met filter op wat de auto levert
const w = wereld(['010C', '010D', '0105', '0111']);
['010C', '010D', '0105'].forEach(p => w.s.activePIDs.add(p));
w.el.pidBundelNaam = { value: 'Snelweg', focus() { } };
w.f.pidBundelBewaar();
toets('bewaren schrijft naar localStorage', w.f._pidBundels().length === 1 && w.f._pidBundels()[0].pids.length === 3, w.opslag);
toets('naamveld is na bewaren leeg', w.el.pidBundelNaam.value === '');
w.s.activePIDs.clear(); w.s.activePIDs.add('0111');
w.el.pidBundelNaam.value = 'Stad'; w.f.pidBundelBewaar();
const idx = w.f._pidBundels().findIndex(x => x.naam === 'Snelweg');
w.f.pidBundelToepassen(idx);
toets('toepassen zet precies de bewaarde selectie terug', [...w.s.activePIDs].sort().join() === '0105,010C,010D', [...w.s.activePIDs]);
toets('toepassen loopt via plSelectieMeld', w.meld.some(x => /Snelweg/.test(x)), w.meld);

const w2 = wereld(['010C']);
w2.opslag.pl_pid_bundels = JSON.stringify([{ naam: 'Ander', pids: ['010C', '22F40D'] }]);
w2.f.pidBundelToepassen(0);
toets('wat deze auto niet levert valt eruit en wordt gemeld', [...w2.s.activePIDs].join() === '010C' && /1 niet beschikbaar/.test(w2.el.pidPresetTip.textContent), w2.el.pidPresetTip.textContent);

// 3. niets bewaren zonder naam of zonder sensoren
const w3 = wereld(['010C']);
w3.s.activePIDs.add('010C'); w3.el.pidBundelNaam = { value: '   ', focus() { } };
w3.f.pidBundelBewaar();
toets('zonder naam wordt niets bewaard', !w3.opslag.pl_pid_bundels);
w3.s.activePIDs.clear(); w3.el.pidBundelNaam.value = 'Leeg'; w3.f.pidBundelBewaar();
toets('zonder actieve sensoren wordt niets bewaard', !w3.opslag.pl_pid_bundels);

// weghalen
w.f.pidBundelWeg(w.f._pidBundels().findIndex(x => x.naam === 'Stad'));
toets('weghalen haalt alleen die ene weg', w.f._pidBundels().map(x => x.naam).join() === 'Snelweg');

console.log(fouten ? '\n' + fouten + ' FOUT' : '\nAlles goed');
process.exit(fouten ? 1 : 0);
