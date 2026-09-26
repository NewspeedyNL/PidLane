/* pidlane-onderdeel.js — "Welk onderdeel is kapot?" (27-07-2026)
   ═══════════════════════════════════════════════════════════════════════
   Eén functie die maar naar twee dingen kijkt: de foutcodes en de live
   meetwaarden. Geen brede analyse, geen rapport over de hele auto — alleen
   de vraag: kan ik hier een ONDERDEEL aanwijzen?

   OPZET — bewijs, geen gok
   Elke kandidaat is een regel met voorwaarden. Een voorwaarde kan:
     bevestigen  (+gewicht)  de meting past bij dit defect
     tegenspreken(−gewicht)  de meting sluit dit defect juist uit
     onbekend    (0)         we hebben de data niet
   De score is de som. Er wordt NIETS getoond zonder de meetwaarde waar het
   op rust — je moet altijd zelf kunnen nazien waarom de app dit zegt.

   WAT DEZE FUNCTIE BEWUST NIET DOET
   Een deel van "ratelen" is via OBD principieel onzichtbaar: motorsteunen,
   hitteschilden, uitlaatbeugels, ophanging, aandrijfassen. Daar is geen
   sensor voor. De app zegt dat dan ook met zoveel woorden in plaats van
   iets aan te wijzen wat toevallig het hoogst scoort. Een onterechte
   verdenking kost meer dan geen verdenking.

   ── DE HERZIENING VAN 16-09-2026 ──────────────────────────────────────
   Uit het gebruik gemeld, met een schermafdruk erbij: "Sensor levert niets
   meer — STERKE AANWIJZING", en daaronder brandstofpeil (012F) en afstand
   met MIL aan (0121), allebei met "draadbreuk, stekker of sensor". Beide
   waren onzin, en allebei om hun eigen reden. Drie fouten zaten eronder:

   1. DE VASTE 8-SECONDENDREMPEL. `STIL_MS = 8000` gold voor élke sensor,
      terwijl de app zelf per PID een tempo kiest (`pidPollInterval`):
      koelwater elke 10 s, brandstofpeil en de MIL-tellers elke 60 s. Een
      sensor die keurig op zijn beurt wacht was hier dus per definitie
      "meer dan 8 seconden stil" — de hele TRAAG- en ZELDEN-klasse stond
      permanent als defect op het scherm. `pidlane-watchers.js` had precies
      deze fout al gehad en al opgelost (zie de kop van dat bestand, fase
      4); die oplossing stond alleen nooit hier. Nu leest deze module
      dezelfde cadans uit `PLSched` en dezelfde drempelregel uit
      `PLWatch.cfg` — één bron, geen tweede kopie van de getallen.

   2. STILTE IS GEEN UITVAL. Niet gevraagd worden ziet er precies zo uit
      als gevraagd worden en niets terugsturen. `PLSched` kent het verschil
      (`laatstePoging` tegenover `laatsteSucces`) en dat is het enige harde
      bewijs. Zonder dat register doet deze module geen uitspraak meer over
      uitval; dat is beter dan een gok die als "sterke aanwijzing" op het
      scherm komt.

   3. EEN TELLER IS GEEN SENSOR. "Afstand met MIL aan" (0121) is een
      kilometerstand die het stuurapparaat zelf bijhoudt. Daar zit geen
      draad, geen stekker en geen sensor aan, dus "draadbreuk, stekker of
      sensor" kán niet kloppen. `TELLER_PIDS` houdt die groep uit de
      verdenking.

   EN DE HELFT DIE ER NIET WAS. Deze module las de foutcodes uit
   `window._laatsteDTC` en `window.lastDTCs`. Geen van beide bestaat in
   deze app en heeft ooit bestaan — de lijst heet `dtcCodes` en staat in
   `pidlane-auth.js`. Élke DTC-voorwaarde hierboven gaf dus sinds 27-07
   `null` (= onbekend), en het paneel draaide al die tijd op alleen live
   meetwaarden. Dat verklaart ook waarom de kaarten die je wél zag altijd
   uit de sensorkant kwamen. Opgezocht via de echte bron, met `_didDTCScan`
   erbij zodat "nog niet uitgelezen" en "uitgelezen, geen codes" twee
   verschillende antwoorden zijn.

   DE MOTOR STOND STIL, EN DAT WIST NIEMAND. Zes voorwaarden rekenden aan
   een meting die alleen betekenis heeft bij een dráaiende motor. Met het
   contact aan en de motor uit leest de inlaatdruk de buitenluchtdruk
   (~101 kPa, dus "vacuümlek" én "EGR"), de luchtmassa 0 g/s (dus
   "draadbreuk"), en het koelwater staat koud (dus "thermostaat"). Dat is
   precies de stand waarin je foutcodes uitleest. Elke regel draagt nu zijn
   eigen voorwaarde over de motorstand, en een voorwaarde die zijn context
   niet kent geeft `null` in plaats van een oordeel.
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

function V(pid){ try{ var v=pidVals[pid]; return (typeof v==='number'&&!isNaN(v))?v:null; }catch(e){ return null; } }
/* Eerste PID uit de lijst die een getal heeft. Bewust niet met `||`: een
   geldige 0 zou daar doorvallen naar de volgende bron. */
function Veen(){
  for(var i=0;i<arguments.length;i++){ var v=V(arguments[i]); if(v!==null) return v; }
  return null;
}
function hist(pid){
  try{ var a=pidHist[pid]; return Array.isArray(a)?a:[]; }catch(e){ return []; }
}
/* ── AANHOUDEND, NIET ÉÉN METING ───────────────────────────────────────
   Een oordeel over één momentwaarde is hier drie keer misgegaan: de
   achterste lambdasonde die "schommelt" maar aan één meting werd afgelezen,
   de laadspanning die even inzakt als er een zware verbruiker bijkomt, en
   een railwaarde die net zo goed een misgelezen frame kan zijn (#210).

   Deze helper vraagt of een voorwaarde over een REEKS gold. Hij neemt
   zoveel laatste metingen dat ze samen minstens `msMin` overspannen, met
   `nMin` als ondergrens — cadans-onafhankelijk, want de ene sensor ververst
   elke 120 ms en de andere elke 30 s, en een vast tijdvenster maakt de
   tweede onmeetbaar (dat is dezelfde fout als de vaste 8-secondendrempel).

     null   te kort of te weinig gemeten → geen oordeel
     false  minstens één meting voldeed niet
     getal  alle metingen voldeden; het getal is er hoeveel */
function aanhoudend(pid, pred, msMin, nMin){
  var a=hist(pid).filter(function(p){ return p && typeof p.v==='number' && typeof p.t==='number'; });
  if(a.length<nMin) return null;
  var laatste=a[a.length-1], n=nMin;
  while(n<a.length && (laatste.t-a[a.length-n].t)<msMin) n++;
  var deel=a.slice(-n);
  if((laatste.t-deel[0].t)<msMin) return null;      // hele historie is korter dan msMin
  for(var i=0;i<deel.length;i++) if(!pred(deel[i].v)) return false;
  return deel.length;
}
/* Sprei over de laatste reeks: hoogste min laagste, of null als er te
   weinig gemeten is. */
function sprei(pid, msMin, nMin){
  var a=hist(pid).filter(function(p){ return p && typeof p.v==='number' && typeof p.t==='number'; });
  if(a.length<nMin) return null;
  var laatste=a[a.length-1], n=nMin;
  while(n<a.length && (laatste.t-a[a.length-n].t)<msMin) n++;
  var deel=a.slice(-n);
  if((laatste.t-deel[0].t)<msMin) return null;
  var lo=Infinity, hi=-Infinity;
  deel.forEach(function(p){ if(p.v<lo) lo=p.v; if(p.v>hi) hi=p.v; });
  return hi-lo;
}
/* aanhoudend() geeft null / false / een aantal. Een voorwaarde wil
   null / false / true, en "te weinig gemeten" mag daarbij nooit stilletjes
   "nee" worden — dat is het verschil tussen onbekend en tegenbewijs. */
