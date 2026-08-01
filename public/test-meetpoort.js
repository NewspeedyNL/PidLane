// test-meetpoort.js — toetst de meetfase-poort uit pidlane-fuel.js
// Knipt het blok MEET_EIS t/m plMeetTekort letterlijk uit de module en draait
// het tegen stubs. Zelfde werkwijze als test-pidgate.js: geen kopie van de
// logica hier, anders toets je je eigen kopie in plaats van de code.
// Draaien vanuit public/:  node test-meetpoort.js
'use strict';
const fs = require('fs');

const src = fs.readFileSync(__dirname + '/pidlane-fuel.js', 'utf8');
const van = src.indexOf('const MEET_EIS = {');
const tot = src.indexOf('/* Toont het meetscherm');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: knipbereik niet gevonden in pidlane-fuel.js');
  process.exit(1);
}
const blok = src.slice(van, tot);

// ── Stubs ──────────────────────────────────────────────────────────
let pidHist = {}, activePIDs = new Set();
const isReportableSensor = () => true;
const window = {};

const maak = new Function(
  'pidHist', 'activePIDs', 'isReportableSensor', 'window',
  blok + '\nreturn {plMeetStatus, plMeetTekort, plMeetNiveau, MEET_EIS, plMeetRijSec};'
);

function poort() {
  return maak(pidHist, activePIDs, isReportableSensor, window);
}

// ── Hulpjes om meetdata te fabriceren ──────────────────────────────
const T0 = 1785600000000;
function reeks(pid, seconden, waarde, stapMs = 500) {
  const arr = [];
  for (let t = 0; t <= seconden * 1000; t += stapMs) {
    arr.push({ t: T0 + t, v: (typeof waarde === 'function') ? waarde(t / 1000) : waarde });
  }
  pidHist[pid] = arr;
}
function reset() { pidHist = {}; activePIDs = new Set(['010C', '010D', '0105']); }

// ── Toetsen ────────────────────────────────────────────────────────
let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (!ok) { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + JSON.stringify(gemeten) + ', verwacht ' + JSON.stringify(verwacht)); }
  else console.log('  ok    ' + naam);
}

console.log('\n— niveau volgt het plan —');
{
  reset();
  const p = poort();
  window._wizJob = undefined;
  toets('geen plan → gevraagd niveau blijft', p.plMeetNiveau('normaal'), 'normaal');
  window._wizJob = { meting: 'rit10' };
  toets('plan rit10 hoogt normaal op naar rit', p.plMeetNiveau('normaal'), 'rit');
  window._wizJob = { meting: 'rit2' };
  toets('plan rit2 hoogt op naar kortrit', p.plMeetNiveau('normaal'), 'kortrit');
  window._wizJob = { meting: 'rit2' };
  toets('zwaardere aanroep wint van lichter plan', p.plMeetNiveau('rit'), 'rit');
  window._wizJob = { meting: 'stil' };
  toets('plan stil laat normaal staan', p.plMeetNiveau('normaal'), 'normaal');
  window._wizJob = undefined;
}

console.log('\n— elf minuten stationair (het geval van 01-08-2026) —');
{
  reset();
  reserveer();
  const p = poort();
  toets('haalt niveau normaal',  p.plMeetTekort('normaal').ok, true);
  toets('haalt niveau rit NIET', p.plMeetTekort('rit').ok, false);
  const r = p.plMeetTekort('rit');
  toets('meldt het als rijtekort', r.rijTekort, true);
  toets('rijSec is 0', r.st.rijSec, 0);
}
function reserveer() {
  reeks('010C', 660, 800);   // stationair toerental
  reeks('010D', 660, 0);     // stilstand
  reeks('0105', 660, 88);
}

console.log('\n— tien minuten waarvan zes rijdend —');
{
  reset();
  reeks('010C', 600, 2200);
  reeks('010D', 600, s => (s > 120 && s < 480) ? 70 : 0);   // 360 s boven 15 km/h
  reeks('0105', 600, 90);
  const p = poort();
  const r = p.plMeetTekort('rit');
  toets('rijSec ≈ 360 s', Math.abs(r.st.rijSec - 360) <= 2, true);
  toets('haalt niveau rit', r.ok, true);
}

console.log('\n— korte rit van twee minuten —');
{
  reset();
  reeks('010C', 130, 2000);
  reeks('010D', 130, s => s > 20 ? 55 : 0);   // ~110 s rijdend
  reeks('0105', 130, 90);
  const p = poort();
  toets('haalt kortrit', p.plMeetTekort('kortrit').ok, true);
  toets('haalt de volle rit niet (te kort)', p.plMeetTekort('rit').ok, false);
}

console.log('\n— voertuig zonder snelheids-PID —');
{
  reset();
  reeks('010C', 300, 900);
  reeks('0105', 300, 88);
  activePIDs = new Set(['010C', '0105']);
  const p = poort();
  const r = p.plMeetTekort('rit');
  toets('rijSec is null (geen oordeel)', r.st.rijSec, null);
  toets('rij-eis blokkeert niet', r.rijTekort, false);
}

console.log('\n— bevroren tab telt niet als rijtijd —');
{
  reset();
  // 60 s rijden, dan een gat van 45 minuten, dan weer 60 s rijden.
  const arr = [];
  for (let t = 0; t <= 60000; t += 500) arr.push({ t: T0 + t, v: 80 });
  for (let t = 0; t <= 60000; t += 500) arr.push({ t: T0 + 2760000 + t, v: 80 });
  pidHist['010D'] = arr;
  reeks('010C', 60, 2000);
  reeks('0105', 60, 90);
  const p = poort();
  const r = p.plMeetTekort('rit');
  toets('rijSec ≈ 120 s, niet 2880', Math.abs(r.st.rijSec - 120) <= 2, true);
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
