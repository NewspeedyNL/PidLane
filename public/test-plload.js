// test-plload.js — toetst of de belasting-regeling nog uit de dode zone komt
// én of de ingreep van 23-08-2026 doet wat hij belooft.
//
// ── WAAROM HET PLANTMODEL OP 23-08 IS HERZIEN ──────────────────────
// De vorige versie hield `venGemMs` vast op 105 ms, hoe vol de bus ook
// stond. Dat model paste bij de oude regeling, die alleen naar bezetting
// keek: responstijd deed er toch niet toe.
//
// Sinds 23-08 telt bezetting alleen mee mét een tweede signaal — een
// responstijd die oploopt of al boven `traagMs` zit. Met een vlakke
// responstijd is er dan per definitie nooit tegendruk, en zakt de regeling
// door tot MIN bij 100% bezetting. Dat is geen fout in de regeling maar een
// model dat de werkelijkheid niet meer nabootst: bezetting ÍS aanvraagtempo
// × responstijd, dus een bus die echt volloopt antwoordt trager. Een model
// waarin dat niet gebeurt beschrijft geen bus.
//
// Het model hieronder koppelt die twee, geijkt op het veldlog van 23-08:
//   • tot ~88% bezet  → ~100 ms   (gemeten: 85-87% bij 97-101 ms)
//   • daarboven steil op tot ~630 ms bij 100%
//     (gemeten tijdens de cascade van 12:19: 600-700 ms)
//
// Draaien vanuit public/:  node test-plload.js
'use strict';
const fs = require('fs');
const vm = require('vm');

let NU = 1785600000000;
const gelogd = [];
const ctx = {
  console,
  Date: new Proxy(Date, { get: (t, p) => p === 'now' ? (() => NU) : t[p] }),
  connected: true, demoMode: false,
  btDiag: (m, s) => gelogd.push(String(m)),
  PID_POLL_CLASS: {}, _focusPIDs: new Set(), _pollMult: 1,
  setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {}
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-plload.js', 'utf8'), ctx, { filename: 'pidlane-plload.js' });
const L = ctx.PLLoad;

// ── Plantmodel ─────────────────────────────────────────────────────
// 403 volgt uit het meetpunt van 01-08-2026: 67% bezetting bij mult 6
// (67 x 6 = 403). Bezetting is omgekeerd evenredig met mult.
const IJK = 403;
const KNIK = 85;          // tot hier antwoordt de bus gewoon (= bezetOp)
const BASIS_MS = 105;     // responstijd in rust, gemeten
const VOL_MS = 630;       // responstijd bij 100% bezet, gemeten in de cascade

function bezetting(mult) { return Math.min(100, Math.round(IJK / mult)); }

// Responstijd volgt de bezetting: vlak tot de knik, daarna convex omhoog.
// Dit is de koppeling die het oude model miste. Bewust een derde macht en
// geen rechte lijn: met een rechte lijn is de knik een KLIF, springt de
// responstijd bij de eerste stap eroverheen met tientallen procenten, en
// leest de regeling dat als tegendruk terwijl er niets aan de hand is. Een
// echte wachtrij loopt vloeiend op. Geijkt op 23-08: 87% -> ~106 ms,
// 93% -> ~184 ms, 97% -> ~374 ms, 100% -> 630 ms.
function respons(bezet) {
  if (bezet <= KNIK) return BASIS_MS;
  const f = Math.pow((bezet - KNIK) / (100 - KNIK), 3);
  return Math.round(BASIS_MS + f * (VOL_MS - BASIS_MS));
}

function draai(ticks, opts) {
  opts = opts || {};
  for (let i = 0; i < ticks; i++) {
    NU += L.cfg.tickMs;
    const b = (opts.belasting !== undefined) ? opts.belasting : bezetting(L._mult);
    const ms = (opts.venGemMs !== undefined) ? opts.venGemMs : respons(b);
    ctx.PLBus = { stats: () => ({ belasting: b, foutPct: opts.foutPct || 0,
                                  venGemMs: ms, perSec: 6.4, onvolPct: 0 }) };
    L.tick();
  }
}

let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (!ok) { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + JSON.stringify(gemeten) + ', verwacht ' + JSON.stringify(verwacht)); }
  else console.log('  ok    ' + naam);
}

