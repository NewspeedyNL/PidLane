// ══════════════════════════════════════════════════════════════════
// test-demoaandrijving.js — de demo rijdt zoals zijn aandrijving (07-11-2026)
// ──────────────────────────────────────────────────────────────────
// Tot deze datum simuleerde demo() (pidlane-auth.js) voor elke auto een
// benzine-CX-5: toerental nooit 0. Een demo-hybride liet dus niets hybrides
// zien. Nu: demoAandrijving() per vorm, en een demo-auto per vorm.
// Wat moet onderscheiden:
//   • volhybride: een deel van de rit staat de motor stil (toerental 0)
//   • plug-in: vaker stil dan een volhybride
//   • serieel: de motor draait ook stilstaand, op een toerental los van de snelheid
//   • mild: de motor is soms uit (zeilen), maar draait het grootste deel
//   • benzine: nooit iets veranderd
//   • diesel-hybride-demo: geen lambdasondes, wel de aandrijfaccu
//
// Draaien vanuit public/:  node test-demoaandrijving.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function t(naam, gemeten, verwacht) {
  if (String(gemeten) === String(verwacht)) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + gemeten + ', wilde ' + verwacht); }
}
const lees = (f) => fs.readFileSync(__dirname + '/' + f, 'utf8');

const AU = lees('pidlane-auth.js'), a = AU.indexOf('function demoAandrijving('), b = AU.indexOf('\n}\n', a) + 3;
if (a < 0) { console.log('FOUT: demoAandrijving niet gevonden in pidlane-auth.js'); process.exit(1); }
const c = { console: { warn() { } } }; vm.createContext(c);
vm.runInContext(AU.slice(a, b) + ';this.demoAandrijving=demoAandrijving;', c);
const D = c.demoAandrijving;

// Een rit van 10 minuten, elke halve seconde: hoe vaak staat het toerental op 0?
function aandeelUit(vorm) {
  let uit = 0, n = 0;
  for (let ms = 0; ms < 600000; ms += 500) { const r = D('010C', vorm, ms, 1500); if (r === 0) uit++; n++; }
  return uit / n;
}
console.log('\n1. hoe vaak staat de motor stil');
const vol = aandeelUit('vol'), ph = aandeelUit('plugin'), mi = aandeelUit('mild'), se = aandeelUit('serieel');
t('volhybride: een flink deel van de rit stil (30–80%)', vol > 0.3 && vol < 0.8, true);
t('plug-in: vaker stil dan een volhybride', ph > vol, true);
t('mild: soms stil, meestal draait hij (5–40%)', mi > 0.05 && mi < 0.4, true);
t('TEGENPROEF benzine: nooit iets veranderd', [0, 4000, 9000, 33000].every((ms) => D('010C', 'verbranding', ms, 1500) === undefined), true);
t('zonder vorm (oude demo-auto): niets veranderd', D('010C', null, 1000, 1500), undefined);

console.log('\n2. serieel: de motor is een generator');
let stilstaandLaden = false;
for (let ms = 0; ms < 600000; ms += 500) {
  const kmh = Math.max(0, 45 + Math.sin(ms / 8000) * 35), rpm = D('010C', 'serieel', ms, 1500);
  if (kmh < 12 && rpm > 1500) stilstaandLaden = true;
}
t('serieel: de motor draait ook bij (bijna) stilstand', stilstaandLaden, true);
t('serieel: toerental rond 2200, los van de snelheid', (() => { const r = D('010C', 'serieel', 2000, 900); return r === 0 || (r > 2000 && r < 2400); })(), true);

console.log('\n3. wat bij een stilstaande motor hoort');
const stilMs = (() => { for (let ms = 0; ms < 600000; ms += 500) if (D('010C', 'vol', ms, 1500) === 0) return ms; return null; })();
t('motor stil: belasting, luchtmassa en verbruik 0', ['0104', '0110', '015E'].map((p) => D(p, 'vol', stilMs, 20)).join(','), '0,0,0');
t('… maar de snelheid blijft wat hij was', D('010D', 'vol', stilMs, 50), undefined);
t('het accuniveau 015B ademt mee (40–80%)', (() => { const v = D('015B', 'vol', 12345, 0); return v >= 40 && v <= 80; })(), true);

console.log('\n4. de demo-auto\'s');
const s = { console: { log() { }, warn() { } } }; s.window = s; vm.createContext(s);
vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });
const vormen = s.DEMO_CARS.map((x) => x.aandrijving && x.aandrijving.vorm).filter(Boolean).sort().join(',');
t('een demo-auto voor mild, plug-in, serieel en diesel-hybride (vol)', vormen, 'mild,plugin,serieel,vol');
t('de diesel-hybride heeft verbranding diesel', s.DEMO_CARS.filter((x) => x.verbranding === 'diesel').length, 1);
const DM = lees('pidlane-demo.js'), x = DM.indexOf('function demoPIDsForFuel('), y = DM.indexOf('\n}\n', x) + 3;
const d = {}; vm.createContext(d); vm.runInContext(DM.slice(x, y) + ';this.f=demoPIDsForFuel;', d);
const dh = d.f('hybride', 'diesel'), bh = d.f('hybride', 'benzine');
t('diesel-hybride-demo: geen breedbandlambda', dh.indexOf('0124') < 0, true);
t('… wel de aandrijfaccu en het relatieve pedaal', dh.indexOf('015B') >= 0 && dh.indexOf('015A') >= 0, true);
t('TEGENPROEF benzine-hybride-demo: wel lambda', bh.indexOf('0124') >= 0, true);

console.log('\n' + ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
