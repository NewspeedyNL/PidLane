// ══════════════════════════════════════════════════════════════════
// bproef-contrast.js — is de tekst werkelijk te lezen? (#141)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// #141 zegt: "zichtbaarheid teksten, waardes niet in orde", en noemt twee
// richtingen — een light thema, of een groter lettertype. Beide bleken te
// bestaan en geen van beide werkte:
//
//   het lichte thema   volledig uitgewerkt in pidlane.css, en onbereikbaar:
//                      pidlane-theme.js zette `isDark = true` en gooide de
//                      opgeslagen voorkeur weg
//   lettergrootte L    sneed de onderkant van het scherm af (#192, opgelost)
//
// "Niet in orde" is als klacht niet te toetsen. Een contrastverhouding wel.
// Deze proef rekent voor elke zichtbare tekst uit hoe hij zich verhoudt tot
// de kleur waar hij werkelijk op ligt, en houdt 4,5:1 aan — de WCAG-AA-norm
// voor gewone tekst. Dat maakt van een oordeel een getal.
//
// TWEE KEER MAT DEZE PROEF HET VERKEERDE, EN DAT IS DE LES
//
// 1. De eerste versie nam de eerste laag met alpha > 0 als ondergrond.
//    rgba(255,255,255,.04) werd zo "wit", terwijl het een sluier van 4% over
//    een donkere grond is. Dat gaf 22 bevindingen die geen van alle bestonden.
//    De lagen worden nu echt op elkaar gestapeld tot er iets ondoorzichtigs
//    onder zit.
// 2. De tweede versie liep dwars door een `linear-gradient` heen naar de body,
//    want een verloop staat in background-IMAGE en niet in backgroundColor.
//    In het donkere thema kwam dat toevallig goed uit; in het lichte gaf het
//    tien nieuwe fantomen op panelen die juist een donker verloop dragen.
//    Een tekst boven een verloop telt nu als ONMEETBAAR en niet als goed —
//    dat verschil is het halve punt van deze proef.
//
// Beide keren zag de proef er groen en overtuigend uit. Vandaar dat blok 3
// hieronder een echte fout terugzet en controleert dat hij dán rood wordt.
//
// Draaien vanuit public/:  node bproef-contrast.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

const NORM = 4.5;                     // WCAG AA, gewone tekst
let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const rust = (ms) => new Promise(function (r) { setTimeout(r, ms); });

const SCHERMEN = [
  { naam: 'Diep zoeken',   open: 'openDeepDiag',      id: 'deepDiagOv' },
  { naam: 'PID-recorder',  open: 'openPidRecorder',   id: 'pidRecOv' },
  { naam: 'Onderhoud',     open: 'openOnderhoud',     id: 'onderhoudDash' },
  { naam: 'EV-check',      open: 'openEVCheck',       id: 'evDash' },
  { naam: 'Lange rit',     open: 'openLangeRit',      id: 'langeRitDash' },
  { naam: 'Klimaat',       open: 'openClimateCheck',  id: 'climateDash' }
];

const METER = `(function(sel, norm){
  function rgba(c){
    const m = c.match(/[\\d.]+/g); if(!m) return null;
    return { r:+m[0], g:+m[1], b:+m[2], a: m.length>3 ? parseFloat(m[3]) : 1 };
  }
  function over(voor, achter){
    const a = voor.a + achter.a*(1-voor.a);
    if (!a) return { r:0, g:0, b:0, a:0 };
    return { a:a,
      r:(voor.r*voor.a + achter.r*achter.a*(1-voor.a))/a,
      g:(voor.g*voor.a + achter.g*achter.a*(1-voor.a))/a,
      b:(voor.b*voor.a + achter.b*achter.a*(1-voor.a))/a };
  }
  function ondergrond(el){
    let n = el, laag = { r:0, g:0, b:0, a:0 };
    while (n && n !== document.documentElement) {
      const st = getComputedStyle(n);
      if (st.backgroundImage && st.backgroundImage !== 'none') return { verloop:true };
      const c = rgba(st.backgroundColor);
      if (c && c.a > 0) { laag = over(laag, c); if (laag.a >= 0.99) break; }
      n = n.parentElement;
    }
    const hs = rgba(getComputedStyle(document.documentElement).backgroundColor);
    return over(laag, (hs && hs.a > 0) ? hs : { r:255, g:255, b:255, a:1 });
  }
  function lum(c){
    const v = ['r','g','b'].map(k=>{ const x=c[k]/255; return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4); });
    return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2];
  }
  const root = document.getElementById(sel);
  if (!root) return { fout:'geen #'+sel };
  const slecht = []; let onmeetbaar = 0, gekeken = 0;
  root.querySelectorAll('*').forEach(function(el){
    if (!Array.from(el.childNodes).some(n=>n.nodeType===3 && n.textContent.trim())) return;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.1) return;
    const tc = rgba(cs.color); if (!tc || tc.a === 0) return;
    const bg = ondergrond(el);
    if (bg.verloop) { onmeetbaar++; return; }
    gekeken++;
    const tv = lum(over(tc, bg)), bv = lum(bg);
    const ratio = (Math.max(tv,bv)+0.05)/(Math.min(tv,bv)+0.05);
    if (ratio < norm) slecht.push({ ratio: Math.round(ratio*100)/100, kleur: cs.color,
      tekst: (el.textContent||'').trim().slice(0,30) });
  });
  return { aantal: slecht.length, gekeken: gekeken, onmeetbaar: onmeetbaar, lijst: slecht.slice(0,3) };
})`;

