// ══════════════════════════════════════════════════════════════════
// test-beschikbaarheid.js — komt bij de eerste verbinding álle data binnen?
// ──────────────────────────────────────────────────────────────────
// De hele app draait op supportedPIDs en _pidHealth. Tot 23-10-2026 zaten er
// vier gaten in de opbouw ervan, alle vier stil:
//
//   1. Elke steunbitmap werd één keer gevraagd. Een gemiste 0100 terwijl 0120
//      wél antwoordde: blok 01–20 (toerental, snelheid, koelwater) weg, en geen
//      terugval, want supportedPIDs was niet leeg.
//   2. Het profiel kon tegen de steunbits alleen VERWIJDEREN. Dat gat uit 1
//      bleef dus ook alle volgende sessies.
//   3. De gezondheidscheck gaf elke PID één vraag van 1500 ms met '1' erachter.
//      Te traag of meerframe = nodata = niet kiesbaar = nooit meer gepollt.
//   4. 01C0 werd nooit gevraagd, en _steunbits van een vorige auto bleef staan.
//
// pidlane-rijsituatie.js wordt ECHT geladen. Eromheen een nep-ECU die per
// commando telt hoe vaak hij gevraagd is, zodat "eerst stil, dan wel" na te
// bootsen is — dat is precies de trage ECU waar het om gaat.
//
// Draaien vanuit public/:  node test-beschikbaarheid.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (ok) console.log('  ok    ' + naam);
  else {
    fout++;
    console.log('  FOUT  ' + naam +
      '\n        kreeg    ' + JSON.stringify(gemeten) +
      '\n        verwacht ' + JSON.stringify(verwacht));
  }
}

const BRON = fs.readFileSync(__dirname + '/pidlane-rijsituatie.js', 'utf8');

/* ecu: commando → string, of functie(poging) → string. Niet genoemd = NO DATA.
   De poging telt per commando vanaf 1. */
function bouw(ecu, bron) {
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() { }, warn() { }, error() { } };
  s.Promise = Promise;
  s.connected = true; s.demoMode = false;
  s.supportedPIDs = new Set(); s.activePIDs = new Set();
  s.ALL_PID_DEFS = {}; s.SAE_PID_NAMES = {};
  s.vehicleInfo = {};
  s.btlog = []; s.logs = [];
  s.log = function (m) { s.logs.push(String(m)); };
  s.btDiag = function (m, niv) { s.btlog.push({ m: String(m), niveau: niv || 'info' }); };
  s.delay = function () { return Promise.resolve(); };
  s.setTimeout = function (fn) { return setTimeout(fn, 0); };
  s.document = { getElementById() { return null; } };
  s.verzonden = [];      // [cmd, timeout]
  s.slots = [];
  const tel = {};
  s.sendCmd = function (cmd, ms) {
    s.verzonden.push([cmd, ms]);
    tel[cmd] = (tel[cmd] || 0) + 1;
    const a = ecu[cmd];
    const r = typeof a === 'function' ? a(tel[cmd]) : (a === undefined ? 'NO DATA' : a);
    return Promise.resolve(r);
  };
  s.PLScanSlot = {
    doe: async function (naam, o, werk) { s.slots.push(naam); return await werk(function (c, t) { return s.sendCmd(c, t); }); }
  };
  // Buren uit andere modules: alleen wat de scan nodig heeft om te lopen.
  s.pidCmd = function (pid, snel) { return snel ? pid + '1' : pid; };
  s.parsePID = function (pid, raw) {
    const hex = String(raw).replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    const i = hex.indexOf('41' + pid.slice(2));
    return i < 0 ? null : parseInt(hex.slice(i + 4, i + 6), 16);
  };
  s.assessPidQuality = function () { return { status: 'ok' }; };
  s.updPID = function () { };
  s.withBus = async function (naam, fn) { return await fn(); };
  s.refreshLegeTegels = function () { };
  s.saveVinProfile = function () { s.opgeslagen = (s.opgeslagen || 0) + 1; };
  s.herijkPidGate = function () { };
  s.getPidDef = function (p) { return { name: p }; };
  vm.createContext(s);
  vm.runInContext(bron || BRON, s, { filename: 'pidlane-rijsituatie.js' });
  // buildDiscoveredPIDList hoort bij een ander onderwerp (de gate); hier stil.
  s.buildDiscoveredPIDList = function () { };
  vm.runInContext('buildDiscoveredPIDList = window.buildDiscoveredPIDList;', s);
  return s;
}
const lijst = (s) => [...s.supportedPIDs].sort();
const gevraagd = (s, c) => s.verzonden.filter(v => v[0] === c).length;