function reeksOordeel(x){ return x===null?null:!!x; }

/* ── DE FOUTCODES ──────────────────────────────────────────────────────
   `dtcCodes` is een let op scriptniveau in pidlane-auth.js en hangt dus
   NIET aan window; hem via window opzoeken geeft undefined. Vandaar de
   typeof-guard op de kale naam. `_didDTCScan` hangt er wel aan.
   `gescand` is het verschil tussen "uitgelezen, niets gevonden" en "nog
   niet gekeken", en dat verschil is de helft van dit paneel waard. */
function dtcBron(){
  var codes=[], gescand=false;
  try{ if(typeof dtcCodes!=='undefined' && Array.isArray(dtcCodes)) codes=dtcCodes.slice(); }
  catch(e){ console.warn('Onderdeelcheck: foutcodelijst niet leesbaar', e); }
  try{ gescand=!!(typeof window!=='undefined' && window._didDTCScan); }catch(e){ gescand=false; }
  return { gescand:gescand, codes:codes.map(function(d){ return String((d&&d.code)||d).toUpperCase(); }) };
}
/* Een DTC-voorwaarde. Niet uitgelezen = onbekend (null), want dan wéét je
   niets. Uitgelezen en afwezig blijft óók onbekend en geen tegenbewijs:
   lang niet elk defect zet een code, en een live bevinding wegstrepen omdat
   de ECU zweeg zou de spiegelfout van hierboven zijn. */
function dtcProef(re){
  return function(){
    var b=dtcBron();
    if(!b.gescand || !b.codes.length) return null;
    return b.codes.some(function(c){ return re.test(c); });
  };
}

/* ── DE MOTORINHOUD (#232) ──────────────────────────────────────────────
   In liters, of null als hij niet bekend is. Uit het voertuigprofiel: eerst
   een cilinderinhoud in cc (RDW), anders het getal in de motornaam
   ("2.0 SkyActiv-G 165pk"). Een voorwaarde die hierop leunt zwijgt bij null. */
function motorLiters(){
  try{
    var v=(typeof getVehicle==='function')?getVehicle():null;
    if(!v) return null;
    var cc=parseInt(v.cilinderinhoud,10);
    if(!isNaN(cc)&&cc>=600&&cc<=8000) return cc/1000;
    var m=String(v.motor||'').match(/(^|[^\d.])(\d\.\d)(?![\d.])/);
    if(m){ var l=parseFloat(m[2]); if(l>=0.6&&l<=8) return l; }
  }catch(e){ console.warn('Onderdeelcheck: motorinhoud niet leesbaar (#232)', e); }
  return null;
}

/* ── DE MOTORSTAND ─────────────────────────────────────────────────────
   Bijna elke meting hieronder betekent iets anders bij een stilstaande
   motor. Eén keer bepalen, en elke voorwaarde krijgt hem mee. Een veld dat
   null is betekent "niet te zeggen" en niet "nee": een voorwaarde die er
   op steunt geeft dan zelf ook null terug. */
var DRAAIT_RPM = 400;      // onder dit toerental draait er niets meer
function context(){
  var rpm=V('010C'), ect=V('0105');
  return {
    rpm:rpm,
    draait: rpm===null?null:(rpm>=DRAAIT_RPM),
    ect:ect,
    warm: ect===null?null:(ect>=70),
    looptijd:V('011F'),                 // seconden sinds de motor startte
    snelheid:V('010D'),
    belasting:V('0104')
  };
}

/* ── SENSORUITVAL vs UITLEESFOUT ────────────────────────────────────────
   Een sensor die niets meer levert is een sterke aanwijzing — maar alleen
   als we zeker weten dat het aan de SENSOR ligt en niet aan het uitlezen.
   Vier dingen kunnen namelijk hetzelfde beeld geven:
     1. de auto ondersteunt dat PID helemaal niet   → geen defect
     2. de sensor was gewoon nog niet aan de beurt  → geen defect
     3. de bus hapert of de adapter mist antwoorden → geen defect
     4. de sensor of zijn bedrading is stuk         → wél een defect
   Punt 2 is de fout van 16-09 en de duurste van de vier, want die maakt
   elke trage sensor verdacht. De scheiding komt uit hetzelfde register dat
   pidlane-watchers.js gebruikt: PLSched weet wanneer een PID aan de beurt
   was, wanneer hij voor het laatst gevraagd is en wanneer hij voor het
   laatst antwoordde. Daarnaast telt de bushealth mee: bij verhoogde fout-
   of onvolledigheidspercentages doen we geen enkele uitspraak, want dan is
   het meetkanaal zelf onbetrouwbaar en zou elke conclusie een gok zijn. */
var STIL_MIN_MS = 8000;      // ondergrens; de echte drempel volgt de cadans
var STIL_FACTOR = 3;         // ... × het eigen pollinterval van die PID
/* Dezelfde twee getallen staan in PLWatch.cfg. Die is de bron zodra hij
   geladen is; de constanten hierboven zijn de terugval als deze module los
   draait (een test, een losse pagina). */
function cadansRegels(){
  try{
    var c=(typeof window!=='undefined' && window.PLWatch && window.PLWatch.cfg) ? window.PLWatch.cfg : null;
    if(c && typeof c.stilMinMs==='number' && typeof c.stilFactor==='number')
      return { min:c.stilMinMs, factor:c.stilFactor };
  }catch(e){ console.warn('Onderdeelcheck: PLWatch.cfg niet leesbaar', e); }
  return { min:STIL_MIN_MS, factor:STIL_FACTOR };
}
/* Tellers en statuswoorden. Het stuurapparaat rekent ze zelf uit; er zit
   geen draad, geen stekker en geen sensor aan. Ze mogen dus nooit als
   "kapot onderdeel" op het scherm komen — dat was 0121 in de melding van
   16-09. Ze blijven wél gewoon in de live view staan. */
var TELLER_PIDS = new Set([
  '0101','0102','0103','0112','011C','011E','011F','0121','012B','0130',
  '0131','0141','014D','014E','0151','015F','017D','017E','017F','0165',
  '0100','0120','0140','0160','0180','01A0','01C0'
]);
function busBetrouwbaar(){
  try{
    // Een diepe scan (PLKaart, veldlab) claimt de bus minutenlang. Dan is
    // élke sensor stil en klopt er niets van een uitvaloordeel — dezelfde
    // dip die #191 opleverde, maar dan als diagnose op het scherm.
    if(typeof window!=='undefined' && window._plScanActief)
      return {ok:false, reden:'er loopt nu een scan die de bus vasthoudt'};
    var s=PLBus.stats();
    if(s.foutPct>8) return {ok:false, reden:'de bus meldt '+s.foutPct+'% fouten'};
    if((s.onvolPct||0)>8) return {ok:false, reden:(s.onvolPct)+'% van de antwoorden was onvolledig'};
    if((s.totaal||0)<20)  return {ok:false, reden:'nog te weinig gemeten'};
    return {ok:true, reden:''};
  }catch(e){ return {ok:false, reden:'busstatistiek niet beschikbaar'}; }
}
/* Hoeveel van de stilte komt doordat een ANDERE lezer de bus vasthield
   (gezondheidscheck, rit-sweep, verificatie)? Die tijd telt niet mee als
   stilte van de sensor. Dezelfde correctie als de stale-watchdog in
   pidlane-pids.js. */
function busKrediet(pid){
  try{
    if(typeof _pidLastUpdPause==='undefined' || !_pidLastUpdPause) return 0;
    return Math.max(0, PLBus.pausedTotal()-(_pidLastUpdPause[pid]||0));
  }catch(e){ return 0; }
}
/* Geeft het beeld over alles wat we ACTIEF opvragen en waarvan de auto zegt
   dat hij het ondersteunt:
     stil    → gevraagd en niets terug, langer dan zijn eigen cadans toelaat
     levend  → binnen zijn cadans ververs
     wacht   → stil, maar nog niet gevraagd sinds het laatste antwoord
     tellers → stil, maar er is geen onderdeel om aan te wijzen
   register=false betekent: PLSched ontbreekt, dus cadans en poging zijn
   niet te scheiden. Dan zegt deze module hierover niets. */
