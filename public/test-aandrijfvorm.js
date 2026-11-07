// ══════════════════════════════════════════════════════════════════
// test-aandrijfvorm.js — aandrijfvorm uit het RDW, en wat PLKenmerk ermee doet
// ──────────────────────────────────────────────────────────────────
// De rijen hieronder zijn ECHTE rijen uit RDW 8ys7-d773 (07-11-2026, het
// meest voorkomende patroon per model vanaf 2021), zonder kenteken en
// ingekort tot de vier velden die aandrijfUitRdw() leest. Alleen de diesel
// mild hybride is nagebouwd: een Mercedes C 220 d staat in het RDW als
// alleen Diesel, dus een echte diesel-rij met elektriciteit kwam niet boven.
//
// Wat hier rood moet worden:
//   • een mild hybride die weer 'hybride' heet (de fout van vóór 07-11)
//   • een Corolla (70/72 kW) die serieel wordt, of een e-Power die vol wordt
//   • een plug-in die op zijn kW mild wordt (de stekker wint)
//   • PLKenmerk die een mild hybride als hybride blijft zien
//
// Draaien vanuit public/:  node test-aandrijfvorm.js     (exit 0 = goed)
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

const s = { console: { log() { }, warn() { }, error() { } }, localStorage: { getItem() { return null; }, setItem() { } } };
s.window = s; s.globalThis = s;
vm.createContext(s);
vm.runInContext(lees('pidlane-voertuigdata.js') + '\n;this.aandrijfUitRdw=aandrijfUitRdw;this.mergeVehicleData=mergeVehicleData;this.resetVehicleSources=resetVehicleSources;', s, { filename: 'pidlane-voertuigdata.js' });
vm.runInContext(lees('pidlane-kenmerk.js'), s, { filename: 'pidlane-kenmerk.js' });
const A = s.aandrijfUitRdw, K = s.PLKenmerk;
if (typeof A !== 'function' || !K) { console.error('FOUT: aandrijfUitRdw of PLKenmerk niet geladen'); process.exit(1); }

const R = (bs, kw, kwE, kl) => Object.assign({ brandstof_omschrijving: bs },
  kw ? { nettomaximumvermogen: kw } : {}, kwE ? { netto_max_vermogen_elektrisch: kwE } : {}, kl ? { klasse_hybride_elektrisch_voertuig: kl } : {});
const AUTO = {
  swift:    [R('Elektriciteit', 0, '2.19', 'NOVC-HEV'), R('Benzine', '60.90', 0, 'NOVC-HEV')],
  cx5_21:   [R('Elektriciteit', 0, '5.10', 'NOVC-HEV'), R('Benzine', '121.00', 0, 'NOVC-HEV')],
  puma:     [R('Elektriciteit', 0, '8.70', 'NOVC-HEV'), R('Benzine', '91.90', 0, 'NOVC-HEV')],
  octavia:  [R('Elektriciteit', 0, '13.50', 'NOVC-HEV'), R('Benzine', '110.00', 0, 'NOVC-HEV')],
  dieselm:  [R('Diesel', '147.00', 0, 'NOVC-HEV'), R('Elektriciteit', 0, '15.00', 'NOVC-HEV')],   // nagebouwd
  clio:     [R('Elektriciteit', 0, '51.00', 'NOVC-HEV'), R('Benzine', '69.00', 0, 'NOVC-HEV')],
  corolla:  [R('Elektriciteit', 0, '70.00', 'NOVC-HEV'), R('Benzine', '72.00', 0, 'NOVC-HEV')],
  jazz:     [R('Elektriciteit', 0, '80.00', 'NOVC-HEV'), R('Benzine', '72.00', 0, 'NOVC-HEV')],
  epower:   [R('Elektriciteit', 0, '140.00', 'NOVC-HEV'), R('Benzine', '116.00', 0, 'NOVC-HEV')],
  niroPhev: [R('Benzine', '77.20', 0, 'OVC-HEV'), R('Elektriciteit', 0, '44.50', 'OVC-HEV')],
  xc60:     [R('Elektriciteit', 0, '107.00', 'OVC-HEV'), R('Benzine', '186.00', 0, 'OVC-HEV')],
  id3:      [R('Elektriciteit', 0, '150.00')],
  c220d:    [R('Diesel', '143.00')],
  oudHyb:   [R('Benzine', '73.00'), R('Elektriciteit')]                                           // geen klasse, geen kW
};
const v = (id, merk) => A(AUTO[id], merk);

