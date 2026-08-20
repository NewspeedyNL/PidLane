// ══════════════════════════════════════════════════════════════════
// test-steunbits.js — leest de app de steunbits goed?
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Op 18-08 stonden er vier sensoren in de actieve selectie die deze CX-5 niet
// ondersteunt. `profielTegenSteunbits()` gooit die er voortaan uit — en dat is
// een functie die PIDs VERWIJDERT. Eén bit verkeerd geteld en hij sloopt
// sensoren die het prima doen. Vandaar deze test, met de échte antwoorden uit
// het veldlog van 18-08 als ijkpunt:
//
//   0100 = 4100FE3FA813     0120 = 4120A007B011
//   0140 = 4140FAD08C81     0160 = 41606B080001
//
// De verwachtingen zijn niet verzonnen: ze komen uit de testrun van 14:09, waar
// blok 6 elke PID los, in een paar én in een groep van zes uitprobeerde. Wat
// daar antwoordde hoort hier ondersteund te zijn; wat overal zweeg niet.
//
// Draaien vanuit public/:  node test-steunbits.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

// Dezelfde telling als in profielTegenSteunbits(). Blijft die daar wijzigen,
// dan hier ook — de test toetst het gedrag, niet de koppeling.
function ondersteund(antwoorden, pid) {
  const bits = {};
  antwoorden.forEach(function (r) {
    const hex = String(r).replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    const m = hex.match(/^41([0-9A-F]{2})([0-9A-F]{8})/);
    if (!m) return;
    bits[parseInt(m[1], 16)] = parseInt(m[2], 16);
  });
  const n = parseInt(pid.slice(2), 16);
  const blok = Math.floor((n - 1) / 32) * 32;
  const w = bits[blok];
  if (w === undefined) return null;          // blok niet gelezen: niets beweren
  return ((w >>> (32 - (n - blok))) & 1) === 1;
}

const CX5 = ['4100FE3FA813', '4120A007B011', '4140FAD08C81', '41606B080001'];

let fout = 0;
function toets(pid, verwacht, waarom) {
  const g = ondersteund(CX5, pid);
  if (g === verwacht) console.log('  ok    ' + pid + '  ' + (verwacht === null ? 'geen steunblok' : verwacht ? 'ondersteund' : 'NIET ondersteund') + '   — ' + waarom);
  else { fout++; console.log('  FOUT  ' + pid + '  kreeg ' + g + ', verwacht ' + verwacht + '   — ' + waarom); }
}

console.log('Steunbits — Mazda CX-5 2018, antwoorden uit het veldlog van 18-08\n');

// ── deze antwoordden in blok 6 en in de sweep ──
toets('010C', true,  'toerental, controle-PID: 5 van 5 raak');
toets('0104', true,  'motorbelasting, werkt');
toets('0105', true,  'koelwater, werkt');
toets('010B', true,  'inlaatdruk, werkt');
toets('010E', true,  'ontstekingstiming, werkt');
toets('0115', true,  'O2 B1S2, werkt');
toets('0142', true,  'accuspanning, werkt');
toets('015C', false, 'motorolie: overal stil, hoort eruit');

// ── deze zwegen overal: los, ruime timeout, in een paar, in een groep ──
toets('0114', false, 'O2 B1S1: geen enkel adres reageert');
toets('0146', false, 'omgevingstemperatuur: overal stil');
toets('015E', false, 'brandstofverbruik: overal stil');
toets('010A', false, 'brandstofdruk: NO DATA in de sweep');
toets('012C', false, 'EGR-klep: NO DATA in de sweep');
toets('015A', false, 'relatief gaspedaal: NO DATA in de sweep');

// ── randgevallen die de verwijderlogica moeten tegenhouden ──
toets('01A5', null, 'blok 01A0 is niet gelezen — dan niets beweren');
console.log('  ok    2101  overgeslagen — mode 22 heeft geen steunbits');

// ── de telling zelf: eerste en laatste bit van een blok ──
// FE = 1111 1110 → 0101 t/m 0107 aan, 0108 uit.
toets('0101', true,  'eerste bit van het eerste blok');
toets('0108', false, 'achtste bit staat uit in FE');
// 4140 F A D 0 8 C 8 1 → laatste bit van dat blok is 0160.
toets('0160', true,  'laatste bit van blok 0140 (81 eindigt op 1)');

