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
  /* ── HANDMATIG (16-09-2026) ───────────────────────────────────────────
     Tot vandaag was dit een meting en geen keuze — staat() zegt dat er
     letterlijk bij. Dat klopte zolang niemand het tempo kon zien: een keuze
     aanbieden zonder de cijfers erbij is een schuifje waarmee je iets
     verpest zonder te weten wat.

     Met het adapterpaneel staan die cijfers er wél, en dan verandert de
     afweging. Op een adapter die frames herhaalt (#210) regelt de automaat op
     signalen die de verkeerde kant op wijzen, en dan wil je hem opzij kunnen
     zetten. `_handmatig` doet precies één ding: tick() regelt niet meer en
     mult() geeft `_handMult`. De automaat blijft verder gewoon meten, zodat
     het paneel kan laten zien wát hij zou hebben gedaan. */
  _handmatig:false, _handMult:1.0,
  // Ring met wat de automaat gedaan heeft, mét de reden. Dit was er niet: de
  // redenen stonden in btDiag-regels die tussen duizend andere verdwenen, en
  // "waarom staat de app op 17%" was daardoor niet te beantwoorden zonder het
  // hele BT-log door te lezen.
  _acties:[], _vorigEcho:null, _echoRust:0,
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
    kalmFoutPct:5,
    /* ── ECHO-KRIMP (#211, 16-09-2026) ────────────────────────────────
       Een goedkope ELM-kloon herhaalt frames binnen één antwoord. De parser
       stopt daar sinds #210 op, en dan valt de laatste PID van de batch weg —
       7 van de 20 keer in de gemeten staart van 16-09.

       De lever om dat te vermijden bestond al: een kleinere groep. Drie PIDs
       van elk één databyte geven 8 bytes en dat past niet in de 7 databytes
       van één CAN-frame, dus wordt het een multiframe-antwoord — en precies
       daarop struikelt deze adapter. Bij twee PIDs past het meestal wél in
       één frame en bestaat het foutbeeld niet.

       Maar die lever hing aan het verkeerde signaal: batchOk() vuurt zodra er
       ≥1 PID terugkomt, dus 2-van-3 gold als succes en de groep bleef op 3.
       De echoteller is wél een eenduidig signaal, want hij zegt iets over de
       ADAPTER en niet over de auto. Een PID die deze auto niet heeft, levert
       geen echo op.

       NIET tot 1. Groep 1 verdrievoudigt het aantal verzoeken, en de meting
       die dat zou rechtvaardigen bestaat niet — bij groep 2 is niet gemeten
       hoeveel er overblijft. Wie tot 1 wil, zet het paneel op handmatig; dan
       is het een keuze met een naam eronder in plaats van een regelkring die
       stilletjes het tempo derdeelt. */
    echoOp:2,           // herhaalde antwoorden binnen één tick → te veel
    echoBodem:2,        // hier stopt de automatische krimp
    echoRustTikken:30   // 30 tikken van 2 s zonder echo → één stap terug
  },

  mult(){ return this._handmatig ? this._handMult : this._mult; },

  /* ── de handmatige stand ── */
  isHandmatig(){ return !!this._handmatig; },
  handmatig(aan, waarom){
    const nieuwStand=!!aan;
    if(nieuwStand===this._handmatig) return this._handmatig;
    // Overnemen op de stand die er NU is, niet op 1.0. Anders springt het
    // tempo bij het omzetten, en dan meet je na het omschakelen iets anders
    // dan waar je naar keek.
    if(nieuwStand) this._handMult=this._mult;
    else this._mult=this._handMult;
    this._handmatig=nieuwStand;
    this.boekActie(nieuwStand?'handmatig':'automaat',
      Math.round(100/(nieuwStand?this._mult:this._handMult)),
      Math.round(100/this.mult()),
      waarom || (nieuwStand?'met de hand overgenomen':'weer overgelaten aan de automaat'));
    return this._handmatig;
  },
  // Tempo in procenten (100 = vol tempo), want dat is wat er op het scherm
  // staat. De multiplier is het omgekeerde en dat is voor een schuifje een
  // valstrik: hoger is daar juist langzamer.
  zetTempo(pct){
    // Niet `Number(pct)||100`: nul is falsy en zou dan het VOLLE tempo geven,
    // precies andersom dan gevraagd. Zelfde vorm als in PLBus.batchZet().
    const ruw=Number(pct);
    const p=Math.max(Math.round(100/this.MAX), Math.min(100, Math.round(isFinite(ruw)?ruw:100)));
    const m=Math.round((100/p)*100)/100;
    const van=Math.round(100/this._handMult);
    this._handMult=Math.max(this.MIN, Math.min(this.MAX, m));
    if(this._handmatig) this.boekActie('tempo', van, Math.round(100/this._handMult), 'met de hand gezet');
    return Math.round(100/this._handMult);
  },

  /* ── het actielogboek ── */
  boekActie(wat, van, naar, reden, s){
    this._acties.push({
      t:Date.now(), wat:wat, van:van, naar:naar, reden:String(reden||''),
      bezet:s?s.belasting:null, fout:s?s.foutPct:null,
      onvol:s?s.onvolPct:null, venMs:s?s.venGemMs:null
    });
    if(this._acties.length>60) this._acties.shift();
  },
  acties(){ return this._acties.slice(); },
  wisActies(){ this._acties=[]; },

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
    /* Handmatig: wél meten, niet regelen. `_staat` blijft dus kloppen, zodat
       het paneel kan laten zien in welke zone de automaat de bus ziet — dat is
       juist wat je wilt weten terwijl je het zelf doet. `_vorigEcho` en
       `_vorigVenMs` lopen mee zodat er bij het teruggeven aan de automaat geen
       sprong uit een oude meting komt. */
    if(this._handmatig){
      this._vorigEcho=s.echoTot; this._vorigVenMs=s.venGemMs;
      this._staat=this._bepaalStaat(s);
      return;
    }
    this._echoKrimp(s);
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
      // Dezelfde stap, maar nu ook opzoekbaar. De reden is de zone die hem
      // veroorzaakte; zoneVan() is daar de enige bron van (#76).
      this.boekActie('tempo', Math.round(100/vorig), Math.round(100/this._mult), _redenVanZone(_zone, s), s);
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
      this.boekActie('vastgehouden', Math.round(100/this._mult), Math.round(100/this._mult),
        `bezetting ${s.belasting}% maar de responstijd loopt niet op — bezetting alleen is geen tegendruk`, s);
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

  /* ── DE ECHO-KRIMP ────────────────────────────────────────────────────
     Eén stap per tick, en alleen op wat er sinds de vorige tick bijkwam. De
     teller is cumulatief over de sessie; zou hij op het totaal regelen, dan
     bleef hij krimpen op echo's van tien minuten geleden. */
  _echoKrimp(s){
    const tot=(s && typeof s.echoTot==='number')?s.echoTot:0;
    if(this._vorigEcho==null){ this._vorigEcho=tot; return; }
    const erbij=tot-this._vorigEcho;
    this._vorigEcho=tot;
    let groep=3;
    try{ groep=(window.PLBus&&typeof PLBus.batchGroep==='function')?PLBus.batchGroep():3; }
    catch(e){ console.warn('PLBus.batchGroep mislukt — de echo-krimp kan zijn stand niet lezen', e); return; }
    if(erbij>=this.cfg.echoOp){
      this._echoRust=0;
      if(groep>this.cfg.echoBodem){
        let ok=false;
        try{ ok=PLBus.batchKleiner(); }catch(e){ console.warn('PLBus.batchKleiner mislukt:', e); }
        if(ok) this.boekActie('groep', groep, groep-1,
          `de adapter herhaalde ${erbij} antwoorden in ${Math.round(this.cfg.tickMs/1000)} s — kleinere groep past vaker in één frame`, s);
      }
      return;
    }
    if(erbij>0){ this._echoRust=0; return; }
    this._echoRust++;
    if(this._echoRust>=this.cfg.echoRustTikken && groep<3){
      this._echoRust=0;
      let ok=false;
      try{ ok=PLBus.batchGroter(); }catch(e){ console.warn('PLBus.batchGroter mislukt:', e); }
      // batchGroter() heeft zijn eigen teller van 25 schone rondes; komt hij
      // daar nog niet doorheen, dan is er niets gebeurd en hoort er ook niets
      // in het logboek te staan.
      if(ok) this.boekActie('groep', groep, groep+1,
        `${Math.round(this.cfg.echoRustTikken*this.cfg.tickMs/1000)} s zonder herhaalde antwoorden`, s);
    }
  },

  /* Echo's tot nu toe niet meer meerekenen. Voor een meting die zelf de bus
     had (de groepsproef in het adapterpaneel): die jaagt expres op groepen
     van 6, en de echo's die dat oplevert zeggen niets over de groep waar de
     automaat op staat. Zonder dit zag de eerste tick na de proef ze allemaal
     als "erbij" en kromp hij de groep om iets wat hij zelf nooit stuurde. */
  echoBijwerken(){
    try{ const s=PLBus.stats(); this._vorigEcho=(s && typeof s.echoTot==='number') ? s.echoTot : this._vorigEcho; }
    catch(e){ console.warn('PLLoad.echoBijwerken: echoteller niet leesbaar — de volgende tick kan op oude echo\'s krimpen', e); }
  },

  _bepaalStaat(s){
    const m=this.mult();
    if(s.foutPct>=this.cfg.doodPct || (s.perSec===0&&connected)) return 'dood';
    if(s.venGemMs>=this.cfg.traagMs && s.foutPct<20)             return 'bufferend';
    if(m>=1.5)                                                   return 'langzaam';
    if(m<=1.0 && s.belasting<this.cfg.bezetAf)                   return 'snel';
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
             tempoPct:Math.round(100/this.mult()), mult:this.mult(),
             handmatig:this._handmatig, automaatMult:this._mult };
  },

  // _vorigVenMs moet hier mee: na een protocolherstel is de oude responstijd
  // van vóór de storing geen geldig ijkpunt meer. Bleef hij staan, dan zou de
  // eerste tick na herstel een "daling" zien tegenover een waarde uit een
  // heel andere toestand.
  /* De handmatige stand overleeft een reset MET OPZET. reset() wordt
     aangeroepen na een protocolherstel, en dat is precies het moment waarop
     een gebruiker die het tempo zelf vastzette dat niet stilletjes kwijt wil
     zijn. Het paneel heeft er een eigen knop voor. */
  reset(){ this._mult=1.0; this._staat='normaal'; this._laatstTick=0; this._gelogdeMult=undefined;
           this._vorigVenMs=null; this._laatstOvergeslagen=0;
           this._vorigEcho=null; this._echoRust=0; }
};

