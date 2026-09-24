// ══════════════════════════════════════════════════════════════════
// test-hervatten.js — een automatische herverbinding vraagt niets (#229)
// ──────────────────────────────────────────────────────────────────
// Proef van 24-09-2026, 19:08: na een rendercrash verbond de app vanzelf
// opnieuw (#285), en liep daarna de hele eerste-keer-flow door — kenteken,
// protocol, "voertuig bekend?" en "Klaar voor gebruik". Vier tikken tijdens
// het rijden. In de stand "hervatten" kiest elke stap zelf wat er de vorige
// keer gold; met de knop verbinden vraagt zoals altijd.
//
// De échte stappen uit pidlane-bt.js, geknipt op hun eigen koppen. Verdwijnt
// een anker, dan stopt deze test in plaats van groen te blijven.
//
// Draaien vanuit public/:  node test-hervatten.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
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

const bron = fs.readFileSync('pidlane-bt.js', 'utf8');
function knip(van, tot) {
  const a = bron.indexOf(van), b = bron.indexOf(tot, a + 1);
  if (a < 0 || b < 0) {
    console.log('  FOUT  anker niet gevonden in pidlane-bt.js: "' + (a < 0 ? van : tot) + '" — deze test toetst niets meer');
    process.exit(1);
  }
  return bron.slice(a, b);
}
const HERVAT = knip('const HERVAT_MS', 'async function connectSerial(');
const KENTEKEN = knip('let _kentPoortKlaar = false;', 'async function scanNetworks(){');
const PROTOCOL = knip('function renderNetworkCards(){', 'function resetToStep1(){');

function el() {
  return { style: {}, textContent: '', innerHTML: '', value: '', disabled: false, className: '', id: '',
    classList: { add() {}, remove() {} }, appendChild() {}, querySelector() { return el(); },
    focus() {}, select() {} };
}

function laad(o) {
  const els = {};
  const s = {
    diag: [], rdw: [], scans: 0, starts: 0,
    localStorage: { getItem: (k) => (o.kenteken && k === 'pl_kenteken' ? o.kenteken : null), setItem() {}, removeItem() {} },
    document: { getElementById: (id) => els[id] || (els[id] = el()), createElement: () => el(), querySelectorAll: () => [] },
    log() {}, console: { warn() {}, log() {} },
    Promise
  };
  s.window = s;
  s.btDiag = (m) => { s.diag.push(m); };
  s.rdwLookup = (x, a) => { s.rdw.push(a && a.kenteken); return Promise.resolve(o.rdwLukt === false ? { ok: false } : { ok: true }); };
  s.scanNetworks = () => { s.scans++; return Promise.resolve(); };
  s.startDiscovery = () => { s.starts++; return Promise.resolve(); };
  vm.createContext(s);
  vm.runInContext('var discoveredNetworks = []; var selectedNetwork = null;\n' + HERVAT + KENTEKEN + PROTOCOL, s);
  if (o.hervat) s._plHervat = { t: Date.now() - (o.oudMs || 0), reden: o.hervat };
  return { s, els };
}
const wacht = () => new Promise((r) => setImmediate(r));

(async function () {
  console.log('1. Het kenteken van de vorige verbinding, zonder te vragen');
  {
    const { s } = laad({ hervat: 'herlaad', kenteken: 'R054XD' });
    s.toonKentekenStap();
    await wacht(); await wacht();
    toets('het laatst gebruikte kenteken wordt opgezocht', s.rdw[0] === 'R054XD', JSON.stringify(s.rdw));
    toets('en de flow gaat door naar het protocol', s.scans === 1, 'scans: ' + s.scans);
    toets('dat staat in de BT-log', s.diag.some((m) => /Hervatten \(herlaad\): kenteken R054XD/.test(m)), s.diag.join(' | '));
  }
  {
    const { s } = laad({ kenteken: 'R054XD' });
    s.toonKentekenStap();
    await wacht(); await wacht();
    toets('TEGENPROEF: met de knop verbonden wacht hij op de gebruiker', s.rdw.length === 0 && s.scans === 0,
      'rdw ' + s.rdw.length + ', scans ' + s.scans);
  }
  {
    const { s } = laad({ hervat: 'herlaad', kenteken: 'R054XD', oudMs: 200000 });
    s.toonKentekenStap();
    await wacht(); await wacht();
    toets('een hervatting van meer dan drie minuten oud telt niet meer', s.scans === 0, 'scans: ' + s.scans);
  }
  {
    const { s } = laad({ hervat: 'dode socket', kenteken: 'R054XD', rdwLukt: false });
    s.toonKentekenStap();
    await wacht(); await wacht(); await wacht();
    toets('geen bereik in de auto: overslaan in plaats van blijven hangen', s.scans === 1, 'scans: ' + s.scans);
    toets('en dat staat erbij', s.diag.some((m) => /kenteken opzoeken lukte niet/.test(m)), s.diag.join(' | '));
  }
  {
    const { s } = laad({ hervat: 'herlaad' });
    s.toonKentekenStap();
    await wacht(); await wacht();
    toets('zonder eerder kenteken valt er niets te hervatten: hij wacht', s.scans === 0 && s.rdw.length === 0);
  }

  console.log('\n2. Het herkende protocol, zonder te vragen');
  const NET = [{ auto: true, name: 'AUTO, ISO 15765-4 (CAN 11/500)', desc: '', icon: '' },
               { handmatig: true, name: 'ISO 9141-2', desc: '', icon: '' }];
  {
    const { s } = laad({ hervat: 'herlaad' });
    vm.runInContext('discoveredNetworks = ' + JSON.stringify(NET) + '; _gedetecteerdProtocol = "6";', s);
    s.renderNetworkCards();
    toets('het herkende protocol wordt gestart', s.starts === 1, 'starts: ' + s.starts);
    s.renderNetworkCards();
    toets('opnieuw tekenen start hem geen tweede keer', s.starts === 1, 'starts: ' + s.starts);
  }
  {
    const { s } = laad({});
    vm.runInContext('discoveredNetworks = ' + JSON.stringify(NET) + '; _gedetecteerdProtocol = "6";', s);
    s.renderNetworkCards();
    toets('TEGENPROEF: met de knop verbonden bevestigt de gebruiker', s.starts === 0, 'starts: ' + s.starts);
  }
  {
    const { s } = laad({ hervat: 'herlaad' });
    vm.runInContext('discoveredNetworks = ' + JSON.stringify([NET[1]]) + '; _gedetecteerdProtocol = null;', s);
    s.renderNetworkCards();
    toets('niets herkend: geen gok, de gebruiker kiest', s.starts === 0, 'starts: ' + s.starts);
  }

  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
  process.exit(fout ? 1 : 0);
})();
