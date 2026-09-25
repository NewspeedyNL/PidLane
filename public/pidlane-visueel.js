// ══════════════════════════════════════════════════════════════════
// pidlane-visueel.js — de weergave "Slim visueel" (25-09-2026)
// ──────────────────────────────────────────────────────────────────
// Eén ronde meter voor wat er tijdens het rijden BEWEEGT, met daaronder een
// rustige rand voor wat van nature traag is. "Slim" blijft ernaast bestaan en
// verandert niet; alles wat hier niet staat, staat daar.
//
// ── DE VASTE METER ────────────────────────────────────────────────
// Een eerdere poging tekende de meter opnieuw uit de meetwaarden, en dan
// vallen streepjes buiten de ring en staan cijfers scheef zodra een waarde
// buiten het verwachte bereik komt. Hier is het omgekeerd: de wijzerplaat is
// één VASTE tekening (wijzerplaat()), één keer opgebouwd uit de constanten in
// G. Elk streepje is dezelfde vorm, om het midden gedraaid; elk cijfer staat
// op één vaste straal en wordt rechtop teruggedraaid. De meetwaarden sturen
// daarna nog maar drie dingen aan, en alle drie zijn begrensd:
//
//   • de draaihoek van de naald — begrensd op het eerste en laatste streepje;
//   • hoe ver een vaste boog gevuld is — 0 tot 100, via stroke-dasharray op
//     een pad met pathLength=100, dus de boog zelf verandert nooit van vorm;
//   • de tekst in een vast vak — met een vaste maximale breedte ("99+").
//
// stand() rekent een waarde om naar die drie. test-visueel.js toetst dat de
// tekening binnen de ring blijft (op de getallen in G) en dat stand() nooit
// buiten zijn grenzen komt; bproef-visueel.js meet het in de echte browser.
//
// ── WAT ER OP STAAT ───────────────────────────────────────────────
//   naald   010C toerental
//   midden  010D snelheid
//   links   het gaspedaal: 0149, anders 015A, anders 014A, anders 0111
//   rechts  laaddruk als de turbo BEWEZEN is (PLGate), anders — bij benzine
//           met een luchtmassameter — het verbruik van dit moment, berekend
//           uit 0110; anders blijft de plek leeg
//   rand    koelwater, olie, brandstofpeil, accu — van nature traag, dus
//           geen bewegend element maar een rustig getal met icoon
//
// Bewust NIET: motorbelasting, de gasklepsensoren A/B/C, de tweede en derde
// pedaalsensor, ontstekingstiming, raildruk. Die volgen uit het pedaal en het
// toerental of zijn getallen voor de monteur. Ze blijven in "Slim".
//
// ── ÉÉN AFWIJKENDE PID MAG DE METER NIET VERSTOREN ─────────────────
//   1. Elke plek tekent los. Ontbreekt een PID, dan blijft zijn plek leeg met
//      "—"; er schuift niets op en er wordt nooit 0 van gemaakt.
//   2. Het tempo wordt per auto GEMETEN (pidHist), niet aangenomen. Komt het
//      pedaal of de vierde meter hier langzamer binnen dan VIS_TRAAG_MS, dan
//      gaat hij naar de rand — één keer, en hij springt niet terug.
//   3. Blijft een antwoord uit (3× het eigen tempo, minimaal VIS_OUD_MIN_MS),
//      dan wordt die plek dof en blijft de naald staan waar hij stond.
//   4. Een PID die de app als dood heeft gemarkeerd of verborgen is, telt als
//      ontbrekend; de keten valt door naar de volgende kandidaat.
//   5. Zonder toerental is er geen meter; dan zegt het scherm dat, met een
//      knop naar "Slim".
//
// ── TRAGER OPVRAGEN ───────────────────────────────────────────────
// De bus haalt grofweg vijftien antwoorden per seconde, verdeeld over álle
// actieve PIDs. Zolang deze weergave open staat worden de SNELLE PIDs die er
// niet op staan (klasse ≤300 ms in PID_POLL_CLASS) teruggeschroefd naar
// VIS_REM_MS — zie remt() en de aanroep in pidPollInterval(). Ze worden nog
// gemeten, alleen minder vaak; terug naar "Slim" en het oude tempo geldt weer.
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

const VIS_TRAAG_MS   = 800;    // mediaan tussen twee metingen: daarboven is het geen vloeiende meter meer
const VIS_MIN_N      = 8;      // zoveel metingen voordat "te traag" een uitspraak is
const VIS_AANLOOP_MS = 3000;   // metingen van vóór het openen (ander tempo) tellen niet mee
const VIS_OUD_MIN_MS = 3000;   // ondergrens voor "dit antwoord is oud"
const VIS_REM_MS     = 2000;   // tempo voor snelle PIDs die niet op het scherm staan
const VIS_SNEL_MS    = 300;    // wat "snel" is in PID_POLL_CLASS
const VIS_TIK_MS     = 1000;   // herbeoordeling: tempo, ouderdom, indeling

