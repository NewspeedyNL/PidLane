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
/* Schakellampjes: hoeveel van `n` er branden, en of het schakelpunt bereikt
   is (dan knipperen ze). Ze beginnen op LED_VAN van dat punt.
   Tot 31-10-2026 liepen ze naar de rode streep, vanaf 70%: bij gewoon rijden
   kwam je daar nooit, dus je zag ze niet. Nu lopen ze naar schakelDoel(). */
const LED_VAN = .8, RACE_FRAC = .9;
function leds(toeren, punt, n){
  n=n||10;
  const t=Number(toeren);
  if(!(punt>0) || toeren===null || !isFinite(t)) return { aan:0, max:false };
  const van=punt*LED_VAN;
  return { aan:Math.round(klem((t-van)/(punt-van), 0, 1)*n), max:t>=punt };
}
/* Waar de lampjes naartoe lopen. `eco` = PLBerekend.schakelPunt() (het
   toerental waarop CA11 opschakelen aanraadt), `hard` = vol gas of een
   belasting boven SCHAKEL.maxBelasting. Rustig rijden: het ecopunt; hard,
   of geen hogere versnelling bekend: RACE_FRAC van de rode streep. Nooit
   voorbij die streep. Puur. */
function schakelDoel(rood, eco, hard){
  const race=rood>0 ? rood*RACE_FRAC : null;
  if(hard || !(eco>0)) return race;
  return race ? Math.min(eco, race) : eco;
}
/* De pijl omhoog: het schakelpunt is bereikt en er is een hogere
   versnelling. `top` = de versnelling is bekend en er is er geen boven. */
