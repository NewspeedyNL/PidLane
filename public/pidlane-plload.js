// ══════════════════════════════════════════════════════════════════
// pidlane-plload.js
// PLLOAD — automatische busbelasting-regeling (AIMD)
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// PLLOAD — automatische busbelasting-regeling (fase 4, AIMD)
// ──────────────────────────────────────────────────────────────────
// Tot nu toe koos de gebruiker handmatig "snel/gebalanceerd/conservatief"
// en stond dat voor de rest van de sessie vast. Maar of de bus het aankan
// hangt af van ECU, adapter, aantal PIDs en batchgrootte — dat weet niemand
// vooraf. Gevolg: bij 17 PIDs op deze i20 liep de bus tegen 100% bezetting
// en werden alle ingestelde intervallen stilzwijgend ~1,4x opgerekt.
//
// Daarom regelen we het nu zoals netwerkcongestie: additive increase,
// multiplicative decrease. Bij ruimte gaan we voorzichtig sneller; bij
// verzadiging meteen fors rustiger. Zo verlies je tempo in plaats van PIDs,
// en wordt de ECU nooit overvraagd.
//
// _loadMult vermenigvuldigt het pollinterval: 1.0 = volle snelheid,
// 2.0 = alles half zo vaak. Staat LOS van _pollMult (verbindingsstrategie)
// zodat een handmatige keuze en de automatiek elkaar niet overschrijven.
const PLLoad={
  _mult:1.0, _laatstTick:0, _sinds:0, _staat:'normaal', _gelogdeMult:undefined,
  // Vorige responstijd, om te zien of hij OPLOOPT. Zie het blok bij `druk`.
  _vorigVenMs:null, _laatstOvergeslagen:0,
  MIN:1.0, MAX:6.0,
  cfg:{
    tickMs:2000,        // niet vaker bijregelen dan dit
    bezetOp:85,         // % bustijd waarboven we terugschroeven
    bezetAf:55,         // % waaronder we weer ruimte pakken
    foutOp:10,          // % mislukte commando's = te hard duwen
    traagMs:400,        // responstijd die op bufferen wijst
    doodPct:80,         // vrijwel alles mislukt
    omhoog:1.35,        // multiplicative decrease van het tempo
    omlaag:0.05,        // additive increase van het tempo (in de ruime zone)
    // Hoeveel de responstijd moet oplopen tegenover de vorige tick voordat
    // het als tegendruk telt. 1.15 = 15% erbij. Ruim genoeg om ruis (een
    // enkele trage respons) niet als tegendruk te lezen, streng genoeg om
    // een echte opbouw te zien voordat hij traagMs haalt.
    venStijgFactor:1.15,
    // Trage terugloop binnen de dode zone (bezetAf..bezetOp). Zonder deze
    // stap is de dode zone een VAL in plaats van een demping — zie het blok
    // hieronder. Klein gehouden zodat hij de hysterese niet ondermijnt: het
    // is aftasten, geen regelen.
    omlaagTraag:0.03,
    // Alleen aftasten als de bus écht rustig is, niet zodra hij niet druk is.
    kalmFoutPct:5
  },

  mult(){ return this._mult; },

  /* ── WELKE ZONE HOORT BIJ DEZE CIJFERS ────────────────────────────────
     Uitgeknipt uit tick() op 02-09-2026 (#76), zonder de regel zelf aan te
     raken. Reden: de testrun spiegelde deze beoordeling in PLBudget.zone() om
     achteraf te kunnen zien welke tak PLLoad zou hebben gekozen — en die
     spiegel was op 23-08 niet meeverhuisd. Blok 7 meldde daardoor "druk 87%"
     over een rit waarin PLLoad geen enkele keer verlaagde, naast "geen enkele
     stap omlaag". Twee regels voor één begrip, en de kopie stuurde de lezer
     naar een defecte regelkring die er niet was.

     Pure functie, met alles wat hij nodig heeft als argument: de statistieken,
     de vorige responstijd (voor venStijgt) en de multiplier (voor kalm). Zo
     kan de testrun hem op een oud spoor draaien zonder de lopende regeling
     aan te raken.

     LET OP bij het wijzigen van de regel: dit is nu de enige plek. Verander
     hem hier en zowel de regeling als het verslag verandert mee — dat is het
     hele punt. */
  zoneVan(s, vorigVenMs, mult){
    if(!s) return 'stil';
    const foutDruk  = s.foutPct>=this.cfg.foutOp;
    const bezetHoog = s.belasting>=this.cfg.bezetOp;
    const venTraag  = s.venGemMs>=this.cfg.traagMs;
    const venStijgt = vorigVenMs!=null && s.venGemMs>=vorigVenMs*this.cfg.venStijgFactor;
    const druk = foutDruk || (bezetHoog && (venTraag || venStijgt));
    const ruim = s.belasting<this.cfg.bezetAf && s.foutPct<this.cfg.foutOp;
    const m = (typeof mult==='number') ? mult : this._mult;
    const kalm = !druk && !ruim && s.foutPct<=this.cfg.kalmFoutPct &&
                 s.venGemMs<this.cfg.traagMs && m>this.MIN;
    if(druk) return 'druk';
    if(ruim) return 'ruim';
    if(kalm) return 'kalm';
    return 'stil';                     // dode zone zonder aftasten
  },

  // Eén regelstap. Wordt aan het eind van elke pollronde aangeroepen en
  // regelt zichzelf af op cfg.tickMs, dus extra aanroepen zijn onschadelijk.
  tick(){
    const nu=Date.now();
    if(nu-this._laatstTick<this.cfg.tickMs) return;
    this._laatstTick=nu;
    if(!connected||demoMode){ this._mult=1.0; this._staat='normaal'; return; }
    let s=null;
    try{ s=(window.PLBus&&typeof PLBus.stats==='function')?PLBus.stats():null; }catch(e){ console.warn('PLBus.stats mislukt:', e); }
    if(!s) return;
    /* ── BEZETTING ALLEEN IS GEEN TEGENDRUK (23-08-2026) ──────────────────
       Hier stond `belasting>=bezetOp || foutPct>=foutOp`. Die OF was de fout:
       een hoge bezetting sloeg op zichzelf al aan, ongeacht of er iets
       misging.

       Uit het veldlog van 23-08 (48 minuten, bergen op en af, met bulk-
       recorder, caravan-tracker, rijmonitor en waakronde tegelijk aan):
       86 verlagingen tegen 21 verhogingen, en 61 van die 86 bij foutgraad
       NUL. Het patroon is een cascade — om 12:19 ging het tempo in 22
       seconden van 74% naar 17% terwijl de bezetting op 93-100% bleef
       staan. Verlagen bracht de bezetting dus niet omlaag.

       Waarom niet: PLLoad regelt zíjn pollronde, maar de waakronde (15
       sensoren per 60 s, buiten de selectie), de bulk-recorder en de
       profielwissels vullen de bus ook. De bezetting weerspiegelt ál dat
       verkeer; het budget raakt maar een deel. Zo knijpt hij zichzelf af
       voor drukte die hij niet veroorzaakt en niet kan wegnemen.

       Daarom nu: bezetting telt alleen mee mét een tweede signaal dat er
       echt iets vastloopt — een responstijd die oploopt of al boven
       traagMs zit. Fouten blijven een zelfstandige trigger; die zijn per
       definitie echte tegendruk.

       Nagerekend op datzelfde log: van de 86 verlagingen blijven er 26
       staan, waarvan 24 bij een responstijd boven 400 ms of oplopend. De
       cascade van 12:19 (600-700 ms) verlaagt dus nog steeds — terecht.
       Die van 11:37 (97-101 ms bij 85-87% bezet) niet meer. */
    // De regel zelf staat in zoneVan() hierboven, zodat de testrun hem kan
    // lenen in plaats van overschrijven (#76). bezetHoog is hier apart nodig
    // voor de "vastgehouden"-logregel onderaan: die gaat juist over het geval
    // dat de bezetting hoog is en er tóch niet verlaagd wordt.
    const bezetHoog = s.belasting>=this.cfg.bezetOp;
    const _zone = this.zoneVan(s, this._vorigVenMs, this._mult);
    const druk = _zone==='druk';
    const ruim = _zone==='ruim';
    /* ── DE DODE ZONE WAS EEN VAL ────────────────────────────────────────
       Tussen bezetAf (55%) en bezetOp (85%) was `_mult` bevroren: niet druk,
       niet ruim, dus geen enkele stap. Bedoeld als demping, in de praktijk
       een eenrichtingsdeur.

       Op 01-08-2026 liep dat vast. Om 14:03:29 stond `_mult` op 6.0 (MAX,
       tempo 17%) en daar bleef hij, vijf uur lang: in de bundel van 20:48
       staat mult 6 bij foutPct 0 en belasting 67. Alle vier de logregels van
       die sessie zeggen "verlaagd", geen enkele "verhoogd".

       De kern is dat `ruim` op dit voertuig ONBEREIKBAAR was. Bezetting is
       aanvraagtempo × responstijd, en met 40 PIDs à ~105 ms komt zelfs op
       MAX niet lager dan ~67%. Wachten tot de bezetting onder de 55% zakt is
       dus wachten op iets dat niet kan gebeuren — dezelfde vorm als de
       bus-poort die op 0.70 wachtte.

       Daarom tasten we nu af in plaats van te wachten: is het niet druk en
       is de foutgraad écht laag, dan zakt `_mult` met kleine stapjes tot de
       bezetting tegen bezetOp aan loopt. Daar slaat `druk` toe en gaat hij
       weer omhoog. Dat is hoe AIMD hoort te werken — voorzichtig omhoog
       tasten, hard terug bij tegendruk — en het vindt de echte grens van
       deze bus in plaats van op MAX te blijven staan. */
    const kalm = _zone==='kalm';
    const vorig=this._mult;
    if(druk)       this._mult=Math.min(this.MAX, this._mult*this.cfg.omhoog);
    else if(ruim)  this._mult=Math.max(this.MIN, this._mult-this.cfg.omlaag);
    else if(kalm)  this._mult=Math.max(this.MIN, this._mult-this.cfg.omlaagTraag);
    this._mult=Math.round(this._mult*100)/100;
    // Alleen loggen bij een merkbare stap, anders loopt de BT-log vol. De
    // trage terugloop zet stapjes van 0,03 en zou zo nooit in de log komen,
    // terwijl juist die beweging laat zien dát de regeling nog leeft; daarom
    // wordt hij gemeten vanaf de laatst gelogde stand in plaats van vanaf de
    // vorige tick.
    if(Math.abs(this._mult-vorig)>=0.2){
      btDiag(`Pollbudget ${this._mult>vorig?'verlaagd':'verhoogd'} naar ${(100/this._mult).toFixed(0)}% `+
             `(bezet ${s.belasting}%, fout ${s.foutPct}%, ${s.venGemMs}ms)`, this._mult>vorig?'warn':'info');
      this._gelogdeMult=this._mult;
    } else if(this._gelogdeMult!==undefined && Math.abs(this._mult-this._gelogdeMult)>=0.5){
      btDiag(`Pollbudget stapsgewijs ${this._mult>this._gelogdeMult?'verlaagd':'verhoogd'} naar `+
             `${(100/this._mult).toFixed(0)}% (bezet ${s.belasting}%, fout ${s.foutPct}%, ${s.venGemMs}ms)`,'info');
      this._gelogdeMult=this._mult;
    } else if(this._gelogdeMult===undefined){
      this._gelogdeMult=this._mult;
    }
    /* Zonder deze regel is de wijziging van 23-08 onmeetbaar: je ziet in het
       log alleen minder verlagingen, en weet niet of dat komt doordat de
       voorwaarde werkt of doordat de rit rustiger was. Nu staat er zwart op
       wit dat de oude code hier verlaagd zou hebben en waarom dat niet meer
       gebeurt. Hooguit eens per 20 s, anders loopt de log vol — op het log
       van 23-08 zou dit 60 keer gevuurd hebben. */
    if(bezetHoog && !druk && nu-this._laatstOvergeslagen>20000){
      this._laatstOvergeslagen=nu;
      btDiag(`Pollbudget vastgehouden op ${(100/this._mult).toFixed(0)}% — bezet ${s.belasting}% `+
             `maar responstijd ${s.venGemMs}ms (vorige ${this._vorigVenMs==null?'—':this._vorigVenMs+'ms'}), fout ${s.foutPct}%`,'warn');
    /* 'warn' en niet 'info' (24-08). Op info-niveau haalde deze regel de
       logboek-export niet: na de rit van 23-08 was hij alleen terug te
       vinden in de diagbundel bínnen de testrun. Uitgerekend de regel die
       moet bewijzen dat de ingreep van 23-08 werkt was dus niet op te
       zoeken in het log dat je opstuurt. De cooldown van 20 s houdt het
       volume in toom — op het log van 23-08 zou dit 60 keer gevuurd
       hebben, nu hooguit drie keer per minuut. */
    }
    this._vorigVenMs=s.venGemMs;
    this._staat=this._bepaalStaat(s);
  },

  _bepaalStaat(s){
    if(s.foutPct>=this.cfg.doodPct || (s.perSec===0&&connected)) return 'dood';
    if(s.venGemMs>=this.cfg.traagMs && s.foutPct<20)             return 'bufferend';
    if(this._mult>=1.5)                                          return 'langzaam';
    if(this._mult<=1.0 && s.belasting<this.cfg.bezetAf)          return 'snel';
    return 'normaal';
  },

  // Voor de UI: één afgeleide toestand met kleur en uitleg. Bewust NIET
  // instelbaar — het is een meting, geen keuze.
  staat(){
    const M={
      snel:      ['⚡ snel',      'var(--gn)', 'ruimte over, alles op vol tempo'],
      normaal:   ['✅ normaal',   'var(--gn)', 'haalt de ingestelde intervallen'],
      langzaam:  ['🐢 langzaam',  'var(--or)', 'teruggeschroefd om de ECU bij te laten benen'],
      bufferend: ['📦 bufferend', 'var(--or)', 'antwoorden komen traag binnen — adapter loopt achter'],
      dood:      ['💀 dood',      'var(--rd)', 'vrijwel geen geldige antwoorden meer']
    };
    const m=M[this._staat]||M.normaal;
    return { code:this._staat, label:m[0], kleur:m[1], uitleg:m[2],
             tempoPct:Math.round(100/this._mult), mult:this._mult };
  },

  // _vorigVenMs moet hier mee: na een protocolherstel is de oude responstijd
  // van vóór de storing geen geldig ijkpunt meer. Bleef hij staan, dan zou de
  // eerste tick na herstel een "daling" zien tegenover een waarde uit een
  // heel andere toestand.
  reset(){ this._mult=1.0; this._staat='normaal'; this._laatstTick=0; this._gelogdeMult=undefined;
           this._vorigVenMs=null; this._laatstOvergeslagen=0; }
};
window.PLLoad=PLLoad;

