// bproef-hyperlane.js — Hyperlane in de echte app (27-10-2026)
//
// Wat test-hyperlane.js niet kan zien: of het profiel in Slim visueel echt
// opent, of de lus loopt en de ringen tekent met de waarden van de demo-auto,
// of de tunnel op het volle scherm het hele scherm vult, en of de lus stopt
// als je naar een andere weergave gaat (anders tekent hij in een leeg vak door
// en kost hij accu).
//
// Tegenproef: na een andere weergave moet PLHyperlane.actief() false zijn.
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
    await app.venster(915, 412);
    console.log('\n1. Hyperlane opent en tekent');
    await app.ev(`startDemoCar(0); true`);
    await new Promise(r => setTimeout(r, 1500));
    const r = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      const lo = document.getElementById('loginOv'); if (lo) lo.classList.add('hidden');
      const bb = document.getElementById('bronBanner'); if (bb) bb.style.display = 'none';
      document.getElementById('welcomeScreen').classList.add('hidden');
      sw('live', null);
      PLVisProfiel.bewaar('hyperlane');
      setPidView('visueel');
      await wacht(3500);   // voorbij de opstartzwaai, met waarden van de demo-auto
      const vak = () => document.querySelector('.gg.view-visueel .vpf-hyper');
      const r = { vak: !!vak(), profiel: PLVisueel.profiel(), actief: PLHyperlane.actief() };
      if (!vak()) return r;
      // Heeft de ring iets getekend? Tel de niet-lege pixels.
      const ring = vak().querySelector('.vhl-ring[data-ring="toeren"]');
      const c = ring.getContext('2d'), d = c.getImageData(0, 0, ring.width, ring.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      r.ringPx = ring.width; r.getekend = n / (d.length / 4);
      r.toeren = document.getElementById('vpf-w-toeren').textContent;
      r.koel = document.getElementById('vpf-w-koel').textContent;
      r.kleur = vak().style.getPropertyValue('--vhl-c');
      r.gl = vak().classList.contains('vhl-gl');
      r.scene = vak().getAttribute('data-scene');
      // De langste modustekst naast het versnellingslabel moet passen (liggend, 915 breed)
      const md = vak().querySelector('.vhl-modus'), gr = vak().querySelector('.vhl-gear');
      md.textContent = 'KOELWATER HEET'; gr.textContent = '5';
      r.modusPast = md.scrollWidth <= md.clientWidth + 1; r.modusMaat = md.scrollWidth + '/' + md.clientWidth;
      // De ronde schakellampjes (01-11-2026) blijven binnen het midden: met de
      // oude vaste maten (vóór 28-10) liepen ze 104 px breed over de ringen.
      vak().querySelectorAll('.vhl-leds i').forEach(i => { i.className = 'r'; });
      const lb = vak().querySelector('.vhl-leds').getBoundingClientRect(), mb = vak().querySelector('.vhl-mid').getBoundingClientRect();
      const raak = s => { const b = vak().querySelector(s).getBoundingClientRect(); return !(lb.right <= b.left || b.right <= lb.left || lb.bottom <= b.top || b.bottom <= lb.top); };
      r.ledsPassen = lb.width > 0 && lb.height >= 4 && lb.left >= mb.left - 1 && lb.right <= mb.right + 1 && !raak('.vhl-pod.l') && !raak('.vhl-pod.r');
      r.ledsMaat = Math.round(lb.width) + '×' + Math.round(lb.height) + ' in ' + Math.round(mb.width);
      r.ledsRond = getComputedStyle(vak().querySelector('.vhl-leds i')).borderRadius === '50%';
      // Het midden wisselen: knopje en tik op het getal, onthouden in pl_hl_midden
      localStorage.removeItem('pl_hl_midden');
      const km = vak().querySelector('.vhl-midden'), kh = vak().querySelector('.vhl-held');
      await wacht(300); r.midden0 = km.textContent;
      // Wachten op de tekst, niet op de klok: de lus zet hem in zijn eerstvolgende ronde (hoogstens 2 s; op een belaste CI-machine ruimer: 6 s, #657)
      const tot = async t => { for (let i = 0; i < 60 && km.textContent !== t; i++) await wacht(100); return km.textContent; };
      km.click(); r.midden1 = await tot('Versnelling'); r.middenOpslag = localStorage.getItem('pl_hl_midden');
      kh.click(); r.midden2 = await tot('Slim');
      // De stand (01-11-2026): tik op het label, kies Sport. De weergave bouwt
      // opnieuw met de strook van Sport; daarna terug naar Auto.
      const strook = () => vak() ? Array.from(vak().querySelectorAll('.vhl-strook > div')).map(d => d.id.slice(6)).join(',') : '';
      const totS = async t => { for (let i = 0; i < 60 && strook() !== t; i++) await wacht(100); return strook(); };
      r.stand0 = strook();
      vak().querySelector('.vhl-modus').click();
      r.menuOpen = !vak().querySelector('.vhl-standmenu').hidden;
      vak().querySelector('.vhl-standmenu [data-stand="sport"]').click();
      r.standSport = await totS('olie,inlaat,last'); r.standOpslag = localStorage.getItem('pl_hl_stand');
      for (let i = 0; i < 60 && vak().querySelector('.vhl-modus').textContent !== 'SPORT'; i++) await wacht(100);
      r.labelSport = vak().querySelector('.vhl-modus').textContent + ' (' + vak().getAttribute('data-scene') + ')';
      r.lusNaStand = PLHyperlane.actief();
      vak().querySelector('.vhl-modus').click(); vak().querySelector('.vhl-standmenu [data-stand="auto"]').click();
      r.standAuto = await totS('koel,gas,accu');
      // Volledig scherm: de tunnel vult het scherm.
      document.querySelector('.gg.view-visueel .vt-vol').click();
      // De canvas wordt in de eerstvolgende frame vergroot; op een trage CI-machine
      // valt die na 400 ms (28-10-2026). Wachten op de maat, niet op de klok — hoogstens 3 s.
      for (let i = 0; i < 30 && vak().querySelector('.vhl-bg').width < innerWidth; i++) await wacht(100);
      const b = vak().getBoundingClientRect();
      r.dekt = b.left <= 0 && b.top <= 0 && b.width >= innerWidth - 1 && b.height >= innerHeight - 1;
      r.bgVol = vak().querySelector('.vhl-bg').width >= innerWidth;
      r.knopBoven = !!document.elementFromPoint(innerWidth - 30, 30).closest('.vt-knoppen');
      appBack(); await wacht(200);
      setPidView('overzicht'); await wacht(300);
      r.stoptNaWissel = !PLHyperlane.actief();
      return r;
    })()`);
    toets('het profiel Hyperlane opent in Slim visueel', r.vak && r.profiel === 'hyperlane', JSON.stringify(r));
    toets('de lus loopt', r.actief, JSON.stringify(r));
    toets('de toerenring is getekend (meer dan 5% van de pixels)', r.getekend > 0.05, JSON.stringify(r));
    toets('de demo-auto vult toeren en koelwater', r.toeren && r.toeren !== '—' && r.koel && r.koel !== '—', JSON.stringify(r));
    toets('de kleur staat op het vak', /^rgb\(/.test(r.kleur || ''), JSON.stringify(r));
    toets('de langste modustekst past naast het versnellingslabel', r.modusPast, r.modusMaat);
    toets('het knopje wisselt het midden naar Versnelling en onthoudt dat; een tik op het getal wisselt terug',
      r.midden0 === 'Slim' && r.midden1 === 'Versnelling' && r.middenOpslag === 'versnelling' && r.midden2 === 'Slim', [r.midden0, r.midden1, r.middenOpslag, r.midden2].join(' → '));
    toets('schakellampjes: tien ronde lampjes, binnen het midden, zonder de ringen te raken', r.ledsPassen && r.ledsRond, r.ledsMaat);
    toets('de stand: tik op het label opent het menu, Sport geeft olie · inlaat · belasting, het label houdt SPORT vast, Auto zet het terug',
      r.stand0 === 'koel,gas,accu' && r.menuOpen && r.standSport === 'olie,inlaat,last' && r.standOpslag === 'sport' && /^SPORT/.test(r.labelSport) && r.lusNaStand && r.standAuto === 'koel,gas,accu',
      [r.stand0, r.menuOpen, r.standSport, r.standOpslag, r.labelSport, r.lusNaStand, r.standAuto].join(' → '));
    toets('de lus kiest een scène', ['rijden', 'stil', 'cruise', 'koud', 'remmen', 'launch', 'begrenzer', 'alarm'].indexOf(r.scene) >= 0, JSON.stringify(r));
    if (!r.gl) console.log('  LET OP  geen WebGL in deze browser: de tunnel is hier het CSS-verloop');
    console.log('\n2. Volledig scherm');
    toets('de tunnel vult het hele scherm', r.dekt && r.bgVol, JSON.stringify(r));
    toets('de knoppen liggen erboven', r.knopBoven, JSON.stringify(r));
    // Staand op volledig scherm (28-10-2026, uit de auto: de snelheidsring liep
    // onder de tanklichtbalk door en van het scherm af). Drie verhoudingen.
    for (const [bw, bh] of [[400, 780], [412, 915], [360, 640]]) {
      await app.venster(bw, bh);
      const p = await app.ev(`(async function(){
        const wacht = ms => new Promise(r => setTimeout(r, ms));
        setPidView('visueel'); await wacht(500);
        document.querySelector('.gg.view-visueel .vt-vol').click(); await wacht(700);
        const v = document.querySelector('.gg.view-visueel .vpf-hyper');
        const t = v.querySelector('[data-ring="toeren"]').getBoundingClientRect(), s = v.querySelector('[data-ring="snel"]').getBoundingClientRect();
        const tank = v.querySelector('.vhl-tank'), tk = tank.getBoundingClientRect(), tz = getComputedStyle(tank).display !== 'none';
        const m = v.querySelector('.vhl-mid').getBoundingClientRect();
        const r = { binnen: t.top >= 0 && s.bottom <= innerHeight + 1, vrij: !tz || s.bottom <= tk.top + 1,
                    geenOverlap: t.bottom <= m.top + 1 && m.bottom <= s.top + 1, maat: [Math.round(t.top), Math.round(t.bottom), Math.round(m.top), Math.round(m.bottom), Math.round(s.top), Math.round(s.bottom), Math.round(tk.top), innerHeight].join('/') };
        appBack(); await wacht(200);
        return r;
      })()`);
      toets('staand ' + bw + '×' + bh + ': ringen binnen het scherm, niet onder de tanklichtbalk, niet over het midden', p.binnen && p.vrij && p.geenOverlap, p.maat);
    }
    // Het ritoverzicht (28-10-2026): niet bij elk stoplicht, wel na een mooie run; 🏁 en een tik
    await app.venster(915, 412);
    const sb = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      setPidView('overzicht'); await wacht(200); setPidView('visueel'); await wacht(800);
      // Het vak kan tussendoor herbouwd worden: elke keer opnieuw opzoeken
      const v = () => document.querySelector('.gg.view-visueel .vpf-hyper'), el = () => v().querySelector('.vhl-score'), aan = () => el().classList.contains('aan');
      const echt = PLHyperlane.zet; PLHyperlane.zet = function () {};   // de demo-auto even buiten de deur
      // Stilstand zoals een auto hem geeft: elke 0,2 s snelheid 0 (een herbouw van het vak begint met lege waarden)
      const stil = setInterval(function () { echt('snel', 0, 'ok', false); }, 200);
      try {
        localStorage.removeItem(PLHyperlane.RUNS_SLEUTEL);
        const nu = performance.now() / 1000;
        PLHyperlane._zetRun({ t: nu, tv: nu, km: 1, top: 50, maxT: 3000, rijS: 90, beste: null, kmV: 0, liter: 0 });
        // De lus telt stilstand in zijn eigen frames (hoogstens 0,05 s per frame): in een trage browser
        // duren 3 s stilstand langer. Wachten op de scène, niet op de klok — hoogstens 25 s.
        for (let i = 0; i < 125 && v().getAttribute('data-scene') !== 'stil'; i++) await wacht(200);
        await wacht(600);
        const r = { stil: v().getAttribute('data-scene'), stad: aan() };
        PLHyperlane._zetRun({ t: nu, tv: nu, km: 6, top: 112, maxT: 4200, rijS: 300, beste: null, kmV: 0, liter: 0,
                              prof: { dt: 2, t: nu, pts: [0, 30, 60, 90, 112, 100, 80, 40, 0] } });
        for (let i = 0; i < 25 && !aan(); i++) await wacht(200);
        r.run = aan(); r.kop = (el().querySelector('.vhl-score-kop') || {}).textContent || '';
        r.graf = !!el().querySelector('.vhl-score-graf polyline'); r.bewaard = PLHyperlane.leesRuns().length;
        el().click(); await wacht(1500); r.dichtNaTik = !aan();
        v().querySelector('.vhl-ritknop').click();
        for (let i = 0; i < 25 && !aan(); i++) await wacht(200);
        r.hand = aan(); r.kopHand = (el().querySelector('.vhl-score-kop') || {}).textContent || '';
        v().querySelector('.vhl-ritknop').click(); await wacht(1500); r.dichtNaKnop = !aan();
        return r;
      } finally { clearInterval(stil); PLHyperlane.zet = echt; localStorage.removeItem(PLHyperlane.RUNS_SLEUTEL); }
    })()`);
    console.log('\n2b. Het ritoverzicht');
    toets('van stoplicht tot stoplicht (1 km, 90 s): geen bord', sb.stil === 'stil' && !sb.stad, JSON.stringify(sb));
    toets('na een mooie run (6 km, 5 min) wel, als RUN, met het verloop, en hij is bewaard voor de trend',
      sb.run && /^RUN/.test(sb.kop) && sb.graf && sb.bewaard === 1, JSON.stringify(sb));
    toets('een tik sluit het bord, en het komt niet vanzelf terug', sb.dichtNaTik, JSON.stringify(sb));
    toets('🏁 toont de hele rit, nog een keer 🏁 sluit hem', sb.hand && /^RIT/.test(sb.kopHand) && sb.dichtNaKnop, JSON.stringify(sb));
    // Schakellampjes en de pijl omhoog (31-10-2026): het ecopunt komt uit
    // PLBerekend (CA11), de lus zet de pijl. Toeren, gas en de versnelling
    // komen van de proef; de belastingpoort staat even open, want de
    // demo-auto schrijft 0104 en dat is hier niet de vraag.
    const sp = await app.ev(`(async function(){
      const wacht = ms => new Promise(r => setTimeout(r, ms));
      setPidView('overzicht'); await wacht(200); setPidView('visueel'); await wacht(800);
      const v = () => document.querySelector('.gg.view-visueel .vpf-hyper');
      const echt = PLHyperlane.zet, bron = PLBerekend.schakelBron, maxB = PLBerekend.SCHAKEL.maxBelasting;
      let tpm = 3000;
      PLHyperlane.zet = function () {};
      const voed = setInterval(function () { echt('toeren', tpm, 'ok', false); echt('snel', 60, 'ok', false); echt('gas', 20, 'ok', false); }, 100);
      PLBerekend.SCHAKEL.maxBelasting = 101;
      try {
        let ratios = { 3: 19.6, 4: 25.8 };
        PLBerekend.schakelBron = function () { return { gear: 3, ratios: ratios, diesel: false }; };
        const pijl = () => { const e = v().querySelector('.vhl-pijl'); return !!e && e.classList.contains('aan') && getComputedStyle(e).display !== 'none'; };
        const lampjes = () => [].filter.call(v().querySelectorAll('.vhl-leds i'), function (i) { return i.className !== ''; }).length;
        const tot = async (f, w) => { for (let i = 0; i < 60 && f() !== w; i++) await wacht(100); return f(); };
        const r = { pijl3000: await tot(pijl, true) };
        tpm = 2000;
        r.pijl2000 = await tot(pijl, false);
        r.lampjes2000 = await tot(function () { return lampjes() > 0; }, true) ? lampjes() : 0;
        ratios = { 3: 19.6 }; tpm = 3000;              // de 3e is de hoogste: geen pijl, ook niet boven het ecopunt
        r.pijlTop = await tot(pijl, false);
        return r;
      } finally { clearInterval(voed); PLHyperlane.zet = echt; PLBerekend.schakelBron = bron; PLBerekend.SCHAKEL.maxBelasting = maxB; }
    })()`);
    console.log('\n2c. Schakellampjes en de pijl omhoog');
    toets('3000 tpm in de 3e, rustig: de pijl omhoog staat er', sp.pijl3000, JSON.stringify(sp));
    toets('2000 tpm: geen pijl, maar de lampjes lopen al op naar het schakelpunt', !sp.pijl2000 && sp.lampjes2000 > 0, JSON.stringify(sp));
    toets('in de hoogste versnelling geen pijl', !sp.pijlTop, JSON.stringify(sp));
    // De Hyperlane-schil om Temperatuur en Emissie (28-10-2026)
    for (const [pr, bw, bh] of [['temp', 915, 412], ['emissie', 412, 915], ['telemetrie', 915, 412], ['basis', 412, 915]]) {
      await app.venster(bw, bh);
      const q = await app.ev(`(async function(){
        const wacht = ms => new Promise(r => setTimeout(r, ms));
        // Tel de voeding van de schil: zonder toeren en gas staat de kleur stil op rustig
        if (!PLHyperlane._echtVoed) { PLHyperlane._echtVoed = PLHyperlane.voed; }
        let gevoed = 0; PLHyperlane.voed = function () { gevoed++; return PLHyperlane._echtVoed.apply(this, arguments); };
        PLVisProfiel.bewaar('${pr}'); setPidView('overzicht'); await wacht(200); setPidView('visueel'); await wacht(500);
        document.querySelector('.gg.view-visueel .vt-vol').click(); await wacht(3500);   // voorbij de opstartzwaai (2,2 s), die geeft zelf stemming
        const v = document.querySelector('.gg.view-visueel .vhl-schil, .gg.view-visueel .vhl-basis');
        const rect = e => e ? e.getBoundingClientRect() : null, raak = (a, b) => a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        const lamp = rect(document.querySelector('.gg.view-visueel .vis-lampen')), vorm = rect(v && v.querySelector('.vhl-vorm')), knop = rect(document.querySelector('.gg.view-visueel .vt-knoppen'));
        const b = v ? v.getBoundingClientRect() : null;
        const r = { schil: !!v, actief: PLHyperlane.actief(), kleur: v ? v.style.getPropertyValue('--vhl-c') : '', gevoed: gevoed,
                    vult: !!b && b.width >= innerWidth - 1 && b.height >= innerHeight - 1,
                    palet: getComputedStyle(document.querySelector('.gg.view-visueel .vt-thema')).display, vrij: !raak(lamp, vorm) && !raak(lamp, knop) };
        // Geen lege balk (28-10-2026): de demo-auto heeft geen katalysator, die plek krijgt de reserve.
        // Tegenproef op het aanzetten: de reserve (hier de motorbelasting, die de demo-auto al aan had)
        // even uit, dan opnieuw bouwen: Slim visueel moet hem zelf weer aanzetten (reserveKetens).
        r.leeg = [];
        if ('${pr}' === 'temp') {
          activePIDs.delete('0104'); PLVisueel.bouw(document.querySelector('.gg.view-visueel'), 'test'); await wacht(2500);
          r.leeg = [...document.querySelectorAll('.gg.view-visueel [id^="vpf-w-"]')].filter(e => e.textContent.trim() === '—').map(e => e.id)
            .concat(activePIDs.has('0104') ? [] : ['0104 niet aangezet']);
        }
        appBack(); await wacht(200);
        return r;
      })()`);
      toets('schil ' + pr + ' ' + bw + '×' + bh + ': achtergrond loopt, kleur volgt het rijgedrag, vult het scherm, geen palet, chips raken de knoppen niet',
        // Gevoed = PLHyperlane.voed() werd aangeroepen met de waarden van de demo-auto. Niet de
        // kleur of de stemming meten: een merkpalet kleurt ook zonder voeding anders, en de
        // opstartzwaai zakt in een trage browser zo langzaam uit dat hij op stemming lijkt.
        q.schil && q.actief && /^rgb/.test(q.kleur) && q.gevoed > 0 && q.vult && q.palet === 'none' && q.vrij, JSON.stringify(q));
      if (pr === 'temp') toets('temperatuur: geen lege balk, een ontbrekende sensor krijgt iets verwants', q.leeg.length === 0, JSON.stringify(q.leeg));
    }
    console.log('\n3. Weg uit de weergave');
    toets('een andere weergave stopt de lus (geen accuverbruik in een leeg vak)', r.stoptNaWissel, JSON.stringify(r));

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app) await app.stop();
  }
  console.log(fouten === 0 ? '\nbproef-hyperlane: alles goed' : '\nbproef-hyperlane: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
