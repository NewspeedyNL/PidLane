// test-kerndekking.js — toetst plKernDekking() en het meetdekking-blok in de
// AI-prompt. Puur meldend: deze code blokkeert niets en zet niets aan.
// Scenario's komen uit de CX-5-bundel van 02-08-2026.
// Draaien vanuit public/:  node test-kerndekking.js
'use strict';
const fs = require('fs');

const src = fs.readFileSync(__dirname + '/pidlane-fuel.js', 'utf8');
const van = src.indexOf('const KERN_REEKS_MIN');
const tot = src.indexOf('async function runQuickAI');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: knipbereik niet gevonden in pidlane-fuel.js'); process.exit(1);
}

let pidHist = {}, window_ = {};
const omgeving = {
  BASIS_PIDS: ['010C', '0105', '0104', '010F', '0142'],
  ANALYSE_PIDS: {
    brandstof: ['010C', '010D', '0104', '0106', '0107', '0110', '010B', '010F', '0144', '0124', '0115', '015E', '012F'],
    accu: ['0142', '010C', '0104', '0105', '0146', '015B']
  },
  FILTERED_PIDS: new Set(['05', '0F', '46', '5C', '2F', '42', '33', '07', '09']),
  getPidDef: pid => ({ name: 'PID' + pid }),
  plMeetStatus: () => ({ sec: 600, maxN: 400, dekking: 0.9, rijSec: 0 }),
  Math, Set
};
const maak = new Function(...Object.keys(omgeving), 'pidHist', 'window',
  src.slice(van, tot) + '\nreturn {plKernDekking, plMeetPromptBlok};');
function bouw() { window_.BASIS_PIDS = omgeving.BASIS_PIDS;
  window_.ANALYSE_PIDS = omgeving.ANALYSE_PIDS;
  return maak(...Object.values(omgeving), pidHist, window_); }

let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (!ok) { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + JSON.stringify(gemeten) + ', verwacht ' + JSON.stringify(verwacht)); }
  else console.log('  ok    ' + naam);
}
function vul(pid, aantal) { pidHist[pid] = new Array(aantal).fill({ t: 0, v: 1 }); }
function reset() { pidHist = {}; window_ = {}; }

console.log('\n— alles ruim gemeten —');
{
  reset(); window_._laatstProfiel = 'accu';
  ['0142', '010C', '0104', '0105', '0146', '015B', '010F'].forEach(p => vul(p, 50));
  const k = bouw().plKernDekking();
  toets('profiel herkend', k.prof, 'accu');
  toets('7 kernsensoren', k.totaal, 7);
  toets('alles voldoende', [k.goed.length, k.mager.length, k.stil.length], [7, 0, 0]);
}

console.log('\n— trage sensor heeft aan één monster genoeg —');
{
  reset(); window_._laatstProfiel = 'accu';
  vul('0142', 1); vul('0105', 1); vul('010F', 1);        // traag: 42, 05, 0F
  vul('010C', 40); vul('0104', 40); vul('0146', 1); vul('015B', 40);
  const k = bouw().plKernDekking();
  toets('geen enkele als mager bestempeld', k.mager.length, 0);
  toets('alle 7 voldoende', k.goed.length, 7);
  toets('traag met 1 monster telt mee', k.goed.some(x => /0142 \(1\)/.test(x)), true);
}

console.log('\n— dynamische sensor met één monster is te mager —');
{
  reset(); window_._laatstProfiel = 'accu';
  vul('010C', 1); vul('0104', 1);                        // dynamisch, 1 monster
  vul('0142', 5); vul('0105', 5); vul('010F', 5); vul('0146', 5); vul('015B', 40);
  const k = bouw().plKernDekking();
  toets('twee sensoren als mager gemeld', k.mager.length, 2);
  toets('aantal staat erbij', /\(1\)/.test(k.mager[0]), true);
}

console.log('\n— het echte geval: brandstof mist vier kern-PIDs —');
{
  reset(); window_._laatstProfiel = 'brandstof';
  // 0110, 0124, 0144 en 015E leverde de CX-5 niet
  ['010C', '010D', '0104', '0106', '0107', '010B', '010F', '0115', '012F', '0105', '0142']
    .forEach(p => vul(p, 40));
  const k = bouw().plKernDekking();
  toets('15 kernsensoren', k.totaal, 15);
  toets('vier stil', k.stil.length, 4);
  const blok = bouw().plMeetPromptBlok();
  toets('prompt noemt ze expliciet', /GEVRAAGD MAAR NIETS GELEVERD/.test(blok), true);
  toets('prompt verbiedt impliciete uitspraken', /ook niet impliciet/.test(blok), true);
  toets('geen 60%-waarschuwing bij 11 van 15', /minder dan 60%/.test(blok), false);
}

console.log('\n— onder de 60% kern —');
{
  reset(); window_._laatstProfiel = 'brandstof';
  ['010C', '010D', '0104', '0106'].forEach(p => vul(p, 40));
  const blok = bouw().plMeetPromptBlok();
  toets('waarschuwing staat erin', /minder dan 60%/.test(blok), true);
  toets('noemt het een indicatie', /geen diagnose/.test(blok), true);
}

console.log('\n— geen profiel bekend: geen kern-blok, rest blijft staan —');
{
  reset();
  const b = bouw();
  toets('plKernDekking geeft null', b.plKernDekking(), null);
  const blok = b.plMeetPromptBlok();
  toets('geen kern-regel', /Kernsensoren/.test(blok), false);
  toets('meetdekking staat er nog wel', /Meetdekking:/.test(blok), true);
  toets('stilstand-waarschuwing ook', /STILSTAAND/.test(blok), true);
}

console.log('\n— onbekend profiel valt zacht terug —');
{
  reset(); window_._laatstProfiel = 'bestaatniet';
  toets('geen uitzondering, gewoon null', bouw().plKernDekking(), null);
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