function pidPollInterval(pid){
  // Focus-PIDs (klacht-gestuurd, idee 5) altijd op het snelste tempo
  if(_focusPIDs.has(pid)) return 120;
  // Fabrikant-PIDs (mode 21) hebben dezelfde SUFFIX als een mode-01-PID:
  // '2101' eindigt op '01', net als '0101' (monitorstatus). Alle tabellen
  // hieronder zijn op suffix gebouwd, dus zonder deze afslag zou een
  // mode-21-PID de pollklasse én het EV-filter van een wildvreemde
  // mode-01-PID erven. Ze meten allemaal traag (olietemp, kleptiming),
  // dus één vaste trage klasse volstaat.
  if(!/^01/i.test(String(pid))) return 10000;
  const suf=pid.slice(2).toUpperCase();
  // EV-modus: verbrandingsmotor-PIDs effectief uitschakelen
  if(typeof _evModeActive!=='undefined' && _evModeActive && typeof ICE_PIDS_SUFFIX!=='undefined' && ICE_PIDS_SUFFIX.has(suf)) return 999999;
  const prof=(window.POLL_PROFIELEN||{})[actiefPollProfiel()]||{mult:1,ovr:{}};
  let basis=null;
  // 1) Profiel-override wint: dit ís de reden dat profielen bestaan
  if(prof.ovr && prof.ovr[suf]!==undefined) basis=prof.ovr[suf];
  if(basis===null){
    // 2) Motortype-afhankelijke prioriteiten
    const et=(typeof detectEngineType==='function')?detectEngineType():'benzine';
    if(et==='hybride'||et==='ev'){
      if(['42','5B','5C','15B'].includes(suf)) basis=500; // accu/spanning vaker
      else if(['0C','0D'].includes(suf)) basis=150;       // RPM/snelheid altijd snel
    } else if(et==='diesel'){
      if(['23','59'].includes(suf)) basis=200;            // raildruk snel
      else if(['7A','7B','7C','7D'].includes(suf)) basis=5000; // DPF minder snel
    }
  }
  if(basis===null) basis=PID_POLL_CLASS[suf]||1000;       // 3) default MEDIUM
  // x profiel x verbindingsstrategie x automatische belastingsregeling.
  // Focus-PIDs blijven ongemoeid (die returnen hierboven al).
  const lm=(window.PLLoad&&typeof PLLoad.mult==='function')?PLLoad.mult():1;
  return Math.max(80, Math.round(basis * (prof.mult||1) * (typeof _pollMult!=='undefined'?_pollMult:1) * lm));
}
// Welke PIDs zijn NU "due" om te pollen?
// ── DODE-PID-SNOEI ──────────────────────────────────────────────────
// PIDs die de bitmap als "ondersteund" opgeeft maar die op dit voertuig
// elke ronde NO DATA geven (bv. olietemp/verbruik/omgevingstemp op deze
// Mazda). Elke NO DATA-poll wacht de timeout uit (~500ms), dus ze vertragen
// de hele cyclus én laten batches "onvolledig" lijken. Na een paar lege
// antwoorden snoeien we ze uit de poll; elke ~2 min krijgt een dode PID één
// herkansing (komt-ie later tot leven, dan keert-ie vanzelf terug).
const _noDataStreak={}, _pidDead=new Set(), _pidDeadSince={};
// Drempels aangepast op 23-08-2026 aan het besluit over stille sensoren:
// vijf mislukte pogingen (was vier), daarna één herkansing per minuut (was
// per twee minuten), en na vijf mislukte herkansingen gaat de sensor via
// `pidOpruimen()` uit de selectie. Vóór vandaag bleef hij eeuwig herkansen.
const PID_DEAD_THRESHOLD=5, PID_REPROBE_MS=60000;
const PID_OPRUIM_NA=5;
// Per PID: hoeveel herkansingen er al mislukt zijn sinds hij gesnoeid werd.
const _pidHerkans=Object.create(null);

