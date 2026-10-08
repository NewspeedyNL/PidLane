// bproef-visplek.js — een plek in Slim visueel zelf invullen (06-10-2026)
//
// Uit het gebruik, op de CX-5: "bij de 2 lege balkjes wil ik zelf een sensor
// kiezen", en "bij het andere scherm wil ik kunnen nulstellen". Wat
// test-visprofiel.js niet kan zien: of de eigen motorolietemperatuur in de
// echte app op OLIE komt, of tikken op een plek de lijst opent, of een keuze
// het scherm opnieuw opbouwt met het label van de gekozen sensor, of de
// terugknop de lijst sluit, en of Nulstellen op het telemetriescherm staat.
//
// Tegenproef: "Automatisch" haalt de keuze weg, en dan staat er weer het
// label Buiten. Blijft het label van de keuze staan, dan zegt deze proef dat.
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
  try { app = await startApp({ root: __dirname }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    await app.venster(412, 915);
    console.log('\n1. De CX-5 van 06-10: geen 015C en geen 0146, wel een eigen motorolietemperatuur');
    await app.ev(`startDemoCar(0); true`);
    await new Promise(r => setTimeout(r, 1500));
    const auto = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      localStorage.removeItem('pl_vis_keuze');
      PLEigen.zet([{ code:'221310', naam:'Motorolietemperatuur', formule:'A-40', eenheid:'°C', ecu:'' }], 'CX-5');
      supportedPIDs = new Set(['010C','010D','0105','010F','013C','0142','0104','0111']);
      buildDiscoveredPIDList();
      activePIDs.clear(); ['010C','010D','0105','010F','013C'].forEach(p => activePIDs.add(p));
      PLVisProfiel.bewaar('temp');
      setPidView('visueel');
      await wacht(800);
      const lbl = r => { const e = document.getElementById('vpf-p-' + r); return e ? e.querySelector('small').textContent : null; };
      const ind = PLVisueel.staat().ind.profiel;
      return { olie: ind.plekken.olie, buiten: ind.plekken.buiten, olieLbl: lbl('olie'), actief: activePIDs.has('221310') };
    })()`);
    toets('de eigen motorolietemperatuur staat op OLIE', auto.olie === '221310', JSON.stringify(auto));
    toets('…onder het label Olie', /olie/i.test(auto.olieLbl || ''), JSON.stringify(auto));
    toets('…en Slim visueel heeft hem aangezet', auto.actief, JSON.stringify(auto));
    toets('BUITEN blijft leeg: deze auto heeft geen buitentemperatuur', auto.buiten === null, JSON.stringify(auto));

    console.log('\n2. Tik op BUITEN en kies de accuspanning');
    const kies = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      document.getElementById('vpf-p-buiten').click();
      const ov = document.getElementById('plVisKies');
      const r = { open: !!ov && ov.style.display === 'flex', titel: ov && ov.querySelector('h2').textContent,
                  rijen: ov ? [...ov.querySelectorAll('.vk-rij')].map(b => b.getAttribute('data-pid')) : [] };
      const b = ov && ov.querySelector('.vk-rij[data-pid="0142"]');
      b && b.click();
      await wacht(400);
      r.dicht = ov.style.display === 'none';
      const ind = PLVisueel.staat().ind.profiel;
      r.buiten = ind.plekken.buiten;
      r.lbl = document.getElementById('vpf-p-buiten').querySelector('small').textContent;
      r.keuze = JSON.parse(localStorage.getItem('pl_vis_keuze') || '{}');
      return r;
    })()`);
    toets('tikken opent de lijst, met de naam van de plek', kies.open && kies.titel === 'Buiten', JSON.stringify(kies));
    toets('bovenaan Automatisch, daarna de temperaturen van deze auto', kies.rijen[0] === '' && kies.rijen.indexOf('0105') > 0 && kies.rijen.indexOf('0105') < kies.rijen.indexOf('0142'),
      JSON.stringify(kies.rijen));
    toets('kiezen sluit de lijst', kies.dicht, JSON.stringify(kies));
    toets('de accuspanning staat op BUITEN, met zijn eigen label', kies.buiten === '0142' && /accu/i.test(kies.lbl), JSON.stringify(kies));
    toets('de keuze is onthouden op dit toestel', kies.keuze['temp/buiten'] === '0142', JSON.stringify(kies.keuze));

    console.log('\n3. Terugknop, en Automatisch (tegenproef)');
    const terug = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      document.getElementById('vpf-p-buiten').click();
      const ov = document.getElementById('plVisKies');
      const open = ov.style.display === 'flex';
      appBack();
      const dichtNaTerug = ov.style.display === 'none';
      document.getElementById('vpf-p-buiten').click();
      ov.querySelector('.vk-rij[data-pid=""]').click();
      await wacht(400);
      return { open, dichtNaTerug, buiten: PLVisueel.staat().ind.profiel.plekken.buiten,
               lbl: document.getElementById('vpf-p-buiten').querySelector('small').textContent,
               keuze: JSON.parse(localStorage.getItem('pl_vis_keuze') || '{}') };
    })()`);
    toets('de Android-terugknop sluit de lijst', terug.open && terug.dichtNaTerug, JSON.stringify(terug));
    toets('Automatisch: weer leeg, met het label Buiten', terug.buiten === null && /buiten/i.test(terug.lbl) && !('temp/buiten' in terug.keuze), JSON.stringify(terug));

    console.log('\n4. Het telemetriescherm: Nulstellen op het scherm zelf');
    const tel = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 8 && PLVisueel.profiel() !== 'telemetrie'; i++) PLVisueel.volgende();
      await wacht(300);
      const k = document.querySelector('.vpf-tel-nul');
      let geroepen = 0; const echt = window.PLTelemetrie && PLTelemetrie.nulstellen;
      if (window.PLTelemetrie) PLTelemetrie.nulstellen = function(){ geroepen++; return true; };
      k && k.click();
      if (window.PLTelemetrie) PLTelemetrie.nulstellen = echt;
      const b = k ? k.getBoundingClientRect() : null;
      const vak = document.getElementById('plVisKies');
      return { profiel: PLVisueel.profiel(), knop: !!k, geroepen, past: b ? (b.left >= 0 && b.right <= innerWidth && b.height >= 44) : false,
               geenKiezer: !vak || vak.style.display === 'none' };
    })()`);
    toets('de knop Nulstellen staat op het telemetriescherm', tel.knop, JSON.stringify(tel));
    toets('tikken stelt de telefoonsensoren op nul', tel.geroepen === 1, JSON.stringify(tel));
    toets('de knop past op een telefoon en is groot genoeg om te raken (44 px)', tel.past, JSON.stringify(tel));
    toets('op het telemetriescherm opent een tik geen sensorlijst', tel.geenKiezer, JSON.stringify(tel));

    console.log('\n5. De Basismeter: tik op een boog of het vak en kies zelf (08-10-2026)');
    const basis = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      // Een eigen sensor zonder bereik: wel een getal, geen boog.
      PLEigen.zet([{ code:'221310', naam:'Motorolietemperatuur', formule:'A-40', eenheid:'°C', ecu:'' },
                   { code:'22DD01', naam:'Teller ritten', formule:'A', eenheid:'', ecu:'' }], 'CX-5');
      buildDiscoveredPIDList();
      localStorage.removeItem('pl_vis_keuze');
      for (let i = 0; i < 8 && PLVisueel.profiel() !== 'basis'; i++) PLVisueel.volgende();
      await wacht(300);
      const tik = function(sel){ const e = document.querySelector(sel); if (e) e.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!e; };
      const ov = function(){ return document.getElementById('plVisKies'); };
      const r = { profiel: PLVisueel.profiel(), tikBoog: tik('#visp-links .vis-tik') };
      r.boog = { open: ov() && ov().style.display === 'flex', titel: ov() && ov().querySelector('h2').textContent,
                 rijen: ov() ? [...ov().querySelectorAll('.vk-rij')].map(b => b.getAttribute('data-pid')) : [] };
      const b = ov() && ov().querySelector('.vk-rij[data-pid="0142"]'); b && b.click();
      await wacht(400);
      r.links = PLVisueel.staat().ind.plekken.links;
      r.tekst = (document.getElementById('visv-links') || {}).textContent;
      r.tikVak = tik('#visp-vak');
      r.vak = { titel: ov().querySelector('h2').textContent, rijen: [...ov().querySelectorAll('.vk-rij')].map(b => b.getAttribute('data-pid')) };
      const v = ov().querySelector('.vk-rij[data-pid="22DD01"]'); v && v.click();
      await wacht(400);
      r.vakPid = PLVisueel.staat().ind.plekken.vak;
      r.vakKop = (document.getElementById('visn-vak') || {}).textContent;
      r.keuze = JSON.parse(localStorage.getItem('pl_vis_keuze') || '{}');
      tik('#visp-links .vis-tik'); ov().querySelector('.vk-rij[data-pid=""]').click();
      await wacht(400);
      r.terug = PLVisueel.staat().ind.plekken.links;
      return r;
    })()`);
    toets('de Basismeter staat open', basis.profiel === 'basis' && basis.tikBoog, JSON.stringify(basis));
    toets('tikken op de boog links opent de lijst, met de naam van de plek', basis.boog.open && basis.boog.titel === 'Boog links', JSON.stringify(basis.boog));
    toets('op een boog staan sensoren met een schaal, niet een eigen sensor zonder bereik en niet toerental of snelheid',
      basis.boog.rijen[0] === '' && basis.boog.rijen.indexOf('0142') > 0 && basis.boog.rijen.indexOf('22DD01') < 0 &&
      basis.boog.rijen.indexOf('010C') < 0 && basis.boog.rijen.indexOf('010D') < 0, JSON.stringify(basis.boog.rijen));
    toets('de accuspanning staat links, met een getal', basis.links === '0142' && /^\d+,\d$/.test(basis.tekst || ''), JSON.stringify(basis));
    toets('het vak heeft een eigen lijst, en daar mag een getal zonder schaal wel', basis.tikVak && basis.vak.titel === 'Vak linksonder' && basis.vak.rijen.indexOf('22DD01') > 0,
      JSON.stringify(basis.vak));
    toets('de eigen sensor staat in het vak, met zijn naam als kop', basis.vakPid === '22DD01' && /TELLER/.test(basis.vakKop || ''), JSON.stringify(basis));
    toets('de keuzes zijn onthouden onder basis/…', basis.keuze['basis/links'] === '0142' && basis.keuze['basis/vak'] === '22DD01', JSON.stringify(basis.keuze));
    toets('Automatisch zet koelwater terug op de boog links (tegenproef)', basis.terug === '0105', JSON.stringify(basis));

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }
  console.log(fouten === 0 ? '\nbproef-visplek: alles goed' : '\nbproef-visplek: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
