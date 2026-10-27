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
// SCÈNES (27-10-2026, tweede ronde). Eén scène tegelijk, gekozen door
// scene() — puur, met een vaste voorrang — en elk met een eigen beeld:
//   alarm      koelwater te heet: alles pulseert rood, de tunnel remt af
//   begrenzer  op de rode streep: lampjes knipperen blauw, flits over de rand
//   remmen     hard remmen (≥ 8 km/h per s): de onderkant kleurt remlicht-rood
//   launch     0–100 loopt: warp — de tunnel rekt uit, de tijd telt live mee
//   koud       koelwater onder 60 °C: ijsblauw, rijp op de rand, de
//              randstroken vullen zich met de opwarming (warmte())
//   stil       langer dan 3 s stilstand: de tunnel ademt, de klok in het midden
//   cruise     8 s gelijkmatig boven 70 km/h: zen — koeler, rustiger
//   rijden     al het andere
// Daarnaast, los van de scène: een lichtgolf door de tunnel bij opschakelen,
// het verdwijnpunt dat meeleunt in de bocht (zij-G, TL04 als die meet), een
// rit-topsnelheid boven 100 als melding, en 's avonds (21–6 u) gedimd.
//
// SCOREBORD (27-10-2026, derde ronde). In de scène stil, na minstens
// SCORE_KM gereden, schuift de rit-samenvatting over het midden: top, beste
// 0–100, max toeren, gemiddelde, afstand en rijtijd, met tellende cijfers.
// De rit (ritBij(), puur) leeft buiten de lus, zodat een herbouw van het
// scherm hem niet wist; na RIT_PAUZE_S zonder meting begint een nieuwe.
//
// VIERDE RONDE (27-10-2026):
//   tank       een lichtbalk onderin die leegloopt (012F), met bereik (CA09)
//              en verbruik (CA03); onder 25% amber, onder 10% rood en pulserend
//   power-up   bij het starten van de motor: rustspanning → dip → laden
//              (accuStart(), puur), met een laadbalk en een lichtflits
//   G-spoor    het verloop van de zij-G als lichtspoor over de tunnelvloer
//              (gSpoor(), 24 punten, in de shader)
//   merk       kleuren en woordmerk per merk (merkThema(), puur): een eigen
//              palet in plaats van STOPS, en de merknaam in het midden als
//              de versnelling onbekend is. Geen logo's: die zijn van het merk.
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
// Het vak (de HTML met de element-id's) staat in pidlane-visprofiel.js.
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

