// ══════════════════════════════════════════════════════════════════
// test-snelverbinden.js — bekende adapter + auto: klik, wacht, klaar (19-10-2026)
// ──────────────────────────────────────────────────────────────────
// Ingelogd, adapter, kenteken, protocol en voertuigprofiel bekend: dan
// loopt de knop als een hervatting (geen kenteken-, protocol- of scanvraag)
// en probeert alleen de bekende adapter, één ronde. Antwoordt die niet,
// dan zegt de melding: druk op de pair-knop.
//
// Draait de échte plSnelBekend() en connectSerial() uit pidlane-bt.js.
// Draaien vanuit public/:  node test-snelverbinden.js   (exit 0 = goed)
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
function knip(kop, staart) {
  const van = bron.indexOf(kop), tot = bron.indexOf(staart, van);
  if (van < 0 || tot < van) {
    console.log('  FOUT  ' + kop + ' niet gevonden in pidlane-bt.js — het anker is weg, deze test toetst niets meer');
    process.exit(1);
  }
  return bron.slice(van, tot);
}
const snelBron = knip('/* HERVATTEN (#229', '\n/* Het slot van een hervatting');
const serialBron = knip('async function connectSerial(opt){', '\nfunction resetConnectBtn(){');

const BEKEND = { spp_address: '00:04:3E:8B:7B:32', spp_name: 'OBDLink MX+ 90011', pl_lastTransport: 'spp',
  pl_kenteken: 'R054XD', pl_proto_id: 'A6', pl_vinprof_abc: '{}' };

function laad(o) {
  const opslag = Object.assign({}, o.opslag);
  const klassen = new Set();
  const s = {
    diag: [], fouten: [], spp: 0, ble: 0, scan: 0,
    localStorage: {
      getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; },
      get length() { return Object.keys(opslag).length; }, key: (i) => Object.keys(opslag)[i]
    },
    currentUser: o.ingelogd === false ? null : { user: 'klant' },
    navigator: {}, location: { hostname: 'localhost' },
    document: { getElementById: (id) => id === 'connOv'
      ? { classList: { toggle: (c, a) => { if (a) klassen.add(c); else klassen.delete(c); } } }
      : { value: '', disabled: false, textContent: '' } },
    PLBus: { breek() {} }, _elmPoortOpen() {}, setConnectingUI() {}, updateApiPill() {},
    btEnvDump: () => ({ native: true }), getSPP: () => ({}), getBLE: () => ({}),
    btAanVoorKeten: async () => 'aan', btUitFout: () => false,
    delay: () => Promise.resolve(),
    doSPPConnect: () => { s.spp++; return Promise.reject(new Error('Failed to connect to the device')); },
    connectSPP: () => { s.scan++; return Promise.reject(new Error('Geen SPP OBD2-adapter gevonden.')); },
    connectBLE: () => { s.ble++; return Promise.reject(new Error('Geen BLE OBD2-adapter gevonden.')); },
    showConnError: (m) => { s.fouten.push(m); klassen.delete('pl-snel'); klassen.delete('pl-stil'); },
    resetConnectBtn() {}, stopPoll() {},
    console: { warn() {}, log() {}, error() {} }
  };
  s.window = s; s.klassen = klassen;
  s.btDiag = (m) => { s.diag.push(String(m)); };
  vm.createContext(s);
  vm.runInContext('var connected = false; var pollTimer = 0; var _btQueue = null;\n' + snelBron + '\n' + serialBron + '\nthis.plSnelBekend = plSnelBekend;', s);
  return s;
}

