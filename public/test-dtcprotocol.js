// test-dtcprotocol.js — #584: mode 03 lezen per protocol, ook op AUTO.
//
// Bij automatische herkenning is selectedNetwork.id 'A5' (KWP) of 'A3'
// (ISO 9141). realScanDTC() toetste "CAN?" met /^[6-9A-C]/, en de A van AUTO
// maakte van elke K-lijn-auto een CAN-auto. Op K-lijn heeft mode 03 geen
// telbyte (drie codes per bericht, aangevuld met 0000): de eerste code werd
// als telling gelezen en de rest als één verzonnen code. Gevonden met
// bproef-merken.js: P0170 + P1570 werd C3015.
//
// Laadt de echte realScanDTC() uit pidlane-graph.js en de echte
// plProtocolBits() uit pidlane-bt.js.
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
function knip(bestand, van, tot) {
  const b = fs.readFileSync(bestand, 'utf8'), i = b.indexOf(van), j = b.indexOf(tot, i + 1);
  if (i < 0 || j < 0) { console.log('  FOUT  anker verdwenen in ' + bestand + ': ' + van); process.exit(1); }
  return b.slice(i, j);
}
const DTC = knip('pidlane-graph.js', 'async function realScanDTC(){', 'function renderDTC(){');
const BITS = knip('pidlane-bt.js', 'function plProtocolBits(id){', '// Puur. De CAN-adressen');

function lees(id, antwoord, dtc) {
  const s = { selectedNetwork: { id }, sendCmd: async () => antwoord };
  vm.createContext(s);
  vm.runInContext(BITS + (dtc || DTC) + '\nthis.realScanDTC = realScanDTC;', s);
  return s.realScanDTC();
}

(async () => {
  console.log('\n1. K-lijn op automatisch protocol (A5, A3, A4)');
  for (const id of ['A5', 'A3', 'A4', '5']) {
    const c = await lees(id, '43 01 70 15 70 00 00');
    toets(id + ': P0170 en P1570, geen spookcode', c.join() === 'P0170,P1570', c.join());
  }
  const twee = await lees('A5', '43 01 70 15 70 03 00\r43 04 20 00 00 00 00');
  toets('A5: vier codes over twee berichten', twee.join() === 'P0170,P1570,P0300,P0420', twee.join());

  console.log('\n2. CAN blijft met telbyte lezen');
  for (const id of ['A6', '6', 'A7', '7']) {
    const c = await lees(id, '43 02 04 20 01 71');
    toets(id + ': telbyte 02, P0420 en P0171', c.join() === 'P0420,P0171', c.join());
  }
  const pad = await lees('A6', '43 01 04 20 00 00 00');
  toets('A6: telling 1, opvulling erna telt niet', pad.join() === 'P0420', pad.join());

  console.log('\n3. TEGENPROEF — de oude toets op de eerste letter');
  const oud = DTC.replace(/const isCAN=.*;/, "const isCAN=/^[6-9A-Ca-c]/.test(String(selectedNetwork?.id||'6'));");
  const fout1 = await lees('A5', '43 01 70 15 70 00 00', oud);
  toets('met /^[6-9A-C]/ wordt het weer C3015', fout1.join() === 'C3015', fout1.join());

  console.log('\n' + (fout ? fout + ' van ' + n + ' fout' : 'Alles goed (' + n + ')'));
  process.exit(fout ? 1 : 0);
})();