/* De zone in één zin, voor het actielogboek. Bewust hier en niet in zoneVan():
   die functie beslist, deze beschrijft, en dat moeten twee dingen blijven —
   een oordeel dat zijn eigen uitleg schrijft is niet meer na te rekenen. */
function _redenVanZone(zone, s){
  if(zone==='druk'){
    if(s && s.foutPct>=PLLoad.cfg.foutOp) return `foutgraad ${s.foutPct}% — de bus duwt terug`;
    return `bezet ${s?s.belasting:'?'}% én de responstijd loopt op (${s?s.venGemMs:'?'} ms)`;
  }
  if(zone==='ruim')  return `ruimte over — bezet ${s?s.belasting:'?'}%, fout ${s?s.foutPct:'?'}%`;
  if(zone==='kalm')  return 'rustige bus — aftasten waar de grens ligt';
  return 'dode zone';
}
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
  // Een eigen PID (dealercode, pidlane-uitgebreid.js): het tempo dat de
  // klant erbij koos (snel 1 s, normaal 2 s, traag 10 s).
  try{ if(window.PLEigen && PLEigen.is(pid)) return PLEigen.interval(pid); }catch(e){ console.warn('PLEigen.interval mislukt:', e); }
  if(!/^01/i.test(String(pid))) return 10000;
  const suf=pid.slice(2).toUpperCase();
  // EV-modus: verbrandingsmotor-PIDs effectief uitschakelen. De ankers
  // (EV_ANKER_SUFFIX) blijven er buiten — zonder toerental kan de EV-modus
  // niet meer vaststellen dat de motor wéér draait en klemt hij vast.
  if(typeof _evModeActive!=='undefined' && _evModeActive && typeof ICE_PIDS_SUFFIX!=='undefined' && ICE_PIDS_SUFFIX.has(suf)
     && !(typeof EV_ANKER_SUFFIX!=='undefined' && EV_ANKER_SUFFIX.has(suf))) return 999999;
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
  let ms=Math.max(80, Math.round(basis * (prof.mult||1) * (typeof _pollMult!=='undefined'?_pollMult:1) * lm));
  // Slim visueel: snelle PIDs die niet op de meter staan gaan terug naar
  // PLVisueel.REM_MS, zodat de bus zijn antwoorden aan de naald geeft. Ze
  // worden nog gemeten; terug naar een andere weergave en dit vervalt.
  try{ if(window.PLVisueel && PLVisueel.remt(pid)) ms=Math.max(ms, PLVisueel.REM_MS); }
  catch(e){ console.warn('PLVisueel.remt mislukt:', e); }
  return ms;
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
    // Een berekende PID (CA..) rekent de app uit; de auto kent hem niet.
    if(typeof plIsBerekend==='function' && plIsBerekend(pid)) continue;
    // Een telefoonsensor (TL..) evenmin.
    if(typeof plIsTelemetrie==='function' && plIsTelemetrie(pid)) continue;
    // Een band op verzoek ook niet: PLBanden.ververs() vraagt hem (#396).
    try{ if(window.PLEigen && window.PLEigen.opVerzoek && window.PLEigen.opVerzoek(pid)) continue; }
    catch(e){ console.warn('PLEigen.opVerzoek mislukt in pidsDueNow:', e); }
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
  // Hoogstens EIGEN_PER_RONDE eigen PIDs per ronde (28-09-2026). Aanleiding
  // waren acht banden met hetzelfde tempo, elk met ATSH heen en terug: vier
  // seconden zonder toerental. De banden staan sinds #396 buiten de pollus
  // (PLBanden.ververs), maar elke eigen PID met een ECU-adres kost dat heen en
  // terug, dus de rem blijft. De rest blijft due en komt de volgende tik.
  let eigen=0;
  return due.filter(pid=>{
    try{ if(window.PLEigen && window.PLEigen.is(pid)) return ++eigen<=EIGEN_PER_RONDE; }
    catch(e){ console.warn('PLEigen.is mislukt in pidsDueNow:', e); }
    return true;
  });
}
const EIGEN_PER_RONDE=2;

