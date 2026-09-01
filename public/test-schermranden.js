// ══════════════════════════════════════════════════════════════════
// test-schermranden.js — volle-schermvensters blijven onder de statusbalk
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// Op 28-08-2026 kreeg de topbalk een veilige marge (--pl-sat/--pl-sab in
// pidlane.css) voor Android 15+ edge-to-edge — gemeten in een browser, niet
// op een toestel. Diezelfde dag meldde een schermfoto dat het Logboek WEL
// onder de statusbalk uitschoof: "Logboek", "Sluiten" en de teller stonden
// half achter de systeemklok. De topbalk was de enige plek die was
// aangepakt; de app heeft ~20 andere volschermvensters die zichzelf met een
// losse <div style="position:fixed;inset:0;..."> opbouwen, allemaal met hun
// eigen padding, en zonder gedeelde class is er geen CSS-regel die ze in
// één keer meeneemt.
//
// 29-08-2026 kwam de tweede helft binnen (issue #58, Galaxy S10+): niet een
// los venster maar de GEWONE app viel onderaan weg achter de drie
// Android-knoppen. Oorzaak: .app rekende met calc(100vh - 46px) terwijl de
// topbalk 46px + --pl-sat hoog is, en onderin werd de navigatiebalk helemaal
// niet meegeteld. Blok 3 hieronder bewaakt de schil zelf.
//
// Dit bestand somt de vensters op die met het oog ECHT tegen de bovenrand
// aan liggen (het venster zelf is de eerste laag onder de systeembalk, geen
// backdrop ertussen) en toetst dat hun opening naar --pl-sat/--pl-sab wijst.
// Gecentreerde dialogen en onderaan-uitschuivende vellen staan er BEWUST
// niet in: daarboven of -onder blijft alleen de halfdoorzichtige achtergrond
// staan, en die mag prima onder de statusbalk doorlopen.
//
// WAAROM BRONCONTROLE EN GEEN GEDRAGSTEST
// Playwright kan dit gedrag meten — en heeft dat voor het Logboek ook echt
// gedaan, met tegenproef (zie PIDLANE.md §11). Voor de rest lukt dat hier
// niet zonder de hele app-boot na te bouwen: openTestrun() bijvoorbeeld
// weigert zonder isAdmin(), en dat hangt aan een ingelogde sessie die een
// kale testomgeving niet heeft. Vandaar bron, met de reden erbij, zoals
// CLAUDE.md voorschrijft.
//
// Draaien vanuit public/:  node test-schermranden.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

function lees(bestand) {
  return fs.readFileSync(path.join(__dirname, bestand), 'utf8');
}
const wortel = (b) => fs.readFileSync(path.join(__dirname, '..', b), 'utf8');

// Elk item: het bestand, een fragment dat de declaratie uniek vindt, en welke
// tokens erin moeten staan. 'top' hoort in de padding/top-regel die het
// venster van de bovenrand afhoudt, 'bottom' in de regel die het van de
// onderrand afhoudt (alleen waar dat venster ook echt tot de onderrand komt).
const VENSTERS = [
  { naam: 'Logboek',                bestand: 'pidlane-logboek.js',
    fragment: "id = 'logboekOv'",   nodig: ['top', 'bottom'] },
  { naam: 'Testrunpaneel',          bestand: 'pidlane-testrun.js',
    fragment: "z-index:9980",       nodig: ['top', 'bottom'] },
  { naam: 'Veldlab-dashboard (vlDash)', bestand: 'pidlane-veldlab.js',
    fragment: "id='vlDash'",        nodig: ['top', 'bottom'] },
  { naam: 'Diepe diagnose — koptekst',  bestand: 'pidlane-koopcheck.js',
    fragment: 'id="ddProgRow"',     nodig: ['top'] },
  { naam: 'Diepe diagnose — voettekst', bestand: 'pidlane-koopcheck.js',
    fragment: 'id="ddFoot"',        nodig: ['bottom'] }
];

