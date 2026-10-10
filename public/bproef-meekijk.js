// ══════════════════════════════════════════════════════════════════
// bproef-meekijk.js — meekijken met een code, in de echte app (10-10-2026)
// ──────────────────────────────────────────────────────────────────
// test-meekijk.js toetst de server. Dit toetst de twee schermen eromheen:
//   • Mijn voertuigen (klant): code maken, zien wat ermee gebeurde, intrekken;
//   • Voertuigen van een klant (beheer): code invullen, voertuigen zien,
//     een sensor toevoegen, en een weigering van de server laten zien.
// De server is een nep in de pagina (plFetch, zoals bproef-garage.js).
//
// TEGENPROEVEN DIE ERIN ZITTEN
//   • een klant opent het beheervenster niet;
//   • na sluiten staat er niets meer van de vorige klant;
//   • plmutate.sh: het blok in Mijn voertuigen weg → deel 1 rood.
//
// Draaien vanuit public/:  node bproef-meekijk.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const NEP = `(function(){
  const S = window._nep = { code:null, log:[], eigen:[{ code:'222A05', ecu:'720', naam:'Band LV', formule:'A*4', eenheid:'kPa' }] };
  const echt = window.plFetch;
  window.plFetch = async function(pad, o){
    const b = (o && o.json) || {};
    let d = { ok:true }, status = 200;
    if (String(pad).indexOf('/klant/platform') >= 0) {
      S.log.push('klant:' + b.actie);
      if (b.actie === 'stand') d = { ok:true, akkoord:true, akkoordVersie:'x', maxActief:3, kentekenBewaarbaar:true,
        voertuigen:[{ id:'v1', status:'actief', naam:'Mazda', merk:'Mazda', model:'CX-5', eigen_pids:S.eigen, aantal:{ rapporten:0, ritten:0, openIssues:0 } }] };
      else if (b.actie === 'meekijk') d.meekijk = S.code ? { code:S.code, verloopt:'2026-10-17T10:00:00.000Z', aantal:2, bekeken_op:'2026-10-10T09:00:00.000Z', erbij:1 } : null;
      else if (b.actie === 'meekijk_aan') { S.code = 'KX7P2M'; d.meekijk = { code:S.code, verloopt:'2026-10-17T10:00:00.000Z', aantal:0, erbij:0 }; }
      else if (b.actie === 'meekijk_uit') S.code = null;
      else if (b.actie === 'ritten') d.ritten = [];
      else if (b.actie === 'pidbib_lijst') d.lijst = [];
    } else if (String(pad).indexOf('/admin/meekijk') >= 0) {
      S.log.push('beheer:' + b.actie + ':' + b.code);
      if (b.code !== 'KX7P2M') { status = 404; d = { ok:false, error:'Code onbekend, verlopen of ingetrokken.' }; }
      else if (b.actie === 'open') d = { ok:true, verloopt:'2026-10-17T10:00:00.000Z',
        voertuigen:[{ id:'v1', status:'actief', naam:'Mazda van Anna', kenteken:'AB123C', merk:'Mazda', model:'CX-5', bouwjaar:2018, kmstand:84000, eigen_pids:S.eigen }],
        issues:[{ voertuig_id:'v1', sleutel:'dtc:P0171', titel:'P0171 Systeem te mager', aantal:3 }] };
      else if (b.actie === 'pid_erbij') {
        S.laatstePid = b.pid;
        if (S.eigen.some(e => e.code === b.pid.code)) { status = 409; d = { ok:false, error: b.pid.code + ' staat er al. Wijzigen doet de klant zelf.' }; }
        else { S.eigen = S.eigen.concat([b.pid]); d.eigen_pids = S.eigen; }
      }
    } else return echt(pad, o);
    return { ok: status < 300, status, json: async () => d };
  };
  return true;
})()`;

(async () => {
  let app;
  try { app = await startApp({ root: path.join(__dirname) }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  const rust = (ms) => new Promise(r => setTimeout(r, ms));
  const wacht = async (expr, ms) => { for (let i = 0; i < (ms || 6000) / 100; i++) { if (await app.ev(expr)) return true; await rust(100); } return false; };
  const tekst = (id) => app.ev(`(document.getElementById('${id}')||{}).textContent||''`);
  try {
    await app.venster(412, 915);
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    await app.ev(NEP);

    console.log('\n1. De klant: code maken, zien, intrekken');
    await app.ev(`window.currentUser = { user:'anna@voorbeeld.nl', role:'klant', label:'Anna' }; PLGarage.open(); 'ok'`);
    toets('Mijn voertuigen toont het blok Meekijken door PidLane', await wacht(`/Meekijken door PidLane/.test(document.getElementById('plGarBody').textContent) && /Laat PidLane meekijken/.test(document.getElementById('plGarBody').textContent)`, 8000),
      (await tekst('plGarBody')).slice(0, 200));
    toets('de uitleg zegt dat PidLane niets kan wijzigen', /Wijzigen of verwijderen kan PidLane niet/.test(await tekst('plGarBody')));
    await app.ev(`PLGarage._meekijkAan(); 'ok'`);
    toets('na de knop: de code staat er groot', await wacht(`/KX7P2M/.test((document.querySelector('#plGarOv .gr-meekijkcode')||{}).textContent||'')`));
    await app.ev(`PLGarage.sluit(); PLGarage.open(); 'ok'`);
    toets('opnieuw geopend: hoe vaak er gekeken is en hoeveel sensoren erbij kwamen', await wacht(`/Bekeken: 2×/.test(document.getElementById('plGarBody').textContent) && /Sensoren toegevoegd: 1/.test(document.getElementById('plGarBody').textContent)`));

    await app.ev(`window._echtConfirm = window.confirm; window.confirm = () => true; PLGarage._meekijkUit(); 'ok'`);
    toets('intrekken: de code is weg en de knop is terug', await wacht(`!document.querySelector('#plGarOv .gr-meekijkcode') && /Laat PidLane meekijken/.test(document.getElementById('plGarBody').textContent) && window._nep.code === null`));
    await app.ev(`window.confirm = window._echtConfirm; PLGarage._meekijkAan(); 'ok'`);
    await wacht(`window._nep.code === 'KX7P2M'`);

    console.log('\n2. Een klant komt niet in het beheervenster');
    await app.ev(`PLGarage.sluit(); PLMeekijk.open(); 'ok'`);
    toets('als klant opent het niet', await app.ev(`!document.getElementById('plMkOv') || getComputedStyle(document.getElementById('plMkOv')).display === 'none'`));

    console.log('\n3. Beheer: code invullen, voertuigen zien');
    await app.ev(`window.currentUser = { user:'beheer', role:'admin', label:'Beheer' }; 'ok'`);
    toets('het menu-item staat in de Admin-groep', await app.ev(`!!document.querySelector('#admGroup #kbMeekijk')`));
    await app.ev(`PLMeekijk.open(); 'ok'`);
    toets('het venster vraagt om de code', await wacht(`!!document.getElementById('mkCode')`));
    await app.ev(`document.getElementById('mkCode').value = 'zzzzzz'; PLMeekijk._open(); 'ok'`);
    toets('een verkeerde code: de melding van de server', await wacht(`/Code onbekend/.test(document.getElementById('plMkBody').textContent)`));
    await app.ev(`document.getElementById('mkCode').value = 'kx7p2m'; PLMeekijk._open(); 'ok'`);
    toets('de juiste code (kleine letters mag): de voertuigen van de klant', await wacht(`/Mazda van Anna/.test(document.getElementById('plMkBody').textContent)`), (await tekst('plMkBody')).slice(0, 200));
    toets('met kenteken, eigen sensoren en open punten', /AB123C/.test(await tekst('plMkBody')) && /222A05/.test(await tekst('plMkBody')) && /P0171/.test(await tekst('plMkBody')));
    toets('de oude foutmelding is weg', !/Code onbekend/.test(await tekst('plMkBody')));

    console.log('\n4. Een sensor toevoegen');
    await app.ev(`PLMeekijk._form('v1'); 'ok'`);
    await app.ev(`(function(){ const z=(i,v)=>{ document.getElementById(i).value=v; }; z('mkPidCode','222a06'); z('mkPidEcu','720'); z('mkPidNaam','Band RV'); z('mkPidFormule','A*4'); z('mkPidEenheid','kPa'); })(); PLMeekijk._bewaar('v1'); 'ok'`);
    toets('de server krijgt de sensor, code in hoofdletters', await wacht(`!!(window._nep.laatstePid && window._nep.laatstePid.code === '222A06' && window._nep.laatstePid.naam === 'Band RV')`), JSON.stringify(await app.ev(`window._nep.laatstePid`)));
    toets('en hij staat daarna in de lijst', await wacht(`/222A06/.test(document.getElementById('plMkBody').textContent) && !document.getElementById('mkPidCode')`));
    await app.ev(`PLMeekijk._form('v1'); (function(){ document.getElementById('mkPidCode').value='222A05'; document.getElementById('mkPidNaam').value='Anders'; })(); PLMeekijk._bewaar('v1'); 'ok'`);
    toets('een sensor die er al staat: de weigering staat in beeld', await wacht(`/staat er al/.test(document.getElementById('plMkBody').textContent)`));

    console.log('\n5. Sluiten = niets meer van deze klant');
    await app.ev(`PLMeekijk.sluit(); PLMeekijk.open(); 'ok'`);
    toets('opnieuw geopend: weer het codeveld, geen voertuigen', await wacht(`!!document.getElementById('mkCode') && !/Mazda van Anna/.test(document.getElementById('plMkBody').textContent)`));
    await app.ev(`PLMeekijk.sluit(); window.currentUser = null; 'ok'`);
    toets('geen JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log('\n' + (fouten ? 'bproef-meekijk: ' + fouten + ' FOUT' : 'bproef-meekijk: alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('  FOUT ' + (e && e.stack || e)); process.exit(1); });
