// test-busslot.js — de noodremmen van PLBus (pidlane-data.js).
//
// Twee dingen die op elkaar lijken maar niet dezelfde dekking hadden:
//   MAX_HOLD_MS    een houder MÉT eigenaar die blijft hangen → wordt afgebroken
//   LEGACY_MAX_MS  window._pollBusy zonder eigenaar → had GEEN noodrem, en
//                  zette de bus dus permanent dicht. Precies het geval waarvoor
//                  de hang-detectie bestaat, en juist daar greep hij niet.
//
// Draaien vanuit public/:  node test-busslot.js   (exit 0 = goed)
'use strict';
const fs = require('fs');
const vm = require('vm');

let NU = 1785600000000;
const ctx = {
  console,
  Date: new Proxy(Date, { get: (t, p) => p === 'now' ? (() => NU) : t[p] }),
  Math, JSON, Object, Array, String, Number, Promise, setTimeout,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  btDiag() {}
};
ctx.window = ctx;
vm.createContext(ctx);

// pidlane-data.js in z'n geheel laden: PLBus zit in een IIFE en is alleen via
// window bereikbaar. De rest van het bestand zijn tabellen zonder bijwerkingen.
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-data.js', 'utf8'), ctx, { filename: 'pidlane-data.js' });
const B = ctx.PLBus;

let fout = 0;
function toets(naam, gemeten, verwacht) {
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (ok) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + ' — kreeg ' + JSON.stringify(gemeten) + ', verwacht ' + JSON.stringify(verwacht)); }
}

console.log('PLBus — busslot en noodremmen\n');

// ── gewoon slotgedrag ──
const t1 = B.claim('poll');
toets('eerste claim lukt', t1 > 0, true);
toets('tweede claim faalt zolang de eerste houdt', B.claim('survey'), 0);
toets('vreemd token geeft niets vrij', B.release(t1 + 999), false);
toets('eigen token geeft wél vrij', B.release(t1), true);
toets('daarna kan een ander claimen', B.claim('survey') > 0, true);
B.breek('opruimen');

// ── noodrem 1: houder mét eigenaar die blijft hangen ──
const t2 = B.claim('survey');
toets('houder claimt', t2 > 0, true);
NU += B.MAX_HOLD_MS + 1000;
toets('na MAX_HOLD_MS breekt een ander de hangende houder open', B.claim('poll') > 0, true);
B.breek('opruimen');

// ── noodrem 2: verweesde _pollBusy zonder eigenaar ──
ctx.window._pollBusy = true;           // legacy-module zet 'm en ruimt niet op
toets('verweesde _pollBusy blokkeert eerst', B.claim('poll'), 0);
NU += 2000;
toets('en blijft binnen de noodremtijd blokkeren', B.claim('poll'), 0);
NU += B.LEGACY_MAX_MS + 1000;
toets('na LEGACY_MAX_MS wordt de verweesde vlag genegeerd', B.claim('poll') > 0, true);
toets('en is de vlag ook echt gewist, niet omzeild', ctx.window._pollBusy, true); // claim zet 'm zelf weer aan als eigenaar
B.breek('opruimen');
toets('na breek staat _pollBusy uit', ctx.window._pollBusy, false);

// ── de noodremtijd begint pas bij het signaleren, niet bij nul ──
// Anders zou een vlag die net is gezet meteen als "hangt al 10s" gelden.
ctx.window._pollBusy = true;
toets('nieuwe verweesde vlag blokkeert direct', B.claim('poll'), 0);
NU += 1000;
toets('en na 1s nog steeds', B.claim('poll'), 0);
NU += B.LEGACY_MAX_MS;
toets('pas ná de volle noodremtijd komt hij erdoor', B.claim('poll') > 0, true);
B.breek('opruimen');
ctx.window._pollBusy = false;

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
