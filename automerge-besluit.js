// ══════════════════════════════════════════════════════════════════
// automerge-besluit.js — mag deze PR samengevoegd worden?
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT EEN EIGEN BESTAND IS EN GEEN YAML
// De beslissing stond tot 03-09-2026 als inline script in
// .github/workflows/automerge.yml. Daar valt hij niet te toetsen: je merkt
// pas dat hij iets verkeerd doet als er iets verkeerds is samengevoegd, en
// dat is op dit project meteen een deploy naar 100% van het verkeer.
//
// Hier is het een gewone functie zonder netwerk en zonder GitHub: feiten
// erin, besluit eruit. public/test-automerge.js voert hem uit met de
// gevallen die er echt zijn geweest, en plmutate.sh bouwt de fouten na.
//
// WAAROM DE STRATEGIE IS OMGEKEERD — gemeten op 03-09-2026
// Over 56 samengevoegde PR's was de mediaan van openen tot samenvoegen
// 29 SECONDEN; 43 ervan gingen binnen 40 seconden. Er was dus geen venster
// waarin een mens kon ingrijpen, en elke merge is hier een deploy.
//
// Erger was wat daar bovenop kwam: 14 keer volgde er binnen twee uur nóg
// een PR op dezelfde branch (rico-test zes keer, testrun-log-prep vier
// keer, met gaten van 12 en 17 minuten). Deels legitiem nieuw werk, maar
// PR #80 van 01-09 is dezelfde vorm en dat was het niet: geopend om
// 20:52:56, samengevoegd om 20:53:08 op één van de twee commits. Testrun
// 6.0 bleef achter op de branch terwijl main op 5.9 stond.
//
// CLAUDE.md maakte daar een gedragsregel van — "af, groen, gepusht, dán
// pas de PR". Die regel is goed en hij draait op oplettendheid, en dat is
// precies wat hier te vaak misgaat. Vandaar de omkering:
//
//   VOOR:  samenvoegen is de standaard, label `handmatig` is de rem.
//   NU:    samenvoegen vraagt het label `klaar`; zonder dat gebeurt niets.
//
// `klaar` betekent één ding: dit werk is af en álles staat gepusht. Wie het
// label zet, zegt dat. Het label `handmatig` blijft bestaan als hard veto —
// dat is een ander ding dan "nog niet af", en het wint van `klaar`.
//
// DE PRIJS, EXPLICIET
// Een PR zonder label blijft liggen. Dat is de toestand waar automerge ooit
// voor gebouwd is (26-08: vier uur wachten op een groene gate). Daarom
// meldt de workflow op de PR zelf waaróm er niets gebeurt; zwijgend laten
// liggen zou dit erger maken dan wat het opving.
// ══════════════════════════════════════════════════════════════════
'use strict';

// De twee labels, op één plek zodat de workflow en de test hetzelfde lezen.
const LABEL_KLAAR = 'klaar';
const LABEL_VETO  = 'handmatig';

/* ── Labels vergelijken: hoofdletterongevoelig, en dat is een correctie ──
   De eerste versie van 03-09-2026 vergeleek exact, met een toets die er
   expliciet bij zei dat `Klaar` NIET als `klaar` telt. De redenering was "een
   tikfout mag geen toestemming zijn". Dat was fout, en het ging dezelfde dag
   nog mis: het label werd als `Klaar` aangemaakt, de PR bleef liggen, en de
   merge ging alsnog met de hand — precies het gedrag dat deze poort moest
   vervangen.

   Waarom de oorspronkelijke redenering niet klopte: GitHub behandelt
   labelnamen zélf hoofdletterongevoelig. Je kunt geen `klaar` én `Klaar`
   naast elkaar hebben; het ís één label, en welke schrijfwijze je ziet hangt
   af van wie hem aanmaakte. Exact vergelijken toetst dus niet op een tikfout
   maar op iets wat GitHub niet als verschil erkent — en dat levert een label
   op dat er goed uitziet en niets doet.

   Wat wél een ander label is, blijft een ander label: `af`, `ready`,
   `klaar!`. Alleen de schrijfwijze wordt vergeven, niets anders. */
function heeftLabel(labels, naam) {
  const gezocht = String(naam).toLowerCase();
  return (labels || []).some(l => String(l).trim().toLowerCase() === gezocht);
}