// ── CADANS-REGISTER (fase 4) ────────────────────────────────────────
// Tot nu toe bestond nergens in de app het onderscheid tussen "deze PID is
// niet gevraagd" en "deze PID is gevraagd en gaf geen antwoord". Watchers
// lazen alleen pidHist en concludeerden "dood" uit stilte die de scheduler
// zélf veroorzaakte: de TRAAG-klasse staat op 10s terwijl de watcher uitval
// uitriep na 8s — een gegarandeerde valse melding, elke ronde opnieuw.
// Hieronder houden we per PID bij wanneer we het laatst ECHT geprobeerd
// hebben en wanneer dat lukte; window.PLSched publiceert dat naar buiten.
const _pidLastTry={}, _pidLastOk={}, _streakSince={};

// Snoeien telde per POGING, terwijl pogingen 83× uit elkaar liggen: 6 missers
// op een 120ms-PID is 0,7s (busruis), op een 10s-PID een volle minuut.
// Zelfde regel, totaal andere betekenis. Daarom nu ook een eis in ECHTE tijd:
// een absolute bodem én een veelvoud van de eigen cadans.
const PID_DEAD_MIN_SPAN_MS=3000, PID_DEAD_SPAN_FACTOR=3;
// Is de bus als geheel ziek, dan ligt het niet aan deze ene PID.
const PID_DEAD_BUS_FOUT_PCT=40;