function stilteBeeld(){
  var nu=Date.now(), uit={stil:[], levend:[], wacht:[], tellers:[], register:false};
  var S=null;
  try{ S=(typeof window!=='undefined')?window.PLSched:null; }catch(e){ S=null; }
  if(!S || typeof S.interval!=='function' || typeof S.laatstePoging!=='function') return uit;
  uit.register=true;
  var R=cadansRegels();
  try{
    var actief = (typeof activePIDs!=='undefined' && activePIDs) ? Array.from(activePIDs) : [];
    var scan   = (typeof supportedPIDs!=='undefined' && supportedPIDs && supportedPIDs.size) ? supportedPIDs : null;
    actief.forEach(function(pid){
      if(scan && !scan.has(pid)) return;                 // auto ondersteunt hem niet: geen defect
      var t = (typeof _pidLastUpd!=='undefined' && _pidLastUpd) ? _pidLastUpd[pid] : null;
      if(!t) return;                                     // nooit iets gehad: geen bewijs, geen uitspraak
      var iv=S.interval(pid);
      if(!(iv>0) || iv>=999999) return;                  // uitgezet (EV-filter): stilte is bedoeld
      var drempel=Math.max(R.min, iv*R.factor);
      var stilMs=nu-t-busKrediet(pid);
      if(stilMs<=drempel){ uit.levend.push(pid); return; }

      var gesnoeid=false;
      try{ gesnoeid=(typeof S.dood==='function') && S.dood(pid); }catch(e){ gesnoeid=false; }
      var pog=0, ok=0;
      try{ pog=S.laatstePoging(pid)||0; ok=S.laatsteSucces(pid)||0; }catch(e){ pog=0; ok=0; }
      // Gesnoeid = vijf keer gevraagd en vijf keer niets terug, en de snoei
      // gaat alleen door bij een gezonde bus. Dat is het hardste bewijs dat
      // er is; harder dan stilte.
      var gevraagd = gesnoeid || (pog>0 && (pog-ok)>drempel*0.5);
      if(!gevraagd){ uit.wacht.push(pid); return; }      // nog niet aan de beurt geweest
      if(TELLER_PIDS.has(pid)){ uit.tellers.push(pid); return; }
      uit.stil.push({pid:pid, stilMs:Math.round(stilMs), interval:iv, gesnoeid:gesnoeid});
    });
  }catch(e){ console.warn('Onderdeelcheck: stiltebeeld mislukt', e); }
  return uit;
}

/* Railwaarden: een sensor kan óók "dood" zijn terwijl hij wél een getal geeft.
   Bij een onderbroken of kortgesloten draad slaat de meting tegen de
   elektrische eindwaarde aan. Die waarden zijn per sensortype bekend.

   Twee dingen zijn er op 16-09 bij gekomen. `eis` zegt in welke motorstand
   de eindwaarde onmogelijk is — 0 g/s luchtmassa is bij een stilstaande
   motor namelijk het goede antwoord, en een gesloten gasklep leest op veel
   auto's gewoon 0%. En de treffer moet AANHOUDEN: één meting tegen de rand
   kan een misgelezen frame zijn (zie #210), drie achter elkaar over meer
   dan een pollronde niet. */
var RAIL_MIN_N = 3;
var RAIL_MIN_MS = 4000;
var RAIL_TOL = 0.6;          // standaard speling; per regel te overrulen
var RAIL = {
  '0105':[{v:-40,r:'draadbreuk of losse stekker'},{v:215,r:'kortsluiting naar massa'}],
  '010F':[{v:-40,r:'draadbreuk of losse stekker'},{v:215,r:'kortsluiting naar massa'}],
  '0146':[{v:-40,r:'draadbreuk of losse stekker'},{v:215,r:'kortsluiting naar massa'}],
  '015C':[{v:-40,r:'draadbreuk of losse stekker'},{v:215,r:'kortsluiting naar massa'}],
  '010B':[{v:0,  r:'draadbreuk of geen voeding'},{v:255,r:'kortsluiting'}],
  '0110':[{v:0,  r:'geen signaal — draadbreuk of vervuild element', eis:'draait', tol:0.05}],
  '0111':[{v:0,  r:'geen signaal van de gasklepstand', eis:'boventoeren'}],
  // Speling 0,03 V en niet 0,6: dit signaal lóópt van 0 tot 1,275 V, dus met
  // de standaardspeling zou een doodnormale vette meting van 0,8 V al als
  // "tegen de bovengrens" tellen. Een eindwaarde herken je hier op
  // honderdsten, niet op tienden.
  '0114':[{v:0,    r:'geen signaal van de voorste lambdasonde', eis:'warmbelast', tol:0.03},
          {v:1.275,r:'lambdasonde tegen de bovengrens — kortsluiting of massafout', eis:'warmbelast', tol:0.03}]
};
function railEisGehaald(eis, c){
  if(!eis) return true;
  if(eis==='draait')     return c.draait===true;
  // Bij een gesloten gasklep is 0% een geldige stand; alleen boven stationair
  // kan de klep niet dicht zijn terwijl de motor toeren maakt.
  if(eis==='boventoeren') return c.rpm!==null && c.rpm>1500;
  // Warm, draaiend én onder last: bij gas loslaten sluit de inspuiting af en
  // dan hoort een smalband-lambdasonde juist bijna nul te lezen. Zonder deze
  // grens zou uitrollen van een heuvel een kapotte sonde opleveren.
  if(eis==='warmbelast') return c.draait===true && c.warm===true &&
                                c.belasting!==null && c.belasting>=20;
  return false;
}
function railTreffers(c){
  c=c||context();
  var uit=[];
  Object.keys(RAIL).forEach(function(pid){
    var v=V(pid); if(v===null) return;
    RAIL[pid].forEach(function(r){
      var tol=(typeof r.tol==='number')?r.tol:RAIL_TOL;
      if(Math.abs(v-r.v)>=tol) return;
      if(!railEisGehaald(r.eis, c)) return;
      // Eén meting tegen de rand kan een misgelezen frame zijn (#210); een
      // reeks die er niet meer vanaf komt is bedrading.
      var n=aanhoudend(pid, function(w){ return Math.abs(w-r.v)<tol; }, RAIL_MIN_MS, RAIL_MIN_N);
      if(!n) return;
      uit.push({pid:pid, waarde:v, reden:r.r, n:n});
    });
  });
  return uit;
}

/* Een voorwaarde: {tekst, w, test}
   test(c) geeft true (bevestigt), false (spreekt tegen) of null (geen data).
   `c` is de motorstand uit context(). */
function C(tekst, w, test, opt){
  var c={tekst:tekst, w:w, test:test};
  if(opt){ c.xor=opt.xor; c.steun=opt.steun; }
  return c;
}

