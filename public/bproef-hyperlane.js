// bproef-hyperlane.js — Hyperlane in de echte app (27-10-2026)
//
// Wat test-hyperlane.js niet kan zien: of het profiel in Slim visueel echt
// opent, of de lus loopt en de ringen tekent met de waarden van de demo-auto,
// of de tunnel op het volle scherm het hele scherm vult, en of de lus stopt
// als je naar een andere weergave gaat (anders tekent hij in een leeg vak door
// en kost hij accu).
//
// Tegenproef: na een andere weergave moet PLHyperlane.actief() false zijn.
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
    await app.venster(915, 412);
    console.log('\n1. Hyperlane opent en tekent');
    await app.ev(`startDemoCar(0); true`);
    await new Promise(r => setTimeout(r, 1500));
    const r = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      const lo = document.getElementById('loginOv'); if (lo) lo.classList.add('hidden');
      const bb = document.getElementById('bronBanner'); if (bb) bb.style.display = 'none';
      document.getElementById('welcomeScreen').classList.add('hidden');
      sw('live', null);
      PLVisProfiel.bewaar('hyperlane');
      setPidView('visueel');
      await wacht(3500);   // voorbij de opstartzwaai, met waarden van de demo-auto
      const vak = () => document.querySelector('.gg.view-visueel .vpf-hyper');
      const r = { vak: !!vak(), profiel: PLVisueel.profiel(), actief: PLHyperlane.actief() };
      if (!vak()) return r;
      // Heeft de ring iets getekend? Tel de niet-lege pixels.
      const ring = vak().querySelector('.vhl-ring[data-ring="toeren"]');
      const c = ring.getContext('2d'), d = c.getImageData(0, 0, ring.width, ring.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      r.ringPx = ring.width; r.getekend = n / (d.length / 4);
      r.toeren = document.getElementById('vpf-w-toeren').textContent;
      r.koel = document.getElementById('vpf-w-koel').textContent;
      r.kleur = vak().style.getPropertyValue('--vhl-c');
      r.gl = vak().classList.contains('vhl-gl');
      r.scene = vak().getAttribute('data-scene');
      // De langste modustekst naast het versnellingslabel moet passen (liggend, 915 breed)
      const md = vak().querySelector('.vhl-modus'), gr = vak().querySelector('.vhl-gear');
      md.textContent = 'KOELWATER HEET'; gr.textContent = '5';
      r.modusPast = md.scrollWidth <= md.clientWidth + 1; r.modusMaat = md.scrollWidth + '/' + md.clientWidth;
      // Volledig scherm: de tunnel vult het scherm.
      document.querySelector('.gg.view-visueel .vt-vol').click();
      await wacht(400);
      const b = vak().getBoundingClientRect();
      r.dekt = b.left <= 0 && b.top <= 0 && b.width >= innerWidth - 1 && b.height >= innerHeight - 1;
      r.bgVol = vak().querySelector('.vhl-bg').width >= innerWidth;
      r.knopBoven = !!document.elementFromPoint(innerWidth - 30, 30).closest('.vt-knoppen');
      appBack(); await wacht(200);
      setPidView('overzicht'); await wacht(300);
      r.stoptNaWissel = !PLHyperlane.actief();
      return r;
    })()`);
    toets('het profiel Hyperlane opent in Slim visueel', r.vak && r.profiel === 'hyperlane', JSON.stringify(r));
    toets('de lus loopt', r.actief, JSON.stringify(r));
    toets('de toerenring is getekend (meer dan 5% van de pixels)', r.getekend > 0.05, JSON.stringify(r));
    toets('de demo-auto vult toeren en koelwater', r.toeren && r.toeren !== '—' && r.koel && r.koel !== '—', JSON.stringify(r));
    toets('de kleur staat op het vak', /^rgb\(/.test(r.kleur || ''), JSON.stringify(r));
    toets('de langste modustekst past naast het versnellingslabel', r.modusPast, r.modusMaat);
    toets('de lus kiest een scène', ['rijden', 'stil', 'cruise', 'koud', 'remmen', 'launch', 'begrenzer', 'alarm'].indexOf(r.scene) >= 0, JSON.stringify(r));
    if (!r.gl) console.log('  LET OP  geen WebGL in deze browser: de tunnel is hier het CSS-verloop');
    console.log('\n2. Volledig scherm');
    toets('de tunnel vult het hele scherm', r.dekt && r.bgVol, JSON.stringify(r));
    toets('de knoppen liggen erboven', r.knopBoven, JSON.stringify(r));
    console.log('\n3. Weg uit de weergave');
    toets('een andere weergave stopt de lus (geen accuverbruik in een leeg vak)', r.stoptNaWissel, JSON.stringify(r));

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }
  console.log(fouten === 0 ? '\nbproef-hyperlane: alles goed' : '\nbproef-hyperlane: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
