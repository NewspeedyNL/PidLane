// ══════════════════════════════════════════════════════════════════
// test-hybridebasis.js — een hybride is de gewone auto, geen uitzondering
// ──────────────────────────────────────────────────────────────────
// Drie dingen die op 07-10-2026 bij het doorlopen van "wat gebeurt er als je
// een hybride aansluit" boven kwamen, en die alle drie in de BASIS zaten en
// niet in een hybride-tak:
//
//   1. `detectEngineType()` (pidlane-motortype.js) las elke motornaam met
//      "ev" erin als volledig elektrisch: "1.6 GDi HEV", "e:HEV", "PHEV",
//      zelfs "Revolution".
//   2. `bscBuildList()` (pidlane-totalcheck.js) koos één groep per motortype.
//      Een hybride kreeg 'hybride' en niet 'benzine', en verloor vijf tests
//      aan een motor die hij gewoon heeft.
//   3. "Constant rijden" keek alleen naar de snelheid. De misfire-test mat
//      dus een toerental van 0 terwijl de auto op de accu reed, en een
//      basislijn liep over de aanloop van een motor die net aansloeg.
//
// Alles wordt uit de bron GELADEN, niet overgeschreven. BSC_TESTS komt uit
// pidlane-data.js zelf, de uitbreiding met de x_-tests uit totalcheck.
//
// Draaien vanuit public/:  node test-hybridebasis.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function t(naam, gemeten, verwacht) {
  if (String(gemeten) === String(verwacht)) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + gemeten + ', wilde ' + verwacht); }
}
function waar(naam, v, uitleg) {
  if (v) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
function lees(f) { return fs.readFileSync(__dirname + '/' + f, 'utf8'); }
function knip(bron, van, tot, naam) {
  const a = bron.indexOf(van), b = tot ? bron.indexOf(tot, a) : bron.length;
  if (a < 0 || b < a) { console.error('FOUT: knipbereik "' + naam + '" niet gevonden'); process.exit(1); }
  return bron.slice(a, b);
}

// ── de sandbox: echte data, echte functies, nep alleen wat de app levert ──
let klok = 1000000;
const p = { console: { log() { }, warn() { }, error() { } } };
p.window = p; p.globalThis = p;
vm.createContext(p);
vm.runInContext(lees('pidlane-data.js'), p, { filename: 'pidlane-data.js' });
// Date.now() is de klok van de motorvoorwaarde; die moet deze proef zetten.
vm.runInContext('Date.now = function () { return window.__klok(); };', p);
p.__klok = () => klok;
p.vehicleInfo = {};
p.pidVals = {};
p.pidHist = {};
p.demoMode = false;
p.supportedPIDs = new Set();
let fase = 'onbekend';
p.PLMon = { _state: () => ({ fase: fase }) };

const motor = lees('pidlane-motortype.js');
const tc = lees('pidlane-totalcheck.js');
vm.runInContext([
  knip(motor, 'function detectEngineType(){', '// De vorige getoonde toestand', 'detectEngineType'),
  knip(tc, 'const BSC_SIT = {', '/* ── 🛡️ RIT-MONITOR', 'situaties, voorwaarde en x_-tests'),
  knip(tc, '/* Welke testgroepen horen bij deze auto?', 'async function startBasicCheck', 'bscGroepen en bscBuildList'),
  'window.detectEngineType = detectEngineType;',
  'window.bscGroepen = bscGroepen;',
  'window.bscBuildList = bscBuildList;',
  'window.bscSituaties = bscSituaties;',
  'window.bscConditie = bscConditie;',
  'window.__bscTests = BSC_TESTS;'
].join('\n'), p, { filename: 'hybride-knip.js' });

// ══════════════════════════════════════════════════════════════════
console.log('\n── 1. welk motortype ──');
const soort = (brandstof, motortype) => { p.vehicleInfo = { brandstof, motortype }; return p.detectEngineType(); };

t('RDW zegt hybride', soort('hybride', ''), 'hybride');
t('"1.8 Hybrid"', soort('', '1.8 Hybrid'), 'hybride');
t('"1.6 GDi HEV" met RDW benzine', soort('benzine', '1.6 GDi HEV'), 'hybride');
t('"2.0 e:HEV"', soort('', '2.0 e:HEV'), 'hybride');
t('"1.6 T-GDI PHEV"', soort('benzine', '1.6 T-GDI PHEV'), 'hybride');
t('"1.5 eTSI mHEV"', soort('benzine', '1.5 eTSI mHEV'), 'hybride');
// De tegenproef: de woordgrens mag een echte EV niet kwijtraken.
t('RDW zegt elektrisch', soort('elektrisch', ''), 'ev');
t('motorlijst "Elektrisch"', soort('', 'Elektrisch'), 'ev');
t('"e-208 EV"', soort('', 'e-208 EV'), 'ev');
t('"BEV 77 kWh"', soort('', 'BEV 77 kWh'), 'ev');
t('"1.0 EcoBoost Revolution" is geen EV', soort('benzine', '1.0 EcoBoost Revolution'), 'benzine');
t('"2.0 TDI"', soort('', '2.0 TDI'), 'diesel');
t('niets bekend', soort('', ''), 'benzine');

// ══════════════════════════════════════════════════════════════════
console.log('\n── 2. welke tests ──');
const groep = et => [...p.bscGroepen(et)].sort().join(',');
t('hybride: motor én elektrisch', groep('hybride'), 'benzine,hybride,universeel');
t('benzine', groep('benzine'), 'benzine,universeel');
t('diesel', groep('diesel'), 'diesel,universeel');
t('volledig elektrisch: geen motorgroep', groep('ev'), 'universeel');

p.vehicleInfo = { brandstof: 'hybride', motortype: '' };
const lijst = p.bscBuildList().map(x => x.id);
const benzineIds = p.__bscTests.filter(x => x.groep === 'benzine').map(x => x.id);
waar('de catalogus heeft benzinetests (anders bewijst dit niets)', benzineIds.length >= 5, benzineIds.join(','));
waar('een hybride krijgt alle benzinetests',
  benzineIds.every(id => lijst.includes(id)),
  'mist: ' + benzineIds.filter(id => !lijst.includes(id)).join(','));
waar('een hybride krijgt de hybridetests', lijst.includes('hv_soc') && lijst.includes('ev_ice'));
waar('een hybride krijgt geen dieseltests',
  !p.__bscTests.filter(x => x.groep === 'diesel').some(x => lijst.includes(x.id)));

// ══════════════════════════════════════════════════════════════════
console.log('\n── 3. een motortest meet alleen bij een motor die al even draait ──');
const test = id => p.__bscTests.find(x => x.id === id);
const zet = (rpm, spd, f) => { p.pidVals = { '010C': rpm, '010D': spd, '0105': 85 }; fase = f || 'onbekend'; return p.bscSituaties(); };

// Rijden op de accu, constant 60.
let s = zet(0, 60, 'constant');
waar('situatie "constant" wordt herkend zonder motor', s.has('constant'));
let c = p.bscConditie(test('misfire'), s);
waar('misfire meet niet zonder motor', !c.ok, 'kreeg ok');
waar('…en zegt waarop hij wacht', /motor draait/.test(c.label), c.label);
waar('x_rpm_const meet niet zonder motor', !p.bscConditie(test('x_rpm_const'), s).ok);
waar('x_decel_load meet niet zonder motor', !p.bscConditie(test('x_decel_load'), zet(0, 40, 'remmen')).ok);
// Tegenproef: de regel blokkeert niet alles wat rijdt.
s = zet(0, 60, 'constant');
waar('ev_ice (geen motortest) meet wél tijdens accurijden', p.bscConditie(test('ev_ice'), s).ok);

// De motor slaat aan.
klok += 1000; s = zet(1500, 60, 'constant');
c = p.bscConditie(test('misfire'), s);
waar('net aangeslagen: misfire wacht nog', !c.ok, 'kreeg ok');
waar('…met de reden erbij', /al \d+ s/.test(c.label), c.label);
klok += 5000; s = zet(1500, 60, 'constant');
waar('na 5 s nog steeds niet (de basislijn van 5 s bevat de aanloop)', !p.bscConditie(test('misfire'), s).ok);
klok += 1500; s = zet(1500, 60, 'constant');
waar('na 6,5 s wél', p.bscConditie(test('misfire'), s).ok, p.bscConditie(test('misfire'), s).label);

// Even uit en weer aan: de klok begint opnieuw.
klok += 500; zet(0, 60, 'constant');
klok += 500; s = zet(1500, 60, 'constant');
waar('na een stop telt de wachttijd opnieuw', !p.bscConditie(test('misfire'), s).ok);

// Stationair na een start: zelfde regel, geen hybride-uitzondering.
klok += 60000; zet(0, 0); klok += 100; s = zet(900, 0);
waar('stationair net gestart: idle_stab wacht', !p.bscConditie(test('idle_stab'), s).ok);
klok += 6100; s = zet(900, 0);
waar('stationair na 6 s: idle_stab meet', p.bscConditie(test('idle_stab'), s).ok, p.bscConditie(test('idle_stab'), s).label);

console.log('\n' + ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
