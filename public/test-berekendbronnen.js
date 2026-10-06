// ══════════════════════════════════════════════════════════════════
// test-berekendbronnen.js — een gekozen berekende PID houdt zijn bronnen (#392)
// ──────────────────────────────────────────────────────────────────
// Tot 06-10-2026 zette bronnenErbij() de bronnen één keer per sessie aan,
// en de vlag stond al vóór het resultaat. Viel een bron daarna weg, of
// weigerde de poort hem de eerste keer, dan bleef de tegel leeg tot de app
// herstartte. En een berekende PID die op deze auto niet kan, bleef zonder
// uitleg leeg.
//
// Laadt de ECHTE pidlane-berekend.js in een vm-context en draait zijn tik()
// met een nep-selectie en een nep-sensorpoort eronder.
//
// Draaien vanuit public/:  node test-berekendbronnen.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

/* o.ondersteund: wat de auto meldt; o.weiger: wat de poort tegenhoudt */
function laad(o) {
  const klok = { nu: 1000000 };
  const RealDate = Date;
  const s = {
    console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array, String, Number, Set, isFinite,
    Date: Object.assign(function () { return new RealDate(klok.nu); }, { now: () => klok.nu }),
    ALL_PID_DEFS: {}, connected: true, demoMode: false,
    supportedPIDs: new Set(o.ondersteund), activePIDs: new Set(o.gekozen),
    logs: [], toegevoegd: [],
    localStorage: { getItem: () => null, setItem() {} }
  };
  s.window = s;
  s.log = (m, t) => { s.logs.push({ m: String(m), t }); };
  s.pidToevoegen = (pids) => {
    const ok = [], weg = [];
    pids.forEach((p) => { if ((o.weiger || []).indexOf(p) >= 0) weg.push(p); else { s.activePIDs.add(p); ok.push(p); } });
    s.toegevoegd.push(ok.slice());
    return { ok, weg };
  };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-berekend.js'), 'utf8'), s, { filename: 'pidlane-berekend.js' });
  if (!s.PLBerekend || typeof s.PLBerekend.tik !== 'function') { console.log('  FOUT  PLBerekend.tik ontbreekt — anker weg'); process.exit(1); }
  return { s, klok, tik: () => s.PLBerekend.tik() };
}

// CA03 (verbruik per 100 km) uit 015E + 010D: een bron die elke benzine-auto heeft.
const BRON = ['015E', '010D'];

console.log('1. Een gekozen berekende PID zet zijn bronnen aan');
{
  const { s, tik } = laad({ ondersteund: BRON.concat(['010C']), gekozen: ['CA03'] });
  tik();
  toets('015E en 010D staan erbij', BRON.every((p) => s.activePIDs.has(p)), [...s.activePIDs].join(','));
  toets('met een logregel', s.logs.some((l) => /erbij gezet/.test(l.m)), JSON.stringify(s.logs));
}

console.log('\n2. Valt een bron later weg, dan komt hij terug (dit ging tot 06-10 niet)');
{
  const { s, klok, tik } = laad({ ondersteund: BRON, gekozen: ['CA03'] });
  tik();
  s.activePIDs.delete('010D');
  klok.nu += 6000;
  tik();
  toets('010D staat er weer', s.activePIDs.has('010D'), [...s.activePIDs].join(','));
  toets('twee keer toegevoegd, twee logregels', s.toegevoegd.length === 2 && s.logs.filter((l) => /erbij gezet/.test(l.m)).length === 2,
    JSON.stringify(s.toegevoegd));
}

console.log('\n3. Niet bij elke tik: hoogstens eens per 5 s');
{
  const { s, klok, tik } = laad({ ondersteund: BRON, gekozen: ['CA03'], weiger: ['010D'] });
  tik(); klok.nu += 400; tik(); klok.nu += 400; tik();
  toets('drie tikken binnen een seconde: één poging', s.toegevoegd.length === 1, s.toegevoegd.length + ' pogingen');
  klok.nu += 5000; tik();
  toets('na 5 s opnieuw (de poort kan intussen anders beslissen)', s.toegevoegd.length === 2, s.toegevoegd.length + ' pogingen');
  toets('de weigering staat één keer in het log, niet bij elke poging',
    s.logs.filter((l) => /sensorpoort weigert/.test(l.m)).length === 1, JSON.stringify(s.logs));
}

console.log('\n4. Kan het op deze auto niet, dan zegt hij welke bron ontbreekt');
{
  // Geen 015E en geen 0110: geen brandstofbron. Wel 010D.
  const { s, klok, tik } = laad({ ondersteund: ['010D', '010C'], gekozen: ['CA03'] });
  tik(); klok.nu += 6000; tik();
  const regels = s.logs.filter((l) => /niet te berekenen/.test(l.m));
  toets('één melding met de ontbrekende bron', regels.length === 1 && /015E|0110/.test(regels[0].m), JSON.stringify(s.logs));
}
{
  const { s, tik } = laad({ ondersteund: [], gekozen: ['CA03'] });
  tik();
  toets('TEGENPROEF: zolang de auto nog niets gemeld heeft, geen melding', !s.logs.some((l) => /niet te berekenen/.test(l.m)),
    JSON.stringify(s.logs));
}
{
  const { s, tik } = laad({ ondersteund: BRON, gekozen: [] });
  tik();
  toets('TEGENPROEF: niet gekozen → niets erbij gezet', s.toegevoegd.length === 0 && !s.activePIDs.has('015E'),
    [...s.activePIDs].join(','));
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
