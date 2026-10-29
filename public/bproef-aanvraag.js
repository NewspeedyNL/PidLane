// ══════════════════════════════════════════════════════════════════
// bproef-aanvraag.js — Rapporten → ➕ Rapport aanvragen in de echte app (29-10-2026)
// ──────────────────────────────────────────────────────────────────
// In de echte app, met de echte modulevolgorde:
//   1. Rapporten heeft bovenaan de knop "Rapport aanvragen"
//   2. open: alle tien rapporten staan erin — elke module is in de app geladen
//      (een ontbrekende module laat zijn rapport stil wegvallen; hier niet)
//   3. niet verbonden: een rapport dat meet start niet; verbonden (demo) wel,
//      en Volledig onderzoek opent het onderzoeksscherm
//
// Draaien vanuit public/:  node bproef-aanvraag.js   (exit 0 = goed)
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
  const lijst = `(function(){ var k = document.getElementById('srAanvraagKnop'), l = document.getElementById('srAanvraagLijst');
    return { knop: !!k, ids: l ? [].map.call(l.querySelectorAll('.srAanvraag'), function (x) { return x.getAttribute('data-id'); }) : [],
             tekst: l ? l.textContent : '' }; })()`;
  try {
    await app.venster(412, 915);

    console.log('\n1. Rapporten: de knop staat bovenaan');
    await app.ev(`(function(){ connected = false; demoMode = false; window._srAanvraagOpen = false; openReportsOverview(); return true; })()`);
    let v = await app.ev(lijst);
    toets('de knop Rapport aanvragen staat er', v.knop, JSON.stringify(v));
    toets('dicht: nog geen lijst', !v.ids.length, JSON.stringify(v.ids));

    console.log('\n2. Open: alle rapporten');
    await app.ev(`(function(){ srAanvraagWissel(); return true; })()`);
    v = await app.ev(lijst);
    const alle = ['foutcodes', 'onderzoek', 'controle', 'accu', 'mode06', 'rit', 'ai', 'monitor', 'aankoop', 'brandstof'];
    toets('alle tien aan te vragen rapporten staan erin', alle.every((id) => v.ids.indexOf(id) >= 0), 'gevonden: ' + v.ids.join(','));
    toets('niet verbonden: de meetrapporten zeggen dat', /Verbind eerst de adapter/.test(v.tekst), v.tekst.slice(0, 200));

    console.log('\n3. Starten');
    const nee = await app.ev(`(function(){ return { r: srAanvraag('onderzoek'), ov: !!document.getElementById('plOzOv') }; })()`);
    toets('TEGENPROEF: niet verbonden start het onderzoek niet', nee.r === false && !nee.ov, JSON.stringify(nee));
    const ja = await app.ev(`(function(){ demoMode = true; var r = srAanvraag('onderzoek');
      var sh = document.getElementById('reportsOverviewSheet');
      return { r: r, dicht: !sh || sh.style.display === 'none', onderzoek: (function(){ var o = document.getElementById('plOzOv'); return !!o && getComputedStyle(o).display !== 'none'; })() }; })()`);
    toets('in demo start Volledig onderzoek: Rapporten sluit, het onderzoek staat open', ja.r === true && ja.dicht && ja.onderzoek, JSON.stringify(ja));
  } finally {
    await app.stop();
  }
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('  FOUT ' + (e.stack || e)); process.exit(1); });
