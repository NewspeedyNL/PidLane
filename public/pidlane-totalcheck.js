// ══════════════════════════════════════════════════════════════════
// pidlane-totalcheck.js
// Total Check
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════
// TOTAALCHECK — stilstaand en rijdend, verdiepen waar iets afwijkt (20-10-2026)
// ════════════════════════════════════════
// De check uit week 1 was een vragenlijst (koude start, olie, geluiden: ja,
// soms, nee) en daarna een momentopname van elke sensor, met een rijtest van
// vijf fases van twee minuten als je onder belasting wilde meten. De vragen
// voegden niets toe dat de meting niet zelf zag, en de fases kostten tien
// minuten aan een route die de klant moest volgen.
//
// Nu twee delen, elk in zijn eigen toestand:
//   🅿️ STILSTAND  het verzamelscherm (PLVerzamel) op niveau 'normaal', daarna
//                 foutcodes en zelftests (PLFoutcodes.leesStil: 03/07/0A en
//                 de readiness uit 0101);
//   🚗 RIJDEN     hetzelfde scherm op niveau 'rit', zonder rijtest-knop: de
//                 klant rijdt gewoon weg en het scherm stopt vanzelf zodra de
//                 poort van §16 genoeg rijtijd ziet. Geen fases, geen route.
// Elk deel wordt beoordeeld op alleen zijn eigen monsters: deelHist() splitst
// de reeksen op de snelheid op dat moment, met de grens van de meetpoort
// (MEET_RIJ_KMH). Zo is 13,1 V stilstaand iets anders dan 13,1 V rijdend, en
// zegt de uitslag dat ook.
//
// VERDIEPEN ALLEEN WAAR IETS AFWIJKT. De uitslag is per categorie. Een
// categorie die klopt blijft dicht; een met een afwijking gaat open en krijgt
// een focusmeting: alleen de sensoren van die categorie aan (dus vaker per
// seconde gemeten), in de toestand waarin de afwijking zat, en daarna een
// AI-vraag over alleen die categorie.
//
// WAT ANDERE APPS DOEN (20-10-2026). FIXD en BlueDriver lezen foutcodes,
// readiness en freeze frame en leggen de code uit; live data is een grafiek
// die de klant zelf moet lezen. Geen van beide oordeelt over live waarden per
// toestand. Dat is hier het verschil: oordeel per sensor over het hele
// venster (PLVerzamel.beoordeel), de samenhang van een monteur (PLSamenhang),
// stilstand en rijden apart, en niet-gemeten heet nooit goed.
//
// De kern (PLTotaal) is puur; test-totaalcheck.js laadt hem uit dit bestand.
// ── PLTotaal kern begin ──
window.PLTotaal = (function () {
  'use strict';
  const RANG = { afwijkend: 0, let: 1, meetfout: 2, twijfel: 3, ok: 4, nodata: 5 };
  const getal = v => typeof v === 'number' && isFinite(v);

  /* De reeksen van één deel: 'stil' of 'rij'. Per monster telt de snelheid
     die het dichtst bij lag, mits binnen gatMs; verder weg weet je het niet
     en telt het monster in geen van beide. Levert het voertuig geen snelheid,
     dan is er niets te splitsen en krijgt het deel alles (zonderSnelheid). */
  function deelHist(hist, soort, kmh, gatMs) {
    const h = hist || {};
    const sp = (h['010D'] || []).filter(m => m && getal(m.t) && getal(m.v)).sort((a, b) => a.t - b.t);
    if (!sp.length) return { hist: Object.assign({}, h), zonderSnelheid: true };
    const snelheidOp = t => {
      let lo = 0, hi = sp.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sp[mid].t < t) lo = mid + 1; else hi = mid; }
      let best = sp[lo];
      if (lo > 0 && Math.abs(sp[lo - 1].t - t) < Math.abs(best.t - t)) best = sp[lo - 1];
      return Math.abs(best.t - t) <= gatMs ? best.v : null;
    };
    const uit = {};
    Object.keys(h).forEach(pid => {
      const r = (h[pid] || []).filter(m => {
        if (!m || !getal(m.t)) return false;
        const v = snelheidOp(m.t);
        if (v === null) return false;
        return soort === 'rij' ? v > kmh : v <= kmh;
      });
      if (r.length) uit[pid] = r;
    });
    return { hist: uit, zonderSnelheid: false };
  }

  const erger = (a, b) => (RANG[a] <= RANG[b] ? a : b);

  /* De uitslag per categorie. delen = {stil: sam|null, rij: sam|null} (een
     samenvatting van PLVerzamel), dtc = {licht:{kleur,kop,tekst}} of null,
     catVan(pid) = de categorie uit de PID-definitie, volgorde = CHK_CAT_ORDER.
     focus: er zit een afwijking in (afwijkend of let op) — alleen die
     categorieën gaan open en krijgen een focusmeting. */
  function categorieen(delen, dtc, catVan, volgorde) {
    const d = delen || {}, per = {};
    ['stil', 'rij'].forEach(soort => {
      const sam = d[soort];
      ((sam && sam.rijen) || []).forEach(r => {
        if (!r || r.oordeel === 'nodata' || !r.n) return;
        const cat = (catVan && catVan(r.pid)) || 'Overig';
        const c = per[cat] || (per[cat] = { cat, pids: {} });
        const p = c.pids[r.pid] || (c.pids[r.pid] = { pid: r.pid, naam: r.naam, eenheid: r.eenheid, stil: null, rij: null, oordeel: 'ok' });
        p[soort] = r;
        p.oordeel = erger(p.oordeel, r.oordeel);
      });
    });
    const lijst = Object.keys(per).map(k => {
      const c = per[k];
      const pids = Object.keys(c.pids).map(p => c.pids[p])
        .sort((x, y) => (RANG[x.oordeel] - RANG[y.oordeel]) || String(x.naam).localeCompare(String(y.naam)));
      const oordeel = pids.reduce((a, p) => erger(a, p.oordeel), 'ok');
      return { cat: k, pids, oordeel, focus: oordeel === 'afwijkend' || oordeel === 'let', open: oordeel !== 'ok' };
    });
    if (dtc && dtc.licht) {
      const o = { rood: 'afwijkend', oranje: 'let', groen: 'ok' }[dtc.licht.kleur] || 'nodata';
      // Een code is geen meting om te herhalen: hij gaat open, maar de
      // verdieping is het foutcodescherm, geen focusmeting.
      lijst.push({ cat: 'Foutcodes', pids: [], oordeel: o, focus: false, open: o !== 'ok', dtc: dtc });
    }
    const pos = c => { const i = (volgorde || []).indexOf(c.cat); return i < 0 ? 999 : i; };
    return lijst.sort((a, b) => ((a.open ? 0 : 1) - (b.open ? 0 : 1)) || (RANG[a.oordeel] - RANG[b.oordeel]) || (pos(a) - pos(b)));
  }

  /* Wat een focusmeting meet: de sensoren van de categorie, de afwijkende
     eerst, hoogstens `max`. Rijdend als de afwijking alleen rijdend zat —
     anders zou de focus meten in een toestand waarin er niets te zien was. */
  function focusPlan(c, max) {
    const pids = (c && c.pids) || [];
    const af = p => p.oordeel === 'afwijkend' || p.oordeel === 'let';
    const afStil = p => p.stil && (p.stil.oordeel === 'afwijkend' || p.stil.oordeel === 'let');
    const afw = pids.filter(af);
    return {
      pids: afw.concat(pids.filter(p => !af(p))).slice(0, max || 8).map(p => p.pid),
      rijden: afw.length > 0 && afw.every(p => !afStil(p) && p.rij)
    };
  }

  /* Waar staat de check? Geen enkel deel gemeten = geen AI-rapport: dan is er
     niets om over te oordelen, en de AI zou het uit losse pidVals halen. */
  function stand(st) {
    const s = st || {};
    const stil = !!(s.stil && s.stil.sam), rij = !!(s.rij && s.rij.sam);
    return { stil, rij, aiMag: stil || rij, volgende: !stil ? 'stil' : (!rij ? 'rij' : 'klaar') };
  }

  /* Wat de AI krijgt. blok(sam, meta) is PLVerzamel.promptBlok. Een deel dat
     niet gemeten is, staat er als niet gemeten in — nooit als goed. */
  function promptBlok(st, cats, blok) {
    const s = st || {};
    let t = '';
    const deel = (k, titel, uitleg) => {
      const x = s[k];
      if (!x || !x.sam) { t += '\n\n' + titel + ': NIET GEMETEN. ' + uitleg; return; }
      t += '\n\n' + titel + (x.zonderSnelheid ? ' (dit voertuig geeft geen snelheid; het deel is niet op stilstand en rijden gesplitst)' : '') + ':' +
           (blok ? blok(x.sam, { sec: x.sec, rijSec: x.rijSec }) : '');
    };
    deel('stil', 'DEEL 1 — STILSTAND (alleen monsters met het voertuig stil)', 'Doe geen uitspraak over stationair gedrag.');
    deel('rij', 'DEEL 2 — RIJDEND (alleen monsters boven de rijgrens)', 'Doe geen uitspraak over gedrag onder belasting: laadspanning, brandstoftrim bij kruissnelheid, inlaatdruk en temperatuur onder belasting zijn dan niet beoordeeld.');
    const af = (cats || []).filter(c => c.focus);
    t += '\n\nCATEGORIEËN MET EEN AFWIJKING: ' + (af.length ? af.map(c => c.cat + ' (' + c.pids.filter(p => p.oordeel === 'afwijkend' || p.oordeel === 'let').map(p => p.naam).join(', ') + ')').join('; ') : 'geen');
    const f = s.dtc;
    if (f && f.licht) t += '\nFOUTCODES EN ZELFTESTS: ' + f.licht.kop + (f.licht.tekst ? ' — ' + f.licht.tekst : '') + (f.tekst ? '\n' + f.tekst : '');
    else t += '\nFOUTCODES EN ZELFTESTS: niet uitgelezen in deze check.';
    return t;
  }

  /* Beide delen als één meting voor het analyserapport: per sensor de
     monsters van allebei, op tijd, zonder dubbele. Plus de duur en wat er
     ontbreekt. Puur. */
  function rapportMeting(st) {
    const s = st || {}, hist = {};
    ['stil', 'rij'].forEach(k => {
      const h = (s[k] && s[k].hist) || {};
      Object.keys(h).forEach(p => { hist[p] = (hist[p] || []).concat(h[p] || []); });
    });
    let t0 = Infinity, t1 = -Infinity;
    Object.keys(hist).forEach(p => {
      const gezien = {};
      hist[p] = hist[p].filter(m => m && getal(m.t) && !gezien[m.t] && (gezien[m.t] = true)).sort((a, b) => a.t - b.t);
      if (hist[p].length) { t0 = Math.min(t0, hist[p][0].t); t1 = Math.max(t1, hist[p][hist[p].length - 1].t); }
    });
    const ontbreekt = [];
    if (!(s.stil && s.stil.sam)) ontbreekt.push('stilstand niet gemeten');
    if (!(s.rij && s.rij.sam)) ontbreekt.push('rijden niet gemeten');
    return { hist, sec: t1 > t0 ? Math.round((t1 - t0) / 1000) : 0,
             rijSec: (s.rij && getal(s.rij.rijSec)) ? s.rij.rijSec : 0, beperkt: ontbreekt.join('; ') };
  }

  return { RANG, deelHist, categorieen, focusPlan, stand, promptBlok, rapportMeting };
})();
// ── PLTotaal kern eind ──

