// ══════════════════════════════════════════════════════════════════
// bproef-opdracht.js — komt de opdracht in de ECHTE app aan? (#241)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF NIET IN node KAN
//
// test-opdracht.js toetst de keurder en test-opdrachtroute.js de Worker. Wat
// daartussen zit is de app zelf, en daar zitten drie dingen die alleen in een
// echte boot te zien zijn:
//
//   * `plFetch` woont in pidlane-fuel.js. Laadt pidlane-opdracht.js eerder of
//     heet die functie anders, dan is er geen netwerkweg en zegt de module
//     alleen "plFetch ontbreekt" in een log dat niemand leest.
//   * `activePIDs` is een echte Set die de meetlus leest. Of `zetSensoren()`
//     daar werkelijk in landt — en niet in een kopie — is precies het soort
//     ding dat in een sandbox altijd lukt en in de app niet.
//   * De stille terugval. Wordt een opdracht afgekeurd, dan MOET de vorige
//     weg zijn. Blijft hij staan, dan meet de rit iets anders dan er in de
//     tabel staat en is dat verschil van buiten onzichtbaar.
//
// WAT HIER NEP IS: alleen het antwoord van de Worker. `plFetch` wordt
// gewikkeld op de laagste plek waar dit verkeer langskomt; alles erboven —
// het keuren, het loggen, de selectie — is de echte code.
//
// Draaien vanuit public/:  node bproef-opdracht.js
// ══════════════════════════════════════════════════════════════════
'use strict';

const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

/* De nep-Worker. Hij vervangt plFetch alleen voor /airtable/opdracht en laat
   al het andere verkeer met rust — een module die per ongeluk iets ánders
   ophaalt valt daarmee op in plaats van stilletjes mee te liften. */
const NEP_WORKER = `(function(){
  window.__opdr = { calls: 0, antwoord: null, andere: 0 };
  var echt = window.plFetch;
  window.plFetch = function(url, opt){
    if (String(url).indexOf('/airtable/opdracht') >= 0) {
      window.__opdr.calls++;
      var a = window.__opdr.antwoord;
      return Promise.resolve({ ok: a !== 'stuk', status: a === 'stuk' ? 502 : 200,
        json: function(){ return Promise.resolve(a || { ok:true, opdracht:null, reden:'geen actieve opdracht' }); } });
    }
    window.__opdr.andere++;
    return echt.apply(this, arguments);
  };
  return true;
})()`;

const GOED = {
  ok: true, id: 'recTEST', naam: 'boordspanning', gewijzigd: 'T1',
  opdracht: JSON.stringify({
    schema: 1, naam: 'boordspanning en looptijd', reden: '#217',
    sensoren: ['0142', '011F'], duurS: 300, tikS: 10,
    proeven: [{ issue: '#217', naam: 'spanning binnen bereik', pid: '0142', meet: 'min', tussen: [11.5, 15.2] }]
  })
};