// Benzine bij λ=1: 14,7 g lucht per g brandstof, 745 g per liter.
const AFR_BENZINE = 14.7, BENZINE_G_L = 745;
const VERBRUIK_MIN_KMH = 5;    // daaronder is L/100 km geen getal maar een deling door bijna nul

const PEDAAL_KETEN = ['0149','015A','014A','0111'];
const RAND = [
  { rol:'koel', keten:['0105','0167'], icoon:'koelwater', eenheid:'°C', naam:'Koelwater' },
  { rol:'olie', keten:['015C'],        icoon:'olie',      eenheid:'°C', naam:'Motorolie' },
  { rol:'tank', keten:['012F'],        icoon:'brandstof', eenheid:'%',  naam:'Brandstofpeil' },
  { rol:'accu', keten:['0142'],        icoon:'accu',      eenheid:'V',  naam:'Accuspanning' }
];
// Nooit remmen, ook niet als de indeling nog niet bekend is: zonder deze twee
// is er geen meter, en ze horen altijd op het snelste tempo.
const ANKERS = new Set(['010C','010D']);

// ── DE GEOMETRIE ──────────────────────────────────────────────────
// Alles in één viewBox van 320×320 rond (160,160). Hoeken in graden met de
// klok mee vanaf twaalf uur. De stralen zijn zo gekozen dat elke laag een
// eigen ring heeft; test-visueel.js rekent de tussenruimtes na.
const G = {
  C: 160,
  R_RING: 152,                  // buitenrand, lijn 2
  R_BOOG: 140, B_BOOG: 6,       // de gevulde toerenboog
  R_STREEP_UIT: 132,            // alle streepjes eindigen hier
  R_STREEP_GROOT: 118,          // …en beginnen hier (per 1000)
  R_STREEP_KLEIN: 125,          // …of hier (per 500)
  R_CIJFER: 100, FS_CIJFER: 17, // de cijfers 0–8
  R_KLEIN: 76, B_KLEIN: 6,      // de twee kleine bogen
  R_PIEK_IN: 144, R_PIEK_UIT: 150,
  NAALD: 126, NAALD_STAART: 16,
  A0: -120, A1: 120,            // toerenschaal
  RPM_MAX: 8000,
  // Kleine bogen: links van onder (220°) omhoog naar 310°, rechts van onder
  // (140°) omhoog naar 50°. Beide 90°, beide vullen van onder naar boven.
  L0: 220, L1: 310,
  R0: 140, R1: 50,
  // Het midden. De snelheid staat ONDER de naaf: boven de naaf veegt de
  // naald bij elk toerental tussen 1000 en 7000 over de tekst heen, eronder
  // alleen bij stationair en boven 7000.
  Y_SCHAAL: 116, Y_RPM: 134, Y_SNEL: 204, Y_KMH: 240, R_NAAF: 8,
  // Lettermaten staan HIER en niet in de CSS: test-visueel.js rekent er de
  // tekstvakken mee uit, en een maat die op twee plekken staat loopt uit de pas.
  FS_SNEL: 46, FS_KLEIN: 14, FS_EENHEID: 11, FS_SCHAAL: 10,
  // Icoon (midden, 20×20) en getal onder elk van de twee kleine bogen.
  ICOON: 20, X_LINKS: 112, X_RECHTS: 208, Y_ICOON: 242, Y_KLEIN: 264, Y_KLEIN_EENHEID: 281,
  // Laaddruk: −1 … +1,5 bar op de rechterboog, nul op 40% van onderen.
  BAR_LO: -1, BAR_HI: 1.5,
  VERBRUIK_L100_MAX: 20, VERBRUIK_LH_MAX: 10
};

function P(r,a){ const t=(a-90)*Math.PI/180; return [G.C+r*Math.cos(t), G.C+r*Math.sin(t)]; }
function f2(n){ return (Math.round(n*100)/100).toString(); }
// Een boog van a0 naar a1 in de richting waarin hij gevuld wordt.
function boogPad(r,a0,a1){
  const p0=P(r,a0), p1=P(r,a1), groot=Math.abs(a1-a0)>180?1:0, zin=a1>a0?1:0;
  return 'M'+f2(p0[0])+' '+f2(p0[1])+'A'+r+' '+r+' 0 '+groot+' '+zin+' '+f2(p1[0])+' '+f2(p1[1]);
}
function hoekLaaddrukNul(){ return G.R0 + (G.R1-G.R0)*((0-G.BAR_LO)/(G.BAR_HI-G.BAR_LO)); }

