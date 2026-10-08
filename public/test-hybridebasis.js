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
// #430: de drie hybridetests zijn weg. Ze keurden een nieuwe accu af (015B
// is levensduur, geen laadtoestand), slaagden altijd, of maten de 12V-accu.
const hybrideIds = p.__bscTests.filter(x => x.groep === 'hybride').map(x => x.id);
waar('de catalogus heeft geen hybridetest die niets onderscheidt (#430)', !hybrideIds.length, hybrideIds.join(','));
waar('een hybride krijgt hv_soc, ev_ice en regen niet meer',
  !['hv_soc', 'ev_ice', 'regen'].some(id => lijst.includes(id)), lijst.join(','));
waar('een hybride krijgt geen dieseltests',
  !p.__bscTests.filter(x => x.groep === 'diesel').some(x => lijst.includes(x.id)));

// ══════════════════════════════════════════════════════════════════
console.log('\n── 3. een motortest meet alleen bij een motor die al even draait ──');
const test = id => p.__bscTests.find(x => x.id === id);
// Een rijdende auto: elke 250 ms een monster in pidVals én pidHist, zoals
// updPID() dat doet. De motorvoorwaarde leest de historie van 010C.
function rij(rpm, spd, f, ms) {
  fase = f || 'onbekend';
  for (let i = 0; i < ms; i += 250) {
    klok += 250;
    p.pidVals = { '010C': rpm, '010D': spd, '0105': 85 };
    const h = (p.pidHist['010C'] = p.pidHist['010C'] || []);
    h.push({ t: klok, v: rpm });
    if (h.length > 120) h.shift();
  }
  return p.bscSituaties();
}
const mag = (id, s) => p.bscConditie(test(id), s);

// Rijden op de accu, constant 60.
let s = rij(0, 60, 'constant', 10000);
waar('situatie "constant" wordt herkend zonder motor', s.has('constant'));
let c = mag('misfire', s);
waar('misfire meet niet zonder motor', !c.ok, 'kreeg ok');
waar('…en zegt waarop hij wacht', /motor draait/.test(c.label), c.label);
waar('x_rpm_const meet niet zonder motor', !mag('x_rpm_const', s).ok);
waar('x_decel_load meet niet zonder motor', !mag('x_decel_load', rij(0, 40, 'remmen', 500)).ok);
// Tegenproef: de regel blokkeert niet alles wat rijdt.
s = rij(0, 60, 'constant', 250);
// Een test zonder motoreis, zoals de dieseltest egr_flow (sit 'rijden').
waar('een test zonder motoreis meet wél tijdens accurijden', p.bscConditie(test('egr_flow'), s).ok);

// De motor slaat aan.
s = rij(1500, 60, 'constant', 1000);
c = mag('misfire', s);
waar('net aangeslagen: misfire wacht nog', !c.ok, 'kreeg ok');
waar('…met de reden erbij', /al \d+ s/.test(c.label), c.label);
s = rij(1500, 60, 'constant', 4500);
waar('na 5,5 s nog steeds niet (de basislijn van 5 s bevat de aanloop)', !mag('misfire', s).ok);
s = rij(1500, 60, 'constant', 1000);
waar('na 6,5 s wél', mag('misfire', s).ok, mag('misfire', s).label);

// Even uit en weer aan: de wachttijd begint opnieuw.
rij(0, 60, 'constant', 500);
s = rij(1500, 60, 'constant', 3000);
waar('na een stop telt de wachttijd opnieuw', !mag('misfire', s).ok);

// Een verse sessie met een motor die al liep: geen wachttijd. De historie
// zegt het, niet een klok die bij de eerste aanroep begint.
p.pidHist = {};
rij(800, 0, 'onbekend', 7000);
s = p.bscSituaties();
waar('motor liep al vóór de eerste aanroep: idle_stab meet meteen', mag('idle_stab', s).ok, mag('idle_stab', s).label);
// Tegenproef: te weinig historie is geen bewijs van stabiel.
p.pidHist = {};
s = rij(800, 0, 'onbekend', 3000);
waar('3 s historie: idle_stab wacht', !mag('idle_stab', s).ok);

// Stationair na een start: zelfde regel, geen hybride-uitzondering.
rij(0, 0, 'onbekend', 2000);
s = rij(900, 0, 'onbekend', 1000);
waar('stationair net gestart: idle_stab wacht', !mag('idle_stab', s).ok);
s = rij(900, 0, 'onbekend', 6000);
waar('stationair na 7 s: idle_stab meet', mag('idle_stab', s).ok, mag('idle_stab', s).label);

console.log('\n' + ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
