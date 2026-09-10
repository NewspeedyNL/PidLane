// ══════════════════════════════════════════════════════════════════
// test-mutatietabel.js — de tabel van plmutate.sh is leesbaar voor bash (#180)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
// De mutatietabel staat in een bash-array met dubbele aanhalingstekens, en
// daarin voert een backtick een commando uit. Regel 253 droeg `Klaar` zonder
// ontsnapping; bij het inlezen van MUTATIES=( … ) draaide bash dus letterlijk
// `Klaar`, meldde "command not found" op stderr, en de omschrijving die
// overbleef was "labels weer hoofdlettergevoelig:  doet niets meer".
//
// DAT IS DE ONSCHULDIGE VARIANT. Zit de backtick in het ZOEK-anker — een
// template literal uit een .js, of ``` uit een .md — dan wordt het anker door
// de substitutie korter en schuiven de @@-velden op. Precies dat gebeurde op
// 10-09-2026 bij twee nieuwe mutaties op PLAY-INZENDING.md: plmutate meldde
// "test-playteksten.js bestaat niet" terwijl het bestand er gewoon stond,
// want het vierde veld was inmiddels de omschrijving. Dat is exit 1 met een
// reden die nergens klopt, en de fout zit in een bestand dat niemand als code
// leest.
//
// WAAROM DE TEGENPROEF HIER IN HET BESTAND ZIT EN NIET IN plmutate.sh.
// De gewone regel is: bouw de fout na in de mutatietabel. Dat kan hier niet.
// plmutate.sh schrijft in het bestand dat op dat moment zélf draait, en bash
// leest een script niet in één keer maar per stuk, op byte-positie — een
// mutatie die de lengte verandert laat de rest van het script op een
// verschoven punt verder lezen. De controles hieronder zijn daarom losse
// functies die in deel 5 op verzonnen regels worden losgelaten.
//
// Draaien vanuit public/:  node test-mutatietabel.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const wortel = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(wortel, 'plmutate.sh'), 'utf8');

// Op de array ankeren en niet op regelnummers: de tabel groeit bij elke
// ronde. Verdwijnt het anker, dan stopt deze test met een FOUT in plaats van
// groen te blijven staan op een lege lijst.
const van = script.indexOf('MUTATIES=(');
const tot = script.indexOf('\n)\n', van);
if (van < 0 || tot < 0) {
  console.error('FOUT: de MUTATIES-array is niet gevonden in plmutate.sh (anker verschoven?).');
  process.exit(1);
}
const regels = script.slice(van, tot).split('\n').filter(r => r.startsWith('"'));

// ── de drie controles, als losse functies ─────────────────────────
// In een bash-string met dubbele aanhalingstekens zijn dit de tekens die
// bash zelf oppakt. Een backslash ervoor maakt ze weer gewoon tekst.
function ruweBacktick(regel) { return /(?<!\\)`/.test(regel); }
// Een $ is alleen gevaarlijk als er een naam, { of ( achter staat. "{17}$/"
// in een reguliere expressie is voor bash gewoon een dollarteken.
function ruweDollar(regel) { return /(?<!\\)\$[A-Za-z_{(]/.test(regel); }
// Vijf velden: bestand, zoek, vervang, test, omschrijving.
function veldenTellen(regel) { return regel.split('@@').length; }

console.log('\n1. De tabel is er nog en heeft inhoud');
toets('de MUTATIES-array bevat regels (' + regels.length + ')', regels.length >= 100,
      'minder dan verwacht — is de tabel opgeknipt, dan moet dit anker mee');

console.log('\n2. Geen enkele regel laat bash een commando uitvoeren');
{
  const metBacktick = regels.filter(ruweBacktick);
  toets('geen niet-ontsnapte backtick', metBacktick.length === 0,
        metBacktick.length + ' regel(s), te beginnen met:\n        ' +
        (metBacktick[0] || '').slice(0, 120) + '\n        schrijf hem als \\` — anders voert bash de inhoud uit');

  const metDollar = regels.filter(ruweDollar);
  toets('geen niet-ontsnapte $-expansie', metDollar.length === 0,
        metDollar.length + ' regel(s), te beginnen met:\n        ' +
        (metDollar[0] || '').slice(0, 120) + '\n        schrijf hem als \\$ — anders vult bash een variabele in');
}

console.log('\n3. Elke regel heeft vijf velden');
{
  const scheef = regels.filter(r => veldenTellen(r) !== 5);
  toets('elke regel splitst in bestand@@zoek@@vervang@@test@@omschrijving',
        scheef.length === 0,
        scheef.length + ' regel(s) met ' + scheef.map(veldenTellen).join('/') + ' velden:\n        ' +
        (scheef[0] || '').slice(0, 120));
}

console.log('\n4. Elk genoemd bestand bestaat');
{
  const ontbreekt = [];
  const geenTest = [];
  for (const regel of regels) {
    const veld = regel.replace(/^"/, '').replace(/"$/, '').split('@@');
    if (veld.length !== 5) continue;           // deel 3 meldt die al
    if (!fs.existsSync(path.join(wortel, veld[0]))) ontbreekt.push(veld[0]);
    if (!fs.existsSync(path.join(__dirname, veld[3]))) geenTest.push(veld[3]);
  }
  // plmutate slaat zo'n mutatie over en geeft exit 1 — maar pas als je hem
  // draait, en dat is niet de commit-poort. Hier valt het meteen op, met de
  // naam van het bestand erbij.
  toets('het bronbestand van elke mutatie staat er', ontbreekt.length === 0,
        [...new Set(ontbreekt)].join(', '));
  toets('de test die rood moet worden staat er ook', geenTest.length === 0,
        [...new Set(geenTest)].join(', '));
}

console.log('\n5. Tegenproef: de controles keuren een kapotte regel af');
{
  toets('een regel met `Klaar` erin wordt afgekeurd',
        ruweBacktick('"a.js@@x@@y@@test-a.js@@labels: `Klaar` doet niets"'),
        'ruweBacktick() ziet niets — dan bewaakt deel 2 hierboven niets');
  toets('en een ontsnapte backtick mag blijven staan',
        !ruweBacktick('"a.js@@x@@y@@test-a.js@@labels: \\`Klaar\\` doet niets"'),
        'dan zou elke goede regel ook rood staan, en dat is geen controle maar ruis');
  toets('een regel met ${VAR} wordt afgekeurd',
        ruweDollar('"a.yml@@ref: ${{ github.ref }}@@@@test-a.js@@x"'),
        'ruweDollar() ziet niets');
  toets('maar "{17}$/" uit een regex niet',
        !ruweDollar('"a.js@@/^[A-Z]{17}$/;@@/^[A-Z]{17}$/i;@@test-a.js@@x"'),
        'dan slaat de controle alarm op twee bestaande mutaties die niets mankeren');
  toets('een regel met vier velden wordt afgekeurd',
        veldenTellen('"a.js@@x@@y@@test-a.js"') !== 5,
        'veldenTellen() telt niet wat plmutate leest');
}

console.log('\n' + (fouten ? fouten + ' van ' + n + ' FOUT' : 'alle ' + n + ' tests geslaagd') + '\n');
process.exit(fouten ? 1 : 0);
