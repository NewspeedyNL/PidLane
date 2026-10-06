// ══════════════════════════════════════════════════════════════════
// test-btuit.js — Bluetooth uit is geen "adapter niet gevonden" (#359)
// ──────────────────────────────────────────────────────────────────
// Met Bluetooth uit liep de hele keten door — SPP, BLE (12 s scannen), een
// tweede ronde — en eindigde op "Adapter in OBD-poort? Contact aan?".
// Anderhalve minuut, en de melding stuurde je naar de auto.
//
// Deze test draait de échte connectSerial() en connectSPP() uit
// pidlane-bt.js, geknipt op hun eigen kop en de functie die erna komt, met
// een nep-plugin eronder. Verdwijnt een anker, dan stopt de test.
//
// Draaien vanuit public/:  node test-btuit.js   (exit 0 = goed)
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
// connectSerial() tot resetConnectBtn(): daartussen staan ook btUitFout()
// en btAanVoorKeten(), dus die komen vanzelf mee.
const serialBron = knip('async function connectSerial(opt){', '\nfunction resetConnectBtn(){');
const sppBron = knip('async function connectSPP(spp){', '\nasync function sppOudeSluiten(');

/* o.spp:        de nep-SPP-plugin (isEnabled, enable, …)
   o.ble:        de nep-BLE-plugin, of null
   o.connectSPP: wat een SPP-poging doet (standaard: geen adapter) */
function laad(o) {
  const s = {
    diag: [], fouten: [], pogingen: 0,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: {}, location: { hostname: 'localhost' },
    document: { getElementById: () => ({ value: '', disabled: false, textContent: '' }) },
    PLBus: { breek() {}, batchReset() {}, resetStats() {} },
    _elmPoortOpen() {}, setConnectingUI() {}, updateApiPill() {},
    btEnvDump: () => ({ native: o.native !== false }),
    getSPP: () => o.spp, getBLE: () => o.ble || null,
    delay: () => Promise.resolve(),
    showConnError: (m) => { s.fouten.push(m); },
    resetConnectBtn() {}, stopPoll() {},
    connectBLE: () => { s.pogingen++; return Promise.reject(new Error('Geen BLE OBD2-adapter gevonden.')); },
    console: { warn() {}, log() {}, error() {} }
  };
  s.window = s;
  s.btDiag = (m) => { s.diag.push(String(m)); };
  vm.createContext(s);
  vm.runInContext('var connected = false; var pollTimer = 0; var _btQueue = null;\n' + serialBron, s);
  s.connectSPP = () => { s.pogingen++; return o.connectSPP ? o.connectSPP() : Promise.reject(new Error('Geen SPP OBD2-adapter gevonden.')); };
  return s;
}
const UIT = /Bluetooth staat uit/;

