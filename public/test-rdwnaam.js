// test-rdwnaam.js — welke RDW-modelnaam is echt? (22-10-2026)
//
// _rdwPlausibleName() in pidlane-koopcheck.js weert rommel uit het
// kentekenregister. Over het echte NL-wagenpark (RDW open data, 1500
// grootste merk/handelsbenaming-combinaties, 9,3 miljoen auto's) keurde hij
// 6% af: elke Peugeot (208, 3008 — alleen cijfers), UP!, KA+, MG ZS (geen
// klinker), SMART #1. Die namen staan hieronder letterlijk zoals RDW ze
// geeft, met het aantal auto's. De rommel eronder komt ook uit het register.
//
// Laadt de echte functie.
'use strict';
const fs = require('fs');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}
const bron = fs.readFileSync(__dirname + '/pidlane-koopcheck.js', 'utf8');
const van = bron.indexOf('function _rdwPlausibleName(s){'), tot = bron.indexOf('\n}\n', van) + 3;
if (van < 0) { console.log('  FOUT  _rdwPlausibleName niet gevonden — anker verdwenen'); process.exit(1); }
const laad = (b) => new Function(b + '\nreturn _rdwPlausibleName;')();
const F = laad(bron.slice(van, tot));

const ECHT = [['208', 109344], ['2008', 75392], ['UP!', 65135], ['308', 53718], ['3008', 44655], ['108', 43088],
  ['500', 12037], ['206+', 6787], ['120', 3512], ['KA+', 2719], ['MG ZS', 1234], ['001', 1202], ['#1', 1033],
  ['9-3', 396], ['KARL / VIVA', 28941], ['LYNK & CO 01', 34203], ['ID.3 PRO 150 KW', 16960], ['CX-5', 1], ['3ER REIHE', 36612]];
const ROMMEL = ['========', '2*****', '0*****', 'U*****', '#', '1', '----', 'xxxxxxx', 'qwrtzp'];

console.log('\n1. Echte modelnamen uit het register');
ECHT.forEach(([naam, aantal]) => toets(naam + ' (' + aantal.toLocaleString('nl') + ' auto\'s)', F(naam) === true));
console.log('\n2. Rommel blijft rommel');
ROMMEL.forEach((x) => toets('"' + x + '" geweigerd', F(x) === false));

console.log('\n3. TEGENPROEF — de oude regel "minstens één letter"');
const oud = laad(bron.slice(van, tot).replace(/if\(letters<1\) return [^;]+;/, 'if(letters<1) return false;'));
toets('dan valt de Peugeot 208 weer weg', oud('208') === false);

console.log('\n' + (fout ? fout + ' van ' + n + ' fout' : 'Alles goed (' + n + ')'));
process.exit(fout ? 1 : 0);
