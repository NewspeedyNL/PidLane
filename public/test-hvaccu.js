// ══════════════════════════════════════════════════════════════════
// test-hvaccu.js — accugezondheid (SoH) van de HV-accu, van OBDb tot oordeel (#751)
// ──────────────────────────────────────────────────────────────────
// De keten: een OBDb-commando (Volvo 29-bit, 1DD01635>1EC6AE80) wordt een
// eigen PID, adresZet() zet de ELM op een 11-bit bus tijdelijk op protocol 7,
// de nep-auto antwoordt alleen dán, en hvRol/hvOordeel maken er een uitkomst
// van. Alles op de echte bron: pidlane-uitgebreid.js en nepauto.js.
//
// Wat níét getoetst is: dat een echte Volvo op 1DD01635 antwoordt. OBDb zegt
// dat (command_support.yaml van de S60 2020); het is een vraag voor een rit.
//
// Draaien vanuit public/:  node test-hvaccu.js     (exit 0 = goed)
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

// De nep-auto: een Volvo met OBD op 11-bit en de BECM op 29-bit, op één bus.
const NC = { console }; NC.window = NC; vm.createContext(NC);
vm.runInContext(lees('nepauto.js'), NC, { filename: 'nepauto.js' });
const N = NC.PLNepAuto;
function volvo(did) {
  const a = N.maak({ id: 'volvo', proto: '6', vin: 'YV1ZZZZZZK1000001', ecus: [{ adres: '7E8', pids: '0D' },
    { adres: '1EC6AE80', tx: '1DD01635', bus29: true, pids: '', did: did }] });
  ['ATE0', 'ATH0', 'ATSP0', '0100'].forEach((c) => a.stuur(c));
  return a;
}

// De echte module, met sendCmd naar de nep-auto.
function bouw(auto, bus) {
  const s = { console: { log() { }, warn() { }, error() { } } };
  s.window = s; s.globalThis = s;
  s.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
  s.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() { },
    createElement: () => ({ style: {}, classList: { add() { }, remove() { } }, appendChild() { } }), body: {} };
  s.addEventListener = () => { };
  s.setTimeout = (fn) => { if (typeof fn === 'function') fn(); return 0; };
  s.setInterval = () => 0; s.clearInterval = () => { }; s.clearTimeout = () => { };
  s._auto = auto; s._log = [];
  vm.createContext(s);
  vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });
  vm.runInContext(`
    var connected=true, demoMode=false, supportedPIDs=new Set(), activePIDs=new Set(), pidVals={}, pidHist={};
    var vehicleInfo={make:'VOLVO'}, discoveredPIDDefs=[];
    var selectedNetwork=${JSON.stringify(bus || { id: '6' })};
    function btDiag(m){ _log.push(String(m)); }
    function log(){}
    function delay(){ return Promise.resolve(); }
    function getPidDef(){ return null; }
    async function withBus(n, f){ return f(); }
    var _faal={};
    async function sendCmd(c){ _log.push(String(c)); if(_faal[c]){ delete _faal[c]; throw new Error('time-out'); } return _auto.stuur(String(c)).tekst; }
  `, s, { filename: 'sandbox-omgeving' });
  vm.runInContext(lees('pidlane-uitgebreid.js'), s, { filename: 'pidlane-uitgebreid.js' });
  return s;
}

// Het échte OBDb-commando (Volvo-XC40-Recharge, signalsets/v3/default.json).
const OBDB = { commands: [
  { hdr: 'D016', rax: '1EC6AE80', pri: '1D', tst: '35', fcm1: true, dbg: true, cmd: { '22': '496D' }, freq: 1,
    signals: [{ id: 'XC40R_HVBAT_ST_HEALTH', path: 'Battery', fmt: { len: 32, max: 42949672, div: 100, unit: 'percent' }, name: 'High voltage battery state of health' }] },
  { hdr: 'D016', rax: '1EC6AE80', pri: '1D', tst: '35', fcm1: true, dbg: true, cmd: { '22': '4801' }, freq: 1,
    signals: [{ id: 'XC40R_HVBAT_ST_CHG', path: 'Battery', fmt: { len: 16, max: 100, div: 100, unit: 'percent' }, name: 'High voltage battery state of charge' }] },
  { hdr: 'D016', pri: '1D', tst: '30', fcm1: true, cmd: { '22': 'EE6F' }, signals: [{ id: 'X', name: 'Accelerator pedal', fmt: { len: 8, unit: 'percent' } }] }
] };