// Herplannen vanaf de DEADLINE, niet vanaf nu. 'now' wordt vastgelegd
// vóór alle I/O, maar een ronde duurt honderden ms — vanaf now tellen
// betekende dus stilzwijgend "ingesteld interval + rondeduur", waardoor
// 10s in de praktijk 14s werd. Loopt een PID te ver achter (survey hield
// de bus vast), dan ijken we opnieuw vanaf nu in plaats van in te halen:
// een inhaalstorm belast de ECU precies op het verkeerde moment.
function _pollHerplan(due, now){
  due.forEach(pid=>{
    const iv=pidPollInterval(pid);
    const vorige=_pidNextPoll[pid]||0;
    const vanafDeadline=vorige+iv;
    _pidNextPoll[pid] = (vorige && vanafDeadline>now) ? vanafDeadline : now+iv;
  });
}

/* ── DE TIK VAN DE POLLUS (30-09-2026) ─────────────────────────────────
   Tot vandaag was dit een setInterval van 100 ms. Twee dingen gingen daarmee
   verloren, en ze kosten samen de helft van de bus:

   1. Een PID van 120 ms wordt pas gevraagd op de eerstvolgende tik NA zijn
      deadline, dus op 200 ms.
   2. Duurt een ronde langer dan 100 ms, dan vallen de tikken die erin vallen
      weg (de bus is van de pollus zelf) en wacht de volgende ronde tot de
      tik daarna — gemiddeld een halve tik niets.

   Gemeten in test-pollritme.js met de echte functies: acht PIDs, 54 ms per
   verzoek, gaf 10 verzoeken/s bij 54% bus bezet, en de snelle klasse kwam op
   5 Hz in plaats van 8,3 — precies het beeld van het adapterpaneel op
   30-09. De adapter had ruimte, de pollus vroeg er niet om.

   Nu plant de pollus zijn volgende ronde op het moment dat de eerste PID aan
   de beurt is: niet vroeger dan POLL_WACHT_MIN (de bus is even vrij voor een
   ander), niet later dan POLL_WACHT_MAX (zodat een nieuwe PID, een herstelde
   verbinding of een ander tempo binnen een tik gezien wordt). Een bezette bus
   is een andere zaak: dan komt hij over POLL_BEZET_MS terug.

   De rem blijft waar hij was: PLLoad rekt de intervallen zelf op via
   pidPollInterval(). Deze tik vraagt alleen niet minder dan dat interval. */