// ── STAND: getal in, begrensde aansturing uit ─────────────────────
function deel(v,lo,hi){
  const n=Number(v);
  if(v===null || v===undefined || v==='' || !isFinite(n) || !(hi>lo)) return null;
  return Math.max(0, Math.min(100, (n-lo)/(hi-lo)*100));
}
function tekst(rol, v, extra){
  const n=Number(v);
  if(v===null || v===undefined || !isFinite(n)) return '—';
  switch(rol){
    case 'snel':  return String(Math.max(0, Math.min(999, Math.round(n))));
    case 'toeren':return String(Math.max(0, Math.min(9990, Math.round(n/10)*10)));
    case 'pedaal':
    case 'tank':  return String(Math.max(0, Math.min(100, Math.round(n))));
    case 'koel':
    case 'olie':  return String(Math.max(-99, Math.min(999, Math.round(n))));
    case 'accu':  return Math.max(0, Math.min(99, n)).toFixed(1).replace('.',',');
    case 'laaddruk': { const b=Math.max(-9.9, Math.min(9.9, n)); return (b>0.04?'+':'')+b.toFixed(1).replace('.',','); }
    case 'verbruik': {
      if(n>99.5) return '99+';
      const x=Math.max(0,n);
      return (x<10 ? x.toFixed(1) : String(Math.round(x))).replace('.',',');
    }
  }
  return String(Math.round(n));
}
/* De enige plek waar een meetwaarde iets aan de meter verandert. Geeft
   {hoek, deel, tekst} terug — of voor laaddruk {vac, boost, tekst} — en elk
   veld is begrensd. `leeg` is true als er geen bruikbare waarde is: dan blijft
   de naald op het begin en staat er een streepje. */
function stand(rol, v, extra){
  if(rol==='toeren'){
    const d=deel(v,0,G.RPM_MAX);
    return { leeg:d===null, deel:d===null?0:d, hoek:G.A0+(G.A1-G.A0)*(d===null?0:d)/100, tekst:tekst('toeren',v) };
  }
  if(rol==='pedaal'){
    const d=deel(v,0,100);
    return { leeg:d===null, deel:d===null?0:d, tekst:tekst('pedaal',v) };
  }
  if(rol==='laaddruk'){
    const n=Number(v);
    if(v===null || v===undefined || !isFinite(n)) return { leeg:true, vac:0, boost:0, tekst:'—' };
    return { leeg:false,
             vac:   n<0 ? Math.min(100, (-n)/(-G.BAR_LO)*100) : 0,
             boost: n>0 ? Math.min(100, n/G.BAR_HI*100) : 0,
             tekst: tekst('laaddruk',n) };
  }
  if(rol==='verbruik'){
    // extra = 'L/100' of 'L/h'
    const hi = extra==='L/h' ? G.VERBRUIK_LH_MAX : G.VERBRUIK_L100_MAX;
    const d=deel(v,0,hi);
    return { leeg:d===null, deel:d===null?0:d, tekst:tekst('verbruik',v) };
  }
  return { leeg:!isFinite(Number(v)) || v===null || v===undefined, tekst:tekst(rol,v) };
}

// Verbruik van dit moment uit de luchtmassa. Onder VERBRUIK_MIN_KMH geen
// L/100 km — dan L/h, en dat zegt de eenheid er ook bij.
function verbruikNu(maf, kmh){
  const m=Number(maf);
  if(maf===null || maf===undefined || !isFinite(m) || m<0) return null;
  const lh = m*3600/(AFR_BENZINE*BENZINE_G_L);
  const v=Number(kmh);
  if(kmh!==null && kmh!==undefined && isFinite(v) && v>=VERBRUIK_MIN_KMH) return { waarde: lh/v*100, eenheid:'L/100' };
  return { waarde: lh, eenheid:'L/h' };
}
// Laaddruk in bar: inlaatdruk min omgevingsdruk. Zonder gemeten omgevings-
// druk (0133, of de terugval van PLGate uit MAP bij stilstaande motor) wordt
// het de standaardatmosfeer. Dat is op zeeniveau exact en op 1500 m zo'n
// 0,15 bar te hoog; de meter draagt daarom altijd een ≈, en de tooltip zegt
// welke van de twee het is.
const STANDAARD_KPA = 101.3;
function laaddrukNu(map, baro){
  const m=Number(map);
  if(map===null || map===undefined || !isFinite(m)) return null;
  const b=Number(baro);
  const echt=(baro!==null && baro!==undefined && isFinite(b) && b>0);
  return (m-(echt?b:STANDAARD_KPA))/100;
}