(async function () {
  console.log('1. Bluetooth uit, en aanzetten wordt geweigerd');
  {
    let gevraagd = 0;
    const s = laad({
      spp: { isEnabled: async () => ({ enabled: false }) },
      ble: { requestEnable: async () => { gevraagd++; throw new Error('requestEnable failed.'); } }
    });
    await s.connectSerial();
    toets('Android wordt gevraagd om Bluetooth aan te zetten', gevraagd === 1, 'requestEnable ' + gevraagd + '×');
    toets('de keten start niet: geen SPP, geen BLE, geen tweede ronde', s.pogingen === 0, s.pogingen + ' pogingen');
    toets('de melding zegt Bluetooth, niet de adapter of het contact',
      s.fouten.length === 1 && UIT.test(s.fouten[0]) && !/OBD-poort|Contact aan/.test(s.fouten[0]), JSON.stringify(s.fouten));
  }

  console.log('\n2. Bluetooth uit, en de gebruiker zet hem aan in de systeemvraag');
  {
    let aan = false;
    const s = laad({
      spp: { isEnabled: async () => ({ enabled: aan }) },
      ble: { requestEnable: async () => { aan = true; } }
    });
    await s.connectSerial();
    toets('daarna loopt de keten gewoon', s.pogingen > 0, s.pogingen + ' pogingen');
    toets('…en de melding aan het eind is weer die over de adapter', s.fouten.length === 1 && !UIT.test(s.fouten[0]), JSON.stringify(s.fouten));
  }

  console.log('\n3. Zonder BLE-plugin: dan via SPP enable()');
  {
    let gevraagd = 0;
    const s = laad({ spp: { isEnabled: async () => ({ enabled: false }), enable: async () => { gevraagd++; return { enabled: false }; } } });
    await s.connectSerial();
    toets('SPP enable() wordt geprobeerd, en de keten start niet', gevraagd === 1 && s.pogingen === 0 && UIT.test(s.fouten[0] || ''),
      'enable ' + gevraagd + '×, ' + s.pogingen + ' pogingen, ' + JSON.stringify(s.fouten));
  }

  console.log('\n4. TEGENPROEF: de stand is niet te lezen → de keten loopt zoals altijd');
  {
    const s = laad({ spp: { isEnabled: async () => { throw new Error('not implemented'); } } });
    await s.connectSerial();
    toets('een plugin die iets anders antwoordt houdt de verbinding niet tegen', s.pogingen > 0, s.pogingen + ' pogingen');
  }
  {
    const s = laad({ spp: { isEnabled: async () => ({ enabled: true }) } });
    await s.connectSerial();
    toets('Bluetooth aan: de keten loopt, en er wordt niets gevraagd', s.pogingen > 0 && !s.diag.some((m) => /Android vragen/.test(m)));
  }

  console.log('\n5. Zonder voorcontrole: een "Bluetooth is disabled" in de keten stopt hem');
  {
    const s = laad({ spp: {}, ble: {}, connectSPP: () => Promise.reject(new Error('Bluetooth is disabled')) });
    await s.connectSerial();
    // BLE eerst (geen laatst gebruikt transport), dan SPP, en daar stopt het.
    toets('na de SPP-poging geen tweede ronde', s.pogingen === 2 && !s.diag.some((m) => /tweede scanronde/.test(m)),
      s.pogingen + ' pogingen');
    toets('en de melding zegt Bluetooth', s.fouten.length === 1 && UIT.test(s.fouten[0]), JSON.stringify(s.fouten));
  }
  {
    const s = laad({ spp: {}, ble: {}, connectSPP: () => Promise.reject(new Error('Geen SPP OBD2-adapter gevonden.')) });
    await s.connectSerial();
    toets('TEGENPROEF: een gewone mislukking loopt beide rondes en beide transports af', s.pogingen === 4, s.pogingen + ' pogingen');
  }

  console.log('\n6. connectSPP() leest "Bluetooth is disabled" uit de scan niet als "geen adapter"');
  {
    const c = { diag: [], localStorage: { getItem: () => null }, btDiag(m) { c.diag.push(m); }, btDiagDevice() {},
      NON_OBD_RX: /shelly/i, doSPPConnect: () => Promise.resolve(), console: { warn() {} } };
    c.window = c;
    vm.createContext(c);
    vm.runInContext(knip('const BT_UIT_RX', '\nasync function btAanVoorKeten(') + '\n' + sppBron, c);
    const spp = (fout) => ({ requestPermissions: async () => ({}), scan: async () => { throw new Error(fout); } });
    let e1 = null, e2 = null;
    try { await c.connectSPP(spp('Bluetooth is disabled')); } catch (e) { e1 = e; }
    try { await c.connectSPP(spp('Location services are not enabled')); } catch (e) { e2 = e; }
    toets('Bluetooth uit: de fout zegt Bluetooth en draagt de vlag', e1 && e1.__plBtUit === true && UIT.test(e1.message), e1 && e1.message);
    toets('TEGENPROEF: een andere scanfout blijft "geen adapter gevonden"', e2 && !e2.__plBtUit && /Geen SPP OBD2-adapter/.test(e2.message), e2 && e2.message);
  }

  console.log('\n7. Wat telt als "Bluetooth uit"');
  {
    const c = {};
    vm.createContext(c);
    vm.runInContext(knip('const BT_UIT_RX', '\nasync function btAanVoorKeten('), c);
    const ja = ['Bluetooth is disabled', 'BLE not enabled', 'Bluetooth adapter is off', 'Bluetooth staat uit'];
    const nee = ['Location services are not enabled', 'Geen BLE OBD2-adapter gevonden.', 'Bluetooth not supported on this device', 'Missing the following permissions'];
    toets('herkend: ' + ja.join(' · '), ja.every((m) => c.btUitFout(m)), ja.filter((m) => !c.btUitFout(m)).join(', '));
    toets('niet herkend: ' + nee.join(' · '), nee.every((m) => !c.btUitFout(m)), nee.filter((m) => c.btUitFout(m)).join(', '));
  }

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error('FOUT: ' + (e && e.stack || e)); process.exit(1); });
