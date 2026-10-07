// ═══════════════════════════════════════════════════════════════════
// bproef-telemetrie.js — helling en kanteling in de echte app (05-10-2026)
// ───────────────────────────────────────────────────────────────────
// test-telemetrie.js toetst de hoeken los. Wat node niet kan zien is de
// bedrading: staat de groep Telemetrie in de keuzelijst (en alleen met een
// sensor), heeft hij de knop Nulstellen, slaat de pollus TL.. over, weigert
// sendCmd ze, en komt er na een tik een waarde in pidVals.
//
// Wat hier rood hoort te worden:
//   • de pollus die TL01 als commando de bus op stuurt (pidsDueNow);
//   • sendCmd die een TL-commando doorgeeft aan de adapter;
//   • Telemetrie in de keuzelijst van een toestel zonder sensor (headless
//     Chromium heeft er geen — dat ís de tegenproef);
//   • een telefoonsensor die in supportedPIDs belandt;
//   • een waarde in pidVals (dus rapport, AI, bevindingen) terwijl niet zeker
//     is dat de telefoon vast in een houder zit, of een tegel die dan niet
//     dof (los) is.
//
// Draaien vanuit public/:  node bproef-telemetrie.js
// ═══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

(async () => {
  let app;
  try { app = await startApp({ root: __dirname }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    console.log('\n1. Zonder sensor geen groep');
    const zonder = await app.ev(`(function(){
      ['010C','010D'].forEach(p=>supportedPIDs.add(p));
      buildDiscoveredPIDList();
      return { ids: discoveredPIDDefs.map(d=>d.pid), events: PLTelemetrie.stats().events };
    })()`);
    toets('headless Chromium meldt geen oriëntatie (anders toetst deel 1 niets)', zonder.events === 0, JSON.stringify(zonder));
    toets('dan staat TL01 niet in de keuzelijst', zonder.ids.indexOf('TL01') < 0, zonder.ids.join(','));

    console.log('\n2. Met sensor: de groep Telemetrie, met Nulstellen');
    const met = await app.ev(`(function(){
      for (let i = 0; i < 60; i++) window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta: 90, gamma: 0 }));
      buildDiscoveredPIDList();
      const lbl = [...document.querySelectorAll('#pidList .clbl')].find(x => /Telemetrie/.test(x.textContent));
      const knop = lbl && [...lbl.querySelectorAll('button')].find(b => b.textContent === 'Nulstellen');
      const ids = discoveredPIDDefs.map(d=>d.pid);
      return { ids: ids, groep: !!lbl, knop: !!knop, inSupported: [...supportedPIDs].filter(p=>/^TL/.test(p)),
               def: getPidDef('TL02') && getPidDef('TL02').name };
    })()`);
    toets('TL01 en TL02 staan in de keuzelijst', met.ids.indexOf('TL01') >= 0 && met.ids.indexOf('TL02') >= 0, met.ids.join(','));
    toets('de lijst toont de groep "Telemetrie"', met.groep);
    toets('met de knop Nulstellen in de groepsbalk', met.knop);
    toets('geen telefoonsensor in supportedPIDs', met.inSupported.length === 0, met.inSupported.join(','));
    toets('getPidDef kent de naam (rapport en AI)', /Kanteling/.test(met.def || ''), met.def);

    console.log('\n3. Nooit de bus op');
    const bus = await app.ev(`(async function(){
      activePIDs.add('TL01'); activePIDs.add('TL02'); activePIDs.add('010C');
      _pidNextPoll = {};
      const due = pidsDueNow();
      let naarAdapter = 0;
      const echt = window._sendBTOnce;
      window._sendBTOnce = async function(){ naarAdapter++; return 'NO DATA'; };
      const was = demoMode; demoMode = false;
      let r;
      try { r = await sendCmd('TL01', 500); } finally { window._sendBTOnce = echt; demoMode = was; }
      return { due: due, naarAdapter: naarAdapter, r: r, geweigerd: PLTelemetrie.stats().geweigerd.length };
    })()`);
    toets('de pollus vraagt TL01 en TL02 niet op', bus.due.indexOf('TL01') < 0 && bus.due.indexOf('TL02') < 0, bus.due.join(','));
    toets('maar 010C wel (anders toetst dit niets)', bus.due.indexOf('010C') >= 0, bus.due.join(','));
    toets('sendCmd("TL01") komt niet bij de adapter', bus.naarAdapter === 0 && bus.r === '', JSON.stringify(bus));
    toets('en de weigering is geteld', bus.geweigerd === 1, JSON.stringify(bus));

    console.log('\n4. Zonder houder telt hij niet mee, wel dof op de tegel');
    const los = await app.ev(`(function(){
      try { localStorage.removeItem('pl_telemetrie_nul'); } catch (e) { console.warn(e); }
      // Slim is sinds #439 een eigen dashboard zonder .gc-tegels: meet in het Overzicht.
      setPidView('overzicht');
      renderGauges();
      for (let i = 0; i < 60; i++) window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta: 90, gamma: 0 }));
      PLTelemetrie.tik();
      const c = document.getElementById('gc-TL01');
      return { genuld: PLTelemetrie.genuld(), h: pidVals.TL01, hist: (pidHist.TL01 || []).length, kaart: !!c,
               los: !!(c && c.classList.contains('los')), titel: c ? c.title : '', reden: PLTelemetrie.houderNu().reden };
    })()`);
    toets('een verse sessie heeft geen nulstand (anders toetst deel 4 niets)', los.genuld === false, JSON.stringify(los));
    toets('zonder nulstand: niets in pidVals of pidHist', los.h === undefined && los.hist === 0, JSON.stringify(los));
    toets('de tegel bestaat en is dof (los), met de reden als tooltip', los.kaart && los.los && /Nulstellen/.test(los.titel), JSON.stringify(los));

    console.log('\n5. Genuld en 5 s stil in de houder: de tik zet de waarde');
    const tik = await app.ev(`(async function(){
      for (let i = 0; i < 10; i++) window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta: 90, gamma: 0 }));
      const ok = PLTelemetrie.nulstellen();
      const tot = Date.now() + 5600;
      while (Date.now() < tot) {
        window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta: 90, gamma: 0 }));
        await new Promise(r => setTimeout(r, 100));
      }
      PLTelemetrie.tik();
      const c = document.getElementById('gc-TL01');
      return { ok: ok, vast: PLTelemetrie.houderNu(), h: pidVals.TL01, k: pidVals.TL02, los: !!(c && c.classList.contains('los')) };
    })()`);
    toets('nulstellen lukt', tik.ok === true, JSON.stringify(tik));
    toets('helling en kanteling staan in pidVals (rechtop: ≈ 0°)', typeof tik.h === 'number' && Math.abs(tik.h) < 1 && typeof tik.k === 'number', JSON.stringify(tik));
    toets('en de tegel is niet meer dof', tik.los === false, JSON.stringify(tik));
  } finally {
    await app.stop();
  }
  console.log('\n' + (fouten ? 'bproef-telemetrie: ' + fouten + ' FOUT' : 'bproef-telemetrie: alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error('bproef-telemetrie brak af: ' + (e && e.stack || e)); process.exit(1); });
