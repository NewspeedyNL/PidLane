// ══════════════════════════════════════════════════════════════════
// pidlane-telemetrie.js — PLTelemetrie: sensoren van de telefoon (05-10-2026)
// ──────────────────────────────────────────────────────────────────
// WAT DIT IS
// Helling (TL01, pitch) en kanteling (TL02, roll) van de auto, gemeten met
// de oriëntatiesensor van het toestel. Ze staan in de keuzelijst onder
// "Telemetrie", krijgen een tegel en een grafiek zoals elke sensor — maar ze
// komen niet van de auto, ook niet uitgerekend uit wat de auto zegt. Daarom
// een eigen voorvoegsel en niet onder PLBerekend: "berekend" betekent "uit
// PIDs van de auto", en één ding heeft één betekenis.
//
// DE GRENS: NOOIT DE BUS OP
// Dezelfde drie plekken als bij de berekende PIDs (pidlane-berekend.js):
//   1. pidsDueNow()/_pollWacht() (pidlane-plload.js) slaan ze over;
//   2. sendCmd() (pidlane-bt.js) weigert TL.. en telt dat (weiger());
//   3. ze komen nooit in supportedPIDs.
//
// ALLEEN ALS HET TOESTEL HET KAN
// defs() geeft pas iets terug als er een deviceorientation-event mét beta en
// gamma binnenkwam. Een desktopbrowser of een telefoon zonder sensor krijgt
// de categorie dus niet: een tegel die altijd "—" zegt leest als kapot.
//
// HOE DE HOEK TOT STAND KOMT
// Uit beta en gamma volgt de richting van "omhoog" in het assenstelsel van
// het toestel (alpha, het kompas, valt eruit — een bocht is geen kanteling).
// Die vector gaat door een laagdoorlaatfilter (trillingen), en wordt
// vergeleken met een NULSTAND: de richting van omhoog toen de auto stil op
// vlakke grond stond (Nulstellen). Zonder nulstand geldt de toestelas die
// het dichtst bij omhoog ligt — dan is het de ruwe hoek van de telefoon in
// zijn houder. Vooruit is de achterkant van het scherm, of de bovenkant als
// het toestel plat ligt.
//
// WAT HET NIET IS
// De oriëntatiesensor voelt ook versnelling. Bij hard remmen of optrekken
// wijkt de helling uit, in een bocht de kanteling. Het is een indicatie bij
// stilstand of constante snelheid, geen hellingmeter van een landmeter.
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

const TIK_MS = 200;
const TAU_MS = 600;            // laagdoorlaat: tijdconstante van het filter
/* #404: met 600 ms volgde de tegel gas, rem en stuur. Een helling verandert
   traag; na de correctie hieronder mag het filter dus veel trager. */
const TAU_HELLING_MS = 2500;
const G = 9.81;
// Vooruit leren: zo hard remmen of optrekken, rechtuit, zo vaak.
const LEER = { minA:1.5, minKmh:10, maxGier:0.05, nodig:25 };
const VOOR_LS = 'pl_telemetrie_voor';
const VERS_MS = 2000;          // geen event in zoveel tijd: geen waarde
const NUL_LS = 'pl_telemetrie_nul';

const DEFS = {
  TL01:{ name:'Helling (telefoon)', unit:'°', cat:'Telemetrie', min:-45, max:45,
         uitleg:'Voorover/achterover t.o.v. de nulstand. Positief = neus omhoog. Uit de bewegingssensoren van de telefoon; remmen en optrekken worden eraf gerekend met de snelheid (010D). Traag gefilterd: een helling, geen G-meter.' },
  TL02:{ name:'Kanteling (telefoon)', unit:'°', cat:'Telemetrie', min:-45, max:45,
         uitleg:'Zijwaarts t.o.v. de nulstand. Positief = rechterkant omlaag. Uit de bewegingssensoren van de telefoon; een bocht wordt eraf gerekend met snelheid × gyroscoop.' },
  // Alleen met devicemotion (versnellingsmeter): de G-cirkel van Slim visueel.
  TL03:{ name:'Lengte-G (telefoon)', unit:'g', cat:'Telemetrie', min:-1.5, max:1.5, motion:true,
         uitleg:'Versnelling in de rijrichting. Positief = optrekken, negatief = remmen.' },
  TL04:{ name:'Zij-G (telefoon)', unit:'g', cat:'Telemetrie', min:-1.5, max:1.5, motion:true,
         uitleg:'Versnelling dwars op de rijrichting. Positief = naar rechts (een bocht naar rechts), negatief = een bocht naar links.' }
};

