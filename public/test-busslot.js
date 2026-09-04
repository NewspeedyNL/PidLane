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

  // ══════════════════════════════════════════════════════════════════
  // DE POORT EROMHEEN (#115) — withBusOfNiets() en withBus(..., 0)
  // ──────────────────────────────────────────────────────────────────
  // Tot 03-09-2026 stond op vijf plekken een eigen PLBus.claim() met een
  // handgeschreven finally eromheen. De vraag die hier getoetst wordt is niet
  // "claimt hij", maar het enige dat een handgeschreven finally fout kan doen:
  // GEEFT HIJ ALTIJD TERUG. Ook als het werk eronder er met een fout
  // uitspringt — want dat is het geval waarin een vergeten release het slot
  // tot het einde van de sessie vasthoudt, buiten élke noodrem van PLBus om
  // (MAX_HOLD_MS breekt hem pas na drie minuten, WACHT_MAX_MS gaat alleen over
  // wachters).
  console.log('\n— de poort om het slot heen (#115) —');
  B.breek('opruimen voor de poorttoets');
  ctx.window._pollBusy = false;

  // ── withBusOfNiets: vrije bus → werk draait, slot komt terug ──
  let liep = 0;
  const uit1 = await ctx.withBusOfNiets('poll', async function () { liep++; return 'klaar'; });
  toets('op een vrije bus draait het werk', [liep, uit1], [1, 'klaar']);
  toets('en het slot is daarna vrij', B.busy(), false);

  // ── withBusOfNiets: bezette bus → werk draait NIET, alsBezet wel ──
  const houder2 = B.claim('survey');
  let liep2 = 0, bezet2 = 0;
  const uit2 = await ctx.withBusOfNiets('poll',
    async function () { liep2++; return 'gemeten'; },
    function () { bezet2++; return 'overgeslagen'; });
  toets('op een bezette bus draait het werk niet', liep2, 0);
  toets('en komt de alsBezet-uitweg terug', [bezet2, uit2], [1, 'overgeslagen']);
  toets('het slot van de ander blijft van de ander', B.owner(), 'survey');
  B.release(houder2);

  // Zonder alsBezet hoort er gewoon undefined uit te komen, geen fout: de
  // pollus en de monitor geven niets terug en mogen daar niet op klappen.
  const houder3 = B.claim('survey');
  toets('zonder alsBezet komt er undefined terug',
    await ctx.withBusOfNiets('poll', async function () { return 'nooit'; }) === undefined, true);
  B.release(houder3);

  // ── DE KERN: een fout in het werk mag het slot niet gijzelen ──
  let geknald = false;
  try { await ctx.withBusOfNiets('poll', async function () { throw new Error('bus-hik'); }); }
  catch (e) { geknald = true; }
  toets('een fout in het werk komt naar buiten', geknald, true);
  toets('maar het slot is tóch teruggegeven', B.busy(), false);

  // ── withBus met wachttijd 0: pakken als het kan, meten hoe dan ook ──
  // Dit is de hersteltik in blok 10 van de testrun. Hij MOET doorgaan als de
  // bus bezet is (anders vallen er metingen weg), maar mag het slot van een
  // ander niet vrijgeven.
  //
  // MET metGrens eromheen, om dezelfde reden als bij de wachtrij hierboven:
  // gaat de nul-afslag in wait() stuk, dan valt deze aanroep terug op de lus
  // van 50 ms — en die loopt op de bevroren testklok nooit af. Dan HANGT deze
  // test in plaats van rood te worden.
  const houder4 = B.claim('poll');
  let liep4 = 0;
  const uit4 = await metGrens(
    ctx.withBus('testrun-snelheid-prik', async function () { liep4++; }, 0), 3000);
  toets('withBus met wachttijd 0 wacht niet', uit4, undefined);
  toets('en meet ook op een bezette bus', liep4, 1);
  toets('en laat het slot bij de eigenaar', B.owner(), 'poll');
  toets('zonder in de rij te gaan staan', B.wachtenden(), []);
  B.release(houder4);

  // Tegenproef: op een vrije bus pakt diezelfde aanroep het slot wél, en geeft
  // het ook weer terug. Anders zou "doe nooit een claim" hierboven ook groen
  // staan.
  let eigenaarTijdens = null;
  await ctx.withBus('testrun-snelheid-prik', async function () { eigenaarTijdens = B.owner(); }, 0);
  toets('op een vrije bus pakt hij het slot wel', eigenaarTijdens, 'testrun-snelheid-prik');
  toets('en geeft het daarna terug', B.busy(), false);

  // ── raak(): lang werk is niet hetzelfde als vastgelopen werk ──
  // MAX_HOLD_MS breekt een houder af die drie minuten niets doet. Dat is een
  // noodrem tegen hangen, maar hij trof óók werk dat legitiem lang duurt: een
  // adresscan over 256 adressen en duizenden identifiers werd halverwege
  // onteigend, met de adapter op een gezet header en zonder dat de scan het
  // merkte. Een houder die zich blijft melden hangt per definitie niet.
  {
    const houder = B.claim('lange-scan');
    toets('de lange houder heeft het slot', B.busy(), true);

    NU += 170000;                                  // bijna drie minuten
    toets('raak() met het juiste token slaagt', B.raak(houder), true);
    toets('een vreemd token raakt niets', B.raak(houder + 99), false);

    NU += 170000;                                  // samen ruim boven MAX_HOLD_MS
    // Zonder raak() zou de noodrem hier toeslaan. Mét raak() telt de klok vanaf
    // de laatste melding, dus een nieuwe aanvrager komt er NIET tussen.
    toets('een verversende houder wordt niet onteigend', B.claim('indringer'), 0);
    toets('en houdt het slot gewoon', B.owner(), 'lange-scan');

    // Tegenproef: houdt hij op met melden, dan grijpt de noodrem alsnog. Zonder
    // deze helft zou "raak() werkt" ook groen staan als de noodrem helemaal weg
    // was — en dan is een écht vastgelopen houder onsterfelijk.
    NU += 200000;
    const na = B.claim('indringer2');
    toets('wie stopt met melden wordt na drie minuten alsnog afgebroken', na > 0, true);
    toets('en het slot is dan van de nieuwe houder', B.owner(), 'indringer2');
    B.release(na);
  }

  // ── en blijft het bij ÉÉN vorm? ──
  // De winst van #115 verdampt zodra er ergens weer een eigen claim met een
  // handgeschreven finally bijkomt: alles hierboven blijft dan groen, want het
  // toetst de helper en niet zijn gebruikers. Dit is de enige toets die dát
  // merkt — dezelfde soort vormcontrole als de bedradingscontrole.
  // Regels die met // of * beginnen tellen niet mee: er staat op drie plekken
  // commentaar OVER PLBus.claim, en dat is geen aanroep.
  const eigenClaims = fs.readdirSync(__dirname)
    .filter(function (f) { return /^pidlane-.*\.js$/.test(f) && f !== 'pidlane-data.js'; })
    .filter(function (f) {
      return fs.readFileSync(__dirname + '/' + f, 'utf8').split('\n')
        .filter(function (r) { return !/^\s*(\/\/|\*|\/\*)/.test(r); })
        .some(function (r) { return /PLBus\s*\.\s*claim\s*\(/.test(r); });
    });
  toets('alleen pidlane-data.js claimt het slot zelf (#115)', eigenClaims, []);

  console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
  process.exit(fout ? 1 : 0);
})();
