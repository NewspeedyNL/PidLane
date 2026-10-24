// ══════════════════════════════════════════════════════════════════
// bproef-meetcoach.js — de balk van de meetcoach in de echte Live (24-10-2026)
// ──────────────────────────────────────────────────────────────────
// In de echte app, met de echte modulevolgorde:
//   1. admin + verbonden: de vraag "Tijd voor meetproeven?" staat bovenaan Live
//   2. duur kiezen en Start: de balk met één actie staat er
//   3. TEGENPROEF: geen admin → geen balk, ook niet na een tik
//
// Draaien vanuit public/:  node bproef-meetcoach.js   (exit 0 = goed)
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
  const balk = `(function(){ var el = document.getElementById('mcBalk'), pane = document.getElementById('pane-live');
    return { er: !!el, eerst: !!(el && pane && pane.firstElementChild === el), verborgen: !el || el.hidden,
             tekst: el ? el.textContent : '' }; })()`;
  try {
    await app.venster(412, 915);

    console.log('\n1. Admin en verbonden: de vraag staat bovenaan Live');
    await app.ev(`(function(){ window.magOntwikkelen = function(){ return true; }; connected = true; demoMode = false;
      PLMeetcoach.tik(); return true; })()`);
    const v = await app.ev(balk);
    toets('de meetcoach staat als eerste in Live', v.er && v.eerst && !v.verborgen, JSON.stringify(v));
    toets('met de vraag', /Tijd voor meetproeven/.test(v.tekst), v.tekst);

    console.log('\n2. Duur kiezen en Start');
    await app.ev(`(function(){ PLMeetcoach.kiesDuur('middel'); PLMeetcoach.kiesSit('stoplicht'); PLMeetcoach.start(); return true; })()`);
    const b = await app.ev(balk);
    toets('de vraag is weg, de balk staat er', !/Tijd voor meetproeven/.test(b.tekst) && /klaar/.test(b.tekst), b.tekst);

    console.log('\n3. TEGENPROEF — geen admin');
    await app.ev(`(function(){ window.magOntwikkelen = function(){ return false; }; PLMeetcoach.tik(); return true; })()`);
    const g = await app.ev(balk);
    toets('dan geen balk', g.verborgen && !g.tekst, JSON.stringify(g));
  } finally {
    await app.stop();
  }
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('  FOUT ' + (e.stack || e)); process.exit(1); });
