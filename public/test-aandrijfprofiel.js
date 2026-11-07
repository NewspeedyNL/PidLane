// ══════════════════════════════════════════════════════════════════
// test-aandrijfprofiel.js — verbranding en elektrisch rijden als twee vragen
// ──────────────────────────────────────────────────────────────────
// aandrijfProfiel() (pidlane-motortype.js) splitst wat detectEngineType() in
// één woord stopte. Wat hier moet onderscheiden (07-11-2026):
//   • een diesel-hybride is voor de berekeningen en de pollus een DIESEL:
//     geen luchtmassa-route met λ=1, de dieselprijs, raildruk snel
//   • een benzine-hybride houdt de benzineroute
//   • LPG rekent de luchtmassa om met LPG-constanten, niet met benzine
//   • de koppelomvormer-slip (CA16) hoort niet bij een elektrisch rijdende hybride
//   • de pollus geeft een hybride de accu (42, 5B) vaker, niet de olie (5C)
// Alles uit de bron geladen (vm), niets nagebouwd.
//
// Draaien vanuit public/:  node test-aandrijfprofiel.js     (exit 0 = goed)
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

// ── 1. aandrijfProfiel, puur ──
const m = { console: { log() { }, warn() { }, error() { } } };
m.window = m; vm.createContext(m);
vm.runInContext(lees('pidlane-motortype.js') + '\n;this.aandrijfProfiel=aandrijfProfiel;', m, { filename: 'pidlane-motortype.js' });
const AP = m.aandrijfProfiel;
const P = (vi) => { const r = AP(vi); return r.verbranding + '/' + r.vorm + '/' + r.elektrisch; };
console.log('\n1. aandrijfProfiel');
t('benzine', P({ brandstof: 'benzine' }), 'benzine/verbranding/false');
t('diesel', P({ brandstof: 'diesel' }), 'diesel/verbranding/false');
t('hybride zonder verbranding of vorm: benzine, rijdt elektrisch (zoals vroeger)', P({ brandstof: 'hybride' }), 'benzine/null/true');
t('diesel-hybride (verbranding uit het RDW)', P({ brandstof: 'hybride', verbranding: 'diesel', aandrijving: { vorm: 'vol' } }), 'diesel/vol/true');
t('diesel-hybride uit de motornaam', P({ brandstof: 'hybride', motortype: '2.0 BlueHDi Hybrid4' }), 'diesel/null/true');
t('mild hybride (brandstof benzine, vorm mild): rijdt niet elektrisch', P({ brandstof: 'benzine', aandrijving: { vorm: 'mild' } }), 'benzine/mild/false');
t('plug-in', P({ brandstof: 'hybride', verbranding: 'benzine', aandrijving: { vorm: 'plugin' } }), 'benzine/plugin/true');
t('serieel', P({ brandstof: 'hybride', aandrijving: { vorm: 'serieel' } }), 'benzine/serieel/true');
t('elektrisch: geen verbranding', P({ brandstof: 'elektrisch' }), '/elektrisch/true');
t('LPG', P({ brandstof: 'lpg' }), 'lpg/verbranding/false');
t('niets bekend: benzine', P({}), 'benzine/verbranding/false');

// ── 2. PLBerekend met een aandrijfprofiel ──
function berekend(profiel, voertuig) {
  const c = { console: { log() { }, warn() { }, error() { } }, Math, JSON, Date, Set, Object, Array, Number, String };
  c.window = c; c.setInterval = () => 0;
  c.supportedPIDs = new Set(['0110', '010D', '010C']);
  c.aandrijfProfielLive = () => profiel;
  vm.createContext(c);
  vm.runInContext(lees('pidlane-berekend.js'), c, { filename: 'pidlane-berekend.js' });
  if (voertuig) c.PLBerekend.voertuig(voertuig);
  return c.PLBerekend;
}
console.log('\n2. berekende waarden');
const DH = { verbranding: 'diesel', vorm: 'vol', elektrisch: true }, BH = { verbranding: 'benzine', vorm: 'vol', elektrisch: true };
const bDH = berekend(DH, { brandstof: 'hybride' }), bBH = berekend(BH, { brandstof: 'hybride' });
t('diesel-hybride: de standaardprijs is die van diesel', bDH.prijs().prijs, bDH.PRIJS_STANDAARD.diesel);
t('TEGENPROEF benzine-hybride: de prijs van benzine', bBH.prijs().prijs, bBH.PRIJS_STANDAARD.benzine);
t('diesel-hybride: schakeldrempels van diesel', bDH.schakelBron().diesel, true);
t('TEGENPROEF benzine-hybride: van benzine', bBH.schakelBron().diesel, false);
const alles = () => true;
const heeftCA02 = (B) => B.defs().some((d) => d.pid === 'CA02');
t('diesel-hybride: geen brandstofdebiet uit de luchtmassa (een diesel loopt arm)', heeftCA02(bDH), false);
t('TEGENPROEF benzine-hybride: wel', heeftCA02(bBH), true);
t('benzine: CA16 kan bij een automaat', JSON.stringify(bBH.bronset('CA16', alles, false, { automaat: true, elektrisch: false })), JSON.stringify(['010D', '010C']));
t('elektrisch rijdende hybride: geen koppelomvormer-slip', bBH.bronset('CA16', alles, false, { automaat: true, elektrisch: true }), null);
const ben = bBH.bereken('CA02', { '0110': 10 }, {}), lpg = bBH.bereken('CA02', { '0110': 10 }, { lpg: true });
t('LPG: dezelfde lucht is meer liters dan benzine', lpg > ben * 1.2 && lpg < ben * 1.45, true);
t('… 10 g/s lucht ≈ 4,3 L/u LPG', lpg, 4.3);
t('… en 3,29 L/u benzine', ben, 3.29);

// ── 3. de pollus ──
console.log('\n3. pollus-prioriteit');
const PL = lees('pidlane-plload.js');
const a = PL.indexOf('function pidPollInterval('), b = PL.indexOf('// Welke PIDs zijn NU "due"', a);
if (a < 0 || b < 0) { console.log('FOUT: pidPollInterval niet te knippen'); process.exit(1); }
function poll(profiel, pid) {
  const c = { console: { log() { }, warn() { }, error() { } } };
  c.window = c; vm.createContext(c);
  vm.runInContext(lees('pidlane-data.js'), c, { filename: 'pidlane-data.js' });
  vm.runInContext(`var _focusPIDs=new Set(), _pollMult=1, _evModeActive=false;
    function actiefPollProfiel(){ return 'basis'; }
    function aandrijfProfielLive(){ return ${JSON.stringify(profiel)}; }
    ` + PL.slice(a, b), c, { filename: 'pidlane-plload.js (uitgeknipt)' });
  return vm.runInContext('pidPollInterval(' + JSON.stringify(pid) + ')', c);
}
t('diesel-hybride: raildruk (0123) snel, 200 ms', poll(DH, '0123'), 200);
t('TEGENPROEF benzine-hybride: raildruk niet op 200', poll(BH, '0123') !== 200, true);
t('hybride: aandrijfaccu (015B) op 500 ms', poll(BH, '015B'), 500);
t('hybride: olietemperatuur (015C) niet als accu op 500 ms', poll(BH, '015C') !== 500, true);
t('mild hybride (rijdt niet elektrisch): 015B niet versneld', poll({ verbranding: 'benzine', vorm: 'mild', elektrisch: false }, '015B') !== 500, true);

console.log('\n' + ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
