/* pidlane-wizard.js — PidLane Wizard (27-07-2026)
   ═══════════════════════════════════════════════════════════════════════
   WAAROM DIT BESTAAT
   Het welkomstscherm had 5 deuren met 18 kaarten. Een deel daarvan was
   dezelfde functie met een andere parameter: vier "rijd een rondje"-kaarten
   liepen alle vier uit op openRitAnalyse(duur), vijf koopkaarten op
   setKoopMode(rol) + openAnalysis('koop'), drie seizoenskaarten op
   openClimateCheck(mode). Twee kaarten — Proefrit en Seizoenscheck — deden
   zelfs niets anders dan een modaal openen met één vraag erin. Dat waren al
   mini-wizards; ze bestonden alleen omdat een menukaart geen parameter kan
   dragen.

   DE OPZET
   De wizard levert geen functie op maar een OPDRACHT:
     doel     → waarom je naar deze auto kijkt
     context  → klacht, rol, seizoen, omstandigheden
     meting   → hoe we aan data komen (stilstaand / rit / passief / opname)
     modules  → wát we uit die data halen — een SET, geen enkele bestemming
   De bestaande functies worden daarmee bouwstenen. Een dunne test als de
   EV-accucheck is geen eindpunt meer maar een module die vanzelf meedraait
   zodra de auto er een is, in welke tak je ook zit.

   RONDE 1 (dit bestand)
   Vragenboom + planscherm dat de bestaande functies aanstuurt en de juiste
   parameters zet. Elke module houdt voorlopig zijn eigen rapport; één
   samengesteld eindrapport is een herziening van de AI-laag en hoort niet
   in dezelfde ronde thuis.

   RONDE 2 (29-07-2026) — TERUGWEG NAAR HET PLAN
   Wat er mis was: draai() en start() deden sluitStil() en daarmee was het
   plan weg. De toestand (job/pad/nu) bleef netjes staan, maar er was geen
   enkele ingang die hem weer tekende — open() is de enige publieke ingang
   en die reset juist alles. Eén module openen was dus een eenrichtingsdeur:
   je kon nooit bij de andere zes komen zonder de hele vragenboom opnieuw
   te lopen.

   Wat er nu gebeurt:
     • Het plan is een sessie die loopt tot je 'm sluit (_actief), niet een
       scherm dat bij de eerste klik verdampt. sluitStil() verbergt alleen.
     • Zwevende chip in #fabLane zolang de sessie loopt en het plan verborgen
       is. Tik = terug naar het plan, met alles nog ingevuld.
     • Afgeronde stappen krijgen een vinkje en de knop heet dan "Opnieuw",
       zodat je ziet waar je gebleven was.
   Geen wijziging in de vragenboom, de modules of bouwPlan().
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ── Hulpjes ─────────────────────────────────────────────────────────── */
function el(id){ return document.getElementById(id); }
function veilig(fn, val){ try{ return fn(); }catch(e){ return val; } }
function isEV(){
  // Brandstoftype uit de ECU (PID 0151) gaat vóór het voertuigdossier.
  var f = veilig(function(){ return pidVals['0151']; });
  if(typeof f==='number'){ if(f===8) return 'ev'; if(f===9||f===10) return 'hybride'; }
  var b = veilig(function(){
    var v=(typeof vehicleInfo!=='undefined'&&vehicleInfo)||{};
    return String(v.brandstof||v.fuel||'').toLowerCase();
  },'');
  if(/elektr|\bev\b|bev/.test(b)) return 'ev';
  if(/hybride|hybrid|phev/.test(b)) return 'hybride';
  return null;
}

/* ── De vragenboom ───────────────────────────────────────────────────────
   Elk knooppunt: {v: vraag, sub: toelichting, opt: [keuzes]}.
   Een keuze zet iets in de opdracht (set) en wijst de volgende vraag aan
   (next). next:null betekent: klaar, stel het plan samen.
   Vrije tekst gaat via type:'tekst'.                                      */
