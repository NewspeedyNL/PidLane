// test-steunbits.js — #586: de steunbits van alle ECU's samen.
//
// Op een functionele 0100 antwoordt elke emissie-ECU: motor (7E8), bak (7E9),
// hybride-ECU (7EA). discoverPIDsBitmap() en profielTegenSteunbits() lazen
// alleen de eerste regel; 015B (laadtoestand hybride accu) kwam bij een
// Toyota daardoor nooit in supportedPIDs. En profielTegenSteunbits() zou een
// PID van de bak juist uit het profiel GOOIEN.
//
// Laadt de echte plSteunbitsUit() uit pidlane-rijsituatie.js. De motorregel
// is de échte 0100 van een Toyota Auris hybride (ELM327-emulator).
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
const van = bron.indexOf('function plSteunbitsUit(raw, q){');
const tot = bron.indexOf('\n}\n', van) + 3;
if (van < 0 || tot < van) { console.log('  FOUT  plSteunbitsUit() niet gevonden — anker verdwenen'); process.exit(1); }
function laad(code) {
  const s = {}; vm.createContext(s);
  vm.runInContext(code + '\nthis.f = plSteunbitsUit;', s);
  return s.f;
}
const F = laad(bron.slice(van, tot));
const hx = (w) => (w >>> 0).toString(16).toUpperCase().padStart(8, '0');
const heeft = (w, pid) => { const k = parseInt(pid, 16); return ((w >>> (32 - k)) & 1) === 1; };

console.log('\n1. Eén ECU');
toets('de echte Auris-0100: BE3FA813', hx(F('41 00 BE 3F A8 13', '0100')) === 'BE3FA813');
toets('met SEARCHING... ervoor', hx(F('SEARCHING...\r41 00 BE 3F A8 13', '0100')) === 'BE3FA813');
toets('mét headers', hx(F('7E8 06 41 00 BE 3F A8 13', '0100')) === 'BE3FA813');
toets('zonder spaties', hx(F('4100BE3FA813', '0100')) === 'BE3FA813');
toets('NO DATA: null', F('NO DATA', '0100') === null);
toets('de verkeerde bitmap telt niet', F('41 20 90 15 B0 15', '0100') === null);

console.log('\n2. Twee ECU\'s');
const twee = F('41 00 BE 3F A8 13\r41 00 00 00 10 00', '0100');
toets('motor + hybride-ECU samen: BE3FB813', hx(twee) === 'BE3FB813', hx(twee));
const blok40 = F('7E8 06 41 40 7A 1C 80 00\r7EA 06 41 40 00 00 00 20', '0140');
toets('015B van de hybride-ECU (7EA) staat erin', heeft(blok40, '1B'), hx(blok40));
toets('wat de motor heeft blijft staan (0142)', heeft(blok40, '02'), hx(blok40));
const bak = F('7E8 06 41 00 BE 3F A8 13\r7E9 06 41 00 00 40 00 00', '0100');
toets('010A van de bak (7E9) staat erin', heeft(bak, '0A'), hx(bak));

console.log('\n3. TEGENPROEF — alleen de eerste regel');
const eerste = laad(bron.slice(van, tot).replace('if(!isNaN(v)) w=((w||0)|v)>>>0;', 'if(!isNaN(v) && w===null) w=v>>>0;'));
toets('dan ontbreekt 015B weer', !heeft(eerste('7E8 06 41 40 7A 1C 80 00\r7EA 06 41 40 00 00 00 20', '0140'), '1B'));

console.log('\n' + (fout ? fout + ' van ' + n + ' fout' : 'Alles goed (' + n + ')'));
process.exit(fout ? 1 : 0);
