// test-obdbkoppel.js — van RDW-naam naar OBDb-model (22-10-2026)
//
// Gemeten tegen het échte NL-wagenpark (RDW open data, opendata.rdw.nl
// m9d7-ebf2: personenauto's sinds 2001, niet geëxporteerd, 9,3 miljoen):
// de oude obdbNamen() vond voor 51% een OBDb-model, de nieuwe voor 81%.
// RDW schrijft het merk vaak in het model ("TOYOTA AYGO"), OBDb noemt Opel
// "VauxhallOpel", en een Skoda Octavia staat er niet in maar is technisch
// een Golf.
//
// De veertig rijen hieronder zijn de veertig grootste merk/handelsbenaming-
// combinaties uit dat register, letterlijk zoals RDW ze geeft. Laadt de echte
// obdbKoppel() uit pidlane-uitgebreid.js.
'use strict';
const fs = require('fs');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}
const bron = fs.readFileSync(__dirname + '/pidlane-uitgebreid.js', 'utf8');
const van = bron.indexOf('  /* ── Van RDW-naam naar OBDb-model'), tot = bron.indexOf('  function obdbGetal(');
if (van < 0 || tot < van) { console.log('  FOUT  obdbKoppel niet gevonden — anker verdwenen'); process.exit(1); }
const K = new Function(bron.slice(van, tot) + '\nreturn obdbKoppel;')();

// [merk, handelsbenaming, aantal in NL] → het OBDb-model dat eerst geprobeerd wordt
const RDW = [
  ['VOLKSWAGEN', 'POLO', 271684, 'Volkswagen-Polo'], ['VOLKSWAGEN', 'GOLF', 230780, 'Volkswagen-Golf'],
  ['KIA', 'PICANTO', 167773, 'Kia-Picanto'], ['FORD', 'FIESTA', 160832, 'Ford-Fiesta'],
  ['TOYOTA', 'TOYOTA AYGO', 158340, 'Toyota-Aygo'], ['RENAULT', 'CLIO', 141698, 'Renault-Clio'],
  ['FORD', 'FOCUS', 137294, 'Ford-Focus'], ['TOYOTA', 'TOYOTA YARIS', 126077, 'Toyota-Yaris'],
  ['OPEL', 'CORSA', 120053, 'VauxhallOpel-Corsa'], ['PEUGEOT', '208', 109344, 'Peugeot-208'],
  ['FIAT', 'FIAT 500', 107150, 'FIAT-500'], ['PEUGEOT', 'PEUGEOT 107', 100640, 'Peugeot-107'],
  ['NISSAN', 'NISSAN QASHQAI', 99367, 'Nissan-Qashqai'], ['RENAULT', 'TWINGO', 97327, 'Renault-Twingo'],
  ['RENAULT', 'CAPTUR', 94714, 'Renault-Captur'], ['SUZUKI', 'SWIFT', 90574, 'Suzuki-Swift'],
  ['VOLKSWAGEN', 'TIGUAN', 88848, 'Volkswagen-Tiguan'], ['CITROEN', 'CITROEN C1', 88669, 'Peugeot-107*'],
  ['KIA', 'NIRO', 82734, 'Kia-Niro'], ['PEUGEOT', '2008', 75392, 'Peugeot-2008'],
  ['CITROEN', 'C3', 71838, 'Peugeot-208*'], ['SEAT', 'IBIZA', 68346, 'Seat-Ibiza'],
  ['VOLVO', 'XC40', 66461, 'Volvo-XC40'], ['VOLKSWAGEN', 'UP!', 65135, 'Volkswagen-Up'],
  ['SKODA', 'OCTAVIA', 62675, 'Volkswagen-Golf*'], ['SKODA', 'FABIA', 58452, 'Volkswagen-Polo*'],
  ['VOLKSWAGEN', 'UP', 58226, 'Volkswagen-Up'], ['HYUNDAI', 'I10', 56837, 'Hyundai-i10'],
  ['VOLKSWAGEN', 'T-ROC', 56426, 'Volkswagen-T-Roc'], ['FIAT', 'FIAT PANDA', 54941, 'FIAT-Panda'],
  ['PEUGEOT', '308', 53718, 'Peugeot-308'], ['TOYOTA', 'TOYOTA AURIS', 53419, 'Toyota-Auris'],
  ['VOLVO', 'XC60', 52404, 'Volvo-XC60'], ['FORD', 'KUGA', 51596, 'Ford-Kuga'],
  ['TOYOTA', 'TOYOTA COROLLA', 51522, 'Toyota-Corolla'], ['VOLKSWAGEN', 'PASSAT', 49565, 'Volkswagen-Passat'],
  ['MAZDA', 'MAZDA CX-5', 49558, 'Mazda-CX-5']
];

