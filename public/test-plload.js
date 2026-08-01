// test-plload.js — toetst of de belasting-regeling nog uit de dode zone komt.
// Gebruikt een plantmodel dat op het gemeten werkpunt van 01-08-2026 is
// geijkt: 40 PIDs, ~105 ms per commando, bij mult 6 een bezetting van 67%.
// Bezetting is aanvraagtempo × responstijd, dus omgekeerd evenredig met mult.
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
// 403 volgt uit het meetpunt: 67% bezetting bij mult 6 (67 × 6 ≈ 403).
const IJK = 403;
function bezetting(mult) { return Math.min(100, Math.round(IJK / mult)); }
function draai(ticks, opts) {
  opts = opts || {};
  for (let i = 0; i < ticks; i++) {
    NU += L.cfg.tickMs;
    const b = (opts.belasting !== undefined) ? opts.belasting : bezetting(L._mult);
    ctx.PLBus = { stats: () => ({ belasting: b, foutPct: opts.foutPct || 0,
                                  venGemMs: opts.venGemMs || 105, perSec: 6.4, onvolPct: 0 }) };
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
  console.log('        evenwicht: mult ' + eind + ' bij bezetting ' + bezetting(eind) + '%');
  toets('zakt niet door naar MIN', eind > 1.0, true);
  toets('bezetting blijft onder de 100%', bezetting(eind) < 100, true);
  toets('bezetting landt rond bezetOp', Math.abs(bezetting(eind) - L.cfg.bezetOp) <= 6, true);
  draai(200);
  toets('blijft stabiel', Math.abs(L._mult - eind) < 1.0, true);
}

console.log('\n— tegendruk wint nog steeds meteen —');
{
  L.reset();
  draai(1, { belasting: 95, foutPct: 0 });
  toets('één drukke tick schroeft direct terug', L._mult, 1.35);
  draai(3, { belasting: 95, foutPct: 0 });
  toets('blijft oplopen onder druk', L._mult > 2.0, true);
  draai(1, { belasting: 60, foutPct: 30 });
  toets('foutgraad telt als druk', L._mult > 3.0, true);
}

console.log('\n— aftasten alleen als het écht rustig is —');
{
  L.reset(); L._mult = 4.0;
  draai(20, { belasting: 70, foutPct: 8 });     // fouten boven kalmFoutPct
  toets('geen terugloop bij verhoogde foutgraad', L._mult, 4.0);
  draai(20, { belasting: 70, foutPct: 0, venGemMs: 600 });  // adapter buffert
  toets('geen terugloop als de adapter achterloopt', L._mult, 4.0);
  draai(20, { belasting: 70, foutPct: 0, venGemMs: 105 });
  toets('wel terugloop als alles rustig is', L._mult < 4.0, true);
}

console.log('\n— de trage terugloop komt in de log —');
{
  gelogd.length = 0;
  L.reset(); L._mult = 6.0;
  draai(200);
  toets('minstens één logregel over de terugloop',
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
