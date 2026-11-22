// ══════════════════════════════════════════════════════════════════
// pidlane-werkgebied.js — PLWerkgebied: waar de motor draait (22-11-2026)
// ──────────────────────────────────────────────────────────────────
// Voor het profiel Klassiek van Slim visueel: een oude auto met weinig
// sensoren. Uit het gebruik: "veel lege plekken". Wat zo'n auto wél geeft —
// toerental, last, de brandstoftrims en de lambdasonde voor de kat — zegt
// samen meer dan los:
//
//   RASTER   hoeveel tijd de motor in elk vak van last × toeren doorbracht
//            (NX × NY vakken). Laat zien waar de rit zich afspeelde.
//   TRIM     de brandstofcorrectie (kort + lang) per gebied: stationair,
//            deellast, zware last. Het VERSCHIL tussen de gebieden is de
//            diagnose: alleen arm bij stationair = valse lucht (die telt
//            zwaar bij weinig luchtstroom), alleen arm bij zware last =
//            brandstoftoevoer (pomp, filter, druk), overal arm = meting van
//            de lucht of de druk. Alleen met een warme motor (koelwater
//            ≥ WARM): koud regelt de ECU niet met de sonde (open loop).
//   LAMBDA   de sonde voor de kat (0114) moet tussen rijk en arm heen en
//            weer gaan. Het oordeel kijkt naar het BEREIK in een venster,
//            niet naar een frequentie: een oude adapter meet 0114 hooguit
//            een paar keer per seconde, en dan telt een frequentie te laag.
//
// Puur: nieuw(), voeg(), cel(), gebied(), trimPerGebied(), trimOordeel(),
// o2Oordeel(). De tijd komt van buiten. Met toestand: voed() en live() — de
// laatste waarde per rol, en één model voor deze rit. Een pauze langer dan
// PAUZE_MS begint een nieuw model. Geen bus-I/O, niets in localStorage.
// Test: test-werkgebied.js
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

const NX = 12, NY = 8;
const PAUZE_MS = 10*60*1000;   // langer stil = een nieuwe rit
const DT_MAX = 2000;           // één stap telt hooguit zo lang (een gat in de meting is geen rijtijd)
const VERS_MS = 2500;          // last en trims moeten zo vers zijn om bij een toerental te horen
const KOEL_VERS_MS = 60000;
const WARM = 70;               // °C: daaronder regelt de ECU niet met de sonde
const MIN_MS = 10000;          // minder dan 10 s in een gebied = nog geen oordeel
const O2_VENSTER = 20000, O2_BEWAAR = 30000;
const GEBIEDEN = ['stationair','deellast','zwaar'];
const GEBIED_NAAM = { stationair:'Stationair', deellast:'Deellast', zwaar:'Zware last' };

function nieuw(){
  const trim={};
  GEBIEDEN.forEach(function(g){ trim[g]={ som:0, ms:0 }; });
  return { t:null, ms:new Array(NX*NY).fill(0), totaal:0, trim:trim };
}
function getal(v){ const n=Number(v); return (v===null || v===undefined || v==='' || !isFinite(n)) ? null : n; }
/* Het vak van een toerental en een last, of null. Puur. */
function cel(rpm, last, rpmMax){
  const r=getal(rpm), l=getal(last);
  if(r===null || l===null || !(rpmMax>0) || r<0) return null;
  const i=Math.min(NX-1, Math.max(0, Math.floor(r/rpmMax*NX)));
  const j=Math.min(NY-1, Math.max(0, Math.floor(l/100*NY)));
  return j*NX+i;
}
/* Puur. Stationair: lage toeren en weinig last. Zwaar: vanaf 60% last —
   daarboven, bij vol gas, staat de ECU vaak in open loop en zegt de korte
   trim niets, maar de lange telt wel. */
