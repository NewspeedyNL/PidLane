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
//   3. Motor zonder paneel: het profiel vult de hoogte;
//   4./5. alles wat tegelijk mag lopen (20-11-2026): rit-monitor óf caravanrit,
//      met bulk-recorder en waakronde erbij. Wat onder de meter staat blijft
//      boven de navigatiebalk, op het volle scherm en gewoon; de meter krimpt
//      niet voor niets, en bij Hyperlane blijft het boven de tanklichtbalk en
//      onder het middengetal — ook op een kort scherm;
//   6. rit-monitor en caravanrit staan nooit tegelijk aan;
//   7. buiten Slim visueel geen paneel maar de rit-pil (20-11-2026), en de
//      knop van de rit-monitor springt bij aanzetten naar Slim visueel.
// De navigatiebalk gaat via --safe-area-inset-bottom, zoals Capacitor hem zet:
// tot 20-11 stond hier --pl-sab op :root, en die haalt body niet op (body
// rekent --pl-sab zelf uit). volPas() las 48, de opvulling was 0 — zo bleef
// verborgen dat de opvulling op het volle scherm weg was.
// Tegenproef: zonder volPas() (--vis-pas blijft 1) wordt 1 rood; zonder de
// Hyperlane-regel ligt het paneel over het middengetal (2 rood); met de oude
// `.gg.view-visueel .vis { padding-bottom:0 }` worden 4 en 5 rood; zonder de
// weigering in toggleRitMonitor() wordt 6 rood; zonder _ritPilTick() in de
// tik, of met de sprong in ritMonitorKnop() weg, wordt 7 rood.
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
    await app.ev(`document.documentElement.style.setProperty('--safe-area-inset-bottom','${SAB}px');
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

    // Wat er onder de meter staat (rit-monitor of trekpaneel) en wat het raakt.
    const meetOnder = (vol) => app.ev(`(function(){ const v=document.querySelector('.vis'), k=document.querySelector('.vis .vis-onder');
      if(${vol ? 'false' : 'true'}) document.querySelectorAll('*').forEach(function(e){ if(e.scrollHeight>e.clientHeight+2 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop=1e5; }); scrollTo(0, 1e5);
      if(!k || !k.getBoundingClientRect().height) return null;
      const b=k.getBoundingClientRect(), t=document.querySelector('.vis .vhl-tank'), md=document.querySelector('.vis .vpf-hyper .vhl-mid'), nav=document.getElementById('plNav');
      const mid = md ? Math.max.apply(null, [...md.querySelectorAll('*')].filter(function(e){ return e.getBoundingClientRect().height>0 && getComputedStyle(e).visibility!=='hidden'; })
                                               .map(function(e){ return Math.round(e.getBoundingClientRect().bottom); })) : null;
      const navBoven = nav && getComputedStyle(nav).display!=='none' ? Math.round(nav.getBoundingClientRect().top) : innerHeight;
      return { boven:Math.round(b.top), onder:Math.round(b.bottom), h:innerHeight, pas:parseFloat(v.style.getPropertyValue('--vis-pas'))||1,
               vrm:!!k.querySelector('.vrm'), vtp:!!k.querySelector('.vtp'), tank: t ? Math.round(t.getBoundingClientRect().top) : null, mid:mid, nav:navBoven,
               lopend:Object.entries(PLRun.staat()).filter(function(x){ return x[1] && x[1].aan; }).map(function(x){ return x[0]; }).join(',') }; })()`);
    // De bulk-recorder weigert de demo-auto ('neemt geen demo op'); voor de
    // ruimte telt alleen dat hij als lopend gemeld wordt, dus die status is nep.
    await app.ev(`(function(){ const echt=PLBulk.status; PLBulk.status=function(){ return window.__nepBulk ? { actief:true, gepauzeerd:false, regels:120, gestart:Date.now()-60000 } : echt.apply(this, arguments); }; return true; })()`);
    const zet = (aan) => app.ev(`(function(){ window.confirm=function(){ return true; }; window.__nepBulk=${JSON.stringify(aan)}.indexOf('bulk')>-1;
      const wil=${JSON.stringify(aan)}, ids=['monitor','caravan','waak'];   // eerst uit, dan aan: rit-monitor en caravanrit sluiten elkaar uit
      ids.forEach(function(id){ if((PLRun.staat()[id]||{}).aan && wil.indexOf(id)<0) PLRun.schakel(id); });
      ids.forEach(function(id){ if(!(PLRun.staat()[id]||{}).aan && wil.indexOf(id)>-1) PLRun.schakel(id); }); return true; })()`);
    // Elke combinatie die mag: rit-monitor óf caravanrit, met recorder en waakronde erbij.
    const rondje = async (kop, lopend, soort) => {
      console.log('\n' + kop);
      for (const [p, hoog, vol] of [['basis', 892, true], ['verbruik', 892, true], ['motor', 892, true], ['hyperlane', 892, true], ['hyperlane', 740, true], ['basis', 892, false], ['hyperlane', 892, false]]) {
        await app.venster(412, hoog);
        await app.ev(`localStorage.setItem('pl_vis_profiel','${p}'); setPidView('slim'); setPidView('visueel'); ${vol ? 'PLVisThema.aan()' : 'PLVisThema.uit()'}; true`);
        await zet(lopend);
        await W(4000);   // volPas() loopt met de tik mee: na vier tikken hoort hij stil te staan
        const r = await meetOnder(vol);
        const n = p + ' ' + hoog + 'px ' + (vol ? 'volscherm' : 'gewoon');
        // De rit-monitor alleen in de basismeter in de gewone weergave (22-11-2026):
        // in volledig scherm en in een profiel dekt hij de meters af.
        if (soort === 'rit-monitor' && !(p === 'basis' && !vol)) {
          const hoogte = await app.ev(`(function(){ const e=document.querySelector('#visRitMon .vrm'); return e ? Math.round(e.getBoundingClientRect().height) : -1; })()`);
          toets(n + ': rit-monitor niet in beeld (wel aan: ' + lopend.join(' + ') + ')', hoogte === 0, hoogte);
          // De onderrand houdt ruimte voor de Android-knoppen, ook zonder paneel eronder.
          if (vol) {
            const pb = await app.ev(`Math.round(parseFloat(getComputedStyle(document.querySelector('.vis')).paddingBottom))`);
            toets(n + ': de meter houdt ruimte voor de navigatiebalk (padding-bottom ' + pb + 'px)', pb >= SAB, pb);
          }
          continue;
        }
        toets(n + ': ' + soort + ' staat onder de meter (' + lopend.join(' + ') + ')', r && r[soort === 'rit-monitor' ? 'vrm' : 'vtp'], JSON.stringify(r));
        if (!r) continue;
        toets(n + ': boven de navigatiebalk', r.onder <= (vol ? r.h - SAB : Math.min(r.h - SAB, r.nav)), JSON.stringify(r));
        if (!vol) continue;
        if (p === 'hyperlane') {
          toets(n + ': boven de tanklichtbalk', r.tank !== null && r.onder <= r.tank, JSON.stringify(r));
          if (soort === 'rit-monitor') toets(n + ': en niet over het middengetal', r.mid !== null && r.boven >= r.mid, JSON.stringify(r));
        } else if (soort === 'rit-monitor') toets(n + ': de meter krimpt er niet voor niets voor', r.pas >= 0.95, JSON.stringify(r));
      }
    };
    const situatie = (aan) => app.ev(`if(situatieActief().some(function(x){ return x.id==='caravan'; }) !== ${aan}) toggleSituatie('caravan'); true`);
    await situatie(false);
    await rondje('4. Rit-monitor, bulk-recorder en waakronde tegelijk', ['monitor', 'bulk', 'waak'], 'rit-monitor');
    await situatie(true);
    await rondje('5. Caravanrit, bulk-recorder en waakronde tegelijk', ['caravan', 'bulk', 'waak'], 'trekpaneel');

    console.log('\n6. Rit-monitor en caravanrit nooit tegelijk');
    await zet(['monitor']); await W(1500);
    let st = await app.ev(`JSON.stringify({ monitor:!!(PLRun.staat().monitor||{}).aan, caravan:!!(PLRun.staat().caravan||{}).aan })`);
    toets('beginstand: rit-monitor aan, geen caravanrit', st === '{"monitor":true,"caravan":false}', st);
    await app.ev(`PLRun.schakel('caravan'); true`); await W(2500);
    st = await app.ev(`JSON.stringify({ monitor:!!(PLRun.staat().monitor||{}).aan, caravan:!!(PLRun.staat().caravan||{}).aan })`);
    toets('de caravanrit start en zet de rit-monitor uit', st === '{"monitor":false,"caravan":true}', st);
    await app.ev(`PLRun.schakel('monitor'); true`); await W(1500);
    st = await app.ev(`JSON.stringify({ monitor:!!(PLRun.staat().monitor||{}).aan, caravan:!!(PLRun.staat().caravan||{}).aan, ring:!!document.querySelector('.vis .vrm') })`);
    toets('tijdens de caravanrit gaat de rit-monitor niet aan', st === '{"monitor":false,"caravan":true,"ring":false}', st);
    await zet([]);
    await situatie(false);
    await app.ev(`PLVisThema.uit(); localStorage.setItem('pl_vis_profiel','basis'); true`);

    // 20-11-2026: het volle paneel alleen in Slim visueel; elders de rit-pil.
    console.log('\n7. Buiten Slim visueel: geen paneel, wel de rit-pil');
    // Geen _ritPilTick() hier: de pil hoort met de tik van één seconde te komen.
    const buiten = () => app.ev(`(function(){
      const zicht=function(e){ return !!e && getComputedStyle(e).display!=='none' && e.getBoundingClientRect().height>0; };
      const p=document.getElementById('ritPil'), r=p ? p.getBoundingClientRect() : null;
      return { view:pidViewMode, pil:zicht(p), tekst:p ? p.textContent : '', paneel:[...document.querySelectorAll('.vtp, .vrm')].some(zicht),
               chip:zicht(document.getElementById('monChipFab')), onder:r ? Math.round(r.bottom) : null, h:innerHeight,
               venster:document.getElementById('monVenster').classList.contains('open') }; })()`);
    await app.ev(`setPidView('overzicht'); true`);
    await situatie(true); await W(2500);
    let b = await buiten();
    toets('caravanrit in Overzicht: de pil staat er, het trekpaneel niet', b.pil && /Caravanrit/.test(b.tekst) && !b.paneel, JSON.stringify(b));
    toets('de pil staat boven de navigatiebalk', b.onder !== null && b.onder <= b.h - SAB, JSON.stringify(b));
    await app.ev(`setPidView('visueel'); true`); await W(1800);
    b = await buiten();
    toets('in Slim visueel geen pil: daar staat het paneel', !b.pil && b.paneel, JSON.stringify(b));
    await situatie(false); await W(2500);
    await app.ev(`setPidView('overzicht'); openMonitorView(); true`);
    await app.ev(`ritMonitorKnop(); true`); await W(1800);
    b = await buiten();
    toets('rit-monitor aanzetten met de knop: naar Slim visueel, het venster dicht', b.view === 'visueel' && !b.venster, JSON.stringify(b));
    await app.ev(`setPidView('slim'); true`); await W(1800);
    b = await buiten();
    toets('zelf naar Slim: die keuze blijft, met de rit-pil en zonder de oude chip ernaast', b.view === 'slim' && b.pil && /Rit-monitor/.test(b.tekst) && !b.chip && !b.paneel, JSON.stringify(b));
    await app.ev(`openMonitorView(); ritMonitorKnop(); true`); await W(1800);
    b = await buiten();
    toets('uitzetten springt nergens heen, en de pil verdwijnt', b.view === 'slim' && !b.pil, JSON.stringify(b));
    await app.ev(`monVensterSluit(); true`);
    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally { await app.stop(); }
  console.log('\n' + (fouten ? 'bproef-volscherm: ' + fouten + ' FOUT' : 'bproef-volscherm: alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