var REGELS = [
  {
    id:'ontsteking', naam:'Ontstekingsspoel of bougie',
    hint:'Meestal één cilinder. Ratelen of schokken dat erger wordt onder belasting.',
    vc:[
      C('Misfire-code op één cilinder (P030x)', 4, dtcProef(/^P030[1-9A-C]$/)),
      C('Algemene misfire-code (P0300)', 2, dtcProef(/^P0300$/)),
      C('Brandstoftrim niet weggelopen — wijst eerder op ontsteking dan op mengsel', 2, function(c){
        if(c.draait!==true) return null;
        var lt=V('0107'); return lt===null?null:(Math.abs(lt)<10);
      }, {steun:true}),
      C('Ontstekingsvervroeging wordt teruggenomen (ECU corrigeert)', 2, function(c){
        if(c.draait!==true) return null;
        var a=V('010E'); return a===null?null:(a<6);
      }, {steun:true})
    ]
  },
  {
    id:'injector', naam:'Injector',
    hint:'Misfire op één cilinder, maar mét een mengselafwijking op die bank.',
    vc:[
      C('Misfire-code op één cilinder', 3, dtcProef(/^P030[1-9A-C]$/)),
      C('Lange brandstoftrim boven +10 % (bank loopt arm)', 3, function(c){
        if(c.draait!==true) return null;
        var lt=V('0107'); return lt===null?null:(lt>10);
      }),
      C('Injector-/mengselcode aanwezig (P020x, P026x, P017x)', 3, dtcProef(/^P02(0|6)\d|^P017[1-4]$/))
    ]
  },
  {
    id:'vacuumlek', naam:'Vacuümlek (slang, inlaatpakking, PCV)',
    hint:'Onrustig stationair, dat juist beter wordt zodra je gas geeft.',
    vc:[
      C('Lange trim ver positief — de ECU compenseert valse lucht', 4, function(c){
        if(c.draait!==true) return null;
        var lt=V('0107'); return lt===null?null:(lt>12);
      }),
      C('Inlaatdruk stationair te hoog (te weinig vacuüm)', 3, function(c){
        // Met de motor uit leest deze sensor de buitenluchtdruk, ~101 kPa.
        // Zonder deze poort was dat elke keer een "vacuümlek" — de fout van
        // 16-09, en juist in de stand waarin je foutcodes uitleest.
        if(c.draait!==true) return null;
        var map=V('010B');
        if(map===null||c.rpm===null) return null;
        if(c.rpm>1200) return null;            // alleen stationair zinvol
        return map>46;
      }),
      C('Arm-mengselcode aanwezig (P0171 / P0174)', 3, dtcProef(/^P017[14]$/))
    ]
  },
  {
    id:'maf', naam:'Luchtmassameter (MAF) vervuild of defect',
    hint:'Slecht optrekken, vermogensverlies, trim die alle kanten op loopt.',
    vc:[
      C('MAF-code aanwezig (P010x)', 4, dtcProef(/^P010[0-4]$/)),
      /* GEMETEN OP 23-09-2026 (#232). Hier stond "3,5 g/s per 1000 tpm, fout
         onder 45% of boven 240%", op elk toerental en zonder de motor te
         kennen. Op een gezonde CX-5 2.0 keurde dat af aan BEIDE kanten:
         stationair 0,81–1,67 g/s (regel: fout onder 1,0) en vol gas 91 g/s
         bij 4540 tpm (regel: fout boven 38). Luchtmassa volgt belasting ×
         toerental × motorinhoud; de regel kende er één van de drie.

         Nu alleen waar hij iets betekent — warm, stationair, stilstaand — en
         alleen als de motorinhoud bekend is. Per liter gemeten: 0,4–0,85 g/s;
         alarm onder de helft daarvan (0,2) of ruim boven het dubbele (2,5).
         Onbekende motor: geen oordeel. Dat kost dekking, geen juistheid. */
      C('Luchtmassa stationair past niet bij de motorinhoud', 3, function(c){
        if(c.draait!==true || c.warm!==true) return null;
        if(c.rpm===null || c.rpm>1000) return null;
        if(c.snelheid!==null && c.snelheid>2) return null;
        var maf=V('0110'); if(maf===null) return null;
        var l=motorLiters(); if(l===null) return null;
        var perL=maf/l;
        return (perL<0.2) || (perL>2.5);
      }),
      C('Trim ver negatief — de ECU haalt brandstof weg', 2, function(c){
        if(c.draait!==true) return null;
        var lt=V('0107'); return lt===null?null:(lt<-12);
      }, {steun:true})
    ]
  },
  {
    id:'lambdavoor', naam:'Voorste lambdasonde',
    hint:'De regeling zelf loopt niet meer — trim loopt weg zonder dat er lucht bij komt.',
    vc:[
      // Alleen de codes van SENSOR 1 (vóór de kat): die stuurt het mengsel.
      // Hiervoor stond hier P013x én P014x, en daarmee viel de verwarming
      // (P0135/P0141) en de achterste sonde onder dezelfde verdenking als de
      // regelsonde. Dat zijn drie verschillende reparaties.
      C('Code op de regelsonde (P0130-P0134 / P013A-P013F / P0150-P0154 / P2A00)', 4,
        dtcProef(/^P013[0-4]$|^P013[A-F]$|^P015[0-4]$|^P2A00$/)),
      C('Breedbandlambda staat ver van 1,00 terwijl de motor warm draait', 3, function(c){
        if(c.draait!==true || c.warm!==true) return null;
        var l=Veen('0134','0124');
        if(l===null) return null;
        return (l<0.93||l>1.07);
      }),
      C('Beide trims lopen dezelfde kant op en ver door', 2, function(c){
        if(c.draait!==true) return null;
        var st=V('0106'), lt=V('0107');
        if(st===null||lt===null) return null;
        return Math.abs(st+lt)>25;
      })
    ]
  },
  {
    // De verwarming is een eigen circuit met een eigen zekering, en een
    // koude sonde meldt zich als een dode sonde. Dat onderscheid is het
    // verschil tussen een stekker en een sensor van honderd euro.
    id:'lambdaverwarming', naam:'Verwarming van een lambdasonde',
    hint:'Motorlampje zonder dat je er iets van merkt. Vaak een zekering of een stekker, niet de sonde zelf.',
    vc:[
      C('Code voor het verwarmingscircuit (P003x / P005x / P0135 / P0141 / P0155 / P0161)', 5,
        dtcProef(/^P003[0-9A-F]$|^P005[0-9A-F]$|^P0135$|^P0141$|^P0147$|^P0155$|^P0161$/))
    ]
  },
  {
    // De achterste sonde regelt niets — hij beoordeelt de katalysator.
    // Een code daar betekent dus iets anders dan dezelfde code vooraan, en
    // dat werd hiervoor onder één noemer gegooid.
    id:'lambdaachter', naam:'Achterste lambdasonde',
    hint:'Deze sonde stuurt het mengsel niet; hij controleert de katalysator. Je merkt er zelden iets van aan het rijden.',
    vc:[
      C('Code op de achterste sonde (P013[6-9] / P014x / P015x-P016x sensor 2)', 4,
        dtcProef(/^P013[6-9]$|^P0140$|^P015[6-9]$|^P0160$/))
    ]
  },
  {
    id:'kat', naam:'Katalysator',
    hint:'Vermogensverlies, rammelend geluid van onderen, of code P0420.',
    vc:[
      C('Katalysatorcode aanwezig (P0420 / P0430)', 5, dtcProef(/^P04[23]0$/)),
      C('Achterste sonde schommelt net zo hard als de voorste — geen zuurstofbuffer meer', 4, function(c){
        // Hiervoor keek deze voorwaarde naar één momentwaarde en noemde dat
        // "schommelt". Dat is niet dezelfde vraag: een gezonde achterste
        // sonde stáát rond 0,6-0,8 V en beweegt nauwelijks, maar zakt bij
        // gas loslaten (brandstofafsluiting) naar bijna nul. Eén meting op
        // het verkeerde moment was dus genoeg voor een kapotte katalysator.
        // Nu de sprei over een venster, en alleen warm en op gas.
        if(c.draait!==true || c.warm!==true) return null;
        if(c.rpm===null || c.rpm<1000) return null;
        var s=sprei('0115', 8000, 8);
        return s===null?null:(s>0.5);
      }),
      C('Inlaatdruk hoog bij gas geven — mogelijke verstopping', 2, function(c){
        if(c.draait!==true) return null;
        var map=V('010B');
        if(map===null||c.rpm===null||c.rpm<2000) return null;
        return map>85;
      })
    ]
  },
  {
    id:'egr', naam:'EGR-klep',
    hint:'Onrustig stationair, roet, of slecht optrekken bij lage toeren.',
    vc:[
      C('EGR-code aanwezig (P040x)', 5, dtcProef(/^P040[0-9A-F]$/)),
      C('Inlaatdruk stationair verhoogd', 2, function(c){
        if(c.draait!==true) return null;
        var map=V('010B');
        if(map===null||c.rpm===null||c.rpm>1200) return null;
        return map>48;
      })
    ]
  },
  {
    id:'thermostaat', naam:'Thermostaat of koelsysteem',
    hint:'Motor komt niet op temperatuur, of juist te warm.',
    vc:[
      C('Thermostaatcode aanwezig (P0128 / P0125)', 5, dtcProef(/^P012[58]$/)),
      // Deze twee sluiten elkaar uit — te koud en te warm tegelijk bestaat
      // niet. Zonder xor trok de ene de andere elke keer omlaag en kwam
      // deze regel nooit boven de ondergrens uit.
      C('Koelwater blijft onder 75 °C terwijl de motor al lang draait', 4, function(c){
        // "terwijl de motor al draait" stond er, maar er werd niet gekeken
        // of hij draaide, laat staan hoe lang. Elke koude start was dus een
        // kapotte thermostaat. Tien minuten is de ondergrens waaronder ook
        // een gezonde motor nog koud kan zijn.
        //
        // "Hoe lang draait hij al" heeft twee bronnen, en de tweede is er
        // omdat de eerste een sensor is die je kunt uitvinken: zonder 011F
        // in de selectie zou deze regel nooit meer aanslaan, en dat is een
        // valse gerustheid in ruil voor een valse verdenking. De
        // meetgeschiedenis van het koelwater zelf zegt hetzelfde: tien
        // minuten onafgebroken onder de 75 °C, gemeten terwijl hij draait.
        if(c.draait!==true) return null;
        if(c.ect===null) return null;
        if(c.ect>=75) return false;
        if(c.looptijd!==null) return c.looptijd>=600;
        return reeksOordeel(aanhoudend('0105', function(v){ return v<75; }, 600000, 10));
      }, {xor:'temp'}),
      C('Koelwater boven 105 °C', 4, function(c){
        if(c.draait!==true) return null;
        return c.ect===null?null:(c.ect>105);
      }, {xor:'temp'})
    ]
  },
  {
    id:'koelventilator', naam:'Koelventilator of zijn relais',
    hint:'Wordt heet in de file en koelt juist af zodra je rijdt — precies andersom dan bij een thermostaat.',
    vc:[
      C('Ventilatorcode aanwezig (P048x)', 5, dtcProef(/^P048[0-9A-F]$/)),
      C('Koelwater boven 102 °C terwijl de auto stilstaat', 4, function(c){
        if(c.draait!==true) return null;
        if(c.snelheid===null || c.snelheid>5) return null;
        return c.ect===null?null:(c.ect>102);
      })
    ]
  },
  {
    id:'oliedruk', naam:'Oliedruk of oliedruksensor',
    hint:'Hier niet mee doorrijden. Is het de sensor niet, dan is het de motor.',
    vc:[
      C('Oliedrukcode aanwezig (P052x)', 5, dtcProef(/^P052[0-9A-F]$/)),
      C('Motorolie boven 140 °C', 3, function(c){
        if(c.draait!==true) return null;
        var t=V('015C'); return t===null?null:(t>140);
      })
    ]
  },
  {
    id:'dynamo', naam:'Dynamo of spanningsregelaar',
    hint:'Dimmende verlichting, waarschuwingslampjes, of een accu die steeds leeg is.',
    vc:[
      C('Laadspanning te laag met draaiende motor', 5, function(c){
        if(c.draait!==true) return null;
        if(c.rpm===null||c.rpm<800) return null;
        // Eén meting is hier te weinig: bij het inschakelen van een zware
        // verbruiker zakt de spanning even in. Een reeks die laag blijft is
        // een laadfout; één dip is een koplamp.
        return reeksOordeel(aanhoudend('0142', function(v){ return v<13.2; }, 5000, 3));
      }, {xor:'laad'}),
      C('Laadspanning te hoog — regelaar regelt niet af', 5, function(c){
        if(c.draait!==true) return null;
        if(c.rpm===null||c.rpm<800) return null;
        return reeksOordeel(aanhoudend('0142', function(v){ return v>15.2; }, 5000, 3));
      }, {xor:'laad'})
    ]
  },
  {
    id:'accu', naam:'Accu',
    hint:'Moeizaam starten, vooral als hij een nacht heeft gestaan.',
    vc:[
      C('Rustspanning onder 12,2 V met de motor uit', 5, function(c){
        // Draait hij nog maar net niet meer (uitlopen, starten), dan is dit
        // geen rustspanning. Vandaar hard op nul toeren en niet op "<200".
        if(c.rpm===null||c.rpm>0) return null;
        var v=V('0142'); return v===null?null:(v<12.2);
      })
    ]
  },
  {
    id:'krukas_nok', naam:'Krukas- of nokkenaspositiesensor',
    hint:'Slaat af, start soms niet, of valt willekeurig stil.',
    vc:[
      C('Positiesensorcode aanwezig (P0335-P0344)', 5, dtcProef(/^P03(3[5-9]|4[0-4])$/))
    ]
  },
  {
    id:'klopsensor', naam:'Klopsensor',
    hint:'Vermogensverlies zonder duidelijke oorzaak; de ECU haalt vervroeging weg.',
    vc:[
      C('Klopsensorcode aanwezig (P0325-P0332)', 5, dtcProef(/^P03(2[5-9]|3[0-2])$/)),
      C('Ontsteking staat ver terug terwijl de motor warm is', 2, function(c){
        if(c.draait!==true || c.warm!==true) return null;
        var a=V('010E');
        return a===null?null:(a<2);
      }, {steun:true})
    ]
  },
  {
    id:'brandstofdruk', naam:'Brandstofpomp, filter of drukregelaar',
    hint:'Slecht optrekken onder belasting, terugvallen bij hoge snelheid.',
    vc:[
      C('Brandstofdrukcode aanwezig (P0087 / P0088 / P018x)', 5, dtcProef(/^P008[7-9]$|^P018[0-9]$/)),
      C('Raildruk blijft ver onder wat bij deze belasting hoort', 4, function(c){
        // 0123 komt in kPa binnen, 016D in MPa. Dat door elkaar halen was
        // de oude valkuil: 400 kPa poortinspuiting werd dan "0,4 MPa" en
        // dus altijd "te laag". Elke bron krijgt daarom zijn eigen grens,
        // en alleen directe inspuiting (>3 MPa systeemdruk) wordt getoetst.
        if(c.draait!==true) return null;
        if(c.belasting===null || c.belasting<60) return null;
        var mpa=null;
        var direct=V('016D');                     // al in MPa
        if(direct!==null) mpa=direct;
        else {
          var kpa=Veen('0123','0159');            // in kPa
          if(kpa!==null) mpa=kpa/1000;
        }
        if(mpa===null) return null;
        if(mpa<1) return null;                    // poortinspuiting: andere orde, geen oordeel
        return mpa<3;
      }),
      C('Trim loopt positief weg onder belasting', 2, function(c){
        if(c.draait!==true) return null;
        var lt=V('0107');
        if(lt===null||c.belasting===null||c.belasting<50) return null;
        return lt>12;
      }, {steun:true})
    ]
  },
  {
    id:'turbo', naam:'Turbo, laaddruksysteem of intercoolerslang',
    hint:'Vermogensverlies onder belasting, soms fluiten of noodloop.',
    vc:[
      C('Laaddrukcode aanwezig (P0234 / P0299 / P00Ax)', 5, dtcProef(/^P02(34|99)$|^P00A[0-9]$/)),
      C('Inlaatdruk blijft rond omgevingsdruk terwijl de belasting hoog is', 4, function(c){
        if(c.draait!==true) return null;
        var map=V('010B');
        if(map===null||c.belasting===null||c.rpm===null) return null;
        if(c.belasting<70||c.rpm<2000) return null;
        return map<110;
      })
    ]
  },
  {
    id:'roetfilter', naam:'Roetfilter (DPF)',
    hint:'Vermogensverlies, veel regeneraties, of de motor gaat in noodloop.',
    vc:[
      C('Roetfiltercode aanwezig (P24xx / P042x)', 5, dtcProef(/^P24[0-9A-F]{2}$|^P04(2[1-9A-F])$/)),
      C('Uitlaattegendruk hoog', 3, function(c){
        if(c.draait!==true) return null;
        // Stond op 0169/016B — dat zijn EGR-positie en EGR-temperatuur; de
        // uitlaatdruk is 0173 (absoluut, kPa). De grens van 120 kPa is
        // overgenomen en niet aan een echte diesel getoetst.
        var d=Veen('0173');
        return d===null?null:(d>120);
      })
    ]
  },
  {
    id:'adblue', naam:'AdBlue-systeem (SCR)',
    hint:'Waarschuwing over startblokkering, of een NOx-code.',
    vc:[
      // P20xx was hier veel te ruim: dat blok loopt van P2000 tot P20FF en
      // bevat behalve de nabehandeling ook de wervelkleppen van het
      // inlaatspruitstuk (P2004-P200F). Eén foutcode wees zo twee onderdelen
      // aan — op een benzineauto zelfs een AdBlue-systeem dat er niet is.
      // Dit zijn de blokken die werkelijk over SCR en NOx gaan.
      C('SCR-/NOx-code aanwezig (P2000-P2003 / P204x-P205x / P20Ex-P20Fx / P22xx / P2BAx)', 5,
        dtcProef(/^P200[0-3]$|^P20[45EF][0-9A-F]$|^P22(0[0-9A-F]|1[0-3])$|^P2BA[0-9A-F]$/))
    ]
  },
  {
    id:'gloeibougie', naam:'Gloeibougies of hun relais',
    hint:'Alleen een diesel, en je merkt het alleen als het koud is: lang doorstarten en witte rook.',
    vc:[
      C('Gloeisysteemcode aanwezig (P038x / P067x)', 5, dtcProef(/^P038[0-3]$|^P067[0-9A-F]$/))
    ]
  },
  {
    id:'gasklep', naam:'Gasklephuis of gaspedaalsensor',
    hint:'Onregelmatig stationair, gas dat niet reageert, of noodloop.',
    vc:[
      C('Gasklep-/pedaalcode aanwezig (P012x / P022x / P2135)', 5, dtcProef(/^P012[0-9A-F]$|^P022[0-9A-F]$|^P213[0-9]$/)),
      C('Gasklepstand blijft hangen terwijl het toerental wel verandert', 3, function(c){
        if(c.draait!==true) return null;
        var t=V('0111');
        if(t===null||c.rpm===null) return null;
        return (c.rpm>1800 && t<3);
      })
    ]
  },
  {
    id:'distributie', naam:'Distributieketting of -spanner',
    hint:'Ratelen bij koude start dat na een paar seconden minder wordt.',
    vc:[
      // P0010-P0015 zijn verplaatst naar de VVT-regel hieronder: die gaan
      // over de verstelling zelf (olie, magneetklep) en niet over de
      // ketting. P0016-P0019 zijn de correlatiecodes en dát is de ketting:
      // krukas en nokkenas staan niet meer in dezelfde stand ten opzichte
      // van elkaar, en dat is precies wat een opgerekte ketting doet.
      //
      // P034x stond hier ook, en dat was fout: dat zijn de circuitcodes van
      // de nokkenassensor zelf. Die staan al onder 'krukas_nok', dus één
      // foutcode wees twee onderdelen aan.
      C('Correlatiecode krukas/nokkenas (P0016-P0019)', 5, dtcProef(/^P001[6-9]$/)),
      /* GEMETEN OP 23-09-2026 (#231). De grens stond op −5°. Een gezonde
         SkyActiv-G ging tijdens het rijden naar −10,5, −12 en −20° —
         katalysator-opwarming en klopregeling, allebei normaal. Dan wees dit
         paneel de nokkenas/ketting aan (gewicht 3) op een motor die niets
         mankeerde. Nu pas bij een warme motor, en pas voorbij −25°. */
      C('Ontstekingsvervroeging springt heen en weer', 3, function(c){
        if(c.draait!==true || c.warm!==true) return null;
        var a=V('010E');
        return a===null?null:(a<-25||a>45);
      }, {steun:true})
    ]
  },
  {
    id:'vvt', naam:'Nokkenasverstelling (VVT) of zijn magneetklep',
    hint:'Ruw stationair of minder trekkracht. Vaak vervuilde olie of een vastzittende klep — niet de ketting.',
    vc:[
      C('Verstellingscode aanwezig (P0010-P0015 / P0020-P0025)', 5, dtcProef(/^P001[0-5]$|^P002[0-5]$/))
    ]
  },
  {
    id:'swirl', naam:'Wervelkleppen in het inlaatspruitstuk',
    hint:'Bekend op diesels: roet zet de kleppen vast en de stang loopt door.',
    vc:[
      C('Spruitstukcode aanwezig (P2004-P200F)', 5, dtcProef(/^P200[4-9A-F]$/))
    ]
  },
  {
    id:'secundairelucht', naam:'Secundaire luchtinjectie (pomp of klep)',
    hint:'Merk je niet aan het rijden; komt op bij de eerste minuut na een koude start.',
    vc:[
      C('Secundaire-luchtcode aanwezig (P041x)', 5, dtcProef(/^P041[0-9A-F]$/))
    ]
  },
  {
    id:'evap', naam:'Tankdop of EVAP-systeem',
    hint:'Motorlampje zonder dat de auto anders rijdt. Begin bij de tankdop: die is gratis.',
    vc:[
      C('EVAP-lekcode aanwezig (P044x / P045x)', 5, dtcProef(/^P04(4[0-9A-F]|5[0-9A-F])$/))
    ]
  },
  {
    id:'automaat', naam:'Automaat of koppelomvormer',
    hint:'Schakelt hard, slipt, of gaat in noodloop met één vaste versnelling.',
    vc:[
      C('Transmissiecode aanwezig (P07xx / P0218)', 5, dtcProef(/^P07[0-9A-F]{2}$|^P0218$/))
    ]
  },
  {
    // Een U-code komt niet van een sensor maar van het gesprek tussen twee
    // stuurapparaten. Wie daar een onderdeel bij noemt, gokt.
    id:'communicatie', naam:'Verbinding tussen stuurapparaten (bus of bedrading)',
    hint:'Dit is geen sensor maar het netwerk zelf: connector, massa of een module die niet meer meepraat.',
    vc:[
      C('Communicatiecode aanwezig (U0xxx)', 5, dtcProef(/^U0[0-9A-F]{3}$/))
    ]
  },
  {
    id:'ecu', naam:'Stuurapparaat zelf',
    hint:'Zeldzaam, en vrijwel nooit de eerste verdachte. Controleer eerst voeding en massa.',
    vc:[
      C('Interne stuurapparaatcode aanwezig (P060x)', 5, dtcProef(/^P060[0-9A-F]$/))
    ]
  }
];