console.log('\n1. De bekende volschermvensters wijzen naar de veilige-zonetokens');
for (const v of VENSTERS) {
  const bron = lees(v.bestand);
  const i = bron.indexOf(v.fragment);
  if (i < 0) { toets(v.naam + ': fragment gevonden', false, 'markering "' + v.fragment + '" niet aangetroffen — is het venster hernoemd?'); continue; }
  // Het venster kan over meerdere regels lopen (string-concatenatie); pak een
  // ruim venster eromheen zodat de style-declaratie er zeker in zit.
  const stuk = bron.slice(Math.max(0, i - 400), i + 800);
  if (v.nodig.includes('top'))
    toets(v.naam + ': bovenkant gebruikt --pl-sat', /var\(--pl-sat/.test(stuk),
          'geen var(--pl-sat…) gevonden rond deze declaratie — dan ligt de inhoud weer flush tegen de statusbalk');
  if (v.nodig.includes('bottom'))
    toets(v.naam + ': onderkant gebruikt --pl-sab', /var\(--pl-sab/.test(stuk),
          'geen var(--pl-sab…) gevonden — de onderkant kan dan onder de gebarenbalk komen');
}

console.log('\n2. Twee vensters in index.html (HUD en rittracker)');
{
  const html = wortel('public/index.html');

  const iHud = html.indexOf('id="neonDash"');
  toets('neonDash gevonden', iHud >= 0);
  if (iHud >= 0) {
    const stuk = html.slice(iHud, iHud + 1200);
    toets('HUD-koptekst gebruikt --pl-sat', /var\(--pl-sat/.test(stuk));
    toets('hudScreen schuift evenveel mee', /top:calc\(44px \+ var\(--pl-sat/.test(stuk),
          'de inhoud onder de koptekst moet met dezelfde marge verschuiven, anders overlapt hij de koptekst');
  }

  const iRit = html.indexOf('id="ritDash"');
  toets('ritDash gevonden', iRit >= 0);
  if (iRit >= 0) {
    const stuk = html.slice(iRit, iRit + 500);
    toets('ritDash gebruikt --pl-sat en --pl-sab', /var\(--pl-sat/.test(stuk) && /var\(--pl-sab/.test(stuk));
  }

  const iCar = html.indexOf('id="caravanDash"');
  toets('caravanDash gevonden', iCar >= 0);
  if (iCar >= 0) {
    const stuk = html.slice(iCar, iCar + 500);
    toets('caravanDash gebruikt --pl-sat en --pl-sab', /var\(--pl-sat/.test(stuk) && /var\(--pl-sab/.test(stuk));
  }
}

console.log('\n3. De app-schil zelf — issue #58 (29-08-2026)');
// De losse volschermvensters hierboven waren op 28-08 al nagelopen, maar de
// GEWONE app niet: .app stond op calc(100vh - 46px) terwijl de topbalk
// 46px + --pl-sat hoog is. Dat verschil (plus de navigatiebalk onderin) viel
// er onderaan uit — op een Galaxy S10+ verdween de onderste strook achter de
// drie Android-knoppen. Sinds die ronde is er één token: --pl-top = de
// ONDERKANT van de topbalk. Deze controles bewaken dat de schil dat token
// gebruikt en niet weer een kaal getal 46.
{
  const css = lees('pidlane.css');
  const html = wortel('public/index.html');
  const regel = (naam, bron, patroon) => {
    const r = new RegExp(patroon, 'm');
    const m = bron.match(r);
    return m ? m[0] : '';
  };

  toets('--pl-top bestaat en telt --pl-sat mee',
        /--pl-top:\s*calc\(46px \+ var\(--pl-sat\)\)/.test(css),
        'zonder dit token staat de hoogte van de topbalk weer op twee plekken');

  const rApp = regel('.app', css, '^\\.app \\{[^}]*\\}');
  toets('.app-hoogte gebruikt --pl-top én --pl-sab',
        /var\(--pl-top/.test(rApp) && /var\(--pl-sab/.test(rApp),
        'gevonden: ' + (rApp || '(.app-regel niet gevonden)'));

  const rAppMob = regel('.app mobiel', css, '^  \\.app\\{[^}]*\\}');
  toets('.app-minhoogte op de telefoon gebruikt --pl-top én --pl-sab',
        /var\(--pl-top/.test(rAppMob) && /var\(--pl-sab/.test(rAppMob),
        'gevonden: ' + (rAppMob || '(mobiele .app-regel niet gevonden)'));

  const rBody = regel('body', css, '^body \\{[^}]*\\}');
  toets('body houdt onderaan ruimte vrij voor de navigatiebalk',
        /padding-bottom:var\(--pl-sab\)/.test(rBody),
        'op de telefoon scrollt de pagina zelf; zonder dit eindigt de laatste regel achter de knoppen');

  toets('#welcomeScreen begint onder de topbalk',
        /#welcomeScreen \{[^}]*top:var\(--pl-top\)/.test(css),
        'met top:46px overlapt het keuzescherm de onderrand van de topbalk');

  toets('#fabLane (zwevende chips) staat boven de navigatiebalk',
        /#fabLane \{[^}]*bottom:calc\(14px \+ var\(--pl-sab\)\)/.test(css));

  toets('.ai-sheet-f (knoppenrij van een bottom-sheet) gebruikt --pl-sab',
        /\.ai-sheet-f \{[^}]*var\(--pl-sab\)/.test(css),
        'de sheet schuift vanaf de onderrand op; zonder dit liggen de knoppen achter de knoppenbalk');

  toets('.ov (gedeelde overlay) houdt boven én onder ruimte vrij',
        /^\.ov \{[^}]*padding:calc\(12px \+ var\(--pl-sat\)\) 12px calc\(12px \+ var\(--pl-sab\)\)/m.test(css));

  toets('volschermlade op de telefoon gebruikt beide zones',
        /#slPanel\.lade-open, #logLade\.lade-open \{ padding-bottom:var\(--pl-sab\)/.test(css) &&
        /#slPanel\.lade-open > \.lade-bar[^{]*\{ padding-top:calc\(9px \+ var\(--pl-sat\)\)/.test(css));

  toets('#remPill hangt onder de topbalk',
        /#remPill\{position:fixed;top:calc\(6px \+ var\(--pl-top\)\)/.test(html));
  toets('#busyPill hangt onder de topbalk',
        /#busyPill\{position:fixed;top:calc\(8px \+ var\(--pl-top\)\)/.test(css));

  // De oude vorm mag nergens meer staan: dát was de bug, niet de plek.
  // Commentaar telt niet mee — de uitleg hierboven noemt de oude regel
  // letterlijk, en die tekst is precies wat je wilt bewaren.
  const cssZonderCommentaar = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const kaal = (cssZonderCommentaar.match(/calc\(100vh - 46px\)/g) || []).length;
  toets('geen enkele regel rekent nog met calc(100vh - 46px)', kaal === 0,
        kaal + ' regel(s) rekenen de topbalk nog op 46px zonder veilige zone');

  // Tegenproef op dit blok: de vorige, kapotte .app-regel moet ROOD geven.
  const oudeApp = '.app { display:grid; grid-template-columns:1fr; height:calc(100vh - 46px); transition:grid-template-columns .25s; }';
  toets('de oude .app-regel valt wél door de mand (tegenproef)',
        !(/var\(--pl-top/.test(oudeApp) && /var\(--pl-sab/.test(oudeApp)) &&
        /calc\(100vh - 46px\)/.test(oudeApp),
        'als dit groen is meet de controle hierboven niets');
}

console.log('\n4. Tegenproef — wordt een teruggedraaide regel ook echt rood?');
// Zonder dit weet je alleen dat de toets GROEN kan staan, niet dat hij ooit
// ROOD wordt. Simuleer de oude, kapotte staat van het Logboek-venster.
{
  const oudeStijl = "position:fixed;inset:0;z-index:9975;background:rgba(8,11,17,.97);display:flex;flex-direction:column;padding:12px;gap:8px";
  const kunstmatig = "  ov.style.cssText = '" + oudeStijl + "';";
  const nepbron = "function x(){\n" + kunstmatig + "\n}";
  toets('een teruggedraaide declaratie bevat geen --pl-sat (tegenproef)',
        !/var\(--pl-sat/.test(nepbron),
        'als dit WEL matcht is de regex hierboven te ruim en meet hij niets');
}

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