async function main() {

  console.log('\n1. Een 0100 die de eerste keer stil blijft');
  {
    // 0100: 010C en 0105 (bits 12 en 5), laatste bit aan → 0120 bestaat.
    const s = bouw({ '0100': p => p === 1 ? '' : '41 00 08 10 00 01', '0120': '41 20 00 00 00 00' });
    const r = await s.discoverPIDsBitmap();
    toets('0100 is opnieuw gevraagd', gevraagd(s, '0100'), 2);
    toets('blok 0 staat er alsnog in', lijst(s), ['0105', '010C', '0120']);
    toets('met een ruimere time-out de tweede keer', s.verzonden.filter(v => v[0] === '0100').map(v => v[1]), [4000, 6000]);
    toets('niets per PID nagemeten', r.onleesbaar, []);
  }

  console.log('\n2. 0100 blijft onleesbaar, 0120 antwoordt (het gat uit de rit)');
  {
    const s = bouw({ '0100': '', '0120': '41 20 80 00 00 00', '010C': '41 0C 1A F8', '0105': '41 05 5A' });
    const r = await s.discoverPIDsBitmap();
    toets('drie pogingen op 0100', gevraagd(s, '0100'), 3);
    toets('blok 0 wordt per PID nagemeten', r.onleesbaar, [0]);
    toets('door het scanslot (#191)', s.slots, ['bitmapgat 0']);
    toets('wie antwoordt komt erin, de rest niet', lijst(s), ['0105', '010C', '0121']);
    toets('de 32e (0120) wordt niet als sensor gevraagd', gevraagd(s, '0120'), 1);
    toets('en het staat in de BT-log', s.btlog.some(x => /Blok 00: bitmap onleesbaar.*\+2/.test(x.m)), true);
  }

  console.log('\n3. NO DATA: geloofd als niets het blok aankondigt, herhaald als wel');
  {
    // 0100 kondigt 0120 aan (laatste bit). 0120 zegt eerst NO DATA, dan wel.
    // 0120 kondigt 0140 NIET aan → één NO DATA is genoeg.
    const s = bouw({ '0100': '41 00 00 00 00 01', '0120': p => p === 1 ? 'NO DATA' : '41 20 00 00 08 00' });
    const r = await s.discoverPIDsBitmap();
    toets('aangekondigde 0120 is herhaald', gevraagd(s, '0120'), 2);
    toets('en levert 0135', s.supportedPIDs.has('0135'), true);
    toets('niet-aangekondigde 0140 één keer', gevraagd(s, '0140'), 1);
    toets('01C0 wordt gevraagd', gevraagd(s, '01C0'), 1);
    toets('geen bloksweep nodig', r.onleesbaar, []);
  }

  console.log('\n4. Een aangekondigd blok dat stil blijft wordt nagemeten');
  {
    const s = bouw({ '0100': '41 00 00 00 00 01', '0120': 'NO DATA', '0121': '41 21 00 10' });
    const r = await s.discoverPIDsBitmap();
    toets('0120 drie keer', gevraagd(s, '0120'), 3);
    toets('blok 20 nagemeten', r.onleesbaar, [32]);
    toets('0121 gevonden', s.supportedPIDs.has('0121'), true);
  }

  console.log('\n5. Steunbits van een vorige auto blijven niet staan');
  {
    const s = bouw({ '0100': '41 00 00 00 00 00', '0140': '41 40 FF FF FF FE' });
    await s.discoverPIDsBitmap();                  // auto A: blok 40 alles
    s.supportedPIDs.clear();
    vm.runInContext("sendCmd = function(c){ verzonden.push([c]); return Promise.resolve(c==='0100' ? '41 00 00 00 00 00' : 'NO DATA'); };", s);
    await s.discoverPIDsBitmap();                  // auto B: geen blok 40
    toets('ecuSteunt(0142) is onbekend, niet "ja"', s.ecuSteunt('0142'), null);
  }

  console.log('\n6. Het profiel wordt aangevuld én opgeschoond');
  {
    // Bitmap: 0105 en 010C. Profiel: 010C, 0110 (ontkend), 2102 (mode 21).
    const s = bouw({ '0100': '41 00 08 10 00 00' });
    ['010C', '0110', '2102'].forEach(p => s.supportedPIDs.add(p));
    s.vehicleInfo.vin = 'JMZKE0000000000000';
    const weg = await s.profielTegenSteunbits();
    toets('0110 eruit', weg, 1);
    toets('0105 erbij', s.profielTegenSteunbits.erbij, 1);
    toets('mode 21 blijft', lijst(s), ['0105', '010C', '2102']);
    toets('het profiel is opnieuw opgeslagen', s.opgeslagen, 1);
  }

  console.log('\n7. De gezondheidscheck geeft een tweede kans');
  {
    // 010D: met '1' stil, volledig wel (de trage ECU). 0110: echt NO DATA.
    const s = bouw({ '010C1': '41 0C 1A', '010D1': '', '010D': '41 0D 32', '01101': 'NO DATA' });
    ['010C', '010D', '0110'].forEach(p => s.supportedPIDs.add(p));
    await s.initialHealthScan();
    const h = vm.runInContext('_pidHealth', s);
    toets('010D is alsnog ok', h['010D'], 'ok');
    toets('0110 blijft nodata', h['0110'], 'nodata');
    const tweede = s.verzonden.slice(3);
    toets('de herkansing vraagt het volledige commando, 3000 ms', tweede, [['010D', 3000], ['0110', 3000]]);
    toets('010C (ok) niet opnieuw', gevraagd(s, '010C'), 0);
    toets('de telling klopt', s.btlog.some(x => /2 ondersteund, 1 niet aanwezig, 0 ongeldig/.test(x.m)), true);
  }

  console.log('\n8. Afbreken slaat de herkansing over');
  {
    const s = bouw({ '010C1': '' });
    s.supportedPIDs.add('010C');
    vm.runInContext("var _echt=sendCmd; sendCmd=function(c,t){ _healthAbort=true; return _echt(c,t); };", s);
    await s.initialHealthScan();
    toets('één vraag, geen tweede', s.verzonden.length, 1);
  }

  console.log('\n9. Profiel-start: alleen het afgekeurde krijgt een herkansing');
  {
    const s = bouw({ '010D': '41 0D 32' });
    ['010C', '010D', '0110'].forEach(p => s.supportedPIDs.add(p));
    vm.runInContext("_pidHealth={'010C':'ok','010D':'nodata','0110':'onzin'};", s);
    const nu = await s.plHerkansNodata();
    toets('010D en 0110 gevraagd, 010C niet', s.verzonden.map(v => v[0]), ['010D', '0110']);
    toets('één alsnog ok', nu, 1);
    toets('010D is kiesbaar', vm.runInContext("_pidHealth['010D']", s), 'ok');
  }

  console.log('\n10. TEGENPROEVEN — de oude vorm wordt rood');
  {
    const een = BRON.replace('const PL_STEUN_POGINGEN = 3;', 'const PL_STEUN_POGINGEN = 1;');
    const s = bouw({ '0100': p => p === 1 ? '' : '41 00 08 10 00 01', '0120': '41 20 00 00 00 00', '010C': '41 0C 1A F8' }, een);
    await s.discoverPIDsBitmap();
    toets('één poging: 0105 ontbreekt (alleen de sweep vindt 010C)', s.supportedPIDs.has('0105'), false);

    const zonderHk = BRON.replace('if(!_healthAbort && herkans.length){', 'if(false){');
    const s2 = bouw({ '010D1': '', '010D': '41 0D 32' }, zonderHk);
    s2.supportedPIDs.add('010D'); s2.supportedPIDs.add('010C');
    vm.runInContext("sendCmd=(function(o){ return function(c,t){ return c==='010C1' ? Promise.resolve('41 0C 1A') : o(c,t); }; })(sendCmd);", s2);
    await s2.initialHealthScan();
    toets('zonder herkansing blijft 010D grijs', vm.runInContext("_pidHealth['010D']", s2), 'nodata');
  }

  console.log('\n' + n + ' toetsen, ' + (fout ? fout + ' FOUT' : 'alles goed'));
  process.exit(fout ? 1 : 0);
}
main().catch(function (e) { console.log('  FOUT  klapte: ' + (e && e.stack || e)); process.exit(1); });