function zeg(m) {
  return m.lijst.map(function (x) { return '"' + x.tekst + '" ' + x.ratio + ':1 (' + x.kleur + ')'; }).join(', ');
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

    console.log('\n1. Het thema is weer een keuze (#141)');
    toets('plThemaZet() bestaat', await app.ev(`typeof plThemaZet === 'function'`),
          'zonder die functie is het lichte thema onbereikbaar, en dat wás de bevinding');
    await app.ev(`plThemaZet('licht'); true`);
    toets('licht zet de dark-class uit',
          await app.ev(`!document.documentElement.classList.contains('dark')`));
    toets('en onthoudt dat', await app.ev(`localStorage.getItem('ns_theme') === 'licht'`));
    await app.ev(`plThemaZet('donker'); true`);
    toets('donker zet hem weer aan',
          await app.ev(`document.documentElement.classList.contains('dark')`));
    toets('het lichte palet is compleet — --bg verschilt per thema',
          await app.ev(`(function(){
            const h=document.documentElement, was=h.className;
            const d=getComputedStyle(h).getPropertyValue('--bg').trim();
            plThemaZet('licht');
            const l=getComputedStyle(h).getPropertyValue('--bg').trim();
            h.className=was; plThemaZet('donker');
            return !!d && !!l && d!==l; })()`),
          'staan beide thema\'s op dezelfde kleur, dan schakelt er niets');

    // Tegels vullen: zonder data staat het hoofdscherm leeg en meet blok 2 niets.
    await app.ev(`(function(){
      const w=document.getElementById('welcomeScreen'); if(w) w.classList.add('hidden');
      try{ sw('live', document.querySelector('.tabs .tab')); }catch(e){}
      ['010C','0105','0104','010D','0111','0142'].forEach(function(p){
        try{ activePIDs.add(p); }catch(e){}
        try{ pidVals[p] = 40 + Math.random()*60; }catch(e){}
      });
      try{ renderGauges(); }catch(e){ return String(e.message); }
      return true; })()`);
    await rust(300);
    const tegels = await app.ev(`document.querySelectorAll('#gGrid .gc').length`);
    toets('er staan tegels om aan te meten', tegels > 0,
          'zonder tegels meet blok 2 een leeg scherm en staat hij groen om de verkeerde reden');

    for (const thema of ['donker', 'licht']) {
      console.log('\n2' + (thema === 'donker' ? 'a' : 'b') + '. Elke tekst haalt ' + NORM + ':1 — thema ' + thema);
      await app.ev(`plThemaZet('${thema}'); true`);
      await rust(200);

      for (const g of ['m', 's', 'l']) {
        await app.ev(`setUiScale('${g}'); true`);
        await rust(180);
        const m = await app.ev(`${METER}('appGrid', ${NORM})`);
        if (m.fout) { toets('hoofdscherm ' + g.toUpperCase() + ': meetbaar', false, m.fout); continue; }
        toets('hoofdscherm ' + g.toUpperCase() + ' (' + m.gekeken + ' teksten)', m.aantal === 0, zeg(m));
      }
      await app.ev(`setUiScale('m'); true`);

      for (const v of SCHERMEN) {
        if (!await app.ev(`typeof ${v.open} === 'function'`)) { toets(v.naam + ': ' + v.open + '() bestaat', false); continue; }
        await app.ev(`${v.open}(); true`);
        await rust(420);
        const m = await app.ev(`${METER}('${v.id}', ${NORM})`);
        if (m.fout) { toets(v.naam + ': meetbaar', false, m.fout); }
        else toets(v.naam + ' (' + m.gekeken + ' gemeten, ' + m.onmeetbaar + ' boven een verloop)',
                   m.aantal === 0, zeg(m));
        await app.ev(`(function(){ const e=document.getElementById('${v.id}'); if(e) e.style.display='none'; return true; })()`);
      }
    }

    console.log('\n3. Tegenproef — betrapt deze proef een echte fout?');
    /* Zonder dit blok bewijst alles hierboven alleen dat er nullen uit komen.
       De kleur die hier teruggezet wordt is de kleur die #141 opleverde: een
       tekstkleur uit het donkere palet, met de hand opgeschreven, op een
       lichte grond. */
    await app.ev(`plThemaZet('licht'); true`);
    await app.ev(`(function(){
      const st = document.createElement('style'); st.id = 'plProefSlechtContrast';
      st.textContent = '.pidview-btn.waak{ color:#7f93b8 !important; }';
      document.head.appendChild(st); return true; })()`);
    await rust(200);
    const kapot = await app.ev(`${METER}('appGrid', ${NORM})`);
    toets('een handgeschreven donkere tekstkleur op een lichte grond wordt betrapt',
          !kapot.fout && kapot.aantal > 0,
          'de meting ziet hem niet — dan zegt blok 2 niets (gemeten: ' + JSON.stringify(kapot) + ')');
    await app.ev(`(function(){ const e=document.getElementById('plProefSlechtContrast'); if(e) e.remove(); return true; })()`);

    // En de andere kant: zonder die regel is hij weer schoon. Anders zou blok 3
    // groen kunnen staan om een fout die er sowieso al was.
    await rust(200);
    const heel = await app.ev(`${METER}('appGrid', ${NORM})`);
    toets('en zonder die regel is het scherm weer schoon', !heel.fout && heel.aantal === 0, zeg(heel));
    await app.ev(`plThemaZet('donker'); true`);

  } finally { await app.stop(); }

  console.log(fouten ? '\nbproef-contrast: ' + fouten + ' FOUT' : '\nbproef-contrast: alles goed');
  process.exit(fouten ? 1 : 0);
})();
