// ══════════════════════════════════════════════════════════════════
// bproef-vulling.js — staand vult de meter het scherm (24-11-2026)
// ──────────────────────────────────────────────────────────────────
// WAAROM. In de gewone weergave, staand, was Hyperlane een liggende strook
// (2:1) met ringen van 140 px; Temperatuur en Verbruik lieten de onderste
// helft van het scherm leeg. Gemeten op 412×892: het vak van Hyperlane was
// 186 px hoog, de buizen van Temperatuur 170 px.
//
// Wat hier gemeten wordt, in de echte app met de demo-auto:
//   1. staand, gewone weergave: Hyperlane, Temperatuur en Verbruik zijn
//      minstens 440 px hoog, de ringen van Hyperlane minstens 150 px breed,
//      de buizen van Temperatuur langer dan 250 px;
//   2. liggend blijft Hyperlane de liggende strook (2:1).
//
// Draaien vanuit public/:  node bproef-vulling.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));
let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg !== undefined ? ' — ' + uitleg : '')); fouten++; }
}
const W = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let app;
  try { app = await startApp({ root: __dirname }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    await app.venster(412, 892);
    await app.ev(`window.currentUser = { user:'proef', role:'klant', label:'proef' }; startDemoCar(0); true`); await W(2500);
    await app.ev(`(function(){ const o = document.getElementById('loginOv'); if (o) o.style.display = 'none'; PLNav.tab('live'); return true; })()`);
    const toon = async (p) => { await app.ev(`localStorage.setItem('pl_vis_profiel','${p}'); setPidView('slim'); setPidView('visueel'); if(window.PLVisThema) PLVisThema.uit(); true`); await W(1500); };
    const hoog = (sel) => app.ev(`(function(){ const e=document.querySelector('${sel}'); return e ? Math.round(e.getBoundingClientRect().height) : -1; })()`);
    const breed = (sel) => app.ev(`(function(){ const e=document.querySelector('${sel}'); return e ? Math.round(e.getBoundingClientRect().width) : -1; })()`);

    console.log('\n── 1. staand, gewone weergave ──');
    await toon('hyperlane');
    const h = await hoog('.vis .vpf-hyper'), r = await breed('.vis .vpf-hyper .vhl-pod.l');
    toets('Hyperlane vult de hoogte (≥ 440 px)', h >= 440, h);
    toets('de ringen zijn leesbaar groot (≥ 150 px)', r >= 150, r);
    await toon('temp');
    toets('Temperatuur vult de hoogte (≥ 440 px)', (await hoog('.vis .vpf-glas')) >= 440, await hoog('.vis .vpf-glas'));
    toets('de buizen groeien mee (> 250 px)', (await hoog('.vis .vpf-glas .vpf-tube')) > 250, await hoog('.vis .vpf-glas .vpf-tube'));
    await toon('verbruik');
    toets('Verbruik vult de hoogte (≥ 440 px)', (await hoog('.vis .vpf-digitaal')) >= 440, await hoog('.vis .vpf-digitaal'));

    console.log('\n── 2. liggend ──');
    await app.venster(892, 412);
    await toon('hyperlane');
    const hl = await hoog('.vis .vpf-hyper'), bl = await breed('.vis .vpf-hyper');
    toets('Hyperlane blijft de liggende strook (2:1)', bl > 0 && Math.abs(bl / hl - 2) < 0.1, bl + '×' + hl);
    toets('geen JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally { await app.stop(); }
  console.log('\nbproef-vulling: ' + (fouten ? fouten + ' fout(en)' : 'alles goed'));
  process.exit(fouten ? 1 : 0);
})();
