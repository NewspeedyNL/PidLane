// ═══════════════════════════════════════════════════════════════════
// bproef-rondgang.js — de rondgang in Slim, in de echte app (15-10-2026)
// ───────────────────────────────────────────────────────────────────
// test-rondgang.js toetst de indeling en de klok. Hier: dat Slim werkelijk
// rolt, dat de kop altijd in beeld is, dat Pauze en ‹ › doen wat ze zeggen,
// dat een rode waarde de rondgang naar zijn dia haalt, dat de bus de andere
// dia's remt, en dat Mijn dashboard er gewoon nog is.
//
//   1. Slim opent als rondgang: kop, titel, voortgang, past op het scherm
//   1b. de rondgang zet geen sensoren terug die je uitzette; ⚙ "Zet ze aan" wel
//   2. de klok wisselt na de wisseltijd (5 s), Pauze houdt vast
//   3. › gaat een dia verder
//   4. alarm: koelwater in het rood haalt Temperaturen in beeld
//   5. de bus: een snelle sensor van een andere dia gaat naar REM_MS, en
//      TEGENPROEF: zonder PLRond.remt() was hij sneller
//   6. Mijn dashboard en terug; het ⚙-blad met de vinkjes
//
// Draaien vanuit public/:  node bproef-rondgang.js
// ═══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const wacht = (ms) => `await new Promise(function(r){ setTimeout(r, ${ms}); });`;

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

    console.log('\n1. Slim opent als rondgang');
    const een = await app.ev(`(async function(){
      stopPoll();
      setPidView('overzicht'); setPidView('slim'); ${wacht(400)}
      const st=PLRond.staat();
      return { voort:!!document.getElementById('rondVoort'), kop:!!document.getElementById('rv-010D') && !!document.getElementById('rv-010C'),
               kopKlasse:document.querySelectorAll('#gGrid .rond-kv').length, kopHoog:Math.round(document.querySelector('.rond-boven').getBoundingClientRect().height), titel:(document.getElementById('rondTitel')||{}).textContent,
               dias:st.dias.length, panelen:document.querySelectorAll('#rondDia .rk').length, ms:st.ms,
               aanpassen:[].some.call(document.querySelectorAll('#gGrid .dash-knop'), function(b){ return b.textContent==='Aanpassen'; }),
               breed:document.documentElement.scrollWidth, venster:window.innerWidth };
    })()`);
    toets('voortgangsbalk en titel staan er', een.voort && !!een.titel, JSON.stringify(een));
    toets('snelheid en toerental klein in de kop', een.kop && een.kopKlasse === 2, JSON.stringify(een));
    toets('kop, ⏸, ⚙ en afteller samen hoogstens 60 px', een.kopHoog > 0 && een.kopHoog <= 60, JSON.stringify(een));
    toets('meerdere categorieën, de titel telt ze, en de dia heeft panelen', een.dias >= 3 && een.titel.indexOf('/ ' + een.dias) > -1 && een.panelen >= 1, JSON.stringify(een));
    toets('standaard 10 s', een.ms === 10000, een.ms);
    toets('geen Aanpassen in de rondgang', !een.aanpassen);
    toets('past op het scherm', een.breed <= een.venster, JSON.stringify(een));

    // De regel "wat dit zegt": in de demo geeft de accu altijd een waarde
    // en draait de motor, dus de pagina met 'laden' hoort een zin te dragen.
    const duid = await app.ev(`(async function(){
      pidVals['0142']=14.07; pidVals['010C']=1600; pidHist['0142']=[{t:Date.now(),v:14.07}];
      let st=PLRond.staat(); const i=st.dias.findIndex(function(d){ return d.duid.indexOf('laden')>-1; });
      if(i<0) return { geen:true, dias:st.dias.map(function(d){ return d.id+':'+d.duid; }) };
      for(let k=0;k<st.dias.length && PLRond.staat().i!==i;k++) PLRond.stap(1);
      ${wacht(700)}
      const el=document.getElementById('rondDuid');
      return { i:i, nu:PLRond.staat().i, tekst:el ? el.textContent : null, zicht:!!el && !el.hidden && el.getClientRects().length>0 };
    })()`);
    toets('een pagina met Accu en laden zegt in één regel wat de spanning betekent', duid.zicht && /dynamo laadt de accu \(14,1 V\)/.test(duid.tekst || ''), JSON.stringify(duid));

    console.log('\n1b. De selectie blijft van de klant');
    const eenB = await app.ev(`(async function(){
      const p=PLRond.staat().dias.reduce(function(a,d){ return a.concat(d.pids); }, []).filter(function(x){ return x!=='0105'; })[0];
      activePIDs.delete(p); manualPIDs.delete(p);
      setPidView('overzicht'); setPidView('slim'); PLRond.stap(1); PLRond.stap(1); ${wacht(500)}
      const terug=activePIDs.has(p), mist=PLRond.nogUit();
      const inDia=PLRond.staat().dias.some(function(d){ return d.pids.indexOf(p)>-1; });
      let mistKnop=false; for(let k=0;k<PLRond.staat().dias.length && !mistKnop;k++){ mistKnop=!!document.getElementById('rondMist'); if(!mistKnop) PLRond.stap(1); }
      PLRond.instellingen(); const knop=!!document.getElementById('rondAlleAan');
      const n=PLRond.alleAan(); PLRond.sluit(); ${wacht(200)}
      return { p:p, terug:terug, inDia:inDia, mist:mist, knop:knop, mistKnop:mistKnop, n:n, na:activePIDs.has(p) };
    })()`);
    toets('een sensor die je uitzet, zet de rondgang niet stil terug', eenB.p && !eenB.terug, JSON.stringify(eenB));
    toets('en hij staat niet als lege tegel op een dia', !eenB.inDia, JSON.stringify(eenB));
    toets('het ⚙-blad telt hem en biedt "Zet ze aan"', eenB.mist.indexOf(eenB.p) > -1 && eenB.knop, JSON.stringify(eenB));
    toets('een dia van zijn categorie zegt onderaan dat er sensoren uit staan', eenB.mistKnop, JSON.stringify(eenB));
    toets('"Zet ze aan" zet hem aan', eenB.n >= 1 && eenB.na, JSON.stringify(eenB));

    console.log('\n2. De klok en Pauze');
    const twee = await app.ev(`(async function(){
      PLRond.zetMs(5000); PLRond.sluit();
      const i0=PLRond.staat().i; ${wacht(5800)}
      const i1=PLRond.staat().i;
      PLRond.pauze(); const knop=document.getElementById('rondPauze').textContent; ${wacht(5800)}
      const i2=PLRond.staat().i; PLRond.pauze();
      return { i0:i0, i1:i1, i2:i2, knop:knop, dias:PLRond.staat().dias.length };
    })()`);
    toets('na 5 s de volgende dia', twee.i1 === (twee.i0 + 1) % twee.dias, JSON.stringify(twee));
    toets('Pauze: de knop wordt ▶ en de dia blijft staan', twee.knop === '▶' && twee.i2 === twee.i1, JSON.stringify(twee));

    console.log('\n3. › met de hand');
    const drie = await app.ev(`(async function(){
      const i0=PLRond.staat().i, t0=document.getElementById('rondTitel').textContent;
      PLRond.stap(1); ${wacht(200)}
      return { i0:i0, i1:PLRond.staat().i, t0:t0, t1:document.getElementById('rondTitel').textContent, n:PLRond.staat().dias.length };
    })()`);
    toets('› gaat een dia verder en de titel verandert', drie.i1 === (drie.i0 + 1) % drie.n && drie.t1 !== drie.t0, JSON.stringify(drie));

    console.log('\n4. Alarm');
    const vier = await app.ev(`(async function(){
      const st=PLRond.staat(), iT=st.dias.findIndex(function(d){ return d.pids.indexOf('0105')>-1; });
      if(iT<0) return { geen:true };
      if(st.i===iT) PLRond.stap(1);
      const voor=PLRond.staat().i;
      pidVals['0105']=135; _pidLastUpd['0105']=Date.now(); applyG('0105', 135); ${wacht(700)}
      const tijdens={ i:PLRond.staat().i, alarm:PLRond.staat().alarm, balk:!!document.getElementById('rondAlarm') };
      pidVals['0105']=88; _pidLastUpd['0105']=Date.now(); applyG('0105', 88); ${wacht(700)}
      // Zonder hertekenen: alleen PLDash.bij() → PLRond.bij() kan hem zetten.
      const naAlarm=PLRond.staat().alarm;
      pidVals['0105']=91; _pidLastUpd['0105']=Date.now(); applyG('0105', 91);
      return { iT:iT, voor:voor, tijdens:tijdens, na:naAlarm, balkNa:!!document.getElementById('rondAlarm'), getal:(document.getElementById('rv-0105')||{}).textContent };
    })()`);
    toets('de demo-auto heeft koelwater in de rondgang', !vier.geen, JSON.stringify(vier));
    toets('135 °C haalt Temperaturen in beeld, met de melding', vier.voor !== vier.iT && vier.tijdens.i === vier.iT && vier.tijdens.alarm === vier.iT && vier.tijdens.balk, JSON.stringify(vier));
    toets('een nieuwe waarde landt in zijn paneel zonder hertekenen (91)', vier.getal === '91', JSON.stringify(vier));
    toets('weer normaal: het alarm en de melding zijn weg', vier.na === -1 && !vier.balkNa, JSON.stringify(vier));

    console.log('\n5. De bus');
    // Een snelle sensor van een dia die niet nu en niet de volgende is: een
    // trage (koelwater, 10 s) zit al boven REM_MS en zegt niets over de rem.
    const vijf = await app.ev(`(async function(){
      // Alleen snelle sensoren worden geremd: zoek een dia met een snelle
      // sensor erop en zet die in beeld, anders zegt "niet geremd" niets.
      const echt=PLRond.remt, kaalMs=function(p){ PLRond.remt=function(){ return false; }; try{ return pidPollInterval(p); } finally{ PLRond.remt=echt; } };
      const klasse=function(p){ return (window.PID_POLL_CLASS||{})[p.slice(2).toUpperCase()]; };
      const snelIn=function(d){ return d.pids.filter(function(p){ return /^01/.test(p) && klasse(p)<=PLRond.SNEL_MS; })[0]; };
      let st=PLRond.staat(), n=st.dias.length;
      for(let k=0;k<n && !snelIn(st.dias[st.i]);k++){ PLRond.stap(1); st=PLRond.staat(); }
      const nu=snelIn(st.dias[st.i]);
      const ver=[]; st.dias.forEach(function(d, i){ if(i!==st.i && i!==(st.i+1)%n) d.pids.forEach(function(p){ ver.push(p); }); });
      let snel=null, kaal=0;
      ver.forEach(function(p){ const m=kaalMs(p); if(snel===null && m<PLRond.REM_MS){ snel=p; kaal=m; } });
      return { nu:nu, snel:snel, kaal:kaal, remtNu:PLRond.remt(nu), remtVer:snel ? PLRond.remt(snel) : null, remtKop:PLRond.remt('010C'),
               ms:snel ? pidPollInterval(snel) : 0, rem:PLRond.REM_MS };
    })()`);
    toets('een snelle sensor van de huidige dia en de kop worden niet geremd', !!vijf.nu && !vijf.remtNu && !vijf.remtKop, JSON.stringify(vijf));
    toets('er is een snelle sensor op een andere dia', !!vijf.snel, JSON.stringify(vijf));
    toets('die gaat naar REM_MS (TEGENPROEF: zonder remt() was hij sneller)', vijf.remtVer && vijf.ms >= vijf.rem && vijf.kaal < vijf.rem, JSON.stringify(vijf));

    console.log('\n6. Mijn dashboard en het ⚙-blad');
    const zes = await app.ev(`(async function(){
      PLRond.modus('dash'); ${wacht(300)}
      const dash={ voort:!!document.getElementById('rondVoort'), aanpassen:[].some.call(document.querySelectorAll('#gGrid .dash-knop'), function(b){ return b.textContent==='Aanpassen'; }), remt:PLRond.remt('${'0105'}') };
      PLRond.modus('rond'); ${wacht(300)}
      PLRond.instellingen();
      const rijen=document.querySelectorAll('#rondBlad [data-dia]').length;
      const n0=PLRond.staat().dias.length;
      PLRond.zetDia('temp'); ${wacht(200)}
      const zonder=PLRond.staat().dias.some(function(d){ return /^temp/.test(d.id); });
      PLRond.zetDia('temp'); PLRond.zetMs(10000); PLRond.sluit(); ${wacht(200)}
      return { dash:dash, terug:!!document.getElementById('rondVoort'), rijen:rijen, zonder:zonder, n0:n0, n1:PLRond.staat().dias.length, vk:!!document.getElementById('kbRondgang') };
    })()`);
    toets('Mijn dashboard: geen rondgang, Aanpassen terug, geen rem', !zes.dash.voort && zes.dash.aanpassen && !zes.dash.remt, JSON.stringify(zes));
    toets('🔁 Rondgang zet hem weer aan', zes.terug);
    toets('⚙-blad: een vinkje per categorie', zes.rijen === 6, zes.rijen);
    toets('Temperaturen uitvinken haalt de dia weg, aanvinken zet hem terug', !zes.zonder && zes.n1 === zes.n0, JSON.stringify(zes));
    toets('Mijn voorkeuren heeft de knop Rondgang in Slim', zes.vk);

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }
  console.log(fouten === 0 ? '\nbproef-rondgang: alles goed' : '\nbproef-rondgang: ' + fouten + ' FOUT');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