// ── ONDERDELEN-KEUZE (modal) ────────────────────────────────────────
// Laat de gebruiker vóór een langdurige analyse kiezen: compleet (alles aan)
// of een selectie. Belooft de gekozen keys, of null bij annuleren. De
// ritanalyse gebruikt hem voor zijn fases.
// → CHK_CAT_META verplaatst naar pidlane-data.js
// → CHK_CAT_ORDER verplaatst naar pidlane-data.js
function pickOnderdelen(title, options){
  return new Promise(resolve=>{
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:20px';
    const rows=options.map(o=>`
      <label style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--bd);border-radius:9px;margin-bottom:6px;cursor:pointer">
        <input type="checkbox" data-k="${o.key}" checked style="width:18px;height:18px;accent-color:var(--bl)">
        <span style="font-size:18px;width:22px;text-align:center">${o.icon||'•'}</span>
        <span style="flex:1;font-size:14px;font-weight:600">${o.label}</span>
        ${o.sub?`<span style="font-size:12px;color:var(--tx3)">${o.sub}</span>`:''}
      </label>`).join('');
    ov.innerHTML=`<div style="background:var(--sur);border:1px solid var(--bd);border-radius:14px;padding:18px;max-width:360px;width:100%;max-height:86vh;overflow:auto">
      <div style="font-weight:800;font-size:15px;margin-bottom:4px">${title}</div>
      <div style="font-size:12px;color:var(--tx3);margin-bottom:12px">Laat alles aan voor een complete analyse, of kies zelf de onderdelen.</div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button id="poAll" class="mbtn s" style="flex:1;font-size:12px;padding:6px">Alles aan</button>
        <button id="poNone" class="mbtn s" style="flex:1;font-size:12px;padding:6px">Alles uit</button>
      </div>
      <div id="poList">${rows}</div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button id="poCancel" class="mbtn s" style="flex:1">Annuleren</button>
        <button id="poRun" class="mbtn p" style="flex:2">▶ Uitvoeren</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    const boxes=()=>[...ov.querySelectorAll('input[type=checkbox]')];
    const runBtn=ov.querySelector('#poRun');
    const sync=()=>{ const n=boxes().filter(b=>b.checked).length;
      runBtn.disabled=(n===0);
      runBtn.textContent = n===0?'Kies minstens 1' : (n===options.length?'▶ Compleet uitvoeren':`▶ Uitvoeren (${n})`);
    };
    boxes().forEach(b=>b.onchange=sync);
    ov.querySelector('#poAll').onclick=()=>{boxes().forEach(b=>b.checked=true);sync();};
    ov.querySelector('#poNone').onclick=()=>{boxes().forEach(b=>b.checked=false);sync();};
    const close=v=>{ ov.remove(); resolve(v); };
    ov.querySelector('#poCancel').onclick=()=>close(null);
    runBtn.onclick=()=>close(boxes().filter(b=>b.checked).map(b=>b.dataset.k));
    ov.onclick=e=>{ if(e.target===ov) close(null); };
    sync();
  });
}

// ── Het scherm ───────────────────────────────────────────────────────
// _tc: {stil, rij: {sam, sec, rijSec, ts, zonderSnelheid}, dtc, focus:{cat→{sam, ts, rijden}}}
let _tc = { stil: null, rij: null, dtc: null, focus: {} };
let _tcBezig = '';

function _tcDeel(uit, soort){
  const V = window._plVerzameld || {};
  const d = PLTotaal.deelHist(V.hist || {}, soort, MEET_RIJ_KMH, MEET_RIJ_GAT_MS);
  return { sam: PLVerzamel.vanBron({ hist: d.hist }), hist: d.hist, sec: uit.sec, rijSec: uit.rijSec, ts: Date.now(), zonderSnelheid: d.zonderSnelheid };
}

// Deel 1: stilstaand meten, dan foutcodes en zelftests.
async function runTotalCheck(){
  if(_tcBezig) return;
  const uit=await PLVerzamel.meet({niveau:'normaal', profiel:'totaal', watVoor:'het stilstanddeel van de totaalcheck', ai:false, ritBron:false, rijtest:false});
  if(!uit || !uit.door) return;
  window._didTotalCheck=true;
  _tc.stil=_tcDeel(uit,'stil'); _tc.focus={};
  _tcBezig='Foutcodes en zelftests uitlezen…'; tcTeken();
  try{
    if(window.PLFoutcodes && typeof PLFoutcodes.leesStil==='function'){
      const s=await PLFoutcodes.leesStil();
      _tc.dtc={ licht:PLFoutcodes.stoplicht(s), rd:PLFoutcodes.oordeelReadiness(s.readiness, s.sinds), scan:s,
                tekst:(typeof PLFoutcodes.alsTekst==='function'?PLFoutcodes.alsTekst(s):'') };
    }
  }catch(e){
    console.warn('Totaalcheck: foutcodes niet uitgelezen', e);
    log('Totaalcheck: foutcodes niet uitgelezen ('+((e&&e.message)||e)+') — de uitslag zegt dat erbij','warn');
    _tc.dtc=null;
  }finally{ _tcBezig=''; }
  tcTeken();
}
// Deel 2: gewoon rijden. Het scherm wacht tot er genoeg rijtijd is, hoogstens
// een kwartier: wie nog moet instappen en wegrijden heeft die tijd nodig.
async function runTotalCheckRij(){
  if(_tcBezig) return;
  const uit=await PLVerzamel.meet({niveau:'rit', profiel:'totaal', watVoor:'het rijdeel van de totaalcheck', ai:false, rijtest:false, maxMs:15*60*1000});
  if(!uit || !uit.door) return;
  window._didTotalCheck=true;
  _tc.rij=_tcDeel(uit,'rij'); _tc.focus={};
  tcTeken();
}
function _tcCats(){
  return PLTotaal.categorieen({stil:_tc.stil&&_tc.stil.sam, rij:_tc.rij&&_tc.rij.sam}, _tc.dtc,
    pid=>(getPidDef(pid)||{}).cat, CHK_CAT_ORDER);
}
// Verdiepen: alleen de sensoren van deze categorie, dus vaker gemeten.
async function tcFocus(cat){
  if(_tcBezig) return;
  const c=_tcCats().find(x=>x.cat===cat); if(!c||!c.focus) return;
  const plan=PLTotaal.focusPlan(c);
  await ensurePIDListActive(plan.pids);
  const m=CHK_CAT_META[cat]||{l:cat};
  const uit=await PLVerzamel.meet({niveau:plan.rijden?'kortrit':'snel', profiel:false, ritBron:false, rijtest:false, ai:false,
    watVoor:'de focusmeting '+m.l.toLowerCase()+' ('+(plan.rijden?'rijdend':'stilstaand')+')', maxMs:plan.rijden?10*60*1000:undefined});
  if(!uit || !uit.door) return;
  const d=_tcDeel(uit, plan.rijden?'rij':'stil');
  _tc.focus[cat]={sam:d.sam, ts:d.ts, rijden:plan.rijden, sec:uit.sec, rijSec:uit.rijSec};
  tcTeken();
}
async function tcFocusAI(cat){
  const c=_tcCats().find(x=>x.cat===cat), f=_tc.focus[cat];
  if(!c||!f) return;
  if(!(await preAnalysisCheck())) return;
  activateAIPane();
  const v=getVehicle(), m=CHK_CAT_META[cat]||{l:cat};
  const regels=c.pids.map(p=>'- '+p.naam+': '+_tcWaarde(p)+(p.oordeel!=='ok'?' — '+(p.stil&&p.stil.reden||p.rij&&p.rij.reden||p.oordeel):'')).join('\n');
  const prompt=`Je bent expert automonteur. De totaalcheck vond een afwijking in één systeem: ${m.l}. Onderzoek alleen dat systeem, in het Nederlands.\n\nVoertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''} ${v.brandstof?'('+v.brandstof+')':''}\n\nUIT DE TOTAALCHECK (stilstaand en rijdend apart):\n${regels}\n\nFOCUSMETING (${f.rijden?'rijdend':'stilstaand'}, alleen de sensoren van dit systeem, dus vaker gemeten):${PLVerzamel.promptBlok(f.sam,{sec:f.sec, rijSec:f.rijSec})}\n\nGeef in deze volgorde, zonder sterretjes of emoji: BEVINDING (koppel elk punt aan een gemeten waarde; zegt de focusmeting iets anders dan de check, noem dat), WAARSCHIJNLIJKE OORZAAK (tabel Diagnose | Kans | Vertrouwen), CONTROLE (concrete meet- of controlestappen), KOSTENINDICATIE (tabel Handeling | Indicatie in euro).\nSluit af met deze exacte zin op een nieuwe regel: ${RAPPORT_DISCLAIMER}`;
  // De dekking gaat over dit ene systeem, niet over het hele totaalprofiel:
  // anders hoort de AI dat er sensoren "ontbreken" die deze vraag nooit nodig had.
  await callAI(prompt,document.getElementById('aiContent'),{ vraag:'Totaalcheck — verdieping '+m.l+'.', pids:c.pids.map(p=>p.pid), zichtbaar:c.pids.map(p=>p.pid) });
}
function _tcWaarde(p){
  const r=x=>x?(x.min===x.max?fv(x.min):fv(x.min)+'–'+fv(x.max))+' '+(p.eenheid||''):null;
  const s=r(p.stil), j=r(p.rij);
  return [s?'stil '+s:'', j?'rijdend '+j:''].filter(Boolean).join(' · ');
}
const _TC_KLS={afwijkend:'bad', let:'warn', meetfout:'warn', twijfel:'warn', ok:'ok', nodata:''};
const _TC_LBL={afwijkend:'🔴 Afwijkend', let:'⚠️ Let op', meetfout:'⚠️ Meetfout', twijfel:'⚠️ Twijfel', ok:'✅ Goed', nodata:'⚪ Niet gelezen'};
function _tcEsc(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _tcTijd(ts){ return ts?new Date(ts).toLocaleTimeString('nl',{hour:'2-digit',minute:'2-digit'}):''; }
function _tcStapHtml(soort){
  const x=_tc[soort], stil=soort==='stil';
  const titel=stil?'🅿️ Stilstand':'🚗 Rijden';
  const uitleg=stil?'Motor stationair, ± 1 minuut. Daarna foutcodes en zelftests.'
                   :'Rij gewoon weg: anderhalve minuut boven 15 km/h is genoeg. Geen fases, geen route — het scherm stopt vanzelf.';
  let st='Nog niet gemeten';
  if(x&&x.sam){ const n=x.sam.rijen.filter(r=>r.oordeel!=='nodata').length;
    st='Gemeten om '+_tcTijd(x.ts)+' — '+n+' sensoren'+(x.sam.opvallend?', <b class="vz-opval">'+x.sam.opvallend+' vallen op</b>':', niets opvallend'); }
  const fn=stil?'runTotalCheck()':'runTotalCheckRij()';
  return `<div class="tc-stap${x&&x.sam?' gedaan':''}"><div class="tc-stap-t">${titel}</div><div class="tc-stap-u">${uitleg}</div>`+
    `<div class="tc-stap-s">${st}</div><button class="btn${(!x&&(stil||_tc.stil))?' pri':''}" onclick="${fn}" ${_tcBezig?'disabled':''}>${x&&x.sam?'↻ Opnieuw':(stil?'Start stilstand':'Start rijden')}</button></div>`;
}
function _tcPidHtml(p){
  const k=_TC_KLS[p.oordeel]||'';
  const reden=(p.stil&&p.stil.oordeel!=='ok'&&p.stil.reden)||(p.rij&&p.rij.oordeel!=='ok'&&p.rij.reden)||'';
  return `<div class="chk-item"><div class="chk-dot ${k}"></div><div style="flex:1"><div class="chk-name">${_tcEsc(p.naam)}</div>`+
    `<div class="chk-val">${_tcEsc(_tcWaarde(p))}${reden?' — '+_tcEsc(reden):''}</div></div><div class="chk-bdg ${k}">${_TC_LBL[p.oordeel]||''}</div></div>`;
}
function _tcCatHtml(c){
  const m=CHK_CAT_META[c.cat]||{l:c.cat,i:'•'};
  const k=_TC_KLS[c.oordeel]||'';
  const afw=c.pids.filter(p=>p.oordeel!=='ok'), rest=c.pids.filter(p=>p.oordeel==='ok');
  let kop=c.dtc?_tcEsc(c.dtc.licht.kop):(afw.length?afw.length+' van '+c.pids.length+' wijkt af':c.pids.length+' sensor'+(c.pids.length===1?'':'en')+', alles binnen bereik');
  let body='';
  if(c.dtc){
    body+=`<div class="tc-noot">${_tcEsc(c.dtc.licht.tekst)}</div>`+(c.dtc.rd?`<div class="tc-noot"><b>${_tcEsc(c.dtc.rd.kop)}</b> — ${_tcEsc(c.dtc.rd.tekst)}</div>`:'')+
      (c.open?'<button class="btn" onclick="PLFoutcodes.open()">⚠️ Open foutcodes</button>':'');
  } else {
    body+=afw.map(_tcPidHtml).join('');
    if(rest.length) body+=(afw.length?`<details class="vz-meer"><summary>Binnen bereik (${rest.length})</summary>${rest.map(_tcPidHtml).join('')}</details>`:rest.map(_tcPidHtml).join(''));
    if(c.focus){
      const plan=PLTotaal.focusPlan(c), f=_tc.focus[c.cat];
      body+=`<div class="tc-noot">Focusmeting: alleen ${plan.pids.length} sensor${plan.pids.length===1?'':'en'} van ${_tcEsc(m.l.toLowerCase())}, ${plan.rijden?'rijdend — de afwijking zat alleen onder het rijden':'stilstaand'}. Minder sensoren betekent vaker gemeten.</div>`;
      if(f){ const fo=f.sam.rijen.filter(r=>r.oordeel==='afwijkend'||r.oordeel==='let');
        body+=`<div class="tc-noot"><b>Focusmeting ${_tcTijd(f.ts)}:</b> ${fo.length?fo.map(r=>_tcEsc(r.naam)+' '+fv(r.min)+'–'+fv(r.max)+' '+_tcEsc(r.eenheid)).join('; '):'binnen bereik — de afwijking kwam in deze meting niet terug'}</div>`; }
      body+=`<div class="tc-knoppen"><button class="btn${f?'':' pri'}" onclick="tcFocus('${_tcEsc(c.cat)}')" ${_tcBezig?'disabled':''}>🔍 ${f?'Opnieuw focussen':'Focusmeting'}</button>`+
        (f?`<button class="btn pri" onclick="tcFocusAI('${_tcEsc(c.cat)}')">🤖 Laat de AI ${_tcEsc(m.l.toLowerCase())} onderzoeken</button>`:'')+'</div>';
    }
  }
  return `<details class="tc-cat ${k}"${c.open?' open':''}><summary><span class="tc-cat-i">${m.i}</span><span class="tc-cat-n">${_tcEsc(m.l)}</span>`+
    `<span class="tc-cat-k">${kop}</span><span class="chk-bdg ${k}">${_TC_LBL[c.oordeel]||''}</span></summary>${body}</details>`;
}
function tcTeken(){
  const stap=document.getElementById('tcStappen'), res=document.getElementById('chkResults'), sum=document.getElementById('chkSummary');
  if(!stap||!res) return;
  stap.innerHTML=_tcStapHtml('stil')+_tcStapHtml('rij');
  const s=PLTotaal.stand(_tc);
  const ai=document.getElementById('btnChkAI'); if(ai) ai.disabled=!s.aiMag||!!_tcBezig;
  if(!s.aiMag){ res.innerHTML=''; if(sum) sum.style.display='none'; return; }
  const cats=_tcCats();
  if(sum){ sum.style.display='grid';
    document.getElementById('csOk').textContent=cats.filter(c=>c.oordeel==='ok').length;
    document.getElementById('csWarn').textContent=cats.filter(c=>c.oordeel!=='ok'&&c.oordeel!=='afwijkend'&&c.oordeel!=='nodata').length;
    document.getElementById('csBad').textContent=cats.filter(c=>c.oordeel==='afwijkend').length; }
  let h='';
  if(_tcBezig) h+=`<div class="ai-ld"><div class="spin"></div> ${_tcEsc(_tcBezig)}</div>`;
  if(!s.rij) h+='<div class="tc-noot tc-gat">Rijden is nog niet gemeten. Wat alleen onder belasting zichtbaar wordt — laadspanning, brandstoftrim bij kruissnelheid, inlaatdruk — is dus níét beoordeeld.</div>';
  if(!s.stil) h+='<div class="tc-noot tc-gat">Stilstand is nog niet gemeten: geen foutcodes, geen zelftests en geen stationair gedrag in deze uitslag.</div>';
  h+=cats.map(_tcCatHtml).join('');
  res.innerHTML=h;
}
async function runCheckAI(){
  const s=PLTotaal.stand(_tc);
  if(!s.aiMag) return;
  if(!(await preAnalysisCheck())) return;
  activateAIPane();
  const btn=document.getElementById('aiBtn'); if(btn) btn.disabled=true;
  const v=getVehicle();
  const cats=_tcCats();
  // Het analyserapport (PLRapport) leest window._plVerzameld. Dat was het
  // laatst gemeten deel ("Rijdeel van de totaalcheck", 20 s): nu beide delen.
  const rm=PLTotaal.rapportMeting(_tc);
  window._plVerzameld={ sam:PLVerzamel.vanBron({hist:rm.hist}), sec:rm.sec, rijSec:rm.rijSec, beperkt:rm.beperkt, bron:null, ts:Date.now(),
    hist:rm.hist, watVoor:'de totaalcheck', klacht:'', eisNaam:'stilstand en rijden' };
  // Als een test-scenario actief is: laat de AI weten dat deze data handmatig
  // is gezet (testdoeleinden), zodat het oordeel daar rekening mee houdt.
  let scenNote='';
  if(_scenario.enabled){
    const mp=Object.keys(_scenario.pids);
    scenNote=`\n\nLET OP — TESTSCENARIO: de volgende waarden zijn HANDMATIG ingesteld voor testdoeleinden (geen echte meting): `+
      (mp.length?mp.map(p=>(getPidDef(p)?.name||p)).join(', '):'(geen PIDs)')+
      (_scenario.dtcs.length?`; handmatige DTC's: ${_scenario.dtcs.join(', ')}`:'')+
      `. Beoordeel ze normaal, maar weet dat dit een simulatie is.`;
  }
  // Brandstof-specifieke instructie zodat het rapport geen onzin vertelt
  // (bv. brandstoftrim of verbruik op een elektrische auto).
  const ft=vehicleFuelType();
  let fuelNote='';
  if(ft==='elektrisch'){
    fuelNote=`\nDit is een VOLLEDIG ELEKTRISCH voertuig: er is GEEN verbrandingsmotor, GEEN brandstof, GEEN brandstoftrim, lambda/O2, MAF, EGR of uitlaatsysteem. Noem die zaken niet en geef geen brandstof- of verbruiksadvies in liters. Richt je op accu, laden, elektrische aandrijving en algemene staat.`;
  } else if(ft==='diesel'){
    fuelNote=`\nDit is een DIESEL: brandstoftrim-logica wijkt af; let op roetfilter (DPF), AdBlue/SCR en NOx waar relevant.`;
  }
  const prompt=`Je bent expert automonteur. Analyseer deze totaalcheck in het Nederlands.\n\nVoertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''} ${v.brandstof?'('+v.brandstof+')':''}${fuelNote}\nAlleen sensoren die aanwezig zijn op dit voertuig zijn meegenomen. Beoordeel uitsluitend op basis van de meegeleverde data — maak geen aannames over turbo, diesel, AdBlue of hybride als dat niet blijkt uit het voertuig of de data.\nDe check meet in twee delen, elk alleen in zijn eigen toestand: stilstaand en rijdend. Vergelijk ze waar dezelfde sensor in beide staat; een verschil tussen stationair en rijdend is vaak de diagnose.${PLTotaal.promptBlok(_tc, cats, PLVerzamel.promptBlok)}\nDTC (lijst van de app): ${formatDtcCodes(dtcCodes)}${scenNote}\n\nGeef: Structureer je antwoord EXACT in onderstaande volgorde. Gebruik nergens sterretjes, emoji of woorden in hoofdletters in de lopende tekst; zet elke sectienaam op een eigen regel.

Voertuigscore: <0-100>/100
Diagnosebetrouwbaarheid: <0-100>%
Actieve storingen: <aantal>
Aandachtspunten: <aantal>

Systeemgezondheid:
Motor: <0-100>
Brandstofsysteem: <0-100>
Ontsteking: <0-100>
Emissies: <0-100>
Koeling: <0-100>
Elektrisch systeem: <0-100>
Transmissie: <0-100>

VOERTUIGGEGEVENS
Merk, model, bouwjaar, brandstof en motor — kort.

SYSTEEMSTATUS
Een of twee regels over de algehele staat op dit moment. Noem welk deel (stilstand, rijden) niet gemeten is.

FOUTCODES
De actieve DTC-codes met korte uitleg, of: Geen actieve foutcodes.

SENSORANALYSE
Een tabel met exact deze kolommen: Sensor | Stilstand | Rijdend | Referentie | Status. Status is precies een van: Normaal, Controle aanbevolen, Direct aandacht. Neem alleen sensoren op waarvoor meetdata beschikbaar is.

BEVINDINGEN
Korte, feitelijke punten; koppel elk punt aan een gemeten waarde en de toestand waarin hij gemeten is.

WAARSCHIJNLIJKE OORZAAK
Een tabel met kolommen: Diagnose | Kans | Vertrouwen. Kans is Hoog, Gemiddeld of Laag; Vertrouwen is een percentage. Daarna een korte alinea van maximaal vier zinnen met de meest waarschijnlijke oorzaak en of er aanwijzingen voor ernstige schade zijn.

KOSTENINDICATIE
Een tabel met kolommen: Handeling | Kans | Indicatie. Indicatie is een prijsbereik in euro.

AANBEVOLEN VERVOLGONDERZOEK
Een korte lijst met concrete meet- of controlestappen om de diagnose te bevestigen.\nSluit af met deze exacte zin op een nieuwe regel: ${RAPPORT_DISCLAIMER}`;
  // De aanlevering oordeelt over de kwaliteit van precies de sensoren die de
  // prompt laat zien (beide delen); tot 20-10-2026 stond dat oordeel er ook
  // nog als eigen blok in de prompt.
  await callAI(prompt,document.getElementById('aiContent'),{
    vraag:'Volledige doorlichting: beoordeel de staat van het voertuig op alle uitgelezen systemen, stilstaand en rijdend.',
    profiel:'totaal', zichtbaar:cats.flatMap(c=>c.pids.map(p=>p.pid))});
  if(btn) btn.disabled=false;
}
function exportCheckReport(){
  const v=getVehicle();
  const lines=[`PidLane — Totaalcheck`,`Datum: ${new Date().toLocaleString('nl')}`,v.merk?`Voertuig: ${v.merk} ${v.model} ${v.year}`:'',''];
  const s=PLTotaal.stand(_tc);
  lines.push('Stilstand: '+(s.stil?'gemeten om '+_tcTijd(_tc.stil.ts):'niet gemeten'), 'Rijden: '+(s.rij?'gemeten om '+_tcTijd(_tc.rij.ts):'niet gemeten'), '');
  if(s.aiMag) _tcCats().forEach(c=>{
    lines.push(`[${String(c.oordeel).toUpperCase()}] ${(CHK_CAT_META[c.cat]||{l:c.cat}).l}`+(c.dtc?' — '+c.dtc.licht.kop:''));
    c.pids.forEach(p=>lines.push(`  ${p.naam}: ${_tcWaarde(p)}${p.oordeel!=='ok'?' ('+p.oordeel+')':''}`));
    lines.push('');
  });
  download(plBestandsnaam('totaalcheck','txt'),lines.join('\n'));   // #326: geen vaste naam
}
// De twee stappen staan er meteen; het venster staat al in de DOM.
if(typeof document!=='undefined') tcTeken();