var BOOM = {

  start: {
    v:'Waarom kijk je naar deze auto?',
    sub:'Eén vraag, daarna stel ik het onderzoek samen.',
    opt:[
      {t:'🔧 Er is iets mis',            d:'Een klacht, vreemd geluid, of ik vertrouw het niet', set:{doel:'storing'},       next:'storing_wanneer'},
      {t:'🚗 Kopen, verkopen of inruilen',d:'Ik wil weten wat hij waard is — en wat hij verbergt', set:{doel:'handel'},       next:'handel_rol'},
      {t:'⛽ Verbruik en besparen',       d:'Wat kost hij echt, en hoe kan het zuiniger',          set:{doel:'verbruik'},     next:'verbruik_wat'},
      {t:'🩺 Gewoon een controle',        d:'Geen klacht — ik wil weten hoe hij ervoor staat',     set:{doel:'conditie'},     next:'conditie_diep'},
      {t:'🧳 Ergens klaar voor maken',    d:'Winter, lange rit, caravan of een onderhoudsbeurt',   set:{doel:'voorbereiding'},next:'voorb_wat'}
    ]
  },

  /* ── Storing ── de vraag die het meeste werk doet: wanneer merk je het?
       Dat bepaalt namelijk of stilstaand meten volstaat, of dat we moeten
       rijden, of dat we passief moeten meelopen tot het zich voordoet. */
  storing_wanneer: {
    v:'Wanneer merk je het?',
    sub:'Hiermee bepaal ik hoe we moeten meten.',
    opt:[
      {t:'Nu, ook stilstaand',       d:'Het is er zodra de motor draait',            set:{meting:'stil'},    next:'storing_klacht'},
      {t:'Alleen tijdens het rijden',d:'Onder belasting, bij optrekken of snelheid', set:{meting:'rit10'},   next:'storing_klacht'},
      {t:'Alleen bij een koude motor',d:'Verdwijnt als hij op temperatuur is',       set:{meting:'monitor'}, next:'storing_klacht'},
      {t:'Onvoorspelbaar',           d:'Soms wel, soms niet — lastig op te wekken',  set:{meting:'monitor'}, next:'storing_klacht'}
    ]
  },
  storing_klacht: {
    v:'Wat gebeurt er precies?',
    sub:'Hoe concreter, hoe gerichter de analyse. Noem toerental, snelheid of temperatuur als je die weet.',
    type:'tekst', veld:'klacht', verplicht:true,
    plaats:'bijv. trilt bij optrekken tussen 2000 en 3000 tpm, alleen met koude motor',
    next:'storing_lampje'
  },
  storing_lampje: {
    v:'Brandt het motorstoringslampje?',
    sub:'',
    opt:[
      {t:'Ja, het brandt nu',        d:'', set:{lampje:'aan'},   next:null},
      {t:'Het brandt af en toe',     d:'', set:{lampje:'soms'},  next:null},
      {t:'Nee',                      d:'', set:{lampje:'nee'},   next:null},
      {t:'Weet ik niet',             d:'', set:{lampje:'?'},     next:null}
    ]
  },

  /* ── Handel ── rol bepaalt de toon van het rapport, tijd bepaalt de meting */
  handel_rol: {
    v:'Wat is jouw rol?',
    sub:'Dat bepaalt waar het rapport de nadruk op legt.',
    opt:[
      {t:'Ik wil hem kopen',      d:'Particulier — waar moet ik op letten', set:{rol:'koop'},     next:'handel_tijd'},
      {t:'Ik wil hem verkopen',   d:'Onderbouw wat je vraagt',              set:{rol:'verkoop'},  next:'handel_tijd'},
      {t:'Inruil of inkoop',      d:'Zakelijk taxeren',                     set:{rol:'inkoop'},   next:'handel_tijd'},
      {t:'Lease-inname',          d:'Staat bij terugname vastleggen',       set:{rol:'lease'},    next:'handel_tijd'},
      {t:'Occasionrapport',       d:'Volledig rapport voor de etalage',     set:{rol:'occasion'}, next:'handel_tijd'}
    ]
  },
  handel_tijd: {
    v:'Hoeveel tijd heb je bij de auto?',
    sub:'Stilstaand zie ik veel, maar niet alles. Onder belasting komt de rest boven.',
    opt:[
      {t:'Een paar minuten, stilstaand', d:'Contact aan, motor draait',      set:{meting:'stil'},  next:'handel_gegevens'},
      {t:'Korte proefrit (±2 min)',      d:'Even het blok om',               set:{meting:'rit2'},  next:'handel_gegevens'},
      {t:'Uitgebreide proefrit (±10 min)',d:'Ook snelweg of stevig optrekken',set:{meting:'rit10'}, next:'handel_gegevens'}
    ]
  },
  handel_gegevens: {
    v:'Gegevens toevoegen?',
    sub:'Optioneel, maar het maakt het rapport een stuk concreter. Laat leeg wat je niet weet.',
    type:'gegevens',
    next:null
  },

  /* ── Verbruik ── */
  verbruik_wat: {
    v:'Wat wil je weten?',
    sub:'',
    opt:[
      {t:'Wat verbruikt hij écht',       d:'Gemeten, niet wat de boordcomputer zegt', set:{vraag:'werkelijk'},  next:'verbruik_nu'},
      {t:'Hoe kan ik zuiniger rijden',   d:'Advies op mijn eigen rijstijl',           set:{vraag:'rijstijl'},   next:'verbruik_nu'},
      {t:'Klopt het opgegeven verbruik',  d:'Fabrieksopgave naast de werkelijkheid',  set:{vraag:'opgave'},     next:'verbruik_nu'},
      {t:'Wat kost mijn caravan of aanhanger', d:'Verbruik en belasting bij trekken', set:{vraag:'trekken'},    next:'verbruik_nu'}
    ]
  },
  verbruik_nu: {
    v:'Kun je nu rijden?',
    sub:'Verbruik meten kan alleen onder echte belasting.',
    opt:[
      {t:'Ja, ik rijd nu ±10 minuten', d:'Levert het volledigste beeld',            set:{meting:'rit10'},   next:null},
      {t:'Ja, maar kort (±2 min)',     d:'Snelle indruk',                           set:{meting:'rit2'},    next:null},
      {t:'Nee, meet maar mee onderweg',d:'Passief meelopen tijdens je normale rit', set:{meting:'monitor'}, next:null}
    ]
  },

  /* ── Conditie ── */
  conditie_diep: {
    v:'Hoe grondig wil je het?',
    sub:'Alles wat de auto ondersteunt wordt meegenomen; dit bepaalt vooral hoeveel tijd het kost.',
    opt:[
      {t:'Snel',     d:'Stilstaand, ±2 minuten — foutcodes en systeemtest', set:{meting:'stil',  diepte:'snel'},     next:null},
      {t:'Normaal',  d:'Stilstaand plus een kort rondje — ±5 minuten',      set:{meting:'rit2',  diepte:'normaal'},  next:null},
      {t:'Volledig', d:'Alles, inclusief 10 minuten onder belasting',       set:{meting:'rit10', diepte:'volledig'}, next:null}
    ]
  },

  /* ── Voorbereiding ── */
  voorb_wat: {
    v:'Waar moet hij klaar voor zijn?',
    sub:'',
    opt:[
      {t:'❄️ De winter',              d:'Accu, koelsysteem, verwarming',      set:{voorb:'winter',    meting:'stil'},  next:null},
      {t:'☀️ Warm weer en airco',     d:'Aircoprestatie en koeling',          set:{voorb:'airco',     meting:'stil'},  next:null},
      {t:'🛣️ Een lange rit',          d:'Alles wat onderweg kan opbreken',    set:{voorb:'langerit',  meting:'rit10'}, next:null},
      {t:'🚚 Caravan of aanhanger',   d:'Trekken en de belasting die dat geeft', set:{voorb:'caravan', meting:'rit10'}, next:null},
      {t:'🔧 Een onderhoudsbeurt',    d:'Wat is er nodig, en wanneer',        set:{voorb:'onderhoud', meting:'stil'},  next:null}
    ]
  }
};

