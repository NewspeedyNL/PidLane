// ══════════════════════════════════════════════════════════════════
// test-opdrachtvoorwaarden.js — voorwaarden en het driewaardige oordeel (#257)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT ER IS. Van de twintig LET OP-regels op de rit van 18-09-2026
// gingen er negen niet over de auto maar over omstandigheden die er niet
// waren: geen stilstand, geen warme motor, geen achtergrondstap. Ze stonden
// pas ná de rit in het verslag, tussen de rest, en toen was de rit voorbij.
//
// Een opdracht draagt daarom sinds vandaag `voorwaarden`, in dezelfde
// meetbare vorm als zijn proeven, en het oordeel is driewaardig geworden:
//
//   nog niet   — de omstandigheden waren er niet
//   bevinding  — gemeten, buiten de band; ook een antwoord, maar er moet
//                iemand naar kijken
//   gesloten   — gemeten, binnen de band, voorwaarden vervuld
//
// WAT HIER HET SCHERPST GETOETST WORDT: dat `nog niet` en `bevinding` echt
// uit elkaar komen. Een tweewaardig oordeel dat allebei "fout" noemt, klopt
// namelijk óók — en zegt niets. Zie CLAUDE.md: de toets moet onderscheiden,
// niet alleen kloppen.
//
// Draaien vanuit public/:  node test-opdrachtvoorwaarden.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

// De ECHTE module, niet een kopie van de regels. `getPidDef` ontbreekt met
// opzet: dan blijft de vormcontrole over en toetsen we hier de vorm, niet de
// PID-tabel — die heeft zijn eigen toets.
function laad(per) {
  const s = { console: { warn: function () { } } };
  s.window = s;
  s.PLRit = { per: function () { return per; } };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-opdracht.js', 'utf8'), s, { filename: 'pidlane-opdracht.js' });
  if (!s.PLOpdracht) throw new Error('PLOpdracht ontbreekt — is pidlane-opdracht.js hernoemd?');
  if (typeof s.PLOpdracht.oordeel !== 'function') throw new Error('PLOpdracht.oordeel() ontbreekt (#257)');
  return s.PLOpdracht;
}

let fouten = 0;
function eis(waar, wat) {
  if (waar) { console.log('  ok   ' + wat); return; }
  console.log('  FOUT ' + wat);
  fouten++;
}

// Eén opdracht, twee voorwaarden (een meting en een stap) en één proef.
function bouw(extra) {
  return Object.assign({
    schema: 2,
    naam: 'Start/stop bij stilstand',
    sensoren: ['010C', '0105'],
    duurS: 600,
    voorwaarden: [
      { wat: 'warme motor', pid: '0105', meet: 'max', tussen: [80, 115] },
      { wat: 'achtergrondstap gezet', stap: 'achtergrond in' }
    ],
    proeven: [
      { issue: '#226', naam: 'de motor is een keer gestopt', pid: '010C', meet: 'min', tussen: [0, 50] }
    ]
  }, extra || {});
}

console.log('1. keur() laat schema 1 en 2 allebei door');
{
  const o = laad({});
  eis(o.keur(bouw()).ok, 'schema 2 met voorwaarden wordt goedgekeurd');
  const oud = bouw(); delete oud.voorwaarden; oud.schema = 1;
  eis(o.keur(oud).ok, 'schema 1 zonder voorwaarden blijft draaien — er staat een voorraad van in de tabel');
  const drie = bouw(); drie.schema = 3;
  eis(!o.keur(drie).ok, 'schema 3 wordt afgewezen');
  const k = o.keur(bouw());
  eis(k.ok && k.opdracht.schema === 2, 'de kopie draagt het schema van de RIJ en niet dat van de app');
}

console.log('2. keur() wijst een voorwaarde af die niet deugt');
{
  const o = laad({});
  const geen = bouw(); geen.voorwaarden = [{ wat: 'iets' }];
  eis(!o.keur(geen).ok, 'een voorwaarde zonder pid én zonder stap wordt afgewezen');
  const beide = bouw(); beide.voorwaarden = [{ wat: 'iets', pid: '0105', meet: 'max', tussen: [0, 1], stap: 'x' }];
  eis(!o.keur(beide).ok, 'een voorwaarde met pid ÉN stap wordt afgewezen');
  const naamloos = bouw(); naamloos.voorwaarden = [{ pid: '0105', meet: 'max', tussen: [0, 1] }];
  eis(!o.keur(naamloos).ok, 'een voorwaarde zonder `wat` wordt afgewezen — een vinkje zonder naam helpt niemand');
  const rotpid = bouw(); rotpid.voorwaarden = [{ wat: 'x', pid: '42', meet: 'max', tussen: [0, 1] }];
  eis(!o.keur(rotpid).ok, 'een voorwaarde met een onmogelijke PID wordt afgewezen');
  const rotmaat = bouw(); rotmaat.voorwaarden = [{ wat: 'x', pid: '0105', meet: 'gemiddelde', tussen: [0, 1] }];
  eis(!o.keur(rotmaat).ok, 'een voorwaarde met een maat die de ritwaarnemer niet kent, wordt afgewezen');
}