/* ══════════════════════════════════════════════════════════════════════════
   BASIC SYSTEM CHECK (deur 1) — 09-07-2026
   Reeks korte autotechniek-tests. Per test:
     • X-as = tijd, Y-as = relevante PID
     • Verwachte trend/band = referentielijn (grijs vlak)
     • Werkelijke waarde = live OBD-lijn (cyaan)
     • Slaagt de live-waarde X sec binnen de band → groen vinkje → volgende test
   Automatische PID-selectie: catalogus wordt gefilterd op motortype
   (universeel + benzine/diesel/hybride) én op wat de auto ondersteunt
   (supportedPIDs); ensurePIDListActive zet precies die PIDs aan.
   ══════════════════════════════════════════════════════════════════════════ */

// Elke test: {id, groep, naam, pids:[hoofd-PID...], uitleg, band:{lo,hi} of fn,
//   hold: seconden binnen band om te slagen, min? (min. sec meten),
//   motor? (meet alleen bij een motor die al even draait — zie bscMotorTest)}
// band kan statisch zijn {lo,hi} of dynamisch via fn(vals,hist)->{lo,hi,ref?}.
// → BSC_TESTS verplaatst naar pidlane-data.js

// Baseline = mediaan van laatste n sec metingen (voor stabiliteitsbanden)
function bscBaseline(hist, sec){
  if(!Array.isArray(hist)||!hist.length) return null;
  const t0=Date.now()-sec*1000;
  const vals=hist.filter(x=>x.t>=t0).map(x=>x.v).sort((a,b)=>a-b);
  if(vals.length<3) return null;
  return vals[Math.floor(vals.length/2)];
}

