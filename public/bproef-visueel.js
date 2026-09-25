// ══════════════════════════════════════════════════════════════════
// bproef-visueel.js — Slim visueel in de draaiende app
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// test-visueel.js rekent de wijzerplaat na op de getallen in G, met een
// geschatte tekstbreedte. Hier staat hij in de echte app, met het echte
// lettertype, en meet getBBox() wat de browser werkelijk tekent. Een eerdere
// poging aan zo'n meter had streepjes buiten de ring en cijfers die scheef
// stonden; dat zie je alleen in een browser, dus hier wordt het gemeten.
//
// En de koppeling, die node niet kan toetsen:
//   • setPidView('visueel') bouwt de meter en zet de rem op de bus aan;
//   • een waarde die via updPID() binnenkomt komt op de meter;
//   • terug naar Slim haalt de rem er weer af;
//   • zonder toerental staat er een uitleg met een knop, geen lege meter.
//
// De tegenproef zit erin: schuif één tekst op een andere, en de
// overlapcontrole moet dat zien.
//
// Draaien vanuit public/:  node bproef-visueel.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const PIDS = ['010C', '010D', '0149', '0104', '0111', '010B', '0110', '0105', '015C', '012F', '0142'];

// Meet in de pagina: elk tekst- en icoonvak van de meter, in viewBox-eenheden.
// De teksten eerst op hun breedste inhoud, zodat "past net" niet groen staat
// omdat er toevallig een smal getal stond.
const MEET = `(function(){
  const zet = { 'vis-snel':'999', 'vis-rpm':'9990 rpm', 'vis-pedaaltekst':'100%',
                'vis-vierdetekst':'≈99+', 'vis-vierdeeenheid':'L/100km' };
  Object.keys(zet).forEach(function(id){ const e=document.getElementById(id); if(e) e.textContent=zet[id]; });
  const svg = document.querySelector('.vis-meter');
  if (!svg) return { fout: 'geen .vis-meter in het rooster' };
  const G = PLVisueel.G, uit = [];
  svg.querySelectorAll('text, svg.vis-icoon').forEach(function(e){
    if (e.closest('.afwezig')) return;
    let b;
    if (e.tagName.toLowerCase() === 'svg') b = { x:+e.getAttribute('x'), y:+e.getAttribute('y'), width:+e.getAttribute('width'), height:+e.getAttribute('height') };
    else b = e.getBBox();
    if (!b.width) return;
    uit.push({ naam: e.id || e.textContent, x0:b.x, y0:b.y, x1:b.x+b.width, y1:b.y+b.height });
  });
  return { vakken: uit, C: G.C, R: G.R_RING,
           streepjes: svg.querySelectorAll('.vis-streep').length };
})()`;

