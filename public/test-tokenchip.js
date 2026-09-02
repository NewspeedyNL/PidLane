// ══════════════════════════════════════════════════════════════════
// test-tokenchip.js — de tokenchip volgt de rol, niet het laadmoment
// ──────────────────────────────────────────────────────────────────
// DE FOUT (#52). Op 29-08-2026 stond er tijdens testrun 5.4 "⚡ tokens
// onbekend" linksonder terwijl er als Admin was ingelogd. De beslissing zelf
// klopte — _vrijgesteld() geeft true voor een beheerder en _chipVerversen()
// haalt de chip dan weg — maar hij viel op het verkeerde moment. De chip werd
// getekend bij het LADEN van de pagina, dus vóór de login, en daarna keek er
// niets meer naar: van de vier aanroepers van _chipVerversen() was er geen
// enkele het in- of uitloggen. PLCredits.chip bestond wél als publieke ingang,
// maar werd door niemand aangeroepen.
//
// DE TWEEDE HELFT, en die stond niet in het issue: NIEMAND ingelogd viel door
// alle takken van _vrijgesteld() heen en kwam op "niet vrijgesteld" uit. Op het
// loginscherm stond dus ook een chip, en na uitloggen bleef hij staan met het
// woord "onbekend" erin. De regel is nu één zin: alleen een ingelogde klant
// betaalt met tokens, en alleen die ziet de chip.
//
// WAAROM DIT EEN GEDRAGSTEST IS EN GEEN BRONCONTROLE
// De vraag is niet of er ergens PLCredits.chip() staat, maar of er ná een
// rolwissel een chip in de DOM hangt. Daarvoor moet de module draaien met een
// DOM die onthoudt wat erin gezet is — precies wat de nagemaakte document
// hieronder doet.
//
// Draaien vanuit public/:  node test-tokenchip.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── Een DOM die onthoudt ──────────────────────────────────────────
// De stub in test-proeftegoed.js gooit alles weg wat de module aanmaakt; hier
// gaat het juist om wat er blijft staan. body.kinderen is dus een echte lijst
// en getElementById zoekt daarin, zodat remove() en "bestaat hij al?" werken
// zoals in een browser.
function laad() {
  const opslag = {};
  global.localStorage = {
    getItem: (k) => (k in opslag ? opslag[k] : null),
    setItem: (k, v) => { opslag[k] = String(v); },
    removeItem: (k) => { delete opslag[k]; }
  };
  global.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

  const kinderen = [];
  const maakEl = () => {
    const el = {
      id: '', className: '', innerHTML: '', style: { cssText: '' }, onclick: null,
      appendChild() {}, querySelector: () => ({ onclick: null, style: {}, checked: false }),
      remove() { const i = kinderen.indexOf(el); if (i > -1) kinderen.splice(i, 1); }
    };
    return el;
  };
  global.document = {
    readyState: 'complete',
    getElementById: (id) => kinderen.find((el) => el.id === id) || null,
    addEventListener() {},
    createElement: maakEl,
    body: { appendChild(el) { kinderen.push(el); } },
    querySelector: () => ({ onclick: null, style: {}, checked: false })
  };
  global.window = {};
  global.fetch = () => Promise.reject(new Error('geen net in de test'));

  eval(fs.readFileSync(__dirname + '/pidlane-credits.js', 'utf8'));
  const PLC = global.window.PLCredits;

  return {
    PLC: PLC,
    // De twee dingen die de app doet bij een rolwissel: currentUser zetten en
    // daarna de chip opnieuw laten beoordelen. Dat tweede is exact wat #52
    // miste, dus de test moet het los kunnen doen — anders meet hij een fix die
    // hij zelf inbouwt.
    login: (rol) => { global.window.currentUser = rol ? { name: 'iemand', role: rol } : null; },
    chip: () => PLC.chip(),
    zicht: () => global.document.getElementById('plCredChip'),
    tekst: () => { const c = global.document.getElementById('plCredChip'); return c ? c.innerHTML : ''; }
  };
}

console.log('1. Zonder login hangt er geen chip');
{
  const a = laad();
  // Dit is de stand vlak na het laden van de pagina: de module tekent zichzelf
  // en er is nog niemand ingelogd. Vóór 02-09-2026 stond hier "tokens onbekend".
  toets('na het laden staat er niets', a.zicht() === null,
        'er hangt een chip met: ' + a.tekst());
}

console.log('\n2. Een klant krijgt de chip, en het getal van de server');
{
  const a = laad();
  a.login('klant');
  a.chip();
  toets('de chip verschijnt', a.zicht() !== null);
  toets('en zegt eerlijk dat het saldo nog onbekend is', /onbekend/i.test(a.tekst()),
        'chip: ' + a.tekst());
  a.PLC.zetServerSaldo(42);
  toets('na het serversaldo staat het getal erin', /42/.test(a.tekst()),
        'chip: ' + a.tekst());
}

