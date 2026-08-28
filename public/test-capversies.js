// ══════════════════════════════════════════════════════════════════
// test-capversies.js — de Capacitor-pakketten gaan samen op
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// android/ staat niet in de repo: de build genereert hem elke keer opnieuw
// uit het template van de Capacitor-versie in package.json. Daarmee is
// package.json het enige bestand dat bepaalt op welk Android API-niveau de
// app draait — en dus of de Play Store de bundel aanneemt.
//
// De klassieke fout bij een Capacitor-upgrade is de HALVE upgrade: @capacitor/
// core op 8 en @capacitor/android nog op 6. Dat geeft een bouwfout diep in
// Gradle die nergens naar package.json wijst, en je bent een uur kwijt. Erger
// is de stille variant: een plugin die achterblijft compileert wél, en dan
// staat er een module in je APK die met een oudere bridge is gebouwd.
//
// Deze test toetst dus niet of de versies "nieuw genoeg" zijn — dat doet de
// stap "Controleer target API-niveau" in build-apk.yml, want alleen de build
// weet wat het template meebrengt. Hier gaat het om de samenhang: alles wat
// Capacitor is, hoort dezelfde major te hebben, en de JDK in de workflow hoort
// bij die major te passen.
//
// WAAROM DIT LEESWERK MAG
// Dit is geen gedrag maar configuratie. Er valt niets te draaien: de vraag is
// letterlijk "staan er getallen in twee bestanden die bij elkaar horen". Een
// gedragstest zou een Android-build vragen en die kan de gate niet.
//
// Draaien vanuit public/:  node test-capversies.js   (exit 0 = goed)
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
const pkg = JSON.parse(fs.readFileSync(path.join(wortel, 'package.json'), 'utf8'));
const alle = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});

// Wat telt als "Capacitor-pakket": de officiële scope, plus alles wat zich als
// Capacitor-plugin aandient. Die tweede groep is waar het misgaat — de eigen
// pakketten vergeet je niet, een plugin van een derde wel.
const capNamen = Object.keys(alle).filter(n =>
  n.startsWith('@capacitor/') || n.indexOf('capacitor') >= 0);

function major(bereik) {
  const m = String(bereik).match(/(\d+)\./);
  return m ? Number(m[1]) : null;
}

console.log('\n1. Er is überhaupt een Capacitor-opzet om te toetsen');
toets('capacitor-pakketten gevonden', capNamen.length >= 4,
      'gevonden: ' + capNamen.join(', '));
toets('@capacitor/core staat erbij', !!alle['@capacitor/core']);
toets('@capacitor/android staat erbij', !!alle['@capacitor/android']);
toets('@capacitor/cli staat erbij', !!alle['@capacitor/cli']);

console.log('\n2. Alle Capacitor-pakketten delen dezelfde major');
const majors = {};
for (const n of capNamen) majors[n] = major(alle[n]);
const kern = majors['@capacitor/core'];
toets('de major van core is leesbaar', typeof kern === 'number' && kern > 0,
      JSON.stringify(alle['@capacitor/core']));
for (const n of capNamen) {
  toets(n + ' op major ' + kern, majors[n] === kern,
        'staat op ' + alle[n] + ' (major ' + majors[n] + ') terwijl @capacitor/core op ' +
        kern + ' staat — een halve upgrade bouwt of breekt op een plek die ' +
        'nergens naar package.json wijst');
}

console.log('\n3. Geen plugin die niet mee kan');
// @e-is/capacitor-bluetooth-serial is op 31-12-2024 blijven staan op 6.0.3.
// Zolang die erin zit kan de app niet mee met een nieuwe Play-eis, want het
// API-niveau komt uit het Capacitor-template en dat template beweegt met de
// major. Vervangen door de onderhouden fork @ascentio-it/… (zelfde
// plugin-naam BluetoothSerial, zelfde methodes).
toets('de doodgelopen SPP-plugin zit er niet meer in',
      !alle['@e-is/capacitor-bluetooth-serial'],
      'staat nog op ' + alle['@e-is/capacitor-bluetooth-serial'] +
      ' en die is nooit voorbij Capacitor 6 gekomen');
toets('er is wél een SPP-plugin',
      capNamen.some(n => /bluetooth-serial/.test(n)),
      'zonder SPP-plugin valt Bluetooth Classic weg en werken de gewone ' +
      'ELM327-adapters niet meer');
toets('er is een BLE-plugin',
      capNamen.some(n => /bluetooth-le/.test(n)));

console.log('\n4. De JDK in de build past bij deze Capacitor-major');
// Capacitor 8 draait op AGP 8.13 / Gradle 8.14.3 en vraagt Java 21. Blijft de
// workflow op 17 staan, dan faalt de build met een melding over class file
// versions die nergens naar deze keuze wijst. Twee bestanden die samen moeten
// bewegen: precies waar een gate voor is.
const wf = fs.readFileSync(path.join(wortel, '.github/workflows/build-apk.yml'), 'utf8');
const mJava = wf.match(/java-version:\s*'(\d+)'/);
toets('java-version staat in de workflow', !!mJava);
if (mJava) {
  const java = Number(mJava[1]);
  const nodig = kern >= 8 ? 21 : 17;
  toets('Java ' + java + ' is genoeg voor Capacitor ' + kern, java >= nodig,
        'Capacitor ' + kern + ' vraagt Java ' + nodig + ', de workflow zet ' + java);
}

console.log('\n5. De Play-grens staat als één getal in de workflow');
// Niet om het getal te beoordelen — dat doet de build, die het template kan
// lezen. Wel om te voorkomen dat de controle zelf ooit stilletjes verdwijnt.
const mEis = wf.match(/PLAY_MIN_TARGET_SDK:\s*(\d+)/);
toets('PLAY_MIN_TARGET_SDK staat er', !!mEis,
      'zonder dat getal controleert de build het API-niveau niet meer en ' +
      'merk je een te lage targetSdk pas bij de upload naar Play');
toets('de build gebruikt het ook echt',
      /PLAY_MIN_TARGET_SDK/.test(wf.split('env:')[1] || '') &&
      (wf.match(/PLAY_MIN_TARGET_SDK/g) || []).length >= 2,
      'het getal staat er wel maar wordt nergens gelezen');
toets('er wordt gecontroleerd, niet geïnjecteerd',
      !/targetSdkVersion\s*=\s*\d+/.test(wf),
      'de workflow schrijft targetSdkVersion zelf — dan staat het getal op ' +
      'twee plekken en is bij de volgende verhoging niet te zien welke wint');

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