/* ── Modules ───────────────────────────────────────────────────────────
   Wat we uit de meetdata halen. Elke module wijst naar een bestaande
   functie; de wizard zet vooraf de juiste parameters.                     */
var MODULES = {
  dtc:       {n:'Foutcodes & readiness', d:'Opgeslagen, sluimerende en permanente codes, met freeze frame', run:function(){ startChoice('dtc'); }},
  systeem:   {n:'Systeemtest',           d:'Sensoren stilstaand tegen hun verwachte gedrag',                run:function(){ startChoice('basiccheck'); }},
  conditie:  {n:'Conditie per systeem',  d:'Oordeel per systeem, met de meetwaarde eronder',                run:function(){ startChoice('check'); }},
  verbruik:  {n:'Verbruik & rijgedrag',  d:'Werkelijk verbruik en wat je rijstijl kost',                    run:function(){ startChoice('fuel'); }},
  aimonteur: {n:'AI-monteur',            d:'Analyse van je klacht tegen de gemeten waarden',                run:function(){ startChoice('diag'); }},
  onderdeel: {n:'Welk onderdeel is kapot?', d:'Foutcodes en meetwaarden samen, teruggebracht tot verdachte onderdelen', run:function(){ openOnderdeelCheck(); }},
  diep:      {n:'Diepe storingsanalyse', d:'Uitgebreide intake plus datalog om het probleem te vangen',     run:function(){ openDeepDiag(); }},
  markt:     {n:'Koop- en verkoopcheck', d:'Staat, historie en onderbouwing van de waarde',
              run:function(j){ veilig(function(){ setKoopMode(j.rol||'koop'); }); openAnalysis('koop'); }},
  klimaat:   {n:'Klimaat & koeling',     d:'Airco of winterklaar, afhankelijk van het seizoen',
              run:function(j){ openClimateCheck(j.voorb==='winter'?'winter':'airco'); }},
  accu:      {n:'Start- & laadsysteem',  d:'Accuspanning, laadgedrag en startgedrag',                       run:function(){ openEVCheck(); }},
  evaccu:    {n:'EV-/hybride-accu',      d:'Accupakket, cellen en laadstatus',                              run:function(){ openEVCheck(); }},
  trekken:   {n:'Trekken',               d:'Belasting en verbruik met caravan of aanhanger',                run:function(){ openCaravan(); }},
  onderhoud: {n:'Onderhoudsplanning',    d:'Wat er nu nodig is en wat kan wachten',                         run:function(){ openOnderhoud(); }},
  langerit:  {n:'Lange rit',             d:'Controle op wat onderweg kan opbreken',                         run:function(){ openLangeRit(); }},
  monitor:   {n:'Passief meelopen',      d:'Waakt de hele rit mee zonder dat je iets hoeft te doen',        run:function(){ openMonitorView(); }},
  recorder:  {n:'Handmatige opname',     d:'Zelf sensoren kiezen en opnemen',                               run:function(){ openPidRecorder(); }}
};

