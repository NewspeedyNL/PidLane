// ═══════════════════════════════════════════════════════════════════
// bproef-terugknop.js — sluit de Android-terugknop elk venster met een ✕?
// ───────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// appBack() in pidlane-archief.js kende tot 26-09-2026 alleen een vaste lijst
// van zestien vensters. De app heeft er ruim dertig met een ✕, en elk venster
// dat later bijkwam reageerde niet op de terugknop. Nu drukt de terugknop het
// ✕ in van het venster dat bovenop ligt.
//
// Dat "bovenop" is een vraag die node niet kan beantwoorden: het hangt af van
// getComputedStyle, z-index en elementFromPoint in een echte pagina. Daarom
// draait deze proef in de echte app, met vensters die NIET in de vaste lijst
// staan (waakronde, bulk-analyse, bulk-recorder).
//
// Wat hier getoetst wordt:
//   1. elk van die vensters gaat dicht met één tik op terug
//   2. twee vensters over elkaar: terug sluit het bovenste, het onderste
//      blijft staan; een tweede tik sluit ook dat
//   3. TEGENPROEF: met de ✕-zoeker uitgeschakeld blijft zo'n venster open.
//      Anders sloot iets anders het, en meet deel 1 niet wat hij zegt.
//
// Draaien vanuit public/:  node bproef-terugknop.js
// ═══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// In de pagina: open een venster, tik terug, kijk of het weg is.
const HULP = `
  window.__zicht = function (id) {
    const e = document.getElementById(id);
    if (!e || !e.isConnected) return false;
    const cs = getComputedStyle(e);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  };
  window.__wacht = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
`;

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
    await app.ev(HULP + `window.currentUser = { user:'proef', role:'admin', label:'proef' }; true`);

    console.log('\n1. Eén tik op terug sluit het venster');
    const vensters = [
      ['waakronde',      'PLWaakUI.open()',  'wkvOv'],
      ['bulk-analyse',   'PLBulkUI.open()',  'blvOv'],
      ['bulk-recorder',  'PLBulk.open()',    'blkOverlay'],
    ];
    for (const [naam, open, id] of vensters) {
      const r = await app.ev(`(async function(){
        ${open};
        await __wacht(250);
        const open = __zicht('${id}');
        _plBackHandler();
        await __wacht(250);
        return { open: open, dicht: !__zicht('${id}') };
      })()`);
      toets(naam + ': gaat open', r.open, 'het venster verscheen niet — dan toetst de rest niets');
      toets(naam + ': terug sluit het', r.open && r.dicht, 'het venster staat na de terugknop nog open');
    }

    console.log('\n2. Twee vensters over elkaar: de bovenste eerst');
    const stapel = await app.ev(`(async function(){
      PLWaakUI.open(); await __wacht(150);
      PLBulkUI.open(); await __wacht(250);
      const beide = __zicht('wkvOv') && __zicht('blvOv');
      _plBackHandler(); await __wacht(250);
      const naEen = { waak: __zicht('wkvOv'), bulk: __zicht('blvOv') };
      _plBackHandler(); await __wacht(250);
      const naTwee = { waak: __zicht('wkvOv'), bulk: __zicht('blvOv') };
      return { beide: beide, naEen: naEen, naTwee: naTwee };
    })()`);
    toets('beide staan open', stapel.beide);
    toets('de eerste tik sluit alleen het bovenste (bulk-analyse)',
      stapel.naEen.bulk === false && stapel.naEen.waak === true,
      'na één tik: ' + JSON.stringify(stapel.naEen));
    toets('de tweede tik sluit ook het onderste',
      stapel.naTwee.bulk === false && stapel.naTwee.waak === false,
      'na twee tikken: ' + JSON.stringify(stapel.naTwee));

    console.log('\n3. TEGENPROEF — zonder de ✕-zoeker blijft het venster staan');
    const tegen = await app.ev(`(async function(){
      const echt = window._plBovensteSluitKnop;
      window._plBovensteSluitKnop = function () { return null; };
      try {
        PLWaakUI.open(); await __wacht(250);
        _plBackHandler(); await __wacht(250);
        return { open: __zicht('wkvOv') };
      } finally {
        window._plBovensteSluitKnop = echt;
        try { PLWaakUI.sluit(); } catch (e) { console.warn(e); }
      }
    })()`);
    toets('zonder de zoeker sluit de terugknop de waakronde niet', tegen.open,
      'het venster ging toch dicht — dan sluit iets anders het en meet deel 1 niet de zoeker');

  } finally {
    await app.stop();
  }

  console.log('\n' + (fouten ? 'bproef-terugknop: ' + fouten + ' FOUT' : 'bproef-terugknop: alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error('bproef-terugknop brak af: ' + (e && e.stack || e)); process.exit(1); });
