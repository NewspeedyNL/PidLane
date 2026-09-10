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
// Gecentreerde dialogen staan er BEWUST niet in: daarboven en -onder blijft
// alleen de halfdoorzichtige achtergrond staan, en die mag prima onder de
// statusbalk doorlopen.
//
// HERZIEN 03-09-2026 — de onderaan-uitschuivende vellen stonden hier op
// dezelfde grond buiten, en dat klopte niet. Die vellen staan op
// `align-items:flex-end`: het vel zelf ligt tegen de onderrand en er blijft
// daaronder geen achtergrond over. Issue #71 is precies dat geval. Bij het
// nameten bleken het er drie (demo-autokiezer, rijsituatie,
// voertuigoverzicht), met 12 tot 14px onder de laagste knop tegenover een
// navigatiebalk van 48px. Ze worden nu gemeten in plaats van gelezen:
// bproef-schermranden.js opent elk vel in de draaiende app met de insets
// aan. Broncontrole zou hier ook te weinig zijn — `var(--pl-sab)` in de
// bron zegt niets over of de onderste knop te raken is.
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

  // 08-09-2026 — de drie gaten die de #71-ronde niet raakte. Elk is in de
  // browserproef gemeten (14px, 29px en 24px onder een navigatiebalk van 48px);
  // deze drie regels houden de reparatie vast op de toestellen waar die proef
  // niet draait, en ze worden rood zodra iemand de regel weghaalt.
  toets('.ai-sheet-b zonder voettekst draagt de marge zelf',
        /\.ai-sheet-b:last-child \{[^}]*var\(--pl-sab\)/.test(css),
        'drie vellen (Rapporten #134, Bevindingen, PID-recorder) bouwen alleen een kop en een romp; ' +
        'zonder deze regel hangt hun onderste knop achter de knoppenbalk');

  toets('.rem-card (de twee deel-vellen) gebruikt --pl-sab',
        /\.rem-card\{[^}]*calc\(22px \+ var\(--pl-sab\)\)/.test(html),
        'deze twee staan in index.html en droegen geen enkele klasse uit de #58-ronde');

  toets('de scrollinhoud van het keuzescherm houdt de knoppenbalk vrij (#135)',
        /#welcomeScreen \.welcome-scroll \{ padding-bottom:calc\(24px \+ var\(--pl-sab\)\)/.test(css),
        '#welcomeScreen loopt met opzet tot ónder de veilige zone door; de padding daar compenseert ' +
        'alleen die overhang, dus de scrollende inhoud heeft zijn eigen marge nodig');

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

