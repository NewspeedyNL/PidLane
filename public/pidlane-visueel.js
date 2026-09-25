// ══════════════════════════════════════════════════════════════════
// pidlane-visueel.js — de weergave "Slim visueel" (25-09-2026)
// ──────────────────────────────────────────────────────────────────
// Eén ronde meter voor wat er tijdens het rijden telt, met daaronder een
// meldingenvak voor wat er op de achtergrond loopt. "Slim" blijft ernaast
// bestaan en verandert niet; alles wat hier niet staat, staat daar.
//
// ── DE VASTE METER ────────────────────────────────────────────────
// Een eerdere poging tekende de meter opnieuw uit de meetwaarden, en dan
// vallen streepjes buiten de ring en staan cijfers scheef zodra een waarde
// buiten het verwachte bereik komt. Hier is het omgekeerd: de wijzerplaat is
// één VASTE tekening (wijzerplaat()), één keer opgebouwd uit de constanten in
// G. Elk streepje is dezelfde vorm, om het midden gedraaid; elk cijfer staat
// op één vaste straal. De meetwaarden sturen daarna nog maar drie dingen aan,
// en alle drie zijn begrensd:
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
//   naald      010C toerental, 0 tot 8000
//   midden     010D snelheid
//   onderboog  tussen vijf en zeven uur, op de straal van de toerenboog:
//              motorolie (015C); zonder olie de laaddruk als de turbo BEWEZEN
//              is (PLGate), anders het gaspedaal (0149 → 015A → 014A → 0111)
//   plekjes    onderin op één rij koelwater (links), accu (midden), brandstof
//              (rechts): icoon met het getal eronder, van nature traag, dus
//              geen bewegend element
//   onder de   het getal van de onderboog, gecentreerd onder de cirkel
//   cirkel     (buiten de ring, dus de viewBox is hoger dan breed)
//   meldingen  onder de meter; zie meldingen() hieronder
//
// Bewust NIET: motorbelasting, de gasklepsensoren A/B/C, de tweede en derde
// pedaalsensor, ontstekingstiming, raildruk, luchtmassa. Die volgen uit het
// pedaal en het toerental of zijn getallen voor de monteur. Ze blijven in
// "Slim".
//
// ── ÉÉN AFWIJKENDE PID MAG DE METER NIET VERSTOREN ─────────────────
//   1. Elke plek tekent los. Ontbreekt een PID, dan blijft zijn plek leeg met
//      "—"; er schuift niets op en er wordt nooit 0 van gemaakt.
//   2. Het tempo wordt per auto GEMETEN (pidHist), niet aangenomen. Komt het
//      pedaal of de laaddruk hier langzamer binnen dan VIS_TRAAG_MS, dan valt
//      de onderboog door naar de volgende kandidaat — één keer, en hij springt
//      niet terug. Olie is van nature traag en valt daar niet onder.
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
const VIS_TIK_MS     = 1000;   // herbeoordeling: tempo, ouderdom, indeling, meldingen

// De plekjes. Koelwater is blauw zolang de motor koud is, zoals op een echt
// dashboard. De accu kijkt naar het toerental: 12,5 V is goed bij een
// stilstaande motor en fout bij een draaiende, want dan hoort de dynamo te
// laden. Algemene grenzen voor een loodaccu; slim laden mag lager zitten,
// dus oranje en niet rood.
const KOEL_KOUD   = 60;        // °C
const ACCU_LAADT  = 13.2;      // V, onder deze waarde laadt een draaiende dynamo niet
const ACCU_LAAG   = 12.0, ACCU_HOOG = 15.0;
const MOTOR_DRAAIT = 300;      // rpm
const TANK_RESERVE = 12;       // %

const PEDAAL_KETEN = ['0149','015A','014A','0111'];
const PLEKKEN = [
  { rol:'koel', keten:['0105','0167'], icoon:'koelwater', naam:'Koelwater' },
  { rol:'accu', keten:['0142'],        icoon:'accu',      naam:'Accuspanning' },
  { rol:'tank', keten:['012F'],        icoon:'brandstof', naam:'Brandstofpeil' }
];
// Nooit remmen, ook niet als de indeling nog niet bekend is: zonder deze twee
// is er geen meter, en ze horen altijd op het snelste tempo.
const ANKERS = new Set(['010C','010D']);

