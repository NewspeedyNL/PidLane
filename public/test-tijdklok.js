// ══════════════════════════════════════════════════════════════════
// test-tijdklok.js — de kloktijd op het scherm is de lokale klok (#17)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// De bulk-recorder bouwde zijn sessie-id met toISOString(), dus met UTC,
// terwijl log() ernaast lokale tijd schrijft. Twee keer hard gemeten in een
// rit: dezelfde seconde stond in het app-log als 23:16:03 en in de naam van
// de recordersessie als 21-16-03.
//
// PIDLANE-CONTRACT.md §6 zegt wat de regel is: alle tijden zijn
// epoch-milliseconden in UTC, en omrekenen naar lokale tijd gebeurt pas op het
// scherm en in de export. plStempelLokaal() en plDatumLokaal() in
// pidlane-uihelpers.js zijn die omrekening; deze test bewaakt hen.
//
// WAT HIER NIET GETOETST WORDT, EN WAAROM
// Of de recorder die helpers ook echt gebruikt is een vraag over twee modules
// bij elkaar, en PLBulk.start() heeft een IndexedDB nodig die node niet heeft.
// Dat staat in bproef-tijdklok.js: die start de echte recorder in de echte app
// met TZ=Europe/Amsterdam, en legt het sessie-id naast de logregel.
//
// LET OP DE TIJDZONE. Deze test zet TZ zelf, vóór de eerste Date. Zonder dat
// draait hij op een CI-runner in UTC, en dáár geeft toISOString() precies
// dezelfde tijd als de lokale klok — dan zou de oude fout groen staan.
//
// Draaien vanuit public/:  node test-tijdklok.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
process.env.TZ = 'Europe/Amsterdam';

const fs = require('fs');
const vm = require('vm');

let fout = 0;
function eis(naam, waar, uitleg) {
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

// Eerst nagaan dat de tijdzone werkelijk staat. Doet hij dat niet, dan meet
// alles hieronder niets en is groen misleidend — dat is hier een FOUT en geen
// waarschuwing, want de test kan zonder verschil niet onderscheiden.
const zomer = new Date(Date.UTC(2026, 8, 2, 21, 16, 3, 568));   // 2 sep, +02:00
const winter = new Date(Date.UTC(2026, 0, 15, 23, 30, 0, 0));   // 15 jan, +01:00
console.log('\n1. De tijdzone van deze test staat op Europe/Amsterdam');
eis('zomertijd geeft +2 uur', zomer.getTimezoneOffset() === -120,
    'offset ' + zomer.getTimezoneOffset() + ' — TZ kwam niet aan, dan onderscheidt deze test niets');
eis('wintertijd geeft +1 uur', winter.getTimezoneOffset() === -60,
    'offset ' + winter.getTimezoneOffset());

// ── de echte helpers laden, niet overschrijven ───────────────────
// pidlane-uihelpers.js is een classic script vol DOM-code. We knippen er de
// twee helpers uit met een anker dat de test laat stoppen als ze verdwijnen.
const BRON = fs.readFileSync('pidlane-uihelpers.js', 'utf8');
function knip(van, tot) {
  const i = BRON.indexOf(van), j = BRON.indexOf(tot, i + 1);
  if (i < 0 || j < 0) throw new Error('"' + van + '" niet gevonden in pidlane-uihelpers.js — hernoemd?');
  return BRON.slice(i, j);
}
const HULP = knip('function _plTweeCijfers(n)', '\n// ── Voertuig-blok');
const ctx = { console: console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(HULP, ctx, { filename: 'pidlane-uihelpers.js (klok)' });

console.log('\n2. plStempelLokaal() geeft de klok van het scherm, niet die van UTC');
eis('de helpers zijn geladen',
    typeof ctx.plStempelLokaal === 'function' && typeof ctx.plDatumLokaal === 'function',
    'plStempelLokaal/plDatumLokaal ontbreken — dan meet deze test niets');

if (typeof ctx.plStempelLokaal === 'function') {
  const s = ctx.plStempelLokaal(zomer.getTime());
  // Dit is het geval uit het issue, cijfer voor cijfer: 21:16:03 UTC is
  // 23:16:03 in Amsterdam, en dat laatste stond in het logboek.
  eis('21:16:03 UTC wordt 23-16-03 in de stempel', s === '2026-09-02T23-16-03-568',
      'kreeg "' + s + '", verwacht "2026-09-02T23-16-03-568"');
  eis('de stempel claimt geen UTC met een Z', !/Z$/.test(s), 'kreeg "' + s + '"');
  // En de tegenproef in één regel: de oude vorm gaf hier iets anders. Staat
  // die gelijk, dan meet de toets hierboven niets.
  const oud = zomer.toISOString().replace(/[:.]/g, '-');
  eis('de oude vorm gaf hier wél een andere tijd (tegenproef)', oud.indexOf('T23-16-03') < 0,
      'toISOString() gaf "' + oud + '" — dan is er geen verschil om te meten');

  const w = ctx.plStempelLokaal(winter.getTime());
  eis('wintertijd schuift één uur en rolt over middernacht', w === '2026-01-16T00-30-00-000',
      'kreeg "' + w + '", verwacht "2026-01-16T00-30-00-000"');

  // Milliseconden met voorloopnullen: zonder padding wordt 23:16:03.007
  // "…-03-7" en sorteert een sessie-id verkeerd.
  const ms = ctx.plStempelLokaal(Date.UTC(2026, 8, 2, 21, 16, 3, 7));
  eis('milliseconden houden hun voorloopnullen', /-007$/.test(ms), 'kreeg "' + ms + '"');
}

console.log('\n3. plDatumLokaal() geeft de dag van het scherm');
if (typeof ctx.plDatumLokaal === 'function') {
  // Het geval waar het misgaat: 23:30 UTC op 15 januari is in Amsterdam al
  // 16 januari. Een export van vannacht kreeg met toISOString() de datum van
  // gisteren mee.
  const d = ctx.plDatumLokaal(winter.getTime());
  eis('23:30 UTC op 15 jan is hier al 16 jan', d === '2026-01-16',
      'kreeg "' + d + '", verwacht "2026-01-16"');
  eis('de oude vorm gaf hier de dag ervóór (tegenproef)',
      winter.toISOString().slice(0, 10) === '2026-01-15',
      'toISOString() gaf ' + winter.toISOString().slice(0, 10) + ' — dan is er geen verschil om te meten');
  eis('een gewone dag blijft gewoon', ctx.plDatumLokaal(Date.UTC(2026, 8, 2, 10, 0, 0)) === '2026-09-02');
}

console.log(fout === 0 ? '\nalle tests geslaagd' : '\n' + fout + ' test(s) gefaald');
process.exit(fout === 0 ? 0 : 1);
