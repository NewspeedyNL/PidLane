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

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
