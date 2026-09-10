// ══════════════════════════════════════════════════════════════════
// test-playteksten.js — past de inzending nog in de velden van de Console?
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// PLAY-INZENDING.md is kopieerwerk: elk blok gaat letterlijk in een veld van
// de Play Console. Die velden hebben harde grenzen, en de Console knipt niet
// af maar weigert. Dat merk je pas als je aan het plakken bent — met een
// bundel die al klaarstaat en een beschrijving die je ter plekke moet
// inkorten. Dan schrijf je iets anders dan wat er is nagelezen.
//
// De tweede fout die hier gevangen wordt is erger, want stil. Het document
// noemt twee URL's die een reviewer aanklikt: de privacyverklaring en de
// verwijderpagina. Wijst er één naar een bestand dat niet bestaat of naar een
// andere host dan de app zelf gebruikt, dan is dat een dode link in een
// verplicht veld — en een dode privacy-URL is op zichzelf al genoeg voor een
// afwijzing. Niets in de repo merkt dat op: het is een string in een
// markdownbestand.
//
// En de derde: "Data is anonymized". De VIN wordt gepseudonimiseerd, niet
// geanonimiseerd — het zout staat in clientcode, dus wie de VIN kent rekent
// de code na. Dat vakje aanvinken is onjuist, en de waarschuwing die dat
// tegenhoudt moet in het document blijven staan. test-toestemmingstekst.js
// bewaakt dezelfde grens aan de kant van de app; dit is de kant van het
// formulier.
//
// WAAROM DIT LEESWERK MAG
// Het onderwerp ís tekst. Er valt geen gedrag te draaien: de vraag is of een
// string past en of een pad bestaat.
//
// Draaien vanuit public/:  node test-playteksten.js   (exit 0 = goed)
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
const doc = fs.readFileSync(path.join(wortel, 'PLAY-INZENDING.md'), 'utf8');
const cfg = JSON.parse(fs.readFileSync(path.join(wortel, 'capacitor.config.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(wortel, 'package.json'), 'utf8'));

// Pak de afgebakende blokken die onder één kopje staan. Op de kop ankeren en
// niet op een regelnummer: het document mag groeien zonder deze test te
// breken, maar een kopje dat verdwijnt hóórt hem te breken — dan is het veld
// waar hij over gaat er niet meer.
function blokkenOnder(kop) {
  const i = doc.indexOf(kop);
  if (i < 0) return null;
  const rest = doc.slice(i + kop.length);
  const eind = rest.indexOf('\n## ');
  const stuk = eind < 0 ? rest : rest.slice(0, eind);
  const uit = [];
  const re = /```\n([\s\S]*?)\n```/g;
  let m;
  while ((m = re.exec(stuk)) !== null) uit.push(m[1]);
  return uit;
}

// De grenzen zoals de Play Console ze hanteert.
const VELDEN = [
  { kop: '## 1. App name',          grens: 30,   minstens: 1 },
  { kop: '## 2. Short description', grens: 80,   minstens: 1 },
  { kop: '## 3. Full description',  grens: 4000, minstens: 1 },
  { kop: '## 14. Release notes',    grens: 500,  minstens: 1 }
];

console.log('\n1. Elk invulveld past binnen zijn grens');

for (const v of VELDEN) {
  const blokken = blokkenOnder(v.kop);
  if (blokken === null) {
    toets('kopje bestaat: ' + v.kop, false, 'hernoemd of weggehaald uit PLAY-INZENDING.md');
    continue;
  }
  toets(v.kop + ' heeft tekst om te plakken', blokken.length >= v.minstens,
        'geen enkel codeblok onder dit kopje gevonden');
  blokken.forEach((b, n) => {
    toets(v.kop.replace('## ', '') + ' — blok ' + (n + 1) + ': ' + b.length + '/' + v.grens + ' tekens',
          b.length <= v.grens,
          'de Console weigert dit veld; korten moet hier gebeuren, niet tijdens het plakken');
  });
}

console.log('\n2. De twee URL\'s die een reviewer aanklikt, bestaan echt');

// De host waar de schil zijn app vandaan haalt. Noemt het document een andere
// host, dan wijst een reviewer naar iets anders dan de app zelf gebruikt.
const host = String((cfg.server && cfg.server.url) || '').replace(/\/+$/, '');
toets('server.url bekend uit capacitor.config.json', /^https:\/\/\S+/.test(host), host);

// LET OP DE VORM VAN DEZE CONTROLE, want de eerste versie deugde niet.
// Die vroeg of de URL érgens in het document stond. Dat is te ruim: de URL
// wordt op drie plekken genoemd — het invulveld, de afvinklijst en de lopende
// tekst — dus bleef de toets groen terwijl uitgerekend het veld dat geplakt
// wordt naar een andere host wees. plmutate.sh liet die mutatie ontsnappen,
// en dat is precies waarvoor dat script bestaat.
//
// De vraag is dus niet "komt deze URL voor" maar "staat hij in het VELD".
// Vandaar dat de tekst per kopje wordt afgebakend en daarbinnen elke URL
// gecontroleerd wordt: het veld mag nergens naar een andere host wijzen.
function urlsOnder(kop) {
  const i = doc.indexOf(kop);
  if (i < 0) return null;
  const rest = doc.slice(i + kop.length);
  const eind = rest.indexOf('\n## ');
  const stuk = eind < 0 ? rest : rest.slice(0, eind);
  return stuk.match(/https?:\/\/[^\s`'"<>)|]+/g) || [];
}

const paden = [
  { naam: 'privacyverklaring', bestand: 'privacy.html',    kop: '## 6. Privacy policy URL' },
  { naam: 'verwijderpagina',   bestand: 'verwijderen.html', kop: '## 12. Data deletion' }
];

for (const p of paden) {
  const url = host + '/' + p.bestand;
  const gevonden = urlsOnder(p.kop);

  if (gevonden === null) {
    toets(p.naam + ': kopje ' + p.kop + ' bestaat', false,
          'hernoemd of weggehaald — dan is niet meer te zien welk veld deze URL draagt');
    continue;
  }

  toets(p.naam + ': het veld onder "' + p.kop.replace('## ', '') + '" noemt ' + url,
        gevonden.indexOf(url) >= 0,
        'gevonden onder dat kopje: ' + (gevonden.join(', ') || 'geen enkele URL'));

  // En geen enkele ANDERE host onder datzelfde kopje. Twee URL's in één veld
  // is óók fout, en dan is de vraag welke er geplakt wordt.
  const vreemd = gevonden.filter(u => u.indexOf(host + '/') !== 0);
  toets(p.naam + ': geen andere host in datzelfde veld', vreemd.length === 0,
        'ook gevonden: ' + vreemd.join(', '));

  toets(p.naam + ': public/' + p.bestand + ' bestaat',
        fs.existsSync(path.join(__dirname, p.bestand)),
        'de URL zou een 404 geven — een dode privacy-URL is op zichzelf een afwijzing');
}

// Alles in public/ wordt als statisch bestand geserveerd, BEHALVE wat in
// run_worker_first staat. Staat een van deze twee daar wel in, dan loopt hij
// door de Worker en kan hij achter een sessiecontrole belanden — precies wat
// niet mag: deze pagina's moeten open zijn voor iemand zonder account.
const wrangler = fs.readFileSync(path.join(wortel, 'wrangler.toml'), 'utf8');
const rwf = (wrangler.match(/run_worker_first\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
for (const p of paden) {
  toets(p.naam + ' wordt niet door de Worker afgevangen',
        rwf.indexOf(p.bestand) < 0,
        'staat in run_worker_first — dan is publieke bereikbaarheid geen gegeven meer');
}

console.log('\n3. Het formulier belooft geen anonimisering');

// Google's vragenlijst kent "Data is anonymized" als expliciete keuze. Hier
// is dat onjuist: pseudonimisering is geen anonimisering. De waarschuwing die
// dat tegenhoudt hoort in het document te blijven staan.
toets('het document waarschuwt tegen het vakje "anonymized"',
      /anonymized/i.test(doc) && /(NERGENS|niet)\s+aan(ge)?vink/i.test(doc),
      'zonder die regel wordt dat vakje ooit uit gewoonte aangevinkt');

toets('het document noemt pseudonimisering bij naam',
      /pseudonimiseer|gepseudonimiseerd|pseudoniem/i.test(doc));

// Let op de vorm van deze controle. "geanonimiseerd" verbieden is te grof:
// het document schrijft "gepseudonimiseerd, niet geanonimiseerd", en dat is
// juist de zin die er hoort te staan. Een toets die daarop afgaat is een vals
// alarm, en een controle met vals alarm wordt genegeerd — dan is hij minder
// waard dan geen controle.
//
// Wat wél fout is, is het woord als BEWERING: "de meetdata is
// geanonimiseerd". Het onderscheid zit in de ontkenning ervoor. Dus: elk
// voorkomen moet kort daarvoor een "niet" of "geen" hebben staan.
const claims = [];
const reAnon = /geanonimiseerd/gi;
let mA;
while ((mA = reAnon.exec(doc)) !== null) {
  const ervoor = doc.slice(Math.max(0, mA.index - 40), mA.index);
  if (!/\b(niet|geen|nooit)\b[^.]*$/i.test(ervoor)) {
    claims.push(doc.slice(Math.max(0, mA.index - 40), mA.index + 20).replace(/\n/g, ' '));
  }
}
toets('het document beweert nergens dát gegevens anoniem zijn',
      claims.length === 0,
      'als bewering gevonden: ' + claims.join(' | '));

console.log('\n4. Het versienummer in het document loopt niet achter');

// §16 vinkt af dat versionName klopt, en noemt daarbij een getal. Loopt dat
// achter op package.json, dan vink je iets af wat niet meer waar is.
const versies = (doc.match(/\((\d+\.\d+\.\d+)\)/g) || []).map(s => s.slice(1, -1));
toets('het document noemt een versienummer', versies.length >= 1,
      'geen "(x.y.z)" gevonden — is de afvinklijst herschreven?');
versies.forEach(v => {
  toets('genoemde versie ' + v + ' is die van package.json (' + pkg.version + ')',
        v === pkg.version,
        'de afvinklijst bevestigt dan een versie die niet meer gebouwd wordt');
});

console.log('\n5. Er staat geen wachtwoord in dit document');

// WAAROM DIT ER IS (10-09-2026). Deze repository is PUBLIEK. §7 vraagt om een
// reviewaccount met tegoed erop, en het wachtwoord daarvan hoort in het
// Console-veld — niet in een gecommit bestand, waar het binnen een minuut
// wereldwijd leesbaar is. Het document waarschuwt daar zelf voor, maar een
// waarschuwing draait op oplettendheid en dat is hier al vaker misgegaan.
//
// De sleutelscan in CI vangt dit NIET: die zoekt naar API-sleutels en tokens,
// niet naar een wachtwoord in lopende tekst. Vandaar een eigen controle.
//
// Wat hij zoekt is een REGEL die een wachtwoord toekent, niet het woord
// "wachtwoord" zelf — dat staat er juist als uitleg, en dat moet zo blijven.
{
  const verdacht = [];
  doc.split('\n').forEach(function (regel, i) {
    // "Password | Iets", "wachtwoord: Iets", "pass = Iets" — met iets erachter
    // dat op een echt wachtwoord lijkt: geen spaties, minstens acht tekens.
    const m = regel.match(/(?:password|wachtwoord|passwd|pwd)\s*[:|=]\s*([^\s|*_\x60]{8,})/i);
    if (!m) return;
    // Cursief of tussen backticks is uitleg ("*niet in dit bestand*"), en een
    // verwijzing naar een veld ook. Alleen kale tekst telt als een lek.
    if (/^[*_\x60]/.test(m[1])) return;
    verdacht.push('regel ' + (i + 1) + ': ' + regel.trim().slice(0, 70));
  });
  toets('geen wachtwoordregel in PLAY-INZENDING.md',
        verdacht.length === 0,
        'deze repo is publiek — zet het in het Console-veld App access:\n        ' + verdacht.join('\n        '));

  // TEGENPROEF: de controle moet een echt lek ook echt zien. Zonder dit weet
  // je alleen dat hij groen kán staan.
  const nep = '| Password | DemoTester@2026 |';
  const ziet = /(?:password|wachtwoord|passwd|pwd)\s*[:|=]\s*([^\s|*_\x60]{8,})/i.test(nep);
  toets('en een echt wachtwoord zou hij zien (tegenproef)', ziet,
        'de regex is te smal — dan bewaakt controle hierboven niets');
}

// ── 6. §14 en §3 beloven hetzelfde ────────────────────────────────
// De release notes zijn een ingedikte §3. Twee velden die met de hand
// hetzelfde beschrijven lopen hier uit de pas — dat is wat §16 op 10-09 de
// kop kostte en wat §11 twee keer eerder overkwam. Een reviewer leest ze
// allebei, en het veld dat een functie belooft die de beschrijving niet kent
// is het veld dat opvalt.
//
// De toets kijkt één kant op, en dat is met opzet: alles wat §14 noemt moet
// in §3 staan. Andersom niet — §3 mag 4000 tekens en noemt meer.
console.log('\n6. Wat de release notes beloven, staat ook in de beschrijving');
{
  const notes = blokkenOnder('## 14. Release notes');
  const vol = blokkenOnder('## 3. Full description');

  if (!notes || !notes.length || !vol || !vol.length) {
    toets('§14 en §3 hebben allebei tekst', false,
          'een van de twee kopjes is hernoemd of leeggehaald');
  } else {
    // Het Nederlandse blok tegen de Nederlandse beschrijving. Het Engelse
    // blok blijft buiten beschouwing zolang §3 geen en-US-versie heeft (#177).
    const nl = notes[0];
    const beschrijving = vol[0].toLowerCase();

    // De functienamen die dit veld bij naam belooft. Niet elk woord: alleen
    // wat een reviewer als functie leest en dus in de app zoekt.
    const FUNCTIES = ['ritmonitor', 'koopcheck', 'diagnose op afstand',
                      'foutcodes', 'freeze frame', 'onderdeelaanwijzer',
                      'kenteken'];
    const genoemd = FUNCTIES.filter(function (f) { return nl.toLowerCase().indexOf(f) !== -1; });

    toets('§14 noemt minstens één functie bij naam', genoemd.length > 0,
          'staat er geen enkele functienaam in, dan bewaakt deze controle niets');

    genoemd.forEach(function (f) {
      toets('"' + f + '" uit §14 staat ook in §3',
            beschrijving.indexOf(f) !== -1,
            'de release notes beloven iets wat de beschrijving niet kent');
    });

    // TEGENPROEF: draai de vergelijking op een verzonnen §14 die een functie
    // belooft die §3 niet kent. Alleen "dat woord staat niet in §3" bewijst
    // te weinig — dan weet je nog niet of de vergelijking hierboven ooit iets
    // afkeurt. Dit voert hem uit en eist dat hij rood wordt.
    const nepNotes = 'Met ritmonitor, koopcheck en wielophangingsscanner.';
    const nepLijst = FUNCTIES.concat(['wielophangingsscanner']);
    const nepGenoemd = nepLijst.filter(function (f) { return nepNotes.toLowerCase().indexOf(f) !== -1; });
    const nepMist = nepGenoemd.filter(function (f) { return beschrijving.indexOf(f) === -1; });
    toets('een §14 die iets belooft dat §3 niet kent, valt door de mand (tegenproef)',
          nepGenoemd.length === 3 && nepMist.length === 1 && nepMist[0] === 'wielophangingsscanner',
          'de vergelijking keurt niets af — gevonden: ' + nepGenoemd.join(', ') +
          ' / gemist: ' + nepMist.join(', '));
  }
}

console.log('');
if (fouten) { console.log('test-playteksten: ' + fouten + ' fout(en)'); process.exit(1); }
console.log('test-playteksten: alles goed');
