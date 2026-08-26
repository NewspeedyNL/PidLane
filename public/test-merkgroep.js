// ══════════════════════════════════════════════════════════════════
// test-merkgroep.js — merkGroep() matcht elk merk op dezelfde manier
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Testrun 4.7 (26-08) meldde: MINI→BMW, MINI COOPER→BMW, BMW→BMW,
// BMW 320D→(niets). Zeven merkregels toetsten op prefix, twee op gelijkheid
// (m==='BMW', m==='VW'). De normalisatie in merkGroep() stript spaties en
// cijfers, dus zodra er een model achter het merk staat:
//
//   'BMW 320D'  -> 'BMWD'    -> ongelijk aan 'BMW'  -> '' (geen groep)
//   'VW GOLF'   -> 'VWGOLF'  -> ongelijk aan 'VW'   -> '' (geen groep)
//   'MINI COOPER' -> 'MINICOOPER' -> prefix 'MINI'  -> 'BMW' (wél goed)
//
// Geen groep betekent: geen merk-specifieke DTC-lookup (§14) en geen
// merk-preset in applyVehiclePIDPreset(). Stil, want '' is een geldige
// uitkomst voor een onbekend merk — een BMW werd dus behandeld als een merk
// dat de app niet kent, zonder één melding.
//
// De VW-helft stond NIET in de testrun. Die kwam pas boven bij het narekenen,
// omdat blok 11 alleen MINI en BMW probeerde. Dat is precies waarom deze test
// niet twee gevallen vastlegt maar de REGEL: elk merk matcht op prefix. Een
// nieuwe merkregel die weer op gelijkheid toetst valt hier vanzelf door.
//
// Draaien vanuit public/:  node test-merkgroep.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

// pidlane-data.js is een classic script dat alles op window hangt; een sandbox
// waarin window naar zichzelf wijst is genoeg om 'm te draaien.
function laadMerkGroep() {
  const s = {};
  s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
  if (typeof s.merkGroep !== 'function') throw new Error('merkGroep() niet gevonden in pidlane-data.js');
  return s.merkGroep;
}

// De merken die de app kent, met per merk een kaal geval en een geval met een
// model erachter. Beide MOETEN dezelfde groep geven — dat is de hele regel.
// Voeg je hier een merk toe, dan toets je meteen beide vormen.
const MERKEN = [
  { kaal: 'MAZDA',      metModel: 'Mazda CX-5',        groep: 'MAZDA' },
  { kaal: 'VOLKSWAGEN', metModel: 'Volkswagen Golf',   groep: 'VAG' },
  { kaal: 'VW',         metModel: 'VW GOLF',           groep: 'VAG' },
  { kaal: 'AUDI',       metModel: 'Audi A4 Avant',     groep: 'VAG' },
  { kaal: 'SKODA',      metModel: 'Skoda Octavia',     groep: 'VAG' },
  { kaal: 'SEAT',       metModel: 'Seat Leon FR',      groep: 'VAG' },
  { kaal: 'CUPRA',      metModel: 'Cupra Formentor',   groep: 'VAG' },
  { kaal: 'TOYOTA',     metModel: 'Toyota Yaris 1.5',  groep: 'TOYOTA' },
  { kaal: 'LEXUS',      metModel: 'Lexus IS 300h',     groep: 'TOYOTA' },
  { kaal: 'FORD',       metModel: 'Ford Focus 1.0',    groep: 'FORD' },
  { kaal: 'OPEL',       metModel: 'Opel Astra K',      groep: 'OPEL' },
  { kaal: 'VAUXHALL',   metModel: 'Vauxhall Corsa',    groep: 'OPEL' },
  { kaal: 'BMW',        metModel: 'BMW 320D',          groep: 'BMW' },
  { kaal: 'MINI',       metModel: 'MINI COOPER',       groep: 'BMW' }
];

// ── de controles, als losse functies zodat de tegenproef ze hergebruikt ──

// De kale merknaam moet de verwachte groep geven. Faalt dit, dan is de
// merkregel zelf weg of hernoemd.
function keurKaalMerk(fn) {
  return MERKEN.filter(function (m) { return fn(m.kaal) !== m.groep; })
               .map(function (m) { return m.kaal + ' geeft ' + JSON.stringify(fn(m.kaal)) + ', hoort ' + m.groep; });
}

// DE KERNREGEL: merk mét model geeft dezelfde groep als het kale merk.
// Dit is de controle die de bug van 26-08 vangt, voor elk merk tegelijk.
function keurModelZelfdeGroep(fn) {
  return MERKEN.filter(function (m) { return fn(m.metModel) !== m.groep; })
               .map(function (m) { return JSON.stringify(m.metModel) + ' geeft ' + JSON.stringify(fn(m.metModel)) +
                                          ', hoort ' + m.groep + ' (zelfde als het kale ' + m.kaal + ')'; });
}

