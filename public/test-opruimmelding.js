// ══════════════════════════════════════════════════════════════════
// test-opruimmelding.js — blok 14 leest de opruimregel bij de gate
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (#29)
// Blok 14 beoordeelde de opruimregel door in het log te grepen op
// /opgeruimd/i. Dat log is een ringbuffer: pidlane-auth.js kapt `localLog`
// stil af op 500 regels, pidlane-btflow.js kapt `_btLog` af op 1400. Een rit
// van een half uur wist daarmee zijn eigen bewijs — en blok 14 concludeerde
// dan "niets opgeruimd in N min — na vijf minuten had de regel moeten kunnen
// vuren; controleer of hij aanstaat". Precies het onderzoek dat je niet moet
// doen, want de regel had wél gevuurd.
//
// De bron is nu `pidOpgeruimdLijst()`: een Set die de hele sessie blijft
// staan, met per PID de reden erbij. Deze test bewaakt dat de melding die
// bron volgt en niet het log.
//
// Knippad: `_opruimStand` uit pidlane-testrun.js, tussen
// `// ── DE OPRUIMMELDING` en `// ── einde opruimmelding-blok`.
// Verplaats je die ankers, verplaats dan ook deze test.
//
// Draaien vanuit public/:  node test-opruimmelding.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

const bron = fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8');
const a = bron.indexOf('// ── DE OPRUIMMELDING');
const b = bron.indexOf('// ── einde opruimmelding-blok');
if (a < 0 || b < 0) { console.log('FOUT: knippad niet gevonden in pidlane-testrun.js'); process.exit(1); }

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(bron.slice(a, b) + '\nthis._opruimStand = _opruimStand;', ctx);
const stand = ctx._opruimStand;

let n = 0, fout = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fout++; }
}

// De rit van 27-08 uit #29: twee sensoren opgeruimd op 14:11 en 14:13, de
// testrun draaide om 14:16. In het log stond het; in een langere rit was het
// eruit geschoven. Dit is die tweede situatie.
const GERUIMD = [
  { pid: '015E', naam: 'Brandstofverbruik', reden: '5 pogingen plus 5 herkansingen zonder antwoord' },
  { pid: '0FFF', naam: '0FFF', reden: 'zelftest' }
];
const LOGREGELS = [
  { ts: '14:11:25', type: 'warn', msg: '🧹 Sensor 015E (Brandstofverbruik) opgeruimd: 5 pogingen plus 5 herkansingen zonder antwoord.' },
  { ts: '14:13:03', type: 'warn', msg: '🧹 Sensor 0FFF (0FFF) opgeruimd: zelftest.' }
];
const RUIS = [
  { ts: '14:09:00', type: 'info', msg: 'Pollronde gestart' },
  { ts: '14:15:00', type: 'info', msg: 'Snelheid 62 km/u' }
];

console.log('\n1. De gate telt, ook als het log is afgekapt');
{
  // Dit is de kern van #29: precies de stand waarin de oude versie de
  // verkeerde kant op wees.
  const r = stand(GERUIMD, RUIS, 9 * 60);
  toets('meldt de twee opgeruimde sensoren', /2x opgeruimd/.test(r.detail), r.detail);
  toets('noemt 015E bij naam', /015E/.test(r.detail), r.detail);
  toets('noemt de reden erbij', /herkansingen/.test(r.detail), r.detail);
  toets('zegt NIET "niets opgeruimd"', !/niets opgeruimd/i.test(r.detail), r.detail);
  toets('stuurt niet naar "controleer of hij aanstaat"',
        !/controleer of hij aanstaat/i.test(r.detail), r.detail);
  toets('is een bevinding, geen groen vinkje', r.staat === 'LET OP', r.staat);
}

console.log('\n2. Tegenproef: de oude, log-lezende versie zakt hier wél');
{
  // De fout nagebouwd zoals hij tot 01-09-2026 in blok 14 stond. Draait hij
  // over dezelfde invoer, dan hoort hij de melding te geven die #29 beschrijft.
  // Blijft deze toets groen terwijl toets 1 dat ook is, dan meet toets 1 niets.
  function oudeStand(lijst, regels, duurS) {
    const op = (regels || []).filter(r => /opgeruimd/i.test(String(r.msg || '')));
    if (!op.length)
      return { staat: duurS > 300 ? 'LET OP' : 'ok',
               detail: 'niets opgeruimd in ' + Math.round(duurS / 60) + ' min' +
                 (duurS > 300 ? ' — na vijf minuten had de regel moeten kunnen vuren; controleer of hij aanstaat' : '') };
    return { staat: 'LET OP', detail: op.length + 'x opgeruimd' };
  }
  const oud = oudeStand(GERUIMD, RUIS, 9 * 60);
  toets('de oude versie meldt hier "niets opgeruimd"', /niets opgeruimd/i.test(oud.detail), oud.detail);
  toets('de oude versie stuurt naar het verkeerde onderzoek',
        /controleer of hij aanstaat/i.test(oud.detail), oud.detail);
  toets('de nieuwe versie geeft een ander oordeel dan de oude',
        stand(GERUIMD, RUIS, 9 * 60).detail !== oud.detail);
}

console.log('\n3. Staat het log er nog wél in, dan bevestigt het alleen');
{
  const r = stand(GERUIMD, RUIS.concat(LOGREGELS), 9 * 60);
  toets('meldt nog steeds twee uit de gate', /2x opgeruimd/.test(r.detail), r.detail);
  toets('noemt de bevestiging uit het log', /log bevestigt er 2/.test(r.detail), r.detail);
  toets('noemt het tijdstip', /14:11:25/.test(r.detail), r.detail);
}

