// ════════════════════════════════════════════════════════════════
// test-dtcplan.js — toetst DTC_PLAN / dtcPlan() (pidlane-data.js), de koppeling
// in dtcInfo() (pidlane-bt.js) en planHtml() (pidlane-foutcodes.js)
// ────────────────────────────────────────────────────────────────
// WAT HIER TE BEWIJZEN VALT
//   1. elke familie is geldig: kost [min ≤ max] of null, wie bekend, 2–5 stappen;
//   2. het langste voorvoegsel wint (P0128 thermostaat, niet een P012-familie);
//   3. elke generieke code in DTCDB heeft een plan, behalve de bewust
//      uitgesloten merkcodes — een nieuwe code zonder plan valt hier op;
//   4. onzin en merkcodes geven null, en het resultaat is een kopie;
//   5. dtcInfo() hangt het plan eraan, behalve bij een onwaarschijnlijke misfire;
//   6. planHtml() escapet, toont "via de dealer" bij kost null, en is leeg zonder plan.
// Draaien vanuit public/:  node test-dtcplan.js     (exit 0 = goed)
// ════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fouten = 0, aantal = 0;
function eis(waar, wat, extra) {
  aantal++;
  if (waar) { console.log('  ok   ' + wat); return; }
  fouten++;
  console.log('  FOUT ' + wat + (extra ? '\n       ' + extra : ''));
}

function sandbox(extra) {
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() { }, warn() { }, error() { } };
  s.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
  s.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {} }), addEventListener() { }, head: { appendChild() { } }, body: { appendChild() { } } };
  s.addEventListener = () => { };
  s.navigator = {};
  s.setTimeout = () => 0; s.setInterval = () => 0; s.clearTimeout = () => { }; s.clearInterval = () => { };
  Object.assign(s, extra || {});
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
  return s;
}

const s = sandbox();
const P = s.DTC_PLAN, plan = s.dtcPlan;

console.log('\n1. Elke familie is geldig');
eis(P && typeof plan === 'function', 'DTC_PLAN en dtcPlan bestaan');
Object.keys(P).forEach(function (k) {
  const f = P[k];
  const kostOk = f.kost === null || (Array.isArray(f.kost) && f.kost.length === 2 &&
    f.kost.every(Number.isFinite) && f.kost[0] >= 0 && f.kost[0] <= f.kost[1]);
  const okSleutel = /^[PBCU][0-9A-F]{0,4}$/.test(k);
  const okStap = Array.isArray(f.stappen) && f.stappen.length >= 2 && f.stappen.length <= 5 &&
    f.stappen.every(function (t) { return typeof t === 'string' && t.length > 10; });
  if (!(kostOk && okSleutel && okStap && s.DTC_PLAN_WIE[f.wie]))
    eis(false, 'familie ' + k, JSON.stringify({ kostOk, okSleutel, okStap, wie: f.wie }));
});
eis(true, Object.keys(P).length + ' families nagelopen');

console.log('\n2. Langste voorvoegsel wint');
eis(plan('P0128').familie === 'P0128', 'P0128 → thermostaat-familie');
eis(plan('P0301').familie === 'P030', 'P0301 → misfire-familie');
eis(plan('P0299').familie === 'P0299', 'P0299 → turbo, niet een bredere familie');
// De tabel heeft (nog) geen families die elkaar overlappen; zonder een bredere
// ernaast onderscheidt "langste wint" niets. Daarom tijdelijk P01 erbij.
P.P01 = { kost: [1, 2], wie: 'zelf', stappen: ['breed', 'breed'] };
eis(plan('P0128').familie === 'P0128' && plan('P0171').familie === 'P017', 'met een bredere P01 ernaast wint nog steeds de smalste');
eis(plan('P0199').familie === 'P01', 'zonder smallere familie valt hij op de brede terug');
delete P.P01;
eis(plan('p0420 ').familie === 'P042', 'kleine letters en spaties worden genegeerd');

