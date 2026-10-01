// ══════════════════════════════════════════════════════════════════
// test-overzicht.js — welke tegels een trendlijn krijgen, en hoe vaak er
//                     getekend wordt (01-10-2026, #302)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Trends, Getallen en Puntjes zijn één weergave geworden: Overzicht. Op de
// telefoon liep de responstijd in Trends in tien minuten op van 43 naar
// 120 ms, met de teken-draden (RenderThread, GPU) bovenaan: elke meetwaarde
// hertekende een trendlijn. Nu krijgen hoogstens vier tegels een lijn, en
// lijnen worden gebundeld getekend.
//
// Wat hier getoetst wordt, op het echte blok uit pidlane-pids.js:
//   1. trendKies(): vast gaat voor, dan wat beweegt; nooit meer dan het
//      maximum; wat stil ligt krijgt geen lijn; een gekozen lijn houdt zijn
//      plek tot een ander duidelijk harder beweegt
//   2. trendWissel(): vastzetten, loslaten, en een vijfde wordt geweigerd
//   3. trendBeweging(): stil is 0, beweging telt tegen het eigen bereik
//   4. de planner: een stortvloed aan meetwaarden geeft één tekenbeurt, een
//      verborgen lijn wordt niet getekend, de kleur alleen bij een wissel
//
// Draaien vanuit public/:  node test-overzicht.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fouten = 0;
function eis(waar, wat, uitleg) {
  if (waar) { console.log('  ok   ' + wat); return; }
  console.log('  FOUT ' + wat + (uitleg ? '\n       ' + uitleg : ''));
  fouten++;
}

const BRON = fs.readFileSync(path.join(__dirname, 'pidlane-pids.js'), 'utf8');
function knip(van, tot) {
  const i = BRON.indexOf(van), j = BRON.indexOf(tot, i);
  if (i < 0 || j < 0) { console.error('FOUT: blok niet te knippen uit pidlane-pids.js — "' + van + '" hernoemd?'); process.exit(1); }
  return BRON.slice(i, j);
}
const SLIM = knip('const SLIM_BEWEEG_DEEL', '\n// De sleepwijzer');
const TREND = knip('// ══ OVERZICHT: WELKE TRENDLIJNEN', '// ── DE TELLERPLAAT');

function laad(opslag) {
  const timers = [];
  const els = {};
  const s = {
    console: { warn: function () {}, log: function () {} },
    JSON: JSON, Math: Math, Date: Date, Object: Object, Array: Array,
    localStorage: {
      d: Object.assign({}, opslag || {}),
      getItem: function (k) { return k in this.d ? this.d[k] : null; },
      setItem: function (k, v) { this.d[k] = String(v); }
    },
    setTimeout: function (f) { timers.push(f); return timers.length; },
    requestAnimationFrame: function (f) { f(); return 1; },
    toasts: [],
    pidHist: {}, activePIDs: new Set(), hiddenPIDs: new Set(), pidViewMode: 'overzicht',
    getPidDef: function (p) { return { '010C': { min: 0, max: 8000 }, '010D': { min: 0, max: 255 }, '0105': { min: -40, max: 215 }, '0111': { min: 0, max: 100 }, '0104': { min: 0, max: 100 }, '010B': { min: 0, max: 255 } }[p] || { min: 0, max: 100 }; },
    document: { getElementById: function (id) { return els[id] || null; } }
  };
  s.showToast = function (t) { s.toasts.push(t); };
  s.window = s;
  s.els = els;
  s.timers = timers;
  s.loop = function () { while (timers.length) timers.shift()(); };
  vm.createContext(s);
  vm.runInContext(SLIM + '\n' + TREND + '\nwindow.__zetModus=function(m){ pidViewMode=m; };', s, { filename: 'pidlane-pids.js (overzicht)' });
  return s;
}
// Een nep-tegel met een lijn: genoeg om klassen te zetten en de tekenbeurten
// en kleurwissels te tellen.
function tegel(s, pid, zichtbaar) {
  const klassen = new Set();
  const lijn = { pts: 0, kleur: 0, attrs: {}, style: {},
    setAttribute: function (k, v) { this.attrs[k] = v; if (k === 'points') this.pts++; },
    getAttribute: function (k) { return k in this.attrs ? this.attrs[k] : null; } };
  Object.defineProperty(lijn.style, 'stroke', { set: function () { lijn.kleur++; }, get: function () { return ''; } });
  lijn.ownerSVGElement = { getClientRects: function () { return zichtbaar === false ? [] : [1]; } };
  s.els['gc-' + pid] = { classList: { contains: function (k) { return klassen.has(k); }, toggle: function (k, aan) { if (aan) klassen.add(k); else klassen.delete(k); } }, klassen: klassen };
  s.els['gs-' + pid] = lijn;
  s.activePIDs.add(pid);
  return lijn;
}
function reeks(s, pid, waarden) { s.pidHist[pid] = waarden.map(function (v, i) { return { t: i, v: v }; }); }

