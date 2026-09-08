// ══════════════════════════════════════════════════════════════════
// test-formule-escape.js — een zoekterm mag geen formule worden
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Op vier plekken zet worker.js een tekst als letterlijke waarde in een
// Airtable-formule: de inwisselcode, het e-mailadres van klantZoek(), en de
// zoekterm van /admin/klanten en /admin/tabel. Tot #142 gebeurde dat met
// `.replace(/'/g, "\\'")` en verder niets.
//
// Die vervanging is globaal, dus de bekende "alleen het eerste voorkomen"-fout
// is het niet. Het gat zit een laag dieper: de backslash zelf werd niet
// ontsnapt. Typt iemand `a\` en dan een quote, dan maakt de oude regel er
// `a\\'` van — in de formule is `\\` een ontsnapte backslash, en de quote
// dáárna sluit de string alsnog. Alles wat er dan nog achteraan komt, staat
// als formule-syntax in de vraag aan Airtable.
//
// DE TOETS MOET ONDERSCHEIDEN, en dat is hier de hele kunst. Kijken of er een
// backslash vóór elke quote staat bewijst niets — dat deed de oude regel ook.
// Daarom staat er hieronder een losse leesfunctie, `sluitOp()`, die een
// stringliteral leest zoals een formule-parser dat doet: een backslash dekt
// het volgende teken af, een losse quote sluit de string. De vraag die deze
// test stelt is niet "is er geëscaped" maar "gáát de string ergens dicht" —
// en dat is de vraag die ertoe doet.
//
// Dat die leesfunctie werkelijk iets meet, wordt in deel 3 aangetoond: de
// oude regel wordt er letterlijk ingevoerd en moet dan rood worden. Een
// oracle die alles goedkeurt is geen oracle.
//
// Draaien vanuit public/:  node test-formule-escape.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── de echte functie uit worker.js knippen ────────────────────────
// Ankers en geen kopie: verdwijnt of hernoemt formuleTekst, dan stopt deze
// test meteen in plaats van groen te blijven staan op code die niet draait.
const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const van = bron.indexOf('function formuleTekst(s) {');
const tot = bron.indexOf('__name(formuleTekst, "formuleTekst");');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: formuleTekst() is niet gevonden in worker.js.');
  process.exit(1);
}
const src = bron.slice(van, tot);
const formuleTekst = new Function(src + '\nreturn formuleTekst;')();

// ── het oracle ────────────────────────────────────────────────────
// Leest de binnenkant van een stringliteral zoals een formule-parser dat doet.
// Geeft de positie terug waarop de string dichtgaat, of -1 als hij dat niet
// doet. Dit is met opzet géén spiegel van de escaper: het is de andere kant
// van de vraag.
function sluitOp(binnenkant) {
  for (let i = 0; i < binnenkant.length; i++) {
    const c = binnenkant[i];
    if (c === '\\') { i++; continue; }   // backslash dekt het volgende teken af
    if (c === "'") return i;             // losse quote: hier gaat de string dicht
  }
  return -1;
}

// Wat een aanvaller zou proberen. De derde en de vierde zijn de gevallen die
// de oude regel doorliet; de rest staat erbij omdat een fix die alleen dát
// ene geval afvangt niet genoeg is.
const KWAAD = [
  { naam: 'losse quote', in: "a'" },
  { naam: 'quote met formule erachter', in: "',LOWER({PassHash}),'" },
  { naam: 'backslash vlak voor een quote', in: "a\\'" },
  { naam: 'backslash, quote, formule', in: "x\\',SEARCH('a',{PassHash}),'" },
  { naam: 'losse backslash aan het eind', in: 'a\\' },
  { naam: 'twee backslashes en een quote', in: "a\\\\'" },
  { naam: 'alleen een backslash', in: '\\' },
  { naam: 'alleen een quote', in: "'" }
];

