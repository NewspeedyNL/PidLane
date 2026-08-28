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
     PidLane — AI-OBD2-diagnose voor autobedrijven
     Build: 2026-08-28g (CET) — DRIE STILLE FOUTEN IN DE MEETKANT ZELF

       • 🧻 DE APP-LOG KWAM NOOIT BINNEN BIJ DE TESTRUN (#29). Hij werd op DRIE
         plekken gelezen uit window._appLog en window.logBuffer, en die bestaan
         nergens in public/. Alle drie kregen dus altijd een lege array, zonder
         ooit een fout — de terugval op een lege lijst ving het netjes op.
         Gevolgen, alle drie zichtbaar in de run van 28-08 19:09: blok 14 zei
         "niets opgeruimd" terwijl de opruimregel twee keer had gevuurd (met
         als advies "controleer of hij aanstaat" — precies het onderzoek dat je
         niet moet doen), blok 11 meldde "app-log 0 regels" naast 1183
         BT-regels, en het opgeslagen rapport had nooit een APP-LOG-sectie.
         De echte bron is plLokaalLog(), zoals het logboek hem al las. Nu één
         gedeelde helper _appLogRegels() die een fout MELDT in plaats van stil
         nul terug te geven.

       • 📉 BLOK 7 PRESENTEERDE EEN NULMETING ALS "GEEN VERSCHIL" (#12). De
         deel-door-nul-vangst gaf 0 terug en 0 viel door |verschil| < 15 in de
         tak "vrijwel geen verschil". 0 ms tegen 144 ms werd zo +0% en
         "bezetting voorspelt hier geen tegendruk" — de omgekeerde conclusie,
         op de regel die de Slotsom voedt die bepaalt of de PLLoad-vraag dicht
         kan. Nu vallen nulmetingen vóór de mediaan uit de groep, met
         vermelding van hoeveel er weg zijn, en krijgen een lege groep en een
         mediaan van nul allebei een eigen uitkomst.

       • 💶 DE PRIJSTABEL KLOPTE NIET MEER (#48). Opus stond op $15/$75 (Opus
         3-generatie; huidige Opus is $5/$25) en er stond een introductieprijs
         voor Sonnet 5 in die niet bestaat — met een klokvergelijking die op
         01-09 vanzelf naar $3/$15 zou springen. Dat raakt de euroteller voor
         de beheerder, niet de klantafrekening (die loopt langs tegoedTarief()
         in worker.js). Tarieven staan nu in dollar met de koers als aparte
         constante, zonder klok.

         DE VORM VAN ALLE DRIE IS DEZELFDE: de app mat goed en rapporteerde
         verkeerd. Dat type is van buitenaf niet te onderscheiden van een echte
         bevinding, en een test die dezelfde verkeerde bron leest staat vrolijk
         groen mee. Vandaar drie nieuwe tests in de gate mét tegenproef:
         test-applog.js, test-bezetting.js, test-modelprijs.js.

       • 🧹 Zes dode element-opzoekingen weg (#24 punt 2), ná een verse
         inventaris — van de 15 nooit-aangemaakte id's bleken er zeven wél te
         bestaan (dynamisch via _ov(), of in lijsten van te sluiten modals).
         monitorBtn blijft: dat is een bewuste compatibiliteitsguard met
         commentaar. refreshAdminLogRow is een hele dode functie en verdient
         een eigen rondje.

     Build: 2026-08-28f (CET) — BLOK 5 CORRIGEERT DRIE EIGEN FOUTEN

       • 🧪 DE TESTRUN VROOR ZICHZELF DICHT. Na build e meldde een echte run:
         het venster kwam in beeld, maar geen knop en geen scroll werkten meer.
         Oorzaak: de nieuwe SPP-controle deed een EIGEN conn.spp.read({address})
         los van de poll-lus in pidlane-bt.js, die dezelfde verbinding al elke
         50ms uitleest. Twee gelijktijdige reads op één serial-verbinding, en de
         plugin bleef hangen — de hele testrun is één lange await-keten, dus
         alles erna liep vast, óók "Sluiten".
         Fix: geen eigen read() meer. pidlane-bt.js logt zelf al de eerste
         read() van elk commando naar _btLog; blok 5 leest die regel nu terug
         in plaats van er zelf nog een uit te lokken. Les, vastgelegd in
         PIDLANE.md §11: een controle die meeloopt in de testrun mag nooit I/O
         doen op een verbinding die de app zelf ook gebruikt.
       • Twee kleinere zelfgemaakte fouten uit dezelfde ronde, óók gefixt: de
         "niet verbonden"-melding zocht window._btAdres (bestaat niet — het
         echte veld is window._sppConn), en de env(safe-area)-scan sloeg aan op
         zijn EIGEN toelichting in pidlane.css ("Waarom twee lagen...") omdat
         hij commentaarblokken niet oversloeg. Beide nagemeten: de scan geeft nu
         0 op de echte css (was 1), een echt lek wordt nog steeds gevonden.

     Build: 2026-08-28e (CET) — OOK DE ANDERE VENSTERS ONDER DE STATUSBALK UIT

       • 📱 DE TOPBALK WAS NIET HET ENIGE VENSTER. Een schermfoto liet zien dat
         de topbalk (build d, hierboven) netjes onder de statusbalk uitschuift,
         maar het Logboek niet: "Logboek", "Sluiten" en de regelteller lagen
         half achter de systeemklok. De topbalk was de enige plek die was
         aangepakt — de app bouwt ~20 andere volschermvensters zelf op met een
         losse fixed/inset:0-div, elk met eigen padding en zonder gedeelde
         class.
         Nagelopen welke vensters ECHT tegen de rand liggen (geen backdrop
         ertussen — gecentreerde dialogen en onderaan-uitschuivende vellen
         blijven bewust ongemoeid) en van --pl-sat/--pl-sab voorzien: het
         Logboek, het testrunpaneel, het Veldlab-dashboard, de "diepe
         diagnose"-stappen, en de neon-HUD, rittracker en caravantracker in
         index.html.
         test-schermranden.js bewaakt dit met tegenproef: alle vijf
         teruggedraaide varianten worden rood. Het Logboek is bovendien echt
         gemeten (Playwright, 412px): zonder inset 12px van de rand, met een
         gesimuleerde inset van 36px schuift de kop mee naar 48px.

     Build: 2026-08-28d (CET) — CAPACITOR 8, ANDERS NEEMT PLAY DE APP NIET AAN

       • 📱 TARGETSDK 34 → 36. android/ staat niet in de repo: de build maakt
         hem elke keer uit het template van de Capacitor-versie in package.json.
         Capacitor 6 brengt API 34 mee, en de Play Store weigert per 31-08-2026
         alles onder API 36 — nieuwe apps én updates. De bundel die er lag was
         dus onuploadbaar, met een melding die nergens naar de oorzaak wijst.
         Capacitor 6 → 8 (niet 7: die geeft 35 en is ook te laag). Daarmee ook
         AGP 8.2.1→8.13.0, Gradle 8.2.1→8.14.3, Java 17→21, minSdk 22→24
         (Android 5.0/5.1 vallen af).

       • 🔌 DE SPP-PLUGIN IS VAN EIGENAAR GEWISSELD. @e-is/capacitor-bluetooth-
         serial staat sinds 31-12-2024 stil op 6.0.3 en kon niet mee. Vervangen
         door @ascentio-it/capacitor-bluetooth-serial 8.0.1 — een fork die
         onder dezelfde naam BluetoothSerial registreert, dezelfde methodes
         heeft en read() nog steeds als {value:"..."} beantwoordt.
         In public/ verandert daarvoor geen regel code: alles loopt via
         window.Capacitor.Plugins.<naam> en nergens via een import. Dat is de
         reden dat een Capacitor-major hier goedkoop is, en die eigenschap is
         het waard om zo te houden.

       • 📏 VEILIGE ZONE (--pl-sat / --pl-sab). Vanaf targetSdk 35 dwingt
         Android edge-to-edge af: de WebView tekent onder de status- en
         navigatiebalk, en bij targetSdk 36 doet de oude ontsnapping
         (overlaysWebView:false) niets meer. De topbalk had als enige nog geen
         marge — die stond sticky op top:0 en zou dus onder de klok van Android
         schuiven, met het logo dat we deze week net hebben rechtgezet.
         Twee tokens naast de z-index-tokens, om dezelfde reden: één plek. Ze
         zetten Capacitor's --safe-area-inset-* vóór env(), want WebView onder
         versie 140 geeft bij env() verkeerde waarden terug.
         LET OP bij het lezen van de diff: de topbalk heeft DRIE regels (de
         gewone, die onder 480px en die van uiL) en alle drie zetten padding
         opnieuw. Twee daarvan gooiden de marge weg terwijl de hoogte hem wél
         meetelde — dan wordt de balk hoger zonder dat de inhoud meeschuift.
         Nagemeten: zonder inset is de balk in alle drie de standen exact
         gelijk aan die van main.

       • 🚦 DE BUILD CONTROLEERT HET API-NIVEAU, EN INJECTEERT HET NIET.
         PLAY_MIN_TARGET_SDK staat als één getal in build-apk.yml; de build
         leest android/variables.gradle en stopt als het daaronder zit.
         Bewust geen injectie: dan staat het getal op twee plekken en is bij de
         volgende verhoging niet te zien welke wint. Volgend jaar is dit dus
         één versienummer in package.json en één getal in de workflow.
         test-capversies.js bewaakt dat de zes Capacitor-pakketten dezelfde
         major houden en dat de JDK meebeweegt — de halve upgrade is hier de
         klassieke fout.

     Build: 2026-08-28c (CET) — BETAALLINKS UIT DE CODE (#24)

       • 💶 TIKKIE-LINKS — stonden hardcoded in pidlane-klant.js, in een
         publieke repo. Komen nu uit de Config-tabel via /api/config, te
         beheren in admin.html onder "Betaallinks". Niet omdat zo'n link
         geheim is (wie hem heeft kan betalen, niet incasseren) maar omdat je
         hem anders niet kunt wisselen zonder een deploy — en dat is precies
         wat je wilt kunnen als er een verkeerde rondgaat.
         CFG.tikkieKopen/tikkieDonatie zijn nu GETTERS: de config komt pas ná
         het inloggen binnen, dus een vaste waarde zou de stand bevriezen op
         het moment dat het bestand laadt, en dat is altijd leeg.
         LET OP de nieuwe grens: de waarde komt uit Airtable en belandt in een
         href. Alleen https://tikkie.me/… wordt geaccepteerd — zonder die
         toets voert een klik uit wat er in die tabel staat, en _esc() dekt
         dat niet af (dat ontsnapt HTML, niet het schema van een URL).
         Leeg laten mag en blijft de bestaande, getoetste toestand: dan toont
         het scherm "Tokens aanvragen" per mail.
         De oude links staan nog in de git-geschiedenis; alleen een nieuwe
         Tikkie haalt die echt uit omloop.

     Build: 2026-08-28b (CET) — DE AIRCO IS GEEN DEFECT (#30)

       • 🌬️ RUW STATIONAIR — de watcher STAT_RPM meldde op 27-08 twee keer
         "ruw stationair" (65 en 193 rpm) terwijl het de airco was die in- en
         uitschakelde. De MÉTING klopte; de verdachtenlijst eronder niet, en
         die komt in een klantrapport terecht. Een monteur naar valse lucht,
         bobines en bougies sturen voor een normaal werkende airco is duurder
         dan geen melding.
         De melding noemt de airco nu eerst, met een handeling die de
         gebruiker zelf kan doen (zet hem uit en kijk of het blijft). De dure
         verdachten blijven staan, maar erachter.
         BEWUST GEEN drempel omhoog: dan verdwijnt 193 rpm, maar echt ruw
         lopen ook. En bewust nog geen automatisch onderscheid — een
         inkoppelende compressor is te zien aan een sprong in de
         motorbelasting, maar valse lucht geeft óók belastingvariatie, en waar
         die grens ligt is zonder metingen aan een auto met schakelende airco
         niet te zeggen. Daarom leest de watcher 0104 nu wél mee en zet hij de
         gemeten belastingspreiding in de melding: dat zijn de cijfers die het
         onderscheid later mogelijk maken.

     Build: 2026-08-28 (CET) — DE SESSIE: INLOGGEN EN UITLOGGEN (#24)

       • 🔑 INLOGGEN MET EEN E-MAILADRES — doLogin() probeert bij een @ in de
         gebruikersnaam eerst de klantroute. Een AFGEWEZEN klantlogin deed
         daar `return`, waardoor de Users-route onbereikbaar was: een
         medewerker met een e-mailadres als gebruikersnaam kon niet inloggen.
         Alleen een uitzondering (server onbereikbaar) viel door, een nette
         afwijzing niet. Nu valt ook een afwijzing door. Een BLOKKADE stopt
         nog steeds hard — doorlopen zou daar het slot omzeilen, en dat is de
         helft die niet mee mocht veranderen.
       • 💳 UITLOGGEN LAAT GEEN SALDO ACHTER — logout() wiste alleen
         pl_session en pl_autoconn, dus op een gedeeld werkplaatstoestel zag
         de volgende gebruiker het saldo van de vorige. Er is nu
         PLCredits.vergeetKlant().
         LET OP de vorm van die fix: "wis de drie pl_credits_*-sleutels" is
         de voor de hand liggende oplossing en hij is FOUT. saldo() kent bij
         een ontbrekende sleutel het gratis proeftegoed toe, dus weggooien
         maakt uitloggen een knop die 25 tokens uitdeelt, zo vaak als je
         wilt. De sleutel gaat daarom op nul en wordt niet verwijderd.
         pl_credits_init (dit toestel kreeg zijn proeftegoed al) en
         pl_credits_kalib (tekens-per-token van het model, geen klantdata)
         blijven bewust staan.
       • 🧪 test-inlog-sessie.js — beide fixes als gedrag, met tegenproef:
         de oude `return` maakt hem rood, en het verwijderen van de
         saldosleutel ook.

     Build: 2026-08-27 (CET) — VIER SCHERMFOUTEN OP DE TELEFOON

       • 🔝 TOPBALK — het logo werd doormidden geknipt. .logo is het enige
         krimpbare kind van een balk met overflow:hidden, dus bleef er een
         halve icoon staan zodra de chips rechts de ruimte opaten. Onder 480px
         verdwijnt het logo nu in zijn geheel: versiering wijkt voor bediening.
       • 🛡️ RIT-MONITOR, TEGELS — de rasters stonden op repeat(4,1fr), en 1fr
         is minmax(auto,1fr): een spoor mag niet smaller worden dan zijn
         langste woord. INLAATLUCHT duwde het raster 19px buiten het scherm,
         waardoor "Verbruik nu" er half afviel en de tegels ongelijk breed
         werden (103/95/98/83px). Met minmax(0,1fr) zijn ze alle vier 90px.
       • 🛡️ RIT-MONITOR, KOP — "Waarschuwingen & onderbouwing" kon als flexkind
         niet krimpen onder zijn langste woord en liep naast de Rapport-knop
         het scherm uit in plaats van af te breken. min-width:0 haalt die bodem
         weg; de opmaak zelf verandert niet.
       • 🇳🇱 TAAL — "Basic system check" en "Start basic check" waren Engels in
         een Nederlandse app: nu "Basiscontrole systeem" en "Basiscontrole
         starten". De demoknop op het loginscherm blijft wél Engels — die tekst
         staat woordelijk in de Play-reviewnotitie.
       • 🧱 LAAGORDENING — de zwevende chips stonden op vier verschillende
         hoogtes (8500/9400/9400/9450), dus lag er niets vast en dook er steeds
         een modal onderuit. Ze delen nu één laag onder de hele modal-band, via
         benoemde --z-*-variabelen in pidlane.css.

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
