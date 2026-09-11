// ══════════════════════════════════════════════════════════════════
// test-privacydekking.js — noemt de privacyverklaring elke permissie
// die de build in het manifest zet?
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// Gemeten op 11-09-2026: `build-apk.yml` zette `android.permission.CAMERA`
// in het samengevoegde manifest, en `public/privacy.html` noemde het woord
// "camera" nul keer. Play leest die pagina bij de beoordeling; een permissie
// die in de bundel zit en niet in de verklaring staat, is precies de vorm
// waarop een inzending wordt afgekeurd.
//
// Dat gat kon ontstaan omdat de twee kanten los van elkaar groeiden. Het
// manifest wordt door een workflow-stap samengesteld, de verklaring met de
// hand geschreven, en niets koppelde ze. Dezelfde vorm als §11 al drie keer
// beschrijft: twee lijsten van hetzelfde, geen brug ertussen.
//
// De brug is de tabel hieronder. Die zegt per permissie welk woord er in de
// verklaring moet staan. En — dit is de helft die het waard maakt — een
// permissie die de workflow injecteert maar die híér niet in staat is óók
// fout. Anders dekt deze test alleen wat er vandaag is, en glipt de volgende
// toevoeging er net zo stil door als CAMERA deed.
//
// WAAROM DIT LEESWERK MAG
// Er valt niets te draaien: de vraag is of de ene tekst de andere dekt. Een
// gedragstest zou een Android-build plus een Play-beoordeling vragen.
//
// Draaien vanuit public/:  node test-privacydekking.js   (exit 0 = goed)
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
const yml = fs.readFileSync(path.join(wortel, '.github/workflows/build-apk.yml'), 'utf8');
const privacy = fs.readFileSync(path.join(__dirname, 'privacy.html'), 'utf8');
const laag = privacy.toLowerCase();

// Per permissie: welk woord moet de gebruiker in de verklaring kunnen vinden?
// Niet de permissienaam zelf — die zegt een lezer niets. Het gaat om het
// woord waarmee hij de alinea herkent die erover gaat.
const DEKKING = {
  BLUETOOTH:                          ['bluetooth'],
  BLUETOOTH_ADMIN:                    ['bluetooth'],
  BLUETOOTH_SCAN:                     ['bluetooth'],
  BLUETOOTH_CONNECT:                  ['bluetooth'],
  ACCESS_FINE_LOCATION:               ['locatie'],
  ACCESS_COARSE_LOCATION:             ['locatie'],
  CAMERA:                             ['camera'],
  INTERNET:                           ['server', 'verstuurd', 'verzonden'],
  FOREGROUND_SERVICE:                 ['achtergrond'],
  FOREGROUND_SERVICE_CONNECTED_DEVICE:['achtergrond'],
  POST_NOTIFICATIONS:                 ['melding'],
  WAKE_LOCK:                          ['wakker', 'slaapstand', 'scherm uit']
};

// Wat zet de workflow er werkelijk in? Uit de bron lezen, niet overschrijven:
// een lijst die met de hand bijgehouden wordt is de fout die deze test juist
// moet vangen.
const gevonden = new Set(
  (yml.match(/android\.permission\.([A-Z_]+)/g) || [])
    .map(s => s.replace('android.permission.', ''))
);

// De regex hierboven vindt ook de opruim-regex in de workflow zelf. Die
// noemt geen permissienaam, dus er blijft over wat er geïnjecteerd wordt.
toets('de workflow injecteert permissies (' + gevonden.size + ' stuks)',
      gevonden.size >= 8,
      'gevonden: ' + [...gevonden].join(', ') + ' — staat de injectiestap er nog?');

for (const perm of [...gevonden].sort()) {
  const woorden = DEKKING[perm];
  if (!woorden) {
    toets(perm + ' staat in de dekkingstabel', false,
          'nieuwe permissie in het manifest; zet erbij welk woord in privacy.html '
          + 'de gebruiker moet kunnen vinden, en schrijf die alinea');
    continue;
  }
  const raak = woorden.filter(w => laag.indexOf(w) >= 0);
  toets('privacy.html noemt ' + perm + ' (zoekt: ' + woorden.join(' / ') + ')',
        raak.length > 0,
        'geen van die woorden staat in de verklaring — de permissie zit wél in de bundel');
}

// Andersom: staat er een permissie in de tabel die de workflow niet meer
// zet, dan is de tabel oud. Dat is geen afkeurrisico, maar het maakt de
// dekking hierboven zwakker dan hij lijkt.
for (const perm of Object.keys(DEKKING)) {
  if (!gevonden.has(perm)) {
    toets('de dekkingstabel kent geen permissie die de build niet meer zet (' + perm + ')',
          false, 'weggehaald uit build-apk.yml? Haal hem dan hier ook weg');
  }
}

console.log('');
if (fouten) { console.log('test-privacydekking: ' + fouten + ' fout(en)'); process.exit(1); }
console.log('test-privacydekking: alles goed');
