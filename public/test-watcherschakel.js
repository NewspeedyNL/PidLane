// ══════════════════════════════════════════════════════════════════
// test-watcherschakel.js — de rit-monitor meldt niets bij gewoon schakelen,
//                          en vangt nog steeds wat hij moet vangen
// ──────────────────────────────────────────────────────────────────
// WAAROM (04-10-2026)
// Op een rit kwamen meldingen binnen terwijl er geschakeld werd. De oorzaak
// zat in _overbrenging(): die zocht de grootste sprong tussen twee BUUR-
// metingen. Bij een poll van 250 ms duurt een schakeling vier metingen; elke
// stap bleef onder 12% en "geschakeld" bleef false. Daarnaast vergeleek de
// bevroren-waarde-watcher alles met 40 rpm toerentalvariatie, wat een motor
// bij constant rijden al haalt, en stonden laadspanning (13,2 V) en
// koelwater (108 °C) op grenzen die een moderne, gezonde auto overschrijdt.
//
// HOE
// pidlane-watchers.js en pidlane-monitor.js worden écht geladen (vm). De
// rit wordt nagebouwd als pidHist met een eigen klok; PLWatch._tick() draait
// elke 2 s, zoals in de app. Er wordt niets van de logica overgeschreven.
// Elk geval dat moet zwijgen heeft een tegenhanger die moet vuren.
//
// Draaien vanuit public/:  node test-watcherschakel.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok    ' + naam);
  else { console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); fouten++; }
}
const lees = f => fs.readFileSync(__dirname + '/' + f, 'utf8');

function nieuweApp(extra) {
  const opslag = {};
  const s = {
    console: { log() {}, warn() {}, error: console.error },
    setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {},
    pidHist: {}, pidVals: {}, connected: true, demoMode: false,
    localStorage: { getItem: k => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); } },
    _logs: [], log(m) { s._logs.push(m); },
    _sheets: [], logToSheets(type, msg, ex) { s._sheets.push({ type, msg, ex }); },
    __T: 1e12
  };
  Object.assign(s, extra || {});
  s.window = s;
  vm.createContext(s);
  vm.runInContext('Date.now=()=>globalThis.__T;', s);
  vm.runInContext(lees('pidlane-monitor.js'), s, { filename: 'pidlane-monitor.js' });
  vm.runInContext(lees('pidlane-watchers.js'), s, { filename: 'pidlane-watchers.js' });
  if (!s.PLMon || !s.PLWatch) { console.error('FOUT: PLMon of PLWatch niet geladen'); process.exit(1); }
  s.PLMon.active = true; s.PLMon.events = {}; s._order = s.PLMon._order = []; s.PLMon.startedAt = s.__T;
  return s;
}

// Rijdt `duurS` seconden; f(t in s) geeft {pid: waarde}. Elke 250 ms een
// meting per PID, elke 2 s een tik van de watchers.
function rij(s, duurS, f) {
  const t0 = s.__T;
  for (let ms = 0; ms <= duurS * 1000; ms += 250) {
    s.__T = t0 + ms;
    const w = f(ms / 1000);
    for (const pid of Object.keys(w)) {
      if (w[pid] === undefined) continue;
      (s.pidHist[pid] || (s.pidHist[pid] = [])).push({ t: s.__T, v: w[pid] });
      s.pidVals[pid] = w[pid];
    }
    if (ms % 2000 === 0) s.PLWatch._tick();
  }
  return Object.keys(s.PLMon.events);
}
const heeft = (ev, re) => ev.some(k => re.test(k));
const warm = { '0105': 90, '0142': 14.1 };

// ── 1. schakelen bij constante snelheid ───────────────────────────
console.log('\n1. Schakelen bij constante snelheid is geen defect');
{
  // 55 km/h; 3e (40 rpm per km/h) en 4e (30) om de 9 s, elke wissel over 1 s
  // (vier metingen van ~7%), zoals een koppeling die ingetrapt en gevierd wordt.
  const s = nieuweApp();
  const ev = rij(s, 90, t => {
    const fase = t % 18, r3 = 40, r4 = 30;
    let ratio;
    if (fase < 8) ratio = r3;
    else if (fase < 9) ratio = r3 + (r4 - r3) * (fase - 8);
    else if (fase < 17) ratio = r4;
    else ratio = r4 + (r3 - r4) * (fase - 17);
    return Object.assign({}, warm, { '010D': 55, '010C': Math.round(55 * ratio),
      '0104': 32 + (Math.round(t * 4) % 3), '0111': 16 + (Math.round(t * 4) % 2) });
  });
  toets('geen RPM_CONST of RATIO_CONST tijdens schakelen', !heeft(ev, /TEST:(RPM|RATIO)_CONST/), 'kreeg: ' + ev.join(', '));
  toets('geen BEVROREN snelheid tijdens schakelen', !heeft(ev, /BEVROREN:010D/), 'kreeg: ' + ev.join(', '));
}