// ── DE WIJZERPLAAT: één keer, uit G ────────────────────────────────
function lijn(r0,r1,a,cls){
  const p=P(r0,a), q=P(r1,a);
  return '<line class="'+cls+'" x1="'+f2(p[0])+'" y1="'+f2(p[1])+'" x2="'+f2(q[0])+'" y2="'+f2(q[1])+'"/>';
}
function streepjes(wH){
  let s='';
  for(let v=0; v<=G.RPM_MAX; v+=500){
    const a=G.A0+(G.A1-G.A0)*v/G.RPM_MAX, groot=(v%1000===0);
    const cls='vis-streep'+(groot?' groot':'')+(wH && v>=wH?' rood':'');
    s+=lijn(groot?G.R_STREEP_GROOT:G.R_STREEP_KLEIN, G.R_STREEP_UIT, a, cls);
    if(groot){
      const p=P(G.R_CIJFER,a);
      s+='<text class="vis-cijfer'+(wH && v>=wH?' rood':'')+'" x="'+f2(p[0])+'" y="'+f2(p[1])+'" style="font-size:'+G.FS_CIJFER+'px">'+(v/1000)+'</text>';
    }
  }
  return s;
}
function icoonVak(id, x){
  return '<svg id="'+id+'" class="vis-icoon" x="'+(x-G.ICOON/2)+'" y="'+(G.Y_ICOON-G.ICOON/2)+'" width="'+G.ICOON+'" height="'+G.ICOON+'" viewBox="0 0 24 24"></svg>';
}
function wijzerplaat(wH){
  const C=G.C;
  let s='';
  s+='<circle class="vis-plaat" cx="'+C+'" cy="'+C+'" r="'+G.R_RING+'"/>';
  // Toeren: spoor, rode zone vanaf de waarschuwingsgrens, vulling, streepjes.
  s+='<path class="vis-spoor" d="'+boogPad(G.R_BOOG,G.A0,G.A1)+'" stroke-width="'+G.B_BOOG+'"/>';
  if(wH && wH<G.RPM_MAX)
    s+='<path class="vis-zone" d="'+boogPad(G.R_BOOG,G.A0+(G.A1-G.A0)*wH/G.RPM_MAX,G.A1)+'" stroke-width="'+G.B_BOOG+'"/>';
  s+='<path id="vis-toerenboog" class="vis-vul" pathLength="100" stroke-dasharray="0 200" d="'+boogPad(G.R_BOOG,G.A0,G.A1)+'" stroke-width="'+G.B_BOOG+'"/>';
  s+=streepjes(wH);
  s+='<text class="vis-schaal" x="'+C+'" y="'+G.Y_SCHAAL+'" style="font-size:'+G.FS_SCHAAL+'px">×1000 /min</text>';
  s+='<text id="vis-rpm" class="vis-rpm" x="'+C+'" y="'+G.Y_RPM+'" style="font-size:'+G.FS_EENHEID+'px">— rpm</text>';
  // De kleine bogen: alleen spoor en vulling, de inhoud komt van de indeling.
  s+='<g id="visg-pedaal" class="vis-slot leeg">'+
       '<path class="vis-spoor" d="'+boogPad(G.R_KLEIN,G.L0,G.L1)+'" stroke-width="'+G.B_KLEIN+'"/>'+
       '<path id="vis-pedaalboog" class="vis-vul" pathLength="100" stroke-dasharray="0 200" d="'+boogPad(G.R_KLEIN,G.L0,G.L1)+'" stroke-width="'+G.B_KLEIN+'"/>'+
       icoonVak('vis-pedaalicoon', G.X_LINKS)+
       '<text id="vis-pedaaltekst" class="vis-klein" x="'+G.X_LINKS+'" y="'+G.Y_KLEIN+'" style="font-size:'+G.FS_KLEIN+'px">—</text>'+
     '</g>';
  const z=hoekLaaddrukNul();
  s+='<g id="visg-vierde" class="vis-slot leeg">'+
       '<path class="vis-spoor" d="'+boogPad(G.R_KLEIN,G.R0,G.R1)+'" stroke-width="'+G.B_KLEIN+'"/>'+
       '<path id="vis-vierdeboog" class="vis-vul" pathLength="100" stroke-dasharray="0 200" d="'+boogPad(G.R_KLEIN,G.R0,G.R1)+'" stroke-width="'+G.B_KLEIN+'"/>'+
       // Laaddruk vult vanaf nul naar twee kanten: twee paden, elk met een
       // eigen vulling. Staan er altijd, verborgen als het geen laaddruk is.
       '<path id="vis-vacboog" class="vis-vul vac" pathLength="100" stroke-dasharray="0 200" d="'+boogPad(G.R_KLEIN,z,G.R0)+'" stroke-width="'+G.B_KLEIN+'"/>'+
       '<path id="vis-boostboog" class="vis-vul" pathLength="100" stroke-dasharray="0 200" d="'+boogPad(G.R_KLEIN,z,G.R1)+'" stroke-width="'+G.B_KLEIN+'"/>'+
       lijn(G.R_KLEIN-5, G.R_KLEIN+5, z, 'vis-nul')+
       icoonVak('vis-vierdeicoon', G.X_RECHTS)+
       '<text id="vis-vierdetekst" class="vis-klein" x="'+G.X_RECHTS+'" y="'+G.Y_KLEIN+'" style="font-size:'+G.FS_KLEIN+'px">—</text>'+
       '<text id="vis-vierdeeenheid" class="vis-eenheid" x="'+G.X_RECHTS+'" y="'+G.Y_KLEIN_EENHEID+'" style="font-size:'+G.FS_EENHEID+'px"></text>'+
     '</g>';
  // Midden: de snelheid.
  s+='<text id="vis-snel" class="vis-snel" x="'+C+'" y="'+G.Y_SNEL+'" style="font-size:'+G.FS_SNEL+'px">—</text>';
  s+='<text class="vis-eenheid" x="'+C+'" y="'+G.Y_KMH+'" style="font-size:'+G.FS_EENHEID+'px">km/h</text>';
  // Sleepwijzer en naald: één vorm op twaalf uur, gedraaid om het midden.
  const pk0=P(G.R_PIEK_IN,0), pkL=P(G.R_PIEK_UIT,-2.2), pkR=P(G.R_PIEK_UIT,2.2);
  s+='<g id="vis-piek" class="vis-piek" style="display:none;transform:rotate('+G.A0+'deg)">'+
       '<path d="M'+f2(pkL[0])+' '+f2(pkL[1])+'L'+f2(pkR[0])+' '+f2(pkR[1])+'L'+f2(pk0[0])+' '+f2(pk0[1])+'Z"/></g>';
  s+='<g id="visg-naald" class="vis-slot leeg"><g id="vis-naald" class="vis-naald" style="transform:rotate('+G.A0+'deg)">'+
       '<line x1="'+C+'" y1="'+(C+G.NAALD_STAART)+'" x2="'+C+'" y2="'+(C-G.NAALD)+'"/></g></g>';
  s+='<circle class="vis-naaf" cx="'+C+'" cy="'+C+'" r="'+G.R_NAAF+'"/>';
  return s;
}