let _bscState=null; // {list, stand:{id→…}, t0, tik, startTemp, gestopt}

/* ── SYSTEEMTEST ALS CHECKLIST (26-09-2026) ──────────────────────────────
   WAT ER WAS. De tests liepen één voor één af. Elke test wachtte hoogstens
   12–15 s op zijn voorwaarde en werd anders "n.v.t."; een test zonder
   voorwaarde kreeg 30 s en werd dan "twijfel". Wie reed, zag de stationair-
   tests dus één voor één mislukken of wegvallen, en wie stilstond hetzelfde
   met de rijtests. De uitkomst zei meer over de volgorde van de lijst dan
   over de auto.

   WAT HET NU IS. Alle tests staan tegelijk klaar. Elke test heeft een
   situatie (sit, in BSC_TESTS) en meet alleen zolang die situatie er is.
   Tijdens het rijden wachten de stationair-tests dus gewoon: ze falen niet,
   ze wachten. Doet de situatie zich voor, dan meet de test en vinkt hij zich
   af. Je stopt wanneer je wilt; wat niet voorkwam telt als "niet getest" en
   niet als fout. Bovenaan staat welke situatie nu speelt en welke volgende
   kans de meeste tests afvinkt. */
const BSC_SIT = {
  stationair:{ico:'🅿️', naam:'Stilstaand, motor draait',   doe:'Laat de motor stationair draaien, voet van het gas.'},
  constant:  {ico:'🛣️', naam:'Constant rijden',            doe:'Rij een stuk met gelijkmatige snelheid, 40 km/u of meer.'},
  optrekken: {ico:'⤴️', naam:'Optrekken',                  doe:'Trek rustig maar duidelijk op.'},
  remmen:    {ico:'⤵️', naam:'Uitrollen of remmen',        doe:'Gas los en laat de auto uitrollen, of rem rustig af.'},
  rijden:    {ico:'🚗', naam:'Rijden',                     doe:'Rij een stukje.'},
  draaiend:  {ico:'⚙️', naam:'Motor draait',               doe:'Start de motor.'},
  motoruit:  {ico:'🔑', naam:'Contact aan, motor uit',     doe:'Zet de motor uit maar laat het contact aan.'},
  contact:   {ico:'🔌', naam:'Contact aan',                doe:'Zet het contact aan.'},
  koud:      {ico:'❄️', naam:'Koude start',                doe:'Alleen te meten bij een koude motor, vóór het opwarmen.'},
};
const BSC_WARM_C = 70;          // bedrijfswarm voor tests met warm:true
const BSC_KOUD_C = 50;          // daaronder telt de motor als koud
const BSC_MAX_MEET_MS = 20000;  // zo lang mag een test IN zijn situatie meten
const BSC_GEEN_DATA_MS = 15000; // zo lang wachten op een eerste meetwaarde
const BSC_TIK_MS = 250;
/* Een test over de motor meet alleen terwijl die motor draait, en pas als hij
   al even draait (07-10-2026). Dat is geen hybride-regel maar de basis — hij
   geldt net zo voor start/stop en voor een motor die net aansloeg.

   Tot vandaag keek "constant rijden" alleen naar de snelheid. Bij een hybride
   die op de accu rijdt mat de misfire-test dus een toerental van 0, en sloeg
   de motor halverwege aan, dan liep de basislijn van x_rpm_const (de mediaan
   van de laatste 5 s) over nullen en een aanloop. Uitkomst: "twijfel", met
   "overslaan of slippende koppeling" als uitleg, op een gezonde auto. En wat
   wel binnen de band viel — belasting 0 bij uitrollen, verbruik 0 bij
   constant — heette "ok" over een motor die niet liep.

   6 s is langer dan het langste basislijnvenster (5 s), zodat geen enkele
   basislijn nog een monster van vóór de start bevat.

   Het oordeel komt uit de toerentalhistorie zelf, niet uit een klok die
   start bij de eerste aanroep. Die eerste versie liet een motor die al
   minuten liep óók 6 s wachten, alleen omdat de systeemtest net begon —
   bproef-systeemtest.js zag dat. De historie houdt 120 monsters; bij de
   snelste pollstand (80 ms) is dat nog ruim 9 s. */
const BSC_MOTOR_STABIEL_MS = 6000;
function bscMotorTest(t){ return !!t.motor || t.sit==='draaiend' || t.sit==='stationair'; }
function bscMotorStabiel(hist, nu){
  if(!Array.isArray(hist) || !hist.length) return false;
  const van=nu-BSC_MOTOR_STABIEL_MS;
  if(hist[0].t>van) return false;   // de historie reikt niet ver genoeg terug
  const venster=hist.filter(x=>x.t>=van);
  return venster.length>=3 && venster.every(x=>typeof x.v==='number' && x.v>400);
}

// Welke situaties spelen er nu? Een set, want stationair is ook "draaiend".
function bscSituaties(){
  const rpm=pidVals['010C'], spd=pidVals['010D'], ect=pidVals['0105'];
  const st=(window.PLMon&&window.PLMon._state)?window.PLMon._state():{fase:'onbekend'};
  const nu=new Set();
  const draait = typeof rpm==='number' && rpm>400;
  const contact = typeof rpm==='number' || typeof spd==='number' || (typeof demoMode!=='undefined' && demoMode);
  if(contact) nu.add('contact');
  if(typeof rpm==='number' && rpm<200) nu.add('motoruit');
  if(draait) nu.add('draaiend');
  if(draait && bscMotorStabiel(pidHist['010C'], Date.now())) nu.add('motorstabiel');
  if(draait && (typeof spd!=='number' || spd<3)) nu.add('stationair');
  if(typeof spd==='number' && spd>=5){
    nu.add('rijden');
    if(st.fase==='constant' && spd>=30) nu.add('constant');
    if(st.fase==='accelereren') nu.add('optrekken');
    if(st.fase==='remmen') nu.add('remmen');
  }
  if(typeof ect==='number' && ect<BSC_KOUD_C) nu.add('koud');
  return nu;
}
// Mag deze test nu meten? Zo nee: waarop wacht hij, in gewone woorden.
function bscConditie(t, situaties){
  const nu=situaties||bscSituaties();
  const sit=t.sit||'draaiend', mis=[];
  if(!nu.has(sit)) mis.push((BSC_SIT[sit]||{naam:sit}).naam.toLowerCase());
  if(bscMotorTest(t) && !nu.has('motorstabiel')){
    if(nu.has('draaiend')) mis.push('motor draait al '+Math.round(BSC_MOTOR_STABIEL_MS/1000)+' s');
    else if(t.motor) mis.push('motor draait');
  }
  if(t.warm && !(typeof pidVals['0105']==='number' && pidVals['0105']>=BSC_WARM_C)) mis.push('motor bedrijfswarm');
  if(t.minSnelheid && !(typeof pidVals['010D']==='number' && pidVals['010D']>=t.minSnelheid)) mis.push('≥'+t.minSnelheid+' km/u');
  return mis.length ? {ok:false, label:mis.join(' + ')} : {ok:true, label:''};
}