const POLL_WACHT_MIN=4, POLL_WACHT_MAX=100, POLL_BEZET_MS=25;
// Wie de keten nog mag voortzetten. startPoll() en stopPoll() hogen hem op,
// zodat een ronde die nog loopt na afloop géén nieuwe plant.
let _pollGen=0;
function _pollWacht(now){
  if(!connected||!activePIDs.size) return POLL_WACHT_MAX;
  let eerste=Infinity;
  for(const pid of activePIDs){
    if(typeof plIsBerekend==='function' && plIsBerekend(pid)) continue;
    if(typeof plIsTelemetrie==='function' && plIsTelemetrie(pid)) continue;
    const t=_pidDead.has(pid) ? (_pidDeadSince[pid]||0)+PID_REPROBE_MS : (_pidNextPoll[pid]||0);
    if(t<eerste) eerste=t;
  }
  return Math.max(POLL_WACHT_MIN, Math.min(POLL_WACHT_MAX, eerste-now));
}
function stopPoll(){
  _pollGen++;
  clearTimeout(pollTimer);
  pollTimer=null;
}

function startPoll(){
  stopPoll();
  const gen=_pollGen;
  dataStable=false; stabilityCount={}; outlierCount={}; window._stabilityT0=null;
  _pidNextPoll={};
  try{ PLLoad.reset(); }catch(e){ console.warn('PLLoad.reset mislukt:', e); }   // nieuwe PID-set = budget opnieuw ijken
  document.getElementById('aiContent').innerHTML=`<div class="ai-ph"><div class="pi">📡</div><p>Data valideren...<br><br>Even geduld — outliers worden gefilterd voor betrouwbare analyse.</p></div>`;

  // Per ronde worden alleen de PIDs gepolld die volgens hun klasse "due"
  // zijn. Zo blijft toerental vloeiend terwijl temperatuur het kanaal niet
  // onnodig bezet houdt. Wanneer de volgende ronde komt: zie _pollWacht().
  const ronde=async()=>{
    let bezet=false;
    try{ if(connected&&activePIDs.size) await _pollRonde(()=>{ bezet=true; }); }
    catch(e){ console.warn('Pollronde mislukt:', e); }
    if(gen!==_pollGen) return;   // intussen gestopt of opnieuw gestart
    pollTimer=setTimeout(ronde, bezet?POLL_BEZET_MS:_pollWacht(Date.now()));
  };
  pollTimer=setTimeout(ronde, POLL_WACHT_MIN);
}

