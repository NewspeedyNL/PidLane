// ══════════════════════════════════════════════════════════════════
// test-proeftegoed.js — het tegoed komt van de server, niet van het toestel
// ──────────────────────────────────────────────────────────────────
// DE FOUT (#49). saldo() in pidlane-credits.js deelde CFG.gratisStart (25)
// uit zodra de localStorage-sleutel ontbrak. App-gegevens wissen was daarmee
// een knop die onbeperkt nieuwe tokens gaf. Zolang de Worker het echte saldo
// bijhoudt was dat onschadelijk — maar credits zijn nu het enige verdienmodel,
// en dan is een tweede plek die tegoed uitdeelt het grootste gat.
//
// De fix is niet "deel minder uit" maar "deel niets uit": het proeftegoed
// hangt aan het account (handleKlantOnboarding in worker.js, KLANT_START_SALDO
// + StartTegoedGegeven) en localStorage is nog slechts een afschrift.
//
// DAT LEVERT EEN DERDE TOESTAND OP, en die is de kern van deze test. Naast
// "zoveel tokens" en "nul tokens" bestaat nu ONBEKEND: dit toestel heeft nog
// geen saldo van de server gezien. Zou onbekend als nul gelezen worden, dan
// blokkeert de app elke analyse op een getal dat de client zelf verzon — een
// fix die het gat dicht en de app onbruikbaar maakt.
//
// WAAROM DIT EEN GEDRAGSTEST IS EN GEEN BRONCONTROLE
// De vraag is niet of het woord gratisStart nog in het bestand staat, maar
// wat er met de opslag gebeurt als je saldo() aanroept en wat preflight()
// daarna besluit. Dat is alleen te zien door de module te draaien.
//
// Draaien vanuit public/:  node test-proeftegoed.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── De module in een leeg toestel zetten ──────────────────────────
// pidlane-credits.js is een IIFE die zichzelf aan window hangt. Hij raakt bij
// het laden localStorage aan (de saldochip) — juist dat willen we meten, dus
// de opslag is een echt object waar we in kunnen kijken.
function laad() {
  const opslag = {};
  global.localStorage = {
    getItem: (k) => (k in opslag ? opslag[k] : null),
    setItem: (k, v) => { opslag[k] = String(v); },
    removeItem: (k) => { delete opslag[k]; }
  };
  global.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

  // DOM-stub. Ruim genoeg voor de saldochip en het kostenvenster: elke
  // querySelector geeft een knop terug, zodat _sheet() zijn handlers kwijt
  // kan en niet halverwege omvalt. Het venster sluiten we via
  // window._plCredDismiss(), de handle die de module zelf achterlaat.
  const knop = () => ({ onclick: null, style: {}, checked: false });
  global.document = {
    readyState: 'complete',
    getElementById: () => null,
    addEventListener() {},
    createElement: () => ({
      id: '', className: '', innerHTML: '', style: {},
      appendChild() {}, querySelector: knop, onclick: null
    }),
    body: { appendChild() {} },
    querySelector: knop
  };
  global.window = {};
  global.fetch = () => Promise.reject(new Error('geen net in de test'));

  eval(fs.readFileSync(__dirname + '/pidlane-credits.js', 'utf8'));
  return { PLC: global.window.PLCredits, opslag: opslag };
}

console.log('1. Een vers toestel heeft geen tegoed en beweert dat ook niet');
{
  const { PLC, opslag } = laad();
  toets('saldoBekend() bestaat', typeof PLC.saldoBekend === 'function');
  toets('het saldo geldt als onbekend', PLC.saldoBekend() === false,
        'saldoBekend() geeft ' + PLC.saldoBekend());
  toets('saldo() geeft 0 en geen proeftegoed', PLC.saldo() === 0,
        'saldo() geeft ' + PLC.saldo() + ' — de client deelt weer tegoed uit');

  // DE TEGENPROEF OP HET LEK ZELF. De oude saldo() schreef bij een ontbrekende
  // sleutel meteen twee sleutels weg (pl_credits_saldo met 25 erin, en
  // pl_credits_init). Blijft de opslag na een leesactie leeg, dan is er niets
  // uitgedeeld. Zet gratisStart terug en deze regel wordt rood.
  toets('lezen schrijft niets weg', Object.keys(opslag).length === 0,
        'opslag na saldo(): ' + JSON.stringify(opslag));
}

