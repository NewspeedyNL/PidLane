// Regressietest voor de PID-gate (PIDLANE.md §15).
//
// Vergelijkt per aanroepplek het OORSPRONKELIJKE predicaat — het gedrag van
// vóór de gate, 31-07-2026 — met de huidige gate-aanroep, over alle
// toestandscombinaties. Elke plek heeft een `verwacht`: onder welke
// voorwaarden een verschil BEDOELD is. Alles daarbuiten is een regressie.
//
// Werkwijze per opruimronde: pas de gate aan, draai deze test, en werk de
// `verwacht` van precies één plek bij. Moet je er twee bijwerken, dan heeft
// je wijziging meer geraakt dan de bedoeling was.
//
//   node test-pidgate.js
//
const fs = require('fs');

const src = fs.readFileSync(__dirname + '/pidlane-auth.js', 'utf8');
const m = src.match(/^function pidGate\(pid, niveau, opt\)\{[\s\S]*?^\}/m);
if (!m) { console.error('pidGate niet gevonden in pidlane-auth.js'); process.exit(1); }
const maakGate = new Function(
  'vehiclePlausiblePid', 'GEEN_SENSOR_PIDS', '_pidHealth', 'demoMode', 'getPidDef', 'pidVals',
  m[0] + '\nreturn pidGate;'
);

const HEALTHS = [undefined, 'ok', 'twijfel', 'nodata', 'onzin'];
const DEFS = {
  'geen def':       null,
  'ruw+PID-naam':   { unit: 'raw', name: 'PID 0166' },
  'echt':           { unit: '\u00b0C', name: 'Kat temp B1' },
  'ruw+echte naam': { unit: 'raw', name: 'Iets' },
  'echt+PID-naam':  { unit: '\u00b0C', name: 'PID 01FF' }
};
const VALS = { 'undefined': undefined, 'null': null, 'nul': 0, 'getal': 42 };

// Onbereikbare toestanden, met de reden erbij. Deze komen als bedoeld verschil
// terug omdat de gate een invariant nu overal afdwingt in plaats van op één plek.
const BITMAP   = c => c.bitmap;        // discoveredPIDDefs bevat geen bitmaps meer
const GEEN_DEF = c => !c.def;          // een PID met verse waarde is geparseerd, dus heeft een def
const VAL_NULL = c => c.val === null;  // parsePID levert null -> wordt niet opgeslagen
const DEMO     = c => c.demo;          // in demo staat _pidHealth voor élke PID op 'ok'
const RUW      = c => !!c.def && (c.def.unit === 'raw' || /^PID\s/i.test(c.def.name));
const TOON     = c => c.toonAlles;     // "Toon alles" bestond niet in het oude gedrag
const STAAL    = c => !c.plaus;        // verouderde bronlijst: fantoom dat er nog in staat