// ── DE GEOMETRIE ──────────────────────────────────────────────────
// Alles in één viewBox van 320×320 rond (160,160). Hoeken in graden met de
// klok mee vanaf twaalf uur. test-visueel.js rekent de tussenruimtes na.
const G = {
  C: 160,
  R_RING: 152,                  // buitenrand, lijn 2
  R_BOOG: 140, B_BOOG: 6,       // de gevulde toerenboog, en de onderboog
  R_STREEP_UIT: 132,            // alle streepjes eindigen hier
  R_STREEP_GROOT: 118,          // …en beginnen hier (per 1000)
  R_STREEP_KLEIN: 125,          // …of hier (per 500)
  R_CIJFER: 100, FS_CIJFER: 17, // de cijfers 0–8
  R_PIEK_IN: 144, R_PIEK_UIT: 150,
  NAALD: 126, NAALD_STAART: 16, R_NAAF: 8,
  A0: -120, A1: 120,            // toerenschaal
  RPM_MAX: 8000,
  // De onderboog: van zeven uur (210°) naar vijf uur (150°), dus van links
  // naar rechts gevuld — koud links, heet rechts.
  O0: 210, O1: 150,
  OLIE_LO: 40, OLIE_HI: 150,
  // Laaddruk: −1 … +1,5 bar op de onderboog, nul op 40% van links.
  BAR_LO: -1, BAR_HI: 1.5,
  // Het midden. De snelheid staat ONDER de naaf: boven de naaf veegt de
  // naald bij elk toerental tussen 1000 en 7000 over de tekst heen, eronder
  // alleen bij stationair en boven 7000.
  Y_SCHAAL: 116, Y_RPM: 134, Y_SNEL: 192, Y_KMH: 222,
  // Lettermaten staan HIER en niet in de CSS: test-visueel.js rekent er de
  // tekstvakken mee uit, en een maat die op twee plekken staat loopt uit de pas.
  FS_SNEL: 38, FS_KLEIN: 14, FS_EENHEID: 11, FS_SCHAAL: 10,
  // De drie plekjes op één rij: icoon boven, getal eronder, alle drie
  // gecentreerd. Eén rij in plaats van een blok in het midden: dat was te druk.
  ICOON: 20, X_LINKS: 96, X_MIDDEN: 160, X_RECHTS: 224, Y_ICOON: 244, Y_WAARDE: 266,
  // Het getal van de onderboog staat ONDER de cirkel, gecentreerd onder zijn
  // balk: icoon en getal naast elkaar, het getal links uitgelijnd zodat een
  // langere laaddruk ("≈+1,5 bar") naar rechts groeit en het icoon niet raakt.
  VB_H: 346, ICOON_ONDER: 20, X_ONDER_ICOON: 136, X_ONDER_TEKST: 150, Y_ONDER: 330
};

function P(r,a){ const t=(a-90)*Math.PI/180; return [G.C+r*Math.cos(t), G.C+r*Math.sin(t)]; }
function f2(n){ return (Math.round(n*100)/100).toString(); }
// Een boog van a0 naar a1 in de richting waarin hij gevuld wordt.
function boogPad(r,a0,a1){
  const p0=P(r,a0), p1=P(r,a1), groot=Math.abs(a1-a0)>180?1:0, zin=a1>a0?1:0;
  return 'M'+f2(p0[0])+' '+f2(p0[1])+'A'+r+' '+r+' 0 '+groot+' '+zin+' '+f2(p1[0])+' '+f2(p1[1]);
}
function hoekOnder(d){ return G.O0 + (G.O1-G.O0)*d/100; }
function hoekLaaddrukNul(){ return hoekOnder((0-G.BAR_LO)/(G.BAR_HI-G.BAR_LO)*100); }

// ── STAND: getal in, begrensde aansturing uit ─────────────────────
function deel(v,lo,hi){
  const n=Number(v);
  if(v===null || v===undefined || v==='' || !isFinite(n) || !(hi>lo)) return null;
  return Math.max(0, Math.min(100, (n-lo)/(hi-lo)*100));
}
function tekst(rol, v){
  const n=Number(v);
  if(v===null || v===undefined || v==='' || !isFinite(n)) return '—';
  switch(rol){
    case 'snel':  return String(Math.max(0, Math.min(999, Math.round(n))));
    case 'toeren':return String(Math.max(0, Math.min(9990, Math.round(n/10)*10)));
    case 'pedaal':
    case 'tank':  return String(Math.max(0, Math.min(100, Math.round(n))));
    case 'koel':
    case 'olie':  return String(Math.max(-99, Math.min(999, Math.round(n))));
    case 'accu':  return Math.max(0, Math.min(99, n)).toFixed(1).replace('.',',');
    case 'laaddruk': { const b=Math.max(-9.9, Math.min(9.9, n)); return (b>0.04?'+':'')+b.toFixed(1).replace('.',','); }
  }
  return String(Math.round(n));
}
/* De enige plek waar een meetwaarde iets aan de meter verandert. Geeft
   {hoek, deel, tekst} terug — of voor laaddruk {vac, boost, tekst} — en elk
   veld is begrensd. `leeg` is true als er geen bruikbare waarde is: dan blijft
   de naald op het begin en staat er een streepje. */
