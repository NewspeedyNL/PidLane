// bproef-visthema.js — Slim visueel op het volle scherm, met thema (18-10-2026)
//
// Wat test-visthema.js niet kan zien: of de knop ⛶ in de echte meter staat,
// of het volle scherm de app echt bedekt (een voorouder met transform zou
// position:fixed vangen), of een thema de kleur van de plaat verandert, of
// de terugknop het volle scherm sluit, en of het thema daarna weg is.
//
// Tegenproef: na sluiten moet de plaat weer de standaardkleur hebben. Blijft
// het thema hangen buiten het volle scherm, dan zegt deze proef dat.
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
  try { app = await startApp({ root: __dirname }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    await app.venster(412, 915);
    console.log('\n1. De Basismeter, en de knop ⛶');
    await app.ev(`startDemoCar(0); true`);
    await new Promise(r => setTimeout(r, 1500));
    const r = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      // Het loginscherm en de bronbalk van de proefomgeving liggen hoger dan
      // een modal; in de app zijn ze weg als je rijdt.
      const lo = document.getElementById('loginOv'); if (lo) lo.classList.add('hidden');
      const bb = document.getElementById('bronBanner'); if (bb) bb.style.display = 'none';
      document.getElementById('welcomeScreen').classList.add('hidden');
      sw('live', null);
      localStorage.removeItem('pl_vis_thema');
      PLVisProfiel.bewaar('basis');
      setPidView('visueel');
      await wacht(300);
      await wacht(800);
      const vis = () => document.querySelector('.gg.view-visueel .vis');
      const plaat = () => getComputedStyle(document.querySelector('.vis-plaat')).fill;
      const r = { knop: !!vis().querySelector('.vt-vol'), zichtbaar: getComputedStyle(vis().querySelector('.vt-vol')).display !== 'none',
                  defs: !!vis().querySelector('svg.vis-meter .vt-defs'), plaat0: plaat(), thema0: vis().getAttribute('data-vthema') };
      // Sinds 20-10-2026: kiezen kan ook in de gewone weergave.
      r.themaKnopGewoon = getComputedStyle(vis().querySelector('.vt-thema')).display !== 'none';
      vis().querySelector('.vt-thema').click();
      r.strookGewoon = vis().querySelectorAll('.vt-keus').length;
      vis().querySelector('.vt-keus[data-thema="neon"]').click();
      await wacht(100);
      r.themaGewoon = vis().getAttribute('data-vthema'); r.plaatGewoon = plaat();
      vis().querySelector('.vt-keus[data-thema="standaard"]').click();
      await wacht(100);
      r.plaatTerug = plaat();
      vis().querySelector('.vt-thema').click();   // strook dicht
      vis().querySelector('.vt-vol').click();
      await wacht(300);
      const b = vis().getBoundingClientRect();
      r.vol = document.body.classList.contains('pl-vis-vol');
      r.dekt = b.left <= 0 && b.top <= 0 && b.width >= innerWidth - 1 && b.height >= innerHeight - 1;
      const midden = document.elementFromPoint(innerWidth/2, innerHeight - 30);
      r.bovenop = !!midden && !!midden.closest('.vis');
      r.thema1 = vis().getAttribute('data-vthema');
      r.n = PLVisThema.THEMAS.length;
      vis().querySelector('.vt-thema').click();
      r.strook = [...vis().querySelectorAll('.vt-keus')].map(k => k.getAttribute('data-thema'));
      vis().querySelector('.vt-keus[data-thema="chroom"]').click();
      await wacht(100);
      r.thema2 = vis().getAttribute('data-vthema');
      r.plaat2 = plaat();
      r.bewaard = localStorage.getItem('pl_vis_thema');
      // Een herbouw (andere sensor, nieuwe auto) gooit innerHTML weg: het thema blijft.
      PLVisueel.bouw(document.querySelector('.gg.view-visueel'), 'test');
      r.naHerbouw = vis().getAttribute('data-vthema');
      r.knopNaHerbouw = !!vis().querySelector('.vt-uit');
      // Vegen naar een profiel (temperatuur, neon…) bouwt de .vis ook opnieuw.
      PLVisueel.volgende(); await wacht(300);
      r.profiel = PLVisueel.profiel();
      r.profielThema = vis().getAttribute('data-vthema');
      r.profielKnop = !!vis().querySelector('.vt-uit');
      for (let i = 0; i < 8 && PLVisueel.profiel() !== 'basis'; i++) PLVisueel.volgende();
      await wacht(300);
      appBack();
      await wacht(200);
      r.dichtNaTerug = !document.body.classList.contains('pl-vis-vol');
      r.thema3 = vis().getAttribute('data-vthema');
      r.plaat3 = plaat();
      r.strookWeg = !vis().querySelector('.vt-strook');
      PLVisThema.aan(); await wacht(100);
      r.themaWeer = vis().getAttribute('data-vthema');
      setPidView('overzicht'); await wacht(300);
      r.dichtNaWissel = !document.body.classList.contains('pl-vis-vol');
      return r;
    })()`);
    toets('de knop ⛶ staat boven de meter', r.knop && r.zichtbaar, JSON.stringify(r));
    toets('de verlopen staan in de meter', r.defs, JSON.stringify(r));
    toets('zonder keuze: Standaard, de gewone meter', r.thema0 === 'standaard', JSON.stringify(r));
    // Sinds 28-10-2026 staat de basismeter in de Hyperlane-schil: geen palet meer,
    // de kleur komt van het rijgedrag (keuze van de gebruiker: "oude looks vervangen").
    toets('geen palet meer in de gewone weergave (de basismeter staat in de Hyperlane-schil)', !r.themaKnopGewoon, JSON.stringify(r));
    toets('Neon kiezen in de gewone weergave verandert de plaat', r.themaGewoon === 'neon' && r.plaatGewoon !== r.plaat0, JSON.stringify(r));
    toets('…en Standaard geeft de gewone meter terug (tegenproef)', r.plaatTerug === r.plaat0, JSON.stringify(r));
    console.log('\n2. Volledig scherm en een thema kiezen');
    toets('tikken zet het volle scherm aan', r.vol, JSON.stringify(r));
    toets('…en de meter bedekt het hele scherm, boven de navigatie', r.dekt && r.bovenop, JSON.stringify(r));
    toets('op het volle scherm geldt het thema (eerst Standaard)', r.thema1 === 'standaard', JSON.stringify(r));
    toets('de themaknop opent de strook met alle thema\'s', r.strook.length === r.n && r.strook[0] === 'standaard', JSON.stringify(r.strook));
    toets('Chroom kiezen verandert de plaat en wordt onthouden', r.thema2 === 'chroom' && r.plaat2 !== r.plaat0 && r.bewaard === 'chroom', JSON.stringify(r));
    toets('een herbouw van de meter houdt de knoppen; de basismeter zelf blijft zonder thema', r.naHerbouw === 'standaard' && r.knopNaHerbouw, JSON.stringify(r));
    toets('ook een profiel houdt op het volle scherm het thema en de knoppen', r.profiel !== 'basis' && r.profielThema === 'chroom' && r.profielKnop, JSON.stringify(r));
    console.log('\n3. Terug uit het volle scherm');
    toets('de terugknop sluit het volle scherm', r.dichtNaTerug, JSON.stringify(r));
    toets('…en het gekozen thema blijft in de gewone weergave, zonder open strook', r.thema3 === 'chroom' && r.plaat3 === r.plaat2 && r.strookWeg, JSON.stringify(r));
    toets('weer openen geeft het onthouden thema', r.themaWeer === 'chroom', JSON.stringify(r));
    toets('een andere weergave kiezen sluit het volle scherm', r.dichtNaWissel, JSON.stringify(r));

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }
  console.log(fouten === 0 ? '\nbproef-visthema: alles goed' : '\nbproef-visthema: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
