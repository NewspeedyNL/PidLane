// ══════════════════════════════════════════════════════════════════
// bproef-volscherm.js — Slim visueel staand op het volle scherm (19-11-2026, #748)
// ──────────────────────────────────────────────────────────────────
// Uit de auto: het trekpaneel liep onder de Android-navigatiebalk door
// (caravanregel en limietbord onleesbaar), en Motor en Verbruik lieten de
// onderste 40% leeg. Deze proef draait de echte app staand, met een
// navigatiebalk van 48 px (--pl-sab), en meet:
//   1. basis + trekpaneel op een kort scherm: alles in beeld, niets te scrollen;
//   2. Hyperlane + trekpaneel: het paneel boven de navigatiebalk, niet over de
//      ringen, en het middengetal maakt plaats;
//   3. Motor zonder paneel: het profiel vult de hoogte.
// Tegenproef: zonder volPas() (--vis-pas blijft 1) wordt 1 rood; zonder de
// Hyperlane-regel ligt het paneel over het middengetal (2 rood).
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const W = ms => new Promise(r => setTimeout(r, ms));
const SAB = 48;

(async () => {
  let app;
  try { app = await startApp({ root: __dirname }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  try {
    await app.venster(412, 740);
    // Als klant, zonder het inlogvenster: met dat venster open staat de app op
    // visibility:hidden, en dan zegt "het middengetal is verborgen" niets.
    await app.ev(`window.currentUser = { user:'proef', role:'klant', label:'proef' }; startDemoCar(0); true`); await W(2000);
    await app.ev(`(function(){ const o = document.getElementById('loginOv'); if (o) o.style.display = 'none'; PLNav.tab('live'); return true; })()`);
    const zicht = await app.ev(`getComputedStyle(document.querySelector('.cc') || document.body).visibility`);
    if (zicht !== 'visible') { console.log('  FOUT de app staat niet in beeld (' + zicht + ') — deze proef meet dan niets'); process.exit(1); }
    await app.ev(`document.documentElement.style.setProperty('--pl-sab','${SAB}px');
      if(!situatieActief().some(function(x){ return x.id==='caravan'; })) toggleSituatie('caravan');
      localStorage.setItem('pl_vis_profiel','basis'); setPidView('slim'); setPidView('visueel'); PLVisThema.aan(); true`);
    // volPas() loopt met de tik van één seconde mee
    let m = null;
    for (let i = 0; i < 15; i++) {
      await W(1000);
      m = await app.ev(`(function(){ const o=document.querySelector('.vis'), r=document.querySelector('.vtp-rit'), l=document.querySelector('.vtp-limiet');
        return { over:o.scrollHeight-o.clientHeight, pas:o.style.getPropertyValue('--vis-pas'), rit:r?Math.round(r.getBoundingClientRect().bottom):null,
                 lim:l?Math.round(l.getBoundingClientRect().bottom):null, h:innerHeight }; })()`);
      if (m.over <= 1 && m.rit !== null && m.rit <= m.h - SAB) break;   // niet alleen 'niets te scrollen': dat zegt de onderrand niet
    }
    console.log('\n1. Basis + trekpaneel, staand op een kort scherm');
    toets('alles in beeld: niets onder de onderrand', m.over <= 1, JSON.stringify(m));
    toets('de caravanregel en het limietbord staan boven de navigatiebalk', m.rit !== null && m.rit <= m.h - SAB && m.lim <= m.h - SAB, JSON.stringify(m));
    toets('daarvoor kromp de meter (en niet tot onleesbaar)', parseFloat(m.pas) < 1 && parseFloat(m.pas) >= 0.55, JSON.stringify(m));

    console.log('\n2. Hyperlane + trekpaneel');
    await app.venster(412, 915);
    await app.ev(`localStorage.setItem('pl_vis_profiel','hyperlane'); setPidView('slim'); setPidView('visueel'); PLVisThema.aan(); true`);
    await W(3000);
    const h = await app.ev(`(function(){ const o=document.querySelector('.vis-onder').getBoundingClientRect(), pods=[...document.querySelectorAll('.vhl-pod')].map(function(p){ return p.getBoundingClientRect(); });
      const mid=document.querySelector('.vis .vpf-hyper .vhl-mid');
      return { onder:Math.round(o.bottom), boven:Math.round(o.top), h:innerHeight, podOnder:Math.round(Math.max.apply(null, pods.map(function(p){ return p.bottom; }))),
               mid: mid ? getComputedStyle(mid).visibility : 'geen', midTekst: mid ? mid.textContent.trim().slice(0, 30) : '' }; })()`);
    toets('het paneel staat boven de navigatiebalk', h.onder <= h.h - SAB, JSON.stringify(h));
    toets('en niet over de ringen van toeren en snelheid', h.boven >= h.podOnder - 2, JSON.stringify(h));
    toets('het middengetal maakt plaats (geen tekst onder het paneel)', h.mid === 'hidden' && h.midTekst !== '', JSON.stringify(h));

    console.log('\n3. Motor zonder paneel vult de hoogte');
    await app.ev(`toggleSituatie('caravan'); localStorage.setItem('pl_vis_profiel','motor'); setPidView('slim'); setPidView('visueel'); PLVisThema.aan(); true`);
    await W(3000);
    const v = await app.ev(`(function(){ const p=document.querySelector('.vpf').getBoundingClientRect(); return { onder:Math.round(p.bottom), h:innerHeight }; })()`);
    toets('het profiel loopt door tot onderin (geen lege onderste 40%)', v.onder >= (v.h - SAB) * 0.85, JSON.stringify(v));
    await app.ev(`PLVisThema.uit(); localStorage.setItem('pl_vis_profiel','basis'); true`);
    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally { await app.stop(); }
  console.log('\n' + (fouten ? 'bproef-volscherm: ' + fouten + ' FOUT' : 'bproef-volscherm: alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
