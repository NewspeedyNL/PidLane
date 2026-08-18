// ══════════════════════════════════════════════════════════════════
// test-dodeknoppen.js — de onclick-controle uit blok 5 van de testrun
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
// De eerste versie van deze controle (17-08) meldde 27 dode knoppen die
// allemaal prima werkten: uit `PLRemote.openShare()` knipte hij het
// voorvoegsel weg, zocht `openShare` op window en vond niets. Ook
// `event.preventDefault()` en `.catch()` telden mee.
//
// Dat is erger dan geen controle: een melding die altijd vals is, leer je
// negeren — en dan mis je de echte. Vandaar deze test, met beide kanten:
// vals alarm mag niet, en het echte geval moet gevonden worden.
//
// De logica staat hier na, niet geïmporteerd: pidlane-testrun.js is een IIFE
// zonder uitgang voor deze functie. De regels moeten dus gelijk blijven aan
// die in _blok5(). Wijzig je daar iets, wijzig het hier ook — de test toetst
// het gedrag, niet de koppeling.
//
// Draaien vanuit public/:  node test-dodeknoppen.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const TAAL = ['if', 'for', 'while', 'switch', 'return', 'typeof', 'new', 'delete',
              'void', 'catch', 'function', 'try', 'else', 'do', 'await', 'in', 'of'];
const RUNTIME = ['event', 'this', 'e', 'document', 'window', 'console', 'navigator', 'JSON', 'Math'];

function zoekDood(onclicks, wereld) {
  const dood = [];
  const paden = /(?:^|[^.\w$])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g;
  onclicks.forEach(function (code) {
    let m;
    paden.lastIndex = 0;
    while ((m = paden.exec(code))) {
      const pad = m[1];
      const delen = pad.split('.');
      if (TAAL.indexOf(delen[0]) > -1) continue;
      if (RUNTIME.indexOf(delen[0]) > -1) continue;
      let obj = wereld, ok = true;
      for (let i = 0; i < delen.length; i++) {
        if (obj == null || typeof obj[delen[i]] === 'undefined') { ok = false; break; }
        obj = obj[delen[i]];
      }
      if (!ok || typeof obj !== 'function') { if (dood.indexOf(pad) === -1) dood.push(pad); }
    }
  });
  return dood;
}

let fout = 0;
function toets(naam, gemeten, verwacht) {
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (ok) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + JSON.stringify(gemeten) + ', verwacht ' + JSON.stringify(verwacht)); }
}

// Een wereld zoals de app hem heeft: losse globals én namespaces.
const wereld = {
  openTestrun: function () {},
  closeKebab: function () {},
  PLRemote: { openShare: function () {}, closeShare: function () {}, copy: function () {},
              openExpert: function () {}, shareStart: function () {}, scanForPair: function () {} },
  PLKlant: { openRegistratie: function () {}, openMijnTokens: function () {} },
  PLBulk: { start: function () {}, status: {} }        // status is geen functie
};

console.log('Dode-knoppencontrole — blok 5 van de testrun\n');

// ── vals alarm mag niet ──
toets('namespace-aanroep telt niet als dood',
  zoekDood(['PLRemote.openShare()'], wereld), []);
toets('event.preventDefault() wordt overgeslagen',
  zoekDood(['event.preventDefault();PLKlant.openRegistratie()'], wereld), []);
toets('twee aanroepen achter elkaar',
  zoekDood(['closeKebab();openTestrun()'], wereld), []);
toets('.catch() en andere methodes op een uitdrukking',
  zoekDood(['PLRemote.copy(\'x\').catch(function(){})'], wereld), []);
toets('de 27 valse meldingen van 17-08 zijn weg',
  zoekDood([
    'event.preventDefault();PLKlant.openRegistratie()',
    'PLRemote.openExpert()',
    'PLRemote.shareStart()',
    'PLRemote.scanForPair()',
    'PLRemote.copy(\'remShort\')',
    'PLKlant.openMijnTokens()'
  ], wereld), []);

// ── het echte geval moet wél gevonden worden ──
toets('gesloopte globale functie',
  zoekDood(['closeKebab();openBusDiag()'], wereld), ['openBusDiag']);
toets('gesloopte methode in een bestaande namespace',
  zoekDood(['PLRemote.openBusDiag()'], wereld), ['PLRemote.openBusDiag']);
toets('hele namespace verdwenen',
  zoekDood(['PLCopiloot.open()'], wereld), ['PLCopiloot.open']);
toets('bestaat wel maar is geen functie',
  zoekDood(['PLBulk.status()'], wereld), ['PLBulk.status']);
toets('dubbel gemelde naam komt er maar een keer in',
  zoekDood(['openBusDiag()', 'closeKebab();openBusDiag()'], wereld), ['openBusDiag']);
toets('goed en fout door elkaar',
  zoekDood(['event.preventDefault();PLRemote.openShare();openZelftest()'], wereld), ['openZelftest']);

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
