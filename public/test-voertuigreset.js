// ══════════════════════════════════════════════════════════════════
// test-voertuigreset.js — het lezen van de VIN wist geen sterkere data
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// De app kent vier bronnen voor voertuigdata met een vaste rangorde
// (vin < nhtsa < rdw < user, zie pidlane-voertuigdata.js). Die rangorde deed
// zijn werk pas ná het lezen van de VIN, want tot 26-08 was de VIN het eerste
// wat de app over een auto wist. Twee plekken gingen daar hard van uit:
//
//   resetVehicleSources()  in tryReadVIN()        — wiste de bron-rangen
//   vehicleInfo = {...}    in updateVehicleCard() — wiste de velden zelf
//
// Allebei toetsten ze op "binnenkomende VIN != opgeslagen VIN", en een LEGE
// opgeslagen VIN telde als ongelijk. Het lezen van de VIN wiste dus alles wat
// er al stond.
//
// Sinds de kentekenstap vóór de protocolscan staat er wél al iets: RDW levert
// merk, model, bouwjaar en brandstof, en dat is per rangorde STERKER dan het
// merk/jaar dat uit de VIN-WMI komt. Zonder deze fix ruilt de app op het moment
// van VIN-lezen de sterke bron in voor de zwakke — een Mazda CX-5 2018 uit het
// kenteken wordt dan weer 'Mazda' zonder model en zonder brandstof, precies de
// LET OP die testrun 4.7 op blok 1 gaf.
//
// De vraag is niet "is de VIN veranderd" maar "is dit een ANDERE auto". Dat is
// wat plAnderVoertuig() beslist, en wat hier wordt vastgelegd.
//
// Draaien vanuit public/:  node test-voertuigreset.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

const VIN_A = 'JMZKF6W7600766507';
const VIN_B = 'WVWZZZ1JZ3W386752';

// pidlane-voertuigdata.js is een classic script. Het leunt op een globale
// `vehicleInfo` en op herijkPidGate(); allebei prikken we hier in de sandbox.
function laadMergeLaag(startVehicleInfo) {
  const s = {};
  s.window = s;
  s.vehicleInfo = startVehicleInfo;
  s.herijkPidGate = function () { };
  s.console = { warn: function () { }, log: function () { } };
  s.localStorage = { getItem: function () { return null; }, setItem: function () { } };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-voertuigdata.js', 'utf8'), s, { filename: 'pidlane-voertuigdata.js' });
  if (typeof s.plAnderVoertuig !== 'function') throw new Error('plAnderVoertuig() niet gevonden');
  if (typeof s.mergeVehicleData !== 'function') throw new Error('mergeVehicleData() niet gevonden');
  return s;
}

function leegVoertuig() {
  return { merk: 'Onbekend', model: '', year: '', vin: '', brandstof: '', motor: '' };
}

// ── de controles ─────────────────────────────────────────────────

// De kernvraag, als waarheidstabel. Alleen twee ingevulde, verschillende VINs
// tellen als een ander voertuig.
function keurAnderVoertuig(fn) {
  const gevallen = [
    { oud: '', nieuw: '', hoort: false, waarom: 'allebei onbekend' },
    { oud: '', nieuw: VIN_A, hoort: false, waarom: 'VIN werd NU pas gelezen — geen andere auto' },
    { oud: VIN_A, nieuw: '', hoort: false, waarom: 'VIN-lezing mislukte — geen bewijs van een andere auto' },
    { oud: VIN_A, nieuw: VIN_A, hoort: false, waarom: 'zelfde auto' },
    { oud: VIN_A, nieuw: VIN_B, hoort: true, waarom: 'twee ingevulde VINs die verschillen' },
    { oud: VIN_A, nieuw: VIN_A.toLowerCase(), hoort: false, waarom: 'alleen hoofdlettergebruik verschilt' },
    { oud: '  ' + VIN_A + ' ', nieuw: VIN_A, hoort: false, waarom: 'alleen witruimte verschilt' },
    { oud: null, nieuw: VIN_A, hoort: false, waarom: 'null telt als onbekend' },
    { oud: undefined, nieuw: undefined, hoort: false, waarom: 'undefined telt als onbekend' }
  ];
  return gevallen.filter(function (g) { return fn(g.oud, g.nieuw) !== g.hoort; })
    .map(function (g) {
      return JSON.stringify(g.oud) + ' -> ' + JSON.stringify(g.nieuw) +
        ' geeft ' + fn(g.oud, g.nieuw) + ', hoort ' + g.hoort + ' (' + g.waarom + ')';
    });
}