/* ── Beoordelen ────────────────────────────────────────────────────────── */
function beoordeel(){
  var c=context();
  var uit=[];
  REGELS.forEach(function(r){
    var score=0, voor=[], tegen=[], onbekend=0, maxScore=0;
    var xorGeraakt={};
    // Eerst de dragende voorwaarden, daarna pas het steunbewijs — steun telt
    // alleen mee als er al iets zelfstandigs naar dit onderdeel wees. Anders
    // wijst "trim is normaal" op een kerngezonde auto ineens naar een defecte
    // bougie, en dat is precies het soort valse verdenking dat je niet wilt.
    var dragend=r.vc.filter(function(v){ return !v.steun; });
    var steun  =r.vc.filter(function(v){ return  v.steun; });

    dragend.forEach(function(vc){
      var t=vc.test(c);
      // Elkaar uitsluitende voorwaarden (te laag / te hoog) tellen samen voor
      // één keer mee in het maximum, en straffen elkaar niet af.
      if(vc.xor){
        if(!xorGeraakt[vc.xor]){ maxScore+=vc.w; xorGeraakt[vc.xor]=true; }
        if(t===null){ onbekend++; return; }
        if(t){ score+=vc.w; voor.push(vc.tekst); }
        return;                                  // geen aftrek bij de tegenhanger
      }
      maxScore+=vc.w;
      if(t===null){ onbekend++; return; }
      if(t){ score+=vc.w; voor.push(vc.tekst); }
      else { score-=Math.round(vc.w/2); tegen.push(vc.tekst); }
    });

    if(voor.length){
      steun.forEach(function(vc){
        maxScore+=vc.w;
        var t=vc.test(c);
        if(t===null){ onbekend++; return; }
        if(t){ score+=vc.w; voor.push(vc.tekst); }
        else { score-=Math.round(vc.w/2); tegen.push(vc.tekst); }
      });
    }
    // Ondergrens: minder dan een kwart van het haalbare is geen aanwijzing
    // maar ruis, en die hoort niet als verdachte op het scherm.
    var deel=score/Math.max(1,maxScore);
    // TWEEDE ONDERGRENS, gemeten op 16-09-2026 in de browserproef: op een
    // kerngezonde demo-auto stond "EGR-klep — zwakke aanwijzing" op het
    // scherm, gedragen door precies één voorwaarde van gewicht 2 ("inlaatdruk
    // stationair verhoogd"). Twee gedeeld door zeven is 0,29 en dus boven de
    // kwartgrens, terwijl er niets meer onder ligt dan één hint.
    //
    // De regel is daarom niet "een hoger percentage" — dat zou de zware
    // aanwijzingen ook raken — maar: er moet iets dragen. Ofwel twee
    // voorwaarden die elkaar steunen, ofwel één die op zichzelf zwaar genoeg
    // is (gewicht 3 of meer; dat is elke foutcode en elke meting die op zichzelf
    // ergens over gaat). Eén losse hint van gewicht 2 is een vermoeden en
    // geen verdachte.
    var zwaarste=0;
    r.vc.forEach(function(vc){ if(voor.indexOf(vc.tekst)>=0 && vc.w>zwaarste) zwaarste=vc.w; });
    var draagt = voor.length>=2 || zwaarste>=3;
    if(voor.length && draagt && score>0 && deel>=0.25) uit.push({
      id:r.id, naam:r.naam, hint:r.hint,
      score:score, max:maxScore, deel:deel, voor:voor, tegen:tegen, onbekend:onbekend
    });
  });
  // Sorteren op het aandeel en niet op de rauwe score: het aandeel is wat er
  // als "sterke aanwijzing" op het scherm komt, en anders staat een zwakke
  // kandidaat met veel voorwaarden boven een sterke met weinig.
  uit.sort(function(a,b){ return (b.deel-a.deel) || (b.score-a.score); });
  return uit;
}