// ── DE INDELING ───────────────────────────────────────────────────
const _staat = { aan:false, start:0, traag:new Set(), vierdeVast:null, handtekening:'', gebruik:new Set(), ind:null, timer:null };

function bruikbaar(pid){
  try{
    if(typeof activePIDs==='undefined' || !activePIDs || !activePIDs.has(pid)) return false;
    if(typeof hiddenPIDs!=='undefined' && hiddenPIDs && hiddenPIDs.has(pid)) return false;
    if(window.PLSched && window.PLSched.dood(pid)) return false;
  }catch(e){ console.warn('PLVisueel: bruikbaarheid van '+pid+' niet te bepalen', e); return false; }
  return true;
}
function eerste(keten){ for(let i=0;i<keten.length;i++){ if(bruikbaar(keten[i])) return keten[i]; } return null; }

function turboBewezen(){
  try{ return !!(window.PLGate && window.PLGate.stats().turbo); }
  catch(e){ console.warn('PLVisueel: PLGate.stats() onleesbaar', e); return false; }
}
function motortype(){
  try{ return (typeof detectEngineType==='function') ? detectEngineType() : 'benzine'; }
  catch(e){ console.warn('PLVisueel: detectEngineType() mislukt', e); return 'onbekend'; }
}
/* Wat staat er op de rechterboog? Eén keer laaddruk, altijd laaddruk: de
   turbo verdwijnt niet halverwege de rit, en een boog die van betekenis
   wisselt is erger dan een lege. */
function kiesVierde(){
  if(_staat.vierdeVast==='laaddruk') return bruikbaar('010B') ? { soort:'laaddruk', pid:'010B' } : null;
  if(turboBewezen() && bruikbaar('010B')){ _staat.vierdeVast='laaddruk'; return { soort:'laaddruk', pid:'010B' }; }
  const mt=motortype();
  if((mt==='benzine' || mt==='hybride') && bruikbaar('0110')) return { soort:'verbruik', pid:'0110' };
  return null;
}

// Mediaan van de tijd tussen twee metingen, alleen over metingen van ná het
// openen plus de aanloop. null = nog te weinig om iets te zeggen.
function gemetenTempo(pid){
  const h=(typeof pidHist!=='undefined' && pidHist) ? pidHist[pid] : null;
  if(!h || !h.length) return null;
  const vanaf=_staat.start+VIS_AANLOOP_MS;
  const t=[];
  for(let i=0;i<h.length;i++){ if(h[i] && typeof h[i].t==='number' && h[i].t>=vanaf) t.push(h[i].t); }
  if(t.length<VIS_MIN_N) return null;
  const d=[];
  for(let i=1;i<t.length;i++) d.push(t[i]-t[i-1]);
  d.sort(function(a,b){ return a-b; });
  const m=d.length>>1;
  return d.length%2 ? d[m] : (d[m-1]+d[m])/2;
}
function beoordeelTempo(pid){
  if(!pid || _staat.traag.has(pid)) return;
  const t=gemetenTempo(pid);
  if(t!==null && t>VIS_TRAAG_MS) _staat.traag.add(pid);
}

