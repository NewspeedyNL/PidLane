# CHANGELOG-ARCHIEF.md — bouw-changelog ouder dan vier weken

Aangelegd op 22-09-2026 (#265). `CHANGELOG.md` bewaart de laatste vier weken;
alles daarvóór staat hier, ongewijzigd en in dezelfde volgorde.

**Dit bestand wordt niet standaard gelezen.** Zoek er gericht in met `grep` als
je wilt weten wanneer iets gebouwd is en waarom.

Snijlijn bij het aanleggen: alles met een `Build:` vóór 25-08-2026.


     Build: 2026-07-26 22:00 (CET) — UI-OPSCHOONRONDE: MENU, TOPBALK,
     FAVORIETEN, RIT-MONITOR, BLIJVENDE DASHBOARDS

       • ☰-MENU — de bouw-/diagnosegereedschappen (Logs & data, Test-scenario,
         Nieuwste versie laden, Diagnosebundel, Copiloot, Busdiagnose) stonden
         los door het menu heen en lieten de dagelijkse items ondersneeuwen. Ze
         zitten nu onder één uitklapbare topregel "🛠️ Admin", die altijd dicht
         begint. Het menu heeft een max-height + scroll gekregen: met de groep
         open viel Uitloggen anders buiten beeld. De buiten-klik-handler telt
         nu ook #kebabMenu als "binnen" (het menu wordt naar <body> verplaatst).
       • 🎒 RIJSITUATIE — menu-item verwijderd; de functie zit al in het
         auto-invulscherm. openSituatie() blijft bestaan.
       • 🛡️ RIT-MONITOR — verplaatst van de diagnose-deur naar onderaan de deur
         Live PID-data, want het is een live meekijk-functie en geen eenmalige
         analyse. Menu-item weg. Belangrijk: dat menu-item was de énige aan/uit-
         schakelaar, dus die zit nu als knop op de pane zelf (#monPaneToggle).
         PLMon.userAan wordt niet meer uit localStorage hersteld — de monitor
         start elke sessie UIT (zie pidlane-monitor.js).
       • 🔝 TOPBALK — drie dingen: (1) ☰/🏠 en de chips stonden niet op één lijn
         omdat de knoppen een vaste hoogte hadden en de chips die uit padding
         haalden; alles staat nu vast op 30px met inline-flex + centrering.
         (2) Bij tekstgrootte L schaalde body{zoom:1.13} óók de topbalk, die een
         vaste hoogte en een vaste set chips heeft — die liep dan over de rand
         terwijl hij bewust niet horizontaal scrollbaar is; de topbalk groeit nu
         als enige niet mee. (3) De voertuignaam ("DEMO — Mazda CX-5 …") is uit
         de chip gehaald: dat was veruit de grootste ruimtevreter. De naam staat
         nu in de tooltip en in het voertuigoverzicht achter de chip; dát het om
         een demo gaat zie je al aan de oranje OBD-stip. De voertuig-dot leest
         daarom data-naam i.p.v. de zichtbare tekst.
       • ⭐ FAVORIETEN — het uitklap-paneel was position:absolute met z-index 40
         binnen .welcome-header; die stapelcontext ligt ónder de deurkaarten,
         dus het paneel werd half achter en half buiten beeld getekend. Nu een
         echt overlay-venster (#favOv) met wazige achtergrond, aan <body>
         gehangen zodat geen enkele stapelcontext er nog bij kan.
       • ❄️ BLIJVENDE DASHBOARDS — de opruimlogica zat alleen in openLiveView().
         Startte je een Wintercheck en ging je via 🏠 of een andere kaart verder,
         dan bleef #climateDash (fixed, z-index 9000) staan; het welkomstscherm
         (9500) dekte hem af, en zodra dat sloot stond de Wintercheck er weer
         bovenop. Nu één plCloseModeOverlays(), aangeroepen vanuit goHome(),
         openLiveView() én elke functiekaart. Lopende metingen worden
         geminimaliseerd, niet gestopt.
       • 💥 VERVERSEN — de pagehide-handler sloot wél de Capacitor-SPP-socket,
         maar niet de Web Serial-poort. Bij een verversing in Chrome bleef die
         open mét draaiende reader-loop terwijl de nieuwe pagina al laadde.
         disconnectWebSerial() gaat nu mee in pagehide. Dit verklaart ook de
         oude "port already open"-fout bij herverbinden.
     ═══════════════════════════════════════════════════════════ -->

<!-- ═══════════════════════════════════════════════════════════
     PidLane — AI-OBD2-diagnose voor autobedrijven
     Build: 2026-07-26 17:45 (CET) — LOGINSCHERM: SCHAALBAAR LINT + CIRKEL

     Het lint zat in login-ribbon.webp (900x1350, dus 2:3) en werd met
     background-size:cover geplaatst. Een telefoon is ongeveer 9:19,5; cover
     schaalt dan op hoogte en snijdt links en rechts samen zo'n 30% weg —
     precies de stroken waar de golven liggen. Op het toestel bleef daardoor
     vooral zwart over ("golven zaten naast het scherm"); op desktop sneed hij
     juist boven/onder weg, waardoor het daar wél leek te kloppen.
       • Het lint is nu vectorwerk: #lgWaveBg in de body, één SVG met
         preserveAspectRatio="none". Die rekt exact mee met elke
         schermverhouding, dus de groene golf komt altijd linksonder binnen en
         de blauwe verlaat het beeld altijd rechtsboven — op elk toestel.
         62 draden, gegenereerd uit het gemeten profiel van de oude plaat, dus
         de vorm blijft herkenbaar dezelfde. vector-effect="non-scaling-stroke"
         houdt de lijnen overal even dun. Statisch, geen animatie: dit scherm
         kan uren aan blijven staan.
       • De kaart is een echte cirkel geworden, zoals in het ontwerp. Alle
         maten hangen aan één variabele --lgD (de diameter): logo .235, titel
         .080, velden .79 breed, knop .64. Daardoor valt de inhoud altijd
         binnen de cirkel, op elk formaat. De ondertitel vervalt binnen de
         cirkel (staat ook niet in het ontwerp) en maakt ruimte voor de velden.
       • De inlogknop heeft nu een groen-naar-blauw verlooprand.
       • Versieregel, www.pidlane.nl en "Nieuwste versie laden" staan los onder
         de cirkel op de zwarte achtergrond, niet meer vastgeplakt aan de kaart.
       • Splash (#introOv) is doorzichtig geworden en legt alleen een sluier
         over hetzelfde lint, dus bij de fade naar login wisselt er niets meer.
       • Terugval voor korte/erg smalle schermen (telefoon liggend, kleine
         toestellen): daar wordt het weer een afgeronde kaart met vaste maten,
         want een cirkel wordt daar onleesbaar klein.
       • De golflaag schakelt mee via CSS :has() én expliciet in JS bij in- en
         uitloggen, zodat het niet afhangt van browserondersteuning.
       • login-ribbon.webp wordt nergens meer gebruikt (130 KB) en mag weg.
       • Verwijderd: de licht-thema-variant van de loginkaart. Het loginscherm
         forceert donkere kleurvariabelen, dus die regel gaf lichte tekst op
         een licht glasvlak.

     Vorige build: 2026-07-26 15:10 (CET) — RIJSITUATIE / BIJZONDERHEDEN

     Een analyse was tot nu toe situatieblind. Een auto met 1300 kg caravan
     erachter meet hoog verbruik, hoge belasting, hoge koelwatertemperatuur
     en hoge laaddruk — precies wat je verwacht — maar de AI las dat als een
     zieke auto en kleurde het rapport oranje/rood op de verkeerde punten.
     Nieuw: de gebruiker geeft bij de auto-gegevens aan wat er NU speelt.
       • window.SITUATIES in pidlane-data.js — 11 situaties (caravan/aanhanger,
         zwaar beladen, dakkoffer, bergachtig, snelweg, stadsverkeer, koud,
         hitte, airco continu, LPG/CNG, chiptuning). Per situatie staat vast
         wat VERWACHT is (mag het stoplicht niet verlagen) en wat juist EXTRA
         BELANGRIJK wordt (koelmarge, olietemp, laadspanning, laaddruk, DPF).
       • Invoer op twee plekken: het voertuigoverzicht (voertuig-chip in de
         topbar) en een eigen sheet via ☰ → 🎒 Rijsituatie. Caravan heeft een
         gewichtsveld, belading een omschrijvingsveld, plus een vrij tekstveld.
       • Opslag per voertuig (VIN/kenteken) met tijdstempel; na 12 uur vallen
         de vlaggen automatisch weg, zodat een caravanvlag van gisteren de
         analyse van vandaag niet kleurt. SITUATIE_TTL_MS in pidlane-data.js.
       • _situatiePromptLine() wordt in apiFetch aan ELKE systemprompt geplakt
         — ook bij een eigen systemPrompt of admin-override — dus alle deuren
         (koopcheck, verbruik, rit, conditiecheck, automonteur, caravan) zien
         hem. Met een harde weegregel: verschijnselen uit de 'verwacht'-lijst
         mogen het eindoordeel niet verlagen, de 'extra belangrijk'-punten
         worden juist strenger beoordeeld en de situatie moet in het rapport
         benoemd worden.
       • Zichtbaar dat het aan staat: icoontjes-badge naast de voertuignaam in
         de topbar, naast de bestaande dossier-%.
       • loadUserVehicleData() begint nu op een schone basis. Voorheen bleven
         km/onderhoud/bijzonderheden van de vórige auto staan zodra een nieuw
         voertuig nog geen eigen opslag had.
       • Nieuwe remote feature-flag feat_situatie (ook in admin.html).

     Vorige build: 2026-07-22 21:35 (CET) — REMOTE CONFIG BEREIKT DE APP

     De feature-flags uit admin.html kwamen nooit aan. loadRemoteConfig()
     draaide alleen in DOMContentLoaded, dus VOOR het sessietoken bestond:
     window.APP_TOKEN stond op dat moment nog leeg, de Worker gaf 401 op
     GET /api/config, en de app deed daar stilzwijgend niets mee. Gevolg:
     pl_remote_config in localStorage bleef leeg, de app draaide permanent
     op de hardcoded fallback (alles aan) en elke toggle in admin.html
     landde wel in Airtable maar werd nooit gelezen.
     Drie reparaties: (1) loadRemoteConfig pakt het token zelf uit tokLoad()
     als window.APP_TOKEN nog leeg is, (2) hij wordt opnieuw aangeroepen in
     finishLogin() — dat dekt verse login en sessieherstel, want beide zetten
     het token voordat finishLogin draait, (3) slagen en falen worden nu
     gelogd, zodat dit nooit meer stil kan mislukken.

     Vorige build: 2026-07-22 16:40 (CET) — OBD-BUSDISCIPLINE (fase 1 t/m 4)
     De onstabiele PID-metingen uit de veldlogs kwamen niet van de auto of de
     OBDLink, maar van onszelf: meerdere lezers duwden tegelijk commando's in
     dezelfde seriele wachtrij, waardoor de poll-scheduler seconden achterliep
     en ALLE sensoren tegelijk 'uitvielen' en weer terugkwamen.

     FASE 1 — ECHT BUSSLOT (PLBus, in pidlane-data.js)
       window._pollBusy was een kale boolean: iedere houder zette 'm in z'n
       finally op false, dus houder B gaf het slot van houder A vrij. Nu een
       slot met eigenaar + token; alleen wie het token heeft mag vrijgeven.
       Noodrem: een houder die >3 min blijft hangen wordt afgebroken.
       Deze lezers claimen nu netjes: verificatie, brandstofanalyse,
       latentiemeting, gezondheidscheck, rit-sweep, veldlab full survey,
       rit-monitor, verify-module, remote-module. Korte lezers claimen per
       read (eerlijk delen), zware sweeps voor de hele duur.
       PLBus.pausedTotal() telt bus-pauze door NIET-poll-eigenaren; de
       stale-watchdog trekt dat eraf, dus de live view kleurt niet meer rood
       tijdens een sweep die dat zelf veroorzaakt.

     FASE 2 — PRIORITEIT, ADAPTIEVE BATCH, KWALITEITSSCORE
       • pidsDueNow() sorteert op poll-interval: loopt de bus achter, dan gaan
         toerental/snelheid/accuspanning eerst en brandstofpeil achteraan.
       • Multi-PID groepsgrootte is adaptief 3 -> 2 -> 1 en klimt na 25 schone
         rondes terug, i.p.v. batch in een keer helemaal uitzetten.
       • Elke PID heeft een kwaliteitsscore 0-100 (pidQuality). Snoeien vereist
         nu een reeks missers EN een lage score, dus een sensor die af en toe
         hapert wordt niet meer als dood weggegooid.

     FASE 3 — POLLPROFIELEN PER SITUATIE (POLL_PROFIELEN)
       Basis / Live view / Expert / Rit-monitor / Caravan / Accucheck / Rustig.
       Elk profiel heeft een multiplier plus harde per-PID overrides. Analyses
       kiezen automatisch via ANALYSE2POLL (accu-check -> 0142 elke 500ms,
       rit -> rustige bus), live view en caravan zetten hun eigen profiel.
       Handmatig vastzetten kan in het busdiagnose-scherm en blijft bewaard.

     FASE 4 — MONITORKNOP + BUSDIAGNOSE
       • De rit-monitor was alleen op afstand uit te zetten. Nu een knop in het
         hamburgermenu met live status (actief / uit / wacht op verbinding);
         de keuze blijft bewaard tussen sessies.
       • Nieuw admin-scherm 'Busdiagnose': commando's/sec, responstijd nu en
         over de sessie, foutpercentage, ECU-belasting, wie het busslot vast-
         houdt, batchgrootte, traagste sensoren en laagste betrouwbaarheid.
     ───────────────────────────────────────────────────────────
     Eerdere build (2026-07-22) — VIER UI-BUGS BIJ DE OORZAAK OPGELOST
     Alle vier waren cascade-/stapelfouten in CSS, niet in de logica. Daarom
     hielpen eerdere patches op de symptomen niet: de oorzaak bleef staan.
     1) ONLEESBARE INTRO-KAART: .chk-intro in pidlane.css liep als gradient
        naar de hardcoded lichte kleur #f0f7ff (restant uit het light-thema).
        In dark mode werd de kaart rechts bijna wit en viel de lichte tekst
        weg — zichtbaar in Basic system check, Rit-monitor en Koopcheck.
        Tweede kleurstop nu var(--sur2), dus themabewust. De losse override
        "#pane-monitor .chk-intro" in dit bestand is daarmee overbodig en
        VERWIJDERD: één basisregel regelt dit nu voor alle intro-kaarten.
     2) STROOK "SENSOREN & PIDs" ONDERIN (de terugkerende balk): #slPanel
        stond twee keer in pidlane.css met dezelfde specificiteit (1-0-0).
        Het desktop-blok (zijpaneel, @media min-width:1024px) stond VÓÓR het
        generieke bottom-sheet-blok, dus won het generieke blok — op één
        eigenschap na: top:46px, die het generieke blok niet declareert en
        die dus bleef hangen. Gevolg: paneel verankerd op top:46px mét
        height 80vh, waardoor translateY(101%) hem niet voorbij de onderrand
        duwde en er permanent een strook zichtbaar bleef. Opgelost met
        top:auto in de generieke regel + het desktop-blok verplaatst naar ná
        de generieke regels. Nu: <1024px echte bottom-sheet, >=1024px echt
        zijpaneel, beide dicht volledig uit beeld.
     3) DEEL-CHIP OVER PID-KEUZE: #remPill is position:fixed op top:52px/
        right:10px met z-index 9600 en zweeft dus over álles heen — ook over
        #welcomeScreen (9500). Hij landde exact op de PID-keuze-knop, die via
        margin-left:auto ook rechts in .tabs staat. De rechterbovenhoek is nu
        expliciet een GERESERVEERDE BAAN: showPill() in pidlane-remote.js zet
        .rem-pill-on op <html>, en in pidlane.css wijken alle bewoners van die
        hoek (.tabs voor PID-keuze, .fav-wrap voor de ⭐-knop). Eén mechanisme,
        dus een volgend element daar heeft genoeg aan één regel erbij. Gemeten
        chipbreedte ~135 CSS px; --rempill-gap staat op 150px voor marge.
        .welcome-header-row mag daarbij afbreken i.p.v. de titel plat te drukken.
     5) ZELFDE PROBLEEM RECHTSONDER (preventief opgelost): #monChipFab (de
        geminimaliseerde Rit-monitor) en #remDrivePill (expert op remote data)
        stonden allebei hard op bottom:14-16px / right:12px en lagen dus exact
        op elkaar zodra je de monitor minimaliseerde tijdens een expert-sessie.
        Nieuwe baan #fabLane stapelt zwevende chips daar als kolom (van onder
        naar boven, gap 8px). Beide chips hebben hun eigen positionering
        ingeleverd; een nieuwe chip toevoegen is voortaan 'm in #fabLane hangen.
        Verbergen blijft display:none, dus een chip valt uit de stapel zonder
        gat. NB: #ritDash en #caravanDash zitten NIET in deze baan — dat zijn
        inset:0-overlays, geen hoek-chips.
     6) VASTE / CODE-PIDs IN GEWONE WOORDEN: PIDs als brandstoftype (0151) of
        OBD-norm (011C) zijn geen meetwaarde maar een code. Ze kregen tot nu toe
        dezelfde tegel als toerental en snelheid: een sparkline over een vlakke
        lijn en een cijfer van 32px — verspilde ruimte, en "Brandstoftype 4"
        zegt niemand iets. Nieuw: PID_TEKST in pidlane-data.js vertaalt zulke
        codes naar woorden ("Diesel", "EOBD (Europa)", "Gesloten lus —
        O2-regeling actief"), en renderGauges() zet ze in een compact
        tekstblok (#vasteData) boven de tegels i.p.v. in de grid. applyG()
        heeft een afslag naar boven zodat die regels live blijven bijwerken.
        vast:true = verandert niet tijdens de sessie; vast:false = wel een code
        maar kan wisselen (brandstofsysteem, MIL) en krijgt een groen stipje.
        Opgenomen: 0151, 018B, 011C, 0113, 011D, 0101, 0103, 0112, 011E.
        Volledig additief: de bestaande PID-definities zijn niet aangeraakt, en
        een PID hier toevoegen is genoeg om hem uit de tegelweergave te halen.
     4) FAVORIETEN ONZICHTBAAR: #favBar had z-index 9450, #welcomeScreen
        heeft 9500 met ondoorzichtige achtergrond — en favBarSync() toonde de
        balk uitsluitend zolang datzelfde startscherm zichtbaar was. Hij lag
        dus per definitie eronder: onzichtbaar en onklikbaar. De sterretjes
        en localStorage werkten wel. Balk vervangen door een ⭐-knop met
        teller in de welkom-header, met uitklap-paneel binnen #welcomeScreen
        (geen stapelconflict meer mogelijk). Esc en klik-buiten sluiten het.
        favBarSync()/favBarInit() houden hun naam, dus bestaande aanroepen
        blijven werken.
     Vorige build 2026-07-21 (CET) — UI-OPSCHONING + MINIMALISEERBARE RIT-MONITOR
     1) RIT-MONITOR MINIMALISEERBAAR: ➖-knop op pane-monitor → terug naar
        home terwijl de monitor doorwaakt. Zwevend chipje (🛡️ + snelheid +
        waarschuwingsteller; rand/teller oranje bij bevindingen, rood bij
        ernstig; tik = openMonitorView). Chip hangt via JS aan document.body
        (buiten #appScale, dus echt viewport-vast). _monTick gesplitst:
        _monChipTick draait elke seconde, de pane hertekent alleen als hij
        écht in beeld is — nieuwe _monPaneZichtbaar() kijkt óók of het
        welkomstscherm als overlay bovenop ligt (offsetParent alleen was
        niet genoeg).
     2) VELDLAB UIT DE UI: ⋯-menu-item "🧪 Veldlab" verwijderd. 📋 Full
        survey BLIJFT (adminOnly), pidlane-veldlab.js blijft geladen —
        de achterliggende datalogging (→ Referentie-tabel) loopt door.
        NB: de zwevende 🧪-knop komt uit pidlane-veldlab.js zelf.
     3) AUTO-UPDATE-SYSTEEM VERWIJDERD: checkForUpdate, updatebanner,
        applyUpdate, ⋯-menu-item en stille startup-check weg. Klanten
        krijgen updates per mail met changelog. APP_VERSION blijft in
        gebruik (loginscherm + logging); VERSION_URL/UPDATE_URL ongebruikt.
     4) IDEE 7 (achtergrond-monitoring, drempel-alerts) VERWIJDERD incl.
        ⋯-menu-item — volledig dubbelop met de 🛡️ Rit-monitor van deur 1
        (pidlane-monitor.js + pidlane-watchers.js).
     Vorige build 2026-07-19 (CET) — NIEUW: CARAVAN-RITTRACKER (live brandstofcoach)
     Nieuwe deur onder "Besparen": een live tracker voor lange, zware ritten
     met caravan/aanhanger door de bergen. De coach kijkt tijdens de rit mee
     en geeft brandstofgerichte tips onderweg: terugschakelen als de motor
     zwoegt (hoge belasting + laag toerental), opschakelen bij onnodig hoog
     toerental, cruise op een zuinig tempo (~limiet−5, bij 100 → 95),
     rustiger/gelijkmatiger op het gas, en uitrollen op de motor bij
     afdalingen (overrun = 0 brandstof, remt mee). Daarnaast veiligheids-/
     thermische bewaking: koelwater dat oploopt, duurbelasting (pauze-advies),
     lage boordspanning en de ingestelde caravanlimiet. Live-beeld met
     momentaan L/100km, snelheid, toerental (met schakel-hint), vermogen
     (gemeten koppel via 0162/0163, anders belasting%), koelwater, spanning
     en een trip-teller (km/gemiddeld/liters/€). Terrein (klim/afdaling/vlak)
     wordt op OBD-basis ingeschat — geen GPS. Eindrapport combineert
     brandstof + techniek + rijgedrag met de gegeven tips als bewijs.
     Implementatie: losse module pidlane-caravan.js (10e bestand); haakt in
     via een choice-card, FEATURE_TOGGLES (feat_caravan), wcBind, en
     minimaliseer-/backknop-integratie in closeTopOverlay en openLiveView.
     Getest: browser-laadsimulatie (alle functies globaal, 0 alerts) plus
     functionele coach-tests (elke regel vuurt correct, koppel-kW en
     verbruiksintegratie kloppen). Werkt direct in demo.
     Vorige build 2026-07-19 (CET) — SPLIT: 1 → 9 BESTANDEN
     index.html opgesplitst om het hoofdbestand kleiner en veiliger te
     onderhouden te maken (1264 → 535 KB, −58%). Gedrag identiek. Nieuw
     naast index.html — ALLE bestanden verplicht samen mee-deployen
     (repo-root én de www-map van de APK-build):
     Ronde 1 (head-includes):
       • pidlane-data.js   — statische referentiedata: PIDS, PID_HARD_LIMITS,
         MODELS/MOTORS, DTCDB, PIDS_EXTRA, analyse-/checklijsten, BSC_TESTS,
         COMPLAINT_FOCUS, FUEL_PIDS, scenario-presets, STRATEGIE_INFO,
         ALL_PID_DEFS + uitgebreide set (Object.assign), PROTOCOLS,
         SAE_PID_NAMES, KERN/STANDAARD_PIDS, PID_BYTE_LEN, PID_POLL_CLASS,
         DEMO_VEHICLES/DEMO_CARS, ANALYSE_PID_SETS, AUTO_KENNIS,
         HUD_LABEL_DICT. Laadt direct na config.js; alles hangt aan
         window.* zodat alle bestaande verwijzingen en typeof-guards
         ongewijzigd werken. Bootstrap alert't als het bestand ontbreekt.
         (BLE_CHANNELS bleef bewust in index: def-tijd-ref op BLE_SERVICE2.)
       • pidlane.css       — volledige hoofd-stylesheet; <link> op de
         oude <style>-plek in de head.
       • pidlane-remote.js — scriptdeel van de remote-diagnosemodule;
         bijbehorende HTML/CSS staan nog in index.html en de laadpositie
         onderaan de body is ongewijzigd.
     Ronde 2 (modules op hun oorspronkelijke plek in de body, plus assets):
       • pidlane-assets.js   — ingebedde media (BANDEN_IMG, 200 KB base64-
         JPEG); laadt in de head direct na pidlane-data.js.
       • pidlane-veldlab.js  — Veldlab-sessies, Airtable-cloudsync en de
         Full Veldlab Survey v2 (47 KB).
       • pidlane-archief.js  — sessie-rapportarchief incl. AI-context-
         keuze (24 KB).
       • pidlane-bt.js       — universele Bluetooth-laag: SPP/BLE/Web
         Serial/Web Bluetooth, commando-mutex, connectie-optimalisatie,
         incl. BLE_SERVICE2 + BLE_CHANNELS (77 KB).
       • pidlane-koopcheck.js — complete koopcheck-module t/m de EINDE-
         marker: RDW-datavalidatie, onderhoud plannen, EV/hybride-check,
         lange-rit-voorbereiding, airco/winter-check (130 KB).
     Techniek ronde 2: het hoofdscript is op depth-0-kniplijnen (eigen
     JS-lexer met regex-/template-literal-afhandeling, zelftest eind-
     diepte 0) gesplitst in script-src-includes op exact de oorspronkelijke
     documentpositie — uitvoeringsvolgorde ongewijzigd. Hoisting-controle
     bevestigt dat geen top-level code over een kniplijn heen leunt.
     Validatie: node --check op alle 8 js-bestanden én alle inline
     blokken, div-balans, data-file draait zelfstandig onder node.
     Vorige build 2026-07-13 (CET) — SECURITY: SERVER-LOGIN
     Geen APP_TOKEN en geen wachtwoord-hashes meer in de client. Bij login
     post de app {user,pass} naar de Worker (POST /auth/login); die controleert
     tegen zijn eigen secrets en geeft een HMAC-ondertekend sessietoken terug
     (standaard 12u geldig). Dat token vervangt het oude vaste APP_TOKEN als
     X-App-Token op /v1/messages, /proxy en /airtable/*. config.js bevat nu
     alleen publieke instellingen en mag gewoon in de repo. Sessieherstel
     gebruikt het token (verlopen = opnieuw inloggen); logout wist het.
     Offline/onbereikbare Worker → alleen het lokale Demo-account werkt.
     Vorige build 2026-07-11 (CET) — 2 WIJZIGINGEN:
     0) FULL SURVEY v2 (schema 2): survey uitgebreid met STI (echte STN-
        identiteit — MX+ meldt zich via ATI als "ELM327 v1.4b"), CALID 0904
        + CVN 0906 (tuning-detectie), permanente DTC's mode 0A (schoonpoets-
        detector), volledig gedecodeerde readiness-monitors 0101 (benzine/
        diesel-set), ruwe supported-bitmaps 0100-0180 (dekkings-vingerafdruk),
        batchtrap 2→4→6 PIDs (maxPids per voertuigcel), multi-ECU detectie
        via ATH1 (7E8/7E9/18DAF1xx), nodata-herkansing met flaky-vlag (retry
        vs pruning), variantie-sampling 4× op load/rpm/O2/MAP (EWMA-voeding),
        brandstoftype volgens ECU (0151, kruischeck RDW) en OBD-odometer
        (01A6, 2019+). Nul-geldig whitelist fixt 0101/0121/014D die bij
        waarde 0 onterecht als invalid telden. Schema-versie + app-build in
        JSON. Eindscherm toont batch-max, ECU's, DTC-drieluik en readiness.
     1) SESSIE-RAPPORTARCHIEF: 📄 Rapporten-knop (onderbalk, met teller)
        opent overzicht van alle rapporten deze sessie — AI-rapporten (via
        setter-hook op _lastAIReport), foutcode-uitlezingen, TXT-exports en
        PDF's (blob herbruikbaar). In-memory, weg bij app-sluiten. AI krijgt
        eerdere rapporten als context mee (max 4, ~6000 tekens) — met
        keuzesheet Ja/Nee + "onthoud voor deze sessie" bij de eerste analyse;
        stand aanpasbaar (Vragen/Altijd/Nooit) in het Rapporten-overzicht.
     Vorige build 2026-07-09b — 3 wijzigingen:

     0a) AIRTABLE CLOUD-SYNC via Cloudflare Worker: elke veldlab-sessie én
         survey gaat na lokaal opslaan óók naar Airtable-base "PidLane
         Veldlab" — centrale opslag over telefoon/tablet/laptop. GEEN token
         in de client: app post naar eigen Worker (pidlane-veldlab-worker.js)
         die AIRTABLE_TOKEN als secret bewaart. Endpoint via const
         VELDLAB_ENDPOINT in config.js of localStorage 'pl_vl_endpoint'.
         Offline-wachtrij (pl_veldlab_atq, max 60) flusht bij online/opstart.
         Geen endpoint = stil overslaan, lokaal blijft leidend.
     0) FULL VELDLAB SURVEY (⋯-menu, adminOnly): één klik op aangesloten
        auto → geautomatiseerde diepe meting: adapter-info (ATI/ATRV/ATDPN),
        sweep over ALLE supportedPIDs (waarde+responstijd+kwaliteit),
        multi-PID batchtest (CAN), DTC 03+07, timing-profiel 010C×5.
        Gaat als rijke sessie (novel 0.8, survey-veld) de veldlab-store in
        én wordt direct als pidlane-survey-[datum].json gedownload.
        Voortgangs-overlay met afbreekknop; normale werkwijze onveranderd.
     1) WEB SERIAL (Windows): COM-poort kiezen gaf bij annuleren/openfout een
        LEEG connect-scherm (viel door naar Web Bluetooth-kiezer). Nu terminal:
        annuleren = stil stoppen; openfout = gerichte melding + opnieuw-knop.
     2) VELDLAB bereikbaarheid: 🧪 Veldlab nu óók in ⋯-menu (adminOnly); knop
        z-index 9500→9950 (zat onder overlays); admin-check hoofdletter-
        ongevoelig; startup-log "🧪 Veldlab actief"; vlOpenDash admin-guard.
     Vorige build 2026-07-09 — VELDLAB vervangt 25-sessies checklist: elke echte
     verbinding = automatische meetsessie (0 handelingen); adaptieve micro-check
     (max 3 vragen, alléén bij nieuw terrein/merk of anomalie); cumulatieve
     opslag (localStorage pl_veldlab_v1) + in-app dashboard (🧪, admin) met
     dekkingsmatrix, AI-scorebord, structurele verbeterpunten, testadvies en
     verzadigingssignaal; JSON-export voor pidlane-veldlab.html/Claude.
     Oude sessie-check-venster + 25-teller verwijderd.
     FIX: Totaalcheck/Conditiecheck stuurde alleen AFWIJKENDE sensoren naar de
     AI — op een gezonde auto kreeg de AI nul meetwaarden ("geen beschikking
     over sensoren"). Nu gaan alle gemeten waarden (max 40) + volledig
     datakwaliteit-blok mee.
     UI: "🧪 Tester-modus"-knop + consent-vinkje verborgen voor admins
     (impliciet consent; externe niet-admin tester ziet het nog wel).
     UI: dood "sessie-check venster is geopend"-vinkje verwijderd (restant
     van het oude losse-venster-model).
     UI: "🧪 Tester-modus"-knop + consent-vinkjes volledig verwijderd (dood
     na Veldlab); hasTesterConsent()+live-log-engine intact.
     NIEUW (deur 1): "Basic system check" — reeks live autotechniek-tests met
     tijd/PID-grafiek (verwachte band vs echte meting), auto-advance bij groen.
     Automatische PID-selectie: catalogus gefilterd op motortype (universeel +
     benzine/diesel/hybride) en supportedPIDs; ensurePIDListActive zet ze aan.

     STAAT (kort):
       • Single-file web-app (HTML+CSS+JS), Capacitor 6 Android-APK + PWA,
         GitHub Pages. Backend: Anthropic Claude API (apiFetch).
       • Donker thema standaard. Top app bar (logo->Start · voertuig/VIN ·
         verbindingsstatus · ⋯-menu) + bottom-navigatie (Start · Live data[Pro]
         · Rapport). Hub met 4 deuren = basis; live view = Pro, start in puntjes.
       • Analyses leveren AI-rapporten (stoplicht + secties); "Reageer op
         rapport" herwaardeert. Diepe storingsanalyse = schermvullende
         stap-voor-stap wizard. Handmatige PID-recorder. Demo-modus.

     RECENT (sessie van 30 juni):
       • Remote config: app haalt bij start config op via Worker GET /api/config
         (gecached, localStorage-buffer, hardcoded fallback). applyConfigToUI()
         kan deuren verbergen, een banner tonen en de AI-system-prompt overriden.
         Beheerd via los admin.html (niet op publieke Pages). SAFE_AT/geheimen
         blijven bewust hardcoded, niet remote.
       • AI-kwaliteit: gedeelde basis-persona/regels (geen losse "Jij bent..."
         per promptbouwer meer); autoExpertAsk hergebruikt nu de centrale regels
         i.p.v. eigen sys-string; merkkennis (AUTO_KENNIS) gefilterd op
         brandstof zodat een benzineauto geen diesel/DPF/AdBlue-punten meer
         krijgt; token-floor naar 900 voor multi-sectie AI-rapporten.
       • Usage-tracking: logUsage() stuurt deur-keuzes, AI-rapport-successen,
         connectie-KPI (latency vóór/na optimalisatie) en RDW-kwaliteit naar
         Airtable (Type='usage', binnen bestaande kolommen — geen schema-wijziging
         in Airtable nodig).

     RECENT (sessie van 23 juni):
       • IA-herontwerp: top bar opgeschoond + bottom-nav; log->⋯-menu,
         PID-selectie->Live data; ⋯-menu geport naar body (altijd bovenop).
       • App-brede zwarte stijl (fase 1): startscherm + 4 deuren als zwarte
         blokken; dark default.
       • Robuustheid (code-review): timer-lekken gedicht (datalog/rit),
         AI-busy fail-safe 5 min, live-log cap 500 KB, viewport zonder zoom.
       • UX: vals stoplicht gefixt, mobiele lades schermvullend, rapport-
         renderer mooier, reageer-op-rapport.
       • FIX z-lagen: opgeroepen overlays (verbinden/login z-500, AI-sleutel
         z-600, rapport-sheet z-1200) vielen onder het keuzescherm -> nu boven
         hub + nav (9600/9650). Twee modals 9500->9600.
       • Landing = hub: na verbinden toont de app nu de hub i.p.v. live view.
       • Log-weergave weg uit de live view (#logbar verborgen); log blijft
         bereikbaar via ⋯-menu (log-lade) + export/verzenden.
       • Z-audit (grondig): nog 3 menu-modals lagen onder de hub —
         btLogModal (z-999), scenarioModal (z-1000), hudPicker (z-9100) ->
         nu 9650 (boven hub + nav). Immersieve HUD's (9000) verbergen de hub
         bij openen; #introOv (splash) verschijnt vóór de hub.

     Bewuste override-secties (NIET losse patches; zo bedoeld):
       • "FASE 1 — immersieve zwarte stijl" : zwarte blokken voor welcome/deuren.
       • "@media (max-width:1023px)" lade-fullscreen (!important) : vecht bewust
         met de dual-role van #slPanel (zijbalk vs sheet) op mobiel.
       • "FASE 2b — bottom-navigatie" : nav + verbergregels + content-padding.

     Volledige historie + architectuur: zie README.md.
     ════════════════════════════════════════════════════════════ 