// ── PID-KWALITEITSSCORE 0-100 (fase 2) ──────────────────────────────
// Een enkele misser maakt een sensor niet kapot. We houden per PID een
// voortschrijdend gemiddelde bij van geslaagde reads. Pas als de score
// écht laag is én er een reeks missers achter elkaar staat, snoeien we.
// De score gaat ook mee in rapporten: "MAP 62% betrouwbaar" zegt meer dan
// een harde aan/uit-vlag.
const _pidQual={};
function pidQuality(pid){ return _pidQual[pid]===undefined?100:Math.round(_pidQual[pid]); }
function _qualBump(pid,goed){
  const oud=_pidQual[pid]===undefined?100:_pidQual[pid];
  // Omhoog rustig (+4), omlaag stevig (-12): één misser mag opvallen,
  // maar herstel moet verdiend worden.
  _pidQual[pid]=Math.max(0,Math.min(100, oud + (goed?4:-12)));
}
window.pidQuality=pidQuality;

function markPidData(pid){
  const nu=Date.now();
  _pidLastTry[pid]=nu; _pidLastOk[pid]=nu;
  _noDataStreak[pid]=0; delete _streakSince[pid];
  _qualBump(pid,true);
  if(_pidDead.delete(pid)){
    delete _pidDeadSince[pid];
    // Een geslaagde herkansing wist de teller volledig. Anders zou een
    // sensor die af en toe hapert na genoeg losse haperingen alsnog worden
    // opgeruimd, terwijl hij het grootste deel van de tijd gewoon werkt.
    if(_pidHerkans[pid]){
      btDiag(`PID ${pid} antwoordt weer na ${_pidHerkans[pid]} mislukte herkansing(en) — terug in de ronde`,'info');
      delete _pidHerkans[pid];
    }
  }
}
function markPidNoData(pid){
  const nu=Date.now();
  _pidLastTry[pid]=nu;
  if(!_streakSince[pid]) _streakSince[pid]=nu;
  _noDataStreak[pid]=(_noDataStreak[pid]||0)+1;
  _qualBump(pid,false);
  if(_pidDead.has(pid)){
    // Dit was een HERKANSING, en die is mislukt. Na PID_OPRUIM_NA mislukte
    // herkansingen gaat de sensor de deur uit. Vóór 23-08 bleef hij hier
    // eindeloos in rondjes lopen: elke minuut één timeout, een hele rit lang.
    _pidHerkans[pid]=(_pidHerkans[pid]||0)+1;
    if(_pidHerkans[pid]>=PID_OPRUIM_NA && typeof pidOpruimen==='function'){
      pidOpruimen(pid, `${PID_DEAD_THRESHOLD} pogingen plus ${_pidHerkans[pid]} herkansingen zonder antwoord`);
      _pidDead.delete(pid); delete _pidDeadSince[pid]; delete _pidHerkans[pid];
    }
    return;
  }
  // Snoeien vereist nu VIER dingen, niet twee:
  //   1) een reeks missers            2) een lage kwaliteitsscore
  //   3) die reeks duurt ook in ECHTE tijd lang genoeg voor déze cadans
  //   4) de bus zelf is gezond (anders straffen we de verkeerde)
  if(_noDataStreak[pid]<PID_DEAD_THRESHOLD) return;
  if(pidQuality(pid)>=35) return;
  const eis=Math.max(PID_DEAD_MIN_SPAN_MS, PID_DEAD_SPAN_FACTOR*pidPollInterval(pid));
  const duur=nu-(_streakSince[pid]||nu);
  if(duur<eis) return;
  try{
    const s=(window.PLBus&&typeof PLBus.stats==='function')?PLBus.stats():null;
    if(s && typeof s.foutPct==='number' && s.foutPct>=PID_DEAD_BUS_FOUT_PCT){
      btDiag(`PID ${pid} zou gesnoeid worden, maar bus zelf is ziek (${s.foutPct}% fout) — uitgesteld`,'warn');
      return;
    }
  }catch(e){ /* stil: melding mag nooit de stroom breken */ }
  _pidDead.add(pid); _pidDeadSince[pid]=nu;
  btDiag(`PID ${pid} ${_noDataStreak[pid]}× geen data over ${Math.round(duur/1000)}s (kwaliteit ${pidQuality(pid)}%) — gesnoeid (herkansing over ${PID_REPROBE_MS/1000}s)`,'info');
}

