// ══════════════════════════════════════════════════════════════════
// test-testgate.js — de namen waar de ruleset op wacht
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// De ruleset op `main` eist dat een aantal checks groen is vóórdat een PR
// samengevoegd mag worden. Zo'n eis is een lijst NAMEN, en die lijst staat op
// GitHub — niet in deze repo. De andere helft staat hier, in de `name:` van
// elke job in tests.yml.
//
// Twee lijsten van hetzelfde dus, en dat is de vorm die dit project al drie
// keer geraakt heeft. Het verschil met de vorige keren is dat deze bijzonder
// stil faalt: hernoem je een job, dan wacht de ruleset op een naam die nooit
// meer gerapporteerd wordt. GitHub zegt dan "Expected — waiting for status to
// be reported", de PR blokkeert, en er is niets roods. Voor altijd, op élke
// PR, en niet te vinden door iets in de repo te lezen.
//
// WAT DEZE TOETS WEL EN NIET KAN
// Hij kan de ruleset niet lezen; die staat buiten de repo en er is van hier
// geen weg naartoe. Wat hij wél kan is de kant bewaken die hier staat: de
// namen liggen vast, en wie er een verandert krijgt plcheck.sh rood met de
// reden erbij. De wijziging wordt daarmee niet verboden — hij wordt zichtbaar,
// en dan weet je dat de ruleset mee moet.
//
// Dat is de enige eerlijke vorm die hier mogelijk is: een koppeling die je
// niet kunt afdwingen, maar wel kunt laten opvallen.
//
// Draaien vanuit public/:  node test-testgate.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

const wf = fs.readFileSync(
  path.join(__dirname, '..', '.github/workflows/tests.yml'), 'utf8');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// De namen zoals ze in de ruleset op GitHub staan. Verandert er hier één, dan
// verandert hij daar mee — anders blokkeert elke PR.
const VERWACHT = [
  'plcheck (syntax, tests, structuur)',
  'tegenproef (bouwt fouten na, verwacht rood)',
  'browserproeven (de echte app in een echte browser)',
  'Geen sleutels in de repo'
];

console.log('\n1. De jobnamen liggen vast');

// Alleen de namen van JOBS, niet die van stappen. Een job-`name:` staat op vier
// spaties inspringing onder `jobs:`; een stap-`name:` staat dieper en achter een
// streepje. Zonder dat onderscheid telt "Checkout" mee en meet deze toets iets
// anders dan hij zegt.
const jobNamen = [];
const re = /^ {4}name:[ \t]*(.+?)[ \t]*$/gm;
let m;
while ((m = re.exec(wf)) !== null) jobNamen.push(m[1]);

toets('er staan precies ' + VERWACHT.length + ' jobs in tests.yml',
      jobNamen.length === VERWACHT.length,
      'gevonden: ' + jobNamen.length + ' → ' + JSON.stringify(jobNamen));

for (const naam of VERWACHT) {
  toets('de check "' + naam + '" bestaat nog onder die naam',
        jobNamen.indexOf(naam) >= 0,
        'de ruleset op main wacht op deze naam; hernoemen blokkeert elke PR stil');
}

// En de andere kant op: een job erbij is geen fout, maar hij is ook niet
// verplicht in de ruleset. Dat hoort iemand te weten in plaats van te ontdekken.
const onbekend = jobNamen.filter(n => VERWACHT.indexOf(n) < 0);
toets('geen job die de ruleset niet kent',
      onbekend.length === 0,
      'nieuw: ' + JSON.stringify(onbekend) + ' — voeg hem toe aan de ruleset én aan VERWACHT, of hij is niet verplicht');

console.log('\n2. En de gate draait nog op het event waar de ruleset op rekent');

// Zonder pull_request-run wordt geen enkele check gerapporteerd, en dan wacht
// de ruleset op vier namen die nooit komen. Dezelfde stille blokkade, andere
// oorzaak.
toets('tests.yml draait op pull_request',
      /^\s*pull_request:\s*$/m.test(wf),
      'anders rapporteert niets en blokkeert de ruleset elke PR');

console.log('');
if (fouten) { console.log('test-testgate: ' + fouten + ' fout(en)'); process.exit(1); }
console.log('test-testgate: alles goed');