/* Modules die bewust GEEN meeteis hebben — de uitzonderingen, expliciet en op
   één plek, zodat ze niet per ongeluk ontstaan:
     dtc      leest opgeslagen codes; die staan er los van hoe lang je meet.
     monitor  ís de meting zelf.
     recorder ís de meting zelf.
   Al het andere velt een oordeel over live meetwaarden en hoort dus achter de
   poort. Nieuwe module? Standaard poort; hier alleen bij als je kunt uitleggen
   waarom meetdata er niet toe doet. */
var GEEN_MEETEIS = { dtc:1, monitor:1, recorder:1 };

/* Welke kern-PID-set hoort bij welke module (drie-fasenpoort, §19). Staat hier
   los van MODULES zodat de moduletabel zelf onaangeraakt blijft — mechanisch
   en inhoudelijk niet in dezelfde stap. Geen vermelding = geen kernfase; dan
   valt de poort terug op alleen de hoeveelheid/rijtijd-eis, precies zoals
   voorheen. Bewust NIET terugvallen op window._laatstProfiel: dat is het
   profiel van de vórige analyse en zou hier de verkeerde sensoren afdwingen. */
var MODULE_PROFIEL = {
  systeem:'basis', conditie:'basis', aimonteur:'basis', diep:'basis',
  verbruik:'brandstof', onderdeel:'totaal', markt:'totaal', langerit:'totaal',
  accu:'accu', evaccu:'accu', trekken:'rit', klimaat:'basis', onderhoud:'basis'
};

var METING = {
  stil:    {n:'Stilstaand meten',  d:'Contact aan, motor stationair',  tijd:'±2 min'},
  rit2:    {n:'Korte rit',         d:'±2 minuten rijden',              tijd:'±2 min',  start:function(){ openRitAnalyse('2min'); }},
  rit10:   {n:'Rit onder belasting',d:'±10 minuten, ook stevig optrekken', tijd:'±10 min', start:function(){ openRitAnalyse('10min'); }},
  monitor: {n:'Passief meelopen',  d:'De app kijkt mee tijdens je normale rit', tijd:'hele rit', start:function(){ openMonitorView(); }}
};