console.log('\n— de situatie van 01-08-2026: vast op MAX —');
{
  L.reset(); L._mult = 6.0;
  toets('startpunt is MAX', L._mult, 6.0);
  toets('bezetting valt in de dode zone', bezetting(6.0), 67);
  toets('tempo staat op 17%', L.staat().tempoPct, 17);
  draai(150);                                   // vijf minuten
  console.log('        na 5 min: mult ' + L._mult + ', tempo ' + L.staat().tempoPct + '%');
  toets('komt los van MAX', L._mult < 6.0, true);
  toets('tempo is toegenomen', L.staat().tempoPct > 17, true);
}

console.log('\n— hij stopt bij de echte grens, niet bij MIN —');
{
  draai(400);
  const eind = L._mult;
  const b = bezetting(eind);
  console.log('        evenwicht: mult ' + eind + ' bij bezetting ' + b + '% en ' + respons(b) + ' ms');
  toets('zakt niet door naar MIN', eind > 1.0, true);
  toets('bezetting blijft onder de 100%', b < 100, true);
  draai(200);
  toets('blijft stabiel', Math.abs(L._mult - eind) < 1.0, true);
}

/* ── DE KERN VAN DE INGREEP VAN 23-08 ──────────────────────────────
   Twee gevallen uit hetzelfde veldlog, allebei met een hoge bezetting.
   De oude regeling behandelde ze identiek en verlaagde in beide. Het
   verschil zit in de responstijd, en dat is wat er nu wordt meegewogen.
   Deze twee horen bij elkaar: zonder het tweede bewijst het eerste niets,
   want "verlaagt niet" is ook waar voor een regeling die niets meer doet. */
console.log('\n— bezetting alleen is geen tegendruk (23-08) —');
{
  L.reset(); gelogd.length = 0;
  // 11:37 in het veldlog: 85-87% bezet, 97-101 ms. Vlak, dus geen opbouw.
  draai(1, { belasting: 86, foutPct: 0, venGemMs: 97 });
  draai(4, { belasting: 87, foutPct: 0, venGemMs: 101 });
  toets('vlakke responstijd bij 87% bezet verlaagt niet', L._mult, 1.0);
  toets('en meldt zich in de log',
        gelogd.some(m => /vastgehouden/.test(m)), true);
}

console.log('\n— tegendruk wint nog steeds meteen —');
{
  L.reset(); gelogd.length = 0;
  // 12:19 in het veldlog: bezetting hoog en de adapter loopt achter.
  draai(1, { belasting: 95, foutPct: 0, venGemMs: 650 });
  toets('een drukke tick schroeft direct terug', L._mult, 1.35);
  draai(3, { belasting: 95, foutPct: 0, venGemMs: 650 });
  toets('blijft oplopen onder druk', L._mult > 2.0, true);
  draai(1, { belasting: 60, foutPct: 30 });
  toets('foutgraad telt als druk', L._mult > 3.0, true);
}

console.log('\n— een OPLOPENDE responstijd telt ook, nog vóór traagMs —');
{
  L.reset();
  draai(1, { belasting: 90, foutPct: 0, venGemMs: 150 });   // referentie
  toets('eerste tick doet niets', L._mult, 1.0);
  draai(1, { belasting: 90, foutPct: 0, venGemMs: 260 });   // +73%, ruim boven venStijgFactor
  toets('opbouw onder traagMs telt als tegendruk', L._mult, 1.35);
}

console.log('\n— aftasten alleen als het echt rustig is —');
{
  L.reset(); L._mult = 4.0;
  draai(20, { belasting: 70, foutPct: 8, venGemMs: 105 });     // fouten boven kalmFoutPct
  toets('geen terugloop bij verhoogde foutgraad', L._mult, 4.0);
  draai(20, { belasting: 70, foutPct: 0, venGemMs: 600 });     // adapter buffert
  toets('geen terugloop als de adapter achterloopt', L._mult, 4.0);
  draai(20, { belasting: 70, foutPct: 0, venGemMs: 105 });
  toets('wel terugloop als alles rustig is', L._mult < 4.0, true);
}

console.log('\n— de trage terugloop komt in de log —');
{
  gelogd.length = 0;
  L.reset(); L._mult = 6.0;
  draai(200);
  toets('minstens een logregel over de terugloop',
        gelogd.some(m => /stapsgewijs verhoogd/.test(m)), true);
}

console.log('\n— losgekoppeld / demo blijft ongemoeid —');
{
  L.reset(); L._mult = 5.0;
  ctx.connected = false;
  draai(1);
  toets('los: terug naar 1.0', L._mult, 1.0);
  ctx.connected = true;
}

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