function indeling(){
  const ind={ naald:bruikbaar('010C')?'010C':null, midden:bruikbaar('010D')?'010D':null,
              pedaal:eerste(PEDAAL_KETEN), vierde:kiesVierde(), rand:[], traag:[] };
  RAND.forEach(function(r){ const p=eerste(r.keten); if(p) ind.rand.push({ rol:r.rol, pid:p, icoon:r.icoon, eenheid:r.eenheid, naam:r.naam }); });
  if(ind.pedaal && _staat.traag.has(ind.pedaal)){
    ind.traag.push({ rol:'pedaal', pid:ind.pedaal, icoon:ind.pedaal==='0111'?'gasklep':'pedaal', eenheid:'%', naam:naamVan(ind.pedaal) });
    ind.pedaal=null;
  }
  if(ind.vierde && _staat.traag.has(ind.vierde.pid)){
    const v=ind.vierde;
    ind.traag.push({ rol:v.soort, pid:v.pid, icoon:v.soort==='laaddruk'?'turbo':'verbruik', eenheid:v.soort==='laaddruk'?'bar':'', naam:v.soort==='laaddruk'?'Laaddruk (berekend)':'Verbruik nu (berekend)' });
    ind.vierde=null;
  }
  return ind;
}
function gebruiktePids(ind){
  const s=new Set();
  if(!ind) return s;
  ['naald','midden','pedaal'].forEach(function(k){ if(ind[k]) s.add(ind[k]); });
  if(ind.vierde){ s.add(ind.vierde.pid); if(ind.vierde.soort==='laaddruk') s.add('0133'); }
  ind.rand.concat(ind.traag).forEach(function(r){ s.add(r.pid); });
  if(ind.traag.some(function(r){ return r.rol==='laaddruk'; })) s.add('0133');
  return s;
}
function handtekening(ind){
  return [ind.naald, ind.midden, ind.pedaal, ind.vierde?ind.vierde.soort+ind.vierde.pid:'',
          ind.rand.map(function(r){ return r.pid; }).join(','),
          ind.traag.map(function(r){ return r.rol+r.pid; }).join(',')].join('|');
}
function naamVan(pid){
  try{ const d=(typeof getPidDef==='function')?getPidDef(pid):null; return (d && d.name) || pid; }
  catch(e){ console.warn('PLVisueel: getPidDef('+pid+') mislukt', e); return pid; }
}

/* Remt deze PID terwijl Slim visueel open staat? Alleen snelle PIDs (klasse
   ≤ VIS_SNEL_MS) die niet op het scherm staan, en nooit de ankers. Wordt bij
   elke pollronde aangeroepen, dus leest alleen de indeling die de tik al
   uitrekende. */
function remt(pid){
  if(!_staat.aan || !pid || ANKERS.has(pid)) return false;
  if(!/^01/i.test(String(pid))) return false;
  const klasse=(window.PID_POLL_CLASS||{})[String(pid).slice(2).toUpperCase()];
  if(!(typeof klasse==='number' && klasse<=VIS_SNEL_MS)) return false;
  return !_staat.gebruik.has(pid);
}

// ── ÉÉN ANTWOORD IS OUD ───────────────────────────────────────────
// Zelfde krediet als de stale-watchdog van de puntjesweergave: tijd waarin de
// bus door een andere lezer bezet was telt niet als stilte van deze PID.
function isOud(pid, nu){
  const laatste=(typeof _pidLastUpd!=='undefined' && _pidLastUpd) ? (_pidLastUpd[pid]||0) : 0;
  if(!laatste) return false;               // nog niets binnen: dat is 'leeg', niet 'oud'
  let krediet=0;
  try{ if(window.PLBus && typeof _pidLastUpdPause!=='undefined') krediet=Math.max(0, window.PLBus.pausedTotal()-(_pidLastUpdPause[pid]||0)); }
  catch(e){ console.warn('PLVisueel: PLBus.pausedTotal mislukt', e); }
  let tempo=gemetenTempo(pid);
  if(tempo===null){ try{ tempo=window.PLSched ? window.PLSched.interval(pid) : 1000; }catch(e){ console.warn('PLVisueel: PLSched.interval mislukt', e); tempo=1000; } }
  return ((nu||Date.now())-laatste-krediet) > Math.max(3*(tempo||1000), VIS_OUD_MIN_MS);
}

