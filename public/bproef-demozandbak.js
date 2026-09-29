// ══════════════════════════════════════════════════════════════════
// bproef-demozandbak.js — de demo in de echte app: alles werkt, niets blijft
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT (29-09-2026)
// test-demozandbak.js toetst de zandbak en de vier haken los. Wat daar niet
// in past is de koppeling: zet de échte demostart de zandbak aan, komt een
// AI-rapport echt als voorbeeld in het overzicht en verdwijnt het bij het
// stoppen, staat het toestel na afloop precies zoals ervoor, en komt een demo
// zonder login weer op het loginscherm uit. Plus de kaart "Niet in de auto?"
// en de hernoemde knoppen in het verbindscherm.
//
// DE TEGENPROEVEN DIE ERIN ZITTEN
//   • Deel 4: na het stoppen schrijft de app wél weer naar het toestel —
//     anders bewijst "niets bewaard" alleen dat opslag stuk is.
//   • Deel 5: je eigen voertuig als demo-auto is een diesel, dus géén
//     lambdasonde — de oude demo gaf elke auto de lijst van een benzine.
//
// Draaien vanuit public/:  node bproef-demozandbak.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const rust = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  let app;
  try {
    app = await startApp({ root: path.join(__dirname) });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  const wacht = async (expr, ms) => {
    for (let i = 0; i < (ms || 8000) / 100; i++) { if (await app.ev(expr)) return true; await rust(100); }
    return false;
  };

  try {
    console.log('\n1. De boot');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('PLDemo en PLZonder staan er', await app.ev(`typeof PLDemo === 'object' && typeof PLZonder === 'object'`));
    await app.ev(`localStorage.setItem('pl_proef','echt'); localStorage.removeItem('pl_proefnieuw'); 'ok'`);

    console.log('\n2. Het verbindscherm');
    toets('de demoknop heet wat hij doet', /Simuleer verbinding/.test(await app.ev(`document.querySelector('#connActions #btnDemo').textContent`)));
    toets('"Verder zonder adapter" staat ernaast', await app.ev(`!!document.querySelector('#connActions [data-pl="zonder"]')`));
    await app.ev(`resetToStep1(); 'ok'`);
    toets('… ook na resetToStep1()', await app.ev(`!!document.querySelector('#connActions [data-pl="zonder"]') && /Simuleer/.test(document.querySelector('#connActions #btnDemo').textContent)`));
    toets('het loginscherm houdt de tekst van de reviewnotitie', /Try demo — no adapter needed/.test(await app.ev(`document.getElementById('btnDemoLogin').textContent`)));

    console.log('\n3. Een demo zonder login');
    await app.ev(`plDemoZonderLogin(); setTimeout(function(){ startDemoCar(3); }, 700); 'ok'`);
    toets('de demo loopt', await wacht(`typeof demoMode!=='undefined' && demoMode===true`, 15000));
    toets('de zandbak staat aan', await app.ev(`PLDemo.stand().aan === true`));
    toets('een diesel-demo heeft geen lambdasonde (sensoren bij de brandstof)', await app.ev(`!supportedPIDs.has('0114') && !supportedPIDs.has('0124') && supportedPIDs.has('010C')`));
    await app.ev(`localStorage.setItem('pl_proef','demo'); localStorage.setItem('pl_proefnieuw','demo'); 'ok'`);
    toets('in de demo leest de app wat de demo schreef', (await app.ev(`localStorage.getItem('pl_proef')`)) === 'demo');
    const ai = await app.ev(`apiFetch('Analyseer deze auto', 500)`, { await: true });
    toets('de AI geeft een voorbeeldrapport', /VOORBEELDRAPPORT/.test(String(ai)), String(ai).slice(0, 80));
    const r403 = await app.ev(`plFetch('/v1/messages',{method:'POST',json:{}}).then(function(r){ return r.status; })`, { await: true });
    toets('een AI-verzoek gaat de deur niet uit (403, demo)', r403 === 403, String(r403));
    await app.ev(`window._lastAIReport = { text: 'Demo-rapport voor de proef', ts: new Date() }; 'ok'`);
    toets('het rapport staat in het overzicht, als demo', await app.ev(`_sessionReports.some(function(r){ return r.demo && /DEMO/.test(r.title); })`));
    toets('een bestand opslaan wordt geweigerd', (await app.ev(`plBewaarBestand(new Blob(['x']), 'proef.txt')`, { await: true })) === false);
    await app.ev(`goHome(); PLZonder.teken(true); 'ok'`);
    toets('het startscherm zegt: gesimuleerd, niets wordt bewaard', /Gesimuleerde verbinding/.test(await app.ev(`document.getElementById('plZonderKaart').textContent`)));

    console.log('\n4. Stoppen');
    await app.ev(`handleConnect(); 'ok'`);
    toets('de demo is uit', await wacht(`demoMode===false`, 5000));
    toets('het toestel is zoals het was: de oude waarde staat er', (await app.ev(`localStorage.getItem('pl_proef')`)) === 'echt');
    toets('… en wat de demo nieuw schreef is weg', (await app.ev(`localStorage.getItem('pl_proefnieuw')`)) === null);
    toets('het demorapport is uit het overzicht', await app.ev(`!_sessionReports.some(function(r){ return r.demo; })`));
    toets('de zandbak is dicht', await app.ev(`PLDemo.stand().aan === false`));
    await app.ev(`localStorage.setItem('pl_proef','na'); 'ok'`);
    toets('na de demo schrijft de app weer echt  <- tegenproef', (await app.ev(`localStorage.getItem('pl_proef')`)) === 'na');
    toets('zonder login terug op het loginscherm', await wacht(`!document.getElementById('loginOv').classList.contains('hidden')`, 3000));

    console.log('\n5. Je eigen voertuig als demo-auto');
    await app.ev(`(function(){
      window.__klant = PLKlant.isKlant; PLKlant.isKlant = function(){ return true; };
      PLGarage.staat().stand = { __u:'', akkoord:true, voertuigen:[{ id:'v1', status:'actief', naam:'Onze Skoda', merk:'Skoda', model:'Octavia', bouwjaar:2019, brandstof:'Diesel' }] };
      openDemoCarChooser(); return 'ok'; })()`);
    toets('de kiezer toont "Jouw auto" met het eigen voertuig', /Jouw auto[\s\S]*Onze Skoda/.test(await app.ev(`document.getElementById('demoCarModal').textContent`)));
    await app.ev(`startDemoEigen(0); 'ok'`);
    toets('de simulatie draait op het eigen voertuig', await wacht(`demoMode===true && vehicleInfo.merk==='Skoda'`, 5000));
    toets('met de sensoren van een diesel  <- de oude demo gaf elke auto die van een benzine', await app.ev(`!supportedPIDs.has('0114') && !supportedPIDs.has('0124')`));
    await app.ev(`handleConnect(); PLKlant.isKlant = window.__klant; PLGarage.staat().stand = null; 'ok'`);
    await wacht(`demoMode===false`, 5000);

    console.log('\n6. Niet in de auto: de kaart en de foutcode');
    await app.ev(`document.getElementById('loginOv').classList.add('hidden'); goHome(); PLZonder.teken(true); 'ok'`);
    const knoppen = await app.ev(`[...document.querySelectorAll('#plZonderKaart [data-plz]')].map(function(b){ return b.dataset.plz; }).join(',')`);
    toets('niet verbonden: kenteken-check en foutcode opzoeken staan erop', /kenteken/.test(knoppen) && /foutcode/.test(knoppen), knoppen);
    await app.ev(`PLZonder.foutcode(); document.getElementById('plzCode').value='p0301'; PLZonder._code(); 'ok'`);
    const uit = await app.ev(`document.getElementById('plzCodeUit').textContent`);
    toets('P0301 wordt uitgelegd, zonder net en zonder auto', /P0301/.test(uit) && !/Onbekende code/.test(uit), uit.slice(0, 90));
    await app.ev(`PLZonder.sluit(); 'ok'`);

    toets('de hele rit zonder JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log('\n─────────────────────────────────────────');
  console.log('bproef-demozandbak: ' + (fouten ? fouten + ' fout(en)' : 'goed'));
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.error('FOUT: ' + (e && e.stack || e)); process.exit(1); });
