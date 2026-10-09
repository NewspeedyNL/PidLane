// ══════════════════════════════════════════════════════════════════
// bproef-koopstroom.js — "Ik wil hem kopen": eerst weten, dan invullen, dan meten
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT (09-10-2026)
// Na "Ik wil hem kopen" vroeg de wizard meteen hoe lang je wilde meten, vóór
// hij iets over de auto had laten zien. De gegevens die hij daarna vroeg (km,
// prijs, kenteken) gingen nergens heen: de koopcheck vroeg ze opnieuw. En een
// proefrit die je vanuit het plan startte, kwam niet terug in het oordeel.
//
// test-weten.js en test-wizardtakken.js toetsen de kaart en de boom los. Wat
// alleen in de draaiende app te zien is:
//   1. de kaart verschijnt mét RDW, terugroepactie, merkkennis en proefrittips;
//   2. de tijdvraag zet het advies op de goede keuze;
//   3. wat je in de wizard invulde staat in de koopcheck, ook de ritduur;
//   4. een tweede keer de koopcheck openen gooit een gereden proefrit niet weg
//      (setKoopMode wist hem)  <- tegenproef;
//   5. een proefrit uit het plan loopt via de koopcheck;
//   6. een lege kaart wordt overgeslagen en "terug" landt er niet op;
//   7. de storingstak toont de laatste uitlezing bóven de vraag;
//   8. de diepe storingsanalyse vraagt geen merk en model als de app ze kent.
//
// Geen net: PLZonder.haal en PLRecall.check worden vervangen door een vaste
// Mazda, zodat de proef niet van het RDW afhangt. Alles erboven is echt.
// Draaien vanuit public/:  node bproef-koopstroom.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const rust = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  let app;
  try {
    app = await startApp({ root: path.join(__dirname) });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  const wacht = async (expr, ms) => {
    for (let i = 0; i < (ms || 8000) / 100; i++) { if (await app.ev(expr)) return true; await rust(100); }
    return false;
  };
  // Tussen haakjes: ze worden in andere uitdrukkingen geplakt, en zonder
  // haakjes maakt `a||''==='x'` van elke niet-lege tekst een treffer.
  const vraag = `((document.querySelector('#wizardNieuwOv .wz-vraag')||{}).textContent||'')`;
  const kaart = `((document.querySelector('#wzWeten')||{}).textContent||'')`;

  try {
    console.log('\n0. Boot en een vaste auto bij het RDW');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('PLWeten staat er', await app.ev(`typeof PLWeten === 'object' && typeof PLZonder.haal === 'function'`));
    await app.ev(`
      window.__rdwVragen = [];
      PLZonder.haal = async function(k){
        window.__rdwVragen.push(k);
        return { overzicht: PLZonder._kern.rdwOverzicht({ kenteken:k, merk:'MAZDA', handelsbenaming:'CX-5', vervaldatum_apk:'20270101',
          datum_eerste_toelating:'20160315', datum_eerste_tenaamstelling_in_nederland:'20160315', datum_tenaamstelling:'20230301',
          wam_verzekerd:'Ja', tellerstandoordeel:'Logisch', openstaande_terugroepactie_indicator:'Ja' },
          [{ brandstof_omschrijving:'Diesel', brandstofverbruik_gecombineerd:'5.4' }], Date.now()) };
      };
      PLRecall.check = async function(){ return { acties:[{ open:true, referentiecode:'R123', omschrijving:'Airbag bestuurder', status:'open' }] }; };
      'ok'`);

    console.log('\n1. Kopen: rol → kenteken → wat we weten');
    await app.ev(`PLWizard.open('handel'); PLWizard.kies(0); 'ok'`);
    toets('na de rol komt het kenteken', (await app.ev(vraag)) === 'Om welke auto gaat het?', await app.ev(vraag));
    await app.ev(`document.getElementById('wz_kenteken').value='ab-123-c'; PLWizard.kentekenVerder(false); 'ok'`);
    toets('daarna "Wat we al weten"', (await app.ev(vraag)) === 'Wat we al weten', await app.ev(vraag));
    toets('de kaart is binnen', await wacht(`${kaart}.indexOf('Let bij Mazda op')>-1`, 5000), await app.ev(kaart));
    const k = await app.ev(kaart);
    toets('het RDW is gevraagd met het schone kenteken', (await app.ev(`window.__rdwVragen.join(',')`)) === 'AB123C', await app.ev(`window.__rdwVragen.join(',')`));
    toets('NAP en APK staan erin', /Tellerstand \(NAP\)/.test(k) && /APK geldig tot/.test(k));
    toets('de terugroepactie met omschrijving', /R123/.test(k) && /Airbag bestuurder/.test(k));
    toets('een proefrittip uit de merkkennis (roetfilter, diesel)', /Roetfilter/.test(k));
    toets('schadehistorie wordt uitgelegd, niet beloofd', /Schadehistorie/.test(k) && /niet in de open RDW-data/.test(k));
    toets('de knop "Meer over dit model" staat er, met de prijs erbij', /Meer over dit model \(AI, kost tegoed\)/.test(k));

    console.log('\n2. Invullen, dan de tijdvraag met advies');
    await app.ev(`PLWizard.infoVerder(); 'ok'`);
    toets('daarna de gegevens', (await app.ev(vraag)) === 'Gegevens toevoegen?');
    toets('geen kentekenveld meer in de gegevens', !(await app.ev(`!!document.getElementById('wz_kenteken')`)));
    await app.ev(`document.getElementById('wz_km').value='142500'; document.getElementById('wz_prijs').value='12950';
      document.getElementById('wz_laatsteBeurt').value='130000'; PLWizard.gegevensVerder(false); 'ok'`);
    toets('daarna pas de tijd', (await app.ev(vraag)) === 'Hoeveel tijd heb je bij de auto?', await app.ev(vraag));
    const raad = await app.ev(`[...document.querySelectorAll('#wizardNieuwOv .wz-raad')].map(b=>b.textContent).join('|')`);
    toets('de uitgebreide proefrit is aanbevolen', /Uitgebreide proefrit/.test(raad) && !/Korte/.test(raad), raad);
    toets('met de reden erbij', await app.ev(`/onder belasting/.test(document.getElementById('wzBody').textContent)`));
    await app.ev(`PLWizard.kies(1); 'ok'`);
    toets('dan het plan', (await app.ev(vraag)) === 'Dit ga ik doen', await app.ev(vraag));

    console.log('\n3. De koopcheck krijgt wat je invulde');
    await app.ev(`PLWizard._modules.markt.run(PLWizard._job()); 'ok'`);
    const veld = (id) => app.ev(`(document.getElementById('${id}')||{}).value||''`);
    toets('kenteken', (await veld('koopKentInput')) === 'AB123C', await veld('koopKentInput'));
    toets('kilometerstand', (await veld('koopKmInput')) === '142500', await veld('koopKmInput'));
    toets('vraagprijs', (await veld('koopVraagprijs')) === '12950', await veld('koopVraagprijs'));
    toets('km-stand bij de laatste beurt', (await veld('koopLaatsteBeurt')) === '130000', await veld('koopLaatsteBeurt'));
    toets('de proefrit staat op 2 minuten', await app.ev(`_koopRit==='ja' && _koopRitDuur==='2min'`), await app.ev(`_koopRit+'/'+_koopRitDuur`));

    console.log('\n4. Een gereden proefrit blijft staan  <- tegenproef');
    await app.ev(`_koopProefritData='Stationair: ok'; PLWizard._modules.markt.run(PLWizard._job()); 'ok'`);
    toets('de koopcheck nog eens openen wist de proefrit niet', await app.ev(`_koopProefritData==='Stationair: ok'`), await app.ev(`String(_koopProefritData)`));

    console.log('\n5. Een proefrit uit het plan loopt via de koopcheck');
    await app.ev(`window._koopProefritActief=false; PLWizard.terugNaarPlan(); PLWizard.start(); 'ok'`);
    toets('de rit is gemarkeerd als koopproefrit: de uitslag komt terug in het oordeel', await app.ev(`window._koopProefritActief===true`));
    await app.ev(`try{ stopRitAnalyse && stopRitAnalyse(); }catch(e){} window._koopProefritActief=false; try{ closeRitAnalyse(); }catch(e){} PLWizard.sluit(); 'ok'`);

    console.log('\n6. Een lege kaart wordt overgeslagen');
    await app.ev(`window.__gv=window.getVehicle; window.getVehicle=function(){ return {}; }; PLWizard.open('handel'); PLWizard.kies(1); PLWizard.kentekenVerder(true); 'ok'`);
    toets('verkoop zonder kenteken en zonder auto: door naar de gegevens', await wacht(`${vraag}==='Gegevens toevoegen?'`, 4000), await app.ev(vraag));
    await app.ev(`PLWizard.terug(); 'ok'`);
    toets('"terug" landt op het kenteken, niet op de lege kaart', (await app.ev(vraag)) === 'Om welke auto gaat het?', await app.ev(vraag));
    await app.ev(`window.getVehicle=window.__gv; PLWizard.sluit(); 'ok'`);

    console.log('\n7. Er is iets mis: de laatste uitlezing bóven de vraag');
    await app.ev(`PLFoutcodes.staat().scan={ tijd:Date.now(), codes:{ bevestigd:['P0301'], pending:[], permanent:[] } }; PLWizard.open('storing'); 'ok'`);
    toets('de kaart toont P0301', await wacht(`${kaart}.indexOf('P0301')>-1`, 4000), await app.ev(kaart));
    toets('en staat vóór de vraag', await app.ev(`(function(){ var w=document.getElementById('wzWeten'), v=document.querySelector('#wizardNieuwOv .wz-vraag');
      return !!w && !!v && !!(w.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING); })()`));
    toets('de vraag zelf is ongewijzigd', (await app.ev(vraag)) === 'Wanneer merk je het?');
    await app.ev(`PLFoutcodes.staat().scan=null; PLWizard.sluit(); 'ok'`);

    console.log('\n8. Diepe storingsanalyse: merk en model zijn geen vraag als de app ze kent');
    await app.ev(`window.__vi=JSON.stringify(vehicleInfo); vehicleInfo.merk='Mazda'; vehicleInfo.model='CX-5'; openDeepDiag(); 'ok'`);
    toets('geen stap "Merk en model"', await app.ev(`window._ddSteps.every(function(s){ return s.t!=='Merk en model'; })`));
    toets('het veld is er wel, verborgen, met de auto', (await app.ev(`(function(){ var i=document.getElementById('dd_merk'); return i ? i.type+':'+i.value : ''; })()`)) === 'hidden:Mazda CX-5');
    toets('de auto staat in de eerste stap', await app.ev(`/Auto: Mazda CX-5/.test(document.getElementById('ddStepSub').textContent)`));
    await app.ev(`closeDeepDiag(); vehicleInfo.merk=''; vehicleInfo.model=''; openDeepDiag(); 'ok'`);
    toets('onbekende auto: de stap blijft  <- tegenproef', await app.ev(`window._ddSteps.some(function(s){ return s.t==='Merk en model'; })`));
    await app.ev(`closeDeepDiag(); Object.assign(vehicleInfo, JSON.parse(window.__vi)); 'ok'`);

    toets('geen JS-fouten tijdens de proef', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log(fouten ? '\n' + fouten + ' FOUT' : '\nAlles goed');
  process.exit(fouten ? 1 : 0);
})();