// Onbekend blijft onbekend. Zonder deze controle zou "alles matcht op prefix"
// ook waar zijn met een functie die altijd 'BMW' teruggeeft.
function keurOnbekend(fn) {
  const uit = [];
  ['', '   ', 'Tesla', 'Peugeot 208', 'Renault Clio', '12-ABC-3', '???'].forEach(function (x) {
    const r = fn(x);
    if (r !== '') uit.push(JSON.stringify(x) + ' geeft ' + JSON.stringify(r) + ', hoort leeg');
  });
  return uit;
}

// Hoofdletters, accenten en leestekens mogen niet uitmaken — dat is wat de
// normalisatie belooft en waar de rest van de regel op leunt.
function keurNormalisatie(fn) {
  const uit = [];
  [['mazda cx-5', 'MAZDA'], ['MaZdA', 'MAZDA'], ['Škoda Octavia', 'VAG'],
   ['bmw 320d', 'BMW'], ['  BMW  320D  ', 'BMW']].forEach(function (p) {
    const r = fn(p[0]);
    if (r !== p[1]) uit.push(JSON.stringify(p[0]) + ' geeft ' + JSON.stringify(r) + ', hoort ' + p[1]);
  });
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
console.log('merkGroep — elk merk matcht op dezelfde manier\n');

const merkGroep = laadMerkGroep();

// Eerst de loader zelf vastpinnen: geeft die een functie terug die overal ''
// zegt, dan slaagt "onbekend blijft onbekend" en zegt de rest niets.
toetsSchoon('merkGroep is geladen en kent minstens één merk',
  merkGroep('MAZDA') === 'MAZDA' ? [] : ['merkGroep("MAZDA") geeft ' + JSON.stringify(merkGroep('MAZDA'))]);

// ── de echte functie moet schoon zijn ──
toetsSchoon('elk kaal merk geeft zijn groep', keurKaalMerk(merkGroep));
toetsSchoon('merk mét model geeft dezelfde groep als het kale merk (de fout van 26-08)',
  keurModelZelfdeGroep(merkGroep));
toetsSchoon('een onbekend merk blijft leeg', keurOnbekend(merkGroep));
toetsSchoon('hoofdletters, accenten en leestekens maken niet uit', keurNormalisatie(merkGroep));

// ── tegenproef: de controles moeten de oude fout terugvinden ──
// De oude implementatie, letterlijk zoals hij tot 26-08 in pidlane-data.js
// stond. Draait hij door keurModelZelfdeGroep, dan MOET die BMW en VW noemen.
function merkGroepOud(merk) {
  const m = String(merk || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z]/g, '');
  if (!m) return '';
  if (m.indexOf('MAZDA') === 0) return 'MAZDA';
  if (m.indexOf('VOLKSWAGEN') === 0 || m === 'VW' || m.indexOf('AUDI') === 0 || m.indexOf('SKODA') === 0 || m.indexOf('SEAT') === 0 || m.indexOf('CUPRA') === 0) return 'VAG';
  if (m.indexOf('TOYOTA') === 0 || m.indexOf('LEXUS') === 0) return 'TOYOTA';
  if (m.indexOf('FORD') === 0) return 'FORD';
  if (m.indexOf('OPEL') === 0 || m.indexOf('VAUXHALL') === 0) return 'OPEL';
  if (m === 'BMW' || m.indexOf('MINI') === 0) return 'BMW';
  return '';
}

toetsMeldt('de oude ===-vergelijking op BMW wordt gezien (de fout van 26-08)',
  keurModelZelfdeGroep(merkGroepOud), 'BMW 320D');

toetsMeldt('de oude ===-vergelijking op VW wordt óók gezien (die stond niet in de testrun)',
  keurModelZelfdeGroep(merkGroepOud), 'VW GOLF');

toetsSchoon('de oude versie faalt op precies twee merken, niet meer',
  keurModelZelfdeGroep(merkGroepOud).length === 2 ? [] :
    ['verwachtte 2 bevindingen, kreeg ' + keurModelZelfdeGroep(merkGroepOud).length +
     ': ' + keurModelZelfdeGroep(merkGroepOud).join(' | ')]);

// Het kale merk werkte in de oude versie wél — dat is nu juist het verraderlijke
// eraan, en het legt vast dat keurKaalMerk de bug van 26-08 NIET kan vinden.
// Zou die dat wel doen, dan toetsten beide controles hetzelfde.
toetsSchoon('de oude versie kwam wél door de kale-merk-controle (daarom viel het niet op)',
  keurKaalMerk(merkGroepOud));

// Een merkregel die te grof matcht moet ook gezien worden — anders zou
// "alles op prefix" te repareren zijn door één regex die alles pakt.
toetsMeldt('een merkregel die alles naar één groep trekt wordt gezien',
  keurOnbekend(function () { return 'BMW'; }), 'Tesla');

toetsMeldt('een kapotte normalisatie wordt gezien',
  keurNormalisatie(function (merk) {
    return String(merk).indexOf('MAZDA') === 0 ? 'MAZDA' : '';   // geen toUpperCase
  }), 'mazda cx-5');

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