console.log('\n2. Wissen levert nooit nieuw tegoed op, hoe vaak je het ook doet');
{
  const { PLC, opslag } = laad();
  PLC.zetServerSaldo(40);
  toets('na de server is het saldo bekend', PLC.saldoBekend() === true && PLC.saldo() === 40,
        'saldo() geeft ' + PLC.saldo());
  toets('en het staat als afschrift in de opslag', opslag[PLC.CFG.lsSaldo] === '40',
        'opslag: ' + JSON.stringify(opslag[PLC.CFG.lsSaldo]));

  // Vijf keer "app-gegevens wissen". Het werkgeheugen gaat mee weg, want dat
  // is wat een herstart doet.
  let totaal = 0;
  for (let i = 0; i < 5; i++) {
    Object.keys(opslag).forEach((k) => { delete opslag[k]; });
    const { PLC: vers } = laad();
    totaal += vers.saldo();
  }
  toets('vijf keer wissen levert 0 tokens op', totaal === 0,
        'samen ' + totaal + ' tokens uitgedeeld');
}

console.log('\n3. Uitloggen maakt het saldo onbekend, niet nul');
{
  const { PLC, opslag } = laad();
  PLC.zetServerSaldo(120);
  PLC.vergeetKlant();
  toets('het saldo van de vorige gebruiker is weg', PLC.saldo() !== 120,
        'saldo() geeft nog ' + PLC.saldo());
  toets('en geldt als onbekend', PLC.saldoBekend() === false,
        'saldoBekend() geeft ' + PLC.saldoBekend());
  toets('de saldosleutel staat niet meer in de opslag',
        opslag[PLC.CFG.lsSaldo] === undefined,
        'opslag: ' + JSON.stringify(opslag[PLC.CFG.lsSaldo]));
}

// ── preflight: het besluit dat op het saldo rust ──────────────────
// Dit is de helft die een te enthousiaste fix stukmaakt. Onbekend mag niet
// blokkeren; bekend-en-te-weinig moet dat juist wel.
//
// De aanroepen hieronder zetten PLC.stil(true) — dat is de checkbox "niet meer
// vragen deze sessie". Zonder dat toont preflight bij deze omvang eerst het
// gewone kostenvenster, en dan meet de test of er een venster verschijnt in
// plaats van waar het om gaat: het besluit over het tegoed. De
// onvoldoende-tegoed-route trekt zich van die vlag niets aan en toont zijn
// venster altijd — precies het verschil dat deel 4 en 5 uit elkaar houdt.
function preflightUitkomst(PLC, tekens) {
  const prompt = 'x'.repeat(tekens);
  const p = PLC.preflight(prompt, 'systeem', 2048, 'claude-sonnet-5')
    .then((r) => ({ door: true, res: r }), (e) => ({ door: false, fout: e }));
  // Staat er een kostenvenster open, dan wachten we daar eeuwig op. De module
  // laat _plCredDismiss achter voor precies dit doel: annuleren.
  setTimeout(() => { try { if (global.window._plCredDismiss) global.window._plCredDismiss(); } catch (e) { console.warn('venster sluiten mislukt:', e); } }, 0);
  return p;
}

const deel4 = (async function () {
  console.log('\n4. Een onbekend saldo blokkeert de analyse niet');
  const { PLC } = laad();
  PLC.stil(true);
  toets('het saldo is inderdaad onbekend', PLC.saldoBekend() === false);
  const u = await preflightUitkomst(PLC, 400);
  toets('preflight laat de analyse door', u.door === true,
        u.fout ? 'afgebroken met: ' + (u.fout && u.fout.message) : '');
  toets('en geeft een boekingsobject terug', !!(u.res && u.res.credits > 0),
        'res: ' + JSON.stringify(u.res));
})();

