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
    else if (b.actie === 'ritten') d.ritten = S.ritten || [];
    else if (b.actie === 'rapport') { const i = parseInt(String(b.id).slice(1), 10) - 1; const r = S.rapporten[i];
      d.rapport = r ? { id: b.id, soort: r.soort, titel: r.titel, tekst: r.tekst, aangemaakt: new Date(Date.now() - (10 - i) * 60000).toISOString() } : null; }
    else if (b.actie === 'rapport_verwijder') { S.gewist = (S.gewist || []).concat(b.ids || [b.id]); d.gewist = (b.ids || [b.id]).length; }
    else if (b.actie === 'rit_label') { (S.ritten || []).forEach(r => { if (r.id === b.id) r.label = b.label || null; }); d.label = b.label || null; }
    else if (b.actie === 'pidbib_lijst') d.lijst = S.bib || [];
    else if (b.actie === 'obdb_bestand') { S.obdbGehaald = b.repo; d.gevonden = !!S.obdb; if (S.obdb) d.data = S.obdb; }
    else if (b.actie === 'pidbib_kandidaten') { S.kandidaten = b.lijst; S.kandidaatBron = b.bron; d.erbij = b.lijst.length; d.geweigerd = 0; }
    else if (b.actie === 'pidbib_stem') (S.stemmen = S.stemmen || []).push(b.id + ':' + b.uitkomst);
    else if (b.actie === 'pidbib_deel') S.gedeeld = b.code + '@' + b.ecu;
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
    console.log('\n── 1. de module staat er, voor klanten en beheer ──');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('PLGarage staat er', await app.ev(`typeof PLGarage === 'object'`));
    await app.ev(NEPSERVER);
    await app.ev(`window.currentUser = { user:'monteur', role:'user', label:'Monteur' }; 'ok'`);
    await new Promise(r => setTimeout(r, 2500));
    toets('een monteur ziet geen "Mijn voertuigen" in het menu', await app.ev(`document.getElementById('kbGarage').style.display === 'none'`));
    toets('en geen knop "Eigen" in de sensorkeuzelijst (#474)', await app.ev(`document.getElementById('pidGarSens').style.display === 'none'`));
    toets('en geen kaartje op het startscherm', await app.ev(`document.getElementById('plGarageKaart').innerHTML === ''`));
    // Sinds 10-10-2026 heeft een beheerder een eigen Mijn voertuigen.
    await app.ev(`window.currentUser = { user:'beheer', role:'admin', label:'Beheer' }; 'ok'`);
    toets('een beheerder krijgt het menu-item wél', await wacht(`document.getElementById('kbGarage').style.display === ''`, 5000));
    await app.ev(`window._nepPlatform.voertuigen.push({ id:'vb', status:'actief', naam:'Testauto beheer' }); window._nepPlatform.akkoord = true; PLGarage.ververs(); 'ok'`);
    toets('…met zijn eigen auto', await wacht(`JSON.stringify((PLGarage.staat().stand||{}).voertuigen||[]).includes('Testauto beheer')`, 5000));
    await app.ev(`window._nepPlatform.voertuigen = []; window._nepPlatform.akkoord = false; 'ok'`);

    await app.ev(`window.currentUser = { user:'anna@voorbeeld.nl', role:'klant', label:'Anna' }; 'ok'`);
    toets('een klant krijgt het menu-item', await wacht(`document.getElementById('kbGarage').style.display === ''`, 5000));
    toets('na de wissel van beheer naar klant staat de auto van beheer er niet meer', await wacht(`!JSON.stringify((PLGarage.staat().stand||{}).voertuigen||[]).includes('Testauto beheer')`, 5000));
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
    // #476: het kenteken uit de verbindingsstap staat al ingevuld.
    await app.ev(`localStorage.setItem('pl_kenteken', 'R-054-XD'); PLGarage._nieuw(); 'ok'`);
    toets('Voertuig toevoegen vult het kenteken van de verbinding al in (#476)', await wacht(`String((document.getElementById('grf_kenteken')||{}).value).replace(/-/g,'') === 'R054XD'`));
    await app.ev(`localStorage.removeItem('pl_kenteken'); PLGarage._nieuw(); 'ok'`);
    await app.ev(`(function(){ const z=(id,w)=>{ document.getElementById('grf_'+id).value=w; };
      z('naam','Blauwe Mazda'); z('kenteken','ab-123-c'); z('merk','Mazda'); z('model','CX-5'); z('bouwjaar','2018');
      document.getElementById('grf_brandstof').value='benzine'; document.getElementById('grf_turbo').value='nee';
      document.getElementById('grf_rijprofiel').value='gemengd'; z('verbruik_opgegeven','7.2'); z('apk_tot','2027-03-14'); })(); 'ok'`);
    await app.ev(`PLGarage._bewaar(); 'ok'`);
    toets('het voertuig is aangemaakt en actief', await wacht(`!!(PLGarage.actief() && PLGarage.actief().naam === 'Blauwe Mazda')`));
    toets('het detailvenster toont de status en het advies', await wacht(`/Condities/.test(document.getElementById('plGarBody').textContent) && /Advies/.test(document.getElementById('plGarBody').textContent)`));
    // #474: vanuit de sensorkeuzelijst meteen naar Sensoren van dit voertuig.
    toets('de knop "Eigen" staat in de sensorkeuzelijst voor een klant', await wacht(`document.getElementById('pidGarSens').style.display === ''`));
    await app.ev(`PLGarage.sluit(); openPidChoice(); document.getElementById('pidGarSens').click(); 'ok'`);
    // 15-10-2026: Mijn voertuigen opende áchter de keuzelade; de lade gaat nu eerst dicht.
    toets('de sensorkeuzelade gaat dicht, anders opent Mijn voertuigen erachter', await wacht(`!document.getElementById('slPanel').classList.contains('lade-open')`));
    toets('en opent het tabblad Sensoren van het voertuig', await wacht(`(document.querySelector('#plGarBody .gr-tab.aan')||{}).textContent === 'Sensoren'`));
    await app.ev(`PLGarage._tab('overzicht'); 'ok'`);
    toets('het kenteken staat als gele plaat met streepjes', await app.ev(`/AB-123-C/.test(document.querySelector('#plGarBody .gr-kent').textContent)`));

    console.log('\n── 4. rapporten en foutcodes komen vanzelf bij het voertuig ──');
    await app.ev(`registerSessionReport({ type:'ai', title:'AI-monteur', text:'Mager mengsel, controleer de inlaat. '+Date.now() }); 'ok'`);
    toets('een AI-rapport uit de rest van de app landt bij het actieve voertuig', await wacht(`window._nepPlatform.rapporten.some(r => r.voertuig_id === 'v1' && r.soort === 'ai')`));
    await app.nepAdapter({ '0101': '41 01 81 07 65 00', '03': '43 01 01 71', '07': '47 00', '0A': '4A 00', '010C': '41 0C 00 00', '010D': '41 0D 00' });
    await app.ev(`connected = true; demoMode = false; PLFoutcodes.scan(); 'ok'`);
    toets('een uitlezing in het foutcodevenster wordt een open punt', await wacht(`!!(window._nepPlatform.issues.v1 && window._nepPlatform.issues.v1['dtc:P0171'])`, 15000));
    toets('en de keuringsstatus gaat mee in de status', await wacht(`window._nepPlatform.log.indexOf('status_opslaan') >= 0`));
    await app.ev(`connected = false; PLFoutcodes.sluit(); 'ok'`);

    console.log('\n── 4b. de waakronde: bevinding en resultaat bij het voertuig ──');
    await app.nepAdapter({ '0142': '41 42 4E 20', '01421': '41 42 4E 20', '010C': '41 0C 00 00', '010D': '41 0D 00' });
    const waak = await app.ev(`(function(){
      connected = true; demoMode = false;
      try { supportedPIDs = new Set(['0142']); } catch (e) { return 'supportedPIDs: ' + e.message; }
      try { activePIDs.delete('0142'); } catch (e) { return 'activePIDs: ' + e.message; }
      PLWaak.start(); return 'ok';
    })()`);
    toets('de waakronde start op de nep-adapter', waak === 'ok', waak);
    toets('20 V accuspanning wordt een open punt bij het voertuig',
      await wacht(`!!(window._nepPlatform.issues.v1 && window._nepPlatform.issues.v1['waak:0142'])`, 20000),
      JSON.stringify(await app.ev(`PLWaak.lijst()`)));
    await app.ev(`PLWaak.stop(); connected = false; 'ok'`);
    toets('stoppen legt het resultaat vast als rapport bij het voertuig',
      await wacht(`window._nepPlatform.rapporten.some(r => r.soort === 'waak' && /BEVINDINGEN \\(1\\)/.test(r.tekst))`));

    console.log('\n── 4c. het Voertuigoverzicht toont Mijn voertuigen, zonder tweede formulier (27-09) ──');
    await app.ev(`(function(){ const v = window._nepPlatform.voertuigen[0]; v.kmstand = 84210; v.onderhoud_laatst = '03-2026 / 80.000 km'; })(); PLGarage.ververs(); 'ok'`);
    await wacht(`PLGarage.actief() && PLGarage.actief().kmstand === 84210`);
    await app.ev(`openVehicleOverview(); 'ok'`);
    const ov = await app.ev(`({ t: document.getElementById('vehOverview').textContent, velden: ['uvMerk','uvModel','uvYear','uvBrand','uvKm','uvBeurt','uvDistr','uvBijz'].filter(i => document.getElementById(i)).length })`);
    toets('het overzicht zegt uit welk voertuig het leest', /Blauwe Mazda — uit Mijn voertuigen/.test(ov.t), ov.t.slice(0, 200));
    toets('km-stand en laatste beurt komen uit het voertuig', /84\.210 km/.test(ov.t) && /03-2026 \/ 80\.000 km/.test(ov.t), ov.t.slice(0, 400));
    toets('geen tweede formulier: geen enkel invulveld voor voertuiggegevens', ov.velden === 0, JSON.stringify(ov.velden));
    const sit = await app.ev(`(function(){ const b = document.getElementById('sitBlok');
      const dicht = { chips: b.querySelectorAll('button[onclick^="toggleSituatie"]').length, tekst: b.textContent };
      situatieKlap();
      const open = b.querySelectorAll('button[onclick^="toggleSituatie"]').length;
      situatieKlap();
      return { dicht: dicht, open: open, weerDicht: b.querySelectorAll('button[onclick^="toggleSituatie"]').length }; })()`);
    toets('rijsituatie staat standaard dicht: geen chips, wel een regel', sit.dicht.chips === 0 && /Rijsituatie/.test(sit.dicht.tekst), JSON.stringify(sit));
    toets('één tik klapt hem open, nog een tik weer dicht', sit.open >= 8 && sit.weerDicht === 0, JSON.stringify(sit));
    await app.ev(`[...document.querySelectorAll('#vehOverview button')].find(b => /Profiel aanpassen/.test(b.textContent)).click(); 'ok'`);
    toets('Profiel aanpassen sluit het overzicht en opent het profiel in Mijn voertuigen',
      await wacht(`document.getElementById('vehOverview').style.display === 'none' && PLGarage.staat().view === 'formulier'`),
      await app.ev(`JSON.stringify({ ov: document.getElementById('vehOverview').style.display, view: PLGarage.staat().view })`));
    await app.ev(`PLGarage.sluit(); 'ok'`);

    console.log('\n── 4d. rapporten vergelijken en meerdere tegelijk wissen, ritten exporteren (27-09) ──');
    await app.ev(`(function(){
      const S = window._nepPlatform, vid = S.voertuigen[0].id;
      const w = (k, w1) => 'PidLane — Waakronde\\nDatum: x\\n3 sensoren\\n\\n=== BEVINDINGEN (' + (w1 ? 1 : 0) + ') ===\\n' +
        (w1 ? ' Koelwater: boven het bereik — 3 van 12 metingen, laatst 112,4 °C (min 88, max 112,4)\\n' : ' geen\\n') +
        '\\n=== ZONDER ANTWOORD (0) ===\\n geen\\n\\n=== NORMAAL ===\\n' + (w1 ? '' : ' Koelwater: 91 °C (12×, 88–92)\\n') + ' Accuspanning: 14,1 V (8×, 13,9–14,3)';
      S.rapporten = [{ voertuig_id: vid, soort: 'waak', titel: 'Waakronde A', tekst: w(0, true) }, { voertuig_id: vid, soort: 'waak', titel: 'Waakronde B', tekst: w(0, false) }, { voertuig_id: vid, soort: 'ai', titel: 'AI', tekst: 'SAMENVATTING: niets' }];
      S.ritten = [{ id: 'a', start: '2026-09-21T07:40:00', km: 21, liters: 1.26, verbruik_l100: 6, label: 'Woon-werk' },
                  { id: 'b', start: '2026-09-22T07:55:00', km: 20, liters: 1.2, verbruik_l100: 6, label: 'Woon-werk' },
                  { id: 'c', start: '2026-09-23T08:10:00', km: 20.5 }];
      window.confirm = function () { return true; };
      window.__csv = null; window.download = function (n, c) { window.__csv = { n: n, c: c }; };
      delete PLGarage.staat().cache[vid];
      PLGarage.open(vid); PLGarage._tab('rapporten'); return 'ok';
    })()`);
    toets('de rapportenlijst staat er', await wacht(`document.querySelectorAll('#plGarBody .gr-rapport').length === 3`));
    await app.ev(`PLGarage._kiesModus(true); PLGarage._kies('r1', true); PLGarage._kies('r2', true); 'ok'`);
    toets('selecteren: twee aangevinkt, Vergelijk staat aan', await app.ev(`(function(){ const b=[...document.querySelectorAll('#plGarBody button')].find(x=>/Vergelijk/.test(x.textContent)); return !!b && !b.disabled && document.querySelectorAll('#plGarBody .gr-kies:checked').length === 2; })()`));
    await app.ev(`PLGarage._vergelijk(); 'ok'`);
    toets('vergelijken: een tabel per sensor, koelwater (veranderd) bovenaan', await wacht(`(function(){ const r=document.querySelectorAll('#plGarBody .gr-vgl.anders'); return r.length >= 1 && /Koelwater/.test(r[0].textContent); })()`), await app.ev(`document.getElementById('plGarBody').textContent.slice(0,200)`));
    await app.ev(`PLGarage._terugNaar('rapporten'); PLGarage._kiesModus(true); PLGarage._kies('r1', true); PLGarage._kies('r3', true); PLGarage._rapportWegKeuze(); 'ok'`);
    toets('meerdere wissen: één verzoek met beide ids', await wacht(`JSON.stringify(window._nepPlatform.gewist) === JSON.stringify(['r1','r3'])`), await app.ev(`JSON.stringify(window._nepPlatform.gewist)`));
    await app.ev(`PLGarage._tab('ritten'); 'ok'`);
    toets('ritten: per label met verbruik', await wacht(`/Woon-werk/.test(document.getElementById('plGarBody').textContent) && /6(,0)? l\\/100 km/.test(document.getElementById('plGarBody').textContent)`), await app.ev(`document.getElementById('plGarBody').textContent.slice(0,400)`));
    await app.ev(`PLGarage._labelFilter('Woon-werk'); PLGarage._ritExport('csv'); 'ok'`);
    toets('export CSV van één label', await app.ev(`!!window.__csv && /^datum;vertrek;km/.test(window.__csv.c) && window.__csv.c.split('\\n').length === 3 && /woon-werk\\.csv$/.test(window.__csv.n)`), await app.ev(`JSON.stringify(window.__csv)`));
    await app.ev(`PLGarage._labelFilter(''); PLGarage._labelOpen('c'); 'ok'`);
    toets('labelvoorstel: de derde rit krijgt Woon-werk voorgesteld', await wacht(`(document.getElementById('grLabel')||{}).value === 'Woon-werk' && /Voorstel/.test(document.getElementById('plGarBody').textContent)`));
    await app.ev(`PLGarage.sluit(); 'ok'`);

    console.log('\n── 4f. sensoren per voertuig: berekend en eigen (27-09) ──');
    await app.ev(`(function(){ const vid = window._nepPlatform.voertuigen[0].id; PLGarage.open(vid); PLGarage._tab('sensoren'); return 'ok'; })()`);
    toets('het tabblad Sensoren staat er, met berekende en eigen sensoren',
      await wacht(`/Berekende sensoren/.test(document.getElementById('plGarBody').textContent) && /Eigen sensoren/.test(document.getElementById('plGarBody').textContent)`),
      await app.ev(`document.getElementById('plGarBody').textContent.slice(0, 300)`));
    const sens = await app.ev(`(async function(){
      const zet = (id, w) => { document.getElementById(id).value = w; };
      const body = () => document.getElementById('plGarBody').textContent;
      zet('grsNaam', 'Schrijven'); zet('grsCode', '2E1E1C'); zet('grsFormule', 'A');
      PLGarage._sensErbij();
      const geweigerd = /Alleen leescodes/.test(body()), bewaard = document.getElementById('grsCode').value;
      zet('grsNaam', 'Temperatuur automaat'); zet('grsCode', '221e1c'); zet('grsFormule', 'A-40'); zet('grsEenheid', '°C');
      PLGarage._sensErbij();
      const erbij = /Temperatuur automaat/.test(body()) && /221E1C/.test(body()), leeg = document.getElementById('grsCode').value;
      PLGarage._sensKies('CA03', true);
      await PLGarage._sensBewaar();
      const v = window._nepPlatform.voertuigen[0];
      return { geweigerd, bewaard, erbij, leeg, eigen: v.eigen_pids, sel: v.pid_selectie, melding: /bewaard/.test(document.body.textContent) };
    })()`);
    toets('een schrijfcode (2E) wordt geweigerd, en wat je typte blijft staan', sens.geweigerd && sens.bewaard === '2E1E1C', JSON.stringify(sens));
    toets('een leescode komt in de lijst, in hoofdletters, en het formulier is weer leeg', sens.erbij && sens.leeg === '', JSON.stringify(sens));
    toets('bewaren schrijft eigen PID en selectie naar het voertuig',
      Array.isArray(sens.eigen) && sens.eigen.length === 1 && sens.eigen[0].code === '221E1C' &&
      sens.sel.indexOf('221E1C') >= 0 && sens.sel.indexOf('CA03') >= 0, JSON.stringify({ e: sens.eigen, s: sens.sel }));
    const eig = await app.ev(`(function(){
      supportedPIDs.add('010C');
      PLEigen.zet(window._nepPlatform.voertuigen[0].eigen_pids, 'Blauwe Mazda');
      const d = getPidDef('221E1C');
      return { def: !!d && d.cat === 'Eigen', lijst: discoveredPIDDefs.some(x => x.pid === '221E1C'), interval: pidPollInterval('221E1C'),
               waarde: parsePID('221E1C', '621E1C5A') };
    })()`);
    toets('toegepast: de eigen PID staat in de keuzelijst, groep Eigen', eig.def && eig.lijst, JSON.stringify(eig));
    toets('hij wordt elke 2 s gevraagd, niet op het trage tempo van mode 22', eig.interval === 2000, JSON.stringify(eig));
    toets('parsePID rekent de formule: 5A − 40 = 50', eig.waarde === 50, JSON.stringify(eig));
    const solo = await app.ev(`(async function(){
      PLEigen.zet([{ code: '221E1C', naam: 'Automaat', formule: 'A-40', ecu: '7E1' }], 'x');
      const echt = window.sendCmd, gestuurd = [];
      window.sendCmd = async function (c) { gestuurd.push(c); return c === '221E1C1' ? '621E1C5A' : 'OK'; };
      let r; try { r = await plVraagSolo('221E1C'); } finally { window.sendCmd = echt; }
      return { gestuurd: gestuurd.join(' '), r: r };
    })()`);
    toets('de pollus vraagt een eigen PID met ECU-adres via ATSH en zet het adres terug', solo.gestuurd === 'ATSH7E1 221E1C1 ATSH7DF', JSON.stringify(solo));
    await app.ev(`PLEigen.zet(null); PLGarage.sluit(); 'ok'`);

    console.log('\n── 4g. ECU-adres, tempo, delen en de bibliotheek per model (27-09) ──');
    const bib = await app.ev(`(async function(){
      const S = window._nepPlatform, v = S.voertuigen[0];
      // Ook de kopie die de app al heeft (uit de stand van 4f).
      [v].concat((PLGarage.staat().stand || {}).voertuigen || []).forEach(x => { if (x.id === v.id) { x.merk = 'Mazda'; x.model = 'CX-5 2.2'; x.eigen_pids = []; x.pid_selectie = []; } });
      S.bib = [{ id: 'b1', code: '220202', ecu: '', naam: 'Olietemperatuur', formule: 'A-40', eenheid: '°C', bron: 'online', url: 'https://forum.voorbeeld.nl/cx5', werkt: 0, werkt_niet: 0, mijn: null },
               { id: 'b2', code: '221E1C', ecu: '7E1', naam: 'Temperatuur automaat', formule: 'A-40', eenheid: '°C', bron: 'klant', url: null, werkt: 3, werkt_niet: 1, mijn: null }];
      const wacht = async (f) => { for (let i = 0; i < 40 && !f(); i++) await new Promise(r => setTimeout(r, 50)); return f(); };
      PLGarage.open(v.id); PLGarage._tab('sensoren');
      const body = () => document.getElementById('plGarBody').textContent;
      const uit = {};
      uit.lijst = await wacht(() => /Olietemperatuur/.test(body()) && /werkt bij 3/.test(body()) && /online gevonden, nog door niemand getest/.test(body()));
      uit.bron = !!document.querySelector('#plGarBody .gr-bib a[href="https://forum.voorbeeld.nl/cx5"][rel~="noopener"]');
      // Uit de bibliotheek toevoegen
      PLGarage._bibErbij('b2');
      uit.erbij = /staat bij je sensoren/.test(body()) && _st_eigen().some(e => e.code === '221E1C' && e.ecu === '7E1');
      // 15-10-2026: niet nog eens in de bibliotheek; de stand gaat mee naar de eigen sensor.
      uit.eenKeer = !document.querySelector('#plGarBody button[onclick="PLGarage._bibErbij(\\'b2\\')"]') &&
        !!document.querySelector('#plGarBody button[onclick="PLGarage._bibErbij(\\'b1\\')"]') &&
        Array.prototype.some.call(document.querySelectorAll('#plGarBody .gr-item:not(.gr-bib)'), x => /221E1C/.test(x.textContent) && /werkt bij 3/.test(x.textContent));
      // Berekend: wat aan staat bovenaan, de rest ingeklapt.
      PLGarage._sensKies('CA03', true);
      const ber = Array.prototype.map.call(document.querySelectorAll('#plGarBody input[onchange^="PLGarage._sensKies(\\'CA"]'), x => !!x.closest('details') === !x.checked);
      uit.ingeklapt = ber.length > 2 && ber.every(Boolean);
      // Zelf een code met ECU-adres en tempo
      document.getElementById('grsNaam').value = 'Olie druk'; document.getElementById('grsCode').value = '220303';
      document.getElementById('grsFormule').value = 'A*4'; document.getElementById('grsEcu').value = '7e0'; document.getElementById('grsTempo').value = 'traag';
      PLGarage._sensErbij();
      uit.eigen = _st_eigen().find(e => e.code === '220303');
      // Het tempo per sensor in de lijst aanpassen (28-09): elke minuut.
      PLGarage._sensTempo(_st_eigen().findIndex(e => e.code === '220303'), 'minuut');
      uit.tempoLijst = _st_eigen().find(e => e.code === '220303').tempo;
      PLGarage._sensTempo(_st_eigen().findIndex(e => e.code === '220303'), '');
      uit.tempoStandaard = 'tempo' in _st_eigen().find(e => e.code === '220303');
      PLGarage._sensTempo(_st_eigen().findIndex(e => e.code === '220303'), 'traag');
      // Een test telt als stem — maar alleen een echte uitkomst.
      const echtTest = PLEigen.test;
      PLEigen.test = async () => ({ ok: true, raw: '62 02 02 5A', bytes: [90], waarde: 50, eenheid: '°C' });
      await PLGarage._bibTest('b1');
      PLEigen.test = async () => ({ ok: false, fout: 'Niet verbonden met een auto' });
      await PLGarage._bibTest('b2');
      PLEigen.test = async () => ({ ok: false, raw: '7F 22 31', fout: 'De auto weigert deze code (7F)' });
      await PLGarage._bibTest('b2');
      uit.stemmen = S.stemmen;
      // Delen: pas na een geslaagde test, en pas na bewaren.
      await PLGarage._sensBewaar();
      const i = _st_eigen().findIndex(e => e.code === '221E1C');
      uit.deelVoor = !!document.querySelector('#plGarBody button[onclick="PLGarage._sensDeel(' + i + ')"]');
      PLEigen.test = async () => ({ ok: true, raw: '62 1E 1C 5A', bytes: [90], waarde: 50, eenheid: '°C' });
      await PLGarage._sensTest(i);
      uit.deelNa = !!document.querySelector('#plGarBody button[onclick="PLGarage._sensDeel(' + i + ')"]');
      await PLGarage._sensDeel(i);
      uit.gedeeld = S.gedeeld;
      PLEigen.test = echtTest;
      // Zoeken in OBDb (#526): via de Worker-actie obdb_bestand, geen AI.
      const echtApi = window.apiFetch; let ai = 0;
      window.apiFetch = async () => { ai++; return ''; };
      S.obdb = { commands: [
        { hdr: '7E0', rax: '7E8', cmd: { '22': '0404' }, signals: [{ name: 'AdBlue niveau', fmt: { len: 8, unit: 'percent' } }] },
        { hdr: '7E0', rax: '7E8', cmd: { '2E': '0404' }, signals: [{ name: 'x', fmt: { len: 8, unit: 'percent' } }] }] };
      await PLGarage._bibZoek();
      window.apiFetch = echtApi;
      uit.zoekTool = ai === 0 && S.obdbGehaald ? 'obdb' : 'ai=' + ai + ' repo=' + S.obdbGehaald;
      uit.kandidaten = (S.kandidaten || []).map(k => k.code).join(',');
      uit.kandidaatBron = S.kandidaatBron;
      uit.zoekMelding = /1 nieuwe kandidaat/.test(body());
      return uit;
      function _st_eigen() { return PLGarage.staat().sens.eigen; }
    })()`);
    toets('de bibliotheek van dit model staat in Sensoren, met stand en bron', bib.lijst && bib.bron, JSON.stringify(bib));
    toets('uit de bibliotheek toevoegen neemt het ECU-adres mee', bib.erbij, JSON.stringify(bib));
    toets('een toegevoegde code staat één keer: bij de eigen sensoren, met de stand uit de bibliotheek', bib.eenKeer, JSON.stringify(bib));
    toets('berekende sensoren: aangevinkt bovenaan, de rest ingeklapt', bib.ingeklapt, JSON.stringify(bib));
    toets('een eigen code met ECU-adres (7e0 → 7E0) en tempo traag', bib.eigen && bib.eigen.ecu === '7E0' && bib.eigen.tempo === 'traag', JSON.stringify(bib.eigen));
    toets('tempo in de lijst: elke minuut, en "Standaard" haalt de keuze weg', bib.tempoLijst === 'minuut' && bib.tempoStandaard === false, JSON.stringify(bib));
    toets('een test telt als stem: werkt en 7F tellen, "niet verbonden" niet', JSON.stringify(bib.stemmen) === '["b1:werkt","b2:werkt_niet"]', JSON.stringify(bib.stemmen));
    toets('delen kan pas na een geslaagde test', !bib.deelVoor && bib.deelNa, JSON.stringify(bib));
    toets('delen stuurt code en ECU-adres naar de server', bib.gedeeld === '221E1C@7E1', JSON.stringify(bib.gedeeld));
    toets('zoeken haalt OBDb op zonder AI, en alleen leescodes gaan naar de server', bib.zoekTool === 'obdb' && bib.kandidaten === '220404', JSON.stringify(bib));
    toets('met bron "obdb", zodat de lijst zegt waar het vandaan komt', bib.kandidaatBron === 'obdb', JSON.stringify(bib.kandidaatBron));
    toets('en zegt hoeveel er nieuw in de lijst kwamen', bib.zoekMelding, JSON.stringify(bib));
    await app.ev(`PLEigen.zet(null); PLGarage.sluit(); 'ok'`);

    console.log('\n── 4o. de banden als één blok, en niets loopt uit het venster (23-10-2026) ──');
    await app.venster(360, 800);
    const band = await app.ev(`(async function(){
      const S = window._nepPlatform, v = S.voertuigen[0];
      const f = '((A*1373)/1000)*0.145037738';
      const eigen = [['222A05', 'Bandenspanning voor-links'], ['222A06', 'Bandenspanning voor-rechts'], ['222A07', 'Bandenspanning achter-links'],
        ['222A08', 'Bandenspanning achter-rechts'], ['222A0B', 'Bandtemperatuur voor-links'], ['222A15', 'Tire pressure FL']]
        .map(x => ({ code: x[0], naam: x[1], formule: /temp/i.test(x[1]) ? 'A-40' : f, eenheid: /temp/i.test(x[1]) ? '°C' : 'psi', ecu: '720' }))
        .concat([{ code: '221E1C', naam: 'Temperatuur automaatbak (ATF)', formule: '((A*256)+B)/80', eenheid: '°C', ecu: '7E1' }]);
      const alle = [v].concat((PLGarage.staat().stand || {}).voertuigen || []).filter(x => x.id === v.id);
      const voor = alle.map(x => [x.eigen_pids, x.pid_selectie]), bibVoor = S.bib;
      alle.forEach(x => { x.eigen_pids = JSON.parse(JSON.stringify(eigen)); x.pid_selectie = eigen.map(e => e.code); });
      S.bib = [{ id: 'b7', code: '222A0C', ecu: '720', naam: 'Bandtemperatuur voor-rechts', formule: 'A-40', eenheid: '°C', bron: 'obdb', werkt: 1, werkt_niet: 0, mijn: null }];
      PLGarage.staat().sens = null;
      PLGarage.open(v.id); PLGarage._tab('sensoren');
      const wacht = async (g) => { for (let i = 0; i < 40 && !g(); i++) await new Promise(r => setTimeout(r, 50)); return g(); };
      await wacht(() => !!document.querySelector('#plGarBody .gr-bib'));
      const blok = document.querySelector('#plGarBody .gr-banden');
      const uit = {};
      uit.blok = !!blok && ['222A05', '222A06', '222A07', '222A08', '222A0B', '222A15'].every(c => blok.textContent.indexOf(c) >= 0) && blok.textContent.indexOf('221E1C') < 0;
      // Geen losse kaart meer per band: geen eigen Test, Weghalen of tempo.
      uit.losseBanden = Array.prototype.filter.call(document.querySelectorAll('#plGarBody .gr-item:not(.gr-bib)'), x => /222A0|222A15/.test(x.textContent)).length;
      uit.dubbelGemeld = !!blok && /2× op deze plek/.test(blok.textContent);
      uit.bibKop = Array.prototype.some.call(document.querySelectorAll('#plGarBody .gr-bib'), x => /222A0C/.test(x.textContent) && /Banden/.test((x.closest('.gr-sgroep') || {}).textContent || ''));
      // De groepen erven niets van de groepsknoppen van de grafiek.
      uit.nowrap = Array.prototype.filter.call(document.querySelectorAll('#plGarBody .gr-sgroep, #plGarBody .gr-groep'), x => getComputedStyle(x).whiteSpace === 'nowrap').length;
      const rand = document.getElementById('plGarBody').getBoundingClientRect().right;
      uit.buiten = Array.prototype.filter.call(document.querySelectorAll('#plGarBody *'), x => x.offsetParent && x.getBoundingClientRect().right > rand + 1)
        .map(x => x.tagName + '.' + x.className + ':' + x.textContent.trim().slice(0, 30)).slice(0, 5);
      PLGarage._sensBanden(false);
      uit.uit = PLGarage.staat().sens.sel.join();
      const echtConfirm = window.confirm; window.confirm = () => true;
      PLGarage._sensWegBanden();
      window.confirm = echtConfirm;
      uit.over = PLGarage.staat().sens.eigen.map(e => e.code).join();
      PLGarage.sluit();
      // Terug zoals het was: 4i rekent op de stand van 4g.
      alle.forEach((x, i) => { x.eigen_pids = voor[i][0]; x.pid_selectie = voor[i][1]; }); S.bib = bibVoor;
      PLGarage.staat().sens = null;
      return uit;
    })()`);
    await app.venster(412, 915);
    toets('alle bandsensoren staan in één blok Banden, de ATF erbuiten', band.blok, JSON.stringify(band));
    toets('geen losse kaart per band meer', band.losseBanden === 0, JSON.stringify(band));
    toets('twee codes op dezelfde plek: het blok zegt het', band.dubbelGemeld, JSON.stringify(band));
    toets('in de bibliotheek staat een bandcode onder de kop Banden', band.bibKop, JSON.stringify(band));
    toets('de sensorgroepen breken gewoon af (geen white-space:nowrap van de grafiekknoppen)', band.nowrap === 0, JSON.stringify(band));
    toets('op 360 px loopt niets in Sensoren uit het venster', band.buiten.length === 0, JSON.stringify(band.buiten));
    toets('één vinkje haalt alle banden uit de meting, de ATF blijft', band.uit === '221E1C', JSON.stringify(band.uit));
    toets('"Banden weghalen" haalt alleen de banden weg', band.over === '221E1C', JSON.stringify(band.over));

    console.log('\n── 4i. de buurscan (28-09); "dieper zoeken" met de AI is weg (#526) ──');
    const diep = await app.ev(`(async function(){
      const S = window._nepPlatform, v = S.voertuigen[0];
      S.bib = [{ id: 'b9', code: '222A05', ecu: '720', naam: 'Bandenspanning voor-links', formule: 'A', eenheid: 'psi', bron: 'online', url: 'https://x.nl', werkt: 1, werkt_niet: 0, mijn: 'werkt' }];
      const wacht = async (f) => { for (let i = 0; i < 40 && !f(); i++) await new Promise(r => setTimeout(r, 50)); return f(); };
      PLGarage.open(v.id); PLGarage._tab('sensoren');
      const body = () => document.getElementById('plGarBody').textContent;
      const uit = { blok: await wacht(() => /Scan 222Axx @ 720/.test(body())), geenDieper: body().indexOf('Dieper zoeken') < 0 };
      // 30-09-2026: de knoptekst liep de kaart uit op tekstgrootte L. Elke
      // kleine knop in deze tab hoort binnen de rechterrand van het venster.
      setUiScale('l'); await new Promise(r => setTimeout(r, 100));
      const rand = document.getElementById('plGarBody').getBoundingClientRect().right;
      const buiten = Array.prototype.filter.call(document.querySelectorAll('#plGarBody .gr-k.klein'), function (k) {
        return k.offsetParent && k.getBoundingClientRect().right > rand + 1; }).map(function (k) { return k.textContent.trim().slice(0, 40); });
      setUiScale('m');
      uit.buiten = buiten;
      const echtScan = PLEigen.buurScan;
      PLEigen.buurScan = async (b) => ({ ok: true, gedaan: 256, gestopt: false, gevonden: [
        { code: '222A05', ecu: '720', bytes: [170] }, { code: '222A21', ecu: '720', bytes: [1, 2] }] });
      await PLGarage._scan(0);
      PLEigen.buurScan = echtScan;
      uit.lijst = /2 codes antwoorden, 1 daarvan nieuw/.test(body()) && /222A21/.test(body()) && /01 02/.test(body());
      PLGarage._scanErbij('222A21');
      uit.form = document.getElementById('grsCode').value + '@' + document.getElementById('grsEcu').value;
      PLGarage.sluit();
      return uit;
    })()`);
    toets('met een werkende code: knop "Scan 222Axx @ 720", en geen AI-knop "Dieper zoeken" meer', diep.blok && diep.geenDieper, JSON.stringify(diep));
    toets('op tekstgrootte L blijft elke kleine knop binnen het venster', Array.isArray(diep.buiten) && diep.buiten.length === 0, JSON.stringify(diep.buiten));
    toets('buurscan: alleen de nieuwe code staat erbij, met zijn bytes', diep.lijst, JSON.stringify(diep));
    toets('"In het formulier" zet code en ECU-adres klaar', diep.form === '222A21@720', JSON.stringify(diep));

    console.log('\n── 4h. de vaste sensoren komen terug na een herstart (28-09) ──');
    // Precies de volgorde van 28-09: de app start met de VIN van de vorige
    // sessie (restoreAppState), verbindt, en herkent de auto al vóór de
    // PID-lijst er is. Toen paste er niets en bleef het daarbij.
    const herstart = await app.ev(`(async function(){
      const S = window._nepPlatform, v = S.voertuigen[0], vin = 'JMZKFGWLA00123456';
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      const ps = await _vlVinPseudoniem(vin);
      const eigen = [{ code: '222A05', naam: 'Bandenspanning voor-links', formule: 'A', eenheid: 'psi', ecu: '720' },
                     { code: '221310', naam: 'Motorolietemperatuur', formule: 'A-40', eenheid: '°C' }];
      [v].concat((PLGarage.staat().stand || {}).voertuigen || []).forEach(x => { if (x.id === v.id) {
        x.vin_pseudo = ps; x.eigen_pids = eigen; x.pid_selectie = ['222A05', '221310', 'CA01']; } });
      PLGarage.zetActief && PLGarage.zetActief(v.id);
      // De herstart: VIN van de vorige keer staat er al, de PID-lijst niet.
      vehicleInfo.vin = vin; supportedPIDs = new Set(); discoveredPIDDefs = []; activePIDs.clear();
      window._plVerbindingKlaar = 0;
      connected = true; demoMode = false;
      await wacht(4500);                                   // twee tikken van de garagelus
      const vroeg = [...activePIDs];
      // Nu het verbinden: PID-lijst, standaardset, en "Verbinding compleet".
      supportedPIDs = new Set(['010C','010D','0105','0104','010B','0111','012F','0142','015E','0110']);
      buildDiscoveredPIDList();
      selectStandardSet();
      const standaard = [...activePIDs];
      window._plVerbindingKlaar = Date.now();
      await wacht(4500);
      const na = [...activePIDs];
      connected = false; await wacht(2500);
      return { vroeg, standaard, na, eigenDef: !!getPidDef('222A05') };
    })()`);
    toets('vóór "Verbinding compleet" zet Mijn voertuigen nog niets (de PID-lijst is er niet)', herstart.vroeg.length === 0, JSON.stringify(herstart.vroeg));
    toets('daarna: de standaardset blijft staan, met de eigen en berekende sensoren erbij',
      herstart.standaard.length > 3 && herstart.standaard.every(p => herstart.na.indexOf(p) >= 0) &&
      ['221310', 'CA01'].every(p => herstart.na.indexOf(p) >= 0), JSON.stringify(herstart));
    // Een band zonder gekozen tempo is op verzoek (#396): bekend bij de app,
    // maar niet in de selectie — PLBanden.ververs() vraagt hem, niet de pollus.
    toets('de band uit de bewaarde selectie is bekend, maar op verzoek en dus niet geselecteerd (#396)',
      herstart.eigenDef && herstart.na.indexOf('222A05') < 0, JSON.stringify(herstart));

    console.log('\n── 4e. leren uit opnames (27-09) ──');
    const opn = await app.ev(`(async function(){
      const R = [7.4, 13.1, 19.6, 25.8, 31.9, 38.2], regels = [];
      let t = 1e12;
      for (let i = 0; i < 900; i++) { t += 1000; const g = Math.floor(i / 37) % 6, rpm = (i % 37) < 12 ? 1500 + (i % 37) * 100 : 2600;
        regels.push({ t: t, v: { '010C': rpm, '010D': Math.round(R[g] * rpm / 1000) } }); }
      const echt = PLBulk.lees;
      PLBulk.lees = async function () { return [{ sessie: 'S1', voertuig: PLGear.sleutel, van: regels[0].t, tot: t, regels: regels }]; };
      try {
        const voor = PLGear.model.gears.length;
        openGearInstellingen(); await plGearOpnames();
        const lijst = document.getElementById('plGearOv').textContent;
        plGearLeerOpname('S1');
        const na = PLGear.model.gears.length, tekst = document.getElementById('plGearOv').textContent;
        plGearLeerOpname('S1');
        return { voor: voor, na: na, deze: /deze auto/.test(lijst), geleerd: /stabiele metingen uit de opname geleerd/.test(tekst), dubbel: /al meegeteld/.test(document.getElementById('plGearOv').textContent) };
      } finally { PLBulk.lees = echt; sluitGearInstellingen(); }
    })()`);
    toets('leren uit opnames: de opname staat erin als "deze auto"', opn.deze, JSON.stringify(opn));
    toets('en levert zonder rijden de versnellingen op', opn.voor === 0 && opn.na === 6 && opn.geleerd, JSON.stringify(opn));
    toets('een tweede keer telt niet', opn.dubbel, JSON.stringify(opn));

    console.log('\n── 4j. het versnellingsvenster blijft staan waar je scrollt (28-09) ──');
    await app.venster(412, 360);                               // klein genoeg om te moeten scrollen
    const scroll = await app.ev(`(async function(){
      openGearInstellingen();
      await new Promise(r => setTimeout(r, 300));              // na de focus op de schakelaar, zoals een mens
      const vel = () => document.querySelector('#plGearOv .plg-vel');
      const v = vel();
      v.scrollTop = 120; const gezet = v.scrollTop;
      // Een verversronde met nieuwe inhoud afdwingen (onderweg verandert er
      // elke seconde iets); zonder dat slaat het venster het tekenen over en
      // bewijst deze proef niets over de scrollpositie.
      document.getElementById('plGearOv')._html = '';
      await new Promise(r => setTimeout(r, 1300));
      const na = vel().scrollTop;
      const knoppen = document.querySelectorAll('#plGearOv .plg-krij .plg-k').length;
      sluitGearInstellingen();
      return { gezet, na, knoppen };
    })()`);
    await app.venster(412, 915);
    toets('na twee verversrondes staat het venster nog waar je het liet', scroll.gezet > 0 && Math.abs(scroll.na - scroll.gezet) <= 1, JSON.stringify(scroll));
    toets('"In welke versnelling zit je nu?" staat er altijd, met cijfers en R', scroll.knoppen >= 7, JSON.stringify(scroll));

    console.log('\n── 4k. tanken herkennen aan het brandstofpeil (#469 stap 2) ──');
    // Echte ritTikNu()-lus (elke 2 s) op pidVals; geen bus. Eerst een stilstand
    // op 12 %, dan "weg" (contact uit bij de pomp), dan terug op 96 %.
    await app.ev(`localStorage.removeItem('pl_tank_peil_' + PLGarage.actief().id); pidVals['010D'] = 0; pidVals['012F'] = 12; pidVals['CA09'] = 612; connected = true; demoMode = false; 'ok'`);
    // Standaard uit: geen tabblad en niets bijgehouden.
    await new Promise(r => setTimeout(r, 12500));
    toets('uit (standaard): geen anker, dus ook nooit een vraag', await app.ev(`localStorage.getItem('pl_tank_peil_' + PLGarage.actief().id) === null`));
    await app.ev(`PLGarage.open(PLGarage.actief().id); 'ok'`);
    toets('uit (standaard): geen tabblad Tankbeurten', await app.ev(`!/Tankbeurten/.test(document.querySelector('#plGarBody').textContent)`));
    await app.ev(`PLGarage.sluit(); const id = PLGarage.actief().id; window._nepPlatform.voertuigen.forEach(function (x) { if (x.id === id) x.tanken = 'aan'; }); PLGarage.actief().tanken = 'aan'; 'ok'`);
    toets('aan, stilstand op 12 %: het anker wordt bewaard', await wacht(`(JSON.parse(localStorage.getItem('pl_tank_peil_' + PLGarage.actief().id) || 'null') || {}).pct === 12`, 20000));
    toets('en dat is nog geen vraag', await app.ev(`!document.querySelector('.plBevestigOv')`));
    await app.ev(`connected = false; 'ok'`);
    await new Promise(r => setTimeout(r, 2500));
    await app.ev(`pidVals['012F'] = 96; connected = true; 'ok'`);
    toets('terug op 96 %: de app vraagt of er getankt is', await wacht(`/van 12 % naar 96 %/.test((document.querySelector('.plBevestigOv') || {}).textContent || '')`, 20000));
    await app.ev(`document.querySelector('.plBevestigOv .plBevestigBtn.ja').click(); 'ok'`);
    toets('"Invullen" opent Tankbeurten met wat de app zag', await wacht(`/De app zag het brandstofpeil van 12 % naar 96 %/.test((document.getElementById('plGarBody') || {}).textContent || '') && document.getElementById('tk_bereik_app').value === '612'`, 5000));
    toets('aan: het tabblad Tankbeurten staat er', await app.ev(`/Tankbeurten/.test(document.querySelector('#plGarBody').textContent)`));
    await app.ev(`connected = false; PLGarage._tankForm(null); window._nepPlatform.voertuigen.forEach(function (x) { x.tanken = null; }); PLGarage.actief().tanken = null; PLGarage.sluit(); 'ok'`);

    console.log('\n── 4l. de conditiescore (#475): per voertuig aan, één keer de basis ──');
    await app.ev(`PLGarage.open(PLGarage.actief().id); 'ok'`);
    toets('uit (standaard): geen tabblad Conditie', await app.ev(`!/Conditie/.test(document.querySelector('#plGarBody .gr-tabs').textContent)`));
    await app.ev(`PLGarage._bewerk(PLGarage.actief().id); 'ok'`);
    toets('het profiel heeft de keuze "Conditiescore bijhouden"', await app.ev(`!!document.getElementById('grf_score') && document.getElementById('grf_score').value === 'uit'`));
    await app.ev(`document.getElementById('grf_score').value = 'aan'; PLGarage._bewaar(); 'ok'`);
    toets('aan bewaard via het profiel', await wacht(`(window._nepPlatform.voertuigen.find(function (x) { return x.id === PLGarage.actief().id; }) || {}).score === 'aan'`, 5000));
    await app.ev(`PLGarage._tab('conditie'); 'ok'`);
    toets('aan: het tabblad Conditie vraagt eerst de laatste beurt', await wacht(`/Conditiescore starten/.test(document.getElementById('plGarBody').textContent) && !!document.getElementById('cd_datum')`, 5000));
    await app.ev(`document.querySelector('[onclick*="_condStart"]').click(); 'ok'`);
    toets('zonder datum: een melding, niets bewaard', await wacht(`/datum van de beurt/.test(document.getElementById('plGarBody').textContent)`, 3000));
    await app.ev(`document.getElementById('cd_datum').value = '2026-09-01'; document.getElementById('cd_km').value = '120000'; document.querySelector('[onclick*="_condStart"]').click(); 'ok'`);
    toets('de beurt staat in het logboek van de server', await wacht(`((window._nepPlatform.voertuigen.find(function (x) { return x.id === PLGarage.actief().id; }) || {}).onderhoud_log || []).some(function (b) { return b.datum === '2026-09-01' && b.km === 120000 && b.wat.indexOf('olie') >= 0; })`, 5000));
    toets('daarna de score, niet opnieuw het formulier', await wacht(`/Conditiescore/.test(document.getElementById('plGarBody').textContent) && !document.querySelector('[onclick*="_condStart"]') && document.getElementById('plGarBody').textContent.indexOf('Onderhoud (1)') >= 0`, 5000),
      await app.ev(`document.getElementById('plGarBody').textContent.slice(0, 400)`));
    toets('"Waarom" en het logboek staan dicht: niets dringt zich op', await app.ev(`Array.prototype.every.call(document.querySelectorAll('#plGarBody details'), function (d) { return !d.open; })`));
    await app.ev(`window._nepPlatform.voertuigen.forEach(function (x) { x.score = null; x.onderhoud_log = []; }); PLGarage.actief().score = null; PLGarage.sluit(); 'ok'`);

    console.log('\n── 4m. tabblad Kenteken: de kenteken-check ook als de adapter verbonden is ──');
    await app.ev(`(function(){
      const id = PLGarage.actief().id; PLGarage.actief().kenteken = 'R054XD';
      window._nepPlatform.voertuigen.forEach(function (x) { if (x.id === id) x.kenteken = 'R054XD'; });
      window._nepRdw = 0; const vorig = window.plFetch;
      window._plFetchVoorRdw = vorig;
      window.plFetch = async function (pad, o) {
        const u = decodeURIComponent(String(pad));
        if (u.indexOf('opendata.rdw.nl') < 0) return vorig(pad, o);
        window._nepRdw++;
        // De APK-tabellen: de echte regels van TS001X (23-10-2026) onder dit kenteken.
        const M = [{ kenteken:'R054XD', meld_datum_door_keuringsinstantie:'20261021', meld_tijd_door_keuringsinstantie:'1050', soort_melding_ki_omschrijving:'periodieke controle', vervaldatum_keuring:'20271103' },
                   { kenteken:'R054XD', meld_datum_door_keuringsinstantie:'20251006', meld_tijd_door_keuringsinstantie:'1137', soort_melding_ki_omschrijving:'periodieke controle', vervaldatum_keuring:'20261103' }];
        const G = [{ kenteken:'R054XD', meld_datum_door_keuringsinstantie:'20261021', meld_tijd_door_keuringsinstantie:'1050', gebrek_identificatie:'497', aantal_gebreken_geconstateerd:'1' },
                   { kenteken:'R054XD', meld_datum_door_keuringsinstantie:'20251006', meld_tijd_door_keuringsinstantie:'1137', gebrek_identificatie:'497', aantal_gebreken_geconstateerd:'1' }];
        const O = [{ gebrek_identificatie:'497', ingangsdatum_gebrek:'20170401', gebrek_omschrijving:'Kentekenplaatverlichting werkt niet (goed) / ontbreekt' }];
        const rij = /m9d7-ebf2/.test(u) ? [{ kenteken:'R054XD', merk:'MAZDA', handelsbenaming:'CX-5', vervaldatum_apk:'20270301', wam_verzekerd:'Ja', datum_eerste_toelating:'20180101', cilinderinhoud:'2191' }]
          : /sgfe-77wx/.test(u) ? M : /a34c-vvps/.test(u) ? G : /hx2c-gt7k/.test(u) ? O : [];
        return { ok:true, status:200, json: async function () { return rij; } };
      };
      window._recallVoorRdw = window.PLRecall && PLRecall.check;
      if (window.PLRecall) PLRecall.check = async function () { return { acties:[{ open:true, omschrijving:'Nepactie remleiding', status:'open' }] }; };
      if (window.PLApk) PLApk.wisCache();
      connected = true; PLGarage.open(id); return 'ok'; })()`);
    toets('verbonden: het tabblad Kenteken staat er', await app.ev(`/Kenteken/.test(document.querySelector('#plGarBody .gr-tabs').textContent)`));
    await app.ev(`PLGarage._tab('kenteken'); 'ok'`);
    toets('het tabblad toont de RDW-uitslag van dit kenteken', await wacht(`window._nepRdw > 0 && /APK/.test(document.getElementById('plGarBody').textContent) && !!document.querySelector('#plGarBody .plz-los .plz-regel')`, 5000),
      await app.ev(`document.getElementById('plGarBody').textContent.slice(0, 300)`));
    toets('met de APK-geschiedenis: het gebrek, en dat het terugkomt (PLApk)', await wacht(`/APK-geschiedenis/.test(document.getElementById('plGarBody').textContent) && /Komt terug bij meerdere keuringen: Kentekenplaatverlichting/.test(document.getElementById('plGarBody').textContent)`, 5000),
      await app.ev(`document.getElementById('plGarBody').textContent.slice(-600)`));
    toets('met de terugroepactie en de blokken van PLWijzer', await wacht(`/Nepactie remleiding/.test(document.getElementById('plGarBody').textContent) && !!document.querySelector('#plGarBody [data-plw="kosten"]')`, 5000));
    await app.ev(`window.plFetch = window._plFetchVoorRdw; if (window._recallVoorRdw) PLRecall.check = window._recallVoorRdw; connected = false; PLGarage._tab('overzicht'); PLGarage.sluit(); 'ok'`);

    console.log('\n── 4n. tabblad Kenteken bij een EV: accu en bereik (PLEv, 23-10-2026) ──');
    // De RDW-waarden van een echte ID.3 Pro (8ys7-d773: 156 Wh/km, 426 km WLTP); het kenteken is verzonnen.
    await app.ev(`(function(){
      const id = PLGarage.actief().id; PLGarage.actief().kenteken = 'EV001X';
      window._nepPlatform.voertuigen.forEach(function (x) { if (x.id === id) x.kenteken = 'EV001X'; });
      const vorig = window.plFetch; window._plFetchVoorRdw = vorig;
      window.plFetch = async function (pad, o) {
        const u = decodeURIComponent(String(pad));
        if (u.indexOf('opendata.rdw.nl') < 0) return vorig(pad, o);
        const rij = /m9d7-ebf2/.test(u) ? [{ kenteken:'EV001X', merk:'VOLKSWAGEN', handelsbenaming:'ID.3 PRO 150 KW', vervaldatum_apk:'20270301', wam_verzekerd:'Ja', datum_eerste_toelating:'20230501' }]
          : /8ys7-d773/.test(u) ? [{ kenteken:'EV001X', brandstof_omschrijving:'Elektriciteit', elektrisch_verbruik_enkel_elektrisch_wltp:'156.00', actie_radius_enkel_elektrisch_wltp:'426' }] : [];
        return { ok:true, status:200, json: async function () { return rij; } };
      };
      if (window.PLApk) PLApk.wisCache();
      connected = true; PLGarage.open(id); PLGarage._tab('kenteken'); PLGarage._rdwOpnieuw(); return 'ok'; })()`);
    toets('de accu van de ID.3: 58 kWh, gekozen op de WLTP-actieradius', await wacht(`/Accu en bereik/.test(document.getElementById('plGarBody').textContent) && /58 kWh/.test(document.getElementById('plGarBody').textContent) && /426 km/.test(document.getElementById('plGarBody').textContent)`, 5000),
      await app.ev(`document.getElementById('plGarBody').textContent.slice(0, 500)`));
    toets('met de bron en de licentie erbij', await app.ev(`/Tijs Teulings, MIT/.test(document.getElementById('plGarBody').textContent)`));
    await app.ev(`window.plFetch = window._plFetchVoorRdw; connected = false; PLGarage._tab('overzicht'); PLGarage.sluit(); 'ok'`);

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