// Eén ronde, met het werk van vóór 30-09 ongewijzigd erin; de inspringing
// is die van de oude setInterval gebleven zodat de diff het werk laat zien
// en niet de verhuizing.
async function _pollRonde(alsBezet){
    // Echt busslot (fase 1): geen kale boolean meer. Houdt een zware lezer
    // (sweep/survey/verificatie) de bus vast, dan slaan we deze tik over —
    // en geven we NOOIT per ongeluk hún slot vrij.
    // Sinds #115 via withBusOfNiets() in plaats van een eigen claim/finally:
    // dit is de plek waar een vergeten vrijgave zich niet als storing maar als
    // traagheid voordoet, en dat is precies hoe #98 zes seconden onopgemerkt
    // bleef. De poort kan het nu niet meer vergeten.
    await withBusOfNiets('poll', async()=>{
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
      // Staat de ELM-poort dicht (herverbinden, re-init), dan zou élk verzoek
      // hieronder geweigerd worden en als '' terugkomen (#388). Deze ronde
      // overslaan; de PIDs blijven aan de beurt.
      if(_plPoortDicht()) return;
      _pollHerplan(due, Date.now());

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
          const basis='01'+grp.map(p=>p.slice(2)).join('');   // grp is nu gegarandeerd mode 01
          // Met het antwoordcijfer erachter zodra het geleerd is (#302): dan
          // stopt de adapter na het laatste frame in plaats van zijn geleerde
          // wachttijd uit te zitten. Zie PLAntwoordtal hieronder.
          const cmd=PLAntwoordtal.cmd(basis);
          const _tx=Date.now(), _w0=_plWeigeringen();
          const raw=await sendCmd(cmd,2500);
          const _ms=Date.now()-_tx;
          // Geweigerd door de ELM-poort: dit verzoek is nooit de bus op gegaan.
          // Geen dip, geen leerles voor PLAntwoordtal, geen PID die als stil
          // geboekt wordt — en de rest van de ronde wordt net zo goed geweigerd.
          if(_plWeigeringen()!==_w0){ _plGeweigerdeRonde(cmd); break; }
          const parsed=splitBatchResponse(raw,grp);
          _diagNote(cmd, raw, grp, parsed);
          // Per-PID telemetrie: hier weten we exact wat gevraagd is en wat
          // terugkwam, dus dit is de enige plek waar `mis` betrouwbaar te
          // tellen valt (zie PLBus.notePids).
          try{ PLBus.notePids(grp, null, parsed); }catch(e){ console.warn('PLBus.notePids mislukt:', e); }
          // Vóór markPidData hieronder: het oordeel gaat over wat er eerder al
          // eens binnenkwam, niet over deze ronde.
          const oordeel=plGroepOordeel(grp, parsed, _pidLastOk);
          _plNoteVerbind(oordeel.mistBekend && oordeel.mistBekend.length>0);
          const got=oordeel.gekregen;
          PLAntwoordtal.leer(basis, cmd, raw, oordeel.oordeel, _ms);
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
          // tellen mee voor snoei (NIET sequentieel herhalen — dat was de grote
          // tijdverspilling). Maar een PID die eerder wél antwoordde en nu
          // ontbreekt, maakt dit antwoord onvolledig, en dat is geen succes.
          if(oordeel.oordeel==='onvolledig') _groepTel(true, oordeel);
          else { batchOk(); _groepTel(false, oordeel); }
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
          if(!connected || _plPoortDicht()) break;
          const _w0=_plWeigeringen(), _ruw=await plVraagSolo(pid);
          if(_plWeigeringen()!==_w0){ _plGeweigerdeRonde(pid); break; }
          const resp=parsePID(pid,_ruw);
          _plNoteVerbind(resp==null && _plKortGeledenOk(pid));
          if(resp!=null){ markPidData(pid); updPID(pid,resp); checkStability(pid,resp); feedDatalog(pid,resp); feedSessionStat(pid,resp); }
          else markPidNoData(pid);
        }
      } else {
        // Sequentieel: één PID per request, '1'-suffix voor snelle terugkeer
        for(const pid of due){
          if(!connected) break;
          const _w0=_plWeigeringen(), _ruw=await plVraagSolo(pid);
          if(_plWeigeringen()!==_w0){ _plGeweigerdeRonde(pid); break; }
          const resp=parsePID(pid,_ruw);
          _plNoteVerbind(resp==null && _plKortGeledenOk(pid));
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
    }, alsBezet);
}

/* ── EEN GEWEIGERD VERZOEK IS GEEN BUSMETING (#388, 03-10-2026) ────────
   Staat de ELM-poort dicht (pidlane-bt.js, herverbinden of re-init), dan
   weigeren sendCmd/sendBT elk verzoek en geven ze '' terug — dezelfde lege
   string als een uitgebleven antwoord. Tot vandaag telde de poll-lus dat als
   een lege batch: batchDip(), een onvolledig-oordeel, en elke PID in de groep
   als stil geboekt. Het log van de T6 (#388) staat er letterlijk:
   `Multi-PID leeg TX="01492" RX="" — dip`, en meteen daarna `"010C2"
   geweigerd`. De regelkringen krompen dus op een meting over onze eigen poort.

   Het onderscheid: PLElm.weigeringen() telt elke weigering. Verschilt de
   teller voor en na een verzoek, dan ging het nooit de bus op. Valt een
   andere aanroeper in die tijd ook op de poort, dan wordt dit verzoek
   onterecht als geweigerd gezien — en dat is de onschuldige kant: dan telt er
   één meting niet mee, in plaats van dat er een verzonnen meting bijkomt. */
function _plWeigeringen(){
  try{ return (window.PLElm && typeof PLElm.weigeringen==='function') ? PLElm.weigeringen() : 0; }
  catch(e){ console.warn('PLElm.weigeringen mislukt — weigeringen tellen nu als antwoord', e); return 0; }
}
function _plPoortDicht(){
  try{ return !!(window.PLElm && typeof PLElm.poortDicht==='function' && PLElm.poortDicht()); }
  catch(e){ console.warn('PLElm.poortDicht mislukt — de ronde gaat door', e); return false; }
}
/* Het signaal voor de ATST-regelaar (PLVerbind.noteAntwoord, #394): ontbrak
   er een PID die de afgelopen vijf minuten nog antwoordde? Een PID die deze
   auto nooit had telt niet — die ontbreekt bij elke ATST. */