/* ── Plan samenstellen ──────────────────────────────────────────────────
   Dít is de plek waar "geen dunne eindpunten" wordt afgedwongen: foutcodes
   zitten er altijd in, en bij een EV of hybride komt de accumodule er
   vanzelf bij — ongeacht welke tak je gelopen hebt.                       */
function bouwPlan(j){
  var m = [];
  var voeg = function(k){ if(MODULES[k] && m.indexOf(k)<0) m.push(k); };

  voeg('dtc');                              // altijd — kost niets en verklaart vaak alles

  if(j.doel==='storing'){
    voeg('onderdeel');                      // de smalste vraag eerst: is er iets aan te wijzen?
    voeg('systeem'); voeg('conditie'); voeg('aimonteur');
    if(j.meting==='monitor' || j.lampje==='soms') voeg('diep');
  }
  if(j.doel==='handel'){
    voeg('markt'); voeg('conditie'); voeg('systeem');
    if(j.meting==='rit10') voeg('verbruik');
  }
  if(j.doel==='verbruik'){
    voeg('verbruik');
    if(j.vraag==='trekken') voeg('trekken');
    voeg('conditie');
  }
  if(j.doel==='conditie'){
    voeg('systeem'); voeg('conditie');
    if(j.diepte==='volledig'){ voeg('verbruik'); voeg('aimonteur'); }
  }
  if(j.doel==='voorbereiding'){
    if(j.voorb==='winter'||j.voorb==='airco') voeg('klimaat');
    if(j.voorb==='langerit') voeg('langerit');
    if(j.voorb==='caravan')  voeg('trekken');
    if(j.voorb==='onderhoud')voeg('onderhoud');
    voeg('conditie');
  }

  // Aandrijving: hier lost het "EV-accu is te dun voor een eindpunt" zich op.
  var ev=isEV();
  if(ev) voeg('evaccu'); else voeg('accu');

  if(j.meting==='monitor') voeg('monitor');
  return m;
}

/* ── Toestand ───────────────────────────────────────────────────────────
   job/pad/nu = waar je in de vragenboom staat en wat je hebt geantwoord.
   actief     = er loopt een onderzoek; het plan mag terugkomen. Blijft true
                zodra er een module of meting is gestart, tot je op ✕ drukt.
   gedaan     = welke modules je al geopend hebt (voor de vinkjes).          */
var job = {}, pad = [], nu = 'start';
var actief = false, gedaan = {}, metingGestart = false;

/* ── Zwevende chip ──────────────────────────────────────────────────────
   Zolang het onderzoek loopt en het planscherm verborgen is, hangt hier de
   terugweg. Hij gaat in #fabLane (zie pidlane.css); die baan regelt de
   stapeling rechtsonder, zodat we niet botsen met de rit-monitorchip of
   #remDrivePill. Geen baan gevonden → positioneert hij zichzelf.           */
var chipEl = null;

function chipMaak(){
  if(chipEl) return chipEl;
  var c = document.createElement('div');
  c.id = 'wzChipFab';
  c.style.cssText = 'display:none;align-items:center;gap:7px;background:var(--sur,#151b24);'+
    'border:1.5px solid var(--bd,#26303b);color:var(--tx,#e6e9ef);border-radius:22px;'+
    'padding:7px 13px;font-family:var(--f);font-size:13px;font-weight:800;'+
    'box-shadow:0 6px 18px rgba(0,0,0,.45);cursor:pointer;user-select:none;'+
    '-webkit-tap-highlight-color:transparent';
  c.innerHTML = '<span>🧭</span><span>Mijn plan</span>'+
    '<span id="wzChipTel" style="display:none;min-width:18px;height:18px;padding:0 5px;'+
    'border-radius:9px;background:var(--bl,#00d4ff);color:#0b1016;font-size:11px;'+
    'font-weight:800;line-height:18px;text-align:center"></span>';
  c.title = 'Terug naar het onderzoeksplan';
  c.onclick = function(){ window.PLWizard.terugNaarPlan(); };
  var lane = el('fabLane');
  if(lane){ lane.appendChild(c); }
  else{
    c.style.position='fixed'; c.style.right='12px'; c.style.bottom='14px'; c.style.zIndex='9600';
    document.body.appendChild(c);
  }
  chipEl = c;
  return c;
}

