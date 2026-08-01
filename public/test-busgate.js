// test-busgate.js — toetst pidlane-busgate.js, en laat zien waaróm de oude
// cadans-fractie in pidlane-watchers.js het geval van 01-08-2026 niet kon
// vangen. De PID-intervallen komen uit de diagnosebundel van die avond
// (PidLane_diag_2026-08-01-18-48.json, PLLoad-mult 6).
// Draaien vanuit public/:  node test-busgate.js
'use strict';
const fs = require('fs');
const vm = require('vm');

// ── Gestuurde klok + PLBus-stub met hetzelfde 10 s-venster ─────────
let NU = 1785600000000;
const hist = [];
const PLBus = {
  note(bad) { hist.push({ t: NU, ms: 100, bad: !!bad }); if (hist.length > 400) hist.shift(); },
  stats() {
    const w = hist.filter(h => NU - h.t < 10000);
    const n = w.length, badN = w.filter(h => h.bad).length;
    return { perSec: +(n / 10).toFixed(1), foutPct: n ? Math.round(badN / n * 100) : 0, onvolPct: 0 };
  }
};

const ctx = {
  console,
  Date: new Proxy(Date, { get: (t, p) => p === 'now' ? (() => NU) : t[p] }),
  connected: true, demoMode: false
};
ctx.window = ctx;
vm.createContext(ctx);
ctx.PLBus = PLBus;
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-busgate.js', 'utf8'), ctx, { filename: 'pidlane-busgate.js' });
const G = ctx.PLBusGate;

// ── Toetsen ────────────────────────────────────────────────────────
let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (!ok) { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + JSON.stringify(gemeten) + ', verwacht ' + JSON.stringify(verwacht)); }
  else console.log('  ok    ' + naam);
}
function verkeer(seconden, bad) {         // 6 commando's per seconde, zoals gemeten
  for (let s = 0; s < seconden; s++) {
    for (let i = 0; i < 6; i++) { PLBus.note(bad); NU += 167; }
    NU += 1000 - 6 * 167;                 // rest van de seconde
  }
}

console.log('\n— gezonde bus —');
{
  verkeer(20, false);
  toets('haalt adapter', G.gate('adapter'), true);
  toets('haalt ecu', G.gate('ecu'), true);
  toets('haalt betrouwbaar', G.gate('betrouwbaar'), true);
}

console.log('\n— bus valt stil: alles NO DATA (20:53:02) —');
{
  verkeer(9, true);                        // negen seconden alleen fouten
  const st = G.status();
  toets('foutgraad hoog', st.foutPct >= 50, true);
  toets('ecu-poort dicht binnen 9 s', G.gate('ecu'), false);
  toets('betrouwbaar dicht', G.gate('betrouwbaar'), false);
  toets('reden benoemd', /foutgraad/.test(st.reden), true);
}

console.log('\n— herstel krijgt eerst rust —');
{
  verkeer(3, false);
  toets('direct na herstel nog dicht', G.gate('ecu'), false);
  verkeer(6, false);
  toets('na 5 s rust weer open', G.gate('ecu'), true);
}

console.log('\n— lege responsen (dode socket) —');
{
  ctx._emptyStreak = 3;
  toets('adapter-poort dicht', G.gate('adapter'), false);
  toets('reden benoemd', /lege respons/.test(G.status().reden), true);
  ctx._emptyStreak = 0;
  verkeer(6, false);
}

console.log('\n— geen verkeer: geen bewijs, geen oordeel —');
{
  NU += 15000;                             // venster leeggelopen
  toets('adapter nog wel', G.gate('adapter'), true);
  toets('ecu niet', G.gate('ecu'), false);
  toets('reden benoemd', /geen verkeer/.test(G.status().reden), true);
}

console.log('\n— niet verbonden / demo —');
{
  ctx.connected = false;
  toets('los: alles dicht', G.gate('adapter'), false);
  ctx.demoMode = true;
  toets('demo: alles open', G.gate('betrouwbaar'), true);
  ctx.connected = true; ctx.demoMode = false;
}

