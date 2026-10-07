// ═══════════════════════════════════════════════════════════════════
// bproef-dashboard.js — Slim als eigen dashboard, in de echte app (#439)
// ───────────────────────────────────────────────────────────────────
// test-dashboard.js toetst de rekenregels. Hier: dat Slim werkelijk het
// dashboard toont, dat een waarde op zijn tegel landt (getal, band, kleur),
// dat de bewerkstand zijn knoppen toont en weer weghaalt, dat een wijziging
// per auto bewaard wordt en bij een andere auto níét geldt, en dat het geheel
// op een telefoon past.
//
//   1. Slim = het dashboard: de standaard, geen oude vakken, past op het scherm
//   2. een waarde: het getal met de decimalen van zijn eenheid, de band, en
//      een tegel die oranje wordt
//   3. de bewerkstand: knoppen aan, verplaatsen en toevoegen worden bewaard,
//      Klaar haalt de knoppen weg
//   4. per auto: een andere VIN heeft zijn eigen dashboard
//   5. TEGENPROEF: zonder PLDash.bij() verandert het getal niet — anders meet
//      deel 2 niets
//
// Draaien vanuit public/:  node bproef-dashboard.js
// ═══════════════════════════════════════════════════════════════════
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

    console.log('\n1. Slim is het dashboard');
    const een = await app.ev(`(async function(){
      stopPoll();
      setPidView('overzicht'); setPidView('slim'); await new Promise(function(r){ setTimeout(r, 300); });
      localStorage.removeItem(PLDash.sleutelNu());
      setPidView('overzicht'); setPidView('slim'); await new Promise(function(r){ setTimeout(r, 500); });
      return { tegels:document.querySelectorAll('#gGrid .dt').length, oud:document.querySelectorAll('#gGrid .slim-sec, #gGrid .gc').length,
               knop:(document.querySelector('#gGrid .dash-knop')||{}).textContent, bewerkKnoppen:document.querySelectorAll('#gGrid .dt-knop').length,
               breed:document.documentElement.scrollWidth, venster:window.innerWidth };
    })()`);
    toets('de standaard staat er', een.tegels >= 4, JSON.stringify(een));
    toets('geen oude vakken en geen losse tegels', een.oud === 0, een.oud);
    toets('de knop heet Aanpassen, en er zijn nog geen bewerkknoppen', een.knop === 'Aanpassen' && een.bewerkKnoppen === 0, JSON.stringify(een));
    toets('past op het scherm', een.breed <= een.venster, JSON.stringify(een));

    console.log('\n2. Een waarde op zijn tegel');
    const twee = await app.ev(`(async function(){
      pidVals['0142']=11.2; applyG('0142', 11.2);
      pidVals['0105']=88; applyG('0105', 88);
      const v=document.getElementById('dv-0142'), u=document.querySelector('#db-0105 u');
      const tg=v ? v.closest('.dt') : null;
      return { volt:v ? v.textContent : null, oranje:!!(tg && tg.classList.contains('warn')), streep:u ? u.style.left : '' };
    })()`);
    toets('de accu met de decimalen van volt', twee.volt === '11.20', twee.volt);
    toets('11,2 V maakt de tegel oranje', twee.oranje);
    toets('het streepje van koelwater staat op zijn plek', /calc\(/.test(twee.streep), twee.streep);

    console.log('\n3. De bewerkstand');
    const drie = await app.ev(`(async function(){
      PLDash.bewerk(); await new Promise(function(r){ setTimeout(r, 200); });
      const knoppen=document.querySelectorAll('#gGrid .dt-knop').length, voeg=!!document.querySelector('#gGrid .dt-voeg');
      const eerst=PLDash.tegels().map(function(t){ return t.pids[0]; });
      PLDash.schuif(PLDash.tegels()[1].id, -1);
      PLDash.voeg('0111');
      PLDash.bewerk(); await new Promise(function(r){ setTimeout(r, 200); });
      // Via getItem en de sleutel van het dashboard zelf: in de demo gaat
      // setItem naar de zandbak, en die staat niet in Object.keys(localStorage).
      const opslag=JSON.parse(localStorage.getItem(PLDash.sleutelNu())||'{"tegels":[]}');
      return { knoppen:knoppen, voeg:voeg, eerst:eerst, na:opslag.tegels.map(function(t){ return t.pids[0]; }),
               naKlaar:document.querySelectorAll('#gGrid .dt-knop').length, gasklep:!!document.getElementById('dv-0111') };
    })()`);
    toets('Aanpassen toont de knoppen en "+ Sensor toevoegen"', drie.knoppen > 0 && drie.voeg, JSON.stringify(drie));
    toets('verplaatsen wordt bewaard', drie.na[0] === drie.eerst[1] && drie.na[1] === drie.eerst[0], JSON.stringify(drie));
    toets('toevoegen wordt bewaard en staat in beeld', drie.na[drie.na.length - 1] === '0111' && drie.gasklep, JSON.stringify(drie));
    toets('Klaar haalt de knoppen weg', drie.naKlaar === 0);

    console.log('\n4. Per auto');
    const vier = await app.ev(`(async function(){
      const echt=vehicleInfo.vin;
      try{
        vehicleInfo.vin='WVWZZZAUZHW999999'; setPidView('overzicht'); setPidView('slim'); await new Promise(function(r){ setTimeout(r, 200); });
        const ander=PLDash.tegels().some(function(t){ return t.pids[0]==='0111'; });
        vehicleInfo.vin=echt; setPidView('overzicht'); setPidView('slim'); await new Promise(function(r){ setTimeout(r, 200); });
        return { ander:ander, terug:PLDash.tegels().some(function(t){ return t.pids[0]==='0111'; }) };
      } finally { vehicleInfo.vin=echt; }
    })()`);
    toets('een andere auto heeft zijn eigen dashboard', vier.ander === false, JSON.stringify(vier));
    toets('terug bij deze auto staat de wijziging er weer', vier.terug === true);

    console.log('\n5. TEGENPROEF — zonder PLDash.bij() verandert het getal niet');
    const vijf = await app.ev(`(async function(){
      const echt=PLDash.bij; PLDash.bij=function(){};
      try{ applyG('0142', 14.4); return document.getElementById('dv-0142').textContent; }
      finally{ PLDash.bij=echt; }
    })()`);
    toets('zonder PLDash.bij() blijft 11.20 staan', vijf === '11.20', vijf);

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }
  console.log(fouten === 0 ? '\nbproef-dashboard: alles goed' : '\nbproef-dashboard: ' + fouten + ' FOUT');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