function planZichtbaar(){
  var ov = el('wizardNieuwOv');
  return !!(ov && ov.style.display !== 'none');
}

function chipTick(){
  var toon = actief && !planZichtbaar();
  var c = chipEl || (toon ? chipMaak() : null);
  if(!c) return;
  c.style.display = toon ? 'inline-flex' : 'none';
  if(!toon) return;
  // Teller: hoeveel modules staan er nog open. Niets meer open → geen getal,
  // de chip blijft wel staan zodat je het plan kunt nalopen.
  var open = bouwPlan(job).filter(function(k){ return !gedaan[k]; }).length;
  var t = el('wzChipTel');
  if(t){
    t.textContent = open;
    t.style.display = open ? 'inline-block' : 'none';
  }
}

/* ── Weergave ───────────────────────────────────────────────────────────*/
function scherm(){
  return ''+
  '<div class="wz-top">'+
    '<button class="wz-terug" id="wzTerug" onclick="PLWizard.terug()" title="Vorige vraag">←</button>'+
    '<div class="wz-balk"><div class="wz-balk-in" id="wzBalk"></div></div>'+
    '<button class="wz-sluit" onclick="PLWizard.sluit()" title="Sluiten">✕</button>'+
  '</div>'+
  '<div class="wz-body" id="wzBody"></div>'+
  '<div class="wz-foot" id="wzFoot"></div>';
}

function toonVraag(){
  var k = BOOM[nu];
  if(!k) return toonPlan();
  var body = el('wzBody'), foot = el('wzFoot');
  var diepte = pad.length, totaal = diepte + 2;
  el('wzBalk').style.width = Math.round((diepte/totaal)*100)+'%';
  el('wzTerug').style.visibility = pad.length ? 'visible' : 'hidden';

  var h = '<div class="wz-vraag">'+k.v+'</div>';
  if(k.sub) h += '<div class="wz-sub">'+k.sub+'</div>';

  if(k.type==='tekst'){
    h += '<textarea class="wz-tekst" id="wzTekst" rows="5" placeholder="'+(k.plaats||'')+'">'+
         (job[k.veld]||'').replace(/</g,'&lt;')+'</textarea>';
    body.innerHTML = h;
    foot.innerHTML = '<button class="wz-pri" onclick="PLWizard.tekstVerder()">Volgende →</button>';
    return;
  }
  if(k.type==='gegevens'){
    h += '<div class="wz-velden">'+
      _veld('km',   'Kilometerstand', 'bijv. 142500', 'number')+
      _veld('prijs','Vraagprijz of taxatie (€)', 'bijv. 12950', 'number')+
      _veld('kenteken','Kenteken', 'bijv. 12-ABC-3', 'text')+
      _veld('historie','Onderhoudshistorie', 'bijv. dealeronderhoud t/m 2024, distributie vervangen', 'text')+
      '</div>';
    body.innerHTML = h;
    foot.innerHTML = '<button class="wz-sec" onclick="PLWizard.gegevensVerder(true)">Overslaan</button>'+
                     '<button class="wz-pri" onclick="PLWizard.gegevensVerder(false)">Volgende →</button>';
    return;
  }

  h += '<div class="wz-opts">';
  (k.opt||[]).forEach(function(o,i){
    h += '<button class="wz-opt" onclick="PLWizard.kies('+i+')">'+
           '<span class="wz-opt-t">'+o.t+'</span>'+
           (o.d?'<span class="wz-opt-d">'+o.d+'</span>':'')+
         '</button>';
  });
  h += '</div>';
  body.innerHTML = h;
  foot.innerHTML = '';
}

function _veld(id,label,plaats,type){
  return '<label class="wz-veld"><span>'+label+'</span>'+
         '<input id="wz_'+id+'" type="'+type+'" placeholder="'+plaats+'" value="'+(job[id]||'')+'"></label>';
}

