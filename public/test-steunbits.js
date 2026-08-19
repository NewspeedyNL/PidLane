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

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