// ── Uitbreiding van de catalogus: rijdende + voorwaardelijke tests.
// Toegevoegd vanuit index (BSC_TESTS zelf staat in pidlane-data.js);
// dubbel-id-guard zodat een latere verhuizing naar data.js niets breekt.
(function(){
  if(typeof BSC_TESTS==='undefined'||!Array.isArray(BSC_TESTS)) return;
  const extra=[
    {id:'x_rpm_const', groep:'universeel', motor:true, naam:'Toerental stabiel bij constante snelheid',
     pids:['010C'], hold:5, sit:'constant', minSnelheid:40,
     uitleg:'Bij constante snelheid hoort het toerental vlak te blijven. Schommelingen wijzen op overslaan of een slippende koppeling/omvormer.',
     band:(vals,hist)=>{ const m=bscBaseline(hist['010C'],5); return m==null?null:{lo:m-75,hi:m+75}; }},
    {id:'x_accel_load', groep:'universeel', motor:true, naam:'Belasting reageert op gas geven',
     pids:['0104'], hold:2, sit:'optrekken',
     uitleg:'Tijdens accelereren hoort de motorbelasting duidelijk op te lopen. Blijft die laag, dan leest MAF/MAP mogelijk te laag.',
     band:{lo:35,hi:100}},
    {id:'x_decel_load', groep:'universeel', motor:true, naam:'Belasting valt weg bij uitrollen/remmen',
     pids:['0104'], hold:2, sit:'remmen',
     uitleg:'Bij gas los/remmen hoort de belasting laag te zijn (brandstof-cut). Hoge belasting hier is verdacht.',
     band:{lo:0,hi:25}},
    {id:'x_laadspanning', groep:'universeel', naam:'Laadspanning bij draaiende motor',
     pids:['0142'], hold:4, sit:'draaiend',
     uitleg:'Met draaiende motor hoort de dynamo te laden. Hoeveel hangt af van de auto: een slimme laadregeling vraagt bij een volle accu bewust 12,5\u201313 V. Onder 12,2 V of boven 15,2 V is op elke auto fout.',
     // De band van déze auto (#532): gevraagde laadspanning als die er is,
     // 13,2 V alleen bij een bewezen gewone dynamo, anders de harde grens.
     band:()=>{ try{ return window.PLKenmerk ? PLKenmerk.laadBandLive() : {lo:13.2,hi:15.2}; }
       catch(e){ console.warn('systeemtest: laadband onleesbaar — vaste band', e); return {lo:13.2,hi:15.2}; } }},
    {id:'x_map_stat', groep:'benzine', naam:'Vacu\u00fcm stationair (inlaatdruk)',
     pids:['010B'], hold:4, sit:'stationair', warm:true,
     uitleg:'Een warme benzinemotor trekt stationair 20\u201345 kPa. Hogere inlaatdruk wijst op valse lucht of lage compressie.',
     band:{lo:18,hi:46}}
  ];
  for(const n of extra){ if(!BSC_TESTS.some(x=>x.id===n.id)) BSC_TESTS.push(n); }
})();

