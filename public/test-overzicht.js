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

// ══════════════════════════════════════════════════════════════════
// Overzicht per categorie (#439): de echte functies, op de echte tabel uit
// pidlane-data.js. Geen eigen grenzen verzinnen: koelwater is wat de app
// zegt dat koelwater is.
// ══════════════════════════════════════════════════════════════════
console.log('\nOverzicht per categorie (#439)');
{
  const c = { console: { warn() {}, log() {} } };
  c.window = c; c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-data.js'), 'utf8'), c, { filename: 'pidlane-data.js' });
  c.localStorage = { d: {}, getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = String(v); } };
  c.getPidDef = (p) => c.ALL_PID_DEFS[p] || null;
  vm.runInContext(knip('const _FV_DEC', '\n// ── PID weergavemodus') + '\n' + knip('// ══ OVERZICHT PER CATEGORIE', '\nfunction applyG(pid,val){') + '\nwindow.OVZ_CATS = OVZ_CATS;', c, { filename: 'pidlane-pids.js (ovz)' });
  const D = (p) => c.ALL_PID_DEFS[p];

  // Categorieën
  eis(c.ovzCat(D('0105'), '0105') === 'temp', 'koelwater is een temperatuur');
  eis(c.ovzCat(D('010F'), '010F') === 'temp', 'inlaatlucht staat bij de temperaturen, ook al zegt de definitie Motor', D('010F').cat);
  eis(c.ovzCat(D('0142'), '0142') === 'elektrisch' && c.ovzCat(D('015B'), '015B') === 'elektrisch', 'accu en aandrijfaccu zijn elektrisch');
  eis(c.ovzCat(D('0124'), '0124') === 'uitlaat', 'lambda staat bij uitlaat en emissie');
  eis(c.ovzCat(null, 'XXXX') === 'overig' && c.ovzCat({ cat: 'Iets' }, 'X') === 'overig', 'onbekend valt in Overig');

  // Volgorde per aandrijving
  const v = (m) => c.ovzVolgorde(m).join(',');
  eis(v('benzine').indexOf('rijden,motor,temp,brandstof,uitlaat,elektrisch') === 0, 'benzine: motor voor elektrisch', v('benzine'));
  eis(v('diesel') === v('benzine'), 'diesel: dezelfde volgorde');
  eis(c.ovzVolgorde('hybride').indexOf('elektrisch') === 1 && c.ovzVolgorde('hybride').indexOf('motor') === 2, 'hybride: elektrisch direct na rijden, motor erna', v('hybride'));
  eis(c.ovzVolgorde('ev').slice(-2).join() === 'brandstof,uitlaat', 'EV: brandstof en uitlaat achteraan', v('ev'));
  ['benzine', 'diesel', 'hybride', 'ev'].forEach((m) => {
    const l = c.ovzVolgorde(m), u = new Set(l);
    eis(u.size === l.length && Object.keys(c.OVZ_CATS).every((k) => u.has(k)), m + ': elke categorie precies één keer');
  });

  // De band
  let b = c.ovzBand(D('0105'), 87);
  eis(b.heeft && b.z0 === 0 && b.z1 > 50 && b.z1 < 100, 'koelwater: groen tot de waarschuwingsgrens', JSON.stringify(b));
  eis(b.pos > 70 && b.pos < b.z1, '87 °C staat in het groen, niet tegen de rand', JSON.stringify(b));
  b = c.ovzBand(D('0105'), 108);
  eis(b.pos > b.z1, '108 °C staat voorbij het groen');
  b = c.ovzBand(D('0106'), 0);
  eis(b.heeft && Math.abs(b.pos - 50) < 0.01 && b.z0 > 0 && b.z1 < 100, 'trim: groen rond nul, nul in het midden', JSON.stringify(b));
  b = c.ovzBand(D('0142'), 14.1);
  eis(b.heeft && b.z0 > 0 && b.z1 === 100, 'accu: alleen een ondergrens, groen tot de rand', JSON.stringify(b));
  b = c.ovzBand(D('010B'), 96);
  eis(!b.heeft, 'inlaatdruk: geen grens bekend, dus geen groen vlak');
  b = c.ovzBand(D('010C'), 99999);
  eis(b.pos === 100, 'een gekke waarde blijft op de schaal');
  eis(c.ovzBand(D('010C'), null).pos === null && c.ovzBand(D('010C'), 'x').pos === null, 'geen waarde: geen streepje');

  // De opmerking
  eis(c.ovzNoot(D('0105'), 108, 'warn') === 'Boven de waarschuwingsgrens van 100 °C', 'koelwater te warm', c.ovzNoot(D('0105'), 108, 'warn'));
  eis(c.ovzNoot(D('0142'), 11.2, 'warn') === 'Onder de waarschuwingsgrens van 11.50 V', 'accu laag, met de decimalen van volt', c.ovzNoot(D('0142'), 11.2, 'warn'));
  eis(c.ovzNoot(D('0105'), 87, 'ok') === '', 'normaal: geen opmerking');
  eis(/gevarengrens/.test(c.ovzNoot(D('0105'), 120, 'danger')), 'boven de gevarengrens heet het zo', c.ovzNoot(D('0105'), 120, 'danger'));

  // De kop
  eis(c.ovzKop(0, 0).tekst === 'normaal' && c.ovzKop(2, 0).tekst === '2 let op' && c.ovzKop(2, 0).kl === 'or', 'kop: normaal of N let op');
  eis(c.ovzKop(1, 1).kl === 'rd' && /gevaar/.test(c.ovzKop(1, 1).tekst), 'gevaar wint van let op');

  // De volgorde binnen een categorie
  const ord = {};
  eis(c.ovzSorteer(['0111', '0104', '010C'], {}, ord).join() === '010C,0104,0111', 'belangrijkste eerst: toerental, belasting, gasklep');
  eis(c.ovzSorteer(['010C', '0104', '0111'], { '0111': 'warn' }, ord).join() === '0111,010C,0104', 'een afwijkende sensor gaat bovenaan');
  eis(c.ovzSorteer(['010C', '0104', '0111'], { '0111': 'warn', '0104': 'danger' }, ord)[0] === '0104', 'gevaar boven let op');
  eis(c.ovzRang('ZZZZ', { ZZZZ: 3 }) > c.ovzRang('0142', {}), 'onbekend komt na de vaste rang, in keuzelijstvolgorde');

  // Namen
  eis(c.ovzNaam('0106', D('0106')) === 'Trim kort B1' && c.ovzNaam('0107', D('0107')) === 'Trim lang B1', 'drie brandstofrijen zijn uit elkaar te houden');
  eis(c.ovzNaam('XXXX', { name: 'Iets anders' }) === 'Iets anders', 'zonder korte naam: de eigen naam');

  // Dichtheid
  eis(c.ovzDichtLees() === 'compact', 'standaard compact');
  c.localStorage.d.pl_ovz_dicht = 'ruim';
  eis(c.ovzDichtLees() === 'ruim', 'ruim wordt teruggelezen');
  c.localStorage.d.pl_ovz_dicht = 'onzin';
  eis(c.ovzDichtLees() === 'compact', 'rommel: compact');
}

if (fouten) { console.log('FOUT — ' + fouten + ' eis(en) niet gehaald'); process.exit(1); }
console.log('Alles goed — Overzicht kiest hoogstens vier trendlijnen, tekent ze gebundeld, en deelt in per categorie');
