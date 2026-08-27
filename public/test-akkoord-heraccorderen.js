// ══════════════════════════════════════════════════════════════════
// test-akkoord-heraccorderen.js — een akkoord op de oude tekst telt niet
// ──────────────────────────────────────────────────────────────────
// WAAROM
// De akkoordtekst in pidlane-klant.js sprak tot 27-08-2026 van
// "geanonimiseerde" meetdata terwijl de verwerking pseudonimisering is (zie
// test-toestemmingstekst.js). Wie vóór die datum akkoord gaf, deed dat op een
// tekst die de verwerking verkeerd omschreef — dat akkoord is aanvechtbaar en
// mag niet blijven gelden alsof er niets is veranderd.
//
// klantPubliek() in worker.js rekent dat uit via `akkoordActueel`: geldig
// alleen als AkkoordOp ná AKKOORD_TEKST_SINDS ligt. Bewust geen nieuw
// Airtable-veld — AkkoordOp bestaat al en wordt al bij elk akkoord
// bijgewerkt; een geschreven veldnaam die nog niet in de Klanten-tabel
// bestaat geeft 422 UNKNOWN_FIELD_NAME (zie de VIN-logregel-fix voor waar dat
// al eens misging).
//
// Deze test draait de ECHTE klantPubliek() tegen namaak-Airtable-records, niet
// een nagebouwde versie.
//
// Draaien vanuit public/:  node test-akkoord-heraccorderen.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

const src = fs.readFileSync(__dirname + '/../worker.js', 'utf8');

let fout = 0, n = 0;
function toets(naam, ok, detail) {
  n++;
  if (ok) { console.log('  ok    ' + naam); return; }
  console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : ''));
  fout++;
}

// AKKOORD_TEKST_SINDS staat vlak vóór klantPubliek; __name(klantPubliek, ...)
// sluit de functie af. Dezelfde extractietechniek als test-saldo-slot.js.
const van = src.indexOf('const AKKOORD_TEKST_SINDS');
const tot = src.indexOf('__name(klantPubliek, "klantPubliek");');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: AKKOORD_TEKST_SINDS/klantPubliek niet gevonden in worker.js.');
  console.error('      Verwacht AKKOORD_TEKST_SINDS ... __name(klantPubliek, ...).');
  process.exit(1);
}
const klantPubliek = new Function(src.slice(van, tot) + '\nreturn klantPubliek;')();

// De grens zelf uit de bron trekken in plaats van hardcoden — anders toetst
// deze test straks tegen een datum die niet meer is wat worker.js gebruikt.
const grensMatch = src.match(/const AKKOORD_TEKST_SINDS = "([^"]+)"/);
if (!grensMatch) { console.error('FOUT: AKKOORD_TEKST_SINDS-waarde niet te lezen.'); process.exit(1); }
const GRENS = grensMatch[1];
const voor = new Date(new Date(GRENS).getTime() - 60000).toISOString();   // 1 min. vóór de grens
const na = new Date(new Date(GRENS).getTime() + 60000).toISOString();    // 1 min. ná de grens

function rec(fields) { return { fields }; }

console.log('\nAkkoord-heraccordering\n');

toets('akkoord vóór de tekstcorrectie is niet actueel',
      klantPubliek(rec({ AkkoordOp: voor })).akkoordActueel === false);

toets('akkoord ná de tekstcorrectie is actueel',
      klantPubliek(rec({ AkkoordOp: na })).akkoordActueel === true);

toets('akkoord exact op de grens is actueel', // AkkoordOp >= grens
      klantPubliek(rec({ AkkoordOp: GRENS })).akkoordActueel === true);

toets('nooit een akkoord gegeven is niet actueel',
      klantPubliek(rec({})).akkoordActueel === false);

toets('een onleesbare AkkoordOp-waarde is niet actueel (geen crash)',
      klantPubliek(rec({ AkkoordOp: 'geen-datum' })).akkoordActueel === false);

// ── De sleutelafspraak: het proeftegoed blijft los van AkkoordOp ──
// StartTegoedGegeven bepaalt of er nog tokens uitgekeerd worden;
// akkoordActueel bepaalt alleen of het scherm opnieuw verschijnt. Een klant
// die vóór de correctie akkoord gaf én al tokens kreeg, moet dus
// startTegoed:true + akkoordActueel:false krijgen — heraccorderen zonder
// dat er nog eens wordt uitgekeerd.
const bestaand = klantPubliek(rec({ AkkoordOp: voor, StartTegoedGegeven: true, Saldo: 17 }));
toets('bestaande klant op de oude tekst: tegoed staat, akkoord niet actueel',
      bestaand.startTegoed === true && bestaand.akkoordActueel === false,
      JSON.stringify(bestaand));

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'alle ' + n + ' tests geslaagd') + '\n');
process.exit(fout ? 1 : 0);
