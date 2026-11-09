// ══════════════════════════════════════════════════════════════════
// bproef-zonderadapter.js — de app zonder adapter, in de echte app (09-11-2026)
// ──────────────────────────────────────────────────────────────────
// Zonder verbinding liep elke wizardmodule zijn eigen weg: de sensorcontrole
// "verzamelde" 0 sensoren in 0 s en meldde een verbroken verbinding, vijf
// andere wisselden stil van tabblad. Nu één poort in PLWizard: een kaart met
// wat er nodig is, wat zonder adapter al kan, en terug naar het plan.
//
// DE TEGENPROEVEN DIE ERIN ZITTEN
//   • In de demo gaat dezelfde module gewoon door: de poort kijkt naar de
//     auto, niet naar "altijd blokkeren".
//   • De vragenlijst van Storing vangen (diep) opent wél zonder adapter.
//
// Draaien vanuit public/:  node bproef-zonderadapter.js
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
const zichtbaar = (sel) => `(function(){ const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; const s=getComputedStyle(e); return s.display!=='none' && s.visibility!=='hidden' && !e.classList.contains('hidden') && !e.hidden && e.getClientRects().length>0; })()`;

(async () => {
  let app;
  try { app = await startApp({ root: path.join(__dirname) }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  const plan = async () => {
    // Voorbereiden → De winter: een plan met meetmodules, zonder vrije tekst.
    await app.ev(`(function(){ connected=false; demoMode=false; PLWizard.open('voorbereiding'); PLWizard.kies(0); return 'ok'; })()`);
    await rust(400);
  };
  try {
    console.log('\n1. Het plan zegt dat meten een adapter vraagt');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    await plan();
    toets('het plan staat er', await app.ev(`!!document.getElementById('wzMeting')`), await app.ev(`(document.getElementById('wzBody')||{}).innerText`));
    toets('met de regel "nog geen adapter verbonden"', await app.ev(zichtbaar('#wzZonderAdapter')));

    console.log('\n2. Een module zonder adapter: de kaart, geen lege meting');
    await app.ev(`PLWizard.draai('systeem'); 'ok'`);
    await rust(600);
    toets('de kaart "Hiervoor is de adapter nodig"', await app.ev(zichtbaar('#wzAdapterNodig')));
    toets('geen verzamelscherm met 0 sensoren', !(await app.ev(zichtbaar('#plVzOv'))));
    toets('de kaart biedt Verbinden, Kenteken-check en de demo', await app.ev(`!!document.getElementById('wzVerbind') && /Kenteken-check/.test(document.getElementById('wzBody').innerText) && /demo/.test(document.getElementById('wzBody').innerText)`));
    await app.ev(`document.getElementById('wzNaarPlan').click(); 'ok'`);
    toets('terug naar het plan: het plan staat er nog', await app.ev(`!!document.getElementById('wzMeting')`));
    await app.ev(`PLWizard.start(); 'ok'`);
    await rust(400);
    toets('Beginnen (de meting) zonder adapter: ook de kaart', await app.ev(zichtbaar('#wzAdapterNodig')));
    await app.ev(`PLWizard.zonder('kenteken'); 'ok'`);
    await rust(500);
    toets('Kenteken-check vanaf de kaart opent', await app.ev(zichtbaar('#plZonderOv')));
    await app.ev(`PLZonder.sluit(); 'ok'`);

    console.log('\n3. De tegenproeven');
    await plan();
    await app.ev(`demoMode = true; PLWizard.draai('dtc'); 'ok'`);
    await rust(600);
    toets('TEGENPROEF: in de demo gaat de module door (geen kaart)', !(await app.ev(zichtbaar('#wzAdapterNodig'))));
    await app.ev(`demoMode = false; 'ok'`);
    toets('TEGENPROEF: de vragenlijst van Storing vangen mag zonder adapter', await app.ev(`!PLWizard._kern.adapterNodig('diep') && PLWizard._kern.adapterNodig('systeem')`));
    toets('de app draait nog zonder fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log('\n─────────────────────────────────────────');
  if (fouten) { console.log('bproef-zonderadapter: ' + fouten + ' FOUT\n'); process.exit(1); }
  console.log('bproef-zonderadapter: goed\n');
  process.exit(0);
})().catch(e => { console.error('bproef-zonderadapter brak af: ' + e.message); process.exit(1); });
