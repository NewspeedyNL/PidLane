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
//   naald      010C toerental, 0 tot 8000 — of, bij elektrische aandrijving en
//              altijd zonder toerental, de VERMOGENSNAALD: rechts van nul
//              de vermogensvraag uit het gaspedaal, links de laadzone bij
//              gas los en afremmen. Zie naaldSoort() en vermogenStand()
//   midden     010D snelheid; erboven de versnelling (PLGear), en zolang die
//              niet bekend is het PidLane-embleem
//   onderboog  tussen vijf en zeven uur, op de straal van de toerenboog:
//              motorolie (015C); zonder olie de laaddruk als de turbo BEWEZEN
//              is (PLGate). Heeft de auto geen van beide, dan is er geen
//              onderboog en is de tekening zo hoog als de cirkel
//   rijen      onder de snelheid drie rijen onder elkaar (#371, 30-09-2026):
//              koelwater, gaspedaal (0149 → 015A → 014A → 0111) en brandstof,
//              elk een icoon met een liggend balkje en het getal erachter.
//              Tot 30-09 stond het pedaal op de onderboog en stonden
//              koelwater, accu en brandstof als drie plekjes naast elkaar
//   onder de   het getal van de onderboog, gecentreerd onder de cirkel
//   cirkel     (buiten de ring, dus de viewBox is dan hoger dan breed)
//   meldingen  onder de meter; zie meldingen() hieronder
//   boven      twee lampjes in de hoeken, op elf en op één uur: links wat de
//              verbrandingsmotor doet (aan, start/stop, uit) met de
//              motorbelasting (0104); rechts de accu. Op een gewone auto één
//              accu met de spanning (0142); op een hybride twee — de
//              aandrijfaccu (015B) en het 12V-net (0142). Zie aandrijfLampjes()
//   banden     rechtsonder een autootje van bovenaf met vier wielen, groen als
//              alles goed is (PLBanden.mini); tikken opent het bandenvenster
//
// Een diesel draait lager: daar loopt de schaal tot 6000 en begint het
// oranje bij 4500. Zie SCHAAL hieronder en schaalVoor().
//
// Bewust NIET op de meter zelf: de gasklepsensoren A/B/C, de tweede en derde
// pedaalsensor, ontstekingstiming, raildruk, luchtmassa. Die volgen uit het
// pedaal en het toerental of zijn getallen voor de monteur. Ze blijven in
// "Slim".
//
// ── ÉÉN AFWIJKENDE PID MAG DE METER NIET VERSTOREN ─────────────────
//   1. Elke plek tekent los. Ontbreekt een PID, dan blijft zijn plek leeg met
//      "—"; er schuift niets op en er wordt nooit 0 van gemaakt.
//   2. Het tempo wordt per auto GEMETEN (pidHist), niet aangenomen. Komt het
//      pedaal of de laaddruk hier langzamer binnen dan VIS_TRAAG_MS, dan valt
//      die plek door naar de volgende kandidaat — één keer, en hij springt
//      niet terug. Olie is van nature traag en valt daar niet onder.
//   3. Blijft een antwoord uit (plOud() in pidlane-plload.js, dezelfde regel als Overzicht),
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
//
// ── TREKMODUS: CARAVAN OF BELADEN (27-09-2026) ─────────────────────
// Met een caravan, aanhanger of volle auto tellen andere dingen dan het
// toerental: hoe warm koelwater en olie worden, hoe zwaar de motor werkt en in
// welke versnelling je dat doet. De trekmodus zet onder de meter een strook
// tegels met precies die sensoren (TREK hieronder). Hij staat aan zolang de
// Caravanrit loopt of de rijsituatie caravan of beladen aangetikt is. Er is
// geen knop en geen snelkoppeling meer voor (27-09-2026): het scherm past
// zich aan, maar hoeft het niet te benoemen. De meter zelf verandert niet — een
// wijzerplaat die van betekenis wisselt, leest niemand meer blind af.
// Koelwater krijgt een trend (°C per minuut): bij een lange klim is "hij
// stijgt nog" belangrijker dan het getal, want dan is er nog tijd om terug
// te schakelen of te stoppen. Stijgt hij snel terwijl hij al warm is, dan
// klinkt er een toon en trilt de telefoon (hoogstens eens per drie minuten):
// wie een caravan trekt, kijkt op de weg en niet naar een tegel. Een
// terugschakeladvies geeft de app bewust NIET — op de top van een klim is dat
// precies verkeerd, en dat kan de app niet zien aankomen.
//
// ── DE SENSOREN ZELF AANZETTEN (27-09-2026) ───────────────────────
// Wie Slim visueel opent, krijgt de sensoren die de meter nodig heeft erbij:
// per plek de eerste uit de keten die deze auto heeft (pidToevoegen keurt de
// rest af), niet als handmatige keuze, en nooit een sensor die de klant zelf
// verborgen heeft. Zie nodigePids().
//
// ── SESSIEBEWIJS (#294 en de trekmodus) ─────────────────────────────
// sessie() telt over de hele sessie, alleen met een echte auto: hoe lang
// deze weergave open stond en hoe lang daarvan gereden werd, het traagste
// gemeten tempo per PID op de meter, welke soort onderboog er stond, of de
// turbo herkend werd, het verbruik bij constant rijden, en de trekmodus
// (minuten, hoogste koelwatertrend, waarschuwingen). De blok-5-proef
// oordeelt daarmee over de rit, niet over het moment van de testrun.
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

const VIS_TRAAG_MS   = 800;    // mediaan tussen twee metingen: daarboven is het geen vloeiende meter meer
const VIS_MIN_N      = 8;      // zoveel metingen voordat "te traag" een uitspraak is
const VIS_AANLOOP_MS = 3000;   // metingen van vóór het openen (ander tempo) tellen niet mee
const VIS_REM_MS     = 2000;   // tempo voor snelle PIDs die niet op het scherm staan
const VIS_SNEL_MS    = 300;    // wat "snel" is in PID_POLL_CLASS
const VIS_TIK_MS     = 1000;   // herbeoordeling: tempo, ouderdom, indeling, meldingen
/* Het tempo-oordeel kijkt alleen naar RIJDEN (#338, 01-10-2026): de laatste
   minuut, en alleen het stuk sinds de auto onafgebroken rijdt met de app in
   beeld en de bus vrij. Testrun 8.3 haalde het pedaal voor de hele rit weg om
   157 s op de achtergrond en een stilstand, terwijl het rijdend 786 ms haalde
   (grens 800). Stilstaand vraagt de bus minder; dat zegt niets over de weg. */
const VIS_VENSTER_MS = 60000;
const VIS_RIJDT_KMH  = 5;      // dezelfde grens als sessieTik()

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

// De toerenschaal per motorsoort. Een diesel met de benzineplaat tot 8000
// gebruikt nooit het bovenste kwart, en het oranje stond bij 6000 — ver boven
// waar een diesel al afregelt. De motorsoort komt uit detectEngineType()
// (kentekendata); zonder die gegevens is het de benzineplaat.
const SCHAAL = {
  benzine: { max:8000, rood:null },   // rood: null = de wH van 010C
  diesel:  { max:6000, rood:4500 }
};

const PEDAAL_KETEN = ['0149','015A','014A','0111'];
// De drie rijen onder de snelheid, van boven naar onder (#371). De accu staat
// hier niet meer: die is een lampje rechtsboven geworden, net als de motor.
const PLEKKEN = [
  { rol:'koel',   keten:['0105','0167'], icoon:'koelwater', naam:'Koelwater' },
  { rol:'pedaal', keten:PEDAAL_KETEN,    icoon:'pedaal',    naam:'Gaspedaal' },
  { rol:'tank',   keten:['012F'],        icoon:'brandstof', naam:'Brandstofpeil' }
];
const ACCU_PID = '0142';
// De spanning op het accubalkje: 11 V leeg, 15 V vol. Een rustende accu
// (12,6 V) staat dan op 40%, een ladende dynamo (14,2 V) op 80%.
const ACCU_BALK_LO = 11, ACCU_BALK_HI = 15;
// Nooit remmen, ook niet als de indeling nog niet bekend is: zonder deze twee
// is er geen meter, en ze horen altijd op het snelste tempo.
const ANKERS = new Set(['010C','010D']);

// De trekstrook. `keten` = de eerste bruikbare telt; `turbo` alleen met
// bewezen turbo. De versnelling stond hier tot 27-09 als tegel; die staat nu
// in het midden van de meter, en twee keer hetzelfde getal is er één te veel.
const TREK = [
  { rol:'koel',     naam:'Koelwater',   keten:['0105','0167'], eenheid:'°C', trend:true },
  { rol:'olie',     naam:'Motorolie',   keten:['015C'],        eenheid:'°C' },
  { rol:'last',     naam:'Belasting',   keten:['0104','0143'], eenheid:'%'  },
  { rol:'inlaat',   naam:'Inlaatlucht', keten:['010F'],        eenheid:'°C' },
  { rol:'verbruik', naam:'Verbruik nu', keten:['CA03','015E'], eenheid:'' },
  { rol:'laaddruk', naam:'Laaddruk',    keten:['CA04'],        eenheid:'bar', turbo:true }
];
const KOEL_TREND_MS = 60000;   // venster voor de trend
const KOEL_TREND_WARN = 1.5;   // °C per minuut: daarboven, en warm, is het een waarschuwing
const KOEL_WARM = 90;
const ALARM_MS = 180000;       // hoogstens eens per drie minuten een toon

/* Koelwatertrend in °C per minuut uit de historie (lineaire regressie over
   het laatste venster). null = te weinig om iets te zeggen: minder dan vijf
   metingen of minder dan twintig seconden. */
function koelTrend(hist, nu){
  if(!Array.isArray(hist)) return null;
  const van=(nu||Date.now())-KOEL_TREND_MS;
  const p=hist.filter(function(x){ return x && typeof x.v==='number' && isFinite(x.v) && typeof x.t==='number' && x.t>=van; });
  if(p.length<5 || p[p.length-1].t-p[0].t<20000) return null;
  const t0=p[0].t;
  let sx=0, sy=0, sxx=0, sxy=0;
  p.forEach(function(x){ const t=(x.t-t0)/60000; sx+=t; sy+=x.v; sxx+=t*t; sxy+=t*x.v; });
  const n=p.length, d=n*sxx-sx*sx;
  if(!(Math.abs(d)>1e-9)) return null;
  return Math.round((n*sxy-sx*sy)/d*10)/10;
}
/* Welke PID staat op welke tegel? `mag(pid)` = bruikbaar; turbo = bewezen.
   Geeft voor elke tegel {rol, naam, pid|null, gear?}. */
function trekIndeling(mag, turbo){
  return TREK.filter(function(t){ return !t.turbo || turbo; }).map(function(t){
    let pid=null;
    for(let i=0;i<t.keten.length;i++){ if(mag(t.keten[i])){ pid=t.keten[i]; break; } }
    return { rol:t.rol, naam:t.naam, pid:pid, eenheid:t.eenheid, trend:!!t.trend };
  });
}
function caravanLoopt(){
  try{ const r=(window.PLRun && typeof window.PLRun.staat==='function') ? window.PLRun.staat() : null; return !!(r && r.caravan && r.caravan.aan); }
  catch(e){ console.warn('PLVisueel: PLRun.staat() mislukt', e); return false; }
}
// De rijsituatie (pidlane-rijsituatie.js) die om de trekstrook vraagt.
const TREK_SITUATIES = ['caravan','beladen'];
function trekSituatie(){
  try{
    const a=(typeof situatieActief==='function') ? situatieActief() : [];
    return a.some(function(x){ return x && TREK_SITUATIES.indexOf(x.id)>=0; });
  }catch(e){ console.warn('PLVisueel: rijsituatie onleesbaar', e); return false; }
}
function trekAan(){ return caravanLoopt() || trekSituatie(); }

/* Welke sensoren moet deze weergave erbij zetten? Per keten de eerste die de
   auto heeft (`heeft`), tenzij er uit die keten al een aanstaat of de klant
   hem verborgen heeft. Puur: test-visueel.js toetst hem los. */