/**
 * @param {object} f  de feiten over deze PR:
 *   nummer        {number}
 *   draft         {boolean}
 *   labels        {string[]}
 *   headRepo      {string}  'eigenaar/repo' van de head — fork-controle
 *   eigenRepo     {string}  'eigenaar/repo' van deze repo
 *   headSha       {string}  waar de PR NU staat
 *   getesteSha    {string}  waar de groene testrun op draaide
 *   mergeable     {boolean|null}  null = GitHub rekent nog
 *   testsGroen    {boolean|null}  staat *Tests* groen op headSha? null =
 *                                 niet vast te stellen, en dat telt als nee
 *   achterstand   {number|null}   commits die base voorloopt op head
 *   baseRef       {string}
 * @returns {{samenvoegen:boolean, reden:string, melden:boolean, sleutel:string}}
 *   melden  = hoort dit op de PR te staan in plaats van alleen in het
 *             joblogboek? Alleen waar een mens iets moet DOEN.
 *   sleutel = korte code van dit geval; de workflow gebruikt hem om niet
 *             bij elke run dezelfde melding opnieuw te plaatsen.
 */
function besluit(f) {
  const labels = f.labels || [];

  // 1. FORK — nooit, en dit staat bovenaan met opzet.
  // Een PR uit een fork kan code meebrengen die deze workflow met
  // schrijfrechten zou samenvoegen zonder dat er iemand naar gekeken heeft.
  // Geen melding: wie een fork-PR opent hoort een mens te treffen, niet een
  // bot die uitlegt waarom hij niets doet.
  if (f.headRepo !== f.eigenRepo) {
    return { samenvoegen: false, reden: 'komt uit een fork (' + f.headRepo + ')',
             melden: false, sleutel: 'fork' };
  }

  // 2. HARD VETO — wint van `klaar`. Twee labels die elkaar tegenspreken is
  // geen patstelling: nee gaat voor ja.
  if (heeftLabel(labels, LABEL_VETO)) {
    return { samenvoegen: false, reden: 'label `' + LABEL_VETO + '` staat erop',
             melden: false, sleutel: 'veto' };
  }

  // 3. DRAFT — de auteur zegt zelf dat het niet af is. Geen melding: dat zou
  // hem vertellen wat hij net zelf heeft aangegeven.
  if (f.draft) {
    return { samenvoegen: false, reden: 'is een draft', melden: false, sleutel: 'draft' };
  }

  // 4. GEEN `klaar` — de nieuwe standaard, en het enige geval waarin een PR
  // blijft liggen zonder dat er iets mis is. Daarom MOET dit op de PR staan:
  // stil laten liggen is precies de toestand die automerge moest opheffen.
  if (!heeftLabel(labels, LABEL_KLAAR)) {
    return { samenvoegen: false,
             reden: 'wacht op het label `' + LABEL_KLAAR + '`',
             melden: true, sleutel: 'geen-klaar' };
  }

  // 5. DOORGEPUSHT NA DE TESTRUN — de groene run ging over een andere commit
  // dan wat er nu ligt. Geen melding: de push die dit veroorzaakte start zelf
  // een nieuwe run, en die komt hier straks weer langs.
  if (f.headSha !== f.getesteSha) {
    return { samenvoegen: false,
             reden: 'doorgepusht na de geteste commit (' +
                    String(f.getesteSha).slice(0, 7) + ' → ' + String(f.headSha).slice(0, 7) + ')',
             melden: false, sleutel: 'verschoven' };
  }

  // 5b. STAAT DE TESTGATE GROEN OP DEZE COMMIT?
  //
  // Bij de eerste opzet was dit impliciet: de workflow vuurde alléén op het
  // afronden van *Tests*, dus groen was een gegeven. Dat had een gat dat
  // dezelfde dag opdook — zet je het label ERNA, dan gebeurt er niets meer,
  // want er komt geen tweede Tests-run. De PR blijft liggen tot je opnieuw
  // pusht, en in de praktijk merge je dan met de hand. Precies het gedrag dat
  // deze poort moest vervangen.
  //
  // Daarom draait de workflow nu óók op het zetten van een label, en langs
  // die weg is groen géén gegeven meer: hij zoekt de Tests-run bij deze
  // commit op en geeft het antwoord hier door. Onbekend (null) telt als niet
  // groen — bij twijfel niet samenvoegen.
  //
  // Geen melding: draait de gate nog, dan komt de workflow_run-route hier
  // vanzelf weer langs zodra hij klaar is.
  if (f.testsGroen !== true) {
    return { samenvoegen: false,
             reden: f.testsGroen === false
               ? 'de testgate staat niet groen op ' + String(f.headSha).slice(0, 7)
               : 'geen afgeronde testrun gevonden op ' + String(f.headSha).slice(0, 7),
             melden: false, sleutel: 'niet-groen' };
  }

  // 6. GITHUB REKENT NOG — mergeable is dan null. Geen bevinding en geen
  // melding: bij de volgende run staat er een echt antwoord.
  if (f.mergeable === null || typeof f.mergeable === 'undefined') {
    return { samenvoegen: false, reden: 'GitHub heeft mergeable nog niet bepaald',
             melden: false, sleutel: 'onbekend' };
  }

  // 7. CONFLICT — hier moet een mens aan te pas komen, dus melden.
  if (f.mergeable === false) {
    return { samenvoegen: false,
             reden: 'mergeconflict met ' + f.baseRef,
             melden: true, sleutel: 'conflict' };
  }

  // 8. DE BASIS IS OPGESCHOVEN — dit is de poort die er nog niet was, en hij
  // dekt een gat dat op dit project echt open stond.
  //
  // Een testrun op een pull_request toetst head SAMENGEVOEGD MET base zoals
  // base op dat moment was. Landt er daarna een andere PR op main, dan is die
  // groene vlag verlopen: hij zegt niets over de combinatie die nu zou
  // ontstaan. En PR's landen hier kort na elkaar — #120 en #121 21 minuten,
  // de rico-test-PR's 17 minuten.
  //
  // Dus: achterstand > 0 betekent bijwerken en opnieuw laten toetsen. Dat
  // bijwerken doet deze workflow NIET zelf, en dat is een bewuste keuze:
  // een push met GITHUB_TOKEN start geen nieuwe workflowrun (dat is de rem
  // van GitHub tegen oneindige lussen, op 03-09 hier gemeten). De branch
  // zou dan bijgewerkt zijn met een head die nooit getoetst is — erger dan
  // het probleem. Een mens die op "Update branch" drukt, start de tests wél.
  if (typeof f.achterstand === 'number' && f.achterstand > 0) {
    return { samenvoegen: false,
             reden: f.baseRef + ' loopt ' + f.achterstand + ' commit(s) voor op deze branch',
             melden: true, sleutel: 'achterstand' };
  }

  return { samenvoegen: true, reden: 'groen, `' + LABEL_KLAAR + '` staat erop, ' +
           f.baseRef + ' is niet opgeschoven', melden: false, sleutel: 'ok' };
}

