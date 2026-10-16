// ══════════════════════════════════════════════════════════════════
// bproef-kenmerk.js — de derde poort in de echte app (#532)
// ──────────────────────────────────────────────────────────────────
// test-kenmerk.js toetst PLKenmerk los. Dit is de koppeling: laadt de module
// in index.html, rekent correlationLines() (wat de AI als bevinding krijgt)
// door de poort, noteert wat onbeslist is in het blok voor de AI, en staat
// de vraag in het venster van de bevindingen — met een antwoord dat blijft.
//   1. Audi, koelwater 109 °C: niet als bevinding naar de AI, wél als
//      "niet te beoordelen" in het blok, en de vraag in het venster
//   2. "Nee" op de vraag: daarna is 109 °C op die auto wél een bevinding
//   3. tegenproef: een Mazda op 109 °C krijgt hem als let op, niet zeker
// Draaien: bash plbrowser.sh .   (of node public/bproef-kenmerk.js)
// ══════════════════════════════════════════════════════════════════
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

    console.log('\n1. Audi op 109 °C: niet te beoordelen');
    const een = await app.ev(`(async function(){
      stopPoll(); ${wacht(300)}
      const zet=function(merk){ vehicleInfo.merk=merk; vehicleInfo.year='2016'; vehicleInfo.brandstof='benzine'; PLKenmerk.vergeet(); pidVals['0105']=109; pidVals['010C']=900; };
      zet('Audi');
      const lijnen=correlationLines().join('\\n'), blok=PLKenmerk.blok();
      openBevindingen(); ${wacht(200)}
      const vraag=document.querySelector('#bevOnbeslist .bev-vraag[data-kenmerk="kenveldthermostaat"]');
      return { geladen:!!window.PLKenmerk, inLijnen:/Koelwater loopt op/.test(lijnen), blok:blok,
               vak:!!document.getElementById('bevOnbeslist'), vraag:!!vraag, knoppen:vraag ? vraag.querySelectorAll('button').length : 0 };
    })()`);
    toets('PLKenmerk hangt in index.html en laadt', een.geladen);
    toets('109 °C op een Audi gaat niet als bevinding naar de AI', !een.inLijnen, JSON.stringify(een));
    toets('het AI-blok zegt dat het niet te beoordelen is, met de instructie', /NIET TE BEOORDELEN[\s\S]*Koelwater loopt op[\s\S]*GEEN conclusie/.test(een.blok), een.blok);
    toets('het venster van de bevindingen toont het, met de vraag en Ja/Nee', een.vak && een.vraag && een.knoppen === 2, JSON.stringify(een));

    console.log('\n2. Een mens beantwoordt de vraag');
    const twee = await app.ev(`(async function(){
      const nee=document.querySelectorAll('#bevOnbeslist .bev-vraag[data-kenmerk="kenveldthermostaat"] button')[1];
      nee.click(); ${wacht(200)}
      pidVals['0105']=109; pidVals['010C']=900;
      const w=PLWaarneming.lees('kenveldthermostaat');
      return { status:w.status, bron:w.bron, inLijnen:/Koelwater loopt op/.test(correlationLines().join('\\n')), vak:!!document.getElementById('bevOnbeslist') };
    })()`);
    toets('"Nee" wordt bewaard als weerlegd door een mens', twee.status === 'weerlegd' && twee.bron === 'mens', JSON.stringify(twee));
    toets('daarna is 109 °C op deze auto wél een bevinding', twee.inLijnen, JSON.stringify(twee));
    toets('en de vraag is weg uit het venster', !twee.vak, JSON.stringify(twee));

    console.log('\n3. Tegenproef: een Mazda op 109 °C');
    const drie = await app.ev(`(async function(){
      closeBevindingen(); PLWaarneming.wis();
      vehicleInfo.merk='Mazda'; PLKenmerk.vergeet(); pidVals['0105']=109; pidVals['010C']=900;
      const l=correlationLines().filter(function(x){ return /Koelwater loopt op/.test(x); });
      return { regel:l[0]||null };
    })()`);
    toets('een Mazda krijgt hem als bevinding, met "niet zeker voor deze auto"', !!drie.regel && /niet zeker voor deze auto/.test(drie.regel), JSON.stringify(drie));

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }
  console.log(fouten === 0 ? '\nbproef-kenmerk: alles goed' : '\nbproef-kenmerk: ' + fouten + ' FOUT');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
