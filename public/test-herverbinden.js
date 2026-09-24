// ══════════════════════════════════════════════════════════════════
// test-herverbinden.js — zet een geslaagde verbinding de herverbindvlag? (#229)
// ──────────────────────────────────────────────────────────────────
// Drie paden herverbinden vanzelf: na een herlaad (pidlane-theme.js), na zes
// lege antwoorden en bij terugkeer naar de app (pidlane-bt.js, pidlane-neon.js).
// Alle drie lezen `pl_autoconn`, en tot 24-09-2026 zette niets die vlag. Na
// elke rendercrash moest er met de hand op Verbinden gedrukt worden.
//
// Deze test draait de échte connectSerial() uit pidlane-bt.js, geknipt op zijn
// eigen kop en de functie die erna komt, met een nep-SPP eronder. Verdwijnt
// een van die ankers, dan stopt de test in plaats van groen te blijven.
//
// Draaien vanuit public/:  node test-herverbinden.js   (exit 0 = goed)
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
const KOP = 'async function connectSerial(opt){';
const STAART = '\nfunction resetConnectBtn(){';
const van = bron.indexOf(KOP), tot = bron.indexOf(STAART);
if (van < 0 || tot < van) {
  console.log('  FOUT  connectSerial() niet gevonden in pidlane-bt.js — het anker is weg, deze test toetst niets meer');
  process.exit(1);
}
const fnBron = bron.slice(van, tot);

function laad(o) {
  const opslag = Object.assign({ spp_address: '00:04:3E:8B:7B:32', spp_name: 'OBDLink MX+', pl_lastTransport: 'spp' }, o.opslag || {});
  const s = {
    diag: [], fouten: [],
    localStorage: {
      getItem: (k) => (k in opslag ? opslag[k] : null),
      setItem: (k, v) => { if (o.opslagStuk) throw new Error('opslag vol'); opslag[k] = String(v); },
      removeItem: (k) => { delete opslag[k]; }
    },
    navigator: {}, location: { hostname: 'localhost' },
    document: { getElementById: () => ({ value: '', disabled: false, textContent: '' }) },
    PLBus: { breek() {}, batchReset() {}, resetStats() {} },
    _elmPoortOpen() {}, setConnectingUI() {}, updateApiPill() {},
    btEnvDump: () => ({ native: true }),
    getSPP: () => ({}), getBLE: () => null,
    delay: () => Promise.resolve(),
    connectSPP: () => Promise.reject(new Error('geen adapter in de scan')),
    showConnError: (m) => { s.fouten.push(m); },
    resetConnectBtn() {},
    clearInterval() {},
    console: { warn() {}, log() {}, error() {} }
  };
  s.window = s;
  s.btDiag = (m) => { s.diag.push(m); };
  s.doSPPConnect = o.lukt
    ? () => { vm.runInContext('connected = true', s); return Promise.resolve(); }
    : () => Promise.reject(new Error('adapter weg'));
  vm.createContext(s);
  vm.runInContext('var connected = false; var pollTimer = 0; var _btQueue = null;\n' + fnBron, s);
  return { s, opslag };
}

(async function () {
  console.log('1. Een geslaagde verbinding zet de vlag');
  {
    const { s, opslag } = laad({ lukt: true });
    await s.connectSerial();
    toets('verbonden', vm.runInContext('connected', s) === true);
    toets('pl_autoconn staat op 1 — de drie herverbindpaden kunnen nu vuren', opslag.pl_autoconn === '1',
      'pl_autoconn = ' + opslag.pl_autoconn);
  }

  console.log('\n2. TEGENPROEF: een mislukte verbinding zet hem niet');
  {
    const { s, opslag } = laad({ lukt: false });
    await s.connectSerial();
    toets('niet verbonden', vm.runInContext('connected', s) === false);
    toets('de vlag blijft uit — anders probeert de app straks eindeloos een adapter die er nooit was',
      opslag.pl_autoconn === undefined, 'pl_autoconn = ' + opslag.pl_autoconn);
    toets('en de fout staat gewoon op het scherm', s.fouten.length === 1);
  }

  console.log('\n3. Bewust verbroken blijft bewust verbroken');
  {
    const { s, opslag } = laad({ lukt: false, opslag: { pl_autoconn: '1' } });
    await s.connectSerial();
    toets('een mislukte poging wist een eerder gezette wens niet', opslag.pl_autoconn === '1');
    const ui = fs.readFileSync('pidlane-uihelpers.js', 'utf8');
    toets('handleConnect() wist de vlag nog steeds bij bewust verbreken',
      /async function handleConnect\(\)\{[\s\S]{0,600}localStorage\.removeItem\('pl_autoconn'\)/.test(ui),
      'zonder die regel verbindt de app opnieuw terwijl je hem net losmaakte');
  }

  console.log('\n4. Kan de vlag niet weg, dan zegt hij dat');
  {
    const { s } = laad({ lukt: true, opslagStuk: true });
    await s.connectSerial();
    toets('verbonden, en de melding over de vlag staat in de BT-log',
      s.diag.some((m) => /Herverbindvlag niet bewaard/.test(m)), s.diag.slice(-3).join(' | '));
  }

  console.log('\n5. De stand "hervatten" (#229): alleen een automatische poging zet hem');
  {
    const { s } = laad({ lukt: true });
    await s.connectSerial({ hervat: 'herlaad' });
    toets('een automatische herverbinding zet de stand, met de reden', s._plHervat && s._plHervat.reden === 'herlaad',
      JSON.stringify(s._plHervat));
  }
  {
    const { s } = laad({ lukt: true });
    s._plHervat = { t: Date.now(), reden: 'oud' };
    await s.connectSerial({ type: 'click' });
    toets('TEGENPROEF: de knop (of een klik-event) wist hem — die vraagt zoals altijd', s._plHervat === null,
      JSON.stringify(s._plHervat));
  }
  {
    const { s } = laad({ lukt: false });
    await s.connectSerial({ hervat: 'dode socket' });
    toets('een mislukte hervatting vervalt: de volgende poging vraagt weer', s._plHervat === null, JSON.stringify(s._plHervat));
  }

  console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
  process.exit(fout ? 1 : 0);
})();
