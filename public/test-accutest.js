// ══════════════════════════════════════════════════════════════════
// test-accutest.js — PLAccu: een echte accutest zonder valse melding
// ──────────────────────────────────────────────────────────────────
// Met de echte pidlane-accutest.js, pidlane-kenmerk.js en
// pidlane-watchers.js in een vm:
//
//   1. de grenzen: BCI-startgrens per temperatuur, rustspanning → %
//   2. rust: korter dan 2 uur stil is GEEN oordeel, ook niet bij 11,8 V
//   3. start: het plateau beslist, niet de inschakelpiek; te traag gemeten
//      = niet te beoordelen
//   4. trend: een diepere dip door kou is geen achteruitgang
//   5. winter: de koudste nacht uit de verwachting
//   6. belasting: ontladen met de motor aan; 15,4 V bij vorst is goed laden
//   7. de poort: één bewijs is geen melding, twee wel
//   8. de watcher: i-stop in het venster is geen "dynamo"; een echte
//      fout meldt pas op de tweede dag
//
// Wat hier NIET getoetst wordt: wat een echte accu bij het starten doet.
// Dat is de begeleide test in de auto.
//
// Draaien vanuit public/:  node test-accutest.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let n = 0, fouten = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + naam);
  else { console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); fouten++; }
}
const lees = (f) => fs.readFileSync(__dirname + '/' + f, 'utf8');

function sandbox(extra) {
  const opslag = {};
  const s = {
    console: { log() {}, warn() {}, info() {}, error: console.error },
    setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {},
    pidHist: {}, pidVals: {}, connected: true, demoMode: false,
    localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } },
    log() {}, logToSheets() {}, performance: { now: () => s.__T },
    __T: new Date(2026, 9, 25, 8, 0, 0).getTime()
  };
  Object.assign(s, extra || {});
  s.window = s;
  vm.createContext(s);
  vm.runInContext('Date.now=()=>globalThis.__T;', s);
  return s;
}
function laad(s, f) { vm.runInContext(lees(f), s, { filename: f }); }

const s = sandbox();
laad(s, 'pidlane-waarneming.js');
laad(s, 'pidlane-kenmerk.js');
laad(s, 'pidlane-accutest.js');
if (!s.PLAccu || !s.PLAccu._kern) { console.error('FOUT: PLAccu niet geladen'); process.exit(1); }
const K = s.PLAccu._kern;

console.log('\n1. Grenzen');
toets('BCI: 9,6 V bij 21 °C', K.startGrens(21) === 9.6);
toets('BCI: 8,5 V bij −18 °C', K.startGrens(-18) === 8.5);
toets('BCI: zonder temperatuur de strengste (9,6 V)', K.startGrens(null) === 9.6);
toets('BCI: tussen −7 en −1 lineair', Math.abs(K.startGrens(-4) - 9.0) < 0.01, K.startGrens(-4));
toets('rust: 12,65 V = 100 %', K.ocvSoc(12.65, 25) === 100);
toets('rust: 12,2 V = 50 %', K.ocvSoc(12.2, 25) === 50);
toets('rust: bij vorst telt dezelfde spanning voor méér lading', K.ocvSoc(12.2, -10) > K.ocvSoc(12.2, 25));
toets('rust: onzin is null', K.ocvSoc(3, 20) === null && K.ocvSoc('', 20) === null);
toets('laadHoog: 15,2 V bij 20 °C en zonder temperatuur', s.PLKenmerk.laadHoog(20) === 15.2 && s.PLKenmerk.laadHoog(null) === 15.2 && s.PLKenmerk.laadHoog(undefined) === 15.2);
toets('laadHoog: hoger bij vorst, hoogstens +0,6', s.PLKenmerk.laadHoog(-10) === 15.56 && s.PLKenmerk.laadHoog(-40) === 15.8, s.PLKenmerk.laadHoog(-10));
toets('laadspanning 15,4 V bij −10 °C: geen fout (temperatuurcompensatie)', !s.PLKenmerk.laadspanning(15.4, 1500, { temp: -10 }) || s.PLKenmerk.laadspanning(15.4, 1500, { temp: -10 }).niveau !== 'fout');
toets('tegenproef: 15,4 V bij 20 °C blijft fout', s.PLKenmerk.laadspanning(15.4, 1500, { temp: 20 }).niveau === 'fout');