function toonPlan(){
  var mods = bouwPlan(job);
  var meting = METING[job.meting] || METING.stil;
  el('wzBalk').style.width='100%';
  el('wzTerug').style.visibility='visible';

  var af = mods.filter(function(k){ return gedaan[k]; }).length;
  var vink = '<span style="color:var(--gr,#3fbf6f);font-weight:800;margin-right:5px">✓</span>';

  var h = '<div class="wz-vraag">Dit ga ik doen</div>'+
          '<div class="wz-sub">'+
            (af ? af+' van de '+mods.length+' klaar. Ga verder waar je gebleven was — je antwoorden staan er nog.'
                : 'Op basis van je antwoorden. Je kunt hier nog terug.')+
          '</div>'+
          '<div class="wz-plan-kop">1 · Meten</div>'+
          // Stap 1 had als enige regel in dit scherm géén knop, terwijl elke
          // analyse eronder er wél een had. Daarmee wees de hele lijst naar de
          // ongepoorte deur: mensen tikten "Openen" bij een analyse en kregen
          // een rapport zonder dat er ooit gemeten was.
          '<div class="wz-plan-item" id="wzMeting"><b>'+(metingGestart?vink:'')+meting.n+'</b>'+
            '<span>'+meting.d+' · '+meting.tijd+'</span>'+
            '<button class="wz-mod-run" onclick="PLWizard.start()">'+
              (metingGestart?'Nogmaals':'Starten')+'</button></div>'+
          '<div class="wz-plan-kop">2 · Analyseren <span class="wz-tel">'+
            (af ? af+'/'+mods.length : mods.length)+'</span></div>';
  mods.forEach(function(k){
    var M=MODULES[k], klaar=!!gedaan[k];
    h += '<div class="wz-plan-item" id="wzMod_'+k+'"'+
           (klaar?' style="opacity:.72"':'')+'>'+
         '<b>'+(klaar?vink:'')+M.n+'</b><span>'+M.d+'</span>'+
         '<button class="wz-mod-run" onclick="PLWizard.draai(\''+k+'\')">'+
           (klaar?'Nogmaals':'Openen')+'</button></div>';
  });
  if(job.klacht){
    h += '<div class="wz-plan-kop">Jouw omschrijving</div><div class="wz-plan-cite">'+
         job.klacht.replace(/</g,'&lt;')+'</div>';
  }
  el('wzBody').innerHTML = h;
  el('wzFoot').innerHTML =
    '<button class="wz-sec" onclick="PLWizard.opnieuw()">Opnieuw</button>'+
    '<button class="wz-pri" onclick="PLWizard.start()">'+
      (metingGestart ? '▶ Meting nogmaals' : '▶ Beginnen')+'</button>';
}

