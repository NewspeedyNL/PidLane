// maak.js — tien Marktplaats-beelden "<Merk> Dashboard — gewoon op je eigen telefoon" (15-11-2026)
//
// De ECHTE app in demomodus, met een demo-auto die alleen de PIDs aanbiedt
// die vrijwel elke OBD2/EOBD-auto levert (UNIVERSEEL hieronder). Wat er in
// beeld staat, kan dus op elke auto: geen tankmeter (012F), geen verbruik
// (vraagt MAF/MAP), geen accuspanning uit 0142. Het merk komt via
// vehicleInfo.merk in merkThema() van Hyperlane: kleuren en woordmerk in de
// tellerplaat, geen logo's (die zijn van het merk).
//
//   node marketing/marktplaats/maak.js                 alle merken uit MERKEN
//   node marketing/marktplaats/maak.js vw,bmw          alleen deze (id's uit MERKEN)
//
// Uitvoer: marketing/marktplaats/uit/<merk>/01-…10-*.jpg (1800×1350, 4:3)
'use strict';
const path = require('path'), fs = require('fs');
const { startApp } = require(path.join(__dirname, '..', '..', 'plbrowser.js'));
const z = ms => new Promise(r => setTimeout(r, ms));
const UIT = path.join(__dirname, 'uit'), RUW = path.join(__dirname, 'ruw');

// Mode 01 die op elke benzine (2001+) en diesel (2004+) aanwezig is. 0101 =
// monitorstatus (keuringsstatus). Accuspanning komt uit de adapter (ATRV).
const UNIVERSEEL = ['0101', '0104', '0105', '010C', '010D', '010F', '0111'];

const KAAL = `(function(){
  document.head.insertAdjacentHTML('beforeend','<style>#bronBanner,#plZonderKaart,.toast,#toast,.fc-melding,#vpf-p-accu,.vhl-schil .leeg{display:none!important}</style>');
  ['loginOv','welcomeScreen'].forEach(function(id){ var e=document.getElementById(id); if(e) e.classList.add('hidden'); });
  return true; })()`;
// Demo-merktekens weg: het beeld toont de app zoals hij met een auto draait.
const ZONDER_DEMO = `(function(){ [].slice.call(document.querySelectorAll('body *')).forEach(function(e){
  if(e.children.length<=1 && /^(\\W*Demo|◇ Simulatie|Stop simulatie|Gesimuleerd.*|💡 Tip.*)$/.test((e.textContent||'').trim())) e.style.visibility='hidden'; });
  return true; })()`;
const zet = w => `(function(){ _scenario.enabled=true; var p=_scenario.pids;
  p['010C']=${w.rpm.toFixed(0)}; p['010D']=${w.kmh.toFixed(1)}; p['0105']=${w.koel.toFixed(1)};
  p['0111']=${Math.max(5, w.gas).toFixed(1)}; p['0104']=${Math.max(15, w.gas * .9).toFixed(1)}; p['010F']=24;
  return true; })()`;
const OPEN_HL = `(async function(){ var w=function(ms){ return new Promise(function(r){ setTimeout(r,ms); }); };
  try{ if(PLVisThema.uit) PLVisThema.uit(); }catch(e){ console.warn('marktplaats: volledig scherm sluiten', e); }
  PLNav.tab('live'); PLVisProfiel.bewaar('hyperlane'); setPidView('overzicht'); await w(250); setPidView('visueel'); await w(1200);
  if(window.PLVisueel && PLVisueel.herbouwKeuze) PLVisueel.herbouwKeuze(); await w(300); PLVisThema.aan(); await w(400); return true; })()`;
const auto = merk => `localStorage.setItem('pl_hl_tablet_sim','0');
  _startDemoCore({ merk:${JSON.stringify(merk)}, model:'', year:'', brandstof:'benzine', vin:'', wmi:'', motortype:'', pids:${JSON.stringify(UNIVERSEEL)} }, null); true`;

async function rijd(a, sec, w) { const e = Date.now() + sec * 1000; let t0 = Date.now(); while (Date.now() < e) { await a.ev(zet(typeof w === 'function' ? w((Date.now() - t0) / 1000) : w)); await z(100); } }

