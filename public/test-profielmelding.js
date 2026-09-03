// ══════════════════════════════════════════════════════════════════
// test-profielmelding.js — blok 1 vraagt of het profiel geladen HAD MOETEN zijn
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT (#86)
//
// De proef meldde "staat in de opslag maar is bij het verbinden NIET geladen"
// voor een profiel dat tijdens diezelfde sessie was aangemaakt. Dat kan niet:
// een profiel dat om 11:48:52 ontstaat, kan bij het verbinden van 11:48:30
// niet geladen zijn geweest.
//
// De uitzondering die dat moest opvangen hing aan leeftijd — jonger dan 0.1
// uur. Bij een begeleide rit zit er een kwartier tussen verbinden en meten,
// dus greep hij niet. En de marge oprekken verschuift het alleen: bij een rit
// van veertig minuten is het weer mis.
//
// De vraag is niet hoe OUD het profiel is maar of het ná het verbinden is
// ontstaan. Deze test bewaakt dat onderscheid, aan allebei de kanten — want
// "meld nooit meer iets" zou ook groen geven.
//
// Draaien vanuit public/:  node test-profielmelding.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

const bron = fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8');
const a = bron.indexOf('// ── HET PROFIELOORDEEL');
const b = bron.indexOf('// ── einde profieloordeel-blok');
if (a < 0 || b < 0) { console.log('FOUT: knippad niet gevonden in pidlane-testrun.js'); process.exit(1); }

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(bron.slice(a, b) + '\nthis._profielOordeel = _profielOordeel;', ctx);
const oordeel = ctx._profielOordeel;

let n = 0, fout = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) console.log('  ok  ' + naam);
  else { fout++; console.log('  FOUT ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
const isLetOp = r => r && typeof r === 'object' && r.staat === 'LET OP';
const tekst  = r => (r && typeof r === 'object') ? String(r.detail || '') : String(r || '');

// Een profiel met 55 PIDs en health-oordelen, zoals de app het wegschrijft.
const maakProf = ts => ({ pids: new Array(55).fill('0100'), health: { '0105': 'ok' }, ts: ts });

const UUR = 36e5;
const VERBOND = 1700000000000;          // moment waarop deze sessie verbond

console.log('Profielmelding blok 1 — is dit profiel ná het verbinden ontstaan?\n');

console.log('1. Het geval uit #86: profiel ontstaat tijdens de sessie, rit duurt lang');
{
  // Verbonden om T0, profiel vijf minuten later aangemaakt door de discovery,
  // testrun draait na een rit van drie kwartier. De oude leeftijdsregel gaf
  // hier LET OP omdat 0.67 uur ruim boven 0.1 ligt.
  const prof = maakProf(VERBOND + 5 * 60000);
  const nu = VERBOND + 45 * 60000;
  const r = oordeel(prof, false, VERBOND, nu);
  toets('geen LET OP meer bij een rit van drie kwartier', !isLetOp(r), tekst(r));
  toets('en de melding zegt waaróm', /ná het verbinden van deze sessie aangemaakt/.test(tekst(r)), tekst(r));
  toets('de leeftijd staat er nog steeds bij', /0\.7 uur oud/.test(tekst(r)), tekst(r));
}

console.log('\n2. TEGENPROEF — een profiel dat er al stond en genegeerd is');
{
  // Dit moet WEL blijven melden, anders is de proef stilgezet in plaats van
  // gerepareerd. Twee uur vóór het verbinden opgeslagen, niet geladen.
  const prof = maakProf(VERBOND - 2 * UUR);
  const r = oordeel(prof, false, VERBOND, VERBOND + 60000);
  toets('meldt nog steeds LET OP', isLetOp(r), tekst(r));
  toets('met de oorspronkelijke uitleg', /NIET geladen; de app deed een volle discovery/.test(tekst(r)), tekst(r));
}

console.log('\n3. TEGENPROEF — vlak vóór het verbinden opgeslagen telt óók als genegeerd');
{
  // Eén seconde vóór het verbindingsmoment. Leeftijd zou hem "vers" noemen;
  // de vraag die de proef stelt zegt iets anders. Dit is het geval waar de
  // twee regels uit elkaar lopen, dus het onderscheidt echt.
  const prof = maakProf(VERBOND - 1000);
  const r = oordeel(prof, false, VERBOND, VERBOND + 30000);
  toets('een profiel van één seconde oud maar van vóór het verbinden meldt LET OP',
        isLetOp(r), tekst(r));
}

console.log('\n4. Een geladen profiel meldt niets, ongeacht de rest');
{
  const r = oordeel(maakProf(VERBOND - 5 * UUR), true, VERBOND, VERBOND + 60000);
  toets('meldt "snelle start"', !isLetOp(r) && /bij het verbinden geladen/.test(tekst(r)), tekst(r));
}

console.log('\n5. Zonder profielHealth() doet de proef geen uitspraak');
{
  const r = oordeel(maakProf(VERBOND), undefined, VERBOND, VERBOND);
  toets('zegt dat het niet vast te stellen is',
        /niet vast te stellen/.test(tekst(r)), tekst(r));
  toets('en dat is geen LET OP — ontbrekende voorwaarden zijn geen bevinding', !isLetOp(r), tekst(r));
}

console.log('\n6. Terugval als het verbindingsmoment ontbreekt');
{
  // Een sessie die al verbonden was voordat deze versie geladen werd heeft
  // geen stempel. Dan is leeftijd het enige dat er is — mét die reden erbij,
  // zodat de melding niet stelliger klinkt dan hij kan zijn.
  const jong = oordeel(maakProf(VERBOND), false, null, VERBOND + 2 * 60000);
  toets('een vers profiel meldt geen LET OP', !isLetOp(jong), tekst(jong));
  toets('en zegt erbij dat er op leeftijd is beoordeeld',
        /beoordeeld op leeftijd/.test(tekst(jong)), tekst(jong));

  const oud = oordeel(maakProf(VERBOND - 3 * UUR), false, null, VERBOND);
  toets('een oud profiel meldt zonder stempel nog steeds LET OP', isLetOp(oud), tekst(oud));
}

console.log('\n7. TEGENPROEF op de terugval — het stempel wint van de leeftijd');
{
  // Zelfde profiel, één keer mét en één keer zónder stempel. Met stempel is
  // het "ná het verbinden ontstaan" en dus goed; zonder stempel valt het
  // buiten de 0.1-uurgrens en is het LET OP. Lopen die twee niet uiteen, dan
  // doet het stempel niets en toetst de rest van dit bestand niets.
  const prof = maakProf(VERBOND + 60000);
  const nu = VERBOND + 30 * 60000;
  const met = oordeel(prof, false, VERBOND, nu);
  const zonder = oordeel(prof, false, null, nu);
  toets('mét stempel: geen bevinding', !isLetOp(met), tekst(met));
  toets('zónder stempel: wél LET OP', isLetOp(zonder), tekst(zonder));
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