(async () => {
  let app;
  try {
    app = await startApp({ root: __dirname });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') {
      console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]);
      process.exit(0);
    }
    throw e;
  }

  try {
    console.log('\n1. De module hangt in de app, met de haken die hij nodig heeft');
    toets('PLOpdracht bestaat na een echte boot', await app.ev(`!!window.PLOpdracht`));
    toets('plFetch bestaat en is een functie', await app.ev(`typeof plFetch === 'function'`));
    toets('PROXY_URL is gezet', await app.ev(`typeof PROXY_URL === 'string' && PROXY_URL.length > 0`));
    toets('PLRit draait — daar wordt tegen gemeten', await app.ev(`!!(window.PLRit && PLRit.per)`));
    toets('getPidDef kent 0142, dus onbekende sensoren stranden',
      await app.ev(`typeof getPidDef === 'function' && !!getPidDef('0142')`));

    console.log('\n2. Een goede opdracht komt binnen en wordt de actieve');
    toets('de nep-Worker staat klaar', await app.ev(NEP_WORKER));
    const geladen = JSON.parse(await app.ev(`(async function(){
      window.__opdr.antwoord = ${JSON.stringify(GOED)};
      var o = await PLOpdracht.haal();
      return JSON.stringify({ naam: o && o.naam, sensoren: o && o.sensoren,
        calls: window.__opdr.calls, herkomst: PLOpdracht.herkomst() });
    })()`));
    toets('de opdracht is opgehaald en goedgekeurd', geladen.naam === 'boordspanning en looptijd', JSON.stringify(geladen));
    toets('er is precies één keer om gevraagd', geladen.calls === 1, JSON.stringify(geladen));
    toets('de herkomst wijst naar de rij in Airtable',
      geladen.herkomst && geladen.herkomst.id === 'recTEST', JSON.stringify(geladen.herkomst));

    console.log('\n3. De sensoren landen in de ECHTE selectie');
    const sel = JSON.parse(await app.ev(`(function(){
      activePIDs.clear();
      var erbij = PLOpdracht.zetSensoren();
      return JSON.stringify({ erbij: erbij, inSelectie: [...activePIDs], nogEens: PLOpdracht.zetSensoren() });
    })()`));
    toets('beide sensoren staan nu in activePIDs',
      sel.inSelectie.indexOf('0142') >= 0 && sel.inSelectie.indexOf('011F') >= 0, JSON.stringify(sel));
    toets('en de module meldt welke hij erbij zette', sel.erbij.length === 2, JSON.stringify(sel));
    toets('een tweede keer voegt niets toe', sel.nogEens.length === 0,
      JSON.stringify(sel) + ' — anders groeit de selectie bij elke run');

    console.log('\n4. Een afgekeurde opdracht valt NIET stil terug op de vorige');
    /* Dit is de belangrijkste van deze proef. Blijft de oude opdracht staan,
       dan meet de rit iets anders dan er in de tabel staat — en juist dat
       verschil is van buiten niet te zien. */
    const slecht = JSON.parse(await app.ev(`(async function(){
      window.__opdr.antwoord = { ok:true, id:'recSTUK', naam:'stuk',
        opdracht: JSON.stringify({ schema:1, naam:'stuk', sensoren:['0142'], duurS:300, script:'alert(1)' }) };
      var o = await PLOpdracht.haal();
      return JSON.stringify({ o: o, actief: PLOpdracht.actief(), reden: PLOpdracht.reden() });
    })()`));
    toets('de afgekeurde opdracht wordt niet geladen', slecht.o === null, JSON.stringify(slecht));
    toets('en de vorige is óók weg', slecht.actief === null,
      JSON.stringify(slecht) + ' — stille terugval op de vorige opdracht is het gevaarlijkste geval');
    toets('de reden noemt de onbekende sleutel',
      /afgekeurd/i.test(slecht.reden) && /script/.test(slecht.reden), slecht.reden);

    console.log('\n5. De uitzetknop houdt het verkeer tegen');
    const uit = JSON.parse(await app.ev(`(async function(){
      window.PID_CONFIG = Object.assign({}, window.PID_CONFIG, { feat_opdracht: 'false' });
      window.__opdr.calls = 0;
      window.__opdr.antwoord = ${JSON.stringify(GOED)};
      var o = await PLOpdracht.haal();
      return JSON.stringify({ o: o, calls: window.__opdr.calls, reden: PLOpdracht.reden() });
    })()`));
    toets('met feat_opdracht=false komt er niets binnen', uit.o === null, JSON.stringify(uit));
    toets('en er gaat geen enkel verzoek de deur uit', uit.calls === 0,
      JSON.stringify(uit) + ' — een knop die het verkeer niet stopt is geen uitzetknop');
    toets('de reden noemt de Config', /Config/.test(uit.reden), uit.reden);

    const weer = JSON.parse(await app.ev(`(async function(){
      window.PID_CONFIG.feat_opdracht = 'true';
      window.__opdr.calls = 0;
      var o = await PLOpdracht.haal();
      return JSON.stringify({ naam: o && o.naam, calls: window.__opdr.calls });
    })()`));
    toets('en weer aan zodra de beheerder hem terugzet',
      weer.naam === 'boordspanning en looptijd' && weer.calls === 1, JSON.stringify(weer));

    console.log('\n6. Een stukke Worker maakt niets kapot');
    const stuk = JSON.parse(await app.ev(`(async function(){
      window.__opdr.antwoord = 'stuk';
      var o = await PLOpdracht.haal();
      return JSON.stringify({ o: o, actief: PLOpdracht.actief(), reden: PLOpdracht.reden() });
    })()`));
    toets('een 502 levert geen opdracht op', stuk.o === null && stuk.actief === null, JSON.stringify(stuk));
    toets('met een leesbare reden', /502|niet opgehaald/.test(stuk.reden), stuk.reden);
    toets('en er is niets anders opgehaald dan de opdracht',
      (await app.ev(`window.__opdr.andere`)) === 0,
      'de module hoort alleen /airtable/opdracht te vragen');

    console.log('\nbproef-opdracht: ' + (fouten ? fouten + ' FOUT' : 'alles goed'));
  } finally {
    await app.stop();
  }
  process.exit(fouten ? 1 : 0);
})();
