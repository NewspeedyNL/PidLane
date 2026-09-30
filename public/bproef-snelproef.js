// ══════════════════════════════════════════════════════════════════
// bproef-snelproef.js — hangt de snelheidsproef in de ECHTE app?
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF NIET IN node KAN
//
// test-snelproef.js toetst de stappen zelf, met een nagemaakt menu en een
// nagemaakte bus. Wat hij niet toetst: of de knop werkelijk in het
// Admin-menu van de app komt (#admGroup bestaat pas na de echte boot), of het
// paneel met de échte stijlen en de échte PLBus opent, en of stap 1 zonder
// verbinding netjes "niet verbonden" zegt in plaats van een fout te gooien.
//
// Draaien vanuit public/:  node bproef-snelproef.js
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
    app = await startApp({ root: __dirname });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') {
      console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]);
      process.exit(0);
    }
    throw e;
  }

  try {
    console.log('\n1. De knop hangt in het echte Admin-menu');
    const k = JSON.parse(await app.ev(`(function(){
      var groep = document.getElementById('admGroup'), el = document.getElementById('plSnelMenu');
      return JSON.stringify({ module: !!window.PLSnelProef, inMenu: !!(el && groep && groep.contains(el)),
        klasse: !!(el && /kebab-item/.test(el.className)), uniek: document.querySelectorAll('#plSnelMenu').length });
    })()`));
    toets('PLSnelProef bestaat na een echte boot', k.module, JSON.stringify(k));
    toets('de knop hangt in #admGroup', k.inMenu, JSON.stringify(k));
    toets('met de opmaak van de andere menuknoppen', k.klasse, JSON.stringify(k));
    toets('en één keer', k.uniek === 1, JSON.stringify(k));

    console.log('\n2. Het paneel opent, en alleen knop 1 is te drukken');
    await app.ev(`window.__fouten = []; window.addEventListener('error', function (e) { window.__fouten.push(String(e.message)); });
      try { localStorage.removeItem('pl_snelproef'); } catch (e) {}
      document.getElementById('plSnelMenu').click(); 1`);
    const p = JSON.parse(await app.ev(`(function(){
      var v = document.getElementById('plSnelProef');
      var knop = function (n) { var b = document.getElementById('plSnel' + n); return b ? !b.disabled : null; };
      return JSON.stringify({ open: !!v, tekst: v ? v.textContent : '', k1: knop(1), k2: knop(2), k6: knop(6),
        breedte: v ? v.getBoundingClientRect().width : 0, scherm: window.innerWidth });
    })()`));
    toets('het paneel staat er', p.open, JSON.stringify(p).slice(0, 200));
    toets('knop 1 is te drukken, 2 en 6 niet', p.k1 === true && p.k2 === false && p.k6 === false, JSON.stringify(p).slice(0, 200));
    toets('het doel van 10 verzoeken/s staat erbij', /10 verzoeken per seconde/.test(p.tekst), p.tekst.slice(0, 200));
    toets('het paneel past op het scherm', p.breedte > 0 && p.breedte <= p.scherm, p.breedte + ' van ' + p.scherm);

    console.log('\n3. Stap 1 zonder verbinding zegt dat, zonder fout in de console');
    await app.ev(`document.getElementById('plSnel1').click(); 1`);
    await app.ev(`new Promise(function (klaar) { var n = 0; var i = setInterval(function () {
      var v = document.getElementById('plSnelProef');
      if ((v && /Lukte niet/.test(v.textContent)) || ++n > 80) { clearInterval(i); klaar(1); } }, 100); })`);
    const s = JSON.parse(await app.ev(`JSON.stringify({ tekst: (document.getElementById('plSnelProef') || {}).textContent || '',
      fouten: window.__fouten, bewaard: !!PLSnelProef.stand().stappen[1],
      inLog: (typeof plLokaalLog === 'function' ? plLokaalLog() : []).some(function (r) { return /Snelheidsproef stap 1 lukte niet: niet verbonden/.test(r && r.msg || ''); }) })`));
    toets('het paneel zegt "niet verbonden"', /Lukte niet: niet verbonden/.test(s.tekst), s.tekst.slice(0, 300));
    toets('er is niets bewaard voor stap 1', s.bewaard === false, JSON.stringify(s).slice(0, 200));
    toets('het logboek zegt het ook', s.inLog, JSON.stringify(s).slice(0, 200));
    toets('zonder fouten in de console', s.fouten.length === 0, JSON.stringify(s.fouten));

    console.log('\nbproef-snelproef: ' + (fouten ? fouten + ' FOUT' : 'alles goed'));
  } finally {
    await app.stop();
  }
  process.exit(fouten ? 1 : 0);
})();