function gebied(rpm, last){
  const r=getal(rpm), l=getal(last);
  if(r===null || l===null) return null;
  if(r<1100 && l<35) return 'stationair';
  return l>=60 ? 'zwaar' : 'deellast';
}
/* Eén meting erbij. s = { rpm, last, trim, koel, rpmMax }. Telt de tijd
   sinds de vorige meting bij `m` op en geeft het model terug; na een lange
   pauze (of een klok die terugloopt) een nieuw model en blijft `m` zoals hij was. */
function voeg(m, s, t){
  if(!m || m.t===null || t-m.t>PAUZE_MS || t<m.t) { const n=nieuw(); n.t=t; m=n; return voegIn(m, s, 0); }
  const dt=Math.min(DT_MAX, t-m.t);
  m.t=t;
  return voegIn(m, s, dt);
}
function voegIn(m, s, dt){
  if(!dt || !s) return m;
  const c=cel(s.rpm, s.last, s.rpmMax);
  if(c===null) return m;
  m.ms[c]+=dt; m.totaal+=dt;
  const tr=getal(s.trim), k=getal(s.koel), g=gebied(s.rpm, s.last);
  if(tr!==null && k!==null && k>=WARM && getal(s.rpm)>400 && g){ m.trim[g].som+=tr*dt; m.trim[g].ms+=dt; }
  return m;
}
/* De gemiddelde trim per gebied in %, null als er te weinig tijd is. Puur. */
function trimPerGebied(m){
  const uit={};
  GEBIEDEN.forEach(function(g){
    const x=m && m.trim && m.trim[g];
    uit[g]=(x && x.ms>=MIN_MS) ? x.som/x.ms : null;
  });
  return uit;
}
/* Het oordeel over de trims. Puur. st: ok/let/slecht/meet. */
function trimOordeel(tpg){
  const w=GEBIEDEN.map(function(g){ return tpg ? tpg[g] : null; }).filter(function(v){ return v!==null; });
  if(!w.length) return { st:'meet', tekst:'meet nog', uitleg:'Rijd met een warme motor: per gebied is minstens 10 seconden nodig.' };
  const s=tpg.stationair, d=tpg.deellast, z=tpg.zwaar;
  if(w.some(function(v){ return Math.abs(v)>=20; })){
    const arm=w.some(function(v){ return v>=20; });
    return { st:'slecht', tekst:arm ? 'erg arm' : 'erg rijk',
      uitleg:arm ? 'De ECU voegt 20% of meer brandstof toe. Laat dit nakijken: valse lucht, luchtmassameter of brandstofdruk.'
                 : 'De ECU haalt 20% of meer brandstof weg: lekkende injector, te hoge brandstofdruk of een sonde die liegt.' };
  }
  if(s!==null && d!==null && s>=10 && s-d>=8)
    return { st:'let', tekst:'arm bij stationair', uitleg:'Alleen bij weinig luchtstroom arm: dat past bij valse lucht (slang, inlaatpakking, PCV).' };
  if(z!==null && d!==null && z>=10 && z-d>=8)
    return { st:'let', tekst:'arm bij zware last', uitleg:'Alleen arm als er veel brandstof nodig is: dat past bij de toevoer (pomp, filter, drukregelaar).' };
  if(w.some(function(v){ return Math.abs(v)>=10; })){
    const arm=w.some(function(v){ return v>=10; });
    return { st:'let', tekst:arm ? 'overal wat arm' : 'overal wat rijk',
      uitleg:arm ? 'In elk gebied ongeveer even arm: eerder de luchtmassameter of de brandstofdruk dan een lek.'
                 : 'In elk gebied wat rijk: kijk naar de injectoren, de brandstofdruk of het luchtfilter.' };
  }
  return { st:'ok', tekst:'mengsel in orde', uitleg:'De correctie blijft in elk gebied binnen ±10%.' };
}
/* De lambdasonde in het venster tot `nu`. hist = [{t,v}] in volt. Puur.
   Alleen een warme motor wordt beoordeeld; "hangt" is geel en nooit rood:
   een lange afdaling met gas los (brandstof af) houdt de sonde ook arm. */