function beoordeel(m) {
  const botsing = [], buiten = [];
  const v = m.vakken;
  for (let i = 0; i < v.length; i++) {
    const a = v[i];
    [[a.x0, a.y0], [a.x1, a.y0], [a.x0, a.y1], [a.x1, a.y1]].forEach(function (p) {
      if (Math.hypot(p[0] - m.C, p[1] - m.C) > m.R - 2) buiten.push(a.naam);
    });
    for (let j = i + 1; j < v.length; j++) {
      const b = v[j];
      if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) botsing.push(a.naam + ' × ' + b.naam);
    }
  }
  return { botsing: botsing, buiten: Array.from(new Set(buiten)) };
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
    console.log('\n1. De meter staat er');
    await app.venster(412, 915);
    await app.ev(`startDemoCar(0); true`);
    await new Promise(r => setTimeout(r, 1500));
    await app.ev(`(function(){ ${JSON.stringify(PIDS)}.forEach(function(p){ activePIDs.add(p); }); setPidView('visueel'); return true; })()`);
    await new Promise(r => setTimeout(r, 2500));
    const staat = await app.ev(`({ modus: pidViewMode, meter: !!document.querySelector('#gGrid .vis-meter'),
      rand: document.querySelectorAll('#gGrid .vis-chip').length, aan: PLVisueel.staat().aan,
      pedaal: PLVisueel.staat().ind && PLVisueel.staat().ind.pedaal })`);
    toets('setPidView("visueel") bouwt de meter', staat.modus === 'visueel' && staat.meter, JSON.stringify(staat));
    toets('de rem staat aan zolang de weergave open is', staat.aan === true);
    toets('het gaspedaal 0149 staat op de meter', staat.pedaal === '0149', 'kreeg ' + staat.pedaal);
    toets('de rand toont koelwater, olie, tank en accu', staat.rand === 4, 'chips: ' + staat.rand);

    console.log('\n2. Gemeten in de browser: alles binnen de ring, niets over elkaar');
    const m = await app.ev(MEET);
    if (m.fout) { toets('de meter is te meten', false, m.fout); throw new Error(m.fout); }
    toets('17 streepjes', m.streepjes === 17, 'gevonden: ' + m.streepjes);
    toets('er is iets gemeten (' + m.vakken.length + ' vakken)', m.vakken.length >= 15, 'te weinig vakken — dan meet de rest niets');
    const b = beoordeel(m);
    toets('geen tekst of icoon valt buiten de ring', b.buiten.length === 0, b.buiten.join(', '));
    toets('geen tekst of icoon raakt een ander', b.botsing.length === 0, b.botsing.join(', '));

    console.log('\n3. Tegenproef — ziet de controle een echte overlap?');
    const tegen = await app.ev(`(function(){
      const s=document.getElementById('vis-snel'); const oud=s.getAttribute('y');
      s.setAttribute('y', String(PLVisueel.G.Y_KMH));
      const m=${MEET}; s.setAttribute('y', oud); return m; })()`);
    toets('de snelheid op km/h geschoven wordt als botsing gezien',
      beoordeel(tegen).botsing.some(x => /vis-snel/.test(x)), 'de overlapcontrole bleef stil');

    console.log('\n4. De getallen sturen, en komen niet buiten de schaal');
    const naald = await app.ev(`(function(){
      function hoek(){ const t=document.getElementById('vis-naald').style.transform; const m=/rotate\\((-?[\\d.]+)deg\\)/.exec(t); return m?+m[1]:null; }
      PLVisueel.bij('010C', 99999); const hoog=hoek();
      PLVisueel.bij('010C', -500); const laag=hoek();
      PLVisueel.bij('010C', 4000); const mid=hoek();
      return { hoog:hoog, laag:laag, mid:mid, G:[PLVisueel.G.A0, PLVisueel.G.A1] };
    })()`);
    toets('99999 rpm: de naald stopt op het laatste streepje', naald.hoog === naald.G[1], JSON.stringify(naald));
    toets('−500 rpm: de naald stopt op het eerste streepje', naald.laag === naald.G[0], JSON.stringify(naald));
    toets('4000 rpm: recht omhoog', Math.abs(naald.mid) < 0.01, JSON.stringify(naald));
    const snel = await app.ev(`(function(){ updPID('010D', 123); return document.getElementById('vis-snel').textContent; })()`);
    toets('een snelheid via updPID() komt op de meter', snel === '123', 'kreeg "' + snel + '"');

    console.log('\n5. De rem op de bus');
    const rem = await app.ev(`(function(){
      const open={ belasting:pidPollInterval('0104'), klep:pidPollInterval('0111'), rpm:pidPollInterval('010C'), pedaal:pidPollInterval('0149') };
      setPidView('slim');
      const dicht={ belasting:pidPollInterval('0104'), klep:pidPollInterval('0111'), rpm:pidPollInterval('010C'), aan:PLVisueel.staat().aan };
      setPidView('visueel');
      return { open:open, dicht:dicht, rem:PLVisueel.REM_MS };
    })()`);
    toets('open: motorbelasting en gasklep geremd', rem.open.belasting >= rem.rem && rem.open.klep >= rem.rem, JSON.stringify(rem));
    toets('open: toerental en pedaal ongemoeid', rem.open.rpm < rem.rem && rem.open.pedaal < rem.rem, JSON.stringify(rem));
    toets('terug naar Slim: de rem is eraf', rem.dicht.aan === false && rem.dicht.belasting < rem.rem && rem.dicht.klep < rem.rem, JSON.stringify(rem));

    console.log('\n6. Zonder toerental geen lege meter maar een uitleg');
    const zonder = await app.ev(`(function(){
      activePIDs.delete('010C'); renderGauges();
      const r={ uitleg: !!document.querySelector('#gGrid .vis-leeg'), meter: !!document.querySelector('#gGrid .vis-meter'),
                knop: !!document.querySelector('#gGrid .vis-leeg button') };
      activePIDs.add('010C'); renderGauges(); r.terug=!!document.querySelector('#gGrid .vis-meter'); return r;
    })()`);
    toets('zonder 010C: uitleg met knop, geen meter', zonder.uitleg && zonder.knop && !zonder.meter, JSON.stringify(zonder));
    toets('met 010C terug: de meter staat er weer', zonder.terug);

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }

  console.log(fouten === 0 ? '\nbproef-visueel: alles goed' : '\nbproef-visueel: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