function stand(rol, v){
  if(rol==='toeren'){
    const d=deel(v,0,G.RPM_MAX);
    return { leeg:d===null, deel:d===null?0:d, hoek:G.A0+(G.A1-G.A0)*(d===null?0:d)/100, tekst:tekst('toeren',v) };
  }
  if(rol==='pedaal'){
    const d=deel(v,0,100);
    return { leeg:d===null, deel:d===null?0:d, tekst:tekst('pedaal',v) };
  }
  if(rol==='olie'){
    const d=deel(v,G.OLIE_LO,G.OLIE_HI);
    return { leeg:d===null, deel:d===null?0:d, tekst:tekst('olie',v) };
  }
  if(rol==='laaddruk'){
    const n=Number(v);
    if(v===null || v===undefined || v==='' || !isFinite(n)) return { leeg:true, vac:0, boost:0, tekst:'—' };
    return { leeg:false,
             vac:   n<0 ? Math.min(100, (-n)/(-G.BAR_LO)*100) : 0,
             boost: n>0 ? Math.min(100, n/G.BAR_HI*100) : 0,
             tekst: tekst('laaddruk',n) };
  }
  const n=Number(v);
  return { leeg:(v===null || v===undefined || v==='' || !isFinite(n)), tekst:tekst(rol,v) };
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

/* Het oordeel van een plekje: 'ok', 'koud', 'warn', 'danger' of 'geen'.
   Koelwater leest zijn grenzen uit de PID-definitie (wH/dH), de rest staat
   hierboven met de reden erbij. */
function plekOordeel(rol, v, def, rpm){
  const n=Number(v);
  if(v===null || v===undefined || v==='' || !isFinite(n)) return 'geen';
  if(rol==='koel'){
    if(def && typeof def.dH==='number' && n>=def.dH) return 'danger';
    if(def && typeof def.wH==='number' && n>=def.wH) return 'warn';
    return n<KOEL_KOUD ? 'koud' : 'ok';
  }
  if(rol==='accu'){
    if(n<ACCU_LAAG || n>ACCU_HOOG) return 'danger';
    const r=Number(rpm);
    if(isFinite(r) && r>MOTOR_DRAAIT && n<ACCU_LAADT) return 'warn';
    return 'ok';
  }
  if(rol==='tank') return n<TANK_RESERVE ? 'warn' : 'ok';
  return 'ok';
}

// ── DE WIJZERPLAAT: één keer, uit G ────────────────────────────────
function lijn(r0,r1,a,cls){
  const p=P(r0,a), q=P(r1,a);
  return '<line class="'+cls+'" x1="'+f2(p[0])+'" y1="'+f2(p[1])+'" x2="'+f2(q[0])+'" y2="'+f2(q[1])+'"/>';
}
function tekstEl(id, cls, x, y, fs, inhoud, links){
  return '<text'+(id?' id="'+id+'"':'')+' class="'+cls+'" x="'+x+'" y="'+y+'" style="font-size:'+fs+'px'+(links?';text-anchor:start':'')+'">'+inhoud+'</text>';
}
function icoonVak(id, x, y, s){
  return '<svg id="'+id+'" class="vis-icoon" x="'+(x-s/2)+'" y="'+(y-s/2)+'" width="'+s+'" height="'+s+'" viewBox="0 0 24 24"></svg>';
}
function streepjes(wH){
  let s='';
  for(let v=0; v<=G.RPM_MAX; v+=500){
    const a=G.A0+(G.A1-G.A0)*v/G.RPM_MAX, groot=(v%1000===0);
    const cls='vis-streep'+(groot?' groot':'')+(wH && v>=wH?' rood':'');
    s+=lijn(groot?G.R_STREEP_GROOT:G.R_STREEP_KLEIN, G.R_STREEP_UIT, a, cls);
    if(groot){
      const p=P(G.R_CIJFER,a);
      s+=tekstEl('', 'vis-cijfer'+(wH && v>=wH?' rood':''), f2(p[0]), f2(p[1]), G.FS_CIJFER, String(v/1000));
    }
  }
  return s;
}
function wijzerplaat(wH, olieWH, olieDH){
  const C=G.C;
  let s='';
  s+='<circle class="vis-plaat" cx="'+C+'" cy="'+C+'" r="'+G.R_RING+'"/>';
  // Toeren: spoor, zone vanaf de waarschuwingsgrens, vulling, streepjes.
  s+='<path class="vis-spoor" d="'+boogPad(G.R_BOOG,G.A0,G.A1)+'" stroke-width="'+G.B_BOOG+'"/>';
  if(wH && wH<G.RPM_MAX)
    s+='<path class="vis-zone" d="'+boogPad(G.R_BOOG,G.A0+(G.A1-G.A0)*wH/G.RPM_MAX,G.A1)+'" stroke-width="'+G.B_BOOG+'"/>';
  s+='<path id="vis-toerenboog" class="vis-vul" pathLength="100" stroke-dasharray="0 200" d="'+boogPad(G.R_BOOG,G.A0,G.A1)+'" stroke-width="'+G.B_BOOG+'"/>';
  s+=streepjes(wH);
  s+=tekstEl('', 'vis-schaal', C, G.Y_SCHAAL, G.FS_SCHAAL, '×1000 /min');
  s+=tekstEl('vis-rpm', 'vis-rpm', C, G.Y_RPM, G.FS_EENHEID, '— rpm');
  // De onderboog. Alle paden staan er altijd (vaste tekening); de CSS toont
  // per soort (olie, pedaal, laaddruk) alleen wat erbij hoort.
  const z=hoekLaaddrukNul();
  s+='<g id="visg-onder" class="vis-slot leeg">'+
       '<path class="vis-spoor" d="'+boogPad(G.R_BOOG,G.O0,G.O1)+'" stroke-width="'+G.B_BOOG+'"/>'+
       (olieWH ? '<path class="vis-zone olie" d="'+boogPad(G.R_BOOG,hoekOnder(deel(olieWH,G.OLIE_LO,G.OLIE_HI)),hoekOnder(deel(olieDH||G.OLIE_HI,G.OLIE_LO,G.OLIE_HI)))+'" stroke-width="'+G.B_BOOG+'"/>' : '')+
       (olieDH && olieDH<G.OLIE_HI ? '<path class="vis-zone olie rood" d="'+boogPad(G.R_BOOG,hoekOnder(deel(olieDH,G.OLIE_LO,G.OLIE_HI)),G.O1)+'" stroke-width="'+G.B_BOOG+'"/>' : '')+
       '<path id="vis-onderboog" class="vis-vul" pathLength="100" stroke-dasharray="0 200" d="'+boogPad(G.R_BOOG,G.O0,G.O1)+'" stroke-width="'+G.B_BOOG+'"/>'+
       '<path id="vis-vacboog" class="vis-vul vac" pathLength="100" stroke-dasharray="0 200" d="'+boogPad(G.R_BOOG,z,G.O0)+'" stroke-width="'+G.B_BOOG+'"/>'+
       '<path id="vis-boostboog" class="vis-vul" pathLength="100" stroke-dasharray="0 200" d="'+boogPad(G.R_BOOG,z,G.O1)+'" stroke-width="'+G.B_BOOG+'"/>'+
       lijn(G.R_BOOG-5, G.R_BOOG+5, z, 'vis-nul')+
       icoonVak('vis-ondericoon', G.X_ONDER_ICOON, G.Y_ONDER, G.ICOON_ONDER)+
       tekstEl('vis-ondertekst', 'vis-klein', G.X_ONDER_TEKST, G.Y_ONDER, G.FS_KLEIN, '—', true)+
     '</g>';
  // Midden: de snelheid.
  s+=tekstEl('vis-snel', 'vis-snel', C, G.Y_SNEL, G.FS_SNEL, '—');
  s+=tekstEl('', 'vis-eenheid', C, G.Y_KMH, G.FS_EENHEID, 'km/h');
  // De drie plekjes.
  s+='<g id="visp-koel" class="vis-plek geen">'+icoonVak('visi-koel', G.X_LINKS, G.Y_ICOON, G.ICOON)+
       tekstEl('visv-koel', 'vis-klein', G.X_LINKS, G.Y_WAARDE, G.FS_KLEIN, '—')+'</g>';
  s+='<g id="visp-accu" class="vis-plek geen">'+icoonVak('visi-accu', G.X_MIDDEN, G.Y_ICOON, G.ICOON)+
       tekstEl('visv-accu', 'vis-klein', G.X_MIDDEN, G.Y_WAARDE, G.FS_KLEIN, '—')+'</g>';
  s+='<g id="visp-tank" class="vis-plek geen">'+icoonVak('visi-tank', G.X_RECHTS, G.Y_ICOON, G.ICOON)+
       tekstEl('visv-tank', 'vis-klein', G.X_RECHTS, G.Y_WAARDE, G.FS_KLEIN, '—')+'</g>';
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
const _staat = { aan:false, start:0, traag:new Set(), turboVast:false, handtekening:'', gebruik:new Set(), ind:null, timer:null, meldHtml:'' };

function bruikbaar(pid){
  try{
    if(typeof activePIDs==='undefined' || !activePIDs || !activePIDs.has(pid)) return false;
    if(typeof hiddenPIDs!=='undefined' && hiddenPIDs && hiddenPIDs.has(pid)) return false;
    if(window.PLSched && window.PLSched.dood(pid)) return false;
  }catch(e){ console.warn('PLVisueel: bruikbaarheid van '+pid+' niet te bepalen', e); return false; }
  return true;
}
function eerste(keten){ for(let i=0;i<keten.length;i++){ if(bruikbaar(keten[i])) return keten[i]; } return null; }

/* Is de turbo bewezen? Eén keer ja, altijd ja: de turbo verdwijnt niet
   halverwege de rit, en een boog die van betekenis wisselt is erger dan een
   lege. */
function turboBewezen(){
  if(_staat.turboVast) return true;
  let t=false;
  try{ t=!!(window.PLGate && window.PLGate.stats().turbo); }
  catch(e){ console.warn('PLVisueel: PLGate.stats() onleesbaar', e); }
  if(t) _staat.turboVast=true;
  return t;
}
/* De onderboog: olie, anders laaddruk (alleen met bewezen turbo), anders het
   gaspedaal. Een kandidaat die op deze auto te traag bleek valt af; olie
   niet, want die is van nature traag en beweegt ook zo. */
function kiesOnder(){
  if(bruikbaar('015C')) return { soort:'olie', pid:'015C' };
  if(turboBewezen() && bruikbaar('010B') && !_staat.traag.has('010B')) return { soort:'laaddruk', pid:'010B' };
  for(let i=0;i<PEDAAL_KETEN.length;i++){
    const p=PEDAAL_KETEN[i];
    if(bruikbaar(p) && !_staat.traag.has(p)) return { soort:'pedaal', pid:p };
  }
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
  if(!pid || pid==='015C' || _staat.traag.has(pid)) return;
  const t=gemetenTempo(pid);
  if(t!==null && t>VIS_TRAAG_MS) _staat.traag.add(pid);
}

function indeling(){
  const ind={ naald:bruikbaar('010C')?'010C':null, midden:bruikbaar('010D')?'010D':null,
              onder:kiesOnder(), plekken:{} };
  PLEKKEN.forEach(function(r){ ind.plekken[r.rol]=eerste(r.keten); });
  return ind;
}
function gebruiktePids(ind){
  const s=new Set();
  if(!ind) return s;
  if(ind.naald) s.add(ind.naald);
  if(ind.midden) s.add(ind.midden);
  if(ind.onder){ s.add(ind.onder.pid); if(ind.onder.soort==='laaddruk') s.add('0133'); }
  Object.keys(ind.plekken).forEach(function(k){ if(ind.plekken[k]) s.add(ind.plekken[k]); });
  return s;
}
function handtekening(ind){
  return [ind.naald, ind.midden, ind.onder?ind.onder.soort+ind.onder.pid:'',
          PLEKKEN.map(function(r){ return ind.plekken[r.rol]||''; }).join(',')].join('|');
}
function naamVan(pid){
  try{ const d=(typeof getPidDef==='function')?getPidDef(pid):null; return (d && d.name) || pid; }
  catch(e){ console.warn('PLVisueel: getPidDef('+pid+') mislukt', e); return pid; }
}
function defVan(pid){
  try{ return (typeof getPidDef==='function') ? getPidDef(pid) : null; }
  catch(e){ console.warn('PLVisueel: getPidDef('+pid+') mislukt', e); return null; }
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

// ── HET MELDINGENVAK ──────────────────────────────────────────────
// Onder de meter: wat er op de achtergrond loopt, en anders snelkoppelingen
// om het te starten. Het vak BEWAART NIETS. De staat komt uit PLRun.staat()
// — dezelfde lezers als de chip in de topbalk — en de bevindingen uit de
// correlatie-engine. Een eigen meldingenlijst hier zou een tweede lijst zijn
// die uit de pas gaat lopen, en dat is de vorm die PIDLANE-WERK.md en het
// oude §11 de kop kostte.
//
// Rit-monitor, caravanrit, bulk-recorder en rit-analyse zijn één soort: je
// draait er één tegelijk. Loopt er een, dan staat die er en verdwijnen de
// snelkoppelingen naar de andere. Waakronde en bevindingen hebben waarde
// náást elk van die vier en staan er dus los van.
// De bulk-recorder is alleen voor beheerders (magIk() in pidlane-bulk.js);
// een snelkoppeling die bij iemand anders alleen "Alleen voor admin" zegt,
// hoort er niet te staan.
const HOOFD = [
  { id:'monitor', naam:'Rit-monitor',   icoon:'🔔', snel:true },
  { id:'caravan', naam:'Caravanrit',    icoon:'🚐', snel:true },
  { id:'bulk',    naam:'Bulk-recorder', icoon:'⏺',  snel:true, admin:true },
  { id:'rit',     naam:'Rit-analyse',   icoon:'🎒', snel:false }
];
const BEV_IN_VAK = 2;           // zelfde grens als de bevindingenbalk (BEV_MAX)

function leesRun(){
  try{ return (window.PLRun && typeof window.PLRun.staat==='function') ? (window.PLRun.staat() || {}) : null; }
  catch(e){ console.warn('PLVisueel: PLRun.staat() mislukt', e); return null; }
}
function leesBevindingen(){
  try{
    if(!bevindingenAan()) return null;          // uitgezet in ☰: dan ook hier niet
    return (typeof _bevHits!=='undefined' && _bevHits) ? _bevHits.slice() : [];
  }catch(e){ console.warn('PLVisueel: bevindingen onleesbaar', e); return null; }
}
/* Wat er in het vak hoort, als gegevens. Los van de HTML zodat
   test-visueel.js het kan toetsen zonder DOM. */
function leesAdmin(){
  try{ return !!isAdmin(); }catch(e){ console.warn('PLVisueel: isAdmin() mislukt', e); return false; }
}
function meldingen(run, bev, admin){
  const uit={ regels:[], snel:[] };
  if(!run) return uit;
  const hoofd=HOOFD.filter(function(h){ return run[h.id] && run[h.id].aan; })[0] || null;
  if(hoofd) uit.regels.push({ soort:'hoofd', id:hoofd.id, icoon:hoofd.icoon, naam:hoofd.naam, detail:run[hoofd.id].detail||'' });
  if(run.waak && run.waak.aan) uit.regels.push({ soort:'waak', id:'waak', icoon:'👁', naam:'Waakronde', detail:run.waak.detail||'' });
  if(bev && bev.length){
    bev.slice(0, BEV_IN_VAK).forEach(function(b){ uit.regels.push({ soort:'bevinding', ernst:b.ernst, naam:b.naam, detail:b.uitleg||'' }); });
    if(bev.length>BEV_IN_VAK) uit.regels.push({ soort:'meer', naam:'nog '+(bev.length-BEV_IN_VAK)+' bevinding'+(bev.length-BEV_IN_VAK===1?'':'en') });
  }
  if(!hoofd) HOOFD.forEach(function(h){ if(h.snel && run[h.id] && (!h.admin || admin)) uit.snel.push({ id:h.id, icoon:h.icoon, naam:h.naam }); });
  if(run.waak && !run.waak.aan) uit.snel.push({ id:'waak', icoon:'👁', naam:'Waakronde' });
  return uit;
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function meldHtml(m){
  let h='';
  m.regels.forEach(function(r){
    if(r.soort==='bevinding'){
      h+='<button type="button" class="vis-meld bev'+(r.ernst>=2?' ernstig':'')+'" onclick="openBevindingen()"><span class="vis-meld-ic">🔗</span>'+
         '<span class="vis-meld-tx"><b>'+esc(r.naam)+'</b><small>'+esc(r.detail)+'</small></span></button>';
    } else if(r.soort==='meer'){
      h+='<button type="button" class="vis-meld meer" onclick="openBevindingen()">'+esc(r.naam)+' — bekijk alles →</button>';
    } else {
      h+='<button type="button" class="vis-meld" onclick="PLRun.open()"><span class="vis-meld-ic">'+r.icoon+'</span>'+
         '<span class="vis-meld-tx"><b>'+esc(r.naam)+'</b><small>'+esc(r.detail)+'</small></span></button>';
    }
  });
  if(m.snel.length){
    h+='<div class="vis-snelk">'+m.snel.map(function(s){
      return '<button type="button" class="pidview-btn" onclick="PLVisueel.schakel(\''+s.id+'\')">'+s.icoon+' '+esc(s.naam)+'</button>';
    }).join('')+'</div>';
  }
  return h;
}
function meldBij(){
  const el=document.getElementById('visMeld'); if(!el) return;
  const h=meldHtml(meldingen(leesRun(), leesBevindingen(), leesAdmin()));
  if(h!==_staat.meldHtml){ el.innerHTML=h; _staat.meldHtml=h; }
}
// Via PLRun, zodat een snelkoppeling precies doet wat de schakelaar in het
// run-paneel doet — ook de weigering zonder verbinding.
function schakel(id){
  try{
    const fout=(window.PLRun && typeof window.PLRun.schakel==='function') ? window.PLRun.schakel(id) : 'PLRun ontbreekt';
    if(fout){ try{ showToast(fout); }catch(e){ console.warn('PLVisueel: '+fout, e); } }
  }catch(e){ console.warn('PLVisueel: schakelen van '+id+' mislukt', e); }
  _staat.meldHtml=''; meldBij();
}

// ── HET SCHERM ────────────────────────────────────────────────────
function icoonHtml(naam){ return '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+((window.PL_ICOON||{})[naam]||'')+'</g>'; }
function el(id){ return document.getElementById(id); }
const ONDER_ICOON = { olie:'olie', laaddruk:'turbo', pedaal:'pedaal' };

function bouw(g){
  const ind=indeling();
  _staat.ind=ind; _staat.handtekening=handtekening(ind); _staat.gebruik=gebruiktePids(ind); _staat.meldHtml='';
  if(!ind.naald){
    g.innerHTML='<div class="vis-leeg"><p><b>Slim visueel heeft het toerental nodig.</b> '+
      '010C is niet geselecteerd, verborgen, of deze auto geeft hem niet.</p>'+
      '<button class="pidview-btn" type="button" onclick="setPidView(\'slim\')">Naar Slim</button></div>';
    return;
  }
  const d10=defVan('010C'), dOlie=defVan('015C');
  const wH=(d10 && typeof d10.wH==='number')?d10.wH:null;
  g.innerHTML='<div class="vis">'+
    '<svg class="vis-meter" viewBox="0 0 320 '+G.VB_H+'" role="img" aria-label="Toerental, snelheid, koelwater, accu en brandstof">'+
      wijzerplaat(wH, dOlie && dOlie.wH, dOlie && dOlie.dH)+'</svg>'+
    '<div class="vis-meldingen" id="visMeld"></div>'+
    '<div class="vis-voet"><span>Overige sensoren staan in Slim</span>'+
    '<button class="pidview-btn" type="button" onclick="setPidView(\'slim\')">Naar Slim</button></div></div>';
  // Onderboog: soort, icoon en titel.
  const og=el('visg-onder'), oi=el('vis-ondericoon');
  if(ind.onder){
    const o=ind.onder;
    if(og){ og.classList.add(o.soort);
            og.insertAdjacentHTML('afterbegin','<title>'+(o.soort==='laaddruk'
              ? '≈ Laaddruk: inlaatdruk (010B) min omgevingsdruk (0133, anders 101,3 kPa)'
              : esc(naamVan(o.pid))+' ('+o.pid+')')+'</title>'); }
    if(oi) oi.innerHTML=icoonHtml(o.pid==='0111'?'gasklep':ONDER_ICOON[o.soort]);
  } else if(og) og.classList.add('afwezig');
  // Plekjes: icoon en titel; zonder PID blijft het een streepje.
  PLEKKEN.forEach(function(r){
    const i=el('visi-'+r.rol), p=el('visp-'+r.rol), pid=ind.plekken[r.rol];
    if(i) i.innerHTML=icoonHtml(r.icoon);
    if(p) p.insertAdjacentHTML('afterbegin','<title>'+r.naam+(pid?' ('+pid+')':': niet geselecteerd of niet ondersteund')+'</title>');
  });
  // Wat er al binnen is meteen tonen: een herbouw midden in een rit hoort
  // niet eerst een lege meter te laten zien.
  _staat.gebruik.forEach(function(p){ if(typeof pidVals!=='undefined' && pidVals[p]!==undefined) bij(p, pidVals[p]); });
  meldBij();
}

function zetDash(id, d){ const e=el(id); if(e) e.setAttribute('stroke-dasharray', (Math.round(d*10)/10)+' 200'); }
function zetTekst(id, t){ const e=el(id); if(e && e.textContent!==t) e.textContent=t; }
function oordeel(pid, v){
  try{ const d=defVan(pid); return d ? pidOordeel(d,v,pid) : 'ok'; }
  catch(e){ console.warn('PLVisueel: oordeel voor '+pid+' mislukt', e); return 'ok'; }
}
function klasse(e, st){ if(!e) return; e.classList.remove('warn','danger','koud','geen'); if(st && st!=='ok') e.classList.add(st); }
function vers(id){ const e=el(id); if(e) e.classList.remove('leeg','oud'); }

function onderBij(){
  const ind=_staat.ind; if(!ind || !ind.onder || typeof pidVals==='undefined') return;
  const o=ind.onder;
  if(o.soort==='laaddruk'){
    let baro=pidVals['0133'];
    try{ const s=window.PLGate ? window.PLGate.stats() : null; if(s && typeof s.omgevingsdruk==='number') baro=s.omgevingsdruk; }
    catch(e){ console.warn('PLVisueel: omgevingsdruk onleesbaar', e); }
    const s=stand('laaddruk', laaddrukNu(pidVals['010B'], baro));
    zetDash('vis-vacboog', s.vac); zetDash('vis-boostboog', s.boost);
    zetTekst('vis-ondertekst', s.leeg ? '—' : '≈'+s.tekst+' bar');
    if(!s.leeg) vers('visg-onder');
    return;
  }
  const v=pidVals[o.pid], s=stand(o.soort, v);
  zetDash('vis-onderboog', s.deel);
  zetTekst('vis-ondertekst', s.leeg ? '—' : s.tekst+(o.soort==='olie'?'°':'%'));
  const st=o.soort==='olie' ? oordeel(o.pid, v) : 'ok';
  klasse(el('vis-onderboog'), st); klasse(el('visg-onder'), st);
  if(!s.leeg) vers('visg-onder');
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
    // Het toerental beslist mee over de accu: laadt een draaiende dynamo?
    if(ind.plekken.accu && typeof pidVals!=='undefined') plekBij('accu', pidVals[ind.plekken.accu]);
  }
  if(pid===ind.midden) zetTekst('vis-snel', tekst('snel', val));
  if(ind.onder && (pid===ind.onder.pid || (ind.onder.soort==='laaddruk' && pid==='0133'))) onderBij();
  PLEKKEN.forEach(function(r){ if(ind.plekken[r.rol]===pid) plekBij(r.rol, val); });
}
function plekBij(rol, val){
  const ind=_staat.ind; if(!ind) return;
  const pid=ind.plekken[rol];
  const rpm=(typeof pidVals!=='undefined' && ind.naald) ? pidVals[ind.naald] : undefined;
  const st=plekOordeel(rol, val, defVan(pid), rpm);
  zetTekst('visv-'+rol, st==='geen' ? '—' : tekst(rol, val)+(rol==='koel'?'°':rol==='tank'?'%':' V'));
  const p=el('visp-'+rol); klasse(p, st); if(p) p.classList.remove('oud');
}

// De tik: tempo beoordelen, ouderdom tonen, meldingen bijwerken, en herbouwen
// als de indeling werkelijk veranderde. Dat laatste gebeurt zelden en maar
// één kant op: een PID die te traag bleek of een turbo die bewezen werd.
function tik(){
  if(!_staat.aan) return;
  const ind=_staat.ind;
  if(ind && ind.onder) beoordeelTempo(ind.onder.pid);
  const nieuw=indeling();
  _staat.gebruik=gebruiktePids(nieuw);
  if(handtekening(nieuw)!==_staat.handtekening){
    const g=el('gGrid');
    if(g && typeof pidViewMode!=='undefined' && pidViewMode==='visueel'){ bouw(g); return; }
  }
  const nu=Date.now(), I=_staat.ind; if(!I) return;
  [['visg-naald',I.naald],['visg-onder',I.onder&&I.onder.pid]].forEach(function(x){
    const e=el(x[0]); if(e && x[1]) e.classList.toggle('oud', isOud(x[1], nu));
  });
  PLEKKEN.forEach(function(r){ const p=el('visp-'+r.rol), pid=I.plekken[r.rol]; if(p && pid) p.classList.toggle('oud', isOud(pid, nu)); });
  meldBij();
}

// De bevindingenbalk bovenaan de live view verhuist naar het meldingenvak
// zolang deze weergave open staat; renderCorrelationBanner() kijkt daarvoor
// zelf naar pidViewMode. Na elke wissel één keer opnieuw tekenen, anders
// blijft de balk staan (of weg) tot de volgende nieuwe bevinding.
function balkBij(){
  try{ renderCorrelationBanner(typeof _bevHits!=='undefined' ? _bevHits : []); }
  catch(e){ console.warn('PLVisueel: bevindingenbalk bijwerken mislukt', e); }
}
function start(){
  if(_staat.aan) return;
  _staat.aan=true; _staat.start=Date.now(); _staat.traag=new Set(); _staat.handtekening='';
  // Meteen de indeling kennen: remt() leest hem, en een lege set zou in de
  // eerste pollronde ook de PIDs remmen die er straks wél op staan.
  _staat.ind=indeling(); _staat.gebruik=gebruiktePids(_staat.ind);
  _staat.timer=setInterval(function(){ try{ tik(); }catch(e){ console.warn('PLVisueel: tik mislukt', e); } }, VIS_TIK_MS);
  balkBij();
}
function stop(){
  const was=_staat.aan;
  _staat.aan=false;
  if(_staat.timer){ clearInterval(_staat.timer); _staat.timer=null; }
  _staat.ind=null; _staat.gebruik=new Set();
  if(was) balkBij();
}

window.PLVisueel = {
  G:G, REM_MS:VIS_REM_MS, TRAAG_MS:VIS_TRAAG_MS, MIN_N:VIS_MIN_N, AANLOOP_MS:VIS_AANLOOP_MS, OUD_MIN_MS:VIS_OUD_MIN_MS,
  PEDAAL_KETEN:PEDAAL_KETEN, PLEKKEN:PLEKKEN, HOOFD:HOOFD,
  stand:stand, tekst:tekst, laaddrukNu:laaddrukNu, plekOordeel:plekOordeel,
  wijzerplaat:wijzerplaat, boogPad:boogPad, hoekOnder:hoekOnder, hoekLaaddrukNul:hoekLaaddrukNul,
  indeling:indeling, gebruiktePids:gebruiktePids, gemetenTempo:gemetenTempo, beoordeelTempo:beoordeelTempo,
  meldingen:meldingen, schakel:schakel,
  remt:remt, isOud:isOud, bouw:bouw, bij:bij, tik:tik, start:start, stop:stop,
  staat:function(){ return { aan:_staat.aan, start:_staat.start, traag:Array.from(_staat.traag),
                             turboVast:_staat.turboVast, gebruik:Array.from(_staat.gebruik), ind:_staat.ind }; }
};
})();
