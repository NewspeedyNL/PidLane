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
//
// HIER STOND EEN TOETS DIE NIETS MAT, en dat is de reden dat dit stuk er nu
// anders uitziet. De oude vorm was:
//
//   locRegels.every(r => /maxSdkVersion="30"/.test(r))
//
// De workflow injecteerde de twee locatieregels helemaal niet, dus locRegels
// was leeg, en `[].every(...)` is `true`. Deze toets stond groen op nul regels
// terwijl de bundel de permissie ongegrensd meekreeg — de plugins brengen hem
// zelf mee. Zie PIDLANE.md §11.
//
// De les is algemener dan deze regel: een toets die over een verzameling loopt
// moet eerst eisen dát die verzameling gevuld is. Anders meet hij de
// afwezigheid van bewijs en noemt dat bewijs van afwezigheid.
const wf = fs.readFileSync('../.github/workflows/build-apk.yml', 'utf8');

function locatieregels(tekst) {
  return (tekst.match(/uses-permission[^\n]*ACCESS_(FINE|COARSE)_LOCATION[^\n]*/g) || [])
    .filter(function (r) { return r.indexOf('android:name') > -1; });
}
function locatieOk(tekst) {
  const r = locatieregels(tekst);
  return r.length === 2 && r.every(function (x) { return /maxSdkVersion="30"/.test(x); });
}

toets('de workflow injecteert BEIDE locatieregels, met maxSdkVersion=30',
  locatieOk(wf),
  'gevonden: ' + locatieregels(wf).length + ' regel(s). De BT-plugins declareren ' +
  'ACCESS_FINE_LOCATION en ACCESS_COARSE_LOCATION zonder grens; noemt het ' +
  'app-manifest ze niet, dan wint die ongegrensde variant bij de merge');

// TEGENPROEF — haal de twee regels weg en de toets hierboven hoort rood te
// worden. Zonder dit is `locatieOk` een gebaar: precies de fout die hier stond.
toets('en zonder die regels zou hij rood worden (tegenproef)',
  !locatieOk(wf.replace(/\n\s*'\\n    <uses-permission android:name="android\.permission\.ACCESS_(FINE|COARSE)_LOCATION"[^\n]*'/g, '')),
  'de toets liet een workflow zonder locatieregels erdoor — dan meet hij niets');

// ── en de controle die telt: op het SAMENGEVOEGDE manifest ──
// Het app-manifest is de invoer van de merge. Wat de plugins meebrengen staat
// er niet in, dus een controle die daar zoekt kan per definitie niet vinden
// wat er via manifest-merge binnenkomt. De poort hoort na de build te staan,
// op het manifest dat in de .aab zit.
toets('de CI leest het samengevoegde manifest, niet het app-manifest',
  /merged_manifests/.test(wf) && /Controleer het samengevoegde manifest/.test(wf),
  'anders kijkt de controle langs alles wat een plugin meebrengt');
toets('die controle eist dat de locatiepermissie er is en begrensd is',
  /staat niet in het samengevoegde manifest/.test(wf) &&
  /maxSdkVersion="30"' not in k/.test(wf),
  'ontbreekt de eis dát hij er staat, dan staat de controle weer groen op nul regels');
toets('achtergrondlocatie blijft verboden',
  /ACCESS_BACKGROUND_LOCATION/.test(wf) && /verboden/.test(wf));
console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
