// ══════════════════════════════════════════════════════════════════
// bproef-adapterstil.js — een adapter die niet op pair staat (#476)
// ──────────────────────────────────────────────────────────────────
// Uit het gebruik (13-10-2026): stond de adapter niet op pair, dan kwam de
// verbinding toch tot stand, gaf 0100 niets en vroeg de app om een
// protocol. Daarna stonden er geen PIDs. App dicht, adapter op pair, opnieuw
// verbinden: alles werkte. Een protocol kiezen lost een zwijgende adapter
// niet op.
//
// Deze proef draait de echte scanNetworks() tegen de nep-adapter:
//   1. 0100 en ATI geven niets → "Adapter reageert niet", geen protocollijst
//   2. TEGENPROEF: ATI antwoordt → de adapter leeft, de auto zwijgt, en dan
//      is de protocolkeuze wél het goede scherm
//   3. "Toch zelf een protocol kiezen" toont de lijst alsnog
//
// Draaien vanuit public/:  node bproef-adapterstil.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
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
  try {
    app = await startApp({ root: path.join(__dirname) });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  const scherm = `({ titel: document.getElementById('step2Title').textContent,
    kaarten: document.querySelectorAll('#networkList .network-card').length,
    knoppen: document.getElementById('connActions').textContent,
    log: (window._plNepLog||[]).join(' ') })`;
  // De kentekenpoort staat vóór de protocolscan; die is hier niet het onderwerp.
  const scan = `(async function(){ _kentPoortKlaar = true; await scanNetworks(); return true; })()`;
  try {
    await app.venster(412, 915);

    console.log('\n1. De adapter zwijgt op 0100 én op ATI');
    await app.nepAdapter({ 'ATSP0': '', '0100': '', 'ATI': '' });
    await app.ev(scan);
    const stil = await app.ev(scherm);
    toets('de titel zegt dat de adapter niet reageert', stil.titel === 'Adapter reageert niet', JSON.stringify(stil));
    toets('er staat geen protocollijst', stil.kaarten === 0, JSON.stringify(stil));
    toets('wel een knop om opnieuw te verbinden', /Opnieuw verbinden/.test(stil.knoppen), stil.knoppen);
    toets('de app vroeg de adapter zelf (ATI) vóór hij oordeelde', /\bATI\b/.test(stil.log), stil.log);

    console.log('\n2. TEGENPROEF — de adapter antwoordt, alleen de auto zwijgt');
    await app.nepAdapter({ 'ATSP0': 'OK', '0100': '', 'ATI': 'ELM327 v1.5' });
    await app.ev(scan);
    const auto = await app.ev(scherm);
    toets('dan wél de protocolkeuze', auto.titel === 'Kies het protocol handmatig' && auto.kaarten > 0, JSON.stringify(auto));

    console.log('\n3. Toch zelf een protocol kiezen');
    await app.nepAdapter({ 'ATSP0': '', '0100': '', 'ATI': '' });
    await app.ev(scan);
    await app.ev(`adapterTochKiezen(); true`);
    const toch = await app.ev(scherm);
    toets('de lijst staat er alsnog', toch.kaarten > 0, JSON.stringify(toch));

    toets('geen JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log('\n' + (fouten ? 'bproef-adapterstil: ' + fouten + ' fout(en)' : 'bproef-adapterstil: alles goed'));
  process.exit(fouten ? 1 : 0);
})();
