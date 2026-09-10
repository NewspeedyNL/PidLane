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

// ── 6. §14 belooft niets wat §3 niet kent ─────────────────────────
// De release notes zijn een ingedikte §3, met de hand. Twee velden die
// hetzelfde beloven en allebei door een reviewer gelezen worden — dat is de
// vorm die §11 twee keer de kop kostte, en die §16 op 10-09 nog een keer.
//
// De eerste versie van deze controle deugde niet, en plmutate.sh liet dat
// zien: hij hield een lijstje functienamen bij dat ik zelf had opgeschreven.
// Daarmee toetste hij mijn woordenschat, niet het document — een functie die
// niet op mijn lijstje stond, glipte er per definitie doorheen. Precies wat
// CLAUDE.md bedoelt met "verzin geen tabellen die de app ook heeft".
//
// Nu komt de lijst uit §3 zelf: dat veld somt de functies op als "• Naam —
// uitleg", en dat is de claim van de app. §14 noemt ze in één zin ("Met A, B
// en C."). Elk item uit die zin moet een opsommingskop van §3 zijn.
//
// Eén kant op, met opzet: §3 mag 4000 tekens en noemt meer dan §14.
console.log('\n6. Wat de release notes beloven, staat ook in de beschrijving');
{
  const notes = blokkenOnder('## 14. Release notes');
  const vol = blokkenOnder('## 3. Full description');

  if (!notes || !notes.length || !vol || !vol.length) {
    toets('§14 en §3 hebben allebei tekst', false,
          'een van de twee kopjes is hernoemd of leeggehaald');
  } else {
    // De opsommingskoppen van §3. Verdwijnt die vorm, dan stopt deze toets
    // met een FOUT in plaats van stilletjes met een lege lijst door te gaan.
    const koppen = [];
    const reKop = /^[•*-]\s*([^—\n]+)—/gm;
    let m;
    while ((m = reKop.exec(vol[0])) !== null) koppen.push(m[1].trim().toLowerCase());

    toets('§3 somt zijn functies nog op als "• Naam — uitleg" (' + koppen.length + ' stuks)',
          koppen.length >= 5,
          'de opsomming is van vorm veranderd; zonder die koppen vergelijkt deze toets niets');

    // Noemt een §14-item een functie die §3 kent? Een kop mag langer zijn dan
    // wat §14 ervan maakt ("kenteken" hoort bij "Kenteken invullen (Nederland)").
    function kentDeApp(naam) {
      return koppen.some(function (k) { return k === naam || k.indexOf(naam) === 0; });
    }

    // Het eerste blok van §14 tegen dat van §3. Sinds het besluit van
    // 10-09-2026 is dat ook het énige blok van allebei: de inzending is
    // nl-NL only (#177). Deel 7 hieronder bewaakt dat er niet stilletjes een
    // tweede taal bij komt in het ene veld en niet in het andere.
    const zin = notes[0].match(/\bMet ([^.]+)\./);
    toets('§14 noemt zijn functies nog in één "Met ..."-zin', !!zin,
          'die zin is de plek waar dit veld functies belooft; is hij weg, dan vergelijkt deze toets niets');

    if (zin) {
      const genoemd = zin[1].toLowerCase().split(/,| en /)
        .map(function (x) { return x.trim(); })
        .filter(function (x) { return x; });

      toets('die zin noemt er minstens twee (' + genoemd.join(', ') + ')', genoemd.length >= 2,
            'met minder valt er weinig te vergelijken');

      genoemd.forEach(function (naam) {
        toets('"' + naam + '" uit §14 is een functie die §3 opsomt',
              kentDeApp(naam),
              'de release notes beloven iets wat de beschrijving niet kent — zet het eerst in §3');
      });

      // TEGENPROEF: dezelfde vergelijking op een verzonnen functie moet hem
      // afkeuren. Alleen "de echte namen kloppen" bewijst te weinig: dan weet
      // je nog niet of kentDeApp() ooit false teruggeeft.
      toets('een verzonnen functie zou hij afkeuren (tegenproef)',
            !kentDeApp('wielophangingsscanner'),
            'kentDeApp() keurt alles goed — dan bewaakt de controle hierboven niets');
    }
  }
}


// ── 7. Alle vier de velden dragen evenveel talen (#177) ───────────
// De inzending is nl-NL only, besloten op 10-09-2026. Maar dit deel toetst
// niet "er is precies één blok" — het toetst dat de vier velden GELIJK lopen.
// Dat is de fout die #177 was: §1, §2 en §14 hadden een en-US-blok en §3 niet,
// dus wie in de Console een tweede taal aanzette kreeg een Engelse titel,
// een Engelse regel eronder en Engelse release notes, met een Nederlandse
// volledige beschrijving ertussen — uitgerekend het veld waar de
// "minimum functionality"-toets op leunt.
//
// Zo geschreven blijft de controle ook gelden als er ooit wél vertaald wordt:
// dan gaan alle vier de velden naar twee, en dit deel blijft groen. Een test
// die op "precies één" staat, zou dan in de weg lopen en weggehaald worden —
// en dan is er niets meer dat de scheefstand vangt.
console.log('\n7. Elk invulveld draagt evenveel taalblokken');
{
  const telling = VELDEN.map(function (v) {
    return { kop: v.kop.replace('## ', ''), n: (blokkenOnder(v.kop) || []).length };
  });

  // Losse functie, zodat de tegenproef eronder hem echt kan uitvoeren op een
  // scheve lijst. Een vergelijking die alleen op het echte document draait,
  // heeft nooit laten zien dát hij kan afkeuren.
  function gelijkGeteld(lijst) {
    if (!lijst.length) return false;
    const eerste = lijst[0].n;
    if (eerste < 1) return false;
    return lijst.every(function (v) { return v.n === eerste; });
  }

  toets('alle vier de velden hebben er evenveel (' +
        telling.map(function (v) { return v.kop + ': ' + v.n; }).join(', ') + ')',
        gelijkGeteld(telling),
        'een veld draagt een taal die een ander veld niet heeft — dat is #177, en een ' +
        'reviewer leest dan half Engels');

  toets('en het zijn er nu één per veld (nl-NL only, besluit 10-09-2026)',
        telling.every(function (v) { return v.n === 1; }),
        'er staat een tweede taal in het document; klopt dat, werk dan de regel onder §0 bij');

  // TEGENPROEF: dezelfde functie moet een scheve telling afkeuren. Zonder dit
  // weet je alleen dat hij groen kán staan.
  toets('een scheef document zou hij afkeuren (tegenproef)',
        !gelijkGeteld([{ kop: '1', n: 2 }, { kop: '2', n: 2 }, { kop: '3', n: 1 }, { kop: '14', n: 2 }]),
        'gelijkGeteld() keurt alles goed — dan bewaakt de controle hierboven niets');
}

console.log('');
if (fouten) { console.log('test-playteksten: ' + fouten + ' fout(en)'); process.exit(1); }
console.log('test-playteksten: alles goed');
