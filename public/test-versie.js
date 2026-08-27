// ══════════════════════════════════════════════════════════════════
// test-versie.js — staat overal hetzelfde versienummer?
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Het versienummer staat op twee plaatsen, en die liepen uit elkaar:
//
//   package.json    "version": "2.1.0"    ← hier haalt de CI versionName uit
//   public/config.js APP_VERSION '2.9.0'  ← dit ziet de gebruiker en dit gaat
//                                           mee in elk log en elk rapport
//
// Acht minor-versies verschil. Voor de Play Store is package.json de waarheid,
// dus een gebruiker die "3.0.0" in het loginscherm ziet had een APK met
// versionName 2.1.0 op zijn toestel. Bij een bugmelding zoek je dan naar de
// verkeerde build.
//
// versionCode is iets anders en hoort NIET gelijk te zijn: dat is het
// buildnummer (github.run_number) en dat moet bij elke inzending oplopen,
// ongeacht of het versienummer verandert. Play weigert een upload met een
// gelijke of lagere versionCode zonder nuttige melding.
//
// Draaien vanuit public/:  node test-versie.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('../package.json', 'utf8'));
const cfg = fs.readFileSync('config.js', 'utf8');
const wf = fs.readFileSync('../.github/workflows/build-apk.yml', 'utf8');
let fout = 0;

function toets(naam, ok, detail) {
  if (ok) { console.log('  ok    ' + naam); return; }
  console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : ''));
  fout++;
}

console.log('Versienummers\n');

const m = cfg.match(/const APP_VERSION\s*=\s*'([^']+)'/);
toets('APP_VERSION staat in config.js', !!m);

if (m) {
  const app = m[1];
  const npm = pkg.version;
  toets('package.json en config.js zijn gelijk', app === npm,
    'package.json ' + npm + ' tegen APP_VERSION ' + app +
    ' — de CI zet versionName uit package.json, dus de APK zou ' + npm + ' heten');
  toets('het nummer is semver', /^\d+\.\d+\.\d+$/.test(app),
    'Play verwacht een versionName in de vorm x.y.z');
  console.log('        → versie ' + app);
}

// De CI moet versionName uit package.json halen en versionCode uit het
// buildnummer. Verandert dat, dan klopt de bewaking hierboven niet meer.
toets('CI leest versionName uit package.json',
  /require\('\.\/package\.json'\)\.version/.test(wf));
toets('CI zet versionCode op het buildnummer',
  /VC=\$\{\{ github\.run_number \}\}/.test(wf),
  'een handmatige versionCode die niet oploopt wordt door Play geweigerd');
toets('CI controleert de twee versies tegen elkaar',
  /APP_VERSION/.test(wf),
  'zonder die stap merkt de build het niet als config.js achterloopt');

// ── geen versienummer dat losstaat van APP_VERSION ──
// Op 21-08 stonden er drie terugvallen op '2.1' verspreid door de app: in de
// HTML van het loginscherm, in het scriptje dat die HTML overschrijft, en in
// de Airtable-melding van pidlane-auth.js. Alle drie uit de tijd dat
// package.json daadwerkelijk 2.1.0 zei. Zo'n terugval is erger dan geen
// waarde: hij ziet er geldig uit, dus niemand controleert hem, en bij een
// bugmelding zoek je in een build die nooit heeft bestaan.
const fs2 = require('fs');
const bestanden = fs2.readdirSync('.').filter(function (f) {
  return /^(pidlane-.*\.js|index\.html)$/.test(f);
});
const hard = [];
bestanden.forEach(function (f) {
  const t = fs2.readFileSync(f, 'utf8');
  // Alleen terugvallen die aan APP_VERSION hangen. De ELM327-aanduiding
  // "v1.5 / v2.1 en klonen" in pidlane-start.js is een adapterversie en heeft
  // hier niets mee te maken — die mag blijven staan.
  const m = t.match(/APP_VERSION[^;\n]{0,40}:\s*'[\d.]+'/g);
  if (m) hard.push(f + ' → ' + m.join(', '));
});
toets('geen hardcoded versie als terugval op APP_VERSION', hard.length === 0,
  hard.join('; ') + " — gebruik '?' zodat een ontbrekende config opvalt");

// ── de buildregel op het inlogscherm (27-08-2026) ──
// Op 26-08 ging een hele rit verloren omdat het toestel testrun 4.8 draaide
// terwijl 4.9 al op main stond. Dat was op het inlogscherm niet te zien, en de
// testrun zelf zit achter isAdmin(). Sindsdien staat de testrunversie plus een
// build-stempel onder de productregel.
//
// Elk van de drie schakels hieronder faalt STIL als hij wegvalt: dan staat er
// gewoon niets, precies zoals nu. Daarom worden ze hier alle drie vastgepind.
const tr = fs2.readFileSync('pidlane-testrun.js', 'utf8');
const idx = fs2.readFileSync('index.html', 'utf8');

toets('TESTRUN_VERSIE wordt geëxporteerd naar window',
  /window\.TESTRUN_VERSIE\s*=/.test(tr),
  'zonder export staat de testrunversie niet op het inlogscherm en valt dat niet op');

toets('het inlogscherm heeft een plek voor de buildregel',
  /id="loginBuild"/.test(idx),
  '#loginBuild ontbreekt — plVersieRegel() schrijft dan nergens naartoe');

toets('plVersieRegel() bestaat en wordt gestart',
  /window\.plVersieRegel\s*=/.test(idx) && /plVersieRegel\(\)/.test(idx),
  'de functie moet bestaan én aangeroepen worden, anders blijft de regel leeg');

// Zelfde principe als hierboven: liever niets dan een verzonnen stempel. Een
// vast ingetypte datum ziet er geldig uit en veroudert onzichtbaar.
const buildBlok = (idx.match(/window\.plVersieRegel[\s\S]*?\n\};/) || [''])[0];
toets('de buildregel verzint geen datum als terugval',
  !/build\s*'?\s*\+?\s*'[0-9]{2}-[0-9]{2}/.test(buildBlok),
  'er staat een vaste datum in de buildregel — die veroudert zonder dat iemand het ziet');

// APP_VERSION en TESTRUN_VERSIE horen NIET gelijk te zijn: de eerste voedt de
// Play Store en de update-check, de tweede volgt de batches. Wel moet de
// testrunversie de vorm hebben die de inlogregel verwacht (cijfers vooraan,
// want daar wordt op gesplitst).
const tv = tr.match(/const TESTRUN_VERSIE\s*=\s*'([^']+)'/);
toets('TESTRUN_VERSIE staat in pidlane-testrun.js', !!tv);
if (tv) {
  toets('TESTRUN_VERSIE begint met een nummer',
    /^\d+\.\d+/.test(tv[1]),
    'de inlogregel splitst op de eerste spatie: "' + tv[1] + '" geeft dan rommel');
  console.log('        → testrun ' + tv[1].split(' ')[0]);
}

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
