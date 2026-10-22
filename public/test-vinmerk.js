// test-vinmerk.js — #588: het merk uit de VIN, ook uit Europese fabrieken.
//
// decodeVIN() kende alleen de Japanse en Koreaanse fabriekscodes. Een Toyota
// Corolla uit Turkije (NMT), een Yaris uit Frankrijk (VNK — die staat zelfs in
// de demo-auto's van pidlane-data.js), een Kia uit Slowakije (U5Y) of een
// Hyundai uit Tsjechië (TMA) werd "Onbekend merk". Gevonden met
// bproef-merken.js.
//
// Laadt de echte decodeVIN() uit pidlane-rijsituatie.js en de echte
// demo-auto's uit pidlane-data.js.
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
const bron = fs.readFileSync('pidlane-rijsituatie.js', 'utf8');
const van = bron.indexOf('function decodeVIN(vin){');
const tot = bron.indexOf('\n}\n', van) + 3;
if (van < 0 || tot < van) { console.log('  FOUT  decodeVIN() niet gevonden — anker verdwenen'); process.exit(1); }
const decodeVIN = new Function(bron.slice(van, tot) + '\nreturn decodeVIN;')();

console.log('\n1. Europese fabrieken');
[['NMTBZ3BE00R000001', 'Toyota', 'Corolla/C-HR, Turkije'], ['SB1ZS3JE00E000001', 'Toyota', 'Auris, Engeland'],
 ['VNKKD3D310A123456', 'Toyota', 'Yaris, Frankrijk'], ['U5YH2512AJL000001', 'Kia', 'Ceed, Slowakije'],
 ['TMAJ38LADJJ000001', 'Hyundai', 'Tucson, Tsjechië'], ['NLHBT51BAMZ000001', 'Hyundai', 'i20, Turkije'],
 ['UU1DJF00X67000001', 'Dacia', 'Roemenië'], ['W1K2050421R000001', 'Mercedes-Benz', 'sinds 2019'],
 ['VR3UHZKXZMT000001', 'Peugeot', '208 II'], ['XMCGCDA1A5F000001', 'Mitsubishi', 'NedCar Born'], ['LSJW74A95MZ000001', 'MG', 'ZS EV, China'], ['LPSVSEDEEML000001', 'Polestar', 'Polestar 2, China']
].forEach(([vin, merk, waar]) => {
  const m = decodeVIN(vin).merk;
  toets(vin.slice(0, 3) + ' = ' + merk + ' (' + waar + ')', m === merk, m);
});

console.log('\n2. Wat al werkte, blijft werken');
toets('WVW = Volkswagen', decodeVIN('WVWZZZAUZGW000001').merk === 'Volkswagen');
toets('JMZ = Mazda', decodeVIN('JMZKFGWLA00100001').merk === 'Mazda');
toets('onbekende code: "Onbekend merk"', decodeVIN('ZZZ00000000000001').merk === 'Onbekend merk');

console.log('\n3. De demo-auto\'s van de app zelf');
const d = { window: {} }; d.window = d; vm.createContext(d);
vm.runInContext(fs.readFileSync('pidlane-data.js', 'utf8'), d);
const demo = Object.keys(d).map((k) => d[k]).find((v) => Array.isArray(v) && v.length && v[0] && v[0].wmi && v[0].vin) || [];
toets('demo-auto\'s gevonden', demo.length > 0);
demo.forEach((a) => toets('demo ' + a.merk + ' ' + a.model + ' (' + a.wmi + ')', decodeVIN(a.vin).merk === a.merk, decodeVIN(a.vin).merk));

console.log('\n' + (fout ? fout + ' van ' + n + ' fout' : 'Alles goed (' + n + ')'));
process.exit(fout ? 1 : 0);
