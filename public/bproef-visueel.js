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
//   • een snelkoppeling in het meldingenvak zet echt iets aan (via PLRun), en
//     daarna staat die functie in het vak in plaats van de snelkoppelingen;
//   • de bevindingenbalk verhuist naar het vak en komt terug in Slim;
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
const WACHT = ms => new Promise(r => setTimeout(r, ms));

// Meet in de pagina: elk tekst- en icoonvak van de meter, in viewBox-eenheden.
// De teksten eerst op hun breedste inhoud, zodat "past net" niet groen staat
// omdat er toevallig een smal getal stond.
const MEET = `(function(){
  const zet = { 'vis-snel':'999', 'visv-koel':'118°', 'visv-accu':'14,8 V',
                'visv-tank':'100%', 'vis-ondertekst':'≈+1,5 bar' };
  Object.keys(zet).forEach(function(id){ const e=document.getElementById(id); if(e) e.textContent=zet[id]; });
  const svg = document.querySelector('.vis-meter');
  if (!svg) return { fout: 'geen .vis-meter in het rooster' };
  const G = PLVisueel.G, uit = [];
  svg.querySelectorAll('text, svg.vis-icoon, svg.vis-logo').forEach(function(e){
    if (e.closest('.afwezig')) return;
    let b;
    if (e.tagName.toLowerCase() === 'svg') b = { x:+e.getAttribute('x'), y:+e.getAttribute('y'), width:+e.getAttribute('width'), height:+e.getAttribute('height') };
    else b = e.getBBox();
    if (!b.width) return;
    uit.push({ naam: e.id || (e.classList.contains('vis-logo') ? 'embleem' : e.textContent), x0:b.x, y0:b.y, x1:b.x+b.width, y1:b.y+b.height });
  });
  return { vakken: uit, C: G.C, R: G.R_RING,
           streepjes: svg.querySelectorAll('.vis-streep').length };
})()`;