console.log('\n1. aandrijfUitRdw op echte RDW-rijen');
t('Swift 2,19 kW → mild', v('swift', 'SUZUKI').vorm, 'mild');
t('… en zijn brandstof is benzine, niet hybride', v('swift').brandstof, 'benzine');
t('CX-5 vanaf 2021 (5,1 kW) → mild', v('cx5_21', 'MAZDA').vorm, 'mild');
t('Puma 8,7 kW → mild', v('puma').vorm, 'mild');
t('Octavia 13,5 kW → mild', v('octavia').vorm, 'mild');
t('diesel mild hybride → brandstof diesel', v('dieselm').brandstof, 'diesel');
t('… en de verbranding blijft diesel', v('dieselm').verbranding, 'diesel');
t('Clio E-Tech 51 kW → vol', v('clio', 'RENAULT').vorm, 'vol');
t('Corolla 70/72 kW → vol, niet serieel', v('corolla', 'TOYOTA').vorm, 'vol');
t('… ook zonder merk (70 < 72 × 1,05)', v('corolla').vorm, 'vol');
t('… en de brandstof blijft hybride', v('corolla').brandstof, 'hybride');
t('… met de verbranding erbij (#430)', v('corolla').verbranding, 'benzine');
t('Jazz e:HEV 80/72 kW → serieel', v('jazz', 'HONDA').vorm, 'serieel');
t('Qashqai e-Power 140/116 kW → serieel', v('epower', 'NISSAN').vorm, 'serieel');
t('e-CVT-merk wordt nooit serieel (zelfde getallen, merk Toyota)', v('epower', 'TOYOTA').vorm, 'vol');
t('Niro PHEV → plug-in', v('niroPhev', 'KIA').vorm, 'plugin');
t('XC60 T8 → plug-in (de stekker wint van de kW-regels)', v('xc60', 'VOLVO').vorm, 'plugin');
t('ID.3 → elektrisch', v('id3').vorm, 'elektrisch');
t('C 220 d (alleen diesel in het RDW) → verbranding', v('c220d').vorm, 'verbranding');
t('… brandstof diesel', v('c220d').brandstof, 'diesel');
t('hybride zonder klasse en kW → vorm onbekend', v('oudHyb').vorm, null);
t('… maar wel hybride, zoals vroeger', v('oudHyb').brandstof, 'hybride');
t('geen rijen → null', A([]), null);
t('de bron noemt het vermogen', /2,2 kW elektrisch/.test(v('swift').bron), true);

console.log('\n2. mergeVehicleData zet brandstof, verbranding en vorm');
s.vehicleInfo = { merk: '', model: '', year: '', vin: '', brandstof: '', motor: '' };
vm.runInContext('vehicleInfo = this.vehicleInfo; herijkPidGate = function(){};', s);
s.resetVehicleSources();
const ad = v('puma');
s.mergeVehicleData('rdw', { brandstof: ad.brandstof, verbranding: ad.verbranding, aandrijving: ad });
const vi = vm.runInContext('vehicleInfo', s);
t('brandstof benzine', vi.brandstof, 'benzine');
t('verbranding benzine', vi.verbranding, 'benzine');
t('aandrijving.vorm mild', vi.aandrijving && vi.aandrijving.vorm, 'mild');
s.mergeVehicleData('vin', { aandrijving: { vorm: 'vol', bron: 'test' } });
t('een zwakkere bron overschrijft de vorm niet', vi.aandrijving.vorm, 'mild');

console.log('\n3. PLKenmerk leest de vorm');
const P = (id, merk) => { const a = v(id, merk); return K.profiel({ merk: merk || '', brandstof: a.brandstof, aandrijving: a }); };
t('mild: geen hybride (bewezen)', P('swift').hybride.waarde + '/' + P('swift').hybride.zeker, 'false/bewezen');
t('mild: mild_hybride ja (waarschijnlijk)', P('swift').mild_hybride.waarde + '/' + P('swift').mild_hybride.zeker, 'true/waarschijnlijk');
t('mild met een oud profiel dat "hybride" zegt: nog steeds geen hybride', K.profiel({ brandstof: 'hybride', aandrijving: v('swift') }).hybride.waarde, false);
t('de thermostaatregel (gaat uit van geen hybride) geldt op een mild hybride',
  K.geldt({ hybride: { is: false, gangbaar: true } }, P('puma')).uitkomst, 'geldt');
t('… en op een volhybride niet', K.geldt({ hybride: { is: false, gangbaar: true } }, P('corolla', 'Toyota')).uitkomst, 'geldt_niet');
t('Corolla: hybride ja, serieel nee', P('corolla', 'Toyota').hybride.waarde + '/' + P('corolla', 'Toyota').serieel.waarde, 'true/false');
t('e-Power: serieel ja (waarschijnlijk)', P('epower', 'Nissan').serieel.waarde + '/' + P('epower', 'Nissan').serieel.zeker, 'true/waarschijnlijk');
t('PHEV: plugin ja (bewezen)', P('niroPhev', 'Kia').plugin.waarde + '/' + P('niroPhev', 'Kia').plugin.zeker, 'true/bewezen');
t('zonder RDW-vorm: alles onbekend, hybride uit de brandstof', String(K.profiel({ brandstof: 'hybride' }).mild_hybride.waarde) + '/' + K.profiel({ brandstof: 'hybride' }).hybride.waarde, 'null/true');
const blok = K.promptBlok(P('swift'), []);
t('het AI-blok noemt de aandrijfvorm met bron', /aandrijfvorm: mild hybride \(waarschijnlijk: RDW NOVC-HEV, 2,2 kW/.test(blok), true);
t('… en zegt dat hij niet elektrisch rijdt', /mild hybride \(e-motor helpt alleen, rijdt niet elektrisch\): ja/.test(blok), true);

console.log('\n' + ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
