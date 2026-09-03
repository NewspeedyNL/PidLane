// ══════════════════════════════════════════════════════════════════
// test-apkpad.js — komt de gebouwde APK aan waar hij opgehaald wordt?
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT — gemeten op 03-09-2026
// Er waren twee kanten die over dezelfde APK gingen en elkaar niet kenden:
//
//   build-apk.yml   zette de APK in de ARTEFACTEN van de workflow-run
//   worker.js       serveerde /download/pidlane.apk uit R2, sleutel
//                   `apk/pidlane.apk`
//
// Niets verbond die twee. Wie de app installeerde kreeg dus wat er ooit met
// de hand in R2 was gezet, en dat kon maanden oud zijn.
//
// Hoe dat eruitzag toen het misging: build #424 draaide om 14:37 volledig
// door — ondertekend, met de nieuwe foutpagina erin. Om 18:45 toonde het
// toestel nog de kale WebView-fout. Niet omdat die pagina stuk was, maar
// omdat er geen weg bestond waarlangs die APK op een telefoon kwam. Een
// groene buildhistorie naast een oude app, en niets dat klaagde.
//
// Sinds die dag publiceert de workflow naar R2. Deze test bewaakt de
// koppeling, want de sleutel staat nu op twee plekken — en dat is de vorm
// waar deze repo al vier keer op is stukgelopen (§11).
//
// WAT HIJ OOK BEWAAKT, EN DAT IS EEN VEILIGHEIDSPUNT
// Publiceren mag alleen vanaf `main`. Zou een branch-build in R2 landen, dan
// wordt ongetoetste code "de app" die iedereen downloadt — zonder PR, zonder
// gate, zonder dat iemand het ziet.
//
// WAAROM DIT LEESWERK MAG
// Er valt niets te draaien: de vraag is of twee bestanden dezelfde sleutel
// noemen. Een gedragstest zou een echte R2-bucket en een Cloudflare-token
// vragen, en die horen niet in de gate.
//
// Draaien vanuit public/:  node test-apkpad.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const wortel = path.join(__dirname, '..');
const wf       = fs.readFileSync(path.join(wortel, '.github/workflows/build-apk.yml'), 'utf8');
const worker   = fs.readFileSync(path.join(wortel, 'worker.js'), 'utf8');
const wrangler = fs.readFileSync(path.join(wortel, 'wrangler.toml'), 'utf8');

console.log('\n1. De publicatiestap bestaat en is te lezen');

const iStap = wf.indexOf('Publiceer de APK naar R2');
toets('de stap "Publiceer de APK naar R2" staat in de workflow', iStap >= 0,
      'zonder die stap komt een nieuwe build nooit bij een gebruiker');

// Alleen het stuk ván die stap bekijken, niet de rest van het bestand.
const stap = iStap >= 0 ? wf.slice(iStap) : '';

console.log('\n2. Publiceren mag alleen vanaf main');

// De if-regel hoort binnen de eerste regels van de stap te staan. Verder
// zoeken zou de conditie van een volgende stap kunnen oppikken.
const kop = stap.split('\n').slice(0, 6).join('\n');
toets('de stap is afgeschermd met een main-conditie',
      /if:\s*github\.ref\s*==\s*'refs\/heads\/main'/.test(kop),
      'zonder dat wordt een branch-build de publieke download — ongetoetste code als "de app"');

console.log('\n3. De sleutels die de build schrijft, zijn die de Worker leest');

// Wat de workflow wegschrijft: de aanroepen van de helper zet "<sleutel>".
const geschreven = [...stap.matchAll(/zet\s+"([^"]+)"/g)].map(m => m[1]);
toets('de workflow schrijft minstens één object weg', geschreven.length >= 1,
      'gevonden: ' + (geschreven.join(', ') || 'niets'));

// Wat de Worker ophaalt uit R2.
const gelezen = [...worker.matchAll(/FILES\.get\("([^"]+)"\)/g)].map(m => m[1]);
toets('de Worker leest minstens één object uit R2', gelezen.length >= 1,
      'gevonden: ' + (gelezen.join(', ') || 'niets'));

for (const sleutel of gelezen) {
  toets('"' + sleutel + '" wordt door de build geschreven', geschreven.indexOf(sleutel) >= 0,
        'de Worker haalt dit op, maar niets zet het er neer — die route serveert dan iets ouds of een 404');
}

console.log('\n4. De bucket is dezelfde als die de Worker gebruikt');

const mBucket = wrangler.match(/bucket_name\s*=\s*"([^"]+)"/);
toets('wrangler.toml noemt een bucket', !!mBucket, 'geen bucket_name gevonden');
if (mBucket) {
  const mWfBucket = stap.match(/BUCKET=([A-Za-z0-9._-]+)/);
  toets('de workflow gebruikt diezelfde bucket',
        !!mWfBucket && mWfBucket[1] === mBucket[1],
        'wrangler.toml: ' + mBucket[1] + ' — workflow: ' + (mWfBucket ? mWfBucket[1] : 'niet gevonden'));
}

console.log('\n5. De upload controleert zichzelf');

// Een upload die "ok" meldt maar niets deed, is precies de fout die dit
// project al eerder betrapte (Gradle dat stil doortekent met een lege
// signingConfig). Vandaar: terughalen en de checksum vergelijken.
toets('de stap leest het object terug', /r2 object get/.test(stap),
      'anders vertrouw je op de melding van het gereedschap in plaats van op de bucket');
toets('en vergelijkt een checksum', /sha256sum/.test(stap) && /exit 1/.test(stap),
      'terughalen zonder vergelijken bewijst alleen dat er íéts staat');

console.log('\n6. Zonder secret slaat hij over, maar niet stilletjes');

toets('een ontbrekend secret geeft een zichtbare waarschuwing',
      /::warning/.test(stap),
      'stil overslaan laat je in de waan dat de download bijgewerkt is');
toets('en de build valt daar niet op om', /exit 0/.test(stap),
      'de dagelijkse APK mag niet stukgaan omdat de publicatieroute nog niet af is');

console.log('');
if (fouten) { console.log('test-apkpad: ' + fouten + ' fout(en)'); process.exit(1); }
console.log('test-apkpad: alles goed');
