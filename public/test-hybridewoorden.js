// ══════════════════════════════════════════════════════════════════
// test-hybridewoorden.js — de aandrijfvorm verandert wat de app zegt (07-11-2026)
// ──────────────────────────────────────────────────────────────────
// Drie dingen uit plsim-aandrijving.js (PIDLANE-ARCHIEF.md, 07-11-2026):
//   1. een mild hybride die uitrolt met de motor uit heette "Rijdt op accu"
//      en bewees daarmee een hybride → nu ZEILEN, geen bewijs, geen EV-pauze;
//   2. een seriële hybride ("andersom") die stilstaand laadt heette
//      "Stationair" → nu "Motor laadt accu";
//   3. de AI hoorde niet dat de motor tijdens het rijden uit stond → nu een
//      regel met de rijtijd op de accu (PLAandrijving.rit()).
// Elke toets heeft zijn tegenproef: zónder vorm moet het oude woord blijven.
//
// Draaien vanuit public/:  node test-hybridewoorden.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function t(naam, gemeten, verwacht) {
  if (String(gemeten) === String(verwacht)) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + gemeten + ', wilde ' + verwacht); }
}
const lees = (f) => fs.readFileSync(__dirname + '/' + f, 'utf8');

const s = { console: { log() { }, warn() { }, error() { } } };
s.window = s;
vm.createContext(s);
vm.runInContext(lees('pidlane-aandrijving.js'), s, { filename: 'pidlane-aandrijving.js' });
const A = s.PLAandrijving;
if (!A || !A.rit) { console.error('FOUT: PLAandrijving.rit ontbreekt'); process.exit(1); }

// Een reeks momentopnames door bepaal(), elke 250 ms.
function reeks(vorm, stappen) {
  let r = null, tt = 1000;
  stappen.forEach(([rpm, kmh, n]) => { for (let i = 0; i < n; i++) r = A.bepaal({ rpm, snelheid: kmh, t: tt += 250, vorm }, r); });
  return r;
}
const UITROLLEN = [[1800, 60, 8], [0, 45, 12]];

console.log('\n1. mild hybride: zeilen is geen accurijden');
const mild = reeks('mild', UITROLLEN), gewoon = reeks(null, UITROLLEN);
t('mild, motor uit tijdens het rijden → ZEILEN', mild.toestand, 'ZEILEN');
t('… met het woord erbij', mild.label, 'Zeilen (motor uit)');
t('… en dat bewijst géén hybride', mild.bewijstHybride, false);
t('… en de pollronde krimpt niet (geen EV-pauze)', A.evPauzeGerust(mild, mild.sinds + 10000), false);
t('TEGENPROEF zonder vorm: Rijdt op accu, zoals voorheen', gewoon.toestand, 'ACCU_RIJDT');
t('TEGENPROEF … en dat bewijst wél een hybride', gewoon.bewijstHybride, true);

console.log('\n2. serieel: de motor laadt');
const STIL_LADEN = [[1800, 0, 10]], RIJDEN = [[2600, 110, 10]];
t('serieel, stilstand, motor draait → "Motor laadt accu"', reeks('serieel', STIL_LADEN).label, 'Motor laadt accu');
t('… de toestand zelf blijft DRAAIT_STIL (consumenten veranderen niet)', reeks('serieel', STIL_LADEN).toestand, 'DRAAIT_STIL');
t('serieel, rijdend met motor → "Rijdt elektrisch · motor laadt"', reeks('serieel', RIJDEN).label, 'Rijdt elektrisch · motor laadt');
t('TEGENPROEF volhybride: "Stationair"', reeks('vol', STIL_LADEN).label, 'Stationair');
t('TEGENPROEF zonder vorm: "Rijdt op motor"', reeks(null, RIJDEN).label, 'Rijdt op motor');