function _plKortGeledenOk(pid){
  const w=_pidLastOk[pid];
  return typeof w==='number' && w>0 && (Date.now()-w)<(typeof GROEP_BEKEND_MS!=='undefined' ? GROEP_BEKEND_MS : 300000);
}
function _plNoteVerbind(mist){
  try{ if(window.PLVerbind && typeof PLVerbind.noteAntwoord==='function') PLVerbind.noteAntwoord(!!mist); }
  catch(e){ console.warn('PLVerbind.noteAntwoord mislukt — ATST wordt niet bijgestuurd', e); }
}
let _plGeweigerdMeld=0;
function _plGeweigerdeRonde(wat){
  // Hoogstens eens per 5 s in het log: een re-init duurt een paar seconden en
  // elke tik zou anders dezelfde regel schrijven.
  if(Date.now()-_plGeweigerdMeld<5000) return;
  _plGeweigerdMeld=Date.now();
  try{ btDiag('Pollronde afgebroken: "'+wat+'" geweigerd door de ELM-poort — telt niet als busmeting','info'); }
  catch(e){ /* stil: melding mag nooit de stroom breken */ }
}

// Eén PID solo opvragen. Een eigen PID gaat via PLEigen.vraag(): die zet zo
// nodig het ECU-adres en daarna het functionele adres terug.
async function plVraagSolo(pid){
  if(window.PLEigen && PLEigen.is(pid)) return PLEigen.vraag(pid);
  return sendCmd((typeof pidCmd==='function')?pidCmd(pid,true):('01'+pid.slice(2)+'1'),2500);
}

/* ── HET ANTWOORDCIJFER OP GROEPSVERZOEKEN (#302, 28-09-2026) ───────────
   WAAROM. Na elk antwoord wacht een ELM327 nog even of er meer komt; pas als
   er binnen zijn wachttijd niets meer komt, geeft hij de prompt. Met ATAT1
   (bij het verbinden gezet) LEERT hij die wachttijd uit de traagste
   antwoorder, tot het maximum van ATST64 = 400 ms. Datasheet, "Setting
   Timeouts": een motor-ECU van 4 ms en een automaat van 58 ms geven samen
   een wachttijd van ±90 ms op élk verzoek. Die geleerde waarde blijft staan
   tot de adapter opnieuw geïnitialiseerd wordt — en dat is precies het beeld
   van #302: in stappen van 77 naar 270 ms, nul fouten, en opnieuw verbinden
   (ATZ) zet hem terug.

   DE UITWEG staat in dezelfde datasheet: zet achter het verzoek één
   hexcijfer met het aantal antwoorden, dan stopt de adapter zodra die binnen
   zijn en slaat hij de laatste wachttijd over. Losse verzoeken deden dat al
   ('010C1', pidCmd). De groepsverzoeken — het grootste deel van het verkeer —
   gingen zonder, en betaalden die wachttijd dus elke keer.

   HET CIJFER WORDT GELEERD, NIET BEREKEND. Uit de PID-lengtes volgt hoeveel
   frames één ECU stuurt, maar antwoordt er een tweede ECU mee (een automaat
   op 010D), dan komen er meer. Met een te laag cijfer kapt de adapter af, en
   komt het antwoord van de tweede ECU toevallig eerst, dan mist het dat van
   de motor. Dus zoals python-OBD het doet: per verzoek tellen hoeveel frames
   er zonder cijfer terugkomen, en pas na ANTWOORDTAL_LEER keer hetzelfde
   aantal het cijfer gebruiken — het hoogste dat gezien is.

   Of de adapter "antwoorden" als frames of als berichten telt, zegt de
   datasheet voor CAN niet. Voor de veiligheid maakt dat niet uit: er zijn
   nooit meer berichten dan frames, dus een frameaantal is nooit te laag. Telt
   hij berichten, dan wacht hij met dit cijfer gewoon zijn wachttijd uit, en
   dat is wat er zonder cijfer al gebeurde.

   ZELFCONTROLE. Elke ANTWOORDTAL_HERIJK-ste keer gaat hetzelfde verzoek
   zónder cijfer: zo blijft het geleerde aantal bij als er een ECU bijkomt, en
   zo meet de app zelf het verschil (msMet tegen msZonder in stand()). Mist
   er met cijfer een PID die er eerder wél was, dan gaat het cijfer voor dat
   verzoek ANTWOORDTAL_BLOK_MS uit — terug naar het oude gedrag. */
const ANTWOORDTAL_LEER=3, ANTWOORDTAL_HERIJK=200, ANTWOORDTAL_BLOK_MS=300000, ANTWOORDTAL_MAX=200;

// Hoeveel CAN-frames staan er in een ruw antwoord? Een frame is een "N:"-
// marker (multiframe, ook als ze op één regel staan) of een losse regel met
// data (single frame, per ECU één). De lengteregel ("008") is geen eigen
// frame: hij hoort bij frame 0. Puur, zie test-antwoordtal.js.
function plFrames(raw){
  const s=String(raw||'');
  if(!s.trim() || /NO DATA|UNABLE|ERROR|STOPPED|BUFFER|SEARCHING|CAN ERROR|\?/i.test(s)) return 0;
  let n=0;
  for(const regel of s.split(/[\r\n]+/)){
    const r=regel.trim();
    if(!r) continue;
    const markers=r.match(/[0-9A-Fa-f]\s*:/g);
    if(markers){ n+=markers.length; continue; }
    const hex=r.replace(/\s+/g,'');
    if(/^[0-9A-Fa-f]{4,}$/.test(hex)) n++;       // data; "008" (3 tekens) is een lengte
  }
  return n;
}

