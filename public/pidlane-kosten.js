/* ═══════════════════════════════════════════════════════════════════════
   pidlane-kosten.js — PLKosten: "Wat kost dit, en wat betekent het?" (25-11-2026)
   ───────────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT
   De app zegt wát er mis is (PLOnderdeel, de foutcodes, het onderzoek). De
   vraag die de klant daarna stelt — "wat gaat dit me kosten, en mag ik nog
   rijden?" — beantwoordde hij alleen per codefamilie, met een bedrag zonder
   herkomst (DTC_PLAN, 14-10-2026). Dit bestand is het antwoord per
   ONDERDEEL: een bandbreedte uit onderdeelprijs + werkuren × uurtarief, een
   uitleg in gewone taal, waar het onderdeel zit, en of je kunt doorrijden.

   ÉÉN BRON VOOR BEDRAGEN
   Elk bedrag in de app komt hier vandaan. DTC_PLAN (pidlane-data.js) wijst
   per familie naar een onderdeel (`onderdeel:`); alleen een familie zonder
   aanwijsbaar onderdeel (C1, U0-bedrading, P021…) houdt een eigen `kost`.
   voorCode() kiest per code: het onderdeel van de familie, dan de koppeling
   uit OBDex (pidlane-kostencodes.js, gegenereerd door plkostencodes.js), en
   pas dan het familiebedrag. Eén code, één bedrag.

   HOE EEN BEDRAG TOT STAND KOMT
     totaal = onderdeel [laag, hoog] (incl. btw, imitatie → origineel)
            + uren [laag, hoog] × uurtarief × 1,21
   Afgerond op € 5. Het uurtarief kiest de klant: universele garage, dealer
   of het tarief van zijn eigen garage (tarief()/zetTarief(), per toestel in
   pl_kosten_tarief). Prijspeil en bronnen staan bij elke regel; de test
   wordt rood als PEIL ouder is dan zes maanden (test-kosten.js).

   WAT DIT NIET IS
   Geen offerte. De echte prijs hangt af van merk, motor en wat de monteur
   vindt. Daarom altijd een bandbreedte, nooit één getal, en altijd de zin
   dat een garage het vaststelt. Merkcodes (P1/P3) en hybride (P0A) krijgen
   geen bedrag — dat is de regel van DTC_PLAN en die blijft.

   PUUR EN NIET PUUR
   KOSTEN, schat(), voorCode(), schemaSvg(), kaartHtml() en kaartTekst() zijn
   puur (geen DOM, geen opslag behalve tarief()) en worden in test-kosten.js
   met vm geladen. open()/sluit()/deel() raken de DOM.

   Laadvolgorde: direct ná pidlane-data.js en pidlane-kostencodes.js in de
   <head>; leest DTC_PLAN en PL_KOSTEN_CODES pas bij aanroep.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Prijspeil en uurtarieven ─────────────────────────────────────────
  var PEIL = '2026-11-25';
  var BTW = 0.21;
  /* Uurtarief excl. btw. Bronnen:
     • universeel €85: RAI Aftermarket via welingelichtekringen.nl en
       actusfinancials.com, 27-08-2026 ("vijf jaar geleden €68,50, nu €85").
     • dealer €110: dezelfde bron zegt "bij dealers ruim boven €100"; 110 is
       een aanname binnen dat bereik, geen gemeten gemiddelde. */
  var TARIEVEN = {
    universeel: { naam: 'Universele garage', exBtw: 85 },
    dealer: { naam: 'Merkdealer', exBtw: 110 }
  };
  var TARIEF_MIN = 30, TARIEF_MAX = 250;   // eigen tarief excl. btw, daarbuiten is het een tikfout

  /* ── De prijstabel ─────────────────────────────────────────────────────
     id's = die van REGELS in pidlane-onderdeel.js, plus 'sensor' en
     'noxsensor' voor codes die naar een losse sensor wijzen.
       onderdeel [laag, hoog]  € incl. btw, imitatie → origineel
       uren      [laag, hoog]  werkuren inclusief zoeken en inleren
       alt       goedkopere route die vaak volstaat (tekst, onderdeel, uren)
       rijden    'stop' | 'kort' | 'plannen'
       plek      element in schemaSvg() dat oplicht
       wat       wat het onderdeel doet (één zin)
       gevolg    wat er gebeurt als je het laat zitten
       bron      waar de bedragen op rusten
     Waar geen Nederlandse totaalprijs te vinden was, staat dat in bron: dan
     rust het bedrag op onderdeelprijzen (Autodoc) en de uren van OBDex. */
  var KOSTEN = {
    ontsteking: { naam: 'Bobine en bougies', onderdeel: [40, 180], uren: [0.5, 1.5], rijden: 'kort', plek: 'cil',
      wat: 'De bobine maakt de hoogspanning, de bougie de vonk die het mengsel in de cilinder ontsteekt.',
      gevolg: 'Een cilinder die overslaat stuurt onverbrand benzine de uitlaat in. Dat maakt de katalysator binnen enkele honderden kilometers kapot — en die is tien keer duurder.',
      alt: { tekst: 'Alleen bougies (onderhoudsbeurt)', onderdeel: [30, 110], uren: [0.5, 1] },
      bron: ['ANWB: bobine €60–250 per stuk incl. arbeid', 'Werkspot: bougies €75–320 incl. montage', 'AutoScout24: bobine €75–150 per cilinder'] },
    injector: { naam: 'Injector', onderdeel: [100, 450], uren: [0.5, 2], rijden: 'kort', plek: 'inj',
      wat: 'De injector spuit de brandstof precies gedoseerd in de cilinder.',
      gevolg: 'Een lekkende injector verdunt de olie en kan een zuiger beschadigen; een verstopte geeft schokken en een hoger verbruik.',
      bron: ['ANWB: €150–600 per injector incl. montage; diesel duurder'] },
    vacuumlek: { naam: 'Vacuümslang of inlaatpakking', onderdeel: [10, 120], uren: [0.5, 2.5], rijden: 'plannen', plek: 'spr',
      wat: 'De motor rekent op lucht die langs de luchtmassameter komt. Een gescheurde slang laat ongemeten lucht binnen.',
      gevolg: 'Het mengsel wordt te arm: onrustig stationair, inhouden, op termijn een hogere verbrandingstemperatuur.',
      bron: ['Onderdeelprijzen Autodoc', 'Uren: OBDex mediaan 0,3–2 u; zoeken met een rookproef erbij'] },
    maf: { naam: 'Luchtmassameter', onderdeel: [30, 180], uren: [0.3, 1], rijden: 'plannen', plek: 'maf',
      wat: 'Meet hoeveel lucht de motor binnenkrijgt; daarop rekent de motor de brandstof uit.',
      gevolg: 'Een vuile meter geeft te weinig lucht door: minder vermogen, hoger verbruik, soms noodloop.',
      alt: { tekst: 'Reinigen met MAF-reiniger', onderdeel: [10, 15], uren: [0, 0.3] },
      bron: ['Autodoc: €28–140 incl. btw (onderdeel)', 'Uren: OBDex mediaan 0,3–1,5 u'] },
    lambdavoor: { naam: 'Voorste lambdasonde', onderdeel: [45, 200], uren: [0.5, 1.5], rijden: 'plannen', plek: 'l1',
      wat: 'Meet vóór de katalysator hoeveel zuurstof er in het uitlaatgas zit, zodat de motor het mengsel kan bijsturen.',
      gevolg: 'Zonder goede meting stuurt de motor op een vaste waarde: hoger verbruik en op termijn een vervuilde katalysator.',
      bron: ['Autodoc: Bosch vanaf €45 incl. btw', 'FairGarage (DE): sonde €40–150', 'Uren: ClickMechanic/OBDex < 1,5 u'] },
    lambdaverwarming: { naam: 'Lambdasonde (verwarming)', onderdeel: [45, 200], uren: [0.3, 1.5], rijden: 'plannen', plek: 'l1',
      wat: 'Een lambdasonde werkt pas boven 300 °C; een verwarmingselement brengt hem daar snel na de koude start.',
      gevolg: 'Het verwarmingselement zit ín de sonde: vervangen is de hele sonde. Tot die tijd regelt de motor de eerste minuten slechter.',
      alt: { tekst: 'Eerst de zekering van de sondeverwarming', onderdeel: [1, 5], uren: [0.2, 0.5] },
      bron: ['Als voorste lambdasonde', 'Uren: OBDex mediaan 0,3–1,5 u'] },
    lambdaachter: { naam: 'Achterste lambdasonde', onderdeel: [40, 150], uren: [0.5, 1.5], rijden: 'plannen', plek: 'l2',
      wat: 'Controleert ná de katalysator of die zijn werk doet.',
      gevolg: 'Rijdt meestal gewoon, maar je zakt voor de APK-uitlaatgastest zolang het motorlampje brandt.',
      bron: ['Autodoc (onderdeel)', 'Uren: OBDex mediaan 0,5–1,5 u'] },
    kat: { naam: 'Katalysator', onderdeel: [200, 900], uren: [1, 2.5], rijden: 'plannen', plek: 'kat',
      wat: 'Zet de schadelijke stoffen in het uitlaatgas om. Edelmetaal, daarom duur.',
      gevolg: 'Een kapotte kat haalt de APK niet. Een verstopte kat kost vermogen en kan de motor laten oververhitten.',
      alt: { tekst: 'Eerst uitlaatlek of achterste sonde uitsluiten', onderdeel: [40, 150], uren: [0.5, 1.5] },
      bron: ['ANWB: €500–1.000 incl. arbeid', 'idgarages (BE): €200–800 incl. arbeid'] },
    egr: { naam: 'EGR-klep', onderdeel: [120, 600], uren: [1.5, 5], rijden: 'plannen', plek: 'egr',
      wat: 'Stuurt een deel van het uitlaatgas terug naar de inlaat om de verbrandingstemperatuur en NOx te verlagen.',
      gevolg: 'Een klep die vastzit geeft roetvorming, inhouden en bij diesels vaak noodloop.',
      alt: { tekst: 'Klep en inlaat reinigen', onderdeel: [0, 30], uren: [1.5, 3] },
      bron: ['idgarages: vanaf €309, modellen €280–580', 'Autorai/ANWB: tot €600–1.500 bij veel werkuren; reinigen volstaat vaak'] },
    thermostaat: { naam: 'Thermostaat', onderdeel: [25, 180], uren: [1, 3], rijden: 'kort', plek: 'thermo',
      wat: 'Houdt het koelwater dicht tot de motor warm is en opent dan naar de radiateur.',
      gevolg: 'Blijft hij open: hoger verbruik, slechte verwarming, meer slijtage. Blijft hij dicht: oververhitting — dan direct stoppen.',
      bron: ['ANWB: thermostaat €25–180, vervangen 1–3 uur'] },
    koelventilator: { naam: 'Koelventilator', onderdeel: [80, 350], uren: [0.5, 2], rijden: 'kort', plek: 'fan',
      wat: 'Trekt lucht door de radiateur als de rijwind niet genoeg koelt, zoals in de file.',
      gevolg: 'In de file of bij stilstand loopt de temperatuur op tot oververhitting.',
      alt: { tekst: 'Relais, zekering of stekker', onderdeel: [10, 40], uren: [0.3, 0.8] },
      bron: ['ANWB: sensor of stekker "een paar tientjes", nieuwe ventilator "een paar honderd euro"'] },
    oliedruk: { naam: 'Oliedruksensor', onderdeel: [15, 80], uren: [0.3, 1.5], rijden: 'stop', plek: 'olie',
      wat: 'Meldt of de oliepomp genoeg druk maakt om de lagers te smeren.',
      gevolg: 'Is de druk écht weg, dan loopt de motor binnen minuten vast. Eerst stoppen en het oliepeil meten; pas daarna is het de sensor.',
      bron: ['Autodoc (onderdeel)', 'Uren: OBDex mediaan 0,5–1,5 u'] },
    dynamo: { naam: 'Dynamo', onderdeel: [150, 550], uren: [1, 3], rijden: 'kort', plek: 'dyn',
      wat: 'Laadt de accu op en voedt de elektronica zodra de motor draait.',
      gevolg: 'Zonder laden rijd je op de accu tot die leeg is — meestal een uur of minder, en dan valt de auto stil.',
      alt: { tekst: 'Gereviseerde dynamo', onderdeel: [150, 300], uren: [1, 3] },
      bron: ['ANWB: gereviseerd is een goedkopere optie', 'Onderdeelprijzen Autodoc', 'Uren: OBDex mediaan 1–6 u, vaak 1–3'] },
    accu: { naam: 'Accu', onderdeel: [90, 300], uren: [0.3, 1], rijden: 'plannen', plek: 'accu',
      wat: 'Levert de stroom om te starten en houdt de elektronica wakker als de motor uit staat.',
      gevolg: 'Een zwakke accu laat je op een koude ochtend staan, en geeft onderweg vreemde storingen in andere systemen.',
      bron: ['ANWB: €100–300, start/stop (AGM/EFB) duurder', 'Moderne auto: accu moet worden ingeleerd (ANWB)'] },
    krukas_nok: { naam: 'Kruk- of nokkenassensor', onderdeel: [25, 120], uren: [0.5, 2], rijden: 'kort', plek: 'kruk',
      wat: 'Vertelt de motor waar de zuigers en kleppen staan, zodat ontsteking en inspuiting op tijd komen.',
      gevolg: 'Valt het signaal weg, dan slaat de motor af — soms midden op de weg — en start hij niet meer.',
      bron: ['ANWB: sensor los te vervangen, veel goedkoper dan de as', 'Onderdeelprijzen Autodoc'] },
    klopsensor: { naam: 'Klopsensor', onderdeel: [25, 100], uren: [0.5, 3], rijden: 'plannen', plek: 'klop',
      wat: 'Hoort detonatie in de cilinder en laat de motor de ontsteking terugnemen voordat er schade ontstaat.',
      gevolg: 'De motor neemt uit voorzorg vermogen terug. Zit hij onder het inlaatspruitstuk, dan is het vooral arbeid.',
      bron: ['Onderdeelprijzen Autodoc', 'Uren: OBDex mediaan 0,5–4 u'] },
    brandstofdruk: { naam: 'Brandstofpomp of drukregelaar', onderdeel: [150, 2000], uren: [1, 4], rijden: 'kort', plek: 'pomp',
      wat: 'Pomp en regelaar houden de brandstof op de druk die de injectoren nodig hebben.',
      gevolg: 'Te weinig druk: inhouden onder belasting en uiteindelijk afslaan. De bandbreedte is groot: een opvoerpomp in de tank is iets anders dan een hogedrukpomp.',
      alt: { tekst: 'Eerst het brandstoffilter', onderdeel: [20, 60], uren: [0.5, 1] },
      bron: ['ANWB: €440–2.500 afhankelijk van de pomp, 0,5–5 uur'] },
    turbo: { naam: 'Turbo of laaddruksysteem', onderdeel: [450, 1400], uren: [3, 6], rijden: 'kort', plek: 'turbo',
      wat: 'Perst extra lucht de motor in, aangedreven door het uitlaatgas.',
      gevolg: 'Vaak is het een gescheurde slang of een klem. Is het de turbo zelf en draai je door, dan kan olie of een schoepdeel de motor in.',
      alt: { tekst: 'Turboslang of klem', onderdeel: [20, 120], uren: [0.5, 1.5] },
      bron: ['Vaartland: gemiddeld €1.200', 'Gereviseerde turbo €400–950 excl. btw (Marktplaats)'] },
    roetfilter: { naam: 'Roetfilter (DPF)', onderdeel: [700, 2500], uren: [1.5, 3], rijden: 'plannen', plek: 'dpf',
      wat: 'Vangt het roet van de diesel op en brandt het af tijdens een regeneratie.',
      gevolg: 'Een vol filter geeft noodloop. Korte ritten zijn de oorzaak; een lange rit op de snelweg lost het vaak op.',
      alt: { tekst: 'Filter laten reinigen', onderdeel: [150, 350], uren: [1, 2] },
      bron: ['ANWB: vervangen vanaf €1.000 tot enkele duizenden; reinigen ±€500'] },
    adblue: { naam: 'AdBlue-systeem (pomp of injector)', onderdeel: [250, 900], uren: [1, 3], rijden: 'plannen', plek: 'scr',
      wat: 'Spuit AdBlue in de uitlaat zodat de katalysator NOx kan omzetten.',
      gevolg: 'De auto telt af en start na een aantal honderd kilometer niet meer. Dat is wettelijk zo bedoeld.',
      alt: { tekst: 'Eerst AdBlue bijvullen en kristallen in de injector uitsluiten', onderdeel: [10, 30], uren: [0.3, 1] },
      bron: ['Schatting: onderdeelprijzen (Marktplaats, Autodoc); geen Nederlandse totaalprijs gevonden', 'Uren: OBDex mediaan 0,5–3 u'] },
    noxsensor: { naam: 'NOx-sensor', onderdeel: [150, 450], uren: [0.5, 1.5], rijden: 'plannen', plek: 'scr',
      wat: 'Meet stikstofoxiden in de uitlaat, zodat het AdBlue-systeem weet hoeveel het moet inspuiten.',
      gevolg: 'Het AdBlue-systeem werkt blind. Ook hier kan de auto gaan aftellen tot hij niet meer start.',
      bron: ['Schatting: onderdeelprijzen Autodoc (imitatie ±€150, origineel tot ±€450)', 'Uren: OBDex mediaan 0,5–2,5 u'] },
    gloeibougie: { naam: 'Gloeibougies', onderdeel: [25, 120], uren: [1, 3], rijden: 'plannen', plek: 'cil',
      wat: 'Verwarmen de verbrandingsruimte van een koude diesel zodat hij start.',
      gevolg: 'Slecht starten in de kou en witte rook. Een gloeibougie die vastgeroest is en afbreekt kost veel meer — laat dit aan een garage met het juiste gereedschap.',
      bron: ['Autodoc: €7–11 per stuk, set €24–46 (imitatie)', 'Uren: OBDex mediaan 0,5–3 u'] },
    gasklep: { naam: 'Gasklephuis of gaspedaalsensor', onderdeel: [100, 450], uren: [0.5, 1.5], rijden: 'kort', plek: 'gas',
      wat: 'De elektronische gasklep regelt hoeveel lucht de motor krijgt; het pedaal vertelt hoeveel je wilt.',
      gevolg: 'Bij een storing gaat de motor in noodloop: weinig vermogen, soms vast toerental.',
      alt: { tekst: 'Gasklephuis reinigen en inleren', onderdeel: [5, 15], uren: [0.5, 1] },
      bron: ['Onderdeelprijzen Autodoc', 'Uren: OBDex mediaan 0,5–2 u'] },
    distributie: { naam: 'Distributieketting of -spanner', onderdeel: [250, 900], uren: [6, 14], rijden: 'stop', plek: 'dist',
      wat: 'Houdt krukas en nokkenas precies in de pas, zodat kleppen en zuigers elkaar niet raken.',
      gevolg: 'Springt de ketting over, dan raken kleppen de zuigers: dat is een motor. Rammelen bij de koude start is het waarschuwingssignaal.',
      bron: ['Werkspot: €1.000–2.500, complexe motoren €3.000+', 'TopGear: kapotte ketting kan grote motorschade geven'] },
    vvt: { naam: 'Nokkenasverstelling (VVT)', onderdeel: [30, 150], uren: [0.5, 2], rijden: 'plannen', plek: 'vvt',
      wat: 'Verdraait de nokkenas een paar graden, zodat de motor op elk toerental goed ademt.',
      gevolg: 'Minder vermogen en een onrustige motor. Vaak is het de olie (verkeerd of te oud) of de magneetklep, niet de verstelling zelf.',
      alt: { tekst: 'Olie verversen met de juiste viscositeit', onderdeel: [50, 90], uren: [0.5, 0.7] },
      bron: ['Onderdeelprijzen magneetklep Autodoc', 'De verstelling zelf valt erbuiten: dat is werk van €500 of meer'] },
    swirl: { naam: 'Wervelkleppen (inlaatspruitstuk)', onderdeel: [150, 600], uren: [2, 5], rijden: 'plannen', plek: 'spr',
      wat: 'Kleppen in het inlaatspruitstuk die de lucht laten wervelen voor een betere verbranding bij lage toeren.',
      gevolg: 'Bij sommige diesels kan een losgeschoten klep de motor in. Laat het nakijken.',
      bron: ['Onderdeelprijzen spruitstuk Autodoc', 'Uren: OBDex mediaan 0,5–3 u, spruitstuk eraf vaak meer'] },
    secundairelucht: { naam: 'Secundaire luchtpomp of -klep', onderdeel: [150, 450], uren: [0.5, 2], rijden: 'plannen', plek: 'sec',
      wat: 'Blaast bij een koude start lucht in de uitlaat zodat de katalysator sneller warm is.',
      gevolg: 'Geen gevaar voor de motor, wel een motorlampje en een APK-probleem.',
      bron: ['Onderdeelprijzen Autodoc', 'Uren: OBDex mediaan 0,5–3 u'] },
    evap: { naam: 'Tankdop of EVAP-systeem', onderdeel: [10, 120], uren: [0.3, 1.5], rijden: 'plannen', plek: 'tank',
      wat: 'Vangt benzinedamp uit de tank op in een koolstoffilter en laat de motor die verbranden.',
      gevolg: 'Geen gevaar, wel benzinelucht en een motorlampje.',
      alt: { tekst: 'Tankdop goed dichtdraaien tot hij klikt', onderdeel: [0, 0], uren: [0, 0] },
      bron: ['Onderdeelprijzen tankdop/purgeklep Autodoc', 'Uren: OBDex mediaan 0,5–2 u'] },
    automaat: { naam: 'Automaat (klep, sensor of olie)', onderdeel: [80, 600], uren: [1, 4], rijden: 'kort', plek: 'bak',
      wat: 'De automaat schakelt met olie onder druk, gestuurd door magneetkleppen.',
      gevolg: 'Doorrijden met een slippende bak maakt de schade groter. Een revisie of andere bak valt buiten dit bedrag: dat is €2.000–5.000.',
      alt: { tekst: 'Bakolie en filter verversen', onderdeel: [80, 200], uren: [1, 2] },
      bron: ['Onderdeelprijzen Autodoc', 'Uren: OBDex mediaan 1–5 u'] },
    communicatie: { naam: 'Bedrading of verbinding tussen modules', onderdeel: [0, 60], uren: [0.5, 3], rijden: 'plannen', plek: 'ecu',
      wat: 'De stuurapparaten praten via de CAN-bus met elkaar. Een slechte stekker of massa onderbreekt dat gesprek.',
      gevolg: 'Losse storingen in verschillende systemen. Het meeste geld zit in het zoeken.',
      alt: { tekst: 'Eerst de accuspanning en de accupolen', onderdeel: [0, 0], uren: [0.2, 0.5] },
      bron: ['Uren: OBDex mediaan 0,5–3 u, vooral diagnose'] },
    ecu: { naam: 'Stuurapparaat', onderdeel: [300, 1200], uren: [1, 3], rijden: 'kort', plek: 'ecu',
      wat: 'De computer die de motor regelt.',
      gevolg: 'Zelden echt kapot. Vaak is het een software-update of een voedingsprobleem; een nieuw apparaat moet worden gecodeerd.',
      alt: { tekst: 'Software-update of herprogrammeren', onderdeel: [0, 0], uren: [0.5, 1.5] },
      bron: ['Schatting: gereviseerd/nieuw met codering', 'Uren: OBDex mediaan 0,5–3 u'] },
    sensor: { naam: 'Sensor (temperatuur, druk of stand)', onderdeel: [25, 150], uren: [0.3, 1.5], rijden: 'plannen', plek: 'ecu',
      wat: 'Een van de vele meters waarop de motor zijn regeling baseert.',
      gevolg: 'De motor rekent met een vervangwaarde: meestal rijdbaar, wel minder zuinig of in noodloop.',
      bron: ['Onderdeelprijzen Autodoc', 'Uren: OBDex mediaan 0,5–3 u'] }
  };

  var RIJDEN = {
    stop: { kleur: '#ef4444', kort: 'Stop', tekst: 'Niet doorrijden. Zet de auto stil en laat hem nakijken voordat er grotere schade ontstaat.' },
    kort: { kleur: '#f59e0b', kort: 'Binnenkort', tekst: 'Rustig doorrijden kan, maar plan de garage binnen een paar dagen. Wachten maakt het duurder.' },
    plannen: { kleur: '#22c55e', kort: 'Inplannen', tekst: 'Geen haast. Neem het mee bij de volgende beurt, en vóór de APK.' }
  };

  // ── Uurtarief ────────────────────────────────────────────────────────
  var TARIEF_SLEUTEL = 'pl_kosten_tarief';
  function tarief() {
    var r = null;
    try { r = JSON.parse(localStorage.getItem(TARIEF_SLEUTEL) || 'null'); }
    catch (e) { console.warn('PLKosten: uurtarief niet leesbaar, standaard universeel', e); }
    return schoonTarief(r);
  }
  function schoonTarief(r) {
    if (r && r.soort === 'eigen' && isFinite(r.exBtw) && r.exBtw >= TARIEF_MIN && r.exBtw <= TARIEF_MAX)
      return { soort: 'eigen', naam: 'Eigen garage', exBtw: Math.round(r.exBtw) };
    var s = r && TARIEVEN[r.soort] ? r.soort : 'universeel';
    return { soort: s, naam: TARIEVEN[s].naam, exBtw: TARIEVEN[s].exBtw };
  }
  function zetTarief(soort, exBtw) {
    var t = schoonTarief({ soort: soort, exBtw: Number(exBtw) });
    try { localStorage.setItem(TARIEF_SLEUTEL, JSON.stringify({ soort: t.soort, exBtw: t.exBtw })); }
    catch (e) { console.warn('PLKosten: uurtarief niet opgeslagen', e); }
    return t;
  }

  // ── Rekenen ──────────────────────────────────────────────────────────
  function rond5(x) { return Math.round(x / 5) * 5; }
  function reken(onderdeel, uren, t) {
    var uur = t.exBtw * (1 + BTW);
    return [rond5(onderdeel[0] + uren[0] * uur), rond5(onderdeel[1] + uren[1] * uur)];
  }
  /* schat(id, t?) → null als het onderdeel niet in de tabel staat. Met t kan
     een test of rapport een vast tarief meegeven; anders het gekozen tarief. */
  function schat(id, t) {
    var k = Object.prototype.hasOwnProperty.call(KOSTEN, id) ? KOSTEN[id] : null;
    if (!k) return null;
    t = t ? schoonTarief(t) : tarief();
    var uur = Math.round(t.exBtw * (1 + BTW));
    return {
      id: id, naam: k.naam, totaal: reken(k.onderdeel, k.uren, t),
      onderdeel: k.onderdeel.slice(), uren: k.uren.slice(), uurInclBtw: uur, tarief: t,
      alt: k.alt ? { tekst: k.alt.tekst, totaal: reken(k.alt.onderdeel, k.alt.uren, t) } : null,
      rijden: k.rijden, peil: PEIL
    };
  }

  /* voorCode(code) → { onderdeel, via } of null. Volgorde: het onderdeel
     van de DTC_PLAN-familie, dan de OBDex-koppeling, anders niets. Een
     familie zonder onderdeel maar mét kost geeft { onderdeel:null, via:
     'familie', kost } zodat er per code precies één bedrag is. */
  var _codeKaart = null;
  function codeKaart() {
    if (_codeKaart) return _codeKaart;
    var bron = (typeof window !== 'undefined' && window.PL_KOSTEN_CODES) || {};
    var m = {};
    Object.keys(bron).forEach(function (id) {
      String(bron[id]).split(' ').forEach(function (c) { if (c) m[c] = id; });
    });
    _codeKaart = m;
    return m;
  }
  function familie(c) {
    var P = (typeof window !== 'undefined' && window.DTC_PLAN) || {};
    for (var n = 5; n >= 1; n--) { var p = P[c.slice(0, n)]; if (p) return p; }
    return null;
  }
  function voorCode(code) {
    var c = String(code || '').toUpperCase().trim();
    if (!/^[PBCU][0-9A-F]{4}$/.test(c)) return null;
    var f = familie(c);
    if (f && f.onderdeel && KOSTEN[f.onderdeel]) return { onderdeel: f.onderdeel, via: 'familie' };
    // Merkcodes en hybride: geen bedrag, ook niet via OBDex.
    if (/^P[13]/.test(c) || /^P0A/.test(c)) return f && f.kost ? { onderdeel: null, via: 'familie', kost: f.kost.slice() } : null;
    var id = codeKaart()[c];
    if (id && KOSTEN[id]) return { onderdeel: id, via: 'obdex' };
    if (f && f.kost) return { onderdeel: null, via: 'familie', kost: f.kost.slice() };
    return null;
  }
  // Het bedrag bij een code, of null. Dit is wat dtcPlan() als kost geeft.
  function kostCode(code, t) {
    var v = voorCode(code);
    if (!v) return null;
    if (v.onderdeel) return schat(v.onderdeel, t).totaal;
    return v.kost || null;
  }

  // ── Het schema: waar zit het? ─────────────────────────────────────────
  /* Een doorzichtige auto in zijaanzicht, voorkant links (26-11-2026). Het
     onderdeel licht op op zijn échte plek: motor en accu voor, kat en
     roetfilter onder de vloer, tank onder de achterbank — een leek ziet
     "waar in de auto" en niet alleen "waar in de motor". Lucht stroomt door
     de grille naar binnen, uitlaatgas onder de vloer naar achteren.
     Kleuren alleen via classes in pidlane.css (.pk-s*), op de thematokens
     --bl en --or: een var() in een SVG-attribuut werkt niet. Geen foto's:
     die verschillen per auto en hebben een licentie.
     PLEKKEN: [x, y, breedte, hoogte, label] in viewBox 0 0 440 200. */
  var PLEKKEN = {
    fan: [30, 100, 8, 34, 'Ventilator'], maf: [42, 93, 18, 7, 'Luchtmassameter'], turbo: [44, 122, 16, 16, 'Turbo'],
    gas: [64, 92, 14, 8, 'Gasklep'], spr: [82, 91, 40, 8, 'Inlaatspruitstuk'], inj: [88, 100, 6, 6, 'Injector'],
    cil: [82, 102, 40, 28, 'Cilinders'], dist: [75, 102, 6, 30, 'Distributie'], vvt: [123, 101, 8, 10, 'VVT'],
    klop: [123, 115, 8, 8, 'Klopsensor'], kruk: [90, 130, 24, 6, 'Krukas'], olie: [82, 137, 40, 5, 'Oliedruk'],
    thermo: [64, 104, 9, 8, 'Thermostaat'], dyn: [62, 124, 12, 12, 'Dynamo'], egr: [130, 92, 12, 8, 'EGR'],
    sec: [44, 106, 12, 8, 'Sec. lucht'], accu: [134, 106, 16, 14, 'Accu'], ecu: [134, 124, 16, 10, 'Stuurapparaat'],
    bak: [150, 128, 34, 12, 'Versnellingsbak'], l1: [146, 146, 6, 8, 'Lambda 1'], kat: [158, 144, 30, 12, 'Kat'],
    l2: [194, 146, 6, 8, 'Lambda 2'], dpf: [206, 144, 30, 12, 'DPF'], scr: [242, 144, 26, 12, 'AdBlue/SCR'],
    tank: [272, 126, 50, 16, 'Tank'], pomp: [280, 128, 12, 12, 'Brandstofpomp']
  };
  var SCHEMA = {
    body: 'M22 150L18 124Q18 104 34 100L144 88Q166 68 196 56L300 54Q330 58 362 86L404 92Q416 96 416 114L414 150L366 150A28 28 0 0 0 310 150L120 150A28 28 0 0 0 64 150Z',
    ramen: 'M156 88L198 62L248 61L248 88ZM254 61L298 60Q322 64 348 86L254 88Z',
    lijnen: 'M18 124H60M144 88L150 140M252 60V146M150 118H362M362 86L366 140M396 106H414',
    interieur: 'M196 124L206 92L214 92L206 126ZM276 124L284 94L292 94L286 126Z',
    lucht: 'M16 97H44M60 97H64M78 96H82M52 100V122', uit: 'M124 112Q140 118 142 150H372Q392 150 420 148',
    luchtBaan: 'M14 97H82V104', wielen: [[92, 154], [338, 154]]
  };
  var _schemaNr = 0;
  function schemaSvg(id) {
    var k = KOSTEN[id], aan = k ? k.plek : null, n = ++_schemaNr, S = SCHEMA;
    var stil = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var h = '<svg class="pk-schema" viewBox="0 0 440 200" role="img" aria-label="' +
      esc(k ? 'Waar zit het: ' + k.naam : 'Schema van de auto') + '"><defs>' +
      '<linearGradient id="pkG' + n + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="pk-sg1"/><stop offset=".55" class="pk-sg2"/><stop offset="1" class="pk-sg3"/></linearGradient>' +
      '<filter id="pkF' + n + '" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
    h += '<ellipse class="pk-sschaduw" cx="218" cy="178" rx="200" ry="9"/>';
    h += '<path class="pk-sbody" d="' + S.body + '" fill="url(#pkG' + n + ')"/>';
    h += '<path class="pk-sglans" d="M40 100Q200 70 400 94"/>';
    h += '<path class="pk-sraam" d="' + S.ramen + '"/><path class="pk-slijn" d="' + S.lijnen + '"/>';
    h += '<path class="pk-sdeel" d="' + S.interieur + '"/><circle class="pk-slijn" cx="178" cy="98" r="7"/>';
    h += '<path class="pk-suit" d="' + S.uit + '"/><path class="pk-slucht" d="' + S.lucht + '"/>';
    Object.keys(PLEKKEN).forEach(function (p) {
      if (p === aan) return;
      var r = PLEKKEN[p];
      h += '<rect class="pk-sdeel" x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '" rx="2"/>';
    });
    for (var i = 0; i < 4; i++) h += '<rect class="pk-szuiger" style="animation-delay:' + (i % 2 * 0.25) + 's" x="' + (86 + i * 9.5) + '" y="106" width="6" height="16" rx="1.5"/>';
    S.wielen.forEach(function (w) {
      var x = w[0], y = w[1];
      h += '<circle class="pk-swiel" cx="' + x + '" cy="' + y + '" r="22"/><circle class="pk-slijn" cx="' + x + '" cy="' + y + '" r="13"/>' +
        '<path class="pk-sspaak" d="M' + x + ' ' + (y - 13) + 'V' + (y + 13) + 'M' + (x - 13) + ' ' + y + 'H' + (x + 13) +
        'M' + (x - 9) + ' ' + (y - 9) + 'L' + (x + 9) + ' ' + (y + 9) + 'M' + (x + 9) + ' ' + (y - 9) + 'L' + (x - 9) + ' ' + (y + 9) + '"/>';
    });
    if (!stil) {
      var deeltjes = function (pad, cls, aantal, dur) {
        for (var j = 0; j < aantal; j++) h += '<circle class="' + cls + '" r="1.7"><animateMotion dur="' + dur + 's" begin="' + (-j * dur / aantal).toFixed(2) + 's" repeatCount="indefinite" path="' + pad + '"/></circle>';
      };
      deeltjes(S.luchtBaan, 'pk-sdlucht', 7, 1.8);
      deeltjes(S.uit, 'pk-sduit', 10, 2.2);
    }
    [[90, 80, 'MOTORRUIMTE'], [210, 176, 'ONDER DE VLOER'], [296, 118, 'ACHTERBANK']].forEach(function (z) {
      h += '<text class="pk-szone" x="' + z[0] + '" y="' + z[1] + '" text-anchor="middle">' + z[2] + '</text>';
    });
    if (aan && PLEKKEN[aan]) {
      var r = PLEKKEN[aan], cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
      var lx = Math.min(330, Math.max(70, cx + (cx < 200 ? 50 : -50))), lw = r[4].length * 6.4 + 20;
      h += '<rect class="pk-aan" x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '" rx="2" filter="url(#pkF' + n + ')"/>';
      for (i = 0; i < 2; i++) h += '<circle class="pk-sring" style="animation-delay:' + (i * 0.9) + 's" cx="' + cx + '" cy="' + cy + '" r="' + (Math.max(r[2], r[3]) / 2 + 3) + '"/>';
      h += '<g class="pk-scallout"><path class="pk-sleider" d="M' + cx + ' ' + cy + 'V40H' + lx + '"/><circle class="pk-spunt" cx="' + cx + '" cy="' + cy + '" r="2.2"/>' +
        '<rect class="pk-spil" x="' + (lx - lw / 2) + '" y="24" width="' + lw + '" height="16" rx="8"/>' +
        '<text class="pk-slabel" x="' + lx + '" y="35.5" text-anchor="middle">' + esc(r[4]) + '</text></g>';
    }
    return h + '</svg>';
  }

  // ── Tekst en HTML ────────────────────────────────────────────────────
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (x) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]; }); }
  function euro(a) { return '€ ' + a[0].toLocaleString('nl-NL') + (a[1] !== a[0] ? ' – ' + a[1].toLocaleString('nl-NL') : ''); }
  function uren(a) { var f = function (x) { return String(x).replace('.', ','); }; return a[0] === a[1] ? f(a[0]) + ' uur' : f(a[0]) + '–' + f(a[1]) + ' uur'; }
  function peilTekst() { return new Date(PEIL + 'T12:00:00').toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }); }

  /* kaartHtml(id, opt) — de kostenkaart. opt.bewijs: regels "waarop dit
     rust" (uit PLOnderdeel), opt.code: de foutcode waar het vandaan komt,
     opt.t: vast tarief (test). Leeg bij een onbekend onderdeel. */
  function kaartHtml(id, opt) {
    opt = opt || {};
    var s = schat(id, opt.t);
    if (!s) return '';
    var k = KOSTEN[id], rij = RIJDEN[k.rijden];
    var h = '<div class="pk-kaart" data-onderdeel="' + esc(id) + '">';
    h += '<div class="pk-kop"><b>' + esc(k.naam) + '</b>' + (opt.code ? '<span class="pk-code">' + esc(opt.code) + '</span>' : '') + '</div>';
    h += schemaSvg(id);
    h += '<div class="pk-bedrag">' + euro(s.totaal) + '</div>';
    h += '<div class="pk-uit">onderdeel ' + euro(k.onderdeel) + ' · arbeid ' + uren(k.uren) + ' à € ' + s.uurInclBtw + ' (' + esc(s.tarief.naam.toLowerCase()) + ', incl. btw)</div>';
    if (s.alt) h += '<div class="pk-alt">💡 Vaak volstaat: <b>' + esc(s.alt.tekst) + '</b> — ' + euro(s.alt.totaal) + '</div>';
    h += '<div class="pk-rij" style="border-left-color:' + rij.kleur + '"><b style="color:' + rij.kleur + '">' + esc(rij.kort) + '</b> — ' + esc(rij.tekst) + '</div>';
    h += '<div class="pk-blok"><div class="pk-bk">Wat doet het?</div>' + esc(k.wat) + '</div>';
    h += '<div class="pk-blok"><div class="pk-bk">Als je het laat zitten</div>' + esc(k.gevolg) + '</div>';
    if (opt.bewijs && opt.bewijs.length) {
      h += '<div class="pk-blok"><div class="pk-bk">Waarom de app hierop uitkomt</div><ul class="pk-lijst">' +
        opt.bewijs.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul></div>';
    }
    h += '<details class="pk-bron"><summary>Hoe dit bedrag tot stand komt</summary><ul>' +
      k.bron.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') +
      '<li>Uurtarief: ' + esc(s.tarief.naam) + ' € ' + s.tarief.exBtw + ' excl. btw' + (s.tarief.soort === 'dealer' ? ' (dealers liggen boven € 100; 110 is een aanname)' : s.tarief.soort === 'universeel' ? ' (RAI Aftermarket, aug. 2026)' : ' (zelf ingevuld)') + '</li>' +
      '<li>Prijspeil ' + esc(peilTekst()) + '. Een indicatie, geen offerte: de garage stelt de prijs vast.</li></ul></details>';
    return h + '</div>';
  }

  /* kaartTekst(id, opt) — dezelfde kaart als platte tekst, om te delen met
     een garage. Geen kenteken of VIN: die voegt de klant zelf toe als hij
     dat wil (de privacyregel van §7). */
  function kaartTekst(id, opt) {
    opt = opt || {};
    var s = schat(id, opt.t);
    if (!s) return '';
    var k = KOSTEN[id], rij = RIJDEN[k.rijden];
    var r = [];
    r.push('PidLane — ' + k.naam + (opt.code ? ' (' + opt.code + ')' : ''));
    if (opt.auto) r.push('Auto: ' + opt.auto);
    r.push('Indicatie: ' + euro(s.totaal).replace('€ ', 'EUR ') + ' (onderdeel ' + euro(k.onderdeel).replace('€ ', 'EUR ') + ', arbeid ' + uren(k.uren) + ')');
    if (s.alt) r.push('Vaak volstaat: ' + s.alt.tekst + ' — ' + euro(s.alt.totaal).replace('€ ', 'EUR '));
    r.push(rij.kort + ': ' + rij.tekst);
    if (opt.bewijs && opt.bewijs.length) { r.push('Gemeten:'); opt.bewijs.forEach(function (b) { r.push('- ' + b); }); }
    r.push('Prijspeil ' + peilTekst() + ', ' + s.tarief.naam.toLowerCase() + '. Indicatie, geen offerte.');
    return r.join('\n');
  }

  /* rapportRijen(items, t?) — voor PLRapport en PLAankoop: per item {id} of
     {code} één rij met naam, bedrag en rijadvies. Wat geen bedrag heeft,
     valt weg; de rapporten zeggen zelf dat er dan geen indicatie is. */
  function rapportRijen(items, t) {
    var gezien = {}, uit = [];
    (items || []).forEach(function (it) {
      var id = it && it.id, code = it && it.code ? String(it.code).toUpperCase() : '';
      var kost = null;
      if (!id && code) {
        var v = voorCode(code);
        if (!v) return;
        id = v.onderdeel; kost = v.kost || null;
      }
      var sleutel = id || code;
      if (gezien[sleutel]) { if (code && gezien[sleutel].codes.indexOf(code) < 0) gezien[sleutel].codes.push(code); return; }
      var s = id ? schat(id, t) : null;
      if (!s && !kost) return;
      var rij = {
        id: id || null, naam: s ? s.naam : 'Foutcode ' + code, codes: code ? [code] : [],
        totaal: s ? s.totaal : kost, alt: s && s.alt ? s.alt : null,
        rijden: s ? s.rijden : null, rijdenKort: s ? RIJDEN[s.rijden].kort : '–'
      };
      gezien[sleutel] = rij; uit.push(rij);
    });
    return uit;
  }

  // ── Scherm ───────────────────────────────────────────────────────────
  var _open = null;
  function ov() {
    var o = document.getElementById('plKostOv');
    if (o) return o;
    o = document.createElement('div');
    o.id = 'plKostOv';
    o.className = 'pk-ov';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.innerHTML = '<div class="pk-doos"><div class="pk-top"><div class="pk-titel">💶 Wat kost dit?</div>' +
      '<button class="pk-x" aria-label="Sluiten" onclick="PLKosten.sluit()">✕</button></div><div class="pk-body" id="pkBody"></div></div>';
    o.addEventListener('click', function (e) { if (e.target === o) sluit(); });
    document.body.appendChild(o);
    return o;
  }
  function tariefHtml() {
    var t = tarief();
    var knop = function (s, label) { return '<button class="pk-tk' + (t.soort === s ? ' aan' : '') + '" onclick="PLKosten._tarief(\'' + s + '\')">' + label + '</button>'; };
    return '<div class="pk-tarief"><div class="pk-bk">Rekenen met</div><div class="pk-tks">' +
      knop('universeel', 'Universeel') + knop('dealer', 'Dealer') + knop('eigen', 'Eigen tarief') + '</div>' +
      (t.soort === 'eigen' ? '<label class="pk-eigen">€ <input id="pkEigen" type="number" inputmode="numeric" min="' + TARIEF_MIN + '" max="' + TARIEF_MAX + '" value="' + t.exBtw + '"> per uur excl. btw <button class="pk-tk" onclick="PLKosten._tarief(\'eigen\', document.getElementById(\'pkEigen\').value)">Toepassen</button></label>' : '') +
      '</div>';
  }
  function teken() {
    var b = document.getElementById('pkBody');
    if (!b || !_open) return;
    b.innerHTML = kaartHtml(_open.id, _open) + tariefHtml() +
      '<div class="pk-acties"><button class="pk-deel" onclick="PLKosten.deel()">📤 Deel met je garage</button></div>' +
      '<div class="pk-noot">De bedragen zijn een indicatie op basis van gemiddelde onderdeelprijzen en werkuren. Je kenteken en VIN gaan niet mee in wat je deelt.</div>';
  }
  /* open(id | {code}, opt) — opent de kostenkaart. Een code wordt via
     voorCode() naar een onderdeel vertaald; zonder onderdeel valt er niets
     te tonen en dan zegt open() dat met false. */
  function open(wat, opt) {
    opt = opt || {};
    var id = typeof wat === 'string' ? wat : null, code = opt.code || (wat && wat.code) || null;
    if (!id && code) { var v = voorCode(code); id = v && v.onderdeel; }
    if (!id || !KOSTEN[id]) { console.warn('PLKosten.open: geen onderdeel bij ' + (code || wat)); return false; }
    _open = { id: id, code: code, bewijs: opt.bewijs || null };
    var o = ov();
    o.style.display = 'flex';
    teken();
    return true;
  }
  function sluit() { var o = document.getElementById('plKostOv'); if (o) o.style.display = 'none'; _open = null; }
  function _tarief(soort, exBtw) {
    if (soort === 'eigen' && exBtw == null) exBtw = tarief().soort === 'eigen' ? tarief().exBtw : TARIEVEN.universeel.exBtw;
    zetTarief(soort, exBtw);
    teken();
  }
  function autoNaam() {
    try {
      var v = (typeof vehicleInfo !== 'undefined' && vehicleInfo) || {};
      return [v.merk, v.model, v.year].filter(function (x) { return x && x !== 'Onbekend'; }).join(' ');
    } catch (e) { console.warn('PLKosten: voertuignaam onbekend', e); return ''; }
  }
  async function deel() {
    if (!_open) return false;
    var tekst = kaartTekst(_open.id, { code: _open.code, bewijs: _open.bewijs, auto: autoNaam() });
    try {
      if (navigator.share) { await navigator.share({ title: 'PidLane — ' + KOSTEN[_open.id].naam, text: tekst }); return true; }
    } catch (e) {
      if (e && e.name === 'AbortError') return false;     // de klant brak zelf af
      console.warn('PLKosten: delen faalde, terugval op klembord', e);
    }
    try {
      await navigator.clipboard.writeText(tekst);
      if (typeof showToast === 'function') showToast('Gekopieerd — plak het in een bericht aan je garage');
      return true;
    } catch (e) {
      console.warn('PLKosten: klembord niet beschikbaar', e);
      if (typeof showToast === 'function') showToast('Delen lukt niet op dit toestel');
      return false;
    }
  }

  window.PLKosten = {
    PEIL: PEIL, BTW: BTW, TARIEVEN: TARIEVEN, KOSTEN: KOSTEN, RIJDEN: RIJDEN,
    tarief: tarief, zetTarief: zetTarief, schat: schat, voorCode: voorCode, kostCode: kostCode,
    schemaSvg: schemaSvg, kaartHtml: kaartHtml, kaartTekst: kaartTekst, rapportRijen: rapportRijen,
    euro: euro, open: open, sluit: sluit, deel: deel, _tarief: _tarief,
    _reset: function () { _codeKaart = null; }
  };
})();