function nodigePids(heeft, actief, verborgen, trek, extra){
  const ketens=[['010C'],['010D'],['015C']];
  PLEKKEN.forEach(function(r){ ketens.push(r.keten); });
  ketens.push([ACCU_PID]);
  if(trek) TREK.forEach(function(t){ if(t.keten && !t.turbo) ketens.push(t.keten); });
  // De ketens van het gekozen profiel (pidlane-visprofiel.js, 02-10-2026).
  (extra||[]).forEach(function(k){ if(Array.isArray(k) && k.length) ketens.push(k); });
  const uit=[];
  ketens.forEach(function(k){
    if(k.some(function(p){ return actief.has(p) && !verborgen.has(p); })) return;
    for(let i=0;i<k.length;i++){
      const p=k[i];
      if(heeft.has(p) && !verborgen.has(p)){ if(uit.indexOf(p)<0) uit.push(p); return; }
    }
  });
  return uit;
}
function zorgPids(){
  if(typeof activePIDs==='undefined' || !activePIDs) return [];
  let heeft=new Set(), verborgen=new Set();
  try{ heeft=new Set((typeof discoveredPIDDefs!=='undefined' && discoveredPIDDefs) ? discoveredPIDDefs.map(function(d){ return d.pid; }) : []); }
  catch(e){ console.warn('PLVisueel: keuzelijst onleesbaar', e); }
  try{ if(typeof hiddenPIDs!=='undefined' && hiddenPIDs) verborgen=hiddenPIDs; }
  catch(e){ console.warn('PLVisueel: verborgen sensoren onleesbaar', e); }
  const kies=nodigePids(heeft, activePIDs, verborgen, trekAan(), profielKetens());
  if(!kies.length) return [];
  const voor=(typeof plSelectieVoor==='function') ? plSelectieVoor() : null;
  const r=(typeof pidToevoegen==='function') ? pidToevoegen(kies, { handmatig:false }) : { ok:[] };
  try{ if(voor && r.ok.length) plSelectieMeld(voor, 'slim visueel'); }catch(e){ console.warn('PLVisueel: selectiemelding', e); }
  return r.ok;
}

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
  // alleen bij stationair en boven 7000. Boven de naaf staat sinds 26-09 het
  // embleem en geen tekst meer: het toerental leest de naald al af, en een
  // tekening onder de naald hindert niet waar een getal dat wel doet.
  Y_LOGO: 112, LOGO_B: 56, Y_SNEL: 192, Y_KMH: 222,
  // Lettermaten staan HIER en niet in de CSS: test-visueel.js rekent er de
  // tekstvakken mee uit, en een maat die op twee plekken staat loopt uit de pas.
  FS_SNEL: 38, FS_KLEIN: 14, FS_EENHEID: 11,
  // De drie rijen onder de snelheid (#371): per rij een icoon, een liggend
  // balkje en het getal erachter, links uitgelijnd zodat "118°" naar rechts
  // groeit en het balkje niet raakt. De onderste rij staat vlak boven de
  // onderboog; test-visueel.js rekent na dat hij die niet raakt.
  RIJ_Y: [238, 255, 272], RIJ_ICOON: 14, X_RIJ_ICOON: 108,
  X_BALK0: 120, X_BALK1: 186, B_BALK: 5, X_RIJ_TEKST: 191, FS_RIJ: 11,
  // Het getal van de onderboog staat ONDER de cirkel, gecentreerd onder zijn
  // balk: icoon en getal naast elkaar, het getal links uitgelijnd zodat een
  // langere laaddruk ("≈+1,5 bar") naar rechts groeit en het icoon niet raakt.
  // Zonder onderboog staat daar niets, en is de tekening zo hoog als de
  // cirkel (VB_KORT): geen lege strook tussen de meter en de meldingen.
  VB_H: 346, VB_KORT: 320, ICOON_ONDER: 20, X_ONDER_ICOON: 136, X_ONDER_TEKST: 150, Y_ONDER: 330,
  // De versnelling, in het midden op de plek van het embleem (27-09-2026).
  FS_GEAR: 34,
  // Het bereik van het koelwaterbalkje.
  KOEL_LO: 40, KOEL_HI: 130
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
   veld is begrensd. `max` is het einde van de toerenschaal (standaard
   G.RPM_MAX; een diesel geeft 6000 mee). `leeg` is true als er geen
   bruikbare waarde is: dan blijft de naald op het begin en staat er een
   streepje. */
