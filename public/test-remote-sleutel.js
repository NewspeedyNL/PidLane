// ══════════════════════════════════════════════════════════════════
// test-remote-sleutel.js — telemetrie local → expert houdt de volle PID-sleutel
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT (24-10-2026, Mazda CX-5)
//
// feed() stuurde alleen het achtervoegsel (`pid.slice(2)`), en driveFeed()
// bij de expert plakte er altijd '01' voor. Mode-21 '210C' en '210D' (klep
// timing, rauw) kwamen zo binnen als 010C en 010D en overschreven toerental
// en snelheid. De expert zag andere waarden dan de bron.
//
// De toets onderscheidt: dezelfde frame-stroom bevat zowel 010C als 210C. Met
// de oude sleutel winnen die van elkaar; met de volle sleutel blijven ze los.
// Daarnaast blijft een kale 2-hex-sleutel (antwoord op request-pids, oude
// local) gewoon mode 01. Berekende (CA..) en telefoon-sensoren (TL..) vielen
// op dezelfde manier op mode 01: CA05 (trim totaal) werd 0105 koelwater.
//
// Draaien vanuit public/:  node test-remote-sleutel.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const bron = fs.readFileSync(path.join(__dirname, 'pidlane-remote.js'), 'utf8');
function knip(van, tot, wat) {
  const a = bron.indexOf(van);
  if (a < 0) { console.error('FOUT: anker voor ' + wat + ' niet gevonden: ' + van); process.exit(1); }
  const b = bron.indexOf(tot, a);
  if (b < 0) { console.error('FOUT: eindanker voor ' + wat + ' niet gevonden: ' + tot); process.exit(1); }
  return bron.slice(a, b);
}

// local: remSleutel + remPid + feed;  expert: driveFeed;  mergeVals los
const lokaal = knip('function remSleutel(pid){', 'function startFlush(){', 'remSleutel/remPid/feed');
const drive = knip('function driveFeed(d,isBackfill){', '  // Voertuigprofiel van de local toepassen', 'driveFeed');
const merge = knip('function mergeVals(d){', 'function pidName(', 'mergeVals');

function bouw() {
  const meters = {};
  const ctx = {
    S: { mode: 'local', ws: { readyState: 1 }, dirty: {}, vals: {} },
    updPID: (p, v) => { meters[p] = v; },
    checkStability() {}, feedDatalog() {}, feedSessionStat() {},
    runCorrelationEngine() {}, updateEVMode() {},
    window: { _remoteVehicleMode: true }
  };
  const f = new Function('ctx',
    'with(ctx){' + lokaal + '\n' + drive + '\n' + merge +
    '\nreturn {feed,driveFeed,mergeVals,remPid};}')(ctx);
  return { f, ctx, meters };
}

console.log('\n1. Mode 21 overschrijft mode 01 niet meer');
{
  const { f, ctx, meters } = bouw();
  f.feed('010C', 649);   // toerental
  f.feed('210C', 37);    // klep timing inlaat, rauw
  f.feed('010D', 0);     // snelheid
  f.feed('210D', 112);   // klep timing uitlaat, rauw
  f.feed('0105', 91);    // koelwater
  f.feed('CA05', 1.57);  // trim totaal (berekend) — werd 0105 koelwater
  f.feed('TL01', 2.5);   // helling (telefoon) — werd 0101
  const frame = Object.assign({}, ctx.S.dirty, { t: 1 });
  f.driveFeed(JSON.parse(JSON.stringify(frame)), false);
  toets('010C blijft toerental', meters['010C'] === 649, JSON.stringify(meters));
  toets('010D blijft snelheid', meters['010D'] === 0, JSON.stringify(meters));
  toets('210C komt als 210C binnen', meters['210C'] === 37, JSON.stringify(meters));
  toets('210D komt als 210D binnen', meters['210D'] === 112, JSON.stringify(meters));
  toets('0105 ongemoeid', meters['0105'] === 91, JSON.stringify(meters));
  toets('CA05 blijft CA05', meters['CA05'] === 1.57, JSON.stringify(meters));
  toets('TL01 blijft TL01', meters['TL01'] === 2.5, JSON.stringify(meters));
  toets('0101 niet aangeraakt', meters['0101'] === undefined, JSON.stringify(meters));
}

console.log('\n2. Kale 2-hex-sleutel blijft mode 01 (request-pids, oude local)');
{
  const { f, meters, ctx } = bouw();
  f.driveFeed({ '0C': 800, '05': 90 }, false);
  toets('0C → 010C', meters['010C'] === 800, JSON.stringify(meters));
  toets('05 → 0105', meters['0105'] === 90, JSON.stringify(meters));
  f.mergeVals({ '0c': 800, '210D': 5, t: 3 });
  toets('mergeVals: 0c → 010C', ctx.S.vals['010C'] === 800, JSON.stringify(ctx.S.vals));
  toets('mergeVals: 210D blijft 210D', ctx.S.vals['210D'] === 5, JSON.stringify(ctx.S.vals));
  toets('mergeVals: geen 01210D', ctx.S.vals['01210D'] === undefined, JSON.stringify(ctx.S.vals));
}

console.log('\n3. Rommel-sleutels gaan niet de meters in');
{
  const { f, meters, ctx } = bouw();
  f.feed('<x>', 1);
  toets('feed weigert een rommel-sleutel', Object.keys(ctx.S.dirty).length === 0, JSON.stringify(ctx.S.dirty));
  f.driveFeed({ '__proto__x': 1, 'ZZ': 2, '0': 3, 'ca05<': 4 }, false);
  toets('driveFeed weigert rommel-sleutels', Object.keys(meters).length === 0, JSON.stringify(meters));
}

console.log(fouten ? '\n' + fouten + ' FOUT(EN)' : '\nAlles goed');
process.exit(fouten ? 1 : 0);