/* ── 🛡️ RIT-MONITOR dashboard: 1s-verversing zolang de pane zichtbaar is ── */
// Opener volgens het activateAIPane-patroon: welkomstscherm dicht, alle
// tabs/panes uit, alleen pane-monitor aan.
// Verbergt de uitleg boven de rit-monitor 10 s nadat de pane opent. Bewust
// geen localStorage: bij een volgende sessie mag je hem best nog eens lezen.
let _monIntroT=0;
function _monIntroStart(){
  const el=document.getElementById('monIntroTxt'); if(!el) return;
  el.classList.remove('weg');
  clearTimeout(_monIntroT);
  _monIntroT=setTimeout(()=>{ try{ el.classList.add('weg'); }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ } }, 10000);
}
function openMonitorView(){
  try{ document.getElementById('welcomeScreen').classList.add('hidden'); }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ }
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
  const pane=document.getElementById('pane-monitor'); if(pane) pane.classList.add('active');
  const tb=document.querySelector('.tb'); if(tb) tb.scrollTop=0;
  if(typeof setLeftPanelForMode==='function') setLeftPanelForMode('monitor');
  // PID-lade hoort niet op de monitor: setLeftPanelForMode (externe module)
  // is ouder dan deze pane en kent de modus 'monitor' niet — dus zelf hard
  // sluiten, plus twee nakomertjes voor alles wat 'm async weer opent.
  _monSluitPidLade();
  setTimeout(_monSluitPidLade,350); setTimeout(_monSluitPidLade,1200);
  _monDemoChip=false;               // demo-testchipje weg zodra de pane open is
  try{ _monTick(); }catch(e){ console.warn('_monTick mislukt:', e); }      // meteen vullen, niet wachten op de 1s-tik
  try{ _monChipTick(); }catch(e){ console.warn('_monChipTick mislukt:', e); }  // chipje direct weg zodra de pane open is
  try{ _monIntroStart(); }catch(e){ console.warn('_monIntroStart mislukt:', e); }
}
// ── PID-lade-bewaking op de monitor ─────────────────────────────
// Staat het sensorenpaneel (#slPanel: zijbalk op desktop, sheet op mobiel)
// zichtbaar in beeld? Geometrie-check, want de open/dicht-klasse van de
// lade leeft in de externe module/pidlane.css.
function _monPidLadeOpen(){
  const sl=document.getElementById('slPanel'); if(!sl) return false;
  const cs=getComputedStyle(sl);
  if(cs.display==='none'||cs.visibility==='hidden') return false;
  const r=sl.getBoundingClientRect();
  return r.width>80 && r.height>80 && r.bottom>0 && r.top<(window.innerHeight-24);
}
// Sluit lade + zijbalk. Uitzondering: opende de gebruiker hem net zélf via
// 🎛️ PID-keuze, dan 2 minuten met rust laten.
function _monSluitPidLade(){
  try{
    if(Date.now()-(window._pidLadeUserTs||0)<120000) return;
    if(typeof closeLades==='function') closeLades();
    slCollapsed=true;
    const g=document.getElementById('appGrid'); if(g) g.classList.add('sl-col');
    if(typeof updateSLToggleIcon==='function') updateSLToggleIcon();
    if(typeof clearSLAutoHide==='function') clearSLAutoHide();
    try{ localStorage.setItem('ns_sl','true'); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
  }catch(e){ console.warn('clearSLAutoHide mislukt:', e); }
}
// Is de monitor-pane wat de gebruiker NU ziet? Let op: goHome() legt het
// welkomstscherm als overlay BOVENOP — de pane houdt dan gewoon z'n
// offsetParent, dus die check alleen is niet genoeg.
function _monPaneZichtbaar(){
  const pane=document.getElementById('pane-monitor');
  if(!pane||!pane.classList.contains('active')||!pane.offsetParent) return false;
  const ws=document.getElementById('welcomeScreen');
  if(ws&&!ws.classList.contains('hidden')) return false;   // home-overlay erboven
  return true;
}
// ➖ op de pane: terug naar home; monitor waakt door, chipje neemt het over.
// In demo slaapt PLMon — dan tonen we het chipje tóch (testbaar zonder rit);
// vlag gaat weer uit zodra de pane opnieuw opent.
let _monDemoChip=false;
function monMinimize(){
  if(typeof demoMode!=='undefined'&&demoMode) _monDemoChip=true;
  try{ goHome(); }catch(e){ console.warn('goHome mislukt:', e); }
  try{ _monChipTick(); }catch(e){ console.warn('_monChipTick mislukt:', e); }
}
// TEST:ECT_HOOG en TEST:LAADSPANNING zijn de namen die PLWatch werkelijk geeft;
// tot 04-10-2026 stond hier alleen ECT_HOOG en x_laadspanning, en die komen in
// de rit-monitor nooit voor — oververhitting kwam daardoor oranje binnen.
// Welke melding staat open voor een reden (👎 Klopt niet)? Eén tegelijk.
let _monFbOpen='';
function monFeedbackOpen(sig){
  _monFbOpen=(_monFbOpen===sig)?'':sig;
  try{ _monTick(); }catch(e){ console.warn('_monTick mislukt:', e); }
}
function monFeedback(sig, reden){
  _monFbOpen='';
  let ok=false;
  try{ ok=!!(window.PLMon&&PLMon.feedback(sig, reden)); }catch(e){ console.warn('PLMon.feedback mislukt:', e); }
  try{ if(typeof showToast==='function') showToast(ok?'👎 Bewaard — hier leren we van':'Niet bewaard: de melding bestaat niet meer'); }catch(e){ console.warn('showToast mislukt:', e); }
  try{ _monTick(); }catch(e){ console.warn('_monTick mislukt:', e); }
}
const _MON_ERNSTIG=/^(ECT_HOOG|TEST:ECT_HOOG|PIEK:|UITVAL:|THERMOSTAAT|TEST:x_laadspanning|TEST:LAADSPANNING)/;

/* ── Zuinig rijden (26-07-2026) ────────────────────────────────────────
   Twee soorten advies onder elkaar. Boven een LIVE regel die op de echte
   meetwaarden van dít moment slaat; daaronder een algemene tip die elke
   14 seconden doorrouleert.

   Over de schakelmomenten: een tabel met fabrieksschakelpunten per model
   heb ik niet, en die ga ik ook niet verzinnen. De grenzen hieronder komen
   uit het brandstoftype — het verschil tussen benzine en diesel is groot en
   wél hard te bepalen (PID 0151, anders het voertuigdossier). Het advies
   zelf is verder volledig op deze auto gebaseerd: het kijkt naar het echte
   toerental, de echte belasting en de echte gaspedaalstand. */
function _monBenzine(){
  try{
    const f=pidVals['0151'];
    if(typeof f==='number') return !(f===4||f===5);       // 4/5 = diesel volgens J1979
    const b=String((vehicleInfo&&(vehicleInfo.brandstof||vehicleInfo.fuel))||'').toLowerCase();
    if(/diesel|tdi|hdi|dci|cdi|crdi/.test(b)) return false;
  }catch(e){ /* stil: pidVals/vehicleInfo kunnen nog ontbreken vóór de eerste meting */ }
  return true;                                            // bij twijfel benzinegrenzen
}
const _MON_TIPS=[
  '🛞 Rol uit met de auto in de versnelling. Zolang je de koppeling niet indrukt en het gas los is, spuit de ECU niets in — je rijdt dan letterlijk op nul. In z\'n vrij of ontkoppeld draait de motor stationair door en kost dat wél brandstof.',
  '👀 Kijk ver vooruit. Elke keer dat je moet remmen, gooi je snelheid weg waar je brandstof voor betaald hebt. Vroeg gas los kost niets, hard remmen kost alles.',
  '🌬️ Boven ongeveer 80 km/u kost een open raam meer dan de airco. Daaronder is het andersom.',
  '🧳 Dakdrager of fietsendrager eraf als je hem niet gebruikt. Leeg scheelt dat al snel een halve liter per 100 km op snelweg.',
  '🛞 Controleer je bandenspanning maandelijks. Een halve bar te laag kost enkele procenten verbruik en gaat ten koste van je banden.',
  '🐢 Snelheid weegt kwadratisch mee in luchtweerstand. 110 in plaats van 130 rijden scheelt op een lange rit meer dan welke rijstijltruc dan ook.',
  '❄️ Korte ritten met een koude motor zijn veruit het duurst per kilometer. Combineer boodschappen in één rit in plaats van drie losse.',
  '⏱️ Sta je langer dan een halve minuut stil? Motor uit. Opnieuw starten kost minder dan stationair blijven draaien.'
];
let _monTipIdx=0, _monTipT=0;
function _monZuinigTip(spd,rpm,thr,load){
  const live=document.getElementById('monTipLive'), alg=document.getElementById('monTipAlg');
  if(!live||!alg) return;
  // Algemene tip rouleert
  const nu=Date.now();
  if(!_monTipT||nu-_monTipT>14000){ _monTipT=nu; alg.textContent=_MON_TIPS[_monTipIdx%_MON_TIPS.length]; _monTipIdx++; }
  // Live advies
  const benz=_monBenzine();
  const opschakel = benz?2300:1900, terugschakel = benz?1300:1150, stationair = benz?900:800;
  let t='⛽ Zuinig rijden — advies verschijnt zodra je rijdt.', kleur='';
  if(typeof rpm==='number'&&typeof spd==='number'){
    const gasLos = (typeof thr==='number') ? thr<=12 : (typeof load==='number'&&load<20);
    if(spd>20&&gasLos&&rpm>stationair+250){
      t='🛞 Je rolt nu uit mét gas los en in de versnelling — op dit moment gaat er geen druppel in. Laat de koppeling omhoog zolang je nog vaart hebt.'; kleur='goed';
    } else if(spd>15&&rpm>opschakel&&(typeof load!=='number'||load<65)){
      t='⬆️ '+Math.round(rpm)+' toeren bij deze belasting — een versnelling hoger kan. '+(benz?'Benzine':'Diesel')+' loopt het zuinigst rond '+(benz?'1800-2200':'1400-1800')+' toeren.'; kleur='let';
    } else if(spd>25&&rpm<terugschakel&&typeof load==='number'&&load>70){
      t='⬇️ Laag toerental met veel gas belast de motor zwaar en levert nauwelijks zuinigheid op. Schakel hier een versnelling terug.'; kleur='let';
    } else if(spd>0&&rpm>stationair){
      t='✅ Toerental en belasting zitten in een zuinig gebied. Zo doorrijden.'; kleur='goed';
    } else if(spd<=0&&rpm>stationair-150){
      t='⏱️ Stilstaand met draaiende motor. Duurt het langer dan een halve minuut, dan is de motor uitzetten goedkoper dan stationair draaien.'; kleur='let';
    }
  }
  live.textContent=t;
  live.className='mon-tip-live'+(kleur?' '+kleur:'');
}
let _monLaatstGetekend='';
function _monTegel(id, v, warnCls){
  const t=document.getElementById('monT_'+id), e=document.getElementById('monV_'+id);
  if(!t||!e) return;
  e.textContent=(v===undefined||v===null||isNaN(v))?'—':(typeof fv==='function'?fv(v):v);
  t.className='mon-tile'+(warnCls?' '+warnCls:'');
}
function _monNiveau(r, oudAlarm){
  if(!r) return oudAlarm ? 'alarm' : '';
  if(r.niveau==='fout') return r.hard ? 'alarm' : 'warn';
  return r.niveau==='letop' ? 'warn' : '';
}
function _monTick(){
  if(!_monPaneZichtbaar()) return;                      // pane niet in beeld: niks doen
  if(_monPidLadeOpen()) _monSluitPidLade();             // lade sluipt terug? dicht ermee
  const M=window.PLMon;
  const spd=pidVals['010D'], rpm=pidVals['010C'], ect=pidVals['0105'];
  const load=pidVals['0104'], volt=pidVals['0142'], map=pidVals['010B'];
  const st6=pidVals['0106'], lt7=pidVals['0107'];
  const trim=(typeof st6==='number'&&typeof lt7==='number')?Math.round((st6+lt7)*10)/10:undefined;
  // Tegels + kleuring op basis van dezelfde grenzen als de watchers
  _monTegel('spd',spd); _monTegel('rpm',rpm!==undefined?Math.round(rpm):undefined);
  // Koelwater en laadspanning uit één grens per grootheid (PLKenmerk, #532):
  // hard fout = alarm, fout of let op voor déze auto = warn, onbeslist = niets.
  _monTegel('ect',ect, _monNiveau(window.PLKenmerk && typeof ect==='number' ? PLKenmerk.koelLive(ect) : null, typeof ect==='number'&&ect>112));
  _monTegel('load',load);
  _monTegel('volt',volt, _monNiveau(window.PLKenmerk && typeof volt==='number' && typeof rpm==='number' ? PLKenmerk.laadLive(volt, rpm) : null, false));
  _monTegel('trim',trim, (typeof trim==='number'&&Math.abs(trim)>20&&typeof ect==='number'&&ect>=65)?'warn':'');
  _monTegel('map',map);
  // ── Extra meetwaarden ──
  const iat=pidVals['010F'], thr=pidVals['0111'], adv=pidVals['010E'], maf=pidVals['0110'];
  _monTegel('iat',iat);
  _monTegel('thr',thr);
  _monTegel('adv',adv);
  // Momentaan verbruik uit massaluchtstroom. Boven 5 km/u in L/100 km, daaronder
  // (stilstaand, stationair) in L/uur — anders deel je door bijna nul.
  let lph, lphU='L/100';
  if(typeof maf==='number'&&maf>0){
    const afr=_monBenzine()?14.7:14.5, dich=_monBenzine()?745:835;   // g/L
    const lu=(maf/afr)*3600/dich;                                    // liter per uur
    if(typeof spd==='number'&&spd>5){ lph=Math.round(lu/spd*100*10)/10; }
    else { lph=Math.round(lu*10)/10; lphU='L/uur'; }
  }
  _monTegel('lph',lph);
  const uEl=document.getElementById('monU_lph'); if(uEl) uEl.textContent=lphU;
  _monZuinigTip(spd,rpm,thr,load);
  // Statusbalk
  const sEl=document.getElementById('monStatus'), tEl=document.getElementById('monStatusTxt');
  const actief=!!(M&&M.active);
  sEl.classList.toggle('slaap',!actief);
  const chips=['monChipFase','monChipTemp','monChipTijd'].map(i=>document.getElementById(i));
  if(actief){
    const st=M._state?M._state():{fase:'onbekend',temp:'onbekend'};
    const n=M._order.length;
    tEl.textContent=n?('Monitor waakt — '+n+' bevinding'+(n===1?'':'en')):'Monitor waakt — alles rustig';
    chips[0].textContent='🚗 '+st.fase; chips[1].textContent='🌡️ motor '+st.temp;
    chips[2].textContent='⏱ '+Math.max(0,Math.round((Date.now()-(M.startedAt||Date.now()))/60000))+' min mee';
    chips.forEach(c=>c.style.display='');
  } else {
    tEl.textContent=demoMode?'Monitor slaapt — demo-modus (alleen echte ritten)':'Monitor slaapt — verbind met de auto';
    chips.forEach(c=>c.style.display='none');
  }
  // Waarschuwingsfeed alleen hertekenen als er iets veranderde
  const lijst=document.getElementById('monWarnLijst');
  const events=(M&&M.events)||{}; const orde=(M&&M._order)||[];
  const vinger=orde.map(k=>k+':'+events[k].count+':'+(events[k].verif?events[k].verif.status:'')+':'+(events[k].feedback?events[k].feedback.reden:'')).join('|')+'#'+_monFbOpen;
  if(vinger===_monLaatstGetekend) return;
  _monLaatstGetekend=vinger;
  if(!orde.length) return;                              // lege-staat blijft staan
  const esc=t=>String(t??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  lijst.innerHTML=[...orde].reverse().map(sig=>{
    const e=events[sig];
    const ernstig=_MON_ERNSTIG.test(sig);
    const fasen=Object.entries(e.fasen||{}).map(([k,n])=>k+'×'+n).join(', ');
    const redenen=(e.redenen||[]).slice(-2).map(esc).join('<br>');
    let verif='';
    if(e.verif){
      const cls=e.verif.status==='bevestigd'?'bev':e.verif.status==='meetprobleem'?'meet':'niet';
      const ic=e.verif.status==='bevestigd'?'❗':e.verif.status==='meetprobleem'?'⚠️':'✅';
      verif='<span class="mon-verif '+cls+'">'+ic+' '+esc(e.verif.status)+'</span>';
    } else if(ernstig&&connected&&!demoMode&&window.PLVerify){
      verif='<button class="btn" style="padding:3px 9px;font-size:11px" onclick="plRunVerify(this,{sig:\''+esc(sig)+'\',titel:\''+esc(e.code)+'\'})">🔍 Verifieer</button>';
    }
    // 👎 Klopt niet: één knop, daarna de reden (zie PLMon.feedback).
    const R=(M&&M.FEEDBACK_REDENEN)||{};
    let fb='', fbKeuze='';
    if(e.feedback) fb='<span class="mon-verif niet" title="'+esc(R[e.feedback.reden]||e.feedback.reden)+'">👎 klopt niet</span>';
    else if(M&&M.feedback) fb='<button class="btn" style="padding:3px 9px;font-size:11px" onclick="monFeedbackOpen(\''+esc(sig)+'\')">👎 Klopt niet</button>';
    if(!e.feedback && _monFbOpen===sig)
      fbKeuze='<div class="mon-ev-body" style="display:flex;flex-wrap:wrap;gap:6px">'
        +Object.keys(R).map(k=>'<button class="btn" style="padding:3px 9px;font-size:11px" onclick="monFeedback(\''+esc(sig)+'\',\''+k+'\')">'+esc(R[k])+'</button>').join('')
        +'</div>';
    return '<div class="mon-ev'+(ernstig?' ernstig':'')+(e.feedback?' gemarkeerd':'')+'"'+(e.feedback?' style="opacity:.6"':'')+'>'
      +'<div class="mon-ev-kop"><span>'+(ernstig?'🔴':'🟠')+' '+esc(e.code)+'</span><span style="opacity:.6;font-weight:700">'+e.count+'×</span>'+verif+fb+'</div>'
      +'<div class="mon-ev-body">'+redenen+(e.verif?'<br><i>'+esc(e.verif.tekst)+'</i>':'')+'</div>'
      +fbKeuze
      +'<div class="mon-ev-meta">rij-situatie: '+esc(fasen||'onbekend')+' · laatst: '+new Date(e.laatste).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})+'</div>'
      +'</div>';
  }).join('');
}
/* ── 🛡️ Zwevend monitor-chipje: zichtbaar zodra de monitor waakt terwijl de
   pane niet in beeld is. Toont snelheid + waarschuwingsteller; rand/teller
   kleuren oranje bij bevindingen en rood bij een ernstige. Tik = pane open.
   Via JS aan document.body gehangen (buiten #appScale, dus position:fixed
   blijft echt viewport-vast, net als de toast). ── */
