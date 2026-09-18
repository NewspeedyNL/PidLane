// ══════════════════════════════════════════════════════════════════
// test-markeringen.js — een markering overleeft de volgende ronde (#255)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT, EN WAT HIJ GEKOST HEEFT.
//
// De bedoelde volgorde van een meetavond staat in CAMPAGNE: meetrit (🧭),
// testrun, toestelronde (📱), testrun. Precies die volgorde maakte de tweede
// testrun blind, want `begeleidStart()` deed `_markeringen = []` en dat is één
// lijst voor de hele sessie.
//
// Gemeten op 18-09-2026, twee runs van zes minuten uit elkaar:
//
//   19:47  #18 — markering om 19:44:27 | PLRit leidt 0 onderbrekingen af
//   19:53  #18 — geen achtergrondmarkering — de achtergrondstap is niet gedaan
//
// De tweede is de bétere meting (tien minuten tegen vier, 93 monsters tegen
// 35) en juist die gooit zijn eigen basis weg. Acht aanroepplekken lezen deze
// lijst: #18 tweemaal, de oogst tweemaal, split-screen tweemaal, adapter-los
// tweemaal. Alle acht vielen na een tweede ronde terug op hun "niet
// gedaan"-tak, en die tak is als een feit over de rit geformuleerd.
//
// Wat hier dus getoetst wordt is één belofte: wat in ronde 1 gezet is, is in
// ronde 2 nog te vinden — mét de ronde waar het vandaan komt.
//
// Draaien vanuit public/:  node test-markeringen.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

// Dezelfde lege sandbox als test-blok5lijst.js: pidlane-testrun.js hangt
// zichzelf aan window en heeft voor het laden geen DOM en geen auto nodig.
function laad() {
  const s = {};
  s.window = s;
  s.connected = false;
  s.demoMode = false;
  s.pidVals = { '010D': 48, '010C': 2100 };
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
  // isAdmin() is de poort voor begeleidStart(); zonder deze stub doet hij niets
  // en zou de test groen staan op een ronde die nooit begonnen is.
  s.isAdmin = function () { return true; };
  s.showToast = function () { };
  s.PLBus = { stats: function () { return { belasting: 70, perSec: 5, venGemMs: 120, foutPct: 0 }; } };
  s.PLLoad = { staat: function () { return { mult: 1, tempoPct: 100 }; }, cfg: {} };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-testrun.js', 'utf8'), s, { filename: 'pidlane-testrun.js' });
  if (!s.PLBegeleid || typeof s.PLBegeleid.markeringen !== 'function')
    throw new Error('PLBegeleid.markeringen() ontbreekt — is de export hernoemd?');
  if (typeof s.begeleidStart !== 'function')
    throw new Error('begeleidStart() ontbreekt — is hij hernoemd?');
  return s;
}

let fouten = 0;
function eis(waar, wat) {
  if (waar) { console.log('  ok   ' + wat); return; }
  console.log('  FOUT ' + wat);
  fouten++;
}

const s = laad();

console.log('1. de begeleide ronde start en laat markeren');
s.begeleidStart('rit');
const naStart = s.PLBegeleid.markeringen();
eis(naStart.length > 0, 'de start zet zelf een markering (' + naStart.length + ')');

s.plMarkeer('achtergrond in', 'app naar de achtergrond — de meting voor #18');
const ritLijst = s.PLBegeleid.markeringen();
const ritMark = ritLijst.filter(function (m) { return /achtergrond in/i.test(m.tekst); });
eis(ritMark.length === 1, 'de achtergrondmarkering staat in de lijst');
eis(ritMark[0] && ritMark[0].ronde === 'rit', 'hij draagt de ronde waar hij uit komt (ronde=' + (ritMark[0] || {}).ronde + ')');

console.log('2. DE KERN — de toestelronde wist hem niet');
const voorTweede = s.PLBegeleid.markeringen().length;
s.begeleidStart('toestel');
const naTweede = s.PLBegeleid.markeringen();
const nogSteeds = naTweede.filter(function (m) { return /achtergrond in/i.test(m.tekst); });

eis(nogSteeds.length === 1,
  'na het starten van de toestelronde staat de achtergrondmarkering er nog — ' +
  'dit is de regressie van 18-09 (gevonden: ' + nogSteeds.length + ')');
eis(naTweede.length > voorTweede,
  'de lijst is gegroeid en niet gereset (' + voorTweede + ' -> ' + naTweede.length + ')');
eis(nogSteeds[0] && nogSteeds[0].ronde === 'rit',
  'hij zegt nog steeds dat hij uit de MEETRIT komt, niet uit de ronde die nu loopt');

console.log('3. wat per ronde WEL hoort te resetten, reset');
const stand = s.PLBegeleid.stand();
eis(stand.aan === true, 'de nieuwe ronde loopt');
eis(stand.i === 0, 'de stapteller begint opnieuw');
eis(Array.isArray(stand.gedaan) && stand.gedaan.length === 0, 'de gedaan-lijst van de vorige ronde is leeg');

console.log('4. de markeringen van de tweede ronde dragen hun eigen ronde');
s.plMarkeer('split-screen in', 'zichtbaar maar niet vooraan');
const split = s.PLBegeleid.markeringen().filter(function (m) { return /split-screen in/i.test(m.tekst); });
eis(split.length === 1, 'de split-screenmarkering staat erin');
eis(split[0] && split[0].ronde === 'toestel', 'en draagt ronde=toestel (' + (split[0] || {}).ronde + ')');

console.log(fouten === 0 ? '\nAlles goed.' : '\n' + fouten + ' fout(en).');
process.exit(fouten ? 1 : 0);
