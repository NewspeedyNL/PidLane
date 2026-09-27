// ═══════════════════════════════════════════════════════════════════
// bproef-berekend.js — de berekende PIDs in de echte app (27-09-2026)
// ───────────────────────────────────────────────────────────────────
// test-berekend.js toetst de rekenregels los. Wat node niet kan zien is de
// bedrading: staan ze in de keuzelijst, slaat de pollus ze over, weigert
// sendCmd ze, en komt er na een tik een waarde in pidVals en een tegel.
//
// Wat hier rood hoort te worden:
//   • de pollus die CA01 als commando de bus op stuurt (pidsDueNow);
//   • sendCmd die een CA-commando doorgeeft aan de adapter;
//   • een berekende PID die niet in de keuzelijst staat, of die in
//     supportedPIDs belandt (dan vraagt de waakronde hem bij de auto op);
//   • een tik die geen waarde oplevert terwijl de bronnen vers zijn.
//
// Draaien vanuit public/:  node bproef-berekend.js
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
    console.log('\n1. De keuzelijst');
    const lijst = await app.ev(`(function(){
      ['010C','010D','0105','0106','0107','010B','0110'].forEach(p=>supportedPIDs.add(p));
      buildDiscoveredPIDList();
      const ids = discoveredPIDDefs.map(d=>d.pid);
      return { ids: ids, inSupported: [...supportedPIDs].filter(p=>/^CA/.test(p)),
               tekst: document.getElementById('pidList').textContent };
    })()`);
    toets('versnelling (CA01) staat in de keuzelijst', lijst.ids.indexOf('CA01') >= 0, lijst.ids.join(','));
    toets('verbruik nu, laaddruk en totale trim staan erin', ['CA03', 'CA04', 'CA05'].every(p => lijst.ids.indexOf(p) >= 0), lijst.ids.join(','));
    toets('vermogen niet: 0162/0163 ontbreken op deze auto', lijst.ids.indexOf('CA06') < 0);
    toets('geen berekende PID in supportedPIDs (dan vraagt de waakronde hem bij de auto op)', lijst.inSupported.length === 0, lijst.inSupported.join(','));
    toets('de lijst toont de groep "Berekend"', /Berekend/.test(lijst.tekst));

    console.log('\n2. Nooit de bus op');
    const bus = await app.ev(`(async function(){
      activePIDs.add('CA01'); activePIDs.add('CA05'); activePIDs.add('010C');
      _pidNextPoll = {};
      const due = pidsDueNow();
      let naarAdapter = 0;
      const echt = window._sendBTOnce;
      window._sendBTOnce = async function(){ naarAdapter++; return 'NO DATA'; };
      const was = demoMode; demoMode = false;
      let r;
      try { r = await sendCmd('CA01', 500); } finally { window._sendBTOnce = echt; demoMode = was; }
      return { due: due, naarAdapter: naarAdapter, r: r };
    })()`);
    toets('de pollus vraagt CA01 en CA05 niet op', bus.due.indexOf('CA01') < 0 && bus.due.indexOf('CA05') < 0, bus.due.join(','));
    toets('maar 010C wel (anders toetst dit niets)', bus.due.indexOf('010C') >= 0, bus.due.join(','));
    toets('sendCmd("CA01") komt niet bij de adapter', bus.naarAdapter === 0 && bus.r === '', JSON.stringify(bus));

    console.log('\n3. Een tik rekent uit');
    const tik = await app.ev(`(function(){
      const nu = Date.now();
      pidHist['0106'] = [{ t: nu, v: 3.1 }]; pidHist['0107'] = [{ t: nu, v: -1.6 }];
      const was = connected; connected = true;
      try { PLBerekend.tik(); } finally { connected = was; }
      const oud = Date.now() - 10000;
      pidHist['0106'] = [{ t: oud, v: 9 }]; pidHist['0107'] = [{ t: oud, v: 9 }];
      delete pidVals.CA05;
      connected = true;
      try { PLBerekend.tik(); } finally { connected = was; }
      return { vers: pidHist.CA05 && pidHist.CA05[0].v, naOud: pidVals.CA05, bronnen: ['0106','0107'].every(p=>activePIDs.has(p)),
               def: getPidDef('CA05') && getPidDef('CA05').name };
    })()`);
    toets('CA05 = korte + lange trim uit verse bronnen (1,5 %)', tik.vers === 1.5, JSON.stringify(tik));
    toets('met bronnen van 10 s oud komt er geen waarde', tik.naOud === undefined, JSON.stringify(tik));
    toets('de bronnen 0106 en 0107 zijn erbij gezet', tik.bronnen, JSON.stringify(tik));
    toets('getPidDef kent de naam (rapport en AI)', /Brandstoftrim totaal/.test(tik.def || ''), tik.def);
  } finally {
    await app.stop();
  }
  console.log('\n' + (fouten ? 'bproef-berekend: ' + fouten + ' FOUT' : 'bproef-berekend: alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error('bproef-berekend brak af: ' + (e && e.stack || e)); process.exit(1); });