console.log('\n2. Rustspanning');
let r = K.rustOordeel({ u: 11.8, rustMin: 30, temp: 10 });
toets('11,8 V na 30 min stilstand: geen oordeel, geen bewijs (de app weet niet genoeg)', r.staat === 'onbekend' && !r.bewijs, JSON.stringify(r));
r = K.rustOordeel({ u: 11.8, rustMin: null });
toets('onbekend hoe lang stil: geen oordeel', r.staat === 'onbekend' && !r.bewijs);
r = K.rustOordeel({ u: 12.1, rustMin: 300, temp: 10 });
toets('12,1 V na 5 uur: laag, met bewijs', r.staat === 'laag' && r.bewijs === 'rust', JSON.stringify(r));
r = K.rustOordeel({ u: 12.3, rustMin: 300 });
toets('12,3 V na 5 uur: matig, géén bewijs (slim laden houdt hem op 75–90 %)', r.staat === 'matig' && !r.bewijs);
toets('12,6 V: goed', K.rustOordeel({ u: 12.6, rustMin: 300 }).staat === 'goed');

console.log('\n3. Startdip');
// Elke 40 ms: rust 12,6, inschakelpiek 7,9 V, plateau ~10,4, dan laden 14,2.
const reeks = (stap, piek, plateau) => {
  const m = []; let t = 0;
  const v = (ms) => ms < 400 ? 12.6 : ms < 420 ? piek : ms < 1200 ? plateau + ((ms / stap) % 2) * 0.1 : 14.2;
  for (t = 0; t <= 2500; t += stap) m.push({ t, v: v(t) });
  return m;
};
let st = K.startUitMonsters(reeks(40, 7.9, 10.4), 12.6);
toets('snel gemeten: ok, plateau rond 10,4 V', st.ok && Math.abs(st.plateau - 10.45) < 0.1, JSON.stringify(st));
toets('… de inschakelpiek van 7,9 V beslist niet: oordeel goed', K.startOordeel(st, 21).staat === 'goed', JSON.stringify(K.startOordeel(st, 21)));
st = K.startUitMonsters(reeks(500, 7.9, 10.4), 12.6);
toets('elke 500 ms gemeten: niet te beoordelen', !st.ok && K.startOordeel(st, 21).staat === 'onbekend', JSON.stringify(st));
st = K.startUitMonsters(reeks(40, 9.0, 9.1), 12.6);
toets('plateau 9,1 V bij 21 °C: zwak, met bewijs', K.startOordeel(st, 21).staat === 'zwak' && K.startOordeel(st, 21).bewijs === 'start');
toets('… hetzelfde plateau bij −12 °C: niet zwak (BCI 8,7 V)', K.startOordeel(st, -12).staat !== 'zwak');
toets('geen dip (motor niet gestart): niet te beoordelen', !K.startUitMonsters([0, 100, 200, 300, 400].map((t) => ({ t, v: 12.6 })), 12.6).ok);

console.log('\n4. Trend');
const start = (dU, temp, i) => ({ ok: true, dU, rust: 12.6, temp, bron: '0142', t: i });
let starts = []; for (let i = 0; i < 10; i++) starts.push(start(2.0 + (i % 2) * 0.05, 15, i));
toets('tien gelijke starts: stabiel', K.trend(starts).staat === 'stabiel', JSON.stringify(K.trend(starts)));
toets('zeven starts: nog geen trend', K.trend(starts.slice(0, 7)).staat === 'onbekend');
starts = []; for (let i = 0; i < 10; i++) starts.push(start(i < 5 ? 2.0 : 3.0, 15, i));
toets('dip van 2,0 naar 3,0 V bij gelijke temperatuur: achteruit, met bewijs', K.trend(starts).staat === 'achteruit' && K.trend(starts).bewijs === 'trend');
starts = []; for (let i = 0; i < 10; i++) starts.push(i < 5 ? start(2.0, 20, i) : start(2.0 * K.kouFactor(-10), -10, i));
toets('dezelfde groei door vorst (−10 °C): géén achteruitgang', K.trend(starts).staat === 'stabiel', JSON.stringify(K.trend(starts)));
starts = []; for (let i = 0; i < 10; i++) starts.push(Object.assign(start(i < 5 ? 2.0 : 3.0, 15, i), { herstart: i >= 5 }));
toets('i-stop-herstarts tellen niet mee in de trend', K.trend(starts).staat === 'onbekend');

