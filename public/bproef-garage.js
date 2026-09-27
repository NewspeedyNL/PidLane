// ══════════════════════════════════════════════════════════════════
// bproef-garage.js — Mijn voertuigen in de echte app
// ──────────────────────────────────────────────────────────────────
// test-garage.js toetst de kern los en test-klantplatform.js de Worker.
// Dit toetst de KOPPELING: dat een klant het menu-item en het kaartje
// op het startscherm krijgt en een beheerder niet, dat het akkoord vóór
// alles komt, dat het formulier een voertuig maakt, dat een rapport dat
// de app ergens anders maakt (registerSessionReport) vanzelf bij het
// actieve voertuig landt, en dat het foutcodevenster issues aanmaakt.
//
// De server is een nep in de pagina: plFetch wordt vervangen voor alleen
// /klant/platform. De Worker zelf heeft zijn eigen test.
//
// Draaien vanuit public/:  node bproef-garage.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const NEPSERVER = `(function(){
  const S = window._nepPlatform = { akkoord:false, voertuigen:[], rapporten:[], issues:{}, log:[] };
  const echt = window.plFetch;
  window.plFetch = async function(pad, o){
    if (String(pad).indexOf('/klant/platform') < 0) return echt(pad, o);
    const b = (o && o.json) || {}; S.log.push(b.actie);
    let d = { ok:true };
    if (b.actie === 'stand') d = { ok:true, akkoord:S.akkoord, akkoordVersie:'2026-09-27', maxActief:3, kentekenBewaarbaar:true,
        voertuigen: S.voertuigen.map(v => Object.assign({}, v, { aantal:{ rapporten:S.rapporten.filter(r=>r.voertuig_id===v.id).length, ritten:0,
          openIssues:Object.values(S.issues[v.id]||{}).filter(i=>i.status==='open').length } })) };
    else if (b.actie === 'akkoord') S.akkoord = true;
    else if (b.actie === 'voertuig_opslaan') {
      if (b.voertuig.id) { const v = S.voertuigen.find(x=>x.id===b.voertuig.id); Object.assign(v, b.voertuig); d.voertuig = v; }
      else { const v = Object.assign({ id:'v'+(S.voertuigen.length+1), status:'actief' }, b.voertuig);
        if (v.kenteken) v.kenteken = String(v.kenteken).toUpperCase().replace(/[^A-Z0-9]/g,'');
        S.voertuigen.push(v); d.voertuig = v; d.kentekenOpgeslagen = !!v.kenteken; }
    }
    else if (b.actie === 'rapport_opslaan') { S.rapporten.push(b); d.id = 'r'+S.rapporten.length; }
    else if (b.actie === 'rapporten') d.rapporten = S.rapporten.filter(r=>r.voertuig_id===b.voertuig_id).map((r,i)=>({ id:'r'+(i+1), soort:r.soort, titel:r.titel, aangemaakt:new Date().toISOString() }));
    else if (b.actie === 'issues') d.issues = Object.values(S.issues[b.voertuig_id]||{});
    else if (b.actie === 'issues_bijwerken') { const m = S.issues[b.voertuig_id] = S.issues[b.voertuig_id]||{};
      b.ops.forEach(o2 => { if (o2.actie==='gezien') m[o2.sleutel] = Object.assign({ status:'open', aantal:1, eerst_gezien:new Date().toISOString(), laatst_gezien:new Date().toISOString() }, o2, { status:'open' });
        else if (m[o2.sleutel]) m[o2.sleutel].status = o2.actie; }); }
    else if (b.actie === 'ritten') d.ritten = [];
    return { ok:true, status:200, json: async () => d };
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
  const wacht = async (expr, ms) => {
    for (let i = 0; i < (ms || 8000) / 100; i++) { if (await app.ev(expr)) return true; await new Promise(r => setTimeout(r, 100)); }
    return false;
  };

  try {
    console.log('\n── 1. de module staat er, en is er alleen voor klanten ──');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('PLGarage staat er', await app.ev(`typeof PLGarage === 'object'`));
    await app.ev(NEPSERVER);
    await app.ev(`window.currentUser = { user:'beheer', role:'admin', label:'Beheer' }; 'ok'`);
    await new Promise(r => setTimeout(r, 2500));
    toets('een beheerder ziet geen "Mijn voertuigen" in het menu', await app.ev(`document.getElementById('kbGarage').style.display === 'none'`));
    toets('en geen kaartje op het startscherm', await app.ev(`document.getElementById('plGarageKaart').innerHTML === ''`));

    await app.ev(`window.currentUser = { user:'anna@voorbeeld.nl', role:'klant', label:'Anna' }; 'ok'`);
    toets('een klant krijgt het menu-item', await wacht(`document.getElementById('kbGarage').style.display === ''`, 5000));
    toets('en het kaartje op het startscherm', await wacht(`/Mijn voertuigen/.test(document.getElementById('plGarageKaart').textContent)`, 5000));

    console.log('\n── 2. eerst akkoord, dan pas iets bewaren ──');
    await app.ev(`PLGarage.open(); 'ok'`);
    toets('het venster opent met de akkoordtekst', await wacht(`/Wat we bewaren/.test(document.getElementById('plGarBody').textContent)`));
    const tekst = await app.ev(`document.getElementById('plGarBody').textContent`);
    toets('de tekst noemt het kenteken versleuteld en de VIN een pseudoniem', /kenteken versleuteld/i.test(tekst) && /pseudonimisering/i.test(tekst));
    toets('de tekst claimt geen anonimiteit', !/anoniem|anonimi/i.test(tekst));
    toets('vóór het akkoord gaat er geen rapport de server op', await app.ev(`(function(){ registerSessionReport({ type:'ai', title:'x', text:'vooraf '+Date.now() }); return window._nepPlatform.rapporten.length === 0; })()`));
    await app.ev(`PLGarage._akkoord(); 'ok'`);
    toets('na het akkoord: de lijst', await wacht(`/Voertuig toevoegen/.test(document.getElementById('plGarBody').textContent)`));

    console.log('\n── 3. een voertuig toevoegen ──');
    await app.ev(`PLGarage._nieuw(); 'ok'`);
    await app.ev(`(function(){ const z=(id,w)=>{ document.getElementById('grf_'+id).value=w; };
      z('naam','Blauwe Mazda'); z('kenteken','ab-123-c'); z('merk','Mazda'); z('model','CX-5'); z('bouwjaar','2018');
      document.getElementById('grf_brandstof').value='benzine'; document.getElementById('grf_turbo').value='nee';
      document.getElementById('grf_rijprofiel').value='gemengd'; z('verbruik_opgegeven','7.2'); z('apk_tot','2027-03-14'); })(); 'ok'`);
    await app.ev(`PLGarage._bewaar(); 'ok'`);
    toets('het voertuig is aangemaakt en actief', await wacht(`!!(PLGarage.actief() && PLGarage.actief().naam === 'Blauwe Mazda')`));
    toets('het detailvenster toont de status en het advies', await wacht(`/Condities/.test(document.getElementById('plGarBody').textContent) && /Advies/.test(document.getElementById('plGarBody').textContent)`));
    toets('het kenteken staat als gele plaat met streepjes', await app.ev(`/AB-123-C/.test(document.querySelector('#plGarBody .gr-kent').textContent)`));

    console.log('\n── 4. rapporten en foutcodes komen vanzelf bij het voertuig ──');
    await app.ev(`registerSessionReport({ type:'ai', title:'AI-monteur', text:'Mager mengsel, controleer de inlaat. '+Date.now() }); 'ok'`);
    toets('een AI-rapport uit de rest van de app landt bij het actieve voertuig', await wacht(`window._nepPlatform.rapporten.some(r => r.voertuig_id === 'v1' && r.soort === 'ai')`));
    await app.nepAdapter({ '0101': '41 01 81 07 65 00', '03': '43 01 01 71', '07': '47 00', '0A': '4A 00', '010C': '41 0C 00 00', '010D': '41 0D 00' });
    await app.ev(`connected = true; demoMode = false; PLFoutcodes.scan(); 'ok'`);
    toets('een uitlezing in het foutcodevenster wordt een open punt', await wacht(`!!(window._nepPlatform.issues.v1 && window._nepPlatform.issues.v1['dtc:P0171'])`, 15000));
    toets('en de keuringsstatus gaat mee in de status', await wacht(`window._nepPlatform.log.indexOf('status_opslaan') >= 0`));
    await app.ev(`connected = false; PLFoutcodes.sluit(); 'ok'`);

    console.log('\n── 5. de terugknop en het startscherm ──');
    await app.ev(`PLGarage.open(); 'ok'`);
    await app.ev(`appBack(); 'ok'`);
    toets('de terugknop sluit het venster', await app.ev(`getComputedStyle(document.getElementById('plGarOv')).display === 'none'`));
    toets('het kaartje toont het actieve voertuig', await wacht(`/Blauwe Mazda/.test(document.getElementById('plGarageKaart').textContent)`));
    await app.ev(`window.currentUser = null; 'ok'`);
    toets('na uitloggen is het kaartje weg', await wacht(`document.getElementById('plGarageKaart').innerHTML === ''`, 5000));
    toets('en de kopie van de stand ook', await app.ev(`localStorage.getItem('pl_garage_stand') === null`));
    toets('de app draait nog zonder fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }

  console.log('\n─────────────────────────────────────────');
  if (fouten) { console.log('bproef-garage: ' + fouten + ' FOUT\n'); process.exit(1); }
  console.log('bproef-garage: goed\n');
  process.exit(0);
})().catch(e => { console.error('bproef-garage brak af: ' + e.message); process.exit(1); });
