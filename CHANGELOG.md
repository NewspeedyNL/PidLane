# CHANGELOG.md — bouw-changelog van index.html

> Verplaatst hierheen op 28-08-2026 (op verzoek) uit het HTML-commentaar
> bovenaan `public/index.html`. Reden: dat bestand groeide bij elke oplevering
> met een nieuw blok, en `.github/workflows/build-apk.yml` triggert op elke
> wijziging aan `public/index.html` — dus een veranderde changelog-tekst
> startte een Android-build zonder dat er iets aan de app veranderde.
>
> Nieuwste boven, zoals het al was. Bijwerken hoort nog steeds bij elke
> oplevering (zie CLAUDE.md), alleen voortaan hier.

 ═══════════════════════════════════════════════════════════
 07-11-2026 — Aandrijfvorm: mild, vol, plug-in en serieel hybride
 ═══════════════════════════════════════════════════════════

 - Het RDW-kenteken geeft nu ook de aandrijfvorm (`aandrijfUitRdw`): met
   stekker = plug-in, tot 20 kW elektrisch = mild hybride, meer elektrisch
   dan motorvermogen = serieel, anders vol. Een mild hybride (Swift, Puma,
   CX-5 vanaf 2021, Octavia e-TEC) heet voortaan benzine of diesel en krijgt
   geen EV-logica meer. PLKenmerk kent mild_hybride, plugin en serieel.
 - Rijden op de accu leest niet langer als een dode toerental- of
   belastingsensor in het rapport en bij de AI. Op een gewone auto blijft
   0 tpm bij snelheid wél verdacht.
 - De balk zegt "Zeilen" bij een mild hybride die uitrolt, en "Motor laadt
   accu" bij een seriële hybride. Geen versnellingscijfer bij een (e-)CVT of
   seriële hybride, en geen "N" als de motor tijdens het rijden uit staat.
 - De AI hoort hoe lang de motor tijdens het rijden uit stond, en dat
   toerental 0 bij snelheid dan normaal is.
 - Een seriële hybride die stilstaand laadt telt in het volledig onderzoek
   en de rapportgrafiek als "motor laadt", niet als stationair of 2500 tpm.
 - Mijn voertuigen: een mild hybride die vroeger als hybride is opgeslagen,
   wordt bij de dagelijkse RDW-ronde zijn verbranding.

 ═══════════════════════════════════════════════════════════
 07-11-2026 — Zuiniger: schermtimers slapen, Hyperlane op tempo (#691)
 ═══════════════════════════════════════════════════════════

 - De monitorchip, het bulkdashboard en de monitorknop verversen alleen
   nog als de app in beeld is (PLRust). Uit beeld is de timer weg, niet
   alleen stil; terug in beeld klopt het scherm meteen.
 - Hyperlane tekent hoogstens 60 beelden per seconde (een scherm van 120 Hz
   tekende er 120) en 30 als de auto langer dan 5 s stilstaat.
 - De zuinigstand (hitte of lege accu) geldt nu ook op de telefoon, niet
   alleen in de tabletcockpit.

 ═══════════════════════════════════════════════════════════
 06-11-2026 — Contact uit op het lampje, schakellampjes vrij van de balk
 ═══════════════════════════════════════════════════════════

 - Contact uit (PLContact) wint van het laatste aandrijfoordeel: het
   motorlampje zei minutenlang "Motor aan 28%" bij een auto die uit stond.
 - Hyperlane liggend op volledig scherm: het midden telt de statusbalk van
   de telefoon mee. Met grote tekst schoven de schakellampjes onder de
   lampjesbalk.
 - Het midden-knopje heeft zijn tekst bij de opbouw, niet pas bij de eerste
   frame (#657; de browserproef werd daar op CI rood van).

 ═══════════════════════════════════════════════════════════
 06-11-2026 — Versie 3.5.0 voor de release
 ═══════════════════════════════════════════════════════════

 - APP_VERSION en package.json naar 3.5.0; mutatie in plmutate.sh mee.
 - PLAY-INZENDING.md: release notes 3.5 in §14, "Let op bij 3.5.0" in §16b;
   de upload-build staat op nog te bouwen.
 - Handleiding gecontroleerd tegen 3.5.0.

 ═══════════════════════════════════════════════════════════
 06-11-2026 — Het startscherm in drie lagen, zelf in te delen
 ═══════════════════════════════════════════════════════════
 - Home is de auto met één hoofdknop: Verbind adapter, Check mijn auto of
   Naar Live, met drie live of bekende waarden. Daaronder Voor jou nu (één
   melding: open punt, APK, koude motor, winter) en Snel naar.
 - Meer → Startscherm aanpassen: blokken aan/uit en in volgorde, eigen Snel
   naar, begin vanaf Bestuurder, Kenner of Garage; een klant bewaart het in
   zijn account.
 - Expert op afstand staat in Meer en in het verbindscherm, niet meer op Home.

 ═══════════════════════════════════════════════════════════
 06-11-2026 — Aangevinkte sensoren gaan aan, wizard Grondig is zichtbaar
 ═══════════════════════════════════════════════════════════
 - Zonder chassisnummer (oudere auto, adapter zonder 0902) gaat de selectie
   uit Mijn voertuigen → Sensoren nu aan op het actieve voertuig.
 - Wizard → Sensoren → Grondig opent Mijn voertuigen op het subtabblad Zoeken,
   pas als het tabblad er staat; de zoekronde liep onzichtbaar in Mijn sensoren.

 ═══════════════════════════════════════════════════════════
 06-11-2026 — Grondig keurt op het bereik van OBDb, ook met eenheid
 ═══════════════════════════════════════════════════════════
 - Een sensorspanning van 321 V (Mazda 22038E) wordt niet meer aangeboden.
 - Na een omrekening en bij de plaatshouder max 1 telt het bereik niet.

 ═══════════════════════════════════════════════════════════
 05-11-2026 — Slim visueel: de themakeuze blijft open bij een herbouw (#657)
 ═══════════════════════════════════════════════════════════
 - Een nieuwe sensor of de demo die opstart sluit de themastrook niet meer.

 ═══════════════════════════════════════════════════════════
 05-11-2026 — Hyperlane: het midden-knopje wisselt meteen (#657)
 ═══════════════════════════════════════════════════════════
 - Slim/Versnelling staat direct op het knopje, niet pas bij de volgende frame.

 ═══════════════════════════════════════════════════════════
 05-11-2026 — Standen uit OBDb als sensor (besluit d deel 2, #670)
 ═══════════════════════════════════════════════════════════
 - Aan/uit, ja/nee en keuzelijsten (versnelling, modus) komen in Grondig
   mee. De formuletaal kreeg [b:n]: n bits vanaf bit b, geteld zoals OBDb.
 - Een stand wordt gekeurd op zijn lijst; de lijst gaat mee in de opslag.
 - De meter toont een stand als woord ("aan", "Second gear").
 - De PID-bibliotheek bewaart bereik en standen; nieuwe kolommen in kp_pid_bib.
 - Vloot: gemiddeld 96,6 → 98,8 %, 39 van 40 op of boven 90 %.

 ═══════════════════════════════════════════════════════════
 05-11-2026 — Getallen zonder eenheid uit OBDb als sensor (besluit d, #670)
 ═══════════════════════════════════════════════════════════
 - Misfire- en kloptellers, lambda en overbrenging komen in Grondig mee,
   gekeurd op het bereik uit OBDb, dat ook de schaal van de meter wordt.
 - Een ruwe waarde of een onbekende eenheid niet.
 - Vloot: gemiddeld 90,7 → 96,6 %, 37 van 40 op of boven 90 %.

 ═══════════════════════════════════════════════════════════
 05-11-2026 — De wizard vinkt banden, laadregeling en wielen aan (#675)
 ═══════════════════════════════════════════════════════════
 - Grondig → vooraf aangevinkt: alle banden (op verzoek, geen plek in de
   pollus), per laadrol één code (gevraagde spanning, SoC, stroom,
   accutemp, leeftijd), en de vier wielsnelheden als set.
 - Bij opnemen: acculeeftijd eens per minuut, accutemperatuur elke 10 s.

 ═══════════════════════════════════════════════════════════
 05-11-2026 — Geen spook-PIDs meer na Snel (#616)
 ═══════════════════════════════════════════════════════════
 - Een steunblok dat NO DATA zegt, of een PID die los gemeten NO DATA
   gaf, houdt de merkpreset tegen. Nissan Leaf (geen mode 01): na Snel
   11 → 0 aangenomen PIDs. Het opgeslagen profiel verliest er niets door.

 ═══════════════════════════════════════════════════════════
 05-11-2026 — Fabriekscodes op BMW/MINI extended addressing (#670)
 ═══════════════════════════════════════════════════════════
 - OBDb 6F1 met eax wordt het adres 6F1:12>612; de app vraagt het met
   ATCEA12 en een flow control met het adresbyte voorop, en zet ATCEA uit.
 - Worker en app keuren dat adres; generator en nepauto kennen ATCEA.
 - Vloot: Mini 44 → 87 %, BMW 73 → 93 %, gemiddeld 89,2 → 90,7 %.

 ═══════════════════════════════════════════════════════════
 05-11-2026 — Fabriekscodes op VAG 29-bit (17FC00xx, ID.3) (#670)
 ═══════════════════════════════════════════════════════════
 - OBDb hdr FC00 met pri/tst wordt het adres 17FC0076>17FE0076; de app
   vraagt het met ATCP17 + ATSH van zes en zet daarna ATCP18 terug.
 - Worker en app keuren dat adres allebei als ECU van een eigen PID.
 - Generator en nepauto kennen het (ATCP, alleen op een 29-bit bus).
 - Vloot: ID.3 21 → 91,8 %, gemiddeld 87,4 → 89,2 %, 26 van 40 ≥ 90 %.

 ═══════════════════════════════════════════════════════════
 05-11-2026 — De preset op merk verliest wat OBDb niet kent (#616)
 ═══════════════════════════════════════════════════════════
 - Wat applyVehiclePIDPreset() zonder steunbit toevoegt is een aanname.
   Komt de mode-01-lijst van model en bouwjaar binnen (Grondig, of de
   automatische OBDb-zoekronde), dan gaat eruit wat daar niet in staat en
   nooit een geldige waarde gaf. Nissan Leaf: elf spook-PIDs weg.

 ═══════════════════════════════════════════════════════════
 05-11-2026 — Fabriekscodes met teken en met mV, mA en cm (#670)
 ═══════════════════════════════════════════════════════════
 - Formuletaal: S8( ), S16( ), S24( ), S32( ) = getal met teken (two's
   complement). App en Worker keuren hem allebei; OBDb "sign" gebruikt hem.
 - millivolts, milliamps en centimeters worden V, A en mm.
 - Vloot: gemiddeld 83,8 → 87,4 %, 25 van 40 op of boven 90 %.

 ═══════════════════════════════════════════════════════════
 05-11-2026 — Grondig zoeken met de steunlijst van het bouwjaar (#670)
 ═══════════════════════════════════════════════════════════
 - Worker: obdb_steun haalt command_support.yaml van model en bouwjaar
   (anders ±1, ±2 jaar). De app vraagt alleen nog wat dat jaar in OBDb
   beantwoordde, en zonder de kap van 60.
 - Mijn voertuigen → Sensoren → 🚀 (en Grondig in de wizard) test naast de
   bibliotheek ook OBDb rechtstreeks; de bibliotheek blijft 60 per keer.
 - Vloot: gemiddeld 75,6 → 83,8 %, 24 van 40 op of boven 90 %. Een deel
   komt uit een eerlijkere meting (nepauto, noemer), zie het archief.

 ═══════════════════════════════════════════════════════════
 05-11-2026 — Nagebouwde vloot uit OBDb en de dekkingsproef (#670)
 ═══════════════════════════════════════════════════════════
 - plnepvloot.js: 40 auto's uit OBDb (command_support + ruwe antwoorden +
   signalset) naar nepvloot/, mode 01 én fabriekscodes per ECU. Geen
   handwerk meer; CI haalt niets van het net.
 - bproef-dekking.js: per auto hoeveel van wat hij aanbiedt oproepbaar is
   na Snel (discovery) en Grondig (OBDb-zoekronde). Vloer per auto, mag
   alleen omhoog; de wens van 90 % is LET OP, geen FOUT.
 - Eerste meting: gemiddeld 75,6 %, 18 van 40 halen de wens. Mode 01
   1701/1701; fabriekscodes 319/1965. Geen app-wijziging.

 ═══════════════════════════════════════════════════════════
 04-11-2026 — Setup-wizard na de eerste verbinding per voertuig
 ═══════════════════════════════════════════════════════════
 - Keuzevenster na protocol en scan: 🧭 Inrichten of ⚡ Meteen rijden.
 - Stappen (meten eerst): toestemming, Leer de auto (kenteken, brandstof,
   turbo, km-stand), adaptersnelheid, sensoren snel/grondig, dashboard en
   weergave, onderhoud/tanken/conditie met laatste beurt en nulpunt, foto.
 - Halverwege sluiten = later verder: Meer → Setup-wizard, Mijn voorkeuren,
   Mijn voertuigen → Opnieuw inrichten.
 - Leerrit bij de eerste rit: na vijf minuten rijden een melding.

 ═══════════════════════════════════════════════════════════
 02-11-2026 — Kanteling niet meer grijs na remmen voor een drempel
 ═══════════════════════════════════════════════════════════
 - "Verschoven" (telefoon anders dan bij Nulstellen) telt pas na 2 s.
 - De bochtcorrectie gebruikt een snelheid tot 10 s oud (was 2 s).
 - Het verslag zegt per reden hoe lang de telefoon niet vast was, met de
   grootste afwijking en de oudste snelheid.

 ═══════════════════════════════════════════════════════════
 02-11-2026 — Hyperlane als cockpit op een tablet
 ═══════════════════════════════════════════════════════════
 - Tablet liggend (≥ 800×540) op volledig scherm: G-cirkel met spoor en
   piek, gas en rem als F1-balken, temperatuurbalken (koelwater, olie,
   inlaat, kat, ATF), neon-autootje in CSS-3D voor helling en kanteling,
   grafiek van de laatste minuut, binnenbogen turbodruk/belasting.
 - Rempedaal: eigen PID op naam (rem/brake) of met de hand (tik op de
   rembalk); zonder sensor "REM ~", geschat uit de vertraging.
 - Adaptief per scène, tik = groot tot 10 km/h, waarschuwingsrand
   (rood heet/alarm, oranje gas op koude motor), zuinig bij hitte of lege accu.
 - Op een telefoon verandert niets en vraagt de cockpit geen bustijd.
 - Strooklabel van een eigen sensor: "Engine Oil Temperature" wordt
   "OLIE" in plaats van "ENGINE OI…".

 ═══════════════════════════════════════════════════════════
 02-11-2026 — Wizardplan: namen die zeggen wat er gebeurt
 ═══════════════════════════════════════════════════════════
 - Het plan na "Er is iets mis" / de koopcheck heet "Jouw plan", met
   "Stap 1 · Eerst meten" en "Stap 2 · Kies wat je wilt weten"; knop Starten.
 - Elke meting en analyse heet naar wat hij doet (stijl van Rapport
   aanvragen), met duur en "gebruikt tegoed" waar dat vaststaat.
 - Systeemtest heet overal "Sensoren controleren", Totaalcheck/Conditiecheck
   overal "Brede controle" (wizard, Live, keuzescherm, handleiding).

 ═══════════════════════════════════════════════════════════
 02-11-2026 — Waakronde: geen waarde is geen "buiten fysiek bereik"
 ═══════════════════════════════════════════════════════════
 - Uit de auto: Brandstofraildruk (016D, een regelblok) stond oranje als
   "— MPa, buiten fysiek bereik". De parser gaf bewust geen waarde (bit in
   byte A uit, of een onvolledig meerframe-antwoord); de waakronde las elke
   null als "laag 1 keurde af". Nu eerst de waarde zonder laag 1
   (ruweWaarde()): geen getal = stil, wél een afgekeurd getal = bevinding.
 - test-waakronde: drie gevallen erbij, en "0 V" is nu echt 0000 (de oude
   toets gebruikte een half antwoord). Eén mutatie. Uitleg in het archief.

 ═══════════════════════════════════════════════════════════
 01-11-2026 — Nagelopen: Auto zegt AUTO, "In het formulier" springt mee
 ═══════════════════════════════════════════════════════════
 - Hyperlane: in Auto stond de rijstijl van modus() er kaal (ECO, CRUISE,
   SPORT) — dezelfde namen als de standen, dus Auto leek een gekozen stand.
   Nu "AUTO · CRUISE"; scènes (STIL, CRUISE · ZEN) blijven zoals ze waren.
 - Sensoren: "In het formulier" bij de buurscan vulde het formulier in een
   verborgen subblad. Nu springt hij naar Mijn sensoren, formulier open.
 - Nagelopen in de echte app, zonder verdere bevindingen: sensorkeuze op
   een strookplek per stand, wisselen tussen weergaves, volledig scherm met
   het standmenu, diesel (laaddruk), de knop "Eigen" uit de keuzelijst en
   Sensoren vanuit de accutest. Opslagformaat (eigen_pids, pid_selectie)
   ongewijzigd, dus de expert en de Worker merken niets.

 ═══════════════════════════════════════════════════════════
 01-11-2026 — Sensoren per voertuig: drie subbladen, één regel per sensor
 ═══════════════════════════════════════════════════════════
 - Uit het gebruik: "na vier pogingen nog steeds een wirwar". Het tabblad
   Sensoren heeft nu drie subbladen: Mijn sensoren · Erbij zoeken (alle
   sensoren zoeken, bibliotheek, buurscan) · Berekend.
 - Per sensor één regel: vinkje, naam, eenheid. Code, formule, tempo,
   testen, delen en weghalen staan achter een tik (details, blijft open na
   een herteken). "Zelf een code toevoegen" is ingeklapt.
 - Banden: één regel, één vinkje voor spanning en temperatuur van alle
   wielen. Wielsnelheid (PLEigen.wielRol) idem: één regel, één vinkje en één
   tempo voor alle vier, in plaats van vier losse kaarten in Voor analyse.
 - Bewaren blijft onderin in beeld; uitlegteksten bij zoeken ingeklapt.
 - Tests: test-garage (wielgroep + tegenproef), bproef-garage 4p; drie
   mutaties.

 ═══════════════════════════════════════════════════════════
 01-11-2026 — Hyperlane: de schakellampjes weer als losse ronde lampjes
 ═══════════════════════════════════════════════════════════
 - Op verzoek terug naar de weergave van vóór 2bb846a (28-10-2026): tien
   ronde lampjes groen → amber → rood, blauw op het schakelpunt, in plaats
   van de lichtstreep. Alleen CSS; de logica (leds()) is ongewijzigd.
 - Niet letterlijk de oude maten: het midden is sinds 28-10 smaller, en met
   1,6 cqw liepen ze 104 px breed over de ringen (midden 80 px). Nu vullen
   ze hoogstens het midden, nooit groter dan toen. bproef-hyperlane meet het;
   één mutatie.

 ═══════════════════════════════════════════════════════════
 01-11-2026 — Hyperlane: de stand zelf kiezen (Auto, Eco, Sport, Cruise)
 ═══════════════════════════════════════════════════════════
 - Tik op het standlabel boven het midden: een menu met Auto (de scènes,
   zoals altijd), Eco, Sport en Cruise. Bewaard in pl_hl_stand.
 - Per stand een eigen strook (PLVisProfiel.STROOK): Eco gas · belasting ·
   koelwater, Sport olie · inlaat (diesel: laaddruk) · belasting, Cruise
   koelwater · olie · accu. Koelwater, gas en accu blijven altijd gemeten:
   alarm, 0–100 en power-up lezen ze.
 - Een gekozen stand houdt het label vast; alarm, begrenzer en 0–100 gaan
   voor. Sport: schakellampjes op de rode streep, geen verbruik in het midden.
 - Bus: trage adapter = alleen de sensoren van de gekozen stand; PLLoad
   'snel' = die van alle standen (busRuim() in pidlane-visueel.js).
 - Tests: test-hyperlane blok 13 met twee tegenproeven; vier mutaties.

 ═══════════════════════════════════════════════════════════
 31-10-2026 — Eigen sensoren: geen maximum van 20 meer
 ═══════════════════════════════════════════════════════════
 - Op verzoek: de klant kiest zelf hoeveel eigen sensoren. PLEigen.MAX (20,
   hard afgekapt) is PLEigen.VEEL geworden: boven de 20 een oranje
   waarschuwing in Mijn voertuigen → Sensoren en bij "Alle sensoren zoeken",
   geen weigering. De zoekronde vinkt vooraf nog tot 20 aan.
 - worker.js: geen 400/409 meer bij 21+; alleen een opslagvangnet van 500.
 - Tests: test-mode21 (25 gaan erin), test-klantplatform (21 bewaard, 501
   is 400); twee mutaties in plmutate.sh.

 ═══════════════════════════════════════════════════════════
 31-10-2026 — Versnelling volgt de schakeling, schakellampjes met ▲
 ═══════════════════════════════════════════════════════════
 - PLGear: twee verse paren binnen ±4% van een versnelling (en boven
   1200 tpm) tonen meteen; het stabiele venster blijft voor het leren.
   Gemeten in test-gear.js: 1400 → 600 ms na het opkomen van de koppeling.
 - Hyperlane: het midden wacht niet meer 0,6 s extra op een andere versnelling.
 - Schakellampjes lopen naar het schakelpunt van CA11 (rustig) of 90% van
   de rode streep (vol gas, belasting > 75%), knipperen daar en zetten een
   rode ▲ naast de versnelling; niet in de hoogste. PLBerekend.schakelPunt().

 ═══════════════════════════════════════════════════════════
 31-10-2026 — RR, tankvraag met buffer, onderhoud aan/uit, RDW en weer dagelijks
 ═══════════════════════════════════════════════════════════
 - RR (random rapport): eigen meetopdrachten per voertuig in Rapporten —
   doel, sensoren met eenheid, tempo, venster (knop/verbinden, klok,
   voorwaarden, max duur), opbouw en export (CSV NL/int, JSON), optioneel
   als rapport. Nieuw: pidlane-rr.js, test-rr.js, kolom kp_voertuig.rr.
 - Tanken: een sprong in stilstand moet blijven staan na het wegrijden
   (10 metingen, 5 rijdend, 90 s); het anker is het peil vóór het stoppen;
   na een vraag 45 min rust. Een helling of drempel vraagt niets meer.
 - Onderhoud bijhouden per voertuig aan/uit (kolom onderhoud, leeg = aan).
 - RDW: elke dag per voertuig met kenteken; de APK-datum volgt het RDW, de
   rest alleen als hij leeg is.
 - Weer: vers bij de eerste opstart (zodra er een plaats is), daarna op elke
   nieuwe dag, en bij terugkomen uit de achtergrond.
 - Bibliotheek: de modelsleutel laat het merk vooraf weg ("MAZDA CX-5" →
   cx5), voor elk merk. De rempedaal- en remdruksensoren van 07-10 zijn weer
   te zien bij voertuigen met de RDW-naam.

 ═══════════════════════════════════════════════════════════
 30-10-2026 — Hyperlane: een rustig midden
 ═══════════════════════════════════════════════════════════
 - Slim: een getal blijft minstens 6 s staan (koelwater-alarm en 0–100 gaan
   meteen); verbruik, gas en koelwater krijgen één nieuw getal per seconde.
 - Versnelling: een nieuwe moet 0,6 s kloppen, een onbekende blijft 12 s staan.
   Vol gas (≥ 80%) toont geen verbruik maar g, anders het gas (test-hyperlane.js).

 ═══════════════════════════════════════════════════════════
 30-10-2026 — De conditiekaart (#475)
 ═══════════════════════════════════════════════════════════
 - Het tabblad Conditie opent met een kaart: ring met de score, vier delen
   als balk, het verloop met de grens van 70 en de grootste oorzaak.
 - Een deel zonder ritmeting zegt "nog N", nooit 0. Vorm in PLConditie.CSS,
   de garage neemt hem mee in zijn stijlblok (test-conditie.js, blok 5).

 ═══════════════════════════════════════════════════════════
 30-10-2026 — ATST klimt niet meer aan de randen van contact uit (#509)
 ═══════════════════════════════════════════════════════════

 - Een ATST-stap in de 10 s vóór een contactstilte wordt bij het begin van
   die stilte teruggedraaid en telt niet meer in verbind-st-stappen.
 - Na "antwoordt weer" telt de regelaar 15 s niet: de ECU wordt dan nog wakker.
 - Het terugdraaien gaat als verbind-regel naar D1, naast de bijsturing.

 ═══════════════════════════════════════════════════════════
 30-10-2026 — Volledige kaart en inleren: wachten, voortgang, duur (#648)
 ═══════════════════════════════════════════════════════════

 - Het inleren voor een vaste expert wacht tot de zoekronde en de
   gezondheidscheck klaar zijn (telt ze in hun wrappers), in plaats van een
   vaste 20 s. De bezig-pill noemt elke stap; met ✕ breek je af.
 - De kaart geeft per stap de duur mee; de klant ziet elke stap in het
   meekijkscherm, en de expert krijgt "kaart bezig" in plaats van het alarm
   "geen live data".
 - bproef-kaart.js: de echte app tegen de nepauto (Golf), zonder rit.

 ═══════════════════════════════════════════════════════════
 29-10-2026 — De verkoper of garage als vaste expert (#646)
 ═══════════════════════════════════════════════════════════

 - Ik ben de expert → Koppelcode voor een klant: acht tekens, zeven dagen,
   één keer te gebruiken. De klant vult hem in bij Mijn voertuigen → Vaste
   expert, met een eigen akkoord.
 - Deelt die klant, dan heeft de gekoppelde expert meteen volledige toegang;
   de server herkent hem aan zijn eigen sessie. Andere experts houden basis.
 - Bij de eerste verbinding leert de app de auto één keer volledig kennen
   (alleen met een vaste expert, niet in demo, niet rijdend).
 - Intrekken kan in Mijn voertuigen en in het meekijkscherm, ook midden in
   een sessie (test-vasteexpert.js, bproef-toestemming.js).

 ═══════════════════════════════════════════════════════════
 29-10-2026 — Expert op afstand: twee niveaus van toegang (#645)
 ═══════════════════════════════════════════════════════════

 - De meekijkcode geeft basistoegang: meekijken, lezen en een snelle scan
   (foutcodes, zelftests, mode 06). Die start vanzelf als de eerste expert
   binnenkomt en de app nog niets van de auto weet.
 - Opname, AI-analyse en "Volledig in kaart" (diep zoeken, merkspecifieke
   PIDs, mode 06; alleen bij stilstand) vragen volledige toegang. De klant
   tikt op Toestaan, en de Worker dwingt het af. Het vervalt bij een
   verbindingsprobleem, tenzij "Tot ik stop met delen" aanstaat.
 - De werkplek zegt wat er niet gemeten is; een lege auto heet niet meer
   gezond. De foutcodecheck, merkspecifieke PIDs en een te grote vstate komen
   nu wél (of gemeld) bij de expert aan (test-toestemming.js).

 ═══════════════════════════════════════════════════════════
 29-10-2026 — Eigen weergave per sensor: eenheid, factor, schaal
 ═══════════════════════════════════════════════════════════

 - In het keuzevel van een plek (Visueel en elk profiel, ook Hyperlane)
   staat ⚙ naast elke sensor: eenheid, vermenigvuldig met (kPa → bar:
   0,01), minimum en maximum, decimalen. Per sensor in pl_weergave.
 - Een sensor zonder bruikbare schaal (0123: 0–655350 kPa) kan zo toch op
   een boog; de lijst "zonder schaal" toont nu ook vaste sensoren.
 - Alleen de weergave rekent om: ruwe waarde, oordeel en opname blijven
   in de eenheid van de app (test-weergave.js).

 ═══════════════════════════════════════════════════════════
 29-10-2026 — Rapporten: een rapport aanvragen
 ═══════════════════════════════════════════════════════════

 - Bovenaan Rapporten: ➕ Rapport aanvragen. Alle tien rapporten (foutcodes,
   onderzoek, brede controle, accu, mode 06, rit, AI, monitor, aankoop,
   brandstof) met wat ze meten en hoe lang; ▶ Start begint de test die het
   rapport vult. Meetrapporten wachten op de adapter (demo telt mee).
   Tests: test-rapportaanvraag.js, bproef-aanvraag.js, blok 5.

 ═══════════════════════════════════════════════════════════
 29-10-2026 — Rapporten: gekeurd vóór ze de deur uitgaan
 ═══════════════════════════════════════════════════════════

 - Elke export gaat door plKeurExport(): NaN, undefined, [object …], een
   lege meetwaarde of een grens van X tot X geeft geen bestand maar een
   melding met de reden. Ook PLRapport.pdf (AI-, aankoop-, accurapport).
   Testrun en logboek (ruwe logs) alleen op leegte.
 - PDF: een rapport met === KOPPEN === wordt opgemaakt (kopjes, gekleurde
   labels, bewijs als opsomming, de grens van OBD onderaan) in plaats van
   een courier-dump. Alle tekst door plPdfTekst(): het minteken werd een ".
 - Onderzoek: rustspanning boven 13,2 V is geen rustmeting; nieuw blok
   "Wat dit oordeel beperkt"; de conclusie zegt wat bij de klacht in orde
   is; uitgesloten met het sterkste tegenbewijs; verloop zonder gaten.
 - Mode 06: waarde en grens 0 is een lege test, geen "krap".

 ═══════════════════════════════════════════════════════════
 29-10-2026 — Nieuwe auto, schone start
 ═══════════════════════════════════════════════════════════

 - Menu → "🧽 Nieuwe auto — schone start" (beheer en ontwikkelaar): het
   toestel vergeet alles van eerdere auto's (sensoren, VIN-profielen, actief
   voertuig, geschiedenis, bulk-opnames) en herstart. Login, tegoed, adapter
   en weergave blijven. Alleen een bewaarlijst blijft; de rest gaat weg.
 - Beheer → Klanten → "Schone start aan": een testaccount dat bij elke login
   leeg begint. De Worker wist dan Mijn voertuigen, ritten en rapporten van
   dat account (niet het akkoord, niet het tegoed), de app wist het toestel.
   Nieuwe kolom klanten.SchoneStart, gaat er met ALTER bij (test-schoon.js).

 ═══════════════════════════════════════════════════════════
 29-10-2026 — De deur in de Hyperlane-look
 ═══════════════════════════════════════════════════════════

 - Intro, inloggen en verbinden (adapterkeuze, kenteken, protocol, PIDs)
   in de look van Hyperlane: neon-tunnel in CSS achter glazen kaarten met
   een lopende neonrand, woordmerk in ijsblauw-violet, lichtbalk-knoppen.
 - Het golflint is verborgen. De tunnel valt na ruim een minuut stil en
   staat meteen stil bij minder beweging (test-hyperlanedeur.js).

 ═══════════════════════════════════════════════════════════
 28-10-2026 — Laatste loodjes: vorm, lagen, geen dubbele meters
 ═══════════════════════════════════════════════════════════

 - De gekozen achtergrond blijft staan, ook in stilstand (geen Auto-tunnel).
 - Geen knop of lampje meer over iets anders: ⛶ rechtsboven, het palet weg,
   staand de statusbalk onder Slim en de ringen eronder, 🏁 naast de tank.
   Nieuwe proef bproef-lagen.js loopt alle weergaven af.
 - Temperatuur: geen 0167/0168 als reserve (hetzelfde koelwater en dezelfde
   inlaat nog een keer). Emissie krijgt ook een reserve, alleen op balken.
 - Telemetrie zegt waarom alles grijs staat (telefoon niet vast).

 ═══════════════════════════════════════════════════════════
 28-10-2026 — Telemetrie: het G-vizier
 ═══════════════════════════════════════════════════════════

 - De G-cirkel is het hoofdinstrument: ringen per kwart g, een lichtspoor
   van 1,5 s (gSpoorBij), de totale G, en per richting de hoogste waarde
   van de rit (gMax; een kwartier zonder meting begint opnieuw).
 - Horizon en autootjes ernaast (liggend) of eronder (staand), in neon.
 - De basismeter krijgt nooit een thema (PLVisThema.pas); tot nu toe kon
   zet() hem er tot de volgende herbouw toch een geven — een race in CI.

 ═══════════════════════════════════════════════════════════
 28-10-2026 — Temperatuur: geen lege balken meer
 ═══════════════════════════════════════════════════════════

 - Een profiel kan een `reserve` hebben: ontbreekt een sensor, dan eerst een
   verwante temperatuur (0167, 0168, 0184, 0177, 0175, 013E, 0178, 0179), en
   dan de warmte (0104 belasting, 0110 luchtmassa), met eigen naam en schaal.
 - PLVisueel.reserveKetens() zet er één per lege plek aan; een gedeelde
   reserve achter elke keten zou er maar één aanzetten.

 ═══════════════════════════════════════════════════════════
 28-10-2026 — Levende statusbalk, schakellampjes als lichtstreep
 ═══════════════════════════════════════════════════════════

 - Motor- en acculampje in één glazen capsule: het icoon ademt in zijn
   toestandskleur, de meter is een gloeiende lijn, een nieuwe waarde geeft
   een korte puls en een andere toestand (ok → laag) een sterkere
   (PLVisueel.lampTik). Een te lage accu knippert zacht.
 - De tien schakelrondjes zijn één naadloze lichtstreep; uit een haarlijn.

 ═══════════════════════════════════════════════════════════
 28-10-2026 — Scorebord alleen na een mooie run, met trend en verloop
 ═══════════════════════════════════════════════════════════

 - Het scorebord kwam na 0,3 km bij elke stilstand, dus bij elk stoplicht.
   Nu vanzelf alleen na een run van ≥ 3 km én ≥ 3 min sinds de vorige
   stilstand, of met een gemeten 0–100. Een tik sluit het; 🏁 toont de rit.
 - Trend per tegel tegen het gemiddelde van de vorige runs (pl_hl_runs, 20
   stuks), en een grafiekje van het snelheidsverloop.

 ═══════════════════════════════════════════════════════════
 28-10-2026 — Hartslag als ECG, zonder stotteren
 ═══════════════════════════════════════════════════════════

 - De achtergrond Hartslag is een hartslaglijn: papier met vaste snelheid,
   slagen dichter op elkaar bij hogere toeren (62–138 per minuut, traag
   meelopend). Het stotteren kwam van fase = T·v met v uit het toerental:
   na een paar minuten sprong de lijn bij elke meting. De fase telt nu op.

 ═══════════════════════════════════════════════════════════
 28-10-2026 — Hyperlane-look voor Verbruik, Motor, Telemetrie en Basis
 ═══════════════════════════════════════════════════════════

 - Verbruik: het grote getal dun en gloeiend, segmenten in de kleur van het
   rijgedrag. Motor: ringen in die kleur, tegels van glas. Telemetrie: autootjes
   in neon, liggend in twee kolommen.
 - Basis: glazen plaat, gloeiende naald en bogen, de zones blijven oranje/rood.
 - Alle weergaven: dezelfde achtergronden met het knopje; het palet is weg.

 ═══════════════════════════════════════════════════════════
 28-10-2026 — Hyperlane-look voor Temperatuur en Emissie
 ═══════════════════════════════════════════════════════════

 - Temperatuur: vijf neonbuizen; Emissie: lambda gloeiend op een lichtende
   schaal met de trims als neonbalken (liggend in twee kolommen). Beide met de
   achtergronden en het knopje van Hyperlane en de kleur van het rijgedrag.
 - De lampjes MOTOR en ACCU zijn glazen chips; op volledig scherm bovenin.
 - Geen palet meer bij deze twee op volledig scherm. De oude kaarten zijn weg.

 ═══════════════════════════════════════════════════════════
 28-10-2026 — Hyperlane: het midden schakelbaar, slim getal of versnelling
 ═══════════════════════════════════════════════════════════

 - Knopje ⇄ linksboven of een tik op het grote getal: de versnelling groot in
   het midden, of het slimme getal. Onthouden per toestel. Te heet koelwater
   gaat altijd voor; een onbekende versnelling laat het slimme getal staan.

 ═══════════════════════════════════════════════════════════
 28-10-2026 — Hyperlane: geen schijnversnelling bij constante snelheid
 ═══════════════════════════════════════════════════════════

 - De versnelling komt uit 1,5 s aan snelheidsmetingen in plaats van twee:
   constant rijden gaf ACCELERATIE en REMMEN van 0,4 g en een rode onderkant.
 - Het hoofdgetal houdt ACCELERATIE vast tot onder 2,5 km/h/s.
 - Staand op volledig scherm delen de ringen de vrije ruimte: de snelheidsring
   liep op sommige telefoons onder de tanklichtbalk door en van het scherm af.

 ═══════════════════════════════════════════════════════════
 27-10-2026 — Hyperlane: modustekst past naast het versnellingslabel
 ═══════════════════════════════════════════════════════════

 - "MOTOR KOUD" en "KOELWATER HEET" werden liggend afgekapt sinds het
   versnellingslabel ernaast staat; de maat volgt nu ook de breedte.

 ═══════════════════════════════════════════════════════════
 27-10-2026 — Hyperlane: eigen sensor met eigen naam, rustige achtergronden
 ═══════════════════════════════════════════════════════════

 - Een zelfgekozen sensor (ook op een ring) toont zijn eigen naam, eenheid
   en schaal; voorheen bleef "GAS %" staan boven bijvoorbeeld de ontsteking.
   Die waarde telt niet meer mee als gas, koelwater of snelheid.
 - Knopje linksboven voor de achtergrond: Aurora, Hartslag, Pulsen, Sterren
   (in stilstand de tunnel, rijdend de rustige vorm), Stil, Tunnel.
 - Geen palet meer bij Hyperlane op volledig scherm.

 ═══════════════════════════════════════════════════════════
 27-10-2026 — Hyperlane: hoofdgetal in plaats van de versnelling, staand onderin goed
 ═══════════════════════════════════════════════════════════

 - Het midden toont per scène wat er toe doet: verbruik nu, acceleratie of
   vertraging in g, de 0–100-timer, koelwater (koud of te heet) of de klok.
   De versnelling is een klein label naast de modus; het merk klein bovenin.
 - Staand op volledig scherm overlapte de tanklichtbalk de snelheidsring en
   de navigatiebalk: label in breedtematen, balk boven de veilige rand.

 ═══════════════════════════════════════════════════════════
 27-10-2026 — Hyperlane: het scorebord verschijnt weer
 ═══════════════════════════════════════════════════════════

 - De rit telde geen kilometers: elke toerenmeting zette de rit-klok terug.
   Snelheid heeft nu haar eigen tijdstempel; het scorebord komt na 0,3 km.

 ═══════════════════════════════════════════════════════════
 27-10-2026 — Hyperlane, vierde ronde: scorebord, tank, power-up, G-spoor, merk
 ═══════════════════════════════════════════════════════════

 - Scorebord bij stilstand (na 0,3 km): top, beste 0–100, max toeren,
   gemiddeld, verbruik, afstand en rijtijd, met tellende cijfers.
 - Tank als lichtbalk onderin die leegloopt, met bereik (CA09) en verbruik
   (CA03); amber onder 25%, rood en pulserend onder 10%.
 - Power-up bij het starten: rustspanning → dip → laden (0142), met een
   laadbalk en een lichtgolf. Niet bij openen met een draaiende motor.
 - G-spoor: de zij-G van de laatste 2,4 s als lichtspoor over de tunnelvloer.
 - Merkthema's: veertien merken met een eigen palet en het woordmerk in het
   midden als de versnelling onbekend is. Geen logo's.

 ═══════════════════════════════════════════════════════════
 27-10-2026 — Hyperlane, tweede ronde: scènes en showreel
 ═══════════════════════════════════════════════════════════

 - Eén scène tegelijk, met een eigen beeld: alarm (koelwater te heet, alles
   pulseert rood), begrenzer, remmen (onderkant remlicht-rood), launch (warp,
   live 0–100-timer), koud (ijsblauw, rijp, randen vullen met de opwarming),
   stil (de tunnel ademt, klok in het midden), cruise · zen (koeler, rustiger).
 - Lichtgolf door de tunnel bij opschakelen; het verdwijnpunt leunt mee met
   de zij-G (TL04); rit-topsnelheid boven 100 als melding; 21–6 u gedimd.
 - 0–100 start voortaan vanaf het laatste moment van stilstand: met 10
   metingen per seconde viel er geen meting in "stil én vol gas", dus hij
   startte nooit. Meer dan 1 s van het gas breekt hem af.

 ═══════════════════════════════════════════════════════════
 27-10-2026 — Hyperlane: de blikvanger van Slim visueel
 ═══════════════════════════════════════════════════════════

 - Zevende profiel in Slim visueel (`pidlane-hyperlane.js`): een neon-tunnel
   in WebGL die meestroomt met de snelheid, toeren en snelheid als ringen in
   perspectief die meekantelen met de telefoon, de versnelling in het midden
   met schakellampjes en een flits op de begrenzer.
 - De kleur volgt het rijgedrag: ijsblauw → cyaan → violet → amber → rood,
   uit toerental (2/3) en gaspedaal (1/3). Modus ECO/CRUISE/SPORT/MAX.
 - Opstartzwaai bij openen; 0–100 vanuit stilstand meet hij vanzelf.
 - Op volledig scherm vult de tunnel het hele scherm, liggend en staand.
   Zonder WebGL een CSS-verloop. De lus stopt zodra het vak uit beeld is.

 ═══════════════════════════════════════════════════════════
 27-10-2026 — Instappen, starten, de rest gaat vanzelf
 ═══════════════════════════════════════════════════════════

 - Een automatische verbinding nadat de motor 15 min of langer uit stond
   is een opstart (`PLOpstart`): geen vragen, niet het vorige kenteken maar
   dat uit het profiel van deze VIN; een onbekende auto krijgt de
   kentekenvraag ná de check, in stilstand. Geen protocol: een minuut lang
   zelf opnieuw zoeken.
 - Check na verbinden: één keer per auto per dag in plaats van eenmalig;
   ook na snel verbinden met de knop. Standaard blijft hij uit.
 - Een opstart met een schone auto gaat ook in de garagemodus door naar Live.
 - 🚗 Open als de auto start (Mijn voorkeuren): native wekker via
   CompanionDeviceManager (Android 12+); koppel de handsfree van de auto
   of een BLE-adapter. Nieuwe permissie REQUEST_OBSERVE_COMPANION_DEVICE_PRESENCE.

 ═══════════════════════════════════════════════════════════
 27-10-2026 — Garagemodus bij bulk/waak, leeg meter-midden, startkop 10 s
 ═══════════════════════════════════════════════════════════

 - Bulk-recorder of waakronde aanzetten (chip, paneel of voorkeur bij
   verbinden) zet de garagemodus aan; uitzetten doet hem niet uit
   (`PLRun` → `garageNodig()`).
 - Slim visueel: zolang de versnelling onbekend is blijft het midden leeg;
   het embleem staat er alleen als de versnellingsindicator uit staat
   (`logoZien()`).
 - Startscherm: auto en "… herkend" bovenaan gaan na 10 s weg en komen terug
   bij de volgende herkenning of verbinding (`PLNav.kopToon()`).

 ═══════════════════════════════════════════════════════════
 26-10-2026 — Max haalbaar: de PID-keuze naar wat de adapter haalt
 ═══════════════════════════════════════════════════════════

 - Het doel 'Aanbevolen' heet nu 🚀 Max haalbaar en is geen vaste lijst
   meer: kern, eigen PIDs, de oude extra's, de andere focusblokken, dan de
   rest — zoveel als de adapter bijhoudt (groepsproef, snelheidstest of
   live responstijd; zonder meting ±15 PIDs/s). De kern blijft altijd.
 - De waarschuwing "veel sensoren" rekent met wat déze adapter haalt.
 - Tests: test-pidmax.js (nieuw), drie mutaties, blok 5-proef.

 ═══════════════════════════════════════════════════════════
 26-10-2026 (later) — Accupagina: waarde valt niet weg, PDF-rapport, deur
 ═══════════════════════════════════════════════════════════

 - De accuspanning viel op Live elke halve minuut even weg: 0142 staat op
   30 s, de pagina noemde alles boven 15 s oud. Nu de gedeelde regel plOud()
   (zonder die: 3× pidPollInterval), en zolang de pagina open is vraagt
   pidPollInterval() 0142 en 010C elke seconde (PLAccu.tempo). Toch te oud:
   de laatste waarde grijs met zijn leeftijd, "wacht op meting".
 - Onderaan elke tab: Rapport genereren (PDF) — acht hoofdstukken via
   PLRapport.pdf (oordeel, laadsysteem nu, starten, trend, winter, bewijs,
   advies, methode), in Rapporten en te delen. PLRapport.pdf kent nu een
   eigen x-as en grenslabel; schoon() vervangt ≈ en −.
 - Kaart Accu en laadsysteem in de deur Voorbereiden (opent op Test).
 - Tests: test-accutest.js +20, bproef-accutest.js +6, zes mutaties; blok 5.

 ═══════════════════════════════════════════════════════════
 26-10-2026 — Accupagina: live laaddata, slimme PIDs, trend en winter
 ═══════════════════════════════════════════════════════════

 - Het paneel is een volle pagina (laag 9990) met vijf tabs: Live, Test,
   Trend, Winter, Methode. Hij lag eerst achter de kop van de app en de
   onderkant viel weg; bproef-accutest.js meet beide.
 - Het accu-lampje in Slim visueel opent de pagina.
 - Live: 0142 met de gevraagde laadspanning in één grafiek, regelafwijking,
   tegels voor gevraagde spanning, SOC, accustroom, accutemperatuur en
   leeftijd (met de Mazda-code als hij ontbreekt), stroom-/SOC-grafiek.
 - Test: startcurve live met plateau en BCI-grens; de belastingproef leest
   de pollus mee en oordeelt ook op accustroom en gevraagde spanning.
 - Trend: plateau per start tegen de BCI-grens, dip @20 °C tegen de eigen
   basis, rustspanningen, laatste startcurve, tabel. Winter: curve per °C.
 - De pagina zet zelf aan wat hij nodig heeft (toestemming 26-10): 0142,
   010C, 0146, en per ontbrekende laadrol de beste kandidaat uit de
   PID-bibliotheek, na één geldige testlezing. Tijdelijk: bij sluiten terug.
 - Tests: test-accutest.js +26, bproef-accutest.js (nieuw), acht mutaties;
   blok 5; handleiding.

 ═══════════════════════════════════════════════════════════
 25-10-2026 — Accu- en dynamotest, en geen valse laadmelding meer
 ═══════════════════════════════════════════════════════════

 - Nieuw: PLAccu (pidlane-accutest.js). Begeleide test via 🔋 Accutest in
   Mijn voertuigen: rustspanning (na ≥ 2 uur stil), startdip via snelle ATRV
   (plateau tegen de BCI-grens per temperatuur), belastingproef 60 s.
 - Stil bij elke start: startdip uit 0142, trend naar 20 °C tegen de eigen
   eerste starts, en een wintervoorspelling uit de weersverwachting.
 - De poort: een accu- of dynamobevinding wordt pas een melding bij twee
   soorten bewijs, of dezelfde soort op twee dagen (30 dagen venster).
 - LAADSPANNING: de motor moet het hele venster van 30 s draaien (een i-stop
   gaf "de dynamo laadt niet"). Bovengrens 15,2 V schuift mee bij kou
   (PLKenmerk.laadHoog, tot +0,6 V).
 - Tests: test-accutest.js (57), acht mutaties; blok 5; handleiding.

 ═══════════════════════════════════════════════════════════
 25-10-2026 — Meetcoach: voortgang, stappen en keuze
 ═══════════════════════════════════════════════════════════

 - De balk toont bovenaan "✓ x van y klaar" en de ritklok ("12 van 30 min"),
   elk met een voortgangsbalk; wat vanzelf meet staat eronder met "nog m:ss".
 - "Stap x van y" met Volgende ›, ☰ Kies uit lijst en ✕ Niet deze rit (was
   Kan nu niet). De lijst noemt welke proeven niet bij deze rit passen, zet
   weggezette stappen terug en heeft ✎ Rit aanpassen; de klok loopt door.
 - Knoppen dragen de soort in data-soort (geëscaped) in plaats van in de
   onclick-tekst: een aanhalingsteken in een opdracht brak de knop.
 - Tests: test-meetcoach.js +14, bproef-meetcoach.js +2, vijf mutaties; blok 5.

 ═══════════════════════════════════════════════════════════
 25-10-2026 — Storingsbestendig: protocol, survey en modeljaar
 ═══════════════════════════════════════════════════════════

 - #614: protocoldetectie herhaalt 0100 tot drie keer bij een verstoord
   antwoord, in plaats van meteen naar de handmatige lijst (CAN 11-bit).
 - #615: de uitgebreide test stopt en bewaart niets als de verbinding
   wegvalt; een leeg antwoord telt als transportfout, niet als "PID
   ontbreekt". Geen cijfer meer en geen "geen foutcodes" na een dode adapter.
 - #617: modeljaar uit een Europese VIN zonder de Noord-Amerikaanse
   positie-7-regel (Clio 2020 was 1990). Blok 5-proef erbij.
 - bproef-storing.js: scenario's bitmap en dtc erbij, BEKEND is leeg.

 ═══════════════════════════════════════════════════════════
 25-10-2026 — Storingsproef: de klantroute tegen een storende adapter
 ═══════════════════════════════════════════════════════════

 - Nieuw: public/bproef-storing.js. Ruis, rommel, uitval en één NO DATA
   op de eerste 0100 om PLNepAuto heen; toetst vastlopen, spookdata,
   waarden en de pollus (hapering, stille adapter). Standaard Fiat 500 en
   Mercedes C 2000, --alle neemt CX-5 en Golf erbij.
 - Gevonden en als issue vastgelegd: #614, #615, #616, #617 (zie archief).
 - plmutate.sh: tegenproef op de dode-socketdrempel in trackBtQuality.

 ═══════════════════════════════════════════════════════════
 24-10-2026 — Meetcoach: meetproeven zonder meetkamer
 ═══════════════════════════════════════════════════════════

 - Nieuw: pidlane-meetcoach.js (PLMeetcoach), alleen admin/ontwikkelaar.
   Bij verbinden alle opdrachten laden en hun sensoren erbij (≤ 12); een
   vraag bovenaan Live (hoe lang, welke situaties); daarna één actie
   tegelijk, afgeleid uit wat de open opdrachten nog missen; "Kan nu niet"
   schuift door. Verzenden vanzelf: bij verbreken, na een minuut contact
   uit, en elke tien minuten.
 - Stilstaan: de balk vraagt of hij de bus mag (meeluisteren, mode 06);
   alleen na Ja, elke proef één keer per sessie.
 - De keuring telt automatisch: PLOpdracht.opstelling() geeft `auto` voor
   ongekeurd; alleen rood is een proefopstelling.
 - Tests: test-meetcoach.js (28), bproef-meetcoach.js, test-opdrachtkeuring
   +4, test-verzendoordeel herzien; negen mutaties; blok 5.

 ═══════════════════════════════════════════════════════════
 24-10-2026 — Wielslip: de assen op hetzelfde moment vergelijken (#560)
 ═══════════════════════════════════════════════════════════

 - De rit met opdracht 44 telde 15× slip bij één keer echte wielspin. De
   wielen komen per paar binnen (achter, ±1,5 s later voor); bij optrekken
   is de later gelezen as dan al sneller. Nu rekent wielTik() de snelste as
   terug naar het moment van de oudste (rechte lijn tussen zijn twee laatste
   metingen), en vraagt hij minstens 3 km/h verschil (hele km/h).
 - test-winterrit.js +3 (de rit nagebouwd, echte spin tijdens optrekken,
   afronding bij 10 km/h); twee mutaties, één anker bijgewerkt.

 ═══════════════════════════════════════════════════════════
 24-10-2026 — Meetopdracht voor de wielsnelheden (#560)
 ═══════════════════════════════════════════════════════════

 - App-maten wiel-rijden-s, wiel-vers-s, wiel-vers-pct, wiel-slip-n en
   wiel-afwijking-pct (PLGarage.maat, uit de lopende rit). De afwijking legt
   het gemiddelde van de vier wielen naast 010D: zo blijkt of de schaal klopt.
 - meetproeven/560-wielen.json/.sql: ≥ 80 % van de rit vergelijkbaar,
   ≤ 5 % afwijking, hoogstens twee keer slip op een gewone rit.
 - Tests: test-winterrit.js +2, test-opdrachtappmaat.js kent PLGarage; drie mutaties.

 ═══════════════════════════════════════════════════════════
 24-10-2026 — Wielslip gemeten aan de vier wielen (#560, methode 1)
 ═══════════════════════════════════════════════════════════

 - PLEigen.wielRol()/wielCodes(): een eigen sensor met "wheel speed" of
   "wielsnelheid" en een plek in de naam is een wiel (OBDb: Mazda 760
   22 2B06–2B09). Met alle vier geeft de ritmeting ze door (m.wielen).
 - PLConditie: wielTik() telt een slipmoment als de snelste as bij gas ≥ 10 %
   sneller draait dan de langzaamste; vier verse waarden binnen 2,5 s.
   Per rit cd.ts, naast de afgeleide cd.tc.
 - Wintercheck: een gemeten rit telt zijn ts, niet tc; het advies zegt dan
   "wielslip" (zonder "mogelijk") en noemt de vier wielen als bron.
 - Tests: test-winterrit.js +9, test-mode21.js +5; vijf mutaties; blok 5.

 ═══════════════════════════════════════════════════════════
 24-10-2026 — Conditiescore: dode zones uit 23 echte ritten (#475, #452)
 ═══════════════════════════════════════════════════════════

 - Laadspanning zonder vaste vloer (slim laden of onbekend): dode zone
   1,2 V in plaats van 0,2 V. Met de vloer van 13,2 V blijft 0,2 V.
 - Raildruk bij belasting: 20 % in plaats van 5 %; onrust stationair 40 %
   in plaats van 30 %. Trim en vervroeging bleven binnen hun zone.
 - Ook het verschil na een beurt gebruikt de ruimere zone.
 - test-conditie.js +3, twee mutaties, blok 5-proef #475.

 ═══════════════════════════════════════════════════════════
 24-10-2026 — ATST na de achtergrond; meetopdrachten in D1 (#509, #537, #599)
 ═══════════════════════════════════════════════════════════

 - Missers tot 15 s na terugkomst uit de achtergrond tellen niet voor de
   ATST-regelaar (plStNaAchtergrond, #509). Een bijsturing gaat voortaan
   naar D1 (type verbind), met hoe lang de app daarvoor weg was.
 - meetproeven/537-onderzoek.json en .sql: de opdracht van #537/#538, nu als
   rij 43 in D1. 599-bovengrens.sql is toegepast op rij 41.
 - Blok 5-proef #509; drie mutaties.

 ═══════════════════════════════════════════════════════════
 24-10-2026 — Meeluisteren op CAN: ligt de bus open? (#560, methode 2)
 ═══════════════════════════════════════════════════════════

 - Admin → 📻 Meeluisteren op CAN: 2 s ATMA met de headers aan, zenders
   tellen zonder het tester-verkeer. Open (≥ 3 zenders) wordt bij deze auto
   vastgelegd als waarneming canopen; stil niet — dat kan ook een gateway
   of contact uit zijn.
 - De adapter gaat terug met ATI, ATI en ATH0, en het herstel wordt bewezen.
 - Nieuw: pidlane-meeluister.js, test-meeluister.js; blok 5-proef #560; zes
   mutaties.

 ═══════════════════════════════════════════════════════════
 24-10-2026 — Meekijkscherm voor de klant
 ═══════════════════════════════════════════════════════════

 · Kijkt er een expert mee, dan opent bij de klant een scherm met: levert de
   telefoon live data (of niet, en waarom), welke waarden de expert ziet, en
   wat de expert opvraagt — een AI-analyse met de melding dat die het tegoed
   van de klant gebruikt. Verbergen kan; de 📡-pill brengt het terug.
 · Ging de app op de achtergrond, dan meldt het scherm daarna hoe lang de
   expert geen live data kreeg.
 · test-klantscherm.js + drie mutaties; schermranden-proef dekt het vel.

 ═══════════════════════════════════════════════════════════
 24-10-2026 — Remote-restpunten (#602)
 ═══════════════════════════════════════════════════════════

 · Expert-pollwens vervangt de vorige i.p.v. op te stapelen; vertrekt de
   laatste expert of stopt het delen, dan gaan zijn sensoren eruit.
 · Expert-verzoek op een bezette bus (5 s) faalt i.p.v. tóch te lezen.
 · Lokaal: geen antwoord op mode 03 → "Niet gelezen", niet "Geen
   foutcodes". NO DATA blijft "geen codes".
 · Opname op afstand ook met CA.., TL.. en mode-21-sleutels (Worker mee).
 · test-remote-restpunten.js + vier mutaties; test-dtcvlag volgt het nieuwe
   contract (scanDTC vangt de fout zelf).

 ═══════════════════════════════════════════════════════════
 24-10-2026 — Remote-lus: de expert ziet wat de telefoon níét levert
 ═══════════════════════════════════════════════════════════

 · Foutcodes: niet verbonden, mislukte uitlezing of 15 s time-out gaven []
   → "Geen foutcodes". Nu een melding "Niet gelezen" met de reden.
 · Versheid: 6 s zonder live frame → pill en status "geen live data",
   en weer "live" zodra het loopt.
 · test-remote-lus.js + drie mutaties.

 ═══════════════════════════════════════════════════════════
 24-10-2026 — Remote: expert zag andere waarden dan de bron
 ═══════════════════════════════════════════════════════════

 · feed() stuurde alleen het PID-achtervoegsel, driveFeed() plakte er
   altijd '01' voor → Mazda mode-21 210C/210D overschreven toerental en
   snelheid bij de expert. Nu de volle sleutel; kale 2-hex blijft mode 01.
 · test-remote-sleutel.js + twee mutaties.

 ═══════════════════════════════════════════════════════════
 24-10-2026 — bovengrens en second opinion voor meetuitkomsten (#599)
 ═══════════════════════════════════════════════════════════

 - Voorwaarde {toestand, minS, maxS}: één periode aan één stuk, sinds de
   opdracht gekozen is. Langer dan maxS = BUITEN DE OPSTELLING, oordeel
   "nog niet" in plaats van een bevinding. Kies de opdracht opnieuw voor een
   nieuwe poging. De contactproef staat op 20 s tot 1,5 min
   (meetproeven/599-bovengrens.sql — plakken in D1, daarna opnieuw keuren).
 - Elke verzonden uitkomst gaat met zijn bewijs (voorwaarden, uitslagen,
   perioden en gebeurtenissen van de toeschouwer) als voorlopig naar D1
   (opdracht_uitkomsten, POST /airtable/opdracht/uitkomst).
 - beheer.html → Meetopdrachten → Second opinion: bevestigen, ongeldig
   (bediening/opstelling, met reden), terug naar voorlopig, en een
   AI-voorstel (Haiku) dat alleen komt als er genoeg data is.
 - Nieuw: test-secondopinion.js; test-toeschouwer.js §7–8; elf mutaties.

 ═══════════════════════════════════════════════════════════
 23-10-2026 — het verslag toont de meetopdrachten (#599)
 ═══════════════════════════════════════════════════════════

 - Nieuw blok MEETOPDRACHTEN in het verslag: per opdracht het oordeel, de
   ritduur, de opstelling en of het verzonden is ("AFGEROND, NIET
   VERZONDEN" valt op). Daaronder VERZONDEN DEZE SESSIE, met tijd.
 - Elke verzending krijgt een regel in het app-log ("↑ Verzonden: …").
 - Blok 5: proef #599. Nieuw: test-opdrachtverslag.js; drie mutaties.

 ═══════════════════════════════════════════════════════════
 23-10-2026 — plbrowser vindt Chromium op elk Playwright-versiepad
 ═══════════════════════════════════════════════════════════

 - vindChromium() zocht vast in chromium-1194; het image heeft nu 1243
   (chrome-linux64). Zoekt nu in PLAYWRIGHT_BROWSERS_PATH (standaard
   /opt/pw-browsers): eerst de symlink chromium, dan elke chromium-NNNN,
   nieuwste eerst, chrome-linux64 en chrome-linux. PL_CHROME wint nog steeds.
 - Nieuw: test-plbrowser.js; twee mutaties in plmutate.sh.

 ═══════════════════════════════════════════════════════════
 23-10-2026 — Sensoren: banden in één blok, niets uit het venster; Home en AI-uitleg
 ═══════════════════════════════════════════════════════════

 - Garage → Sensoren: de groepen heetten gr-groep, dezelfde class als de
   groepsknoppen van de grafiek (white-space:nowrap, pilvorm). Nu gr-sgroep;
   lange namen en formules breken af en lopen niet meer uit het venster.
 - Banden: spanning en temperatuur per wiel in één blok 🛞 Banden (tabel per
   wiel, één vinkje, ▶ Test alle banden, Banden weghalen). Twee codes op
   dezelfde plek worden gemeld. Ook in bibliotheek en Alle sensoren zoeken
   een eigen groep, zodat de ATF er niet meer tussen staat.
 - Home: Expert op afstand rustiger — donkere kaart met groenblauwe streep,
   geen gloed, één regel uitleg, knoppen ook op 360 px naast elkaar.
 - Statusmenu → AI-uitleg opent een venster: wat de AI doet, tokens beperkt,
   aanvragen (⚡ Tokens aanvragen), niet verspillen bij onvolledige data,
   disclaimer. Handleiding bijgewerkt.
 - Proeven: test-garage.js (bandengroep), bproef-garage.js 4o, bproef-
   navigatie.js 4b/4c; vijf mutaties in plmutate.sh.

 ═══════════════════════════════════════════════════════════
 23-10-2026 — Meetproeven: opstelling keuren, toeschouwer (#594)
 ═══════════════════════════════════════════════════════════

 - Nieuw: pidlane-toeschouwer.js (PLToeschouwer). Ziet stilstand, rijden,
   contact uit/aan en helling, markeert elke overgang voor de beheerder en
   telt de duur. Voorwaarde {wat, toestand, minS} en app-maten toestand-*.
 - Keuring van de opstelling: meetkamer → ✓ Opstelling OK / ✗ fout. Route
   POST /airtable/opdracht/keur (admin) en opdracht-keur in /admin/d1;
   kolommen Keuring/KeurHash/… zet de worker zelf bij. Een veranderde
   opdracht is weer ongekeurd. Zonder groen: Outcome 'proefopstelling'.
 - plopdracht.js keurt een proef af die al waar is als zijn voorwaarde
   vervuld is. Drie nieuwe meetproeven in meetproeven/; helling en contact
   uit uit CAMPAGNE gehaald.
 - Nieuw: test-toeschouwer.js, test-opdrachtkeuring.js, test-meetproeven.js;
   blok 5-proef #594.

 ═══════════════════════════════════════════════════════════
 23-10-2026 — Beschikbaarheid van data bij de eerste verbinding
 ═══════════════════════════════════════════════════════════

 - Steunbitmaps: tot drie pogingen met oplopende time-out; NO DATA alleen
   geloofd als geen vorige bitmap het blok aankondigt. Blijft een verwacht
   blok onleesbaar, dan worden zijn 31 PIDs via het scanslot nagemeten.
   01C0 erbij; _steunbits wordt per discovery gewist.
 - Profiel tegen de steunbits: vult nu ook aan wat de auto meldt en het
   profiel mist (kon alleen verwijderen).
 - Gezondheidscheck: wat leeg, NO DATA of onleesbaar was krijgt één
   herkansing (volledig commando, 3000 ms). Bij een profiel-start met
   overgeslagen scan alleen voor de afgekeurde PIDs; daarna opslaan.
 - Uitgebreide probe (mode 21/22) die de bus bezet treft: tot 12 keer
   opnieuw, elke 10 s, in plaats van de hele sessie niet.
 - Nieuw: test-beschikbaarheid.js; blok 5-proef 'beschikbaarheid'.

 ═══════════════════════════════════════════════════════════
 23-10-2026 — CBS-pompprijs en APK-ritme
 ═══════════════════════════════════════════════════════════

 - De standaardprijs per liter komt bij het opstarten van het CBS
   (pidlane-pompprijs.js, tabel 80416ned via de Worker-proxy); de getallen
   in de code blijven de terugval. Een eigen prijs in het profiel wint.
 - APK-geschiedenis meldt een keuring ná de vervaldatum; boven 30 dagen
   als let op (geen geldige APK, of geschorst/buitenland).
 - Nieuw: test-pompprijs.js.

 ═══════════════════════════════════════════════════════════
 23-10-2026 — RDW per kenteken: APK, terugroepherstel, EV-accu; foutcodes
 ═══════════════════════════════════════════════════════════

 - APK-geschiedenis per kenteken (pidlane-apk.js): gebreken en adviespunten
   per keuring, en wat bij meerdere keuringen terugkomt; ook in de koopcheck.
 - Terugroepacties tonen het gevolg en wat de dealer herstelt.
 - EV: accu, verbruik, laadvermogen en bereik uit open-ev-data
   (pidlane-evdata.js, MIT), de uitvoering gekozen op de RDW-actieradius.
 - Foutcodes: 212 algemene P0/P2-codes met Nederlandse omschrijving;
   B2/C2/U2 zijn fabrikantcodes en lenen geen tekst meer.
 - Nieuw: test-apk.js, test-evdata.js, test-dtcsae.js.

 ═══════════════════════════════════════════════════════════
 22-10-2026 — Dekking van het NL-wagenpark (RDW × OBDb)
 ═══════════════════════════════════════════════════════════

 - OBDb-model gevonden voor 82% van de NL-auto's sinds 2001 (was 51%):
   merk uit de RDW-naam, Opel = VauxhallOpel, zustermodellen, EV-voorkeur.
 - Eigen codes met een ander antwoordadres (70E>778, 6A2>682) en bytes
   voorbij H ([n]): VAG, PSA, Opel, Honda, Kia/Hyundai krijgen codes.
 - Per OBDb-commando de waardevolste waarde; de HV-accu van een EV vooraan.
 - Uitgebreide test: EV niet meer begrensd op "geen toerental".
 - Koopcheck: Peugeot 208, UP!, KA+, MG ZS zijn geldige modelnamen.
 - Foutcodes: fabrikantcodes lenen geen tekst van een ander merk.
 - VIN: MG, BYD, Polestar, Volvo uit China.
 - Nieuw: bproef-adres.js, test-obdbkoppel.js, test-rdwnaam.js; vijf EV's in
   nepauto-profielen.js.

 ═══════════════════════════════════════════════════════════
 22-10-2026 — Zes fouten uit de nagebouwde merken gerepareerd (#584–#589)
 ═══════════════════════════════════════════════════════════

 - Foutcodes op K-lijn: geen spookcode meer bij automatisch protocol (#584).
 - EGR en spoelklep op 0 % stationair blijven staan (#585).
 - Discovery leest de bitmaps van alle ECU's: 015B bij Toyota-hybrides (#586).
 - IUPR (0908) klopt met ISO-TP-opvulling (#587).
 - Merk uit de VIN voor Europese fabrieken: Toyota, Kia, Hyundai, Dacia… (#588).
 - Hybride is alleen e-CVT bij Toyota/Lexus/Ford/Suzuki (#589).
 - Nieuwe tests: test-dtcprotocol.js, test-steunbits.js, test-vinmerk.js.

 ═══════════════════════════════════════════════════════════
 22-10-2026 — #541 zonder rit: de uitgebreide test op zestien auto's
 ═══════════════════════════════════════════════════════════

 - public/nepauto.js: virtuele ELM327 met een auto erachter (PLNepAuto).
 - public/nepauto-profielen.js: zestien auto's uit OBDb plus de opname van
   een Toyota Auris hybride; bron per auto, aannames in de kop.
 - public/test-nepauto.js: de nepauto tegen de datasheet en de opname.
 - public/bproef-merken.js: de echte app verbindt, ontdekt en draait de
   survey; bekende bevindingen (#584–#589) zijn LET OP, de rest FOUT.

 ═══════════════════════════════════════════════════════════
 22-10-2026 — README vernieuwd en video "nieuw in PidLane"
 ═══════════════════════════════════════════════════════════

 - README.md: "Nieuw in 3.4" uit de release notes (PLAY-INZENDING.md §14),
   functies, hardware, architectuur, ontwikkelen en privacy opnieuw ingedeeld.
 - marketing/nieuw.html → pidlane-nieuw.mp4 (1080x1920, 16 s) voor TikTok,
   Reels en Facebook; zonder versienummer in beeld. Opzet als tiktok.html.

 ═══════════════════════════════════════════════════════════
 22-10-2026 — Handleiding: beeld in plaats van tekst
 ═══════════════════════════════════════════════════════════

 - Inhoud als tegels met icoon en één zin per onderwerp; elk onderwerp opent
   met icoon, korte zin, genummerde stappenkaarten, een schema (stroom,
   tegels, onderbalk met de echte iconen, stoplichtlegenda) en Tip/Let op-
   kaders. De lange tekst staat onder "Meer uitleg" en blijft doorzoekbaar.
 - Opzet volgens gangbare handleidingpraktijk: progressive disclosure,
   genummerde callouts links→rechts, bekende iconen, kaders voor waarschuwingen.
 - test-help.js deel 9 rendert de echte weergave; drie mutaties in plmutate.sh.

 ═══════════════════════════════════════════════════════════
 22-10-2026 — Intro: drie stukjes app komen over de rijbaan op je af
 ═══════════════════════════════════════════════════════════

 - Na het logo komen drie kaarten over de neonbaan: Live meten (naald slaat
   uit), Check mijn auto (stoplicht springt op groen), Ritanalyse (lijn
   tekent zich). "tik om over te slaan" onderaan. DUUR_MS 2900 → 4900;
   eindregel 4,85 s; bproef-intro.js kijkt op 2,9 s of er een kaart staat.

 ═══════════════════════════════════════════════════════════
 22-10-2026 — Full survey V2 (schema 3) voor de rittencampagne #541
 ═══════════════════════════════════════════════════════════

 - pidlane-survey2.js (PLSurvey2) nieuw: mode 09 (ECU-namen, IUPR),
   OBDonUDS/J1979-2 (22F400), plaatshouders, mode 06, UDS alle
   stuurapparaten, derde poort, eigen sensoren; de acht stappen van #541
   als ✓/~/✗ plus een tabelregel om te plakken. Bitmaps 01A0/01C0 erbij.
 - PLPidZoek.laatste() voor stap 7. test-survey2.js, drie mutaties, blok 5.

 ═══════════════════════════════════════════════════════════
 22-10-2026 — Alle sensoren zoeken, met keuring op een plausibele waarde
 ═══════════════════════════════════════════════════════════

 - pidlane-pidzoek.js (PLPidZoek) nieuw; blok 🚀 in Mijn voertuigen →
   Sensoren: test elke bibliotheek/OBDb-code één keer, stelt alleen een
   plausibele waarde voor, in de groepen van de eigen sensoren, met vinkjes.
 - test-pidzoek.js, drie mutaties, blok 5-proef.

 ═══════════════════════════════════════════════════════════
 22-10-2026 — Slim visueel: vegen staat stil zolang de themakeuze open is
 ═══════════════════════════════════════════════════════════

 - `veegMag()` in pidlane-visueel.js: met de 🎨-strook open (of een veeg die
   op de knoppen begint) wisselt vegen geen weergave. Test in
   test-visueel.js, mutatie in plmutate.sh.

 ═══════════════════════════════════════════════════════════
 22-10-2026 — Kasboek: vervolgdelen bij max_tokens te tellen (#526, punt 4)
 ═══════════════════════════════════════════════════════════

 - apiFetch stuurt bij deel 2 en 3 `pl_deel` mee; de Worker haalt het eraf
   vóór Anthropic en zet "vervolgdeel N" achter Details (afboeking én
   ai-verbruik). Zo is te meten hoe vaak de volle invoer opnieuw betaald wordt.
 - apiFetch vraagt 2× het plafond van de aanroeper (max 8192). In D1 stopten
   alle 6 vervolgdelen sinds 10-09 op een te krap plafond; nu één call.
 - test-kasboek.js deel 14b, test-vervolgdeel.js (draait de echte apiFetch);
   drie mutaties in plmutate.sh.

 ═══════════════════════════════════════════════════════════
 22-10-2026 — Versie 3.4.0 voor de release
 ═══════════════════════════════════════════════════════════

 - APP_VERSION en package.json naar 3.4.0; mutatie in plmutate.sh mee.
 - PLAY-INZENDING.md: aankooprapport en wintercheck in §3 (ingekort tot
   onder 4000 tekens), release notes 3.4 in §14, drie toestelregels en
   "Let op bij 3.4.0" in §16b.
 - Handleiding gecontroleerd tegen 3.4.0.

 ═══════════════════════════════════════════════════════════
 21-10-2026 — Tegoed: de laatste stukken van #524
 ═══════════════════════════════════════════════════════════

 - Laadregel: "saldo N tokens (laatst bekend op dit toestel, nog niet bij
   de server nagevraagd)" — het getal kwam uit de opslag, niet van de server.
 - Help (Wat zijn tokens?): vooraf een schatting, afgerekend wat het echt
   kostte; kost het meer dan je had, dan gaat het saldo naar 0, niet eronder.
 - test-saldokop.js: het geval van 15-10 nagebouwd (lokaal 80, server 15,
   kosten 85): één regel met saldo 15 en de analyse erbij. 2 mutaties.

 ═══════════════════════════════════════════════════════════
 21-10-2026 — Kosten per maand: wettabel MRB en pompprijs van nu (#505)
 ═══════════════════════════════════════════════════════════

 - Wegenbelasting uit art. 23 Wet MRB 1994 (versie 01-07-2026): rijksdeel
   per klasse en per begonnen 100 kg, dieseltoeslag € 153 + € 16,57 per
   100 kg (was een lijn met € 12,50 per 100 kg). Opcenten via het anker
   van de Belastingdienst (1.100 kg benzine = € 126). Zonder fijnstoftoeslag.
 - Pompprijzen naar de adviesprijs van 20-10-2026: Euro95 2,64, diesel
   2,69, LPG 1,29 (was CBS juli: 2,30 / 2,15 / 0,95).
 - PLBerekend.PRIJS_STANDAARD (ritkosten) stond nog op 1,95 / 1,70 / 0,85;
   nu gelijk aan de wijzer, en test-wijzer.js houdt ze gelijk.
 - test-wijzer.js +6, 3 mutaties, blok 5.

 ═══════════════════════════════════════════════════════════
 21-10-2026 — Wintercheck: één thermostaatoordeel (#558)
 ═══════════════════════════════════════════════════════════

 - De wintercheck (pidlane-koopcheck.js) oordeelt via
   PLWinterRit.opwarming(), met de grenzen uit PLWinterRit.CFG
   (85/88 °C, 420 s, terugzakken onder 75 °C).
 - Nieuw: koelwater dat na het opwarmen terugzakt is rood ("thermostaat
   blijft mogelijk open hangen"). Geen koelwater gemeten is nu onbekend,
   niet meer "open vast".
 - test-winterrit.js (+10, met de echte winterLocalVerdict), 2 mutaties,
   blok 5.

 ═══════════════════════════════════════════════════════════
 21-10-2026 — Beeld-in-beeld wordt een klokje met naald
 ═══════════════════════════════════════════════════════════

 - Het PiP-venster is vierkant (was 16:9) en toont een toerenteller met
   naald, de snelheid in het midden en het koelwater eronder. De
   knipperende stip is weg: het venster blijft rustig.
 - Kleur alleen bij een afwijking: oranje vanaf wH, rood vanaf dH van
   0105 in PIDS (nu 105 en 112 °C).
 - Stopknop in de knoppenlaag van Android (PLPip.java, RemoteAction):
   verbreekt via handleConnect() en sluit daarna het venster (sluit()).
 - test-pip.js blok 9, test-nativeschil.js pipStop, 4 mutaties, blok 5.

 ═══════════════════════════════════════════════════════════
 21-10-2026 — Aankooprapport voor occasionkopers (PLAankoop)
 ═══════════════════════════════════════════════════════════

 - Nieuw: pidlane-aankooprapport.js. Knop "📄 Aankooprapport maken" in de
   koopcheck: foutcodes (actief/wachtend/permanent), zelftests, mode 06,
   CALID/CVN, km en warm-ups sinds wissen, km met lampje aan, km-check
   (PLKm), RDW en terugroepacties in één PDF met datum, tijd en een zelf
   getypte plaats van bezichtiging. Geen GPS: de app blijft locatievrij
   (test-geen-gps.js, Data safety).
 - Oordeel uit regels, niet uit de AI: vers gewist (< 100 km of < 10
   warm-ups) is rood, permanente code na wissen ook. Rood wint altijd;
   groen/oranje alleen op een complete meting, anders grijs.
 - Invoercheck per onderdeel (compleet/deels/ontbreekt + gevolg), vragen
   voor de verkoper, B1-disclaimer. AI schrijft alleen de samenvatting.
 - Het VIN staat niet in het rapport. PLRapport.pdf() kreeg opts.label.
 - test-aankooprapport.js (82 toetsen), 6 mutaties, blok 5-proef.

 ═══════════════════════════════════════════════════════════
 21-10-2026 — Oordeel van de app houdt rekening met de toestand
 ═══════════════════════════════════════════════════════════

 - Eén meting over de alarmgrens is "let op" (uitschieter), niet meer
   "afwijkend"; twee of meer blijven rood. Ook de PID_LET_OP-grens vraagt
   nu twee monsters.
 - PID_TOESTAND (pidlane-data.js): de startdip van de accu telt pas onder
   9,6 V, motorbelasting rijdend geen vlag (vol gas = 100 %), inlaatlucht
   stilstaand geen vlag (heat soak), kortetermijntrim pas als hij 25 % van
   de tijd buiten ±10 % ligt. Toestand uit toerental en snelheid
   (PLVerzamel.toestandUit); onbekend = de vaste grens.

 ═══════════════════════════════════════════════════════════
 21-10-2026 — Minder AI-tokens per analyse
 ═══════════════════════════════════════════════════════════

 - Eerdere rapporten (sessie en voertuig) gaan als conclusie en advies mee,
   hoogstens 600 tekens (plRapportKern), in plaats van hun begin.
 - Korte vragen zonder meetdata naar Haiku (AI_LICHT): adapteradvies,
   koopcheck-prijs/onderhoudsvragen, onderhoudsschema, lampjesfoto,
   "Meer over dit model". Het tarief per credit is gelijk gebleven.

 ═══════════════════════════════════════════════════════════
 20-10-2026 — Ruw stationair: wegzakken na een stop telt niet (#567)
 ═══════════════════════════════════════════════════════════

 - De rit-monitor meet de schommeling van het stationair toerental rond
   zijn verloop. Een toerental dat na een stop wegzakt, met ruis erop, gaf
   "ruw stationair" (rit 20-10, 238 rpm); echte ruwloop en de airco blijven
   een melding.

 ═══════════════════════════════════════════════════════════
 20-10-2026 — Eén aanlevering voor alle analyses
 ═══════════════════════════════════════════════════════════

 - De AI krijgt het datakwaliteitsblok en de correlatiebevindingen één
   keer; acht analyses stuurden ze dubbel (en betaalden dubbel).
 - Het profiel van de aanlevering komt uit de meting (PLVerzamel.aanlevering);
   de oorzaakanalyse beloofde een emissiedekking, de totaalcheck-verdieping
   een dekking over het hele totaalprofiel.
 - Diepe storingscheck, klimaatcheck en opname geven hun vraag mee;
   prijs, lease, inkoop en "rapport herzien" sturen geen meetblok meer.
 - Eén kwaliteitsoordeel per sensor: wat de samenvatting toont is over het
   venster beoordeeld, de aanlevering oordeelt alleen over de rest (#565).
 - AI-Automonteur en opname krijgen dezelfde samenvatting (min–max en
   oordeel) in plaats van losse waarden; onderhoud, EV en lange rit zetten
   na het meten geen profiel meer aan.

 ═══════════════════════════════════════════════════════════
 20-10-2026 — Er is iets mis, opnieuw; tractie-ingrijpen (#560)
 ═══════════════════════════════════════════════════════════

 - "Wat merk je?": tegels (meer mag), zelf beschrijven met live
   herkenning, een foutcode invoeren, en "Ik merk niets bijzonders" als
   algemene check. Daarna "Wanneer?" met meerkeuze; daaruit volgt de
   meting. Het plan toont wat je merkt en wat de code betekent.
 - Het onderzoek neemt tegels, moment en opgegeven codes over; een
   opgegeven code telt als voorkennis, nooit als bevestiging. Klacht
   "Vreemd geluid of trilling" erbij.
 - De laatste keuze valt niet meer achter de Android-knoppen.
 - Per rit "mogelijk wielslip" (cd.tc) uit gaspedaal, gasklep, toeren en
   snelheid; advies in Mijn voertuigen bij kou, met de banden erbij.
 - Kosten per maand: pompprijzen naar CBS juli 2026 (#505).

 ═══════════════════════════════════════════════════════════
 20-10-2026 — Verversen, Handmatig, thema's in Visueel
 ═══════════════════════════════════════════════════════════

 - Winterkaart: "Bijgewerkt om …" en ↻ Verversen (haalt meteen opnieuw,
   ook binnen het uur).
 - Adapterpaneel onder ✋ Handmatig: het knoppenvak plakt niet meer over
   de getallen, en bovenaan staat wat je laatste wijziging doet — nu naast
   vóór, met beter/slechter na het venster van 10 s.
 - Slim visueel: thema's ook in de gewone weergave, 🎨 staat er altijd.

 ═══════════════════════════════════════════════════════════
 20-10-2026 — De totaalcheck op de schop: stilstand en rijden
 ═══════════════════════════════════════════════════════════

 - Weg: de vragenlijst (koude start, olie, geluiden: ja/soms/nee) en de
   rijtest met vijf fases van twee minuten vanuit de totaalcheck.
 - Twee stappen: 🅿️ Stilstand (verzamelscherm, daarna foutcodes 03/07/0A
   en zelftests) en 🚗 Rijden (gewoon wegrijden, het scherm stopt vanzelf
   na ± 90 s rijtijd). Elk deel wordt beoordeeld op alleen zijn eigen
   monsters, gesplitst op de snelheid van dat moment.
 - Uitslag per categorie: wat klopt blijft dicht; een categorie met een
   afwijking gaat open met een focusmeting (alleen die sensoren, in de
   toestand waarin de afwijking zat) en een AI-vraag over alleen dat
   systeem. Het AI-rapport kan pas na een meting en noemt een niet
   gemeten deel als niet gemeten.
 - PLVerzamel.meet(): opts.rijtest:false en opts.maxMs.
 - Nieuw: test-totaalcheck.js, acht mutaties, blok 5-proef.
 - Na de eerste rit: de rijmeting telt zijn eigen rijtijd (pidHist hield
   maar 20 s snelheid vast); gasklep bij stationair, langetermijntrim en
   bitmaps heten niet meer "vast"; één trimpiek is geen "let op"; traag
   koelwater maakt een warme motor niet koud; het rapport noemt alleen
   uitgevoerde proeven en gaat over beide delen.

 ═══════════════════════════════════════════════════════════
 20-10-2026 — De winter (#555–#559)
 ═══════════════════════════════════════════════════════════

 - Winterkaart boven het startscherm, oktober–maart: één keer per
   seizoen "Het wordt kouder — pas je profiel aan voor de winterperiode",
   daarna drie dagen weer en hoogstens één advies (weg te tikken).
 - Winterprofiel: plaats uit een lijst (geen locatie), banden met symbool,
   DOT en profiel, ruitensproeiervloeistof met grens en datum. Bij een
   klant in kp_voertuig, anders op het toestel. Bandentabel: elk soort
   band van −10 tot 25 °C, jouw band en de komende dagen erop (een model).
 - Worker: /weer (Open-Meteo via de Worker, randcache per plaats), negen
   kolommen in kp_voertuig, akkoordtekst 2026-10-20.
 - Per rit ook buitentemperatuur, tijd op temperatuur en het laagste
   koelwater op de snelweg; Mijn voertuigen → Advies zegt nu iets over
   korte ritten in de kou en een thermostaat die open blijft hangen.
 - Nieuw: pidlane-weer.js, pidlane-winter.js, pidlane-winterrit.js,
   test-weer.js, test-winter.js, test-winterrit.js, bproef-winter.js.

 ═══════════════════════════════════════════════════════════
 19-10-2026 — Snel verbinden met een bekende auto
 ═══════════════════════════════════════════════════════════

 - Ingelogd, adapter, kenteken, protocol en voertuigprofiel bekend: de
   knop verbindt zonder kentekenvraag, protocolkeuze, scanvraag of
   samenvatting; het venster toont alleen "Verbinden met voertuig…".
   Alleen de bekende adapter, één ronde; antwoordt hij niet, dan zegt de
   melding: druk op de pair-knop. Nieuw: test-snelverbinden.js.

 ═══════════════════════════════════════════════════════════
 19-10-2026 — Een Bose-speaker is geen OBD2-adapter
 ═══════════════════════════════════════════════════════════

 - Bij een Bluetooth-scan verbond de app eerst met een "SoundLink"-
   speaker: de SPP-keuze had een eigen naamlijst met een kale 'link' en
   'scan'. Scanlijst en verbindkeuze gebruiken nu één oordeel,
   isObdNaam() in pidlane-bt.js. Nieuw: test-obdnaam.js.

 ═══════════════════════════════════════════════════════════
 18-10-2026 — De expert op een laptop krijgt een werkplek
 ═══════════════════════════════════════════════════════════

 - Meekijken op een laptop (gemeten, of met de knop Expertweergave):
   het venster opent na het inloggen vanzelf, schermvullend, met de auto,
   wat nu afwijkt, wat er al gedaan is en procedures voor deze auto
   (meetstappen, werkplaatsactie, controleplan per foutcode). De
   garagemodus gaat vanzelf aan. Nieuw: pidlane-expertwerk.js
   (PLExpertWerk), test-expertwerk.js, bproef-expertwerk.js.

 ═══════════════════════════════════════════════════════════
 18-10-2026 — Visueel op het volle scherm, met thema's
 ═══════════════════════════════════════════════════════════

 - Slim visueel: knop volledig scherm boven de meter. Daar kies je met 🎨
   een thema: Neon, Spectrum, Chroom, Carbon of Nachtrood. Bij openen en
   wisselen zwaait de naald één keer vol uit; het scherm blijft aan.
   Buiten het volle scherm blijft de gewone weergave. Nieuw:
   pidlane-visthema.js (PLVisThema), test-visthema.js, bproef-visthema.js.

 ═══════════════════════════════════════════════════════════
 17-10-2026 — Voorkennis voor de expert, VIN niet meer ruw in de vstate
 ═══════════════════════════════════════════════════════════

 - Expert op afstand: bij het verbinden ziet de expert wat de app al wist —
   "Eerst kijken naar" (foutcodes en mode 06 als verdenking, merkkennis als
   duw), bekende zwakke punten zonder bewijs apart, foutcodes met aantal,
   fase en freeze frame, mode 06, waarnemingen, eerdere rapporten (tekst op
   verzoek met Lees). Nieuw: pidlane-voorkennis.js (PLVoorkennis).
 - Privacy: de vstate droeg de ruwe VIN naar de Worker en elke expert. Nu
   WMI + pseudoniem; de Worker haalt een veh.vin ook zelf weg.
 - Mode 06 bewaart de laatste uitlezing (PLM06.laatste) en werkt een
   meekijkende expert direct bij; een DTC-verzoek van de expert ook.
 - Worker: request-rapport (alleen een archief-id).

 ═══════════════════════════════════════════════════════════
 17-10-2026 — Expert op afstand voorop
 ═══════════════════════════════════════════════════════════

 - Home: een blok Expert op afstand boven Check mijn auto, met Laat iemand
   meekijken (deelvenster) en Ik ben de expert (codeveld) — PLNav.expert().
   De kaarten in Live data blijven. Rit starten zegt niet meer Meekijken.
 - Handleiding: startscherm en Delen en meekijken wijzen naar het nieuwe blok.
 - PLAY-INZENDING.md: korte en volledige beschrijving, feature graphic,
   screenshotvolgorde en release notes leiden met het meekijken.

 ═══════════════════════════════════════════════════════════
 17-10-2026 — Rondgang in Slim: elke pagina op één scherm
 ═══════════════════════════════════════════════════════════

 - Een volle pagina viel onder de navigatie. pasIn() meet na het tekenen
   en tekent dan dichter: kleinere getallen en lagere staven, daarna
   rijen in twee kolommen en de grote waarde met zijn lijn ernaast.
   Bewust niet splitsen: één onderwerp blijft één scherm.
 - Een half lege pagina (Uitlaatgas, Brandstofdruk) krijgt verwante
   sensoren als rij (VERWANT): raildruk naast belasting en trim,
   uitlaatgas naast belasting en kat. remt() remt een sensor niet meer
   die op de dia in beeld staat, ook als hij elders thuishoort.

 ═══════════════════════════════════════════════════════════
 17-10-2026 — Play-teksten en privacyverklaring voor 3.3.0
 ═══════════════════════════════════════════════════════════

 - Versie 3.3.0. PLAY-INZENDING.md: §3 met lampjesgids, alle
   stuurapparaten, kenteken-check en conditiescore (3970/4000 tekens),
   §14 nieuwe release notes, §16b de toestelproeven voor 3.3.
 - Data safety §11: Photos aangevinkt — de lampjesgids stuurt een
   dashboardfoto naar de AI (#492); dat stond nog onder "niet aanvinken".
 - De demo heet in §3 en §7 een gesimuleerde auto, zoals in de app zelf.
 - privacy.html: camera ook voor de dashboardfoto; de dagelijkse
   terugroepcheck stuurt het kenteken via de server naar de RDW.

 ═══════════════════════════════════════════════════════════
 17-10-2026 — RDW: terugroepacties en tellerstand goed gelezen
 ═══════════════════════════════════════════════════════════
 Een terugroepactie die de fabrikant als hersteld heeft gemeld, staat
 niet meer als open recall in de kentekencheck, de koopcheck en de
 AI-prompt. "Geen oordeel" en "Niet geregistreerd" bij de tellerstand
 worden getoond en uitgelegd (geen fraudesignaal) in plaats van
 weggelaten; alleen "Logisch" is nog groen. Omschrijving en risico van
 een terugroepactie komen uit de echte RDW-velden. De bronnencontrole in
 beheer bewaakt nu ook de drie terugroeptabellen en de woordenlijsten.

 ═══════════════════════════════════════════════════════════
 16-10-2026 — Beheer: kennisbronnen bewaakt, logcontrole in SQL
 ═══════════════════════════════════════════════════════════
 Nieuw tabblad Data → Bronnen in beheer.html (route /admin/bronnen).
 Per bron (OBDb-organisatie, de OBDb-bestanden uit de PID-bibliotheek
 plus de CX-5, de twee RDW-datasets, NHTSA vPIC): bereikbaar, nog de
 vorm die de app leest (RDW-kolommen, `commands`, `Results`), en
 veranderd sinds de vorige controle (vingerafdruk in D1 `bron_stand`).
 Ook in de nachtronde. De SQL-console heeft een groep Logcontrole:
 fouten 24 uur, nieuwe fouten van deze week, foutpercentage per versie,
 volume per uur, herhalers per rit, per gebruiker, per merk/protocol,
 demo tegen echt, logarchief per dag en de bronnenstand.

 ═══════════════════════════════════════════════════════════
 16-10-2026 — Snelle scan: twee lezingen per sensor (#538)
 ═══════════════════════════════════════════════════════════
 De momentopname van het onderzoek vraagt elke sensor twee keer in
 plaats van drie. Uitgerekend: een V-motor met een trage adapter kwam
 op 8,4 s, nu hoogstens 5,6 s. #535 en #536 zijn beantwoord uit de
 OBD-norm en vakliteratuur, zonder rit.

 ═══════════════════════════════════════════════════════════
 17-10-2026 — Kennis per merk vanzelf binnenhalen (#541)
 ═══════════════════════════════════════════════════════════
 OBDb wordt vanzelf doorzocht zodra een auto herkend is of zijn
 sensorlijst opent (gratis, één keer per maand). De nuttigste codes
 (gevraagde laadspanning, laadtoestand en stroom van de 12V-accu,
 banden, olie, automaat) staan bovenaan in plaats van willekeurig.
 Fiat en Honda (29-bit kort adres) leveren nu codes op. De laadrollen
 herkennen de namen van Renault, Nissan, Volvo, VAG, Kia en Toyota, en
 zien drempels en de tractie-accu niet meer aan voor de 12V-accu.
 Fout hersteld: een mode 22-antwoord over meer frames werd verkeerd
 ontleed (framenummers in de data); eigen sensoren met E–H in de
 formule gaven daardoor een verkeerde waarde.

 ═══════════════════════════════════════════════════════════
 16-10-2026 — Mode 06: geen "krap" meer tegen een grens die er niet is
 ═══════════════════════════════════════════════════════════
 Een grens van 0 of 65535 (unsigned), −32768 of 32767 (signed) is geen
 grens. 0 ontstekingsmissers tussen 0 en 65535 heette "krap"; op de
 CX-5 waren dat 16 van de tests, en de AI kreeg ze mee. Nu telt alleen
 een echte grens; met één echte grens is de marge relatief aan die grens.

 ═══════════════════════════════════════════════════════════
 16-10-2026 — Er is iets mis: eerst wat de auto al weet
 ═══════════════════════════════════════════════════════════
 Het volledige onderzoek begint met een snelle scan: foutcodes plus
 het freeze frame (mager stationair → lek, mager onder last →
 brandstofdruk), het bijstuurgeheugen per cilinderbank (verschil →
 luchtmassameter en brandstofdruk vallen af), de boordspanning, en
 een trimkaart uit de laatste rit, datalog of live-historie
 (stationair tegen 1800–3200 tpm: het patroon van de 2500-tpm-proef
 zonder dat iemand gas hoeft te geven).
 Nieuw blok "Wat de auto al wist": codes kort geleden gewist, gereden
 met lampje aan, een code die eraan komt, permanente code, lange trim,
 bankverschil, trimkaart, bekend bij dit merk.
 Intake: "Wanneer speelt het?" (koud, warm, stationair, optrekken,
 constant, regen) weegt vooraf mee, hoogstens 1,5 per oorzaak.
 Oorzakenbord en tijdlijn nu voor iedereen, met ▲/▼-telling en het
 zwaarste bewijs zichtbaar; elke stap zegt welke oorzaken hij scheidt.
 App-maten onderzoek-* (scans, scanduur, freeze frame met trims,
 bank 2, bankverschil, trimkaartvakken, kaart tegen proef) voor de
 meetopdrachten in #535–#538.

 ═══════════════════════════════════════════════════════════
 16-10-2026 — De derde poort: geldt deze regel voor déze auto? (#532)
 ═══════════════════════════════════════════════════════════
 Nieuw: pidlane-kenmerk.js (PLKenmerk). Elke auto krijgt een profiel
 van kenmerken (slim laden, kenveldthermostaat, turbo, diesel, hybride,
 LPG, CVT, breedbandsonde), bewezen of waarschijnlijk, met de bron.
 Een regel die uitgaat van een kenmerk dat onbekend is, zegt "niet te
 beoordelen" in plaats van een fout; bij waarschijnlijk "niet zeker
 voor deze auto". Harde grenzen (onder 12,2 V laden, boven 112 °C)
 blijven op elke auto fout.
 Laadspanning en koelwater hebben nu één grens, op elke plek die
 een fout of let op meldt.
 De AI krijgt een blok met de kenmerken en wat niet te beoordelen is.
 Het venster van de bevindingen stelt de vraag (Ja/Nee) die het
 beslist; het antwoord blijft bij de auto.
 Ook: vacuümtest niet meer op diesels, inlaatdruk boven 110 kPa geen
 "let op" meer op een turbo, thermostaatbevinding pas na 10 minuten.

 ═══════════════════════════════════════════════════════════
 16-10-2026 — Laadspanning: de auto zegt zelf wat hij vraagt
 ═══════════════════════════════════════════════════════════
 Met een eigen sensor "Commanded generator voltage" (Mazda 220304) of
 "12V battery state of charge" (224028) beslist niet meer een vaste
 grens van 13,0/13,2 V maar de laadregeling zelf: haalt de dynamo wat
 er gevraagd wordt, dan is lage spanning geen storing; blijft hij er
 meer dan 0,5 V onder, dan wél. Geldt voor de rit-monitor, de
 bevindingen, het accu-oordeel in Visueel, de rondgang en de garage
 (status en ritadvies). De garage meldt ook een lage laadtoestand en
 de leeftijd van de accu als de accusensor die geeft.

 ═══════════════════════════════════════════════════════════
 16-10-2026 — Copiloot ook uit de Worker
 ═══════════════════════════════════════════════════════════
 De app riep /copilot al maanden niet meer aan, maar de Worker
 nam hem nog aan: elk model, geen kasboekregel, buiten de poort
 van #526 om. Route, briefing en handler zijn weg, net als de
 regel in run_worker_first.

 ═══════════════════════════════════════════════════════════
 16-10-2026 — Rondgang: zelf sensoren per categorie
 ═══════════════════════════════════════════════════════════
 ⚙-blad van de rondgang: onder elke categorie "＋ Sensor" met een
 zoekbare lijst van wat de auto geeft (ook eigen codes). De keuze
 (pl_rond_eigen) wint van de vaste indeling: de sensor staat alleen op
 de laatste pagina van die categorie, en gaat aan als hij uit stond.

 ═══════════════════════════════════════════════════════════
 16-10-2026 — Sensoren ingedeeld: weergave, analyse, dubbel
 ═══════════════════════════════════════════════════════════
 Eigen sensoren en "Codes voor dit model" staan nu in groepen:
 📊 voor weergave (op toegevoegde waarde: accustroom, laadtoestand,
 olie- en ATF-temperatuur bovenaan), 🔬 voor analyse (sensorspanningen,
 regelsignalen, tellers, wielsnelheden), ♻️ dubbel (ingeklapt) en
 ✗ werkt niet (ingeklapt). Dubbel = 22F4xx (spiegel van 01xx) of een
 bekende tweeling, en alleen als de auto die standaard-PID ook geeft.

 ═══════════════════════════════════════════════════════════
 15-10-2026 — Codes uit OBDb in plaats van een AI-zoektocht (#526)
 ═══════════════════════════════════════════════════════════
 Sensoren → "Zoek codes in OBDb" haalt het bestand van de open
 database (CC BY-SA 4.0) op: gratis, met bron. De AI-zoektocht met
 web_search en "Dieper zoeken" zijn weg. De Worker laat alleen nog
 Sonnet 5 en Haiku 4.5 door, geen tools en geen onbekende velden.
 Calls van personeel, de beheerder en "tegoed uit" krijgen een
 kasboekregel "ai-verbruik" (Credits 0), zodat hun verbruik te zien is.

 ═══════════════════════════════════════════════════════════
 15-10-2026 — Grote AI-call: getal overtypen; afboekregel klopt (#524)
 ═══════════════════════════════════════════════════════════
 Een analyse boven 10 tokens vraagt het getal over te typen, ook met
 "niet meer vragen" aan en ook voor de beheerder (die betaalt de
 rekening). De logregel "Tegoed afgeboekt" komt nu ná het serversaldo
 en noemt de analyse; het kasboek zet die in Details (pl_rol, de
 Worker haalt het van de payload af vóór Anthropic).

 ═══════════════════════════════════════════════════════════
 15-10-2026 — Rondgang: pagina's vertellen een verhaal, met "wat dit zegt"
 ═══════════════════════════════════════════════════════════
 Na de demo-screenshots: pagina's waren lijsten per soort, een losse
 staaf of boog werd half leeg, abs. belasting stond op 0–400 % naast
 belasting op 0–100 %, en de eerste pagina was één "—". Nu per pagina
 een keten: pedaal → gasklep → belasting (eerste pagina), inlaatdruk
 tegen buitendruk, mengsel = lambda gevraagd/gemeten + trims, sondes
 vóór/ná met de katalysator, accu en laden. Gedeelde schaal per paneel
 (lo/hi), korte labels, losse meter wordt rij. Onder de titel één regel
 uit de live waarden (duiding(): belasting, turbo/vacuüm, trims,
 opwarmen, dynamo, katalysator); geen uitspraak als het niet klopt.

 ═══════════════════════════════════════════════════════════
 15-10-2026 — Rondgang: meer pagina's per categorie, verwante sensoren samen
 ═══════════════════════════════════════════════════════════
 Motor en rijden toonde drie of vier sensoren. Een categorie heeft nu
 één of meer pagina's (DIAS met cat, CATS): Motor in Vermogen en koppel
 (gevraagd/werkelijk/vrijloop/wrijving), Gas en belasting (pedaal en
 gasklep elk een tellerplaat) en Ontsteking en looptijd; Temperaturen
 met katalysatoren en uitlaatgas; Brandstof met druk en tank; Uitlaat
 met sondes per bank en EGR/roetfilter/AdBlue. Vinkje per categorie.
 Staan er sensoren uit, dan zegt een knop onderaan de pagina dat.

 ═══════════════════════════════════════════════════════════
 15-10-2026 — Rondgang: compacte kop, een eigen weergave per categorie
 ═══════════════════════════════════════════════════════════
 Na de eerste rit: de balk boven de dia was te groot en de categorieën
 waren losse tegels. Nu staan snelheid en toerental klein op één regel
 met ⏸ en ⚙ en een afteller van 2 px; ‹ ›, de puntjes en de knop Mijn
 dashboard zijn weg (vegen of tik op de titel; Mijn dashboard zit in ⚙).
 Per categorie panelen: gaspad als tellerplaat, trims en lambda vanuit
 het midden, verbruik en luchtmassa groot met lijn, lambdasondes met de
 0,45 V-lijn, laaddruk en inlaatdruk als boog, de rest als rij met band.
 PLRond tekent zelf (bouw/bij); PLDash geeft alleen door.

 ═══════════════════════════════════════════════════════════
 15-10-2026 — Slim als rondgang langs de categorieën
 ═══════════════════════════════════════════════════════════
 Slim opent nu als rondgang (pidlane-rondgang.js, PLRond): elke 10 s
 een andere categorie — motor, temperaturen, brandstof en trims, lucht
 en turbo, uitlaat, elektrisch — met snelheid en toerental vast boven-
 aan. ‹ › en vegen, ⏸/▶, ⚙ voor wisseltijd (5–30 s) en vinkjes per
 categorie, ook via Mijn voorkeuren → Rondgang in Slim. Een rode waarde
 haalt zijn categorie in beeld en houdt die vast. De sensoren van de
 andere dia's: hun snelle sensoren gaan op de bus naar 2 s, net als bij
 Visueel (PLRond.remt in pidPollInterval).
 Een dia toont wat aan staat; de rondgang zet zelf alleen de kop aan.
 Wat ontbreekt zet ⚙ → "Zet ze aan" aan, zodat de vaste selectie uit
 Mijn voertuigen niet stil overschreven wordt.
 Mijn dashboard blijft één tik weg. Pauze wordt niet onthouden.

 ═══════════════════════════════════════════════════════════
 15-10-2026 — Tabblad Kenteken in Mijn voertuigen, Admin-menu korter
 ═══════════════════════════════════════════════════════════
 De kenteken-check van "Niet in de auto?" (APK, verzekering, terugroep-
 acties, milieuklasse, kosten, onderhoudsschema, adapter) was weg zodra
 de adapter verbonden was. Nu staat hij ook als tabblad Kenteken bij elk
 voertuig met een kenteken, verbonden of niet (PLZonder.checkHtml).
 Uit het Admin-menu: Nieuwste versie laden (staat op het inlogscherm),
 Mode 06 — monitortests, SPP-controle en Snelheidsproef. De modules
 blijven; PLM06.open(), PLSppProef.controle() en PLSnelProef.open()
 openen ze nog.

 ═══════════════════════════════════════════════════════════
 15-10-2026 — Sensoren per voertuig: geen dubbele lijst meer
 ═══════════════════════════════════════════════════════════
 Een code uit "Codes voor dit model" stond na toevoegen twee keer: bij
 de eigen sensoren mét vinkje, in de bibliotheek zonder. Nu staat hij
 alleen bij de eigen sensoren, met de stand (werkt bij N) erbij; ▶ Test
 telt daar als stem. De bibliotheek toont alleen wat nog te proberen
 is, wat het vaakst werkt bovenaan. Berekende sensoren: wat aan staat
 bovenaan, de rest onder "Meer berekende sensoren".

 ═══════════════════════════════════════════════════════════
 15-10-2026 — Mode 06 volgens J1979, foutcodes met tekst
 ═══════════════════════════════════════════════════════════
 Uit de Mazda-rit. Mode 06: de MID-namen volgen J1979 (0x35 is de
 kleptiming, geen "EGR bank 5"), het teken van een onbekende schaal
 volgt uit de grenzen (−32768 – 1500 in plaats van 32768 – 1500), en
 het onderzoek leest dezelfde tabel: een VVT- of EVAP-test weegt niet
 meer als EGR (#515). Foutcodes: 101 generieke codes met een tekst in
 DTC_OMSCHRIJVING (P0421, P2096, P0524, P2119, ABS- en netwerkcodes),
 en een code die nergens staat zegt wat zijn opbouw zegt
 ("fabrikantspecifiek, aandrijving: brandstof en lucht").
 De uitlezing van alle stuurapparaten en een losse mode 06-uitlezing
 staan in Rapporten, en Bewaren in Check mijn auto neemt de
 stuurapparaten mee als ze in dezelfde zit gelezen zijn.

 ═══════════════════════════════════════════════════════════
 15-10-2026 — Mode 06- en stuurapparatenpaneel liggen bovenop
 ═══════════════════════════════════════════════════════════
 Uit de eerste rit: het mode 06-paneel (z-index 9000) lag onder de
 topbalk en de onderbalk, en Sluiten van het stuurapparatenpaneel viel
 achter de systeembalk. Beide zijn nu een venster over alles heen
 (--z-modal-hoog, veilige randen), tik naast het venster sluit.
 De mode 06-tabel heeft drie kolommen in plaats van vijf (test-ID
 onder de monitor, grens onder de waarde): op 360 px viel Oordeel
 buiten beeld.
 Daarnaast telt UDS alleen nog foutbits: een Mazda CX-5 gaf elf
 codes met alleen "test niet gedraaid" — geen fouten.

 ═══════════════════════════════════════════════════════════
 15-10-2026 — UDS 0x19: foutcodes van alle stuurapparaten
 ═══════════════════════════════════════════════════════════
 Mode 03 vraagt functioneel, en daar antwoorden alleen motor en bak.
 Nieuw: pidlane-uds.js (PLUds) vraagt 19 02 FF per adres (7E0–7E2,
 760/7B0 ABS, 720 instrumenten, 726 BCM, 737/715 airbag, 730 stuur-
 bekrachtiging) en zet de adapter in een finally terug op 7DF. Knop
 "🧩 Alle stuurapparaten" onder een uitlezing in Check mijn auto. Een
 stil adres heet nooit "geen codes". Welke adressen per merk
 antwoorden is nog een vraag voor een rit.

 ═══════════════════════════════════════════════════════════
 15-10-2026 — Mode 06: de zelftests zelf in beeld
 ═══════════════════════════════════════════════════════════
 PLM06.render() bestond maar werd nergens aangeroepen: het onderzoek
 gebruikte mode 06 alleen als bewijs. Nu staat onder de conclusie
 "🔬 Alle zelftests (mode 06)" met de hele tabel, en het bewaarde
 rapport heeft een blok MONITORTESTS (gezakt bovenaan, zelfde volgorde
 als de tabel). In het Admin-menu leest "🔬 Mode 06 — monitortests"
 de tests direct, zonder onderzoek eromheen.

 ═══════════════════════════════════════════════════════════
 15-10-2026 — Live opnieuw ingedeeld, vegen in Visueel, alarmvraag weg
 ═══════════════════════════════════════════════════════════
 Uit het gebruik, vijf schermafdrukken. De tabbalk boven het midden is
 weg: Live stond al in de onderbalk, Grafiek is een vierde vak in de
 weergaverij (Overzicht · Slim · Visueel · Grafiek) en die rij staat nu
 boven het paneel, en Sensoren staat rechts in de topbalk; de statuschip
 schuift naar links. In Visueel is de strook met stipjes en "Volgende"
 weg: vegen over de meter wisselt (links = volgende, rechts = vorige),
 de naam komt kort als melding. "Overige sensoren staan in Slim" is weg,
 en Deel live en Meekijken staan niet meer onder de meters — ze zitten
 op Mijn auto bij Rit starten. De herinneringen plannen niet meer exact
 (isExactNotification:false): de plugin opende anders bij elke start
 "Alarmen en herinneringen" met een grijze schakelaar, want die
 machtiging halen we bewust uit het manifest.

 Na de testronde: Sensoren staat toch links en de statuschip rechts,
 zoals op elk ander scherm. De rit-monitor is weer te starten met de
 recorder en waakronde aan (twee lopende taken tegelijk, rit-monitor en
 caravanrit blijven elkaars alternatief). "Eigen" in Sensoren sluit eerst
 de lade, anders opende Mijn voertuigen erachter; de doelknoppen zijn
 kleiner. Telemetrie zegt Lengte en Zij in plaats van Lengte-G en Zij-G.
 De onderbalk zegt Home in plaats van Mijn auto: hij opent het
 startscherm, niet Mijn voertuigen. De knop in het foutcode-tabblad doet
 nu de volledige check (07, 0A, keuringsstatus per systeem). Een
 mislukte protocoldetectie toont "contact uit" als oranje kaart bovenaan.

 ═══════════════════════════════════════════════════════════
 14-10-2026 — Contact uit: meetopdracht telt alleen de stilte (#487)
 ═══════════════════════════════════════════════════════════
 De rit van 14-10 gaf BEVINDING op verbind-weigeringen = 27 en
 verbind-st-stappen = 2, met een band van 0–0. Beide tellen de hele
 verbinding (opstarten, wissels naar Google Maps), terwijl de twee
 stiltes in het logboek schoon verliepen. Nieuwe app-maten in PLContact:
 contact-stiltes, contact-terug-anders (groep, multi-PID, pollbudget of
 ATST anders dan vóór de stilte) en contact-weigeringen (alleen binnen
 de stilte). Opdracht #39 in D1 gebruikt die nu.

 ═══════════════════════════════════════════════════════════
 14-10-2026 — CI sneller: tegenproef in vier delen, browserproeven parallel
 ═══════════════════════════════════════════════════════════

 - De tegenproef (14 min op één runner) draait als matrix van vier delen:
   `plmutate.sh --deel K/N` verdeelt browser- en node-mutaties elk om en om.
   De verplichte check `tegenproef (...)` wacht op alle vier (`needs` +
   `if: always()`), dus de ruleset hoeft niet mee.
 - `plbrowser.sh --parallel N` (standaard kernen, max 4): 49 proeven in
   ~2,5 min in plaats van 8,5. Uitvoer blijft in bestandsvolgorde.
 - test-testgate.js kent hulpjobs; één mutatie erbij.

 ═══════════════════════════════════════════════════════════
 14-10-2026 — Rijmodus: het advies van de monitor naast de kaart
 ═══════════════════════════════════════════════════════════

 - pidlane-rijmodus.js (PLRijmodus): een keuze in Meer → Mijn voorkeuren,
   standaard uit. Voor split-screen naast Maps; de app raadt niet zelf.
 - Bovenaan een strook: koelwater, toerental, accu als balkje, motorstatus.
 - De rest is advies in beeld van de monitor die loopt. Caravan: radertje
   (op/terug schakelen), snelheidsboog met doelstreepje, verbruiksbalk tegen
   de richtwaarde, terrein, laatste tip. Rit-monitor: een stip per test
   (grijs nog niet, groen getoetst, oranje iets gezien) met de namen.
 - Eén banner met de laatste luide melding. Buiten de harde limiet grijs
   '?', geen rood. Schrijft alleen bij verandering. Scherm aan zolang aan
   én verbonden. Manifest: resizeableActivity, geen vaste oriëntatie.
 - Caravan: schakel- en verbruiksoordeel als eigen functies (gedrag gelijk).
 - test-rijmodus.js, bproef-rijmodus.js, vijftien mutaties, blok 5.

 ═══════════════════════════════════════════════════════════
 14-10-2026 — Onderzoek: brandstofdruk en breedbandsonde als stap (#428)
 ═══════════════════════════════════════════════════════════

 - Raildruk (0123/0159, of 010A bij een oudere injectiemotor): stationair
   tegen 2500 tpm. Zakt hij meer dan 15 %, dan is de toevoer verdacht;
   houdt hij stand, dan valt brandstofdruk af. 010A onder 200 kPa is laag.
 - Breedbandsonde (0124/0134, met 0144 als doel): staat hij stil, of ziet
   hij de brandstofafsluiting bij gas loslaten? En arm of rijk stationair.
 - Een stap telt alleen als de auto de PID levert (`nodig`), niet omdat
   hij toeren geeft. Drempels voorlopig, net als bij mode 06.
 - test-onderzoek.js 6b, vier mutaties, blok 5.

 ═══════════════════════════════════════════════════════════
 14-10-2026 — Software als oorzaak: het logboek zegt wat vervangen is (#426)
 ═══════════════════════════════════════════════════════════

 - Beurt toevoegen heeft "Ander werk": gasklep, injector, katalysator,
   lambdasonde, luchtmassameter, roetfilter, EGR-klep, ECU. Een beurt
   met alleen ander werk mag; de Worker keurt dezelfde lijst.
 - plVervangenRecent(): wat de laatste 90 dagen in het logboek van het
   actieve voertuig staat (accu en ander werk). Foutcodes, de
   onderdeelcheck en het onderzoek geven het aan softwareOorzaken();
   in het onderzoek staan die chips al aan.
 - Daarmee kunnen de zwakke oorzaken (adaptaties, gasklep, injector, EGR,
   accu) eindelijk verschijnen.
 - Tests in test-conditie, test-softwareoorzaak en test-klantplatform,
   vijf mutaties, blok 5, handleiding.

 ═══════════════════════════════════════════════════════════
 13-10-2026 — Tankbeurten: samenvatting per tankcyclus (#469 stap 3)
 ═══════════════════════════════════════════════════════════

 - Bij elke tankbeurt: ritten, rijtijd, gemiddelde snelheid en verbruik
   volgens de app over de cyclus die daar eindigt.
 - Vol tot vol: hoeveel liter de app mat tegenover wat er getankt is.
   Alleen als elke rit liters heeft en de km kloppen; anders weg.
 - Dezelfde kolommen in de CSV, vóór de notitie.
 - test-tank.js deel 9, vier mutaties, blok 5, handleiding.

 ═══════════════════════════════════════════════════════════
 13-10-2026 — Onderzoek leest mode 06: missers per cilinder (#428)
 ═══════════════════════════════════════════════════════════

 - Nieuwe stap "Zelftests per cilinder en katalysator", na de foutcodes.
   Eén cilinder die duidelijk vaker overslaat dan de rest bevestigt een
   ontstekingsprobleem op die cilinder, ook zonder foutcode; missers over
   alle cilinders wijzen naar mengsel of brandstof.
 - Zelftests van katalysator, sondes, EGR en missers: buiten de grens
   bevestigt, krap is een aanwijzing, ruim binnen sluit uit. Een telling
   op 0 is niet krap. Onbekende schaal telt niet mee.
 - Drempels (10 missers, 3× de rest) zijn voorlopig: te toetsen op echte
   uitlezingen. In de demo wordt de stap overgeslagen.
 - test-onderzoek.js deel 10, vier mutaties, blok 5, handleiding.

 ═══════════════════════════════════════════════════════════
 13-10-2026 — Eén meetscherm: het oude is weg (#452)
 ═══════════════════════════════════════════════════════════

 - Systeemtest en Welk onderdeel uit het wizardplan meten nu in het
   verzamelscherm, met "Verder" in plaats van een AI-knop. Na een rijtest
   begint dezelfde module opnieuw, met de rit als meting.
 - Daarmee leunde niets meer op het oude meetscherm ("Sensoren
   registreren", "Gebruik de meting van zojuist"): plVraagMeting,
   plRegistreer, plKernTeMager en plMeetPoortVraag zijn weg.
 - bproef-verzamel.js stap 10, twee mutaties erbij, blok 5.

 ═══════════════════════════════════════════════════════════
 14-10-2026 — Foutcodes: kostenindicatie en controleplan (#503)
 ═══════════════════════════════════════════════════════════

 - Onder elke foutcode in Check mijn auto een ingeklapt blok 💶: een
   bandbreedte in euro, zelf of garage, en 2–5 controles, goedkoopste eerst.
   Open in de garagemodus. Ook een regel per code in het voertuigdossier.
 - Zonder AI en zonder tegoed: DTC_PLAN per codefamilie in pidlane-data.js,
   dtcPlan() kiest het langste voorvoegsel; merkcodes krijgen bewust niets.

 ═══════════════════════════════════════════════════════════
 14-10-2026 — Toestemming Mijn voertuigen meteen na inloggen
 ═══════════════════════════════════════════════════════════

 - Zonder akkoord opent het toestemmingsvenster nu direct na het inloggen,
   niet pas als je zelf Mijn voertuigen opent. Tot dan herkende de app de
   auto niet en zette ze de vaste sensoren en displays niet aan.
 - "Nu niet" geldt per account en tekstversie; een nieuwe tekst vraagt opnieuw.

 ═══════════════════════════════════════════════════════════
 14-10-2026 — Lampjesgids: een foto van het dashboard laten herkennen (#492)
 ═══════════════════════════════════════════════════════════

 - "Foto van het dashboard" in de lampjesgids: verkleind tot 800 px, als
   afbeelding naar de AI (apiFetch extra.afbeelding), die uit de gids kiest;
   de gids opent op wat herkend is. Alleen met tegoed, niet in de demo.
 - De eerste keer apart toestemming; de privacyverklaring noemt de foto.

 ═══════════════════════════════════════════════════════════
 14-10-2026 — Onderhoudsschema per model via de AI (#490)
 ═══════════════════════════════════════════════════════════

 - Onder de kenteken-check: "Bekijk het schema". De AI geeft per onderdeel
   van de conditiescore het interval voor dit model, gelabeld als niet
   geverifieerd; alleen met tegoed, lokaal bewaard per motor en bouwjaar.
 - Het olie-interval is over te nemen in Mijn voertuigen (PLGarage.zetInterval).

 ═══════════════════════════════════════════════════════════
 14-10-2026 — Bekende kwalen per motor en bouwjaar (#491)
 ═══════════════════════════════════════════════════════════

 - Een zwak punt in AUTO_KENNIS kan een cilinderinhoud, bouwjaren en een
   motorcode dragen; autoKennisVoorMerk() filtert daarop als ze bekend zijn,
   anders staat er "(bij sommige motoren)" achter.
 - PLWeten geeft cilinderinhoud en bouwjaar uit het RDW mee, de autoexpert
   het bouwjaar. De 1.2 PureTech heeft een riem in olie, geen ketting.

 ═══════════════════════════════════════════════════════════
 14-10-2026 — Lampjesgids: echte dashboardsymbolen, plus handrem en service (#495)
 ═══════════════════════════════════════════════════════════

 - Elk lampje een zelfgetekend pictogram in ISO 2575-stijl (inline SVG) in
   de kleur van het lampje op een donker vlak, in plaats van een emoji.
 - Nieuw: Handrem (parkeerrem) en Servicebeurt; nu 27 lampjes.

 ═══════════════════════════════════════════════════════════
 14-10-2026 — Melding bij een nieuwe terugroepactie (#493)
 ═══════════════════════════════════════════════════════════

 - Met herinneringen aan zoekt de app één keer per dag bij het openen de
   terugroepacties op voor de eigen auto en alle actieve voertuigen, en
   meldt een nieuwe open actie (Android-melding, anders in de app).
 - De eerste keer per kenteken is stil; een mislukte RDW-opzoeking telt
   niet en wordt de volgende keer herhaald.

 ═══════════════════════════════════════════════════════════
 13-10-2026 — Conditiescore per voertuig (#475)
 ═══════════════════════════════════════════════════════════

 - Nieuw, per voertuig aan te zetten (Profiel → Conditiescore bijhouden,
   standaard uit): een tabblad Conditie met één score uit het onderhoud en
   uit de ritten, met deelscores Onderhoud, Motor, Brandstof en Accu.
 - De auto wordt met zichzelf vergeleken: trim bij warme motor, verbruik op
   vergelijkbare ritten, onrust stationair, opwarmtijd, vervroeging en
   raildruk bij belasting, laadspanning, misfires uit een eigen mode 06-scan.
   Eerst tien ritten van minstens 3 km; daarvoor alleen het onderhoud.
 - Eén keer de laatste beurt invullen; het logboek groeit alleen als je
   dat zelf wilt. Voor/na een beurt, meerverbruik in euro's per jaar, een
   olie-interval naar rijpatroon, een gezondheidspaspoort (PDF) en één
   melding als de score duidelijk zakt.
 - De ritten verzamelen de kenmerken altijd. Daarom een nieuwe
   toestemmingstekst (akkoordversie 2026-10-13): klanten bevestigen opnieuw.

 ═══════════════════════════════════════════════════════════
 13-10-2026 — Milieuzones: alleen de milieuklasse, met een link (#485)
 ═══════════════════════════════════════════════════════════

 - Geen zonetabel per stad meer: die regels verschillen per gemeente en
   veranderen te vaak. De kenteken-check toont brandstof en emissieklasse
   (met "geschat" als het RDW hem niet geeft) en linkt naar milieuzones.nl.

 ═══════════════════════════════════════════════════════════
 13-10-2026 — Contact uit is geen storing (#487)
 ═══════════════════════════════════════════════════════════

 - Motor uit op de bestemming: de ECU zwijgt, de adapter niet. De app las
   dat als een slechte bus (groep 3→1, multi-PID uit, ATST omhoog,
   pollbudget omlaag) en begon daarna trager.
 - Nu: na zes stille antwoorden over ≥ 1 s gaat de busstand van vóór de
   stilte terug, pauzeren de bijstellers en vraagt de app elke 2 s alleen
   het toerental. Melding "Contact uit — meting gepauzeerd", of "storing"
   als de auto nog reed. Beide ook naar de serverlog (type `contact`).
 - Nieuw: pidlane-contact.js (PLContact), test-contact.js, blok 5.

 ═══════════════════════════════════════════════════════════
 13-10-2026 — Zonder adapter: zones, kosten, klachtenwijzer, adapter (#485)
 ═══════════════════════════════════════════════════════════

 - Onder de kenteken-check: milieuzones voor diesels (Amsterdam, Utrecht,
   Den Haag, Arnhem), kosten per maand (wegenbelasting als indicatie plus
   brandstof) en of er een adapter past (OBD-plicht, CAN, WiFi werkt niet).
 - "Er is iets mis" op de kaart: de klachtenwijzer op de kern van
   PLOnderzoek, met alleen vragen zonder sensor, en wat een adapter meet.
 - Nieuw: pidlane-wijzer.js (PLWijzer), test-wijzer.js, blok 5.

 ═══════════════════════════════════════════════════════════
 13-10-2026 — Tankbeurten aan/uit per voertuig en tanken herkennen (#469)
 ═══════════════════════════════════════════════════════════

 - Tankbeurten bijhouden staat per voertuig in het Profiel, standaard uit.
   Uit: geen tabblad, geen vraag, geen export. Bewaarde beurten blijven.
 - Aan: na een sprong van ≥ 15 procentpunt in het brandstofpeil bij
   stilstand vraagt de app "Getankt?" en vult het formulier met het peil
   en zijn eigen bereikschatting (CA09).
 - Per tankcyclus de ritten als CSV, en de ritten sinds de laatste beurt.

 ═══════════════════════════════════════════════════════════
 13-10-2026 — Registreren weer direct op het inlogscherm
 ═══════════════════════════════════════════════════════════

 - "Nog geen account? Gratis aanmaken" staat niet meer achter Geavanceerd,
   en is een omlijnd vak in plaats van een kleine link.

 ═══════════════════════════════════════════════════════════
 13-10-2026 — Een diesel-hybride blijft een diesel (#430)
 ═══════════════════════════════════════════════════════════

 - RDW "Diesel + Elektriciteit" bewaart de diesel apart (vehicleInfo.
   verbranding): DPF- en AdBlue-sensoren blijven, de systeemtest geeft de
   dieseltests. Zonder RDW telt 0151 = 0x13 ook als diesel.
 - "Laat de motor stationair draaien" krijgt bij een hybride de uitleg erbij:
   kachel op vol, anders de onderhoudsmodus van het merk.

 ═══════════════════════════════════════════════════════════
 13-10-2026 — Afwijkend pas na echte ritten, % op de boog, stille adapter (#473, #472, #476)
 ═══════════════════════════════════════════════════════════

 - "Afwijkend t.o.v. normaal": pas na vijf ritten van ≥ 10 min (≥ 5 min
   gereden), oordeel pas na 10 min, nooit over snelheid, toerental, gas- of
   rempedaal. Oudere sessies tellen niet meer mee.
 - Een eigen sensor in % zonder bereik loopt van 0 tot 100 en kan op een
   boog; wie zonder schaal afvalt staat onderaan de boogkeuze met de reden.
 - Zwijgt de adapter op 0100 én ATI: "Adapter reageert niet" met Opnieuw
   verbinden, in plaats van een protocolkeuze.
 - Voertuig toevoegen vult het kenteken van de verbinding al in.

 ═══════════════════════════════════════════════════════════
 13-10-2026 — Knop "Eigen" in de sensorkeuzelijst (#474)
 ═══════════════════════════════════════════════════════════

 - Naast Diep zoeken: opent Mijn voertuigen meteen op Sensoren van het
   voertuig aan de adapter. Alleen voor wie Mijn voertuigen heeft.

 ═══════════════════════════════════════════════════════════
 13-10-2026 — De bulk-recorder is voor iedereen (#478)
 ═══════════════════════════════════════════════════════════

 - De kaart in Live data, de snelkoppeling onder de meter van Visueel en
   het recordervenster zelf vragen geen ontwikkelaarsvlag meer. De opname
   blijft op het toestel; er gaat niets naar de Worker.

 ═══════════════════════════════════════════════════════════
 13-10-2026 — Nieuwe klant geeft weer een mail aan Support (#477)
 ═══════════════════════════════════════════════════════════

 - Bij zelfregistratie zet de Worker een rij (Email, Naam, merk in
   Opmerking) in Airtable Klanten; de bestaande automatisering mailt weer.
 - De cron wist die meldingen na twee dagen. Test: `test-klantmelding.js`.

 ═══════════════════════════════════════════════════════════
 10-10-2026 — Helling en kanteling worden na 2 s weer helder, niet na 5 s
 ═══════════════════════════════════════════════════════════

 - De rusttijd na wiebelen of verschuiven gaat van 5 naar 2 s. Het oordeel
   over wiebelen zelf (1 s binnen 3 s boven 8°/s) blijft, anders telt een
   telefoon op schoot weer mee.

 ═══════════════════════════════════════════════════════════
 10-10-2026 — Tankbeurten: beloofd bereik tegenover echt gereden (#469, stap 1)
 ═══════════════════════════════════════════════════════════

 - Mijn voertuigen → tabblad Tankbeurten. De klant vult in wat hij weet:
   liters, literprijs of bedrag, km-stand, vol of niet, en het bereik op
   het dashboard vóór en ná tanken. Nieuwe tabel kp_tank in D1, gaat mee
   met voertuig verwijderen en alles wissen; een afgelezen km-stand gaat
   het profiel in (nooit omlaag).
 - Per cyclus: km gereden tegenover het opgemaakte beloofde bereik, en het
   echte verbruik met de volle-tankmethode. CSV met BOM voor Excel.
 - Nieuwe verwerking, dus een nieuwe akkoordtekst (KP_AKKOORD_VERSIE
   2026-10-10): klanten bevestigen opnieuw.
 - Nieuw: pidlane-tank.js (PLTank). Tests: test-tank.js, test-klantplatform.js
   deel 4a; tien mutaties.

 ═══════════════════════════════════════════════════════════
 10-10-2026 — Mijn voertuigen ook voor beheer, voor de eigen auto's
 ═══════════════════════════════════════════════════════════

 - Een beheerder ziet Meer → Mijn voertuigen, met een eigen ruimte op de
   server (kpKlantId("beheer:" + naam)): eigen auto's, rapporten, ritten en
   herkenning bij verbinden, los van elke klant. Een monteur niet.
 - Wisselt de gebruiker zonder uit te loggen (beheer → klant), dan wordt
   de stand van de vorige weggegooid.
 - Tests: test-klantplatform.js deel 4b, bproef-garage.js; vier mutaties.

 ═══════════════════════════════════════════════════════════
 10-10-2026 — Meekijken: beheer ziet met een code van de klant zijn voertuigen
 ═══════════════════════════════════════════════════════════

 - Mijn voertuigen: "Laat PidLane meekijken" maakt een code van zes tekens,
   zeven dagen geldig, intrekbaar. De klant ziet hoe vaak er gekeken is en
   hoeveel sensoren PidLane toevoegde. Alles wissen haalt de code mee weg.
 - Beheer: Meer → Admin → "Voertuigen van een klant". Met de code: de
   voertuigen, open punten en eigen sensoren, en "Sensor toevoegen". Een
   sensor die er al staat wordt geweigerd: wijzigen en verwijderen blijven
   bij de klant. Zonder geldige code ziet beheer niets.
 - Server: kp_meekijk, acties meekijk / meekijk_aan / meekijk_uit, POST
   /admin/meekijk (alleen sessie met rol admin). privacy.html en handleiding
   bijgewerkt; de akkoordversie blijft gelijk (het gebeurt alleen op een
   handeling van de klant zelf).
 - Tests: test-meekijk.js, bproef-meekijk.js (nieuw); acht mutaties.

 ═══════════════════════════════════════════════════════════
 10-10-2026 — Inlogscherm, Check mijn auto en het menu Meer opgeruimd
 ═══════════════════════════════════════════════════════════

 - Inlogscherm: alleen de velden, Wachtwoord vergeten, Inloggen en de
   demoknop. Account aanmaken, versie, website, handleiding en "Nieuwste
   versie laden" staan achter "Geavanceerd" naast Wachtwoord vergeten.
   De demoknop blijft zichtbaar (Play-reviewnotitie).
 - Check mijn auto: zelf getikt en alles groen → na 5 s vanzelf terug naar
   het hoofdscherm. "Let op" blijft staan; een tik of "Blijf hier" stopt het.
 - Meer: Garagemodus, Check na verbinden, Uitleg bij knoppen, Tekstgrootte
   en Privacy staan in Mijn voorkeuren, blok "Op dit toestel" (ook voor
   beheerders). De Versnellingsindicator staat alleen nog in Mijn voertuigen.
 - Tests: bproef-inlogscherm.js (nieuw), bproef-foutcodes.js,
   bproef-voorkeur.js, test-foutcodes.js; zes mutaties; handleiding bij.

 ═══════════════════════════════════════════════════════════
 09-10-2026 — Testrun 9.2: de helling van de telefoon in caravanrit en ritanalyse (#463)
 ═══════════════════════════════════════════════════════════

 - Caravanrit: klim / afdaling / vlak komt uit de helling (TL01) zodra de
   telefoon vast in de houder zit (`PLTelemetrie.hellingVast()`), drempel
   2,5° en alleen bij vrijwel constante snelheid. Anders de oude
   motorregel. Zware belasting op vlakke weg is daarmee geen klim meer.
 - Het label toont de gemeten hoek; het rapport en de AI-vraag zeggen of de
   terreinverdeling gemeten of geschat was, plus min/gem/max van de helling.
 - Ritanalyse: elke fase neemt de helling mee (ook zonder tegel); de
   faseduiding zegt bergop / bergaf / heuvelachtig.
 - Tests: test-helling.js (nieuw), test-telemetrie.js; zes mutaties;
   blok 5-proef #463; CAMPAGNE 9.2; handleiding Telemetrie bijgewerkt.

 ═══════════════════════════════════════════════════════════
 09-10-2026 — Testrun 9.1: het onderzoek toetst wat bij het merk bekend is
 ═══════════════════════════════════════════════════════════

 - Volledig onderzoek: de bekende zwakke punten uit AUTO_KENNIS worden
   verdenkingen ("bekend bij dit merk") en hun stappen gaan voor. Kennis
   is geen bewijs: de score blijft 0 tot er gemeten of gevraagd is.
 - Nieuwe verdenkingen: distributie (ketting/nokkenasverstelling) en
   versnellingsbak (DSG/PowerShift), met foutcoderegels P0008/9,
   P0010–P0025, P07xx en twee vragen: ratel bij koude start, schakelgedrag.
 - Bij een klacht alleen de kennis die erbij past. Het rapport heeft een
   blok "BEKEND BIJ DIT MERK" met per punt de uitkomst, wat niet bij de
   klacht paste, en wat je zelf moet nakijken.
 - Blok 5: twee proeven (merkkennis, registreren zonder profiel); CAMPAGNE
   9.1; handleiding Volledig onderzoek bijgewerkt.

 ═══════════════════════════════════════════════════════════
 09-10-2026 — Wizard: "Sensoren registreren" wacht niet meer op sensoren die uit staan
 ═══════════════════════════════════════════════════════════

 - Gemeld met een schermafdruk: "7 van 12 klaar", en motorbelasting,
   inlaattemp, beide brandstoftrims en gaspedaal bleven op 0 staan.
 - Oorzaak: start() in de wizard gaf `job.profiel` mee, en dat veld
   bestaat niet; de poort kreeg dus `false` en zette geen sensoren aan.
   De kernfase viel daarna wél terug op het profiel van een vórige
   analyse en wachtte op sensoren die niemand had aangezet.
 - Nu: zonder profiel géén kernfase (zoals PLVerzamel al deed), en de
   wizard geeft het profiel van de eerste module mee (MODULE_PROFIEL),
   net als draai() al deed.
 - test-driefasen.js toetst het geval met een oud `_laatstProfiel`;
   mutatie in plmutate.sh.

 ═══════════════════════════════════════════════════════════
 09-10-2026 — Testrun 9.0: eerst weten, dan invullen, dan meten; AI-stip niet meer vals rood
 ═══════════════════════════════════════════════════════════

 - Nieuw: pidlane-weten.js (PLWeten), de kaart "Wat we al weten" bovenaan
   elke wizardtak: RDW, terugroepacties, dossier, laatste foutcodes,
   merkkennis, en voor een koper proefrittips en een regel over
   schadehistorie. "Meer over dit model" vraagt de AI, alleen op een tik.
 - Kopen: rol → kenteken → wat we weten → gegevens → tijd (met advies) →
   plan. Kenteken, km, prijs, laatste beurt en ritduur staan daarna al in
   de koopcheck; een proefrit uit het plan komt terug in het koopoordeel.
   "Vraagprijz" → "Vraagprijs".
 - Diepe storingsanalyse vraagt geen merk en model als de app ze kent.
 - AI-stip: rood pas na twee mislukte pings op rij, terug op groen bij elk
   proxy-antwoord, opnieuw meten bij online en terug in beeld, reden in het
   logboek.
 - Handleiding bijgewerkt. test-weten.js (33), test-aibereik.js (17),
   test-wizardtakken.js +14, bproef-koopstroom.js (36), drie blok 5-proeven,
   veertien mutaties.

 ═══════════════════════════════════════════════════════════
 09-10-2026 — Software als oorzaak ook in Welk onderdeel, en met de VIN-controle (#426)
 ═══════════════════════════════════════════════════════════

 - Welk onderdeel? toont "🧩 Mogelijk software, geen kapot onderdeel" met
   de codes van het paneel en de laatste uitlezing van Check mijn auto.
 - Vond de km-check verschillende VIN's in de stuurapparaten van déze auto,
   dan wijzen Check mijn auto, het onderzoek en Welk onderdeel naar de
   ECU-codering (PLKm.vinAfwijkend, plVinAfwijkend).
 - Handleiding bijgewerkt. test-onderdeel.js +5, test-softwareoorzaak.js +4,
   drie mutaties.

 ═══════════════════════════════════════════════════════════
 09-10-2026 — Testrun 8.9: rendement vanaf 5 kW, een diagnose is geen knipperen (#457)
 ═══════════════════════════════════════════════════════════

 - CA10 (rendement) rekent pas vanaf 5 kW. Stationair en bij gas los gaf
   hij tot 99 %. Blijft hij FOUT, dan noemt blok 5 de bronwaarden van het
   hoogste punt. test-berekend.js +4, twee mutaties.
 - Slim visueel: een herbouw in de tik door een nieuwe sensorkeuze telt als
   selectie, niet als knipperen. test-visueel.js +2, één mutatie.

 ═══════════════════════════════════════════════════════════
 09-10-2026 — Testrun 8.8: vier FOUT-regels over zichzelf weg, een opgeruimde lade
 ═══════════════════════════════════════════════════════════

 - De PID-sweep (blok 3) vraagt geen berekende waarden en telefoonsensoren
   meer aan de adapter (_sweepLijst, test-sweeplijst.js, twee mutaties).
 - Slim visueel: de proef telt zes weergaven, met telemetrie.
 - Een vaste sensor die de PID-poort opruimde is LET OP en geen FOUT
   (selectieOordeel, test-garage.js, één mutatie).
 - De bulk-recorder leest één keer de klok voor etiket en starttijd (#17).
 - Gereedschapslade: tien knoppen in drie groepen in plaats van veertien.
   Budget, Ritverslag, Inventarisatie en nulstellen zaten al in "Alles
   meten" of de Meetrit. Blok 10 heet Busgrens, niet meer Snelheidsproef.
 - Meetkamer: onder NOG NIET staat "nu 24, nodig minstens 30" in plaats
   van de band met 1000000 erin; de volle regel staat in de titel.
 - CAMPAGNE: geen meetopdrachten meer; de verbinding is klaar (#394).
   Wat blijft staan: #457 (CA10 tot 99 %, de meter die opnieuw opbouwt).
