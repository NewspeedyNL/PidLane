// ══════════════════════════════════════════════════════════════════
// bproef-toon.js — dezelfde sensor, hetzelfde getal, in elke weergave
// ──────────────────────────────────────────────────────────────────
// 07-10-2026 in een Mazda CX-5: het gaspedaal "stond vast op 20" en het
// tankniveau was het ene scherm 6 % en het andere 8 %. test-toon.js toetst
// de regel (PLToon). Hier de echte schermen: Overzicht en Visueel krijgen
// via applyG() hetzelfde losgelaten pedaal (0149 op zijn rust van ~20 %) en
// dezelfde klotsende tank, en moeten hetzelfde getal tonen — 0 voor het
// pedaal, één gedempt getal voor de tank. De ruwe waarde blijft in pidVals.
//
// Draaien vanuit public/:  node bproef-toon.js
// ══════════════════════════════════════════════════════════════════
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
  try {
    app = await startApp({ root: path.join(__dirname) });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await app.venster(412, 915);
    await app.ev(`startDemoCar(0); true`);
    await wacht(1500);
    // De demo-auto zou voor 0149 zijn eigen willekeurige waarden leveren, en
    // die zou de app terecht als rust leren. Hier staat het pedaal los op de
    // rust van de rit (19,6–20,4 %) en klotst de tank, zoals op 07-10.
    await app.ev(`(function(){ var echt = window.demo; window.demo = function(p){
      if (p === '0149') return 20; if (p === '012F') return 7.8; return echt.apply(this, arguments); }; return true; })()`);
    const zet = `(function(){
      PLToon._wis();
      ['0149','012F','010C','010D','0105'].forEach(function(p){ activePIDs.add(p); });
      var nu = Date.now(), r = [20, 20.4, 19.6, 20, 20.2];
      pidHist['0149'] = r.map(function(v, i){ return { t: nu - (5 - i) * 1000, v: v }; });
      pidHist['012F'] = [8.2, 6.3, 7.8].map(function(v, i){ return { t: nu - (3 - i) * 60000, v: v }; });
      pidVals['012F'] = 7.8; pidVals['0149'] = 20;
      return true; })()`;
    const lees = {
      overzicht: `({ ped: (document.getElementById('gv-0149')||{}).textContent, tank: (document.getElementById('gv-012F')||{}).textContent })`,
      visueel: `({ ped: (document.getElementById('visv-pedaal')||{}).textContent, tank: (document.getElementById('visv-tank')||{}).textContent, plek: (PLVisueel.staat().ind||{}).plekken })`
    };
    const getal = (t) => { const m = String(t || '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? Math.round(Number(m[0])) : null; };
    const uit = {};
    for (const view of ['overzicht', 'visueel']) {
      await app.ev(zet);
      await app.ev(`setPidView('${view}'); true`);
      await wacht(1200);
      await app.ev(zet);
      // Losgelaten pedaal en de laatste (klotsende) tankmeting, zoals updPID ze doorgeeft.
      await app.ev(`applyG('0149', 20); applyG('012F', 7.8); true`);
      const los = await app.ev(lees[view]);
      await app.ev(`applyG('0149', 50); true`);
      const in_ = await app.ev(lees[view]);
      uit[view] = { los: getal(los.ped), in: getal(in_.ped), tank: getal(los.tank), ruw: los, plek: los.plek };
      console.log('\n── ' + view + ' ──');
      // 20 tegen een geleerde rust van 19,6: 0,67 %, getoond als 1.
      toets(view + ': het losgelaten pedaal (0149 op 20 %) toont 0 of 1, niet 20', uit[view].los !== null && uit[view].los <= 1, JSON.stringify(los));
      toets(view + ': in hele procenten, zonder decimalen', !/[.,]\d/.test(String(los.ped) + String(los.tank)), JSON.stringify(los));
      toets(view + ': ingetrapt tot 50 % toont het deel vanaf de rust (≈ 51)', uit[view].in >= 49 && uit[view].in <= 52, JSON.stringify(in_));
      toets(view + ': de tank toont het gedempte getal (8), niet de laatste klots', uit[view].tank === 8, JSON.stringify(los));
    }
    console.log('\n── overal hetzelfde ──');
    toets('Overzicht en Visueel tonen hetzelfde pedaal', uit.overzicht.in === uit.visueel.in, JSON.stringify([uit.overzicht.in, uit.visueel.in]));
    toets('en hetzelfde tankniveau', uit.overzicht.tank === uit.visueel.tank, JSON.stringify([uit.overzicht.tank, uit.visueel.tank]));
    toets('de pedaalplek van Visueel is 0149 (de eerste uit de keten)', uit.visueel.plek && uit.visueel.plek.pedaal === '0149', JSON.stringify(uit.visueel.plek));
    toets('de ruwe waarde blijft ongemoeid (de AI krijgt 20, niet 0)', await app.ev(`pidVals['0149'] === 20`));
    toets('geen JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log('\n' + (fouten ? 'FOUT: ' + fouten : 'Alles goed'));
  process.exit(fouten ? 1 : 0);
})();