function beoordeel(m) {
  const botsing = [], buiten = [];
  const v = m.vakken;
  for (let i = 0; i < v.length; i++) {
    const a = v[i];
    // Het getal van de onderboog staat met opzet ONDER de cirkel: voor dat
    // icoon en die tekst is de eis dat ze helemaal onder de ring blijven.
    if (/^vis-onder/.test(a.naam)) {
      if (a.y0 <= m.C + m.R + 1) buiten.push(a.naam + ' (hoort onder de ring)');
    } else [[a.x0, a.y0], [a.x1, a.y0], [a.x0, a.y1], [a.x1, a.y1]].forEach(function (p) {
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
    const staat = await app.ev(`(function(){ const s=PLVisueel.staat(); return { modus: pidViewMode,
      meter: !!document.querySelector('#gGrid .vis-meter'), aan: s.aan,
      onder: s.ind && s.ind.onder, plekken: s.ind && s.ind.plekken,
      koel: document.getElementById('visv-koel').textContent, tank: document.getElementById('visv-tank').textContent,
      snel: document.querySelectorAll('#visMeld .vis-snelk button').length }; })()`);
    toets('setPidView("visueel") bouwt de meter', staat.modus === 'visueel' && staat.meter, JSON.stringify(staat));
    toets('de rem staat aan zolang de weergave open is', staat.aan === true);
    toets('olie staat op de onderboog', staat.onder && staat.onder.pid === '015C', JSON.stringify(staat.onder));
    toets('koelwater, accu en brandstof hebben hun plek', staat.plekken && staat.plekken.koel === '0105' &&
      staat.plekken.accu === '0142' && staat.plekken.tank === '012F', JSON.stringify(staat.plekken));
    toets('de plekjes tonen een getal, geen streepje', /°$/.test(staat.koel) && /%$/.test(staat.tank), staat.koel + ' / ' + staat.tank);
    toets('niets actief: snelkoppelingen in het meldingenvak', staat.snel >= 3, 'knoppen: ' + staat.snel);

    console.log('\n2. Gemeten in de browser: alles binnen de ring, niets over elkaar');
    const m = await app.ev(MEET);
    if (m.fout) { toets('de meter is te meten', false, m.fout); throw new Error(m.fout); }
    toets('17 streepjes', m.streepjes === 17, 'gevonden: ' + m.streepjes);
    toets('er is iets gemeten (' + m.vakken.length + ' vakken)', m.vakken.length >= 15, 'te weinig vakken — dan meet de rest niets');
    const b = beoordeel(m);
    toets('alles binnen de ring, en het olie-getal eronder', b.buiten.length === 0, b.buiten.join(', '));
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

    console.log('\n5. Het meldingenvak');
    const meld = await app.ev(`(function(){
      const voor=Array.from(document.querySelectorAll('#visMeld .vis-snelk button')).map(b=>b.textContent);
      PLVisueel.schakel('monitor');
      const aan=PLRun.staat().monitor.aan;
      const tekst=document.getElementById('visMeld').textContent;
      const knoppen=Array.from(document.querySelectorAll('#visMeld .vis-snelk button')).map(b=>b.textContent);
      // Dubbel in beeld (schermafdruk 25-09): de zwevende pil van de
      // rit-monitor hoort weg zolang de rail hem draagt, en terug in Slim.
      // In demo komt de monitor niet verder dan "wacht op verbinding", en dan
      // toont _monChipTick() nooit een pil: zonder deze vlag bewijst de proef niets.
      const wasActief=PLMon.active; PLMon.active=true;
      try{ _monChipTick(); }catch(e){}
      const pil=document.getElementById('monChipFab');
      const chip=!!document.querySelector('#visMeld .vis-rail .vis-chip[data-id="monitor"]');
      const pilWeg=!pil || getComputedStyle(pil).display==='none';
      setPidView('slim'); try{ _monChipTick(); }catch(e){}
      const pilTerug=!!pil && getComputedStyle(pil).display!=='none';
      PLMon.active=wasActief; try{ _monChipTick(); }catch(e){}
      setPidView('visueel');
      PLVisueel.schakel('monitor');
      return { admin:isAdmin(), voor:voor, aan:aan, tekst:tekst, knoppen:knoppen, uit:!PLRun.staat().monitor.aan,
               chip:chip, pilWeg:pilWeg, pilTerug:pilTerug };
    })()`);
    toets('de bulk-recorder staat alleen als snelkoppeling bij een beheerder',
      meld.voor.some(k => /Bulk-recorder/.test(k)) === !!meld.admin, 'admin ' + meld.admin + ': ' + meld.voor.join(', '));
    toets('de snelkoppeling zet de rit-monitor echt aan (via PLRun)', meld.aan === true, JSON.stringify(meld));
    toets('daarna staat de rit-monitor in het vak', /Rit-monitor/.test(meld.tekst), meld.tekst);
    toets('en geen snelkoppeling meer naar caravanrit of bulk-recorder (één tegelijk)',
      !meld.knoppen.some(k => /Caravanrit|Bulk-recorder|Rit-monitor/.test(k)), meld.knoppen.join(', '));
    toets('de waakronde kan er nog bij', meld.knoppen.some(k => /Waakronde/.test(k)), meld.knoppen.join(', '));
    toets('nog een keer tikken zet hem weer uit', meld.uit === true);
    toets('de rit-monitor staat als chip op de rail', meld.chip, JSON.stringify(meld));
    toets('…en zijn zwevende pil is weg zolang Slim visueel open is', meld.pilWeg, JSON.stringify(meld));
    toets('…en komt terug in Slim', meld.pilTerug, JSON.stringify(meld));
    const dubbel = await app.ev(`(function(){
      const w=document.getElementById('wkStrook'), a=document.getElementById('aandrijfBalk');
      const weg=function(e){ return !e || getComputedStyle(e).display==='none'; };
      if(window.PLAandrijfbalk && window.PLAandrijving) PLAandrijfbalk.ververs(PLAandrijving.laatste() || { toestand:'DRAAIT_STIL', label:'Stationair', zekerheid:'hoog' });
      PLVisueel.tik();
      const lamp=document.getElementById('vis-lamp-motor');
      return { balkWeg: weg(a), strookWeg: weg(w), lamp: lamp ? lamp.className : null,
               lampTekst: lamp ? lamp.textContent : '', toestand: (PLAandrijving.laatste()||{}).toestand };
    })()`);
    toets('de aandrijfbalk staat niet óók nog boven de meter', dubbel.balkWeg, JSON.stringify(dubbel));
    toets('de waakstrook staat niet óók nog boven de meter', dubbel.strookWeg, JSON.stringify(dubbel));
    toets('het motorlampje brandt met de toestand van PLAandrijving',
      !dubbel.toestand || dubbel.toestand === 'ONBEKEND' || (dubbel.lamp && !/leeg/.test(dubbel.lamp) && /Motor|Start/.test(dubbel.lampTekst)),
      JSON.stringify(dubbel));
    const bev = await app.ev(`(function(){
      bevindingenZet(true);
      _bevHits=[{id:'proef', naam:'Proefbevinding', uitleg:'alleen voor bproef-visueel', ernst:2, rang:0}];
      _bevToonBij(); PLVisueel.tik();
      const balk=document.getElementById('corrBanner');
      const r={ balkWeg: !balk || balk.style.display==='none', inVak: /Proefbevinding/.test(document.getElementById('visMeld').textContent) };
      setPidView('slim');
      const b2=document.getElementById('corrBanner');
      r.balkTerug = !!b2 && b2.style.display!=='none';
      // Opruimen zonder naklank: de proefbevinding hoort niet 5 s na te blijven staan.
      _bevHits=[]; Object.keys(_bevSinds).forEach(function(k){ delete _bevSinds[k]; }); _bevToonBij(); setPidView('visueel');
      return r;
    })()`);
    toets('in Slim visueel staat de bevinding in het vak', bev.inVak, JSON.stringify(bev));
    toets('…en niet óók nog in de balk bovenaan (verhuisd, niet verdubbeld)', bev.balkWeg, JSON.stringify(bev));
    toets('terug in Slim staat de balk er weer', bev.balkTerug, JSON.stringify(bev));
    await WACHT(300);

    console.log('\n6. De rem op de bus');
    const rem = await app.ev(`(function(){
      const open={ belasting:pidPollInterval('0104'), klep:pidPollInterval('0111'), rpm:pidPollInterval('010C'), pedaal:pidPollInterval('0149') };
      setPidView('slim');
      const dicht={ belasting:pidPollInterval('0104'), klep:pidPollInterval('0111'), rpm:pidPollInterval('010C'), aan:PLVisueel.staat().aan };
      setPidView('visueel');
      return { open:open, dicht:dicht, rem:PLVisueel.REM_MS };
    })()`);
    toets('open: gasklep en (met olie op de onderboog) het pedaal geremd',
      rem.open.klep >= rem.rem && rem.open.pedaal >= rem.rem, JSON.stringify(rem));
    toets('open: de motorbelasting staat bij het motorlampje en wordt niet geremd', rem.open.belasting < rem.rem, JSON.stringify(rem));
    toets('open: toerental ongemoeid', rem.open.rpm < rem.rem, JSON.stringify(rem));
    toets('terug naar Slim: de rem is eraf', rem.dicht.aan === false && rem.dicht.klep < rem.rem, JSON.stringify(rem));

    console.log('\n7. Zonder toerental geen lege meter maar een uitleg');
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