/* ── Weergave ──────────────────────────────────────────────────────────── */
function zekerheid(r){
  var p = r.max? Math.max(0, Math.round(r.score/r.max*100)) : 0;
  if(p>=65) return {t:'sterke aanwijzing', k:'#ef4444'};
  if(p>=35) return {t:'aanwijzing',        k:'#f59e0b'};
  return          {t:'zwakke aanwijzing',  k:'#94a3b8'};
}
function pidNaam(pid){
  var d=null;
  try{ d=(typeof getPidDef==='function')?getPidDef(pid):null; }catch(e){ d=null; }
  return (d&&d.name)||pid;
}
function pidEenheid(pid){
  var d=null;
  try{ d=(typeof getPidDef==='function')?getPidDef(pid):null; }catch(e){ d=null; }
  return (d&&d.unit)||'';
}
function seconden(ms){ return Math.round(ms/1000)+' s'; }

function render(){
  var host=document.getElementById('odBody'); if(!host) return;
  var bron=dtcBron();
  var R=beoordeel();
  var c=context();
  var h='';

  // Eerst alles verzamelen, dan pas tekenen. In de schermafdruk van 16-09
  // stond "Geen enkel onderdeel aan te wijzen" bovenaan en een kaart met
  // "Sensor levert niets meer — sterke aanwijzing" eronder. Die twee zinnen
  // spreken elkaar tegen, en het paneel kon dat niet weten omdat het de
  // sensorkant pas ná het lege-melding-blok uitrekende.
  var bus=busBetrouwbaar(), beeld=stilteBeeld(), rails=railTreffers(c);
  var totaalStil=beeld.stil.length+beeld.levend.length;
  var deelStil=beeld.stil.length/Math.max(1,totaalStil);
  var uitvalKaart = beeld.register && bus.ok && beeld.stil.length>0 && deelStil<=0.30;

  h+='<div class="od-bron">Gekeken naar <b>'+
     (!bron.gescand ? 'nog geen foutcodes'
                    : (bron.codes.length ? bron.codes.length+' foutcode'+(bron.codes.length===1?'':'s')
                                         : 'geen foutcodes'))+
     '</b> en de live meetwaarden van dit moment.</div>';

  // Zonder DTC-scan mist de helft van het bewijs, en dat hoort bovenaan te
  // staan in plaats van dat het paneel stilletjes minder vindt.
  if(!bron.gescand){
    /* DE KNOP HOORT HIER (#233). De zin stuurde je naar een knop op een ander
       scherm: sluiten, zoeken, scannen, opnieuw openen. Nu staat hij onder de
       zin zelf. Zonder verbinding is er niets uit te lezen, en dan zegt het
       blok dat in plaats van een knop te tonen die niets doet. */
    var kan=scanMogelijk();
    h+='<div class="od-grens"><b>De foutcodes zijn nog niet uitgelezen</b><br>'+
       'Dit oordeel rust nu alleen op de live meetwaarden. Lees eerst de foutcodes uit — '+
       'de helft van wat hier staat, staat daarin.'+
       (kan ? '<br><button class="od-btn" id="odScan" onclick="PLOnderdeel.scan(this)">'+(_scanMislukt?'Uitlezen mislukt — probeer opnieuw':'🔍 Foutcodes uitlezen')+'</button>'
            : '<br><i>Verbind eerst de adapter — zonder verbinding valt er niets uit te lezen.</i>')+
       '</div>';
  }

  if(!R.length && !rails.length && !uitvalKaart){
    h+='<div class="od-leeg"><b>Geen enkel onderdeel aan te wijzen.</b><br>'+
       'Er is niets in de foutcodes of de meetwaarden dat naar een specifiek onderdeel wijst. '+
       'Dat is op zich goed nieuws voor de elektronica, maar het betekent ook dat een geluid of trilling '+
       'waarschijnlijk mechanisch is.</div>';
  } else {
    R.forEach(function(r){
      var z=zekerheid(r);
      h+='<div class="od-kaart" style="border-left-color:'+z.k+'">'+
           '<div class="od-kop"><b>'+r.naam+'</b><span style="color:'+z.k+'">'+z.t+'</span></div>'+
           '<div class="od-hint">'+r.hint+'</div>'+
           '<div class="od-bew">Waarop dit rust:</div><ul class="od-lijst">';
      r.voor.forEach(function(t){ h+='<li class="ja">'+t+'</li>'; });
      r.tegen.forEach(function(t){ h+='<li class="nee">'+t+' — dit spreekt het juist tegen</li>'; });
      h+='</ul>';
      if(r.onbekend) h+='<div class="od-mis">'+r.onbekend+' controle'+(r.onbekend===1?'':'s')+
        ' kon ik niet doen: daar heb ik nu geen meetwaarde voor.</div>';
      h+='</div>';
    });
  }

  // ── Sensoruitval, mét de uitleesfout-poort ervoor ──
  if(rails.length){
    h+='<div class="od-kaart" style="border-left-color:#ef4444">'+
       '<div class="od-kop"><b>Sensor leest een onmogelijke waarde</b><span style="color:#ef4444">sterke aanwijzing</span></div>'+
       '<div class="od-hint">De meting staat exact tegen de elektrische eindwaarde aan en blijft daar. '+
       'Dat is geen temperatuur of druk meer, dat is de bedrading.</div>'+
       '<ul class="od-lijst">';
    rails.forEach(function(r){
      h+='<li class="ja">'+pidNaam(r.pid)+' staat op '+r.waarde+pidEenheid(r.pid)+
         ' — '+r.reden+' <span style="opacity:.6">('+r.n+' metingen achter elkaar)</span></li>';
    });
    h+='</ul></div>';
  }
  if(!beeld.register){
    h+='<div class="od-grens" style="border-left-color:#94a3b8;background:rgba(148,163,184,.07)">'+
       '<b>Over ontbrekende sensoren zeg ik nu niets</b><br>'+
       'Het cadansregister (PLSched) is er niet, en zonder dat is "nog niet aan de beurt" niet te '+
       'onderscheiden van "gevraagd en niets terug". Dat onderscheid is precies waar deze uitspraak op rust.</div>';
  } else if(!bus.ok){
    h+='<div class="od-grens" style="border-left-color:#94a3b8;background:rgba(148,163,184,.07)">'+
       '<b>Over ontbrekende sensoren zeg ik nu niets</b><br>'+
       'Het meetkanaal zelf is op dit moment niet betrouwbaar genoeg ('+bus.reden+'). '+
       'Een sensor die stil lijkt te vallen kan dan net zo goed een gemist antwoord zijn. '+
       'Rijd even door of verbind opnieuw, dan kijk ik er wél naar.</div>';
  } else if(beeld.stil.length){
    if(!uitvalKaart){
      h+='<div class="od-grens" style="border-left-color:#94a3b8;background:rgba(148,163,184,.07)">'+
         '<b>Meerdere sensoren tegelijk stil — dit is geen defect</b><br>'+
         beeld.stil.length+' van de '+totaalStil+' opgevraagde sensoren zwijgt tegelijk. '+
         'Eén kapotte sensor doet dat niet; dit wijst op de verbinding, de adapter of een overbelaste bus.</div>';
    } else {
      h+='<div class="od-kaart" style="border-left-color:#ef4444">'+
         '<div class="od-kop"><b>Sensor levert niets meer</b><span style="color:#ef4444">sterke aanwijzing</span></div>'+
         '<div class="od-hint">Deze sensoren zijn gevraagd en gaven geen antwoord, langer dan hun eigen '+
         'meettempo toelaat, terwijl '+beeld.levend.length+' andere sensoren gewoon doorlopen. '+
         'Dat sluit twee dingen uit: een uitleesfout (bij een busprobleem valt alles tegelijk weg) en '+
         'een sensor die simpelweg nog niet aan de beurt was.</div>'+
         '<ul class="od-lijst">';
      beeld.stil.forEach(function(s){
        h+='<li class="ja">'+pidNaam(s.pid)+' <span style="opacity:.6">('+s.pid+')</span> — '+
           (s.gesnoeid ? 'meermaals gevraagd, geen enkel antwoord' :
                         seconden(s.stilMs)+' stil terwijl hij elke '+seconden(s.interval)+' aan de beurt is')+
           ' — draadbreuk, stekker of sensor</li>';
      });
      h+='</ul></div>';
    }
  }
  if(beeld.register && beeld.tellers.length){
    h+='<div class="od-grens" style="border-left-color:#94a3b8;background:rgba(148,163,184,.07)">'+
       '<b>'+beeld.tellers.length+' teller'+(beeld.tellers.length===1?'':'s')+' zonder antwoord, en dat is geen onderdeel</b><br>'+
       beeld.tellers.map(pidNaam).join(', ')+' zijn waarden die het stuurapparaat zelf bijhoudt. '+
       'Daar zit geen draad en geen sensor aan, dus als ze uitblijven is dat een kwestie van uitlezen — '+
       'niet iets dat je kunt vervangen.</div>';
  }

  // Wat OBD principieel niet kan zien — altijd tonen, juist bij ratelen.
  h+='<div class="od-grens"><b>Wat ik hiermee niet kan zien</b><br>'+
     'Motorsteunen, hitteschilden, uitlaatbeugels, ophanging, aandrijfassen, remmen en '+
     'wielophanging hebben geen sensor. Ratelt het daar, dan komt er via de OBD-poort '+
     'niets binnen — hoe lang je ook meet. Blijft deze lijst leeg terwijl je duidelijk iets hoort, '+
     'dan is dat zelf een uitkomst: zoek het mechanisch.</div>';

  host.innerHTML=h;
}

