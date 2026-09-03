// ══════════════════════════════════════════════════════════════════
// test-foutpagina.js — de schil heeft een eigen scherm als de app niet laadt
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// De APK is een schil om app.pidlane.nl: capacitor.config.json zet
// server.url, en alles wat je ziet komt van die URL. Komt die URL niet, dan
// toont de Android-WebView zijn eigen foutpagina — een wit vlak met
// "net::ERR_NAME_NOT_RESOLVED". Dat is niet "geen internet", dat leest als
// een kapotte app.
//
// Capacitor heeft daar server.errorPath voor: een bestand IN de webDir dat
// de schil laadt zodra de hoofdpagina niet komt. Dat werkt alleen als het
// bestand er ook echt in zit, en daar zit het gat: de naam staat in
// capacitor.config.json, het bestand wordt gemaakt door build-apk.yml. Twee
// plekken. Loopt er één uit de pas, dan bouwt de workflow gewoon door en
// wijst errorPath naar niets — je merkt het pas op een toestel zonder
// netwerk, en dat is precies het toestel waarop je het niet meer nakijkt.
//
// De tweede fout die deze test vangt is subtieler en heeft hier al eens
// geld gekost in een ander bestand: een pagina die zelf iets van het net
// nodig heeft. Een foutpagina die een lettertype of stylesheet ophaalt,
// laadt niet op het enige moment waarop hij getoond wordt. Zie CLAUDE.md
// over de Google Fonts-regel die de hele browserproef tegenhield.
//
// WAAROM DIT LEESWERK MAG
// Er valt niets te draaien. De vraag is of twee bestanden dezelfde naam
// noemen en of de pagina zelfstandig is; een gedragstest zou een
// Android-build plus een toestel zonder netwerk vragen, en dat kan de gate
// niet. Wat de gate WEL kan is de koppeling bewaken, en dat is waar hij
// stukgaat.
//
// Draaien vanuit public/:  node test-foutpagina.js   (exit 0 = goed)
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
const cfg = JSON.parse(fs.readFileSync(path.join(wortel, 'capacitor.config.json'), 'utf8'));
const wf  = fs.readFileSync(path.join(wortel, '.github/workflows/build-apk.yml'), 'utf8');

console.log('\n1. De schil weet waar hij heen moet als de app niet laadt');

const server = cfg.server || {};
toets('server.url staat gezet — dit is een schil om een live site',
      typeof server.url === 'string' && /^https:\/\//.test(server.url),
      'gevonden: ' + JSON.stringify(server.url));

const errorPath = server.errorPath;
toets('server.errorPath staat in capacitor.config.json',
      typeof errorPath === 'string' && errorPath.trim() !== '',
      'zonder dit valt de gebruiker terug op de kale WebView-fout');

// Een errorPath met een schuine streep of een protocol is geen bestand in de
// webDir maar een verwijzing naar buiten — en naar buiten is nou juist wat
// niet werkt op het moment dat deze pagina nodig is.
toets('errorPath is een lokaal bestand, geen URL',
      typeof errorPath === 'string' && !/^[a-z]+:/i.test(errorPath) && errorPath.indexOf('/') < 0,
      'gevonden: ' + JSON.stringify(errorPath));

console.log('\n2. De workflow maakt precies dát bestand aan');

// De stub-stap schrijft de webDir met heredocs. Haal eruit welke bestanden
// hij aanmaakt, zodat de vergelijking over de echte naam gaat en niet over
// het feit dat "error" ergens in de workflow voorkomt.
const geschreven = [];
const her = /cat\s+>\s+www\/([A-Za-z0-9._-]+)\s+<<'HTML'\n([\s\S]*?)\n\s*HTML\n/g;
let m;
while ((m = her.exec(wf)) !== null) geschreven.push({ naam: m[1], inhoud: m[2] });

toets('build-apk.yml schrijft bestanden naar www/', geschreven.length >= 1,
      'geen enkele "cat > www/... <<HTML" gevonden — is de stub-stap hernoemd?');

const fout = geschreven.filter(g => g.naam === errorPath)[0];
toets('www/' + errorPath + ' wordt door de workflow aangemaakt', !!fout,
      'workflow schrijft: ' + (geschreven.map(g => g.naam).join(', ') || 'niets') +
      ' — capacitor.config.json vraagt: ' + errorPath);

console.log('\n3. De foutpagina werkt zonder netwerk');

if (!fout) {
  toets('inhoud van de foutpagina te toetsen', false, 'bestand niet gevonden in de workflow');
} else {
  const inhoud = fout.inhoud;

  toets('het is een echte pagina', /<html/i.test(inhoud) && /<\/html>/i.test(inhoud));

  // Dit is de kern. Alles wat de pagina van buiten haalt, haalt hij niet:
  // hij wordt getoond juist omdát er geen verbinding is.
  const externeVerwijzingen = (inhoud.match(/(?:src|href)\s*=\s*["']\s*(https?:)?\/\/[^"']+/gi) || []);
  toets('geen enkele verwijzing naar het net (stylesheet, script, lettertype, plaatje)',
        externeVerwijzingen.length === 0,
        'gevonden: ' + externeVerwijzingen.join(' | '));

  toets('geen @import naar een externe bron in de stijl',
        !/@import[^;]*(https?:)?\/\//i.test(inhoud));

  // Een foutpagina die niet zegt wat er aan de hand is, is net zo bruikbaar
  // als de WebView-fout die hij vervangt.
  toets('de pagina noemt de host waar de app vandaan komt',
        inhoud.indexOf('app.pidlane.nl') >= 0,
        'zonder die naam weet niemand wat er niet bereikbaar is');

  toets('er staat een weg terug op (opnieuw proberen)',
        /location\.reload|history\.go|Opnieuw/i.test(inhoud));

  // De schil tekent onder de status- en navigatiebalk (targetSdk 36,
  // edge-to-edge). Deze pagina hangt buiten pidlane.css en heeft dus zijn
  // eigen veilige zone nodig, anders staat de knop onder de systeembalk.
  toets('de pagina houdt rekening met de veilige zone',
        /viewport-fit=cover/.test(inhoud) && /safe-area-inset/.test(inhoud));
}

console.log('');
if (fouten) { console.log('test-foutpagina: ' + fouten + ' fout(en)'); process.exit(1); }
console.log('test-foutpagina: alles goed');
