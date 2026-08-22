// ══════════════════════════════════════════════════════════════════
// test-geen-gps.js — blijft de app locatievrij?
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Op 21-08-2026 is alle locatiefunctionaliteit verwijderd: pidlane-gps.js is
// weg en de bulk-recorder neemt geen positie meer op. Dat was geen esthetische
// keuze maar een Play Store-keuze, en er hangen drie verklaringen aan vast die
// samen moeten blijven kloppen:
//
//   1. de Data safety-form zegt dat er geen locatie wordt verzameld
//   2. privacy.html en het disclosurescherm zeggen hetzelfde tegen de gebruiker
//   3. het manifest voert ACCESS_FINE_LOCATION alleen als legacy-BT-permissie,
//      met maxSdkVersion=30
//
// Eén regel `navigator.geolocation` die er ooit weer in sluipt maakt alle drie
// onwaar. Dat merk je niet in de app — het is een lege catch — maar wel in een
// reviewmail, en dan ligt de hele inzending stil.
//
// Draaien vanuit public/:  node test-geen-gps.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
let fout = 0;

function toets(naam, ok, detail) {
  if (ok) { console.log('  ok    ' + naam); return; }
  console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : ''));
  fout++;
}

console.log('Locatievrij\n');

// Commentaar telt niet mee: pidlane-bulk.js legt in zijn kop uit wat er
// verwijderd is en noemt daarbij navigator.geolocation. Dat is documentatie,
// geen aanroep. Zonder deze stap slaat de test aan op zijn eigen uitleg.
function code(pad) {
  return fs.readFileSync(pad, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const modules = fs.readdirSync('.').filter(function (f) {
  return /^pidlane-.*\.js$/.test(f);
});

const zondaars = modules.filter(function (f) {
  return /navigator\s*\.\s*geolocation|watchPosition|getCurrentPosition/.test(code(f));
});
toets('geen enkele module leest de locatie', zondaars.length === 0,
  zondaars.join(', ') + ' — dat maakt de Data safety-verklaring onwaar');

toets('pidlane-gps.js bestaat niet meer', !fs.existsSync('pidlane-gps.js'));

const index = fs.readFileSync('index.html', 'utf8');
toets('index.html laadt geen gps-module', !/pidlane-gps\.js/.test(index));

// ── de verklaringen ──
const priv = fs.readFileSync('privacy.html', 'utf8');
toets('privacy.html noemt geen locatie als verzameld gegeven',
  !/<td>Locatie/i.test(priv),
  'de datatabel zou dan iets beloven wat de app niet meer doet');
toets('privacy.html zegt expliciet dat er geen locatie wordt bepaald',
  /Geen locatiebepaling/i.test(priv));

const disc = fs.readFileSync('pidlane-privacy.js', 'utf8');
toets('het disclosurescherm zegt hetzelfde',
  /Geen locatiebepaling/.test(disc));

// ── het manifest, via de workflow die het injecteert ──
const wf = fs.readFileSync('../.github/workflows/build-apk.yml', 'utf8');
const locRegels = (wf.match(/uses-permission[^\n]*ACCESS_(FINE|COARSE)_LOCATION[^\n]*/g) || [])
  .filter(function (r) { return r.indexOf('android:name') > -1; });
toets('locatiepermissie staat alleen met maxSdkVersion=30 in het manifest',
  locRegels.every(function (r) { return /maxSdkVersion=\\?"30\\?"/.test(r); }),
  'zonder die grens is het een sensitive permission met eigen disclosure');
toets('de CI controleert dat zelf ook',
  /maxSdkVersion="30" not in/.test(wf) || /ACCESS_FINE_LOCATION[\s\S]{0,400}sensitive permission/.test(wf),
  'anders merkt niemand het als een plugin de permissie ongemerkt verruimt');
toets('achtergrondlocatie blijft verboden',
  /ACCESS_BACKGROUND_LOCATION/.test(wf) && /verboden/.test(wf));
console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