/* ── FOUTCODES UITLEZEN VANUIT HET PANEEL (#233) ─────────────────────────
   scanDTC() duurt twee seconden en claimt de bus. Zolang staat de knop uit
   met een leesbare stand; daarna tekent het paneel zichzelf opnieuw, zodat
   de oude tekst ("nog niet uitgelezen") niet blijft staan. Een scan die
   mislukt, zegt dat op de knop in plaats van stil te niets te doen. */
function scanMogelijk(){
  try{
    if(typeof scanDTC!=='function') return false;
    return (typeof connected!=='undefined' && !!connected) || (typeof demoMode!=='undefined' && !!demoMode);
  }catch(e){ console.warn('Onderdeelcheck: verbindingsstand onleesbaar (#233)', e); return false; }
}
// Na een mislukte scan tekent render() de knop met die mededeling erop.
var _scanMislukt=false;
function scan(knop){
  if(!scanMogelijk()) return Promise.resolve(false);
  try{ if(knop){ knop.disabled=true; knop.textContent='⏳ Foutcodes uitlezen…'; } }
  catch(e){ console.warn('Onderdeelcheck: knopstand niet gezet (#233)', e); }
  return Promise.resolve().then(function(){ return scanDTC(); }).then(function(){
    _scanMislukt=false;
    render();
    return true;
  }).catch(function(e){
    console.warn('Onderdeelcheck: foutcodes uitlezen mislukt (#233)', e);
    _scanMislukt=true;
    render();
    return false;
  });
}