console.log('── 1. trendKies ──');
{
  const s = laad();
  const K = s.PLTrend.kies;
  const kand = [
    { pid: '010C', score: 0.40 }, { pid: '010D', score: 0.30 }, { pid: '0111', score: 0.50 },
    { pid: '0104', score: 0.20 }, { pid: '010B', score: 0.10 }, { pid: '0105', score: 0.001 }
  ];
  const k1 = K(kand, [], [], 4);
  eis(k1.length === 4, 'nooit meer dan het maximum (' + k1.length + ')');
  eis(JSON.stringify(k1) === JSON.stringify(['0111', '010C', '010D', '0104']), 'zonder vastgezette: de vier die het hardst bewegen', k1.join(','));
  eis(k1.indexOf('0105') < 0, 'koelwater dat stil ligt krijgt geen lijn');
  const k2 = K(kand, ['0105', '010B'], [], 4);
  eis(k2[0] === '0105' && k2[1] === '010B' && k2.length === 4, 'vastgezet gaat voor, ook als het stil ligt', k2.join(','));
  const k3 = K(kand, ['0142'], [], 4);
  eis(k3.indexOf('0142') < 0 && k3.length === 4, 'een vastgezette sensor die niet actief is, telt niet mee', k3.join(','));
  const k4 = K([{ pid: '010C', score: 0.30 }, { pid: '010D', score: 0.40 }], [], ['010C'], 1);
  eis(k4[0] === '010C', 'een gekozen lijn houdt zijn plek tegen een iets drukkere', k4.join(','));
  const k5 = K([{ pid: '010C', score: 0.30 }, { pid: '010D', score: 0.60 }], [], ['010C'], 1);
  eis(k5[0] === '010D', 'maar maakt plaats voor een die duidelijk harder beweegt', k5.join(','));
  const k6 = K([{ pid: '0105', score: 0.001 }], [], [], 4);
  eis(k6.length === 0, 'als niets beweegt, krijgt niets een lijn');
}

console.log('── 2. trendWissel ──');
{
  const s = laad();
  ['010C', '010D', '0111', '0104', '010B'].forEach(function (p) { tegel(s, p); });
  eis(s.PLTrend.wissel('010C') === true, 'vastzetten');
  eis(JSON.parse(s.localStorage.d.pl_trendvast)[0] === '010C', 'en bewaard in pl_trendvast');
  eis(s.els['gc-010C'].klassen.has('gc-trend') && s.els['gc-010C'].klassen.has('gc-trend-vast'), 'de tegel krijgt de lijn en het vast-teken');
  s.PLTrend.wissel('010D'); s.PLTrend.wissel('0111'); s.PLTrend.wissel('0104');
  eis(s.PLTrend.wissel('010B') === false && s.toasts.length === 1, 'een vijfde wordt geweigerd, met uitleg', s.toasts.join(' | '));
  eis(s.PLTrend.vast().length === 4, 'er blijven er vier vast');
  eis(s.PLTrend.wissel('010C') === false && s.PLTrend.vast().indexOf('010C') < 0, 'nog eens tikken zet hem los');
  const s2 = laad({ pl_trendvast: JSON.stringify(['010C', '0105']) });
  eis(s2.PLTrend.vast().join(',') === '010C,0105', 'een volgende start leest de vastgezette terug');
  const s3 = laad({ pl_trendvast: '{kapot' });
  eis(s3.PLTrend.vast().length === 0, 'kapotte opslag geeft een lege lijst, geen crash');
}

console.log('── 3. trendBeweging ──');
{
  const s = laad();
  reeks(s, '0105', Array(30).fill(90));
  eis(s.PLTrend.beweging('0105') === 0, 'koelwater op 90, dertig keer: 0');
  reeks(s, '010C', [800, 900, 2500, 3200, 1200, 900, 800]);
  const b = s.PLTrend.beweging('010C');
  eis(Math.abs(b - 2400 / 8000) < 1e-9, 'toerental 800–3200 op 0–8000: 0,30 (' + b + ')');
  reeks(s, '010D', [50, 51]);
  eis(s.PLTrend.beweging('010D') === 0, 'te weinig metingen: 0');
}

console.log('── 4. de planner ──');
{
  const s = laad();
  const zicht = tegel(s, '010C', true);
  const weg = tegel(s, '0105', false);
  reeks(s, '010C', [800, 900, 1000, 1100]);
  reeks(s, '0105', [80, 81, 82, 83]);
  // Ruim 60 meetwaarden in een stortvloed, zoals 21 verzoeken/s × 3 PIDs.
  for (let i = 0; i < 60; i++) { s.sparkVraag('010C', 'ok'); s.sparkVraag('0105', 'ok'); }
  eis(s.timers.length === 1, 'zestig aanmeldingen plannen één tekenbeurt (' + s.timers.length + ')');
  s.loop();
  eis(zicht.pts === 1, 'de zichtbare lijn wordt één keer getekend, niet zestig keer (' + zicht.pts + ')');
  eis(weg.pts === 0, 'een lijn die niet in beeld is, wordt niet getekend');
  eis(zicht.kleur === 1, 'de kleur wordt de eerste keer gezet');
  s.sparkVraag('010C', 'ok'); s.loop();
  eis(zicht.kleur === 1 && zicht.pts === 2, 'dezelfde kleur wordt niet opnieuw gezet (' + zicht.kleur + ')');
  s.sparkVraag('010C', 'warn'); s.loop();
  eis(zicht.kleur === 2, 'een andere status zet de kleur wel');
}

if (fouten) { console.log('FOUT — ' + fouten + ' eis(en) niet gehaald'); process.exit(1); }
console.log('Alles goed — Overzicht kiest hoogstens vier trendlijnen en tekent ze gebundeld');
