// ══════════════════════════════════════════════════════════════════
// bproef-voorkeur.js — Mijn voorkeuren in de echte app
// ──────────────────────────────────────────────────────────────────
// test-voorkeur.js toetst de kern los. Dit toetst de KOPPELING met de rest
// van de app: dat inloggen als klant de voorkeuren uit het account echt
// toepast (tekstgrootte, weergave, favorieten), dat het scherm de stand van
// het toestel overneemt en bewaart, dat na verbinden de waakronde vanzelf
// aangaat, en dat een herkende auto zijn vaste sensorselectie krijgt.
//
// De server is een nep in de pagina (plFetch voor /klant/platform).
//
// Draaien vanuit public/:  node bproef-voorkeur.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const NEPSERVER = `(async function(){
  const vin = 'JMZKF6W59J0123456';
  const S = window._nep = { log:[], opgeslagen:null, voorkeur:{ tekst:'l', weergave:'numbers', favorieten:['wc-live'], waakronde:true, oudeData:'nee' },
    voertuig:{ id:'v1', status:'actief', naam:'Blauwe Mazda', vin_pseudo: await _vlVinPseudoniem(vin), pid_selectie:['010C','0105'] } };
  const echt = window.plFetch;
  window.plFetch = async function(pad, o){
    if (String(pad).indexOf('/klant/platform') < 0) return echt(pad, o);
    const b = (o && o.json) || {}; S.log.push(b.actie);
    let d = { ok:true };
    if (b.actie === 'voorkeuren') d.voorkeur = S.voorkeur;
    else if (b.actie === 'voorkeuren_opslaan') { S.opgeslagen = b.voorkeur; d.voorkeur = b.voorkeur; }
    else if (b.actie === 'stand') d = { ok:true, akkoord:true, akkoordVersie:'2026-09-27', maxActief:3, voertuigen:[Object.assign({ aantal:{rapporten:0,ritten:0,openIssues:0} }, S.voertuig)] };
    else if (b.actie === 'rapporten') d.rapporten = [];
    return { ok:true, status:200, json: async () => d };
  };
  return vin;
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
    console.log('\n── 1. de module staat er, alleen voor klanten ──');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('PLVoorkeur staat er', await app.ev(`typeof PLVoorkeur === 'object'`));
    const vin = await app.ev(NEPSERVER);
    await app.ev(`window.currentUser = { user:'beheer', role:'admin' }; 'ok'`);
    await new Promise(r => setTimeout(r, 2500));
    toets('een beheerder ziet "Mijn voorkeuren" niet', await app.ev(`document.getElementById('kbVoorkeur').style.display === 'none'`));
    toets('en er wordt niets opgehaald', await app.ev(`window._nep.log.indexOf('voorkeuren') < 0`));

    console.log('\n── 2. inloggen als klant: het account wint ──');
    await app.ev(`localStorage.setItem('pl_uiscale','s'); setUiScale('s'); window.currentUser = { user:'anna@voorbeeld.nl', role:'klant' }; 'ok'`);
    toets('het menu-item verschijnt', await wacht(`document.getElementById('kbVoorkeur').style.display === ''`, 5000));
    toets('tekstgrootte groot uit het account (was klein op dit toestel)', await wacht(`document.body.classList.contains('uiL')`, 5000));
    toets('de weergave staat op Getallen', await wacht(`typeof pidViewMode !== 'undefined' && pidViewMode === 'numbers'`));
    toets('de favorieten komen uit het account', await app.ev(`JSON.stringify(favGet()) === '["wc-live"]'`));
    toets('eerdere rapporten: "nee" staat vast voor de analyse', await app.ev(`window._srUseContext === false`));

    console.log('\n── 3. het scherm: overnemen en bewaren ──');
    await app.ev(`PLVoorkeur.open(); 'ok'`);
    toets('het scherm opent', await app.ev(`getComputedStyle(document.getElementById('plVkOv')).display === 'flex'`));
    await app.ev(`setUiScale('m'); PLVoorkeur._overnemen(); PLVoorkeur._zet('scanBekend','overslaan'); PLVoorkeur._zet('waakronde', true); PLVoorkeur._bewaar(); 'ok'`);
    toets('bewaren stuurt de stand van het toestel mee', await wacht(`!!(window._nep.opgeslagen && window._nep.opgeslagen.tekst === 'm' && window._nep.opgeslagen.scanBekend === 'overslaan')`),
      JSON.stringify(await app.ev(`window._nep.opgeslagen`)));
    toets('en de haak voor snelverbinden volgt meteen', await app.ev(`PLVoorkeur.scanBekend() === 'overslaan'`));

    console.log('\n── 4. verbinden: waakronde aan, sensoren van de herkende auto ──');
    await app.nepAdapter({ '010C': '41 0C 0C 80', '0105': '41 05 7B', '010D': '41 0D 00' });
    await app.ev(`(function(){
      supportedPIDs = new Set(['010C','0105','010D','0104']);
      activePIDs.clear(); activePIDs.add('0104'); activePIDs.add('010D');
      vehicleInfo = Object.assign(vehicleInfo || {}, { vin: '${vin}', merk: 'Mazda' });
      connected = true; demoMode = false;
    })(); 'ok'`);
    toets('de waakronde gaat vanzelf aan', await wacht(`PLWaak.actief() === true`, 8000));
    toets('de auto wordt herkend en krijgt zijn vaste selectie', await wacht(`JSON.stringify([...activePIDs].sort()) === '["0105","010C"]'`, 10000),
      JSON.stringify(await app.ev(`[...activePIDs]`)));
    await app.ev(`PLWaak.stop(); connected = false; 'ok'`);

    console.log('\n── 5. uitloggen ──');
    await app.ev(`window.currentUser = null; 'ok'`);
    toets('de lokale kopie van de voorkeuren is weg', await wacht(`localStorage.getItem('pl_voorkeur') === null`, 5000));
    toets('de haken vallen terug op het oude gedrag', await app.ev(`PLVoorkeur.scanBekend() === 'vragen' && PLVoorkeur.samenvatting() === true`));
    toets('de app draait nog zonder fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }

  console.log('\n─────────────────────────────────────────');
  if (fouten) { console.log('bproef-voorkeur: ' + fouten + ' FOUT\n'); process.exit(1); }
  console.log('bproef-voorkeur: goed\n');
  process.exit(0);
})().catch(e => { console.error('bproef-voorkeur brak af: ' + e.message); process.exit(1); });
