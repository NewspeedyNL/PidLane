// ══════════════════════════════════════════════════════════════════
// test-weigerlog.js — waarom weigerde de ELM-poort, en kwam de app net terug? (#509)
// ──────────────────────────────────────────────────────────────────
// Rit 14-10-2026: 27 weigeringen en 2 ATST-stappen, en niemand kon zeggen of
// dat bij het opstarten of na een wissel naar Maps gebeurde. Sinds 15-11 draagt
// elke weigering de reden van de sluiting en de tijd sinds de achtergrond, en
// gaan die met de ATST-stappen mee in het bewijs van een meetopdracht.
//
// Laadt het ECHTE stuk van pidlane-bt.js (van de teller tot _elmPoortOpen) en
// de echte bewijs() uit pidlane-opdracht.js via test-toeschouwer.js-vorm.
// Draaien vanuit public/:  node test-weigerlog.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const bron = fs.readFileSync(path.join(__dirname, 'pidlane-bt.js'), 'utf8');
const a = bron.indexOf('let _elmWeigeringen = 0;');
const b = bron.indexOf('function _elmPoortOpen(');
if (a < 0 || b < a) throw new Error('anker in pidlane-bt.js weg: _elmWeigeringen / _elmPoortOpen');
const klok = { nu: 1e9 };
const s = { console: { warn() {}, log() {} }, Math, String, Date: { now: () => klok.nu }, btDiag() {} };
s.window = s;
vm.createContext(s);
vm.runInContext('const ELM_POORT_MAX_MS = 15000; let _elmPoortTot = 0;\n' + bron.slice(a, b) +
  '\nthis.weiger = _elmWeiger; this.dicht = _elmPoortDicht; this.log = function(){ return _elmWeigerLog.slice(); }; this.tel = function(){ return _elmWeigeringen; };', s);

console.log('\n1. elke weigering met zijn reden');
s.dicht('elm-init');
s.weiger('010C');
let l = s.log();
toets('de teller telt nog', s.tel() === 1);
toets('de reden van de sluiting staat erbij', l.length === 1 && l[0].reden === 'elm-init' && l[0].cmd === '010C', JSON.stringify(l));
toets('zonder PLAchtergrond: achtergrond onbekend (null), niet 0', l[0].achtergrondSindsS === null, JSON.stringify(l[0]));

console.log('\n2. net terug uit de achtergrond');
s.PLAchtergrond = { weg: () => false, laatste: () => ({ van: klok.nu - 60000, tot: klok.nu - 4000, s: 56 }) };
s.dicht('socket dood — herverbinden');
s.weiger('0105');
l = s.log();
toets('4 s na de achtergrond staat er 4', l[1].achtergrondSindsS === 4 && /herverbinden/.test(l[1].reden), JSON.stringify(l[1]));
s.PLAchtergrond.weg = () => true;
s.weiger('0105');
toets('nog in de achtergrond: 0', s.log()[2].achtergrondSindsS === 0, JSON.stringify(s.log()[2]));

console.log('\n3. begrensd');
for (let i = 0; i < 100; i++) s.weiger('01' + i);
toets('hoogstens 40 in het log, de teller loopt door', s.log().length === 40 && s.tel() === 103, s.log().length + ' / ' + s.tel());

console.log('\n4. in het bewijs van een meetopdracht');
{
  const c = { console: { warn() {}, log() {} }, Math, JSON, Object, Array, String, Number, Date, isFinite, setInterval() {}, setTimeout() {} };
  c.window = c;
  c.localStorage = { getItem: () => null, setItem() {} };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-opdracht.js'), 'utf8'), c, { filename: 'pidlane-opdracht.js' });
  const O = c.PLOpdracht;
  if (!O || typeof O.bewijs !== 'function') throw new Error('PLOpdracht.bewijs niet bereikbaar');
  const t0 = 5e8;
  const leeg = O.bewijs({ naam: 'x', proeven: [] }, { venster: { start: t0, s: 60 } });
  toets('zonder stappen en weigeringen geen verbind-blok', leeg.verbind === null, JSON.stringify(leeg.verbind));
  c.PLVerbind = { stapLog: () => [{ t: t0 + 30000, oud: '16', nieuw: '32', bron: 'koud', achtergrondSindsS: 3 }] };
  c.PLElm = { weigerLog: () => [{ t: t0 + 2000, cmd: '0100', reden: 'elm-init', achtergrondSindsS: null }] };
  const bw = O.bewijs({ naam: 'x', proeven: [] }, { venster: { start: t0, s: 60 } });
  toets('de ATST-stap met tijd en achtergrond (#509)', bw.verbind && bw.verbind.atst[0].tS === 30 && bw.verbind.atst[0].naar === '32' && bw.verbind.atst[0].achtergrondSindsS === 3, JSON.stringify(bw.verbind));
  toets('de weigering met reden', bw.verbind && bw.verbind.weigeringen[0].reden === 'elm-init' && bw.verbind.weigeringen[0].tS === 2, JSON.stringify(bw.verbind));
}

console.log('\n' + (fout ? 'FOUT — ' + fout + ' van ' + n + ' toetsen' : 'Alles goed — ' + n + ' toetsen'));
process.exit(fout ? 1 : 0);
