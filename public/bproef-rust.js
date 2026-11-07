// ══════════════════════════════════════════════════════════════════
// bproef-rust.js — schermtimers slapen in de echte app (#691, 07-11-2026)
// ──────────────────────────────────────────────────────────────────
// In de echte app, met de echte modulevolgorde:
//   1. na de boot hangen de drie schermtimers aan PLRust en lopen ze
//   2. de app uit beeld (visibilitychange): ze zijn weg, en de monitorchip
//      wordt in die tijd niet één keer ververst
//   3. terug in beeld: meteen ververst, en de timers lopen weer
//   4. TEGENPROEF: zonder melding van de wissel tikt de chip gewoon door —
//      de proef meet dus echt het stilvallen, niet een chip die nooit tikt
//
// Draaien vanuit public/:  node bproef-rust.js   (exit 0 = goed)
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
  try {
    console.log('1. Na de boot');
    const b = await app.ev(`(function(){
      return { er: !!window.PLRust, taken: PLRust.taken() };
    })()`);
    const namen = (b.taken || []).map(t => t.naam).sort().join(',');
    toets('PLRust is er', b.er);
    toets('de drie schermtimers hangen eraan', namen === 'bulkdashboard,monitorchip,monitorknop', namen);
    toets('en ze lopen', (b.taken || []).every(t => t.loopt), JSON.stringify(b.taken));

    // De chip tellen: _monChipTick is een globale functie, de timer roept hem bij naam
    const meet = (melden) => app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      let n = 0; const echt = window._monChipTick; window._monChipTick = function(){ n++; return echt.apply(this, arguments); };
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      if (${melden ? 'true' : 'false'}) document.dispatchEvent(new Event('visibilitychange'));
      await wacht(2600);
      const r = { verborgen: n, actief: PLRust.actief() };
      delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
      r.terugMeteen = n - r.verborgen; r.terugActief = PLRust.actief();
      window._monChipTick = echt;
      return r;
    })()`);

    console.log('\n2. Uit beeld en terug');
    const r = await meet(true);
    toets('uit beeld: geen timer meer', r.actief === 0, JSON.stringify(r));
    toets('uit beeld: de chip niet één keer ververst in 2,6 s', r.verborgen === 0, JSON.stringify(r));
    toets('terug: meteen één keer ververst', r.terugMeteen === 1, JSON.stringify(r));
    toets('terug: de drie timers lopen weer', r.terugActief === 3, JSON.stringify(r));

    console.log('\n3. TEGENPROEF — de wissel niet melden');
    const t = await meet(false);
    toets('dan tikt de chip door (minstens twee keer in 2,6 s)', t.verborgen >= 2, JSON.stringify(t));

    toets('geen JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('  FOUT ' + (e.stack || e)); process.exit(1); });