// Het gedrag dat er echt toe doet: RDW eerst (kentekenstap), VIN daarna.
// Zonder resetVehicleSources() ertussen moet RDW blijven staan.
function keurRdwOverleeftVin(s) {
  const uit = [];
  s.vehicleInfo = leegVoertuig();
  s.resetVehicleSources();

  // 1. de kentekenstap: RDW levert het volledige plaatje
  s.mergeVehicleData('rdw', { merk: 'MAZDA', model: 'CX-5', year: '2018', brandstof: 'Benzine' });
  if (s.vehicleInfo.merk !== 'Mazda') uit.push('na RDW is merk ' + JSON.stringify(s.vehicleInfo.merk) + ', hoort Mazda');
  if (s.vehicleInfo.brandstof !== 'benzine') uit.push('na RDW is brandstof ' + JSON.stringify(s.vehicleInfo.brandstof) + ', hoort benzine');

  // 2. de VIN komt binnen. plAnderVoertuig zegt: geen andere auto, dus GEEN
  //    reset. De WMI-decoder levert een grover merk en geen brandstof.
  if (s.plAnderVoertuig(s.vehicleInfo.vin, VIN_A)) uit.push('plAnderVoertuig zag een andere auto waar er geen is');
  s.mergeVehicleData('vin', { merk: 'Mazda Motor Corporation', year: '2017' });

  // 3. RDW moet gewonnen hebben op merk én jaar, en brandstof moet er nog zijn.
  if (s.vehicleInfo.merk !== 'Mazda') uit.push('VIN overschreef het RDW-merk: ' + JSON.stringify(s.vehicleInfo.merk));
  if (s.vehicleInfo.year !== '2018') uit.push('VIN overschreef het RDW-jaar: ' + JSON.stringify(s.vehicleInfo.year));
  if (s.vehicleInfo.brandstof !== 'benzine') uit.push('brandstof kwijt na de VIN: ' + JSON.stringify(s.vehicleInfo.brandstof));
  if (s.vehicleInfo.model !== 'CX-5') uit.push('model kwijt na de VIN: ' + JSON.stringify(s.vehicleInfo.model));
  return uit;
}

// De tegenhanger: bij een echt ander voertuig MOET er wél gereset worden,
// anders houdt auto B de gegevens van auto A.
function keurAndereAutoResetWel(s) {
  const uit = [];
  s.vehicleInfo = leegVoertuig();
  s.resetVehicleSources();
  s.mergeVehicleData('rdw', { merk: 'MAZDA', model: 'CX-5', year: '2018', brandstof: 'Benzine' });
  s.vehicleInfo.vin = VIN_A;

  if (!s.plAnderVoertuig(s.vehicleInfo.vin, VIN_B))
    uit.push('twee verschillende ingevulde VINs werden niet als ander voertuig gezien');

  // Zo doet de app het: reset, dan pas de nieuwe bron.
  s.vehicleInfo = leegVoertuig();
  s.resetVehicleSources();
  s.mergeVehicleData('vin', { merk: 'Volkswagen', year: '2003' });
  if (s.vehicleInfo.merk !== 'Volkswagen') uit.push('na de reset won het oude merk nog steeds: ' + JSON.stringify(s.vehicleInfo.merk));
  if (s.vehicleInfo.model !== '') uit.push('model van de vorige auto bleef staan: ' + JSON.stringify(s.vehicleInfo.model));
  if (s.vehicleInfo.brandstof !== '') uit.push('brandstof van de vorige auto bleef staan: ' + JSON.stringify(s.vehicleInfo.brandstof));
  return uit;
}

// Handmatige invoer blijft boven alles staan, ook boven RDW. Zonder deze
// controle zou "RDW wint" ook waar zijn met een rangorde die user negeert.
function keurUserBlijftLeidend(s) {
  const uit = [];
  s.vehicleInfo = leegVoertuig();
  s.resetVehicleSources();
  s.mergeVehicleData('user', { merk: 'Mazda', model: 'CX-5 Skyactiv', brandstof: 'benzine' });
  s.mergeVehicleData('rdw', { merk: 'MAZDA', model: 'CX-5', brandstof: 'Diesel' });
  if (s.vehicleInfo.model !== 'CX-5 Skyactiv') uit.push('RDW overschreef handmatige invoer voor model: ' + JSON.stringify(s.vehicleInfo.model));
  if (s.vehicleInfo.brandstof !== 'benzine') uit.push('RDW overschreef handmatige brandstof: ' + JSON.stringify(s.vehicleInfo.brandstof));
  return uit;
}