// ── 1b. een trage schakeling die alleen PLGear ziet ────────────────
console.log('\n1b. Een trage schakeling (3 s) die PLGear wel ziet');
{
  // Over 3 s verschuift de verhouding per seconde maar ~10%: de eigen
  // herkenning (12% binnen vier metingen) mist hem. PLGear toont dan een
  // ander cijfer, en dat moet genoeg zijn.
  const s = nieuweApp({ PLGear: { toon: 3 } });
  const ev = rij(s, 90, t => {
    const fase = t % 20, r3 = 40, r4 = 30;
    let ratio;
    if (fase < 8) ratio = r3;
    else if (fase < 11) ratio = r3 + (r4 - r3) * (fase - 8) / 3;
    else if (fase < 18) ratio = r4;
    else ratio = r4 + (r3 - r4) * (fase - 18) / 2;
    s.PLGear.toon = ratio > 35 ? 3 : 4;
    return Object.assign({}, warm, { '010D': 55, '010C': Math.round(55 * ratio),
      '0104': 32 + (Math.round(t * 4) % 3), '0111': 16 + (Math.round(t * 4) % 2) });
  });
  toets('geen RPM_CONST of RATIO_CONST bij een trage schakeling', !heeft(ev, /TEST:(RPM|RATIO)_CONST/), 'kreeg: ' + ev.join(', '));
}

// ── 2. tegenproef: echte slip vuurt wél ───────────────────────────
console.log('\n2. Tegenproef: een geleidelijk weglopende verhouding (slip) vuurt nog');
{
  const s = nieuweApp();
  rij(s, 12, () => Object.assign({}, warm, { '010D': 60, '010C': 2400, '0104': 40, '0111': 20 }));
  const ev = rij(s, 12, t => Object.assign({}, warm, { '010D': 60, '010C': Math.round(2400 + 120 * t),
    '0104': 40 + (Math.round(t * 4) % 3), '0111': 20 + (Math.round(t * 4) % 2) }));
  toets('RATIO_CONST vuurt bij slip zonder schakelmoment', heeft(ev, /TEST:RATIO_CONST/), 'kreeg: ' + ev.join(', '));
  toets('BEVROREN snelheid vuurt als het toerental 50% oploopt zonder schakelen', heeft(ev, /BEVROREN:010D/), 'kreeg: ' + ev.join(', '));
}

// ── 3. constant rijden met wat toerentalruis ──────────────────────
console.log('\n3. Constant rijden: 60 rpm ruis maakt de snelheid niet "bevroren"');
{
  const s = nieuweApp();
  const ev = rij(s, 40, t => Object.assign({}, warm, { '010D': 50, '010C': 2000 + [0, 30, -30, 15][Math.round(t * 4) % 4],
    '0104': 30 + (Math.round(t * 4) % 3), '0111': 15 + (Math.round(t * 4) % 2) }));
  toets('geen BEVROREN bij constant rijden', !heeft(ev, /BEVROREN/), 'kreeg: ' + ev.join(', '));
}

// ── 4. uitrollen met gas los ──────────────────────────────────────
console.log('\n4. Uitrollen met gas los: gasklep en belasting staan terecht stil');
{
  const s = nieuweApp();
  rij(s, 6, () => Object.assign({}, warm, { '010D': 80, '010C': 2400, '0104': 35, '0111': 18 }));
  const ev = rij(s, 15, t => Object.assign({}, warm, { '010D': Math.round(80 - 2.7 * t),
    '010C': Math.round(30 * (80 - 2.7 * t)), '0104': 0, '0111': 14 }));
  toets('geen BEVROREN gasklep/belasting bij gas los', !heeft(ev, /BEVROREN:01(04|11)/), 'kreeg: ' + ev.join(', '));
  // tegenproef: gasklep die stilstaat terwijl er gas gegeven wordt
  const s2 = nieuweApp();
  rij(s2, 6, () => Object.assign({}, warm, { '010D': 40, '010C': 1600, '0104': 35, '0111': 18 }));
  const ev2 = rij(s2, 12, t => Object.assign({}, warm, { '010D': Math.round(40 + 2 * t),
    '010C': Math.round(40 * (40 + 2 * t)), '0104': 45 + (Math.round(t * 4) % 5), '0111': 18 }));
  toets('tegenproef: bevroren gasklep bij accelereren vuurt wél', heeft(ev2, /BEVROREN:0111/), 'kreeg: ' + ev2.join(', '));
}