// ── PLSched: cadans-register naar buiten (fase 4) ───────────────────
// Iedere afnemer (watchers, monitor, verify, rapport) kan hiermee zien of
// stilte betekent "nog niet aan de beurt" of "gevraagd en niets terug".
// Zonder dit onderscheid is elke uitvaldetectie giswerk.
window.PLSched={
  interval(pid){ try{ return pidPollInterval(pid); }catch(e){ return 0; } },
  laatstePoging(pid){ return _pidLastTry[pid]||0; },
  laatsteSucces(pid){ return _pidLastOk[pid]||0; },
  dood(pid){ return _pidDead.has(pid); },
  herkansingen(pid){ return _pidHerkans[pid]||0; },
  opgeruimd(){ try{ return pidOpgeruimdLijst(); }catch(e){ return []; } },
  kwaliteit(pid){ return pidQuality(pid); },
  actief(){ try{ return Array.from(activePIDs); }catch(e){ return []; } },
  info(pid){
    return { pid, interval:this.interval(pid),
             laatstePoging:this.laatstePoging(pid), laatsteSucces:this.laatsteSucces(pid),
             dood:this.dood(pid), kwaliteit:this.kwaliteit(pid) };
  }
};

function pidsDueNow(){
  const now=Date.now();
  const due=[];
  for(const pid of activePIDs){
    if(_pidDead.has(pid)){
      // Dode PID: alleen elke PID_REPROBE_MS één herkansing toelaten
      if(now-(_pidDeadSince[pid]||0) < PID_REPROBE_MS) continue;
      _pidDeadSince[pid]=now;   // herkansing nu — verspreidt re-probes in de tijd
    }
    const next=_pidNextPoll[pid]||0;
    if(now>=next) due.push(pid);
  }
  // PRIORITEIT (fase 2): loopt de bus achter, dan gaan de belangrijke
  // signalen eerst. Sorteren op poll-interval doet dat vanzelf — toerental
  // (120ms) en accuspanning in accuprofiel (500ms) staan vooraan, brandstof-
  // peil (60s) achteraan. Bij gelijk interval: langst wachtende eerst, zodat
  // niets structureel achteraan blijft hangen.
  due.sort((a,b)=>{
    const d=pidPollInterval(a)-pidPollInterval(b);
    if(d) return d;
    return (_pidNextPoll[a]||0)-(_pidNextPoll[b]||0);
  });
  return due;
}

