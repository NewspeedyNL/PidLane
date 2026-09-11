// ══════════════════════════════════════════════════════════════════
// bproef-meetdienst.js — hangt de meetdienst in de ECHTE app? (#18)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF NIET IN node KAN
//
// test-meetdienst.js laadt pidlane-meetdienst.js in een sandbox met een
// nagemaakte `setConn`. Dat toetst wat de module DOET, maar niet of hij in de
// echte app aan de echte `setConn` komt te hangen — en juist dat is de plek
// waar het stil misgaat:
//
//   * `setConn` woont in pidlane-uihelpers.js. Laadt de meetdienst eerder,
//     dan is de guard `typeof setConn === 'function'` false, doet de module
//     niets, en staat er één console.warn in een log dat niemand leest.
//   * PLWake onderaan index.html wikkelt `setConn` óók. Twee wikkelaars om
//     dezelfde functie is precies de vorm die in dit project al drie keer een
//     bug is geweest; of ze allebei nog vuren is alleen in een echte boot te
//     zien.
//
// De uitkomst van beide fouten is hetzelfde: de dienst start nooit, de app
// meldt niets, en je merkt het pas als er een rit voor niets gereden is.
//
// EN ÉÉN DING DAT ALLEEN HIER TE ZIEN IS. `connected` en `demoMode` zijn in
// pidlane-auth.js gedeclareerd met `let` op het hoogste niveau. Dat maakt ze
// GLOBAAL maar geen eigenschap van `window`: `window.connected = true` zetten
// doet niets voor code die de kale naam leest. Deze proef zet ze daarom
// zonder `window.`-voorvoegsel. Bij het schrijven ervan liep hij op precies
// die fout vast — de dienst kreeg netjes `stop()` in plaats van `start()`,
// want `nodig()` las de echte binding en die stond nog op false.
//
// WAT HIER NEP IS, EN WAAR DE GRENS LIGT
// Alleen de Capacitor-bridge. Die bestaat in een browser niet, en dat is
// precies het laagste punt waar de app met de native kant praat — dezelfde
// afspraak als bproef-meetketen.js, die `_sendBTOnce()` vervangt en alles
// erboven echt laat. `setConn`, `PLMeetdienst`, `PLAchtergrond`, de
// luisteraar op `visibilitychange` en de volgorde van het laden zijn hier
// allemaal de echte.
//
// DE TEGENPROEF. Nagemeten op 11-09-2026 door in pidlane-meetdienst.js de
// wikkeling om `setConn` uit te zetten (`if (false)` op de guard): deze proef
// wordt dan rood op stap 3, met de melding dat de dienst niet meestartte.
// Dezelfde mutatie staat in plmutate.sh tegen test-meetdienst.js.
//
// Draaien vanuit public/:  node bproef-meetdienst.js
// ══════════════════════════════════════════════════════════════════
'use strict';

const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

/* De nep-bridge. Hij gaat NIET om de module heen: hij komt op window.Capacitor
   te staan, en de module zoekt hem daar elke aanroep opnieuw op. Alles wat de
   app daarboven doet is dus echt. */
