# CHANGELOG.md — bouw-changelog van index.html

> Verplaatst hierheen op 28-08-2026 (op verzoek) uit het HTML-commentaar
> bovenaan `public/index.html`. Reden: dat bestand groeide bij elke oplevering
> met een nieuw blok, en `.github/workflows/build-apk.yml` triggert op elke
> wijziging aan `public/index.html` — dus een veranderde changelog-tekst
> startte een Android-build zonder dat er iets aan de app veranderde.
>
> Nieuwste boven, zoals het al was. Bijwerken hoort nog steeds bij elke
> oplevering (zie CLAUDE.md), alleen voortaan hier.

 ═════════════════════════════════════════════════════
 22-11-2026 — Beeld-in-beeld ook zonder sensoren: de verbinding blijft in leven
 ═════════════════════════════════════════════════════
   • PLPip.besluit(): "geen sensoren" is geen reden meer om het venster niet te vragen. Op een scherm zonder ritgegevens ging PiP niet aan, viel de WebView na wegschakelen stil en kwam de verbinding niet terug
   • test-pip.js, blok 5 #228, één mutatie

 ═════════════════════════════════════════════════════
 22-11-2026 — Meetproeven zonder gedoe: een tip over elk scherm, het ritverslag naar D1
 ═════════════════════════════════════════════════════
   • PLMeetcoach.tipVoor(): geen vraag vooraf nodig. Past de situatie, dan één zin over elk scherm heen (ook Slim visueel op volledig scherm) met ✓ Gedaan en Niet nu: stil na 5 min rijden → contact even uit; contact uit → aftellen tot weer aan; rijdend hoogstens één tip per 3 min
   • Ritverslag `meetcoach` naar D1 bij elk verzendmoment: per open proef waarom hij niet af kwam (16–22-11 kwamen 41, 44 en 45 er nooit in, zonder reden)
   • meetproeven/oogst.sql: één query voor alle opdrachten sinds een datum, in plaats van een SQL per issue

 ═════════════════════════════════════════════════════
 22-11-2026 — Hyperlane in trekmodus: schakellampjes naar het koppelbereik (#742)
 ═════════════════════════════════════════════════════
   • `schakelDoel()` krijgt `trek`: in trekmodus (PLVisueel.trekAan) loopt vol gas naar SCHAKEL.trek.max (benzine 4500, diesel 3500) in plaats van 90% van de rode streep; nooit voorbij dat racepunt
   • test-hyperlane.js (4), blok 5 #742, twee mutaties; handleiding bij de schakellampjes

 ═════════════════════════════════════════════════════
 22-11-2026 — Slim visueel: profiel Klassiek voor een oude auto met weinig sensoren
 ═════════════════════════════════════════════════════
   • Achtste profiel (na Hyperlane): strook met snelheid, versnelling (PLGear) in een toerenring, last en gas als staande balk; temperatuurbalken met normaalband, alleen voor wat de auto geeft (`weg`)
   • Werkgebied last × toeren (12×8) met puntje voor nu, trim per gebied (stationair/deellast/zware last, alleen warm) met oordeel valse lucht/toevoer/overal, lambdasonde 0114 op bereik in 20 s
   • Nieuwe module pidlane-werkgebied.js (PLWerkgebied, test-werkgebied.js); trim- en sondekaart verdwijnen zonder sensor en op een diesel. Liggend volledig scherm: twee kolommen naast de meldingen

 ═════════════════════════════════════════════════════
 22-11-2026 — Bevinding-pop weg is echt weg, rit-monitor alleen in de basismeter, verbruik nu gedempt
 ═════════════════════════════════════════════════════
   • .vis-pop schoof bij verbergen -100%-20px omhoog maar staat op sat+10px: met een hoge statusbalk bleef de onderkant (rode rand, "toerental en belasting — mogelijk…") over de statusbalk hangen, in elke weergave. De verschuiving telt nu de sat mee en verborgen is visibility:hidden
   • Rit-monitor (#visRitMon) alleen in de basismeter in de gewone weergave; in volledig scherm (staand en liggend) en in de profielen (Aurora e.d.) niet. De pop-up bij een nieuwe bevinding blijft
   • PLToon.waarde: CA03 en 015E tonen het gemiddelde over de laatste 3 s in plaats van elke meting (test-toon.js §3c). Ruwe waarde blijft voor AI en analyses

 ═════════════════════════════════════════════════════
 20-11-2026 — Rit-pil: caravanrit en rit-monitor buiten Slim visueel als één regel
 ═════════════════════════════════════════════════════
   • Het volle paneel (trekpaneel, rit-monitorring) staat alleen onder de meter in Slim visueel. In Overzicht, Slim en de andere tabbladen staat #ritPil in #fabLane: één regel met de stand (🚐 tijd · km · limiet, of 🛡️ kijkt mee / n meldingen / motorlampje AAN), randkleur naar ernst; tik = Live, Slim visueel. Vervangt daar de oude monitor-chip (geen twee pillen voor één monitor)
   • De knop in het rit-monitorvenster (ritMonitorKnop) springt bij aanzetten naar Slim visueel en sluit het venster; uitzetten springt nergens heen. toggleRitMonitor() zelf springt niet: testrun en rail zetten hem ook aan. De caravanrit deed dit al (openCaravan)
   • Model PLVisPaneel.ritPilModel/ritPilHtml (test-vispaneel.js), bproef-volscherm.js §7, bproef-visueel.js §5 aangepast, blok 5-proef, zes mutaties

 ═════════════════════════════════════════════════════
 20-11-2026 — Slim visueel: de balk onderin boven de navigatie, rit-monitor óf caravanrit
 ═════════════════════════════════════════════════════
   • Volscherm: `.gg.view-visueel .vis { padding-bottom:0 }` won van de volschermregel en haalde de ruimte voor de navigatiebalk weg. De rit-monitor lag onder de Android-knoppen; volPas() kromp de meter tevergeefs (de meterbak groeit mee, het paneel bleef onderin). Die regel geldt nu alleen in de gewone weergave
   • Hyperlane: de rit-monitor krijgt een eigen strook boven de tanklichtbalk (zoals bevindingen en het trekpaneel); op een kort scherm worden de ringen kleiner zodat het middengetal vrij blijft
   • Rit-monitor en caravanrit nooit tegelijk: aanzetten tijdens een caravanrit weigert met uitleg, een caravanstart zet de rit-monitor uit (ook de automatische via de rijsituatie)
   • bproef-volscherm.js: alle combinaties die mogen (rit-monitor óf caravanrit, met bulk-recorder en waakronde), volscherm en gewoon, kort en lang scherm; zette de navigatiebalk voorheen op een plek waar body hem niet ophaalt. test-ritexclusief.js; zes mutaties

 ═════════════════════════════════════════════════════
 20-11-2026 — Diensten: een venster in plaats van alleen een melding
 ═════════════════════════════════════════════════════
   • Tik op Diensten in het systeemmenu: venster (PLCheck-opmaak) met per dienst — internet, PidLane-server, RDW, AI — de stand, de reden, wanneer gecontroleerd en wat je ervan merkt; bovenaan wat er nu stoort, onderaan Nu controleren. Het venster ververst zichzelf na een controle
   • Op verzoek zonder nieuwe tests; die volgen
   • Het kruisje viel achter de bovenbalk: het venster staat nu op de modal-laag (z-index 9600 in plaats van 9520)

 ═════════════════════════════════════════════════════
 20-11-2026 — Dienstenstand: storing bij RDW, AI of server in gewone taal
 ═════════════════════════════════════════════════════
   • Aanleiding: het RDW gaf 530 en bij het kenteken stond "RDW antwoordde niet goed" — dat leek de app
   • Worker /v1/dienst (openbaar, een minuut gecachet): RDW (één vaste rij) en de statuspagina van Anthropic → goed · traag · verstoord · storing · onbekend. Is die statuspagina zelf weg, dan geen alarm
   • /proxy houdt een mislukt antwoord niet meer vijf minuten in de cache (no-store), zodat het RDW meteen weer werkt als het terug is
   • PLDienst (pidlane-dienst.js): achtergrondcheck elke vijf minuten in beeld en bij weer online; plFetch meldt elk RDW-antwoord. Server pas onbereikbaar na twee missers op rij. Eén melding per omslag, met wat er nog wel werkt
   • Systeemmenu: nieuwe regel Diensten (stip en tekst; tik = nu controleren); de statusstip telt hem mee. De vier kentekenplekken zeggen "storing bij het RDW (code 530), ligt niet aan PidLane"
   • test-dienst.js (30), blok 5, zes mutaties, handleiding (statusknop)

 ═════════════════════════════════════════════════════
 20-11-2026 — Accugezondheid (SoH) van de HV-accu als eigen uitkomst; Volvo 29-bit uit OBDb (#751)
 ═════════════════════════════════════════════════════
   • Accu & elektrisch → Stilstaande analyse: eerst een kaart "Accugezondheid (SoH)" met het percentage dat de auto zelf berekent, een oordeel (onder 70% rood = onder de gebruikelijke garantiegrens, 70–80 oranje, 80–90 gewone slijtage, vanaf 90 goed) en de bron. Geen code, geen antwoord of geen tractie-accu: dat staat er eerlijk. De AI krijgt de gelezen SoH mee en mag geen andere verzinnen
   • PLEigen.hvRol/hvOordeel/hvLees: SoH, laadtoestand en temperatuur van de HV-accu herkend aan de OBDb-naam; "Battery state of charge" zonder HV-woord telt niet (bij Volvo is dat de 12V)
   • Mijn voertuigen bewaart de laatst gelezen SoH (gezondheid.hvSoh) en zet het oordeel bij de punten
   • Volvo 29-bit (D016/D01A, prioriteit 1D) wordt een adres: 1DD01635>1EC6AE80. Op een 11-bit bus (S60/XC60 praten OBD op 7DF) zet adresZet de ELM tijdelijk op protocol 7 en daarna terug; mislukt dat terugzetten, dan haalt de volgende vraag het in. De korte steunlijst van de S60 2019 ("D01A.224028") telt per kop
   • Nep-auto: gemengde bus (11-bit OBD plus 29-bit ECU's met bus29)
   • test-hvaccu.js (22), blok 5 #751, CAMPAGNE-regel voor een Volvo, acht mutaties; twee ankers in plmutate.sh bijgewerkt

 ═════════════════════════════════════════════════════
 19-11-2026 — Oude weergaven: Neon weg, Rit-analyse als ring, checkpagina's in één opmaak
 ═════════════════════════════════════════════════════
   • Neon-dashboard weg (had geen ingang meer; Slim visueel toont hetzelfde). Met de terugknop-, datalog- en Escape-takken, de HUD-presets en de CSS. De naamafkorter en het herverbinden bij terugkeer blijven
   • Rit-analyse: een ring met één segment per fase (wacht · bezig · in orde · afwijking), de klok in het midden, de fasen als chips eronder en de uitkomst per fase als kaart
   • Airco/Wintercheck, Onderhoud, Klaar voor vertrek, Accu & elektrisch: één opmaak (PLCheck). Icoon in een ring, kaarten, tips met een gekleurde rand, één primaire en één secundaire knop; geen eigen accentkleur per pagina meer. De navigatiebalk wijkt nu ook voor Onderhoud
   • test-ritring.js (7), test-checkopmaak.js (15), test-nav (+1), vier mutaties

 ═════════════════════════════════════════════════════
 19-11-2026 — Volle scherm staand: trekpaneel altijd in beeld, profielen vullen de hoogte (#748); dossier
 ═════════════════════════════════════════════════════
   • Met trekpaneel gaat het paneel voor: de meter krimpt (volPas, --vis-pas, minstens 55%) tot alles boven de navigatiebalk staat. Gemeten tegen de veilige onderrand: in een flexkolom telt de opvulling onderaan niet mee
   • Hyperlane met trekpaneel: het paneel onderin boven de tanklichtbalk, het middengetal maakt plaats, de ringen blijven
   • Zonder paneel verdeelt een profiel zich over de hoogte; Motor (ringen) en Verbruik (getallen) groter
   • Trekpaneel: "goed zo" en "0% zwaar" in plaats van afgekapte teksten; een temperatuur zonder sensor geen lege rij meer (koelwater blijft)
   • Voertuigoverzicht: toont het profiel uit Mijn voertuigen ook in de demo en zonder akkoord (PLGarage.dossierLees); het percentage telt dat mee. Bewaren blijft achter het akkoord
   • bproef-volscherm.js (nieuw), bproef-garage (+2), test-visueel (+5), vier mutaties

 ═════════════════════════════════════════════════════
 19-11-2026 — Caravancoach: pedaal, grenzen per motor, eigen richtverbruik, korte tips (#743)
 ═════════════════════════════════════════════════════
   • Gas = het pedaal vanaf zijn rust (PLToon), de gasklep alleen op een benzinemotor zonder pedaal. Op een diesel werkten afdaling en "rustiger gas" niet
   • Koelwater: het oordeel voor deze motor (PLKenmerk.koelLive) plus een snelle stijging (≥ 3 °C/min vanaf 95 °C), niet meer alles boven 100 °C
   • Richtverbruik: je eigen ritten zonder caravan (≥ 50 km) × 1,4, anders het opgegeven verbruik × 1,4, anders 11/14. Het rapport zegt welke bron
   • Bakolie: een eigen sensor met die naam gaat mee in de rit; boven 110 °C rustiger aan, boven 120 °C stoppen. Piek in het rapport
   • Alle tips hooguit acht woorden. test-caravancoach.js (19), vier mutaties

 ═════════════════════════════════════════════════════
 19-11-2026 — Oude vensters weg: rit-monitor als venster, caravan via de rijsituatie
 ═════════════════════════════════════════════════════
   • Rit-monitor: tik op de ring opent een venster met de ring, de aan/uit-knop, de waarschuwingen (Verifieer, 👎 Klopt niet) en Rapport nu. Het oude scherm met elf tegels en zuinig-rijdentips is weg; wizard, startkaart en chipje openen het venster
   • Caravanrit: de rijsituatie caravan start de rit zodra de adapter klaar is en stopt hem met rapport als je hem uitzet. Met de hand gestopt start hij niet meteen opnieuw. De limiet (80/90/100/110) is een rood bord in het trekpaneel, bewaard per toestel. Wizard en startkaart zetten de rijsituatie aan en openen Slim visueel
   • Het caravandashboard en zijn pil zijn weg, met de takken in terugknop en datalog
   • Handleiding bijgewerkt. test-caravanrit.js (13), bproef-visueel (+3), drie mutaties

 ═════════════════════════════════════════════════════
 19-11-2026 — Slim visueel: trekpaneel, rit-monitor onder de meter, bevinding als pop-up
 ═════════════════════════════════════════════════════
   • Trekmodus (caravan of beladen): de zes getaltegels zijn één paneel. De helling als weg met de combinatie erop (gemeten of geschat), het schakeladvies als rad met de doelversnelling (pas na 3 s, zoals de coach), de belasting als boog met het aandeel zwaar van 5 min, elke temperatuur als balk met trend (koelwater, olie, inlaat, en bakolie als de auto die als eigen sensor heeft). De laatste coachtip in één regel
   • Rit-monitor: aan = een ring met één segment per controle (wacht, getoetst, zag iets), in het midden de meldingen, ernaast MIL en foutcodeteller van de ECU. De chip op de rail vervalt dan
   • Bevindingen: geen kaarten meer in het vak. Een nieuwe komt 7 s (ernstig 12 s) als balk bovenin; tik = alle bevindingen. Daarna één chip "N open" op de rail
   • Nieuw: pidlane-vispaneel.js (PLVisPaneel, puur). test-vispaneel.js (33), test-visueel.js (+13), acht mutaties, bproef-visueel bijgewerkt

 ═════════════════════════════════════════════════════
 18-11-2026 — Mijn voertuigen: tab Recepten met AI-zoektocht (admin)
 ═════════════════════════════════════════════════════
   • Nieuwe tab Recepten naast Sensoren, alleen voor admin: de bewaarde modulerecepten van dit merk, met ✅ bewezen of ⚪ niet bewezen en de laatste uitkomst
   • 🔎 Zoek recepten: de AI krijgt merk, model, bouwjaar, motor, brandstof en transmissie, plus de idents en de vraag die je invult. Kenteken en VIN gaan niet mee. Een voorstel zonder bron, met zekerheid "laag" of met een dienst buiten 03/04/10/11/14/18/19/1A/21/22/3E (dus geen 27, 2E, 31, 34–3D) valt weg
   • "Bewezen" komt niet van de AI: een recept wordt bewezen als ▶ in Modulecommando's de hele reeks positief beantwoord krijgt
   • test-modulecmd.js (+17), bproef-garage.js (+6), vijf mutaties

 ═════════════════════════════════════════════════════
 18-11-2026 — Modulecommando's: sjablonen en recepten bewerken
 ═════════════════════════════════════════════════════
   • "Recept bewaren" heeft een sjabloonkeuze: Hyundai i20 (PB) airbag foutcodes wissen, UDS (10 03 / 14 FF FF FF / 19 02 FF) en KWP (10 81 / 14 FF 00 / 18 00 FF 00), of leeg. Een sjabloon vult alleen het formulier; het draait pas als je het zelf bewaart
   • ✎ bij een bewaard recept zet het terug in het formulier; bewaren vervangt het (zelfde id)
   • Beide sjablonen dragen "ongeverifieerd" in de notitie. Crashdata wissen kan niet via OBD
   • test-modulecmd.js (+7), één mutatie

 ═════════════════════════════════════════════════════
 18-11-2026 — Caravan: terugschakelen bergop, homekaart naar Mijn voertuigen
 ═════════════════════════════════════════════════════
   • Caravanrit: op een klim met vol gas (belasting ≥ 80% of pedaal ≥ 70%) en wegzakkende snelheid zegt het advies "Terug naar N", als het toerental daarna onder 4500 (diesel 3500) blijft. Bergop nooit opschakelen. Eén bron: PLBerekend.schakelTrek(), met de echte versnelling uit PLGear
   • Het schakeladvies verschijnt pas als het 3 s staat, in hooguit acht woorden
   • Startscherm: een tik op de auto opent Mijn voertuigen zodra er een voertuig is; Kenteken-check alleen zonder voertuig. Tot nu toe alleen bij rol klant
   • test-trekschakel.js (25 controles), test-thuis.js (+3), vier mutaties

 ═════════════════════════════════════════════════════
 18-11-2026 — Telemetrie heuvelaf, intro-tunnel, adapterkeuze
 ═════════════════════════════════════════════════════
   • Telemetrie: een helling tot 25° (voorover/achterover) telt niet meer als verschoven telefoon; zijwaarts blijft 15°. Heuvelaf gaf "niet in de houder"
   • Inloggen en verbinden: dezelfde WebGL-tunnel in plaats van het CSS-raster; hoogstens een minuut beweging per keer in beeld, daarna stil (accu)
   • Intro: het CSS-raster is weg; de tunnel en aura van Hyperlane in een eigen WebGL-shader, met warp bij de doorzoom. Zonder WebGL de oude rijbaan
   • Verbinden: adapterkeuze als tegels met een chip (MX+, ELM, BLE, ?), stappen compact, de tip achter "Lukt het niet?"
   • test-telemetrie.js, test-intro.js: negen controles, twee mutaties. Blok 5: één nieuwe proef

 ═════════════════════════════════════════════════════
 18-11-2026 — Mijn voertuigen: na het inleren staat het voertuig meteen vol
 ═════════════════════════════════════════════════════
   • Leer de auto (setup-wizard) met kenteken: APK, motor, cilinderinhoud en vermogen komen meteen uit het RDW, niet pas bij de dagelijkse ronde. Eigen invoer blijft staan
   • Een op VIN herkende auto zonder kenteken krijgt het bevestigde kenteken van de verbinding, en daarna het RDW
   • test-garage.js: acht controles, twee mutaties. Blok 5: één nieuwe proef

 ═════════════════════════════════════════════════════
 17-11-2026 — Admin: Modulecommando's — een commando of recept naar één stuurapparaat
 ═════════════════════════════════════════════════════
   • Adminmenu → 🧰 Modulecommando's: adres (bv. 7D0) en bytes (bv. 22 F1 90), het antwoord met de vertaalde weigering (NRC). Alleen hex, 1–7 bytes, 11-bit adres
   • Receptenlijst per merk/model/module (bv. Hyundai i20 · Airbag), stappen per regel; de reeks stopt bij de eerste weigering. Geen ingebakken recepten
   • Schrijvend (alles behalve een lezende dienst, ook 04 en een onbekende dienst): eerst één bevestiging met elk commando, dan zelf 010D/010C lezen — alleen 0 km/u en 0 tpm gaat door. Alles in het logboek; daarna terug op 7DF
   • test-modulecmd.js: 35 controles, zeven mutaties. Blok 5: één nieuwe proef

 ═════════════════════════════════════════════════════
 17-11-2026 — Trimkaart-voorwaarde flappert niet meer (#738)
 ═════════════════════════════════════════════════════
   • PLOnderzoek.maat('onderzoek-kaart-…-n'): per vak de rijkste bron (rit, datalog, live) in plaats van de bron met de meeste monsters samen, en wat eenmaal gemeten is blijft deze sessie staan. In de meetrit van 17-11 werd de deelvoorwaarde drie keer opnieuw vervuld
   • test-onderzoek.js: twee controles + twee mutaties. Blok 5: één nieuwe proef

 ═════════════════════════════════════════════════════
 17-11-2026 — Meetcoach: het verloop van alle meetproeven staat in het logboek
 ═════════════════════════════════════════════════════
   • Na het laden: "N meetproeven lopen mee op deze rit — x af, y open", met per open proef waarom hij nog niet af is
   • Tijdens de rit: elke voorwaarde die vervuld raakt en elke proef die van staat wisselt (gesloten, bevinding) krijgt één regel; geen herhaling per tik
   • Verzenden zonder resultaat (tien minuten, contact uit, verbreken) is niet meer stil: dezelfde stand erbij. Aanleiding: meetrit van 17-11, 13 min, 8 opdrachten, nul uitkomsten en niets in het log
   • test-meetcoach.js: 8 nieuwe controles + drie mutaties. Blok 5: één nieuwe proef

 ═════════════════════════════════════════════════════
 17-11-2026 — Account resetten; schone start laat de vorige auto niet meer terugkomen
 ═════════════════════════════════════════════════════
   • Account → Account resetten (met wachtwoord): /klant/reset wist op het platform voertuigen, rapporten, ritten, tankbeurten, open punten, voorkeuren en koppelingen (dezelfde lijst als de schone start bij inloggen); PLSchoon.naReset() wist het toestel en herstart. Login, tegoed, kasboek, akkoord, uitnodigcode, adapter en weergave blijven. Weigert tijdens een verbinding
   • Bug in "Nieuwe auto — schone start": bij het herladen schreef pagehide pl_appstate (voertuig, VIN, PIDs, foutcodes), de BT-log, het versnellingsprofiel en de bulk-database terug, en restoreAppState() laadde de vorige auto weer in. Nu zet de herstart een merkteken en wist PLSchoon bij de start nog eens; pidlane-schoon.js laadt daarvoor direct na pidlane-data.js
   • test-schoon.js: 15 nieuwe controles (start, reset, worker met echte SQLite) + vier mutaties. Blok 5: één nieuwe proef

 ═════════════════════════════════════════════════════
 17-11-2026 — Verzamelscherm: losse sprongen in koelwater, olie en buitenlucht zijn een verminkt antwoord (#729)
 ═════════════════════════════════════════════════════
   • PLVerzamel.beoordeel(): een monster dat sneller heen en terug springt dan de grootheid fysiek kan (koelwater en olie 5 °C/s, buitenlucht 2 °C/s, sprong ≥ 15 resp. 10) gaat uit de reeks. De rest wordt gewoon beoordeeld; het oordeel is minstens twijfel, met "N losse sprongen weggelaten". 90 → 215 → 90 °C heet zo geen "afwijkend" meer; een echte oververhitting blijft afwijkend. Een fysiek onmogelijke waarde (300 °C) blijft meetfout
   • test-verzamel.js: vier gevallen + drie mutaties

 ═════════════════════════════════════════════════════
 17-11-2026 — Meetcoach zet alleen sensoren aan die deze auto heeft (#733)
 ═════════════════════════════════════════════════════
   • Hyundai i20 2011: bij elke verbinding stonden eerst 12 PIDs aan, waarvan 4 die de ECU niet meldt (012F, 0149, 0142, 015C) — 10 tegels nooit stabiel. Bron: PLOpdracht.zetSensorenAlle() (meetcoach, ontwikkelaarsrol) zette de sensoren van alle meetopdrachten aan zonder te kijken, vóór de PID-lijst er was
   • zetSensoren/zetSensorenAlle: alleen wat de auto meldt of in de keuzelijst staat; zonder PID-lijst niets. De meetcoach laadt pas na "Verbinding compleet". Drie mutaties

 ═════════════════════════════════════════════════════
 17-11-2026 — Accuspanning via de adapter (ATRV) als de ECU 0142 ontkent
 ═════════════════════════════════════════════════════
   • Hyundai i20 2011: steunbits melden 0141 en 0143–0146, niet 0142 — de accutegel bleef leeg. Ontkent de ECU 0142 (steunbit uit of NO DATA op blok 0x40), dan vraagt de pollus 0142 niet meer en zet elke 2 s de ATRV-waarde erop; de keuzelijst toont "Accuspanning (adapter)" en de standaardset neemt hem mee. Zegt de ECU ja of is het onbekend: ongewijzigd
   • test-accuatrv.js (echte plload, steunbits en harde grenzen) + drie mutaties. Blok 5: één nieuwe proef

 ═════════════════════════════════════════════════════
 16-11-2026 — Log inlezen: basisoordeel van de app, toets van wat de AI ziet
 ═════════════════════════════════════════════════════
   • Adminmenu: 📂 Log inlezen (PLLogImport). Leest een eigen export, Torque (breed) en Car Scanner (lang, komma-decimalen); rekent °F, mph, psi, inHg, bar en lb/min om; een onbekende eenheid valt weg met een waarschuwing; een VIN-kolom wordt niet gelezen. Daarna het verzamelscherm (basisoordeel) en op verzoek de AI
   • scenariolog/: zes verzonnen logs (gezond, thermostaat open, arm mengsel, sensorglitch, niet gemeten, dynamo laadt niet) met BASIS en SIGNAAL in de kop; maak.js maakt ze opnieuw. AI MOET / AI MAG NIET staan klaar voor laag B (nog niet gekeurd)
   • Een ingelezen log gaat niet over de verbonden auto (aanlevering.extern): apiFetch stuurt het voertuig uit de log mee, zonder dossier, live toestand, rijsituatie, eerdere rapporten, aanlevering of kenmerken van de actieve auto; het PDF-rapport draagt geen kenteken of foutcodes van die auto; het archief noemt het "Ingelezen log" en stuurt het niet naar het dossier. bproef-logimport.js + vier mutaties
   • test-scenariolog.js: basisoordeel per scenario, elk signaal zichtbaar in de prompt, de kop nooit in de prompt; zeven mutaties. Blok 5: één nieuwe proef

 ═════════════════════════════════════════════════════
 16-11-2026 — Hyperlane staand: grote ringen naast elkaar
 ═════════════════════════════════════════════════════
   • Volledig scherm staand: toeren- en snelheidsring naast elkaar bovenaan (± 46% van de breedte, was op een telefoon 70 px), het midden eronder over de volle breedte met een groter hoofdgetal. bproef-hyperlane.js meet de maat; drie mutaties

 ═════════════════════════════════════════════════════
 15-11-2026 — Demo-Mazda met het echte CX-5-pakket
 ═════════════════════════════════════════════════════
   • Demo: de Mazda CX-5 rijdt met de 52 mode 01-PIDs die een CX-5 2018 meldt (nepauto-profiel cx5), elk met een gezonde waarde; status-PIDs vast (MIL uit). test-demopakket.js + vier mutaties
   • Blok 5: één nieuwe proef

 ═════════════════════════════════════════════════════
 16-11-2026 — Besluiten na #723: testrun uitgesteld, batterijmeting, D1 klaar voor de rit
 ═════════════════════════════════════════════════════
   • Opstart: testrun, meetkamer en meetcoach (± 380 KB) laden pas bij gebruik of vanzelf voor de beheerder; PLRit, PLBudget en de gat-duidingen staan los in pidlane-ritwaarnemer.js (#690)
   • Batterij: bij een beheerderslogin meet de app tot 13-12 het accuverbruik per toestand en vraagt hij bij de volgende start het Android-percentage, met een schermafdruk als je wilt (#691)
   • Aandrijfvorm: elk model en elk antwoord op de vormvraag gaat als logregel naar D1, om de grenzen 15 kW en 1,05× na te meten (#695)
   • Tankvraag: telt zijn vragen en antwoorden als app-maat; nieuwe meetopdracht in meetproeven/667-tank.* (#667)
   • D1: wielslip (opdracht 44) met de nulstand, contactopdracht (41) dicht bij 0 ATST-stappen (#669, #509)
   • Blok 5: drie nieuwe proeven; CAMPAGNE: de rit van 16-11 sluit nu ook #669

 ═════════════════════════════════════════════════════
 16-11-2026 — Issueronde na #722: één rit sluit drie issues
 ═════════════════════════════════════════════════════
   • Toeschouwer: de opstart vóór de eerste verse snelheid telt niet meer als meetgat (#650)
   • Berekend: het bewijs van een meetopdracht noemt per CA-code hoe vaak, aan welke kant en bij welke bronwaarden hij buiten de tegel viel (#650)
   • Verzamelscherm: de rit van zojuist telt een half uur, ook na stilstand en een herverbinding; de meetcoach zegt "open 4× een analyse" (#650)
   • Verbinding: elke ELM-weigering met de reden van de sluiting en de tijd sinds de achtergrond; samen met de ATST-stappen in het bewijs (#509)
   • Home: bij een geschatte aandrijfvorm eenmalig "Kan deze auto elektrisch wegrijden?"; Ja of Nee maakt de vorm bewezen (#695)
   • Zuiniger: uit beeld staan de CSS-animaties stil (#691)
   • Blok 5: vier nieuwe proeven; CAMPAGNE heeft het meetplan voor de rit van 16-11

 ═════════════════════════════════════════════════════
 15-11-2026 — Issueronde zonder rit
 ═════════════════════════════════════════════════════
   • Tankvraag leert van "Nee, niet getankt": per voertuig een drempel net boven de onterechte sprong (#667)
   • Home: herinnerkaart met Aanzetten / Niet nodig, uitleg achter ⓘ (#715)
   • Check mijn auto: getoetst met een échte tik; het checkvenster komt boven wat erover ligt (#714)
   • Wielslip: nulstand per rit zonder gas; opdracht 44 meet wiel-rest-pct en wiel-schaal-pct (#669)
   • Hyperlane staand: toerenring zonder CA18, EV in het midden op de accu, bevinding in een eigen strook (#716)
   • Overzicht: een categorie die helemaal uit staat klapt in (#718)
   • Visueel: stand als woord nu met browserproef en tegenproef (#683)

 ═════════════════════════════════════════════════════
 15-11-2026 — Bevinding vuile MAF niet meer op een hybride
 ═════════════════════════════════════════════════════

 - "Mogelijk vuile MAF / verstopt luchtfilter" ging af tijdens elektrisch
   rijden: toerental en belasting van vlak ervoor, luchtmassa al op nul. De
 ═════════════════════════════════════════════════════
 15-11-2026 — Overzicht: motorwaarden "uit" bij een stilstaande motor (#718)
 ═════════════════════════════════════════════════════

 - Rijdt een hybride op de accu, of staat de motor stil bij start/stop
   (PLAandrijving: motorDraait false), dan tonen toerental, belasting,
   gasklep, luchtmassa, trims en verbruik "uit" in plaats van 0,00, gedimd en
   zonder oordeel (ovzMotorUit). Staat een hele kaart uit, dan zegt de kop
   "uit". Elektrisch stond al boven Motor bij een hybride of EV.

   regel krijgt de hybride-poort van de thermostaatregel (_bevPoort).
 15-11-2026 — Rijbeeld op de energieweergave (#717)
 ═════════════════════════════════════════════════════

 - Het woord in het midden (EV, Motor, Laden, Zeilt, Stil) komt uit
   PLAandrijving.beweging(): één oordeel uit de aandrijftoestand, het pedaal
   en de vertraging, dat pas na 1,5 s omgaat. Laden alleen bij aanhoudend
   remmen met het pedaal los (aan vanaf 20 %, uit onder 6 %). Tot nu toe won
   één vertragend snelheidsmonster van de toestand, en sprong het woord na
   het wegrijden alle kanten op.

 ═══════════════════════════════════════════════════════════
 14-11-2026 (avond) — Deelvoet onder rapporten, review-vraag
 ═══════════════════════════════════════════════════════════

 - Elk gedeeld rapport (tekst, PDF, AI-rapport, opname-samenvatting) draagt
   "Gemaakt met PidLane" met de eigen uitnodigingslink (PLVriend.voet,
   plMetVoet). Niet onder testrun en logboek (ruw). De code wordt na het
   inloggen één keer opgehaald en per account bewaard (pl_mijn_code).
 - PLReview: in de Android-app na een groene foutcodelezing een kaart
   "Bevalt PidLane?" met Beoordelen (Play-pagina), Later en Nee bedankt.
   Pas na 3 dagen en 3 verbindingen, hoogstens 3 keer, 60 dagen ertussen,
   nooit tijdens het rijden.

 ═══════════════════════════════════════════════════════════
 14-11-2026 — Aftelbalk, kortere intro, updatemelding, schakeladvies, vriend uitnodigen
 ═══════════════════════════════════════════════════════════

 - Verbinden gaat altijd via de 5 s-aftelbalk met Nu verbinden en
   Annuleren; het vinkje "altijd automatisch" is weg. De balk loopt pas als
   de intro weg is, het inlogscherm dicht is en de app in beeld staat, en
   begint opnieuw na een uitstapje naar de achtergrond (PLStrook.magAftellen).
 - Terugkeer naar de app herverbindt alleen een verbinding die er wás toen
   de app wegging, en ook dan via de aftelbalk (pidlane-neon.js). Daarvoor
   startte elke terugkeer "Adapter zoeken", ook na Annuleren of bij inloggen.
 - Intro korter en rustiger: 3,1 s in plaats van 4,9 s, zonder de drie
   kaarten en de dwarslijnen. Geen toast meer over het hervatte live-log.
 - Updatemelding (PLVersie): na een deploy een kaart "Nieuwe versie" met
   Nu bijwerken (plHardReload) en Later; niet tijdens een verbinding of de
   intro. De worker geeft het deploy-id op /app-versie (version metadata).
 - Visueel: het schakelbalkje van Hyperlane — tien lampjes en een ▲ boven
   de versnelling. Aan/uit met een tik op de versnelling of in Mijn
   voorkeuren (pl_vis_schakel).
 - Nodig een vriend uit (PLVriend, Meer → 🎁): eigen code PL-XXXXXX en een
   link ?u=CODE. Credits (vriend 10, uitnodiger 20, hoogstens 10×) pas bij
   de eerste auto van de vriend die nog niet bij PidLane bekend was.

 ═══════════════════════════════════════════════════════════
 10-11-2026 (avond) — Hyperlane: tablet-modus simuleren, Hartslag uit de keuze
 ═══════════════════════════════════════════════════════════

 - Admin-menu: "📱 Simuleer tablet-modus: aan/uit" (pl_hl_tablet_sim). Aan:
   de cockpit van Hyperlane op elk liggend scherm, ook een telefoon
   (cockpitKeuze). Staand blijft de telefoonindeling.
 - Op een telefoon een ondergrens voor de kleine cockpitlabels en de
   grafiek iets lager, weg van de melding bovenin.
 - Hartslag staat niet meer in de achtergrondkeuze; een bewaarde Hartslag
   wordt Aurora. De tekening zelf (polsBij) blijft staan.

 ═══════════════════════════════════════════════════════════
 10-11-2026 (avond) — Verbinden: kenteken als wachtmoment, doek tot het klaar is
 ═══════════════════════════════════════════════════════════

 - Een nieuwe auto zonder kenteken: het verbinden houdt stil bij Auto, met
   het veld in de strook (PLStrook.wachtKenteken). Klaarzetten begint pas na
   Opzoeken of Later, dus de RDW-brandstof stuurt de sensorscan al. Rijdend
   geen wachtmoment; dan komt de vraag na het verbinden, zoals voorheen.
 - Een "let" haalt het doek niet meer weg; alleen een fout of het
   verbindscherm dat overneemt (st.venster). De meetcoach en Check connectie
   verschenen anders halverwege het verbinden.
 - Enter in het kentekenveld zoekt op.

 ═══════════════════════════════════════════════════════════
 10-11-2026 (avond) — Hyperlane: rustige rijstijl in Auto, standmenu boven de lampjes
 ═══════════════════════════════════════════════════════════

 - In Auto sprong AUTO · ECO/CRUISE/SPORT bij elk tikje gas. Nu met
   hysterese (0,06 rond de grenzen) en wachttijd: omhoog na 1,5 s, omlaag
   na 4 s (modusRustig).
 - Het menu Auto/Eco/Sport/Cruise viel op volledig scherm achter de
   lampjes-capsule. Zolang het open is gaan de lampjes uit beeld.

 ═══════════════════════════════════════════════════════════
 10-11-2026 — Verbindstrook weg na verbinden, nieuwe lampjes motor/accu
 ═══════════════════════════════════════════════════════════

 - De strook "Verbinden ▾" bleef bovenin hangen zodra één regel op "let"
   stond. Nu: verbonden en niets loopt of vraagt → weg (PLStrook magWeg).
   Inklappen als er niets meer loopt is wegdoen.
 - Motor- en acculampje boven de meter opnieuw ontworpen: één glazen chip
   met een ring om het icoon als meter (belasting, accustand), geen balkje
   meer dat buiten de chip loopt. Hybride in dezelfde vorm: "Aandrijf 62%"
   met de 12 V erachter. Kop kapt af met …, volle tekst in de titel.

 ═══════════════════════════════════════════════════════════
 09-11-2026 (nacht) — Zonder adapter een eigen uitkomst (#705)
 ═══════════════════════════════════════════════════════════

 - Papierenrapport voor de koper: RDW, NAP, APK, export, terugroepacties,
   bekende zwakke punten van het merk, wat je bij de bezichtiging zelf
   nakijkt en vragen voor de verkoper. Te bewaren in Rapporten. Nooit
   "groen": de elektronica is niet uitgelezen, en dat staat erbij.
 - Onderhoud volgens leeftijd en km (algemene richtwaarden, het boekje gaat
   voor), een checklist voor een lange rit, en het echte verbruik uit je
   tankbeurten naast de typekeuring.
 - Er is iets mis zonder adapter gaat naar de klachtenwijzer, met de
   klachten die je al koos.
 - Alle functies: een 🔌 bij elke kaart die meet, en zonder adapter een
   kaart met verbinden, de uitkomst zonder adapter en de demo.
 - Aankooprapport: een leeg opgezochte terugroepactie won van de RDW-vlag
   "openstaand" en gaf groen. Nu telt dan de vlag.

 ═══════════════════════════════════════════════════════════
 09-11-2026 (avond) — Zonder adapter: plannen kan, meten wacht op de adapter
 ═══════════════════════════════════════════════════════════

 - Er is iets mis, Rit starten, Kopen of verkopen en Voorbereiden werken
   zonder adapter tot en met het plan. Wie dan iets start dat meet, krijgt
   één kaart: Verbinden, wat zonder adapter al kan (Kenteken-check, Foutcode
   opzoeken, demo) en terug naar het plan. Voorheen verzamelde de
   sensorcontrole 0 sensoren in 0 s en wisselden vijf modules stil van tab.

 ═══════════════════════════════════════════════════════════
 09-11-2026 (avond) — RR-formulier: één nette regel per sensor
 ═══════════════════════════════════════════════════════════

 - Vinkje en sensornaam staan naast elkaar, de eenheid rechts in een donkere
   keuzelijst in plaats van een witte systeemlijst.

 ═══════════════════════════════════════════════════════════
 09-11-2026 (avond) — Verbinden heeft weer een uitweg
 ═══════════════════════════════════════════════════════════

 - Tijdens het verbinden staat er een knop Stoppen in de strook. Hij sluit
   wat openstaat en haalt het doek weg; de app werkt verder zonder adapter.
   Een poging die nog naloopt meldt daarna niets meer.

 ═══════════════════════════════════════════════════════════
 09-11-2026 — Mijn voertuigen: niets meer over de schermrand
 ═══════════════════════════════════════════════════════════

 - ACTIEF bleef bij grote tekst en een lange autonaam buiten de kaart:
   de grafiek had een algemene regel voor de klassenaam die Mijn voertuigen
   ook gebruikt. De grafiekregels gelden nu alleen nog in de grafiek.
 - De balk "Bewaren / Alles bewaard" onder Sensoren is dicht en loopt door
   tot de onderrand; de lijst schijnt er niet meer doorheen.

 ═══════════════════════════════════════════════════════════
 09-11-2026 — Verbindstrook: rustig scherm tijdens het verbinden
 ═══════════════════════════════════════════════════════════

 - Zolang het verbinden loopt, ligt er een doek achter de strook: de
   schermen eronder springen niet meer heen en weer. Bij een fout, een
   kentekenvraag of het verbindscherm gaat het doek weg.
 - Staat alles goed, dan verdwijnt de strook helemaal in plaats van als
   balk "Verbonden" bovenin te blijven hangen.

 ═══════════════════════════════════════════════════════════
 08-11-2026 (nacht) — Zuiniger: geen timers meer zonder reden (#691)
 ═══════════════════════════════════════════════════════════

 - Zonder verbinding en met de app uit beeld tikt er nu niets meer, behalve
   de sessiehartslag (elke 30 s). Daarvoor gingen er twintig timers af,
   versnelling en telemetrie elke 200 ms.
 - Met een verbinding meten versnelling, telemetrie, berekende waarden,
   accu, rit en leerrit gewoon door, ook met Maps ervoor.
 - Onderbalk, startscherm, statusstipjes, grafiek, de kaarten en het weer
   verversen alleen nog in beeld; terug in beeld meteen.
 - "Minder beweging" op de telefoon stopt nu alle eindeloze animaties.
 - Opstart (#690, deel 1): de foto van de 1-euro-bandentest is een los
   webp-bestand dat pas laadt als je de bandencheck opent, in plaats van
   205 KB base64 die bij elke start geparsed werd.
 - Opstart (#690, deel 2): de proeven van blok 5 (537 KB) staan in
   pidlane-proeven.js en worden pas geladen als de testrun opent. De boot
   laadt nu ongeveer 5,3 MB aan scripts in plaats van ruim 6 MB.

 ═══════════════════════════════════════════════════════════
 08-11-2026 (avond) — Het kenteken hoort bij de VIN (PLIdentiteit)
 ═══════════════════════════════════════════════════════════

 - Een nieuwe auto krijgt nooit meer stil het kenteken van de vorige. Het
   kenteken van de verbonden auto komt uit één plek (pidlane-identiteit.js):
   een bekende VIN geeft zijn eigen kenteken, een nieuwe VIN of een auto
   zonder VIN is onbekend tot je het bevestigt. Nagebouwd vóór de fix: een
   Mazda werd "Peugeot 208, diesel" met het oude kenteken in zijn profiel.
 - De strook vult het vorige kenteken alleen voor, met "controleer"; wat je
   typt blijft staan als de strook bijwerkt.
 - Een nieuwe auto: Inrichten / Niet nu als knop in de strook (de wizard had
   sinds het stille verbinden geen ingang meer, behalve in Meer).
 - Zonder VIN gaan de aangevinkte sensoren en de versnellingsindicator van
   Mijn voertuigen alleen aan als het kenteken dat van het actieve voertuig is.
 - Na een herlaad met "altijd automatisch" start er nog maar één verbinding.

 ═══════════════════════════════════════════════════════════
 08-11-2026 — Verbinden zonder vensters; na het inloggen het hoofdmenu
 ═══════════════════════════════════════════════════════════

 - Na het inloggen kom je in het hoofdmenu in plaats van het verbindscherm.
   Met een adapter die al eens verbond telt een strook bovenin vijf seconden
   af (Nu verbinden, Annuleren, vinkje "altijd automatisch"); dat geldt ook
   bij het openen van de app.
 - Verbinden met de knop stelt geen vragen meer: geen kentekenstap vóór het
   protocol, geen "voertuig bekend, overslaan?", geen samenvatting, geen
   keuze Inrichten/Meteen rijden en geen Check-venster. De nieuwe strook
   (PLStrook) toont Adapter, Protocol, Auto, Klaarzetten en Foutcodes met
   een vinkje en klapt in als alles goed staat.
 - Kenteken van een nieuwe auto: in de strook, alleen in stilstand. De
   foutcodes worden één keer per auto per dag stil gelezen en vastgelegd;
   een rode of oranje regel opent Check mijn auto.
 - Lukt een stap niet zonder vraag (geen protocol herkend, adapter stil),
   dan komt het verbindscherm terug zoals vroeger.

 ═══════════════════════════════════════════════════════════
 07-11-2026 — Ritten zonder onmogelijke uitersten; mild hybride tot 15 kW
 ═══════════════════════════════════════════════════════════

 - Een rit telt een snelheid, koelwater- of accuwaarde alleen nog als
   uiterste (en voor de afstand) als hij binnen het bereik ligt — zonder de
   rand van de codering: 255 km/u en 215 °C zijn 0xFF, −40 °C is 0x00 — en
   fysiek kan volgen op de vorige goede waarde. Een rit van een klant stond
   op "max 255 km/u" en "accu ≥ 0,0 V". Opgeslagen ritten met zulke waarden
   tonen ze niet meer; de rit bewaart hoeveel monsters er niet meetelden.
 - Mild hybride is nu tot 15 kW elektrisch (was 20): de Jeep Avenger
   e-Hybrid (15,6 kW) rijdt bij lage snelheid elektrisch en is dus vol.

 ═══════════════════════════════════════════════════════════
 07-11-2026 — Alles volgt de aandrijving: berekend, pollus, meters, accu, demo
 ═══════════════════════════════════════════════════════════

 - `aandrijfProfiel()`: welke verbranding (benzine/diesel/LPG) en of de
   auto elektrisch rijdt, als twee vragen. Een diesel-hybride rekent nu als
   diesel (geen luchtmassa-route, roetfilterteller, dieselprijs, raildruk
   snel); LPG rekent de luchtmassa om met LPG-constanten. Een mHEV heet
   overal benzine of diesel.
 - Nieuwe berekende waarde CA18 Vermogensvraag: gevraagd vermogen en
   terugwinnen, voor elke meter. Hyperlane toont hem op een hybride in de
   grote ring; geen "MOTOR KOUD" meer terwijl een plug-in op de accu rijdt.
 - Temperatuur toont op een hybride de aandrijfaccu (fabriekscode uit OBDb),
   Emissie op een diesel-hybride het roetfilter, Verbruik "EV" op de accu.
 - Pollus: de accu van een hybride vaker (de olietemperatuur niet meer),
   de hybride-voorinstelling met gaspedaal en de juiste verbranding.
 - Accu: op een hybride laadt bij READY de DC/DC-omvormer; geen startdip of
   rustmeting bij elke motorstart.
 - Demo: Ford Puma (mild), Qashqai e-Power (serieel), Niro PHEV en een
   diesel-hybride, en de demo rijdt nu echt zoals zijn aandrijving.

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