// ── 5. laadspanning met slimme dynamo ─────────────────────────────
console.log('\n5. Laadspanning: 12,9 V is een slimme dynamo, 12,3 V laadt niet');
{
  const s = nieuweApp();
  const ev = rij(s, 40, t => ({ '0105': 90, '0142': 12.9, '010D': 0, '010C': 800 + (Math.round(t * 4) % 2) }));
  toets('12,9 V geeft geen melding', !heeft(ev, /LAADSPANNING/), 'kreeg: ' + ev.join(', '));
  const s2 = nieuweApp();
  const ev2 = rij(s2, 40, t => ({ '0105': 90, '0142': 12.3, '010D': 0, '010C': 800 + (Math.round(t * 4) % 2) }));
  toets('tegenproef: 12,3 V geeft wél een melding', heeft(ev2, /TEST:LAADSPANNING/), 'kreeg: ' + ev2.join(', '));
}

// ── 6. koelwater ──────────────────────────────────────────────────
console.log('\n6. Koelwater: 110 °C is een VAG op deellast, 113 °C aanhoudend niet');
{
  const basis = { '0142': 14.1, '010D': 70, '010C': 2100 };
  const ect = (s, n, f) => rij(s, n, t => Object.assign({}, basis, { '0105': f(t) }));
  let s = nieuweApp();
  toets('110 °C geeft geen melding', !heeft(ect(s, 40, () => 110), /ECT_HOOG/));
  s = nieuweApp();
  toets('113 °C gedurende 5 s geeft geen melding', !heeft(ect(s, 30, t => (t < 5 ? 113 : 106)), /ECT_HOOG/));
  s = nieuweApp();
  toets('tegenproef: 113 °C gedurende 30 s geeft wél een melding', heeft(ect(s, 30, () => 113), /TEST:ECT_HOOG/));
  s = nieuweApp();
  toets('tegenproef: 119 °C geeft meteen een melding', heeft(ect(s, 2, () => 119), /TEST:ECT_HOOG/));
}

// ── 7. ernstig in het scherm ──────────────────────────────────────
console.log('\n7. Oververhitting en laadspanning tellen als ernstig in de rit-monitor');
{
  const m = lees('pidlane-totalcheck.js').match(/const _MON_ERNSTIG=(\/.*\/);/);
  if (!m) { console.error('FOUT: _MON_ERNSTIG niet gevonden in pidlane-totalcheck.js'); process.exit(1); }
  const re = new Function('return ' + m[1])();
  toets('TEST:ECT_HOOG is ernstig', re.test('TEST:ECT_HOOG'));
  toets('TEST:LAADSPANNING is ernstig', re.test('TEST:LAADSPANNING'));
  toets('TEST:RPM_CONST is niet ernstig', !re.test('TEST:RPM_CONST'));
}

// ── 8. 👎 Klopt niet ──────────────────────────────────────────────
console.log('\n8. 👎 Klopt niet: bewaard aan het event, lokaal en in de logtabel');
{
  const s = nieuweApp();
  s.PLMon._event('TEST:RPM_CONST', 'test', 'toerental onrustig', null, true);
  toets('onbekende reden wordt geweigerd', s.PLMon.feedback('TEST:RPM_CONST', 'zomaar') === false);
  toets('onbekende melding wordt geweigerd', s.PLMon.feedback('TEST:BESTAATNIET', 'schakelen') === false);
  toets('bekende melding + reden wordt bewaard', s.PLMon.feedback('TEST:RPM_CONST', 'schakelen') === true);
  const ev = s.PLMon.events['TEST:RPM_CONST'];
  toets('het event draagt de reden', ev.feedback && ev.feedback.reden === 'schakelen');
  const L = s.PLMon.feedbackLijst();
  toets('de lokale lijst heeft één regel met code en reden', L.length === 1 && L[0].code === 'TEST:RPM_CONST' && L[0].reden === 'schakelen',
        JSON.stringify(L));
  const r = s._sheets.find(x => x.type === 'melding_feedback');
  toets('de logtabel krijgt Type melding_feedback met Feedback=schakelen en Outcome=vals',
        r && r.ex.Feedback === 'schakelen' && r.ex.Outcome === 'vals', JSON.stringify(s._sheets));
  toets('het rapport zegt dat de bestuurder hem afwees', /KLOPT NIET — ik was aan het schakelen/.test(s.PLMon.summaryText()));
  s.PLMon.feedback('TEST:RPM_CONST', 'bug');
  toets('een app-bug krijgt Outcome=bug', s._sheets.some(x => x.type === 'melding_feedback' && x.ex.Outcome === 'bug'));
}

console.log(fouten ? '\n' + fouten + ' FOUT' : '\nAlles goed.');
process.exit(fouten ? 1 : 0);
