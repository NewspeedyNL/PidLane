// ══════════════════════════════════════════════════════════════════
// test-icoonpad.js — start een gewijzigd icoon ook echt een build?
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// In build-apk.yml staan twee lijsten die over hetzelfde gaan:
//
//   1. de `paths:`-trigger  — waarop start er een build?
//   2. de `ls`-zoeklijst in de stap "App-icoon" — waar wordt het logo gehaald?
//
// Tot 03-09-2026 liepen die uit de pas. De trigger noemde alleen
// `icon-512.png` (de wortel van de repo), terwijl het bestand in `public/`
// staat. De zoeklijst vond hem daar wél, dus de build klopte — maar een
// gewijzigd icoon startte geen build.
//
// Dat is de vervelendste soort: je ziet een groene historie, de APK draait,
// en niets meldt dat het logo van vorige maand er nog in zit. Je merkt het
// pas als iemand naar het icoon op zijn telefoon kijkt.
//
// Dit is exact de vorm waar deze repo al drie keer op is stukgelopen (§11:
// PIDLANE-WERK.md, de banner boven blok 5, de reviewnotitie in twee
// bestanden): twee lijsten van hetzelfde, en niets dat ze koppelt.
//
// WAAROM DIT LEESWERK MAG
// Er valt niets te draaien. De vraag is of de ene lijst de andere dekt; een
// gedragstest zou een Android-build plus een gewijzigd icoon vragen, en dat
// kan de gate niet.
//
// Draaien vanuit public/:  node test-icoonpad.js   (exit 0 = goed)
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
const wf = fs.readFileSync(path.join(wortel, '.github/workflows/build-apk.yml'), 'utf8');

console.log('\n1. De twee lijsten zijn er om te vergelijken');

// De paths-trigger: alles tussen "paths:" en de volgende regel die geen
// lijstitem of commentaar is.
const mPaths = wf.match(/^\s*paths:\s*\n((?:\s*(?:#[^\n]*|-\s*'[^']*')\s*\n)+)/m);
toets('de paths-trigger is te vinden', !!mPaths,
      'hernoemd of weggehaald uit build-apk.yml — dan bouwt hij op iets anders dan hier staat');

const trigger = mPaths ? (mPaths[1].match(/-\s*'([^']*)'/g) || []).map(s => s.replace(/-\s*'|'/g, '')) : [];
toets('er staan paden in de trigger', trigger.length >= 3, 'gevonden: ' + trigger.join(', '));

// De zoeklijst uit de icoonstap: ICON=$(ls a b c 2>/dev/null | head -1)
const mLs = wf.match(/ICON=\$\(ls\s+([^)]*?)\s*2>\/dev\/null/);
toets('de zoeklijst van de icoonstap is te vinden', !!mLs,
      'is de stap "App-icoon" herschreven? dan klopt deze toets niet meer');

const zoek = mLs ? mLs[1].trim().split(/\s+/) : [];
toets('er staan kandidaten in de zoeklijst', zoek.length >= 1, 'gevonden: ' + zoek.join(', '));

console.log('\n2. Elk bestand dat als icoon gebruikt kán worden, start ook een build');

// De kern. Staat een kandidaat NIET in de trigger, dan kan precies dát
// bestand veranderen zonder dat er iets gebeurt.
for (const kand of zoek) {
  toets('"' + kand + '" staat in de paths-trigger', trigger.indexOf(kand) >= 0,
        'wijzig je dit bestand, dan start er geen build en houdt de APK het oude icoon');
}

console.log('\n3. Het icoon dat nu gebruikt wordt, bestaat ook echt');

// Welke kandidaat wint is `ls ... | head -1`: de eerste die bestaat, in de
// volgorde waarin ze staan. Dat is wat de build pakt.
const aanwezig = zoek.filter(k => fs.existsSync(path.join(wortel, k)));
toets('minstens één kandidaat bestaat in de repo', aanwezig.length >= 1,
      'dan valt de build terug op de nagetekende SVG, en dat is niet het echte logo');
if (aanwezig.length) {
  console.log('      de build pakt: ' + aanwezig[0]);
  const p = path.join(wortel, aanwezig[0]);
  const d = fs.readFileSync(p);
  // PNG-kop: 8 bytes signature, dan IHDR met breedte/hoogte op offset 16.
  const isPng = d.length > 24 && d[0] === 0x89 && d.toString('ascii', 1, 4) === 'PNG';
  toets(aanwezig[0] + ' is een echte PNG', isPng);
  if (isPng) {
    const b = d.readUInt32BE(16), h = d.readUInt32BE(20);
    // De grootste Android-mipmap is 432px; onder de 432 wordt het icoon
    // opgeschaald en dat zie je op een moderne telefoon meteen.
    toets('het icoon is minstens 432px (' + b + '×' + h + ')', b >= 432 && h >= 432,
          'kleiner wordt opgeschaald naar de grootste mipmap en oogt wazig');
    toets('het icoon is vierkant', b === h, b + '×' + h);
  }
}

console.log('');
if (fouten) { console.log('test-icoonpad: ' + fouten + ' fout(en)'); process.exit(1); }
console.log('test-icoonpad: alles goed');
