// ══════════════════════════════════════════════════════════════════
// test-blok7-nulmeting.js — een nulmeting mag niet als "geen verschil" tellen
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Blok 7 ("Zegt bezetting iets over de responstijd?") trok tot 27-08-2026 de
// omgekeerde conclusie bij een nulmeting. Rit 26-08 mat 0 ms bij lage
// bezetting tegen 144 ms bij hoge bezetting en meldde dat als "+0%, vrijwel
// geen verschil" — het tegenovergestelde van wat er gebeurde.
//
// Twee dingen mis:
//   1. Een responstijd van 0 ms is geen meting (het monster kreeg
//      vermoedelijk nooit een antwoord), maar telde gewoon mee in de mediaan
//      van zijn groep en trok die naar nul.
//   2. De deel-door-nul-vangst (`mLaag ? ... : 0`) gaf dan zelf ook 0% terug,
//      en 0% viel door `Math.abs(verschil)<15` heen als "vrijwel geen
//      verschil" — een uitspraak die iets anders betekent dan "onmeetbaar".
//
// Deze test knipt de functie uit pidlane-testrun.js en draait hem tegen
// namaak-monsters — geen nagebouwde versie, de ECHTE code. Zie
// PIDLANE-WERK.md voor het origineel dat dit blootlegde.
//
// Draaien vanuit public/:  node test-blok7-nulmeting.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

const src = fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8');

// Blokgrenzen: de titel-string tot aan de bijbehorende sluitende `}` van de
// functie — matched-braces i.p.v. een vaste regelafstand, want de functie
// verandert van lengte zodra iemand er iets aan toevoegt.
const titel = "'Zegt bezetting iets over de responstijd?'";
const titelIdx = src.indexOf(titel);
if (titelIdx < 0) {
  console.error('FOUT: blok 7 (bezetting/responstijd) niet gevonden in pidlane-testrun.js.');
  process.exit(1);
}
const fnStart = src.indexOf('function () {', titelIdx);
if (fnStart < 0) { console.error('FOUT: functie-body van blok 7 niet gevonden.'); process.exit(1); }
const braceStart = src.indexOf('{', fnStart);
let depth = 1, i = braceStart + 1;
while (i < src.length && depth > 0) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') depth--;
  i++;
}
const fnBody = src.slice(braceStart + 1, i - 1);

// De functie leunt op drie closure-variabelen: sp (monsters), d (drempels),
// med (mediaan-functie) — als parameters meegeven i.p.v. de hele omringende
// (veel grotere) functie moeten uitvoeren. Zelfde mediaan-implementatie als
// PLBudget.mediaan (pidlane-testrun.js, regel ~230).
const mediaan = function (a) {
  if (!a.length) return 0;
  const s = a.slice().sort(function (x, y) { return x - y; });
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : Math.round((s[h - 1] + s[h]) / 2);
};
const toetsFn = new Function('sp', 'd', 'med', fnBody);

let fout = 0, n = 0;
function toets(naam, ok, detail) {
  n++;
  if (ok) { console.log('  ok    ' + naam); return; }
  console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : ''));
  fout++;
}

const D = { bezetAf: 30, bezetOp: 70 };
function monster(bezet, ms) { return { bezet: bezet, ms: ms }; }

console.log('\nBlok 7 — nulmeting\n');

// ── 1. het origineel: een paar nulmetingen tussen echte lage-bezetting-
//      metingen, tegenover een duidelijk hogere respons bij hoge bezetting ──
{
  const sp = [
    monster(10, 0), monster(15, 0), monster(20, 0), monster(25, 52),
    monster(80, 300), monster(85, 310), monster(90, 295)
  ];
  const r = toetsFn(sp, D, mediaan);
  toets('geen "vrijwel geen verschil" wanneer het verschil na filteren groot is',
        !(r && typeof r === 'object' && r.detail && r.detail.indexOf('vrijwel geen verschil') >= 0),
        'kreeg: ' + JSON.stringify(r));
  toets('de genegeerde nulmetingen worden benoemd, niet stil weggelaten',
        typeof r === 'string' && r.indexOf('nulmeting') >= 0, 'kreeg: ' + JSON.stringify(r));
  toets('de mediaan van de lage groep is 52 ms (van de nul-monsters getrokken), niet 0',
        typeof r === 'string' && r.indexOf('lage bezetting 52 ms') >= 0, 'kreeg: ' + JSON.stringify(r));
}

// ── 2. een echt kleine, GEMETEN verschil blijft gewoon "vrijwel geen
//      verschil" — dat is geen bug, dat is precies wat blok 7 hoort te doen ──
{
  const sp = [
    monster(10, 98), monster(15, 100), monster(20, 102),
    monster(80, 108), monster(85, 110), monster(90, 112)
  ];
  const r = toetsFn(sp, D, mediaan);
  toets('een echt klein verschil (geen nullen) geeft nog gewoon LET OP',
        r && r.staat === 'LET OP' && r.detail.indexOf('vrijwel geen verschil') >= 0,
        'kreeg: ' + JSON.stringify(r));
  toets('geen nulmeting-notitie als er geen nullen waren',
        r && r.detail.indexOf('nulmeting') < 0, 'kreeg: ' + JSON.stringify(r));
}

// ── 3. een echt groot verschil (geen nullen) meldt gewoon het percentage,
//      geen LET OP — bezetting voorspelt hier juist wél iets ──
{
  const sp = [
    monster(10, 50), monster(15, 52), monster(20, 48),
    monster(80, 300), monster(85, 310), monster(90, 295)
  ];
  const r = toetsFn(sp, D, mediaan);
  toets('een groot verschil geeft platte tekst, geen LET OP',
        typeof r === 'string' && r.indexOf('vrijwel geen verschil') < 0, 'kreeg: ' + JSON.stringify(r));
  toets('geen nulmeting-notitie als er geen nullen waren',
        typeof r === 'string' && r.indexOf('nulmeting') < 0, 'kreeg: ' + JSON.stringify(r));
}

// ── 4. een groep die ná het filteren helemaal leeg is -> expliciete "te
//      weinig spreiding", nooit een stille 0% ──
{
  const sp = [
    monster(10, 0), monster(15, 0),
    monster(80, 144), monster(85, 150)
  ];
  const r = toetsFn(sp, D, mediaan);
  toets('een groep van louter nulmetingen geeft "te weinig spreiding", geen percentage',
        typeof r === 'string' && r.indexOf('te weinig spreiding') >= 0, 'kreeg: ' + JSON.stringify(r));
  toets('de nulmetingen worden ook hier benoemd',
        typeof r === 'string' && r.indexOf('nulmeting') >= 0, 'kreeg: ' + JSON.stringify(r));
}

// ── 5. geen monsters -> ongewijzigd gedrag (bestond al vóór deze fix) ──
{
  const r = toetsFn([], D, mediaan);
  toets('geen monsters geeft nog steeds "te weinig spreiding", zonder nulmeting-ruis',
        typeof r === 'string' && r.indexOf('te weinig spreiding') >= 0 && r.indexOf('nulmeting') < 0,
        'kreeg: ' + JSON.stringify(r));
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'alle ' + n + ' tests geslaagd') + '\n');
process.exit(fout ? 1 : 0);
