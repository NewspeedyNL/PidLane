// ══════════════════════════════════════════════════════════════════
// bproef-pip.js — hangt de PiP-module in de ECHTE app? (#228)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF NIET IN node KAN
//
// test-pip.js laadt pidlane-pip.js in een sandbox met een nagemaakte
// `setConn` en een nagemaakte DOM. Dat toetst het BESLUIT. Wat het niet
// toetst is of die module in de echte app aan de echte haken komt te hangen,
// en dat is precies waar dit stil misgaat:
//
//   * `setConn` woont in pidlane-uihelpers.js en `updPID` in pidlane-pids.js.
//     Laadt pidlane-pip.js eerder, dan zijn beide guards false, doet de
//     module niets, en staat er één console.warn in een log dat niemand leest.
//   * Twee andere modules wikkelen `setConn` óók (PLWake en de meetdienst).
//     Of ze alle drie nog vuren is alleen in een echte boot te zien.
//   * Het kleine venster zet ALLES BEHALVE zichzelf op display:none. Gaat de
//     klasse er wel op maar niet meer af, dan is de app onbruikbaar — een
//     zwart scherm met drie getallen, en geen weg terug.
//
// WAT HIER NEP IS, EN WAAR DE GRENS LIGT
// Alleen de Capacitor-bridge; die bestaat in een browser niet. Zelfde afspraak
// als bproef-meetdienst.js. Het VENSTER zelf is Android en kan hier per
// definitie niet: wat hier getoetst wordt is alles tot aan de bridge, plus
// wat de app doet als de bridge zegt dat de modus gewisseld is.
//
// LET OP — `connected` en `demoMode` zijn met `let` op het hoogste niveau
// gedeclareerd in pidlane-auth.js. Dat maakt ze globaal maar géén eigenschap
// van `window`: ze worden hieronder dus zonder `window.`-voorvoegsel gezet.
//
// DE TEGENPROEF. Nagemeten door in pidlane-pip.js de wikkeling om `setConn`
// uit te zetten: stap 3 wordt dan rood met de vlagtelling erbij. Dezelfde
// mutatie staat in plmutate.sh tegen test-pip.js.
//
// Draaien vanuit public/:  node bproef-pip.js
// ══════════════════════════════════════════════════════════════════
'use strict';

const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

/* De nep-bridge. Hij gaat niet om de module heen: hij komt op
   window.Capacitor te staan en de module zoekt hem elke aanroep opnieuw op.
   De luisteraar wordt bewaard, zodat deze proef de moduswissel kan sturen
   zoals MainActivity dat zou doen. */