let _monChipEl=null;
function _monChipMaak(){
  if(_monChipEl) return _monChipEl;
  const c=document.createElement('div');
  c.id='monChipFab';
  /* Geen eigen bottom/right/z-index meer: de chip hangt in #fabLane (zie
     pidlane.css), die de stapeling rechtsonder regelt. Zo botst hij niet meer
     met #remDrivePill wanneer de monitor geminimaliseerd is tijdens een
     expert-sessie. */
  c.style.cssText='display:none;align-items:center;gap:7px;background:var(--sur,#151b24);border:1.5px solid var(--bd,#26303b);color:var(--tx,#e6e9ef);border-radius:22px;padding:7px 13px;font-family:var(--f);font-size:13px;font-weight:800;box-shadow:0 6px 18px rgba(0,0,0,.45);cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent';
  c.innerHTML='<span>🛡️</span><span id="monChipSpd">— km/u</span><span id="monChipCnt" style="display:none;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--or,#f2820c);color:#fff;font-size:11px;font-weight:800;line-height:18px;text-align:center"></span>';
  c.title='Rit-monitor openen';
  c.onclick=()=>{ try{ openMonitorView(); }catch(e){ console.warn('openMonitorView mislukt:', e); } };
  const lane=document.getElementById('fabLane');
  if(lane){ lane.appendChild(c); }
  else{
    // Baan nog niet geparsed (praktisch onmogelijk: _monChipTick draait pas na
    // een timer of gebruikersactie). Dan positioneert de chip zichzelf, zodat
    // hij nooit als los blok in de body-flow belandt.
    c.style.position='fixed'; c.style.right='12px'; c.style.bottom='14px'; c.style.zIndex='9600';
    document.body.appendChild(c);
  }
  _monChipEl=c;
  return c;
}
function _monChipTick(){
  const M=window.PLMon;
  const toon=(!!(M&&M.active)||((typeof demoMode!=='undefined')&&demoMode&&_monDemoChip))&&!_monPaneZichtbaar();
  const c=_monChipEl||(toon?_monChipMaak():null);
  if(!c) return;                                        // nog nooit nodig geweest
  c.style.display=toon?'flex':'none';
  if(!toon) return;
  const spd=pidVals['010D'];
  const s=document.getElementById('monChipSpd');
  if(s) s.textContent=(typeof spd==='number'&&!isNaN(spd))?Math.round(spd)+' km/u':'— km/u';
  const orde=(M&&M._order)||[];
  const n=orde.length;
  const ernstig=orde.some(k=>_MON_ERNSTIG.test(k));
  const kleur=n?(ernstig?'var(--rd,#e5484d)':'var(--or,#f2820c)'):'var(--bd,#26303b)';
  const b=document.getElementById('monChipCnt');
  if(b){ b.style.display=n?'':'none'; b.textContent=n; b.style.background=n?kleur:''; }
  c.style.borderColor=kleur;
}
// Chip élke seconde verversen (ook buiten de pane); pane alleen indien zichtbaar
// — die guard zit in _monTick zelf.
setInterval(()=>{ try{ _monChipTick(); }catch(e){ console.warn('_monChipTick mislukt:', e); } try{ _monTick(); }catch(e){ console.warn('_monTick mislukt:', e); } },1000);

/* Welke testgroepen horen bij deze auto? Twee vragen, niet één (07-10-2026).

   Tot vandaag was dit `new Set(['universeel', et])`: één motortype, één groep.
   Een hybride kreeg daardoor 'hybride' en níét 'benzine', en verloor vijf
   tests (MAF, ontsteking, STFT, katalysator, tankniveau) aan een motor die hij
   gewoon heeft. Een hybride is geen soort benzineauto en ook geen soort EV:
   het is een auto die beide heeft. Dus apart gevraagd:

     zit er een verbrandingsmotor in?   ja, behalve bij volledig elektrisch
     zit er elektrische aandrijving in? ja bij hybride

   Een diesel-hybride krijgt sinds 13-10-2026 (#430) de dieseltests: welke
   verbrandingsmotor erin zit komt uit vehicleFuelType() (`brandstof`), want
   detectEngineType() zegt alleen 'hybride'. */
function bscGroepen(et, brandstof){
  const g=new Set(['universeel']);
  if(et==='diesel' || (et==='hybride' && brandstof==='diesel')) g.add('diesel');
  else if(et!=='ev') g.add('benzine');
  if(et==='hybride') g.add('hybride');
  return g;
}

// Filter de catalogus op motortype + welke PIDs de auto levert.
function bscBuildList(){
  const et=(typeof detectEngineType==='function')?detectEngineType():'benzine';
  let fuel='';
  try{ fuel=(typeof vehicleFuelType==='function')?vehicleFuelType():''; }catch(e){ console.warn('Systeemtest: brandstoftype onbekend — een diesel-hybride krijgt de benzinetests', e); }
  const groepen=bscGroepen(et, fuel);
  // 27-07-2026 — hier zat de oorzaak van "⏳ Wachten op sensordata…" dat nooit
  // afliep. De laatste voorwaarde (|| !!getPidDef(pid)) maakte deze controle
  // waardeloos: élk PID dat in ALL_PID_DEFS staat gaf `true`, ook als de auto
  // hem aantoonbaar niet levert. Op een Mazda CX-5 2018 werd zo de test op
  // PID 0114 gekozen terwijl die ECU alleen 0134 (breedband) en 0115 (achterste
  // sensor) ondersteunt — de test wachtte dus eeuwig op data die nooit kwam.
  // De definitie-terugval geldt nu alleen nog als we ECHT geen scanresultaat
  // hebben; met een gescande PID-lijst is die lijst leidend.
  const heeftScan = (typeof supportedPIDs!=='undefined') && supportedPIDs && supportedPIDs.size>0;
  const heeft = pid => demoMode || !heeftScan || supportedPIDs.has(pid);
  const list=[];
  for(const t of BSC_TESTS){
    if(!groepen.has(t.groep)) continue;
    // De derde poort (#532): een test die uitgaat van een kenmerk dat deze
    // auto aantoonbaar niet heeft, vervalt; is het onbekend, dan is hij
    // niet te beoordelen en staat hij genoteerd in plaats van te zakken.
    if(t.voorwaarden && window.PLKenmerk){
      let g=null;
      try{ g=PLKenmerk.geldtLive(t.voorwaarden); }catch(e){ console.warn('systeemtest: kenmerkpoort onleesbaar voor '+t.id, e); }
      if(g && g.uitkomst==='geldt_niet') continue;
      if(g && g.uitkomst==='onbekend'){ PLKenmerk.noteer('bsc_'+t.id, t.naam, g); continue; }
    }
    // Kies de eerste ondersteunde PID uit t.pids als hoofdmeter; test vervalt
    // als de auto geen enkele bijbehorende PID levert.
    const bruik=t.pids.filter(heeft);
    if(!bruik.length){ continue; }
    list.push({...t, pid:bruik[0], usePids:bruik});
  }
  return list;
}

async function startBasicCheck(){
  if(!(await preAnalysisCheck())) return;
  if(_bscState) bscStop(true);
  const list=bscBuildList();
  if(!list.length){ bscRender(`<div class="bsc-empty">Geen geschikte sensoren gevonden voor deze auto. Verbind en voer eerst een PID-scan uit.</div>`); return; }
  const allPids=[...new Set(list.flatMap(t=>t.usePids).concat(['010C','010D','0105']))];
  try{ await ensurePIDListActive(allPids); }catch(e){ console.warn('ensurePIDListActive mislukt:', e); }
  const stand={};
  list.forEach(t=>{ stand[t.id]={st:'wacht', held:0, holdStart:0, meetMs:0, v:undefined, gezien:false, reden:''}; });
  _bscState={list, stand, t0:Date.now(), vorig:Date.now(), startTemp:pidVals['0105'], gestopt:false, tik:null};
  bscTekenLijst();
  _bscState.tik=setInterval(()=>{ try{ bscTik(); }catch(e){ console.warn('systeemtest: tik mislukt', e); } }, BSC_TIK_MS);
  const et=(typeof detectEngineType==='function')?detectEngineType():'benzine';
  bscToast(`${list.length} tests klaar voor ${et} — elke test meet zodra zijn situatie zich voordoet`);
}

function bscCurrentBand(t){
  try{
    if(typeof t.band==='function') return t.band(pidVals, pidHist)||null;
    return t.band||null;
  }catch(e){ console.warn('systeemtest: band van '+t.id+' niet te bepalen', e); return null; }
}

// Binnen de band? Plus de oscillatie- en dynamiek-eisen van sommige tests.
function bscEvaluate(t, band){
  const v=pidVals[t.pid];
  if(v===undefined || band==null) return {v, inBand:false, wacht:true};
  let inBand = v>=band.lo && v<=band.hi;
  if(t.oscilleren){
    const h=(pidHist[t.pid]||[]).slice(-40).map(x=>x.v);
    inBand = inBand && h.some(x=>x<0.3) && h.some(x=>x>0.6);
  }
  if(t.dynamiek){
    const h=(pidHist[t.pid]||[]).slice(-30).map(x=>x.v);
    if(h.length>4){ const sp=Math.max(...h)-Math.min(...h); inBand = inBand && sp>Math.max(2,(band.hi-band.lo)*0.05); }
  }
  return {v, inBand, wacht:false};
}

