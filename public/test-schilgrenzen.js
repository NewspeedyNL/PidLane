// ══════════════════════════════════════════════════════════════════
// test-schilgrenzen.js — wat er niet in de Play-schil mag staan
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT — gemeten op 10-09-2026
// §16a van PLAY-INZENDING.md beloofde dat test-playteksten.js twee dingen
// bewaakte: "Geen koopknop in de app, geen APK-distributie in de app". Dat
// bestand toetst tekenlimieten, URL's, anonimisering, versienummer,
// wachtwoorden, release notes en taalblokken — koopknop noch APK komt erin
// voor. Er stond dus een vinkje onder "blijft vanzelf waar" boven iets wat
// niemand nakeek, en dat is precies wat §16b zelf erger noemt dan geen vinkje.
//
// Dit bestand maakt die regel waar. Twee grenzen, allebei van de Play-schil:
//
//   1. BETALEN BUITEN PLAY OM. De Tikkie-links komen uit de Config-tabel in
//      Airtable. Wie die tabel vult, kon de knop "N tokens kopen — €X" laten
//      verschijnen in dezelfde app die Play beoordeeld heeft — zonder commit,
//      zonder gate, zonder build. Tokens zijn digitale content die in de app
//      verbruikt wordt, en dat is het terrein van Google's betaalregels.
//      _betaallink() geeft in de schil daarom niets terug, wat er ook in de
//      tabel staat. In de browser blijft de link werken: die versie wordt niet
//      door Play gedistribueerd.
//
//   2. EEN APK-DOWNLOAD IN DE APP. De schil laadt app.pidlane.nl live, dus
//      alles wat op die site staat zit in de Play-app. De Worker serveert
//      /download/pidlane.apk voor wie hem naast Play om installeert; wijst er
//      ooit iets in de app naar, dan distribueert een Play-app een APK.
//
// Draaien vanuit public/:  node test-schilgrenzen.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok   ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

console.log('\nSchilgrenzen');

// ══ 1. De betaallink komt niet door de schil ══════════════════════
// De echte functie inlezen, geen kopie: een test met een eigen kopie van deze
// logica kan per definitie niet rood worden als de app verandert.
const bron = fs.readFileSync(__dirname + '/pidlane-klant.js', 'utf8');
const van = bron.indexOf('function _betaallink(');
if (van < 0) {
  console.error('FOUT: _betaallink() niet gevonden in pidlane-klant.js.');
  process.exit(1);
}
const tot = bron.indexOf('\n  }', van) + 4;
const maak = new Function('window', 'console', bron.slice(van, tot) + '\nreturn _betaallink;');

const STIL = { warn: function () {}, log: function () {} };
const LINK = 'https://tikkie.me/pay/vtvn3r3neuqj16r3429n';

function vraag(sleutel, cap) {
  const w = { PID_CONFIG: { tikkie_kopen: LINK, tikkie_donatie: LINK } };
  if (cap !== undefined) w.Capacitor = cap;
  return maak(w, STIL)(sleutel);
}

console.log('\n1. In de Play-schil komt er geen betaallink uit');
const schil = { isNativePlatform: function () { return true; } };
toets('koopknop: leeg in de schil', vraag('tikkie_kopen', schil) === '');
toets('donatie: leeg in de schil', vraag('tikkie_donatie', schil) === '',
  'de grens zit op de plek waar de link binnenkomt, dus hij geldt voor beide');

console.log('\n2. En in de browser blijft hij werken — anders meet deze toets niets');
// Dit is de tegenproef bij 1. Zou _betaallink() altijd leeg teruggeven, dan
// stonden de regels hierboven groen zonder dat de schilgrens iets doet.
toets('geen Capacitor: link komt door', vraag('tikkie_kopen', undefined) === LINK);
toets('Capacitor aanwezig maar niet native: link komt door',
  vraag('tikkie_kopen', { isNativePlatform: function () { return false; } }) === LINK,
  'de telefoonbrowser laadt capacitor.js niet, maar een desktopschil kan hem wel hebben');

console.log('\n3. Bij twijfel dicht');
toets('isNativePlatform gooit: leeg',
  vraag('tikkie_kopen', { isNativePlatform: function () { throw new Error('kapot'); } }) === '',
  'een knop die ten onrechte wegblijft kost een mailtje, andersom kost het de inzending');

// ══ 2. Geen APK-download in de app ════════════════════════════════
console.log('\n4. Niets in de app wijst naar een APK');

// Wat een gebruiker in de WebView kan bereiken. worker.js hoort er NIET bij:
// die mag /download/pidlane.apk blijven serveren voor wie naast Play om
// installeert — de grens is dat de app er niet naartoe wijst.
const appBestanden = ['index.html', 'privacy.html', 'verwijderen.html']
  .concat(fs.readdirSync(__dirname).filter(function (f) {
    return /^pidlane-.*\.js$/.test(f);
  }));

function apkVerwijzingen(tekst) {
  return (tekst.match(/[^\s"'<>()]*(?:\.apk\b|\/download\/[^\s"'<>()]*)/g) || []);
}

let apkFout = 0;
appBestanden.forEach(function (f) {
  const gevonden = apkVerwijzingen(fs.readFileSync(__dirname + '/' + f, 'utf8'));
  if (gevonden.length) {
    console.log('  FOUT ' + f + ' wijst naar ' + gevonden.join(', '));
    apkFout++; fouten++;
  }
});
toets('geen van de ' + appBestanden.length + ' app-bestanden wijst naar een APK', apkFout === 0,
  'een Play-app die een APK aanbiedt is distributie buiten Play om');

// Tegenproef: zonder deze regel is de scan hierboven een gebaar. Hij hoort de
// verwijzing te vinden die er nu niet is.
toets('en een echte verwijzing zou hij zien (tegenproef)',
  apkVerwijzingen('<a href="/download/pidlane.apk">Download de app</a>').length > 0);
toets('ook een kale bestandsnaam (tegenproef)',
  apkVerwijzingen("window.open('pidlane.apk')").length > 0);
toets('en gewone tekst over downloaden niet (tegenproef)',
  apkVerwijzingen('// deel/download-knoppen tonen').length === 0,
  'anders wordt hij weggeklikt als ruis en bewaakt hij niets meer');

console.log('');
if (fouten) { console.log('test-schilgrenzen: ' + fouten + ' fout(en)'); process.exit(1); }
console.log('test-schilgrenzen: alles goed');
