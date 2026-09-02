// ══════════════════════════════════════════════════════════════════
// test-blok5lijst.js — blok 5 is data, en die data moet iets beloven
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Tot 6.5 stonden de proeven van blok 5 in één functie van 585 regels, met
// bovenaan een banner die opsomde welke proeven er die oplevering bij kwamen
// en welke eruit gingen. Diezelfde opsomming stond ook in CAMPAGNE. Twee
// lijsten van hetzelfde, allebei met de hand bijgehouden — precies de vorm
// die §11 van PIDLANE.md op 02-09 de kop kostte, waar een tabel #65 als open
// noemde die die ochtend al gesloten was.
//
// Sinds 6.6 is er één lijst, PROEVEN_B5, en wordt de opsomming daaruit
// afgeleid. Dat lost de vraag "welke van de twee klopt" op, maar introduceert
// een nieuwe: een lijst waar niets naar kijkt, verliest bij de eerste
// opruimactie stil een entry. Blok 5 draait alleen als iemand op een toestel
// een testrun start; ontbreekt daar een proef, dan merkt niemand het tot de
// rit al gereden is.
//
// Wat hier dus getoetst wordt is de belofte van de lijst zelf:
//
//   1. de lijst bestaat en is niet leeg
//   2. elke entry heeft een issue, een naam, een waarom en een proef —
//      een entry zonder issue valt uit de afgeleide dekking en is daarmee
//      onzichtbaar geworden zonder dat er iets stukging
//   3. geen twee proeven dragen dezelfde naam; het verslag boekt op naam, en
//      twee regels met dezelfde kop zijn niet uit elkaar te houden
//   4. de afgeleide dekking noemt elk issue één keer en laat '—' weg
//   5. CAMPAGNE draagt de afgeleide regel, niet een overgeschreven kopie
//
// Wat hier NIET te toetsen valt: of een proef het juiste meet. Dat kan alleen
// in de app, op een toestel, met een auto eraan — dat is wat blok 5 zelf is.
//
// Draaien vanuit public/:  node test-blok5lijst.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

// Dezelfde lege sandbox als test-begeleid.js: pidlane-testrun.js hangt zichzelf
// aan window en heeft voor het laden geen DOM en geen verbinding nodig.
function laad() {
  const s = {};
  s.window = s;
  s.connected = false;
  s.demoMode = false;
  s.pidVals = {};
  s._pidLastUpd = {};
  s.activePIDs = new Set();
  s.console = { warn: function () { }, error: function () { }, log: function () { } };
  s.localStorage = { getItem: function () { return null; }, setItem: function () { }, key: function () { return null; }, length: 0 };
  s.document = {
    getElementById: function () { return null; },
    createElement: function () { return { style: {}, classList: { add: function () { }, remove: function () { } } }; },
    querySelectorAll: function () { return []; },
    body: { appendChild: function () { } }
  };
  s.navigator = { userAgent: 'node' };
  s.setInterval = function () { return 0; };
  s.clearInterval = function () { };
  s.setTimeout = function () { return 0; };
  s.PLBus = { stats: function () { return { belasting: 70, perSec: 5, venGemMs: 120, foutPct: 0 }; } };
  s.PLLoad = { staat: function () { return { mult: 1, tempoPct: 100 }; }, cfg: {} };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-testrun.js', 'utf8'), s, { filename: 'pidlane-testrun.js' });
  if (!s.PLBlok5) throw new Error('PLBlok5 niet gevonden in pidlane-testrun.js — de lijst hangt niet meer naar buiten');
  return s;
}

let fouten = 0;
function eis(waar, wat) {
  if (waar) { console.log('  ok   ' + wat); return; }
  console.log('  FOUT ' + wat);
  fouten++;
}

const s = laad();
const proeven = s.PLBlok5.proeven();
const dekking = s.PLBlok5.dekking();

console.log('1. de lijst bestaat en is gevuld');
eis(Array.isArray(proeven), 'PLBlok5.proeven() geeft een array');
eis(proeven.length > 0, 'de lijst is niet leeg (' + proeven.length + ' proeven)');

console.log('2. elke entry is compleet');
proeven.forEach(function (p, i) {
  const kop = 'entry ' + i + ' (' + (p.naam || 'zonder naam') + ')';
  eis(typeof p.issue === 'string' && p.issue.length > 0, kop + ': heeft een issue');
  eis(typeof p.naam === 'string' && p.naam.length > 0, kop + ': heeft een naam');
  eis(typeof p.waarom === 'string' && p.waarom.length > 0, kop + ': heeft een waarom');
  eis(typeof p.proef === 'function', kop + ': heeft een proef');
});

console.log('3. geen twee proeven met dezelfde naam');
const namen = proeven.map(function (p) { return p.naam; });
const dubbel = namen.filter(function (n, i) { return namen.indexOf(n) !== i; });
eis(dubbel.length === 0, dubbel.length ? 'dubbele naam: ' + dubbel.join(', ') : 'alle namen uniek');

console.log('4. de dekking wordt afgeleid en niet opgeschreven');
eis(Array.isArray(dekking) && dekking.length > 0, 'dekking() geeft issues (' + dekking.join(', ') + ')');
eis(dekking.length === new Set(dekking).size, 'geen issue dubbel in de dekking');
eis(dekking.indexOf('—') === -1, 'de streep voor "geen issue" staat niet in de dekking');
// De onderscheidende helft: een dekking die alles teruggeeft wat erin gaat,
// zou ook groen staan als _dekkingB5() gewoon de issues doorgeeft zonder te
// ontdubbelen of te filteren. #42 komt twee keer voor in de lijst en '—' ook,
// dus deze twee eisen zijn alleen te halen door het echt te doen.
const ruw = proeven.map(function (p) { return p.issue; });
eis(ruw.length > dekking.length, 'de lijst bevat meer issue-vermeldingen (' + ruw.length + ') dan de dekking (' + dekking.length + ') — er valt dus iets te ontdubbelen');
dekking.forEach(function (q) {
  eis(ruw.indexOf(q) !== -1, 'dekking-issue ' + q + ' komt uit de lijst');
});

console.log('5. CAMPAGNE draagt de afgeleide regel');
const regels = (s.PLBlok5.campagne() || {}).vragen || [];
const dekregel = regels.filter(function (r) { return typeof r === 'string' && r.indexOf('BLOK 5 DEKT DEZE RONDE') === 0; })[0];
eis(!!dekregel, 'CAMPAGNE noemt wat blok 5 deze ronde dekt');
if (dekregel) {
  dekking.forEach(function (q) {
    eis(dekregel.indexOf(q) !== -1, 'CAMPAGNE noemt ' + q + ' — de regel is uit de lijst afgeleid en niet overgeschreven');
  });
}

console.log('');
if (fouten) { console.log('FOUT — ' + fouten + ' eis(en) niet gehaald'); process.exit(1); }
console.log('Alles goed — blok 5 is een lijst die iets belooft.');