// ── toetshulpjes ─────────────────────────────────────────────────
let fout = 0;

function toetsSchoon(naam, gemeten) {
  if (gemeten.length === 0) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam);
  gemeten.forEach(function (r) { console.log('        ' + r); });
}

function toetsMeldt(naam, gemeten, moetNoemen) {
  const raak = gemeten.some(function (r) { return r.indexOf(moetNoemen) > -1; });
  if (raak) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam);
  console.log('        de controle bleef stil terwijl hij ' + moetNoemen + ' had moeten noemen');
  console.log('        kreeg: ' + (gemeten.length ? gemeten.join(' | ') : '(niets)'));
}

// ── draaien ──────────────────────────────────────────────────────
console.log('Voertuigdata — de VIN lezen wist geen sterkere bron\n');

const S = laadMergeLaag(leegVoertuig());

toetsSchoon('de merge-laag is geladen en normaliseert',
  (function () {
    S.vehicleInfo = leegVoertuig(); S.resetVehicleSources();
    S.mergeVehicleData('rdw', { merk: 'MAZDA' });
    return S.vehicleInfo.merk === 'Mazda' ? [] : ['mergeVehicleData("rdw",{merk:"MAZDA"}) gaf ' + JSON.stringify(S.vehicleInfo.merk)];
  })());

toetsSchoon('plAnderVoertuig: alleen twee verschillende ingevulde VINs tellen',
  keurAnderVoertuig(S.plAnderVoertuig));
toetsSchoon('RDW-data overleeft het lezen van de VIN (de fout van 26-08)',
  keurRdwOverleeftVin(S));
toetsSchoon('een echt ander voertuig begint wél schoon',
  keurAndereAutoResetWel(S));
toetsSchoon('handmatige invoer blijft boven RDW staan',
  keurUserBlijftLeidend(S));

// ── tegenproef ───────────────────────────────────────────────────
// De oude voorwaarde, letterlijk: "gelijk aan de opgeslagen VIN, anders weg".
function anderVoertuigOud(oudVin, nieuwVin) {
  return !(String(oudVin || '') === String(nieuwVin || ''));
}

toetsMeldt('de oude voorwaarde zag "VIN werd net gelezen" als een andere auto',
  keurAnderVoertuig(anderVoertuigOud), 'VIN werd NU pas gelezen');

toetsMeldt('de oude voorwaarde struikelde ook over een mislukte VIN-lezing',
  keurAnderVoertuig(anderVoertuigOud), 'VIN-lezing mislukte');

toetsSchoon('de oude voorwaarde had het bij twee échte VINs wél goed',
  anderVoertuigOud(VIN_A, VIN_B) === true && anderVoertuigOud(VIN_A, VIN_A) === false ? [] :
    ['de tegenproef zelf deugt niet — oude voorwaarde geeft onverwachte uitkomsten']);

// En het gevolg dat eruit voortkwam: mét een reset op dat moment verliest RDW.
toetsMeldt('mét de oude reset op dat moment wint het zwakke VIN-merk (het echte gevolg)',
  (function () {
    S.vehicleInfo = leegVoertuig(); S.resetVehicleSources();
    S.mergeVehicleData('rdw', { merk: 'MAZDA', model: 'CX-5', year: '2018', brandstof: 'Benzine' });
    S.resetVehicleSources();                       // <- wat tryReadVIN onvoorwaardelijk deed
    S.mergeVehicleData('vin', { merk: 'Mazda Motor Corporation', year: '2017' });
    const uit = [];
    if (S.vehicleInfo.merk !== 'Mazda') uit.push('VIN overschreef het RDW-merk: ' + JSON.stringify(S.vehicleInfo.merk));
    if (S.vehicleInfo.year !== '2018') uit.push('VIN overschreef het RDW-jaar: ' + JSON.stringify(S.vehicleInfo.year));
    return uit;
  })(), 'VIN overschreef het RDW-merk');

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