const PLAntwoordtal={
  _m:new Map(), _gen:null, _met:[], _zonder:[], _nMet:0, _nZonder:0, _nBlok:0,
  _fris(){
    // Een nieuwe verbinding kan een andere auto of adapter zijn: opnieuw leren.
    const g=window._btGen||0;
    if(g!==this._gen){ this._m.clear(); this._gen=g; }
  },
  // Het verzoek zoals het de bus op gaat: met cijfer als het geleerd is.
  cmd(basis){
    try{
      this._fris();
      const e=this._m.get(basis);
      if(!e || e.zeker<ANTWOORDTAL_LEER || !(e.n>=1 && e.n<=15)) return basis;
      if(Date.now()<e.blokTot) return basis;
      if(++e.sinds>=ANTWOORDTAL_HERIJK){ e.sinds=0; return basis; }
      return basis+e.n.toString(16).toUpperCase();
    }catch(x){ console.warn('PLAntwoordtal.cmd mislukt — verzoek gaat zonder cijfer', x); return basis; }
  },
  leer(basis, verstuurd, raw, oordeel, ms){
    try{
      this._fris();
      const metCijfer=verstuurd!==basis;
      const rij=metCijfer?this._met:this._zonder;
      if(oordeel==='goed' && ms>0){ rij.push(ms); if(rij.length>60) rij.shift(); }
      if(metCijfer) this._nMet++; else this._nZonder++;
      let e=this._m.get(basis);
      if(metCijfer){
        // Kwam er een 41-antwoord maar mist er iets dat eerder wél kwam, dan
        // kan het cijfer te laag zijn. Geen gok: uit voor dit verzoek.
        if(e && oordeel!=='goed' && /41[0-9A-F]{2}/i.test(String(raw||''))){
          e.blokTot=Date.now()+ANTWOORDTAL_BLOK_MS; e.zeker=0; this._nBlok++;
          try{ btDiag(`Antwoordcijfer ${e.n} op ${basis} uit voor ${ANTWOORDTAL_BLOK_MS/60000} min: antwoord ${oordeel} met cijfer`,'warn'); }catch(x){ /* stil: melding mag nooit de stroom breken */ }
        }
        return;
      }
      if(oordeel!=='goed') return;                   // alleen leren van volledige antwoorden
      const f=plFrames(raw);
      if(f<1) return;
      if(!e){
        if(this._m.size>=ANTWOORDTAL_MAX) this._m.delete(this._m.keys().next().value);
        this._m.set(basis,{ n:f, zeker:1, sinds:0, blokTot:0 });
        return;
      }
      if(f===e.n) e.zeker++;
      else if(f>e.n){ e.n=f; e.zeker=1; }            // er kwam meer: dat is het nieuwe aantal
      // f<e.n: een PID ontbrak deze keer; het hoogste aantal blijft staan.
    }catch(x){ console.warn('PLAntwoordtal.leer mislukt — dit antwoord telt niet mee', x); }
  },
  reset(){ this._m.clear(); this._met=[]; this._zonder=[]; this._nMet=this._nZonder=this._nBlok=0; },
  // Voor het adapterpaneel en blok 5: werkt het, en wat levert het op?
  stand(){
    const med=a=>{ if(!a.length) return null; const s=a.slice().sort((x,y)=>x-y); return s[s.length>>1]; };
    let geleerd=0, geblokt=0; const nu=Date.now();
    this._m.forEach(e=>{ if(e.zeker>=ANTWOORDTAL_LEER) geleerd++; if(nu<e.blokTot) geblokt++; });
    return { verzoeken:this._m.size, geleerd, geblokt, met:this._nMet, zonder:this._nZonder,
             blokkades:this._nBlok, msMet:med(this._met), msZonder:med(this._zonder) };
  }
};
window.PLAntwoordtal=PLAntwoordtal;
window.plFrames=plFrames;

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
  // 25 schone rondes = een trapje terug omhoog — maar niet vlak na een krimp
  // op onvolledige antwoorden (zie _groepTel): dan eerst GROEP_HOUD_MS rust.
  if(Date.now()>=_groepHoudTot) PLBus.batchGroter();
}