// ── PUUR ──────────────────────────────────────────────────────────
/* De kleurstops van rustig naar de begrenzer. */
const STOPS = [[0,[90,200,255]], [.35,[0,255,215]], [.6,[165,95,255]], [.82,[255,165,40]], [1,[255,40,70]]];
function klem(v, lo, hi){ const n=Number(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; }
/* Stemming 0–1 → [r,g,b], langs `stops` (standaard STOPS). */
function kleur(m, stops){
  const S=stops || STOPS;
  m=klem(m, 0, 1);
  for(let i=1;i<S.length;i++){
    const a=S[i-1], b=S[i];
    if(m<=b[0]){ const t=(m-a[0])/(b[0]-a[0]); return a[1].map(function(v,k){ return v+(b[1][k]-v)*t; }); }
  }
  return S[S.length-1][1].slice();
}
/* ── Merkthema's ── Vijf kleuren van rustig naar de begrenzer, dezelfde
   posities als STOPS. `zoek` vangt de schrijfwijzen uit vehicleInfo.merk. */
const MERKEN = [
  { id:'bmw',     naam:'BMW',          zoek:/\bbmw\b|^mini\b/i,         kl:[[0,170,230],[40,110,255],[120,70,230],[235,40,60],[255,30,40]] },
  { id:'audi',    naam:'AUDI',         zoek:/\baudi\b/i,                kl:[[180,200,220],[230,235,245],[255,120,120],[245,30,40],[255,0,30]] },
  { id:'mercedes',naam:'MERCEDES',     zoek:/mercedes|\bamg\b|\bbenz\b/i, kl:[[0,210,190],[0,255,210],[200,220,230],[255,170,60],[255,40,60]] },
  { id:'porsche', naam:'PORSCHE',      zoek:/porsche/i,                  kl:[[200,170,90],[255,210,120],[255,150,40],[230,60,30],[200,0,20]] },
  { id:'vw',      naam:'VOLKSWAGEN',   zoek:/volkswagen|\bvw\b/i,        kl:[[80,160,255],[0,220,255],[220,230,255],[255,60,60],[230,0,30]] },
  { id:'ferrari', naam:'FERRARI',      zoek:/ferrari/i,                  kl:[[255,210,0],[255,170,0],[255,90,0],[230,20,20],[200,0,0]] },
  { id:'lambo',   naam:'LAMBORGHINI',  zoek:/lamborghini/i,              kl:[[120,230,60],[200,240,0],[255,200,0],[255,120,0],[255,40,0]] },
  { id:'ford',    naam:'FORD',         zoek:/\bford\b/i,                kl:[[40,120,255],[0,200,255],[120,120,255],[255,140,40],[255,40,60]] },
  { id:'toyota',  naam:'TOYOTA',       zoek:/toyota|lexus/i,             kl:[[220,230,240],[255,255,255],[255,140,140],[235,10,30],[200,0,20]] },
  { id:'tesla',   naam:'TESLA',        zoek:/tesla/i,                    kl:[[120,180,255],[255,255,255],[200,220,255],[255,80,80],[230,20,40]] },
  { id:'volvo',   naam:'VOLVO',        zoek:/volvo|polestar/i,           kl:[[210,170,100],[255,200,120],[180,200,230],[255,140,60],[255,60,40]] },
  { id:'hyundai', naam:'HYUNDAI',      zoek:/hyundai|\bkia\b/i,          kl:[[0,150,220],[0,200,255],[120,130,255],[255,110,30],[255,60,20]] },
  { id:'renault', naam:'RENAULT',      zoek:/renault|alpine|dacia/i,     kl:[[255,210,0],[255,230,90],[0,190,255],[255,120,0],[255,40,40]] },
  { id:'skoda',   naam:'ŠKODA',        zoek:/skoda|škoda/i,              kl:[[70,200,120],[120,240,150],[0,200,200],[255,170,40],[255,50,50]] }
];
/* Het thema voor een merk: {id, naam, stops}, of null (dan STOPS). Puur. */
function merkThema(merk){
  const m=String(merk||'').trim();
  if(!m) return null;
  for(let i=0;i<MERKEN.length;i++){
    const x=MERKEN[i];
    if(x.zoek.test(m)) return { id:x.id, naam:x.naam, stops:STOPS.map(function(st, k){ return [st[0], x.kl[k]]; }) };
  }
  return null;
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
/* 0–100 vanuit stilstand. `st` = {start, stil}, `t` in seconden. De klok
   loopt vanaf het laatste moment van stilstand (< 1 km/h), als het gas
   binnen 2 s daarna boven de helft is en je nog geen 40 rijdt: met 10
   metingen per seconde valt er bij een echte launch geen meting waarin je
   stilstaat én al vol gas geeft (27-10-2026, gemeten in de showreel).
   Weer stilstaan, 30 s zonder 100, of langer dan 1 s van het gas (onder
   30%: geen launch maar gewoon wegrijden; een schakelmoment duurt korter)
   zet hem terug. Geeft {st, tijd}; tijd
   is alleen gezet op het moment dat 100 gehaald wordt. */
function nul100(st, v, gas, t){
  const s={ start:st && st.start!=null ? st.start : null, stil:st && st.stil!=null ? st.stil : null, los:st && st.los!=null ? st.los : null };
  // null is "niet gemeten", geen stilstand: Number(null) is 0.
  if(v===null || v===undefined || v==='' || !isFinite(Number(v))) return { st:s, tijd:null };
  v=Number(v); gas=Number(gas);
  if(v<1){ s.stil=t; s.start=null; return { st:s, tijd:null }; }
  if(s.start===null && s.stil!==null && gas>50 && v<40 && t-s.stil<=2) s.start=s.stil;
  if(s.start===null) return { st:s, tijd:null };
  if(gas<30){ if(s.los===null) s.los=t; } else s.los=null;
  if(t-s.start>30 || (s.los!==null && t-s.los>1)){ s.start=null; s.stil=null; s.los=null; return { st:s, tijd:null }; }
  if(v>=100){ const tijd=t-s.start; s.start=null; s.stil=null; return { st:s, tijd:tijd }; }
  return { st:s, tijd:null };
}
/* Afvlakken naar `doel` met snelheid k per seconde. */
function volg(nu, doel, dt, k){ return nu+(doel-nu)*Math.min(1, dt*k); }
/* Versnelling in km/h per seconde uit twee snelheden, afgevlakt. `oud` =
   {v,t,a} of null, t in seconden. Een gat van meer dan 3 s of een
   ontbrekende waarde begint opnieuw: geen sprong uit een oude meting. */
function versnelling(oud, v, t){
  if(v===null || v===undefined || !isFinite(Number(v))) return null;
  v=Number(v);
  if(!oud || !(t>oud.t) || t-oud.t>3) return { v:v, t:t, a:0 };
  const nu=(v-oud.v)/(t-oud.t);
  return { v:v, t:t, a:oud.a*.5+nu*.5 };
}
/* Hoe warm de motor is voor de randstroken, 0–1 (20 → 70 °C). */
function warmte(koel){ return (koel===null || koel===undefined || !isFinite(Number(koel))) ? 1 : klem((koel-20)/50, 0, 1); }
function nacht(uur){ return uur>=21 || uur<6; }
const KOUD_C = 60, HEET_C = 118, REM_KMHS = 8, STIL_S = 3, CRUISE_S = 8, CRUISE_KMH = 70;
/* De scène, in volgorde van voorrang. `i` = {koel, koelSt, toeren, rood,
   snel, versn, stilS, launch, cruiseS}; wat ontbreekt telt niet. Puur. */
function scene(i){
  const n=function(v){ return v!==null && v!==undefined && isFinite(Number(v)); };
  if(i.koelSt==='danger' || (n(i.koel) && i.koel>=HEET_C)) return 'alarm';
  if(n(i.toeren) && i.rood>0 && i.toeren>=i.rood*.98) return 'begrenzer';
  if(n(i.versn) && i.versn<=-REM_KMHS && n(i.snel) && i.snel>5) return 'remmen';
  if(i.launch) return 'launch';
  if(n(i.koel) && i.koel<KOUD_C) return 'koud';
  if(i.stilS>=STIL_S) return 'stil';
  if(i.cruiseS>=CRUISE_S) return 'cruise';
  return 'rijden';
}
/* ── De rit ── `rit` = null of {t, km, top, maxT, rijS, beste}; t in s.
   Afstand en rijtijd tellen alleen over een gat van hoogstens 3 s: een
   gemiste meting verzint geen kilometers. Puur: geeft een nieuwe rit. */
const SCORE_KM = 0.3, RIT_PAUZE_S = 15*60;
function ritBij(rit, v, toeren, t, verbruik){
  const n=function(x){ return x!==null && x!==undefined && x!=='' && isFinite(Number(x)); };
  let r=rit ? Object.assign({}, rit) : null;
  if(!r || !(t>=r.t) || t-r.t>RIT_PAUZE_S) r={ t:t, km:0, top:0, maxT:0, rijS:0, beste:null, kmV:0, liter:0 };
  const dt=t-r.t;
  if(n(v)){
    v=Number(v);
    if(dt>0 && dt<=3){
      const dk=v*dt/3600;
      r.km+=dk; if(v>=1) r.rijS+=dt;
      // Verbruik telt alleen over de kilometers waarop hij gemeten is.
      if(n(verbruik) && Number(verbruik)>=0 && dk>0){ r.kmV=(r.kmV||0)+dk; r.liter=(r.liter||0)+Number(verbruik)*dk/100; }
    }
    r.top=Math.max(r.top, v);
  }
  if(n(toeren)) r.maxT=Math.max(r.maxT, Number(toeren));
  r.t=t;
  return r;
}
function ritNul100(rit, tijd){
  if(!rit || !(tijd>0)) return rit;
  return Object.assign({}, rit, { beste:rit.beste===null ? tijd : Math.min(rit.beste, tijd) });
}
function duur(s){ s=Math.max(0, Math.round(s)); const u=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60;
  return (u ? u+':'+('0'+m).slice(-2) : String(m))+':'+('0'+x).slice(-2); }
/* De tegels van het scorebord, of null onder SCORE_KM. Puur. Elke tegel:
   {sleutel, label, waarde (getal om naar toe te tellen), eenheid, dec,
   tekst (alleen bij rijtijd: m:ss)}. Zonder 0–100 geen lege tegel. */
function scorebord(rit){
  if(!rit || !(rit.km>=SCORE_KM)) return null;
  const t=[{ sleutel:'top', label:'TOP', waarde:rit.top, eenheid:'km/h', dec:0 }];
  if(rit.beste!==null) t.push({ sleutel:'nul100', label:'0–100', waarde:rit.beste, eenheid:'s', dec:1 });
  if(rit.maxT>0) t.push({ sleutel:'maxt', label:'MAX TOEREN', waarde:rit.maxT/1000, eenheid:'× 1000', dec:1 });
  if(rit.rijS>=30) t.push({ sleutel:'gem', label:'GEMIDDELD', waarde:rit.km/(rit.rijS/3600), eenheid:'km/h', dec:0 });
  if(rit.kmV>=SCORE_KM) t.push({ sleutel:'verbruik', label:'VERBRUIK', waarde:rit.liter/rit.kmV*100, eenheid:'L/100 km', dec:1 });
  t.push({ sleutel:'km', label:'AFSTAND', waarde:rit.km, eenheid:'km', dec:1 });
  t.push({ sleutel:'tijd', label:'RIJTIJD', waarde:rit.rijS, eenheid:'', dec:0, tekst:duur(rit.rijS) });
  return t;
}
/* ── Power-up ── Het starten van de motor uit toeren en accuspanning. `st` =
   {hist:[{t,v}] van de laatste 4 s, motor}; motor draait vanaf 400 rpm.
   Bij de overgang uit → aan: {rust, dip, nu} — de hoogste spanning vóór de
   laagste, de laagste, en de spanning nu. Zonder spanning geen event: een
   animatie over getallen die er niet zijn is versiering. De eerste
   toerenmeting zet alleen de stand: wie Hyperlane opent met draaiende motor
   heeft niet net gestart. Puur. */
const START_RPM = 400, POWER_S = 4.5;
function accuStart(st, volt, toeren, t){
  const s={ hist:(st && st.hist ? st.hist : []).filter(function(x){ return t-x.t<=4; }), motor:(st && typeof st.motor==='boolean') ? st.motor : null };
  const nv=volt!==null && volt!==undefined && isFinite(Number(volt));
  if(nv) s.hist.push({ t:t, v:Number(volt) });
  if(toeren===null || toeren===undefined || !isFinite(Number(toeren))) return { st:s, start:null };
  const aan=Number(toeren)>=START_RPM;
  let start=null;
  if(aan && s.motor===false && s.hist.length){
    let iMin=0; s.hist.forEach(function(x, i){ if(x.v<s.hist[iMin].v) iMin=i; });
    let rust=s.hist[iMin].v; for(let i=0;i<=iMin;i++) rust=Math.max(rust, s.hist[i].v);
    start={ rust:rust, dip:s.hist[iMin].v, nu:s.hist[s.hist.length-1].v };
  }
  s.motor=aan;
  return { st:s, start:start };
}
/* ── G-spoor ── De laatste GS_N zij-G-waarden (nieuwste eerst) als punten
   op de tunnelvloer: dichtbij onderin, verder weg kleiner naar het midden.
   Geeft [x0,y0,x1,y1,…] in schermmaat (hoogte = 1). Puur. */
const GS_N = 24;
function gSpoor(hist){
  const uit=[];
  for(let i=0;i<GS_N;i++){
    const a=i/(GS_N-1), g=(hist && isFinite(Number(hist[i]))) ? klem(hist[i], -1.2, 1.2) : 0;
    // Rechts sturen duwt je naar links: het spoor volgt het gevoel, net als de G-cirkel (#407).
    uit.push(-g*.55*(1-a*.88), -.44+a*.40);
  }
  return uit;
}
/* De kleur van de tanklichtbalk: 'vol', 'laag' (< 25%) of 'leeg' (< 10%). */
function tankStand(pct){ const n=Number(pct); if(pct===null || pct===undefined || !isFinite(n)) return null; return n<10 ? 'leeg' : n<25 ? 'laag' : 'vol'; }

/* Optellen bij het verschijnen: 0 → 1 in 1,2 s, zacht uitlopend. */
function telOp(f){ f=klem(f, 0, 1); return 1-Math.pow(1-f, 3); }

/* De tekst in de modusregel per scène; null = de gewone modus(). */
const SCENE_TEKST = { alarm:'KOELWATER HEET', begrenzer:'SCHAKELEN', launch:'LAUNCH', koud:'MOTOR KOUD', stil:'STIL', cruise:'CRUISE · ZEN' };

// ── TEKENING ──────────────────────────────────────────────────────
// Het vak zelf (canvas, ringen, strook, met de id's vpf-p-*/vpf-w-*) tekent
// PLVisProfiel.html(), net als bij elk profiel; hier alleen wat beweegt.
const FS='precision highp float;'+
'uniform vec2 R;uniform float T,Z,E,W,B,K,A,F,D,GA;uniform vec3 C1,C2;uniform vec2 P;uniform vec2 GP[24];'+
'float sd(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h);}'+
'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}'+
'void main(){'+
' vec2 p=(gl_FragCoord.xy-.5*R)/R.y; p-=P;'+
' float r=mix(length(p),max(abs(p.x)*.55,abs(p.y)),.7)+1e-3;'+
' float a=atan(p.y,p.x)/6.2831853;'+
' float z=.32/r*(1.+F*1.6)+Z;'+
' float fog=smoothstep(.02,.45,r);'+
' float lz=abs(fract(z)-.5), la=abs(fract(a*28.)-.5);'+
' float ring=exp(-pow(lz*(3.+55.*r),2.))*fog;'+
' float rad=exp(-pow(la*r*70.,2.))*fog*.55;'+
' vec2 cel=vec2(floor(a*56.),floor(z*3.+Z*2.));'+
' float s=step(.985-E*.05-F*.08,h(cel));'+
' float sz=fract(z*3.+Z*2.);'+
' float streep=s*smoothstep(0.,.7,sz)*smoothstep(1.,.85,sz)*exp(-pow(abs(fract(a*56.)-.5)*r*90.,2.))*fog;'+
' float kern=.06/(r*r*30.+.25);'+
' vec3 c=C1*ring*(.35+E*.9)+C2*rad*(.25+E*.5)+mix(C2,vec3(1),.4)*streep*(1.2+E*2.)+C2*kern*(.5+E);'+
' float rw=.04+W*1.1;'+                                   // golf bij opschakelen
' c+=mix(C2,vec3(1),.5)*exp(-pow((r-rw)*22.,2.))*exp(-W*2.2)*1.6;'+
' float sp=0.;'+                                         // G-spoor over de vloer
' for(int i=0;i<23;i++){float a=float(i)/23.;sp+=exp(-pow(sd(p+P,GP[i],GP[i+1])*(170.-a*120.),2.))*(1.-a*.85);}'+
' c+=mix(C2,vec3(1),.55)*sp*GA*1.3;'+
' float l=dot(c,vec3(.3,.5,.2));'+
' c=mix(c,vec3(l)*vec3(.75,.95,1.3),K*.65);'+             // koud: ijs
' c=mix(c,vec3(1.,.12,.16)*(l*1.6+.04),B*smoothstep(.15,-.45,p.y));'+  // remmen: onderkant rood
' c+=vec3(1.,.05,.1)*B*.35*smoothstep(-.25,-.65,p.y);'+
' c=mix(c,vec3(1.,.08,.12)*(.25+l*1.5),A*(.55+.45*sin(T*7.)));'+  // alarm
' c*=1.-.35*smoothstep(.6,1.2,length(p));'+
' gl_FragColor=vec4(c*D*min(1.,T*.6),1.);'+
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
    const U={}; ['R','T','Z','E','W','B','K','A','F','D','GA','GP','C1','C2','P'].forEach(function(n){ U[n]=gl.getUniformLocation(pr, n); });
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
let _rit = null;            // de rit: overleeft een herbouw van het vak

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
       nul:{ start:null, stil:null, los:null }, badgeT:0, tilt:[0,0], tiltDoel:[0,0], gearT:0, gear:'', maat:'' , raf:0, opt:opties(),
       // scènes: de gewichten lopen vloeiend naar hun doel, zodat geen scène aanspringt
       sc:'', g:{ B:0, K:0, A:0, F:0, Z:0, D:1 }, golf:99, vs:null, stilS:0, cruiseS:0, lat:0,
       ritPiek:0, topGemeld:0, klokT:0,
       accu:null, power:null, gHist:[], gT:0, ga:0, thema:merkNu(), tankT:'' };
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
function zet(rol, v, st){
  const n=Number(v);
  if(!_s || !_s.wortel.isConnected) wek();
  if(!_s) return;
  _s.doel[rol]=(v===null || v===undefined || v==='' || !isFinite(n)) ? null : n;
  if(rol==='koel') _s.koelSt=st||null;
  if(rol==='snel') _s.vs=versnelling(_s.vs, _s.doel.snel, performance.now()/1000);
  const nu=performance.now()/1000;
  if(rol==='snel' || rol==='toeren') _rit=ritBij(_rit, rol==='snel' ? _s.doel.snel : null, rol==='toeren' ? _s.doel.toeren : null, nu, _s.doel.verbruik);
  if(rol==='accu' || rol==='toeren'){
    const a=accuStart(_s.accu, rol==='accu' ? _s.doel.accu : null, rol==='toeren' ? _s.doel.toeren : null, nu);
    _s.accu=a.st;
    if(a.start) _s.power={ t:0, rust:a.start.rust, dip:a.start.dip };
  }
}
/* Het merk van de verbonden auto, als thema. */
function merkNu(){
  let m='';
  try{ m=(typeof vehicleInfo!=='undefined' && vehicleInfo && vehicleInfo.merk) || ''; }
  catch(e){ console.warn('PLHyperlane: merk onleesbaar, standaardkleuren', e); }
  return merkThema(m);
}
/* De klok voor stilstand en nacht; los, zodat een proef hem kan zetten. */
function klok(){ return new Date(); }
function zijG(){
  const v=(typeof window.pidVals==='object' && window.pidVals) ? window.pidVals.TL04 : null;
  return (v===null || v===undefined || !isFinite(Number(v))) ? 0 : klem(v, -1.2, 1.2);
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

/* De tanklichtbalk: vulling en stand; de getallen zet bij() al. */
function tankBij(w, d){
  const el=w.querySelector('.vhl-tank'); if(!el) return;
  const st=tankStand(d.tank), sl=(st||'')+'|'+(d.tank==null ? '' : Math.round(d.tank));
  if(sl===_s.tankT) return;
  _s.tankT=sl;
  el.classList.toggle('geen', !st);
  if(st) el.setAttribute('data-stand', st);
  el.style.setProperty('--vhl-tank', (d.tank==null ? 0 : klem(d.tank, 0, 100)).toFixed(1)+'%');
}
/* Power-up: rust → dip → laden, met een laadbalk die tot de spanning van nu
   vult (10 → 15 V) en één lichtgolf door de tunnel. */
function powerBij(w, dt, d){
  const el=w.querySelector('.vhl-power'); if(!el) return;
  const P=_s.power;
  if(!P){ if(el.classList.contains('aan')) el.classList.remove('aan'); return; }
  if(P.t===0){
    _s.golf=0;
    el.innerHTML='<div class="vhl-power-kop">⚡ POWER-UP</div><div class="vhl-power-rij">'+
      '<div><small>RUST</small><b>'+tekstVan(P.rust, 1)+'</b></div><i>→</i>'+
      '<div><small>START</small><b>'+tekstVan(P.dip, 1)+'</b></div><i>→</i>'+
      '<div><small>LADEN</small><b class="vhl-power-nu">—</b></div><span>V</span></div>'+
      '<div class="vhl-power-balk"><i></i></div>';
    el.classList.add('aan');
  }
  P.t+=dt;
  const nu=d.accu, b=el.querySelector('.vhl-power-nu'), f=el.querySelector('.vhl-power-balk i');
  if(b) b.textContent=nu==null ? '—' : tekstVan(nu, 1);
  if(f) f.style.width=(nu==null ? 0 : klem((nu-10)/5, 0, 1)*100*telOp(P.t/1.5)).toFixed(1)+'%';
  if(P.t>=POWER_S) _s.power=null;
}
/* Het scorebord: opbouwen bij binnenkomst in stil, dan optellen. */
function scoreBij(w, sc, dt, nu){
  const el=w.querySelector('.vhl-score'); if(!el) return;
  // De power-up gaat voor: starten doe je ook in stilstand.
  const tegels=sc==='stil' && !_s.power ? scorebord(_rit) : null;
  if(!tegels){ if(_s.score){ _s.score=null; el.classList.remove('aan'); w.classList.remove('vhl-score-aan'); } return; }
  if(!_s.score){
    _s.score={ f:0, tegels:tegels };
    el.innerHTML='<div class="vhl-score-kop">RIT · <span class="vhl-score-klok"></span></div><div class="vhl-score-tegels">'+
      tegels.map(function(x, i){ return '<div class="vhl-tegel" data-tegel="'+x.sleutel+'" style="--i:'+i+'"><small>'+x.label+'</small><b>0</b><span>'+x.eenheid+'</span></div>'; }).join('')+'</div>';
    el.classList.add('aan'); w.classList.add('vhl-score-aan');
  }
  const S=_s.score; S.f+=dt/1.2;
  const k=el.querySelector('.vhl-score-klok'), kt=('0'+nu.getHours()).slice(-2)+':'+('0'+nu.getMinutes()).slice(-2);
  if(k && k.textContent!==kt) k.textContent=kt;
  S.tegels.forEach(function(x, i){
    const b=el.querySelector('[data-tegel="'+x.sleutel+'"] b'); if(!b) return;
    const f=telOp(S.f-i*.08), t=x.tekst ? duur(x.waarde*f) : tekstVan(x.waarde*f, x.dec);
    if(b.textContent!==t) b.textContent=t;
  });
}
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
  // De scène en zijn gewichten
  const vs=s.vs ? s.vs.a : 0;
  s.stilS=(d.snel!=null && d.snel<1) ? s.stilS+dt : 0;
  s.cruiseS=(d.snel!=null && d.snel>=CRUISE_KMH && Math.abs(vs)<1.5) ? s.cruiseS+dt : 0;
  const sc=live ? scene({ koel:d.koel, koelSt:s.koelSt, toeren:d.toeren, rood:rood, snel:d.snel, versn:vs,
                          stilS:s.stilS, launch:s.nul.start!==null, cruiseS:s.cruiseS }) : 'rijden';
  if(sc!==s.sc){ s.sc=sc; w.setAttribute('data-scene', sc); }
  const G=s.g, nu8=PLHyperlane._klok();
  G.B=volg(G.B, sc==='remmen'?1:0, dt, 5); G.K=volg(G.K, sc==='koud'?1:0, dt, 1.5); G.A=volg(G.A, sc==='alarm'?1:0, dt, 3);
  G.F=volg(G.F, sc==='launch'?1:0, dt, 2); G.Z=volg(G.Z, sc==='cruise'?1:0, dt, .8);
  G.D=volg(G.D, (nacht(nu8.getHours()) ? .62 : 1)*(sc==='stil' ? .78+.22*Math.sin(T*1.4) : 1), dt, 3);
  s.golf+=dt;
  s.lat=volg(s.lat, zijG(), dt, 3);
  // G-spoor: tien punten per seconde, zichtbaar zolang er echt gestuurd wordt
  if((s.gT-=dt)<=0){ s.gT=.1; s.gHist.unshift(s.lat); if(s.gHist.length>GS_N) s.gHist.length=GS_N; }
  s.ga=volg(s.ga, s.gHist.some(function(g){ return Math.abs(g)>.12; }) ? 1 : 0, dt, 2);
  w.style.setProperty('--vhl-warm', warmte(d.koel).toFixed(3));
  const pal=s.thema ? s.thema.stops : STOPS;
  let c=kleur(s.stem*(1-.45*G.Z), pal), c2=kleur(Math.min(1, s.stem*(1-.45*G.Z)+.18), pal);
  const meng=function(a, b, t){ return a.map(function(v,k){ return v+(b[k]-v)*t; }); };
  c=meng(meng(meng(c, [150,215,255], G.K*.8), [255,40,60], Math.max(G.A, G.B*.6)), [40,255,190], G.Z*.35);
  c2=meng(meng(c2, [190,235,255], G.K*.8), [255,70,90], Math.max(G.A, G.B*.6));
  w.style.setProperty('--vhl-c', css(c)); w.style.setProperty('--vhl-c2', css(c2)); w.style.setProperty('--vhl-e', s.stem.toFixed(3));
  s.Z+=dt*(.15+(d.snel!=null ? s.toon.snel : 0)/55)*(1-.6*G.A)*(1-.35*G.Z);
  s.piek.toeren=Math.max(rf, s.piek.toeren-dt*.04); s.piek.snel=Math.max(sf, s.piek.snel-dt*.04);
  // 0–100
  const n=nul100(s.nul, d.snel, d.gas, T); s.nul=n.st;
  const badge=w.querySelector('.vhl-badge');
  if(n.tijd!==null) _rit=ritNul100(_rit, n.tijd);
  if(n.tijd!==null && badge){ badge.textContent='0–100  '+tekstVan(n.tijd, 1)+' s'; badge.classList.add('aan'); s.badgeT=6; }
  else if(s.nul.start!==null && badge && T-s.nul.start>.3){ badge.textContent='0–100  '+tekstVan(T-s.nul.start, 1)+' s'; badge.classList.add('aan'); s.badgeT=.4; }
  // Rit-topsnelheid: gemeld zodra je na een nieuwe piek boven 100 weer inhoudt
  if(d.snel!=null) s.ritPiek=Math.max(s.ritPiek, d.snel);
  if(badge && s.badgeT<=0 && vs<-2 && s.ritPiek>=100 && s.ritPiek>=s.topGemeld+5){
    s.topGemeld=s.ritPiek; badge.textContent='TOP  '+tekstVan(s.ritPiek, 0)+' km/h'; badge.classList.add('aan'); s.badgeT=5;
  }
  if(s.badgeT>0 && (s.badgeT-=dt)<=0 && badge) badge.classList.remove('aan');
  // Kantelen met de telefoon
  s.tilt[0]=volg(s.tilt[0], s.tiltDoel[0], dt, 4); s.tilt[1]=volg(s.tilt[1], s.tiltDoel[1], dt, 4);
  w.style.setProperty('--vhl-tx', (s.tilt[0]*5).toFixed(2)+'deg'); w.style.setProperty('--vhl-ty', (s.tilt[1]*7+s.lat*9).toFixed(2)+'deg');
  if(s.gl){
    const gl=s.gl.gl, U=s.gl.U;
    gl.uniform2f(U.R, s.bg.width, s.bg.height); gl.uniform1f(U.T, T); gl.uniform1f(U.Z, s.Z); gl.uniform1f(U.E, s.stem);
    gl.uniform3f(U.C1, c[0]/255, c[1]/255, c[2]/255); gl.uniform3f(U.C2, c2[0]/255, c2[1]/255, c2[2]/255);
    gl.uniform2f(U.P, s.tilt[1]*.04-s.lat*.14, -s.tilt[0]*.03);
    gl.uniform1f(U.GA, s.ga); gl.uniform2fv(U.GP, gSpoor(s.gHist));
    gl.uniform1f(U.W, s.golf); gl.uniform1f(U.B, G.B); gl.uniform1f(U.K, G.K); gl.uniform1f(U.A, G.A); gl.uniform1f(U.F, G.F); gl.uniform1f(U.D, G.D);
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
  scoreBij(w, sc, dt, nu8);
  tankBij(w, d);
  powerBij(w, dt, d);
  const m=sc==='alarm' && d.koel!=null ? 'KOELWATER '+tekstVan(d.koel, 0)+'°' : (SCENE_TEKST[sc] || modus(s.stem)), me=w.querySelector('.vhl-modus');
  if(me && me.textContent!==m) me.textContent=m;
  if((s.gearT-=dt)<=0){
    s.gearT=.15;
    let g=gearLees();
    const ge=w.querySelector('.vhl-gear');
    // Opschakelen: een lichtgolf door de tunnel
    if(/^\d$/.test(g) && /^\d$/.test(s.gear) && Number(g)>Number(s.gear)) s.golf=0;
    // Stilstand zonder bekende versnelling: de klok in het midden
    const k=sc==='stil' && (g==='' || g==='N');
    if(k){ const t=nu8; g=('0'+t.getHours()).slice(-2)+':'+('0'+t.getMinutes()).slice(-2); }
    // Versnelling onbekend en een bekend merk: het woordmerk in het midden
    const mk=!k && g==='' && !!s.thema;
    if(mk) g=s.thema.naam;
    if(ge){ ge.classList.toggle('klok', k); ge.classList.toggle('merk', mk); }
    if(ge && g!==s.gear){ const was=s.gear; s.gear=g; ge.textContent=g; if(!k && !/:/.test(was)){ ge.classList.remove('wissel'); void ge.offsetWidth; ge.classList.add('wissel'); } }
  }
}

window.PLHyperlane = {
  STOPS:STOPS, OPSTART_S:OPSTART_S,
  kleur:kleur, stemming:stemming, modus:modus, leds:leds, nul100:nul100, volg:volg,
  versnelling:versnelling, warmte:warmte, nacht:nacht, scene:scene, SCENE_TEKST:SCENE_TEKST,
  MERKEN:MERKEN, merkThema:merkThema, accuStart:accuStart, START_RPM:START_RPM, POWER_S:POWER_S, gSpoor:gSpoor, GS_N:GS_N, tankStand:tankStand,
  ritBij:ritBij, ritNul100:ritNul100, scorebord:scorebord, duur:duur, telOp:telOp, SCORE_KM:SCORE_KM, RIT_PAUZE_S:RIT_PAUZE_S,
  rit:function(){ return _rit; }, _zetRit:function(r){ _rit=r; },
  KOUD_C:KOUD_C, HEET_C:HEET_C, REM_KMHS:REM_KMHS, STIL_S:STIL_S, CRUISE_S:CRUISE_S, CRUISE_KMH:CRUISE_KMH,
  _klok:klok,
  start:start, stop:stop, wek:wek, zet:zet,
  actief:function(){ return !!_s; }
};
})();
