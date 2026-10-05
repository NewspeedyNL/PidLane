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
const VERS_MS = 2000;          // geen event in zoveel tijd: geen waarde
const NUL_LS = 'pl_telemetrie_nul';

const DEFS = {
  TL01:{ name:'Helling (telefoon)', unit:'°', cat:'Telemetrie', min:-45, max:45,
         uitleg:'Voorover/achterover t.o.v. de nulstand. Positief = neus omhoog. Uit de oriëntatiesensor van de telefoon; wijkt uit bij remmen en optrekken.' },
  TL02:{ name:'Kanteling (telefoon)', unit:'°', cat:'Telemetrie', min:-45, max:45,
         uitleg:'Zijwaarts t.o.v. de nulstand. Positief = rechterkant omlaag. Uit de oriëntatiesensor van de telefoon; wijkt uit in een bocht.' }
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
function hoeken(u, nul){
  u=u && norm(u); nul=nul && norm(nul);
  if (!u || !nul) return null;
  const kand=Math.abs(nul[2])<0.7 ? [0,0,-1] : [0,1,0];
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

function beschikbaar(){ return _events>0; }
function vers(){ return !!_u && Date.now()-_t<=VERS_MS; }
function nu(){ return vers() ? hoeken(_u, _nul || standaardNul(_u)) : null; }

/* De huidige stand wordt 0°. Geeft true als dat lukte. Niet in de demo:
   die bewaart niets (PLDemo vangt localStorage al af, dit is de tweede rem). */
function nulstellen(){
  if (!vers()) return false;
  _nul=_u.slice();
  if (!(typeof demoMode!=='undefined' && demoMode)){
    try{ localStorage.setItem(NUL_LS, JSON.stringify(_nul)); }
    catch(e){ console.warn('PLTelemetrie: nulstand niet bewaard', e); }
  }
  try{ if (typeof log==='function') log('📐 Telemetrie: nulstand vastgelegd — helling en kanteling zijn nu 0°','info'); }
  catch(e){ console.warn('PLTelemetrie: logregel', e); }
  return true;
}
function genuld(){ return !!_nul; }

function defs(){
  if (!beschikbaar()) return [];
  return Object.keys(DEFS).map(pid=>Object.assign({ pid, telemetrie:true }, DEFS[pid]));
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
function stats(){ return { events:_events, n:_s.n, genuld:genuld(), nu:nu(), geweigerd:_s.geweigerd.slice() }; }

let _tikFout='';
function tik(){
  try{
    if (typeof activePIDs==='undefined' || typeof updPID!=='function') return;
    const h=nu();
    if (!h) return;
    if (activePIDs.has('TL01')){ updPID('TL01', h.helling); _s.n++; }
    if (activePIDs.has('TL02')){ updPID('TL02', h.kanteling); _s.n++; }
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
  tik, stats, weiger, _opEvent:opEvent };
window.plIsTelemetrie = isTelemetrie;
window.plTelemetrieDefs = defs;
if (typeof setInterval==='function') setInterval(tik, TIK_MS);
})();
