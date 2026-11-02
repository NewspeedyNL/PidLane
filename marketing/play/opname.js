// opname.js — neemt de schermen op voor de Play Store-vermelding (02-11-2026)
// De echte app in demomodus (een gesimuleerde Mazda CX-5): geen mockup, geen
// verzonnen waarden. Het meekijken komt uit ../meekijken/opname.js (twee
// toestellen, nep-server); draai dat eerst. Daarna: node marketing/play/opname.js
// Uitvoer: marketing/play/rauw/*.png, daarna render.sh voor de opmaak.
'use strict';
const path = require('path'), fs = require('fs');
const { startApp } = require(path.join(__dirname, '..', '..', 'plbrowser.js'));
const UIT = path.join(__dirname, 'rauw');
const z = ms => new Promise(r => setTimeout(r, ms));

const KAAL = `(function(){
  document.head.insertAdjacentHTML('beforeend','<style>#bronBanner,#plZonderKaart{display:none!important}</style>');
  const lo=document.getElementById('loginOv'); if(lo) lo.classList.add('hidden');
  const w=document.getElementById('welcomeScreen'); if(w) w.classList.add('hidden');
  return true; })()`;

async function demo(a) {
  await a.ev(KAAL);
  await a.ev(`startDemoCar(0); true`);
  await z(6000);                                  // de demo-auto rijdt en de waarden lopen
}
async function neem(a, naam, voorbereiding, wacht) {
  try {
    await a.ev(`(async function(){ ${voorbereiding} })()`);
    await z(wacht || 2500);
    await a.schermafdruk(path.join(UIT, naam + '.png'));
    console.log('  ' + naam);
  } catch (e) { console.log('  FOUT ' + naam + ': ' + e.message); }
}

(async () => {
  fs.mkdirSync(UIT, { recursive: true });
  const a = await startApp({ root: path.join(__dirname, '..', '..', 'public') });
  try {
    // Staand: 412×915 op 2× = 824×1830
    await a.venster(412, 915);
    await demo(a);
    await neem(a, 'thuis', `PLNav.tab('auto');`);
    await neem(a, 'visueel-stand', `localStorage.setItem('pl_hl_vorm','sterren');
      PLNav.tab('live'); PLVisProfiel.bewaar('hyperlane'); setPidView('overzicht'); await new Promise(r=>setTimeout(r,200)); setPidView('visueel');
      await new Promise(r=>setTimeout(r,3500)); PLHyperlane.zetStand('eco'); PLVisueel.herbouwKeuze(); await new Promise(r=>setTimeout(r,2500));
      document.querySelector('.gg.view-visueel .vhl-modus').click();`, 1200);
    await neem(a, 'slim', `PLHyperlane.zetStand('auto'); PLNav.tab('live'); setPidView('slim');`, 4000);
    await neem(a, 'grafiek', `PLNav.tab('live'); document.getElementById('tabGraph').click();
      await new Promise(r=>setTimeout(r,800));
      const k=[...document.querySelectorAll('#pane-graph button, button')].find(b=>/Brandstof/.test(b.textContent) && b.offsetParent);
      if(!k) throw new Error('groepsknop Brandstof niet gevonden'); k.click();`, 15000);
    await neem(a, 'accu', `PLNav.tab('live'); PLAccu.open();`, 3500);
    await a.ev(`try{PLAccu.sluit()}catch(e){} true`);
    // Liggend, volledig scherm: 915×412 op 2× = 1830×824
    await a.venster(915, 412);
    await neem(a, 'hyperlane-liggend', `localStorage.setItem('pl_hl_vorm','tunnel'); PLHyperlane.zetStand('auto');
      PLNav.tab('live'); setPidView('overzicht'); await new Promise(r=>setTimeout(r,200)); setPidView('visueel');
      await new Promise(r=>setTimeout(r,1500)); document.querySelector('.gg.view-visueel .vt-vol').click();`, 6000);
    if (a.fouten.length) console.log('LET OP  JS-fouten: ' + a.fouten.slice(0, 3).join(' | '));
  } finally { await a.stop(); }
})();
