// ══════════════════════════════════════════════════════════════════
// test-watcherpauze.js — geen UITVAL als de app zelf niet meet
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT (26-09-2026)
//
// Logboek van 26-09, 01:17: de app bewust weggeschakeld, een paar lege
// multi-PID-antwoorden, een ELM-herinitialisatie — en de rit-monitor meldde
// vijftien keer UITVAL, twintig seconden later gevolgd door vijftien keer
// "hersteld na ~30s uitval". Geen enkele sensor was uitgevallen: de app
// vroeg niets, of de adapter herstartte.
//
// Deze test laadt de echte pidlane-watchers.js en speelt drie gevallen na:
//   1. een gewone uitval wordt nog steeds gemeld (anders bewijst de rest niets);
//   2. terwijl de app weg is of de adapter herstart: geen melding, en daarna
//      ook niet zolang de herstelmarge loopt;
//   3. de WebView lag bevroren (de tik zelf liep niet): bij terugkomst geen
//      melding, al staat PLAchtergrond.weg() dan alweer op false.
//
// Draaien vanuit public/:  node test-watcherpauze.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}

// Het mengsel uit het logboek: vier snelle PIDs (elke seconde, drempel 8 s)
// en zes trage (elke 10 s, drempel 30 s). Met alleen snelle PIDs vangt de
// oude 70%-regel een volledige stilte al af en bewijst deze test niets: op
// 26-09 liepen de trage nog binnen hun drempel, en bleef de fractie eronder.
const SNEL = ['010C', '010D', '0104', '0111'];
const TRAAG = ['0105', '010F', '0133', '0142', '012F', '015C'];
const PIDS = SNEL.concat(TRAAG);
function maak() {
  const T = { t: 1000000 };
  const c = {
    console: { log() {}, warn() {}, error() {} },
    Date: { now: () => T.t },
    setInterval: () => 1, clearInterval() {},
    pidHist: {}, pidVals: {},
    __weg: false, __elm: false, meldingen: [],
    getPidDef: () => null, log() {}
  };
  c.window = c; c.globalThis = c;
  c.PLMon = { active: true, _state: () => ({ fase: 'stationair', temp: 'warm' }),
              _event: (sig, bron, reden) => { c.meldingen.push(sig + ' ' + reden); } };
  // Elke PID wordt elke seconde gevraagd; laatstePoging loopt dus altijd door.
  c.PLSched = { interval: p => (TRAAG.indexOf(p) > -1 ? 10000 : 1000), dood: () => false,
                laatstePoging: () => T.t, laatsteSucces: p => c.__ok[p] || 0 };
  c.__ok = {};
  c.PLAchtergrond = { weg: () => c.__weg };
  c.PLElm = { poortDicht: () => c.__elm };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-watchers.js', 'utf8'), c, { filename: 'pidlane-watchers.js' });
  c.T = T;
  return c;
}
// Metingen komen binnen voor de gegeven PIDs; de tik draait elke 2 s.
function loop(c, ms, levert) {
  for (let s = 0; s < ms; s += 1000) {
    c.T.t += 1000;
    (levert || []).forEach(p => {
      if (TRAAG.indexOf(p) > -1 && (c.T.t / 1000) % 10 !== 0) return;
      (c.pidHist[p] = c.pidHist[p] || []).push({ t: c.T.t, v: 1 });
      c.__ok[p] = c.T.t;
    });
    if ((c.T.t / 1000) % 2 === 0) c.PLWatch._tick();
  }
}
const uitval = c => c.meldingen.filter(m => /^UITVAL:/.test(m));

console.log('\n── 1. tegenproef: een echte uitval wordt gemeld ──');
const A = maak();
if (!A.PLWatch || typeof A.PLWatch._tick !== 'function') { console.error('FOUT: PLWatch niet geladen'); process.exit(1); }
loop(A, 20000, PIDS);
loop(A, 20000, PIDS.filter(p => p !== '0104'));
waar('0104 valt uit terwijl de rest doorloopt: UITVAL:0104', uitval(A).some(m => /^UITVAL:0104 /.test(m)), JSON.stringify(A.meldingen));
waar('…en alleen die', uitval(A).length === 1, JSON.stringify(A.meldingen));

console.log('\n── 2. de app is weg, of de adapter herstart ──');
const B = maak();
loop(B, 20000, PIDS);
B.__weg = true; loop(B, 14000, []); B.__weg = false;
waar('veertien seconden weg: geen enkele UITVAL', uitval(B).length === 0, JSON.stringify(B.meldingen));
loop(B, 10000, []);                         // eerste antwoorden laten op zich wachten
loop(B, 30000, PIDS);
waar('terug, en de lijst komt in tien seconden weer rond: nog steeds niets', uitval(B).length === 0, JSON.stringify(B.meldingen));
waar('dus ook geen "hersteld na …"', !B.meldingen.some(m => /hersteld/.test(m)), JSON.stringify(B.meldingen));

const E = maak();
loop(E, 20000, PIDS);
E.__elm = true; loop(E, 6000, []); E.__elm = false;
// Zoals op 26-09: eerst niets, dan de snelle groep, en de trage pas na ~40 s.
loop(E, 12000, []); loop(E, 28000, SNEL); loop(E, 20000, PIDS);
waar('ELM-herinitialisatie met een trage herstart: geen UITVAL', uitval(E).length === 0, JSON.stringify(E.meldingen));
loop(E, 40000, PIDS.filter(p => p !== '0111'));
waar('ná de herstelmarge wordt een echte uitval weer gemeld', uitval(E).some(m => /^UITVAL:0111 /.test(m)), JSON.stringify(E.meldingen));

console.log('\n── 3. de WebView lag bevroren ──');
const F = maak();
loop(F, 20000, PIDS);
F.T.t += 12000;                             // twaalf seconden geen tik, geen metingen
loop(F, 8000, []); loop(F, 20000, PIDS);
waar('twaalf seconden bevroren, weg() staat al op false: geen UITVAL', uitval(F).length === 0, JSON.stringify(F.meldingen));

console.log('\n' + (fout ? 'FOUT: ' : 'goed: ') + ok + ' ok, ' + fout + ' fout\n');
process.exit(fout ? 1 : 0);
