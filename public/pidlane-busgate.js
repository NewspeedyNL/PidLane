// ══════════════════════════════════════════════════════════════════
// pidlane-busgate.js
// DE BUS-POORT — één ladder voor "leeft de bus, en mag ik hier een
// oordeel op bouwen?"
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// Die vraag werd op zes plekken gesteld, met zes verschillende antwoorden:
//
//   pidlane-watchers.js   ≥70% van de "actieve" PIDs stil
//   pidlane-bt.js         6× écht lege respons op rij (NO DATA telt niet mee)
//   pidlane-plload.js     foutPct ≥ 80, of perSec === 0
//   pidlane-plload.js     foutPct ≥ 40 (snoei uitstellen)
//   pidlane-verify.js     referentie-PID 010C ≥ 60% respons
//   pidlane-onderdeel.js  foutPct > 8
//
// Op 01-08-2026 om 20:53 liep dat mis. De hele bus viel stil (alles NO DATA,
// contact uit), foutPct schoot naar ~100, en tóch meldde de watcher veertien
// sensoren als uitgevallen — mét de tekst "terwijl de rest doorloopt", terwijl
// er niets meer doorliep.
//
// De oorzaak zat niet in de drempel maar in de vórm van de vraag. Die fractie
// liep over PIDs met ongelijke cadans, en het venster schoof met de
// ineenstorting mee:
//
//   stilte    actief   stil   fractie
//     9 s        40      14     0.35
//    30 s        29      20     0.69   ← nodig was 0.70
//    32 s         9       0     0.00
//
// De snelle PIDs vielen op t=20 s uit "actief" (buitenBeeldFactor 2.5), net
// vóór de trage groep meetelde. Op dit voertuig was 0.70 dus niet streng maar
// ONBEREIKBAAR. Een fractie over ongelijke cadansen kan een rollende
// ineenstorting per definitie niet zien.
//
// DE LADDER (cumulatief, zoals de PID-gate in §15)
//   adapter      — er komt iets terug; de socket leeft
//   ecu          — de auto antwoordt ook echt (niet alles NO DATA)
//   betrouwbaar  — foutgraad laag genoeg om een oordeel op te bouwen
//
// POLARITEIT. De poort beantwoordt niet "is er iets kapot" maar "mag ik hier
// een uitspraak op baseren". Geen verkeer = geen bewijs = geen oordeel, dus
// false. Dat is dezelfde keuze als _echtGevraagd() in de watchers: nooit
// gevraagd → geen oordeel.
//
// Vereist: pidlane-data.js (PLBus) eerder geladen.
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

var CFG = {
  // Reeks écht lege responsen (0 bytes) waarna de adapter als weg geldt.
  // Lager dan de 6 van bt.js: die schakelt de verbinding uit en wil dus
  // zekerheid, deze onderdrukt alleen meldingen en mag eerder aanslaan.
  leegReeks: 3,
  // Foutpercentage over het 10 s-venster van PLBus.stats().
  ecuFoutPct: 50,
  betrouwbaarFoutPct: 15,
  // Onvolledige batchresponsen: structuurprobleem, geen transportfout, dus
  // pas op de bovenste trede relevant.
  betrouwbaarOnvolPct: 40,
  // Nadat de bus hersteld is nog even geen oordelen: de eerste seconden na
  // een hik zitten vol halve reeksen, en juist dáár ontstaan valse
  // bevindingen. Zonder deze rust flikkert de poort en glipt er alsnog een
  // melding doorheen.
  herstelMs: 5000
};

var RANG = { adapter:1, ecu:2, betrouwbaar:3 };

var _laatstSlecht = 0;   // wanneer de bus voor het laatst niet 'ecu' haalde

function _stats(){
  try{
    if(window.PLBus && typeof PLBus.stats==='function') return PLBus.stats();
  }catch(e){}
  return null;
}

/* De rauwe meting achter de poort. Los opvraagbaar voor de diagnosebundel en
   het busdiagnose-scherm, zodat je kunt zien wáárom de poort dichtzit. */
function meet(){
  var uit = {
    verbonden: (typeof connected!=='undefined') ? !!connected : false,
    demo:      (typeof demoMode!=='undefined')  ? !!demoMode  : false,
    leegReeks: 0, perSec: null, foutPct: null, onvolPct: null,
    trede: 'geen', reden: ''
  };
  try{ uit.leegReeks = Number(window._emptyStreak)||0; }catch(e){}

  if(uit.demo){ uit.trede='betrouwbaar'; uit.reden='demomodus'; return uit; }
  if(!uit.verbonden){ uit.reden='niet verbonden'; return uit; }

  if(uit.leegReeks>=CFG.leegReeks){ uit.reden=uit.leegReeks+'× lege respons op rij'; return uit; }

  var s=_stats();
  if(!s){ uit.trede='adapter'; uit.reden='geen busstatistiek beschikbaar'; return uit; }
  uit.perSec=s.perSec; uit.foutPct=s.foutPct; uit.onvolPct=s.onvolPct;

  uit.trede='adapter';
  // Geen verkeer in het venster: de bus is niet aantoonbaar dood, maar er is
  // ook niets om op te oordelen. Blijft op 'adapter' staan.
  if(!(s.perSec>0)){ uit.reden='geen verkeer in het meetvenster'; return uit; }
  if(s.foutPct>=CFG.ecuFoutPct){ uit.reden='foutgraad '+s.foutPct+'% — auto antwoordt nauwelijks'; return uit; }

  uit.trede='ecu';
  if(s.foutPct>CFG.betrouwbaarFoutPct){ uit.reden='foutgraad '+s.foutPct+'% — te rommelig voor een oordeel'; return uit; }
  if(s.onvolPct>CFG.betrouwbaarOnvolPct){ uit.reden='onvolledige responsen '+s.onvolPct+'%'; return uit; }

  uit.trede='betrouwbaar'; uit.reden='bus gezond';
  return uit;
}

/* De poort zelf. Geeft true als de bus MINSTENS het gevraagde niveau haalt. */
function gate(niveau){
  var eis = RANG[niveau] || RANG.ecu;
  var m = meet();
  var nu = Date.now();

  // Herstelrust bijhouden op de 'ecu'-trede: dát is de grens tussen "de auto
  // praat" en "de auto praat niet".
  if((RANG[m.trede]||0) < RANG.ecu){ _laatstSlecht = nu; }
  else if(!m.demo && eis>=RANG.ecu && _laatstSlecht && (nu-_laatstSlecht)<CFG.herstelMs){
    return false;    // net hersteld: eerst even laten zetten
  }

  return (RANG[m.trede]||0) >= eis;
}

/* Voor logs en de diagnosebundel: waarom staat de poort zoals hij staat. */
function status(){
  var m = meet();
  m.herstelRust = Math.max(0, CFG.herstelMs-(Date.now()-_laatstSlecht));
  return m;
}

/* Na een verse verbinding de herstelrust wissen, anders erft een nieuwe
   sessie de stilte van de vorige. */
function reset(){ _laatstSlecht = 0; }

window.PLBusGate = { gate:gate, meet:meet, status:status, reset:reset, cfg:CFG };
})();
