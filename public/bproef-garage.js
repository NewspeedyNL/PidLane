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
    await app.ev(`PLEigen.zet(null); PLGarage.sluit(); 'ok'`);

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