// Zonder gelezen blok mag er nooit iets verwijderd worden.
if (ondersteund([], '010C') !== null) { fout++; console.log('  FOUT  zonder antwoorden moet het resultaat null zijn'); }
else console.log('  ok    zonder leesbare steunvragen wordt er niets beweerd');

// ══════════════════════════════════════════════════════════════════
// TOEGEVOEGD 20-08 — mag de merk-preset zetten wat de ECU ontkent?
// ══════════════════════════════════════════════════════════════════
// Hierboven staat dat profielTegenSteunbits() de vier fantomen weggooit, en
// dat klopte. Wat er niet stond: drieëntwintig seconden later zette
// applyVehiclePIDPreset() er MAZDA: ['015C','0110'] weer bovenop. Uit het
// logboek van 20-08:
//
//   19:36:22  discovery uit de bitmaps   → 55 PIDs, precies conform
//   19:36:49  voertuig-preset geladen    → 26 PIDs erbij, waaronder 015C
//   19:37:51  blok 6 telt supportedPIDs  → 62, waarvan 7 ontkend
//
// Vier ritten lang leek punt 1 daardoor te falen terwijl de controle werkte.
// Dit deel bewaakt dat de preset voortaan langs dezelfde poort gaat.
const fsMod = require('fs');
const bron = fsMod.readFileSync(__dirname + '/pidlane-rijsituatie.js', 'utf8');

function bronToets(naam, voorwaarde, waarom) {
  if (voorwaarde) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + (waarom ? ' — ' + waarom : '')); }
}

const iPreset = bron.indexOf('function applyVehiclePIDPreset');
const iZeef = bron.indexOf('magToevoegen(p)');
bronToets('preset houdt elke kandidaat tegen de steunbits',
  iPreset >= 0 && iZeef > iPreset,
  'applyVehiclePIDPreset zeeft niet — 015C komt terug in supportedPIDs');

bronToets('discoverPIDsBitmap bewaart de bitmaps',
  /_steunbitsOnthoud\(parseInt\(rangeCmd/.test(bron),
  'zonder opslag kan de preset niets raadplegen');

bronToets('profielTegenSteunbits bewaart ze ook',
  /_steunbitsOnthoud\(parseInt\(q\.slice/.test(bron),
  'bij een profiel-start blijven de bits anders onbekend');

bronToets('poort is van buiten bereikbaar',
  /window\.magToevoegen/.test(bron) && /window\.ecuSteunt/.test(bron));

// De scheidslijn: toevoegen op BEWIJS mag zonder zeef, toevoegen op AANNAME
// niet. Sneuvelt deze toets, dan is er een plek bijgekomen die PIDs aanneemt
// zonder te meten — en dan is de vraag welke van de twee het is.
const addPlekken = (bron.match(/supportedPIDs\.add/g) || []).length;
bronToets('aantal toevoegplekken onveranderd (4)', addPlekken === 4,
  addPlekken + ' gevonden i.p.v. 4 — nieuwe plek? Bepaal eerst: bewijs of aanname');

// ── De testrun mag de bus niet zelf vervuilen ──
// Alle 18 missers van 20-08 kwamen van vier ontkende PIDs. De run maakte dus
// het probleem dat hij moest meten: 15% foutgraad, pollbudget naar 55%, en een
// waarschuwing aan de gebruiker over lege antwoorden.
const run = fsMod.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8');
bronToets('sweep slaat ontkende PIDs over',
  /_ontkend\.push\(p\)/.test(run) && /ecuSteunt\(p\) === false/.test(run),
  'blok 3 vraagt dode PIDs op en duwt de foutgraad omhoog');
bronToets('blok 6 pookt niet in wat al verklaard is',
  /_verklaard\.push\(p\)/.test(run),
  'dertig verzoeken aan PIDs waarvan de ECU al zei dat ze niet bestaan');
bronToets('blok 8 slaat ontkende kandidaten over',
  /niet opgevraagd: de ECU ontkent hem/.test(run));

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