// Eén tik: elke open test kijkt of zijn situatie er is, en meet dan.
function bscTik(){
  if(!_bscState || _bscState.gestopt) return;
  const nu=Date.now(), dt=nu-_bscState.vorig; _bscState.vorig=nu;
  const sits=bscSituaties();
  const koudBijStart = typeof _bscState.startTemp==='number' ? _bscState.startTemp<BSC_KOUD_C : null;
  for(const t of _bscState.list){
    const S=_bscState.stand[t.id];
    if(S.st==='ok'||S.st==='twijfel'||S.st==='geen'||S.st==='nvt') continue;
    const v=pidVals[t.pid];
    if(v!==undefined) S.gezien=true;
    // Een koude-starttest heeft maar één kans: bij het begin.
    if(t.sit==='koud' && koudBijStart===false){ S.st='nvt'; S.reden='de motor was al warm bij de start'; continue; }
    if(!S.gezien && nu-_bscState.t0>BSC_GEEN_DATA_MS){ S.st='geen'; S.reden='deze auto levert '+t.pid+' niet'; continue; }
    const eis=bscConditie(t, sits);
    if(!eis.ok){ S.st='wacht'; S.reden=eis.label; S.holdStart=0; S.held=0; continue; }
    S.st='meet'; S.meetMs+=dt; S.reden='';
    const band=bscCurrentBand(t);
    const r=bscEvaluate(t, band);
    S.v=r.v; S.band=band;
    if(r.inBand){ if(!S.holdStart) S.holdStart=nu; } else S.holdStart=0;
    S.held=S.holdStart?(nu-S.holdStart)/1000:0;
    if(S.held>=(t.hold||4)){ S.st='ok'; continue; }
    if(S.meetMs>(t.maxMeetMs||BSC_MAX_MEET_MS)){ S.st='twijfel'; S.reden=r.wacht?'geen band te bepalen':'bleef buiten '+bscBandTekst(band, t.pid); }
  }
  bscWerkLijstBij(sits);
  const open=_bscState.list.filter(t=>{ const x=_bscState.stand[t.id].st; return x==='wacht'||x==='meet'; });
  if(!open.length) bscStop(false);
}

function bscBandTekst(band, pid){
  if(!band) return '';
  const eh=(getPidDef(pid)||{}).unit||'', f=(x)=>(typeof fv==='function')?fv(x,pid):x;
  return f(band.lo)+'–'+f(band.hi)+(eh?' '+eh:'');
}

// Stoppen: wat nog openstond wordt "niet getest", met de reden erbij.
function bscStop(stil){
  if(!_bscState) return;
  _bscState.gestopt=true;
  if(_bscState.tik){ clearInterval(_bscState.tik); _bscState.tik=null; }
  for(const t of _bscState.list){
    const S=_bscState.stand[t.id];
    if(S.st==='wacht'||S.st==='meet'){
      const sit=BSC_SIT[t.sit||'draaiend']||{naam:t.sit};
      S.st='nvt'; S.reden=S.reden||('situatie "'+sit.naam.toLowerCase()+'" deed zich niet voor');
    }
  }
  if(stil){ _bscState=null; return; }
  bscFinish();
}

/* ---- weergave: de checklist ---- */
const BSC_ICO={wacht:'⏳', meet:'🔵', ok:'✅', twijfel:'⚠️', geen:'⚪', nvt:'⏭️'};
// De rij staat al onder de kop van zijn situatie; die hoeft er niet nog eens
// achter. Wat overblijft zijn de extra eisen (bedrijfswarm, ≥40 km/u).
function bscWachtTekst(t, reden){
  const eigen=(BSC_SIT[t.sit||'draaiend']||{naam:''}).naam.toLowerCase();
  const rest=String(reden||'').split(' + ').filter(x=>x && x!==eigen);
  return rest.length ? 'wacht: '+rest.join(' + ') : 'wacht';
}
function bscTekenLijst(){
  const per={};
  _bscState.list.forEach(t=>{ const k=t.sit||'draaiend'; (per[k]=per[k]||[]).push(t); });
  const volgorde=Object.keys(BSC_SIT).filter(k=>per[k]);
  bscRender(
    `<div class="bsc-kop">
       <div id="bscNu" class="bsc-nu"></div>
       <div id="bscVolgende" class="bsc-volgende"></div>
       <div class="bsc-teller"><span id="bscTel"></span>
         <button class="btn" onclick="bscStop(false)">■ Stop en maak rapport</button></div>
     </div>`+
    volgorde.map(k=>`<div class="bsc-sit" data-sit="${k}">
       <div class="bsc-sit-h">${BSC_SIT[k].ico} ${BSC_SIT[k].naam}</div>
       ${per[k].map(t=>`<div class="bsc-rij" id="bscR-${t.id}" title="${(t.uitleg||'').replace(/"/g,'&quot;')}">
          <span class="bsc-ico"></span><span class="bsc-rnaam">${t.naam}</span><span class="bsc-rst"></span></div>`).join('')}
     </div>`).join(''));
}
function bscWerkLijstBij(sits){
  if(!_bscState) return;
  const f=(v,pid)=>(typeof fv==='function')?fv(v,pid):v;
  let klaar=0, meet=0;
  const wachtPer={};
  for(const t of _bscState.list){
    const S=_bscState.stand[t.id], rij=document.getElementById('bscR-'+t.id);
    if(S.st!=='wacht'&&S.st!=='meet') klaar++;
    if(S.st==='meet') meet++;
    if(S.st==='wacht' && t.sit!=='koud') wachtPer[t.sit||'draaiend']=(wachtPer[t.sit||'draaiend']||0)+1;
    if(!rij) continue;
    const eh=(getPidDef(t.pid)||{}).unit||'';
    rij.className='bsc-rij '+S.st;
    rij.querySelector('.bsc-ico').textContent=BSC_ICO[S.st]||'';
    rij.querySelector('.bsc-rst').textContent =
      S.st==='ok'      ? f(S.v,t.pid)+(eh?' '+eh:'')
    : S.st==='meet'    ? (S.v!==undefined ? f(S.v,t.pid)+(eh?' '+eh:'')+' · '+Math.min(t.hold||4, Math.floor(S.held))+'/'+(t.hold||4)+' s' : 'wacht op meetwaarde')
    : S.st==='wacht'   ? bscWachtTekst(t, S.reden)
    : S.reden || '';
  }
  const tel=document.getElementById('bscTel');
  if(tel) tel.textContent=klaar+'/'+_bscState.list.length+' afgerond';
  const nuEl=document.getElementById('bscNu');
  if(nuEl){
    const actief=Object.keys(BSC_SIT).filter(k=>sits.has(k) && k!=='contact' && k!=='koud');
    const hoofd=actief[0];
    nuEl.textContent = hoofd ? 'Nu: '+BSC_SIT[hoofd].ico+' '+BSC_SIT[hoofd].naam+(meet?' — '+meet+' test'+(meet===1?'':'s')+' meet'+(meet===1?'':'en'):'')
                             : 'Nu: geen situatie herkend — is de motor aan en de verbinding er?';
  }
  // De volgende kans: de situatie waar de meeste tests op wachten.
  const vol=document.getElementById('bscVolgende');
  if(vol){
    const kans=Object.keys(wachtPer).filter(k=>!sits.has(k)).sort((a,b)=>wachtPer[b]-wachtPer[a])[0];
    let doe=kans ? BSC_SIT[kans].doe : '';
    if(kans==='stationair' && typeof plStationairUitleg==='function'){
      try{ doe=plStationairUitleg((typeof detectEngineType==='function')?detectEngineType():'', doe); }
      catch(e){ console.warn('Systeemtest: motortype onbekend voor de stationair-uitleg', e); }
    }
    vol.textContent = kans ? 'Volgende kans: '+BSC_SIT[kans].ico+' '+doe+' ('+wachtPer[kans]+' test'+(wachtPer[kans]===1?'':'s')+' wacht'+(wachtPer[kans]===1?'':'en')+' hierop)' : '';
  }
}

function bscFinish(){
  const R=_bscState ? _bscState.list.map(t=>{ const S=_bscState.stand[t.id];
    return {id:t.id, naam:t.naam, status:S.st, waarde:S.v, unit:(getPidDef(t.pid)?.unit||''), pid:t.pid, reden:S.reden, sit:t.sit}; }) : [];
  window._bscLast=R;
  const ok=R.filter(r=>r.status==='ok').length;
  const tw=R.filter(r=>r.status==='twijfel').length;
  const gn=R.filter(r=>r.status==='geen').length;
  const nv=R.filter(r=>r.status==='nvt').length;
  const rows=R.map(r=>{
    const ic=r.status==='ok'?'✅':r.status==='twijfel'?'⚠️':r.status==='nvt'?'⏭️':'⚪';
    const kl=r.status==='ok'?'ok':r.status==='twijfel'?'warn':'mut';
    const val=r.status==='nvt'
      ? ('niet getest \u2014 '+(r.reden||'situatie deed zich niet voor'))
      : (r.waarde!==undefined?`${(typeof fv==='function')?fv(r.waarde, r.pid):r.waarde} ${r.unit}`
                             :('geen data'+(r.reden?' — '+r.reden:'')));
    const vb=(r.status==='twijfel'&&r.pid&&window.PLVerify&&connected&&!demoMode)
      ?` <button class="btn" style="padding:4px 9px;font-size:11px" onclick="plVerifyBscRow('${r.id}','${r.pid}',this)">🔍</button>`:'';
    return `<div class="bsc-row ${kl}"><span>${ic} ${r.naam}${vb}</span><span class="bsc-val">${val}</span></div>`;
  }).join('');
  bscRender(
    `<div class="bsc-done">
       <div class="bsc-score"><b>${ok}</b>/${R.length-nv-gn} geteste systemen groen${tw?` · ${tw} twijfel`:''}${gn?` · ${gn} geen data`:''}${nv?` · ${nv} niet getest`:''}</div>
       <div class="bsc-rows">${rows||'<div class="bsc-empty">Geen resultaten.</div>'}</div>
       <div class="toolbar" style="margin-top:12px">
         <button class="btn pri" onclick="startBasicCheck()">🔄 Opnieuw</button>
         <button class="btn" onclick="bscExport()">💾 Exporteer</button>
       </div>
     </div>`);
  try{ scanLogAdd?.({type:'basischeck', msg:`${ok}/${R.length-nv-gn} groen (${tw} twijfel, ${gn} geen data, ${nv} niet getest)`}); }catch(e){ console.warn('scanLogAdd mislukt:', e); }
  try{ if(window.PidLaneEvalLog&&PidLaneEvalLog.active) PidLaneEvalLog.log('app','basischeck: '+ok+'/'+R.length+' groen'); }catch(e){ /* stil: eigen telemetrielog (PidLaneEvalLog) — mag de basischeck nooit blokkeren */ }
  _bscState=null;
}

function bscExport(){
  const R=window._bscLast||[];
  const v=(typeof getVehicle==='function')?getVehicle():{};
  const lines=['PidLane — Basic System Check', 'Datum: '+new Date().toLocaleString('nl'),
    v.merk?`Voertuig: ${v.merk} ${v.model||''} ${v.year||''}`:'',''];
  R.forEach(r=>lines.push(`[${(r.status||'').toUpperCase()}] ${r.naam}: ${r.waarde!==undefined?r.waarde+' '+r.unit:'geen data'}${r.reden?' — '+r.reden:''}`));
  try{ download(plBestandsnaam('basic-system-check','txt'), lines.join('\n')); }catch(e){ console.warn('download mislukt:', e); }
}

/* ---- weergave ---- */
function bscRender(html){ const el=document.getElementById('bscBody'); if(el) el.innerHTML=html; }
function bscToast(m){ try{ showToast?.(m,2600); }catch(e){ /* stil: melding mag nooit de stroom breken */ } }