console.log('\n1. De grootste modellen van Nederland, zoals RDW ze schrijft');
let raak = 0, totaal = 0;
RDW.forEach(([merk, model, aantal, wil]) => {
  const r = K(merk, model), tw = wil.slice(-1) === '*', repo = wil.replace('*', '');
  const goed = r.namen[0] === repo && (r.tweeling === repo) === tw;
  totaal += aantal; if (goed) raak += aantal;
  toets(merk + ' ' + model + ' → ' + repo + (tw ? ' (zustermodel)' : ''), goed, JSON.stringify(r));
});
toets('samen ' + Math.round(raak / totaal * 100) + '% van deze ' + totaal.toLocaleString('nl') + ' auto\'s', raak === totaal);

console.log('\n2. Wat RDW nog meer doet');
toets('"ID.3 PRO 150 KW" → Volkswagen-ID3', K('VOLKSWAGEN', 'ID.3 PRO 150 KW').namen[0] === 'Volkswagen-ID3', K('VOLKSWAGEN', 'ID.3 PRO 150 KW').namen.join());
toets('"3ER REIHE" → BMW-3-Series', K('BMW', '3ER REIHE').namen[0] === 'BMW-3-Series');
toets('"CEE D" → Kia-Ceed', K('KIA', 'CEE D').namen[0] === 'Kia-Ceed');
toets('"I 10" → Hyundai-i10', K('HYUNDAI', 'I 10').namen[0] === 'Hyundai-i10');
toets('"MAZDA2" → Mazda-2', K('MAZDA', 'MAZDA2').namen[0] === 'Mazda-2');
toets('"CORSA-E" → VauxhallOpel-Corsa-e', K('OPEL', 'CORSA-E').namen[0] === 'VauxhallOpel-Corsa-e');
toets('"A 180" → Mercedes-Benz-A-180', K('MERCEDES-BENZ', 'A 180').namen[0] === 'Mercedes-Benz-A-180', K('MERCEDES-BENZ', 'A 180').namen.join());
toets('hybride: Toyota-Corolla-Hybrid gaat voor', K('TOYOTA', 'TOYOTA COROLLA', 'hybride').namen[0] === 'Toyota-Corolla-Hybrid');
toets('NIRO elektrisch → Kia-Niro-EV, hybride → Kia-Niro', K('KIA', 'NIRO', 'elektrisch').namen[0] === 'Kia-Niro-EV' && K('KIA', 'NIRO', 'hybride').namen[0] === 'Kia-Niro');
toets('KONA elektrisch → Hyundai-Kona-Electric', K('HYUNDAI', 'KONA', 'elektrisch').namen[0] === 'Hyundai-Kona-Electric');
toets('"Q4 45 E-TRON" → Audi-Q4-e-tron', K('AUDI', 'Q4 45 E-TRON', 'elektrisch').namen[0] === 'Audi-Q4-e-tron');
toets('"MG4 ELECTRIC" → MG-MG4', K('MG', 'MG4 ELECTRIC', 'elektrisch').namen[0] === 'MG-MG4');
toets('"E-NIRO" → Kia-Niro-EV', K('KIA', 'E-NIRO', 'elektrisch').namen[0] === 'Kia-Niro-EV');
toets('XC40 elektrisch → Recharge, benzine → XC40', K('VOLVO', 'XC40', 'elektrisch').namen[0] === 'Volvo-XC40-Recharge' && K('VOLVO', 'XC40', 'benzine').namen[0] === 'Volvo-XC40');
toets('"ENYAQ 60" (MEB) → Volkswagen-ID5 als zustermodel', K('SKODA', 'ENYAQ 60', 'elektrisch').tweeling === 'Volkswagen-ID5');
toets('Tesla staat niet in OBDb: geen zustermodel verzonnen', !K('TESLA', 'MODEL Y').tweeling);
toets('een model van na de index wordt toch nog geprobeerd', K('DACIA', 'BIGSTER').namen.indexOf('DACIA-BIGSTER') >= 0, K('DACIA', 'BIGSTER').namen.join());
toets('zonder model: niets', K('VOLKSWAGEN', '').namen.length === 0);

console.log('\n3. TEGENPROEF — zonder het merk uit het model te halen');
const K2 = new Function(bron.slice(van, tot).replace('if (ml.indexOf(mks.toUpperCase()) === 0', 'if (false') + '\nreturn obdbKoppel;')();
toets('dan vindt "TOYOTA AYGO" de Aygo niet meer', K2('TOYOTA', 'TOYOTA AYGO').namen[0] !== 'Toyota-Aygo');

console.log('\n' + (fout ? fout + ' van ' + n + ' fout' : 'Alles goed (' + n + ')'));
process.exit(fout ? 1 : 0);