(async () => {
  console.log('\n1. plSnelBekend(): alles bekend, of de gewone flow');
  {
    const s = laad({ opslag: {} });
    const lees = (o) => (k) => (k in o ? o[k] : null);
    toets('alles bekend en ingelogd → snel', s.plSnelBekend(lees(BEKEND), Object.keys(BEKEND), true));
    toets('TEGENPROEF: niet ingelogd → gewone flow', !s.plSnelBekend(lees(BEKEND), Object.keys(BEKEND), false));
    for (const k of ['spp_address', 'pl_kenteken', 'pl_proto_id', 'pl_vinprof_abc']) {
      const o = Object.assign({}, BEKEND); delete o[k];
      toets('TEGENPROEF: zonder ' + k + ' → gewone flow', !s.plSnelBekend(lees(o), Object.keys(o), true));
    }
  }

  console.log('\n2. Snel en de adapter antwoordt niet: alleen de bekende adapter, dan de pair-knop');
  {
    const s = laad({ opslag: BEKEND });
    await s.connectSerial();
    toets('stand is gezet (bekende auto)', s.diag.some(d => /Snel verbinden: bekende adapter/.test(d)), s.diag.join(' | '));
    toets('geen BLE-scan en geen SPP-scan', s.ble === 0 && s.scan === 0, 'ble ' + s.ble + ', scan ' + s.scan);
    toets('één ronde: de directe poging plus zijn herhaling', s.spp === 2, s.spp + ' directe pogingen');
    toets('de melding noemt de pair-knop', s.fouten.length === 1 && /pair-knop/.test(s.fouten[0]), JSON.stringify(s.fouten));
    toets('de stand is weg na een mislukking', s._plHervat === null);
    toets('het gewone venster staat terug', !s.klassen.has('pl-snel') && !s.klassen.has('pl-stil'));
  }

  console.log('\n3. TEGENPROEF: niet ingelogd → de hele keten, twee rondes, gewone melding');
  {
    const s = laad({ opslag: BEKEND, ingelogd: false });
    await s.connectSerial();
    toets('BLE en SPP-scan worden geprobeerd, twee rondes', s.ble === 2 && s.scan === 2, 'ble ' + s.ble + ', scan ' + s.scan);
    toets('geen pair-knopmelding', s.fouten.length === 1 && !/pair-knop/.test(s.fouten[0]), JSON.stringify(s.fouten));
  }

  console.log('\n4. Snel en het lukt: het venster staat op één regel en de stand blijft voor de rest van de flow');
  {
    const s = laad({ opslag: BEKEND });
    s.doSPPConnect = () => { s.spp++; vm.runInContext('connected = true', s); return Promise.resolve(); };
    await s.connectSerial();
    toets('verbonden in één poging', s.spp === 1 && vm.runInContext('connected', s) === true, s.spp + ' pogingen');
    // Sinds 08-11-2026 is snel ook stil: het venster is dicht, de strook spreekt.
    toets('venster dicht (stil), niet de oude regel', s.klassen.has('pl-stil') && !s.klassen.has('pl-snel'), [...s.klassen].join(','));
    toets('hervatstand actief met reden "bekende auto"', s._plHervat && s._plHervat.snel === true && s._plHervat.reden === 'bekende auto', JSON.stringify(s._plHervat));
  }

  console.log('\n5. Stil verbinden (08-11-2026): elke verbinding met de knop, ook zonder bekende auto');
  {
    const s = laad({ opslag: {}, ingelogd: false });
    s.connectBLE = () => { s.ble++; vm.runInContext('connected = true', s); return Promise.resolve(); };
    await s.connectSerial();
    toets('stille stand, geen snelle', s._plHervat && s._plHervat.stil === true && !s._plHervat.snel, JSON.stringify(s._plHervat));
    toets('het verbindscherm is dicht', s.klassen.has('pl-stil'));
    toets('de stand duurt langer dan een hervatting (eerste scan)', s._plHervat.ms > 180000, String(s._plHervat.ms));
    toets('het kenteken komt ná het verbinden', vm.runInContext('_kentNaVerbinden()', s) === true);
  }
  {
    const s = laad({ opslag: BEKEND });
    s.doSPPConnect = () => { s.spp++; vm.runInContext('connected = true', s); return Promise.resolve(); };
    await s.connectSerial({ hervat: 'dode socket' });
    toets('TEGENPROEF: een hervatting is niet stil', s._plHervat && !s._plHervat.stil && s._plHervat.reden === 'dode socket', JSON.stringify(s._plHervat));
    toets('TEGENPROEF: en vraagt het kenteken niet na', vm.runInContext('_kentNaVerbinden()', s) === false);
  }

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' toetsen ok'));
  process.exit(fout ? 1 : 0);
})();