function stand(rol, v, max){
  if(rol==='toeren'){
    const d=deel(v,0,(max>0?max:G.RPM_MAX));
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

// ── DE VERMOGENSNAALD (07-10-2026, #432) ──────────────────────────
/* Een hybride rijdt een groot deel van de tijd met de motor uit. Een
   toerennaald staat dan op nul terwijl de auto 50 rijdt, en zonder 010C ging
   deze weergave helemaal niet open ("heeft het toerental nodig"). Een
   elektrische auto lost dat op met een vermogensmeter: rechts wat je vraagt,
   links wat er teruggewonnen wordt. Dat is wat hier staat.

   EERLIJK OVER DE BRON. Standaard-OBD geeft op een hybride geen gemeten
   totaalvermogen. Wat er wél is: het gaspedaal, en dat IS de vermogensvraag
   — welke bron hem levert (motor, accu of allebei) beslist de auto. De
   meter van een Toyota werkt net zo. Links van nul staat geen gemeten
   laadstroom maar de vertraging bij losgelaten pedaal: dat is wanneer een
   hybride terugwint. Het getal erbij is dus "%" en "laden", nooit kW.

   0111 (gasklep) staat bewust niet in de keten: dat is de klep van de
   verbrandingsmotor, en die staat dicht terwijl je op de accu optrekt. */
const VRAAG_KETEN = ['015A','0149','014A'];
const VERMOGEN = {
  NUL: 25,            // het nulpunt op 25% van de schaal: links laden, rechts vragen
  RUST: 3,            // % vraag: daaronder telt het pedaal als los
  BEREIK: 60,         // minimaal bereik boven de rust; 0149 komt zelden boven 80%
  LAAD_VOL: 8,        // km/h per seconde vertraging = volle laadzone (≈2,2 m/s²)
  LAAD_VENSTER_MS: 1500,
  LAAD_MIN_MS: 600,   // korter venster is ruis van één monster
  LAAD_MIN_KMH: 5     // daaronder wint een hybride niets meer terug
};
/* Welke naald? Puur: alles komt van buiten.
   elektrisch = de kentekendata of de motornaam zegt hybride/EV, of de
   aandrijfstatus heeft één keer rijden-op-de-accu gezien (bewijstHybride). */
function naaldSoort(motor, bewijstHybride, heeftToeren, heeftVraag){
  const elektrisch=(motor==='hybride' || motor==='ev' || !!bewijstHybride);
  if(elektrisch && heeftVraag) return 'vermogen';
  if(heeftToeren) return 'toeren';
  if(heeftVraag) return 'vermogen';
  return null;
}
/* De vermogensvraag 0–100 uit een pedaalwaarde. 0149 en 014A staan in rust
   niet op nul maar rond de 15%, en het vloerniveau verschilt per auto. Dus
   zelflerend: `leer` = {min, max} van deze sessie, en wordt hier bijgewerkt. */
function vraagUit(v, leer){
  // De rekensom staat in PLToon (pidlane-toon.js): dezelfde rust geldt ook
  // voor het getal op de pedaalrij en in Slim en Overzicht.
  return PLToon.ingedrukt(v, leer, VERMOGEN.BEREIK);
}
/* De laadzone 0–100 uit de snelheidshistorie: vertraging over het laatste
   venster. null = te weinig om iets te zeggen; 0 = niet aan het vertragen. */
function laadUit(hist, nu){
  if(!Array.isArray(hist)) return null;
  const van=nu-VERMOGEN.LAAD_VENSTER_MS;
  const p=hist.filter(function(x){ return x && typeof x.v==='number' && isFinite(x.v) && typeof x.t==='number' && x.t>=van; });
  if(p.length<2) return null;
  const a=p[0], b=p[p.length-1], dt=(b.t-a.t)/1000;
  if(dt*1000<VERMOGEN.LAAD_MIN_MS) return null;
  if(b.v<VERMOGEN.LAAD_MIN_KMH) return 0;
  const vertraging=(a.v-b.v)/dt;
  return vertraging>0 ? Math.max(0, Math.min(100, vertraging/VERMOGEN.LAAD_VOL*100)) : 0;
}
/* De stand van de vermogensnaald, begrensd zoals stand(): `deel` is de plek
   op de hele schaal (0–100), `vraag` en `laad` de vulling van de twee bogen
   vanaf het nulpunt. Vraagt het pedaal iets, dan wint dat: wie gas geeft
   laadt niet. */
function vermogenStand(vraag, laad){
  const N=VERMOGEN.NUL, heeftV=(typeof vraag==='number' && isFinite(vraag)), heeftL=(typeof laad==='number' && isFinite(laad));
  if(!heeftV && !heeftL) return { leeg:true, deel:N, hoek:G.A0+(G.A1-G.A0)*N/100, vraag:0, laad:0, laden:false, tekst:'—' };
  let d=N, vr=0, ld=0, laden=false, t='0%';
  if(heeftV && vraag>VERMOGEN.RUST){
    vr=Math.max(0, Math.min(100, vraag)); d=N+(100-N)*vr/100; t=Math.round(vr)+'%';
  } else if(heeftL && laad>0){
    ld=Math.max(0, Math.min(100, laad)); d=N-N*ld/100; laden=true; t='laden';
  }
  return { leeg:false, deel:d, hoek:G.A0+(G.A1-G.A0)*d/100, vraag:vr, laad:ld, laden:laden, tekst:t };
}
function hoekVermogen(d){ return G.A0+(G.A1-G.A0)*d/100; }

// ── DE DRIE TEGELS VAN DE ENERGIEWEERGAVE (07-10-2026, #437) ─────────
/* Versnelling in km/h per seconde over het laadvenster: positief bij
   optrekken, negatief bij remmen. null = te weinig om iets te zeggen. Dezelfde
   vensterregels als laadUit(), zodat de tegel en de groene ring hetzelfde
   moment beschrijven. */
function versnellingUit(hist, nu){
  if(!Array.isArray(hist)) return null;
  const van=nu-VERMOGEN.LAAD_VENSTER_MS;
  const p=hist.filter(function(x){ return x && typeof x.v==='number' && isFinite(x.v) && typeof x.t==='number' && x.t>=van; });
  if(p.length<2) return null;
  const a=p[0], b=p[p.length-1], dt=(b.t-a.t)/1000;
  if(dt*1000<VERMOGEN.LAAD_MIN_MS) return null;
  return Math.round((b.v-a.v)/dt*10)/10;
}
/* Het EV-aandeel van deze rit: welk deel van de RIJtijd de motor uit stond.
   Stilstaan telt niet mee — een hybride voor het stoplicht staat altijd op
   de accu, en dat is geen elektrisch rijden. `st` = {evMs, rijMs, t}. */
const AANDEEL_MIN_MS = 30000;   // korter gereden: nog geen uitspraak
function aandeelBij(st, toestand, nu){
  const uit={ evMs:(st&&st.evMs)||0, rijMs:(st&&st.rijMs)||0, t:nu };
  const dt=(st && typeof st.t==='number') ? Math.max(0, Math.min(5000, nu-st.t)) : 0;
  if(toestand==='ACCU_RIJDT'){ uit.evMs+=dt; uit.rijMs+=dt; }
  else if(toestand==='DRAAIT_RIJDT') uit.rijMs+=dt;
  return uit;
}
function aandeelUit(st){ return (st && st.rijMs>=AANDEEL_MIN_MS) ? Math.round(st.evMs/st.rijMs*100) : null; }
/* Het elektrische bereik, geleerd op deze rit: hoeveel km de auto op de accu
   rijdt per procent dat 015B zakt. Er is geen OBD-PID voor de accu-inhoud
   of het verbruik in kWh/km, dus meten is de enige eerlijke weg. Pas na
   ACCU_MIN_PCT daling en ACCU_MIN_KM afstand is het een getal.
   `leer` = {km, pct, soc, t}. */
const ACCU_MIN_PCT = 2, ACCU_MIN_KM = 0.5;
function accuLeerBij(leer, toestand, soc, kmh, nu){
  const uit={ km:(leer&&leer.km)||0, pct:(leer&&leer.pct)||0, soc:(typeof soc==='number' && isFinite(soc)) ? soc : (leer?leer.soc:null), t:nu };
  const dt=(leer && typeof leer.t==='number') ? Math.max(0, Math.min(5000, nu-leer.t)) : 0;
  if(toestand==='ACCU_RIJDT' && typeof kmh==='number' && isFinite(kmh) && kmh>0){
    uit.km+=kmh*dt/3600000;
    if(leer && typeof leer.soc==='number' && typeof soc==='number' && soc<leer.soc) uit.pct+=leer.soc-soc;
  }
  return uit;
}
function elektrischBereik(leer, soc){
  if(!leer || !(leer.pct>=ACCU_MIN_PCT) || !(leer.km>=ACCU_MIN_KM) || typeof soc!=='number' || !isFinite(soc)) return null;
  return Math.max(0, soc*leer.km/leer.pct);
}
/* Brandstof plus accu, in km. Eén van beide mag ontbreken; allebei weg is null. */
function bereikUit(brandstofKm, elektrischKm){
  const b=(typeof brandstofKm==='number' && isFinite(brandstofKm)) ? Math.max(0, brandstofKm) : null;
  const e=(typeof elektrischKm==='number' && isFinite(elektrischKm)) ? Math.max(0, elektrischKm) : null;
  if(b===null && e===null) return null;
  return { totaal:Math.round((b||0)+(e||0)), brandstof:b===null?null:Math.round(b), elektrisch:e===null?null:Math.round(e) };
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
function streepjes(wH, max){
  let s='';
  for(let v=0; v<=max; v+=500){
    const a=G.A0+(G.A1-G.A0)*v/max, groot=(v%1000===0);
    const cls='vis-streep'+(groot?' groot':'')+(wH && v>=wH?' rood':'');
    s+=lijn(groot?G.R_STREEP_GROOT:G.R_STREEP_KLEIN, G.R_STREEP_UIT, a, cls);
    if(groot){
      const p=P(G.R_CIJFER,a);
      s+=tekstEl('', 'vis-cijfer'+(wH && v>=wH?' rood':''), f2(p[0]), f2(p[1]), G.FS_CIJFER, String(v/1000));
    }
  }
  return s;
}
/* Het PidLane-embleem voor het midden van de meter. Het echte logo
   (index.html, #plIntro) is een tegel van 512 met twee gloedfilters en een
   donkere achtergrond: op 56 px breed worden de filters vlekken en is de
   tegel een zwart blok op de plaat. Hier alleen de lijnen — ballon, hartslag,
   het begin van de weg en de vonk — uitgesneden op wat er getekend wordt
   (x 88…474, y 44…336) en met lijnen die dik genoeg blijven. De hartslag en de
   weg volgen het thema; de ballon en de vonk houden hun merkkleur. */
const LOGO_VB = [88, 44, 386, 292];
function embleem(){
  const b=G.LOGO_B, h=b*LOGO_VB[3]/LOGO_VB[2];
  return '<svg class="vis-logo" x="'+f2(G.C-b/2)+'" y="'+f2(G.Y_LOGO-h/2)+'" width="'+b+'" height="'+f2(h)+'" viewBox="'+LOGO_VB.join(' ')+'" aria-hidden="true">'+
    '<defs><linearGradient id="visLogoGr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#00FF88"/><stop offset="1" stop-color="#00D4FF"/></linearGradient>'+
    '<linearGradient id="visLogoSp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9D8CFF"/><stop offset="1" stop-color="#00D4FF"/></linearGradient></defs>'+
    '<path class="vis-logo-weg" d="M198 314L183 336M314 314L329 336M256 312V322M256 331V336"/>'+
    '<path d="M256 294H170C126 294 100 268 100 226V154C100 112 126 86 170 86H342C386 86 412 112 412 154V226C412 268 386 294 342 294H296Z" fill="none" stroke="url(#visLogoGr)" stroke-width="22" stroke-linejoin="round"/>'+
    '<path class="vis-logo-puls" d="M138 190H192L212 148L244 236L272 164L290 190H372"/>'+
    '<path d="M404 52C409 79 417 88 446 96C417 104 409 113 404 140C399 113 391 104 362 96C391 88 399 79 404 52Z" fill="url(#visLogoSp)"/>'+
    '</svg>';
}
// Eén rij onder de snelheid: icoon, liggend balkje, getal. Het balkje is
// hetzelfde trucje als de bogen — een vast pad met pathLength=100 dat via
// stroke-dasharray gevuld wordt — dus het kan nooit langer worden dan zijn spoor.
function rij(r, y){
  const d='M'+G.X_BALK0+' '+y+'H'+G.X_BALK1;
  return '<g id="visp-'+r.rol+'" class="vis-plek vis-rij '+r.rol+' geen">'+
    icoonVak('visi-'+r.rol, G.X_RIJ_ICOON, y, G.RIJ_ICOON)+
    '<path class="vis-balk-spoor" d="'+d+'" stroke-width="'+G.B_BALK+'"/>'+
    '<path id="viss-'+r.rol+'" class="vis-balk" pathLength="100" stroke-dasharray="0 200" d="'+d+'" stroke-width="'+G.B_BALK+'"/>'+
    tekstEl('visv-'+r.rol, 'vis-klein', G.X_RIJ_TEKST, y, G.FS_RIJ, '—', true)+'</g>';
}
// Vulling 0–100 van een balkje; null = geen waarde. Koelwater loopt van
// KOEL_LO tot KOEL_HI, brandstof en pedaal zijn al een percentage.
function staafDeel(rol, v){
  const n=Number(v);
  if(v===null || v===undefined || v==='' || !isFinite(n)) return null;
  const d = rol==='koel' ? (n-G.KOEL_LO)/(G.KOEL_HI-G.KOEL_LO)*100 : n;
  return Math.max(0, Math.min(100, d));
}
// De versnelling als tekst: N, R of het getal; '' = onbekend (embleem).
function gearTekst(g){
  if(g===null || g===undefined || !isFinite(Number(g))) return '';
  return g===0 ? 'N' : g===-1 ? 'R' : String(g);
}
function gearBij(){
  let g=null;
  // toonbaar() en niet waarde() (30-09-2026): op de meter liever het embleem
  // dan een versnelling die nog niet zeker is.
  try{ g=(window.PLGear && typeof window.PLGear.toonbaar==='function') ? window.PLGear.toonbaar() : null; }
  catch(x){ console.warn('PLVisueel: PLGear.toonbaar() mislukt', x); }
  const t=gearTekst(g), lg=el('visg-logo');
  zetTekst('vis-gear', t);
  if(lg) lg.style.display = t ? 'none' : '';
}
/* De plaat van de vermogensnaald: dezelfde boog en dezelfde straal als de
   toerenplaat, alleen met een nulpunt. Links de laadzone in groen, rechts
   streepjes per 10% vraag met cijfers op 0, 50 en 100. Twee vulbogen vanaf
   nul, net als vacuüm en laaddruk op de onderboog. */
function vermogenPlaat(){
  const N=VERMOGEN.NUL, a0=hoekVermogen(N);
  let s='<path class="vis-zone laad" d="'+boogPad(G.R_BOOG,G.A0,a0)+'" stroke-width="'+G.B_BOOG+'"/>';
  s+='<path id="vis-laadboog" class="vis-vul laad" pathLength="100" stroke-dasharray="0 200" d="'+boogPad(G.R_BOOG,a0,G.A0)+'" stroke-width="'+G.B_BOOG+'"/>';
  s+='<path id="vis-vraagboog" class="vis-vul" pathLength="100" stroke-dasharray="0 200" d="'+boogPad(G.R_BOOG,a0,G.A1)+'" stroke-width="'+G.B_BOOG+'"/>';
  for(let v=0; v<=100; v+=10){
    const a=hoekVermogen(N+(100-N)*v/100), groot=(v%50===0);
    s+=lijn(groot?G.R_STREEP_GROOT:G.R_STREEP_KLEIN, G.R_STREEP_UIT, a, 'vis-streep'+(groot?' groot':''));
    if(groot){ const p=P(G.R_CIJFER,a); s+=tekstEl('', 'vis-cijfer', f2(p[0]), f2(p[1]), G.FS_CIJFER, String(v)); }
  }
  // De laadzone: een half en een heel streepje, en het woord in de zone.
  [50,100].forEach(function(v){ s+=lijn(v===100?G.R_STREEP_GROOT:G.R_STREEP_KLEIN, G.R_STREEP_UIT, hoekVermogen(N-N*v/100), 'vis-streep laad'+(v===100?' groot':'')); });
  const pl=P(G.R_CIJFER, hoekVermogen(N/2));
  s+=tekstEl('', 'vis-cijfer laad', f2(pl[0]), f2(pl[1]), G.FS_EENHEID, '⚡');
  return s;
}
function wijzerplaat(wH, olieWH, olieDH, max, soort){
  const C=G.C, M=(max>0?max:G.RPM_MAX);
  let s='';
  s+='<circle class="vis-plaat" cx="'+C+'" cy="'+C+'" r="'+G.R_RING+'"/>';
  s+='<path class="vis-spoor" d="'+boogPad(G.R_BOOG,G.A0,G.A1)+'" stroke-width="'+G.B_BOOG+'"/>';
  if(soort==='vermogen'){
    s+=vermogenPlaat();
  } else {
    // Toeren: zone vanaf de waarschuwingsgrens, vulling, streepjes.
    if(wH && wH<M)
      s+='<path class="vis-zone" d="'+boogPad(G.R_BOOG,G.A0+(G.A1-G.A0)*wH/M,G.A1)+'" stroke-width="'+G.B_BOOG+'"/>';
    s+='<path id="vis-toerenboog" class="vis-vul" pathLength="100" stroke-dasharray="0 200" d="'+boogPad(G.R_BOOG,G.A0,G.A1)+'" stroke-width="'+G.B_BOOG+'"/>';
    s+=streepjes(wH, M);
  }
  s+='<g id="visg-logo">'+embleem()+'</g>';
  s+=tekstEl('vis-gear', 'vis-gear', C, G.Y_LOGO, G.FS_GEAR, '');
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
  // De drie rijen.
  PLEKKEN.forEach(function(r, i){ s+=rij(r, G.RIJ_Y[i]); });
  // Sleepwijzer en naald: één vorm op twaalf uur, gedraaid om het midden.
  const pk0=P(G.R_PIEK_IN,0), pkL=P(G.R_PIEK_UIT,-2.2), pkR=P(G.R_PIEK_UIT,2.2);
  s+='<g id="vis-piek" class="vis-piek" style="display:none;transform:rotate('+G.A0+'deg)">'+
       '<path d="M'+f2(pkL[0])+' '+f2(pkL[1])+'L'+f2(pkR[0])+' '+f2(pkR[1])+'L'+f2(pk0[0])+' '+f2(pk0[1])+'Z"/></g>';
  const rust=(soort==='vermogen') ? hoekVermogen(VERMOGEN.NUL) : G.A0;
  s+='<g id="visg-naald" class="vis-slot leeg"><g id="vis-naald" class="vis-naald" style="transform:rotate('+f2(rust)+'deg)">'+
       '<line x1="'+C+'" y1="'+(C+G.NAALD_STAART)+'" x2="'+C+'" y2="'+(C-G.NAALD)+'"/></g></g>';
  s+='<circle class="vis-naaf" cx="'+C+'" cy="'+C+'" r="'+G.R_NAAF+'"/>';
  return s;
}

// ── DE INDELING ───────────────────────────────────────────────────
function leegSessie(){
  return { sinds:Date.now(), openMs:0, rijdendMs:0, trekMs:0, maxTrend:null, alarmen:0, tempo:{}, onder:{}, turbo:false,
           traag:[], constant:{ n:0, som:0, kmhSom:0 }, herbouwReden:{} };
}
let _sessie = leegSessie(), _sessieT = 0, _snelheden = [], _laatsteAlarm = 0;
const _staat = { aan:false, start:0, traag:new Set(), turboVast:false, handtekening:'', gebruik:new Set(), ind:null, timer:null,
                 meldSleutel:'', lampSleutel:'', rijdtSinds:0, laatsteTik:0, pauze:null, gebouwd:false, selectie:'', profiel:'basis',
                 vraagLeer:{ min:null, max:null }, aandeel:null, accuLeer:null };

// ── DE VIJF WEERGAVEN (02-10-2026) ────────────────────────────────
// Basis is de meter hieronder; temperatuur, emissie, verbruik en motor zijn
// eigen tekeningen uit pidlane-visprofiel.js. Het kader (lampjes, meldingen,
// trekstrook) blijft bij elk profiel hetzelfde. De knop "Volgende" boven het
// vak wisselt rond; de keuze wordt per toestel onthouden.
function PF(){ return window.PLVisProfiel || null; }
function profielNu(){ return (PF() && _staat.profiel && PF().geldig(_staat.profiel)) ? _staat.profiel : 'basis'; }
function profielKetens(){ const p=profielNu(); return (p!=='basis' && PF()) ? PF().ketens(p, leesMotor(), profielOpts()) : []; }
/* Wat het profiel nodig heeft om een plek zelf in te vullen (06-10-2026): de
   keuzes van dit toestel en de keuzelijst (naam, eenheid, schaal). */
function profielOpts(){
  let defs=[];
  try{ defs=(typeof discoveredPIDDefs!=='undefined' && discoveredPIDDefs) ? discoveredPIDDefs.map(function(d){ return { pid:d.pid, name:d.name, unit:d.unit, min:d.min, max:d.max }; }) : []; }
  catch(e){ console.warn('PLVisueel: keuzelijst onleesbaar voor het profiel', e); }
  return { keuze:PF() ? PF().keuzes() : {}, defs:defs };
}

/* ── EEN PLEK ZELF KIEZEN (06-10-2026) ───────────────────────────
   Tik op een plek van een profiel: een lijst met "Automatisch" en de
   sensoren van deze auto, die met dezelfde eenheid bovenaan. De telemetrie
   doet niet mee: die plekken zijn de telefoon, niet de auto. */
function kandidaten(eenheid){
  let lijst=[];
  try{ lijst=(typeof discoveredPIDDefs!=='undefined' && discoveredPIDDefs) ? discoveredPIDDefs.slice() : []; }
  catch(e){ console.warn('PLVisueel: keuzelijst onleesbaar', e); }
  lijst=lijst.filter(function(d){
    try{
      if(typeof hiddenPIDs!=='undefined' && hiddenPIDs && hiddenPIDs.has(d.pid)) return false;
      if(typeof plIsTelemetrie==='function' && plIsTelemetrie(d.pid)) return false;
      if(typeof pidGate==='function' && !pidGate(d.pid,'kiesbaar',{})) return false;
    }catch(e){ console.warn('PLVisueel: kandidaat '+d.pid+' niet te beoordelen', e); return false; }
    return true;
  });
  const temp=/°/.test(String(eenheid||''));
  const zelfde=function(d){ const u=String(d.unit||''); return temp ? /°/.test(u) : (u && u===eenheid); };
  return lijst.filter(zelfde).concat(lijst.filter(function(d){ return !zelfde(d); }));
}
function kiesPlek(rol){
  const P=PF(), pr=profielNu(); if(!P || pr==='basis' || pr==='telemetrie') return;
  const z=P.voorInd(pr, _staat.ind && _staat.ind.profiel);
  const x=z && z.plekken ? z.plekken.filter(function(q){ return q.rol===rol; })[0] : null; if(!x) return;
  const nu=(P.keuzes()[pr+'/'+rol])||'';
  const basis=P.zoek(pr).plekken.filter(function(q){ return q.rol===rol; })[0] || x;
  let ov=el('plVisKies');
  if(!ov){
    ov=document.createElement('div'); ov.id='plVisKies';
    ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); ov.setAttribute('aria-labelledby','plVisKiesTtl');
    ov.addEventListener('click', function(e){ if(e.target===ov) ov.style.display='none'; });
    document.body.appendChild(ov);
  }
  const rij=function(pid, naam, sub){
    return '<button type="button" class="vk-rij'+(nu===pid?' aan':'')+'" data-pid="'+esc(pid)+'">'+
      '<span>'+esc(naam)+'</span><small>'+esc(sub||'')+'</small></button>';
  };
  ov.innerHTML='<div class="vk-vel"><div class="vk-kop"><h2 id="plVisKiesTtl">'+esc(basis.naam)+'</h2>'+
    '<button type="button" class="vk-sluit" aria-label="Sluiten" onclick="document.getElementById(\'plVisKies\').style.display=\'none\'">✕</button></div>'+
    '<p class="vk-uitleg">Kies welke sensor op deze plek staat. Automatisch neemt de vaste sensor, of een eigen sensor met dezelfde naam.</p>'+
    rij('', 'Automatisch', nu ? '' : 'nu gekozen')+
    kandidaten(basis.eenheid).map(function(d){ return rij(d.pid, d.name, (d.unit||'')+' · '+d.pid); }).join('')+'</div>';
  ov.querySelectorAll('.vk-rij').forEach(function(b){
    b.onclick=function(){
      P.zetKeuze(pr, rol, b.getAttribute('data-pid'));
      ov.style.display='none';
      const g=el('gGrid');
      if(g && typeof pidViewMode!=='undefined' && pidViewMode==='visueel') bouw(g, 'keuze');
    };
  });
  ov.style.display='flex';
}
function profielKnop(){
  const P=PF(); if(!P) return '';
  // voor() en niet zoek(): een hybride ziet "Energie" waar een benzine "Motor" ziet (#435).
  const m=leesMotor(), nu=profielNu(), z=P.voor(nu, m), vlg=P.voor(P.volgende(nu), m);
  return '<div class="vis-profiel" role="group" aria-label="Weergave">'+
    '<span class="vis-profiel-stip" aria-hidden="true">'+P.PROFIELEN.map(function(x){ return '<i'+(x.id===nu?' class="aan"':'')+'></i>'; }).join('')+'</span>'+
    '<span class="vis-profiel-naam"><b>'+esc(z.naam)+'</b><small>'+esc(z.ondertitel)+'</small></span>'+
    '<button type="button" class="vis-profiel-volgende" onclick="PLVisueel.volgende()" title="Volgende weergave: '+esc(vlg.naam)+'">Volgende <span aria-hidden="true">›</span></button></div>';
}
function volgende(){
  const P=PF(); if(!P) return;
  _staat.profiel=P.volgende(profielNu());
  P.bewaar(_staat.profiel);
  const g=el('gGrid');
  if(g && typeof pidViewMode!=='undefined' && pidViewMode==='visueel') bouw(g, 'profiel');
}

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
/* De onderboog: olie, anders laaddruk (alleen met bewezen turbo), anders
   niets. Het gaspedaal stond hier tot 30-09-2026 als laatste terugval; het
   heeft nu een eigen rij onder de snelheid (#371). Olie valt nooit af: die
   is van nature traag en beweegt ook zo. */
function kiesOnder(){
  if(bruikbaar('015C')) return { soort:'olie', pid:'015C' };
  if(turboBewezen() && bruikbaar('010B') && !_staat.traag.has('010B')) return { soort:'laaddruk', pid:'010B' };
  return null;
}
/* Het pedaal voor zijn rij: de eerste uit de keten die er is en op deze auto
   niet te traag bleek. Een balkje dat eens per seconde verspringt leest als
   een haperend pedaal, dus dan liever de volgende sensor. */
function kiesPedaal(){
  for(let i=0;i<PEDAAL_KETEN.length;i++){
    const p=PEDAAL_KETEN[i];
    if(bruikbaar(p) && !_staat.traag.has(p)) return p;
  }
  return null;
}

// Mediaan van de tijd tussen twee metingen, alleen over metingen van ná het
// openen plus de aanloop. null = nog te weinig om iets te zeggen.
function gemetenTempo(pid, vanafMin){
  const h=(typeof pidHist!=='undefined' && pidHist) ? pidHist[pid] : null;
  if(!h || !h.length) return null;
  const vanaf=Math.max(_staat.start+VIS_AANLOOP_MS, vanafMin||0);
  const t=[];
  for(let i=0;i<h.length;i++){ if(h[i] && typeof h[i].t==='number' && h[i].t>=vanaf) t.push(h[i].t); }
  if(t.length<VIS_MIN_N) return null;
  const d=[];
  for(let i=1;i<t.length;i++) d.push(t[i]-t[i-1]);
  d.sort(function(a,b){ return a-b; });
  const m=d.length>>1;
  return d.length%2 ? d[m] : (d[m-1]+d[m])/2;
}
function rijdtNu(){
  const kmh=(typeof pidVals!=='undefined' && pidVals) ? pidVals['010D'] : undefined;
  return typeof kmh==='number' && kmh>=VIS_RIJDT_KMH;
}
/* Staat de meter in beeld? Niet op de achtergrond en niet in beeld-in-beeld:
   de meetdienst houdt dan de JavaScript wakker, dus er valt geen gat tussen
   twee tikken, maar de pollus vraagt minder en niemand kijkt naar de meter. */
function inBeeld(){
  try{
    if(typeof document==='undefined' || !document) return true;
    if(document.hidden) return false;
    return !(document.body && document.body.classList && document.body.classList.contains('pl-pip'));
  }catch(e){ console.warn('PLVisueel: zichtbaarheid onleesbaar — het tempo telt gewoon door', e); return true; }
}
/* Sinds wanneer telt het tempo (#338)? Opnieuw vanaf nu bij stilstand, na een
   gat tussen twee tikken (de app stond op de achtergrond of het scherm was
   uit: dan vriezen de timers en lijkt elke PID traag), en als een andere
   lezer de bus had (groepsproef, waakronde, Check mijn auto). */
function rijVenster(nu){
  let pauze=0;
  try{ pauze=(window.PLBus && typeof window.PLBus.pausedTotal==='function') ? window.PLBus.pausedTotal() : 0; }
  catch(e){ console.warn('PLVisueel: PLBus.pausedTotal onleesbaar — het rijvenster begint niet opnieuw na een buspauze', e); }
  const gat=_staat.laatsteTik>0 && nu-_staat.laatsteTik>3*VIS_TIK_MS;
  const bus=_staat.pauze!==null && pauze!==_staat.pauze;
  if(!rijdtNu() || !inBeeld()) _staat.rijdtSinds=0;
  else if(!_staat.rijdtSinds || gat || bus) _staat.rijdtSinds=nu;
  _staat.laatsteTik=nu; _staat.pauze=pauze;
}
function beoordeelTempo(pid){
  if(!pid || pid==='015C' || _staat.traag.has(pid)) return;
  if(!rijdtNu() || !inBeeld()) return;
  const t=gemetenTempo(pid, Math.max(_staat.rijdtSinds||0, Date.now()-VIS_VENSTER_MS));
  if(t!==null && t>VIS_TRAAG_MS) _staat.traag.add(pid);
}

/* De motorsoort uit de kentekendata. Onbekend is benzine: dat is de plaat
   die er stond voordat een diesel een eigen schaal kreeg. */
function leesMotor(){
  try{ return (typeof detectEngineType==='function') ? (detectEngineType() || 'benzine') : 'benzine'; }
  catch(e){ console.warn('PLVisueel: detectEngineType() mislukt', e); return 'benzine'; }
}
/* {max, rood} van de toerenschaal. rood is waar het oranje begint: bij een
   diesel vast, anders de waarschuwingsgrens van 010C. */
function schaalVoor(motor, wH){
  const s=(motor==='diesel') ? SCHAAL.diesel : SCHAAL.benzine;
  const rood=(s.rood!==null) ? s.rood : ((typeof wH==='number' && wH>0) ? wH : null);
  return { max:s.max, rood:(rood!==null && rood<s.max) ? rood : null };
}
/* De vraag voor de vermogensnaald: de eerste uit VRAAG_KETEN die er is en
   niet te traag bleek — dezelfde regel als kiesPedaal(). */
function kiesVraag(){
  for(let i=0;i<VRAAG_KETEN.length;i++){
    const p=VRAAG_KETEN[i];
    if(bruikbaar(p) && !_staat.traag.has(p)) return p;
  }
  return null;
}
function indeling(){
  const d10=defVan('010C'), motor=leesMotor();
  const toeren=bruikbaar('010C')?'010C':null, vraag=kiesVraag(), res=leesAandrijving();
  const soort=naaldSoort(motor, !!(res && res.bewijstHybride), !!toeren, !!vraag);
  const ind={ naald: soort==='vermogen' ? vraag : soort==='toeren' ? toeren : null, naaldSoort:soort, toeren:toeren,
              midden:bruikbaar('010D')?'010D':null,
              onder:kiesOnder(), plekken:{}, motor:motor,
              lamp:{ belasting:bruikbaar('0104')?'0104':null, accu:bruikbaar('015B')?'015B':null, volt:bruikbaar(ACCU_PID)?ACCU_PID:null },
              schaal:schaalVoor(motor, d10 && d10.wH) };
  PLEKKEN.forEach(function(r){ ind.plekken[r.rol]=(r.rol==='pedaal') ? kiesPedaal() : eerste(r.keten); });
  ind.trek = trekAan() ? trekIndeling(bruikbaar, turboBewezen()) : null;
  const pr=profielNu();
  ind.profiel = (pr!=='basis' && PF()) ? PF().indeling(pr, bruikbaar, motor, profielOpts()) : null;
  return ind;
}
function gebruiktePids(ind){
  const s=new Set();
  if(!ind) return s;
  if(ind.naald) s.add(ind.naald);
  if(ind.toeren) s.add(ind.toeren);
  if(ind.midden) s.add(ind.midden);
  if(ind.onder){ s.add(ind.onder.pid); if(ind.onder.soort==='laaddruk') s.add('0133'); }
  if(ind.lamp){ if(ind.lamp.belasting) s.add(ind.lamp.belasting); if(ind.lamp.accu) s.add(ind.lamp.accu); if(ind.lamp.volt) s.add(ind.lamp.volt); }
  Object.keys(ind.plekken).forEach(function(k){ if(ind.plekken[k]) s.add(ind.plekken[k]); });
  if(ind.trek) ind.trek.forEach(function(t){ if(t.pid) s.add(t.pid); });
  if(ind.profiel && PF()) PF().pids(ind.profiel).forEach(function(p){ s.add(p); });
  return s;
}
function handtekening(ind){
  return [ind.naaldSoort||'', ind.naald, ind.midden, ind.onder?ind.onder.soort+ind.onder.pid:'', ind.schaal?ind.schaal.max:'',
          ind.lamp?(ind.lamp.belasting||'')+(ind.lamp.accu||'')+(ind.lamp.volt||''):'',
          PLEKKEN.map(function(r){ return ind.plekken[r.rol]||''; }).join(','),
          ind.trek ? 'trek:'+ind.trek.map(function(t){ return t.pid||'-'; }).join(',') : '',
          ind.profiel ? 'profiel:'+ind.profiel.id+':'+(ind.profiel.motor||'')+':'+Object.keys(ind.profiel.plekken).map(function(k){ return ind.profiel.plekken[k]||'-'; }).join(',') : ''].join('|');
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
// Dezelfde regel als Overzicht: plOud() in pidlane-plload.js. Een trage PID
// die nog niet aan de beurt was is niet oud (07-10-2026).
function isOud(pid, nu){ return plOud(pid, nu); }

// ── HET MELDINGENVAK ──────────────────────────────────────────────
// Onder de meter: wat er op de achtergrond loopt, en anders snelkoppelingen
// om het te starten. Het vak BEWAART NIETS. De staat komt uit PLRun.staat()
// — dezelfde lezers als de chip in de topbalk — en de bevindingen uit de
// correlatie-engine. Een eigen meldingenlijst hier zou een tweede lijst zijn
// die uit de pas gaat lopen, en dat is de vorm die PIDLANE-WERK.md en het
// oude §11 de kop kostte.
//
// WAT ER LOOPT STAAT OP ÉÉN RAIL (25-09-2026). Tot deze datum kreeg elke
// lopende module een eigen kaart, en daarnaast hing de rit-monitor als
// zwevend schildje en de bulk-recorder als zwevende pil rechtsonder, en de
// waakronde als strook boven de meter. Vier plekken voor drie dingen, en de
// zwevende pillen vielen over de kaarten heen. Nu: één chip per lopende
// module, met het getal dat die pil liet zien (meldingen, opnametijd en
// regels, ronde). Zolang deze weergave in beeld is verbergt pidlane.css de
// pillen en de strook (body.pl-visueel); elders blijven ze gewoon.
//
// Aandacht krijgt een kaart, lopen niet. Een bevinding is iets om te lezen;
// "de recorder loopt" is een lampje. Daarom staan alleen de bevindingen nog
// als kaart onder de rail.
//
// Rit-monitor, caravanrit, bulk-recorder en rit-analyse zijn één soort: je
// start er één vanuit dit vak. Loopt er een, dan verdwijnen de snelkoppelingen
// naar de andere. Lopen er toch twee (aangezet via het run-paneel), dan staan
// ze allebei op de rail: wat loopt verzwijgen is erger dan een volle rail.
// De bulk-recorder is alleen voor beheerders (magIk() in pidlane-bulk.js);
// een snelkoppeling die bij iemand anders alleen "Alleen voor admin" zegt,
// hoort er niet te staan.
const HOOFD = [
  { id:'monitor', naam:'Rit-monitor',   kort:'Rit-monitor', icoon:'🔔', snel:true },
  { id:'caravan', naam:'Caravanrit',    kort:'Caravanrit',  icoon:'🚐', snel:false },
  { id:'bulk',    naam:'Bulk-recorder', kort:'Recorder',    icoon:'⏺',  snel:true, admin:true },
  { id:'rit',     naam:'Rit-analyse',   kort:'Rit-analyse', icoon:'🎒', snel:false }
];
const BEV_IN_VAK = 2;           // zelfde grens als de bevindingenbalk (BEV_MAX)

function leesRun(){
  let run=null;
  try{ run=(window.PLRun && typeof window.PLRun.staat==='function') ? (window.PLRun.staat() || {}) : null; }
  catch(e){ console.warn('PLVisueel: PLRun.staat() mislukt', e); return null; }
  if(!run) return run;
  // Wat de rail meer zegt dan aan/uit: dezelfde getallen die de zwevende
  // pillen toonden, gelezen uit dezelfde bron op het moment van tekenen.
  try{
    if(run.monitor && run.monitor.aan && window.PLMon){
      const o=window.PLMon._order || [];
      run.monitor.tel=o.length;
      run.monitor.ernstig=(typeof _MON_ERNSTIG!=='undefined') && o.some(function(k){ return _MON_ERNSTIG.test(k); });
    }
  }catch(e){ console.warn('PLVisueel: rit-monitor onleesbaar', e); }
  try{
    if(run.bulk && run.bulk.aan && window.PLBulk){
      const b=window.PLBulk.status() || {};
      run.bulk.sinds=b.gestart; run.bulk.regels=b.regels; run.bulk.pauze=!!b.gepauzeerd;
    }
  }catch(e){ console.warn('PLVisueel: bulk-recorder onleesbaar', e); }
  try{
    if(run.waak && run.waak.aan && window.PLWaak){
      const l=window.PLWaak.lijst() || [];
      run.waak.totaal=l.length;
      run.waak.gelezen=l.filter(function(r){ return r.staat!=='leeg'; }).length;
      run.waak.let=l.filter(function(r){ return r.staat==='let'; }).length;
    }
  }catch(e){ console.warn('PLVisueel: waakronde onleesbaar', e); }
  return run;
}
function leesBevindingen(){
  try{
    if(!bevindingenAan()) return null;          // uitgezet in ☰: dan ook hier niet
    const alle=(typeof _bevToon!=='undefined' && _bevToon) ? _bevToon.slice() : [];
    // Weggeklikt (✕ of dubbeltik, pidlane-correlatie.js): niet in het vak.
    return (typeof bevindingZichtbaar==='function') ? bevindingZichtbaar(alle) : alle;
  }catch(e){ console.warn('PLVisueel: bevindingen onleesbaar', e); return null; }
}
function leesAdmin(){
  try{ return !!(typeof magOntwikkelen === 'function' ? magOntwikkelen() : isAdmin()); }catch(e){ console.warn('PLVisueel: magOntwikkelen() mislukt', e); return false; }
}
function duur(ms){
  const m=Math.max(0, Math.floor(ms/60000));
  return m<60 ? m+' min' : Math.floor(m/60)+' u '+String(m%60).padStart(2,'0');
}
/* Eén chip op de rail. De korte tekst verandert hoogstens eens per minuut
   of per ronde: een knop die elke seconde opnieuw getekend wordt slikt de
   tik die er net op viel. */
function chip(id, icoon, naam, r, nu){
  const c={ id:id, icoon:icoon, naam:naam, kort:r.detail||'', let:0, ernstig:false, opname:false };
  if(id==='monitor'){
    c.let=r.tel||0; c.ernstig=!!r.ernstig;
    c.kort=!r.draait ? 'wacht op verbinding' : (c.let ? c.let+' melding'+(c.let===1?'':'en') : 'kijkt mee');
  } else if(id==='bulk'){
    c.opname=!!r.draait && !r.pauze;
    if(r.pauze) c.kort='gepauzeerd';
    else if(typeof r.sinds==='number' && r.sinds>0) c.kort=duur((nu||Date.now())-r.sinds)+(typeof r.regels==='number'?' · '+r.regels+' r':'');
  } else if(id==='waak'){
    c.let=r.let||0;
    c.kort=c.let ? c.let+' let op' : (r.totaal ? (r.gelezen||0)+'/'+r.totaal : 'loopt rond');
  }
  return c;
}
/* Wat er in het vak hoort, als gegevens. Los van de HTML zodat
   test-visueel.js het kan toetsen zonder DOM. */
function meldingen(run, bev, admin, nu){
  const uit={ lopend:[], regels:[], snel:[] };
  if(!run) return uit;
  const hoofd=HOOFD.filter(function(h){ return run[h.id] && run[h.id].aan; });
  hoofd.forEach(function(h){ uit.lopend.push(chip(h.id, h.icoon, h.kort, run[h.id], nu)); });
  if(run.waak && run.waak.aan) uit.lopend.push(chip('waak', '👁', 'Waakronde', run.waak, nu));
  if(bev && bev.length){
    bev.slice(0, BEV_IN_VAK).forEach(function(b){ uit.regels.push({ soort:'bevinding', id:b.id, ernst:b.ernst, naam:b.naam, detail:b.uitleg||'' }); });
    if(bev.length>BEV_IN_VAK) uit.regels.push({ soort:'meer', naam:'nog '+(bev.length-BEV_IN_VAK)+' bevinding'+(bev.length-BEV_IN_VAK===1?'':'en') });
  }
  if(!hoofd.length) HOOFD.forEach(function(h){ if(h.snel && run[h.id] && (!h.admin || admin)) uit.snel.push({ id:h.id, icoon:h.icoon, naam:h.naam }); });
  if(run.waak && !run.waak.aan) uit.snel.push({ id:'waak', icoon:'👁', naam:'Waakronde' });
  return uit;
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function chipHtml(c){
  return '<button type="button" class="vis-chip'+(c.let?' let':'')+(c.ernstig?' ernstig':'')+(c.opname?' opname':'')+'"'+
         ' data-id="'+c.id+'" onclick="PLVisueel.open(\''+c.id+'\')" title="'+esc(c.naam)+' openen">'+
         '<span class="vis-chip-ic">'+c.icoon+'</span><b>'+esc(c.naam)+'</b>'+
         '<small data-kort>'+esc(c.kort)+'</small></button>';
}
function meldHtml(m){
  let h='';
  if(m.lopend.length) h+='<div class="vis-rail">'+m.lopend.map(chipHtml).join('')+'</div>';
  m.regels.forEach(function(r){
    if(r.soort==='bevinding'){
      // Eén tik opent alle bevindingen, twee tikken of het ✕ verbergen deze
      // (bevindingTik in pidlane-correlatie.js) — net als bij de tegels.
      const id=String(r.id||'').replace(/[^A-Za-z0-9_\-]/g,'');
      h+='<div class="vis-meld bev'+(r.ernst>=2?' ernstig':'')+'" role="button" tabindex="0" data-bev="'+id+'" onclick="bevindingTik(\''+id+'\')"'+
         ' title="Tik: alle bevindingen · dubbeltik: verbergen"><span class="vis-meld-ic">🔗</span>'+
         '<span class="vis-meld-tx"><b>'+esc(r.naam)+'</b><small>'+esc(r.detail)+'</small></span>'+
         '<button type="button" class="vis-meld-x" onclick="event.stopPropagation();bevindingVerberg(\''+id+'\')" aria-label="Verbergen" title="Verbergen — de AI krijgt hem nog mee">✕</button></div>';
    } else if(r.soort==='meer'){
      h+='<button type="button" class="vis-meld meer" onclick="openBevindingen()">'+esc(r.naam)+' — bekijk alles →</button>';
    }
  });
  if(m.snel.length){
    h+='<div class="vis-snelk">'+m.snel.map(function(s){
      return '<button type="button" class="pidview-btn" onclick="PLVisueel.schakel(\''+s.id+'\')">'+s.icoon+' '+esc(s.naam)+'</button>';
    }).join('')+'</div>';
  }
  return h;
}
/* Alleen de korte teksten veranderd? Dan alleen die bijwerken, zodat de
   knoppen blijven staan. Anders opnieuw tekenen. */
function meldBij(){
  const el=document.getElementById('visMeld'); if(!el) return;
  const m=meldingen(leesRun(), leesBevindingen(), leesAdmin(), Date.now());
  const sleutel=JSON.stringify([m.lopend.map(function(c){ return [c.id,c.let>0,c.ernstig,c.opname]; }), m.regels, m.snel]);
  if(sleutel!==_staat.meldSleutel){ el.innerHTML=meldHtml(m); _staat.meldSleutel=sleutel; return; }
  const kort=el.querySelectorAll('.vis-chip [data-kort]');
  m.lopend.forEach(function(c, i){ if(kort[i] && kort[i].textContent!==c.kort) kort[i].textContent=c.kort; });
}
// Via PLRun, zodat een snelkoppeling precies doet wat de schakelaar in het
// run-paneel doet — ook de weigering zonder verbinding.
function schakel(id){
  try{
    const fout=(window.PLRun && typeof window.PLRun.schakel==='function') ? window.PLRun.schakel(id) : 'PLRun ontbreekt';
    if(fout){ try{ showToast(fout); }catch(e){ console.warn('PLVisueel: '+fout, e); } }
  }catch(e){ console.warn('PLVisueel: schakelen van '+id+' mislukt', e); }
  _staat.meldSleutel=''; meldBij();
}
// Een chip op de rail opent het scherm van die module — hetzelfde als een tik
// op de zwevende pil die hij vervangt. Zonder eigen scherm: het run-paneel.
function open(id){
  try{
    if(id==='monitor' && typeof openMonitorView==='function') openMonitorView();
    else if(id==='bulk' && typeof openBulkRecorder==='function') openBulkRecorder();
    else if(id==='waak' && typeof openWaakvenster==='function') openWaakvenster();
    else if(window.PLRun && typeof window.PLRun.open==='function') window.PLRun.open();
  }catch(e){ console.warn('PLVisueel: openen van '+id+' mislukt', e); }
}

// ── DE LAMPJES BOVEN DE METER ─────────────────────────────────────
// Links op elf uur de verbrandingsmotor, rechts op één uur de accu. Het
// oordeel over de motor is van PLAandrijving (pidlane-aandrijving.js); hier
// staat alleen hoe het heet. Zolang deze weergave open staat verbergt
// pidlane.css de aandrijfbalk erboven: hetzelfde oordeel twee keer is één
// keer te veel.
//
// DE ACCU WERD EEN LAMPJE (#371, 30-09-2026). Hij stond als getal midden
// onderin, tussen koelwater en brandstof, en die rij was te vol. Nu staat hij
// rechtsboven en ziet hij eruit als het motorlampje: icoon, kop, waarde en
// een balkje. Op een gewone auto is dat één accu met de spanning (0142),
// gekleurd met plekOordeel() — dus ook oranje als een draaiende dynamo niet
// laadt. Op een hybride zijn het er twee: de aandrijfaccu met zijn
// laadpercentage (015B) en het 12V-net met zijn spanning, onder elkaar in
// hetzelfde lampje. Het hybride lampje dat hier tot deze datum stond ("Hybride
// actief", "elektrisch") zit daarin: de toestand bepaalt de kleur en de kop.
//
// Een hybride is het volgens de kentekendata, of omdat PLAandrijving het
// rijden-met-stille-motor al zag (bewijstHybride). Een benzineauto die
// stilstaat met de motor uit is start/stop, geen hybride.
const LAMP_MOTOR = {
  DRAAIT_STIL:    { soort:'aan',   kop:'Motor',      waarde:'aan',    icoon:'motor' },
  DRAAIT_RIJDT:   { soort:'aan',   kop:'Motor',      waarde:'aan',    icoon:'motor' },
  STARTSTOP:      { soort:'ss',    kop:'Start/stop', waarde:'actief', icoon:'startstop' },
  START:          { soort:'start', kop:'Motor',      waarde:'start…', icoon:'motor' },
  UIT_VOOR_START: { soort:'uit',   kop:'Motor',      waarde:'uit',    icoon:'motor' },
  ACCU_RIJDT:     { soort:'uit',   kop:'Motor',      waarde:'uit',    icoon:'motor' }
};
// Wat een brandend lampje erbij zegt (26-09-2026): links de motorbelasting
// (0104) zolang de motor draait. Zonder getal blijft de toestand staan
// ("aan", "actief"), met getal schuift de toestand naar de kop en krijgt het
// lampje een balkje.
function pct(v){ const n=Number(v); return (v===null || v===undefined || v==='' || !isFinite(n)) ? null : Math.max(0, Math.min(100, Math.round(n))); }
/* {motor, accu}: wat de twee lampjes zeggen, of null. `extra` = de getallen
   {belasting, accu (015B, %), volt (0142), voltOud, rpm}. Puur. */
function aandrijfLampjes(res, motor, extra){
  const uit={ motor:null, accu:null };
  extra=extra||{};
  const t=res && res.toestand && res.toestand!=='ONBEKEND' ? res.toestand : null;
  const draait=(t==='DRAAIT_STIL' || t==='DRAAIT_RIJDT');
  const m=t ? LAMP_MOTOR[t] : null;
  // Een volledig elektrische auto heeft geen verbrandingsmotor om te melden.
  if(m && motor!=='ev'){
    uit.motor={ soort:m.soort, kop:m.kop, waarde:m.waarde, icoon:m.icoon, twijfel:res.zekerheid==='laag', balk:null };
    const b=draait ? pct(extra.belasting) : null;
    if(b!==null){ uit.motor.kop='Motor aan'; uit.motor.waarde=b+'%'; uit.motor.balk=b; }
  }
  const vSt=plekOordeel('accu', extra.volt, null, extra.rpm);
  const volt=vSt==='geen' ? null : tekst('accu', extra.volt)+' V';
  if(motor==='hybride' || motor==='ev' || (res && res.bewijstHybride)){
    const hv=pct(extra.accu);
    uit.accu={ soort: t==='ACCU_RIJDT' ? 'ev' : draait ? 'hyb' : 'rust',
               kop:  t==='ACCU_RIJDT' ? 'Elektrisch' : draait ? 'Hybride actief' : 'Hybride accu',
               icoon:'accudubbel', dubbel:true, twijfel:false,
               hv: hv===null ? '—' : hv+'%', volt: volt || '—', ernst12: vSt, balk: hv };
  } else if(volt){
    // De accu hoort bij de auto, niet bij de motor: hij brandt ook zonder
    // oordeel van PLAandrijving, zolang er een spanning binnen is.
    uit.accu={ soort:'accu '+vSt+(extra.voltOud ? ' oud' : ''), kop:'Accu', waarde:volt, icoon:'accu', dubbel:false, twijfel:false,
               balk: Math.round(deel(extra.volt, ACCU_BALK_LO, ACCU_BALK_HI)) };
  }
  return uit;
}
function leesAandrijving(){
  try{ return (window.PLAandrijving && typeof window.PLAandrijving.laatste==='function') ? window.PLAandrijving.laatste() : null; }
  catch(e){ console.warn('PLVisueel: PLAandrijving.laatste() mislukt', e); return null; }
}
function lampHtml(l){
  const tx = l.dubbel
    // Twee regels en geen kop: dan is het even hoog als het motorlampje en
    // schuift de meter niet omlaag zodra de auto een hybride blijkt. De
    // toestand staat in de kleur (blauw actief, groen elektrisch) en de titel.
    ? '<span class="vis-lamp-tx vis-lamp-duo"><i>Aandrijf</i><b>'+esc(l.hv)+'</b>'+
        '<i>12 V</i><b class="'+(l.ernst12==='warn' || l.ernst12==='danger' ? l.ernst12 : '')+'">'+esc(l.volt)+'</b></span>'
    : '<span class="vis-lamp-tx"><small>'+esc(l.kop)+'</small><b>'+esc(l.waarde)+'</b></span>';
  return '<svg class="vis-lamp-ic" viewBox="0 0 24 24" aria-hidden="true">'+icoonHtml(l.icoon)+'</svg>'+tx+
         (l.balk!==null ? '<i class="vis-lamp-balk" style="width:'+l.balk+'%"></i>' : '');
}
/* Het getal bij een lampje: alleen een vers antwoord. Een oude belasting
   naast "Motor aan" leest als een meting van nu, en dat is hij niet. */
function lampGetal(pid){
  if(!pid || typeof pidVals==='undefined' || pidVals[pid]===undefined) return null;
  return isOud(pid) ? null : pidVals[pid];
}
/* De spanning bij het acculampje (06-10-2026). Die werd net als de belasting
   weggegooid zodra hij oud was, en dan verdween het hele lampje: 0142 wordt
   traag gevraagd, dus elke keer dat een antwoord iets later kwam dan drie
   keer het tempo, flitste de accu weg tot de volgende meting. Een accu
   verandert niet per seconde; het lampje blijft staan, dof als de waarde oud
   is. Pas na VIS_ACCU_VERGEET_MS zonder antwoord verdwijnt hij. Geeft
   {v, oud} of null. */
const VIS_ACCU_VERGEET_MS = 60000;
function accuGetal(pid, nu){
  if(!pid || typeof pidVals==='undefined' || pidVals[pid]===undefined) return null;
  const laatste=(typeof _pidLastUpd!=='undefined' && _pidLastUpd) ? (_pidLastUpd[pid]||0) : 0;
  if(laatste && (nu||Date.now())-laatste > VIS_ACCU_VERGEET_MS) return null;
  return { v:pidVals[pid], oud:isOud(pid, nu) };
}
/* Het bandenlampje: alleen als deze auto bandensensoren heeft (PLBanden),
   gekleurd met het oordeel over de vier banden. Erin het autootje van
   bovenaf met per wiel zijn eigen kleur (#371). Tikken opent het venster. */
function bandenBij(){
  const e=el('vis-banden'); if(!e) return;
  let l={ toon:false };
  try{ if(window.PLBanden) l=PLBanden.lamp(); }catch(x){ console.warn('PLVisueel: bandenlampje', x); }
  e.style.display=l.toon ? '' : 'none';
  if(!l.toon) return;
  const k='vis-lamp-banden '+(l.ernst||'geen');
  if(e.className!==k) e.className=k;
  if(l.titel && e.title!==l.titel) e.title=l.titel;
  const w=JSON.stringify(l.wielen||null);
  if(e._wielen!==w){
    try{ e.innerHTML=PLBanden.mini(l.wielen); e._wielen=w; }
    catch(x){ console.warn('PLVisueel: autootje van de banden niet te tekenen', x); }
  }
}
function lampjesBij(){
  const I=_staat.ind;
  const rpm=(I && I.toeren && typeof pidVals!=='undefined') ? lampGetal(I.toeren) : null;
  const vg=accuGetal(I && I.lamp.volt);
  const res=leesAandrijving(), L=aandrijfLampjes(res, I ? I.motor : leesMotor(),
    { belasting: lampGetal(I && I.lamp.belasting), accu: lampGetal(I && I.lamp.accu), volt: vg ? vg.v : null, voltOud: !!(vg && vg.oud), rpm: rpm });
  const sleutel=JSON.stringify(L);
  if(sleutel===_staat.lampSleutel) return;
  _staat.lampSleutel=sleutel;
  [['vis-lamp-motor', L.motor], ['vis-lamp-accu', L.accu]].forEach(function(x){
    const e=el(x[0]); if(!e) return;
    const l=x[1];
    e.className='vis-lamp'+(l ? ' '+l.soort+(l.twijfel?' twijfel':'') : ' leeg');
    e.innerHTML=l ? lampHtml(l) : '';
    e.title=!l ? '' : l.dubbel ? (l.kop+' — aandrijfaccu '+l.hv+', 12V-accu '+l.volt)
      : (l.kop+' '+l.waarde+(x[0]==='vis-lamp-motor' && res && res.waarom ? ' — '+res.waarom : ''));
  });
}

// ── HET SCHERM ────────────────────────────────────────────────────
function icoonHtml(naam){ return '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+((window.PL_ICOON||{})[naam]||'')+'</g>'; }
function el(id){ return document.getElementById(id); }
const ONDER_ICOON = { olie:'olie', laaddruk:'turbo' };

/* WAAROM ER OPNIEUW GEBOUWD WORDT (#338). De teller zei 15× in 39 minuten,
   maar een paar daarvan deed de testrun zelf (begeleide run, meetopdracht,
   sweep): zonder reden viel niet te zeggen wat een klant ziet knipperen.
     openen    de weergave ging open
     selectie  de sensorkeuze veranderde (een mens of de testrun koos)
     testrun   de testrun liep, met dezelfde keuze
     indeling  de tik zag een andere indeling (traag pedaal, turbo, trekmodus)
     profiel   de klant tikte op "Volgende" (een andere weergave, 02-10-2026)
     keuze     de klant koos zelf een sensor voor een plek (06-10-2026)
     scherm    niets van dat alles: een hertekening die niemand vroeg
   Alleen de laatste twee ziet een klant zonder dat hij er zelf om vroeg. */
const HERBOUW_KLANT = ['indeling', 'scherm'];
function selectieSleutel(){
  try{
    const a=(typeof activePIDs!=='undefined' && activePIDs) ? Array.from(activePIDs).sort().join(',') : '';
    const v=(typeof hiddenPIDs!=='undefined' && hiddenPIDs) ? Array.from(hiddenPIDs).sort().join(',') : '';
    return a+'|'+v;
  }catch(e){ console.warn('PLVisueel: selectie onleesbaar', e); return ''; }
}
function herbouwReden(gegeven){
  if(gegeven) return gegeven;
  if(!_staat.gebouwd) return 'openen';
  if(selectieSleutel()!==_staat.selectie) return 'selectie';
  try{ if(window.PLTestrunLive && typeof window.PLTestrunLive.bezig==='function' && window.PLTestrunLive.bezig()) return 'testrun'; }
  catch(e){ console.warn('PLVisueel: testrunstand onleesbaar', e); }
  return 'scherm';
}
function bouw(g, reden){
  const r=herbouwReden(reden);
  try{ zorgPids(); }catch(e){ console.warn('PLVisueel: sensoren aanzetten mislukt', e); }
  _sessie.herbouw=(_sessie.herbouw||0)+1;          // een herbouw is een zichtbare flits
  _sessie.herbouwReden[r]=(_sessie.herbouwReden[r]||0)+1;
  _staat.gebouwd=true; _staat.selectie=selectieSleutel();
  const ind=indeling();
  _staat.ind=ind; _staat.handtekening=handtekening(ind); _staat.gebruik=gebruiktePids(ind); _staat.meldSleutel=''; _staat.lampSleutel='';
  if(ind.profiel){
    // Een profiel: hetzelfde kader, een andere tekening in het vak.
    g.innerHTML='<div class="vis">'+profielKnop()+
      '<div class="vis-bak">'+
        '<div class="vis-lampen"><span class="vis-lamp leeg" id="vis-lamp-motor"></span>'+
          '<span class="vis-lamp leeg" id="vis-lamp-accu"></span></div>'+
        PF().html(ind.profiel.id, ind.profiel)+
      '</div>'+
      (ind.trek ? '<div class="vis-trek" id="visTrek" aria-label="Trekmodus: caravan of beladen"></div>' : '')+
      '<div class="vis-meldingen" id="visMeld"></div>'+
      '<button class="vis-voet" type="button" onclick="setPidView(\'slim\')">Overige sensoren staan in <b>Slim →</b></button></div>';
    _staat.gebruik.forEach(function(p){ if(typeof pidVals!=='undefined' && pidVals[p]!==undefined) bij(p, pidVals[p]); });
    meldBij(); lampjesBij(); trekBij();
    // Tik op een plek: zelf een sensor kiezen (06-10-2026). Eén luisteraar op
    // het vak; de plekken dragen hun rol in hun id (vpf-p-<rol>).
    const vak=g.querySelector('.vpf');
    if(vak && ind.profiel.id!=='telemetrie') vak.addEventListener('click', function(e){
      const t=e.target && e.target.closest ? e.target.closest('[id^="vpf-p-"]') : null;
      if(t) kiesPlek(t.id.slice(6));
    });
    return;
  }
  // Zonder naald gaat de meter tóch open (07-10-2026, #432). Tot dan stond
  // hier "Slim visueel heeft het toerental nodig" in plaats van de meter,
  // terwijl de regel bovenaan dit bestand zegt dat een ontbrekende PID een
  // lege plek is en niets anders. Een auto zonder 010C en zonder pedaal
  // krijgt een naald in rust; snelheid, rijen en lampjes werken gewoon.
  const dOlie=defVan('015C');
  g.innerHTML='<div class="vis">'+profielKnop()+
    '<div class="vis-bak">'+
      '<div class="vis-lampen"><span class="vis-lamp leeg" id="vis-lamp-motor"></span>'+
        '<span class="vis-lamp leeg" id="vis-lamp-accu"></span></div>'+
      '<svg class="vis-meter" viewBox="0 0 320 '+(ind.onder ? G.VB_H : G.VB_KORT)+'" role="img" aria-label="'+(ind.naaldSoort==='vermogen' ? 'Vermogen' : 'Toerental')+', snelheid, koelwater, gaspedaal en brandstof">'+
        wijzerplaat(ind.schaal.rood, dOlie && dOlie.wH, dOlie && dOlie.dH, ind.schaal.max, ind.naaldSoort)+'</svg>'+
      // Het bandenlampje rechtsonder, in de lege hoek naast de cirkel
      // (30-09-2026, uit het gebruik): bovenaan zat het tussen de lampjes.
      // Sinds #371 geen bandicoon maar het autootje uit het bandenvenster in
      // het klein: vier groene wielen als alles goed is. bandenBij() vult het.
      '<button type="button" class="vis-lamp-banden geen" id="vis-banden" style="display:none" onclick="PLBanden.open()" aria-label="Banden"></button>'+
    '</div>'+
    (ind.trek ? '<div class="vis-trek" id="visTrek" aria-label="Trekmodus: caravan of beladen"></div>' : '')+
    '<div class="vis-meldingen" id="visMeld"></div>'+
    '<button class="vis-voet" type="button" onclick="setPidView(\'slim\')">Overige sensoren staan in <b>Slim →</b></button></div>';
  // Onderboog: soort, icoon en titel.
  const og=el('visg-onder'), oi=el('vis-ondericoon');
  if(ind.onder){
    const o=ind.onder;
    if(og){ og.classList.add(o.soort);
            og.insertAdjacentHTML('afterbegin','<title>'+(o.soort==='laaddruk'
              ? '≈ Laaddruk: inlaatdruk (010B) min omgevingsdruk (0133, anders 101,3 kPa)'
              : esc(naamVan(o.pid))+' ('+o.pid+')')+'</title>'); }
    if(oi) oi.innerHTML=icoonHtml(ONDER_ICOON[o.soort]);
  } else if(og) og.classList.add('afwezig');
  // Rijen: icoon en titel; zonder PID blijft het een leeg balkje met een streepje.
  PLEKKEN.forEach(function(r){
    const i=el('visi-'+r.rol), p=el('visp-'+r.rol), pid=ind.plekken[r.rol];
    if(i) i.innerHTML=icoonHtml(pid==='0111' ? 'gasklep' : r.icoon);
    if(p) p.insertAdjacentHTML('afterbegin','<title>'+r.naam+(pid?' ('+pid+')':': niet geselecteerd of niet ondersteund')+'</title>');
  });
  // Wat er al binnen is meteen tonen: een herbouw midden in een rit hoort
  // niet eerst een lege meter te laten zien.
  _staat.gebruik.forEach(function(p){ if(typeof pidVals!=='undefined' && pidVals[p]!==undefined) bij(p, pidVals[p]); });
  meldBij(); lampjesBij(); trekBij(); gearBij(); bandenBij();
  // De banden gaan niet de pollus in (#396): één keer per verbinding vragen.
  try{ if(window.PLBanden && PLBanden.eenmaal) PLBanden.eenmaal(); }catch(e){ console.warn('PLVisueel: banden niet gevraagd', e); }
}

// ── DE WAARSCHUWINGSTOON ──────────────────────────────────────────
// Twee korte piepjes via WebAudio en een trilling. Geen geluidsbestand: niets
// om te laden, en het werkt ook zonder internet.
function piep(){
  try{
    const AC=window.AudioContext || window.webkitAudioContext;
    if(AC){
      const ctx=piep._ctx || (piep._ctx=new AC());
      [0, 0.32].forEach(function(t0){
        const o=ctx.createOscillator(), g=ctx.createGain();
        o.frequency.value=880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, ctx.currentTime+t0);
        g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime+t0+0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+t0+0.25);
        o.start(ctx.currentTime+t0); o.stop(ctx.currentTime+t0+0.27);
      });
    }
  }catch(e){ console.warn('PLVisueel: waarschuwingstoon niet af te spelen', e); }
  try{ if(navigator.vibrate) navigator.vibrate([200,120,200]); }catch(e){ console.warn('PLVisueel: trillen niet mogelijk', e); }
}
function koelAlarm(temp, trend, nu){
  if(nu-_laatsteAlarm<ALARM_MS) return false;
  _laatsteAlarm=nu; _sessie.alarmen++;
  piep();
  const t='🌡 Koelwater '+Math.round(temp)+' °C en stijgt '+String(trend).replace('.',',')+' °C/min — rustiger aan, en bij rood: stoppen';
  try{ showToast(t); }catch(e){ console.warn('PLVisueel: melding', e); }
  try{ log(t,'warn'); }catch(e){ console.warn('PLVisueel: logregel', e); }
  return true;
}

// ── SESSIEBEWIJS ──────────────────────────────────────────────────
function echtVerbonden(){
  try{ return (typeof connected!=='undefined' && connected) && !(typeof demoMode!=='undefined' && demoMode); }
  catch(e){ return false; }
}
function sessieTik(nu){
  const dt=_sessieT ? Math.min(3000, nu-_sessieT) : 0;
  _sessieT=nu;
  if(!_staat.aan || !echtVerbonden() || !(dt>0)) return;
  const S=_sessie, ind=_staat.ind;
  S.openMs+=dt;
  const kmh=(typeof pidVals!=='undefined') ? pidVals['010D'] : undefined;
  const rijdt=typeof kmh==='number' && kmh>=5;
  if(rijdt) S.rijdendMs+=dt;
  if(ind && ind.trek) S.trekMs+=dt;
  if(ind && ind.onder) S.onder[ind.onder.soort]=(S.onder[ind.onder.soort]||0)+dt;
  if(_staat.turboVast) S.turbo=true;
  _staat.traag.forEach(function(p){ if(S.traag.indexOf(p)<0) S.traag.push(p); });
  // Het gemeten tempo van wat er op de meter staat, alleen tijdens het rijden:
  // stilstaand vraagt de bus minder en zegt het tempo niets over de weg.
  if(rijdt && ind) gebruiktePids(ind).forEach(function(p){
    const t=gemetenTempo(p);
    if(t===null) return;
    const x=S.tempo[p]=S.tempo[p]||{ max:0, laatste:0, n:0 };
    x.max=Math.max(x.max, t); x.laatste=t; x.n++;
  });
  // Verbruik bij constant rijden (#294 vraag 3): dertig seconden binnen 4 km/u
  // en boven 50 km/u. Dat getal leg je naast de boordcomputer.
  if(typeof kmh==='number'){ _snelheden.push({ t:nu, v:kmh }); }
  _snelheden=_snelheden.filter(function(x){ return nu-x.t<=30000; });
  if(_snelheden.length>=10 && nu-_snelheden[0].t>=25000){
    const vs=_snelheden.map(function(x){ return x.v; });
    const mn=Math.min.apply(null,vs), mx=Math.max.apply(null,vs);
    if(mx-mn<=4 && mn>=50){
      let l100=null;
      try{
        if(window.PLBerekend) l100=window.PLBerekend.bereken('CA03',
          { '015E':pidVals['015E'], '0110':pidVals['0110'], '010D':kmh }, { diesel:leesMotor()==='diesel' });
      }catch(e){ console.warn('PLVisueel: verbruik bij constant rijden', e); }
      if(typeof l100==='number'){ S.constant.n++; S.constant.som+=l100; S.constant.kmhSom+=kmh; }
    }
  }
}
function sessie(){ return JSON.parse(JSON.stringify(_sessie)); }
/* Oordelen voor blok 5, puur. #294: minstens drie minuten rijdend in deze
   weergave; een pedaal of laaddruk die van de meter viel is de bevinding. */
const RIJ_MIN_MS = 180000, TREK_MIN_MS = 300000;
function ritOordeel(S){
  S=S||{};
  const min=function(ms){ return Math.round((ms||0)/60000); };
  if(!(S.rijdendMs>=RIJ_MIN_MS))
    return { staat:'LET OP', detail:'Slim visueel stond '+min(S.rijdendMs)+' min open tijdens het rijden; nodig: 3 min' };
  const viel=(S.traag||[]).filter(function(p){ return PEDAAL_KETEN.indexOf(p)>=0 || p==='010B'; });
  const tempo=Object.keys(S.tempo||{}).map(function(p){ return p+' '+Math.round(S.tempo[p].max)+' ms'; }).join(', ');
  const onder=Object.keys(S.onder||{}).sort(function(a,b){ return S.onder[b]-S.onder[a]; });
  const c=S.constant||{};
  const verbruik=c.n>=10 ? ' · ≈ '+(Math.round(c.som/c.n*10)/10).toString().replace('.',',')+' l/100 km bij constant '+Math.round(c.kmhSom/c.n)+' km/u — leg dit naast de boordcomputer'
    : ' · geen 30 s constant boven 50 km/u gereden, dus geen verbruik om te vergelijken';
  const kop=min(S.rijdendMs)+' min rijdend; traagste tempo op de meter: '+(tempo||'niets gemeten')+'; onderboog: '+(onder.join(' → ')||'geen')+'; turbo '+(S.turbo?'herkend':'niet herkend');
  if(viel.length) return { staat:'FOUT', detail:kop+' — van de meter gevallen (te traag): '+viel.join(', ')+verbruik };
  return { staat:'ok', detail:kop+verbruik };
}
/* Blok 5, 28-09-2026: knippert de meter? Elke keer dat een plek of de naald
   dof wordt (dof()) en elke herbouw (bouw()) is een zichtbare wisseling.
   Meer dan één keer dof per minuut, of meer herbouwen dan er redenen voor
   zijn (openen, turbo herkend, trekmodus aan/uit: ruim drie plus één per tien
   minuten), is knipperen. Puur. */
function rustOordeel(S){
  S=S||{};
  const min=(S.openMs||0)/60000;
  if(!(S.rijdendMs>=RIJ_MIN_MS))
    return { staat:'LET OP', detail:'Slim visueel stond '+Math.round((S.rijdendMs||0)/60000)+' min open tijdens het rijden; nodig: 3 min om knipperen te kunnen zien' };
  const perMin=Math.round((S.dof||0)/Math.max(min,1)*10)/10, herbouwMax=3+Math.floor(min/10);
  const klant=herbouwKlant(S), R=S.herbouwReden||{};
  const waarom=Object.keys(R).sort().map(function(k){ return k+' '+R[k]; }).join(', ');
  const d=(S.dof||0)+'× dof in '+Math.round(min)+' min ('+String(perMin).replace('.',',')+' per minuut), '+(S.herbouw||0)+'× opnieuw opgebouwd'+
    (!waarom ? '' : ' ('+waarom+'), waarvan '+klant+' zonder vraag');
  if(perMin>1 || klant>herbouwMax) return { staat:'FOUT', detail:'de meter knippert: '+d+' (grens: 1 per minuut, '+herbouwMax+' herbouwen)' };
  return { staat:'ok', detail:d };
}
/* Herbouwen die een klant ziet zonder dat hij erom vroeg (#338). Een sessie
   van vóór de redenen (geen herbouwReden) telt alles: dan is niet te zeggen
   welke van hemzelf waren. */
function herbouwKlant(S){
  S=S||{};
  const R=S.herbouwReden;
  if(!R || !Object.keys(R).length) return S.herbouw||0;
  return HERBOUW_KLANT.reduce(function(a,k){ return a+(R[k]||0); }, 0);
}
/* De app-maten voor PLOpdracht (#338). Opdracht 20 vroeg "bleef het pedaal
   op de meter?" en kreeg "ja" op een rit zonder de trigger van 28-09: een
   antwoord, geen meting. Onder drie minuten rijdend is er niets gemeten
   (null), zoals ritOordeel() ook LET OP zegt. */
function maat(naam){
  const S=_sessie;
  const genoeg=S.rijdendMs>=RIJ_MIN_MS;
  switch(naam){
    case 'visueel-rijdend-min': return Math.round((S.rijdendMs||0)/60000);
    case 'visueel-van-meter':
      return genoeg ? (S.traag||[]).filter(function(p){ return PEDAAL_KETEN.indexOf(p)>=0 || p==='010B'; }).length : null;
    case 'visueel-herbouw-klant': return genoeg ? herbouwKlant(S) : null;
    default: return null;
  }
}
function trekOordeel(S){
  S=S||{};
  if(!(S.trekMs>=TREK_MIN_MS))
    return { staat:'LET OP', detail:'de trekmodus stond '+Math.round((S.trekMs||0)/60000)+' min aan met een verbonden auto; nodig: 5 min (Caravanrit, of rijsituatie caravan of beladen)' };
  return { staat:'ok', detail:Math.round(S.trekMs/60000)+' min trekmodus; hoogste koelwatertrend '+(S.maxTrend===null?'niet gemeten':String(S.maxTrend).replace('.',',')+' °C/min')+
    '; '+(S.alarmen||0)+' waarschuwing'+(S.alarmen===1?'':'en') };
}

// ── DE TREKSTROOK ─────────────────────────────────────────────────
function trekTekst(t, v){
  const n=Number(v);
  if(v===null || v===undefined || v==='' || !isFinite(n)) return '—';
  if(t.rol==='verbruik') return n.toFixed(1).replace('.',',');
  if(t.rol==='laaddruk') return (n>0.04?'+':'')+n.toFixed(2).replace('.',',');
  return String(Math.round(n));
}
function trekBij(){
  const ind=_staat.ind, e=el('visTrek');
  if(!ind || !ind.trek || !e) return;
  const nu=Date.now();
  const h=ind.trek.map(function(t){
    let waarde='—', eenheid=t.eenheid||'', st='geen', sub='';
    if(t.pid){
      const v=(typeof pidVals!=='undefined') ? pidVals[t.pid] : undefined;
      if(v!==undefined && !isOud(t.pid, nu)){
        waarde=trekTekst(t, v); st=oordeel(t.pid, v);
        if(t.rol==='verbruik') eenheid=(t.pid==='CA03')?'l/100':'l/u';
      }
      if(t.trend){
        const tr=koelTrend((typeof pidHist!=='undefined' && pidHist) ? pidHist[t.pid] : null, nu);
        if(tr!==null){
          sub=(tr>0.2?'↑ ':tr<-0.2?'↓ ':'→ ')+String(Math.abs(tr)).replace('.',',')+' °C/min';
          const koel=Number(v);
          if(echtVerbonden() && (_sessie.maxTrend===null || tr>_sessie.maxTrend)) _sessie.maxTrend=tr;
          if(tr>=KOEL_TREND_WARN && isFinite(koel) && koel>=KOEL_WARM){
            if(st==='ok') st='warn';
            if(st==='warn' || st==='danger') koelAlarm(koel, tr, nu);
          }
        }
      }
    } else sub='niet beschikbaar';
    return '<div class="vis-tt '+st+'"><small>'+esc(t.naam)+'</small><b>'+esc(waarde)+(waarde!=='—' && eenheid?'<i>'+esc(eenheid)+'</i>':'')+'</b>'+
      (sub?'<span>'+esc(sub)+'</span>':'')+'</div>';
  }).join('');
  if(e._sleutel!==h){ e.innerHTML=h; e._sleutel=h; }
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
  if(ind.profiel && PF()){
    try{ PF().bij(ind.profiel.id, ind.profiel, pid, val, oordeel(pid, val)); }
    catch(e){ console.warn('PLVisueel: profiel '+ind.profiel.id+' bijwerken mislukt', e); }
    const pl=ind.profiel.plekken;
    if(pl && 'energie' in pl && (pid===pl.energie || pid===(pl.snel||'010D'))) energieProfielBij();
  }
  if(ind.naaldSoort==='vermogen' && (pid===ind.naald || pid===ind.midden)){
    vermogenBij(pid===ind.naald ? val : (typeof pidVals!=='undefined' ? pidVals[ind.naald] : null));
  } else if(pid===ind.naald){
    const max=ind.schaal.max, s=stand('toeren', val, max), st=oordeel(pid, val);
    const n=el('vis-naald'); if(n) n.style.transform='rotate('+s.hoek.toFixed(2)+'deg)';
    zetDash('vis-toerenboog', s.deel);
    klasse(el('visg-naald'), st); klasse(el('vis-toerenboog'), st);
    const pk=el('vis-piek');
    if(pk){
      let p=null;
      try{ p=slimPiek(pid); }catch(e){ console.warn('PLVisueel: slimPiek mislukt', e); }
      const pd=(p===null)?null:stand('toeren',p,max);
      // Zelfde regel als de tellerplaat: alleen als hij merkbaar boven de
      // naald ligt, anders leest hij als een tweede, tegenstrijdige waarde.
      if(!pd || pd.leeg || pd.deel-s.deel<1.5) pk.style.display='none';
      else { pk.style.display=''; pk.style.transform='rotate('+pd.hoek.toFixed(2)+'deg)'; }
    }
    if(!s.leeg) vers('visg-naald');
    // Het toerental beslist mee over de accu: laadt een draaiende dynamo?
    if(ind.lamp.volt) lampjesBij();
  }
  if(pid===ind.midden){ zetTekst('vis-snel', tekst('snel', val)); gearBij(); }
  if(ind.onder && (pid===ind.onder.pid || (ind.onder.soort==='laaddruk' && pid==='0133'))) onderBij();
  PLEKKEN.forEach(function(r){ if(ind.plekken[r.rol]===pid) plekBij(r.rol, val); });
  if(pid===ind.lamp.belasting || pid===ind.lamp.accu || pid===ind.lamp.volt) lampjesBij();
}
/* De energiering van de hybride-weergave (#435): dezelfde rekensom als de
   vermogensnaald, dezelfde geleerde rust, een andere tekening. */
function energieProfielBij(){
  const ind=_staat.ind, pr=ind && ind.profiel;
  if(!pr || !pr.plekken || !('energie' in pr.plekken) || !PF() || typeof PF().energie!=='function') return;
  const ep=pr.plekken.energie, sp=pr.plekken.snel || '010D';
  const vraag=(ep && typeof pidVals!=='undefined') ? vraagUit(pidVals[ep], _staat.vraagLeer) : null;
  let laad=null;
  try{ laad=(typeof pidHist!=='undefined') ? laadUit(pidHist[sp], Date.now()) : null; }
  catch(e){ console.warn('PLVisueel: laadzone voor de energiering mislukt', e); }
  const nu=Date.now(), res=leesAandrijving();
  let versn=null;
  try{ versn=(typeof pidHist!=='undefined') ? versnellingUit(pidHist[sp], nu) : null; }
  catch(e){ console.warn('PLVisueel: versnelling uit de snelheid mislukt', e); }
  const pv=(typeof pidVals!=='undefined') ? pidVals : {};
  const soc=(typeof pv['015B']==='number') ? pv['015B'] : null;
  const extra={ aandeel:aandeelUit(_staat.aandeel), versnelling:versn,
                bereik:bereikUit(pv['CA09'], elektrischBereik(_staat.accuLeer, soc)) };
  try{ PF().energie(pr.id, pr, vermogenStand(vraag, laad), res, extra); }
  catch(e){ console.warn('PLVisueel: energiering bijwerken mislukt', e); }
}
/* De vermogensnaald bijwerken: bij een nieuwe pedaalwaarde én bij een nieuwe
   snelheid, want de laadzone komt uit de snelheid. Geen sleepwijzer: een
   piek in de vraag zegt achteraf niets. */
function vermogenBij(pedaal){
  const ind=_staat.ind; if(!ind) return;
  const vraag=vraagUit(pedaal, _staat.vraagLeer);
  let laad=null;
  try{ laad=(typeof pidHist!=='undefined' && ind.midden) ? laadUit(pidHist[ind.midden], Date.now()) : null; }
  catch(e){ console.warn('PLVisueel: laadzone uit de snelheid mislukt', e); }
  const s=vermogenStand(vraag, laad);
  const n=el('vis-naald'); if(n) n.style.transform='rotate('+s.hoek.toFixed(2)+'deg)';
  zetDash('vis-vraagboog', s.vraag); zetDash('vis-laadboog', s.laad);
  const g=el('visg-naald'); klasse(g, s.leeg ? 'geen' : 'ok');
  if(g) g.classList.toggle('laden', s.laden);
  const pk=el('vis-piek'); if(pk) pk.style.display='none';
  if(!s.leeg) vers('visg-naald');
}
function plekBij(rol, val){
  const ind=_staat.ind; if(!ind) return;
  const pid=ind.plekken[rol];
  const st=plekOordeel(rol, val, defVan(pid));
  zetTekst('visv-'+rol, st==='geen' ? '—' : tekst(rol, val)+(rol==='koel'?'°':'%'));
  const p=el('visp-'+rol); klasse(p, st); if(p) p.classList.remove('oud');
  const d=st==='geen' ? null : staafDeel(rol, val);
  zetDash('viss-'+rol, d===null ? 0 : d);
}

// De tik: tempo beoordelen, ouderdom tonen, meldingen bijwerken, en herbouwen
// als de indeling werkelijk veranderde. Dat laatste gebeurt zelden en maar
// één kant op: een PID die te traag bleek of een turbo die bewezen werd.
// Dof zetten, en tellen hoe vaak dat gebeurt: voor het sessiebewijs van
// "de meter knippert niet" (28-09-2026).
function dof(e, oud){
  if(oud && !e.classList.contains('oud')) _sessie.dof=(_sessie.dof||0)+1;
  e.classList.toggle('oud', oud);
}
function tik(){
  try{ sessieTik(Date.now()); }catch(e){ console.warn('PLVisueel: sessiebewijs', e); }
  if(!_staat.aan) return;
  rijVenster(Date.now());
  const ind=_staat.ind;
  if(ind && ind.onder) beoordeelTempo(ind.onder.pid);
  if(ind && ind.plekken.pedaal) beoordeelTempo(ind.plekken.pedaal);
  if(ind && ind.naaldSoort==='vermogen' && ind.naald) beoordeelTempo(ind.naald);
  const nieuw=indeling();
  _staat.gebruik=gebruiktePids(nieuw);
  if(handtekening(nieuw)!==_staat.handtekening){
    const g=el('gGrid');
    if(g && typeof pidViewMode!=='undefined' && pidViewMode==='visueel'){ bouw(g, 'indeling'); return; }
  }
  const nu=Date.now(), I=_staat.ind; if(!I) return;
  [['visg-naald',I.naald],['visg-onder',I.onder&&I.onder.pid]].forEach(function(x){
    const e=el(x[0]); if(e && x[1]) dof(e, isOud(x[1], nu));
  });
  PLEKKEN.forEach(function(r){ const p=el('visp-'+r.rol), pid=I.plekken[r.rol]; if(p && pid) dof(p, isOud(pid, nu)); });
  if(I.profiel && PF()){ try{ PF().dof(I.profiel.id, I.profiel, function(p){ return isOud(p, nu); }); }catch(e){ console.warn('PLVisueel: profiel dof zetten', e); } }
  // De toestand in het midden verandert ook zonder nieuwe pedaalwaarde. De
  // tellers van de tegels lopen hier, één keer per seconde, en niet in bij():
  // die komt tientallen keren per seconde en zou de rijtijd scheef tellen.
  if(I.profiel && I.profiel.plekken && 'energie' in I.profiel.plekken){
    const res=leesAandrijving(), t=res && res.toestand, pv=(typeof pidVals!=='undefined') ? pidVals : {};
    _staat.aandeel=aandeelBij(_staat.aandeel, t, nu);
    _staat.accuLeer=accuLeerBij(_staat.accuLeer, t, pv['015B'], pv['010D'], nu);
  }
  if(I.profiel) energieProfielBij();
  meldBij(); lampjesBij(); trekBij(); gearBij(); bandenBij();
}

// De bevindingenbalk bovenaan de live view verhuist naar het meldingenvak
// zolang deze weergave open staat; renderCorrelationBanner() kijkt daarvoor
// zelf naar pidViewMode. Na elke wissel één keer opnieuw tekenen, anders
// blijft de balk staan (of weg) tot de volgende nieuwe bevinding.
function balkBij(){
  try{ renderCorrelationBanner(typeof _bevToon!=='undefined' ? _bevToon : []); }
  catch(e){ console.warn('PLVisueel: bevindingenbalk bijwerken mislukt', e); }
}
// body.pl-visueel: zolang deze weergave in beeld is verbergt pidlane.css wat
// hier al op de rail of in de lampjes staat (de zwevende pillen van
// rit-monitor en recorder, de waakstrook, de aandrijfbalk).
function lichaam(aan){
  try{ if(typeof document!=='undefined' && document.body) document.body.classList.toggle('pl-visueel', aan); }
  catch(e){ console.warn('PLVisueel: body-klasse zetten mislukt', e); }
}
function start(){
  if(_staat.aan) return;
  lichaam(true);
  _staat.aan=true; _staat.start=Date.now(); _staat.traag=new Set(); _staat.handtekening=''; _staat.vraagLeer={ min:null, max:null }; _staat.aandeel=null; _staat.accuLeer=null;
  try{ _staat.profiel=PF() ? PF().lees(leesMotor()) : 'basis'; }catch(e){ console.warn('PLVisueel: profielkeuze onleesbaar', e); _staat.profiel='basis'; }
  _staat.rijdtSinds=0; _staat.laatsteTik=0; _staat.pauze=null; _staat.gebouwd=false;
  // Meteen de indeling kennen: remt() leest hem, en een lege set zou in de
  // eerste pollronde ook de PIDs remmen die er straks wél op staan.
  _staat.ind=indeling(); _staat.gebruik=gebruiktePids(_staat.ind);
  _staat.timer=setInterval(function(){ try{ tik(); }catch(e){ console.warn('PLVisueel: tik mislukt', e); } }, VIS_TIK_MS);
  balkBij();
}
function stop(){
  const was=_staat.aan;
  _staat.aan=false;
  lichaam(false);
  if(_staat.timer){ clearInterval(_staat.timer); _staat.timer=null; }
  _staat.ind=null; _staat.gebruik=new Set();
  if(was) balkBij();
}

window.PLVisueel = {
  G:G, REM_MS:VIS_REM_MS, TRAAG_MS:VIS_TRAAG_MS, MIN_N:VIS_MIN_N, AANLOOP_MS:VIS_AANLOOP_MS,
  PEDAAL_KETEN:PEDAAL_KETEN, PLEKKEN:PLEKKEN, HOOFD:HOOFD, SCHAAL:SCHAAL,
  schaalVoor:schaalVoor, aandrijfLampjes:aandrijfLampjes, accuGetal:accuGetal, VIS_ACCU_VERGEET_MS:VIS_ACCU_VERGEET_MS, open:open,
  stand:stand, tekst:tekst, laaddrukNu:laaddrukNu, plekOordeel:plekOordeel,
  VERMOGEN:VERMOGEN, VRAAG_KETEN:VRAAG_KETEN, naaldSoort:naaldSoort, vraagUit:vraagUit, laadUit:laadUit, vermogenStand:vermogenStand,
  versnellingUit:versnellingUit, aandeelBij:aandeelBij, aandeelUit:aandeelUit, accuLeerBij:accuLeerBij, elektrischBereik:elektrischBereik, bereikUit:bereikUit,
  wijzerplaat:wijzerplaat, boogPad:boogPad, hoekOnder:hoekOnder, hoekLaaddrukNul:hoekLaaddrukNul,
  indeling:indeling, gebruiktePids:gebruiktePids, gemetenTempo:gemetenTempo, beoordeelTempo:beoordeelTempo,
  meldingen:meldingen, schakel:schakel,
  TREK:TREK, TREK_SITUATIES:TREK_SITUATIES, trekIndeling:trekIndeling, koelTrend:koelTrend, trekAan:trekAan,
  nodigePids:nodigePids, zorgPids:zorgPids, bandenBij:bandenBij, staafDeel:staafDeel, gearTekst:gearTekst,
  sessie:sessie, ritOordeel:ritOordeel, trekOordeel:trekOordeel, rustOordeel:rustOordeel, herbouwKlant:herbouwKlant, maat:maat,
  rijVenster:rijVenster, VENSTER_MS:VIS_VENSTER_MS, koelAlarm:koelAlarm, ALARM_MS:ALARM_MS, _nieuweSessie:function(){ _sessie=leegSessie(); _laatsteAlarm=0; },
  remt:remt, isOud:isOud, bouw:bouw, bij:bij, tik:tik, start:start, stop:stop,
  volgende:volgende, profiel:profielNu, kiesPlek:kiesPlek, kandidaten:kandidaten, profielOpts:profielOpts,
  ververs:function(){ if(!_staat.aan) return; _staat.meldSleutel=''; meldBij(); },
  staat:function(){ return { aan:_staat.aan, start:_staat.start, traag:Array.from(_staat.traag),
                             turboVast:_staat.turboVast, gebruik:Array.from(_staat.gebruik), ind:_staat.ind, rijdtSinds:_staat.rijdtSinds }; }
};
})();
