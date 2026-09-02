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

// ══════════════════════════════════════════════════════════════════
// DE WACHTRIJ (#98) — verhongert een wachter op een drukke bus?
// ──────────────────────────────────────────────────────────────────
// Gemeten in de rit van 02-09 22:15, de eerste met vier aanvragers: de sweep
// kreeg het busslot in 8 seconden niet en mat daarna náást de pollus — 1250 ms
// per PID in plaats van 200, en de sweep duurde 73 s in plaats van 12.
//
// DE OORZAAK IS GEEN TE KORTE WACHTTIJD. wait() kijkt elke 50 ms of het slot
// vrij is; de pollus geeft het vrij en pakt het in dezelfde tel weer terug. Het
// slot is dan een paar milliseconden vrij en de wachter kijkt er net naast.
// Langer wachten maakt de kans groter, niet zeker. Wie in de rij staat hoort de
// eerstvolgende beurt te krijgen — dat is wat hier getoetst wordt.
//
// Deze sectie draait ECHT async: wait() gebruikt een echte setTimeout van 50 ms
// en dat is precies het gedrag dat op het spel staat.
(async function () {
  // MET EEN HARDE GRENS EROMHEEN. wait() draait op de bevroren testklok, dus
  // zijn eigen vervaltijd loopt nooit af: raakt de wachtrij stuk, dan wacht hij
  // eeuwig en HANGT deze test in plaats van rood te worden. Een hangende test
  // is erger dan een falende — plmutate wacht er net zo lang op, en in CI ziet
  // niemand het verschil met een trage runner. Vandaar een echte klok ernaast.
  const metGrens = function (belofte, ms) {
    return Promise.race([belofte, new Promise(function (r) { setTimeout(function () { r('TIJD-OP'); }, ms); })]);
  };

  console.log('\n— de wachtrij op het busslot (#98) —');
  B.breek('opruimen voor de wachtrijtoets');
  ctx.window._pollBusy = false;

  // TEGENPROEF EERST. Zonder wachters hoort de pollus gewoon te mogen; anders
  // zou "weiger altijd" deze hele sectie ook groen krijgen.
  const vrij = B.claim('poll');
  toets('zonder wachters claimt de pollus gewoon', vrij > 0, true);
  toets('en de rij is dan leeg', B.wachtenden(), []);

  // De pollus houdt het slot; de sweep meldt zich netjes aan.
  const p = B.wait('testrun-sweep', 60000);
  toets('de wachter staat in de rij', B.wachtenden(), ['testrun-sweep']);
  toets('de pollus krijgt geen nieuwe beurt zolang er iemand wacht', B.claim('poll'), 0);
  toets('en een andere losse claim ook niet', B.claim('waakronde'), 0);

  // Vrijgeven. Dit is het moment waarop het vroeger misging: de pollus pakte
  // hem hier meteen weer terug.
  B.release(vrij);
  toets('ook nu het slot vrij is, gaat de pollus niet voor', B.claim('poll'), 0);

  const tok = await metGrens(p, 3000);
  toets('de wachter krijgt het slot', typeof tok === 'number' && tok > 0, true);
  toets('en is daarna uit de rij', B.wachtenden(), []);
  if (typeof tok === 'number') B.release(tok);
  B.breek('opruimen na de wachtrijtoets');
  ctx.window._pollBusy = false;
  toets('daarna mag de pollus weer', B.claim('poll') > 0, true);
  B.breek('opruimen');
  ctx.window._pollBusy = false;

  // ── de noodrem: een wachter die zijn beurt nooit pakt ──
  // Zonder deze grens zou één module die zich misdraagt de bus kunnen
  // gijzelen — dezelfde fout die de verweesde _pollBusy hierboven maakte.
  console.log('\n— en de noodrem eronder —');
  // Iemand ANDERS houdt het slot, anders pakt het spook het meteen en staat er
  // niemand in de rij — dan toetst deze sectie niets.
  const houder = B.claim('waakronde');
  const spook = B.wait('spook', 5000);
  toets('het spook staat in de rij', B.wachtenden(), ['spook']);
  B.release(houder);
  // Vanaf hier is het slot vrij en is de rij de enige reden dat de pollus
  // wacht. Alles hieronder loopt in dezelfde tel, dus de 50 ms-timer van het
  // spook kan er niet tussen komen.
  toets('en remt de pollus af zodra het slot vrij is', B.claim('poll'), 0);
  NU += B.WACHT_MAX_MS + 1000;
  const na = B.claim('poll');
  toets('na WACHT_MAX_MS wordt de wachter vergeten', na > 0, true);
  toets('en is hij uit de rij gehaald', B.wachtenden(), []);
  // Het slot blijft bij de pollus tot het spook zijn beurt heeft gehad. Geven we
  // het eerder vrij, dan PAKT het spook hem alsnog — wait() kijkt eerst of het
  // slot vrij is en pas daarna naar zijn eigen vervaltijd. Dat is bestaand en
  // verdedigbaar gedrag (een slot dat je hebt, weiger je niet), maar het maakt
  // deze toets stil groen als je er niet op let.
  toets('het spook geeft zelf 0 terug', await metGrens(spook, 3000), 0);
  B.release(na);

  console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
  process.exit(fout ? 1 : 0);
})();
