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
                'visv-tank':'100%', 'vis-ondertekst':'≈+1,5 bar', 'vis-gear':'10' };
  Object.keys(zet).forEach(function(id){ const e=document.getElementById(id); if(e) e.textContent=zet[id]; });
  // Versnelling en embleem delen één plek en staan nooit samen: meet de
  // versnelling op zijn breedste ("10"), met het embleem weg zoals gearBij() doet.
  const lg=document.getElementById('visg-logo'); if(lg) lg.style.display='none';
  const svg = document.querySelector('.vis-meter');
  if (!svg) return { fout: 'geen .vis-meter in het rooster' };
  const G = PLVisueel.G, uit = [];
  svg.querySelectorAll('text, svg.vis-icoon, svg.vis-logo, rect.vis-staaf').forEach(function(e){
    if (e.closest('.afwezig') || e.closest('[style*="display: none"], [style*="display:none"]')) return;
    let b;
    if (e.tagName.toLowerCase() === 'svg') b = { x:+e.getAttribute('x'), y:+e.getAttribute('y'), width:+e.getAttribute('width'), height:+e.getAttribute('height') };
    else b = e.getBBox();
    if (!b.width) return;
    uit.push({ naam: e.id || (e.classList.contains('vis-logo') ? 'embleem' : e.classList.contains('vis-staaf') ? 'staaf in '+e.parentNode.id : e.textContent), x0:b.x, y0:b.y, x1:b.x+b.width, y1:b.y+b.height });
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
      snel: document.querySelectorAll('#visMeld .vis-snelk button').length,
      snelTekst: document.getElementById('visMeld').textContent,
      knoppen: document.querySelectorAll('.vis-trekknop, .vis-trekerbij').length }; })()`);
    toets('setPidView("visueel") bouwt de meter', staat.modus === 'visueel' && staat.meter, JSON.stringify(staat));
    toets('de rem staat aan zolang de weergave open is', staat.aan === true);
    toets('olie staat op de onderboog', staat.onder && staat.onder.pid === '015C', JSON.stringify(staat.onder));
    toets('koelwater, accu en brandstof hebben hun plek', staat.plekken && staat.plekken.koel === '0105' &&
      staat.plekken.accu === '0142' && staat.plekken.tank === '012F', JSON.stringify(staat.plekken));
    toets('de plekjes tonen een getal, geen streepje', /°$/.test(staat.koel) && /%$/.test(staat.tank), staat.koel + ' / ' + staat.tank);
    toets('niets actief: snelkoppelingen in het meldingenvak', staat.snel >= 2, 'knoppen: ' + staat.snel);
    toets('geen snelkoppeling, knop of tekst voor de caravanrit of trekmodus (27-09)',
      !/Caravan|trekmodus/i.test(staat.snelTekst) && staat.knoppen === 0, JSON.stringify({ t: staat.snelTekst, k: staat.knoppen }));

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

    console.log('\n3b. Trekmodus: caravan of beladen');
    const trek = await app.ev(`(async function(){
      ['0104','010F'].forEach(function(p){ activePIDs.delete(p); });
      if (situatieActief().some(function(x){ return x.id === 'beladen'; })) toggleSituatie('beladen');
      toggleSituatie('beladen');
      await new Promise(function(r){ setTimeout(r, 1500); });
      const aan = { tegels: document.querySelectorAll('#visTrek .vis-tt').length, tekst: (document.getElementById('visTrek')||{}).textContent || '',
                    gebruik: PLVisueel.staat().gebruik, actief: ['0104','010F'].filter(function(p){ return activePIDs.has(p); }) };
      toggleSituatie('beladen'); await new Promise(function(r){ setTimeout(r, 1500); });
      const uit = { strook: !!document.getElementById('visTrek'), knop: !!document.querySelector('.vis-trekknop') };
      return { aan: aan, uit: uit };
    })()`);
    toets('rijsituatie beladen: de strook verschijnt vanzelf, met tegels', trek.aan.tegels >= 5, JSON.stringify(trek.aan));
    toets('en zet de sensoren van de strook zelf aan (belasting, inlaatlucht)', trek.aan.actief.length === 2, JSON.stringify(trek.aan.actief));
    toets('koelwater, olie en belasting staan erop', /Koelwater/.test(trek.aan.tekst) && /Motorolie/.test(trek.aan.tekst) && /Belasting/.test(trek.aan.tekst), trek.aan.tekst);
    toets('de belasting (0104) wordt dan niet geremd', trek.aan.gebruik.indexOf('0104') >= 0, JSON.stringify(trek.aan.gebruik));
    toets('rijsituatie weer uit: de strook is weg, en er staat geen knop voor in de plaats', !trek.uit.strook && !trek.uit.knop, JSON.stringify(trek.uit));

    console.log('\n3c. Versnelling in het midden, staafjes, sensoren zelf aan (27-09)');
    const mid = await app.ev(`(async function(){
      const logo = function(){ const g=document.getElementById('visg-logo'); return !!g && g.style.display !== 'none'; };
      const gear = function(){ return document.getElementById('vis-gear').textContent; };
      // De meter vraagt toonbaar(), niet waarde() (30-09-2026): een cijfer dat
      // nog niet zeker is, geeft het embleem.
      const echt = PLGear.toonbaar, echtW = PLGear.waarde; const uit = {};
      PLGear.toonbaar = function(){ return null; }; PLVisueel.tik(); uit.onbekend = { logo: logo(), gear: gear() };
      PLGear.toonbaar = function(){ return 3; };    PLVisueel.tik(); uit.drie = { logo: logo(), gear: gear() };
      PLGear.toonbaar = function(){ return -1; };   PLVisueel.tik(); uit.achteruit = gear();
      PLGear.toonbaar = function(){ return 0; };    PLVisueel.tik(); uit.neutraal = gear();
      PLGear.waarde = function(){ return 4; }; PLGear.toonbaar = function(){ return null; }; PLVisueel.tik();
      uit.onzeker = { logo: logo(), gear: gear() };
      PLGear.toonbaar = echt; PLGear.waarde = echtW;
      // De topbalk: in Slim visueel geen tweede versnelling (28-09-2026).
      const toonWas = PLGear.toon, uitWas = PLGear.uit;
      PLGear.uit = false; PLGear.toon = 3; PLGear._render();
      const pg = document.getElementById('plGear');
      uit.topbalk = { visueel: getComputedStyle(pg).display, logo: getComputedStyle(document.querySelector('.topbar .logo')).display };
      document.body.classList.remove('pl-visueel');
      uit.topbalk.slim = getComputedStyle(pg).display;
      document.body.classList.add('pl-visueel');
      PLGear.toon = toonWas; PLGear.uit = uitWas; PLGear._render();
      const h = function(id){ return +document.getElementById(id).getAttribute('height'); };
      PLVisueel.bij('0105', 130); uit.koelVol = h('viss-koel');
      PLVisueel.bij('0105', 40);  uit.koelLeeg = h('viss-koel');
      PLVisueel.bij('012F', 50);  uit.tankHalf = h('viss-tank');
      uit.H = PLVisueel.G.STAAF_H;
      activePIDs.delete('0105'); manualPIDs.delete('0105'); setPidView('slim'); setPidView('visueel');
      await new Promise(function(r){ setTimeout(r, 500); });
      uit.koelWeer = activePIDs.has('0105'); uit.handmatig = manualPIDs.has('0105');
      return uit;
    })()`);
    toets('zonder bekende versnelling staat het embleem er', mid.onbekend.logo && mid.onbekend.gear === '', JSON.stringify(mid.onbekend));
    toets('met een versnelling staat die in het midden, het embleem is weg', !mid.drie.logo && mid.drie.gear === '3', JSON.stringify(mid.drie));
    toets('een versnelling die nog niet zeker is: het embleem, geen cijfer', mid.onzeker.logo && mid.onzeker.gear === '', JSON.stringify(mid.onzeker));
    toets('in Slim visueel staat de versnelling niet ook nog in de topbalk (daarbuiten wel)',
      mid.topbalk.visueel === 'none' && mid.topbalk.slim !== 'none', JSON.stringify(mid.topbalk));
    toets('achteruit is R en neutraal N (niet "-1" en "0")', mid.achteruit === 'R' && mid.neutraal === 'N', JSON.stringify(mid));
    toets('koelwaterstaafje: 130 °C vol, 40 °C leeg', mid.koelVol === mid.H && mid.koelLeeg === 0, JSON.stringify(mid));
    toets('brandstofstaafje: 50% is half', Math.abs(mid.tankHalf - mid.H / 2) < 0.05, JSON.stringify(mid));
    toets('Slim visueel openen zet een uitgezette sensor van de meter weer aan, niet als handmatige keuze', mid.koelWeer && !mid.handmatig, JSON.stringify(mid));
    const alarm = await app.ev(`(function(){
      PLVisueel._nieuweSessie();
      let trilde = 0; const echt = navigator.vibrate; try { navigator.vibrate = function(){ trilde++; return true; }; } catch (e) {}
      const nu = Date.now();
      const a = PLVisueel.koelAlarm(101, 2.5, nu), b = PLVisueel.koelAlarm(103, 3, nu + 60000), c = PLVisueel.koelAlarm(104, 3, nu + PLVisueel.ALARM_MS + 1);
      try { navigator.vibrate = echt; } catch (e) {}
      return { a: a, b: b, c: c, n: PLVisueel.sessie().alarmen, trilde: trilde, fouten: 0 };
    })()`);
    toets('waarschuwing: de eerste klinkt en trilt', alarm.a === true && alarm.trilde >= 1, JSON.stringify(alarm));
    toets('binnen drie minuten niet nog eens (geen piepconcert op een lange klim)', alarm.b === false, JSON.stringify(alarm));
    toets('daarna weer wel, en de sessie telt ze', alarm.c === true && alarm.n === 2, JSON.stringify(alarm));

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
      // Alleen uitgezet: dat herstelt Slim visueel zelf (27-09). Verborgen
      // is een keuze van de klant, en die blijft staan.
      activePIDs.delete('010C'); renderGauges();
      const r={ zelfTerug: activePIDs.has('010C') && !!document.querySelector('#gGrid .vis-meter') };
      hiddenPIDs.add('010C'); renderGauges();
      r.uitleg=!!document.querySelector('#gGrid .vis-leeg'); r.meter=!!document.querySelector('#gGrid .vis-meter');
      r.knop=!!document.querySelector('#gGrid .vis-leeg button');
      hiddenPIDs.delete('010C'); renderGauges(); r.terug=!!document.querySelector('#gGrid .vis-meter'); return r;
    })()`);
    toets('010C alleen uitgezet: Slim visueel zet hem zelf weer aan', zonder.zelfTerug, JSON.stringify(zonder));
    toets('010C verborgen: uitleg met knop, geen meter (en hij blijft verborgen)', zonder.uitleg && zonder.knop && !zonder.meter, JSON.stringify(zonder));
    toets('met 010C terug: de meter staat er weer', zonder.terug);

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }

  console.log(fouten === 0 ? '\nbproef-visueel: alles goed' : '\nbproef-visueel: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