console.log('\n3. Dekking van DTCDB');
const uitgesloten = ['P1120', 'P1260', 'P1296', 'P1340', 'P3000'];   // merkcodes: bewust geen plan
const zonder = Object.keys(s.DTCDB).filter(function (c) { return !plan(c) && uitgesloten.indexOf(c) < 0; });
eis(zonder.length === 0, 'elke generieke DTCDB-code heeft een plan', 'zonder plan: ' + zonder.join(', '));
const merkZonder = [];
Object.keys(s.DTC_MERK).forEach(function (g) {
  Object.keys(s.DTC_MERK[g]).forEach(function (c) { if (/^P0|^P2|^U0|^C1/.test(c) && !plan(c)) merkZonder.push(c); });
});
eis(merkZonder.length === 0, 'generieke codes in DTC_MERK hebben ook een plan', merkZonder.join(', '));

console.log('\n4. Onzin, merkcodes en kopie');
['', null, 'XYZ', 'P01', 'P012345', 'P1260', 'P3000'].forEach(function (c) {
  eis(plan(c) === null, 'geen plan voor ' + JSON.stringify(c));
});
const a = plan('P0171'); a.stappen.push('x'); a.kost[0] = -1;
eis(plan('P0171').stappen.indexOf('x') < 0 && plan('P0171').kost[0] >= 0, 'resultaat is een kopie: aanpassen raakt de tabel niet');
eis(plan('P0A80').kost === null && plan('P0A80').wie === 'garage', 'hybride: geen bedrag, alleen garage');
eis(/stop met rijden/i.test(plan('P0217').stappen[0]), 'oververhitting: eerste stap is stoppen');

console.log('\n5. dtcInfo() hangt het plan eraan');
const bt = fs.readFileSync(__dirname + '/pidlane-bt.js', 'utf8');
const m = bt.match(/function dtcInfo\(code\)\{[\s\S]*?\n\}\n/);
eis(!!m, 'dtcInfo() gevonden in pidlane-bt.js');
if (m) {
  let misfire = false;
  s._dtcBron = function (c) { return s.DTCDB[c] ? { rij: s.DTCDB[c], noot: '' } : null; };
  s._implausibleMisfire = function () { return misfire; };
  s.vehicleCylinderCount = function () { return 4; };
  vm.runInContext(m[0], s);
  eis(s.dtcInfo('P0171').plan && s.dtcInfo('P0171').plan.familie === 'P017', 'P0171 krijgt het mengselplan');
  eis(s.dtcInfo('P9999').plan === null, 'onbekende code: plan null');
  misfire = true;
  eis(s.dtcInfo('P0306').plan === null, 'onwaarschijnlijke misfire: geen plan');
}

console.log('\n6. planHtml()');
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-foutcodes.js', 'utf8'), s, { filename: 'pidlane-foutcodes.js' });
const H = s.PLFoutcodes && s.PLFoutcodes.planHtml;
eis(typeof H === 'function', 'PLFoutcodes.planHtml bestaat');
if (H) {
  eis(H(null) === '' && H({ stappen: [] }) === '', 'leeg zonder plan');
  const h = H({ kost: [80, 450], wie: 'beide', stappen: ['<b>bougie</b> controleren'] });
  eis(h.indexOf('<b>bougie') < 0 && h.indexOf('&lt;b&gt;') >= 0, 'stappen worden geëscapet');
  eis(/€ 80 – 450/.test(h) && h.indexOf('Zelf of garage') >= 0, 'bedrag en wie staan in de kop');
  eis(h.indexOf(' open') < 0, 'buiten de garagemodus ingeklapt');
  eis(/via de dealer/.test(H({ kost: null, wie: 'garage', stappen: ['a', 'b'] })), 'kost null → via de dealer');
  s.PLNav = { garage: () => true };
  eis(/<details class="fc-plan" open>/.test(H(plan('P0301'))), 'garagemodus: open');
}

console.log('\n' + (fouten ? fouten + ' FOUT van ' + aantal : 'alle ' + aantal + ' goed'));
process.exit(fouten ? 1 : 0);
