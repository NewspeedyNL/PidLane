// ══════════════════════════════════════════════════════════════════
// bproef-strook.js — stil verbinden in de echte app (08-11-2026)
// ──────────────────────────────────────────────────────────────────
// test-strook.js toetst de strook los, test-snelverbinden.js de stand in
// connectSerial(). Wat daar niet in past is de hele weg: protocol → VIN →
// sensoren → foutcodes in de echte pidlane-bt.js, tegen een nep-auto, en
// of er onderweg écht geen venster opengaat.
//
// DE TEGENPROEVEN DIE ERIN ZITTEN
//   • Deel 1: zonder bekende adapter opent de knop het verbindscherm — de
//     eerste keer moet de klant de adapter kiezen.
//   • Deel 2: geen samenvatting (#wizS6), geen keuze Inrichten (#plInOv),
//     geen Check-venster (#plFcOv) en geen verbindscherm.
//   • Deel 3: de foutcodes zijn gelezen en vastgelegd, niet alleen getoond.
//
// Draaien vanuit public/:  node bproef-strook.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const fs = require('fs');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));
const VLOOT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'nepvloot', 'profielen.json'), 'utf8')).auto;
const NEP = fs.readFileSync(path.join(__dirname, 'nepauto.js'), 'utf8');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const rust = (ms) => new Promise(r => setTimeout(r, ms));
const zichtbaar = (sel) => `(function(){ const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; const s=getComputedStyle(e); return s.display!=='none' && s.visibility!=='hidden' && !e.classList.contains('hidden') && !e.hidden; })()`;

(async () => {
  let app;
  try { app = await startApp({ root: path.join(__dirname) }); }
  catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  const wacht = async (expr, ms) => {
    for (let i = 0; i < (ms || 8000) / 200; i++) { if (await app.ev(expr)) return true; await rust(200); }
    return false;
  };

  try {
    console.log('\n1. De ingang');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('PLStrook en plVerbindOpen staan er', await app.ev(`typeof PLStrook === 'object' && typeof plVerbindOpen === 'function'`));
    toets('PLFoutcodes kan stil lezen', await app.ev(`typeof PLFoutcodes.scanStil === 'function'`));
    await app.ev(`localStorage.removeItem('spp_address'); document.getElementById('connOv').classList.add('hidden'); plVerbindOpen(); 'ok'`);
    toets('zonder bekende adapter: het verbindscherm  <- tegenproef: eerste keer kiezen', await app.ev(zichtbaar('#connOv')));
    await app.ev(`closeConnOv(); 'ok'`);

    console.log('\n2. Stil verbinden met een nieuwe auto: geen enkel venster');
    const p = VLOOT.find(a => a.id === 'cx5_18') || VLOOT[0];
    await app.ev(NEP);
    await app.ev(`window._PL_PROFIEL = ${JSON.stringify(p)}; 'ok'`);
    const route = await app.ev(`(async function(){
      const a = PLNepAuto.maak(window._PL_PROFIEL);
      window._PL_NEPLOG = [];
      window._sendBTOnce = async function(cmd){ window._PL_NEPLOG.push(String(cmd).toUpperCase()); const r = a.stuur(cmd); await new Promise(function(z){ setTimeout(z, Math.min(r.ms, 20)); }); return r.tekst; };
      window._webBtWrite = function(){};
      connected = true; demoMode = false;
      try{ localStorage.removeItem('pl_check_dag'); }catch(e){ console.warn(e); }
      // Wat connectSerial() zet na een gelukte verbinding met de knop.
      window._plHervat = { t: Date.now(), reden: 'stil verbinden', stil: true, ms: 600000 };
      PLStrook.start(); PLStrook.stap('adapter', 'ok', 'nep-adapter');
      const u = { fout: [] };
      try { await initELM327(); } catch (e) { u.fout.push('initELM327: ' + e.message); }
      _kentPoortKlaar = false;   // de gewone stand zou nu het kenteken vragen
      try { await scanNetworks(); } catch (e) { u.fout.push('scanNetworks: ' + e.message); }
      return u;
    })()`);
    toets('de route start zonder fout', route && route.fout.length === 0, JSON.stringify(route));
    toets('de kentekenstap is overgeslagen (geen #stepKent)', !(await app.ev(zichtbaar('#stepKent'))));
    const klaar = await wacht(`window._plVerbindingKlaar > 0 && PLStrook.staat().st && PLStrook.staat().st.stappen.find(function(s){ return s.id==='codes'; }).status !== 'wacht' && PLStrook.staat().st.stappen.find(function(s){ return s.id==='codes'; }).status !== 'bezig'`, 120000);
    toets('de hele weg komt aan, tot en met de foutcodes', klaar, JSON.stringify(await app.ev(`PLStrook.staat().st && PLStrook.staat().st.stappen.map(function(s){ return s.id+':'+s.status+':'+s.tekst; })`)));
    const st = await app.ev(`Object.fromEntries(PLStrook.staat().st.stappen.map(function(s){ return [s.id, s.status]; }))`);
    toets('Adapter, Protocol en Klaarzetten hebben een vinkje', st.adapter === 'ok' && st.protocol === 'ok' && st.klaar === 'ok', JSON.stringify(st));
    toets('geen samenvatting (#wizS6)', !(await app.ev(zichtbaar('#wizS6'))));
    toets('geen keuze Inrichten (#plInOv)', !(await app.ev(zichtbaar('#plInOv'))));
    toets('geen Check-venster (#plFcOv)', !(await app.ev(zichtbaar('#plFcOv'))));
    toets('geen verbindscherm', !(await app.ev(zichtbaar('#connOv'))));
    toets('geen kentekenblad van PLOpstart (#plOpKent)', !(await app.ev(`!!document.getElementById('plOpKent')`)));
    toets('wel sensoren aan', (await app.ev(`activePIDs.size`)) > 0, String(await app.ev(`activePIDs.size`)));

    console.log('\n3. De foutcodes zijn gelezen en vastgelegd');
    toets('PLFoutcodes heeft een uitslag', await app.ev(`!!PLFoutcodes.staat().scan`));
    toets('de bus kreeg mode 03 en 07', await app.ev(`window._PL_NEPLOG.indexOf('03') >= 0 && window._PL_NEPLOG.indexOf('07') >= 0`));
    toets('de dag is gemarkeerd', await app.ev(`PLOpstart.checkVandaag()`));

    console.log('\n4. De strook zelf');
    const maat = await app.ev(`(function(){ const r=document.getElementById('plStrook').getBoundingClientRect(); return { l:r.left, r:r.right, b:window.innerWidth, t:r.top }; })()`);
    toets('binnen de schermbreedte, bovenin', maat.l >= 0 && maat.r <= maat.b && maat.t < 60, JSON.stringify(maat));
    toets('geen horizontale scroll', await app.ev(`document.documentElement.scrollWidth <= window.innerWidth`));
    await app.ev(`PLStrook.aftellen(function(){ window._plAftelGing = 1; }); 'ok'`);
    toets('aftellen toont de balk en Annuleren', await app.ev(`!!document.getElementById('plStrookAnnuleer') && !!document.querySelector('.pl-strook-balk')`));
    await app.ev(`document.getElementById('plStrookAnnuleer').click(); 'ok'`);
    await rust(5600);
    toets('Annuleren: er wordt niet verbonden', !(await app.ev(`!!window._plAftelGing`)));

    toets('de hele rit zonder JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log('\n' + (fouten ? fouten + ' FOUT' : 'Alles ok'));
  process.exit(fouten ? 1 : 0);
})();
