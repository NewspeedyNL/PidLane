// ══════════════════════════════════════════════════════════════════
// pidlane-hyperlane.js — Hyperlane, de blikvanger van Slim visueel (27-10-2026)
// ──────────────────────────────────────────────────────────────────
// Uit het gebruik: "die ene weergave die mij blijft imponeren … klant wil dit
// showen aan passagier." De andere profielen waren mooi, maar na een paar
// weken voorspelbaar: ze staan stil als de auto stilstaat. Deze niet.
//
//   achtergrond  een neon-tunnel in WebGL (één fragment-shader) die
//                meestroomt met de snelheid; lichtstrepen worden dichter
//                naarmate je harder gaat
//   kleur        volgt het rijgedrag: ijsblauw (rustig) → cyaan → violet →
//                amber → rood bij de begrenzer (stemming(), kleur())
//   ringen       links toeren, rechts snelheid, in perspectief gekanteld; ze
//                kantelen mee met de telefoon (deviceorientation)
//   midden       de versnelling uit PLGear, schakellampjes (leds()), de modus
//                ECO/CRUISE/SPORT/MAX, en een strook met koelwater en gas
//   showmoment   bij het openen zwaaien beide ringen één keer vol uit, en
//                vanuit stilstand meet hij vanzelf 0–100 (nul100())
//
// WAT HIER STAAT EN WAT NIET. Welke PID op welke plek staat, het aanzetten
// van sensoren, het remmen en "oud" blijven van pidlane-visprofiel.js en
// pidlane-visueel.js, net als bij de andere profielen. PLVisProfiel.bij()
// geeft een waarde door via zet(); dit bestand vlakt hem af en tekent op 60
// fps, zodat een PID die maar 4× per seconde komt toch vloeiend beweegt.
//
// De lus loopt alleen zolang het vak in beeld is: wordt het weggegooid
// (herbouw) of verborgen, dan stopt hij zelf en start de volgende zet() of
// wek() hem opnieuw. Geen WebGL op dit toestel? Dan blijft de achtergrond
// een CSS-verloop en tekenen de ringen gewoon.
//
// Geen bus-I/O. Puur en getoetst in test-hyperlane.js: kleur(), stemming(),
// modus(), leds(), nul100(), volg(). Laadt vóór pidlane-visprofiel.js.
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

