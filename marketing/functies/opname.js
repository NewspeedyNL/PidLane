// opname.js — een rondgang langs de functies van de app (15-11-2026)
//
// De echte app in demomodus, staand op een telefoon (412×915): de Mazda CX-5
// met het pakket van een echte CX-5 2018. Per functie een clip; een clip die
// lang is, scrolt rustig van boven naar beneden. Geen mockup: alles wat je
// ziet is de app zoals hij nu is.
//
//   node marketing/functies/opname.js              alle clips → opname/<clip>/NNNN.png + tijden.json
//   node marketing/functies/opname.js --proef      één beeld per clip + controle (exit 1 = mis)
//   node marketing/functies/opname.js --alleen check,accu
//   node marketing/functies/opname.js --video      daarna: uit/<clip>.mp4 en uit/functies.mp4 (ffmpeg)
//
// Wat je aanpast staat in CLIPS hieronder: de volgorde, hoe lang, hoe je er
// komt (open), wat er in beeld hoort te staan (verwacht, een stukje tekst) en
// of hij scrolt. Een clip die niet laat zien wat hij belooft is bij --proef
// een MIS; zonder --proef komt er een LET OP bij.
'use strict';
const path = require('path'), fs = require('fs');
const { startApp } = require(path.join(__dirname, '..', '..', 'plbrowser.js'));
const film = require(path.join(__dirname, '..', 'filmpje.js'));
const UIT = path.join(__dirname, 'opname'), VIDEO = path.join(__dirname, 'uit');
const z = ms => new Promise(r => setTimeout(r, ms));
const arg = (n, std) => { const i = process.argv.indexOf('--' + n); return i < 0 ? std : (process.argv[i + 1] || std); };
const PROEF = process.argv.includes('--proef'), FPS = Number(arg('fps', 12));
const ALLEEN = arg('alleen', '') ? arg('alleen', '').split(',') : null;

const W = ms => `await new Promise(function(r){ setTimeout(r, ${ms}); });`;
const CLIPS = [
  { naam: 'thuis', sec: 4, open: `PLNav.tab('auto');`, verwacht: 'Check mijn auto' },
  { naam: 'check', sec: 7, scroll: true, open: `PLNav.tab('auto'); ${W(300)} document.getElementById('plCheckBtn').click(); ${W(9000)}`, verwacht: 'storing' },
  { naam: 'onderzoek', sec: 6, scroll: true, open: `PLFoutcodes.sluit(); PLOnderzoek.open();`, wacht: 2500, verwacht: null },
  { naam: 'overzicht', sec: 7, scroll: true, open: `PLOnderzoek.sluit(); PLNav.tab('live'); setPidView('overzicht');`, wacht: 3000, verwacht: 'sensoren' },
  { naam: 'slim', sec: 6, scroll: true, open: `PLNav.tab('live'); setPidView('slim');`, wacht: 3500, verwacht: null },
  { naam: 'grafiek', sec: 6, open: `PLNav.tab('live'); document.getElementById('tabGraph').click(); ${W(800)}
      var k=[].slice.call(document.querySelectorAll('button')).find(function(b){ return /Brandstof/.test(b.textContent) && b.offsetParent; }); if(k) k.click();`,
    wacht: 12000, verwacht: 'Brandstof' },
  { naam: 'accu', sec: 6, scroll: true, open: `PLNav.tab('live'); PLAccu.open();`, wacht: 3500, verwacht: 'Accu' },
  { naam: 'winter', sec: 6, scroll: true, open: `try{ PLAccu.sluit(); }catch(e){ console.warn('opname: accu sluiten', e); } PLWinter.open();`, wacht: 3000, verwacht: null },
  { naam: 'rapporten', sec: 5, scroll: true, open: `var an=[].slice.call(document.querySelectorAll('button')).find(function(b){ return b.offsetParent && b.textContent.trim()==='Annuleren'; });
      if(an) an.click(); ${W(400)} PLNav.tab('rapporten');`, wacht: 2500, verwacht: null },
];

const KAAL = `(function(){
  document.head.insertAdjacentHTML('beforeend','<style>#bronBanner,#plZonderKaart{display:none!important}</style>');
  ['loginOv','welcomeScreen'].forEach(function(id){ var e=document.getElementById(id); if(e) e.classList.add('hidden'); });
  return true; })()`;
// Het bovenste zichtbare element dat kan scrollen (een venster, anders de
// pagina) op p (0…1) van zijn scrolllengte zetten. Geeft terug of er iets te
// scrollen viel.
const SCROLL = p => `(function(){
  var kand=[].slice.call(document.querySelectorAll('body *')).filter(function(e){
    if(!e.getClientRects().length || e.scrollHeight-e.clientHeight<40) return false;
    var s=getComputedStyle(e).overflowY; return s==='auto'||s==='scroll'; });
  var e=kand.sort(function(a,b){ return (+getComputedStyle(b).zIndex||0)-(+getComputedStyle(a).zIndex||0) || b.clientHeight-a.clientHeight; })[0]
        || document.scrollingElement;
  e.scrollTop=${p.toFixed(3)}*(e.scrollHeight-e.clientHeight); return e.scrollHeight-e.clientHeight>40; })()`;

(async () => {
  const a = await startApp({ root: path.join(__dirname, '..', '..', 'public'), breedte: 412, hoogte: 915 });
  let mis = 0;
  try {
    await a.ev(KAAL);
    await a.ev(`startDemoCar(0); true`);
    await z(6000);
    for (const c of CLIPS) {
      if (ALLEEN && !ALLEEN.includes(c.naam)) continue;
      const map = path.join(UIT, c.naam);
      fs.rmSync(map, { recursive: true, force: true }); fs.mkdirSync(map, { recursive: true });
      try { await a.ev(`(async function(){ ${c.open} return true; })()`); }
      catch (e) { console.log('  MIS  ' + c.naam + ': openen faalde — ' + e.message); mis++; continue; }
      await z(c.wacht || 1500);
      await a.ev(SCROLL(0));
      const tekst = await a.ev('document.body.innerText');
      const goed = !c.verwacht || tekst.includes(c.verwacht);
      if (!goed) mis++;
      await film.neem(a, map, PROEF ? 0.01 : c.sec, FPS, c.scroll ? t => a.ev(SCROLL(Math.min(1, Math.max(0, (t - 1) / (c.sec - 2))))) : null);
      console.log('  ' + (goed ? 'ok  ' : (PROEF ? 'MIS ' : 'LET OP ')) + c.naam + (goed ? '' : ' — "' + c.verwacht + '" staat niet in beeld'));
    }
    if (a.fouten.length) console.log('LET OP  JS-fouten: ' + a.fouten.slice(0, 3).join(' | '));
  } finally { await a.stop(); }
  if (PROEF) { if (mis) { console.log('\n' + mis + ' clip(s) toonden niet wat ze beloven.'); process.exit(1); } return; }
  if (process.argv.includes('--video')) {
    const namen = CLIPS.map(c => c.naam).filter(n => !ALLEEN || ALLEEN.includes(n));
    for (const n of namen) film.video([path.join(UIT, n)], path.join(VIDEO, n + '.mp4'), 'scale=1080:-2');
    film.video(namen.map(n => path.join(UIT, n)), path.join(VIDEO, 'functies.mp4'), 'scale=1080:-2');
  }
})().catch(e => { console.error('FOUT ' + e.message); process.exit(1); });
