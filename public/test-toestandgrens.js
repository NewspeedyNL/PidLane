// test-toestandgrens.js — grenzen die van de toestand van de motor afhangen (21-10-2026).
//
// Een vaste band kent geen start, geen stilstand en geen vol gas. De AI wel,
// en die noemde het oordeel van de conditiecheck daardoor "te kort door de
// bocht". PID_TOESTAND (pidlane-data.js) zegt per sensor welke monsters langs
// een eigen grens gaan; PLVerzamel.toestandUit() haalt de toestand uit toerental
// en snelheid. Deze test laadt beide echt en draait samenvatting() zoals de app.
'use strict';
const fs = require('fs');
const vm = require('vm');
const dir = __dirname;

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const s = { console: { warn() {}, error() {}, log() {} } };
s.window = s;
vm.createContext(s);
vm.runInContext(fs.readFileSync(dir + '/pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
if (!s.PID_TOESTAND) { console.log('  FOUT  PID_TOESTAND ontbreekt in pidlane-data.js'); process.exit(1); }
s.pidHist = {};
s.getPidDef = (pid) => s.ALL_PID_DEFS[pid] || null;
vm.runInContext(fs.readFileSync(dir + '/pidlane-verzamel.js', 'utf8'), s, { filename: 'pidlane-verzamel.js' });
const V = s.PLVerzamel;

// Monsters elke 500 ms, zoals de pollus.
const reeks = (n, f) => Array.from({ length: n }, (_, i) => ({ t: i * 500, v: f(i) }));
const oordeel = (hist, pid) => {
  Object.keys(s.pidHist).forEach(k => delete s.pidHist[k]); Object.assign(s.pidHist, hist);
  return V.samenvatting([pid]).rijen[0];
};

console.log('1. De toestand uit toerental en snelheid');
{
  const tst = V.toestandUit({ '010C': reeks(40, i => i < 10 ? 0 : 800), '010D': reeks(40, i => i < 30 ? 0 : 40) });
  toets('vlak na het aanslaan: start', tst(5000).start === true, JSON.stringify(tst(5000)));
  toets('een halve minuut later: geen start meer', tst(14000).start === false, JSON.stringify(tst(14000)));
  toets('stil en rijdend volgen de snelheid', tst(2000).stil === true && tst(19000).rijdend === true && tst(19000).stil === false);
  const zonder = V.toestandUit({});
  toets('zonder toerental of snelheid: onbekend, niet "in die toestand"', zonder(0).start === null && zonder(0).stil === null && zonder(0).rijdend === null);
}

console.log('\n2. Accuspanning: de startdip is geen afwijking, een te diepe wel');
{
  const rpm = reeks(60, i => i < 10 ? 0 : 800);
  const dip = i => (i === 9 || i === 10) ? 10.1 : (i < 9 ? 12.5 : 14.2);
  const r = oordeel({ '010C': rpm, '0142': reeks(60, dip) }, '0142');
  toets('twee monsters van 10,1 V bij het aanslaan: geen vlag', r.oordeel === 'ok', JSON.stringify(r));
  toets('en de reden zegt waarom de lage waarde niet telt', /starten/.test(r.reden), r.reden);
  const r2 = oordeel({ '0142': reeks(60, dip) }, '0142');
  toets('zonder toerental weet de app niet dat het een start was: de vaste grens geldt  <- tegenproef', r2.oordeel === 'afwijkend', JSON.stringify(r2));
  const r3 = oordeel({ '010C': rpm, '0142': reeks(60, i => (i === 9 || i === 10) ? 9.2 : (i < 9 ? 12.5 : 14.2)) }, '0142');
  toets('onder 9,6 V bij het starten: afwijkend, met de toestand erbij', r3.oordeel === 'afwijkend' && /starten/.test(r3.reden), JSON.stringify(r3));
  const r4 = oordeel({ '010C': rpm, '0142': reeks(60, i => i > 40 && i < 46 ? 10.2 : 14.2) }, '0142');
  toets('een dip ver na het starten blijft afwijkend', r4.oordeel === 'afwijkend', JSON.stringify(r4));
}

console.log('\n3. Motorbelasting: hoog bij het rijden is normaal, stationair niet');
{
  const spd = reeks(40, i => i < 20 ? 0 : 60);
  const r = oordeel({ '010D': spd, '0104': reeks(40, i => i < 20 ? 25 : (i % 5 ? 60 : 98)) }, '0104');
  toets('98 % bij het optrekken: geen vlag', r.oordeel === 'ok', JSON.stringify(r));
  const r2 = oordeel({ '010D': spd, '0104': reeks(40, i => i < 20 ? 95 : 60) }, '0104');
  toets('95 % stilstaand: let op', r2.oordeel === 'let', JSON.stringify(r2));
}

console.log('\n4. Inlaatlucht: warm bij stilstand is heat soak, rijdend niet');
{
  const r = oordeel({ '010D': reeks(40, () => 0), '010F': reeks(40, () => 62) }, '010F');
  toets('62 °C stilstaand: geen vlag', r.oordeel === 'ok', JSON.stringify(r));
  const r2 = oordeel({ '010D': reeks(40, () => 80), '010F': reeks(40, () => 62) }, '010F');
  toets('62 °C bij 80 km/h: let op', r2.oordeel === 'let', JSON.stringify(r2));
}

console.log('\n5. Kortetermijntrim: heen en weer is normaal, blijven is het signaal');
{
  const r = oordeel({ '0106': reeks(100, i => i % 10 < 2 ? 14 : 1) }, '0106');
  toets('20 % van de tijd boven 10 %: geen vlag', r.oordeel === 'ok', JSON.stringify(r));
  const r2 = oordeel({ '0106': reeks(100, i => i % 10 < 4 ? 14 : 1) }, '0106');
  toets('40 % van de tijd boven 10 %: let op', r2.oordeel === 'let', JSON.stringify(r2));
  const r3 = oordeel({ '0107': reeks(100, i => i % 10 < 2 ? 14 : 1) }, '0107');
  toets('de langetermijntrim heeft die ruimte niet: daar telt het wel', r3.oordeel === 'let', JSON.stringify(r3));
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
