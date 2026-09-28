// ══════════════════════════════════════════════════════════════════
// test-demoopslag.js — een demo-auto laat niets achter op het toestel
// ──────────────────────────────────────────────────────────────────
// WAAROM. Een demo is een verzonnen auto met verzonnen waarden. Alles wat
// daarvan bewaard wordt, duikt later op als afwijking: in het voertuigdossier,
// in wat de app over "deze auto" onthoudt, in de logtabel waar meetopdrachten
// uit gebouwd worden. Gevonden op 28-09-2026, per opslagplek:
//
//   saveSession            sessiestatistiek per VIN (voertuigdossier)
//   waarneming             het profiel per auto — bij een kentekendemo op
//                          merk|model|jaar, dus dat van een ÉCHTE auto
//   dpfSchrijf             de roetfilterteller per voertuig
//   voertuigdata           km/onderhoud/rijsituatie per VIN of kenteken; en
//                          bij het LEZEN kwam het dossier van je eigen auto
//                          de kentekendemo in
//   diagnose               AI-antwoorden, 14 dagen op merk/model/jaar gecachet
//   plSelectieMeld         de selectie voor hervatten na een crash
//   PLGear._opslaan        het versnellingsmodel van het actieve voertuig
//   logToSheets            logregels met merk, jaar, VIN en zonder demovlag
//   plDemoStop             de demo-auto bleef in vehicleInfo na het stoppen
//
// ELK GEVAL DRAAIT TWEE KEER met dezelfde opzet: in demo moet er niets
// bewaard worden, zonder demo wél. Die tweede helft is de tegenproef: zonder
// hem bewijst "niets bewaard" alleen dat de opzet niets deed.
//
// De echte functies, uit de bron geknipt met ankers; verdwijnt een anker,
// dan stopt deze test in plaats van groen te blijven staan.
//
// Draaien vanuit public/:  node test-demoopslag.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

function knip(bestand, van, tot, wat, totErbij) {
  const bron = fs.readFileSync(path.join(__dirname, bestand), 'utf8');
  const a = bron.indexOf(van);
  const b = bron.indexOf(tot, a < 0 ? 0 : a);
  if (a < 0 || b < 0) { console.error('FOUT: ' + wat + ' niet gevonden in ' + bestand + ' (anker verschoven?).'); process.exit(1); }
  return bron.slice(a, totErbij ? b + tot.length : b);
}

// Een sandbox met een localStorage die bijhoudt wat er geschreven wordt.
function sandbox(demo, extra) {
  const opslag = {}, geschreven = [];
  const s = Object.assign({
    console: { log() {}, warn() {}, error() {} },
    localStorage: {
      getItem: (k) => (k in opslag ? opslag[k] : null),
      setItem: (k, v) => { opslag[k] = String(v); geschreven.push(k); },
      removeItem: (k) => { delete opslag[k]; }
    },
    log() {}, Date, JSON, Math, Set, Object, Array, String, Number, Promise,
    demoMode: demo
  }, extra || {});
  s.window = s;
  vm.createContext(s);
  return { s, opslag, geschreven };
}
const beide = (fn) => ({ demo: fn(true), echt: fn(false) });

