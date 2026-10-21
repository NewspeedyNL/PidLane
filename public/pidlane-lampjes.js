/* ═══════════════════════════════════════════════════════════════════
   pidlane-lampjes.js — PLLampjes: welk lampje brandt er, en wat nu?
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (29-09-2026)

   "Er brandt een lampje" is de meest gestelde vraag waar een OBD-app bij
   hoort — en de vraag komt op het moment dat je nog niet verbonden bent,
   vaak niet eens in de buurt van de adapter. De eerste beslissing is dan
   niet "welke foutcode" maar "mag ik doorrijden". Dit venster geeft die
   beslissing, zonder net en zonder adapter, en wijst daarna naar wat de app
   met een adapter kan meten.

   DE KLEUR IS DE BESLISSING, NIET HET PICTOGRAM
   Fabrikanten tekenen hun lampjes verschillend, maar de kleurcode is vrijwel
   overal gelijk: rood = stoppen zodra het veilig kan, oranje/geel = rustig
   door en laten nakijken, groen/blauw = informatie. Elke regel draagt
   `doorrijden` ('nee' | 'voorzichtig' | 'nadat' | 'ja'); een rood lampje is nooit 'ja'
   (test-lampjes.js). Het pictogram staat er als beschrijving bij (`vorm`),
   zodat je hem herkent zonder dat de app een plaatje van één merk toont.

   WAT DE ADAPTER ERBIJ KAN
   `obd` zegt wat de app daarna meet: 'check' (Check mijn auto: foutcodes en
   keuringsstatus), een PID voor de live meting (koelwater, accuspanning), of
   niets — de airbag en het ABS zitten in eigen regeleenheden die een gewone
   OBD-uitlezing meestal niet ziet, en dat zegt het venster dan ook.

   PUUR EN NIET PUUR. LAMPJES en zoek() zijn puur; test-lampjes.js toetst
   ze met vm. De rest raakt de DOM.

   Laadvolgorde: ná pidlane-zonder.js. Gebruikt PLNav, openLiveView en het
   verbindscherm pas bij het aanroepen.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KLEUR = {
    rood: { tekst: 'Rood — stop zodra het veilig kan', kort: 'Rood' },
    oranje: { tekst: 'Oranje — rustig door en laten nakijken', kort: 'Oranje' },
    info: { tekst: 'Groen of blauw — informatie', kort: 'Info' }
  };
  var DOOR = {
    nee: 'Niet doorrijden. Zet de auto zo snel het veilig kan stil.',
    voorzichtig: 'Voorzichtig doorrijden naar huis of een garage; niet verder dan nodig.',
    nadat: 'Doorrijden kan, zodra je het hebt opgelost (zie hieronder).',
    ja: 'Je kunt doorrijden.'
  };

  // id, naam, kleur, vorm (hoe het pictogram eruitziet; het pictogram zelf staat in PICTO),
  // betekent, doen, doorrijden, obd, zoek (extra zoekwoorden)
  var LAMPJES = [
    { id: 'olie', naam: 'Oliedruk', kleur: 'rood', vorm: 'een oliekannetje met een druppel',
      betekent: 'De oliedruk is te laag. De motor wordt dan niet meer goed gesmeerd.',
      doen: 'Stop zo snel het veilig kan en zet de motor uit. Controleer met de peilstok het oliepeil (auto recht, motor een paar minuten uit). Te laag: bijvullen met de olie uit het onderhoudsboekje. Gaat het lampje daarna niet uit, of was het peil goed: laat de auto wegslepen. Doorrijden kan de motor binnen minuten ruïneren.',
      doorrijden: 'nee', obd: null, zoek: 'olie oliepeil smering kannetje' },
    { id: 'koelwater', naam: 'Koelvloeistoftemperatuur', kleur: 'rood', vorm: 'een thermometer in golvende lijnen (vloeistof)',
      betekent: 'De motor is te heet, of er is te weinig koelvloeistof.',
      doen: 'Stop zo snel het veilig kan en zet de motor uit. Open het expansievat níét terwijl de motor heet is — de vloeistof staat onder druk. Laat hem minstens een half uur afkoelen en controleer dan het peil. Lekt er iets of loopt hij opnieuw warm: niet verder rijden.',
      doorrijden: 'nee', obd: '0105', zoek: 'koelwater temperatuur oververhit heet thermometer koeling' },
    { id: 'laden', naam: 'Accu / laadstroom', kleur: 'rood', vorm: 'een accu met een plus en een min',
      betekent: 'De dynamo laadt de accu niet op. De auto rijdt dan op wat er nog in de accu zit.',
      doen: 'Zet alles uit wat stroom vraagt (ventilator, stoelverwarming, radio). Rijd zonder te stoppen naar huis of een garage: na het afzetten start hij misschien niet meer. Valt ook de stuurbekrachtiging weg of wordt de motor warm, dan kan de aandrijfriem gebroken zijn: stop dan meteen.',
      doorrijden: 'voorzichtig', obd: '0142', zoek: 'accu dynamo laden batterij stroom spanning' },
    { id: 'rem', naam: 'Remsysteem', kleur: 'rood', vorm: 'een uitroepteken in een cirkel, tussen twee haakjes',
      betekent: 'De handrem staat aan, er is te weinig remvloeistof, of het remsysteem heeft een storing.',
      doen: 'Kijk eerst of de handrem helemaal los is. Blijft het lampje branden, stop dan en controleer het remvloeistofreservoir. Te laag of een zacht rempedaal: niet verder rijden.',
      doorrijden: 'nee', obd: null, zoek: 'rem remmen handrem parkeerrem remvloeistof uitroepteken' },
    { id: 'handrem', naam: 'Handrem (parkeerrem)', kleur: 'rood', vorm: 'een P in een cirkel, tussen twee haakjes',
      betekent: 'De handrem of elektrische parkeerrem staat aan. Knippert hij, dan heeft de elektrische parkeerrem een storing.',
      doen: 'Zet de handrem helemaal los. Blijft hij branden of knippert hij: niet wegrijden, de remmen kunnen vastzitten. Bij een elektrische parkeerrem staat in het instructieboekje hoe je hem bij een storing lossert.',
      doorrijden: 'nadat', obd: 'geen', zoek: 'handrem parkeerrem p epb elektrische' },
    { id: 'deur', naam: 'Deur, klep of motorkap open', kleur: 'rood', vorm: 'een auto van boven met een open deur of klep',
      betekent: 'Een portier, de achterklep of de motorkap is niet goed dicht.',
      doen: 'Stop en sluit hem goed. Een motorkap die openslaat ontneemt je het zicht.',
      doorrijden: 'nadat', obd: null, zoek: 'deur portier klep kofferbak motorkap open' },
    { id: 'gordel', naam: 'Veiligheidsgordel', kleur: 'rood', vorm: 'een zittend poppetje met een gordel schuin over de borst',
      betekent: 'Iemand in de auto heeft de gordel niet om (soms ook: er ligt iets zwaars op een stoel).',
      doen: 'Gordels om. Ligt er een tas op de stoel naast je, dan kan die het lampje ook laten branden.',
      doorrijden: 'nadat', obd: null, zoek: 'gordel riem piepen' },
    { id: 'airbag', naam: 'Airbag', kleur: 'rood', vorm: 'een zittend poppetje met een bal ervoor (soms de letters SRS)',
      betekent: 'Het airbagsysteem of de gordelspanners hebben een storing. Bij een ongeluk gaan ze dan mogelijk niet af.',
      doen: 'Rijden kan, maar laat het snel nakijken. Een losgeschoten stekker onder een voorstoel is een bekende oorzaak.',
      doorrijden: 'voorzichtig', obd: 'geen', zoek: 'airbag srs gordelspanner' },
    { id: 'stuur', naam: 'Stuurbekrachtiging', kleur: 'rood', vorm: 'een stuurwiel met een uitroepteken',
      betekent: 'De stuurbekrachtiging werkt niet of maar deels. Sturen wordt zwaar, vooral bij lage snelheid.',
      doen: 'Rijd rustig en houd rekening met veel meer kracht in bochten en bij parkeren. Laat het nakijken voor je verder gaat dan nodig.',
      doorrijden: 'voorzichtig', obd: null, zoek: 'stuur stuurbekrachtiging zwaar sturen eps' },

    { id: 'motor', naam: 'Motorstoring (motorlampje)', kleur: 'oranje', vorm: 'een motorblok van opzij (soms met CHECK of de letters EPC)',
      betekent: 'Het motormanagement heeft een storing opgeslagen: van een slecht sluitende tankdop tot een ontstekingsprobleem. Brandt hij continu, dan is het niet acuut. KNIPPERT hij, dan slaat de motor over en kan onverbrande brandstof de katalysator beschadigen.',
      doen: 'Continu: rustig doorrijden en binnenkort laten uitlezen. Knippert hij: gas terug, geen hoge toerentallen, en zo snel mogelijk naar een garage. Met de adapter lees je hier zelf de foutcode uit.',
      doorrijden: 'voorzichtig', obd: 'check', zoek: 'motor motorlampje mil check engine epc storing knippert' },
    { id: 'abs', naam: 'ABS', kleur: 'oranje', vorm: 'de letters ABS in een cirkel',
      betekent: 'Het antiblokkeersysteem werkt niet. De gewone remmen werken nog wel; bij een noodstop kunnen de wielen blokkeren.',
      doen: 'Rijd voorzichtig, houd meer afstand, vooral op nat wegdek. Laat het nakijken. Brandt tegelijk het rode remlampje: stop.',
      doorrijden: 'voorzichtig', obd: 'geen', zoek: 'abs antiblokkeer remmen blokkeren' },
    { id: 'esp', naam: 'Stabiliteitscontrole (ESP / ESC)', kleur: 'oranje', vorm: 'een auto met twee slingerende sporen erachter',
      betekent: 'Knippert hij tijdens het rijden, dan grijpt het systeem in: normaal op glad wegdek. Brandt hij continu, dan staat het uit of is er een storing.',
      doen: 'Knipperen: gas terug, rustig rijden. Continu: kijk of je hem per ongeluk hebt uitgezet (knop met hetzelfde pictogram en OFF). Anders laten nakijken.',
      doorrijden: 'voorzichtig', obd: null, zoek: 'esp esc tractie slip glad stabiliteit asr' },
    { id: 'banden', naam: 'Bandenspanning', kleur: 'oranje', vorm: 'een doorsnede van een band (hoefijzervorm) met een uitroepteken',
      betekent: 'Eén of meer banden hebben te weinig spanning.',
      doen: 'Kijk of een band zichtbaar zacht is; zo ja, niet doorrijden en wiel wisselen. Anders bij het eerstvolgende tankstation alle vier op spanning brengen (de waarden staan op een sticker in de deurstijl of de tankklep). Op sommige auto’s moet je het systeem daarna opnieuw instellen.',
      doorrijden: 'voorzichtig', obd: null, zoek: 'band banden bandenspanning tpms lek zacht' },
    { id: 'voorgloei', naam: 'Voorgloeien (diesel)', kleur: 'oranje', vorm: 'een spiraaltje (twee of drie lusjes)',
      betekent: 'Bij het starten: de gloeibougies warmen voor. Dat is normaal. Gaat hij tijdens het rijden branden of knipperen, dan heeft het motormanagement een storing.',
      doen: 'Bij het starten: wacht tot hij uitgaat en start dan. Tijdens het rijden: rustig door en laten uitlezen.',
      doorrijden: 'ja', obd: 'check', zoek: 'voorgloeien gloeibougie diesel spiraal' },
    { id: 'roetfilter', naam: 'Roetfilter (DPF)', kleur: 'oranje', vorm: 'een rechthoek met puntjes erin, tussen twee buizen',
      betekent: 'Het roetfilter zit vol en heeft een rit nodig om zichzelf schoon te branden. Komt vooral voor bij veel korte ritten.',
      doen: 'Rijd, als het kan, een kwartier tot twintig minuten aaneengesloten buiten de bebouwde kom. Blijft hij branden of gaat de auto in noodloop: naar een garage.',
      doorrijden: 'ja', obd: 'check', zoek: 'roetfilter dpf fap diesel regeneratie' },
    { id: 'adblue', naam: 'AdBlue', kleur: 'oranje', vorm: 'een druppel met een golfje, soms de letters AdBlue',
      betekent: 'De AdBlue-tank raakt leeg (of het systeem heeft een storing).',
      doen: 'Bijvullen, bij een tankstation of uit een can. Loopt de tank leeg, dan start de auto na het afzetten mogelijk niet meer.',
      doorrijden: 'ja', obd: null, zoek: 'adblue ureum scr diesel' },
    { id: 'automaat', naam: 'Versnellingsbak', kleur: 'oranje', vorm: 'een tandwiel, soms met een uitroepteken of een thermometer',
      betekent: 'De (automatische) versnellingsbak heeft een storing of is te warm. Vaak schakelt hij dan in een noodstand met maar een paar versnellingen.',
      doen: 'Rijd rustig naar huis of een garage. Te warm (thermometer): stilstaan met de motor stationair tot hij uitgaat.',
      doorrijden: 'voorzichtig', obd: 'check', zoek: 'versnellingsbak automaat transmissie noodloop tandwiel' },
    { id: 'vermogen', naam: 'Vermogen beperkt (hybride / elektrisch)', kleur: 'oranje', vorm: 'een schildpad',
      betekent: 'De auto beperkt het vermogen: het accupakket is (bijna) leeg, te koud of te warm, of er is een storing.',
      doen: 'Rustig rijden, laden als dat kan. Blijft het zo met een volle accu: laten nakijken.',
      doorrijden: 'voorzichtig', obd: null, zoek: 'schildpad vermogen hybride elektrisch ev accu' },
    { id: 'brandstof', naam: 'Brandstofreserve', kleur: 'oranje', vorm: 'een benzinepomp',
      betekent: 'De tank is bijna leeg; meestal is er nog 40 tot 80 km over.',
      doen: 'Tanken. Leegrijden kan bij een diesel de brandstofpomp beschadigen.',
      doorrijden: 'ja', obd: null, zoek: 'brandstof tank tanken reserve benzine' },
    { id: 'lamp', naam: 'Verlichting defect', kleur: 'oranje', vorm: 'een lampje met een uitroepteken',
      betekent: 'Een lamp van de buitenverlichting is kapot.',
      doen: 'Kijk welke lamp het is en vervang hem. Met een kapotte remlicht- of koplamp rijden levert een boete op.',
      doorrijden: 'ja', obd: null, zoek: 'lamp verlichting peer defect koplamp remlicht' },
    { id: 'ruitensproeier', naam: 'Ruitensproeiervloeistof', kleur: 'oranje', vorm: 'een voorruit met een sproeistraaltje',
      betekent: 'Het reservoir van de ruitensproeiers is bijna leeg.',
      doen: 'Bijvullen, in de winter met antivries.',
      doorrijden: 'ja', obd: null, zoek: 'ruitensproeier sproeier ruit vloeistof' },
    { id: 'onderhoud', naam: 'Onderhoud', kleur: 'oranje', vorm: 'een steeksleutel (soms met SERVICE of een getal)',
      betekent: 'Het onderhoud is aan de beurt, op tijd of op kilometers.',
      doen: 'Plan een beurt. Het lampje moet de garage daarna terugzetten.',
      doorrijden: 'ja', obd: null, zoek: 'onderhoud service beurt sleutel inspectie' },

    { id: 'service', naam: 'Servicebeurt', kleur: 'oranje', vorm: 'het woord SERVICE, soms met een steeksleutel of een getal (dagen of km)',
      betekent: 'De servicebeurt (olie en filters) staat binnenkort of nu op het programma. Het getal erbij zegt hoeveel dagen of kilometers nog.',
      doen: 'Plan een servicebeurt. Na de beurt zet de garage de teller terug. Een overschreden service is geen storing, maar te laat olie verversen kost op den duur slijtage.',
      doorrijden: 'ja', obd: null, zoek: 'service servicebeurt olie verversen inspectie' },

    { id: 'koud', naam: 'Motor nog koud', kleur: 'info', vorm: 'een blauwe thermometer',
      betekent: 'De motor is nog niet op temperatuur.',
      doen: 'Rustig rijden, geen hoge toerentallen tot hij uitgaat.',
      doorrijden: 'ja', obd: '0105', zoek: 'koud blauw thermometer koelwater' },
    { id: 'grootlicht', naam: 'Grootlicht', kleur: 'info', vorm: 'een blauwe lamp met rechte stralen',
      betekent: 'Het grootlicht staat aan.',
      doen: 'Dimmen bij tegemoetkomend verkeer of een voorligger.',
      doorrijden: 'ja', obd: null, zoek: 'grootlicht verlicht blauw' },
    { id: 'cruise', naam: 'Cruisecontrol', kleur: 'info', vorm: 'een snelheidsmeter met een pijltje',
      betekent: 'De cruisecontrol staat aan of is ingeschakeld.',
      doen: 'Niets; het is informatie.',
      doorrijden: 'ja', obd: null, zoek: 'cruise control snelheid' },
    { id: 'mist', naam: 'Mistlicht', kleur: 'info', vorm: 'een lamp met stralen door een golvende lijn',
      betekent: 'De mistlamp staat aan (achter is hij vaak oranje).',
      doen: 'Het mistachterlicht alleen bij zicht onder 50 meter; anders verblindt het je achterligger.',
      doorrijden: 'ja', obd: null, zoek: 'mist mistlamp mistachterlicht' }
  ];

  /* Puur. Zoekterm en kleurfilter; lege term = alles van die kleur. */
  /* Pictogrammen in de stijl van ISO 2575, zelf getekend (#495, 14-10-2026).
     Tot dan stond hier een emoji per lampje: een vat voor de oliedruk, een
     stoel voor de airbag, een schietschijf voor de stuurbekrachtiging. Wie
     een lampje ziet branden zoekt op vorm, dus het plaatje moet op het
     dashboard lijken. viewBox 0 0 48 48; lijnen in currentColor, vlakken
     met class "v", tekst met class "t". */
  var PICTO = {
  olie: '<path d="M7 21h12l2-3h6l2 3h3l12-6v3L32 33H7z"/><path d="M7 23l-4-2v6l4 2"/><path d="M24 18v-3m-3 0h6"/><path class="v" d="M44 23c-1.6 2.4-2.4 3.6-2.4 4.6a2.4 2.4 0 0 0 4.8 0c0-1-.8-2.2-2.4-4.6z"/>',
  koelwater: '<path d="M24 5v19"/><path d="M24 9h6M24 14h6M24 19h6"/><circle class="v" cx="24" cy="28" r="4.5"/><path d="M5 37c3-3 5-3 8 0s5 3 8 0 5-3 8 0 5 3 8 0 5-3 6 0M5 43c3-3 5-3 8 0s5 3 8 0 5-3 8 0 5 3 8 0 5-3 6 0"/>',
  laden: '<rect x="5" y="14" width="38" height="25" rx="2"/><path d="M10 14v-4h7v4M31 14v-4h7v4"/><path d="M11 26.5h8M29 26.5h8M33 22.5v8"/>',
  rem: '<circle cx="24" cy="24" r="11"/><path d="M24 17v9"/><circle class="v" cx="24" cy="30.5" r="1.8"/><path d="M9 12a17 17 0 0 0 0 24M39 12a17 17 0 0 1 0 24"/>',
  handrem: '<circle cx="24" cy="24" r="11"/><path d="M20.5 31V17h5a4 4 0 0 1 0 8h-5"/><path d="M9 12a17 17 0 0 0 0 24M39 12a17 17 0 0 1 0 24"/>',
  deur: '<rect x="15" y="5" width="18" height="38" rx="6"/><path d="M18 14h12M18 34h12"/><path d="M15 21l-8 7"/><path d="M33 21l8 7"/>',
  gordel: '<circle class="v" cx="24" cy="8.5" r="4.5"/><path d="M15 34v-12a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6v12"/><path d="M15 34h18v8"/><path d="M10 12v30M38 12v30"/><path d="M32 17L16 33" stroke-width="4"/>',
  airbag: '<circle class="v" cx="13" cy="9" r="4"/><path d="M11 16v15h12v11"/><path d="M11 16l9 7"/><path d="M5 12v30"/><circle class="v" cx="33" cy="21" r="8"/>',
  stuur: '<circle cx="21" cy="27" r="14"/><circle cx="21" cy="27" r="3.5"/><path d="M7 27h10.5M24.5 27H35M21 30.5V41"/><path d="M41 6v12"/><circle class="v" cx="41" cy="23" r="1.8"/>',
  motor: '<path d="M10 19h5v-4h8v-3h9v3h3l4 4h4v14h-4l-4 5H17l-4-4h-3z"/><path d="M4 23v8M4 27h6"/>',
  abs: '<circle cx="24" cy="24" r="14"/><text x="24" y="28.5" text-anchor="middle" font-size="10" font-weight="900" font-family="Arial,Helvetica,sans-serif" class="t">ABS</text><path d="M6 11a19 19 0 0 0 0 26M42 11a19 19 0 0 1 0 26"/>',
  esp: '<path d="M14 21l4-10h12l4 10v8H14z"/><path d="M14 21h20"/><circle class="v" cx="18" cy="25" r="1.6"/><circle class="v" cx="30" cy="25" r="1.6"/><path d="M18 32c-4 3 4 6 0 9s4 4 0 6M30 32c-4 3 4 6 0 9s4 4 0 6"/>',
  banden: '<path d="M9 12l2.5 22c.3 3 2 5 5 5h15c3 0 4.7-2 5-5L39 12"/><path d="M15 39v4M21 39v4M27 39v4M33 39v4"/><path d="M24 15v12"/><circle class="v" cx="24" cy="32" r="1.8"/>',
  voorgloei: '<path d="M4 29h7c0-11 8-11 8 0s8 11 8 0 8-11 8 0h9"/>',
  roetfilter: '<rect x="12" y="13" width="24" height="22" rx="3"/><path d="M3 24h9M36 24h9"/><g class="v"><circle cx="18" cy="19.5" r="1.6"/><circle cx="24" cy="19.5" r="1.6"/><circle cx="30" cy="19.5" r="1.6"/><circle cx="18" cy="24" r="1.6"/><circle cx="24" cy="24" r="1.6"/><circle cx="30" cy="24" r="1.6"/><circle cx="18" cy="28.5" r="1.6"/><circle cx="24" cy="28.5" r="1.6"/><circle cx="30" cy="28.5" r="1.6"/></g>',
  adblue: '<path d="M24 5S12 19 12 28a12 12 0 0 0 24 0C36 19 24 5 24 5z"/><path d="M16.5 31c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0"/>',
  automaat: '<circle cx="24" cy="24" r="11"/><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11.3 11.3l3.5 3.5M33.2 33.2l3.5 3.5M11.3 36.7l3.5-3.5M33.2 14.8l3.5-3.5"/><path d="M24 18v7"/><circle class="v" cx="24" cy="29.5" r="1.6"/>',
  vermogen: '<path d="M8 31a15 13 0 0 1 30 0z"/><path d="M15 31l8-12 8 12M12 25h22"/><path d="M38 28c2-3 7-3 7 0s-3 3-6 2"/><path d="M13 31v5M33 31v5M5 31h3"/>',
  brandstof: '<rect x="8" y="7" width="20" height="33" rx="2"/><rect x="12" y="11" width="12" height="9" rx="1"/><path d="M5 40h26"/><path d="M28 17h4a3 3 0 0 1 3 3v11a3 3 0 0 0 6 0V16l-4-5"/>',
  lamp: '<path d="M14 22a9 9 0 1 1 13 8v4h-9v-4a9 9 0 0 1-4-8z"/><path d="M18 38h9"/><path d="M39 9v13"/><circle class="v" cx="39" cy="27.5" r="1.8"/>',
  ruitensproeier: '<path d="M6 22c12-7 24-7 36 0l-5 16H11z"/><path d="M24 36v-14M24 36c-2-6-7-10-12-11M24 36c2-6 7-10 12-11" stroke-dasharray="2.5 3"/>',
  onderhoud: '<path d="M31 6a9 9 0 0 0-9 11L7 32a3.5 3.5 0 0 0 5 5l15-15a9 9 0 0 0 11-9l-5 5-5-1-1-5z"/>',
  service: '<rect x="3" y="15" width="42" height="18" rx="4"/><text x="24" y="28" text-anchor="middle" font-size="8" font-weight="900" font-family="Arial,Helvetica,sans-serif" class="t">SERVICE</text>',
  koud: '<path d="M24 5v19"/><path d="M24 9h6M24 14h6M24 19h6"/><circle class="v" cx="24" cy="28" r="4.5"/><path d="M5 37c3-3 5-3 8 0s5 3 8 0 5-3 8 0 5 3 8 0 5-3 6 0M5 43c3-3 5-3 8 0s5 3 8 0 5-3 8 0 5 3 8 0 5-3 6 0"/>',
  grootlicht: '<path d="M26 11c10 0 16 6 16 13s-6 13-16 13z"/><path d="M4 14h16M4 20.5h16M4 27h16M4 33.5h16"/>',
  cruise: '<path d="M8 33a16 16 0 1 1 32 0"/><path d="M24 31l8-11"/><circle class="v" cx="24" cy="32" r="2.5"/><path d="M12 22l3 2M24 15v4M36 22l-3 2"/><path d="M14 40h20"/>',
  mist: '<path d="M27 11c10 0 15 6 15 13s-5 13-15 13z"/><path d="M4 14l15 3M4 22l15 3M4 30l15 3"/><path d="M12 8c3 4-3 8 0 12s-3 8 0 12-3 8 0 9"/>'
};
  // De kleur van het lampje zelf. Cruisecontrol en mistlicht zijn in de auto
  // groen, ook al vallen ze onder "info" (filter en uitleg blijven dat).
  var TINT = { rood: '#ff3b30', oranje: '#ffb000', info: '#2f7bff', groen: '#22c55e' };
  var GROEN = { cruise: 1, mist: 1 };
  function tint(x) { return TINT[GROEN[x.id] ? 'groen' : x.kleur] || TINT.info; }
  function svg(x, px) {
    var p = PICTO[x.id]; if (!p) return '';
    return '<svg class="pll-svg" viewBox="0 0 48 48" width="' + px + '" height="' + px + '" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color:' + tint(x) + '">' + p + '</svg>';
  }

  function zoek(lijst, term, kleur) {
    var t = String(term || '').toLowerCase().trim();
    return (lijst || []).filter(function (l) {
      if (kleur && l.kleur !== kleur) return false;
      if (!t) return true;
      return (l.naam + ' ' + l.vorm + ' ' + (l.zoek || '')).toLowerCase().indexOf(t) >= 0;
    });
  }

  /* ── Foto van het dashboard (#492, 14-10-2026) ──────────────────
     De AI kijkt naar de foto en kiest uit DEZE lijst; een id dat niet in de
     lijst staat telt niet. Daarna opent de gids op wat herkend is: de AI
     wijst aan, de gids zegt wat je doet. */
  function fotoPrompt(lijst) {
    return 'Op deze foto staat (een deel van) het dashboard van een auto. Welke waarschuwingslampjes branden er?\n' +
      'Kies alleen uit deze lijst (id: naam — hoe het pictogram eruitziet):\n' +
      lijst.map(function (l) { return l.id + ': ' + l.naam + ' — ' + l.vorm; }).join('\n') + '\n' +
      'Antwoord met precies één blok <lampjes>{"ids":[…],"zeker":"hoog"|"laag"}</lampjes>. Hoogstens drie id\'s, het duidelijkste eerst. ' +
      'Brandt er geen lampje uit de lijst, of is de foto onduidelijk: "ids":[] en "zeker":"laag". Verzin geen id.';
  }
  function leesFoto(tekst, lijst) {
    var m = String(tekst == null ? '' : tekst).match(/<lampjes>([\s\S]*?)<\/lampjes>/i);
    if (!m) return { ids: [], zeker: 'laag', fout: 'de AI gaf geen antwoordblok' };
    var o;
    try { o = JSON.parse(m[1].replace(/^[^{]*/, '').replace(/[^}]*$/, '')); }
    catch (e) { return { ids: [], zeker: 'laag', fout: 'het antwoordblok was geen geldige JSON' }; }
    var bekend = {}; (lijst || []).forEach(function (l) { bekend[l.id] = 1; });
    var ids = [];
    (Array.isArray(o && o.ids) ? o.ids : []).forEach(function (id) { if (bekend[id] && ids.indexOf(id) < 0 && ids.length < 3) ids.push(id); });
    return { ids: ids, zeker: o && o.zeker === 'hoog' && ids.length ? 'hoog' : 'laag', fout: null };
  }

  // ════════════════════════════════════════════════════════════════
  //  HET VENSTER
  // ════════════════════════════════════════════════════════════════
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { return false; } }
  function isVerbonden() { try { return typeof connected !== 'undefined' && !!connected; } catch (e) { return false; } }

  var CSS =
    '#plLampOv{position:fixed;inset:0;z-index:9700;background:rgba(8,11,17,.88);display:flex;align-items:flex-start;justify-content:center;padding:16px 16px calc(16px + var(--pl-sab,0px));overflow-y:auto}' +
    '#plLampOv .pll-doos{background:var(--sur2);border:1px solid var(--bd);border-radius:14px;padding:14px;max-width:560px;width:100%;margin-top:calc(8px + var(--pl-sat,0px));font-family:var(--f);color:var(--tx);box-sizing:border-box}' +
    '#plLampOv .pll-kop{display:flex;align-items:center;justify-content:space-between;gap:9px;font-size:15px;font-weight:800;margin-bottom:10px}' +
    '#plLampOv .pll-x{width:32px;height:32px;border-radius:9px;border:1px solid var(--bd);background:var(--sur);color:var(--tx2);cursor:pointer}' +
    '#plLampOv input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font-family:var(--f);font-size:14px;margin-bottom:8px}' +
    '#plLampOv .pll-chips{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}' +
    '#plLampOv .pll-chip{padding:6px 11px;border-radius:999px;border:1px solid var(--bd);background:var(--sur);color:var(--tx2);font-family:var(--f);font-size:12px;font-weight:800;cursor:pointer}' +
    '#plLampOv .pll-chip.aan{background:var(--bl);border-color:var(--bl);color:#fff}' +
    '#plLampOv .pll-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}' +
    '#plLampOv .pll-tegel{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:11px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font-family:var(--f);font-size:12.5px;font-weight:700;text-align:left;cursor:pointer;min-width:0}' +
    '#plLampOv .pll-ico{flex:0 0 40px;width:40px;height:40px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:#05070b;border:1px solid rgba(255,255,255,.08)}' +
    '#plLampOv .pll-tegel>span:last-child{min-width:0;overflow-wrap:anywhere;hyphens:auto}' +
    '#plLampOv .pll-ico.groot{flex:0 0 76px;width:76px;height:76px;border-radius:14px}' +
    '#plLampOv .pll-svg .v,#plLampOv .pll-svg .t{fill:currentColor;stroke:none}' +
    '#plLampOv .pll-band{padding:10px 12px;border-radius:10px;font-size:13px;font-weight:800;margin:4px 0 10px;color:#fff}' +
    '#plLampOv .pll-band.rood{background:var(--rd)}#plLampOv .pll-band.oranje{background:var(--or)}#plLampOv .pll-band.info{background:var(--bl)}' +
    '#plLampOv .pll-blok{margin-top:10px;font-size:13px;line-height:1.55}' +
    '#plLampOv .pll-l{font-size:11px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px}' +
    '#plLampOv .pll-knoppen{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}' +
    '#plLampOv .pll-kn{padding:10px 13px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font-family:var(--f);font-size:12.5px;font-weight:800;cursor:pointer}' +
    '#plLampOv .pll-kn.hoofd{background:var(--bl);border-color:var(--bl);color:#fff}' +
    '#plLampOv .pll-klein{font-size:11px;color:var(--tx3);line-height:1.5;margin-top:10px}';

  function zorgCss() {
    if (el('plLampCss')) return;
    var s = document.createElement('style'); s.id = 'plLampCss'; s.textContent = CSS;
    document.head.appendChild(s);
  }
  function blad(inhoud) {
    zorgCss();
    var ov = el('plLampOv');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'plLampOv';
      ov.addEventListener('click', function (e) { if (e.target === ov) sluit(); });
      document.body.appendChild(ov);
    }
    ov.innerHTML = '<div class="pll-doos">' + inhoud + '</div>';
    ov.style.display = 'flex';
  }
  function sluit() { var ov = el('plLampOv'); if (ov) ov.style.display = 'none'; }
  function kop(t, terug) {
    return '<div class="pll-kop"><span>' + (terug ? '<button type="button" class="pll-x" style="margin-right:8px" aria-label="Terug" onclick="PLLampjes._terug()">←</button>' : '') + t + '</span>' +
      '<button type="button" class="pll-x" aria-label="Sluiten" onclick="PLLampjes.sluit()">✕</button></div>';
  }

  var _filter = { term: '', kleur: null };
  function open() {
    blad(kop('💡 Welk lampje brandt er?') +
      '<input id="pllZoek" placeholder="Zoek: olie, motor, band, schildpad…" autocomplete="off" value="' + esc(_filter.term) + '">' +
      '<div class="pll-chips">' + [null, 'rood', 'oranje', 'info'].map(function (k) {
        return '<button type="button" class="pll-chip' + (_filter.kleur === k ? ' aan' : '') + '" data-kleur="' + (k || '') + '" onclick="PLLampjes._kleur(\'' + (k || '') + '\')">' + (k ? KLEUR[k].kort : 'Alle') + '</button>';
      }).join('') + '</div>' +
      (_fotoIds ? '<div class="pll-band info" id="pllFotoBand">📷 Herkend op je foto (' + (_fotoZeker === 'hoog' ? 'vrij zeker' : 'onzeker') + '). Klopt het niet? <a href="#" style="color:#fff" onclick="PLLampjes._fotoWeg();return false">Toon alle lampjes</a></div>'
        : '<div class="pll-knoppen" style="margin:0 0 10px"><button type="button" class="pll-kn" id="pllFotoKnop" onclick="PLLampjes._foto()">📷 Foto van het dashboard</button></div>') +
      '<div class="pll-grid" id="pllGrid"></div>' +
      '<div class="pll-klein">De kleur zegt het meest: rood is stoppen, oranje is laten nakijken, groen en blauw is informatie. Pictogrammen verschillen per merk; bij twijfel geldt het instructieboekje van je auto.</div>');
    var i = el('pllZoek');
    if (i) i.addEventListener('input', function () { _filter.term = i.value; rooster(); });
    rooster();
  }
  function rooster() {
    var g = el('pllGrid'); if (!g) return;
    var l = _fotoIds ? _fotoIds.map(function (id) { return LAMPJES.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean) : zoek(LAMPJES, _filter.term, _filter.kleur);
    g.innerHTML = l.length ? l.map(function (x) {
      return '<button type="button" class="pll-tegel" data-lamp="' + x.id + '" onclick="PLLampjes.toon(\'' + x.id + '\')"><span class="pll-ico">' + svg(x, 32) + '</span><span>' + esc(x.naam) + '</span></button>';
    }).join('') : '<div class="pll-klein">Niets gevonden. Probeer een ander woord, of kies een kleur.</div>';
  }
  function kleur(k) { _filter.kleur = k || null; open(); }

  function toon(id) {
    var x = LAMPJES.filter(function (l) { return l.id === id; })[0];
    if (!x) return;
    var h = kop(esc(x.naam), true) +
      '<div style="display:flex;align-items:center;gap:12px"><span class="pll-ico groot">' + svg(x, 62) + '</span>' +
      '<span class="pll-klein" style="margin:0">Pictogram: ' + esc(x.vorm) + '</span></div>' +
      '<div class="pll-band ' + x.kleur + '">' + esc(DOOR[x.doorrijden]) + '</div>' +
      '<div class="pll-blok"><div class="pll-l">Wat het betekent</div>' + esc(x.betekent) + '</div>' +
      '<div class="pll-blok"><div class="pll-l">Wat je doet</div>' + esc(x.doen) + '</div>';
    h += obdBlok(x);
    blad(h);
  }

  function obdBlok(x) {
    if (x.obd === 'geen') return '<div class="pll-klein">Dit systeem heeft een eigen regeleenheid. Een gewone OBD-uitlezing ziet deze storing meestal niet; een garage met merkapparatuur wel.</div>';
    if (!x.obd) return '';
    var wat = x.obd === 'check' ? 'de foutcode en de keuringsstatus uitlezen' : 'live meten (' + ({ '0105': 'koelvloeistoftemperatuur', '0142': 'spanning: met draaiende motor hoort die tussen 13,5 en 14,8 V' }[x.obd] || 'de sensor') + ')';
    var knop = isVerbonden() && !isDemo()
      ? '<button type="button" class="pll-kn hoofd" onclick="PLLampjes._meet(\'' + x.id + '\')">' + (x.obd === 'check' ? '🔍 Lees nu uit' : '📈 Meet nu') + '</button>'
      : '<button type="button" class="pll-kn hoofd" onclick="PLLampjes._verbind()">🔌 Verbind de adapter</button>';
    return '<div class="pll-blok"><div class="pll-l">Met de adapter</div>PidLane kan ' + wat + '.</div><div class="pll-knoppen">' + knop + '</div>';
  }
  function meet(id) {
    var x = LAMPJES.filter(function (l) { return l.id === id; })[0]; if (!x) return;
    sluit();
    try {
      if (x.obd === 'check') PLNav.check();
      else openLiveView();
    } catch (e) { console.warn('PLLampjes: meten opent niet', e); if (typeof showToast === 'function') showToast('Dit opent nu niet — probeer het opnieuw'); }
  }
  // ── De foto: toestemming, kiezen, verkleinen, vragen ──────────────
  var _fotoIds = null, _fotoZeker = 'laag';
  var FOTO_AKKOORD = 'pl_lampfoto_akkoord';
  function fotoWeg() { _fotoIds = null; open(); }
  function geenToegang() {
    if (isDemo()) return 'In de demo vraagt de app de AI niets. Zoek het lampje in de lijst.';
    try { var u = window.currentUser; if (!(u && (u.user || u.name))) return 'Log in om een foto te laten herkennen: dat loopt via de AI en kost tegoed. Zoek het lampje zolang in de lijst.'; }
    catch (e) { return 'Log in om een foto te laten herkennen.'; }
    if (typeof apiFetch !== 'function') return 'De AI is in deze versie niet beschikbaar.';
    try {
      if (window.PLCredits && PLCredits.saldoBekend && PLCredits.saldoBekend() && PLCredits.saldo() <= 0 && !(typeof isAdmin === 'function' && isAdmin()))
        return 'Je tegoed is op. Een foto laten herkennen kost tegoed; zoek het lampje zolang in de lijst.';
    } catch (e) { console.warn('PLLampjes: tegoed onleesbaar — apiFetch beslist', e); }
    return null;
  }
  function akkoord() { try { return localStorage.getItem(FOTO_AKKOORD) === '1'; } catch (e) { return false; } }
  function foto() {
    var nee = geenToegang();
    if (nee) { if (typeof showToast === 'function') showToast(nee, 5000); return; }
    if (!akkoord()) {
      blad(kop('📷 Foto van het dashboard', true) +
        '<div class="pll-blok">Je foto gaat via onze server naar Anthropic, de aanbieder van de AI, die kijkt welk lampje er brandt. ' +
        'De foto wordt verkleind, <b>niet bewaard</b> en alleen hiervoor gebruikt. Fotografeer alleen het dashboard: geen gezichten, geen kenteken of papieren.</div>' +
        '<div class="pll-blok">Elke foto kost een beetje tegoed.</div>' +
        '<div class="pll-knoppen"><button type="button" class="pll-kn hoofd" onclick="PLLampjes._fotoAkkoord()">Akkoord, maak een foto</button>' +
        '<button type="button" class="pll-kn" onclick="PLLampjes._terug()">Liever niet</button></div>');
      return;
    }
    kiesFoto();
  }
  function fotoAkkoord() { try { localStorage.setItem(FOTO_AKKOORD, '1'); } catch (e) { console.warn('PLLampjes: akkoord niet bewaard — de vraag komt volgende keer terug', e); } open(); kiesFoto(); }
  function kiesFoto() {
    var i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*'; i.setAttribute('capture', 'environment');
    i.addEventListener('change', function () { if (i.files && i.files[0]) herken(i.files[0]); });
    i.click();
  }
  // Verkleinen tot hoogstens `max` px, als JPEG; base64 zonder kop.
  function verklein(bestand, max, kwal) {
    return new Promise(function (ok, nok) {
      var url = URL.createObjectURL(bestand), img = new Image();
      img.onload = function () {
        try {
          var f = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          ok(c.toDataURL('image/jpeg', kwal).split(',')[1] || '');
        } catch (e) { nok(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); nok(new Error('de foto is niet te lezen')); };
      img.src = url;
    });
  }
  async function herken(bestand) {
    var knop = el('pllFotoKnop'); if (knop) { knop.disabled = true; knop.textContent = '⏳ De AI kijkt naar je foto…'; }
    try {
      var data = await verklein(bestand, 800, 0.7);
      if (data.length > 230000) data = await verklein(bestand, 560, 0.6);
      var t = await apiFetch(fotoPrompt(LAMPJES), 200, null, AI_LICHT, { meet: false }, { afbeelding: { type: 'image/jpeg', data: data } });
      var r = leesFoto(t, LAMPJES);
      if (r.fout) console.warn('PLLampjes: ' + r.fout);
      if (!r.ids.length) {
        if (typeof showToast === 'function') showToast('Op de foto is geen lampje uit de gids te herkennen. Zoek het in de lijst.', 5000);
        open(); return;
      }
      if (r.ids.length === 1 && r.zeker === 'hoog') { _fotoIds = r.ids; _fotoZeker = r.zeker; toon(r.ids[0]); return; }
      _fotoIds = r.ids; _fotoZeker = r.zeker; open();
    } catch (e) {
      console.warn('PLLampjes: foto niet herkend', e);
      if (typeof showToast === 'function') showToast('De foto kon niet worden herkend: ' + (e && e.message ? e.message : e), 5000);
      open();
    }
  }

  function verbind() {
    sluit();
    try { document.getElementById('connOv').classList.remove('hidden'); }
    catch (e) { console.warn('PLLampjes: verbindscherm opent niet', e); }
  }

  window.PLLampjes = {
    // Van buiten (de kaart, de klachtenwijzer): altijd de hele gids. Terug
    // binnen de gids houdt de selectie van de foto vast.
    open: function () { _fotoIds = null; open(); },
    _terug: open,
    sluit: sluit,
    toon: toon,
    _kleur: kleur,
    _meet: meet,
    _verbind: verbind,
    _foto: foto,
    _fotoAkkoord: fotoAkkoord,
    _fotoWeg: fotoWeg,
    _herken: herken,   // voor bproef-lampfoto.js: een bestand zonder bestandskiezer
    // pure kern — voor test-lampjes.js
    _kern: { LAMPJES: LAMPJES, KLEUR: KLEUR, DOOR: DOOR, PICTO: PICTO, tint: tint, svg: svg, zoek: zoek, fotoPrompt: fotoPrompt, leesFoto: leesFoto }
  };
})();