const NEP_BRIDGE = `(function(){
  window.__pip = { vlaggen: [], nu: 0, luisteraars: {} };
  window.Capacitor = {
    isNativePlatform: function(){ return true; },
    getPlatform: function(){ return 'android'; },
    Plugins: {
      PLPip: {
        status: function(){ return Promise.resolve({beschikbaar:true, ondersteund:true,
          gewenst: window.__pip.vlaggen.length ? window.__pip.vlaggen[window.__pip.vlaggen.length-1] : false,
          inPip:false}); },
        zetGewenst: function(o){ window.__pip.vlaggen.push(!!(o&&o.aan)); return Promise.resolve({gewenst:!!(o&&o.aan)}); },
        nu: function(){ window.__pip.nu++; return Promise.resolve({ok:true}); },
        addListener: function(naam, fn){ window.__pip.luisteraars[naam] = fn; return { remove: function(){} }; }
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
    console.log('\n1. De module is er, en de haken die hij nodig heeft ook');
    toets('PLPip bestaat na een echte boot', await app.ev(`!!window.PLPip`));
    toets('setConn bestaat en is een functie', await app.ev(`typeof setConn === 'function'`));
    toets('updPID bestaat en is een functie', await app.ev(`typeof updPID === 'function'`));
    toets('en featOn ook — daar hangt de uitzetknop aan',
      await app.ev(`typeof featOn === 'function'`));

    console.log('\n2. Zonder native kant zegt hij dat, en verzint geen venster');
    toets('beschikbaar() is false in een browser', (await app.ev(`PLPip.beschikbaar()`)) === false);
    const b0 = JSON.parse(await app.ev(`JSON.stringify(PLPip.besluit(PLPip.feiten()))`));
    toets('het besluit noemt de schil en niet iets anders', b0.sleutel === 'geen-schil', JSON.stringify(b0));

    console.log('\n3. Met een bridge volgt de vlag de ECHTE setConn');
    toets('de nep-bridge staat klaar', await app.ev(NEP_BRIDGE));
    toets('en de module ziet hem', await app.ev(`PLPip.beschikbaar()`));

    /* DIT IS DE KERN. Niet PLPip.sync() aanroepen — dat bewijst alleen dat de
       functie werkt — maar de echte setConn, zoals pidlane-bt.js dat doet als
       er een adapter aan hangt. Loopt de wikkeling niet, dan blijft de lijst
       leeg en weet de native kant nooit dat er gemeten wordt. */
    const na = await app.ev(`(async function(){
      connected = true; demoMode = false;
      activePIDs.add('010C'); activePIDs.add('010D');
      setConn(true);
      await new Promise(function(r){ setTimeout(r, 80); });
      return JSON.stringify(window.__pip.vlaggen);
    })()`);
    toets('verbinden zet de vlag aan via setConn', JSON.parse(na).slice(-1)[0] === true,
      'vlaggen: ' + na + ' — de wikkeling om setConn vuurde niet');

    const na2 = await app.ev(`(async function(){
      connected = false;
      setConn(false);
      await new Promise(function(r){ setTimeout(r, 80); });
      return JSON.stringify(window.__pip.vlaggen);
    })()`);
    toets('verbreken zet hem weer uit', JSON.parse(na2).slice(-1)[0] === false,
      'vlaggen: ' + na2 + ' — dan springt de app in een venster terwijl er niets gemeten wordt');

    /* DE VOLGORDE VAN DE ECHTE APP — 23-09-2026. Hierboven gaan de sensoren
       erin vóór setConn(true). In de app is het andersom: pidlane-bt.js roept
       setConn(true) aan zodra de verbinding staat, en de selectie komt pas
       daarna, uit de rijsituatie of een meetopdracht. Op het toestel ging het
       kleine venster daardoor nooit aan: het besluit viel op "geen selectie"
       en niets vroeg het opnieuw. Blok 3 zag dat niet, want hij toetste de
       gunstige volgorde. */
    console.log('\n3b. Eerst verbinden, dán sensoren kiezen — zoals de app het doet');
    const volg = await app.ev(`(async function(){
      activePIDs.clear();
      connected = true; demoMode = false;
      setConn(true);
      await new Promise(function(r){ setTimeout(r, 80); });
      const voor = window.__pip.vlaggen.slice(-1)[0];
      activePIDs.add('010C');
      updPID('010C', 812);
      await new Promise(function(r){ setTimeout(r, 80); });
      const na = window.__pip.vlaggen.slice(-1)[0];
      // Opruimen zoals blok 3 achterliet: verbroken, maar mét selectie —
      // blok 4 rekent daarop.
      activePIDs.add('010D'); connected = false; setConn(false);
      await new Promise(function(r){ setTimeout(r, 80); });
      return JSON.stringify({ voor: voor, na: na, alle: window.__pip.vlaggen });
    })()`);
    const v = JSON.parse(volg);
    toets('bij verbinden zonder selectie staat de vlag uit', v.voor === false, volg);
    toets('zodra de eerste meetwaarde binnenkomt, gaat hij aan', v.na === true,
      volg + ' — dan vraagt de app het venster nooit aan, en dat is wat er op 23-09 op het toestel gebeurde');

    console.log('\n4. De uitzetknop uit de Config werkt in de echte app');
    /* Niet PLPip.toggleAan() nabouwen maar de echte weg: PID_CONFIG zetten
       zoals /api/config dat doet, en dan kijken wat het besluit zegt. Dit is
       de eis uit de opdracht — uit te zetten via Airtable → beheer.html. */
    const uit = JSON.parse(await app.ev(`(function(){
      window.PID_CONFIG = Object.assign({}, window.PID_CONFIG, { feat_pip: 'false' });
      connected = true;
      return JSON.stringify(PLPip.besluit(PLPip.feiten()));
    })()`));
    toets('feat_pip=false zet de functie uit', uit.aan === false && uit.sleutel === 'uit', JSON.stringify(uit));
    const weer = JSON.parse(await app.ev(`(function(){
      window.PID_CONFIG.feat_pip = 'true';
      return JSON.stringify(PLPip.besluit(PLPip.feiten()));
    })()`));
    toets('en weer aan zodra de beheerder hem terugzet', weer.aan === true, JSON.stringify(weer));

    console.log('\n5. De moduswissel zet het scherm om — en weer helemaal terug');
    /* Eerst een element van de APP ZELF uitkiezen dat nu zichtbaar is, en
       onthouden welk. Raden welk element dat zou moeten zijn werkt niet: de
       eerste div onder body kan net zo goed een verborgen venster zijn. Dit
       maakt er een echte voor/na-meting van. */
    const inPip = JSON.parse(await app.ev(`(function(){
      window.__plpipProef = Array.prototype.slice.call(document.querySelectorAll('body > div'))
        .filter(function(d){ return d.id !== 'pipMini' && getComputedStyle(d).display !== 'none'; })[0] || null;
      window.__pip.luisteraars['pipModus']({ in: true });
      var mini = document.getElementById('pipMini');
      var st = mini ? getComputedStyle(mini) : null;
      return JSON.stringify({
        klasse: document.body.classList.contains('pl-pip'),
        mini: !!mini,
        zichtbaar: st ? st.display !== 'none' : false,
        gekozen: window.__plpipProef ? (window.__plpipProef.id || window.__plpipProef.className || 'div') : null,
        appWeg: window.__plpipProef ? getComputedStyle(window.__plpipProef).display === 'none' : null,
        inPip: PLPip.inPip()
      });
    })()`));
    toets('de klasse staat op body', inPip.klasse, JSON.stringify(inPip));
    toets('het kleine venster bestaat en is zichtbaar', inPip.mini && inPip.zichtbaar, JSON.stringify(inPip));
    toets('en PLPip weet dat hij erin zit', inPip.inPip === true);
    toets('de volle weergave gaat eronder weg (' + inPip.gekozen + ')',
      inPip.appWeg === true,
      JSON.stringify(inPip) + ' — anders staat de hele app in een venster van 240x135');

    /* DE BELANGRIJKSTE VAN DEZE PROEF. Blijft de klasse staan, dan staat alles
       behalve het kleine venster op display:none en is de app onbruikbaar.
       Daarom niet alleen de klasse toetsen maar een ECHT element uit de app. */
    const eruit = JSON.parse(await app.ev(`(function(){
      window.__pip.luisteraars['pipModus']({ in: false });
      var mini = document.getElementById('pipMini');
      var app0 = window.__plpipProef;
      return JSON.stringify({
        klasse: document.body.classList.contains('pl-pip'),
        miniWeg: mini ? getComputedStyle(mini).display === 'none' : true,
        appTerug: app0 ? getComputedStyle(app0).display !== 'none' : null,
        inPip: PLPip.inPip()
      });
    })()`));
    toets('de klasse is weg', eruit.klasse === false, JSON.stringify(eruit));
    toets('het kleine venster is weer verborgen', eruit.miniWeg, JSON.stringify(eruit));
    toets('en precies dat element staat er weer', eruit.appTerug === true, JSON.stringify(eruit) +
      ' — blijft het weg, dan is de app na één PiP-ronde onbruikbaar');
    toets('PLPip weet dat hij eruit is', eruit.inPip === false);

    console.log('\n6. De meetlus vult het venster, en niet een tweede klok');
    const ververst = JSON.parse(await app.ev(`(async function(){
      window.__pip.luisteraars['pipModus']({ in: true });
      updPID('010C', 1234);
      await new Promise(function(r){ setTimeout(r, 30); });
      var el = document.getElementById('pipRpm');
      var uit = { tekst: el ? el.textContent : null };
      window.__pip.luisteraars['pipModus']({ in: false });
      return JSON.stringify(uit);
    })()`));
    toets('een binnengekomen waarde komt in het kleine venster',
      ververst.tekst && ververst.tekst !== '—',
      'gaf: ' + JSON.stringify(ververst) + ' — dan blijft het venster op streepjes staan en zegt het niets over doorlopen');

    console.log('\nbproef-pip: ' + (fouten ? fouten + ' FOUT' : 'alles goed'));
  } finally {
    await app.stop();
  }
  process.exit(fouten ? 1 : 0);
})();