// ── PUUR ──────────────────────────────────────────────────────────
/* De kleurstops van rustig naar de begrenzer. */
const STOPS = [[0,[90,200,255]], [.35,[0,255,215]], [.6,[165,95,255]], [.82,[255,165,40]], [1,[255,40,70]]];
function klem(v, lo, hi){ const n=Number(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; }
/* Stemming 0–1 → [r,g,b]. */
function kleur(m){
  m=klem(m, 0, 1);
  for(let i=1;i<STOPS.length;i++){
    const a=STOPS[i-1], b=STOPS[i];
    if(m<=b[0]){ const t=(m-a[0])/(b[0]-a[0]); return a[1].map(function(v,k){ return v+(b[1][k]-v)*t; }); }
  }
  return STOPS[STOPS.length-1][1].slice();
}
/* Hoe sportief er gereden wordt, 0–1: vooral het toerental tegen de rode
   streep, en voor een derde het gaspedaal. Ontbreekt iets, dan telt het als
   rust — een lege plek maakt het scherm niet rood. */
function stemming(toeren, rood, gas){
  const t=(isFinite(Number(toeren)) && toeren!==null && rood>0) ? klem(toeren/rood, 0, 1) : 0;
  const g=(isFinite(Number(gas)) && gas!==null) ? klem(gas/100, 0, 1) : 0;
  return klem(.65*t+.35*g, 0, 1);
}
function modus(m){ return m<.3 ? 'ECO' : m<.55 ? 'CRUISE' : m<.8 ? 'SPORT' : 'MAX'; }
/* Schakellampjes: hoeveel van `n` er branden, en of hij op de begrenzer zit.
   Ze beginnen op 70% van de rode streep. */
function leds(toeren, rood, n){
  n=n||10;
  const t=Number(toeren);
  if(!(rood>0) || toeren===null || !isFinite(t)) return { aan:0, max:false };
  const van=rood*.7;
  return { aan:Math.round(klem((t-van)/(rood-van), 0, 1)*n), max:t>=rood*.98 };
}
/* 0–100 vanuit stilstand. `st` = {start}, `t` in seconden. Start bij
   stilstand met meer dan half gas; stilstaan zonder gas zet hem terug.
   Geeft {st, tijd}; tijd is alleen gezet op het moment dat 100 gehaald wordt. */
function nul100(st, v, gas, t){
  const s={ start:st && st.start!=null ? st.start : null };
  // null is "niet gemeten", geen stilstand: Number(null) is 0.
  if(v===null || v===undefined || v==='' || !isFinite(Number(v))) return { st:s, tijd:null };
  v=Number(v); gas=Number(gas);
  if(s.start===null){ if(v<1 && gas>50) s.start=t; return { st:s, tijd:null }; }
  if(v<.5 && !(gas>10)){ s.start=null; return { st:s, tijd:null }; }
  if(v>=100){ const tijd=t-s.start; s.start=null; return { st:s, tijd:tijd }; }
  return { st:s, tijd:null };
}
/* Afvlakken naar `doel` met snelheid k per seconde. */
function volg(nu, doel, dt, k){ return nu+(doel-nu)*Math.min(1, dt*k); }

// ── TEKENING ──────────────────────────────────────────────────────
function html(){
  const strook=function(rol, naam){
    return '<div id="vpf-p-'+rol+'"><b class="vpf-w" id="vpf-w-'+rol+'">—</b><span>'+naam+'</span></div>';
  };
  return '<canvas class="vhl-bg"></canvas>'+
    '<div class="vhl-podium">'+
      // Het getal staat ook als tekst in het vak (vpf-w-*): de schermlezer en
      // de proeven lezen dat; zichtbaar is alleen de tekening in de canvas.
      '<div class="vhl-pod l" id="vpf-p-toeren"><canvas class="vhl-ring" data-ring="toeren" aria-hidden="true"></canvas><b class="vpf-w vhl-sr" id="vpf-w-toeren">—</b></div>'+
      '<div class="vhl-mid">'+
        '<div class="vhl-leds">'+new Array(11).join('<i></i>')+'</div>'+
        '<div class="vhl-modus">ECO</div>'+
        '<div class="vhl-gear"></div>'+
        '<div class="vhl-strook">'+strook('koel', 'KOELW °C')+strook('gas', 'GAS %')+'</div>'+
      '</div>'+
      '<div class="vhl-pod r" id="vpf-p-snel"><canvas class="vhl-ring" data-ring="snel" aria-hidden="true"></canvas><b class="vpf-w vhl-sr" id="vpf-w-snel">—</b></div>'+
    '</div>'+
    '<div class="vhl-rand l"></div><div class="vhl-rand r"></div>'+
    '<div class="vhl-flits"></div><div class="vhl-badge"></div>';
}

const FS='precision highp float;'+
'uniform vec2 R;uniform float T,Z,E;uniform vec3 C1,C2;uniform vec2 P;'+
'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}'+
'void main(){'+
' vec2 p=(gl_FragCoord.xy-.5*R)/R.y; p-=P;'+
' float r=mix(length(p),max(abs(p.x)*.55,abs(p.y)),.7)+1e-3;'+
' float a=atan(p.y,p.x)/6.2831853;'+
' float z=.32/r+Z;'+
' float fog=smoothstep(.02,.45,r);'+
' float lz=abs(fract(z)-.5), la=abs(fract(a*28.)-.5);'+
' float ring=exp(-pow(lz*(3.+55.*r),2.))*fog;'+
' float rad=exp(-pow(la*r*70.,2.))*fog*.55;'+
' vec2 cel=vec2(floor(a*56.),floor(z*3.+Z*2.));'+
' float s=step(.985-E*.05,h(cel));'+
' float sz=fract(z*3.+Z*2.);'+
' float streep=s*smoothstep(0.,.7,sz)*smoothstep(1.,.85,sz)*exp(-pow(abs(fract(a*56.)-.5)*r*90.,2.))*fog;'+
' float kern=.06/(r*r*30.+.25);'+
' vec3 c=C1*ring*(.35+E*.9)+C2*rad*(.25+E*.5)+mix(C2,vec3(1),.4)*streep*(1.2+E*2.)+C2*kern*(.5+E);'+
' c*=1.-.35*smoothstep(.6,1.2,length(p));'+
' gl_FragColor=vec4(c*min(1.,T*.6),1.);'+
'}';
const VS='attribute vec2 v;void main(){gl_Position=vec4(v,0,1);}';

function glOp(cv){
  let gl=null;
  try{ gl=cv.getContext('webgl', { antialias:false, alpha:false, powerPreference:'high-performance' }); }
  catch(e){ console.warn('PLHyperlane: WebGL niet beschikbaar', e); }
  if(!gl) return null;
  const sh=function(t, s){ const o=gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
    if(!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  try{
    const pr=gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const U={}; ['R','T','Z','E','C1','C2','P'].forEach(function(n){ U[n]=gl.getUniformLocation(pr, n); });
    return { gl:gl, U:U };
  }catch(e){ console.warn('PLHyperlane: shader niet te bouwen, achtergrond blijft CSS', e); return null; }
}

const css=function(c){ return 'rgb('+(c[0]|0)+','+(c[1]|0)+','+(c[2]|0)+')'; };
const rgba=function(c, a){ return 'rgba('+(c[0]|0)+','+(c[1]|0)+','+(c[2]|0)+','+a+')'; };
/* Eén ring op een canvas van 400×400 logische punten. `o.v` 0–1. */
function ring(cv, o){
  const c=cv.getContext('2d'); if(!c) return;
  const s=cv.width/400; c.setTransform(s,0,0,s,0,0); c.clearRect(0,0,400,400);
  const cx=200, cy=200, R=168, a0=Math.PI*.75, sp=Math.PI*1.5, A=function(t){ return a0+sp*t; }, col=o.col, cs=css(col);
  const g=c.createRadialGradient(cx,cy,30,cx,cy,R+26);
  g.addColorStop(0,'rgba(8,12,28,.92)'); g.addColorStop(.85,'rgba(4,6,16,.55)'); g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g; c.beginPath(); c.arc(cx,cy,R+26,0,7); c.fill();
  c.lineCap='round';
  c.lineWidth=16; c.strokeStyle='rgba(255,255,255,.05)'; c.beginPath(); c.arc(cx,cy,R-24,A(0),A(1)); c.stroke();
  if(o.rood){ c.lineWidth=4; c.strokeStyle='rgba(255,40,70,.8)'; c.beginPath(); c.arc(cx,cy,R-4,A(o.rood),A(1)); c.stroke(); }
  c.font='500 19px system-ui,sans-serif'; c.textAlign='center'; c.textBaseline='middle';
  for(let i=0;i<=o.n*5;i++){
    const t=i/(o.n*5), a=A(t), groot=i%5===0, aan=t<=o.v;
    c.strokeStyle=aan ? rgba(col, groot?1:.7) : (o.rood && t>=o.rood ? 'rgba(255,60,80,.6)' : 'rgba(255,255,255,.28)');
    c.lineWidth=groot?3:1.5;
    const r1=R-(groot?14:8);
    c.beginPath(); c.moveTo(cx+Math.cos(a)*R, cy+Math.sin(a)*R); c.lineTo(cx+Math.cos(a)*r1, cy+Math.sin(a)*r1); c.stroke();
    if(groot){ c.fillStyle=aan?'#fff':'rgba(255,255,255,.45)'; c.fillText(o.lab(i/5), cx+Math.cos(a)*(R-50), cy+Math.sin(a)*(R-50)); }
  }
  if(o.piek>.02){ const a=A(o.piek); c.strokeStyle='rgba(255,255,255,.55)'; c.lineWidth=3; c.beginPath(); c.arc(cx,cy,R-24,a-.012,a+.012); c.stroke(); }
  if(o.v>.002){
    c.globalCompositeOperation='lighter';
    if(c.createConicGradient){
      const gr=c.createConicGradient(a0,cx,cy);
      gr.addColorStop(0,'rgba(0,0,0,0)'); gr.addColorStop(Math.max(.001,o.v*.75*.95), rgba(col,.55)); gr.addColorStop(Math.min(1,o.v*.75),'#fff');
      c.strokeStyle=gr;
    } else c.strokeStyle=cs;
    c.shadowColor=cs; c.shadowBlur=28; c.lineWidth=16; c.beginPath(); c.arc(cx,cy,R-24,A(0),A(o.v)); c.stroke();
    c.shadowBlur=40; c.fillStyle='#fff';
    const a=A(o.v); c.beginPath(); c.arc(cx+Math.cos(a)*(R-24), cy+Math.sin(a)*(R-24), 7, 0, 7); c.fill();
    c.shadowBlur=0; c.globalCompositeOperation='source-over';
  }
  c.fillStyle='#fff'; c.shadowColor=cs; c.shadowBlur=24; c.font='200 96px system-ui,sans-serif'; c.fillText(o.txt, cx, cy-4); c.shadowBlur=0;
  c.fillStyle=cs; c.font='600 15px system-ui,sans-serif'; c.fillText(o.eenh, cx, cy+56);
}

// ── DE LUS ────────────────────────────────────────────────────────
const OPSTART_S = 2.2;      // de zwaai bij het openen
let _s = null;

function opties(){
  // De schaal van de plekken uit het profiel (diesel: 6000 rpm, #393).
  const o={ toerenHi:8000, snelHi:240 };
  try{
    const P=window.PLVisProfiel, V=window.PLVisueel, ind=V && V.staat && V.staat().ind;
    const p=P && ind && ind.profiel ? P.voorInd('hyperlane', ind.profiel) : null;
    (p && p.plekken || []).forEach(function(x){ if(x.rol==='toeren') o.toerenHi=x.hi; if(x.rol==='snel') o.snelHi=x.hi; });
  }catch(e){ console.warn('PLHyperlane: schaal niet te lezen, standaard', e); }
  return o;
}
function kantel(e){
  if(!_s || e.beta==null || e.gamma==null) return;
  // Liggend draait de telefoon om zijn lange as: gamma is dan voor/achter.
  _s.tiltDoel=[klem(e.gamma/30, -1, 1), klem(e.beta/30, -1, 1)];
}
function start(wortel){
  stop();
  const bg=wortel.querySelector('.vhl-bg');
  _s={ wortel:wortel, bg:bg, gl:bg ? glOp(bg) : null, ringen:{}, doel:{}, toon:{ toeren:0, snel:0 },
       stem:0, Z:0, t0:performance.now(), last:performance.now(), piek:{ toeren:0, snel:0 },
       nul:{ start:null }, badgeT:0, tilt:[0,0], tiltDoel:[0,0], gearT:0, gear:'', maat:'' , raf:0, opt:opties() };
  wortel.classList.toggle('vhl-gl', !!_s.gl);
  wortel.querySelectorAll('.vhl-ring').forEach(function(c){ _s.ringen[c.getAttribute('data-ring')]=c; });
  window.addEventListener('deviceorientation', kantel);
  _s.raf=requestAnimationFrame(frame);
}
function stop(){
  if(!_s) return;
  cancelAnimationFrame(_s.raf);
  window.removeEventListener('deviceorientation', kantel);
  _s=null;
}
/* Na een opbouw van het vak: de lus aan als er een Hyperlane-vak staat. */
function wek(g){
  const w=(g || document).querySelector('.vpf-hyper');
  if(w && (!_s || _s.wortel!==w)) start(w);
}
/* Eén meetwaarde, al begrensd en via PLToon. */
function zet(rol, v){
  const n=Number(v);
  if(!_s || !_s.wortel.isConnected) wek();
  if(_s) _s.doel[rol]=(v===null || v===undefined || v==='' || !isFinite(n)) ? null : n;
}
function maatBij(){
  const d=Math.min(window.devicePixelRatio||1, 2), w=_s.wortel, sleutel=w.clientWidth+'x'+w.clientHeight+'@'+d;
  if(sleutel===_s.maat) return;
  _s.maat=sleutel;
  if(_s.bg){ _s.bg.width=Math.max(1, w.clientWidth*d|0); _s.bg.height=Math.max(1, w.clientHeight*d|0); if(_s.gl) _s.gl.gl.viewport(0,0,_s.bg.width,_s.bg.height); }
  Object.keys(_s.ringen).forEach(function(k){ const c=_s.ringen[k], px=Math.max(1, c.clientWidth*d|0); c.width=c.height=px; });
}
function gearLees(){
  let g=null;
  try{ g=(window.PLGear && typeof window.PLGear.toonbaar==='function') ? window.PLGear.toonbaar() : null; }
  catch(e){ console.warn('PLHyperlane: PLGear.toonbaar() mislukt', e); }
  return (window.PLVisueel && typeof window.PLVisueel.gearTekst==='function') ? window.PLVisueel.gearTekst(g) : '';
}
function tekstVan(v, dec){ return (window.PLVisProfiel ? window.PLVisProfiel.tekst(v, dec) : String(v)); }

function frame(nu){
  const s=_s; if(!s) return;
  // Weggegooid of verborgen: stoppen. De volgende zet() of wek() start opnieuw.
  if(!s.wortel.isConnected || !s.wortel.getClientRects().length){ stop(); return; }
  s.raf=requestAnimationFrame(frame);
  const dt=Math.min(.05, (nu-s.last)/1000), T=(nu-s.t0)/1000; s.last=nu;
  maatBij();
  const o=s.opt, rood=o.toerenHi*.85, d=s.doel, w=s.wortel;
  ['toeren','snel'].forEach(function(r){ if(d[r]!=null) s.toon[r]=volg(s.toon[r], d[r], dt, 10); });
  const zwaai=T<OPSTART_S ? Math.sin(T/OPSTART_S*Math.PI) : 0, live=T>=OPSTART_S;
  const rf=live ? klem(s.toon.toeren/o.toerenHi, 0, 1) : zwaai, sf=live ? klem(s.toon.snel/o.snelHi, 0, 1) : zwaai;
  s.stem=volg(s.stem, live ? stemming(d.toeren, rood, d.gas) : zwaai*.9, dt, 2.2);
  const c=kleur(s.stem), c2=kleur(Math.min(1, s.stem+.18));
  w.style.setProperty('--vhl-c', css(c)); w.style.setProperty('--vhl-c2', css(c2)); w.style.setProperty('--vhl-e', s.stem.toFixed(3));
  s.Z+=dt*(.15+(d.snel!=null ? s.toon.snel : 0)/55);
  s.piek.toeren=Math.max(rf, s.piek.toeren-dt*.04); s.piek.snel=Math.max(sf, s.piek.snel-dt*.04);
  // 0–100
  const n=nul100(s.nul, d.snel, d.gas, T); s.nul=n.st;
  const badge=w.querySelector('.vhl-badge');
  if(n.tijd!==null && badge){ badge.textContent='0–100  '+tekstVan(n.tijd, 1)+' s'; badge.classList.add('aan'); s.badgeT=6; }
  if(s.badgeT>0 && (s.badgeT-=dt)<=0 && badge) badge.classList.remove('aan');
  // Kantelen met de telefoon
  s.tilt[0]=volg(s.tilt[0], s.tiltDoel[0], dt, 4); s.tilt[1]=volg(s.tilt[1], s.tiltDoel[1], dt, 4);
  w.style.setProperty('--vhl-tx', (s.tilt[0]*5).toFixed(2)+'deg'); w.style.setProperty('--vhl-ty', (s.tilt[1]*7).toFixed(2)+'deg');
  if(s.gl){
    const gl=s.gl.gl, U=s.gl.U;
    gl.uniform2f(U.R, s.bg.width, s.bg.height); gl.uniform1f(U.T, T); gl.uniform1f(U.Z, s.Z); gl.uniform1f(U.E, s.stem);
    gl.uniform3f(U.C1, c[0]/255, c[1]/255, c[2]/255); gl.uniform3f(U.C2, c2[0]/255, c2[1]/255, c2[2]/255);
    gl.uniform2f(U.P, s.tilt[1]*.04, -s.tilt[0]*.03);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const nT=Math.round(o.toerenHi/1000), nS=Math.round(o.snelHi/20);
  if(s.ringen.toeren) ring(s.ringen.toeren, { v:rf, n:nT, rood:rood/(nT*1000), piek:s.piek.toeren, col:c, lab:function(i){ return i; },
    txt:live ? (d.toeren==null ? '—' : tekstVan(s.toon.toeren/1000, 1)) : '', eenh:'× 1000 TPM' });
  if(s.ringen.snel) ring(s.ringen.snel, { v:sf, n:nS, piek:s.piek.snel, col:c, lab:function(i){ return i*20; },
    txt:live ? (d.snel==null ? '—' : tekstVan(s.toon.snel, 0)) : '', eenh:'KM/H' });
  // Schakellampjes, met een flits over de rand op de begrenzer
  const l=leds(d.toeren, rood, 10), knip=l.max && (T*12|0)%2===0;
  w.querySelectorAll('.vhl-leds i').forEach(function(e, i){ e.className=l.max ? (knip ? 'max' : '') : (i<l.aan ? (i<4 ? 'g' : i<7 ? 'a' : 'r') : ''); });
  w.classList.toggle('vhl-knip', knip);
  const m=modus(s.stem), me=w.querySelector('.vhl-modus');
  if(me && me.textContent!==m) me.textContent=m;
  if((s.gearT-=dt)<=0){
    s.gearT=.15;
    const g=gearLees(), ge=w.querySelector('.vhl-gear');
    if(ge && g!==s.gear){ s.gear=g; ge.textContent=g; ge.classList.remove('wissel'); void ge.offsetWidth; ge.classList.add('wissel'); }
  }
}

window.PLHyperlane = {
  STOPS:STOPS, OPSTART_S:OPSTART_S,
  kleur:kleur, stemming:stemming, modus:modus, leds:leds, nul100:nul100, volg:volg,
  html:html, start:start, stop:stop, wek:wek, zet:zet,
  actief:function(){ return !!_s; }
};
})();