function isTelemetrie(pid){ return Object.prototype.hasOwnProperty.call(DEFS, String(pid||'').toUpperCase()); }

const RAD = Math.PI/180;
/* Puur: de richting van omhoog in toestelcoördinaten, uit beta en gamma in
   graden (W3C: rotatie Z-X'-Y''). Plat op tafel → (0,0,1), rechtop → (0,1,0). */
function omhoog(beta, gamma){
  if (typeof beta!=='number' || typeof gamma!=='number' || !isFinite(beta) || !isFinite(gamma)) return null;
  const b=beta*RAD, g=gamma*RAD;
  return [-Math.cos(b)*Math.sin(g), Math.sin(b), Math.cos(b)*Math.cos(g)];
}
function norm(v){
  const l=Math.hypot(v[0], v[1], v[2]);
  return l>1e-9 ? [v[0]/l, v[1]/l, v[2]/l] : null;
}
function dot(a, b){ return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function kruis(a, b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
/* Puur: zonder nulstand de toestelas die het dichtst bij omhoog ligt. */
function standaardNul(u){
  let i=0; for (let k=1; k<3; k++) if (Math.abs(u[k])>Math.abs(u[i])) i=k;
  const n=[0,0,0]; n[i]=u[i]<0 ? -1 : 1; return n;
}
/* Puur: helling en kanteling in graden van omhoog-vector u t.o.v. nulstand
   nul. Vooruit = achterkant van het scherm (−z) loodrecht op nul; ligt het
   toestel (bijna) plat, dan de bovenkant (+y). */
function hoeken(u, nul, geleerd){
  u=u && norm(u); nul=nul && norm(nul);
  if (!u || !nul) return null;
  const kand=geleerd || (Math.abs(nul[2])<0.7 ? [0,0,-1] : [0,1,0]);
  const p=dot(kand, nul);
  const voor=norm([kand[0]-p*nul[0], kand[1]-p*nul[1], kand[2]-p*nul[2]]);
  if (!voor) return null;
  const rechts=kruis(voor, nul);
  const r1=x=>Math.round(x*10)/10;
  const asin=x=>Math.asin(Math.max(-1, Math.min(1, x)))/RAD;
  return { helling:r1(asin(dot(u, voor))), kanteling:r1(asin(-dot(u, rechts))) };
}

// ── de stand van de sensor ──
let _u=null, _t=0, _events=0, _nul=null;
try{ const r=localStorage.getItem(NUL_LS); if (r) _nul=norm(JSON.parse(r)); }
catch(e){ console.warn('PLTelemetrie: nulstand onleesbaar', e); _nul=null; }

function opEvent(e){
  const u=omhoog(e && e.beta, e && e.gamma);
  if (!u) return;
  const nu=Date.now();
  if (!_u || nu-_t>VERS_MS) _u=u;
  else {
    const a=1-Math.exp(-(nu-_t)/TAU_MS);
    _u=norm([_u[0]+a*(u[0]-_u[0]), _u[1]+a*(u[1]-_u[1]), _u[2]+a*(u[2]-_u[2])]) || u;
  }
  _t=nu; _events++;
}
if (typeof window!=='undefined' && typeof window.addEventListener==='function')
  window.addEventListener('deviceorientation', opEvent);

/* ── VERSNELLING ERAF (05-10-2026, #404) ──
   De oriëntatiesensor ziet remmen als voorover en een bocht als kanteling.
   devicemotion geeft accelerationIncludingGravity: de versnelling van de auto
   plus 9,81 m/s² omhoog. De auto-versnelling kennen we zelf: in de rijrichting
   uit 010D (dv/dt), dwars uit snelheid × gierhoeksnelheid (gyroscoop). Trek die
   eraf, dan blijft de zwaartekracht over — en dus de echte helling.
   Vooruit wordt geleerd: bij remmen en optrekken in een rechte lijn wijst de
   horizontale versnelling langs de rijrichting. */
let _g=null, _gT=0;
const TAU_G_MS = 300;
let _m=null, _mT=0, _mEvents=0, _gier=0, _voor=null, _leer={ som:[0,0,0], n:0 };
try{ const r=localStorage.getItem(VOOR_LS); if (r) _voor=norm(JSON.parse(r)); }
catch(e){ console.warn('PLTelemetrie: geleerd vooruit onleesbaar', e); _voor=null; }

/* Puur: versnelling in m/s² langs de weg uit snelheidsmetingen [{t,v km/u}].
   Over het laatste stuk van minstens 0,5 s; anders null. */
function lengteA(hist, nu){
  if (!hist || hist.length<2) return null;
  const b=hist[hist.length-1];
  if (typeof b.v!=='number' || nu-b.t>VERS_MS) return null;
  for (let i=hist.length-2; i>=0; i--){
    const a=hist[i];
    if (b.t-a.t>=500){ return (typeof a.v==='number' && b.t-a.t<=3000) ? ((b.v-a.v)/3.6)/((b.t-a.t)/1000) : null; }
  }
  return null;
}
/* Puur: omhoog uit gemeten ag (m/s², toestelassen) min de auto-versnelling. */
function zwaarte(ag, aLang, aDwars, voor, rechts){
  const a=[0,0,0];
  for (let k=0;k<3;k++) a[k]=ag[k]-(aLang||0)*voor[k]-(aDwars||0)*rechts[k];
  return norm(a);
}
function assen(nul){
  const kand=_voor || (Math.abs(nul[2])<0.7 ? [0,0,-1] : [0,1,0]);
  const p=dot(kand, nul);
  const voor=norm([kand[0]-p*nul[0], kand[1]-p*nul[1], kand[2]-p*nul[2]]);
  return voor ? { voor, rechts:kruis(voor, nul) } : null;
}
function snelheid(){
  const h=(typeof pidHist!=='undefined' && pidHist) ? pidHist['010D'] : null;
  return h && h.length ? h : null;
}
function opMotion(e){
  const g=e && e.accelerationIncludingGravity;
  if (!g || typeof g.x!=='number' || typeof g.y!=='number' || typeof g.z!=='number') return;
  const ag=[g.x, g.y, g.z], nu=Date.now();
  const ref=_nul || (_u ? standaardNul(_u) : standaardNul(ag));
  const ax=assen(ref);
  if (!ax) return;
  const r=e.rotationRate;   // °/s: alpha om z, beta om x, gamma om y
  if (r && typeof r.alpha==='number') _gier=dot([r.beta*RAD, r.gamma*RAD, r.alpha*RAD], ref);
  const h=snelheid(), kmh=h ? h[h.length-1].v : null;
  const vers=h && nu-h[h.length-1].t<=VERS_MS;
  const aL=vers ? lengteA(h, nu) : null;
  // Links om (gier > 0): de middelpuntzoekende kracht wijst naar links (−rechts).
  const aD=(vers && typeof kmh==='number') ? -(kmh/3.6)*_gier : 0;
  const u=zwaarte(ag, aL, aD, ax.voor, ax.rechts);
  if (!u) return;
  if (!_m || nu-_mT>VERS_MS) _m=u;
  else {
    const a=1-Math.exp(-(nu-_mT)/TAU_HELLING_MS);
    _m=norm([_m[0]+a*(u[0]-_m[0]), _m[1]+a*(u[1]-_m[1]), _m[2]+a*(u[2]-_m[2])]) || u;
  }
  // G: wat er van ag overblijft na de (trage) zwaartekracht, langs de assen.
  const lin=[ag[0]-G*_m[0], ag[1]-G*_m[1], ag[2]-G*_m[2]];
  const gL=dot(lin, ax.voor)/G, gD=dot(lin, ax.rechts)/G;
  const b=(_gT && nu-_gT<=VERS_MS) ? 1-Math.exp(-(nu-_gT)/TAU_G_MS) : 1;
  _g={ lengte:_g ? _g.lengte+b*(gL-_g.lengte) : gL, dwars:_g ? _g.dwars+b*(gD-_g.dwars) : gD };
  _gT=nu;
  _mT=nu; _mEvents++;
  if (_nul && aL!==null) leer(ag, aL, kmh, _gier);
  situatieTel(aL, aD, nu);
}
/* Vooruit leren: horizontale rest van ag, met het teken van dv/dt. */
function leer(ag, aL, kmh, gier){
  if (_voor || Math.abs(aL)<LEER.minA || !(kmh>=LEER.minKmh) || Math.abs(gier)>LEER.maxGier) return;
  const h=[0,0,0];
  for (let k=0;k<3;k++) h[k]=ag[k]-G*_nul[k];
  const p=dot(h, _nul);
  const t=Math.sign(aL)/Math.abs(aL);
  for (let k=0;k<3;k++) _leer.som[k]+=(h[k]-p*_nul[k])*t;
  _leer.n++;
  if (_leer.n<LEER.nodig) return;
  const v=norm(_leer.som);
  if (!v) return;
  _voor=v;
  if (!(typeof demoMode!=='undefined' && demoMode)){
    try{ localStorage.setItem(VOOR_LS, JSON.stringify(_voor)); }
    catch(e){ console.warn('PLTelemetrie: geleerd vooruit niet bewaard', e); }
  }
  try{ if (typeof log==='function') log('📐 Telemetrie: rijrichting geleerd uit '+_leer.n+' rem- en optrekmomenten','info'); }
  catch(e){ console.warn('PLTelemetrie: logregel', e); }
}
if (typeof window!=='undefined' && typeof window.addEventListener==='function')
  window.addEventListener('devicemotion', opMotion);

/* ── RIJSITUATIE (#404) ──
   Een getal op een tegel zegt weinig; wat telt is wat de helling bevestigt.
   Puur: klimmen = helling omhoog met belasting en zonder snelheidswinst;
   dalen = helling omlaag zonder belasting; hard remmen, hard optrekken en
   een scherpe bocht als drempels op de versnelling. */
const SIT = { helling:4, belastingKlim:50, belastingDaal:20, hardRem:-3.5, hardOp:3, bocht:4 };
function situatie(o){
  const uit=[];
  if (typeof o.helling==='number'){
    if (o.helling>=SIT.helling && o.belasting>=SIT.belastingKlim && !(o.aLang>0.5)) uit.push('klim');
    if (o.helling<=-SIT.helling && typeof o.belasting==='number' && o.belasting<=SIT.belastingDaal) uit.push('daal');
  }
  if (typeof o.aLang==='number' && o.aLang<=SIT.hardRem) uit.push('hardRemmen');
  if (typeof o.aLang==='number' && o.aLang>=SIT.hardOp) uit.push('hardOptrekken');
  if (typeof o.aDwars==='number' && Math.abs(o.aDwars)>=SIT.bocht) uit.push('scherpeBocht');
  return uit;
}
let _sit={ s:{ klim:0, daal:0 }, n:{ hardRemmen:0, hardOptrekken:0, scherpeBocht:0 }, nu:[], t:0, was:{} };
function situatieTel(aL, aD, nu){
  if (nu-_sit.t<1000) return;          // één oordeel per seconde
  const dt=_sit.t ? Math.min(2, (nu-_sit.t)/1000) : 1;
  _sit.t=nu;
  const h=hoekNu(), bel=(typeof pidVals!=='undefined' && pidVals) ? pidVals['0104'] : undefined;
  const s=situatie({ helling:h && h.helling, belasting:bel, aLang:aL, aDwars:aD });
  if (s.indexOf('klim')>=0) _sit.s.klim+=dt;
  if (s.indexOf('daal')>=0) _sit.s.daal+=dt;
  ['hardRemmen','hardOptrekken','scherpeBocht'].forEach(k=>{
    const aan=s.indexOf(k)>=0;
    if (aan && !_sit.was[k]) _sit.n[k]++;    // een gebeurtenis, geen seconden
    _sit.was[k]=aan;
  });
  _sit.nu=s;
}

function beschikbaar(){ return _events>0 || _mEvents>0; }
function vers(){ return (!!_u && Date.now()-_t<=VERS_MS) || (!!_m && Date.now()-_mT<=VERS_MS); }
/* Met devicemotion de gecorrigeerde helling, anders de oriëntatiesensor. */
function hoekNu(){
  const t=Date.now();
  if (_m && t-_mT<=VERS_MS) return hoeken(_m, _nul || standaardNul(_m), _voor);
  return vers() ? hoeken(_u, _nul || standaardNul(_u), _voor) : null;
}
function nu(){ return hoekNu(); }
function gNu(){ return (_g && Date.now()-_gT<=VERS_MS) ? { lengte:Math.round(_g.lengte*100)/100, dwars:Math.round(_g.dwars*100)/100 } : null; }

/* De huidige stand wordt 0°. Geeft true als dat lukte. Niet in de demo:
   die bewaart niets (PLDemo vangt localStorage al af, dit is de tweede rem). */
function nulstellen(){
  if (!vers()) return false;
  _nul=(_m && Date.now()-_mT<=VERS_MS ? _m : _u).slice();
  // Een nieuwe nulstand is een nieuwe houder: vooruit opnieuw leren.
  _voor=null; _leer={ som:[0,0,0], n:0 };
  try{ localStorage.removeItem(VOOR_LS); }catch(e){ console.warn('PLTelemetrie: geleerd vooruit niet gewist', e); }
  if (!(typeof demoMode!=='undefined' && demoMode)){
    try{ localStorage.setItem(NUL_LS, JSON.stringify(_nul)); }
    catch(e){ console.warn('PLTelemetrie: nulstand niet bewaard', e); }
  }
  try{ if (typeof log==='function') log('📐 Telemetrie: nulstand vastgelegd — helling en kanteling zijn nu 0°','info'); }
  catch(e){ console.warn('PLTelemetrie: logregel', e); }
  // Het piekballetje van de G-cirkel hoort bij de oude stand (#407).
  try{ if (typeof window.dispatchEvent==='function') window.dispatchEvent(new CustomEvent('pl:telemetrie-genuld')); }
  catch(e){ console.warn('PLTelemetrie: Nulstellen niet doorgegeven aan de G-cirkel', e); }
  return true;
}
function genuld(){ return !!_nul; }

function defs(){
  if (!beschikbaar()) return [];
  return Object.keys(DEFS).filter(pid=>!DEFS[pid].motion || _mEvents>0).map(pid=>Object.assign({ pid, telemetrie:true }, DEFS[pid]));
}

// ── sessiebewijs, net als PLBerekend ──
let _s={ geweigerd:[], n:0 };
function weiger(cmd){
  try{
    const stapel=String((new Error()).stack||'').split('\n').slice(2,5).map(x=>x.trim()).join(' ← ');
    _s.geweigerd.push({ t:Date.now(), cmd:String(cmd), waar:stapel.slice(0,300) });
    if (_s.geweigerd.length>50) _s.geweigerd.shift();
  }catch(e){ console.warn('PLTelemetrie: weigering niet geteld', e); }
}
function stats(){ return { events:_events, motion:_mEvents, n:_s.n, genuld:genuld(), voorGeleerd:!!_voor, leerN:_leer.n, nu:nu(),
  situatie:{ klimS:Math.round(_sit.s.klim), daalS:Math.round(_sit.s.daal), hardRemmen:_sit.n.hardRemmen,
    hardOptrekken:_sit.n.hardOptrekken, scherpeBocht:_sit.n.scherpeBocht, nu:_sit.nu.slice() },
  geweigerd:_s.geweigerd.slice() }; }

let _tikFout='';
function tik(){
  try{
    if (typeof activePIDs==='undefined' || typeof updPID!=='function') return;
    const h=nu();
    if (!h) return;
    if (activePIDs.has('TL01')){ updPID('TL01', h.helling); _s.n++; }
    if (activePIDs.has('TL02')){ updPID('TL02', h.kanteling); _s.n++; }
    const g=gNu();
    if (g && activePIDs.has('TL03')){ updPID('TL03', g.lengte); _s.n++; }
    if (g && activePIDs.has('TL04')){ updPID('TL04', g.dwars); _s.n++; }
    _tikFout='';
  }catch(e){
    const m=String(e && e.message || e);
    if (m!==_tikFout){ _tikFout=m; console.warn('PLTelemetrie: tik mislukt', e); }
  }
}

if (typeof window!=='undefined' && window.ALL_PID_DEFS) Object.keys(DEFS).forEach(pid=>{
  if (!window.ALL_PID_DEFS[pid]) window.ALL_PID_DEFS[pid]=Object.assign({ telemetrie:true }, DEFS[pid]);
});
window.PLTelemetrie = { DEFS, omhoog, hoeken, standaardNul, isTelemetrie, defs, nulstellen, genuld, nu, beschikbaar,
  tik, stats, weiger, gNu, lengteA, zwaarte, situatie, SIT, LEER, _opEvent:opEvent, _opMotion:opMotion };
window.plIsTelemetrie = isTelemetrie;
window.plTelemetrieDefs = defs;
if (typeof setInterval==='function') setInterval(tik, TIK_MS);
})();
