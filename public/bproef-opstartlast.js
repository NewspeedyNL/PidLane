// ══════════════════════════════════════════════════════════════════
// bproef-opstartlast.js — wat de app bij elke start laadt (#690, 08-11-2026)
// ──────────────────────────────────────────────────────────────────
// De foto van de 1-euro-bandentest stond als base64 in pidlane-assets.js
// (205 KB) en werd bij elke start geparsed, ook door wie de bandencheck
// nooit opent. Nu is hij een los bestand dat pas laadt als hij in beeld komt.
//   1. de boot vraagt pidlane-assets.js en de foto niet op
//   2. de bandencheck toont de foto wél, en hij laadt echt (900×600)
//   3. TEGENPROEF: de foto komt pas na het openen in de verzoeken — de proef
//      ziet dus echt wanneer hij geladen wordt
//
// Draaien vanuit public/:  node bproef-opstartlast.js   (exit 0 = goed)
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
  try { app = await startApp({ root: path.join(__dirname) }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    console.log('1. De boot');
    toets('geen JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('pidlane-assets.js wordt niet meer geladen', !app.verzoeken.some(p => /pidlane-assets\.js$/.test(p)), app.verzoeken.filter(p => /assets/.test(p)).join(','));
    toets('de bandenfoto ook niet', !app.verzoeken.some(p => /banden-euromunt\.webp$/.test(p)));
    toets('geen 205 KB base64 meer in de pagina', await app.ev(`typeof window.BANDEN_IMG === 'undefined'`));

    console.log('\n2. De bandencheck');
    await app.ev(`showBandenInfo(); 'ok'`);
    let geladen = null;
    for (let i = 0; i < 40 && !geladen; i++) {
      geladen = await app.ev(`(function(){ const i = document.querySelector('#bandenInfoModal img'); return i && i.complete && i.naturalWidth ? i.naturalWidth + 'x' + i.naturalHeight : null; })()`);
      if (!geladen) await rust(200);
    }
    toets('de foto staat er en laadt (900×600)', geladen === '900x600', String(geladen));
    toets('TEGENPROEF: pas nu is hij opgevraagd', app.verzoeken.some(p => /banden-euromunt\.webp$/.test(p)));
    // capacitor.js bestaat alleen in de Android-build; in de browser ontbreekt hij altijd.
    const gemist = app.gemist.filter(p => !/capacitor\.js$/.test(p));
    toets('niets gemist', gemist.length === 0, gemist.join(','));
  } finally {
    await app.stop();
  }
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('  FOUT ' + (e.stack || e)); process.exit(1); });