console.log('\n1. Geen enkele zoekterm sluit de stringliteral');
for (const k of KWAAD) {
  const uit = formuleTekst(k.in);
  const p = sluitOp(uit);
  toets(k.naam, p < 0,
    'invoer ' + JSON.stringify(k.in) + ' → ' + JSON.stringify(uit) +
    ' sluit op positie ' + p);
}

console.log('\n2. Een gewone zoekterm blijft bruikbaar');
{
  // Een fix die simpelweg alles weggooit haalt deel 1 ook, en is toch fout:
  // de beheerder moet nog steeds op naam en e-mail kunnen zoeken.
  toets('gewone tekst verandert niet', formuleTekst('jan@voorbeeld.nl') === 'jan@voorbeeld.nl');
  toets('spaties en accenten blijven staan', formuleTekst('José Müller') === 'José Müller');
  toets('een naam met apostrof is nog te zoeken',
    formuleTekst("o'brien").indexOf('brien') > 0, formuleTekst("o'brien"));
  toets('de quote is er nog, alleen afgedekt',
    formuleTekst("o'brien").indexOf("\\'") > 0, formuleTekst("o'brien"));
  toets('leeg blijft leeg', formuleTekst('') === '');
  toets('null wordt een lege tekst, geen "null"', formuleTekst(null) === '');
  toets('undefined ook', formuleTekst(undefined) === '');
}

console.log('\n3. Tegenproef: het oracle keurt de oude regel af');
{
  // Dit is met opzet de fout van vóór #142, letterlijk overgetypt. Zou deze
  // regel door deel 1 heen komen, dan meet `sluitOp()` niets en is deze hele
  // test een groene lamp zonder draad erachter.
  const oud = (s) => String(s == null ? '' : s).replace(/'/g, "\\'");
  toets('de oude regel laat `a\\\'` wél uitbreken', sluitOp(oud("a\\'")) >= 0,
    JSON.stringify(oud("a\\'")));
  toets('en de nieuwe niet', sluitOp(formuleTekst("a\\'")) < 0);
  // De oude regel deed het bij een kále quote wél goed — dat is precies waarom
  // dit maanden onopgemerkt kon blijven staan.
  toets('bij een kale quote deed de oude regel het goed', sluitOp(oud("a'")) < 0);
}

console.log('\n4. Geen enkele formuleplek escapet nog met de hand');
{
  // De helper repareert niets zolang er ergens nog een eigen `.replace(/'/g`
  // naast staat. Het blok van formuleTekst zelf (commentaar + body) wordt
  // eruit geknipt; in de rest hoort het patroon nergens meer voor te komen.
  const blokVan = bron.indexOf('// Een tekst veilig als letterlijke waarde in een Airtable-formule zetten.');
  const blokTot = bron.indexOf('__name(formuleTekst, "formuleTekst");');
  if (blokVan < 0 || blokTot < 0) {
    toets('het blok van formuleTekst is te vinden', false, 'anker weg');
  } else {
    const rest = bron.slice(0, blokVan) + bron.slice(blokTot);
    const achterblijvers = (rest.match(/\.replace\(\/'\/g/g) || []).length;
    toets('nergens meer een handmatige quote-escape', achterblijvers === 0,
      achterblijvers + ' plek(ken) over');
    // Buiten het helperblok geteld, dus zonder de declaratie: dit zijn de
    // aanroepplekken zelf. Vier, en dat getal hoort mee te veranderen als er
    // een vijfde formuleplek bij komt — anders glipt die er ongemerkt langs.
    const aanroepen = (rest.match(/formuleTekst\(/g) || []).length;
    toets('alle vier de formuleplekken gaan door de helper', aanroepen === 4,
      aanroepen + ' aanroep(en)');
  }
  toets('elke filterByFormula met een variabele gebruikt e of esc uit de helper',
    bron.indexOf("UPPER({Code})='${esc}'") > 0 && bron.indexOf("LOWER({Email})='${e}'") > 0);
}

console.log('\n' + (fouten ? fouten + ' FOUT(EN)' : 'Alles goed'));
process.exit(fouten ? 1 : 0);