console.log('3. NOG NIET — de omstandigheden waren er niet');
{
  // Koude motor: de voorwaarde "warme motor" is niet vervuld. De proef zelf
  // zou groen zijn, en juist dát is het geval dat vroeger "ok" heette.
  const o = laad({ '0105': { n: 40, min: 20, max: 62, veranderingen: 30 },
                   '010C': { n: 90, min: 0, max: 2400, veranderingen: 80 } });
  const k = o.keur(bouw());
  const v = o.oordeel(k.opdracht, function () { return true; });
  eis(v.staat === 'nog niet', 'koude motor -> "nog niet" (was: ' + v.staat + ')');
  eis(/warme motor/.test(v.reden), 'de reden noemt de voorwaarde die ontbrak');
  eis(v.voorwaarden.length === 2, 'beide voorwaarden komen terug in de uitkomst');
}

console.log('4. NOG NIET — de stap is niet gezet, ook al is alles gemeten');
{
  const o = laad({ '0105': { n: 40, min: 20, max: 95, veranderingen: 30 },
                   '010C': { n: 90, min: 0, max: 2400, veranderingen: 80 } });
  const k = o.keur(bouw());
  const v = o.oordeel(k.opdracht, function () { return false; });
  eis(v.staat === 'nog niet', 'stap niet gezet -> "nog niet" (was: ' + v.staat + ')');
  eis(/achtergrondstap/.test(v.reden), 'de reden noemt de stap');
}

console.log('5. NIET NA TE GAAN is iets anders dan NIET GEDAAN (#227)');
{
  const o = laad({ '0105': { n: 40, min: 20, max: 95, veranderingen: 30 },
                   '010C': { n: 90, min: 0, max: 2400, veranderingen: 80 } });
  const k = o.keur(bouw());
  const zonder = o.oordeel(k.opdracht);                       // geen stapcontrole meegegeven
  const stap = zonder.voorwaarden.filter(function (x) { return x.soort === 'stap'; })[0];
  eis(stap && stap.vervuld === null, 'zonder stapcontrole is het antwoord null en niet false');
  eis(stap && /niet na te gaan/.test(stap.detail), 'en de tekst zegt dat ook');

  const kapot = o.oordeel(k.opdracht, function () { throw new Error('stuk'); });
  const s2 = kapot.voorwaarden.filter(function (x) { return x.soort === 'stap'; })[0];
  eis(s2 && s2.vervuld === null, 'een stapcontrole die gooit geeft null, geen stille false');
}

console.log('6. BEVINDING — gemeten, en buiten de band');
{
  // Warme motor, stap gezet, maar het toerental ging nooit naar nul.
  const o = laad({ '0105': { n: 40, min: 20, max: 95, veranderingen: 30 },
                   '010C': { n: 90, min: 780, max: 2400, veranderingen: 80 } });
  const k = o.keur(bouw());
  const v = o.oordeel(k.opdracht, function () { return true; });
  eis(v.staat === 'bevinding', 'alles vervuld en de meting buiten de band -> "bevinding" (was: ' + v.staat + ')');
  eis(/010C/.test(v.reden), 'de reden noemt de PID en de gemeten waarde');
}

console.log('7. GESLOTEN — gemeten, binnen de band, voorwaarden vervuld');
{
  const o = laad({ '0105': { n: 40, min: 20, max: 95, veranderingen: 30 },
                   '010C': { n: 90, min: 0, max: 2400, veranderingen: 80 } });
  const k = o.keur(bouw());
  const v = o.oordeel(k.opdracht, function () { return true; });
  eis(v.staat === 'gesloten', 'alles goed -> "gesloten" (was: ' + v.staat + ')');
  eis(v.uitslagen.length === 1, 'de uitslagen komen mee, zodat het scherm ze niet hoeft terug te parsen');
}

console.log('8. DE ONDERSCHEIDENDE VRAAG — niet-gemeten en buiten-de-band zijn twee dingen');
{
  // 010C is deze rit helemaal niet gemeten. Een tweewaardig oordeel zou dit
  // "fout" noemen, net als geval 6 — en dan is het verslag niet te gebruiken
  // om te beslissen wat de volgende rit moet doen.
  const o = laad({ '0105': { n: 40, min: 20, max: 95, veranderingen: 30 } });
  const k = o.keur(bouw());
  const v = o.oordeel(k.opdracht, function () { return true; });
  eis(v.staat === 'nog niet', 'een PID die niet gemeten is -> "nog niet", niet "bevinding" (was: ' + v.staat + ')');
  eis(/niet gemeten/.test(v.reden), 'en de reden zegt dat er niets gemeten is');
}

console.log('9. een opdracht zonder voorwaarden gedraagt zich als vanouds');
{
  const o = laad({ '010C': { n: 90, min: 0, max: 2400, veranderingen: 80 } });
  const kaal = bouw(); delete kaal.voorwaarden; kaal.schema = 1;
  const k = o.keur(kaal);
  eis(k.ok, 'de schema-1-rij wordt goedgekeurd');
  eis(Array.isArray(k.opdracht.voorwaarden) && k.opdracht.voorwaarden.length === 0,
    'de kopie draagt een lege lijst en geen undefined — een scherm dat dat moet raden, vult het zelf in');
  const v = o.oordeel(k.opdracht, function () { return true; });
  eis(v.staat === 'gesloten', 'zonder voorwaarden telt alleen de meting (' + v.staat + ')');
}

console.log(fouten === 0 ? '\nAlles goed.' : '\n' + fouten + ' fout(en).');
process.exit(fouten ? 1 : 0);