const NEP_BRIDGE = `(function(){
  window.__meet = { start:0, stop:0, nulstel:0, rapport:0, melding:0 };
  window.Capacitor = {
    isNativePlatform: function(){ return true; },
    getPlatform: function(){ return 'android'; },
    Plugins: {
      PLMeetdienst: {
        status: function(){ return Promise.resolve({beschikbaar:true, draait:window.__meet.start>window.__meet.stop, hartslagMs:1000, sdk:36}); },
        start: function(){ window.__meet.start++; return Promise.resolve({draait:true, reden:'gestart'}); },
        stop: function(){ window.__meet.stop++; return Promise.resolve({draait:false, reden:'gestopt'}); },
        nulstel: function(){ window.__meet.nulstel++; return Promise.resolve({draait:true}); },
        rapport: function(){ window.__meet.rapport++;
          var nu = 1000000 + 182000;
          return Promise.resolve({draait:true, van:1000000, nu:nu, laatste:1000000+50000,
                                  slagen:50, stilMs:0, stilVan:1000000, hartslagMs:1000}); },
        vraagMelding: function(){ window.__meet.melding++; return Promise.resolve({melding:'granted'}); }
      }
    }
  };
  return true;
})()`;

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
    console.log('\n1. De module is er, en hangt op de goede plek');
    toets('PLMeetdienst bestaat na een echte boot', await app.ev(`!!window.PLMeetdienst`));
    toets('setConn bestaat en is een functie', await app.ev(`typeof setConn === 'function'`));
    // De hartslag moet aan beide kanten even snel tikken; het getal komt uit
    // de module zelf en niet uit deze proef.
    toets('de module rekent met de hartslag van de service',
      await app.ev(`PLMeetdienst._grenzen().hartslag`) === 1000);

    console.log('\n2. Zonder native kant zegt hij dat, en verzint geen nul');
    // Dit is de stand in een browser. "Niet gemeten" als nul lezen is de fout
    // die #18 anderhalve week een verkeerd getal liet rapporteren.
    toets('beschikbaar() is false', (await app.ev(`PLMeetdienst.beschikbaar()`)) === false);
    const leeg = await app.ev(`JSON.stringify(PLMeetdienst.oordeel(null))`);
    toets('het oordeel is niet-gemeten', JSON.parse(leeg).gemeten === false, leeg);
    toets('stil blijft null en wordt geen 0', JSON.parse(leeg).stil === null, leeg);

    console.log('\n3. Met een bridge volgt de dienst de ECHTE setConn');
    toets('de nep-bridge staat klaar', await app.ev(NEP_BRIDGE));
    toets('en de module ziet hem', await app.ev(`PLMeetdienst.beschikbaar()`));
    /* DIT IS DE KERN. Niet PLMeetdienst.start() aanroepen — dat bewijst
       alleen dat de functie werkt — maar de echte setConn, zoals
       pidlane-bt.js dat doet als er een adapter aan hangt. Loopt de wikkeling
       niet, dan blijft de teller op nul en zegt de app niets. */
    const na = await app.ev(`(async function(){
      connected = true; demoMode = false;
      setConn(true);
      await new Promise(function(r){ setTimeout(r, 60); });
      return JSON.stringify(window.__meet);
    })()`);
    const t = JSON.parse(na);
    toets('verbinden start de meetdienst via setConn', t.start === 1,
      'teller: ' + na + ' — de wikkeling om setConn vuurde niet');
    toets('en de meldingpermissie is één keer gevraagd', t.melding === 1, na);

    const na2 = await app.ev(`(async function(){
      connected = false;
      setConn(false);
      await new Promise(function(r){ setTimeout(r, 60); });
      return JSON.stringify(window.__meet);
    })()`);
    toets('verbreken stopt hem', JSON.parse(na2).stop === 1, na2);

    console.log('\n4. PLAchtergrond en de meetdienst meten hetzelfde venster');
    /* De echte luisteraar op visibilitychange, in de echte DOM. Het scherm
       verbergen kan niet in een headless tabblad, dus visibilityState wordt
       overschreven en de gebeurtenis echt afgevuurd — alles daarna is de
       app zelf. */
    const heen = await app.ev(`(async function(){
      connected = true; demoMode = false;
      Object.defineProperty(document, 'visibilityState', { configurable:true, get:function(){ return 'hidden'; } });
      document.dispatchEvent(new Event('visibilitychange'));
      /* Langer weg dan PLAchtergrond.DREMPEL_MELDEN, en die drempel komt uit
         de module zelf zodat deze proef meeverandert als hij verschuift.
         Korter en de module legt met recht niets vast: een vensterwissel is
         geen bevriezing. */
      var wacht = PLAchtergrond._drempels().melden + 400;
      await new Promise(function(r){ setTimeout(r, wacht); });
      return JSON.stringify({ weg: PLAchtergrond.weg(), wacht: wacht, meet: window.__meet });
    })()`);
    const h = JSON.parse(heen);
    toets('wegschakelen zet de klok van PLAchtergrond aan', h.weg === true, heen);
    // Zonder deze aanroep meet de native hartslag over een venster dat niet
    // bij deze afwezigheid hoort, en dat levert een getal op dat er goed
    // uitziet en niets betekent.
    toets('en zet de native teller op nul', h.meet.nulstel === 1, heen);

    const terug = await app.ev(`(async function(){
      Object.defineProperty(document, 'visibilityState', { configurable:true, get:function(){ return 'visible'; } });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise(function(r){ setTimeout(r, 120); });
      var p = PLAchtergrond.laatste();
      return JSON.stringify({ rapport: window.__meet.rapport, native: p && p.native });
    })()`);
    const tg = JSON.parse(terug);
    toets('terugkomen vraagt het native rapport op', tg.rapport === 1, terug);
    toets('en het oordeel staat aan de periode geplakt', !!(tg.native && tg.native.gemeten), terug);
    // De nep-bridge levert 50 s doorgelopen en daarna stilte tot het uitlezen:
    // dat is de staartregel, met de getallen van de rit van 09-09.
    toets('met de aanlooptijd die de service meldde', tg.native && tg.native.door === 50, terug);
    toets('en de stilte uit de staart', tg.native && tg.native.stil === 132, terug);

    console.log('\n5. De app is heel gebleven');
    const fouten_app = app.fouten;
    const erg = (fouten_app || []).filter(function (f) { return /meetdienst|PLMeetdienst|achtergrond/i.test(String(f)); });
    toets('geen JS-fouten rond de meetdienst', erg.length === 0, JSON.stringify(erg).slice(0, 300));

  } finally {
    await app.stop();
  }

  console.log('\n' + (fouten ? fouten + ' FOUT' : 'alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(function (e) { console.error('FOUT: de proef zelf klapte —', e); process.exit(1); });
