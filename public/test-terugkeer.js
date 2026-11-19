// ══════════════════════════════════════════════════════════════════
// test-terugkeer.js — herverbinden bij terugkeer naar de app (14-11-2026)
// ──────────────────────────────────────────────────────────────────
// Draait de échte visibilitychange-luisteraar uit pidlane-neon.js, geknipt
// op zijn eigen commentaarkop en de resize-luisteraar erna. Uit het gebruik:
// wie het aftellen annuleerde en de app wilde sluiten, kreeg bij terugkeer
// meteen "Adapter zoeken" — pl_autoconn blijft immers staan na elke
// verbinding. Nu: alleen een verbinding die er wás toen de app wegging, en
// dan via de aftelbalk (PLStrook.aftellen), niet rechtstreeks.
//
// Draaien vanuit public/:  node test-terugkeer.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let n = 0, fout = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? ' — ' + uitleg : '')); }
}
const bron = fs.readFileSync(path.join(__dirname, 'pidlane-neon.js'), 'utf8');
const KOP = '// Terugkeer naar de app zonder volledige herlaad';
const STAART = "\n// ── einde terugkeer";
const van = bron.indexOf(KOP), tot = bron.indexOf(STAART, van);
if (van < 0 || tot < van) { console.log('  FOUT  de terugkeer-luisteraar is niet gevonden in pidlane-neon.js — het anker is weg'); process.exit(1); }

function laad(o) {
  o = o || {};
  const s = {
    console: { warn() {}, log() {}, info() {} },
    opslag: { pl_autoconn: o.autoconn === false ? null : '1' },
    luister: {}, aftel: 0, verbind: [], logs: [],
    demoMode: false, connected: !!o.verbonden,
    Promise,
    setTimeout: (f) => { s.wacht = f; return 1; }
  };
  s.localStorage = { getItem: (k) => s.opslag[k] == null ? null : s.opslag[k] };
  s.document = { visibilityState: 'visible', addEventListener: (t, f) => { s.luister[t] = f; } };
  s.getSPP = () => ({});
  s.log = (t) => s.logs.push(t);
  s.setConn = () => {};
  s.connectSerial = (opt) => { s.verbind.push(opt); return Promise.resolve(); };
  if (o.strook !== false) s.PLStrook = { aftellen: (fn) => { s.aftel++; s.fn = fn; return true; } };
  s.window = s;
  vm.createContext(s);
  vm.runInContext(bron.slice(van, tot), s);
  return s;
}
async function weg(s) { s.document.visibilityState = 'hidden'; s.luister.visibilitychange(); }
async function terug(s) { s.document.visibilityState = 'visible'; s.wacht = null; s.luister.visibilitychange(); if (s.wacht) await s.wacht(); }

(async () => {
  {
    const s = laad();
    await weg(s); await terug(s);
    toets('niet verbonden toen de app wegging: niets, ook met pl_autoconn', s.aftel === 0 && s.verbind.length === 0);
  }
  {
    const s = laad({ verbonden: true });
    await weg(s); s.connected = false; await terug(s);
    toets('verbinding viel weg op de achtergrond: de aftelbalk, niet meteen verbinden', s.aftel === 1 && s.verbind.length === 0);
    s.fn();
    toets('na de balk: herverbinden als hervatting', s.verbind.length === 1 && s.verbind[0].hervat === 'terugkeer naar de app');
    await weg(s); await terug(s);
    toets('een tweede terugkeer zonder verbinding: niets meer', s.aftel === 1);
  }
  {
    const s = laad({ verbonden: true });
    await weg(s); await terug(s);
    toets('nog verbonden bij terugkeer: niets', s.aftel === 0 && s.verbind.length === 0);
  }
  {
    const s = laad({ verbonden: true, autoconn: false });
    await weg(s); s.connected = false; await terug(s);
    toets('bewust verbroken (geen pl_autoconn): niets', s.aftel === 0 && s.verbind.length === 0);
  }
  {
    const s = laad({ verbonden: true, strook: false });
    await weg(s); s.connected = false; await terug(s);
    toets('zonder PLStrook: meteen herverbinden (oude gedrag)', s.verbind.length === 1);
  }
  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : n + ' toetsen, allemaal goed'));
  process.exit(fout ? 1 : 0);
})();
