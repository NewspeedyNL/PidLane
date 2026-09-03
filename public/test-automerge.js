// ══════════════════════════════════════════════════════════════════
// test-automerge.js — voegt de workflow alleen samen wat af is?
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// Dit is de enige test in deze repo waarvan de fout niet zichtbaar wordt in
// de app maar in de historie van main. Een verkeerd besluit hier voegt iets
// samen wat niet af is, en op dit project is elke merge een deploy naar 100%
// van het verkeer. Je merkt het dus bij de klant of niet.
//
// Tot 03-09-2026 zat deze logica als inline script in automerge.yml en was
// hij niet te toetsen. Nu laadt deze test de ECHTE functie uit
// automerge-besluit.js — geen eigen kopie van de regels, want een test met
// een eigen kopie kan per definitie niet rood worden (zie CLAUDE.md over
// test-healthgate.js, die maanden groen stond op een functie die niet meer
// bestond).
//
// WAT DEZE TEST ONDERSCHEIDT
// "Voegt hij een groene PR samen" is een te makkelijke vraag; die stond ook
// groen op de oude, te gulle versie. De vragen die er hier toe doen:
//   - blijft een PR ZONDER `klaar` liggen? (de hele omkering)
//   - wint `handmatig` van `klaar`? (rangorde)
//   - wint fork van alles? (rangorde, en dit is de veiligheidspoort)
//   - blijft de bot STIL waar niemand iets hoeft te doen? Een melding bij
//     elke run is vals alarm, en vals alarm wordt genegeerd.
//
// Draaien vanuit public/:  node test-automerge.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { besluit, meldtekst, LABEL_KLAAR, LABEL_VETO } =
  require(path.join(__dirname, '..', 'automerge-besluit.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// Een PR die er in alle opzichten goed uitziet. Elke proef hieronder verandert
// er precies één ding aan, zodat een rode regel ook zegt wélk feit hem kantelt.
function pr(anders) {
  return Object.assign({
    nummer: 999,
    draft: false,
    labels: [LABEL_KLAAR],
    headRepo: 'NewspeedyNL/PidLane',
    eigenRepo: 'NewspeedyNL/PidLane',
    headSha: 'aaaaaaa1111111111111111111111111111111111',
    getesteSha: 'aaaaaaa1111111111111111111111111111111111',
    mergeable: true,
    testsGroen: true,
    achterstand: 0,
    baseRef: 'main'
  }, anders || {});
}

console.log('\n1. De gewone gang van zaken');

const goed = besluit(pr());
toets('af, groen en bijgewerkt → samenvoegen', goed.samenvoegen === true, goed.reden);
toets('en daar komt geen melding bij', goed.melden === false,
      'een bot die meldt dat alles goed gaat, is een bot die niemand meer leest');

console.log('\n2. De omkering: zonder `' + LABEL_KLAAR + '` gebeurt er niets');

const zonder = besluit(pr({ labels: [] }));
toets('geen labels → niet samenvoegen', zonder.samenvoegen === false, zonder.reden);
toets('en dit MOET op de PR komen', zonder.melden === true,
      'zwijgend laten liggen is erger dan wat automerge opving — dan wacht je weer uren');
toets('de melding noemt het label bij naam',
      meldtekst(zonder).indexOf('`' + LABEL_KLAAR + '`') >= 0);

// Een ánder label mag niet per ongeluk als toestemming gelden.
for (const l of ['klaar!', 'af', 'ready', 'automerge', 'klaarr']) {
  const b = besluit(pr({ labels: [l] }));
  toets('label "' + l + '" geldt niet als `' + LABEL_KLAAR + '`', b.samenvoegen === false,
        'dan zou een tikfout in een label een deploy zijn');
}

// MAAR DE SCHRIJFWIJZE WEL — en dit is een correctie op de eerste versie.
// Die vergeleek exact en zei er expliciet bij dat `Klaar` niet telt. Op
// 03-09-2026 werd het label als `Klaar` aangemaakt, bleef de PR liggen, en
// ging de merge alsnog met de hand: precies het gedrag dat deze poort moest
// vervangen. GitHub kent labelnamen zelf hoofdletterongevoelig — je kunt geen
// `klaar` én `Klaar` naast elkaar hebben — dus exact vergelijken toetste op
// een verschil dat niet bestaat.
for (const l of ['Klaar', 'KLAAR', 'kLaAr', ' klaar ']) {
  const b = besluit(pr({ labels: [l] }));
  toets('label "' + l + '" telt wél als `' + LABEL_KLAAR + '`', b.samenvoegen === true,
        'een label dat er goed uitziet en niets doet is erger dan geen label');
}

console.log('\n3. Rangorde — welke poort wint van welke');

// `handmatig` is een hard veto en moet van `klaar` winnen. Staan ze er beide,
// dan is dat geen patstelling: nee gaat voor ja.
const beide = besluit(pr({ labels: [LABEL_KLAAR, LABEL_VETO] }));
toets('`' + LABEL_VETO + '` wint van `' + LABEL_KLAAR + '`', beide.samenvoegen === false, beide.reden);
toets('en dat gaat om het veto, niet om iets anders', beide.sleutel === 'veto', beide.sleutel);

// Fork wint van alles, ook van een PR die er verder perfect uitziet. Dit is de
// veiligheidspoort: code van buiten mag niet door een bot met schrijfrechten
// naar binnen.
// Ook het veto is hoofdletterongevoelig: een rem die je met een hoofdletter
// kunt omzeilen is geen rem.
toets('`Handmatig` met hoofdletter remt ook',
      besluit(pr({ labels: [LABEL_KLAAR, 'Handmatig'] })).sleutel === 'veto');

const fork = besluit(pr({ headRepo: 'iemandanders/PidLane', labels: [LABEL_KLAAR] }));
toets('een fork wordt nooit samengevoegd', fork.samenvoegen === false, fork.reden);
toets('en fork wint óók van het veto (staat bovenaan)',
      besluit(pr({ headRepo: 'iemandanders/PidLane', labels: [LABEL_VETO] })).sleutel === 'fork');

const draft = besluit(pr({ draft: true }));
toets('een draft met `' + LABEL_KLAAR + '` erop blijft liggen', draft.samenvoegen === false, draft.reden);
toets('en daarover zwijgt de bot', draft.melden === false,
      'de auteur heeft dit zelf aangegeven; dat hoef je hem niet te vertellen');

console.log('\n4. De groene vlag moet over déze commit gaan');

const verschoven = besluit(pr({ headSha: 'bbbbbbb2222222222222222222222222222222222' }));
toets('doorgepusht na de testrun → niet samenvoegen', verschoven.samenvoegen === false, verschoven.reden);
toets('en stil, want die push start zelf een nieuwe run', verschoven.melden === false);
toets('de reden noemt beide commits', /aaaaaaa/.test(verschoven.reden) && /bbbbbbb/.test(verschoven.reden),
      'anders is niet te zien wat er verschoven is');

console.log('\n4b. De testgate moet groen staan op déze commit');

// Bij de eerste opzet was dit impliciet: de workflow vuurde alleen op het
// afronden van Tests. Nu vuurt hij ook op het zetten van een label, en langs
// die weg is groen geen gegeven meer — dan moet het nagevraagd worden.
const nietGroen = besluit(pr({ testsGroen: false }));
toets('testgate niet groen → niet samenvoegen', nietGroen.samenvoegen === false, nietGroen.reden);
toets('en stil, want een lopende run komt hier vanzelf langs', nietGroen.melden === false);

const groenOnbekend = besluit(pr({ testsGroen: null }));
toets('onbekende testuitslag telt als NIET groen', groenOnbekend.samenvoegen === false,
      'bij twijfel niet samenvoegen — dit is de poort die een deploy tegenhoudt');
toets('en dat is een ander besluit dan "niet groen"',
      groenOnbekend.reden !== nietGroen.reden,
      'anders lees je "geen run gevonden" als "gate rood" en ga je iets zoeken wat er niet is');

console.log('\n5. De basis mag niet zijn opgeschoven (de nieuwe poort)');

// Dit is het gat dat er tot 03-09 open stond. Een pull_request-run toetst head
// SAMENGEVOEGD MET base zoals base toen was. Landt er daarna iets anders op
// main, dan is die vlag verlopen. PR #120 en #121 landden 21 minuten na
// elkaar; de rico-test-PR's 17.
const achter = besluit(pr({ achterstand: 3 }));
toets('base loopt voor → niet samenvoegen', achter.samenvoegen === false, achter.reden);
toets('en dat moet op de PR, want er is werk te doen', achter.melden === true);
toets('de reden noemt hoeveel commits', /3 commit/.test(achter.reden), achter.reden);
toets('de melding legt uit waarom de workflow niet zelf bijwerkt',
      /GITHUB_TOKEN/.test(meldtekst(achter)),
      'anders lijkt het luiheid in plaats van de rem van GitHub tegen lussen');

toets('achterstand 0 blokkeert niet', besluit(pr({ achterstand: 0 })).samenvoegen === true);
toets('onbekende achterstand (null) blokkeert niet',
      besluit(pr({ achterstand: null })).samenvoegen === true,
      'de compare-API kan falen; dan is dit niet de poort die moet dichtvallen');

console.log('\n6. Conflict en "GitHub weet het nog niet" zijn twee dingen');

const conflict = besluit(pr({ mergeable: false }));
toets('mergeable false → niet samenvoegen', conflict.samenvoegen === false, conflict.reden);
toets('en dat moet op de PR', conflict.melden === true);

const onbekend = besluit(pr({ mergeable: null }));
toets('mergeable null → niet samenvoegen', onbekend.samenvoegen === false, onbekend.reden);
toets('maar zonder melding, want GitHub rekent nog', onbekend.melden === false,
      'melden zou hier bij elke run een bericht opleveren over niets');
toets('null en false leveren een ander besluit op',
      onbekend.sleutel !== conflict.sleutel,
      'anders lees je "nog niet berekend" als "conflict" en ga je iets oplossen wat er niet is');

console.log('\n7. Het geval uit de historie: PR #80 van 01-09-2026');

// Geopend 20:52:56, samengevoegd 20:53:08 — twaalf seconden, op één van de
// twee commits. Testrun 6.0 bleef achter op de branch terwijl main op 5.9
// stond, en de deploy die eruit volgde bevatte alleen een bijgewerkte
// PIDLANE.md. Onder de oude strategie was dit groen; het punt van de omkering
// is dat het nu blijft liggen.
const pr80 = besluit(pr({ nummer: 80, labels: [] }));
toets('#80 zou nu niet automatisch samengaan', pr80.samenvoegen === false, pr80.reden);
toets('en de reden is het ontbrekende label, niet iets anders',
      pr80.sleutel === 'geen-klaar', pr80.sleutel);

console.log('\n8. Elk besluit is volledig ingevuld');

// Een besluit zonder reden of zonder sleutel maakt het joblogboek en de
// ontdubbeling van meldingen stuk, en dat merk je pas als je het nodig hebt.
const allen = [goed, zonder, beide, fork, draft, verschoven, achter, conflict, onbekend,
               pr80, nietGroen];
toets('elk besluit draagt een reden', allen.every(b => typeof b.reden === 'string' && b.reden.length > 3));
toets('elk besluit draagt een sleutel', allen.every(b => typeof b.sleutel === 'string' && b.sleutel.length > 1));
toets('elk besluit zegt expliciet ja of nee', allen.every(b => typeof b.samenvoegen === 'boolean'));
toets('elk besluit zegt expliciet of het gemeld wordt', allen.every(b => typeof b.melden === 'boolean'));

// En: alleen waar een mens iets moet DOEN wordt er gemeld. Dit is de controle
// die voorkomt dat de bot een babbelbox wordt.
// Ontdubbelen: het gaat om welke SOORTEN gevallen melden, niet hoeveel
// besproken gevallen er in de lijst hierboven staan. Zonder dat telt #80 als
// tweede 'geen-klaar' mee en meet deze regel iets anders dan hij zegt.
const meldend = [...new Set(allen.filter(b => b.melden).map(b => b.sleutel))].sort();
toets('precies drie soorten gevallen melden: achterstand, conflict, geen-klaar',
      JSON.stringify(meldend) === JSON.stringify(['achterstand', 'conflict', 'geen-klaar']),
      'gevonden: ' + JSON.stringify(meldend));

// En de tegenhanger: de stille gevallen blijven stil. Zonder deze regel zou
// een extra melden:true ergens anders onopgemerkt doorglippen.
const stil = [...new Set(allen.filter(b => !b.melden).map(b => b.sleutel))].sort();
toets('en de rest zwijgt: draft, fork, niet-groen, ok, onbekend, verschoven, veto',
      JSON.stringify(stil) === JSON.stringify(['draft', 'fork', 'niet-groen', 'ok', 'onbekend', 'verschoven', 'veto']),
      'gevonden: ' + JSON.stringify(stil));

console.log('\n9. De workflow zelf: twee eigenschappen die het besluit niet kan bewaken');

// Deze twee zitten in de YAML en niet in de functie, maar ze zijn te
// belangrijk om onbewaakt te laten.
const fs = require('fs');
const wf = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/automerge.yml'), 'utf8');

// (a) DE TWEEDE INGANG. Zonder `labeled` doet het label niets als je het zet
// nádat de tests groen zijn — en dat is de normale volgorde. Op 03-09-2026
// bleef de PR daardoor liggen en ging de merge alsnog met de hand.
toets('de workflow vuurt ook op het zetten van een label',
      /pull_request:\s*\n\s*types:\s*\[labeled\]/.test(wf),
      'anders werkt het label alleen als je het ZET VOOR de testrun klaar is');

// (b) DE CHECKOUT-REF, en dit is een veiligheidspunt. Bij een
// pull_request-event pakt actions/checkout zonder ref de PR-HEAD. Dan kan een
// PR zijn eigen mergeregels meebrengen: automerge-besluit.js herschrijven naar
// "altijd ja", zichzelf labelen, en binnenkomen.
const mRef = wf.match(/uses:\s*actions\/checkout@[^\n]*\n\s*with:\s*\n\s*ref:\s*([^\n]+)/);
toets('de checkout haalt de regels expliciet van de standaardbranch', !!mRef,
      'zonder ref pakt hij bij een pull_request-event de PR-head — dan schrijft een PR zijn eigen mergeregels');
if (mRef) {
  toets('en die ref is niet de PR-head',
        !/pull_request|head/.test(mRef[1]), 'gevonden: ' + mRef[1].trim());
}

console.log('');
if (fouten) { console.log('test-automerge: ' + fouten + ' fout(en)'); process.exit(1); }
console.log('test-automerge: alles goed');