function o2Oordeel(hist, nu, warm){
  if(warm===false) return { st:'meet', tekst:'motor koud', uitleg:'Koud regelt de ECU niet met de sonde. Oordeel vanaf 70 °C.' };
  const w=(hist||[]).filter(function(q){ return q && nu-q.t<=O2_VENSTER && getal(q.v)!==null; });
  if(w.length<6) return { st:'meet', tekst:'meet nog', uitleg:'Te weinig metingen van de sonde in de laatste 20 seconden.' };
  let lo=Infinity, hi=-Infinity;
  w.forEach(function(q){ lo=Math.min(lo, q.v); hi=Math.max(hi, q.v); });
  const bereik=lo.toFixed(1).replace('.',',')+'–'+hi.toFixed(1).replace('.',',')+' V';
  if(lo<0.3 && hi>0.6) return { st:'ok', tekst:'schakelt', bereik:bereik, uitleg:'Gaat heen en weer tussen arm en rijk: de ECU regelt.' };
  if(hi<0.45) return { st:'let', tekst:'hangt arm', bereik:bereik, uitleg:'Blijft onder 0,45 V. Bij gas los is dat normaal; met gas erop wijst het op valse lucht of een moeie sonde.' };
  if(lo>0.45) return { st:'let', tekst:'hangt rijk', bereik:bereik, uitleg:'Blijft boven 0,45 V: te veel brandstof of een vervuilde sonde.' };
  return { st:'let', tekst:'traag', bereik:bereik, uitleg:'Beweegt, maar haalt arm en rijk niet. Een oude sonde reageert zo.' };
}

// ── Met toestand: de rit van nu ────────────────────────────────────
let _m=nieuw(), _o2=[], _laatst={}, _rpmMax=8000;
function vers(rol, nu, ms){ const x=_laatst[rol]; return (x && nu-x.t<=ms) ? x.v : null; }
/* Eén waarde van een plek van Klassiek. rol = de rol in het profiel. */
function voed(rol, v, nu, rpmMax){
  const n=getal(v);
  if(n===null) return;
  if(rpmMax>0) _rpmMax=rpmMax;
  _laatst[rol]={ v:n, t:nu };
  if(rol==='o2'){
    _o2.push({ t:nu, v:n });
    while(_o2.length && nu-_o2[0].t>O2_BEWAAR) _o2.shift();
  }
  if(rol!=='toeren') return;
  const last=vers('last', nu, VERS_MS);
  if(last===null) return;
  const k=vers('kort', nu, VERS_MS), l=vers('lang', nu, VERS_MS);
  const trim=(k===null && l===null) ? null : (k||0)+(l||0);
  _m=voeg(_m, { rpm:n, last:last, trim:trim, koel:vers('koel', nu, KOEL_VERS_MS), rpmMax:_rpmMax }, nu);
}
function live(nu){
  const k=vers('koel', nu, KOEL_VERS_MS);
  return { model:_m, o2:_o2.slice(), rpm:vers('toeren', nu, VERS_MS), last:vers('last', nu, VERS_MS), rpmMax:_rpmMax,
           warm:k===null ? null : k>=WARM };
}
function wis(){ _m=nieuw(); _o2=[]; _laatst={}; }

window.PLWerkgebied = {
  NX:NX, NY:NY, PAUZE_MS:PAUZE_MS, DT_MAX:DT_MAX, WARM:WARM, MIN_MS:MIN_MS, O2_VENSTER:O2_VENSTER,
  GEBIEDEN:GEBIEDEN, GEBIED_NAAM:GEBIED_NAAM,
  nieuw:nieuw, cel:cel, gebied:gebied, voeg:voeg, trimPerGebied:trimPerGebied, trimOordeel:trimOordeel, o2Oordeel:o2Oordeel,
  voed:voed, live:live, wis:wis
};
})();