function startPoll(){
  clearInterval(pollTimer);
  dataStable=false; stabilityCount={}; pidSmooth={}; outlierCount={}; window._stabilityT0=null;
  _pidNextPoll={};
  try{ PLLoad.reset(); }catch(e){ console.warn('PLLoad.reset mislukt:', e); }   // nieuwe PID-set = budget opnieuw ijken
  document.getElementById('aiContent').innerHTML=`<div class="ai-ph"><div class="pi">📡</div><p>Data valideren...<br><br>Even geduld — outliers worden gefilterd voor betrouwbare analyse.</p></div>`;

  // Scheduler-tick: 100ms. Per tick worden alleen de PIDs gepolld die volgens
  // hun klasse "due" zijn. Zo blijft toerental vloeiend terwijl temperatuur
  // het kanaal niet onnodig bezet houdt.
  pollTimer=setInterval(async()=>{
    if(!connected||!activePIDs.size) return;
    // Echt busslot (fase 1): geen kale boolean meer. Houdt een zware lezer
    // (sweep/survey/verificatie) de bus vast, dan slaan we deze tik over —
    // en geven we NOOIT per ongeluk hún slot vrij.
    const _busTok=PLBus.claim('poll');
    if(!_busTok) return;
    try{
      if(demoMode){
        // Demo: respecteer dezelfde scheduling zodat het tempo realistisch oogt
        const due=pidsDueNow();
        const now=Date.now();
        for(const pid of due){
          const resp=demo(pid);
          _pidNextPoll[pid]=now+pidPollInterval(pid);
          if(resp!=null){ updPID(pid,resp); checkStability(pid,resp); feedDatalog(pid,resp); feedSessionStat(pid,resp); }
        }
        if(due.length) runCorrelationEngine();
        if(due.length) updateEVMode();
        return;
      }

      const due=pidsDueNow();
      if(!due.length) return;   // niets aan de beurt deze tick
      const now=Date.now();
      // Herplannen vanaf de DEADLINE, niet vanaf nu. 'now' wordt vastgelegd
      // vóór alle I/O, maar een ronde duurt honderden ms — vanaf now tellen
      // betekende dus stilzwijgend "ingesteld interval + rondeduur", waardoor
      // 10s in de praktijk 14s werd. Loopt een PID te ver achter (survey hield
      // de bus vast), dan ijken we opnieuw vanaf nu in plaats van in te halen:
      // een inhaalstorm belast de ECU precies op het verkeerde moment.
      due.forEach(pid=>{
        const iv=pidPollInterval(pid);
        const vorige=_pidNextPoll[pid]||0;
        const vanafDeadline=vorige+iv;
        _pidNextPoll[pid] = (vorige && vanafDeadline>now) ? vanafDeadline : now+iv;
      });

      // Multi-PID batch alleen op CAN (ISO 15765). Andere protocollen
      // ondersteunen geen meervoudige PID-requests → sequentieel.
      const isCAN=/^[6-9A-Ca-c]/.test(String(selectedNetwork?.id||''));
      const canBatch=isCAN&&window._batchSupported!==false;

      // ── BATCH-DIAGNOSTIEK (tijdelijk) — onthult waarom multi-PID faalt ──
      // Max 1×/4s zodat de 📡 BT-log niet volloopt. Toont protocol-id, isCAN,
      // of batch aanstaat, hoeveel PIDs 'due' zijn en wat er gekozen wordt.
      if(!window._lastBatchDiag||Date.now()-window._lastBatchDiag>4000){
        window._lastBatchDiag=Date.now();
        btDiag(`BATCH-diag: proto-id="${selectedNetwork?.id||'?'}" isCAN=${isCAN} batchAan=${window._batchSupported!==false} due=${due.length} → ${(canBatch&&due.length>1)?'BATCH':'sequentieel'}`,'info');
      }

      if(canBatch&&due.length>1){
        // Bitmap-PIDs (0100/0120/.../0180) NIET batchen: in de praktijk (o.a.
        // Mazda SkyActiv) antwoordt de ECU NO DATA op élke multi-PID request
        // die een bitmap bevat — batches zónder bitmap werkten in dezelfde
        // sessie prima. Dát waren de echte dips. Data-PIDs batchen, bitmaps
        // sequentieel achteraan.
        const isBitmapPid=p=>/^01(00|20|40|60|80|A0|C0)$/i.test(p);
        // Multi-PID batching is een eigenschap van mode 01 op CAN. Mode 21
        // (fabrikant-PIDs, zie pidlane-uitgebreid.js) kent het niet: die
        // moeten solo. Zonder deze scheiding zou '2101' in een batch als
        // '01'+'01' meegaan en stilzwijgend mode 01 PID 01 opleveren.
        const _m01=p=>(typeof isMode01==='function')?isMode01(p):/^01/i.test(String(p));
        const soloPids=due.filter(p=>isBitmapPid(p)||!_m01(p));
        const batchable=due.filter(p=>!isBitmapPid(p)&&_m01(p));
        // Groepsgrootte is nu ADAPTIEF (fase 2): start op 3, zakt bij
        // herhaalde onvolledige respons naar 2 en dan 1, en klimt na 25
        // schone rondes weer terug. Beter dan batch volledig uitzetten:
        // sommige ECU's kunnen prima 2 PIDs aan, maar geen 3.
        const _grpN=PLBus.batchGroep();
        for(let g=0;g<batchable.length;g+=_grpN){
          if(!connected) break;
          const grp=batchable.slice(g,g+_grpN);
          const cmd='01'+grp.map(p=>p.slice(2)).join('');   // grp is nu gegarandeerd mode 01
          const raw=await sendCmd(cmd,2500);
          const parsed=splitBatchResponse(raw,grp);
          _diagNote(cmd, raw, grp, parsed);
          // Per-PID telemetrie: hier weten we exact wat gevraagd is en wat
          // terugkwam, dus dit is de enige plek waar `mis` betrouwbaar te
          // tellen valt (zie PLBus.notePids).
          try{ PLBus.notePids(grp, null, parsed); }catch(e){ console.warn('PLBus.notePids mislukt:', e); }
          const got=Object.keys(parsed).length;
          if(got===0){
            // Zit er wél een 41-payload in de respons? Dan kwam de data goed
            // binnen en is dit een parse-probleem aan ónze kant — batch niet
            // uitschakelen, alleen loggen. Alleen leeg/NO DATA telt als dip.
            if(/41[0-9A-F]{2}/i.test(String(raw||''))){
              btDiag(`Multi-PID parse-fout TX="${cmd}" RX="${String(raw).replace(/[\r\n]/g,' ').slice(0,60)}" — geen dip`,'warn');
            } else {
              batchDip();
              btDiag(`Multi-PID leeg TX="${cmd}" RX="${String(raw).replace(/[\r\n]/g,' ').slice(0,60)}" — dip`,'warn');
            }
            continue;
          }
          // ≥1 PID terug = batch wérkt. Verwerk wat binnenkwam; ontbrekende PIDs
          // zijn op dit voertuig NO DATA → tel mee voor snoei (NIET sequentieel
          // herhalen — dat was de grote tijdverspilling).
          batchOk();
          for(const pid of grp){
            if(parsed[pid]){
              const r=applyParsedBytes(pid,parsed[pid]);
              if(r!=null){ markPidData(pid); updPID(pid,r); checkStability(pid,r); feedDatalog(pid,r); feedSessionStat(pid,r); }
              else markPidNoData(pid);
            } else {
              markPidNoData(pid);
            }
          }
        }
        // Bitmap-PIDs één voor één ('1'-suffix voor snelle terugkeer) —
        // deze weigeren batches maar antwoorden solo prima.
        for(const pid of soloPids){
          if(!connected) break;
          const resp=parsePID(pid,await sendCmd((typeof pidCmd==='function')?pidCmd(pid,true):('01'+pid.slice(2)+'1'),2500));
          if(resp!=null){ markPidData(pid); updPID(pid,resp); checkStability(pid,resp); feedDatalog(pid,resp); feedSessionStat(pid,resp); }
          else markPidNoData(pid);
        }
      } else {
        // Sequentieel: één PID per request, '1'-suffix voor snelle terugkeer
        for(const pid of due){
          if(!connected) break;
          const resp=parsePID(pid,await sendCmd((typeof pidCmd==='function')?pidCmd(pid,true):('01'+pid.slice(2)+'1'),2500));
          if(resp!=null){ markPidData(pid); updPID(pid,resp); checkStability(pid,resp); feedDatalog(pid,resp); feedSessionStat(pid,resp); }
          else markPidNoData(pid);
        }
      }
      // Idee 4: na elke pollronde de deterministische correlatie-check draaien
      runCorrelationEngine();
      updateEVMode();
      // Regelkring: meet de verzadiging en stel het pollbudget bij (fase 4).
      // Zelf-afgeregeld op cfg.tickMs, dus elke ronde aanroepen is prima.
      try{ PLLoad.tick(); }catch(e){ console.warn('PLLoad.tick mislukt:', e); }
    }finally{
      PLBus.release(_busTok);
    }
  },100);
}

