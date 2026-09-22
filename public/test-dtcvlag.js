// test-dtcvlag.js — #218: `_didDTCScan` zegt "er is gekeken".
//
// Het onderdeelpaneel (pidlane-onderdeel.js) leest die vlag om "nog niet
// uitgelezen" en "geen foutcodes" uit elkaar te houden. Ging hij aan vóór de
// scan, dan zei het paneel tijdens de twee seconden wachten — en na een scan
// die met een fout eindigde — het tweede terwijl het eerste waar was.
//
// Laadt de echte scanDTC() uit pidlane-graph.js; alleen de DOM, de wachttijd
// en de adapter zijn nagebootst. De adapter houden we met de hand vast, zodat
// we de vlag kunnen lezen terwijl de scan nog loopt.
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const bron = fs.readFileSync('pidlane-graph.js', 'utf8');
const begin = bron.indexOf('async function scanDTC(){');
const eind = bron.indexOf('async function realScanDTC(){');
if (begin < 0 || eind < begin) {
  console.log('  FOUT  scanDTC() niet gevonden in pidlane-graph.js — anker verdwenen');
  process.exit(1);
}
const code = bron.slice(begin, eind);

function laad() {
  const el = () => ({ disabled: false, innerHTML: '' });
  const els = {};
  const s = {
    window: {},
    document: { getElementById: id => (els[id] = els[id] || el()) },
    demoMode: false,
    _scenario: { enabled: false, dtcs: [] },
    dtcCodes: [],
    delay: () => Promise.resolve(),
    renderDTC: () => {},
    log: () => {},
    PidLaneEvalLog: { log: () => {} },
    registerSessionReport: () => {},
    _srDtcText: () => '',
    console,
  };
  // De adapter: een belofte die de toets zelf inlost of laat mislukken.
  s.realScanDTC = () => new Promise((ok, nee) => { s._los = ok; s._faal = nee; });
  vm.createContext(s);
  vm.runInContext(code + '\nthis.scanDTC = scanDTC;', s);
  return s;
}

const wacht = () => new Promise(r => setImmediate(r));

(async () => {
  console.log('1. De vlag volgt het antwoord, niet de knop');

  {
    const s = laad();
    const scan = s.scanDTC();
    await wacht();
    toets('tijdens de scan staat de vlag nog uit',
      s.window._didDTCScan !== true,
      'het paneel zegt nu "geen foutcodes" terwijl er nog niets terug is');
    s._los(['P0420']);
    await scan;
    toets('na een antwoord staat hij aan', s.window._didDTCScan === true);
    toets('en de codes zijn die van het antwoord',
      s.dtcCodes.length === 1 && s.dtcCodes[0] === 'P0420');
  }

  {
    const s = laad();
    const scan = s.scanDTC();
    await wacht();
    s._los([]);
    await scan;
    toets('een leeg antwoord is ook gekeken: vlag aan, geen codes',
      s.window._didDTCScan === true && s.dtcCodes.length === 0);
  }

  {
    const s = laad();
    const scan = s.scanDTC();
    await wacht();
    s._faal(new Error('adapter weg'));
    let gegooid = false;
    try { await scan; } catch (e) { gegooid = true; }
    toets('een scan die mislukt laat de vlag uit',
      gegooid && s.window._didDTCScan !== true,
      'na een fout zegt het paneel "geen foutcodes" — er is niet gekeken');
  }

  console.log(`\n${n - fout}/${n} goed`);
  process.exit(fout ? 1 : 0);
})();