console.log('\n3. Een beheerder ziet geen chip — ook niet als hij ná het laden inlogt (#52)');
{
  const a = laad();
  // De volgorde uit de run van 29-08: eerst laadt de pagina, dan pas de login.
  a.login('klant');
  a.chip();
  toets('er hangt eerst een chip (klant)', a.zicht() !== null);

  a.login('admin');
  toets('vóór de herbeoordeling staat hij er nog', a.zicht() !== null,
        'zonder aanroep hoort de oude toestand te blijven staan — anders meet deel 4 niets');
  a.chip();
  toets('na de herbeoordeling is hij weg', a.zicht() === null,
        'chip blijft staan bij een beheerder: ' + a.tekst());
}

console.log('\n4. TEGENPROEF — zonder de herbeoordeling blijft de fout bestaan');
{
  // Dit is #52 nagebouwd: rol wisselen zonder PLCredits.chip() aan te roepen.
  // Blijft deze toets groen terwijl deel 3 dat ook is, dan is de aanroep in
  // finishLogin() het enige dat de chip weghaalt — en dat is precies wat er
  // getoetst moet worden. Wordt deze rood, dan verdwijnt de chip vanzelf en
  // meet deel 3 iets anders dan het denkt.
  const a = laad();
  a.login('klant');
  a.chip();
  a.login('user');
  toets('de chip verdwijnt niet uit zichzelf', a.zicht() !== null,
        'de chip ruimt zichzelf op; deel 3 toetst dan niet de aanroep maar iets anders');
}

console.log('\n5. Uitloggen haalt de chip weg, niet alleen het getal');
{
  const a = laad();
  a.login('klant');
  a.PLC.zetServerSaldo(120);
  toets('de klant heeft een chip met 120', /120/.test(a.tekst()), 'chip: ' + a.tekst());

  // vergeetKlant() draait in logout() nog vóór currentUser gewist wordt. Dat is
  // de echte volgorde en de reden dat er een tweede aanroep nodig is.
  a.PLC.vergeetKlant();
  toets('vergeetKlant() alleen laat de chip staan', a.zicht() !== null,
        'als deze rood is, is de volgorde in logout() veranderd en mag deel 5 herschreven');
  toets('en het getal is dan al weg', !/120/.test(a.tekst()), 'chip: ' + a.tekst());

  a.login(null);
  a.chip();
  toets('na het wissen van currentUser is de chip weg', a.zicht() === null,
        'na uitloggen blijft er een chip op het loginscherm staan: ' + a.tekst());
}

console.log('\n6. Wie de chip ziet, betaalt ook — één regel, geen tweede plek');
{
  // _vrijgesteld() is niet geëxporteerd, en dat hoort zo. De waarneembare kant
  // is dat chip en afboeking hetzelfde antwoord geven: ziet iemand een chip,
  // dan geeft preflight() een boeking terug; ziet hij er geen, dan niet.
  // Zouden die twee uit elkaar lopen, dan betaalt iemand zonder het te zien.
  const gevallen = [['klant', true], ['admin', false], ['user', false], [null, false]];
  gevallen.forEach(function (g) {
    const a = laad();
    a.login(g[0]);
    a.PLC.zetSaldo(500);
    a.chip();
    a.PLC.stil(true);
    const heeftChip = a.zicht() !== null;
    toets('rol ' + (g[0] || 'niemand') + ': chip ' + (g[1] ? 'zichtbaar' : 'weg'),
          heeftChip === g[1], 'chip aanwezig: ' + heeftChip);
  });
}

const deel7 = (async function () {
  console.log('\n7. Dezelfde regel aan de kassa: alleen een klant wordt afgeboekt');
  const gevallen = [['klant', true], ['admin', false], [null, false]];
  for (const g of gevallen) {
    const a = laad();
    a.login(g[0]);
    a.PLC.zetSaldo(500);
    a.PLC.stil(true);
    const res = await a.PLC.preflight('x'.repeat(400), 'systeem', 2048, 'claude-sonnet-5')
      .catch(() => null);
    const rekent = !!(res && res.credits > 0);
    toets('rol ' + (g[0] || 'niemand') + ': ' + (g[1] ? 'wel' : 'geen') + ' boeking',
          rekent === g[1], 'preflight gaf: ' + JSON.stringify(res));
  }
})();

deel7.then(function () {
  console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
  process.exit(fouten ? 1 : 0);
}).catch(function (e) {
  console.log('  FOUT test brak af — ' + (e && e.stack || e));
  process.exit(1);
});