(async () => {
  console.log('\n1. Volvo 29-bit uit OBDb: adres en kandidaat');
  const s = bouw(volvo({ '22496D': '00 00 23 82', '224801': '1B 58' }));
  const E = s.PLEigen;
  t('obdbAdres: D016, pri 1D, tst 35, rax 1EC6AE80 = 1DD01635>1EC6AE80', E.obdbAdres(OBDB.commands[0]), '1DD01635>1EC6AE80');
  t('obdbAdres: Volvo zonder antwoordadres = onbekend', E.obdbAdres(OBDB.commands[2]), null);
  t('obdbAdres: Volvo zonder prioriteit of doeladres = onbekend', [E.obdbAdres({ hdr: 'D016', rax: '1EC6AE80', tst: '35' }), E.obdbAdres({ hdr: 'D016', rax: '1EC6AE80', pri: '1D' })].join(','), ',');
  t('EIGEN_ECU: Volvo tx>rx wel, kaal of met een 11-bit antwoord niet', [E.ECU.test('1DD01635>1EC6AE80'), E.ECU.test('1DD01635'), E.ECU.test('1DD01635>7E8')].join(','), 'true,false,false');
  const kand = E.obdbKandidaten(OBDB, 'Volvo-XC40-Recharge', 2021);
  t('kandidaten: SoH en laadtoestand op het Volvo-adres, de pedaal (geen adres) valt weg', kand.map((k) => k.code + '@' + k.ecu).sort().join(','), '224801@1DD01635>1EC6AE80,22496D@1DD01635>1EC6AE80');
  const soh = kand.find((k) => k.code === '22496D');

  console.log('\n2. Steunlijst: de lange vorm geeft het adres, de korte (S60 2019) alleen de kop');
  const lang = E.obdbSteun(['model_year: 2020', 'supported_commands_by_ecu:', '  "D016":', '  - D016.1EC6AE80.224801|ta=35,fc=1,c=1D:S60_HVBAT_ST_CHG'].join('\n'));
  t('steun lang: 224801@1DD01635', Object.keys(lang.codes).join(','), '224801@1DD01635');
  t('steun lang: alleen 4801 komt door, de SoH (niet beantwoord) niet', E.obdbKandidaten(OBDB, 'x', 2020, null, lang).map((k) => k.code).join(','), '224801');
  const kort = E.obdbSteun(['model_year: 2019', 'supported_commands_by_ecu:', '  "D016":', '  - D016.224801'].join('\n'));
  t('steun kort: de code op de kop D016 telt voor elk Volvo-adres op die kop', E.obdbKandidaten(OBDB, 'x', 2019, null, kort).map((k) => k.code).join(','), '224801');

  console.log('\n3. De bus: 29-bit op een 11-bit auto, en daarna terug');
  E.zet(kand.map((k) => ({ code: k.code, naam: k.naam, formule: k.formule, eenheid: k.eenheid, ecu: k.ecu })), 'Volvo');
  s._log.length = 0;
  const r = await E.test(soh);
  t('de vraag: ATSP7, ATCP1D, ATSHD01635, filter en flow control, en alles terug tot ATSP6 en 7DF', s._log.join(' '),
    'ATSP7 ATCP1D ATSHD01635 ATCRA1EC6AE80 ATFCSH1DD01635 ATFCSD300000 ATFCSM1 22496D1 ATFCSM0 ATCRA ATCP18 ATSP6 ATSH7DF');
  t('de BECM antwoordt: SoH 90,9 %', r.ok && r.waarde, 90.9);
  t('en de OBD-motor antwoordt daarna weer op 11-bit', /41 0D/.test(s._auto.stuur('010D').tekst), true);
  const n29 = bouw(volvo({ '22496D': '00 00 23 82' }), { id: '7' });
  n29._log.length = 0;
  await n29.PLEigen.test(soh);
  t('op een 29-bit bus geen protocolwissel, terug naar 18DB33F1', n29._log.filter((c) => /^ATSP|^ATSH18/.test(c)).join(' '), 'ATSH18DB33F1');
  // Mislukt het terugzetten van het protocol, dan haalt de volgende vraag het in:
  // anders blijft de ELM op 29-bit staan en zwijgt de hele 11-bit pollus.
  vm.runInContext("_faal['ATSP6']=1", s);
  await E.test(soh);
  s._log.length = 0;
  await E.vraag('010D');
  t('ATSP6 mislukt: de volgende vraag zet eerst ATSP6 en 7DF terug', s._log.join(' '), 'ATSP6 ATSH7DF 010D1');
  // Tegenproef in de nep-auto zelf: zonder ATSP7 hoort de BECM niets.
  const stil = volvo({ '22496D': '00 00 23 82' });
  ['ATCP1D', 'ATSHD01635', 'ATCRA1EC6AE80'].forEach((c) => stil.stuur(c));
  t('nep-auto: op protocol 6 komt een 29-bit vraag nergens aan', stil.stuur('22496D1').tekst, 'NO DATA');
  stil.stuur('ATSP7');
  t('nep-auto: op protocol 7 wel', stil.stuur('22496D1').tekst, '62 49 6D 00 00 23 82');
  t('nep-auto: en de OBD-motor zwijgt dan', (stil.stuur('ATSH7DF'), stil.stuur('ATCRA'), stil.stuur('010D').tekst), 'NO DATA');

  console.log('\n4. hvLees en het oordeel');
  const hv = await E.hvLees();
  t('hvLees: SoH en laadtoestand, met code en naam', [hv.soh.waarde, hv.soh.code, hv.soc.waarde].join(','), '90.9,22496D,70');
  const geen = bouw(volvo({ '224801': '1B 58' }));
  geen.PLEigen.zet(kand.map((k) => ({ code: k.code, naam: k.naam, formule: k.formule, eenheid: k.eenheid, ecu: k.ecu })), 'Volvo');
  const hv2 = await geen.PLEigen.hvLees();
  t('hvLees: weigert de auto de SoH-code, dan geen waarde maar een fout', hv2.soh.waarde === null && /weigert|Geen antwoord/.test(hv2.soh.fout), true);

  const rol = (n) => E.hvRol(n);
  const ROLLEN = [
    ['High voltage battery state of health', 'soh'], ['State of health', 'soh'], ['HV battery SOH', 'soh'],
    ['High voltage battery state of charge', 'soc'], ['High voltage battery, average temperature', 'temp'],
    ['High voltage battery, max temperature', 'tempmax'],
    ['Battery state of charge', null], ['12V battery state of charge', null], ['12V battery state of health', null],
    ['Auxiliary battery temperature', null], ['High voltage battery, inlet coolant temperature', null],
    ['High voltage battery voltage', null], ['High voltage battery, IEM fuse voltage', null],
    ['High voltage battery cell minimum state of health', null]];
  t('hvRol: OBDb-namen naar rol', ROLLEN.map((x) => String(rol(x[0]))).join(','), ROLLEN.map((x) => String(x[1])).join(','));
  const o = (v) => E.hvOordeel({ soh: v }).map((x) => x.ernst).join('');
  t('hvOordeel: 69,9 rood, 70 oranje, 79,9 oranje, 80 info, 95 info', [o(69.9), o(70), o(79.9), o(80), o(95)].join(','), 'rood,oranje,oranje,info,info');
  t('hvOordeel: grens = de garantiegrens', E.HV_GARANTIE, 70);
  t('hvOordeel: 101 telt als 100 %, 120 / -1 / leeg / tekst niet', [/100%/.test(E.hvOordeel({ soh: 101 })[0].tekst), o(120), o(-1), o(null), o(''), o('x')].join(','), 'true,,,,,');

  console.log('\n─────────────────────────────────────────');
  console.log(ok + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error('FOUT: ' + (e && e.stack || e)); process.exit(1); });