/* ── Publiek ────────────────────────────────────────────────────────────*/
window.PLWizard = {
  open: function(){
    var ov = el('wizardNieuwOv');
    if(!ov){
      ov = document.createElement('div');
      ov.id='wizardNieuwOv'; ov.className='wz-ov';
      ov.innerHTML = scherm();
      document.body.appendChild(ov);
    }
    job={}; pad=[]; nu='start';
    gedaan={}; metingGestart=false; actief=true;
    ov.style.display='flex';
    veilig(function(){ el('welcomeScreen').classList.add('hidden'); });
    toonVraag();
    chipTick();
  },
  // ✕ = het onderzoek is klaar. Pas hier verdwijnt de chip; overal anders
  // wordt het plan alleen verborgen.
  sluit: function(){
    var ov=el('wizardNieuwOv'); if(ov) ov.style.display='none';
    actief=false;
    chipTick();
    veilig(function(){ goHome(); });
  },
  opnieuw: function(){
    job={}; pad=[]; nu='start';
    gedaan={}; metingGestart=false;
    toonVraag();
  },
  terug: function(){
    if(!pad.length) return;
    nu = pad.pop();
    toonVraag();
  },
  kies: function(i){
    var k=BOOM[nu], o=(k.opt||[])[i]; if(!o) return;
    Object.keys(o.set||{}).forEach(function(s){ job[s]=o.set[s]; });
    pad.push(nu);
    nu = o.next;
    if(nu) toonVraag(); else toonPlan();
  },
  tekstVerder: function(){
    var k=BOOM[nu], v=(el('wzTekst')||{}).value||'';
    if(k.verplicht && !v.trim()){ veilig(function(){ showToast('Vul dit eerst in — hier hangt de hele analyse aan'); }); return; }
    job[k.veld]=v.trim();
    pad.push(nu); nu=k.next;
    if(nu) toonVraag(); else toonPlan();
  },
  gegevensVerder: function(sla){
    if(!sla){
      ['km','prijs','kenteken','historie'].forEach(function(f){
        var i=el('wz_'+f); if(i && i.value.trim()) job[f]=i.value.trim();
      });
    }
    pad.push(nu); nu=BOOM[nu].next;
    if(nu) toonVraag(); else toonPlan();
  },
  draai: function(k){
    var M=MODULES[k]; if(!M) return;
    var self=this;
    var open=function(){
      actief=true; gedaan[k]=true;
      self.sluitStil();
      veilig(function(){ M.run(job); });
      chipTick();
    };
    // TWEEDE DEUR. start() had de meetfase-poort, deze niet — en dit is de
    // deur waar de knoppen in het planscherm naartoe wijzen. Zelfde les als
    // ronde 6 van de PID-gate: een poort op één van de paden is geen poort.
    // plVraagMeting bepaalt zelf het niveau uit job.meting (plMeetNiveau).
    if(GEEN_MEETEIS[k] || typeof plVraagMeting!=='function'){ open(); return; }
    plVraagMeting('normaal', M.n, MODULE_PROFIEL[k] || false).then(function(door){
      if(door){ metingGestart=true; open(); }
      // false = de gebruiker koos een rijtest; die neemt het scherm over.
      // Het plan blijft staan, de chip brengt hem straks terug.
    });
  },
  // Terug naar het plan zonder ook maar iets te resetten. Dit is de ingang
  // die de chip gebruikt; open() blijft de ingang die wél opnieuw begint.
  terugNaarPlan: function(){
    var ov = el('wizardNieuwOv');
    if(!ov){ this.open(); return; }
    actief=true;
    ov.style.display='flex';
    veilig(function(){ el('welcomeScreen').classList.add('hidden'); });
    if(nu) toonVraag(); else toonPlan();
    chipTick();
  },
  start: function(){
    var meting = METING[job.meting] || METING.stil;
    // Klacht doorgeven aan de AI-laag zodat de analyse er meteen op slaat.
    if(job.klacht) veilig(function(){ window._wizKlacht = job.klacht; });
    if(job.rol)    veilig(function(){ setKoopMode(job.rol); });
    window._wizJob = job;
    actief=true; metingGestart=true;
    this.sluitStil();
    if(meting.start) veilig(function(){ meting.start(); });
    else {
      // Stilstaand meten kent geen eigen rijscherm, maar wél een meetfase: de
      // eerste module mag pas draaien als er genoeg monsters binnen zijn.
      // Zonder die stap sprong de wizard hier direct naar het AI-rapport met
      // één momentopname — precies de fout die de meetfase-poort afvangt.
      var mods = bouwPlan(job);
      var eerste = mods.filter(function(k){ return k!=='dtc'; })[0] || 'dtc';
      var draaiEerste = function(){
        gedaan[eerste]=true;
        veilig(function(){ MODULES[eerste].run(job); });
        chipTick();
      };
      if(typeof plVraagMeting==='function'){
        plVraagMeting('normaal','dit onderzoek', job.profiel || false).then(function(door){
          if(door) draaiEerste();
          // Meetfase afgebroken: dan is er ook niets gemeten. Plan terug in
          // beeld, anders sta je met een leeg scherm en een chip te kijken.
          else { metingGestart=false; window.PLWizard.terugNaarPlan(); }
        });
      } else {
        draaiEerste();
      }
    }
  },
  sluitStil: function(){
    var ov=el('wizardNieuwOv'); if(ov) ov.style.display='none';
    chipTick();
  },
  // Voor de diagnosebundel en voor testen
  _plan: function(j){ return bouwPlan(j||job); },
  _job:  function(){ return JSON.parse(JSON.stringify(job)); },
  _actief: function(){ return actief; },
  _gedaan: function(){ return Object.keys(gedaan); },
  _boom: BOOM, _modules: MODULES
};

})();