// ── P8: batch-uitval met herstel i.p.v. permanent uitschakelen ──
let _batchDips=0, _batchOffSince=0;
function batchDip(){
  _batchDips++;
  // Eerst een trapje kleiner proberen (3->2->1). Pas als dat óók niet helpt
  // valt de code hieronder terug op batch helemaal uit.
  if(_batchDips>=2 && PLBus.batchKleiner()){ _batchDips=0; return; }
  // 3 dips kort na elkaar → batch tijdelijk uit
  if(_batchDips>=3 && window._batchSupported!==false){
    window._batchSupported=false;
    _batchOffSince=Date.now();
    btDiag('Multi-PID herhaald onvolledig — tijdelijk uit (wordt later herprobeerd)','warn');
  }
}
function batchOk(){
  if(_batchDips>0) _batchDips--;
  PLBus.batchGroter();   // 25 schone rondes = een trapje terug omhoog
}

// ── Herstel na een opgeloste protocolstoring ──────────────────────────────
// Als de ELM327 in zoekmodus staat duurt élk commando ~5 seconden. De
// regelkringen hier meten dat correct als een verzadigde bus en schalen terug:
// pollbudget omlaag (tot 17%) en multi-PID van 4 naar 2 naar 1 naar uit.
// Zodra pidlane-bt.js het protocol opnieuw vergrendeld heeft is die oorzaak
// weg, maar de degradatie bleef staan tot de herstelperiode verliep — in het
// veldlog van 4-8 één keer ruim tien minuten. Deze functie zet de meting
// meteen op nul zodat er opnieuw geijkt wordt op de werkelijke bus.
function _herstelNaProtocolLock(){
  _batchDips=0;
  _batchOffSince=0;
  window._batchSupported=undefined;        // undefined = weer toegestaan
  try{ PLBus.batchReset(); }catch(e){ console.warn('PLBus.batchReset mislukt:', e); }
  try{ PLLoad.reset(); }catch(e){ console.warn('PLLoad.reset mislukt:', e); }
  try{ btDiag('Regelkringen opnieuw geijkt na protocolherstel','ok'); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
}
PLLoad.herstelNaProtocolLock=_herstelNaProtocolLock;
// Periodiek: als batch uit staat en het al een tijd goed gaat, één keer
// opnieuw proberen. Een eenmalige hapering schakelt batch dan niet voorgoed uit.
// Fix 19-07: handle + guard tegen dubbele intervallen bij herstart.
if(!window._batchRetryTimer) window._batchRetryTimer=setInterval(()=>{
  if(!connected||demoMode) return;
  if(window._batchSupported===false && _batchOffSince && Date.now()-_batchOffSince>30000){
    window._batchSupported=undefined;   // undefined = opnieuw toegestaan
    _batchDips=0; _batchOffSince=0; PLBus.batchReset();
    btDiag('Multi-PID opnieuw proberen (herstelperiode voorbij)','info');
  }
},10000);
