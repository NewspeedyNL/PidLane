// ══════════════════════════════════════════════════════════════════
// test-weergave.js — de eigen weergave van een sensor (29-10-2026)
// ──────────────────────────────────────────────────────────────────
// Uit het gebruik: "raildruk van kPa naar bar, en zelf een min en max
// invullen als een sensor niet op een plek past." Getoetst op de echte
// pidlane-toon.js, pidlane-visprofiel.js en pidlane-visueel.js, met de echte
// pidlane-data.js (0123: 0–655350 kPa):
//   1. invoer() en schoon(): komma, lege velden, een halve schaal, factor 0
//   2. zetEigen()/eigen(): bewaard per sensor, en opnieuw gelezen na wissen
//   3. omgerekend(): de factor, en niets aan een niet-getal
//   4. een profielplek (Hyperlane) krijgt eenheid, schaal en factor
//   5. een boog van de Basismeter: met een eigen schaal past 0123 wél
//
// Draaien vanuit public/:  node test-weergave.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
const lees = f => fs.readFileSync(__dirname + '/' + f, 'utf8');

function maak(bronnen) {
  const opslag = {};
  const c = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: k => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: k => { delete opslag[k]; } },
    pidHist: {}, pidVals: {}, activePIDs: new Set(), hiddenPIDs: new Set(), vehicleInfo: {}
  };
  c.window = c; c.globalThis = c; c.__opslag = opslag;
  vm.createContext(c);
  vm.runInContext(lees('pidlane-data.js'), c, { filename: 'pidlane-data.js' });
  c.getPidDef = p => c.ALL_PID_DEFS[p] || null;
  (bronnen || ['pidlane-toon.js', 'pidlane-visprofiel.js', 'pidlane-visueel.js']).forEach(f => {
    vm.runInContext(typeof f === 'string' ? lees(f) : f.bron, c, { filename: typeof f === 'string' ? f : f.naam });
  });
  return c;
}

const C = maak(), T = C.PLToon, P = C.PLVisProfiel, V = C.PLVisueel;
if (!T || typeof T.schoon !== 'function' || !P || !V) { console.log('  FOUT  PLToon.schoon, PLVisProfiel of PLVisueel niet geladen'); process.exit(1); }
const json = x => JSON.stringify(x);

console.log('1. Wat er van een ingevulde weergave bruikbaar is');
waar('"0,01" met een komma is 0.01', T.invoer('0,01') === 0.01 && T.invoer(' 2.5 ') === 2.5);
waar('een leeg veld is null, geen 0', T.invoer('') === null && T.invoer('  ') === null && T.invoer(null) === null && T.invoer('abc') === null);
waar('kPa naar bar met een schaal', json(T.schoon({ eenheid: ' bar ', factor: '0,01', min: '0', max: '2000', dec: '1' })) === json({ factor: 0.01, eenheid: 'bar', min: 0, max: 2000, dec: 1 }));
waar('een factor van 0 of 1 telt niet (0 wist elk getal, 1 doet niets)', T.schoon({ factor: '0' }) === null && T.schoon({ factor: '1' }) === null);
waar('een halve schaal of max ≤ min telt niet', T.schoon({ min: '0' }) === null && T.schoon({ min: '5', max: '5' }) === null && T.schoon({ min: '9', max: '2' }) === null);
waar('decimalen alleen 0–3', T.schoon({ dec: '7' }) === null && json(T.schoon({ dec: '2' })) === json({ dec: 2 }));
waar('alles leeg is geen weergave', T.schoon({ eenheid: '', factor: '', min: '', max: '', dec: '' }) === null && T.schoon(null) === null);

console.log('\n2. Bewaard per sensor');
T.zetEigen('0123', { eenheid: 'bar', factor: '0,01', min: '0', max: '2000' });
waar('eigen("0123") geeft de weergave terug', json(T.eigen('0123')) === json({ factor: 0.01, eenheid: 'bar', min: 0, max: 2000 }));
waar('kleine letters zijn dezelfde sensor', !!T.eigen('0123') && json(T.eigen('0123')) === json(T.eigen('0123'.toLowerCase())));
waar('een andere sensor heeft niets', T.eigen('0142') === null);
waar('staat in pl_weergave', /"0123"/.test(C.__opslag[T.W_SLEUTEL] || ''));
T._wis();
waar('na het wissen van de cache opnieuw uit de opslag gelezen', !!T.eigen('0123') && T.eigen('0123').eenheid === 'bar');
C.__opslag[T.W_SLEUTEL] = '{kapot';
T._wis();
waar('rommel in de opslag: geen eigen weergave, geen fout', T.eigen('0123') === null);
T.zetEigen('0123', { eenheid: 'bar', factor: '0,01', min: '0', max: '2000' });
T.zetEigen('0142', { dec: '2' });
T.zetEigen('0142', null);
waar('Standaardweergave wist alleen die sensor', T.eigen('0142') === null && !!T.eigen('0123'));

