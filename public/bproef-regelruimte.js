// ══════════════════════════════════════════════════════════════════
// bproef-regelruimte.js — valt er in een rapportregel iets over de tekst?
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF NIET IN node KAN
//
// Gemeld op 30-09-2026 met een schermafdruk: in Rapporten stond het rode
// bolletje over de titel, de titel was gekrompen tot "I / Foutcode- / ui",
// en de knop "Bekijk" lag eroverheen. Icoon, titel en drie knoppen stonden op
// één regel; op een telefoon met grote tekst bleef er voor de titel niets
// over. Of dat past is een vraag over echte CSS, echte lettergrootte en een
// echte vensterbreedte — dus een browser.
//
// WAT HIER GEMETEN WORDT, op 360 px breed en op tekstgrootte L en M:
//   * het icoon, de tekst en elke knop overlappen elkaar niet
//   * de titel krijgt een bruikbare breedte (niet een paar letters)
//   * alles blijft binnen het venster
//
// Draaien vanuit public/:  node bproef-regelruimte.js
// ══════════════════════════════════════════════════════════════════
'use strict';

const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const MEET = `(function () {
  var r = document.querySelector('#reportsOverviewSheet .srRegel');
  if (!r) return JSON.stringify({ fout: 'geen .srRegel in het rapportenoverzicht' });
  function rect(el) { var b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width }; }
  function over(a, b) { return a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1; }
  var ic = rect(r.querySelector('.srIc')), tx = rect(r.querySelector('.srTekst'));
  var knoppen = Array.prototype.map.call(r.querySelectorAll('.srActs button'), rect);
  var vel = rect(document.querySelector('#reportsOverviewSheet .ai-sheet'));
  return JSON.stringify({
    icoonOverTekst: over(ic, tx),
    knopOverTekst: knoppen.some(function (k) { return over(k, tx); }),
    knopOverIcoon: knoppen.some(function (k) { return over(k, ic); }),
    tekstBreed: Math.round(tx.w),
    binnen: knoppen.concat([ic, tx]).every(function (x) { return x.l >= vel.l - 1 && x.r <= vel.r + 1; }),
    knoppen: knoppen.length
  });
})()`;

(async () => {
  let app;
  try {
    app = await startApp({ root: __dirname, breedte: 360, hoogte: 780 });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') {
      console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]);
      process.exit(0);
    }
    throw e;
  }

  try {
    await app.ev(`(function(){
      window._sessionReports = [{ id: 'r1', type: 'dtc', title: 'Foutcode-uitlezing', text: 'P0420', ts: new Date() }];
      return 1;
    })()`);
    for (const g of ['l', 'm']) {
      console.log('\n' + (g === 'l' ? '1' : '2') + '. Rapporten op 360 px, tekstgrootte ' + g.toUpperCase());
      const m = JSON.parse(await app.ev(`(function(){ setUiScale('${g}'); openReportsOverview(); return ${MEET}; })()`));
      if (m.fout) { toets('meetbaar', false, m.fout); continue; }
      toets('de regel heeft zijn drie knoppen', m.knoppen === 3, JSON.stringify(m));
      toets('het icoon valt niet over de titel', !m.icoonOverTekst, JSON.stringify(m));
      toets('geen knop valt over de titel', !m.knopOverTekst, JSON.stringify(m));
      toets('geen knop valt over het icoon', !m.knopOverIcoon, JSON.stringify(m));
      toets('de titel krijgt ruimte (minstens 150 px)', m.tekstBreed >= 150, 'gemeten ' + m.tekstBreed + ' px');
      toets('alles blijft binnen het venster', m.binnen, JSON.stringify(m));
      await app.ev(`closeReportsOverview(); 1`);
    }
    await app.ev(`setUiScale('m'); 1`);
    console.log('\nbproef-regelruimte: ' + (fouten ? fouten + ' FOUT' : 'alles goed'));
  } finally {
    await app.stop();
  }
  process.exit(fouten ? 1 : 0);
})();
