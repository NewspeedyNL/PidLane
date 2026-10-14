// test-driefasen.js — toetst het oordeel van de drie-fasenpoort uit
// pidlane-fuel.js: plKernStatus() (welke kernsensoren klaar zijn) en
// plKernDekking() (dat oordeel voor de prompt). Knipt het blok letterlijk uit
// de module. Draaien vanuit public/:  node test-driefasen.js
//
// Tot 13-10-2026 toetste dit ook plVraagMeting() en plRegistreer(), het oude
// meetscherm. Dat is weggehaald (#452); het verzamelscherm dat dezelfde
// plKernStatus() leest, toetsen test-verzamel.js en bproef-verzamel.js.
'use strict';
const fs = require('fs');

const src = fs.readFileSync(__dirname + '/pidlane-fuel.js', 'utf8');
const van = src.indexOf('/* ── DE DRIE-FASENPOORT');
const tot = src.indexOf('/* Hoe lang een bevestigde meting geldt');   // staat vlak ná plKernDekking
if (van < 0 || tot < 0 || tot < van) { console.error('FOUT: knipbereik niet gevonden'); process.exit(1); }

let pidHist = {}, pidVals = {}, supportedPIDs = new Set();
const window_ = {};
const omgeving = {
  BASIS_PIDS: ['010C', '0105', '0104', '010F', '0142'],
  ANALYSE_PIDS: { basis: ['010C', '0105', '0104', '0111', '010D', '0142', '010F', '010B'],
                  accu: ['0142', '010C', '0104', '0105', '0146', '015B'] },
  FILTERED_PIDS: new Set(['0105', '010F', '0146', '015C', '012F', '0142', '0133', '0107', '0109']),
  getPidDef: pid => ({ name: 'PID' + pid }),
  pidGate: () => true,
  log: () => {},
  Math, Set
};
function bouw() {
  window_.BASIS_PIDS = omgeving.BASIS_PIDS; window_.ANALYSE_PIDS = omgeving.ANALYSE_PIDS;
  return new Function(...Object.keys(omgeving), 'pidHist', 'pidVals', 'activePIDs',
    'supportedPIDs', 'demoMode', 'connected', 'window',
    src.slice(van, tot) + '\nreturn {plKernStatus, plKernDekking};')
    (...Object.values(omgeving), pidHist, pidVals, new Set(), supportedPIDs, false, true, window_);
}

let fout = 0, n = 0;
function toets(naam, g, v) {
  n++;
  const ok = JSON.stringify(g) === JSON.stringify(v);
  if (!ok) { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + JSON.stringify(g) + ', verwacht ' + JSON.stringify(v)); }
  else console.log('  ok    ' + naam);
}
function vul(pid, aantal) { pidHist[pid] = new Array(aantal).fill({ t: 0, v: 1 }); }
function reset() {
  for (const k in pidHist) delete pidHist[k];
  supportedPIDs.clear();
  delete window_._laatstProfiel;
}
const KERN_ACCU = ['0142', '010C', '0104', '0105', '0146', '015B', '010F'];

console.log('\n— eis hangt af van de aard van de sensor —');
{
  reset(); KERN_ACCU.forEach(p => supportedPIDs.add(p));
  vul('0142', 1); vul('0105', 1); vul('010F', 1); vul('0146', 1);   // traag: 1 volstaat
  vul('010C', 10); vul('0104', 10); vul('015B', 10);                // dynamisch: reeks
  const k = bouw().plKernStatus('accu');
  toets('7 kernsensoren', k.totaal, 7);
  toets('traag heeft quota 1', k.items.find(i => i.pid === '0142').quota, 1);
  toets('dynamisch heeft quota 10', k.items.find(i => i.pid === '010C').quota, 10);
  toets('compleet', k.compleet, true);
}

console.log('\n— een dynamische sensor met te weinig monsters is mager —');
{
  reset(); KERN_ACCU.forEach(p => supportedPIDs.add(p));
  vul('0142', 1); vul('0105', 1); vul('010F', 1); vul('0146', 1);
  vul('010C', 3); vul('0104', 10); vul('015B', 10);
  const k = bouw().plKernStatus('accu');
  toets('niet compleet', k.compleet, false);
  toets('010C staat bij mager', k.mager.map(i => i.pid), ['010C']);
  const d = bouw().plKernDekking('accu');
  toets('de prompt noemt hem mager, met het aantal', d.mager, ['PID010C (3)']);
}

console.log('\n— sensoren die de auto niet heeft blokkeren de wachtlus niet —');
{
  reset(); ['0142', '010C', '0104', '0105', '010F'].forEach(p => supportedPIDs.add(p));
  vul('0142', 1); vul('0105', 1); vul('010F', 1); vul('010C', 10); vul('0104', 10);
  const k = bouw().plKernStatus('accu');
  toets('0146 en 015B als n.v.t.', k.nvt.map(i => i.pid).sort(), ['0146', '015B']);
  toets('haalbare set is compleet', k.compleet, true);
  toets('kern-percentage blijft 5 van 7', Math.round(k.pctKern * 100), 71);
  toets('de prompt zet n.v.t. bij stil', bouw().plKernDekking('accu').stil.sort(), ['PID0146', 'PID015B']);
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