// ══════════════════════════════════════════════════════════════════
// 5. DE ONDERRAND: BEREIKBAAR OF VAST ACHTER DE BALK? (#172)
// ══════════════════════════════════════════════════════════════════
// De blok 5-proef "De app past tussen de statusbalk en de navigatiebalk"
// meldde vanaf 01-09 elke rit FOUT. Op 10-09 beoordeelde de bestuurder in de
// toestelronde dezelfde onderrand met "Alles vrij — er valt niets weg",
// terwijl blok 5 in die sessie twee keer FOUT gaf (41px en 46px). De melding
// klopte niet; de meting stelde de verkeerde vraag.
//
// Dat #appGrid langer is dan het scherm is op ≤760px met OPZET zo (.app krijgt
// height:auto en de pagina scrollt). Wat een mens hindert is niet dat er iets
// onder de vouw ligt, maar dat er iets achter de balk ligt waar je niet bij
// kunt. plOnderrandOordeel() weegt daarom de scrollruimte mee.
//
// De regel is hier los te toetsen; de DOM-kant (welke maten erin gaan) blijft
// in de proef zelf. Hij wordt GELADEN uit de bron — geen kopie, dus verdwijnt
// hij, dan stopt deze test in plaats van iets van zichzelf te toetsen.
console.log('\n5. De onderrand: bereikbaar of vast achter de balk? (#172)');
{
  const vm = require('vm');
  const zand = {};
  zand.window = zand;
  zand.connected = false; zand.demoMode = false;
  zand.pidVals = {}; zand._pidLastUpd = {}; zand.activePIDs = new Set();
  zand.console = { warn() { }, error() { }, log() { } };
  zand.localStorage = { getItem() { return null; }, setItem() { }, key() { return null; }, length: 0 };
  zand.document = {
    getElementById() { return null; },
    createElement() { return { style: {}, classList: { add() { }, remove() { } } }; },
    querySelectorAll() { return []; }, addEventListener() { }, body: { appendChild() { } }
  };
  zand.navigator = { userAgent: 'node' };
  zand.setInterval = function () { return 0; };
  zand.clearInterval = function () { };
  zand.setTimeout = function () { return 0; };
  zand.PLBus = { stats() { return { belasting: 70, perSec: 5, venGemMs: 120, foutPct: 0 }; } };
  zand.PLLoad = { staat() { return { mult: 1, tempoPct: 100 }; }, cfg: {} };
  vm.createContext(zand);
  vm.runInContext(lees('pidlane-testrun.js'), zand, { filename: 'pidlane-testrun.js' });

  const O = zand.plOnderrandOordeel;
  toets('plOnderrandOordeel() bestaat', typeof O === 'function',
        'zonder die functie oordeelt blok 5 weer op "past het" in plaats van "kun je erbij"');

  if (typeof O === 'function') {
    // HET GEVAL UIT DE RIT. 830px werkscherm, balk begint op 784: 46px eronder,
    // maar de pagina kan nog ruim scrollen. Dat is wat de bestuurder zag.
    const rit = O(830, 784, 300);
    toets('de rit van 10-09 is géén bevinding meer', rit.ok === true, rit.tekst);
    toets('en de uitkomst zegt waaróm: er is scrollruimte', /bereikbaar/.test(rit.tekst), rit.tekst);

    // HET GEVAL DAT WEL EEN BEVINDING IS: niets meer te scrollen, en er blijft
    // iets onder de balk staan. Dat is #58 zoals het gemeld werd.
    const vast = O(830, 784, 0);
    toets('zonder scrollruimte is dezelfde maat wél een bevinding', vast.ok === false, vast.tekst);
    toets('en hij noemt wat er vast blijft staan', /46px blijft achter de navigatiebalk/.test(vast.tekst), vast.tekst);

    // DE RAND ERTUSSEN, en die is het punt van deze hele reparatie: net genoeg
    // scrollruimte is genoeg, net te weinig niet.
    toets('precies genoeg scrollruimte is genoeg', O(830, 784, 46).ok === true, JSON.stringify(O(830, 784, 46)));
    toets('tien pixels te weinig is een bevinding', O(830, 784, 36).ok === false, JSON.stringify(O(830, 784, 36)));

    // En het gewone geval: alles past, geen scrollen nodig.
    const past = O(700, 784, 0);
    toets('een scherm dat gewoon past is ok', past.ok === true, past.tekst);
    toets('en zegt dat het past', /past binnen het scherm/.test(past.tekst), past.tekst);

    // TEGENPROEF OP DE REGEL ZELF. Zonder de scrollruimte mee te wegen zouden
    // de eerste en de tweede casus hetzelfde antwoord geven — en dan meet deze
    // hele controle niets. Het verschil MOET er zijn.
    toets('scrollruimte maakt aantoonbaar verschil (tegenproef)',
          O(830, 784, 300).ok !== O(830, 784, 0).ok,
          'met en zonder scrollruimte geeft hetzelfde oordeel — dan telt de scrollruimte niet mee');

    // En een negatieve/onzin-scrollruimte mag niet stiekem een bevinding
    // wegpoetsen; die hoort als 0 te tellen.
    toets('een onzinnige scrollruimte telt als nul',
          O(830, 784, -500).ok === false && O(830, 784, null).ok === false,
          JSON.stringify([O(830, 784, -500), O(830, 784, null)]));
  }
}

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
