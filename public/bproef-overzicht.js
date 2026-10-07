// ═══════════════════════════════════════════════════════════════════
// bproef-overzicht.js — Overzicht per categorie, in de echte app (#439)
// ───────────────────────────────────────────────────────────────────
// test-overzicht.js toetst de rekenregels los. Wat daar niet te zien is: of
// renderGauges() de tegels werkelijk in kaarten hangt, of applyG() het
// streepje en de opmerking bijwerkt, of de koppen meetellen, en of het
// geheel op een telefoon past. Daarom hier, met de demo-auto.
//
//   1. benzine: kaarten in de volgorde rijden → motor → temperaturen …, elke
//      rij heeft een band, en niets steekt buiten het scherm
//   2. een afwijkende waarde: oranje, een opmerking eronder, de kop telt
//      mee, en de rij staat bovenaan zijn kaart
//   3. Ruim: de klasse gaat aan, wordt onthouden, en past nog steeds
//   4. hybride: Elektrisch staat direct onder Rijden
//   5. TEGENPROEF: zonder ovzBij() telt de kop niet mee — anders meet deel 2
//      niets
//
// Draaien vanuit public/:  node bproef-overzicht.js
// ═══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const KAARTEN = `(function(){ return [].filter.call(document.querySelectorAll('#gGrid .ovz-cat'), function(s){ return s.style.display!=='none'; })
  .map(function(s){ return s.id.replace('ovzCat-',''); }); })()`;

(async () => {
  let app;
  try {
    app = await startApp({ root: __dirname });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    await app.venster(412, 915);
    await app.ev(`startDemoCar(0); true`);
    await new Promise(r => setTimeout(r, 2500));

    console.log('\n1. Benzine: kaarten per categorie');
    const een = await app.ev(`(async function(){
      try{ localStorage.removeItem('pl_ovz_dicht'); }catch(e){}
      setPidView('slim'); setPidView('overzicht');
      await new Promise(function(r){ setTimeout(r, 1500); });
      const rijen=[].slice.call(document.querySelectorAll('#gGrid .ovz-vak > .gc'));
      return { kaarten:${KAARTEN}, rijen:rijen.length, banden:rijen.filter(function(c){ return !!c.querySelector('.gband'); }).length,
               breed:document.documentElement.scrollWidth, venster:window.innerWidth,
               uitsteek:rijen.filter(function(c){ const r=c.getBoundingClientRect(); return r.right>window.innerWidth+0.5; }).length,
               los:document.querySelectorAll('#gGrid > .gc').length };
    })()`);
    toets('er staan kaarten', een.kaarten.length >= 4, JSON.stringify(een));
    toets('volgorde: rijden, motor, temperaturen, brandstof', een.kaarten.slice(0, 4).join() === 'rijden,motor,temp,brandstof', een.kaarten.join());
    toets('elke rij heeft een band', een.rijen > 0 && een.banden === een.rijen, een.banden + ' van ' + een.rijen);
    toets('geen losse tegels meer buiten de kaarten', een.los === 0, een.los);
    toets('niets steekt buiten het scherm', een.breed <= een.venster && een.uitsteek === 0, JSON.stringify(een));

    console.log('\n2. Een afwijkende waarde');
    const twee = await app.ev(`(async function(){
      stopPoll();
      pidVals['0105']=108; applyG('0105', 108); ovzBij();
      const c=document.getElementById('gc-0105'), box=c.parentNode, sec=box.parentNode;
      return { klasse:c.className, noot:(document.getElementById('gno-0105')||{}).textContent, chip:sec.querySelector('.ovz-chip').textContent,
               eerste:box.firstElementChild===c, gv:document.getElementById('gv-0142') ? document.getElementById('gv-0142').textContent : '' };
    })()`);
    toets('koelwater 108 °C is oranje', /\bwarn\b/.test(twee.klasse), twee.klasse);
    toets('met een opmerking eronder', /Boven de waarschuwingsgrens van 100/.test(twee.noot || ''), twee.noot);
    toets('de kop telt mee', twee.chip === '1 let op', twee.chip);
    toets('de rij staat bovenaan zijn kaart', twee.eerste);
    toets('de accu met de decimalen van volt', !twee.gv || /\.\d\d$/.test(twee.gv), twee.gv);

    console.log('\n3. Ruim');
    const drie = await app.ev(`(async function(){
      ovzDicht('ruim'); await new Promise(function(r){ setTimeout(r, 300); });
      const r={ klasse:document.getElementById('gGrid').classList.contains('ovz-ruim'), opslag:localStorage.getItem('pl_ovz_dicht'),
                breed:document.documentElement.scrollWidth, venster:window.innerWidth };
      setPidView('slim'); setPidView('overzicht'); await new Promise(function(r2){ setTimeout(r2, 300); });
      r.nogRuim=document.getElementById('gGrid').classList.contains('ovz-ruim');
      ovzDicht('compact'); return r;
    })()`);
    toets('Ruim zet de klasse', drie.klasse && drie.opslag === 'ruim', JSON.stringify(drie));
    toets('na opnieuw opbouwen nog steeds Ruim', drie.nogRuim);
    toets('Ruim past op het scherm', drie.breed <= drie.venster, JSON.stringify(drie));

    console.log('\n4. Hybride');
    const vier = await app.ev(`(async function(){
      const echt=window.detectEngineType; window.detectEngineType=function(){ return 'hybride'; };
      try{ setPidView('slim'); setPidView('overzicht'); await new Promise(function(r){ setTimeout(r, 300); }); return ${KAARTEN}; }
      finally{ window.detectEngineType=echt; setPidView('slim'); setPidView('overzicht'); }
    })()`);
    toets('hybride: Elektrisch direct onder Rijden', vier[0] === 'rijden' && vier[1] === 'elektrisch', vier.join());

    console.log('\n5. TEGENPROEF — zonder ovzBij() telt de kop niet');
    const vijf = await app.ev(`(async function(){
      const echt=window.ovzBij; window.ovzBij=function(){};
      try{
        setPidView('slim'); setPidView('overzicht'); await new Promise(function(r){ setTimeout(r, 300); });
        pidVals['0105']=108; applyG('0105', 108);
        return document.getElementById('gc-0105').parentNode.parentNode.querySelector('.ovz-chip').textContent;
      } finally { window.ovzBij=echt; }
    })()`);
    toets('zonder ovzBij() blijft de kop "normaal"', vijf === 'normaal', vijf);

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }
  console.log(fouten === 0 ? '\nbproef-overzicht: alles goed' : '\nbproef-overzicht: ' + fouten + ' FOUT');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