console.log('\n3. Omrekenen');
waar('85000 kPa × 0,01 = 850 bar', T.omgerekend(85000, T.eigen('0123')) === 850);
waar('zonder factor blijft de waarde', T.omgerekend(12.7, { eenheid: 'V' }) === 12.7 && T.omgerekend(12.7, null) === 12.7);
waar('een niet-getal blijft wat het is', T.omgerekend('NO DATA', T.eigen('0123')) === 'NO DATA' && T.omgerekend(null, T.eigen('0123')) === null);
waar('de ruwe waarde (PLToon.waarde) rekent níét om: het oordeel en de opname blijven in kPa', T.waarde('0123', 85000) === 85000);

console.log('\n4. Een plek van een profiel (Hyperlane, accu → raildruk)');
const mag = q => ['010C', '010D', '0105', '0149', '0123', '012F'].indexOf(q) >= 0;
const opts = { keuze: { 'hyperlane/accu': '0123' }, defs: [{ pid: '0123', name: 'Raildruk (direct)', unit: 'kPa', min: 0, max: 655350 }], weergave: T.weergaven() };
const ind = P.indeling('hyperlane', mag, 'diesel', opts);
waar('0123 staat op de accuplek', ind && ind.plekken.accu === '0123', ind && json(ind.plekken));
waar('met zijn eigen weergave', ind && ind.weergave && json(ind.weergave.accu) === json(T.eigen('0123')));
const accu = P.voorInd('hyperlane', ind).plekken.find(x => x.rol === 'accu');
waar('de plek krijgt bar en 0–2000, niet kPa en 0–655350', accu && accu.eenheid === 'bar' && accu.lo === 0 && accu.hi === 2000, accu && json({ e: accu.eenheid, lo: accu.lo, hi: accu.hi }));
waar('de naam is die van de sensor', accu && /Raildruk/.test(accu.naam));
const zonder = P.indeling('hyperlane', mag, 'diesel', Object.assign({}, opts, { weergave: {} }));
const accu0 = P.voorInd('hyperlane', zonder).plekken.find(x => x.rol === 'accu');
waar('tegenproef: zonder weergave staat er kPa op 0–655350', accu0.eenheid === 'kPa' && accu0.hi === 655350, json({ e: accu0.eenheid, hi: accu0.hi }));
waar('alleen een factor: de schaal van de plek rekent mee', json(P.weergaveVelden({ factor: 0.01 }, { lo: 0, hi: 300 })) === json({ lo: 0, hi: 3 }));
waar('een negatieve factor draait de schaal niet om', json(P.weergaveVelden({ factor: -1 }, { lo: 0, hi: 10 })) === json({ lo: -10, hi: 0 }));
waar('een eigen schaal gaat voor de factor', json(P.weergaveVelden({ factor: 0.01, min: 0, max: 2000 }, { lo: 0, hi: 300 })) === json({ lo: 0, hi: 2000 }));

console.log('\n5. Een boog van de Basismeter');
const D = C.ALL_PID_DEFS;
waar('0123 met een eigen schaal past op een boog (0–2000 bar)', json(V.boogSchaal('0123', D['0123'])) === json([0, 2000]), json(V.boogSchaal('0123', D['0123'])));
T.zetEigen('0123', null);
waar('tegenproef: zonder eigen schaal niet (0–655350 is te breed)', V.boogSchaal('0123', D['0123']) === null);
T.zetEigen('0105', { factor: '1,8' });
waar('koelwater met alleen een factor: de vaste boog 40…130 rekent mee', json(V.boogSchaal('0105', D['0105'])) === json([72, 234]), json(V.boogSchaal('0105', D['0105'])));
T.zetEigen('0105', null);
waar('zonder weergave weer 40…130', json(V.boogSchaal('0105', D['0105'])) === json([40, 130]));
T.zetEigen('010C', { min: '0', max: '9' });
waar('toerental blijft van de meter, ook met een eigen schaal', V.boogSchaal('010C', D['010C']) === null);
T.zetEigen('010C', null);
const af = V.zonderSchaal([{ pid: '0123', name: 'Raildruk', unit: 'kPa', min: 0, max: 655350 }], true).map(d => d.pid).join(',');
waar('"alle": ook een vaste sensor zonder schaal staat in de lijst om een schaal te geven', af === '0123', af);
waar('zonder "alle" alleen eigen sensoren (#472 ongewijzigd)', V.zonderSchaal([{ pid: '0123', name: 'Raildruk', unit: 'kPa', min: 0, max: 655350 }]).length === 0);

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + (ok + fout) : 'Alles goed — ' + ok + ' controles'));
process.exit(fout ? 1 : 0);
