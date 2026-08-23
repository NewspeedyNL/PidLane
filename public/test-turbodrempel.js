// test-turbodrempel.js — turbo-detectie tegen de gemeten omgevingsdruk
//
// Tot 24-08-2026 stonden de twee drukdrempels als vast getal in de code:
// bewijs vanaf 85 kPa, atmosferisch onder 106 kPa. Dat werkt alleen op
// zeeniveau. Deze test legt vast dat ze nu meebewegen met PID 0133
// (barometerdruk), met de MAP bij stilstaande motor als terugval.
//
// Knippad: alles tussen `// Boost/laaddruk-PID` en
// `// true = sensor past bij dit voertuig` in pidlane-pidgate.js.
// Verplaats je die ankers, verplaats dan ook deze test.
//
// Draaien vanuit public/:  node test-turbodrempel.js
'use strict';
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync(__dirname + '/pidlane-pidgate.js', 'utf8');
const a = src.indexOf('// Boost/laaddruk-PID');
const b = src.indexOf('// true = sensor past bij dit voertuig');
if (a < 0 || b < 0) { console.log('FOUT: knippad niet gevonden'); process.exit(1); }
const blok = src.slice(a, b);

function wereld(pidVals) {
  const ctx = { console, pidVals: pidVals || {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(blok + '\n;window._t={ omg:_omgevingsdruk, bew:_bewijsDrempel, ' +
    'atm:_atmosfDrempel, note:_noteMap, na:_isNaturallyAspirated, ' +
    'phantom:_boostPhantom, piek:()=>_maxMapSeen, n:()=>_mapSamples };',
    ctx, { filename: 'turboblok' });
  return ctx._t;
}
// Voedt een reeks MAP-metingen bij een gegeven toerental.
function meet(t, vals, map, rpm, keer) {
  for (let i = 0; i < keer; i++) { vals['010B'] = map; vals['010C'] = rpm; t.note(); }
}

let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (!ok) { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + JSON.stringify(gemeten) + ', verwacht ' + JSON.stringify(verwacht)); }
  else console.log('  ok    ' + naam);
}

console.log('\n— zonder barometer blijven de oude vaste getallen staan —');
{
  const v = {}, t = wereld(v);
  toets('omgevingsdruk onbekend', t.omg(), null);
  toets('bewijsdrempel valt terug op 85', t.bew(), 85);
  toets('atmosferische grens valt terug op 106', t.atm(), 106);
}

console.log('\n— de CX-5 van 23-08: barometer 102, piek 105 —');
{
  const v = { '0133': 102 }, t = wereld(v);
  toets('bewijsdrempel 102-15', t.bew(), 87);
  toets('atmosferische grens 102+8', t.atm(), 110);
  meet(t, v, 105, 2500, 12);
  toets('genoeg bewijs verzameld', t.n() >= 10, true);
  toets('piek 105 vastgelegd', t.piek(), 105);
  toets('oordeel: atmosferisch', t.na(), true);
  toets('boost-PID wordt gefilterd', t.phantom('0170'), true);
  toets('gewone PID niet', t.phantom('010C'), false);
  // Dit is de kern: onder de oude vaste 106 was de marge 1 kPa.
  toets('marge is nu 5 kPa in plaats van 1', t.atm() - 105, 5);
}

console.log('\n— dezelfde auto op 1500 m hoogte (barometer 85) —');
{
  const v = { '0133': 85 }, t = wereld(v);
  toets('bewijsdrempel zakt mee naar 70', t.bew(), 70);
  toets('atmosferische grens zakt mee naar 93', t.atm(), 93);
  meet(t, v, 88, 2500, 12);            // vol gas op hoogte: ~88 kPa
  toets('bewijs komt WEL binnen', t.n() >= 10, true);
  toets('oordeel: atmosferisch', t.na(), true);
}

/* TEGENPROEF op het hoogte-geval. Met de oude vaste drempel van 85 kPa zou
   een atmosferische motor op 1500 m nooit bewijs opleveren: hij haalt die
   85 domweg niet. Er viel dan nooit een oordeel — de detectie was stil dood.
   Zonder deze toets bewijst het scenario hierboven niets. */
console.log('\n— tegenproef: met de oude vaste drempel valt daar geen oordeel —');
{
  const v = {}, t = wereld(v);          // geen barometer → terugval op 85
  meet(t, v, 88, 2500, 12);
  toets('88 kPa haalt de vaste drempel 85 nog net', t.n() >= 10, true);
  const v2 = {}, t2 = wereld(v2);
  meet(t2, v2, 82, 2500, 12);           // realistischer op 1500 m
  toets('82 kPa levert met de vaste drempel GEEN bewijs', t2.n(), 0);
  toets('en dus geen oordeel', t2.na(), false);
  const v3 = { '0133': 85 }, t3 = wereld(v3);
  meet(t3, v3, 82, 2500, 12);
  toets('mét barometer levert dezelfde 82 kPa wél bewijs', t3.n() >= 10, true);
}

console.log('\n— een turbo op hoogte wordt niet meer weggefilterd —');
{
  const v = { '0133': 85 }, t = wereld(v);
  meet(t, v, 100, 3000, 12);            // laadt naar 100 kPa: boven 85+8
  toets('piek 100 boven de grens van 93', t.piek() > t.atm(), true);
  toets('oordeel: GEEN turbo-filter', t.na(), false);
  toets('boost-PID blijft staan', t.phantom('0170'), false);
  // Met de oude vaste 106 was 100 < 106 → "atmosferisch" → tegels weg.
  toets('de oude vaste grens zou hem wél gefilterd hebben', 100 <= 106, true);
}

console.log('\n— terugval op MAP bij stilstaande motor —');
{
  const v = {}, t = wereld(v);
  meet(t, v, 101, 0, 4);                // contact aan, motor uit
  toets('omgevingsdruk afgeleid uit MAP', t.omg(), 101);
  toets('drempels bewegen mee', [t.bew(), t.atm()], [86, 109]);
  const v2 = {}, t2 = wereld(v2);
  meet(t2, v2, 101, 0, 2);              // te weinig monsters
  toets('twee monsters is te weinig', t2.omg(), null);
}

console.log('\n— onzinnige barometerwaarden worden genegeerd —');
{
  toets('0 kPa', wereld({ '0133': 0 }).omg(), null);
  toets('250 kPa', wereld({ '0133': 250 }).omg(), null);
  toets('120 kPa bestaat niet op aarde', wereld({ '0133': 120 }).omg(), null);
  toets('60 kPa mag nog net', wereld({ '0133': 60 }).omg(), 60);
}

console.log('\n— te weinig bewijs blijft te weinig bewijs —');
{
  const v = { '0133': 102 }, t = wereld(v);
  meet(t, v, 105, 2500, 9);             // één onder MAP_BEWIJS_MIN
  toets('negen monsters geven geen oordeel', t.na(), false);
  toets('en filteren dus niets', t.phantom('0170'), false);
}

console.log('\n— stationair draaien telt nooit als bewijs —');
{
  const v = { '0133': 102 }, t = wereld(v);
  meet(t, v, 35, 800, 50);              // stationair: lage MAP
  toets('vijftig stationaire metingen, nul bewijs', t.n(), 0);
  const v2 = { '0133': 102 }, t2 = wereld(v2);
  meet(t2, v2, 102, 0, 50);             // contact aan, motor uit
  toets('motor uit telt ook niet als bewijs', t2.n(), 0);
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