const PLEKKEN = [
  { naam: 'purgeImplausiblePids',
    oud: c => c.plaus,
    nu:  g => g('01XX', 'plausibel'),
    verwacht: () => false, waarom: 'identiek' },

  { naam: 'buildDiscoveredPIDList',
    oud: c => !c.bitmap && c.plaus,
    nu:  g => g('01XX', 'bestaat'),
    verwacht: () => false, waarom: 'identiek' },

  { naam: 'selectStandardSet',
    oud: c => c.plaus && c.h !== 'nodata' && c.h !== 'onzin',
    nu:  g => g('01XX', 'kiesbaar'),
    verwacht: BITMAP, waarom: 'ronde 1: bitmapcheck nu ook hier' },

  { naam: 'selectCategoryPIDs',
    oud: c => c.plaus && (c.demo || (c.h !== 'onzin' && c.h !== 'twijfel')),
    nu:  (g, c) => g('01XX', 'kiesbaar', { force: c.toonAlles }),
    verwacht: c => BITMAP(c) || DEMO(c) || c.h === 'twijfel' || c.h === 'nodata'
                   || (TOON(c) && c.h === 'onzin'),
    waarom: "ronde 2 + 4: health uitgelijnd, en '+ Alles' volgt nu \"Toon alles\"" },

  // weergave, geen poort: de lijst vraagt de gate of een PID is afgekeurd en
  // kiest vervolgens om hem uitgegrijsd t\u00f3ch te tonen.
  { naam: 'buildPIDList (dim)',
    oud: c => (c.h === 'onzin' || c.h === 'nodata') && !c.toonAlles,
    nu:  (g, c) => !g('01XX', 'kiesbaar', { force: c.toonAlles }),
    verwacht: c => BITMAP(c) || STAAL(c),
    waarom: 'ronde 4: dim komt nu uit de gate; verouderd fantoom grijst nu ook uit' },

  { naam: 'applyPidPreset',
    oud: c => c.plaus,
    nu:  g => g('01XX', 'plausibel'),
    verwacht: () => false, waarom: 'identiek (health volgt in een latere ronde)' },

  { naam: 'relevantSupportedPIDs/base',
    oud: c => c.plaus,
    nu:  g => g('01XX', 'plausibel'),
    verwacht: () => false, waarom: 'identiek' },

  { naam: 'relevantSupportedPIDs/lus',
    oud: c => c.plaus && c.h !== 'onzin' && c.h !== 'nodata',
    nu:  g => g('01XX', 'kiesbaar'),
    verwacht: BITMAP, waarom: 'ronde 1: bitmapcheck nu ook hier' },

  { naam: 'renderGauges',
    oud: c => c.plaus,
    nu:  g => g('01XX', 'plausibel'),
    verwacht: () => false, waarom: 'identiek' },

  { naam: 'analysisPidData',
    oud: c => c.plaus && c.val !== undefined && c.val !== null && c.h !== 'onzin' && c.h !== 'nodata',
    nu:  g => g('01XX', 'meetbaar'),
    verwacht: c => BITMAP(c) || GEEN_DEF(c) || RUW(c),
    waarom: 'ronde 3: rauwe PIDs zonder naam/eenheid gaan niet meer naar de AI' },

  { naam: 'isReportableSensor',
    oud: c => !!c.def && c.def.unit !== 'raw' && !/^PID\s/i.test(c.def.name)
              && c.val !== undefined && c.h !== 'onzin' && c.h !== 'nodata' && c.plaus,
    nu:  g => g('01XX', 'meetbaar'),
    verwacht: c => BITMAP(c) || VAL_NULL(c), waarom: 'ronde 1: bitmap + null-waarde' }
];

const onverwacht = {}, bedoeld = {};
let n = 0;

for (const plaus of [true, false])
for (const bitmap of [true, false])
for (const h of HEALTHS)
for (const defNaam of Object.keys(DEFS))
for (const valNaam of Object.keys(VALS))
for (const demo of [true, false])
for (const toonAlles of [true, false]) {
  const ctx = { plaus, bitmap, h, def: DEFS[defNaam], val: VALS[valNaam], demo, toonAlles };
  const gate = maakGate(
    () => plaus,
    new Set(bitmap ? ['01XX'] : []),
    h === undefined ? {} : { '01XX': h },
    demo,
    () => ctx.def,
    { '01XX': ctx.val }
  );
  n++;
  for (const p of PLEKKEN) {
    if (!!p.oud(ctx) === !!p.nu(gate, ctx)) continue;
    const bak = p.verwacht(ctx) ? bedoeld : onverwacht;
    (bak[p.naam] = bak[p.naam] || []).push(
      `plaus=${plaus} bitmap=${bitmap} health=${h} def=${defNaam} val=${valNaam} demo=${demo}`
    );
  }
}

console.log(`${n} toestanden \u00d7 ${PLEKKEN.length} plekken = ${n * PLEKKEN.length} vergelijkingen\n`);
for (const p of PLEKKEN) {
  const fout = onverwacht[p.naam], ok = bedoeld[p.naam];
  if (fout) {
    console.log(`  REGRESSIE  ${p.naam}: ${fout.length} onverwachte verschillen`);
    fout.slice(0, 3).forEach(r => console.log(`             ${r}`));
  } else if (ok) {
    console.log(`  bedoeld    ${p.naam}: ${ok.length} verschillen \u2014 ${p.waarom}`);
  } else {
    console.log(`  identiek   ${p.naam}`);
  }
}
const kapot = Object.keys(onverwacht).length;
console.log(kapot ? `\nFAAL \u2014 ${kapot} plek(ken) met onverwacht gedrag.`
                  : `\nOK \u2014 geen regressies; alle verschillen zijn verklaard.`);
process.exit(kapot ? 1 : 0);