console.log('\n4. Een lege gate is een uitkomst, geen verdachtmaking');
{
  const r = stand([], RUIS, 20 * 60);
  toets('staat op ok', r.staat === 'ok', r.staat);
  toets('zegt waaraan het gemeten is', /pidOpgeruimdLijst/.test(r.detail), r.detail);
  toets('stuurt niet naar "controleer of hij aanstaat"',
        !/controleer of hij aanstaat/i.test(r.detail), r.detail);
  toets('meldt de duur', /20 min/.test(r.detail), r.detail);
}

console.log('\n5. Gate leeg maar het log noemt er een: dat is een fout');
{
  const r = stand([], LOGREGELS, 9 * 60);
  toets('staat op FOUT', r.staat === 'FOUT', r.staat);
  toets('benoemt de tegenspraak', /spreken elkaar tegen/.test(r.detail), r.detail);
}

console.log('\n6. Zonder bron geen uitspraak');
{
  for (const leeg of [null, undefined, 'kapot', {}]) {
    const r = stand(leeg, RUIS, 20 * 60);
    toets('geen bron (' + JSON.stringify(leeg) + ') → LET OP, geen conclusie',
          r.staat === 'LET OP' && /ontbreekt of gaf een fout/.test(r.detail), r.staat + ' / ' + r.detail);
  }
}

console.log('\n7. Herstel vóór het opruimen wordt apart geteld');
{
  const herstel = RUIS.concat([{ ts: '14:12:00', type: 'ok', msg: 'Sensor 0110 antwoordt weer na 3 herkansingen' }]);
  const r = stand([], herstel, 20 * 60);
  toets('telt het herstel', /1x hersteld/.test(r.detail), r.detail);
  toets('zegt erbij dat dat uit het log komt', /volgens het log/.test(r.detail), r.detail);
  toets('een herstel maakt er nog geen opruimactie van', r.staat === 'ok', r.staat);
}

console.log('\n8. Meer dan zes opgeruimde sensoren wordt afgekapt met een telling');
{
  const veel = [];
  for (let i = 0; i < 9; i++) veel.push({ pid: '01' + (0x40 + i).toString(16).toUpperCase(), naam: 'S' + i, reden: 'stil' });
  const r = stand(veel, RUIS, 30 * 60);
  toets('meldt er negen', /9x opgeruimd/.test(r.detail), r.detail);
  toets('kapt de opsomming af', /\+3 meer/.test(r.detail), r.detail);
}

console.log('\n9. Dezelfde opruiming in beide logs telt één keer (#104)');
{
  // Dit is precies wat pidOpruimen() doet: btDiag() zet de kale tekst in de
  // BT-log, log() zet dezelfde tekst met een 🧹 ervoor in de app-log. Blok 14
  // plakt die twee buffers aan elkaar.
  const kaal = 'Sensor 015E (Brandstofverbruik) opgeruimd: 5 pogingen plus 5 herkansingen zonder antwoord. ' +
               'Komt deze sessie niet terug; een nieuwe sessie probeert opnieuw.';
  const beide = [{ ts: '23:22:02', type: 'warn', msg: kaal },
                 { ts: '23:22:02', type: 'warn', msg: '🧹 ' + kaal }];
  const lijst = [{ pid: '015E', naam: 'Brandstofverbruik', reden: '5 pogingen plus 5 herkansingen zonder antwoord' }];

  const r = stand(lijst, beide, 6 * 60);
  toets('het log bevestigt er één, niet twee',
        /het log bevestigt er 1:/.test(r.detail), r.detail);

  // TEGENPROEF A — twee ECHTE opruimingen van verschillende sensoren in
  // dezelfde seconde moeten er wél twee blijven. Zonder deze toets zou
  // "gooi alles weg wat op elkaar lijkt" ook groen geven.
  const tweeSensoren = [
    { ts: '23:22:02', type: 'warn', msg: '🧹 Sensor 015E (Brandstofverbruik) opgeruimd: geen antwoord.' },
    { ts: '23:22:02', type: 'warn', msg: '🧹 Sensor 0146 (Omgevingstemp) opgeruimd: geen antwoord.' }];
  const r2 = stand([{ pid: '015E', naam: 'Brandstofverbruik', reden: 'geen antwoord' },
                    { pid: '0146', naam: 'Omgevingstemp', reden: 'geen antwoord' }], tweeSensoren, 6 * 60);
  toets('twee verschillende sensoren blijven twee regels',
        /het log bevestigt er 2:/.test(r2.detail), r2.detail);

  // TEGENPROEF B — dezelfde sensor op een ander tijdstip is een andere
  // gebeurtenis en mag niet samenvallen.
  const anderMoment = [
    { ts: '23:22:02', type: 'warn', msg: '🧹 Sensor 015E (Brandstofverbruik) opgeruimd: geen antwoord.' },
    { ts: '23:31:40', type: 'warn', msg: '🧹 Sensor 015E (Brandstofverbruik) opgeruimd: geen antwoord.' }];
  const r3 = stand([{ pid: '015E', naam: 'Brandstofverbruik', reden: 'geen antwoord' }], anderMoment, 20 * 60);
  toets('dezelfde sensor op een ander tijdstip telt apart',
        /het log bevestigt er 2:/.test(r3.detail), r3.detail);

  // TEGENPROEF C — de tegenspraakmelding (gate leeg, log niet) moet blijven
  // werken, en ook dáár met het ontdubbelde aantal.
  const r4 = stand([], beide, 6 * 60);
  toets('gate leeg maar log gevuld blijft FOUT', r4.staat === 'FOUT', r4.staat);
  toets('en noemt dan één regel, niet twee',
        /het log 1 opruimregel\(s\) noemt/.test(r4.detail), r4.detail);
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