console.log('\n5. Winter');
const gezond = [0, 1, 2].map((i) => start(2.0, 15, i));
toets('gezonde accu bij −10 °C: goed', K.winter(gezond, -10).staat === 'goed', JSON.stringify(K.winter(gezond, -10)));
const grens = [0, 1, 2].map((i) => start(2.9, 15, i));
toets('dip 2,9 V bij 15 °C (nu geen fout: plateau 9,7) bij −15 °C: krap', K.startOordeel({ ok: true, plateau: 9.7 }, 15).staat !== 'zwak' && K.winter(grens, -15).staat === 'krap', JSON.stringify(K.winter(grens, -15)));
const zwakker = [0, 1, 2].map((i) => start(3.1, 15, i));
toets('dip 3,1 V bij 15 °C (nu krap, geen fout) bij −18 °C: waarschuwing', K.startOordeel({ ok: true, plateau: 9.5 }, 15).staat === 'krap' && K.winter(zwakker, -18).staat === 'waarschuw', JSON.stringify(K.winter(zwakker, -18)));
toets('twee starts: geen voorspelling', K.winter(gezond.slice(0, 2), -10).staat === 'onbekend');
toets('geen kou op komst: geen advies', K.winter(grens, 12).staat === 'geen');
toets('geen verwachting: onbekend', K.winter(grens, null).staat === 'onbekend');

console.log('\n6. Belastingproef');
const belast = (u, rpm, duurS) => { const m = []; for (let t = 0; t <= duurS * 1000; t += 2000) m.push({ t, u: typeof u === 'function' ? u(t) : u, rpm }); return m; };
let b = K.belastOordeel(belast(12.3, 800, 60), 12.6, 15);
toets('12,3 V met motor aan en verbruikers aan, rust 12,6: ontlaadt, met bewijs', b.staat === 'ontlaadt' && b.bewijs === 'belasting', JSON.stringify(b));
b = K.belastOordeel(belast((t) => (t < 20000 ? 12.6 : 13.6), 800, 60), 12.6, 15);
toets('slimme dynamo die bijspringt (12,6 → 13,6): goed, tegenbewijs', b.staat === 'goed' && b.tegenbewijs === 'dynamo', JSON.stringify(b));
b = K.belastOordeel(belast(12.3, 800, 20), 12.6, 15);
toets('20 s: te kort, geen oordeel', b.staat === 'onbekend');
b = K.belastOordeel(belast(12.3, 0, 60), 12.6, 15);
toets('motor uit: geen oordeel', b.staat === 'onbekend');
toets('15,4 V bij −10 °C: goed', K.belastOordeel(belast(15.4, 800, 60), 12.6, -10).staat === 'goed');
toets('tegenproef: 15,4 V bij 20 °C: te hoog', K.belastOordeel(belast(15.4, 800, 60), 12.6, 20).staat === 'te_hoog');

console.log('\n7. De poort: twee bewijzen');
const D = 864e5, t0 = s.__T;
let L = K.bewijsErbij([], { soort_van: 'dynamo', soort: 'laadspanning', tekst: 'x' }, t0);
toets('één bewijs: niet bevestigd', !K.bevestigd(L, 'dynamo', t0).ja);
L = K.bewijsErbij(L, { soort_van: 'dynamo', soort: 'laadspanning', tekst: 'x' }, t0 + 60000);
toets('dezelfde soort, dezelfde dag, nog eens: niet bevestigd en niet dubbel', !K.bevestigd(L, 'dynamo', t0).ja && L.length === 1);
let L2 = K.bewijsErbij(L, { soort_van: 'dynamo', soort: 'laadspanning', tekst: 'x' }, t0 + D);
toets('dezelfde soort op een tweede dag: bevestigd', K.bevestigd(L2, 'dynamo', t0 + D).ja);
L2 = K.bewijsErbij(L, { soort_van: 'dynamo', soort: 'belasting', tekst: 'x' }, t0 + 1000);
toets('twee soorten dezelfde dag: bevestigd', K.bevestigd(L2, 'dynamo', t0 + 1000).ja);
toets('… maar niet voor de accu', !K.bevestigd(L2, 'accu', t0 + 1000).ja);
toets('ouder dan 30 dagen telt niet', !K.bevestigd(L2, 'dynamo', t0 + 31 * D).ja);
s.PLAccu.bewijs('belasting', 'x'); s.PLAccu.bewijs('gevraagd', 'y');
toets('opslag: twee soorten via bewijs() → bevestigd', s.PLAccu.bevestigd('dynamo'));
s.PLAccu.tegenbewijs('dynamo');
toets('tegenbewijs (geslaagde belastingproef) wist de dynamo-aanwijzingen', !s.PLAccu.bevestigd('dynamo'));
s.PLAccu.bewijs('start', 'x'); s.PLAccu.bewijs('rust', 'y');
toets('nieuwe accu wist de accu-aanwijzingen', s.PLAccu.bevestigd('accu') && (s.PLAccu.nieuweAccu(), !s.PLAccu.bevestigd('accu')));