// ── HET SCHERM ────────────────────────────────────────────────────
function icoonHtml(naam){ return '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+((window.PL_ICOON||{})[naam]||'')+'</g>'; }
function el(id){ return document.getElementById(id); }
function randChip(r){
  return '<div class="vis-chip" id="visc-'+r.rol+'" title="'+String(r.naam).replace(/"/g,'&quot;')+' ('+r.pid+')" aria-label="'+String(r.naam).replace(/"/g,'&quot;')+'">'+
    '<svg class="vis-chipicoon" viewBox="0 0 24 24" aria-hidden="true">'+icoonHtml(r.icoon)+'</svg>'+
    '<b id="visv-'+r.rol+'">—</b><small id="visu-'+r.rol+'">'+r.eenheid+'</small></div>';
}

function bouw(g){
  const ind=indeling();
  _staat.ind=ind; _staat.handtekening=handtekening(ind); _staat.gebruik=gebruiktePids(ind);
  if(!ind.naald){
    g.innerHTML='<div class="vis-leeg"><p><b>Slim visueel heeft het toerental nodig.</b> '+
      '010C is niet geselecteerd, verborgen, of deze auto geeft hem niet.</p>'+
      '<button class="pidview-btn" type="button" onclick="setPidView(\'slim\')">Naar Slim</button></div>';
    return;
  }
  let wH=null;
  try{ const d=(typeof getPidDef==='function')?getPidDef('010C'):null; wH=(d && typeof d.wH==='number')?d.wH:null; }
  catch(e){ console.warn('PLVisueel: grens van 010C onleesbaar', e); }
  const rand=ind.rand.concat(ind.traag);
  g.innerHTML='<div class="vis">'+
    '<svg class="vis-meter" viewBox="0 0 320 320" role="img" aria-label="Toerental, snelheid, gaspedaal">'+wijzerplaat(wH)+'</svg>'+
    (rand.length?'<div class="vis-rand">'+rand.map(randChip).join('')+'</div>':'')+
    '<div class="vis-voet"><span>Overige sensoren staan in Slim</span>'+
    '<button class="pidview-btn" type="button" onclick="setPidView(\'slim\')">Naar Slim</button></div></div>';
  // Icoontjes en titels op de kleine bogen.
  const pi=el('vis-pedaalicoon'), pg=el('visg-pedaal');
  if(ind.pedaal){ if(pi) pi.innerHTML=icoonHtml(ind.pedaal==='0111'?'gasklep':'pedaal'); if(pg) pg.insertAdjacentHTML('afterbegin','<title>'+naamVan(ind.pedaal)+' ('+ind.pedaal+')</title>'); }
  else if(pg) pg.classList.add('afwezig');
  const vi=el('vis-vierdeicoon'), vg=el('visg-vierde');
  if(ind.vierde){
    const lz=ind.vierde.soort==='laaddruk';
    if(vi) vi.innerHTML=icoonHtml(lz?'turbo':'verbruik');
    if(vg){ vg.classList.add(lz?'laaddruk':'verbruik');
            vg.insertAdjacentHTML('afterbegin','<title>'+(lz?'≈ Laaddruk: inlaatdruk (010B) min omgevingsdruk (0133, anders 101,3 kPa)':'≈ Verbruik nu: berekend uit de luchtmassa (0110), benzine bij λ=1')+'</title>'); }
  } else if(vg) vg.classList.add('afwezig');
  // Wat er al binnen is meteen tonen: een herbouw midden in een rit hoort
  // niet eerst een lege meter te laten zien.
  _staat.gebruik.forEach(function(p){ if(typeof pidVals!=='undefined' && pidVals[p]!==undefined) bij(p, pidVals[p]); });
}

function zetDash(id, d){ const e=el(id); if(e) e.setAttribute('stroke-dasharray', (Math.round(d*10)/10)+' 200'); }
function zetTekst(id, t){ const e=el(id); if(e && e.textContent!==t) e.textContent=t; }
function oordeel(pid, v){
  try{ const d=(typeof getPidDef==='function')?getPidDef(pid):null; return d ? pidOordeel(d,v,pid) : 'ok'; }
  catch(e){ console.warn('PLVisueel: oordeel voor '+pid+' mislukt', e); return 'ok'; }
}
function klasse(e, st){ if(!e) return; e.classList.remove('warn','danger'); if(st && st!=='ok') e.classList.add(st); }
function vers(id){ const e=el(id); if(e) e.classList.remove('leeg','oud'); }

function vierdeWaarde(){
  const ind=_staat.ind; if(!ind) return null;
  const v=ind.vierde || ind.traag.filter(function(r){ return r.rol==='laaddruk' || r.rol==='verbruik'; }).map(function(r){ return { soort:r.rol, pid:r.pid }; })[0];
  if(!v || typeof pidVals==='undefined') return null;
  if(v.soort==='laaddruk'){
    let baro=pidVals['0133'];
    try{ const s=window.PLGate ? window.PLGate.stats() : null; if(s && typeof s.omgevingsdruk==='number') baro=s.omgevingsdruk; }
    catch(e){ console.warn('PLVisueel: omgevingsdruk onleesbaar', e); }
    const b=laaddrukNu(pidVals['010B'], baro);
    return b===null ? null : { soort:'laaddruk', waarde:b, eenheid:'bar' };
  }
  const r=verbruikNu(pidVals['0110'], pidVals['010D']);
  return r ? { soort:'verbruik', waarde:r.waarde, eenheid:r.eenheid } : null;
}

/* Eén binnenkomende waarde. Aangeroepen vanuit applyG() zolang deze
   weergave open staat; zoekt zelf uit welke plek(ken) ervan afhangen. */
function bij(pid, val){
  const ind=_staat.ind; if(!ind) return;
  if(pid===ind.naald){
    const s=stand('toeren', val), st=oordeel(pid, val);
    const n=el('vis-naald'); if(n) n.style.transform='rotate('+s.hoek.toFixed(2)+'deg)';
    zetDash('vis-toerenboog', s.deel);
    zetTekst('vis-rpm', s.tekst+' rpm');
    klasse(el('visg-naald'), st); klasse(el('vis-toerenboog'), st);
    const pk=el('vis-piek');
    if(pk){
      let p=null;
      try{ p=slimPiek(pid); }catch(e){ console.warn('PLVisueel: slimPiek mislukt', e); }
      const pd=(p===null)?null:stand('toeren',p);
      // Zelfde regel als de tellerplaat: alleen als hij merkbaar boven de
      // naald ligt, anders leest hij als een tweede, tegenstrijdige waarde.
      if(!pd || pd.leeg || pd.deel-s.deel<1.5) pk.style.display='none';
      else { pk.style.display=''; pk.style.transform='rotate('+pd.hoek.toFixed(2)+'deg)'; }
    }
    if(!s.leeg) vers('visg-naald');
  }
  if(pid===ind.midden){ zetTekst('vis-snel', tekst('snel', val)); }
  if(pid===ind.pedaal){
    const s=stand('pedaal', val);
    zetDash('vis-pedaalboog', s.deel); zetTekst('vis-pedaaltekst', s.tekst+'%');
    if(!s.leeg) vers('visg-pedaal');
  }
  const vierdeBron = pid==='010B' || pid==='0110' || pid==='0133' || pid==='010D';
  if(vierdeBron){
    const w=vierdeWaarde();
    if(w && ind.vierde){
      if(w.soort==='laaddruk'){
        const s=stand('laaddruk', w.waarde);
        zetDash('vis-vacboog', s.vac); zetDash('vis-boostboog', s.boost);
        zetTekst('vis-vierdetekst', '≈'+s.tekst); zetTekst('vis-vierdeeenheid','bar');
      } else {
        const s=stand('verbruik', w.waarde, w.eenheid);
        zetDash('vis-vierdeboog', s.deel);
        zetTekst('vis-vierdetekst', '≈'+s.tekst); zetTekst('vis-vierdeeenheid', w.eenheid==='L/100'?'L/100km':'L/h');
      }
      vers('visg-vierde');
    }
    if(w) ind.traag.forEach(function(r){
      if(r.rol===w.soort){ zetTekst('visv-'+r.rol, '≈'+tekst(w.soort, w.waarde)); zetTekst('visu-'+r.rol, w.eenheid==='L/100'?'L/100km':w.eenheid); }
    });
  }
  ind.rand.concat(ind.traag).forEach(function(r){
    if(r.pid!==pid || r.rol==='laaddruk' || r.rol==='verbruik') return;
    zetTekst('visv-'+r.rol, tekst(r.rol, val));
    const c=el('visc-'+r.rol); klasse(c, oordeel(pid, val)); if(c) c.classList.remove('oud');
  });
}

// De tik: tempo beoordelen, ouderdom tonen, en herbouwen als de indeling
// werkelijk veranderde. Dat laatste gebeurt zelden en maar één kant op:
// een PID die te traag bleek of een turbo die bewezen werd.
function tik(){
  if(!_staat.aan) return;
  const ind=_staat.ind;
  if(ind){ beoordeelTempo(ind.pedaal); if(ind.vierde) beoordeelTempo(ind.vierde.pid); }
  const nieuw=indeling();
  _staat.gebruik=gebruiktePids(nieuw);
  if(handtekening(nieuw)!==_staat.handtekening){
    const g=el('gGrid');
    if(g && typeof pidViewMode!=='undefined' && pidViewMode==='visueel'){ bouw(g); return; }
  }
  const nu=Date.now(), I=_staat.ind; if(!I) return;
  [['visg-naald',I.naald],['visg-pedaal',I.pedaal],['visg-vierde',I.vierde&&I.vierde.pid]].forEach(function(x){
    const e=el(x[0]); if(e && x[1]) e.classList.toggle('oud', isOud(x[1], nu));
  });
  I.rand.concat(I.traag).forEach(function(r){ const c=el('visc-'+r.rol); if(c) c.classList.toggle('oud', isOud(r.pid, nu)); });
}

function start(){
  if(_staat.aan) return;
  _staat.aan=true; _staat.start=Date.now(); _staat.traag=new Set(); _staat.handtekening='';
  // Meteen de indeling kennen: remt() leest hem, en een lege set zou in de
  // eerste pollronde ook de PIDs remmen die er straks wél op staan.
  _staat.ind=indeling(); _staat.gebruik=gebruiktePids(_staat.ind);
  _staat.timer=setInterval(function(){ try{ tik(); }catch(e){ console.warn('PLVisueel: tik mislukt', e); } }, VIS_TIK_MS);
}
function stop(){
  _staat.aan=false;
  if(_staat.timer){ clearInterval(_staat.timer); _staat.timer=null; }
  _staat.ind=null; _staat.gebruik=new Set();
}

window.PLVisueel = {
  G:G, REM_MS:VIS_REM_MS, TRAAG_MS:VIS_TRAAG_MS, MIN_N:VIS_MIN_N, AANLOOP_MS:VIS_AANLOOP_MS, OUD_MIN_MS:VIS_OUD_MIN_MS,
  PEDAAL_KETEN:PEDAAL_KETEN, RAND:RAND,
  stand:stand, tekst:tekst, verbruikNu:verbruikNu, laaddrukNu:laaddrukNu,
  wijzerplaat:wijzerplaat, boogPad:boogPad, hoekLaaddrukNul:hoekLaaddrukNul,
  indeling:indeling, gebruiktePids:gebruiktePids, gemetenTempo:gemetenTempo, beoordeelTempo:beoordeelTempo,
  remt:remt, isOud:isOud, bouw:bouw, bij:bij, tik:tik, start:start, stop:stop,
  staat:function(){ return { aan:_staat.aan, start:_staat.start, traag:Array.from(_staat.traag),
                             vierdeVast:_staat.vierdeVast, gebruik:Array.from(_staat.gebruik), ind:_staat.ind }; }
};
})();