function pijlOp(toeren, punt, top){
  const t=Number(toeren);
  return !top && punt>0 && toeren!==null && isFinite(t) && t>=punt;
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
/* Versnelling in km/h per seconde: de helling van een rechte lijn door de
   snelheden van de laatste VS_VENSTER s, pas vanaf VS_MIN s aan metingen.
   Tot 28-10-2026 kwam hij uit twee opeenvolgende metingen, en in de auto
   gaf constant 80 km/h zo ACCELERATIE en REMMEN van 0,4 g: snelheid komt in
   hele km/h en met een onregelmatige tussentijd, en 1 km/h in 50 ms is al
   20 km/h/s. `oud` = {v,t,a,hist} of null, t in seconden. Een gat van meer
   dan 3 s of een ontbrekende waarde begint opnieuw. Puur. */
const VS_VENSTER = 1.5, VS_MIN = 0.6;
function versnelling(oud, v, t){
  if(v===null || v===undefined || !isFinite(Number(v))) return null;
  v=Number(v);
  const h=(oud && oud.hist && t>=oud.t && t-oud.t<=3) ? oud.hist.filter(function(x){ return t-x.t<=VS_VENSTER; }) : [];
  h.push({ t:t, v:v });
  let a=0;
  if(h.length>=2 && t-h[0].t>=VS_MIN){
    let mt=0, mv=0; h.forEach(function(x){ mt+=x.t; mv+=x.v; }); mt/=h.length; mv/=h.length;
    let teller=0, noemer=0; h.forEach(function(x){ teller+=(x.t-mt)*(x.v-mv); noemer+=(x.t-mt)*(x.t-mt); });
    a=noemer>0 ? teller/noemer : 0;
  }
  return { v:v, t:t, a:a, hist:h };
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
/* ── De rit ── `rit` = null of {t, tv, km, top, maxT, rijS, beste}; t in s.
   Afstand en rijtijd tellen alleen over een gat van hoogstens 3 s: een
   gemiste meting verzint geen kilometers. `tv` is de laatste snelheids-
   meting en `t` de laatste meting van wat dan ook: de bus geeft toeren en
   snelheid los, en met één klok zette elke toerenmeting het gat terug op 0
   — de rit bleef op 0 km en het scorebord kwam nooit (27-10-2026, gezien in
   de showreel). Puur: geeft een nieuwe rit. */
const SCORE_KM = 0.3, RIT_PAUZE_S = 15*60;
function ritBij(rit, v, toeren, t, verbruik){
  const n=function(x){ return x!==null && x!==undefined && x!=='' && isFinite(Number(x)); };
  let r=rit ? Object.assign({}, rit) : null;
  if(!r || !(t>=r.t) || t-r.t>RIT_PAUZE_S) r={ t:t, km:0, top:0, maxT:0, rijS:0, beste:null, kmV:0, liter:0 };
  const dt=r.tv==null ? 0 : t-r.tv;
  if(n(v)){
    v=Number(v);
    if(dt>0 && dt<=3){
      const dk=v*dt/3600;
      r.km+=dk; if(v>=1) r.rijS+=dt;
      // Verbruik telt alleen over de kilometers waarop hij gemeten is.
      if(n(verbruik) && Number(verbruik)>=0 && dk>0){ r.kmV=(r.kmV||0)+dk; r.liter=(r.liter||0)+Number(verbruik)*dk/100; }
    }
    r.top=Math.max(r.top, v);
    r.tv=t;
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
/* ── De mooie run (28-10-2026) ── Het scorebord kwam na 0,3 km bij elke
   stilstand, dus in de stad bij elk stoplicht — en van stoplicht tot
   stoplicht is geen samenvatting waard. Een run is het stuk tussen twee
   stilstanden; vanzelf verschijnt het bord pas na RUN_KM én RUN_S rijden, of
   als er een 0–100 in zat. De hele rit kan altijd met het knopje. Puur. */
const RUN_KM = 3, RUN_S = 180;
function mooieRun(run){
  return !!run && ((run.km>=RUN_KM && run.rijS>=RUN_S) || (run.beste!==null && run.beste!==undefined && run.km>=SCORE_KM));
}
/* Het snelheidsverloop voor het grafiekje: één punt per `dt` s; vol (PROF_N)
   dan worden twee punten er één en halveert de resolutie. Zo past een run van
   een uur net zo goed als een van vijf minuten. Puur. */
const PROF_N = 96, PROF_DT = 2;
function profielBij(p, v, t){
  const q=p ? { dt:p.dt, t:p.t, pts:p.pts.slice() } : { dt:PROF_DT, t:null, pts:[] };
  if(v===null || v===undefined || !isFinite(Number(v))) return q;
  if(q.t!==null && t-q.t<q.dt) return q;
  q.t=t; q.pts.push(Math.max(0, Number(v)));
  if(q.pts.length>PROF_N){
    const h=[]; for(let i=0;i+1<q.pts.length;i+=2) h.push((q.pts[i]+q.pts[i+1])/2);
    if(q.pts.length%2) h.push(q.pts[q.pts.length-1]);
    q.pts=h; q.dt*=2;
  }
  return q;
}
/* De punten van het grafiekje in een vak van b×h, de top op 90%. Puur. */
function profielPad(pts, b, h){
  if(!pts || pts.length<2) return '';
  const mx=Math.max.apply(null, pts) || 1;
  return pts.map(function(v, i){ return (i/(pts.length-1)*b).toFixed(1)+','+(h-v/mx*h*.9).toFixed(1); }).join(' ');
}
/* Trend: elke tegel tegen het gemiddelde van de vorige runs. Lager is beter
   bij verbruik en 0–100. Onder TREND_MIN runs geen trend: één vorige run is
   geen gemiddelde. Een verschil onder 2% heet gelijk. Puur. */
const RUNS_SLEUTEL = 'pl_hl_runs', RUNS_N = 20, TREND_MIN = 2;
const TREND_SLEUTELS = ['top','nul100','maxt','gem','verbruik'], TREND_LAGER = { verbruik:1, nul100:1 };
function runSamen(tegels){ const o={}; (tegels||[]).forEach(function(x){ if(TREND_SLEUTELS.indexOf(x.sleutel)>=0 && isFinite(x.waarde)) o[x.sleutel]=x.waarde; }); return o; }
function trend(tegels, hist){
  const uit={};
  (tegels||[]).forEach(function(x){
    if(TREND_SLEUTELS.indexOf(x.sleutel)<0) return;
    const vs=(hist||[]).map(function(h){ return h && h[x.sleutel]; }).filter(function(v){ return typeof v==='number' && isFinite(v); });
    if(vs.length<TREND_MIN) return;
    const gem=vs.reduce(function(a, b){ return a+b; }, 0)/vs.length, d=x.waarde-gem;
    const stand=Math.abs(d)<Math.abs(gem)*.02 ? 'gelijk' : ((d<0)===!!TREND_LAGER[x.sleutel] ? 'beter' : 'slechter');
    uit[x.sleutel]={ delta:d, stand:stand, n:vs.length };
  });
  return uit;
}
function leesRuns(){
  try{ const r=JSON.parse(localStorage.getItem(RUNS_SLEUTEL)||'[]'); return Array.isArray(r) ? r : []; }
  catch(e){ console.warn('PLHyperlane: vorige runs onleesbaar, zonder trend', e); return []; }
}
function bewaarRun(sam){
  try{ const r=leesRuns(); r.push(sam); localStorage.setItem(RUNS_SLEUTEL, JSON.stringify(r.slice(-RUNS_N))); }
  catch(e){ console.warn('PLHyperlane: run niet bewaard', e); }
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
    uit.push(-g*.55*(1-a*.88), -.46+a*.24);
  }
  return uit;
}
/* De kleur van de tanklichtbalk: 'vol', 'laag' (< 25%) of 'leeg' (< 10%). */
function tankStand(pct){ const n=Number(pct); if(pct===null || pct===undefined || !isFinite(n)) return null; return n<10 ? 'leeg' : n<25 ? 'laag' : 'vol'; }

/* Optellen bij het verschijnen: 0 → 1 in 1,2 s, zacht uitlopend. */
function telOp(f){ f=klem(f, 0, 1); return 1-Math.pow(1-f, 3); }

/* ── Het hoofdgetal ── (27-10-2026, uit het gebruik: "de versnelling is zo
   groot dat het afleidt, terwijl andere data veel interessanter is.") De
   versnelling is nu een klein label naast de modus; het midden toont wat er
   in deze scène toe doet. `x` = {koel, verbruik, gas, versn (km/h/s),
   launchS, klok}. Geeft {w, e, l}: waarde-tekst, eenheid, label. Puur;
   `tekst` maakt het getal (komma, '—'). */
const ACC_KMHS = 4, ACC_UIT_KMHS = 2.5, VOLGAS = 80;
/* `vorig` = het label van nu: eenmaal ACCELERATIE blijft het tot onder
   ACC_UIT_KMHS, zodat het hoofdgetal rond de grens niet knippert. */
function heldN(v){ return v!==null && v!==undefined && v!=='' && isFinite(Number(v)); }
function heldG(kmhs){ return Math.abs(kmhs)/3.6/9.81; }
function held(sc, x, tekst, vorig){
  const n=heldN, g=heldG;
  if(sc==='alarm' && n(x.koel)) return { w:tekst(x.koel, 0), e:'°C', l:'KOELWATER' };
  if(sc==='launch' && n(x.launchS)) return { w:tekst(x.launchS, 1), e:'s', l:'0–100' };
  if(sc==='remmen' && n(x.versn)) return { w:tekst(g(x.versn), 2), e:'g', l:'REMMEN' };
  // Vol gas: verbruik zegt dan niets (30-10-2026). Optrekken in g, anders het gas.
  if(n(x.gas) && x.gas>=VOLGAS) return (n(x.versn) && x.versn>0) ? { w:tekst(g(x.versn), 2), e:'g', l:'ACCELERATIE' } : { w:tekst(x.gas, 0), e:'%', l:'GAS' };
  if(n(x.versn) && x.versn>=(vorig==='ACCELERATIE' ? ACC_UIT_KMHS : ACC_KMHS)) return { w:tekst(g(x.versn), 2), e:'g', l:'ACCELERATIE' };
  if(sc==='koud' && n(x.koel)) return { w:tekst(x.koel, 0), e:'°C', l:'OPWARMEN' };
  if(sc==='stil' && x.klok) return { w:x.klok, e:'', l:'' };
  if(n(x.verbruik)) return { w:tekst(x.verbruik, 1), e:'L/100', l:'VERBRUIK NU' };
  if(n(x.gas)) return { w:tekst(x.gas, 0), e:'%', l:'GAS' };
  return { w:'—', e:'', l:'' };
}
/* ── Rustig in het midden ── (30-10-2026, uit het gebruik: "bij optie
   versnelling verspringt het getal toch te snel naar andere pid … Slim ook
   niet te snel. Gewoon langzaam, informatief.") held() zegt wat er nú het
   meest toe doet, zes keer per seconde; heldRustig() beslist wat er op het
   scherm staat. Een getal blijft minstens HELD_MIN_S staan, behalve een te
   heet koelwater en de 0–100-timer: die wachten niet. Kan het getal dat er
   staat niet meer gemeten worden (heldWaarde() geeft null), dan wisselt hij
   meteen, want een oud getal laten staan is erger dan wisselen. Verbruik,
   gas en koelwater krijgen hoogstens elke HELD_WAARDE_S een nieuw getal;
   g en de timer lopen mee. Puur: `oud` = heldWaarde() van het label dat er
   staat. */
const HELD_MIN_S = 6, HELD_WAARDE_S = 1, HELD_DIRECT = { 'KOELWATER':1, '0–100':1 }, HELD_LOPEND = { 'ACCELERATIE':1, 'REMMEN':1, '0–100':1 };
function heldWaarde(l, sc, x, tekst){
  const n=heldN;
  if(l==='KOELWATER' || l==='OPWARMEN') return n(x.koel) ? { w:tekst(x.koel, 0), e:'°C' } : null;
  if(l==='0–100') return n(x.launchS) ? { w:tekst(x.launchS, 1), e:'s' } : null;
  if(l==='ACCELERATIE' || l==='REMMEN') return n(x.versn) ? { w:tekst(heldG(x.versn), 2), e:'g' } : null;
  // Vol gas: ook een verbruik dat er al stond gaat meteen weg
  if(l==='VERBRUIK NU') return n(x.verbruik) && !(n(x.gas) && x.gas>=VOLGAS) ? { w:tekst(x.verbruik, 1), e:'L/100' } : null;
  if(l==='GAS') return n(x.gas) ? { w:tekst(x.gas, 0), e:'%' } : null;
  if(l==='') return sc==='stil' && x.klok ? { w:x.klok, e:'' } : null;
  return null;
}
function heldRustig(st, h, oud, dt){
  const nieuw={ l:h.l, w:h.w, e:h.e, t:0, wt:0 };
  if(!st || !oud) return nieuw;
  const s={ l:st.l, w:st.w, e:st.e, t:st.t+dt, wt:st.wt+dt };
  if(h.l!==s.l && (HELD_DIRECT[h.l] || s.t>=HELD_MIN_S)) return nieuw;
  if(HELD_LOPEND[s.l] || s.wt>=HELD_WAARDE_S){ s.w=oud.w; s.e=oud.e; s.wt=0; }
  return s;
}
/* De versnelling groot, maar niet bij elke twijfel van PLGear weg: een
   onbekende houdt de laatste vast, en pas na GEAR_LEEG_S zonder versnelling
   wijkt hij voor het slimme getal. Terug komt hij pas als hij GEAR_TERUG_S
   weer bekend is. Een andere versnelling staat er meteen: tot 31-10-2026
   moest die hier nog 0,6 s kloppen, bovenop het wachten in PLGear zelf, en
   dan stond er 2 s na het schakelen nog de oude.
   `toon` is wat middenHeld() krijgt ('' = slim getal). Puur. */
const GEAR_LEEG_S = 12, GEAR_TERUG_S = 3;
function gearRustig(st, g, dt){
  const s=st ? { toon:st.toon, kand:st.kand, kt:st.kt, leeg:st.leeg, ooit:st.ooit } : { toon:'', kand:'', kt:0, leeg:0, ooit:false };
  if(!g){ s.leeg+=dt; s.kand=''; s.kt=0; if(s.leeg>=GEAR_LEEG_S) s.toon=''; return s; }
  s.leeg=0;
  if(g!==s.kand){ s.kand=g; s.kt=0; } else s.kt+=dt;
  const nodig=s.toon ? 0 : s.ooit ? GEAR_TERUG_S : 0;
  if(g!==s.toon && s.kt>=nodig){ s.toon=g; s.ooit=true; }
  return s;
}
/* ── De achtergrond ── (27-10-2026, uit het gebruik: "het rijdende effect
   van de tunnel vind ik top, maar het kan afleiden in het verkeer".) Het
   knopje wisselt rond door VORMEN. Tot 28-10-2026 zat er Auto in: in
   stilstand de tunnel, rijdend de gekozen vorm. Uit het gebruik: "tunnel
   blijft actief bij selectie andere visual" — wie Hartslag kiest, verwacht
   Hartslag. Nu is de keuze de vorm, altijd. 'stil' is nooit iets (en spaart
   de accu). */
/* ── Het midden ── (28-10-2026, na een paar uur testen: "misschien toch
   handiger om de versnelling daar in het midden te zetten — kan ik schakelen?")
   'slim' = het hoofdgetal van held(), 'versnelling' = de versnelling groot.
   Een te heet koelwater gaat altijd voor; een onbekende versnelling laat het
   slimme getal staan in plaats van een leeg midden. Puur. */
const MIDDEN = ['slim','versnelling'];
const MIDDEN_TEKST = { slim:'Slim', versnelling:'Versnelling' }, MIDDEN_SLEUTEL = 'pl_hl_midden';
function middenHeld(midden, sc, gear, h){
  if(midden!=='versnelling' || sc==='alarm' || !gear) return h;
  return { w:gear, e:'', l:'VERSNELLING' };
}
function leesMidden(){
  try{ const v=localStorage.getItem(MIDDEN_SLEUTEL); return MIDDEN.indexOf(v)>=0 ? v : 'slim'; }
  catch(e){ console.warn('PLHyperlane: middenkeuze niet te lezen, Slim', e); return 'slim'; }
}
function bewaarMidden(v){
  try{ localStorage.setItem(MIDDEN_SLEUTEL, v); }
  catch(e){ console.warn('PLHyperlane: middenkeuze niet bewaard — geldt tot de app sluit', e); }
}
/* ── Hartslag ── Een ECG-lijn: het papier loopt met vaste snelheid en de
   slagen liggen dichter bij elkaar naarmate de motor harder draait. Tot
   28-10-2026 stond het ritme als sin(x·f + T·v) in de shader, met v uit het
   toerental: na een paar minuten is T groot, en dan versprong de hele lijn bij
   elke toerenmeting — dat was het stotteren. Nu telt de fase hier op, en elke
   slag krijgt een plek die alleen nog met het papier meeschuift. `st` =
   {bpm, fase, x:[...]}; hr = toeren als deel van het bereik (null = rust);
   `rand` = de rechterrand in schermeenheden. Puur: geeft een nieuwe stand. */
const POLS_RUST = 62, POLS_MAX = 138, POLS_PAPIER = .55, POLS_N = 12;
function polsBij(st, hr, dt, rand){
  const s=st ? { bpm:st.bpm, fase:st.fase, x:st.x.slice() } : { bpm:POLS_RUST, fase:0, x:[] };
  const doel=POLS_RUST+(POLS_MAX-POLS_RUST)*(hr==null || !isFinite(hr) ? 0 : klem(hr, 0, 1));
  s.bpm=volg(s.bpm, doel, dt, .5);   // traag: een pols versnelt, hij springt niet
  for(let i=0;i<s.x.length;i++) s.x[i]-=dt*POLS_PAPIER;
  s.fase+=dt*s.bpm/60;
  if(s.fase>=1){ s.fase-=Math.floor(s.fase); s.x.push(rand+.12); }
  s.x=s.x.filter(function(x){ return x>-rand-.4; });
  if(s.x.length>POLS_N) s.x=s.x.slice(-POLS_N);
  return s;
}
function polsUniform(st){ const u=new Float32Array(POLS_N).fill(-99); (st ? st.x : []).forEach(function(x, i){ u[i]=x; }); return u; }
const VORMEN = ['aurora','hartslag','pulsen','sterren','stil','tunnel'];
const VORM_TEKST = { aurora:'Aurora', hartslag:'Hartslag', pulsen:'Pulsen', sterren:'Sterren', stil:'Stil', tunnel:'Tunnel' };
const VORM_SLEUTEL = 'pl_hl_vorm';
function volgendeVorm(v){ const i=VORMEN.indexOf(v); return VORMEN[(i+1)%VORMEN.length]; }
/* Wat er nu getekend wordt. Onbekende snelheid telt als rijden: liever te
   rustig dan een tunnel die op de snelweg gaat stromen. Puur. */
/* De vorm die getekend wordt: de keuze, een onbekende wordt Aurora. Puur. */
function actieveVorm(vorm){ return VORMEN.indexOf(vorm)<0 ? 'aurora' : vorm; }
function leesVorm(){
  try{ const v=localStorage.getItem(VORM_SLEUTEL); return VORMEN.indexOf(v)>=0 ? v : 'aurora'; }
  catch(e){ console.warn('PLHyperlane: vormkeuze niet te lezen, Aurora', e); return 'aurora'; }
}
function bewaarVorm(v){
  try{ localStorage.setItem(VORM_SLEUTEL, v); }
  catch(e){ console.warn('PLHyperlane: vormkeuze niet bewaard — geldt tot de app sluit', e); }
}
/* De schaal van een ring met een zelfgekozen sensor: vijf vakken van lo tot
   hi, cijfers met één decimaal als het bereik klein is. Puur. */
function ringSchaal(lo, hi){
  const n=5, st=(hi-lo)/n, dec=Math.abs(hi-lo)<10 ? 1 : 0;
  return { n:n, lab:function(i){ return lo+st*i; }, dec:dec };
}
/* De tekst in de modusregel per scène; null = de gewone modus(). */
const SCENE_TEKST = { alarm:'KOELWATER HEET', begrenzer:'SCHAKELEN', launch:'LAUNCH', koud:'MOTOR KOUD', stil:'STIL', cruise:'CRUISE · ZEN' };

// ── TEKENING ──────────────────────────────────────────────────────
// Het vak zelf (canvas, ringen, strook, met de id's vpf-p-*/vpf-w-*) tekent
// PLVisProfiel.html(), net als bij elk profiel; hier alleen wat beweegt.
const FS='precision highp float;'+
'uniform vec2 R;uniform float T,Z,E,W,B,K,A,F,D,GA,VT,VA,VH,VP,VS;uniform vec3 C1,C2;uniform vec2 P;uniform vec2 GP[24];uniform float HB[12];'+
'float ecg(float u){return .06*exp(-pow((u+.30)/.05,2.))-.08*exp(-pow((u+.035)/.016,2.))+.62*exp(-pow(u/.018,2.))-.16*exp(-pow((u-.04)/.018,2.))+.14*exp(-pow((u-.30)/.07,2.));}'+
'float pols(float x){float y=0.;for(int i=0;i<12;i++)y+=ecg((x-HB[i])*1.5);return y;}'+
'float sd(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h);}'+
'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}'+
'void main(){'+
' vec2 q=(gl_FragCoord.xy-.5*R)/R.y; vec2 p=q-P;'+
' vec3 c=vec3(0.);'+
' if(VT>.001){'+                                            // TUNNEL
'  float r=mix(length(p),max(abs(p.x)*.55,abs(p.y)),.7)+1e-3;'+
'  float a=atan(p.y,p.x)/6.2831853;'+
'  float z=.32/r*(1.+F*1.6)+Z;'+
'  float fog=smoothstep(.02,.45,r);'+
'  float lz=abs(fract(z)-.5), la=abs(fract(a*28.)-.5);'+
'  float ring=exp(-pow(lz*(3.+55.*r),2.))*fog;'+
'  float rad=exp(-pow(la*r*70.,2.))*fog*.55;'+
'  vec2 cel=vec2(floor(a*56.),floor(z*3.+Z*2.));'+
'  float s=step(.985-E*.05-F*.08,h(cel));'+
'  float sz=fract(z*3.+Z*2.);'+
'  float streep=s*smoothstep(0.,.7,sz)*smoothstep(1.,.85,sz)*exp(-pow(abs(fract(a*56.)-.5)*r*90.,2.))*fog;'+
'  float kern=.06/(r*r*30.+.25);'+
'  vec3 t=C1*ring*(.35+E*.9)+C2*rad*(.25+E*.5)+mix(C2,vec3(1),.4)*streep*(1.2+E*2.)+C2*kern*(.5+E);'+
'  t+=mix(C2,vec3(1),.5)*exp(-pow((r-(.04+W*1.1))*22.,2.))*exp(-W*2.2)*1.6;'+      // golf bij opschakelen
'  float sp=0.;'+                                           // G-spoor over de vloer
'  for(int i=0;i<23;i++){float b=float(i)/23.;sp+=exp(-pow(sd(q,GP[i],GP[i+1])*(170.-b*120.),2.))*(1.-b*.85);}'+
'  t+=mix(C2,vec3(1),.55)*sp*GA*1.3;'+
'  c+=t*VT;'+
' }'+
' if(VA>.001){'+                                            // AURORA: drie sluiers, ca. 10 s per golf
'  vec3 au=vec3(0.);'+
'  for(int k=0;k<3;k++){float fk=float(k);'+
'   float y=.18-fk*.16+.10*sin(q.x*(1.1+fk*.4)+T*(.10+fk*.03)+fk*2.)+.05*sin(q.x*3.1-T*.07+fk);'+
'   float band=exp(-pow((q.y-y)*(5.+fk*2.),2.))*(.55+.45*sin(q.x*2.3+T*.15+fk*1.7));'+
'   au+=mix(C1,C2,fk*.5)*band*(.30+E*.25);}'+
'  c+=au*VA;'+
' }'+
' if(VH>.001){'+                                            // HARTSLAG: een ECG-lijn, slagen uit HB (polsBij)
'  float amp=.13+.05*E, e=.012;'+
'  vec2 l0=vec2(q.x-e,-.30+amp*pols(q.x-e)), l1=vec2(q.x,-.30+amp*pols(q.x)), l2=vec2(q.x+e,-.30+amp*pols(q.x+e));'+
'  float d=min(sd(q,l0,l1),sd(q,l1,l2));'+                 // afstand tot de lijn zelf: een steile piek blijft even dik, zonder lichtzuil
'  float rand=smoothstep(1.2,.75,abs(q.x));'+
'  float dv=abs(q.y+.30);'+                                // de brede gloed hangt aan de basislijn, niet aan de piek
'  c+=(mix(C2,vec3(1),.5)*exp(-pow(d*120.,2.))+C1*exp(-pow(d*22.,2.))*.35+C2*exp(-pow(dv*5.,2.))*.07)*VH*rand;'+
' }'+
' if(VP>.001){'+                                            // PULSEN: stil, alleen een ring bij schakelen, remmen of de begrenzer
'  float l=length(q*vec2(.8,1.));'+
'  vec3 pu=C2*exp(-pow((l-(.05+W*.9))*26.,2.))*exp(-W*1.6)*1.4;'+
'  pu+=C1*.05/(l*l*14.+.6);'+
'  c+=pu*VP;'+
' }'+
' if(VS>.001){'+                                            // STERREN: schuiven alleen mee met G en kantelen
'  vec3 st=vec3(0.);'+
'  for(int k=0;k<3;k++){float fk=float(k);'+
'   vec2 g=(q-P*(1.+fk*1.5))*(9.+fk*7.);'+
'   vec2 id=floor(g), f=fract(g)-.5;'+
'   float hv=h(id+fk*17.);'+
'   if(hv>.86){vec2 o=vec2(h(id+3.1),h(id+7.7))-.5;'+
'    float tw=.6+.4*sin(T*(.4+hv)+hv*40.);'+
'    st+=mix(C2,vec3(1),.6)*exp(-dot(f-o*.6,f-o*.6)*(900.-fk*250.))*tw*(1.-fk*.25);}}'+
'  c+=st*VS;'+
' }'+
' float l=dot(c,vec3(.3,.5,.2));'+
' c=mix(c,vec3(l)*vec3(.75,.95,1.3),K*.65);'+             // koud: ijs
' c=mix(c,vec3(1.,.12,.16)*(l*1.6+.04),B*smoothstep(.15,-.45,q.y));'+  // remmen: onderkant rood
' c+=vec3(1.,.05,.1)*B*.35*smoothstep(-.25,-.65,q.y);'+
' c=mix(c,vec3(1.,.08,.12)*(.25+l*1.5),A*(.55+.45*sin(T*7.)));'+  // alarm
' c*=1.-.35*smoothstep(.6,1.2,length(q));'+
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
    const U={}; ['R','T','Z','E','W','B','K','A','F','D','GA','GP','VT','VA','VH','VP','VS','HB','C1','C2','P'].forEach(function(n){ U[n]=gl.getUniformLocation(pr, n); });
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
let _run = null;            // de run: het stuk sinds de laatste stilstand

function opties(){
  // De schaal van de plekken uit het profiel (diesel: 6000 rpm, #393).
  // Een ring met een zelfgekozen sensor (ind.vervang) krijgt diens naam,
  // eenheid en schaal; de toeren- en snelheidslogica laten hem dan met rust.
  const o={ toerenHi:8000, snelHi:240, ring:{} };
  try{
    const P=window.PLVisProfiel, V=window.PLVisueel, ind=V && V.staat && V.staat().ind;
    const pi=ind && ind.profiel, p=P && pi ? P.voorInd('hyperlane', pi) : null;
    (p && p.plekken || []).forEach(function(x){
      // Een eigen factor (PLToon) maakt er ook een ander getal van dan toeren of km/h.
      const v=!!(pi.vervang && pi.vervang[x.rol]) || !!(pi.weergave && pi.weergave[x.rol] && pi.weergave[x.rol].factor);
      if(x.rol==='toeren' && !v) o.toerenHi=x.hi;
      if(x.rol==='snel' && !v) o.snelHi=x.hi;
      if(v && (x.rol==='toeren' || x.rol==='snel')) o.ring[x.rol]={ lo:x.lo, hi:x.hi, dec:x.dec||0, eenh:String((x.kort||x.naam||'')+(x.eenheid ? ' '+x.eenheid : '')).toUpperCase() };
    });
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
       nul:{ start:null, stil:null, los:null }, badgeT:0, tilt:[0,0], tiltDoel:[0,0], gearT:0, gear:'', schakel:{ eco:null, top:false }, maat:'' , raf:0, opt:opties(),
       // scènes: de gewichten lopen vloeiend naar hun doel, zodat geen scène aanspringt
       sc:'', g:{ B:0, K:0, A:0, F:0, Z:0, D:1 }, golf:99, vs:null, stilS:0, cruiseS:0, lat:0,
       ritPiek:0, topGemeld:0, klokT:0,
       accu:null, power:null, gHist:[], gT:0, ga:0, thema:merkNu(), tankT:'',
       verv:{}, hand:0, scoreDicht:false, runKlaar:false, vorm:leesVorm(), vw:{ tunnel:1, aurora:0, hartslag:0, pulsen:0, sterren:0 }, vormT:'', scWas:'', midden:leesMidden(), middenT:'' };
  wortel.classList.toggle('vhl-gl', !!_s.gl);
  wortel.querySelectorAll('.vhl-ring').forEach(function(c){ _s.ringen[c.getAttribute('data-ring')]=c; });
  const kn=wortel.querySelector('.vhl-vorm');
  if(kn) kn.addEventListener('click', function(e){
    e.stopPropagation();   // niet ook een plek kiezen
    if(!_s) return;
    _s.vorm=volgendeVorm(_s.vorm); bewaarVorm(_s.vorm);
  });
  // Het midden: het knopje of een tik op het grote getal wisselt
  const wissel=function(e){
    e.stopPropagation();
    if(!_s) return;
    _s.midden=_s.midden==='slim' ? 'versnelling' : 'slim'; bewaarMidden(_s.midden);
    _s.gearT=0;   // meteen tonen, niet pas bij de volgende ronde
  };
  const km=wortel.querySelector('.vhl-midden'), kh=wortel.querySelector('.vhl-held');
  if(km) km.addEventListener('click', wissel);
  if(kh) kh.addEventListener('click', wissel);
  const kr=wortel.querySelector('.vhl-ritknop'), ks=wortel.querySelector('.vhl-score');
  [kr, ks].forEach(function(x){ if(x) x.addEventListener('click', function(e){ e.stopPropagation(); scoreKnop(); }); });
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
  // Hyperlane zelf, of een profiel in de Hyperlane-schil (.vhl-schil)
  const w=(g || document).querySelector('.vpf-hyper, .vhl-schil, .vhl-basis');
  if(w && (!_s || _s.wortel!==w)) start(w);
}
/* De schil van een ander profiel: welke rol een binnenkomende PID speelt
   voor de kleur en de scènes. Het gaspedaal gaat vóór de gasklep (dezelfde
   volgorde als de gasplek van Hyperlane): `huidig` is de PID die de rol nu
   heeft, een minder goede vervangt hem niet. Puur. */
const VOED = { '010C':'toeren', '010D':'snel', '0105':'koel', '0167':'koel', '0142':'accu', '012F':'tank', 'CA03':'verbruik' };
const VOED_GAS = ['0149','015A','014A','0111'];
function voedRol(pid, huidigGas){
  if(VOED[pid]) return VOED[pid];
  const i=VOED_GAS.indexOf(pid);
  if(i<0) return null;
  const j=VOED_GAS.indexOf(huidigGas);
  return (j<0 || i<=j) ? 'gas' : null;
}
function voed(pid, val, st){
  const schil=function(){ return !!_s && (_s.wortel.classList.contains('vhl-schil') || _s.wortel.classList.contains('vhl-basis')); };
  if(!_s || !_s.wortel.isConnected || !schil()) wek();
  if(!schil()) return;
  const rol=voedRol(pid, _s.gasPid);
  if(!rol) return;
  if(rol==='gas') _s.gasPid=pid;
  zet(rol, val, st, false);
}
/* Eén meetwaarde, al begrensd en via PLToon. */
/* `vervangen` = de bestuurder koos zelf een andere sensor voor deze plek.
   Dan is de waarde alleen een getal om te tonen: geen gas in de kleur, geen
   koelwater in de scènes, geen snelheid in de rit (27-10-2026). */
function zet(rol, v, st, vervangen){
  const n=Number(v);
  if(!_s || !_s.wortel.isConnected) wek();
  if(!_s) return;
  _s.doel[rol]=(v===null || v===undefined || v==='' || !isFinite(n)) ? null : n;
  _s.verv[rol]=!!vervangen;
  if(rol==='koel') _s.koelSt=vervangen ? null : (st||null);
  if(vervangen) return;
  const e=echt(_s);
  if(rol==='snel') _s.vs=versnelling(_s.vs, e.snel, performance.now()/1000);
  const nu=performance.now()/1000;
  if(rol==='snel' || rol==='toeren'){
    _rit=ritBij(_rit, rol==='snel' ? e.snel : null, rol==='toeren' ? e.toeren : null, nu, e.verbruik);
    _run=ritBij(_run, rol==='snel' ? e.snel : null, rol==='toeren' ? e.toeren : null, nu, e.verbruik);
    if(rol==='snel'){ _rit.prof=profielBij(_rit.prof, e.snel, nu); _run.prof=profielBij(_run.prof, e.snel, nu); }
  }
  if(rol==='accu' || rol==='toeren'){
    const a=accuStart(_s.accu, rol==='accu' ? e.accu : null, rol==='toeren' ? e.toeren : null, nu);
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
/* De waarden die als hun eigen grootheid tellen: een vervangen plek is null. */
const ROLLEN = ['toeren','snel','koel','gas','accu','tank','bereik','verbruik'];
function echt(s){ const e={}; ROLLEN.forEach(function(r){ e[r]=s.verv[r] ? null : (s.doel[r]==null ? null : s.doel[r]); }); return e; }
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
/* Ecopunt en of dit de hoogste versnelling is, uit PLBerekend (CA11). */
function schakelLees(){
  try{
    const B=window.PLBerekend;
    if(!B || typeof B.schakelBron!=='function') return { eco:null, top:false };
    const b=B.schakelBron(), r=b.ratios||{};
    return { eco:B.schakelPunt(b.gear, r, b.diesel), top:typeof b.gear==='number' && b.gear>=1 && !!r[b.gear] && !r[b.gear+1] };
  }catch(e){ console.warn('PLHyperlane: schakelpunt niet te lezen', e); return { eco:null, top:false }; }
}
function belastingHoog(){
  const v=(typeof window.pidVals==='object' && window.pidVals) ? window.pidVals['0104'] : null;
  const max=(window.PLBerekend && window.PLBerekend.SCHAKEL) ? window.PLBerekend.SCHAKEL.maxBelasting : 75;
  return v!==null && v!==undefined && isFinite(Number(v)) && Number(v)>max;
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
/* Het scorebord. Vanzelf alleen na een mooie run in stilstand (`run`);
   met het knopje de hele rit (`rit`, HAND_S lang). Een tik op het bord
   sluit het; de volgende run brengt het pas weer vanzelf. */
const HAND_S = 20;
function scoreBij(w, sc, dt, nu){
  const el=w.querySelector('.vhl-score'); if(!el) return;
  const s=_s, stil=s.stilS>=STIL_S && sc!=='alarm';
  // Wegrijden na een stilstand: de run is voorbij, een nieuwe begint
  if(s.stilS>=STIL_S) s.runKlaar=true;
  else if(s.runKlaar && s.stilS===0){ _run=null; s.runKlaar=false; s.scoreDicht=false; }
  if(s.hand>0) s.hand=Math.max(0, s.hand-dt);
  let bron=null, tegels=null;
  if(s.hand>0){ bron='rit'; tegels=scorebord(_rit) || []; }
  else if(stil && !s.power && !s.scoreDicht && mooieRun(_run)){ bron='run'; tegels=scorebord(_run); }
  if(!tegels){ if(s.score){ s.score=null; el.classList.remove('aan'); w.classList.remove('vhl-score-aan'); } return; }
  if(!s.score || s.score.bron!==bron){
    const r=bron==='run' ? _run : _rit;
    // De trend één keer per run, vóór hij zelf in de lijst komt
    if(bron==='run' && !r.trend){ r.trend=trend(tegels, leesRuns()); bewaarRun(runSamen(tegels)); }
    const tr=bron==='run' ? r.trend : {}, n=Object.keys(tr).reduce(function(m, k){ return Math.max(m, tr[k].n); }, 0);
    const pad=profielPad(r && r.prof ? r.prof.pts : null, 200, 40);
    s.score={ f:0, tegels:tegels, bron:bron };
    el.innerHTML='<div class="vhl-score-kop">'+(bron==='run' ? 'RUN' : 'RIT')+' · <span class="vhl-score-klok"></span></div>'+
      (n ? '<div class="vhl-score-sub">vergeleken met je vorige '+n+' runs</div>' : '')+
      (tegels.length ? '<div class="vhl-score-tegels">'+tegels.map(function(x, i){
        const t=tr[x.sleutel], pijl=t ? (t.stand==='gelijk' ? '＝' : (t.delta>0 ? '▲ ' : '▼ ')+tekstVan(Math.abs(t.delta), x.dec)) : '';
        return '<div class="vhl-tegel" data-tegel="'+x.sleutel+'" style="--i:'+i+'"><small>'+x.label+'</small><b>0</b><span>'+x.eenheid+'</span>'+
          (t ? '<em class="vhl-trend '+t.stand+'">'+pijl+'</em>' : '')+'</div>';
      }).join('')+'</div>' : '<div class="vhl-score-leeg">Nog geen rit om te tonen</div>')+
      (pad ? '<svg class="vhl-score-graf" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true">'+
        '<polygon points="0,40 '+pad+' 200,40"></polygon><polyline points="'+pad+'"></polyline></svg>' : '');
    el.classList.add('aan'); w.classList.add('vhl-score-aan');
  }
  const S=s.score; S.f+=dt/1.2;
  const k=el.querySelector('.vhl-score-klok'), kt=('0'+nu.getHours()).slice(-2)+':'+('0'+nu.getMinutes()).slice(-2);
  if(k && k.textContent!==kt) k.textContent=kt;
  S.tegels.forEach(function(x, i){
    const b=el.querySelector('[data-tegel="'+x.sleutel+'"] b'); if(!b) return;
    const f=telOp(S.f-i*.08), t=x.tekst ? duur(x.waarde*f) : tekstVan(x.waarde*f, x.dec);
    if(b.textContent!==t) b.textContent=t;
  });
}
/* Het knopje 🏁 en een tik op het bord. */
function scoreKnop(){
  if(!_s) return;
  if(_s.score){ _s.hand=0; _s.scoreDicht=true; }
  else _s.hand=HAND_S;
}
function frame(nu){
  const s=_s; if(!s) return;
  // Weggegooid of verborgen: stoppen. De volgende zet() of wek() start opnieuw.
  if(!s.wortel.isConnected || !s.wortel.getClientRects().length){ stop(); return; }
  s.raf=requestAnimationFrame(frame);
  const dt=Math.min(.05, (nu-s.last)/1000), T=(nu-s.t0)/1000; s.last=nu;
  maatBij();
  const o=s.opt, rood=o.toerenHi*.85, d=s.doel, w=s.wortel, e=echt(s);
  ['toeren','snel'].forEach(function(r){ if(d[r]!=null) s.toon[r]=volg(s.toon[r], d[r], dt, 10); });
  const zwaai=T<OPSTART_S ? Math.sin(T/OPSTART_S*Math.PI) : 0, live=T>=OPSTART_S;
  const deel=function(r, hi){ const x=o.ring[r]; return x ? klem((s.toon[r]-x.lo)/(x.hi-x.lo), 0, 1) : klem(s.toon[r]/hi, 0, 1); };
  const rf=live ? deel('toeren', o.toerenHi) : zwaai, sf=live ? deel('snel', o.snelHi) : zwaai;
  s.stem=volg(s.stem, live ? stemming(e.toeren, rood, e.gas) : zwaai*.9, dt, 2.2);
  // De scène en zijn gewichten
  const vs=s.vs ? s.vs.a : 0;
  s.stilS=(e.snel!=null && e.snel<1) ? s.stilS+dt : 0;
  s.cruiseS=(e.snel!=null && e.snel>=CRUISE_KMH && Math.abs(vs)<1.5) ? s.cruiseS+dt : 0;
  const sc=live ? scene({ koel:e.koel, koelSt:s.koelSt, toeren:e.toeren, rood:rood, snel:e.snel, versn:vs,
                          stilS:s.stilS, launch:s.nul.start!==null, cruiseS:s.cruiseS }) : 'rijden';
  if(sc!==s.sc){
    // Pulsen (en de tunnel) krijgen een ring bij het begin van remmen of de begrenzer
    if(sc==='remmen' || sc==='begrenzer') s.golf=0;
    s.sc=sc; w.setAttribute('data-scene', sc);
  }
  // De achtergrond: wat er nu getekend wordt, vloeiend overgevloeid
  const av=actieveVorm(s.vorm), VW=s.vw;
  ['tunnel','aurora','hartslag','pulsen','sterren'].forEach(function(k){ VW[k]=volg(VW[k], av===k ? 1 : 0, dt, 1.6); });
  if(VW.hartslag>.001) s.pols=polsBij(s.pols, e.toeren==null ? null : e.toeren/o.toerenHi, dt, s.bg && s.bg.height ? s.bg.width/s.bg.height/2 : 1);
  const kn=w.querySelector('.vhl-vorm'), kt=VORM_TEKST[av];
  if(kn && s.vormT!==kt){ s.vormT=kt; kn.textContent=kt; }
  w.classList.toggle('vhl-zonder', av==='stil');
  const G=s.g, nu8=PLHyperlane._klok();
  G.B=volg(G.B, sc==='remmen'?1:0, dt, 5); G.K=volg(G.K, sc==='koud'?1:0, dt, 1.5); G.A=volg(G.A, sc==='alarm'?1:0, dt, 3);
  G.F=volg(G.F, sc==='launch'?1:0, dt, 2); G.Z=volg(G.Z, sc==='cruise'?1:0, dt, .8);
  // Ademen in stilstand alleen in de tunnel: de rustige vormen bewegen al zacht
  G.D=volg(G.D, (nacht(nu8.getHours()) ? .62 : 1)*(sc==='stil' ? 1-VW.tunnel*.22*(1-Math.sin(T*1.4)) : 1), dt, 3);
  s.golf+=dt;
  s.lat=volg(s.lat, zijG(), dt, 3);
  // G-spoor: tien punten per seconde, zichtbaar zolang er echt gestuurd wordt
  if((s.gT-=dt)<=0){ s.gT=.1; s.gHist.unshift(s.lat); if(s.gHist.length>GS_N) s.gHist.length=GS_N; }
  s.ga=volg(s.ga, s.gHist.some(function(g){ return Math.abs(g)>.12; }) ? 1 : 0, dt, 2);
  w.style.setProperty('--vhl-warm', warmte(e.koel).toFixed(3));
  const pal=s.thema ? s.thema.stops : STOPS;
  let c=kleur(s.stem*(1-.45*G.Z), pal), c2=kleur(Math.min(1, s.stem*(1-.45*G.Z)+.18), pal);
  const meng=function(a, b, t){ return a.map(function(v,k){ return v+(b[k]-v)*t; }); };
  c=meng(meng(meng(c, [150,215,255], G.K*.8), [255,40,60], Math.max(G.A, G.B*.6)), [40,255,190], G.Z*.35);
  c2=meng(meng(c2, [190,235,255], G.K*.8), [255,70,90], Math.max(G.A, G.B*.6));
  w.style.setProperty('--vhl-c', css(c)); w.style.setProperty('--vhl-c2', css(c2)); w.style.setProperty('--vhl-e', s.stem.toFixed(3));
  s.Z+=dt*(.15+(e.snel!=null ? e.snel : 0)/55)*(1-.6*G.A)*(1-.35*G.Z);
  s.piek.toeren=Math.max(rf, s.piek.toeren-dt*.04); s.piek.snel=Math.max(sf, s.piek.snel-dt*.04);
  // 0–100
  const n=nul100(s.nul, e.snel, e.gas, T); s.nul=n.st;
  const badge=w.querySelector('.vhl-badge');
  if(n.tijd!==null){ _rit=ritNul100(_rit, n.tijd); _run=ritNul100(_run, n.tijd); }
  if(n.tijd!==null && badge){ badge.textContent='0–100  '+tekstVan(n.tijd, 1)+' s'; badge.classList.add('aan'); s.badgeT=6; }
  else if(s.nul.start!==null && badge && T-s.nul.start>.3){ badge.textContent='0–100  '+tekstVan(T-s.nul.start, 1)+' s'; badge.classList.add('aan'); s.badgeT=.4; }
  // Rit-topsnelheid: gemeld zodra je na een nieuwe piek boven 100 weer inhoudt
  if(e.snel!=null) s.ritPiek=Math.max(s.ritPiek, e.snel);
  if(badge && s.badgeT<=0 && vs<-2 && s.ritPiek>=100 && s.ritPiek>=s.topGemeld+5){
    s.topGemeld=s.ritPiek; badge.textContent='TOP  '+tekstVan(s.ritPiek, 0)+' km/h'; badge.classList.add('aan'); s.badgeT=5;
  }
  if(s.badgeT>0 && (s.badgeT-=dt)<=0 && badge) badge.classList.remove('aan');
  // Kantelen met de telefoon
  s.tilt[0]=volg(s.tilt[0], s.tiltDoel[0], dt, 4); s.tilt[1]=volg(s.tilt[1], s.tiltDoel[1], dt, 4);
  w.style.setProperty('--vhl-tx', (s.tilt[0]*5).toFixed(2)+'deg'); w.style.setProperty('--vhl-ty', (s.tilt[1]*7+s.lat*9).toFixed(2)+'deg');
  if(s.gl && av!=='stil'){
    const gl=s.gl.gl, U=s.gl.U;
    gl.uniform1f(U.VT, VW.tunnel); gl.uniform1f(U.VA, VW.aurora); gl.uniform1f(U.VH, VW.hartslag); gl.uniform1f(U.VP, VW.pulsen); gl.uniform1f(U.VS, VW.sterren);
    gl.uniform1fv(U.HB, polsUniform(s.pols));
    gl.uniform2f(U.R, s.bg.width, s.bg.height); gl.uniform1f(U.T, T); gl.uniform1f(U.Z, s.Z); gl.uniform1f(U.E, s.stem);
    gl.uniform3f(U.C1, c[0]/255, c[1]/255, c[2]/255); gl.uniform3f(U.C2, c2[0]/255, c2[1]/255, c2[2]/255);
    gl.uniform2f(U.P, s.tilt[1]*.04-s.lat*.14, -s.tilt[0]*.03);
    gl.uniform1f(U.GA, s.ga); gl.uniform2fv(U.GP, gSpoor(s.gHist));
    gl.uniform1f(U.W, s.golf); gl.uniform1f(U.B, G.B); gl.uniform1f(U.K, G.K); gl.uniform1f(U.A, G.A); gl.uniform1f(U.F, G.F); gl.uniform1f(U.D, G.D);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const nT=Math.round(o.toerenHi/1000), nS=Math.round(o.snelHi/20);
  // Een ring met een zelfgekozen sensor: diens schaal, cijfers en eenheid
  const eigen=function(r, v, piek){
    const x=o.ring[r], sch=ringSchaal(x.lo, x.hi);
    return { v:v, n:sch.n, piek:piek, col:c, lab:function(i){ return tekstVan(sch.lab(i), sch.dec); },
      txt:live ? (d[r]==null ? '—' : tekstVan(s.toon[r], x.dec)) : '', eenh:x.eenh };
  };
  if(s.ringen.toeren) ring(s.ringen.toeren, o.ring.toeren ? eigen('toeren', rf, s.piek.toeren) : { v:rf, n:nT, rood:rood/(nT*1000), piek:s.piek.toeren, col:c, lab:function(i){ return i; },
    txt:live ? (d.toeren==null ? '—' : tekstVan(s.toon.toeren/1000, 1)) : '', eenh:'× 1000 TPM' });
  if(s.ringen.snel) ring(s.ringen.snel, o.ring.snel ? eigen('snel', sf, s.piek.snel) : { v:sf, n:nS, piek:s.piek.snel, col:c, lab:function(i){ return i*20; },
    txt:live ? (d.snel==null ? '—' : tekstVan(s.toon.snel, 0)) : '', eenh:'KM/H' });
  // Schakellampjes, met een flits over de rand op de begrenzer
  // De flits over de rand alleen in de tunnel: in een rustige vorm knipperen alleen de lampjes
  // Het schakelpunt (31-10-2026): rustig het ecopunt van CA11, hard de rode
  // streep. De flits over de rand blijft voor de begrenzer zelf.
  const hard=(e.gas!=null && e.gas>=VOLGAS) || belastingHoog(), punt=live ? schakelDoel(rood, s.schakel.eco, hard) : null;
  const l=leds(e.toeren, punt, 10), knip=l.max && (T*12|0)%2===0, flits=knip && av==='tunnel' && e.toeren>=rood*.98;
  const op=live && pijlOp(e.toeren, punt, s.schakel.top), pe=w.querySelector('.vhl-pijl');
  if(pe && pe.classList.contains('aan')!==op) pe.classList.toggle('aan', op);
  w.querySelectorAll('.vhl-leds i').forEach(function(e, i){ e.className=l.max ? (knip ? 'max' : '') : (i<l.aan ? (i<4 ? 'g' : i<7 ? 'a' : 'r') : ''); });
  w.classList.toggle('vhl-knip', flits);
  scoreBij(w, sc, dt, nu8);
  tankBij(w, e);
  powerBij(w, dt, e);
  const m=sc==='alarm' && e.koel!=null ? 'KOELWATER '+tekstVan(e.koel, 0)+'°' : (SCENE_TEKST[sc] || modus(s.stem)), me=w.querySelector('.vhl-modus');
  if(me && me.textContent!==m) me.textContent=m;
  if((s.gearT-=dt)<=0){
    s.gearT=.15;
    const g=gearLees(), ge=w.querySelector('.vhl-gear');
    s.schakel=schakelLees();
    // Opschakelen: een lichtgolf door de tunnel
    if(/^\d$/.test(g) && /^\d$/.test(s.gear) && Number(g)>Number(s.gear)) s.golf=0;
    if(ge && g!==s.gear){ s.gear=g; ge.textContent=g; ge.classList.remove('wissel'); void ge.offsetWidth; ge.classList.add('wissel'); }
    // Het merk: klein boven de lampjes, altijd als het bekend is
    const mk=w.querySelector('.vhl-merk'), mt=s.thema ? s.thema.naam : '';
    if(mk && mk.textContent!==mt) mk.textContent=mt;
    // Het hoofdgetal (zes keer per seconde: rustig genoeg om te lezen)
    const hx={ koel:e.koel, verbruik:e.verbruik, gas:e.gas, versn:s.vs ? s.vs.a : null,
                       launchS:s.nul.start!==null ? T-s.nul.start : null,
                       klok:('0'+nu8.getHours()).slice(-2)+':'+('0'+nu8.getMinutes()).slice(-2) };
    const h=held(sc, hx, tekstVan, s.heldL);
    s.heldL=h.l;   // de hysterese hoort bij het slimme getal, ook als het nu niet in beeld is
    // Wat er staat blijft even staan (heldRustig, gearRustig): .15 s is de tik hierboven
    s.heldR=heldRustig(s.heldR, h, s.heldR ? heldWaarde(s.heldR.l, sc, hx, tekstVan) : null, .15);
    s.gearR=gearRustig(s.gearR, g, .15);
    const rh={ w:s.heldR.w, e:s.heldR.e, l:s.heldR.l };
    const toon=middenHeld(s.midden, sc, s.gearR.toon, rh), groot=toon!==rh;
    w.classList.toggle('vhl-m-versn', groot);   // het label naast de modus is dan dubbel
    const mt2=MIDDEN_TEKST[s.midden], km=w.querySelector('.vhl-midden');
    if(km && s.middenT!==mt2){ s.middenT=mt2; km.textContent=mt2; }
    const hw=w.querySelector('.vhl-held-w'), he=w.querySelector('.vhl-held-e'), hl=w.querySelector('.vhl-held-l');
    if(hw && hw.textContent!==toon.w) hw.textContent=toon.w;
    if(he && he.textContent!==toon.e) he.textContent=toon.e;
    if(hl && hl.textContent!==toon.l) hl.textContent=toon.l;
  }
}

window.PLHyperlane = {
  STOPS:STOPS, OPSTART_S:OPSTART_S,
  kleur:kleur, stemming:stemming, modus:modus, leds:leds, schakelDoel:schakelDoel, pijlOp:pijlOp, LED_VAN:LED_VAN, RACE_FRAC:RACE_FRAC, nul100:nul100, volg:volg,
  held:held, ACC_KMHS:ACC_KMHS, VOLGAS:VOLGAS,
  heldWaarde:heldWaarde, heldRustig:heldRustig, HELD_MIN_S:HELD_MIN_S, HELD_WAARDE_S:HELD_WAARDE_S, gearRustig:gearRustig, GEAR_LEEG_S:GEAR_LEEG_S, GEAR_TERUG_S:GEAR_TERUG_S,
  MIDDEN:MIDDEN, MIDDEN_TEKST:MIDDEN_TEKST, MIDDEN_SLEUTEL:MIDDEN_SLEUTEL, middenHeld:middenHeld, leesMidden:leesMidden,
  VORMEN:VORMEN, VORM_TEKST:VORM_TEKST, VORM_SLEUTEL:VORM_SLEUTEL, volgendeVorm:volgendeVorm, actieveVorm:actieveVorm, leesVorm:leesVorm, ringSchaal:ringSchaal, echt:echt,
  versnelling:versnelling, warmte:warmte, nacht:nacht, scene:scene, SCENE_TEKST:SCENE_TEKST,
  MERKEN:MERKEN, merkThema:merkThema, accuStart:accuStart, START_RPM:START_RPM, POWER_S:POWER_S, gSpoor:gSpoor, GS_N:GS_N, tankStand:tankStand,
  ritBij:ritBij, ritNul100:ritNul100, scorebord:scorebord, duur:duur, telOp:telOp, SCORE_KM:SCORE_KM, RIT_PAUZE_S:RIT_PAUZE_S,
  rit:function(){ return _rit; }, _zetRit:function(r){ _rit=r; }, run:function(){ return _run; }, _zetRun:function(r){ _run=r; },
  RUN_KM:RUN_KM, RUN_S:RUN_S, mooieRun:mooieRun, profielBij:profielBij, profielPad:profielPad, PROF_N:PROF_N, PROF_DT:PROF_DT,
  trend:trend, runSamen:runSamen, leesRuns:leesRuns, RUNS_SLEUTEL:RUNS_SLEUTEL, RUNS_N:RUNS_N, TREND_MIN:TREND_MIN, HAND_S:HAND_S, scoreKnop:scoreKnop,
  polsBij:polsBij, polsUniform:polsUniform, POLS_RUST:POLS_RUST, POLS_MAX:POLS_MAX, POLS_PAPIER:POLS_PAPIER, POLS_N:POLS_N,
  KOUD_C:KOUD_C, HEET_C:HEET_C, REM_KMHS:REM_KMHS, STIL_S:STIL_S, CRUISE_S:CRUISE_S, CRUISE_KMH:CRUISE_KMH,
  _klok:klok,
  start:start, stop:stop, wek:wek, zet:zet, voed:voed, voedRol:voedRol, VOED:VOED, VOED_GAS:VOED_GAS,
  actief:function(){ return !!_s; }
};
})();
