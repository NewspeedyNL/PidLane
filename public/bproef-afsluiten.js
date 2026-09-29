// ══════════════════════════════════════════════════════════════════
// bproef-afsluiten.js — "Rit beëindigen" in de echte app
// ──────────────────────────────────────────────────────────────────
// test-afsluiten.js toetst de volgorde los en test-garage.js de ritgrens.
// Dit toetst de KOPPELING in de draaiende app:
//   • het menu heeft één knop, en die zegt "Rit beëindigen" als er een
//     rit loopt en anders "Afsluiten";
//   • het venster toont de rit, en de naam gaat mee de server op;
//   • de rit is af vóór de verbinding weg is, en daarna gaat ATPC als
//     láátste commando naar de adapter — niets erachter dat het protocol
//     weer opent;
//   • de terugknop sluit het venster en niet de app;
//   • verbinding weg is een pauze, geen einde — ook in de echte lus;
//   • een caravanrit die nog loopt houdt de hoofdknop dicht;
//   • "App sluiten" (in de APK) laat automatisch verbinden staan.
//
// De server is een nep in de pagina (plFetch voor /klant/platform), de
// adapter de nep uit plbrowser.js. Wat een echte ECU van ATPC merkt is een
// vraag voor een rit, niet voor deze proef.
//
// Draaien vanuit public/:  node bproef-afsluiten.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const NEPSERVER = `(function(){
  const S = window._nepPlatform = { ritten:[], volg:[] };
  const echt = window.plFetch;
  window.plFetch = async function(pad, o){
    if (String(pad).indexOf('/klant/platform') < 0) return echt(pad, o);
    const b = (o && o.json) || {};
    S.volg.push('srv:' + b.actie);
    let d = { ok:true };
    if (b.actie === 'stand') d = { ok:true, akkoord:true, akkoordVersie:'2026-09-27', maxActief:3, kentekenBewaarbaar:true,
        voertuigen:[{ id:'v1', status:'actief', naam:'Blauwe Mazda', merk:'Mazda', aantal:{ rapporten:0, ritten:S.ritten.length, openIssues:0 } }] };
    else if (b.actie === 'rit_opslaan') { S.ritten.push(b.rit); d.id = 'r' + S.ritten.length; }
    else if (b.actie === 'ritten') d.ritten = [];
    else if (b.actie === 'rapporten') d.rapporten = [];
    else if (b.actie === 'issues') d.issues = [];
    return { ok:true, status:200, json: async () => d };
  };
  return true;
})()`;

// Na de nep-adapter: elk commando ook in dezelfde volgordelijst als de server.
const TX_VOLG = `(function(){
  const o = window._sendBTOnce;
  window._sendBTOnce = async function(c){ window._nepPlatform.volg.push('tx:' + String(c).toUpperCase()); return o(c); };
  return true;
})()`;

const ADAPTER = { '010C': '41 0C 1C 20', '010D': '41 0D 32', '0105': '41 05 7B', 'ATPC': 'OK' };

(async () => {
  let app;
  try { app = await startApp({ root: path.join(__dirname) }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  const wacht = async (expr, ms) => {
    for (let i = 0; i < (ms || 8000) / 100; i++) { if (await app.ev(expr)) return true; await new Promise(r => setTimeout(r, 100)); }
    return false;
  };
  const menuTekst = async () => app.ev(`(function(){ toggleKebab(); const t = document.getElementById('kbAfsluiten').textContent; closeKebab(); return t; })()`);
  const zichtbaar = (id) => `(function(){ const e = document.getElementById('${id}'); return !!e && getComputedStyle(e).display !== 'none'; })()`;

  try {
    console.log('\n── 1. het menu ──');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('PLAfsluiten staat er', await app.ev(`typeof PLAfsluiten === 'object' && typeof PLAfsluiten.open === 'function'`));
    toets('één knop onderin het menu, de oude twee zijn weg',
      await app.ev(`!!document.getElementById('kbAfsluiten') && !document.getElementById('kebabSluitApp') && !document.querySelector('#kebabMenu [onclick*="logout()"]')`));
    await app.ev(`window.currentUser = { user:'beheer', role:'admin', label:'Beheer' }; 'ok'`);
    toets('zonder rit heet hij "Afsluiten"', /Afsluiten/.test(await menuTekst()), await menuTekst());

    console.log('\n── 2. een klant rijdt ──');
    await app.ev(NEPSERVER);
    await app.ev(`window.currentUser = { user:'anna@voorbeeld.nl', role:'klant', label:'Anna' }; 'ok'`);
    toets('het actieve voertuig komt van de server', await wacht(`!!(PLGarage.actief() && PLGarage.actief().id === 'v1')`));
    await app.nepAdapter(ADAPTER);
    await app.ev(`connected = true; demoMode = false; pidVals['010D'] = 50; pidVals['010C'] = 1800; 'ok'`);
    toets('bij 50 km/u begint er een rit', await wacht(`!!PLGarage.ritNu()`, 6000));
    await app.ev(`PLGarage.staat().rit.km = 6.4; 'ok'`);
    toets('het menu zegt nu "Rit beëindigen"', /Rit beëindigen/.test(await menuTekst()), await menuTekst());

    console.log('\n── 3. het venster ──');
    await app.ev(`PLAfsluiten.open(); 'ok'`);
    const body = await app.ev(`document.getElementById('plAfBody').textContent`);
    toets('het venster toont de rit met afstand en voertuig', /6,4 km/.test(body) && /Blauwe Mazda/.test(await app.ev(`document.getElementById('plAfOv').textContent`)), body.slice(0, 120));
    toets('met labels om uit te kiezen', await app.ev(`[...document.querySelectorAll('#plAfOv .af-lab')].some(b => b.textContent === 'Woon-werk')`));
    toets('in de browser geen "App sluiten"', !/App sluiten/.test(body));
    toets('standaard: verbinding verbreken', await app.ev(`document.querySelector('#plAfOv input[name=plAfNa]:checked').value === 'verbreek'`));
    await app.ev(`appBack(); 'ok'`);
    toets('de terugknop sluit het venster', !(await app.ev(zichtbaar('plAfOv'))));
    toets('en laat de verbinding en de rit staan', await app.ev(`connected === true && !!PLGarage.ritNu()`));

    console.log('\n── 4. beëindigen ──');
    await app.ev(TX_VOLG);
    await app.ev(`PLAfsluiten.open(); [...document.querySelectorAll('#plAfOv .af-lab')].find(b => b.textContent === 'Woon-werk').click(); 'ok'`);
    await app.ev(`document.getElementById('plAfDoe').click(); 'ok'`);
    toets('de rit gaat met naam de server op', await wacht(`window._nepPlatform.ritten.some(r => r.label === 'Woon-werk' && r.extra && r.extra.einde === 'handmatig')`),
      await app.ev(`JSON.stringify(window._nepPlatform.ritten)`));
    toets('de verbinding is verbroken en het venster dicht', await wacht(`connected === false && !(${zichtbaar('plAfOv')})`));
    const volg = await app.ev(`window._nepPlatform.volg.slice()`);
    const iRit = volg.indexOf('srv:rit_opslaan'), iAtpc = volg.indexOf('tx:ATPC');
    toets('ATPC gaat naar de adapter', iAtpc >= 0, volg.join(' '));
    toets('de rit is opgeslagen vóór de bus vrijgegeven wordt', iRit >= 0 && iRit < iAtpc, volg.join(' '));
    toets('na ATPC komt er niets meer op de bus', !volg.slice(iAtpc + 1).some(x => /^tx:/.test(x)), volg.slice(iAtpc).join(' '));
    toets('bewust verbroken en in de app: niet vanzelf herverbinden', await app.ev(`localStorage.getItem('pl_autoconn') === null`));

    console.log('\n── 5. verbinding weg is een pauze ──');
    await app.nepAdapter(ADAPTER);
    await app.ev(`connected = true; demoMode = false; pidVals['010D'] = 50; 'ok'`);
    toets('weer rijden: een nieuwe rit', await wacht(`!!PLGarage.ritNu()`, 6000));
    const n0 = await app.ev(`window._nepPlatform.ritten.length`);
    await app.ev(`PLGarage.staat().rit.km = 3; PLGarage.staat().rit.tBeweeg = Date.now() - 3 * 60000; connected = false; 'ok'`);
    await new Promise(r => setTimeout(r, 4500));
    toets('drie minuten stil en de verbinding weg: de rit loopt door', await app.ev(`!!PLGarage.ritNu() && PLGarage.ritNu().stand === 'pauze' && window._nepPlatform.ritten.length === ${n0}`),
      await app.ev(`JSON.stringify(PLGarage.ritNu() && PLGarage.ritNu().stand)`));
    await app.ev(`PLGarage.staat().rit.tBeweeg = Date.now() - 16 * 60000; 'ok'`);
    toets('na zestien minuten: af, met reden "stil"', await wacht(`window._nepPlatform.ritten.length === ${n0 + 1} && window._nepPlatform.ritten[${n0}].extra.einde === 'stil'`, 6000));

    console.log('\n── 5b. een caravanrit loopt nog ──');
    // Met "ook uitloggen" is er iets te doen; zonder caravanrit zou de knop open staan.
    await app.ev(`caravanActive = true; PLAfsluiten.open(); PLAfsluiten._uit(true); 'ok'`);
    toets('het venster zegt dat hij eerst af moet', /Caravanrit loopt nog/.test(await app.ev(`document.getElementById('plAfBody').textContent`)));
    toets('en de hoofdknop blijft dicht tot dan', await app.ev(`document.getElementById('plAfDoe').disabled === true`));
    await app.ev(`caravanActive = false; PLAfsluiten._uit(true); 'ok'`);
    toets('is hij af, dan gaat de knop open', await app.ev(`document.getElementById('plAfDoe').disabled === false`));
    await app.ev(`PLAfsluiten.sluit(); 'ok'`);

    console.log('\n── 6. App sluiten in de APK ──');
    await app.ev(`window._exit = 0; window.Capacitor = Object.assign(window.Capacitor || {}, { isNativePlatform: () => true,
      Plugins: Object.assign((window.Capacitor && window.Capacitor.Plugins) || {}, { App: { exitApp: async () => { window._exit++; } } }) }); 'ok'`);
    await app.nepAdapter(ADAPTER);
    await app.ev(`connected = true; demoMode = false; localStorage.setItem('pl_autoconn', '1'); pidVals['010D'] = 0; 'ok'`);
    await app.ev(`PLAfsluiten.open(); 'ok'`);
    toets('in de APK staat "App sluiten" erbij', /App sluiten/.test(await app.ev(`document.getElementById('plAfBody').textContent`)));
    await app.ev(`PLAfsluiten._na('sluit'); document.getElementById('plAfDoe').click(); 'ok'`);
    toets('de app gaat dicht', await wacht(`window._exit === 1`, 10000));
    toets('na verbreken', await app.ev(`connected === false`));
    toets('en verbindt de volgende keer weer vanzelf', await app.ev(`localStorage.getItem('pl_autoconn') === '1'`));
    toets('de keuze is onthouden voor de volgende keer', await app.ev(`JSON.parse(localStorage.getItem('pl_afsluit_keuze')).na === 'sluit'`));

    toets('geen JS-fouten onderweg', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log(fouten ? '\n' + fouten + ' FOUT' : '\nAlles goed');
  process.exit(fouten ? 1 : 0);
})();