/* ── WAT IS EEN ONVOLLEDIG GROEPSANTWOORD (28-09-2026) ─────────────────
   Tot vandaag gold "er kwam minstens één PID terug" als succes. Dat liet
   2-van-3 door als goed (zie PIDLANE-ARCHIEF.md, #211), en bij een grotere
   groep wordt dat gat groter: 4-van-6 is een antwoord waarin twee sensoren
   stil hun meting kwijtraken.

   Het onderscheid dat ertoe doet: een PID die in het antwoord ontbreekt kan
   óók een PID zijn die deze auto niet heeft. Die mag de groep niet laten
   krimpen — hij levert solo net zo goed niets. Het signaal is daarom: deze
   PID gaf kort geleden nog data (`eerderOk`, dat is _pidLastOk) en ontbreekt
   nu. Dan ligt het aan het antwoord, niet aan de auto.

   "Kort geleden" is vijf minuten. _pidLastOk wordt nooit gewist — hij leeft
   zo lang als de pagina — en zonder die grens telt een PID van de auto van
   een uur geleden bij deze auto nog als bekend. Vijf minuten is ruim boven
   de traagste pollklasse (60 s), dus een gezonde trage PID valt er niet uit.

   Puur, zodat hij zonder adapter te toetsen is: test-groepsgrootte.js. */
const GROEP_BEKEND_MS=300000;
function plGroepOordeel(grp, parsed, eerderOk, nu){
  const lijst=Array.isArray(grp)?grp:[];
  const t=(typeof nu==='number')?nu:Date.now();
  const mist=lijst.filter(p=>!(parsed && Object.prototype.hasOwnProperty.call(parsed,p)));
  const mistBekend=mist.filter(p=>{
    const w=eerderOk ? eerderOk[p] : 0;
    return typeof w==='number' && w>0 && (t-w)<GROEP_BEKEND_MS;
  });
  const gekregen=lijst.length-mist.length;
  return {
    gekregen, mist, mistBekend,
    oordeel: gekregen===0 ? 'leeg' : (mistBekend.length ? 'onvolledig' : 'goed')
  };
}

/* ── DE GROEP KRIMPT OP ONVOLLEDIGE ANTWOORDEN ──────────────────────────
   Over de laatste 20 verzoeken bij de huidige groepsgrootte: zijn er 4 of
   meer onvolledig (20%), dan één stap kleiner. Een venster en geen teller die
   op en neer loopt: bij de kloon van 16-09 viel 35% weg, en een +1/−1-teller
   drijft dan nog steeds naar nul en grijpt nooit in. Eén sensor die af en toe
   hapert (onder de 20%) laat de groep met rust.

   Niet onder de 2, om dezelfde reden als de echo-krimp: groep 1 verdrievoudigt
   het aantal verzoeken, en een groep van één die niets teruggeeft is een
   `leeg` antwoord — dat pakt batchDip() al op. Een vastgezette groep (met de
   hand, adapterpaneel) blijft staan: batchKleiner() weigert dan, en dat is de
   bedoeling van vastzetten.

   NA EEN KRIMP TWEE MINUTEN NIET TERUG OMHOOG. batchGroter() klimt na 25
   schone rondes, en bij tien verzoeken per seconde is dat een paar seconden.
   Op de kloon van 16-09 zou de groep dan elke paar seconden van 2 naar 3 en
   terug gaan: onrust in het logboek en elke keer verlies bij de stap omhoog.
   De echo-krimp wacht om dezelfde reden een minuut (echoRustTikken). */
const GROEP_ONVOL_VENSTER=20, GROEP_ONVOL_DREMPEL=4, GROEP_ONVOL_BODEM=2, GROEP_HOUD_MS=120000;
let _groepVenster=[], _groepVensterN=0, _groepHoudTot=0;
function _groepTel(onvol, oordeel){
  let groep=0;
  try{ groep=PLBus.batchGroep(); }catch(e){ console.warn('PLBus.batchGroep mislukt — het onvolledig-venster telt niet mee', e); return false; }
  // Andere groepsgrootte dan waar het venster over ging (echo-krimp, met de
  // hand, een stap omhoog): opnieuw beginnen. Anders krimpt groep 2 op wat
  // groep 3 misdeed.
  if(groep!==_groepVensterN){ _groepVenster=[]; _groepVensterN=groep; }
  _groepVenster.push(!!onvol);
  if(_groepVenster.length>GROEP_ONVOL_VENSTER) _groepVenster.shift();
  if(!onvol) return false;
  const n=_groepVenster.filter(Boolean).length;
  if(n<GROEP_ONVOL_DREMPEL || groep<=GROEP_ONVOL_BODEM) return false;
  let ok=false;
  try{ ok=PLBus.batchKleiner(); }catch(e){ console.warn('PLBus.batchKleiner mislukt:', e); }
  if(!ok) return false;
  const mist=(oordeel && oordeel.mistBekend) ? oordeel.mistBekend.join(', ') : '?';
  const reden=n+' van de laatste '+_groepVenster.length+' antwoorden misten een PID die eerder wél antwoordde (laatst: '+mist+')';
  _groepVenster=[]; _groepVensterN=groep-1; _groepHoudTot=Date.now()+GROEP_HOUD_MS;
  try{ btDiag('Multi-PID groep '+groep+' → '+(groep-1)+': '+reden,'warn'); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
  try{ PLLoad.boekActie('groep', groep, groep-1, reden); }catch(e){ console.warn('PLLoad.boekActie mislukt — de groepsstap staat niet in het actielogboek', e); }
  return true;
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
  _groepVenster=[];
  _groepVensterN=0;
  _groepHoudTot=0;
  try{ PLAntwoordtal.reset(); }catch(e){ console.warn('PLAntwoordtal.reset mislukt — het oude antwoordcijfer blijft staan', e); }
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