async function opnames(merkNaam, map) {
  fs.mkdirSync(map, { recursive: true });
  // staand
  let a = await startApp({ root: path.join(__dirname, '..', '..', 'public'), breedte: 412, hoogte: 915 });
  await a.venster(412, 915, 2);
  try {
    await a.ev(KAAL); await a.ev(auto(merkNaam)); await z(5000);
    for (const [n, js, ms] of [
      ['thuis', `PLNav.tab('auto')`, 1500],
      ['overzicht', `PLNav.tab('live'); setPidView('overzicht')`, 3000],
      ['slim', `PLNav.tab('live'); setPidView('slim')`, 3500],
      ['check', `PLNav.tab('auto'); document.getElementById('plCheckBtn').click()`, 9000],
    ]) {
      await a.ev(`(async function(){ ${js}; return true; })()`);
      const e = Date.now() + ms; while (Date.now() < e) { await a.ev(zet({ rpm: 1750, kmh: 64, koel: 90, gas: 22 })); await z(150); }
      await a.ev(ZONDER_DEMO); await a.schermafdruk(path.join(map, n + '.png'));
    }
    if (a.fouten.length) console.log('  LET OP  JS-fouten: ' + a.fouten.slice(0, 2).join(' | '));
  } finally { await a.stop(); }
  // liggend: Hyperlane
  a = await startApp({ root: path.join(__dirname, '..', '..', 'public'), breedte: 915, hoogte: 412 });
  await a.venster(915, 412, 2);
  try {
    await a.ev(KAAL); await a.ev(auto(merkNaam)); await z(4000);
    await a.ev(`PLHyperlane.zetStand('auto'); localStorage.setItem('pl_hl_vorm','tunnel'); localStorage.setItem('pl_hl_midden','slim'); true`);
    await a.ev(OPEN_HL);
    const merkInBeeld = await a.ev(`[].slice.call(document.querySelectorAll('.vhl-merk')).filter(function(x){ return x.getClientRects().length; }).map(function(x){ return x.textContent.trim(); }).join('')`);
    const stap = async (n, sec, w) => { await rijd(a, sec, w); await a.schermafdruk(path.join(map, n + '.png')); };
    await stap('rijden', 7, { rpm: 3400, kmh: 83, koel: 90, gas: 45 });
    await stap('stil', 6, { rpm: 780, kmh: 0, koel: 90, gas: 0 });
    await stap('launch', 4.2, t => ({ rpm: 2600 + ((t % 2.2) / 2.2) * 3400, kmh: Math.min(104, 100 * Math.pow(t / 7, 1.15)), koel: 90, gas: 100 }));
    await stap('max', 3, { rpm: 6900, kmh: 128, koel: 94, gas: 100 });
    await stap('hitte', 12, { rpm: 1300, kmh: 20, koel: 121, gas: 10 });
    if (a.fouten.length) console.log('  LET OP  JS-fouten: ' + a.fouten.slice(0, 2).join(' | '));
    return merkInBeeld;
  } finally { await a.ev('_scenario.enabled=false; true').catch(() => {}); await a.stop(); }
}

async function beelden(m, ruw, uit) {
  fs.mkdirSync(uit, { recursive: true });
  const kl = m.kl.map(c => 'rgb(' + c.join(',') + ')');
  const a = await startApp({ root: __dirname, pagina: '/sjabloon.html', breedte: 1200, hoogte: 900 });
  await a.venster(1200, 900, 1.5);
  try {
    const n = await a.ev(`DIAS.length`);
    for (let i = 0; i < n; i++) {
      const naam = await a.ev(`toon(${i}, ${JSON.stringify({ merk: m.naam, kl, ruw: path.relative(__dirname, ruw) })})`);
      await z(400);
      await a.schermafdruk(path.join(uit, String(i + 1).padStart(2, '0') + '-' + naam + '.png'));
    }
  } finally { await a.stop(); }
}

(async () => {
  // MERKEN uit de echte bron (pidlane-hyperlane.js), niet overgeschreven: een nieuw merk daar komt hier vanzelf mee.
  const bron = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'pidlane-hyperlane.js'), 'utf8');
  const blok = bron.match(/const MERKEN = \[([\s\S]*?)\n\];/);
  if (!blok) { console.log('FOUT  const MERKEN niet gevonden in pidlane-hyperlane.js'); process.exit(1); }
  const MERKEN = new Function('return [' + blok[1] + '];')();
  const keuze = process.argv[2] ? process.argv[2].split(',') : MERKEN.map(m => m.id);
  let mis = 0;
  for (const id of keuze) {
    const m = MERKEN.find(x => x.id === id);
    if (!m) { console.log('Onbekend merk: ' + id + ' (bekend: ' + MERKEN.map(x => x.id).join(', ') + ')'); process.exit(2); }
    console.log(m.naam);
    const ruw = path.join(RUW, m.id), uit = path.join(UIT, m.id);
    const gezien = await opnames(m.naam, ruw);
    if (gezien !== m.naam) { console.log('  MIS  tellerplaat toont "' + gezien + '", verwacht "' + m.naam + '"'); mis++; }
    await beelden(m, ruw, uit);
    console.log('  → ' + path.relative(process.cwd(), uit));
  }
  process.exit(mis ? 1 : 0);
})().catch(e => { console.error('FOUT ' + e.message); process.exit(1); });