console.log('\n8. Adapterantwoorden');
toets('ATRV "12.6V" → 12,6', K.volt('12.6V') === 12.6 && K.volt('ATRV\r12.6V\r>') === 12.6);
toets('ATRV zonder V → null', K.volt('NO DATA') === null && K.volt('') === null);
toets('010C "41 0C 1A F8" → 1726', K.toeren('41 0C 1A F8') === 1726);

console.log('\n9. De watcher LAADSPANNING met de poort');
function app() {
  const a = sandbox();
  laad(a, 'pidlane-monitor.js'); laad(a, 'pidlane-watchers.js');
  laad(a, 'pidlane-waarneming.js'); laad(a, 'pidlane-kenmerk.js'); laad(a, 'pidlane-accutest.js');
  a.PLMon.active = true; a.PLMon.events = {}; a.PLMon._order = []; a.PLMon.startedAt = a.__T;
  return a;
}
function rij(a, duurS, f) {
  const t0 = a.__T;
  for (let ms = 0; ms <= duurS * 1000; ms += 250) {
    a.__T = t0 + ms;
    const w = f(ms / 1000);
    for (const pid of Object.keys(w)) { (a.pidHist[pid] || (a.pidHist[pid] = [])).push({ t: a.__T, v: w[pid] }); a.pidVals[pid] = w[pid]; }
    if (ms % 2000 === 0) a.PLWatch._tick();
  }
  return Object.keys(a.PLMon.events);
}
const laadMelding = (ev) => ev.some((k) => /LAADSPANNING/.test(k));
{
  const a = app();
  rij(a, 10, () => ({ '0105': 90, '0142': 14.1, '010D': 30, '010C': 1500 }));
  // i-stop: 20 s motor uit met licht en blower, dan weer aan op 13,0 V.
  const ev = rij(a, 34, (t) => (t < 20 ? { '0105': 90, '0142': 12.0, '010D': 0, '010C': 0 } : { '0105': 90, '0142': 13.0, '010D': 0, '010C': 800 + (Math.round(t * 4) % 2) }));
  toets('i-stop van 20 s in het venster: geen "dynamo laadt niet"', !laadMelding(ev), ev.join(', '));
  toets('… en ook geen bewijs genoteerd', !a.PLAccu.stand().bewijs.length, JSON.stringify(a.PLAccu.stand().bewijs));
}
{
  const a = app();
  const laag = (t) => ({ '0105': 90, '0142': 11.9, '010D': 60, '010C': 1800 + (Math.round(t * 4) % 2) });
  let ev = rij(a, 40, laag);
  toets('11,9 V met draaiende motor op dag 1: nog geen melding (één bewijs)', !laadMelding(ev), ev.join(', '));
  toets('… wel genoteerd als aanwijzing', a.PLAccu.stand().bewijs.length === 1 && a.PLKenmerk.onbeslist().some((o) => o.id === 'watch_LAADSPANNING'));
  a.__T += 864e5; a.pidHist = {};
  ev = rij(a, 40, laag);
  toets('tegenproef: dezelfde fout op dag 2: melding', laadMelding(ev), ev.join(', '));
}

console.log('\n' + n + ' controles, ' + fouten + ' fout');
process.exit(fouten ? 1 : 0);
