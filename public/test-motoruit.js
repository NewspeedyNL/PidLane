// ══════════════════════════════════════════════════════════════════
// test-motoruit.js — een stilstaande motor is geen dode sensor (07-11-2026)
// ──────────────────────────────────────────────────────────────────
// assessPidQuality() (pidlane-kwaliteit.js) noemde toerental en belasting
// "exact vast — mogelijk dode sensor" zodra een hybride tien monsters op de
// accu reed. Dat stond in het rapport onder "Wat opviel" en ging als
// DATAKWALITEIT naar de AI (plsim-aandrijving.js, PIDLANE-ARCHIEF.md).
//
// Wat hier moet onderscheiden — niet alleen kloppen:
//   • hybride, motor uit, rijdend           → geen twijfel
//   • gewone benzineauto, 0 tpm bij 50 km/h → wél twijfel (dáár is het stuk)
//   • hybride met een motor die draait maar exact vaststaat → wél twijfel
//   • de snelheid zelf vast op 50           → wél twijfel (geen motor-PID)
//
// De functie wordt uit de bron geknipt zoals in test-verzamel.js.
// Draaien vanuit public/:  node test-motoruit.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function t(naam, gemeten, verwacht) {
  if (String(gemeten) === String(verwacht)) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + gemeten + ', wilde ' + verwacht); }
}

const s = { console: { warn() {}, error() {}, log() {} } };
s.window = s;
vm.createContext(s);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-aandrijving.js', 'utf8'), s, { filename: 'pidlane-aandrijving.js' });
s.getPidDef = (pid) => s.ALL_PID_DEFS[pid] || null;
const kw = fs.readFileSync(__dirname + '/pidlane-kwaliteit.js', 'utf8');
const van = kw.indexOf('function assessPidQuality'), tot = kw.indexOf('\n}', van) + 2;
if (van < 0) { console.log('FOUT: assessPidQuality niet gevonden'); process.exit(1); }
vm.runInContext('function fv(x){ return String(Math.round(x*10)/10); }\n' + kw.slice(van, tot), s, { filename: 'pidlane-kwaliteit.js' });
if (!s.PLAandrijving || !s.PLAandrijving.drempels) { console.log('FOUT: PLAandrijving niet geladen'); process.exit(1); }

// Eén situatie: de laatste twaalf monsters van `pid` op `waarde`, plus wat
// de auto nu doet en wat PLKenmerk over de aandrijving zegt.
function oordeel(pid, waarde, nu, kenmerk, bewijstHybride) {
  s.pidHist = { [pid]: Array.from({ length: 12 }, (_, i) => ({ t: i * 500, v: waarde })) };
  s.pidVals = Object.assign({ [pid]: waarde }, nu);
  s.PLKenmerk = { live: () => kenmerk || {} };
  s.PLAandrijving.reset();
  if (bewijstHybride) s.PLAandrijving.tik({ '010C': 0, '010D': 40 }, { t: 0, ouderdomMs: 0 });
  return vm.runInContext('assessPidQuality(' + JSON.stringify(pid) + ',' + waarde + ')', s).status;
}
const HYB = { hybride: { waarde: true } }, MILD = { hybride: { waarde: false }, mild_hybride: { waarde: true } };
const ICE = { hybride: { waarde: false }, mild_hybride: { waarde: false } };
const RIJDT = { '010C': 0, '010D': 50 };

t('hybride op de accu: toerental 0 is geen dode sensor', oordeel('010C', 0, RIJDT, HYB), 'ok');
t('… belasting 0 ook niet', oordeel('0104', 0, RIJDT, HYB), 'ok');
t('… MAP op de buitenluchtdruk ook niet', oordeel('010B', 101, RIJDT, HYB), 'ok');
t('mild hybride die zeilt: toerental 0 is geen dode sensor', oordeel('010C', 0, RIJDT, MILD), 'ok');
t('rijden-op-de-accu gezien (bewijstHybride) zonder RDW-vorm: ook goed', oordeel('010C', 0, RIJDT, {}, true), 'ok');
t('TEGENPROEF benzineauto, 0 tpm bij 50 km/h: wél twijfel', oordeel('010C', 0, RIJDT, ICE), 'twijfel');
t('TEGENPROEF zonder kenmerk en zonder waarneming: wél twijfel', oordeel('010C', 0, RIJDT, {}), 'twijfel');
t('benzineauto stilstaand met motor uit (start/stop): geen twijfel', oordeel('010C', 0, { '010C': 0, '010D': 0 }, ICE), 'ok');
t('TEGENPROEF hybride, motor draait maar staat exact op 1500: wél twijfel', oordeel('010C', 1500, { '010C': 1500, '010D': 50 }, HYB), 'twijfel');
t('TEGENPROEF hybride, de snelheid zelf staat exact op 50: wél twijfel', oordeel('010D', 50, RIJDT, HYB), 'twijfel');
t('een kapotte PLKenmerk laat de oude regel staan (twijfel), niet stil vrij', (function () {
  s.pidHist = { '010C': Array.from({ length: 12 }, (_, i) => ({ t: i, v: 0 })) }; s.pidVals = RIJDT;
  s.PLKenmerk = { live: () => { throw new Error('stuk'); } }; s.PLAandrijving.reset();
  return vm.runInContext('assessPidQuality("010C",0)', s).status;
})(), 'twijfel');

console.log('\n' + ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