// ── De oude fractie, met de echte cadansen van die avond ───────────
console.log('\n— waarom de oude cadans-fractie het niet kon zien —');
{
  // interval (ms) per PID uit de diagnosebundel, PLLoad-mult 6
  const INTERVAL = {};
  const groep = (pids, ms) => pids.forEach(p => INTERVAL[p] = ms);
  groep(['010C', '0104', '0111', '010D', '0145', '0149'], 504);
  groep(['010B', '010E', '0110', '0123', '0159'], 1260);
  groep(['0106', '0107', '0115', '0103', '0113', '011C', '012E', '0134', '0141', '0144',
         '0147', '014C', '0151', '0155', '0156', '0162', '0163', '0167', '0168', '0143'], 4200);
  groep(['0105', '010F', '0133', '013C'], 42000);
  groep(['0142', '011F'], 126000);
  groep(['012F', '0130', '0131'], 252000);

  const CFG = { stilMinMs: 8000, stilFactor: 3, buitenBeeldFactor: 2.5, busStilFractie: 0.7 };
  const drempel = p => Math.max(CFG.stilMinMs, INTERVAL[p] * CFG.stilFactor);

  function fractieNa(stilteSec) {
    const t = stilteSec * 1000;
    let actief = 0, stil = 0;
    for (const p of Object.keys(INTERVAL)) {
      const d = drempel(p);
      if (t > d * CFG.buitenBeeldFactor) continue;   // buiten beeld
      actief++;
      if (t > d) stil++;
    }
    return { actief, stil, fractie: actief >= 3 ? stil / actief : 0 };
  }

  toets('40 PIDs in de opstelling', Object.keys(INTERVAL).length, 40);
  // Bij 9 s stilte zijn de groepen 504 ms en 1260 ms over hun drempel van
  // 8 s heen; de 4200 ms-groep (drempel 12,6 s) nog niet. Dat zijn er 11 in
  // dit model. In de echte log waren het er 14, omdat de 4200 ms-PIDs toen de
  // bus wegviel al tot 4 s oude monsters hadden. Het model is dus mílder dan
  // de werkelijkheid en de conclusie geldt a fortiori.
  const r9 = fractieNa(9);
  toets('na 9 s: 11 stil van 40 (model)', [r9.stil, r9.actief], [11, 40]);
  toets('na 9 s ver onder de drempel', r9.fractie < 0.3, true);
  toets('na 30 s nog steeds net te laag', fractieNa(30).fractie < CFG.busStilFractie, true);

  // Wanneer slaat de oude poort WEL aan? Pas als ook de 4200 ms-groep zijn
  // drempel van 12,6 s passeert; dan springt de fractie van 0,28 naar 0,78.
  // Het probleem is dus NALOOP, geen onbereikbaarheid: de melding staat er al
  // voordat de poort doorheeft dat de bus weg is.
  let eerste = null;
  for (let s = 1; s <= 2000 && eerste === null; s++) {
    if (fractieNa(s).fractie >= CFG.busStilFractie) eerste = s;
  }
  console.log('        oude poort sluit pas na ' + eerste + ' s stilte');
  toets('oude poort sluit pas na 13 s', eerste, 13);
  toets('de valse UITVAL-meldingen kwamen eerder (9 s)', 9 < eerste, true);

  // En de nieuwe poort? Die kijkt naar foutPct over een venster van 10 s, dus
  // hij hoeft niet te wachten tot de traagste cadans meetelt. Dit is de
  // eigenlijke regressietoets: sluit hij vóór het moment waarop de meldingen
  // ontstonden?
  ctx.connected = true; ctx.demoMode = false; ctx._emptyStreak = 0;
  hist.length = 0; G.reset();
  verkeer(20, false);                      // gezonde bus
  let nieuw = null;
  for (let s = 1; s <= 30 && nieuw === null; s++) {
    verkeer(1, true);
    if (!G.gate('ecu')) nieuw = s;
  }
  console.log('        nieuwe poort sluit na ' + nieuw + ' s stilte');
  toets('nieuwe poort sluit binnen 9 s', nieuw < 9, true);
  toets('nieuwe poort is sneller dan de oude', nieuw < eerste, true);
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