/* ── Publiek ───────────────────────────────────────────────────────────── */
window.openOnderdeelCheck = function(){
  var ov=document.getElementById('onderdeelOv');
  if(!ov){
    ov=document.createElement('div');
    ov.id='onderdeelOv'; ov.className='od-ov';
    ov.innerHTML=
      '<div class="od-top">'+
        '<div class="od-titel">🔩 Welk onderdeel?</div>'+
        '<button class="od-x" onclick="document.getElementById(\'onderdeelOv\').style.display=\'none\'">✕</button>'+
      '</div>'+
      '<div class="od-body" id="odBody"></div>'+
      '<div class="od-foot">'+
        '<button class="od-btn" onclick="openOnderdeelCheck()">🔄 Opnieuw kijken</button>'+
      '</div>';
    document.body.appendChild(ov);
  }
  ov.style.display='flex';
  render();
};
// Ook los aanroepbaar: handig voor de diagnosebundel en om de
// uitleesfout-poort te kunnen natoetsen zonder de UI te openen.
window.PLOnderdeel = { beoordeel:beoordeel, _regels:REGELS, motorLiters:motorLiters, scan:scan, scanMogelijk:scanMogelijk,
  busBetrouwbaar:busBetrouwbaar, stilteBeeld:stilteBeeld, railTreffers:railTreffers,
  dtcBron:dtcBron, context:context, cadansRegels:cadansRegels, tellers:TELLER_PIDS };

})();