// De tekst die op de PR komt. Apart van besluit() omdat het besluit een feit
// is en de tekst een vorm — en omdat een test dan het besluit kan toetsen
// zonder de formulering vast te leggen.
function meldtekst(b) {
  const kop = '**Niet automatisch samengevoegd** — ' + b.reden + '.';
  if (b.sleutel === 'geen-klaar') {
    return kop + '\n\nSinds 03-09-2026 voegt de workflow alleen samen met het label `' +
      LABEL_KLAAR + '` erop. Dat label betekent: dit werk is af en álles staat gepusht.\n\n' +
      'Waarom die omkering: over 56 PR\'s was de mediaan van openen tot samenvoegen ' +
      '29 seconden, dus er was geen moment om in te grijpen — en elke merge is hier ' +
      'een deploy naar 100% van het verkeer. Zie `automerge-besluit.js`.\n\n' +
      'Zet `' + LABEL_KLAAR + '` erop zodra je klaar bent; de eerstvolgende groene ' +
      'testrun voegt hem dan samen.';
  }
  if (b.sleutel === 'conflict') {
    return kop + '\n\nVoeg de basisbranch in deze branch en los het conflict op. ' +
      'Daarna draait de testgate opnieuw en gaat het vanzelf.';
  }
  if (b.sleutel === 'achterstand') {
    return kop + '\n\nDe groene testrun ging over deze branch samengevoegd met de basis ' +
      '*zoals die toen was*. Er is daarna iets anders geland, dus die vlag zegt niets ' +
      'meer over de combinatie die nu zou ontstaan.\n\n' +
      'Druk op **Update branch** (of voeg de basis met de hand in). Dat start de tests ' +
      'opnieuw, en dán is groen weer groen. De workflow doet dit met opzet niet zelf: ' +
      'een push met `GITHUB_TOKEN` start géén nieuwe testrun, dus je zou een bijgewerkte ' +
      'branch krijgen die nooit getoetst is.';
  }
  return kop;
}

module.exports = { besluit, meldtekst, LABEL_KLAAR, LABEL_VETO };