(async () => {
  console.log('1. Het voertuigdossier (sessies per VIN)');
  {
    const src = knip('pidlane-pids.js', 'function sessionsKey(vin)', 'function loadSessions(vin)', 'saveSession');
    const r = beide((demo) => {
      const b = sandbox(demo, {
        vehicleInfo: { vin: 'JM3KFBCL8J0123456', merk: 'Mazda', year: '2018' },
        _sessionStats: { '010C': { n: 5, sum: 5000, min: 900, max: 1100, last: 1000 } }
      });
      vm.runInContext(src + '\nsaveSession();', b.s);
      return b.geschreven;
    });
    toets('in demo geen sessie in het dossier, zonder demo wel', r.demo.length === 0 && r.echt.indexOf('pl_sessions_JM3KFBCL8J0123456') >= 0, JSON.stringify(r));
  }

  console.log('\n2. Het profiel per auto (waarneming)');
  {
    const src = knip('pidlane-waarneming.js', 'function _autoSleutel() {', '/* Laden zet', '_autoSleutel');
    const r = beide((demo) => {
      const b = sandbox(demo, { vehicleInfo: { vin: '', merk: 'Mazda', model: 'CX-5', year: '2018' } });
      return vm.runInContext(src + '\n_autoSleutel();', b.s);
    });
    toets('een kentekendemo krijgt geen profielsleutel; een echte auto zonder VIN wel (merk|model|jaar)',
      r.demo === null && r.echt === 'Mazda|CX-5|2018', JSON.stringify(r));
  }

  console.log('\n3. De roetfilterteller');
  {
    const src = knip('pidlane-berekend.js', "const DPF_LS='pl_dpf_';", 'let _dpfK=null', 'de roetfilterteller');
    const r = beide((demo) => {
      const b = sandbox(demo);
      vm.runInContext(src + "\ndpfSchrijf('kp_v1', { kmSinds: 120 });", b.s);
      return b.geschreven;
    });
    toets('in demo niet bewaard, zonder demo wel', r.demo.length === 0 && r.echt.indexOf('pl_dpf_kp_v1') >= 0, JSON.stringify(r));
  }

  console.log('\n4. Het voertuigoverzicht (km, onderhoud, rijsituatie)');
  {
    const src = knip('pidlane-voertuigdata.js', 'function _uvdDefault(){', 'function applyUserOverrides(){', 'het voertuigoverzicht') +
      '\nglobalThis.__uv = { laad: loadUserVehicleData, bewaar: saveUserVehicleData, zet: (x) => { userVehicleData = x; }, lees: () => userVehicleData };';
    const r = beide((demo) => {
      const b = sandbox(demo, { vehicleInfo: { vin: '' } });
      b.opslag.pl_kenteken = 'AB123C';
      b.opslag.pl_uvd_AB123C = JSON.stringify({ km: '84210', bijz: 'nieuwe accu' });
      vm.runInContext(src, b.s);
      b.s.__uv.laad();
      const gelezen = b.s.__uv.lees().km;
      b.geschreven.length = 0;
      b.s.__uv.zet(Object.assign({}, b.s.__uv.lees(), { km: '1' }));
      b.s.__uv.bewaar();
      return { gelezen, geschreven: b.geschreven.slice() };
    });
    toets('een kentekendemo leest het dossier van je eigen auto niet in; buiten demo wel',
      r.demo.gelezen === '' && r.echt.gelezen === '84210', JSON.stringify(r));
    toets('in demo wordt er niets bewaard, zonder demo wel',
      r.demo.geschreven.length === 0 && r.echt.geschreven.length === 1, JSON.stringify(r));
  }

  console.log('\n5. De diagnosecache en -geschiedenis');
  {
    const src = knip('pidlane-diagnose.js', 'function _diagNorm(s)', 'async function findCauses', 'de diagnosecache');
    const r = beide((demo) => {
      const b = sandbox(demo);
      vm.runInContext(src + "\ndiagCacheSet('sig', [{ naam: 'lekke slang' }]);\ndiagHistoryAdd({ merk: 'Mazda' }, 'hapert', [{ naam: 'lekke slang' }]);", b.s);
      return b.geschreven;
    });
    toets('in demo geen cache en geen geschiedenis, zonder demo allebei', r.demo.length === 0 && r.echt.length === 2, JSON.stringify(r));
  }

  console.log('\n6. De sensorselectie voor hervatten na een crash');
  {
    const src = knip('pidlane-pidgate.js', 'function _selectieNamen(pids){', 'return {erbij, eraf, tekst};\n}', 'plSelectieMeld', true);
    const r = beide((demo) => {
      const b = sandbox(demo, { _SELECTIE_NAMEN_MAX: 4, getPidDef: () => null, activePIDs: new Set(['010C', '010D']) });
      vm.runInContext(src + "\nplSelectieMeld(new Set(['010C']), 'test');", b.s);
      return b.geschreven;
    });
    toets('in demo niet bewaard, zonder demo wel', r.demo.length === 0 && r.echt.indexOf('pl_selectie') >= 0, JSON.stringify(r));
  }

  console.log('\n7. Het versnellingsmodel van het actieve voertuig');
  {
    const src = knip('pidlane-gear.js', '  _opslaan(force){', '  leerOpnieuw(){', 'PLGear._opslaan');
    const r = beide((demo) => {
      const lsSet = [];
      let naarServer = 0;
      const b = sandbox(demo, { lsSet: (k) => lsSet.push(k), nu: () => 0, LS_MODEL: 'pl_gear_' });
      vm.runInContext('globalThis.__g = {' + src + '};', b.s);
      const g = b.s.__g;
      Object.assign(g, { model: { v: 1 }, _vuil: true, sleutel: 'kp_v1', _naarVoertuig: () => { naarServer++; } });
      g._opslaan(true);
      return { lsSet, naarServer };
    });
    toets('in demo niet lokaal en niet naar het voertuig, zonder demo allebei',
      r.demo.lsSet.length === 0 && r.demo.naarServer === 0 && r.echt.lsSet.length === 1 && r.echt.naarServer === 1, JSON.stringify(r));
  }

  console.log('\n8. De logregels');
  {
    const kolommen = knip('pidlane-auth.js', 'const AT_KOLOMMEN = new Set(', "'Demo','Repro','Device']);", 'AT_KOLOMMEN', true);
    const src = knip('pidlane-auth.js', 'async function logToSheets', 'async function flushAirtable', 'logToSheets');
    const r = {};
    for (const demo of [true, false]) {
      let vinGevraagd = 0;
      const b = sandbox(demo, {
        AIRTABLE_URL: 'x', vehicleInfo: { merk: 'Mazda', year: '2018', vin: 'JM3KFBCL8J0123456' },
        _plLogSoort: () => 'app', _plSessieId: () => 's1', _plLogAdapter: () => '',
        _plVinVoorLog: async () => { vinGevraagd++; return 'pseudo123'; },
        _atBuffer: [], _atTimer: null, clearTimeout() {}, setTimeout() {}, flushAirtable() {},
        selectedNetwork: null, activePIDs: new Set(), currentUser: { name: 'x', role: 'klant' }
      });
      vm.runInContext(kolommen + '\n' + src + '\nglobalThis.__log = logToSheets;', b.s);
      await b.s.__log('info', 'hallo', {});
      r[demo ? 'demo' : 'echt'] = { rij: b.s._atBuffer[0] && b.s._atBuffer[0].fields, vinGevraagd };
    }
    const d = r.demo.rij || {}, e = r.echt.rij || {};
    toets('een demoregel draagt Demo en RecordType demo; een echte niet',
      d.Demo === true && d.RecordType === 'demo' && e.Demo === undefined && e.RecordType === 'app', JSON.stringify({ d, e }));
    toets('een demoregel zegt niets over een auto: geen merk, jaar of VIN — een echte wel',
      d.Merk === '' && d.Year === '' && d.VIN === '' && r.demo.vinGevraagd === 0 && e.Merk === 'Mazda' && e.VIN === 'pseudo123', JSON.stringify({ d, e }));
  }

  console.log('\n9. Stoppen met de demo');
  {
    const src = knip('pidlane-demo.js', 'function plDemoStop(){', 'function demoRefresh(){', 'plDemoStop');
    let geleegd = 0;
    const b = sandbox(true, { vehicleInfo: { merk: 'Mazda', model: 'CX-5', year: '2018', vin: 'JM3KFBCL8J0123456' }, resetVehicleSources: () => { geleegd++; } });
    vm.runInContext(src + '\nplDemoStop();', b.s);
    toets('de demo-auto is weg uit vehicleInfo, en de voertuigbronnen zijn geleegd',
      b.s.vehicleInfo.vin === '' && b.s.vehicleInfo.merk === 'Onbekend' && geleegd === 1, JSON.stringify(b.s.vehicleInfo));
  }

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error('FOUT: ' + (e && e.stack || e)); process.exit(1); });
