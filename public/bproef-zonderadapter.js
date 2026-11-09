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

    console.log('\n2b. Kopen zonder adapter: het papierenrapport (#705)');
    // Het RDW is in de browserproef niet bereikbaar: PLZonder.haal en
    // PLRecall.check krijgen een vaste rij. De rest is de echte code, ook
    // PLAankoop.signalen() en autoKennisVoorMerk().
    await app.ev(`(function(){
      window._nepRdw = { kenteken:'AB123C', merk:'VOLKSWAGEN', handelsbenaming:'GOLF', tellerstandoordeel:'Onlogisch', vervaldatum_apk:'20270601',
        export_indicator:'Nee', tenaamstellen_mogelijk:'Ja', wam_verzekerd:'Ja', openstaande_terugroepactie_indicator:'Nee', datum_eerste_toelating:'20120301', cilinderinhoud:'1395' };
      PLZonder.haal = async function(){ return { rij: window._nepRdw, bs: [{ brandstof_omschrijving:'Benzine', brandstofverbruik_gecombineerd:'5.4' }], overzicht: { naam:'VOLKSWAGEN GOLF', regels: [] } }; };
      if (window.PLRecall) PLRecall.check = async function(){ return null; };
      connected=false; demoMode=false; PLWizard.open('handel'); PLWizard.kies(0); return 'ok'; })()`);
    await rust(400);
    await app.ev(`PLWizard.draai('markt'); 'ok'`);
    await rust(400);
    toets('de adapterkaart biedt het papierenrapport bovenaan', await app.ev(zichtbaar('#wzZonderUit')) && /Papierenrapport/.test(await app.ev(`document.getElementById('wzZonderUit').innerText`)));
    await app.ev(`document.querySelector('#wzZonderUit button').click(); 'ok'`);
    await rust(300);
    toets('het venster vraagt het kenteken', await app.ev(zichtbaar('#pluKent')));
    await app.ev(`document.getElementById('pluKent').value='AB-123-C'; PLZonderUit._papieren(); 'ok'`);
    const oordeel = await (async () => { for (let i = 0; i < 30; i++) { const o = await app.ev(`(document.getElementById('pluOordeel')||{dataset:{}}).dataset.oordeel||''`); if (o) return o; await rust(100); } return ''; })();
    toets('NAP onlogisch → rood oordeel op papier', oordeel === 'rood', oordeel);
    const tekst = await app.ev(`document.getElementById('pluUit').innerText`);
    toets('met zwakke punten van het merk, de bezichtigingslijst en vragen', /zwakke punten/i.test(tekst) && /euromunt/.test(tekst) && /Vragen voor de verkoper/.test(tekst), tekst.slice(0, 300));
    toets('en wat de adapter er nog aan toevoegt', /Niet uitgelezen zonder adapter/.test(tekst));
    await app.ev(`document.getElementById('pluBewaar').click(); 'ok'`);
    toets('bewaren zet het in Rapporten', await app.ev(`(window._sessionReports||[]).some(function(r){ return r.type==='papieren' && /PAPIERENRAPPORT/.test(r.text); })`));
    await app.ev(`PLZonder.sluit(); 'ok'`);

    console.log('\n2c. Onderhoud en Er is iets mis zonder adapter');
    await app.ev(`PLZonderUit.open('onderhoud'); document.getElementById('pluJaar').value='2015'; document.getElementById('pluKm').value='160000'; document.getElementById('pluOndGo').click(); 'ok'`);
    await rust(200);
    const ond = await app.ev(`document.getElementById('pluUit').innerText`);
    toets('onderhoud: een lijst met richtwaarden, ook zonder laatste beurt', /Remvloeistof/.test(ond) && /Distributieriem/.test(ond) && /laatste beurt/.test(ond), ond.slice(0, 200));
    await app.ev(`PLZonder.sluit(); PLZonderUit.open('klacht', { klachten: ['lampje'] }); 'ok'`);
    await rust(300);
    toets('Er is iets mis: de klachtenwijzer begint meteen bij de eerste vraag', await app.ev(`!!document.querySelector('#plZonderOv [data-plw-a]')`));
    await app.ev(`PLZonder.sluit(); 'ok'`);

    console.log('\n2d. Alle functies: 🔌 en de adapterkaart');
    await app.ev(`connected=false; demoMode=false; PLThuis.teken(); 'ok'`);
    toets('zonder auto: body.pl-zonder-auto', await app.ev(`document.body.classList.contains('pl-zonder-auto')`));
    await app.ev(`document.getElementById('wc-koop').click(); 'ok'`);
    await rust(300);
    toets('Koop-check zonder adapter: de adapterkaart met het papierenrapport', await app.ev(zichtbaar('#pluPoort')) && await app.ev(zichtbaar('#pluAlternatief')));
    await app.ev(`PLZonder.sluit(); 'ok'`);
    await app.ev(`document.getElementById('wc-liveexpert').click(); 'ok'`);
    await rust(300);
    toets('TEGENPROEF: Meekijken als expert mag zonder adapter (geen kaart)', !(await app.ev(zichtbaar('#pluPoort'))));
    await app.ev(`try{ PLRemote.sluitExpert && PLRemote.sluitExpert(); }catch(e){} document.querySelectorAll('.ov:not(.hidden)').forEach(function(o){ if(o.id!=='loginOv') o.classList.add('hidden'); }); 'ok'`);
    await app.ev(`demoMode=true; PLThuis.teken(); document.getElementById('wc-onderhoud').click(); 'ok'`);
    await rust(300);
    toets('TEGENPROEF: in de demo opent de kaart gewoon', !(await app.ev(zichtbaar('#pluPoort'))) && !(await app.ev(`document.body.classList.contains('pl-zonder-auto')`)));
    await app.ev(`try{ closeExtraDash('onderhoudDash'); }catch(e){} demoMode=false; 'ok'`);

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