const deel5 = deel4.then(async function () {
  console.log('\n5. TEGENPROEF — een bekend saldo van nul breekt wél af');
  const { PLC } = laad();
  PLC.stil(true);
  PLC.zetServerSaldo(0);
  toets('het saldo is bekend en nul', PLC.saldoBekend() === true && PLC.saldo() === 0);
  const u = await preflightUitkomst(PLC, 400);
  toets('preflight breekt af', u.door === false,
        'de analyse ging door terwijl het tegoed op is');
  toets('met de afgebroken-fout, niet een willekeurige crash',
        !!(u.fout && u.fout.plAfgebroken === true),
        'fout: ' + (u.fout && (u.fout.name + ': ' + u.fout.message)));
  // En het is de tegoedroute die afbrak, niet een geannuleerd venster: die
  // twee gebruiken dezelfde foutsoort maar een andere tekst.
  toets('en wel omdat het tegoed op is', /onvoldoende tokens/i.test(u.fout && u.fout.message || ''),
        'melding: ' + (u.fout && u.fout.message));
});

const deel6 = deel5.then(async function () {
  console.log('\n6. Een activatiecode gaat naar een account, niet naar het toestel');
  const { PLC, opslag } = laad();

  // Zonder ingelogde klant hoort verzilver() af te haken VÓÓR het verzoek.
  // Ging hij door, dan stempelt de Worker de code af als gebruikt en boekt
  // hem nergens bij: de code is dan verbrand. fetch() gooit hier, dus als de
  // melding over inloggen gaat weten we dat het verzoek niet is verstuurd.
  global.window.currentUser = null;
  const r = await PLC.verzilver('PIDL-TEST-000001');
  toets('inwisselen zonder account wordt geweigerd', r.ok === false, JSON.stringify(r));
  toets('en de melding wijst naar inloggen', /log eerst in/i.test(r.bericht || ''),
        'bericht: ' + r.bericht);
  toets('er is geen tegoed in de opslag verschenen',
        opslag[PLC.CFG.lsSaldo] === undefined,
        'opslag: ' + JSON.stringify(opslag[PLC.CFG.lsSaldo]));
});

const deel7 = deel6.then(async function () {
  console.log('\n7. Afboeken maakt van "onbekend" geen "nul"');
  const { PLC, opslag } = laad();
  PLC.stil(true);
  toets('het saldo is onbekend voordat er iets loopt', PLC.saldoBekend() === false);

  const res = await preflightUitkomst(PLC, 400);
  PLC.boek(res.res, { input_tokens: 300, output_tokens: 900 });

  // De valkuil: afboeken() rekent saldo() - kosten, en saldo() geeft bij
  // onbekend 0. Zonder guard schrijft hij dus '0' weg, en vanaf dat moment is
  // het saldo "bekend en nul" — waarna preflight elke volgende analyse
  // afbreekt op een getal dat nooit van de server kwam.
  toets('er is geen saldosleutel weggeschreven',
        opslag[PLC.CFG.lsSaldo] === undefined,
        'opslag: ' + JSON.stringify(opslag[PLC.CFG.lsSaldo]));
  toets('en het saldo geldt nog steeds als onbekend', PLC.saldoBekend() === false,
        'saldoBekend() geeft ' + PLC.saldoBekend());

  // De tegenhanger: bij een bekend saldo hoort de teller wél mee te lopen.
  // Bewust zetSaldo() en niet zetServerSaldo(): een serversaldo is leidend
  // boven de lokale teller, dus dan zou deze toets niets over de guard zeggen.
  const b = laad();
  b.PLC.stil(true);
  b.PLC.zetSaldo(100);
  const res2 = await preflightUitkomst(b.PLC, 400);
  b.PLC.boek(res2.res, { input_tokens: 300, output_tokens: 900 });
  toets('bij een bekend saldo loopt de teller wel mee', b.PLC.saldo() < 100,
        'saldo() geeft nog ' + b.PLC.saldo());
});

deel7.then(function () {
  console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
  process.exit(fouten ? 1 : 0);
}).catch(function (e) {
  console.log('  FOUT test brak af — ' + (e && e.stack || e));
  process.exit(1);
});