console.log('\n3. tik() leest de vorm uit PLKenmerk en telt de rijtijd');
s.PLKenmerk = { live: () => ({ vorm: { waarde: 'mild' } }) };
A.reset();
let tt = 0;
for (let i = 0; i < 40; i++) A.tik({ '010C': 1800, '010D': 60 }, { t: tt += 500, ouderdomMs: 0 });
for (let i = 0; i < 40; i++) A.tik({ '010C': 0, '010D': 45 }, { t: tt += 500, ouderdomMs: 0 });
t('tik met PLKenmerk mild → ZEILEN', A.laatste().toestand, 'ZEILEN');
let rit = A.rit();
t('zeiltijd geteld (≈ 20 s)', Math.round(rit.zeilMs / 1000) >= 18 && Math.round(rit.zeilMs / 1000) <= 20, true);
t('accutijd 0 op een mild hybride', rit.accuMs, 0);
s.PLKenmerk = { live: () => ({ vorm: { waarde: 'vol' } }) };
A.reset();
tt = 0;
for (let i = 0; i < 40; i++) A.tik({ '010C': 1800, '010D': 60 }, { t: tt += 500, ouderdomMs: 0 });
for (let i = 0; i < 80; i++) A.tik({ '010C': 0, '010D': 45 }, { t: tt += 500, ouderdomMs: 0 });
for (let i = 0; i < 20; i++) A.tik({ '010C': 0, '010D': 0 }, { t: tt += 500, ouderdomMs: 0 });
rit = A.rit();
t('volhybride: accutijd geteld (≈ 40 s)', Math.round(rit.accuMs / 1000) >= 38 && Math.round(rit.accuMs / 1000) <= 40, true);
t('stilstaan telt niet als rijtijd (rij ' + Math.round(rit.rijMs / 1000) + ' s)', Math.round(rit.rijMs / 1000) <= 61, true);
t('aandeel op de accu ≈ 2/3', rit.aandeelAccu >= 63 && rit.aandeelAccu <= 70, true);
// Het gat valt midden in het accurijden: de toestand blijft ACCU_RIJDT.
for (let i = 0; i < 12; i++) A.tik({ '010C': 0, '010D': 45 }, { t: tt += 500, ouderdomMs: 0 });
const voorGat = A.rit().accuMs;
A.tik({ '010C': 0, '010D': 45 }, { t: tt += 600000, ouderdomMs: 0 });
t('een gat van 10 minuten midden in het accurijden telt hoogstens 5 s', A.rit().accuMs - voorGat <= 5000 && A.laatste().toestand === 'ACCU_RIJDT', true);
A.reset();
t('reset() wist de rijtijd (nieuwe verbinding, nieuwe rit)', A.rit().rijMs, 0);
s.PLKenmerk = { live: () => { throw new Error('stuk'); } };
A.reset(); tt = 0;
for (let i = 0; i < 12; i++) A.tik({ '010C': 0, '010D': 45 }, { t: tt += 500, ouderdomMs: 0 });
t('een kapotte PLKenmerk: gewone woorden, geen val', A.laatste().toestand, 'ACCU_RIJDT');

console.log('\n4. de AI-regel (pidlane-archief.js)');
const arch = lees('pidlane-archief.js');
const van = arch.indexOf('function _plAandrijfPromptRegels'), tot = arch.indexOf('\n}', van) + 2;
if (van < 0) { console.error('FOUT: _plAandrijfPromptRegels niet gevonden'); process.exit(1); }
const c = { console: { warn() { } }, PLAandrijving: null, PLKenmerk: null };
c.window = c; vm.createContext(c); vm.runInContext(arch.slice(van, tot), c);
c.PLAandrijving = { rit: () => ({ accuMs: 8 * 60000, motorRijMs: 4 * 60000, zeilMs: 0, rijMs: 12 * 60000, aandeelAccu: 67 }) };
c.PLKenmerk = { live: () => ({ vorm: { waarde: 'vol' } }) };
let r = c._plAandrijfPromptRegels();
t('8 min op de accu → één regel', r.length, 1);
t('… met minuten en aandeel', /8 min uit \(rijden op de accu, 67% van de rijtijd\)/.test(r[0]), true);
t('… en de instructie: toerental 0 is normaal', /Toerental 0 en motorbelasting 0 bij snelheid zijn dan NORMAAL/.test(r[0]), true);
c.PLAandrijving = { rit: () => ({ accuMs: 0, motorRijMs: 600000, zeilMs: 30000, rijMs: 630000, aandeelAccu: 0 }) };
c.PLKenmerk = { live: () => ({ vorm: { waarde: 'mild' } }) };
r = c._plAandrijfPromptRegels();
t('mild met 30 s zeilen → de zeilregel', r.length === 1 && /zeilen, 30 s/.test(r[0]) && /rijdt niet elektrisch/.test(r[0]), true);
c.PLAandrijving = { rit: () => ({ accuMs: 0, motorRijMs: 600000, zeilMs: 0, rijMs: 600000, aandeelAccu: 0 }) };
c.PLKenmerk = { live: () => ({ vorm: { waarde: 'serieel' } }) };
r = c._plAandrijfPromptRegels();
t('serieel → de generatorregel', r.length === 1 && /generator/.test(r[0]), true);
c.PLKenmerk = { live: () => ({ vorm: { waarde: 'verbranding' } }) };
t('TEGENPROEF gewone auto zonder accutijd → geen regel', c._plAandrijfPromptRegels().length, 0);
c.PLAandrijving = { rit: () => ({ accuMs: 5000, motorRijMs: 600000, zeilMs: 0, rijMs: 605000, aandeelAccu: 1 }) };
t('5 s "op de accu" (ruis) → geen regel', c._plAandrijfPromptRegels().length, 0);

console.log('\n' + ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
