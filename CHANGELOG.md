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

 ═══════════════════════════════════════════════════════════
 08-10-2026 — Eén contactadres, en de Play-checklist voor 3.2 bijgewerkt
 ═══════════════════════════════════════════════════════════

 - support@pidlane.nl is overal het contactadres: privacyverklaring,
   Console-teksten, verwijderpagina, app. test-playteksten.js bewaakt het.
 - PLAY-INZENDING.md: §11 zonder chassisnummer naar de AI, §16b met de
   Basismeter en het herverbinden, en welke build je uploadt.

 ═══════════════════════════════════════════════════════════
 08-10-2026 — Privacy: geen VIN naar de AI, privacyverklaring gelijk aan de app
 ═══════════════════════════════════════════════════════════

 - De Auto-expert en Optimaliseer stuurden de ruwe VIN mee naar de AI. Nu
   niet meer, en apiFetch() haalt een VIN altijd weg vóór verzending
   (plZonderVin). test-vin-anoniem.js deel 9, twee mutaties, blok 5.
 - privacy.html: "de techniek volgt de auto" uit Mijn voertuigen staat er nu
   in, met de volledige lijst; Anthropic krijgt geen chassisnummer.
 - De uitleg vóór het verbinden zegt dat de VIN ook bij een AI-analyse op
   het toestel blijft.

 ═══════════════════════════════════════════════════════════
 08-10-2026 — plinhaal.js: main binnenhalen zonder handwerk aan toevoegingen
 ═══════════════════════════════════════════════════════════

 - Nieuw: node plinhaal.js. Lost een botsing alleen op als beide kanten
   alleen toevoegden; de rest blijft handwerk. Op de 11 botsende
   inhaalmerges sinds 01-09: 9 vanzelf. test-plinhaal.js, vijf mutaties.
 - CLAUDE.md: inhalen met plinhaal, nieuwe mutaties bij hun onderwerp en
   niet onderaan, main binnenhalen vóór de PR.

 ═══════════════════════════════════════════════════════════
 08-10-2026 — Systeemtest: geen hybridetests die niets zeggen (#430)
 ═══════════════════════════════════════════════════════════

 - hv_soc, ev_ice en regen zijn uit de systeemtest. hv_soc keurde een
   nieuwe accu af (015B is levensduur, geen laadtoestand), ev_ice slaagde
   altijd, regen mat de 12V-accu. Een hybride houdt de benzinetests.
 - test-hybridebasis.js, een mutatie en een proef in blok 5.
 08-10-2026 — Herverbinden: één herverbinder tegelijk
 ═══════════════════════════════════════════════════════════

 - Na een stekker eruit en erin liepen sppReconnectGuard en connectSerial()
   door elkaar. De warme reset (ATWS) van de guard viel midden in de 0100 van
   de protocoldetectie; de app vroeg om een protocol (Aygo, 07-10: ISO 9141-2
   op een CAN-auto). De pair-knop deed één schone verbinding en fixte het.
 - De guard wijkt nu voor een volledige verbinding die loopt, gepland staat
   of tijdens zijn eigen poging begint (_btGen). Een automatische
   herverbinding zoekt het protocol eerst nog één keer zelf.
 - test-herverbindguard.js, vier mutaties, blok 5.

 ═══════════════════════════════════════════════════════════
 08-10-2026 — Basismeter: vier plekken die je zelf kiest
 ═══════════════════════════════════════════════════════════

 - De drie balkjes onder de snelheid (koelwater, pedaal, brandstof) zijn weg.
   In de onderrand staan nu twee bogen: koelwater links, brandstof rechts,
   koud en leeg onderaan. Onder de km/h staat één groot getal: het verbruik
   van dit moment. Linksonder, als spiegel van het bandenautootje, het
   bereik met deze tank, of zonder tankinhoud de rit (km en minuten).
 - Tik op een plek om zelf te kiezen wat er staat (pl_vis_keuze, basis/…).
   Op een boog alleen sensoren met een schaal; toerental, snelheid en
   tekst-PIDs nergens. Automatisch zet de plek terug.
 - De onderboog voor olie of laaddruk is weg; die staan in Motor en in de
   trekstrook, of zet ze zelf op een boog. Het pedaal staat niet meer
   vanzelf op de meter en wordt dus geremd zolang Visueel open staat.
 - Nieuw in PLGarage: ritKort(). Tests, browserproeven, blok 5, negen
   mutaties en de handleiding bijgewerkt.

 ═══════════════════════════════════════════════════════════
 08-10-2026 — Banden niet meer dubbel in de keuzelijst (#396)
 ═══════════════════════════════════════════════════════════

 - Een band is altijd op verzoek, ook als er een tempo bij gekozen was.
   Zo'n band stond los in de keuzelijst én gebundeld in het bandenvenster.
 - Mijn voertuigen toont bij een band geen tempokeuze meer: het
   bandenvenster vraagt ze, en met het vinkje elke vijf minuten.

 ═══════════════════════════════════════════════════════════
 08-10-2026 — Helling en kanteling blijven helder over drempels (#418)
 ═══════════════════════════════════════════════════════════

 - Een telefoon in de houder knikt mee met de auto. Een drempel gaf
   "wiebelt" en daarna 5 s grijs. Wiebelen telt nu pas na minstens 1 s
   boven 8°/s binnen 3 s (HOUDER.wiebelMs, vensterMs).
 - Op schoot wordt hij nog steeds dof, nu na ongeveer 2 s in plaats van 1 s.
 - test-telemetrie: vier drempels houden de houder vast; één mutatie
   erbij; blok 5 meldt het aandeel vast/niet vast van de rit.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Analyserapport: één vaste PDF voor alle analyses (#448)
 ═══════════════════════════════════════════════════════════

 - ⬇ Download PDF maakt altijd hetzelfde rapport, in de volgorde van het
   onderzoek: voorblad met logo en "In het kort", autokennis,
   probleemstelling, staat van het voertuig, plan van aanpak en testplan,
   uitvoering met grafieken, hypothesen en bewijs, conclusie en advies,
   disclaimer en grenzen; bijlage A meetdata, bijlage B de AI-tekst.
 - Tabellen, stoplichten en grafieken komen uit de meting (verzamelscherm,
   samenhang, foutcodes, readiness). De AI levert alleen de woorden, in
   een <rapport>-blok aan het eind van zijn antwoord; zonder blok haalt het
   rapport conclusie en advies uit de bekende koppen en zegt dat erbij.
 - Grafiek per sensor met de alarm- en waarschuwingsgrens uit de
   PID-definitie en de toestanden van de motor als gekleurde banden.
 - Scherm, delen en archief tonen de tekst zonder het blok; het archief
   bewaart het geheel als bron voor een latere PDF.
 - Nieuw: pidlane-rapport.js, test-rapport.js, bproef-rapport.js, tien
   mutaties, blok 5, CAMPAGNE stap E, handleiding.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Gaspedaal en tank: hetzelfde getal in elke weergave
 ═══════════════════════════════════════════════════════════

 - Melding uit de auto (Mazda CX-5): het gaspedaal "stond vast op 20", en
   het tankniveau verschilde per scherm (6 tegen 8 %).
 - Pedaal: 0149 is het absolute pedaal, in rust rond de 20 %. Alle
   weergaven tonen nu hoeveel hij ingetrapt is vanaf de rust die per auto
   geleerd wordt; een verminkte 0 telt niet mee bij het leren.
 - Tank: 012F wordt eens per minuut gevraagd en klotst; getoond wordt de
   mediaan van de laatste drie metingen.
 - Pedaal en tank overal in hele procenten (Overzicht zei "7.80" waar
   Visueel "8%" zei).
 - Eén module, pidlane-toon.js, aangeroepen door Overzicht, Slim, Visueel
   en de Visueel-profielen. De ruwe waarde blijft voor de AI en analyses.
 - test-toon.js, bproef-toon.js, acht mutaties, handleiding.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Samenhang: het verzamelscherm leest de meting als een monteur (#446)
 ═══════════════════════════════════════════════════════════

 - Bovenaan de uitslag een blok Samenhang: eerst de toestand per moment
   (koud/warm, stationair, rijden, vollast, gesloten lus uit 0103), dan de
   stappen van het volledig onderzoek op de stukken waar hun voorwaarde
   gold. Aanwijzingen met bewijs ▲▼, wat de meting tegenspreekt, en wat
   niet te beoordelen was met de reden. De AI krijgt hetzelfde, vóór de
   getallen.
 - Geen tweede kennisbank: pidlane-samenhang.js gebruikt PLOnderzoek
   (STAPPEN, verwerk, conclusie); de grenzen staan nu in CFG.grens.
 - Scenariotest test-samenhang.js: gezonde koude start met slim laden, lek,
   luchtmassameter, dynamo, liegende koelwatersensor, versleten kat, warme
   file, open lus, korte meting, stilstaand gas, vaste lambdasonde.
 - Gevonden onderweg: op het tempo van het toerental afgetast lijkt een
   regelende lambdasonde stil te staan; stappen krijgen daarom de ruwe
   monsters.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Verzamelscherm voor alle analyses, de rit als meting, en de meetproef (#443)
 ═══════════════════════════════════════════════════════════

 - Ook Verbruik, Totaalcheck, Onderhoud, EV-check, Lange rit, Datalog,
   Diepe analyse, het ritrapport, de caravan en de klimaatcheck tonen eerst
   de uitslag en vragen dan pas om de AI. Bij "nee" gaat er niets weg; bij
   caravan en klimaat komt het rapport zonder AI-deel.
 - Een meting die er al is, is de bron: de datalog, de ritfases, de
   caravanhistorie, de klimaatmetingen. De rit van zojuist (een kwartier,
   genoeg rijtijd) telt als meting voor de volgende analyse; "📡 Opnieuw
   meten" vervangt hem. Na "🚗 Rijtest starten" komt de analyse vanzelf
   terug. Net verzameld = geen tien seconden opnieuw; de poort blijft.
 - Alle prompts krijgen dezelfde samenvatting; het ritrapport over de hele
   rit naast de cijfers per fase.
 - Meetproef: app-maten verzamel-*, een logregel per uitslag, een
   meetopdracht (tekst in #443) en de stappen in CAMPAGNE.
 - test-verzamelroutes.js (elf routes: nee = niets naar de AI, ja = de
   samenvatting erin), test-verzamel.js en bproef-verzamel.js uitgebreid,
   rittests op de echte module, achttien mutaties, blok 5, handleiding.
 - Nog op de oude meetpoort: Systeemtest, Welk onderdeel en de koopcheck
   (geen AI-vraag of een eigen draaiboek).

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Verzamelscherm: eerst de data en wat opvalt, dan de AI (#443)
 ═══════════════════════════════════════════════════════════

 - AI-monteur (wizard), AI-rapport en de oorzaak-uitwerking openen nu
   "📡 Data verzamelen": per sensor de waarde, een verloopje en ✓ bij genoeg
   metingen. Daarna "✓ Data verzameld" met bovenaan wat opviel (rood over de
   alarmgrens, oranje over de waarschuwingsgrens of PID_LET_OP), en pas dan
   "🤖 Laat de AI dit onderzoeken" — of Langer meten, of Sluiten zonder AI.
 - Weg op deze routes: "Sensoren registreren", "Gebruik de meting van
   zojuist?" en de tweede meetpoort vóór de uitwerking. De eisen zijn
   dezelfde (plMeetTekort + plKernStatus); stop je eerder, dan gaat de
   beperking mee in het rapport.
 - De AI krijgt dezelfde samenvatting als het scherm: per sensor min–max,
   gemiddelde, aantal en hoe vaak buiten de grens. Tot nu toe alleen de
   laatste waarde. De klacht uit de wizard gaat mee als vraag.
 - pidlane-verzamel.js (nieuw), test-verzamel.js, bproef-verzamel.js,
   schermranden, acht mutaties (één verankerd opnieuw), blok 5, handleiding.
 - Nog niet: Diepe analyse, totaalcheck, verbruik, datalog — zie #443.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Grijs: één regel, en niet aan de beurt is niet oud
 ═══════════════════════════════════════════════════════════

 - Overzicht en Visueel (met zijn profielen en lampjes) hadden elk een eigen
   regel voor "oud": 3× het nominale tempo, minstens 5 s. Loopt de bus
   achter, dan zet de pollus trage PIDs bewust achteraan, en die gingen dan
   grijs terwijl ze gewoon nog niet gevraagd waren.
 - Nu één regel, plOud() in pidlane-plload.js: verwacht = het tempo of het
   gemeten tempo als dat trager is; oud na 3× verwacht (min. 5 s) als er
   sinds het laatste antwoord gevraagd is zonder antwoord. Niet gevraagd:
   pas na een minuut (of 6× verwacht). Op verzoek (banden): nooit.
 - test-visueel.js op de echte plOud, bproef-overzicht.js 2b, zes mutaties
   (één verhuisd van VIS_OUD_MIN_MS), blok 5.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Telemetrie alleen in Visueel
 ═══════════════════════════════════════════════════════════

 - Helling, kanteling, lengte- en zij-G (TL01–TL04) staan niet meer in
   Overzicht en zijn niet meer te kiezen op het Slim-dashboard; een
   opgeslagen tegel ervan valt weg. Visueel → Telemetrie blijft.
 - bproef-overzicht.js 1c, bproef-telemetrie.js deel 4 meet de dofheid nu
   via PLTelemetrie.los(), twee mutaties, blok 5.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Banden: een ontbrekende sensor wordt genoemd
 ═══════════════════════════════════════════════════════════

 - Een band zonder temperatuursensor (de CX-5 miste 222A0C) toont
   "geen temp." in plaats van een los "· +3%", en het venster zegt welke
   sensor ontbreekt en waar je hem toevoegt.
 - PLBanden.ontbreekt() met drie toetsen, bproef-banden.js deel 4, twee
   mutaties, blok 5.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Overzicht Compact: de naam wijkt niet meer voor de band (#439)
 ═══════════════════════════════════════════════════════════

 - Bij tekstgrootte L op een telefoon van 384 px (340 px na de zoom) bleef
   er 38 px over voor de naam: "Sne…", "Toe…", 17 van de 18 afgekapt. De
   naam houdt nu minstens 6.6em, de band krimpt, en de waardekolom is 4.8em
   in plaats van 86 px (de breedste waarde is 62 px).
 - bproef-overzicht.js stap 1b meet het op 384 px met L, één mutatie, blok 5.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Overzicht per categorie, met de normale band (#439)
 ═══════════════════════════════════════════════════════════

 - Live → Overzicht: een kaart per categorie (Rijden, Motor, Temperaturen,
   Brandstof, Uitlaat, Elektrisch, Berekend, Overig), in de volgorde van de
   aandrijving: bij hybride en EV staat Elektrisch direct onder Rijden.
 - Per sensor één rij: korte naam · balk met groen vlak (wL…wH) en een
   streepje voor nu · waarde met de decimalen van zijn eenheid · trendlijn
   (hoogstens vier, #302 blijft) · 📈. Buiten de band: oranje/rood met een
   uitleg eronder; de kop telt mee; de rij gaat bovenaan zijn kaart.
 - Compact of Ruim (twee kolommen tegels), onthouden per toestel. Ruimte
   onderaan voor de zwevende pillen.
 - test-overzicht.js (36 nieuw), bproef-overzicht.js, zeven mutaties, blok 5.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Energieweergave: tegels aandrijving, versnelling, bereik (#437)
 ═══════════════════════════════════════════════════════════

 - De tegels onder de Energie-ringen: EV-aandeel van deze rit (alleen
   rijtijd telt), versnelling in km/h per s (uit 010D, zelfde venster als de
   laadring) en bereik: brandstof (CA09) plus accu, het accudeel geleerd
   als km op de accu per procent dat 015B zakt.
 - Handleiding, test-visueel.js, test-visprofiel.js, zes mutaties, blok 5.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Energieweergave voor hybride (#435), onderzoek zonder klacht (#434)
 ═══════════════════════════════════════════════════════════

 - Slim visueel → Motor (Neon) heet op een hybride of EV "Energie": ringen
   voor vermogensvraag (groen bij terugwinnen), aandrijfaccu (015B) en
   motor (010C); in het midden EV / Motor / Laden / Stil met de snelheid;
   tegels 12V, belasting, verbruik. Een hybride opent hier zolang er geen
   eigen keuze is.
 - Volledig onderzoek zonder klacht: "🧭 Toch grondig onderzoeken" bij een
   groene Check mijn auto, en "Ik merk niets bijzonders" bij Er is iets
   mis. Brede ronde: valse lucht, MAF, lambda/kat, thermostaat, accu en
   laden, misfire; bij een diesel ook roetfilter, EGR en software.
 - Handleiding, test-visprofiel.js, test-onderzoek.js, bproef-visueel.js
   deel 9, bproef-onderzoek.js deel 5, zeven mutaties, blok 5.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Slim visueel: vermogensnaald, en altijd open (#432)
 ═══════════════════════════════════════════════════════════

 - Bij elektrische aandrijving (hybride/EV, of accurijden gezien) en bij
   elke auto zonder toerental: een vermogensnaald. Rechts van nul de vraag
   uit het gaspedaal (015A → 0149 → 014A, zelflerend vanaf de rust), links
   een groene laadzone uit de vertraging bij gas los. Geen kW: dat meet
   standaard-OBD op een hybride niet.
 - "Slim visueel heeft het toerental nodig" is weg: zonder naald gaat de
   meter gewoon open, met een lege naald.
 - Handleiding (Live → Visueel), test-visueel.js, bproef-visueel.js deel 7
   en 8, zes mutaties, blok 5.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Hybride in de basis: motortype, testgroepen, motortests (#430)
 ═══════════════════════════════════════════════════════════

 - detectEngineType(): hybride eerst, 'ev' alleen als los woord. "HEV",
   "e:HEV", "PHEV" en "Revolution" heetten volledig elektrisch.
 - Systeemtest: groepen uit twee vragen (verbrandingsmotor? elektrische
   aandrijving?). Een hybride houdt zijn vijf benzinetests.
 - Systeemtest: een test over de motor meet alleen bij een motor die al
   6 s draait (motor:true, plus alles op stationair/draaiend). Geen twijfel
   meer op accurijden of vlak na een start; geldt voor elke auto.
 - test-hybridebasis.js, zes mutaties, blok 5.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Volledig onderzoek: meten, vragen, uitsluiten, doorpakken (#428)
 ═══════════════════════════════════════════════════════════

 - pidlane-onderzoek.js (PLOnderzoek), nieuw. Verdenkingen uit de klacht,
   daarna steeds de stap die de meeste kan scheiden: meten (live grafiekjes,
   opdrachten zoals 2500 tpm vasthouden), vragen (rookkleur, startgedrag)
   en foutcodes. Nieuwe richting op een code, samenhang (accu → dynamo),
   één keer verbreden, eerlijk "niets gevonden". AI als tweede mening.
 - Ingangen: bovenaan het plan van "Er is iets mis", en "Oorzaak laten
   zoeken" in Check mijn auto (die uitlezing is dan de eerste stap).
   PLFoutcodes.leesStil() leest uit zonder venster.
 - Handleiding: onderwerp "Volledig onderzoek". test-onderzoek.js,
   bproef-onderzoek.js, acht mutaties, blok 5.
 - Klant ziet alleen de huidige stap en de conclusie; verdenkingenbord en
   tijdlijn alleen in de garagemodus. De laaddrukproef (vol optrekken tijdens
   het rijden) alleen in de garagemodus. Twee mutaties erbij.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Check mijn auto: software als oorzaak bij de keuringsstatus (#426)
 ═══════════════════════════════════════════════════════════

 - Het readiness-blok toont "🧩 Mogelijk software, geen kapot onderdeel" met
   het bewijs, wat er ingeleerd moet worden, de software voor dit merk en de
   waarschuwing. Ook in de bewaartekst. Niet direct na zelf wissen.
 - softwareOorzaken: P2452–P2455 en P2463 eruit (sensor/vol filter, geen
   software); zwakke functies tellen alleen na een vervanging, zodat een
   gewone P0420 geen "adaptaties wissen" wordt.
 - Handleiding Check mijn auto bijgewerkt. Toetsen in test-foutcodes.js en
   test-softwareoorzaak.js, drie mutaties erbij, blok 5 toetst de koppeling.

 ═══════════════════════════════════════════════════════════
 07-10-2026 — Kennis: software/codering als oorzaak, niet de sensor (#426)
 ═══════════════════════════════════════════════════════════

 - pidlane-data.js: SOFTWARE_OORZAKEN — acht inleer-/coderingsfuncties
   (roetfilter, SCR, EGR, gasklep, injectorcodes, adaptaties, ECU, accu) met
   het symptoom dat ze verklaren en de tools per merkgroep (SOFTWARE_TOOLS).
 - softwareOorzaken(ctx) geeft alleen functies mét bewijs: een monitor die na
   300 km / 15× warmdraaien nog hangt, een foutcode, een afwijkend VIN of een
   vervangen onderdeel. Nog geen UI; koppeling volgt in #426.
 - test-softwareoorzaak.js (laadt de echte parseReadiness), drie mutaties,
   blok 5.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — Opruimen na de brede controle (geen gedragswijziging)
 ═══════════════════════════════════════════════════════════

 - Weg: het inlogvinkje "Extra logfunctie" (refreshAdminLogRow,
   maybeStartLiveLog), de log-export van het oude logscherm (lcSave, lcSend,
   _lcFullText, _lcLines), selectTrendGroup, changeGraph, bevindingVerborgen,
   de terugval op window.selectedModel en de id's monitorBtn, fontLbl, vlSheet.
 - pidlane.css: 151 declaraties die een latere regel met dezelfde selector
   altijd overschreef; 20 regels daardoor leeg en weg. Berekende stijl van
   10.037 element-toestanden in licht en donker vóór en na gelijk.
 - Elke lege catch in config.js en index.html heeft een reden; vijf knoppen
   en vier stappen van hard herladen waarschuwen nu in de console.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — Brede controle: vier stille fouten en twee eigen restpunten
 ═══════════════════════════════════════════════════════════

 - Bugmelding: "Verbinding" was altijd "onbekend" (las isConnected, die niet
   bestaat). Nu _bugVerbinding(): verbonden, niet verbonden of demo.
 - Rapport zonder AI: de regel over PIDs zonder data verscheen nooit (las
   window._deadPIDs). Nu _rapportDodePids() op _pidDead.
 - Uitloggen stopt het live-log; het schreef door in de volgende sessie.
 - pidlane-data.js: 017C en A6 stonden twee keer; test-dubbelesleutels.js.
 - Banden: met de ronde van vijf minuten is een meting na 15 min dof, niet
   pas na 30. Commentaar bij EIGEN_PER_RONDE bijgewerkt.
 - test-meldregels.js, test-afmelden.js, test-banden.js, zeven mutaties.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — Slim visueel: een lege plek zelf invullen, Nulstellen op Telemetrie
 ═══════════════════════════════════════════════════════════

 - Een plek met `zoek` neemt ook een eigen sensor met een passende naam:
   op de CX-5 komt de eigen motorolietemperatuur (221310) op OLIE.
 - Tik op een plek: kies zelf een sensor, of Automatisch. Bewaard per
   toestel (pl_vis_keuze); een andere grootheid krijgt eigen naam en schaal.
   Een keuze staat nooit dubbel in beeld.
 - Telemetrie: knop Nulstellen onder het scherm. Handleiding bijgewerkt.
 - test-visprofiel.js, nieuwe bproef-visplek.js, vijf mutaties; twee oude
   mutatie-ankers hersteld.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — Banden: één regel in de sensorlijst, elke vijf minuten (#396)
 ═══════════════════════════════════════════════════════════

 - De acht band-PIDs staan in de sensorlijst als één regel "🛞 Banden"
   (PLBanden.lijstRegel). Het vinkje is een voorkeur van het toestel, geen
   PID in activePIDs.
 - Aangevinkt (standaard) vraagt PLBanden.tik() de banden elke vijf minuten
   in één busbeurt, ook tijdens het rijden: zo'n 1,2 s per vijf minuten.
   Niet midden in het verbinden (_plVerbindingKlaar).
 - test-banden.js, bproef-banden.js, vijf mutaties.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — Banden op verzoek, buiten de pollus (#396)
 ═══════════════════════════════════════════════════════════

 - Een band zonder gekozen tempo staat op 'opverzoek': niet in pidsDueNow,
   niet als acht tegels in de keuzelijst. Een gekozen tempo wint nog steeds.
 - PLBanden.ververs() vraagt de druk- en temperatuur-PIDs in één busbeurt:
   bij het openen van het bandenvenster, met ↻, en één keer per verbinding
   als Slim visueel opbouwt (eenmaal()). Dof na een half uur in plaats van
   drie minuten.
 - test-banden.js, test-mode21.js, bproef-banden.js, zeven mutaties,
   blok 5-proef.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — ATST-geheugen is geen ratel meer (#414)
 ═══════════════════════════════════════════════════════════

 - plStUitGeheugen() neemt alleen een bewaarde koude meting (bron
   'gemeten') over; 'bijgestuurd' en 'geheugen' tellen niet meer.
 - PLVerbind.bewaar() schrijft als ATST de koude meting van deze verbinding
   (plVerbindVoorGeheugen); zonder meting blijft de vorige staan.
 - noteAntwoord() bewaart niet meer: bijsturen geldt voor de verbinding.
 - test-verbindprofiel.js (ook PLVerbind.bewaar uit de echte bron), vier
   mutaties, blok 5-proef. PIDLANE-VERBINDPROFIEL.md §10 herzien.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — Telemetrie telt alleen mee als de telefoon vast zit (#418)
 ═══════════════════════════════════════════════════════════

 - PLTelemetrie.houder(): vast = genuld, binnen 15° van de nulstand, wiebel
   buiten de gierrichting ≤ 8°/s (als vector gefilterd), en dat 5 s lang.
 - Niet vast: geen updPID, dus niets in pidVals/pidHist, rapport, AI,
   bevindingen, delen of rijsituatie; ook geen rijrichting leren. Alleen
   applyG, met de tegel en Slim visueel als `los` (heel dof, met de reden).
 - Zonder Nulstellen telt telemetrie dus nooit mee. De stale-watchdog slaat
   een losse tegel over.
 - test-telemetrie.js, test-visprofiel.js, bproef-telemetrie.js, vijf
   mutaties, blok 5-proef en CAMPAGNE-stap 4C. Handleiding bijgewerkt.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — Beheerdersdemo: als admin rekent de AI echt (#409)
 ═══════════════════════════════════════════════════════════

 - PLDemo.volledig(): demo én ingelogd als admin. Dan geeft apiFetch geen
   voorbeeldrapport maar vraagt de echte AI, laat plFetch /v1/messages door
   (netBesluit met beheer) en slaat plBewaarBestand echt op.
 - Blijft dicht, ook voor de beheerder: referentiemetingen, de applog,
   tegoed inwisselen, schrijven op het klantplatform en de opslag op het
   toestel. Een demo zonder login is nooit volledig.
 - Melding bij de start; test-demozandbak.js, zeven mutaties, blok 5-proef.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — Diesel: eigen sensoren in de weergaven van Slim visueel (#393)
 ═══════════════════════════════════════════════════════════

 - Een plek in PLVisProfiel kan diesel:{…} dragen; op een diesel komen die
   velden in de plaats (plekkenVan, indeling(id, mag, motor)).
 - Emissie: roetfilter (drukverschil, temperatuur, regeneratie), NOx, AdBlue
   en EGR in plaats van lambda, trims en O₂ na de kat. Motor: laaddruk,
   injectie, gaspedaal, toerenring tot 6000. Verbruik: laaddruk in plaats van
   luchtmassa. Temperatuur: uitlaatgas in plaats van katalysator.
 - Full function test oordeelt op de dieselplekken.
 - test-visprofiel.js, test-functietest.js, vijf mutaties, blok 5-proef.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — Slim visueel: accu blijft staan, auto i.p.v. VIN, donker emissiescherm, één telemetriescherm; privacy en releasetekst 3.2
 ═══════════════════════════════════════════════════════════

 - Acculampje: een oude spanning (0142 wordt traag gevraagd) maakte het
   lampje leeg tot de volgende meting. Nu blijft het staan, dof als de
   waarde oud is; pas na een minuut zonder antwoord weg (accuGetal).
 - Rechtsboven: showVtag() bewaart nooit een VIN als naam; updateVehicleCard
   gaf de VIN als eerste mee (tooltip voertuigchip, ingeklapte voertuigkop).
 - Emissiescherm (lambda, stijl licht) is donker in plaats van wit.
 - Telemetrie: horizon, G-cirkel en de auto van opzij en achteren op één
   scherm (profiel telemetrie); een oude keuze tel-* komt daar vanzelf uit.
 - Privacy: telefoonsensoren, Bluetooth aanzetten en de demo in
   privacy.html, het privacyscherm, de handleiding en PLAY-INZENDING §3/§11.
   Akkoordteksten ongewijzigd: de referentiedata verandert niet.
 - Releasetekst 3.2 in PLAY-INZENDING §14; §16b met de nieuwe toestelpunten.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — G-cirkel: zij-G volgt het gevoel, piekballetje van 3 s (#407)
 ═══════════════════════════════════════════════════════════

 - Rechts sturen zet de stip links: waar je lijf heen gaat. TL04 meet nog
   steeds de kracht op de auto; alleen de tekening (gPunt) spiegelt.
 - Een ring blijft 3 s op de grootste gecombineerde uitslag staan, en valt
   daarna terug. Nulstellen wist hem (event pl:telemetrie-genuld).
 - test-visprofiel.js, vier mutaties, blok 5-proef.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — Berekende PIDs houden hun bronnen (#392)
 ═══════════════════════════════════════════════════════════

 - bronnenErbij() zet een ontbrekende bron opnieuw aan, hoogstens eens per
   5 s, in plaats van één keer per sessie. Een weigering van de poort komt
   één keer per verbinding in het log.
 - Gekozen maar niet te berekenen op deze auto: het log zegt welke bron de
   auto niet meldt, in plaats van een tegel die zonder uitleg leeg blijft.
 - test-berekendbronnen.js, vier mutaties, blok 5-proef.

 ═══════════════════════════════════════════════════════════
 03-10-2026 — Verbindprofiel: elke auto ingemeten (#388, PR #390; bijgeschreven 06-10, #391)
 ═══════════════════════════════════════════════════════════

 - Koude poort (PLVerbind.koudePoort): direct na ATSP<id> en vóór het VIN
   gemeten ATST (2× de op één na traagste rondrit, 0x0C…0xFF) en
   startgroep, in plaats van 400 ms en groep 3 voor iedereen.
 - Weigerboekhouding: een door de ELM-poort geweigerd verzoek telt niet
   meer als lege batch.
 - Geheugen: de ATST per VIN in het voertuigprofiel (veld verbind), alleen
   omhoog. Zie #414: dat werkt als een ratel.
 - Kennisbank in D1: tabel verbindprofielen via /verbind/profiel, onder het
   VIN-pseudoniem; toestemmingstekst bijgewerkt (AKKOORD_TEKST_SINDS 03-10).
 - Handleiding: "Verbinding inmeten…" uitgelegd in Verbinden met de auto.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — Koopcheck laat het kenteken van je eigen auto staan (#331)
 ═══════════════════════════════════════════════════════════

 - koopRdwLookup() schrijft niet meer in pl_kenteken. Het rapport leest het
   gecheckte kenteken uit _koopRdwData._kent, de terugroepcheck uit het
   event pl:kenteken-geladen.
 - test-koopcheck-kenteken.js, één mutatie, blok 5-proef.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — Bluetooth uit: meteen een melding, geen anderhalve minuut scannen (#359)
 ═══════════════════════════════════════════════════════════

 - Vóór de keten (alleen in de app): staat Bluetooth uit, dan vraagt Android
   om aanzetten (BLE requestEnable, anders SPP enable). Blijft hij uit, dan
   start de keten niet en zegt de melding "Bluetooth staat uit".
 - In de keten: een "Bluetooth is disabled" stopt hem, zonder BLE-scan en
   zonder tweede ronde. De SPP-scan leest die fout niet meer als
   "geen adapter gevonden".
 - Is de stand niet te lezen, dan loopt de keten zoals altijd.
 - test-btuit.js, zes mutaties, blok 5-proef.

 ═══════════════════════════════════════════════════════════
 06-10-2026 — Demo stuurt geen logregels meer; geen 401-lus zonder sessie (#360)
 ═══════════════════════════════════════════════════════════

 - logToSheets() schrijft in de demo niets meer; de demopoort weigert
   /airtable/log ook. Tot nu gingen demoregels met Demo=true naar D1.
 - flushAirtable() verstuurt niet zonder sessie, en na een 401 niet opnieuw
   met hetzelfde token. De buffer (max 200) gaat mee met de volgende sessie.
 - Een demoweigering gooit de batch weg in plaats van hem te bewaren.
 - test-livelog.js, test-demoopslag.js, test-demozandbak.js, vijf mutaties.
 06-10-2026 — Versie 3.2.0 voor de openbare release
 ═══════════════════════════════════════════════════════════

 - Gesloten test geslaagd (#408). APP_VERSION en package.json naar 3.2.0;
   PLAY-INZENDING.md §16 bevestigt 3.2.0, de mutatie in plmutate.sh schuift
   mee naar 3.3.0.
 - Eigen PIDs krijgen een standaardbereik (#370), van branch
   ccr-8e6efa44 meegenomen en bijgesteld naar het issue: bandtemperatuur
   rood vanaf 65 op een balk tot 80 °C (nieuw veld balkVol, gelezen door
   slimTempSchaal), bandenspanning 0…4 bar met rood onder 1,5 en vanaf 3,5,
   motorolietemperatuur als 015C.

 ═══════════════════════════════════════════════════════════
 05-10-2026 — Nieuwe sensorgroep Telemetrie: helling en kanteling van de telefoon
 ═══════════════════════════════════════════════════════════

 - Nieuw pidlane-telemetrie.js (PLTelemetrie): TL01 helling en TL02
   kanteling uit de oriëntatiesensor van het toestel, in graden.
 - Knop Nulstellen in de groepsbalk: auto stil op vlakke grond, de huidige
   stand wordt 0°. Zonder nulstand de ruwe hoek van de telefoon.
 - Alleen in de keuzelijst als het toestel oriëntatie meldt.
 - Gaat nooit de bus op: pollus slaat TL over, sendCmd weigert en telt.
 - test-telemetrie.js, bproef-telemetrie.js, zes mutaties, blok 5-proef.

 ═══════════════════════════════════════════════════════════
 05-10-2026 — Full survey wordt Full function test: één cijfer 1–10
 ═══════════════════════════════════════════════════════════

 - Nieuw pidlane-functietest.js (PLFunctieTest, puur): oordeel over
   verbinding (fouten, tempo, spreiding, vertraagt de ECU onder belasting),
   basisgegevens (VIN, CALID, readiness, accuspanning, brandstof ECU tegen
   RDW), PID-dekking, weergaven en afwijkende antwoorden.
 - Per brandstof welke weergave van Slim visueel bruikbaar is: diesel
   zonder 015E → Verbruik ongeschikt, diesel → Emissie ongeschikt, één
   temperatuursensor → Temperatuur ongeschikt.
 - Per PID de categorie en de weergaven; configuratie tegen de meting
   (strategie, groepsgrootte per PID-tijd, ATST, vast protocol, adapter).
 - Batchtrap meet nu ook de tijd. Cijfer in survey-JSON (functietest).
 - test-functietest.js (23 toetsen, tegenproeven), blok 5-proef.

 ═══════════════════════════════════════════════════════════
 04-10-2026 — Rit-monitor: geen meldingen meer bij schakelen, 👎 Klopt niet (#400)
 ═══════════════════════════════════════════════════════════

 - Schakelen wordt herkend over vier metingen in plaats van één buurpaar,
   toerental en snelheid worden op tijd gekoppeld, en de aandrijflijn-tests
   en de bevroren-waarde-watcher zwijgen 8 s na een schakelmoment
   (eigen verhouding of PLGear).
 - Bevroren: referentie 200 rpm én 8% (was 40 rpm), niet bij gas los.
 - Laadspanning laag pas onder 12,7 V over 30 s (slimme dynamo); koelwater
   pas boven 112 °C gedurende 20 s, of meteen boven 118 °C. PIEK-limiet
   laadspanning 4 V/s. Trim niet bij brandstofafsluiting of vol gas;
   thermostaat pas na 8 min echt rijden.
 - TEST:ECT_HOOG en TEST:LAADSPANNING tellen nu als ernstig in het scherm.
 - Bij elke melding 👎 Klopt niet met een reden; bewaard aan de melding,
   lokaal (pl_mon_feedback) en in de logtabel (Type melding_feedback).
 - test-watcherschakel.js (25 toetsen, rood op de oude code), tien
   mutaties, blok 5-proef #400.

 ═══════════════════════════════════════════════════════════
 01-10-2026 — Logarchief: oude logregels per rit samengevat, dan gewist
 ═══════════════════════════════════════════════════════════

 - Nieuwe tabel log_archief: per rit (of per dag zonder rit) één rij met
   tijdvak, aantallen, soorten, issues, versie/adapter en de fouten en
   LET OP's ontdubbeld met hun aantal. Daarna gaan de ruwe regels weg, in
   dezelfde transactie. Uitkomsten blijven staan; geen e-mail of VIN.
 - beheer.html → Database → 📦 Logarchief: proefdraaien, dan archiveren
   (standaard ouder dan 7 dagen), en het archief bekijken. Een gearchiveerde
   rit openen toont zijn samenvatting.
 - De nachtronde doet hetzelfde zodra LOG_BEWAARDAGEN in het dashboard staat.
 - test-logarchief.js (32 toetsen, echte SQLite), deel 7b van
   bproef-beheerpagina.js, zeven mutaties.
 02-10-2026 — UI-ronde uit het gebruik: rustiger, en vijf weergaven
 ═══════════════════════════════════════════════════════════

 - Slim visueel: vijf weergaven met een knop Volgende boven de meter —
   basis (ongewijzigd), temperatuur (glas), emissie (licht), verbruik
   (digitaal), motor (neon). Nieuw: pidlane-visprofiel.js, test-visprofiel.js.
 - Bevindingen: per bevinding verbergen met ✕ of een dubbeltik, ook in Slim
   visueel; terughalen in "bekijk alles". De AI krijgt ze gewoon mee.
 - Instellingen: garagemodus, Check na verbinden en Uitleg bij knoppen staan
   standaard uit; Check na verbinden gaat na één keer vanzelf weer uit.
 - Live: de deel-chip staat in de topbalk; de aandrijfregel ("Rijdt op
   motor") is een rustige regel met stipje en icoon in plaats van een oranje
   blok; vier actieknoppen twee bij twee; snelkoppelingen onder de meter op
   één regel.
 - Statusmenu: Auto-dossier, Adapter (OBD), AI-uitleg en Achtergrond, elk met
   een regel uitleg en de stand van nu.
 - Diagnose delen: eerst kiezen hoe (code, QR, link, plakcode), dan staat
   alleen die manier in beeld.
 - Verbindingsvenster: alle knoppen in één vak onderaan dat blijft plakken.
 - Admin-menu: de acht SPP-proeven onder één regel SPP-controle.
 - Startscherm: de vier tegels hebben hun achtergrondbeelden terug.
 - Verbindscherm en loginpagina rustiger: één hoofdknop, kleiner logo; de
   login is een glazen kaart in plaats van de overvolle cirkel.
 - Sensorkeuze: voertuigblok ingeklapt met de autonaam in de kop, doelen als
   chips die bij de motorsoort passen, een teller die waarschuwt bij te veel.
 - Blok 5: twee proeven (rondgang van de weergaven, de zeef van verbergen).

 ═══════════════════════════════════════════════════════════
 01-10-2026 — Vóór de productierelease: demo, e-mailadres, verwijderen
 ═══════════════════════════════════════════════════════════

 - Demo-zandbak: pl_tok en pl_uitloggen gaan door de laag. Uitloggen tijdens
   de demo wiste het sessietoken alleen in de laag; plDemoStop() gooide die
   weg, en bij de volgende start was je vanzelf weer ingelogd.
 - Geen e-mailadres meer naar de server: Tester (veldlab) en User (logregels)
   zijn leeg voor een klant, en een adres in de tekst wordt "[e-mail]".
   Beheerder- en testernamen zonder @ blijven staan.
 - Account verwijderen: de nachtelijke opruimer wist ook de logregels en
   veldlabrecords met het e-mailadres van die klant (klantSporenWissen),
   vóór het klantrecord.
 - privacy.html noemt de technische logregels en waar het account staat; de
   zin "je e-mailadres staat niet in die database" klopte sinds #381 niet.
 - PLAY-INZENDING.md: de reviewnotitie (§7) beschrijft de demo zoals hij is
   (voorbeeldrapport, knopnaam na inloggen), Diagnostics staat in Data safety
   (§11), §12 en §16c bijgewerkt.
 - Blok 5: twee proeven (doorlaatlijst van de zandbak, geen e-mailadres in
   een veldlabrecord).

 ═══════════════════════════════════════════════════════════
 01-10-2026 — De meetrit: elke rit-vraag een getal (testrun 8.7)
 ═══════════════════════════════════════════════════════════

 - #337: een berekende PID rekent alleen nog met bronnen die hoogstens 1 s
   uit elkaar liggen (SAMEN_MS); anders slaat hij die tik over en telt dat.
   Verbruik nu (CA03) klemt op het bereik van zijn tegel (50), niet op 99.
 - #338: Slim visueel oordeelt over het tempo van het pedaal alleen over
   de laatste minuut onafgebroken rijden met de meter in beeld; stilstand,
   achtergrond, beeld-in-beeld en een buspauze beginnen het venster opnieuw.
   Elke herbouw krijgt een reden (openen, selectie, testrun, indeling,
   scherm); de knipperproef telt alleen indeling en scherm.
 - App-maten voor de meetopdracht (witte lijst in pidlane-opdracht.js):
   adapter-* (#302), groep-a/b/c-* (#333, de groepsproef legt nu zelf vast
   of hij koud, warm of rijdend liep), berekend-* (#337), visueel-* (#338),
   check-door-* (#376).
 - Beheer: een app-maat in een opdracht staat er niet meer als "undefined —
   staat niet in sensoren".
 - Blok 5: één proef dat elke app-maat in de draaiende app een getal of
   null geeft. CAMPAGNE beschrijft de meetrit.
 - Tests: test-berekend, test-visueel, test-adapterpaneel, test-foutcodes en
   test-opdrachtappmaat uitgebreid; 16 mutaties erbij.

 ═══════════════════════════════════════════════════════════
 01-10-2026 — Na #381: namen opgeruimd
 ═══════════════════════════════════════════════════════════

 - Functies in de Worker die nog naar Airtable heetten, hebben een naam die
   zegt wat ze doen. De routes /airtable/… blijven: oudere APK's kennen ze.
 - Het saldo blijft via het slot lopen; afboeken in één SQL-bewerking levert
   geen extra veiligheid op (uitleg in het archief).

 ═══════════════════════════════════════════════════════════
 01-10-2026 — Alles uit Airtable naar Cloudflare D1 (#327)
 ═══════════════════════════════════════════════════════════

 - Gebruikers, Klanten (met saldo), activatiecodes, het kasboek, de
   veldlab-sessies en de referentiewaarden staan nu in D1. Elke tabel zet
   zichzelf bij de eerste aanroep één keer over uit Airtable; daarna leest
   de Worker Airtable niet meer. Wijzigen gaat via beheer.html.
 - Eén laag in worker.js (D1_TABELLEN, d1Tabel, atZoek/atPatch/…) met
   records in dezelfde vorm als Airtable en de oude rec-id's.
 - Weg, omdat ze er alleen waren om Airtable-calls te sparen: het onthouden
   van de gebruikerstabel (28-09) en van de accountstatus bij stand (vanochtend,
   PR #380). Blokkeren is weer meteen dicht.
 - Een uitgevinkte gebruiker (Active uit) komt er nu echt niet meer in; bij
   Airtable kwam een uitgevinkt vakje nooit als false terug.
 - De Airtable-motor van /admin/tabel en formuleTekst() zijn weg: elke
   zoekterm gaat als gebonden parameter mee.
 - Tests: test-d1laag.js, test-veldlabroute.js (nieuw); test-inlogcache,
   test-klantstatus, test-adminbron en test-formule-escape herschreven op de
   echte laag (pltest-d1.js). Mutaties bijgewerkt.

 ═══════════════════════════════════════════════════════════
 01-10-2026 — Minder Airtable-calls: AppConfig in D1, accountstatus onthouden (#327)
 ═══════════════════════════════════════════════════════════

 - De werkruimte stond op dag 1 van de maand al op 139 van de 1.000 calls.
   De vaste posten waren /api/config bij elke opstart en de klantcontrole
   bij elke verversing van Mijn voertuigen, niet de AI (één analyse per week).
 - AppConfig staat nu in D1. De Worker zet de Airtable-tabel één keer zelf
   over; daarna leest hij hem niet meer. Wijzigen gaat via beheer, niet
   meer in Airtable. test-appconfig.js, vijf mutaties.
 - De accountstatus bij "stand" wordt vijf minuten onthouden. Blokkeren via
   beheer werkt meteen; direct in Airtable binnen vijf minuten. Verwijderd
   blijft meteen dicht. test-klantstatus.js, drie mutaties.

 ═══════════════════════════════════════════════════════════
 01-10-2026 — BT-logvenster begrensd: logregels worden niet meer duurder (#302)
 ═══════════════════════════════════════════════════════════

 - btDiag() kapte de array af op 1400 regels, maar het element #btLog
   groeide met elke regel mee en werd nooit ingekort. Gemeten in Chromium:
   0,3 ms per regel bij 1.000 regels, 10 ms bij 31.000 — tien minuten
   pollen. Nu houdt het venster de laatste 300 (BTLOG_DOM); per regel
   blijft het ~0,25 ms. test-btlogdom.js, blok 5, twee mutaties.

 ═══════════════════════════════════════════════════════════
 01-10-2026 — SPP: geen opruimread meer vóór elk commando
 ═══════════════════════════════════════════════════════════

 - In eventstand ging er vóór elk commando een read() over de brug om een
   half antwoord weg te halen. In ~900 verzoeken vond hij nooit iets, en
   tussen twee verzoeken zat 70–100 ms bij een adapter van 27–34 ms.
 - Nu alleen na een onnette ronde: een time-out, een mislukte write of een
   antwoord waar niemand op wachtte. pl_spp_flush = 1 zet de oude stand
   terug om het verschil te meten. test-sppevents.js, blok 5, twee mutaties.

 ═══════════════════════════════════════════════════════════
 01-10-2026 — Check na verbinden: niets gevonden → vanzelf naar Live
 ═══════════════════════════════════════════════════════════

 - Na het verbinden bleef Check mijn auto staan, ook bij "Alles in orde";
   de klant landde op de keuringsstatus (#376).
 - Opende de check vanzelf en is de uitlezing schoon (alles gelezen, geen
   codes, geen motorlampje), dan loopt een balk 5 s leeg en gaat de app
   naar Live in Slim visueel. Zelftests die niet klaar zijn houden dat
   niet tegen. "Nu naar Live", "Blijf hier", of een tik in het venster.
 - Niet bij codes, niet in de garagemodus, niet als je zelf op de knop
   tikte. test-foutcodes.js, bproef-foutcodes.js, blok 5 en drie mutaties.

 ═══════════════════════════════════════════════════════════
 01-10-2026 — Startscherm: vaste achtergrond in plaats van animatie
 ═══════════════════════════════════════════════════════════

 - De achtergrond van het startscherm bewoog eindeloos (ademende gloed,
   lopende hartslag, sweepende naald, twee drop-shadow-filters). Op de
   telefoon hertekende dat het scherm bij elk beeldje; RenderThread en
   GPU-draad stonden bovenaan in de draadmeting (#302).
 - Nu een vast plaatje in dezelfde beeldtaal: pidlane-start-achtergrond-
   staand.svg voor de telefoon, pidlane-start-achtergrond.svg liggend.
 - bproef-navigatie.js: geen eindeloze animatie in het startscherm, met
   een mutatie in plmutate.sh.
 01-10-2026 — Live: Overzicht vervangt Trends, Getallen en Puntjes
 ═══════════════════════════════════════════════════════════

 - Eén weergave Overzicht: elke sensor als getal met een gekleurd puntje,
   en hoogstens vier trendlijnen. Met 📈 op een tegel zet je er zelf een
   vast; de vrije plekken krijgen de sensoren die het meest bewegen.
 - Trendlijnen worden gebundeld getekend, hoogstens vier keer per seconde
   en alleen als ze in beeld zijn (ook in Slim). In Trends hertekende elke
   meetwaarde een lijn; op de telefoon liep de responstijd daarop in tien
   minuten op van 43 naar 120 ms (#302).
 - Een opgeslagen voorkeur Trends/Getallen/Puntjes (toestel of account)
   wordt vanzelf Overzicht. worker.js accepteert 'overzicht' (KP_VOORKEUR).
 - Tests: test-overzicht.js (nieuw), test-slimmeweergave.js,
   test-verbergen.js, drie browserproeven, vier mutaties, blok 5.
 30-09-2026 — Banden en olie (eigen PIDs) krijgen een schaal
 ═══════════════════════════════════════════════════════════

 - Een eigen PID zonder bereik stond op −1e9…1e9. In Slim werd de balk
   dan gearceerd ("grove schaal") en bleef hij leeg.
 - Bandtemperatuur: schaal tot 80 °C, oranje vanaf 65, rood bij 80.
 - Bandenspanning: schaal 0–3,5 bar (of het equivalent in psi of kPa),
   zonder vaste grens — het oordeel blijft de vergelijking van de vier
   banden. Kleine schommelingen tellen daardoor niet meer als "beweegt".
 - Motorolietemperatuur: dezelfde schaal en grenzen als de standaard-PID
   015C (tot 150 °C, oranje vanaf 130).
 - Een zelf ingevuld bereik gaat voor; de grenzen blijven dan gelden.
 - Proef in blok 5.

 ═══════════════════════════════════════════════════════════
 30-09-2026 — Slim visueel: balkjes, een acculampje en een autootje (#371)
 ═══════════════════════════════════════════════════════════

 - Onder de snelheid staan nu drie rijen onder elkaar: koelwater,
   gaspedaal en brandstof, elk met een icoon, een liggend balkje en het
   getal erachter. Groen als het goed is, blauw bij een koude motor,
   oranje en rood bij de grens; het pedaal vult blauw.
 - De accu staat rechtsboven als lampje, net als de motor links: icoon,
   spanning en een balkje. Op een hybride twee accu's in één lampje — de
   aandrijfaccu met zijn percentage en het 12V-net met zijn spanning.
 - De onderboog is alleen nog olie of laaddruk. Heeft de auto geen van
   beide, dan is er geen onderboog en is de meter zo hoog als de cirkel.
 - Het bandenlampje rechtsonder is het autootje uit het bandenvenster in
   het klein: vier groene wielen als alles goed is, per wiel oranje of rood.
 - Onder Slim visueel staan Opnemen en Bewaken niet meer: de waakronde en
   de bulk-recorder staan al in het vak onder de meter. In de andere
   weergaven blijven ze staan.
 - Proef in blok 5: de rijen, het acculampje (ook dubbel) en het scherm.

 ═══════════════════════════════════════════════════════════
 01-10-2026 — De SPP-proefkaart valt niet meer achter de knoppenbalk
 ═══════════════════════════════════════════════════════════

 - De uitslag van "🧵 SPP: draden meten" stond met bottom:12px tegen de
   onderrand; de regel met de drukste draden viel achter de Android-
   knoppenbalk (#302). Nu met dezelfde ondergrens als de rest (--pl-sab).
 - De kaart staat in bproef-schermranden.js, met een mutatie in plmutate.sh.

 ═══════════════════════════════════════════════════════════
 30-09-2026 — Uitleg bij knoppen: een glazen i in plaats van een oranje !
 ═══════════════════════════════════════════════════════════

 - Het kleine oranje uitroepteken op knoppen is een doorzichtig glazen
   rondje met een schuine i geworden (gekozen uit vijf voorbeelden).
   Op donkere en gekleurde knoppen wit glas, in het lichte thema donker
   getint glas.
 - Het menu-item heet nu "ⓘ Uitleg bij knoppen"; de handleiding spreekt
   van i-rondjes in plaats van uitroeptekens.
 - Proef in blok 5: elk rondje draagt een kleine i met glans.

 ═══════════════════════════════════════════════════════════
 30-09-2026 — De meetopdracht van #319 meet beeld-in-beeld zelf
 ═══════════════════════════════════════════════════════════

 - De opdracht "Meet de app door in beeld-in-beeld?" wachtte op een stap
   "PiP 2 min aan" die niets in de app zet. Vier ritten met beeld-in-beeld
   bleven daardoor op "nog niet" staan, terwijl de meting doorliep.
 - Twee nieuwe app-maten uit PLPip: pip-langst-s (langste periode klein met
   een verbonden auto) en pip-gat-s (langste stilte daarin). De opdracht in
   D1 gaat daarop over zodra dit live staat.
 - Tests: test-pip.js deel 8, test-opdrachtappmaat.js deel 2 en 4, twee
   mutaties in plmutate.sh en een proef in blok 5.

 ═══════════════════════════════════════════════════════════
 30-09-2026 — Bugmelding stuurt het VIN-pseudoniem
 ═══════════════════════════════════════════════════════════

 - Een bugmelding (🐞 Meld een bug) stuurde het chassisnummer
   ruw mee naar de logtabel, en het venster toonde het volledige nummer
   bij "Automatisch meegestuurd". Nu gaat er hetzelfde WMI:pseudoniem
   mee als in de logkolom, en het venster toont precies dat.
 - De e-mailknop in dat venster stuurde nooit een chassisnummer mee; dat
   blijft zo.
 - Nieuwe test: test-bugmelding-vin.js, met twee mutaties in plmutate.sh
   en een proef in blok 5.

 ═══════════════════════════════════════════════════════════
 30-09-2026 — Een handleiding in de app
 ═══════════════════════════════════════════════════════════

 - Meer → 📘 Handleiding opent een venster met de uitleg van de app:
   beginnen, verbinden, het startscherm, Check mijn auto, Live, delen en
   meekijken, rapporten, het menu Meer, account en privacy. Met een
   zoekveld, een inhoudsopgave en veelgestelde vragen.
 - Op het inlogscherm en in het verbindscherm staat een link ernaartoe:
   wie niet kan inloggen of verbinden, heeft het menu nog niet.
 - Bij elf knoppen staat een klein geel uitroepteken. Een tik erop geeft
   een korte uitleg en drukt de knop zelf niet in. Uit te zetten met
   Meer → ❗ Uitleg bij knoppen.
 - Contact loopt via de bestaande "Meld een bug"; er is geen tweede
   melder bijgekomen.
 - De tekst staat los van de code in pidlane-help-inhoud.js. test-help.js
   wordt rood als een knop met een uitroepteken hernoemd wordt, als een
   menulabel in de tekst niet meer bestaat, of als er een prijs in komt.

 ═══════════════════════════════════════════════════════════
 30-09-2026 — Snelle sensoren op hun eigen tempo
 ═══════════════════════════════════════════════════════════

 - De app vroeg de snelle sensoren (toerental, snelheid, gas) minder
   vaak dan beloofd: 5 keer per seconde in plaats van 8. De adapter had
   ruimte over — het adapterpaneel stond op 10 verzoeken/s bij 53% bus
   bezet. De app plant nu elke ronde op het moment dat de eerste sensor
   aan de beurt is, in plaats van op een vaste tik van 100 ms. Met
   dezelfde adapter gaat dat naar ±17 verzoeken/s.
 - Wie de bus even wil (monitor, waakronde) terwijl de app sensoren
   leest, wacht nu tot die ronde klaar is en gaat dan voor. Daarvoor
   sloeg hij zijn beurt over, en met de drukkere bus zou dat bijna
   altijd gebeuren.
 - De snelheidsproef (Admin-menu) oordeelt nu op de responstijd van de
   adapter (doel: binnen 80 ms) in plaats van op 10 verzoeken/s. Het
   aantal verzoeken en de bezetting staan erbij als context: dat tempo
   komt uit de app, niet uit de verbinding.

 ═══════════════════════════════════════════════════════════
 30-09-2026 — Wegvegen is geen herstart
 ═══════════════════════════════════════════════════════════

 - Met de meetdienst aan blijft de app na wegvegen bij "recente apps"
   gewoon draaien; alleen het scherm begint opnieuw. Draaiende draden
   van #352 bleven daardoor bestaan, en de snelheidsproef telde het als
   herstart. De app kent nu het proces zelf (pid en starttijd).
 - Nieuwe knop onder Meer → Admin: 🧹 SPP: proces beëindigen. Die sluit
   de verbinding en de meetdienst netjes en stopt dan het proces echt.
 - De draadmeting telde bij de patch-APK één draaiende draad als
   evenveel draaiende als er leesdraden waren; nu per draad.

 ═══════════════════════════════════════════════════════════
 30-09-2026 — Live: knoppen onder de meter, bandenlampje rechtsonder
 ═══════════════════════════════════════════════════════════

 - Opnemen, Deel live, Meekijken (en Bewaken in de garagemodus) staan nu
   onder de meter en de tegels, niet meer ertussen.
 - Het bandenlampje van Slim visueel staat rechtsonder in de hoek van de
   meter.

 ═══════════════════════════════════════════════════════════
 30-09-2026 — Slim visueel: geen N meer bij optrekken, en alleen een zekere versnelling
 ═══════════════════════════════════════════════════════════

 - Bij optrekken rond 1000 tpm stond er soms N op de meter. N komt er nu
   alleen nog als geen enkele versnelling dit toerental bij deze snelheid
   kan geven, zoals bij uitrollen in z'n vrij.
 - De meter toont alleen een versnelling die zeker is. Twijfelt de app,
   dan staat het PidLane-embleem er.

 ═══════════════════════════════════════════════════════════
 30-09-2026 — Na een update niet meer op de knop van de adapter drukken
 ═══════════════════════════════════════════════════════════

 - Een update of herlaad van de app sloot de Bluetooth-verbinding met de
   adapter niet. De OBDLink MX+ neemt maar één verbinding tegelijk aan, en
   weigerde de nieuwe tot je op zijn knop drukte. Vóór elk verbinden vraagt
   de app nu of er nog een verbinding openstaat, en sluit die eerst.
 - Gebeurt dat, dan staat er een regel met 🔌 in het logboek.
 30-09-2026 — Geen ruwe VIN meer in het logboek
 ═══════════════════════════════════════════════════════════

 - "Geen profiel onder pl_vinprof_…" zette de volledige VIN in de BT-log,
   en daarmee in elk gedeeld logboek. Vier meldingen over het
   voertuigprofiel tonen nu alleen de laatste zes tekens.

 ═══════════════════════════════════════════════════════════
 30-09-2026 — Snelheidsproef: stap voor stap zoeken wat de verbinding snel maakt
 ═══════════════════════════════════════════════════════════

 - Nieuw in het Admin-menu: 🚦 Snelheidsproef. Een paneel met zes
   genummerde knoppen die je op volgorde indrukt. Elke stap is één ingreep
   (verse verbinding, andere leesmanier, Bluetooth van de auto uit, adapter
   los en weer vast, app herstarten), met een meting ervoor en erna.
 - Doel: 10 verzoeken per seconde of meer. Na elke stap staat erbij of het
   hielp, en onderaan welke ingreep het was en wat dat betekent.
 - Alles gaat ook als regel naar het logboek.

 ═══════════════════════════════════════════════════════════
 30-09-2026 — De BT-log houdt na een herlaad het begin van déze sessie vast
 ═══════════════════════════════════════════════════════════

 - Na een herlaad bewaarde de BT-log als "begin" de laatste 300 regels van
   de vorige sessie. Verbinden, VIN en de SPP-proef van deze sessie rolden
   er in het midden uit. Die teruggezette regels zijn nu gemerkt en vallen
   bij de eerste afkapping weg; ze staan ook in de spiegel op schijf.
 - De regel "… regels weggelaten (geheugen-cap)" telt nu alles wat er deze
   sessie wegviel, en niet alleen de laatste ronde (die zei altijd ~301).

 ═══════════════════════════════════════════════════════════
 30-09-2026 — De SPP-proef als meetopdracht, en twee schermfouten
 ═══════════════════════════════════════════════════════════

 - De stappen van de SPP-proef (#352) staan niet meer als tekst in de
   testrun. Er is een meetopdracht voor: "Laat een mislukte verbindpoging
   een draad achter?", met drie voorwaarden en twee proeven die de app zelf
   beoordeelt. Een meetopdracht kan daarvoor ook getallen van de app zelf
   opvragen, niet alleen PID's.
 - Rapporten: het rode bolletje en de knoppen vielen op een telefoon met
   grote tekst over de titel. De knoppen staan nu op een eigen regel.
 - Mijn voertuigen → Sensoren: "Dieper zoeken (… werkende codes als
   aanwijzing)" liep buiten de kaart. Kleine knoppen breken nu af.

 ═══════════════════════════════════════════════════════════
 30-09-2026 — De SPP-plugin laat geen draaiende draden meer achter (#352)
 ═══════════════════════════════════════════════════════════

 - De Bluetooth-plugin startte bij elke mislukte verbindpoging toch een
   leesdraad, en die draaide leeg rond tot de app herstartte. Gevolg na
   een herverbinding: alles 10 tot 25 keer trager, telefoon warm, accu
   leeg. De APK-build patcht de plugin nu (plspppatch.js).
 - Meer → Admin heeft zeven SPP-knoppen: draden meten, responstijd meten,
   een mislukte verbinding nabootsen, de volle proef, herverbinden als bij
   een dode socket, patchstatus, en de patch voor de proef aan/uit.
 - Tijdens zo'n proef staat de bus op slot en telt niets als storing. Na
   een proef zonder patch weet het verbindingspaneel dat de sessie
   aangetast is: "herstart de app" in plaats van "opnieuw verbinden", en
   de testrun rekent de oploop niet als #302.

 ═══════════════════════════════════════════════════════════
 29-09-2026 — Nieuw app-icoon: Aurora
 ═══════════════════════════════════════════════════════════

 - Nieuw logo: donker glazen scherm met een hartslag die uitloopt in een
   vonk, op een verloop van groen via cyaan naar violet. Vervangt het oude
   icoon in public/ (PWA, iOS, favicon) en icon-512.png in de wortel.
 - Android: het icoon was klein in de app-lijst, omdat het hele logo met
   zijn eigen donkere vierkant op 64% in de vorm viel. build-apk.yml bouwt
   het adaptieve icoon nu uit drie lagen (icon-voorgrond, icon-achtergrond,
   icon-mono). Het teken vult de veilige zone, en thema-iconen (Android 13+)
   krijgen een eenkleurige versie.

 ═══════════════════════════════════════════════════════════
 29-09-2026 — Herinneringen voor APK en onderhoud, en de lampjesgids
 ═══════════════════════════════════════════════════════════

 - "Herinner me" op de kaart "Niet in de auto?" en bij de kenteken-check:
   een melding op je telefoon 30 dagen en 7 dagen vóór de APK-datum en het
   geplande onderhoud, en op de dag zelf, om 09:00. Ook als de app dicht is
   en na een herstart. Alleen op het toestel, niets via een server
   (pidlane-herinner.js, @capacitor/local-notifications).
 - Werkt pas volledig met een nieuwe APK: de oude schil heeft de
   meldingenplugin niet en toont de herinnering dan in de app.
 - "Lampje brandt?": 25 dashboardlampjes met wat ze betekenen, of je mag
   doorrijden, wat je doet, en wat de adapter erbij kan meten. Zoeken op
   naam of op wat je ziet ("schildpad", "spiraaltje") (pidlane-lampjes.js).
 - privacy.html: een alinea over de herinneringen. build-apk.yml haalt de
   permissie voor exacte alarmen die de plugin meebrengt er weer uit.

 ═══════════════════════════════════════════════════════════
 29-09-2026 — Demo op de schop, en de app zonder adapter
 ═══════════════════════════════════════════════════════════

 - De demo heet in het verbindscherm "Simuleer verbinding — bekijk je
   gegevens". Alles werkt zoals met een adapter, maar er wordt niets bewaard:
   geen instelling, geen rapport in je account, geen rit, geen bestand. Wat de
   demo schrijft, staat in een laag in het geheugen en is weg als hij stopt
   (de zandbak, `PLDemo` in pidlane-demo.js).
 - Geen echte rapporten in de demo: de AI-analyse geeft een voorbeeldrapport
   met de gesimuleerde waarden, kost geen tegoed en verdwijnt bij het stoppen
   uit het rapportenoverzicht.
 - Je eigen auto als demo-auto: de kiezer toont eerst je voertuigen uit Mijn
   voertuigen. Je rapporten, ritten en open punten kun je tijdens de demo
   gewoon bekijken (lezen mag, schrijven niet).
 - Elke demo-auto krijgt de sensoren bij zijn brandstof; een diesel-demo had
   tot nu toe de lambdasondes van een benzine.
 - Een demo zonder login eindigt weer op het loginscherm.
 - Nieuw: "Verder zonder adapter" in het verbindscherm, en op het startscherm
   de kaart "Niet in de auto?": kenteken-check bij het RDW (APK met de dagen
   die nog over zijn, WAM-verzekerd, NAP-oordeel, terugroepacties, import,
   trekgewicht, verbruik en CO2 volgens de typekeuring, emissieklasse),
   "Dit is mijn auto" met de APK-regel op het startscherm, en foutcodes
   opzoeken zonder net en zonder auto (pidlane-zonder.js).
 - Het loginscherm houdt "Try demo — no adapter needed": dat is de tekst die
   de Play-reviewnotitie letterlijk belooft.

 ═══════════════════════════════════════════════════════════
 29-09-2026 — Geen chassisnummer meer in de statusregel
 ═══════════════════════════════════════════════════════════

 - De statusregel rechtsboven toonde na het verbinden het chassisnummer
   (bijv. JMZKF6W7600766507) in plaats van de auto. Het voertuigchipje krijgt
   bij het verbinden eerst de VIN mee, en de nieuwe statusregel nam die
   letterlijk over. Nu staat er merk en model; een VIN komt er niet meer in
   (`sysNaam()`, getoetst in test-nav.js, tegenproef in plmutate.sh).

 ═══════════════════════════════════════════════════════════
 29-09-2026 — De weergavekeuze in Live is terug voor iedereen
 ═══════════════════════════════════════════════════════════

 - Reparatie op de oplevering hieronder: de keuze Trends · Getallen ·
   Puntjes · Slim · Visueel stond alleen nog in de garagemodus. Een klant
   kon vanuit Slim nergens meer heen. Hij staat weer voor iedereen, bovenaan
   Live.
 - Opnemen, Deel live en Meekijken staan eronder op één regel in plaats van
   twee.

 ═══════════════════════════════════════════════════════════
 29-09-2026 — Een nieuw startscherm en een onderbalk
 ═══════════════════════════════════════════════════════════

 Aanleiding: een evaluatie zei dat de klant te veel wegen naar dezelfde
 functies kreeg en dat juist de belangrijke verstopt zaten. Nageteld: 59
 ingangen op tien plekken, vijf wegen naar foutcodes, en de rapporten
 alleen achter ☰. Voorstel en onderzoek: zie PIDLANE-ARCHIEF.md, 29-09-2026.

 - Onderbalk met vier tabs: Mijn auto · Live · Rapporten · Meer. ☰ en 🏠 zijn
   weg; Meer is het oude menu, nu met kopjes (Account, Instellingen, Hulp).
   De balk staat er pas na inloggen of in de demo. Nieuw: pidlane-nav.js.
 - Startscherm: één hoofdknop "Check mijn auto" (foutcodes en keuringsstatus)
   en vier tegels — Er is iets mis, Kopen of verkopen, Rit starten,
   Voorbereiden. Een tegel opent de wizard meteen op zijn eigen vraag.
 - Check mijn auto na het verbinden vanzelf, één keer per sessie (niet in de
   demo, niet bij hervatten, niet op afstand; uit te zetten in Meer).
 - Check mijn auto geeft een stoplicht bovenaan, de codes in één regel per
   stuk en drie vervolgstappen. De volledige uitlezing en het wissen staan
   onder "Alle details voor de monteur".
 - Wizard: nieuwe tak Onderweg (rit-monitor en caravancoach starten meteen);
   caravan staat niet meer ook onder Voorbereiden. Het wizardplan volgt nu de
   functieschakelaars uit beheer.html — voorheen verborg een schakelaar
   alleen de kaart.
 - Garagemodus (Meer → Instellingen): vanzelf aan voor een account dat geen
   klant is. Geeft "Alle functies" (de oude kaarten, onder elkaar), de
   weergavewissel in Live en de regel "Je krijgt" op de kaarten.
 - Live: Opnemen, Deel live en Meekijken staan in het live-scherm zelf;
   "PID-keuze" heet "Sensoren".
 - Rapporten: de lijst staat boven de AI-instellingen; klanten zien een
   knop naar de bewaarde rapporten in Mijn voertuigen.
 - De chip "Systeem" zegt nu in gewone taal wat er is: de autonaam,
   "Niet verbonden", "AI niet bereikbaar" of "Demo".
 - Leesbaarheid: zwakke tekst in het lichte thema donkerder, grijze tekst op
   het startscherm lichter, een minimum tekstgrootte in vensters.
 - beheer.html: tien tabbladen worden vijf groepen; de instellingen heten
   zoals het startscherm (de oude deurlabels klopten niet). Reparatie: een
   tegelsleutel die nooit was opgeslagen toonde beheer als uit, en "Alles
   opslaan" zette hem dan echt uit.
 - Testrun 8.6: blok 5 kijkt of de onderbalk, de check en de vier tegels er
   staan en of elke tegel een wizardtak heeft.

 ═══════════════════════════════════════════════════════════
 29-09-2026 — Rit beëindigen, en motor uit is geen einde van de rit (#341)
 ═══════════════════════════════════════════════════════════

 - Onderin het menu staan "Uitloggen" en "Sluit de app" niet meer. Er staat
   één knop: "Rit beëindigen" als er een rit loopt, anders "Afsluiten". Het
   venster toont de rit (km, duur, verbruik, koelwater, accu, foutcodes,
   pauzes) en laat je hem een naam geven, met de labels en het voorstel uit
   Mijn voertuigen. Daarna kies je: verbonden blijven, verbinding verbreken of
   de app sluiten (alleen in de APK), met uitloggen als vinkje. Loopt er nog
   een caravanrit of rit-analyse, dan moet die eerst af.
 - De rit eindigt niet meer als de verbinding wegvalt, en niet meer na drie
   minuten stil. Motor uit, even tanken of de app dichtdoen is een pauze; rijd
   je binnen vijftien minuten verder, dan is het dezelfde rit. De eindtijd is
   het moment dat de auto stilviel, niet het moment dat de app dat zeker wist.
 - De naam uit "Rit beëindigen" gaat mee bij het opslaan (worker.js:
   `rit_opslaan` bewaart `label`).
 - Verbinding verbreken geeft de bus eerst vrij met ATPC (Protocol Close),
   vóór de socket dichtgaat. Nooit langer dan anderhalve seconde.
 - Na "App sluiten" verbindt de app de volgende keer weer vanzelf, als dat aan
   stond. Verbreken in de app blijft betekenen: niet vanzelf herverbinden.
 - Reparatie: verbreken sloot een Web Serial-poort (desktop) niet. De volgende
   verbinding gaf dan "The port is already open".
 - Testrun 8.5: blok 5 zegt of een stop onderweg één rit met een pauze bleef.

 ═══════════════════════════════════════════════════════════
 28-09-2026 — De verbinding blijft snel over een hele rit (#302)
 ═══════════════════════════════════════════════════════════

 - Groepsverzoeken krijgen het antwoordcijfer uit de ELM327-datasheet mee
   ('010C0D112'). De adapter geeft dan de prompt zodra alle frames binnen
   zijn, in plaats van zijn geleerde wachttijd uit te zitten. Die wachttijd
   leerde hij van de traagste module, tot 400 ms, en daardoor liep de
   responstijd in een sessie op van 77 naar 270 ms.
 - Het cijfer wordt per verzoek geleerd (drie keer hetzelfde aantal frames),
   niet berekend, zodat een tweede ECU die meeantwoordt niet wordt afgekapt.
   Elke 200e keer gaat het verzoek zonder cijfer, om bij te leren en om het
   verschil te meten. Ontbreekt er met cijfer een PID, dan gaat het cijfer
   voor dat verzoek vijf minuten uit.
 - Een SPP-antwoord komt nu binnen via het onRead-event van de plugin, zodra
   de prompt er is. Tot nu toe keek de app elke 50 ms in de buffer, en kostte
   elk commando daardoor minstens 50 ms. Valt de plugin drie keer op rij stil,
   of weigert hij de events, dan gaat de app terug naar pollen en staat dat in
   het BT-log. `pl_spp_poll = 1` in localStorage dwingt pollen af.
 - Testrun 8.4: blok 5 zegt hoeveel sneller groepsverzoeken met cijfer waren,
   of de antwoorden per event binnenkwamen, en de #302-proef meet 010C met en
   zonder cijfer.

 ═══════════════════════════════════════════════════════════
 28-09-2026 — Terug sluit ook een venster met een knop "Sluiten"
 ═══════════════════════════════════════════════════════════

 - De Android-terugknop sluit nu ook vensters die geen ✕ hebben maar een knop
   "Sluiten": het Run-venster, het logboek, Mijn tokens, de privacyuitleg en
   zeven andere. Het Run-venster bleef tot nu toe staan terwijl het scherm
   eronder wisselde.
 - De testrunproef voor de terugknop zet het testrunpaneel even opzij. Anders
   opende het waakvenster eronder en stond de proef altijd op FOUT
   (testrun 8.3).

 ═══════════════════════════════════════════════════════════
 28-09-2026 — De groepsproef als meetopdracht (#333)
 ═══════════════════════════════════════════════════════════

 - Een groepsproef die helemaal doorloopt zet de markering "groepsproef
   klaar". Een afgebroken proef zet niets.
 - De meetopdracht "Helpen 4 tot 6 PIDs per verzoek?" (in D1) wacht op die
   stap. Zonder gedraaide proef blijft hij op "nog niet", ook als de rest
   klopt. Daarnaast vraagt hij het advies op van A, B en C.

 ═══════════════════════════════════════════════════════════
 28-09-2026 — Groepsproef: helpen 4–6 PIDs per verzoek? (#333) — testrun 8.3
 ═══════════════════════════════════════════════════════════

 - Verbindingspaneel → "📦 Start de groepsproef": meet groep 1 t/m 6 en
   weer terug op deze auto en adapter (± 2 minuten, de bus vast). Per groep:
   metingen per seconde, responstijd, verloren en lege antwoorden, herhaalde
   frames, met een advies erbij. Elke stap gaat naar de logtabel
   (RecordType groepsproef).
 - ✋ Handmatig: PIDs per verzoek nu 1 t/m 6. De automaat blijft op
   hoogstens 3; terug naar de automaat zet de groep weer op 3.
 - Een groepsantwoord waarin een sensor ontbreekt die kort daarvoor nog
   antwoordde, telt niet meer als geslaagd. Gebeurt dat bij 4 van de laatste
   20 verzoeken, dan maakt de automaat de groep kleiner (niet onder de 2) en
   zegt hij waarom.
 - Campagne: de groepsproef drie keer per rit (stil koud, stil warm, rijdend
   met bijrijder). Blok 5 zet de uitslag in het verslag.

 ═══════════════════════════════════════════════════════════
 28-09-2026 — Een demo-auto laat niets meer achter
 ═══════════════════════════════════════════════════════════

 - Demo-foutcodes, AI-rapporten en waakrondes komen niet meer bij je echte
   voertuig in Mijn voertuigen terecht, en het voertuigoverzicht toont in
   demo niet meer het dossier van je echte auto.
 - Een demo bewaart geen sessie in het voertuigdossier, geen profiel per auto,
   geen roetfilterteller, geen diagnosecache, geen versnellingen en geen
   sensorselectie voor hervatten.
 - Een kentekendemo schrijft dat kenteken niet meer als jouw kenteken weg, en
   leest het dossier van je eigen auto niet meer in.
 - Na het stoppen van de demo is de demo-auto weg; een echte auto zonder VIN
   gaat niet meer door als de demo-auto.
 - Logregels uit een demo gaan als "demo" de logtabel in, zonder merk,
   bouwjaar of VIN.
 - De bulk-recorder neemt geen demo op.

 ═══════════════════════════════════════════════════════════
 28-09-2026 — Tegoed uit voor een klant met Ontwikkelaar aan
 ═══════════════════════════════════════════════════════════

 - Beheer → Klanten: bij een klant met Ontwikkelaar aan staat nu de knop
   "Tegoed uit". AI kost die klant dan geen tokens; de kosten komen bij de
   beheerder, zonder kasboekregel. Zo werk je met één klantaccount met alle
   klantopties (Mijn voertuigen, account, voorkeuren) én de ontwikkeltools,
   zonder te betalen.
 - Ontwikkelaar uitzetten zet het tegoed vanzelf weer aan. Een geblokkeerd
   account krijgt ook met Tegoed uit geen AI.
 - Airtable: nieuw selectievakje TegoedUit in de tabel Klanten.

 ═══════════════════════════════════════════════════════════
 28-09-2026 — Inloggen leest de gebruikerstabel niet meer elke keer uit Airtable (#327)
 ═══════════════════════════════════════════════════════════

 - De Worker onthoudt de Users-tabel vijf minuten. De Airtable-werkruimte
   zat op 2.525 van de 1.000 calls per maand, en elke login was er één.
 - Een net gewijzigd wachtwoord of een nieuwe gebruiker werkt meteen: een
   mislukte login leest de tabel één keer vers. Uitzetten via Beheer →
   Gebruikers werkt ook meteen. Alleen wie rechtstreeks in Airtable op
   Active=uit gaat, kan nog hoogstens vijf minuten inloggen.
 - Dit is de kleinste stap uit #327; de AI-afboeking (tot drie calls per
   aanvraag) en het beheerpaneel staan daar nog open.

 ═══════════════════════════════════════════════════════════
 28-09-2026 — Sensoren blijven na een herstart, dieper zoeken, ontwikkelaar, VIN als master
 ═══════════════════════════════════════════════════════════

 - Je eigen sensoren (banden, olie) en de berekende staan na een herstart
   van de app weer aan, bovenop de standaardset. Ze werden te vroeg
   toegepast en daarna nooit opnieuw geprobeerd.
 - Sensoren → Codes voor dit model: "Dieper zoeken" geeft de AI de codes
   mee die bij jou werken en zoekt verwante codes; de "Buurscan" vraagt op
   de auto elke code rond een werkende code één keer op (alleen lezen,
   met een stopknop) en toont wat antwoordt.
 - Beheer → Klanten → "Ontwikkelaar aan": een klant krijgt de
   ontwikkeltools (testrun, bulk-recorder, survey, test-scenario) en blijft
   klant. Beheer en andere klanten blijven dicht.
 - Twee accounts met dezelfde auto delen de techniek (merk, model, motor,
   versnellingen, eigen sensoren, het geleerde versnellingsmodel); ritten,
   km-stand, notities en kenteken blijven van jezelf. Het akkoord van Mijn
   voertuigen noemt dat; iedereen bevestigt één keer opnieuw.
 - Versnellingsindicator: het venster springt niet meer naar boven;
   "In welke versnelling zit je nu?" staat altijd in beeld en elke tik
   telt mee; alle tikken samen bepalen de nummering. In Slim visueel staat
   de versnelling niet meer ook in de topbalk.
 - Slim visueel: de staafjes staan aan de binnenkant van koelwater en
   brandstof; de meter knippert niet meer bij een korte hapering, en de
   banden worden niet meer allemaal tegelijk gevraagd.
 - Opslaan (#326): elk bestand krijgt datum en tijd in de naam; lukt het
   schrijven in Documenten niet, dan zegt de app eerst waarom.

 ═══════════════════════════════════════════════════════════
 28-09-2026 — Banden: venster, bar of psi, elke minuut
 ═══════════════════════════════════════════════════════════

 - 🛞 Banden: een venster met de vier banden van bovenaf, per band de
   druk en de temperatuur. De app vergelijkt de banden met elkaar: een
   band die 10% zachter is dan de rest wordt oranje, 20% rood. Openen met
   het bandenlampje boven Slim visueel (dat meekleurt) of in Mijn
   voertuigen → Sensoren. Welke sensor bij welke band hoort, leest de app
   uit de naam ("Bandenspanning voor-links").
 - Mijn voorkeuren → Druk tonen als: bar (standaard) of psi. Eigen
   sensoren in psi, bar of kPa worden omgerekend; wat er bewaard is, blijft
   hetzelfde.
 - Eigen sensoren: "Hoe vaak" kent nu ook "Elke minuut", en is per sensor
   in de lijst aan te passen. Zonder keuze wordt een band elke minuut
   gevraagd en de rest elke 2 seconden.

 ═══════════════════════════════════════════════════════════
 27-09-2026 — Eigen PIDs per voertuig, rustiger Slim visueel, direct opslaan
 ═══════════════════════════════════════════════════════════

 - Mijn voertuigen → Sensoren (nieuw tabblad per voertuig): berekende
   sensoren aan- of uitvinken, en eigen sensoren toevoegen — een code van
   de dealer of uit een forum (alleen leescodes 21xx en 22xxxx), met een
   naam, eenheid en een formule over de antwoordbytes (A, B, …). "Test op
   de auto" vraagt de code één keer op. Wat hier staat zet de app aan
   zodra die auto verbonden en herkend is. Codes die schrijven, wissen of
   iets aansturen weigert de app én de server.
 - Slim visueel: de versnelling staat in het midden, op de plek van het
   logo (dat blijft zolang de versnelling niet bekend is). Koelwater en
   brandstof hebben een klein staand metertje, zodat de boog onderin
   duidelijk bij het getal eronder hoort.
 - Slim visueel zet zelf de sensoren aan die de meter nodig heeft (niet
   wat je zelf verborgen hebt).
 - De trekstrook komt vanzelf bij de rijsituatie caravan of beladen, of
   een lopende Caravanrit. De knop "Caravan of beladen?", de knop
   "+ Sensoren voor trekken" en de snelkoppeling naar de Caravanrit zijn
   weg. De versnellingstegel ook: die staat nu in het midden.
 - Voertuigoverzicht: voor een voertuig uit Mijn voertuigen staan de
   gegevens er alleen ter inzage, met een knop "Profiel aanpassen". Geen
   tweede formulier meer voor dezelfde gegevens. De rijsituatie blijft.
 - Eigen sensoren: per code een ECU-adres (bijv. 7E1 voor de automaat;
   de app zet na de vraag het algemene adres terug) en hoe vaak hij
   gevraagd wordt (elke seconde, 2 s of 10 s).
 - 📚 Codes voor dit model (in Sensoren): een gedeelde lijst per merk en
   model. Een code die bij jou werkt kun je na een geslaagde test delen;
   "Zoek online" laat de AI (met de zoektool, op tegoed) forums en
   PID-lijsten doorzoeken en zet wat door de controle komt erbij, met de
   bron. Elke test op je auto telt mee als "werkt" of "werkt niet" —
   zonder naam, kenteken of VIN, alleen merk en model.
 - Opslaan: een PDF-rapport (AI, dossier) gaat rechtstreeks naar
   Documenten/PidLane, zonder het venster "Delen / Opslaan in map". Ook
   de CSV van de PID-recorder en de remote-opname en het survey-bestand
   gaan rechtstreeks. Delen kan nog via ↗ Deel.

 ═══════════════════════════════════════════════════════════
 27-09-2026 — Auto-icoon weer weg
 ═══════════════════════════════════════════════════════════

 - Het zijaanzicht bij je auto (Mijn voertuigen, startscherm,
   Voertuigoverzicht) is weggehaald: een generieke vorm leek niet op de
   auto, en dan is geen plaatje beter. Carrosserie en kleur staan niet
   meer in het profiel en worden niet meer bewaard; wat er al stond wist
   de server bij de volgende start.

 ═══════════════════════════════════════════════════════════
 27-09-2026 — Versnellingen leren uit eerdere data, auto-icoon, rustiger overzicht
 ═══════════════════════════════════════════════════════════

 - Versnellingsindicator: "📂 Leren uit opnames" haalt de versnellingen
   uit opnames van de bulk-recorder, zonder opnieuw te rijden. Alleen de
   stukken waarin de verhouding drie seconden stabiel is tellen; een
   opname telt maar één keer, en een opname van een andere auto is niet
   te kiezen. Nieuwe opnames dragen daarvoor het voertuig mee.
 - Uit is voortaan alleen "niet tonen": hij leert door, zodat hij klopt
   zodra je hem aanzet.
 - Elke rit draagt een klein histogram mee naar de server. In Mijn
   voertuigen → Overzicht → ⚙️ Versnellingen: "Opnieuw opbouwen uit
   ritten" maakt daar een nieuw model van; je correcties blijven staan.
 - Auto-icoon: een zijaanzicht in de carrosserie en kleur van je auto,
   met het bouwjaar. Carrosserie en kleur komen uit het RDW (bestaande
   voertuigen met een kenteken worden één keer stil aangevuld) of kies je
   in het profiel. In Mijn voertuigen, op het startscherm en in het
   Voertuigoverzicht.
 - Voertuigoverzicht: "Rijsituatie & bijzonderheden" staat standaard
   ingeklapt; dicht zie je alleen wat er aan staat.

 ═══════════════════════════════════════════════════════════
 27-09-2026 — Alle voorstellen, en meetproeven die één rit nodig hebben
 ═══════════════════════════════════════════════════════════

 - Berekende PIDs erbij: koppel, brandstofkosten per uur en per rit,
   bereik met de tank, rendement, schakeladvies (alleen opschakelen),
   km sinds roetfilterregeneratie, koelwater min buiten, trim bank 2 en
   het verschil tussen de banken, koppelomvormer-slip bij een automaat.
   Profiel: tankinhoud en literprijs (anders een standaardprijs, en dat
   staat erbij). Nieuwe sensordefinitie 017C (DPF-temperatuur).
 - Versnelling: achteruit leren via Fout → R (geweigerd als R niet van
   de 1e te onderscheiden is), tijd per versnelling en rijstijladvies in
   het venster en in Mijn voertuigen.
 - Trekmodus: toon en trilling als het koelwater warm is en snel stijgt,
   hoogstens eens per drie minuten.
 - Ritten: labelvoorstel uit eerdere ritten, verbruik en kosten per
   label, export als CSV of PDF (per label of alles), kosten per rit.
 - Rapporten: 📕 PDF rechtstreeks, selecteren om twee te vergelijken
   (waakrondes per sensor, wat veranderde bovenaan) of meerdere tegelijk
   te wissen.
 - Bewust niet: automatische herkenning van een beladen rit en een
   terugschakeladvies (op de top van een klim is dat verkeerd).
 - Blok 5 oordeelt over de hele rit: zes nieuwe meetproeven (#319, #302,
   #294, trekmodus, versnelling, berekende PIDs), elk met sessiebewijs
   uit de module zelf en een getoetst oordeel. De #302-proef doet bij
   drift zelf het experiment: ATWS, en zo nodig een nieuwe verbinding.
   CAMPAGNE beschrijft één rit die alles dekt.

 ═══════════════════════════════════════════════════════════
 27-09-2026 — Versnelling bij het voertuig, berekende PIDs, trekmodus
 ═══════════════════════════════════════════════════════════

 - Versnellingsindicator hoort bij het voertuig. Voor een klant met Mijn
   voertuigen leert hij per voertuig en bewaart hij het geleerde op de
   server (nieuwe actie `versnelling_opslaan`, kolom `gear_model`). Een
   herinstallatie of ander toestel begint niet opnieuw.
 - Knop ✋ Fout in het venster van de indicator: kies welke versnelling
   er écht in zit. Dat wordt een anker; de rest van de nummering schuift
   mee. Ook als snelle start van de leercurve.
 - Profiel: "Handbak of automaat?" en "Hoeveel versnellingen?" (kolom
   `versnellingen`). Met het aantal is de nummering zeker zodra ze alle
   geleerd zijn. Mijn voertuigen → Overzicht heeft een blok ⚙️
   Versnellingen met de knop naar de indicator.
 - Berekende PIDs (nieuw: `pidlane-berekend.js`), kiesbaar onder
   "Berekend": versnelling (CA01), brandstofdebiet (CA02), verbruik nu
   l/100 km (CA03), laaddruk (CA04), totale brandstoftrim B1 (CA05) en
   motorvermogen (CA06). Ze gaan nooit de bus op: de pollus slaat ze over
   en `sendCmd` weigert ze.
 - Slim visueel: trekmodus voor caravan of beladen rijden. Een strook met
   versnelling, koelwater (met trend in °C/min), olie, belasting,
   inlaatlucht, verbruik en laaddruk. Aan zolang de Caravanrit loopt, of
   met de knop onder de meter.
 - Mijn voertuigen → Ritten: een label per rit (met voorstellen), en
   een telling per label met filter (kolom `kp_rit.label`, actie
   `rit_label`).
 - Mijn voertuigen → Rapporten: 🗑 per rapport in de lijst. Een
   waakronde toont weer het overzicht (tegels, bevindingen, normaal)
   en een AI-rapport de secties van het AI-venster, in plaats van kale
   tekst. Ook "Rapporten deze sessie" heeft nu een 🗑.
 - Privacy: ritlabels en het versnellingsmodel zijn nieuwe gegevens op de
   server. De akkoordtekst van Mijn voertuigen noemt ze nu, en de
   akkoordversie is `2026-09-27b`: elke klant bevestigt één keer opnieuw.
 - Terugknop: een venster waarvan het ✕ weggescrold is (Mijn voertuigen,
   versnellingsindicator, Mijn voorkeuren) gaat nu ook dicht.
 - Tests: `test-berekend.js`, `bproef-berekend.js`, uitbreidingen van
   `test-gear.js`, `test-garage.js`, `test-klantplatform.js`,
   `test-visueel.js`, `bproef-visueel.js`, `bproef-terugknop.js`; vijftien
   mutaties in `plmutate.sh`.
 - Niet in een auto getoetst: de Fout-knop en de trekstrook tijdens een
   echte rit, en of CA06 (vermogen) op een echte ECU een zinnig getal geeft.

 ═══════════════════════════════════════════════════════════
 27-09-2026 — Opslaan zonder venster, ook zonder verbinding
 ═══════════════════════════════════════════════════════════

 - De txt-knoppen (foutcodes, rit-analyse, totaalcheck, caravan, scanlog,
   waakvenster, bulk, veldlab) slaan voortaan altijd rechtstreeks op in
   Documenten/PidLane/, net als de PDF-exports. Tot nu toe deden ze dat
   alleen tijdens een verbinding en opende zonder verbinding het
   deelvenster.
 - Het deelvenster blijft de terugval als rechtstreeks schrijven mislukt.

 ═══════════════════════════════════════════════════════════
 27-09-2026 — Versnellingsindicator in de topbalk
 ═══════════════════════════════════════════════════════════

 - Tijdens het rijden staat de ingeschakelde versnelling op de plek van
   het logo, met een streepje per versnelling eronder. Een oranje N bij
   vrij of ingetrapte koppeling. Stilstand, geen verbinding of demo: het
   logo komt terug. Op smalle schermen (≤480px) staat het cijfer tussen
   menu en chips; het logo was daar al weg.
 - Leert zelf: geen kalibratierit, geen specs. Na ongeveer 250 stabiele
   metingen verschijnt het cijfer. Een vraagteken ("3?") betekent dat de
   1e nog niet gezien is; dat corrigeert zich. Een oranje stip betekent
   dat het patroon afwijkt (andere banden, andere auto zonder VIN).
 - ☰ → 🔢 Versnellingsindicator (of een tik op het cijfer): aan/uit,
   voortgang, geleerde verhoudingen en Leer opnieuw (tweede tik bevestigt).
 - Model per auto in localStorage onder het VIN-pseudoniem, niet de VIN.
 - Leest alleen `pidHist`; stuurt zelf niets naar de adapter.
 - Getoetst in simulatie (`test-gear.js`), niet in een auto. Hoe snel en
   hoe goed hij op een echte bus leert, is een vraag voor een rit.
 27-09-2026 — versie 3.1.0 voor de Play Console
 ═══════════════════════════════════════════════════════════

 - package.json en APP_VERSION naar 3.1.0. De push naar main start de
   APK- en AAB-build; versionCode loopt mee met run_number.
 - PLAY-INZENDING.md bijgewerkt voor wat sinds de vorige bundel bij het
   account bewaard wordt: §3 en §14 noemen Mijn voertuigen en meting in
   beeld, §11 dekt het voertuigprofiel, de ritten en de voorkeuren, en
   "Device or other IDs" gaat aan vanwege het Bluetooth-adres van de
   adapter in Mijn voorkeuren. §13 zegt dat beeld-in-beeld geen
   verklaring vraagt; §16b heeft toestelregels voor PiP en Mijn
   voertuigen.
 - verwijderen.html noemt nu ook Mijn voertuigen en Mijn voorkeuren. De
   opruimer wiste die al; de pagina zei het niet.

 ═══════════════════════════════════════════════════════════
 27-09-2026 — Mijn voorkeuren: "Geen voorkeur" en geen themakeuze
 ═══════════════════════════════════════════════════════════

 - De knop "Toestel" heet nu "Geen voorkeur", want "Toestel" zei niet wat
   hij deed. Kies je dit, dan verandert de app niets aan hoe het toestel
   staat.
 - De keuze voor een thema is weg, uit het scherm en uit de server. De app
   heeft sinds 11-09-2026 alleen donker, dus "Licht" bood iets aan dat niet
   bestaat. Een thema dat nog in een bewaarde voorkeur staat, wordt
   genegeerd.

 ═══════════════════════════════════════════════════════════
 27-09-2026 — Mijn voorkeuren: standaardinstellingen per klantaccount
 ═══════════════════════════════════════════════════════════

 - Nieuw scherm ☰ → ⚙️ Mijn voorkeuren (alleen klanten). Het account wint
   bij het inloggen. Bij elke keuze kan ook "Toestel" staan: dan beslist
   het toestel zelf. "Huidige stand overnemen" vult het scherm met wat het
   toestel nu doet.
 - Weergave: live-weergave, thema, tekstgrootte, lettergrootte, verbruik
   in l/100 km of km/l.
 - Na inloggen en verbinden: meteen Live of het startscherm, automatisch
   opnieuw verbinden, foutcodes uitlezen na verbinden, waakronde,
   rit-monitor en bulk-recorder standaard aan (alleen aanzetten, nooit
   uitzetten), vaste favorieten.
 - Adapter en snelverbinden: type en vaste adapter (overschrijft geen
   adapter die al op het toestel gekoppeld is), bij een bekende auto de
   sensorscan vragen, overslaan of altijd doen, samenvatting na verbinden
   aan of uit.
 - Analyse en meldingen: eerdere rapporten meenemen (vragen, ja of nee). Dat
   zijn nu ook de laatste drie rapporten van het actieve voertuig uit
   eerdere sessies. Verder AI-rapport kort, normaal of uitgebreid, en de
   meldingen voor APK/onderhoud, rit en nieuwe open punten.
 - Sensoren per voertuig: de huidige selectie vastleggen bij het actieve
   voertuig. Die gaat aan zodra die auto op zijn chassisnummer herkend is.
   Past er niets van, dan blijft de huidige selectie staan.
 - Server: tabel kp_voorkeur en kolom kp_voertuig.pid_selectie, beide met
   een witte lijst. Voorkeuren vragen geen akkoord op Mijn voertuigen.
 - test-voorkeur.js (21), test-klantplatform.js (69), bproef-voorkeur.js en
   zes mutaties.

 ═══════════════════════════════════════════════════════════
 27-09-2026 — Mijn voertuigen: waakronde en Voertuigoverzicht gekoppeld
 ═══════════════════════════════════════════════════════════

 - Waakronde: valt een sensor buiten bereik, dan wordt dat een open punt
   bij het actieve voertuig (één keer per sensor per sessie). Bij het
   stoppen, ook bij een verbroken verbinding, komt het resultaat als
   rapport "Waakronde" bij het voertuig.
 - Voertuigoverzicht (⋮ → auto): voor een klant met een actief voertuig
   komen km-stand, laatste beurt, distributie, bijzonderheden, merk, model,
   bouwjaar en brandstof uit Mijn voertuigen. Opslaan schrijft daarheen. De
   lokale kopie volgt, zodat de AI-prompt hetzelfde zegt. Bovenaan staat met
   welk voertuig het gekoppeld is. Zonder klantaccount werkt het zoals
   voorheen.
 - De rijsituatie-chips blijven: die gaan over deze meting (12 uur geldig)
   en niet over de auto.
 - Twee profielvelden erbij: laatste onderhoudsbeurt en distributie. Op
   bestaande tabellen via een migratie in kpSchema().
 - test-garage.js (53), test-klantplatform.js (59), bproef-garage.js
   (waakronde op de nep-adapter en het overzicht), vier mutaties.

 ═══════════════════════════════════════════════════════════
 27-09-2026 — Mijn voertuigen: het klantplatform
 ═══════════════════════════════════════════════════════════

 - Klantaccounts krijgen "🚗 Mijn voertuigen" (☰ en een kaartje boven de
   deuren op het startscherm). Eén klant heeft hoogstens drie actieve
   voertuigen plus een archief.
 - Per voertuig:
   - een profiel met naam, kenteken, merk, model, motor, brandstof, turbo,
     transmissie, rijprofiel, verbruik, kilometerstand, APK en onderhoud.
     Met het kenteken vult het RDW het meeste in.
   - een status (groen, oranje of rood) met de punten die hem bepalen.
   - condities: accu, laadspanning, koelwater, trims en keuringsstatus.
   - advies zonder AI: verbruik tegen opgave, korte ritten, turbo, koeling,
     laadspanning en APK.
 - Rapporten blijven bewaard. Elk AI-rapport en elke foutcode-uitlezing gaat
   naar het actieve voertuig.
 - Ritten worden vanzelf vastgelegd als samenvatting (afstand, duur,
   verbruik, koelwater, accu, stationair). Er gaat geen extra verkeer over de
   bus.
 - Foutcodes worden open punten. Ze gaan vanzelf dicht als ze bij een
   volledige uitlezing niet meer terugkomen. De klant kan ze negeren of
   heropenen.
 - Opslag in D1 via /klant/platform. Het kenteken wordt versleuteld opgeslagen
   (secret KENTEKEN_SLEUTEL). Eerst een eigen akkoord. De telefoon houdt een
   kopie en een wachtrij voor als er geen netwerk is.
 - privacy.html heeft een eigen hoofdstuk "Mijn voertuigen" gekregen.
 - test-klantplatform.js (55), test-garage.js (41), bproef-garage.js en
   dertien mutaties in plmutate.sh.

 ═══════════════════════════════════════════════════════════
 26-09-2026 — Testrun 8.2: foutcodes & keuringsstatus als eigen venster (#304)
 ═══════════════════════════════════════════════════════════

 - Nieuwe eerste deur op het startscherm: "🩺 Foutcodes & keuringsstatus"
   (pidlane-foutcodes.js). Leest bevestigd (03), pending (07) en permanent
   (0A), ook bij drie of meer codes (multiframe). Toont het freeze frame
   en per monitor of hij klaar is, plus afstand en warmdraaien sinds wissen.
 - Wissen gaat in stappen: eerst wat er verloren gaat, met een knop om te
   bewaren, en een vinkje. Alleen met motor uit, bij stilstand, niet op
   afstand en met een uitlezing van hooguit 5 minuten oud. Het antwoord op
   04 wordt gelezen. Daarna wordt opnieuw uitgelezen, met voor en na naast
   elkaar.
 - Het oude DTC-tabblad blijft ongewijzigd. Overstappen komt na een rit.
 - De sessieteller van de admin ("🪙 n tok · €…") zweeft niet meer
   linksonder over de inhoud. De stand staat in ☰ → Admin → "AI-kosten deze
   sessie".
 - test-foutcodes.js (64 eisen), bproef-foutcodes.js, zes mutaties in
   plmutate.sh, één proef in blok 5 en stap 3b in CAMPAGNE.

 ═══════════════════════════════════════════════════════════
 26-09-2026 — "🔄 Opnieuw verbinden" in het verbindingspaneel (#302)
 ═══════════════════════════════════════════════════════════

 - Op de rit van 26-09 liep de responstijd van de MX+ in een sessie op tot
   269 ms (3,6 verzoeken/s); na opnieuw verbinden was het 77 ms (10,9/s),
   met dezelfde 26 PIDs. De oorzaak is nog open (#302).
 - Nieuwe knop in het verbindingspaneel: verbreekt en hervat via de
   hervatstand (#229), dus zonder vragen en met de eigen sensorselectie.
   Eerst wordt de selectie van dat moment bewaard.
 - Het paneel toont een aanwijzing met dezelfde knop zodra de responstijd
   1,6× boven het beste stuk van de sessie ligt en boven 150 ms.
 - test-adapterpaneel.js toetst de aanwijzing, bproef-adapterpaneel.js de
   knop (sectie 9). Drie mutaties in plmutate.sh.

 ═══════════════════════════════════════════════════════════
 26-09-2026 — Testrun 8.1: tien punten uit de proefrit (#300)
 ═══════════════════════════════════════════════════════════

 - Veldlab: het vel met drie vragen na een AI-rapport is weg. De
   automatische veldlab-sessies lopen door.
 - Tokenteller: de zwevende chip "⚡ n tokens" staat voor niemand meer in
   beeld (chipTonen:false). Het saldo staat in ☰ → Mijn account en in de
   kostenmelding. De sessieteller van de admin (tokPill) wordt nu ook
   weggehaald als daarna een user of klant inlogt.
 - Sluit de app: de BLE-verbinding wordt afgewacht (stond zonder await), een
   half opgebouwde verbinding wordt ook verbroken, en de meetdienst stopt
   vóór exitApp(). Elke stap krijgt hoogstens 3 s.
 - Terugknop: drukt het ✕ in van het bovenste venster, gevonden met
   elementFromPoint(). De vaste lijst van zestien vensters blijft als
   terugval. Nieuw: bproef-terugknop.js.
 - Onderrand: de scenariobalk, de melding, de rit- en caravanpil, de
   sessieteller en de verbindingspoort tellen --pl-sab mee.
   bproef-schermranden.js meet ze (2h).
 - Bulk-analyse: de kaart is weg; open hem met "📈 Analyse van de opname" in
   het venster van de bulk-recorder.
 - Bevindingen: blijven minstens 5 s in beeld (BEV_MIN_MS). De AI krijgt
   nog steeds de stand van nu.
 - Grafiek: herbouwd. Hoogstens drie sensoren, elk een eigen baan met eigen
   as, normaalband en één zin over het verloop. Hertekenen op een eigen
   klok. Nieuw: bproef-grafiek.js.
 - Systeemtest: een checklist die zichzelf afvinkt. Elke test in BSC_TESTS
   heeft een situatie (sit) en meet alleen dán; de stationair-tests wachten
   tijdens het rijden. Stoppen kan altijd, wat niet voorkwam heet "niet
   getest". Nieuw: bproef-systeemtest.js.
 - Blok 5: vier proeven voor #300. CAMPAGNE voor deze ronde. Elf mutaties
   in plmutate.sh.

 ═══════════════════════════════════════════════════════════
 26-09-2026 — package.json en wrangler.toml zeggen wat er is
 ═══════════════════════════════════════════════════════════

 - package.json: "main": "src/index.html" weg (die map bestaat niet), en
   "private": true zodat npm het pakket nooit kan publiceren.
 - wrangler.toml: de tweede deploy-route (npm run deploy) en de verwijzing
   naar SETUP-WRANGLER.md zijn weg. Dat script en dat bestand bestonden
   niet, en CLAUDE.md zegt al: geen lokale deploy. `npm run tail` is
   vervangen door de plek in het dashboard.

 ═══════════════════════════════════════════════════════════
 26-09-2026 — Favicon, iOS-icoon en webmanifest bestaan nu echt
 ═══════════════════════════════════════════════════════════

 - index.html wees naar favicon-32.png, favicon.ico, apple-touch-icon.png
   en manifest.webmanifest, maar die hebben nooit bestaan: vier 404's per
   paginalading, en vier keer de Worker die "not_found" antwoordde. Alle
   vier zijn nu gemaakt uit icon-512.png, plus icon-192.png voor het
   manifest. test-verwijzingen.js toetst dat elke lokale verwijzing in de
   drie pagina's bestaat. Twee mutaties in plmutate.sh.

 ═══════════════════════════════════════════════════════════
 26-09-2026 — De tests staan niet meer openbaar op app.pidlane.nl
 ═══════════════════════════════════════════════════════════

 - public/.assetsignore: Cloudflare uploadt test-*.js en bproef-*.js niet
   meer (161 bestanden, 2,3 MB). Ze stonden tot nu toe openbaar online, met
   de binnenkant van de app erin uitgelegd. In de repo, in CI en voor
   plbrowser.sh verandert er niets. test-assetsignore.js toetst dat de lijst
   niet te smal en niet te breed is. Twee mutaties in plmutate.sh.

 ═══════════════════════════════════════════════════════════
 26-09-2026 — "Airtable" → "D1" waar het log al in D1 staat (#297)
 ═══════════════════════════════════════════════════════════

 - Meetkamer: het derde station van de lus heet D1. CAMPAGNE verwijst voor
   de uitkomstregel naar de tabel logregels in D1. De console-meldingen van
   de logbuffer zeggen D1. In beheer staat bij het logboek en de
   meetopdrachten dat die tabellen in D1 staan (de routes heten nog
   /airtable/…). Veldlab, klanten, config en gebruikers blijven Airtable en
   zijn niet aangeraakt.

 ═══════════════════════════════════════════════════════════
 26-09-2026 — PID-tabel rechtgezet naar SAE J1979 (0169–01A6 en vier namen eronder)
 ═══════════════════════════════════════════════════════════

 - Vanaf 0169 hoorden de namen bij andere nummers en lazen de formules de
   steunbitmap als meetwaarde. Zo stond er op een benzineauto "NOx
   doseerpomp" (echt: motorwrijvingskoppel), "AdBlue injectiedruk" (echt:
   versnelling) en "Turbo temp uitlaat A −38 °C" (echt: uitlaatgasdebiet).
   Nu op de SAE-indeling, met het steunbit gelezen; PIDs waarvan de
   indeling niet vaststaat hebben geen definitie meer en verschijnen niet.
 - Ook rechtgezet: 0117 (O2 B1S4), 014A/014B (pedaal E/F), 014C (gestuurde
   gasklep), de SAE-namenlijst, en de lijsten die op de foute betekenissen
   leunden: de dieselfilter en turbofilter van de PID-gate, de DPF- en
   NOx-controles, de sensorsets, de merklijsten, Total Check en de
   uitlaattegendruk in de onderdelenanalyse.
 - Een PID die alleen een SAE-naam heeft verschijnt niet meer als sensor
   met zijn steunbitmap als getal.

 ═══════════════════════════════════════════════════════════
 26-09-2026 — Weergaveknoppen op één regel, embleem in de meter, getallen bij de lampjes
 ═══════════════════════════════════════════════════════════

 - De vijf weergaven staan op één regel als tabbalk (icoon boven een kort
   woord); "Slim visueel" heet daar "Visueel". Het label "Weergave:" en de
   waakronde-knop zijn uit die rij — de waakronde staat in het run-paneel
   en in het meldingenvak.
 - Slim visueel: "×1000 /min" en het toerengetal in het midden zijn weg (de
   naald zegt het al); daar staat nu het PidLane-embleem, als lichte
   lijntekening zonder tegel en gloedfilters.
 - Het motorlampje toont de motorbelasting (0104) met een balkje, het
   hybride-lampje het percentage van de hybride accu (015B). Het vermogen
   van de accu kan niet: daar kent de app geen generieke PID voor.

 ═══════════════════════════════════════════════════════════
 26-09-2026 — Rit-monitor: geen uitval-meldingen bij wegschakelen
 ═══════════════════════════════════════════════════════════

 - Even wegschakelen gaf vijftien keer UITVAL en daarna vijftien keer
   "hersteld na ~30s". De watchers pauzeren nu zolang de app op de
   achtergrond staat, de adapter herstart (ELM-poort dicht) of hun eigen
   tik stil lag, en tellen stilte daarna pas vanaf het einde van de pauze
   plus 20 s. Een echte uitval wordt daarna gewoon weer gemeld.

 ═══════════════════════════════════════════════════════════
 26-09-2026 — Bulk-recorder: alleen verse metingen van PIDs die bij de auto passen
 ═══════════════════════════════════════════════════════════

 - De recorder schreef elke seconde álles uit pidVals weg, ook de laatste
   waarde van een PID die maar één keer antwoordde. Gevolg in de analyse:
   NOx-doseerpomp en AdBlue op een auto zonder SCR, 600 keer hetzelfde
   getal, 100% dekking. Nu gaat een waarde alleen mee als de PID-gate hem
   voor dit voertuig toelaat en hij in de laatste 30 s is bijgewerkt.
 - Het analysevenster laat in oudere opnames weg wat niet bij het voertuig
   past, en zegt hoeveel sensoren dat waren.

 ═══════════════════════════════════════════════════════════
 26-09-2026 — Slim visueel: lampjes boven de meter, dieselschaal, één rail
 ═══════════════════════════════════════════════════════════

 - Boven de meter twee lampjes: links (elf uur) de verbrandingsmotor —
   "Motor aan", "Start/stop actief", "Motor start", "Motor uit" — en rechts
   (één uur), alleen op een hybride, "Hybride actief" of "Hybride
   elektrisch". Beide lezen PLAandrijving; de aandrijfbalk erboven is in
   deze weergave weg, want hij zei hetzelfde.
 - Een diesel krijgt een eigen toerenschaal: 0–6000, oranje vanaf 4500.
 - Rit-monitor, bulk-recorder en waakronde stonden dubbel in beeld: als
   kaart in het vak, als zwevende pil (🛡 km/u, 🔴 Recorder) en als
   waakstrook boven de meter. Nu één rail met een chip per lopende module,
   met het getal dat de pil toonde (meldingen, opnametijd en regels,
   ronde). Pillen en strook zijn weg zolang Slim visueel in beeld is;
   elders blijven ze. Liepen er twee tegelijk, dan stond er maar één in
   het vak — nu staan ze er allemaal.
 - De voetregel is één tikbare regel en valt niet meer onder de tokenteller.

 ═══════════════════════════════════════════════════════════
 25-09-2026 — Slim visueel: één vaste meter met een meldingenvak eronder
 ═══════════════════════════════════════════════════════════

 - Nieuwe weergave naast Slim (die blijft zoals hij was). Naald = toerental,
   midden = snelheid, onderin op één rij koelwater, accu en brandstof met
   het getal onder het icoon. De onderboog tussen vijf en zeven uur is
   motorolie, met het getal gecentreerd onder de cirkel; zonder olie
   laaddruk (turbo bewezen), anders het gaspedaal.
 - Kleuren: koelwater blauw onder 60 °C; accu oranje als een draaiende
   motor onder 13,2 V blijft (dynamo laadt niet), rood onder 12,0 of boven
   15,0 V; tank oranje onder 12 %.
 - Belasting, gasklepsensoren, pedalen, ontsteking, raildruk en luchtmassa
   staan er bewust niet op en worden zolang deze weergave open staat trager
   opgevraagd (2 s), zodat de bus zijn antwoorden aan de naald geeft.
 - Een pedaal of laaddruk die op deze auto trager binnenkomt dan 800 ms
   valt van de onderboog; een oud antwoord maakt zijn plek dof; een
   ontbrekende PID laat een streepje staan en schuift niets op.
 - Meldingenvak onder de meter: rit-monitor, caravanrit, bulk-recorder of
   rit-analyse (één tegelijk), de waakronde, en de bevindingen — die
   verhuizen daarheen in plaats van bovenaan te staan. Loopt er niets,
   dan snelkoppelingen; de bulk-recorder alleen voor een beheerder. Het vak
   leest PLRun.staat() en bewaart zelf niets.
 - De wijzerplaat is een vaste tekening; getallen sturen alleen hoek,
   vulling en tekst. `PLGate.stats()` zegt nu ook `turbo`.
 - Getoetst door `test-visueel.js` en `bproef-visueel.js`, met zeventien
   mutaties in `plmutate.sh`.

 ═══════════════════════════════════════════════════════════
 24-09-2026 — opstart-intro: neon rijbaan, logo in 3D, doorzoom naar login
 ═══════════════════════════════════════════════════════════

 - Nieuw `pidlane-intro.js` + `#plIntro` bovenaan de body. Donker, een neon
   rijbaan naar de horizon, het logo tekent zich en komt overeind uit het
   wegdek, daarna zoom je erdoor naar het inlogscherm. ≈ 2,9 s.
 - Hooguit één keer per sessie, weg met één tik, niet bij "minder
   beweging", niet na een opstart trager dan 6 s en niet onder
   automatisering. Speelt pas vanaf DOMContentLoaded, over de boot heen.
 - Noodrem in de CSS: het vlak verdwijnt ook als het script niet loopt.
 - Getoetst door `test-intro.js` en `bproef-intro.js`, met zeven mutaties
   in `plmutate.sh`. De oude `#introOv`-CSS van 26-07 staat er nog, ongebruikt.

 ═══════════════════════════════════════════════════════════
 24-09-2026 — één harde-limietmelding, één regel in de logtabel (#256)
 ═══════════════════════════════════════════════════════════

 - #256  De omhulling van het veldlab om log() geeft alle argumenten door.
         `{geenAirtable:true}` viel eraf, dus de reparatie van 18-09 werkte
         in de app niet: elke harde-limietmelding stond nog twee keer in D1.

 ═══════════════════════════════════════════════════════════
 24-09-2026 — een analyse begint met de meting, niet met vragen (#290)
 ═══════════════════════════════════════════════════════════

 - #290  De vier vragen vóór een analyse staan uit (Config
         `feat_voorvragen` zet ze weer aan). Wat de app zelf weet —
         start/stop gezien, gaten in de reeks — gaat zonder vraag mee.
 - #290  Het meetscherm verschijnt ook bij genoeg data: "Gebruik de meting
         van zojuist" of "Nog even meten", en altijd "Annuleren". De
         AI-monteur zet het vóór de uitwerking van een oorzaak.
 - #290  Terug/wegklikken vóór de analyse annuleert: niets verstuurd, niets
         afgeschreven, geen noodrapport.
 - #290  De balk "AI analyseert…" blijft boven de Android-knoppen.

 ═══════════════════════════════════════════════════════════
 24-09-2026 — de keuzeschermen ingedeeld naar moment (#286)
 ═══════════════════════════════════════════════════════════

 - #286  Waakronde, Bulk-recorder en Bulk-analyse staan niet meer in het
         menu maar als kaart in de deur "Live data bekijken, opnemen &
         delen" (de bulk-kaarten alleen voor beheer). De PID-recorder
         verhuist daar ook heen: het is een opnamegereedschap.
 - #286  "Test: rendercrash" is uit het Admin-menu.
 - Deur "Verbruik & besparen" heet nu "Onderweg: veilig & zuinig" en
         bevat wat de hele rit meeloopt: Rit-monitor (was bij Live data),
         Rit met caravan of aanhanger, Verbruik analyseren.
 - #286  "Klaar voor gebruik" houdt de knop boven de Android-knoppenbalk.
 - #286  De inklapknop bij "Voertuig" (Sensoren & PIDs) zegt nu
         "Inklappen" / "Uitklappen" in plaats van een los ▾.

 ═══════════════════════════════════════════════════════════
 24-09-2026 — een crash breekt de rit niet meer in twee
 ═══════════════════════════════════════════════════════════

 - #229  Het sessienummer loopt door na een herlaad binnen twee minuten
         (rendercrash): de logtabel houdt één rit, en de testrun neemt het
         nummer één keer over. Een hartslag van 30 s houdt het vers.
 - #229  De sensorselectie wordt bewaard en na een hervatting teruggezet;
         zonder bewaarde selectie de standaardset. De eerste versie van de
         hervatting (#287) sloeg de standaardset mee over en hervatte met
         nul sensoren.
 - Blok 5: een hervatting met nul sensoren is FOUT.

 ═══════════════════════════════════════════════════════════
 24-09-2026 — na een crash hervatten zonder vragen
 ═══════════════════════════════════════════════════════════

 - #229  Een automatische herverbinding (herlaad, dode socket, terugkeer
         naar de app) loopt niet meer de eerste-keer-flow door. Het
         kenteken, het herkende protocol en het profieloordeel van de vorige
         verbinding gelden gewoon; "Klaar voor gebruik" blijft weg. Zonder
         bereik slaat hij het kenteken over. Met de knop verbinden vraagt
         zoals altijd. De stand vervalt na drie minuten.
 - Blok 5: de laatste hervatting van de sessie, met hoe lang hij duurde.

 ═══════════════════════════════════════════════════════════
 24-09-2026 — de app verbindt weer vanzelf opnieuw
 ═══════════════════════════════════════════════════════════

 - #229  Een geslaagde verbinding zet `pl_autoconn`. Daarmee leven de drie
         herverbindpaden weer: na een herlaad (rendercrash, proceskill), na
         zes lege antwoorden (dode socket) en bij terugkeer naar de app. Tot
         nu toe zette niets die vlag. Bewust verbreken wist hem nog steeds.
 - #229  Na een herlaad wacht het herverbinden tot 3 s op de Bluetooth-
         plugin, en zegt het als die wegblijft.
 - Blok 5: verbonden zonder vlag is FOUT.

 ═══════════════════════════════════════════════════════════
 24-09-2026 — de vragen van een meetopdracht komen in beeld
 ═══════════════════════════════════════════════════════════

 - #283  De meetkamer toont de vragen van de gekozen opdracht onder het
         oordeel, met een knop per antwoord. Verzenden stuurt een regel
         "antwoorden: ..." mee (ook als ze open staan), en een antwoord ná
         het verzenden maakt opnieuw verzenden mogelijk. Het oordeel blijft
         op de getallen.
 - Blok 5: de proef legt het scherm tegen de gekozen opdracht.

 ═══════════════════════════════════════════════════════════
 24-09-2026 — meetopdracht: afgeronde opdrachten gaan naar het archief
 ═══════════════════════════════════════════════════════════

 - #277  `Actief = -1` is afgerond. De lijst in de meetkamer laat die weg,
         dus ze krijgen na een rit geen oordeel meer en gaan niet mee met
         "Verzend alle afgeronde". Terugzetten: Actief op 0.

 ═══════════════════════════════════════════════════════════
 24-09-2026 — één beheerpagina, met de database en de meetopdrachten erin
 ═══════════════════════════════════════════════════════════

 - Beheer  admin.html is opgegaan in beheer.html en weg. De tests en
           mutaties die eraan hingen toetsen nu beheer.html. De klantdetails
           tonen weer de verzilverde codes en wat er met de hand bijgeboekt is.
 - Beheer  Tabblad Database: cijfers over de hele D1-tabel (per dag, type,
           versie, merk, adapter, meeste fouten, vangnet `onbekend`), elke
           tabel en view, ritten van begin tot eind met "bevindingen
           kopiëren", en een SQL-console die alleen leest.
 - Beheer  Tabblad Meetopdrachten: bewerken, keuren met de keurder van de
           app zelf, activeren zet de andere uit in één transactie. Een
           afgekeurde opdracht gaat niet aan.
 - Worker  Nieuwe route /admin/d1 (overzicht, rit, sql, opdracht-*).
 - Beheer  De foutcode van de saldoroutes werd uit de tekst gelezen in plaats
           van uit `code`: "saldo bezet" werd een rode fout i.p.v. "even
           wachten". `saldo_geen_email` had geen uitleg.

 ═══════════════════════════════════════════════════════════
 23-09-2026 — "Welk onderdeel?" keurt een gezonde motor niet meer af
 ═══════════════════════════════════════════════════════════

 - #232  De luchtmassaregel oordeelt alleen warm stationair, per liter
         motorinhoud (0,2–2,5 g/s/l). Onbekende motor: geen oordeel. Op 23-09
         noemde hij 0,8 g/s stationair én 91 g/s vol gas "past niet".
 - #231  De ontstekingsregel (ketting) kijkt alleen naar een warme motor en
         pas onder −25° (was −5°). Gemeten tot −20° op een gezonde rit.
 - #233  "Nog niet uitgelezen" heeft een knop eronder die meteen uitleest en
         het paneel opnieuw tekent. Zonder verbinding staat er waarom niet.
 - Blok 5: drie proeven die de regels op de live motor en de rit leggen.

 ═══════════════════════════════════════════════════════════
 23-09-2026 — meetopdracht: één rit voor alle opdrachten, groen is gesloten
 ═══════════════════════════════════════════════════════════

 - #277  Eén rit telt voor elke opdracht die hem vraagt: tien minuten rijden
         of drie keer vol gas hoeft niet per opdracht opnieuw. De meetkamer
         toont onder de vraag wat deze rit verder al beantwoordt, met één
         knop "Verzend alle afgeronde" (gesloten en bevindingen, elk één keer).
 - #277  Twee voorwaardensoorten voor wat NIET geleend mag worden:
         `gebeurtenis` (meetgat, herverbinding, onderbreking) en `adapter`
         (naam bevat, of met `niet` juist niet). Op 23-09 sloot "de adapter
         er even uit" zonder onderbreking en "de goedkope adapter" op de MX+.
 - #277  Het grote cijfer volgt het eindoordeel mét voorwaarden: groen is
         gesloten. Eronder de ritduur; die reist ook mee naar D1.

 ═══════════════════════════════════════════════════════════
 23-09-2026 — het kleine venster gaat ook aan als de sensoren later komen
 ═══════════════════════════════════════════════════════════

 - #228  Op het toestel verscheen picture-in-picture nooit. Het besluit
         "venster gewenst" viel bij setConn(true), en dat komt in de app
         vóór de sensorkeuze: altijd "geen selectie", en niets vroeg het
         opnieuw. Nu vraagt de meetlus het ook (hooguit eens per 2 s,
         alleen zolang de vlag uit staat). bproef-pip toetst nu ook die
         volgorde; hij toetste alleen de gunstige.

 ═══════════════════════════════════════════════════════════
 23-09-2026 — de proefcrash zet zijn startregel eerst in D1
 ═══════════════════════════════════════════════════════════

 - #229  Gemeten op het toestel: de afvang werkt (twee keer, 12:01 en
         12:03), maar "Proefcrash gestart" stond niet in D1. log() stuurt
         warn niet door, en de buffer sterft met de pagina. Nu eerst
         rechtstreeks naar D1 en de buffer leeg, dan crashen (plafond 3 s).

 ═══════════════════════════════════════════════════════════
 23-09-2026 — een rendercrash op bestelling, om de afvang te kunnen zien
 ═══════════════════════════════════════════════════════════

 - #229  Admin → "💥 Test: rendercrash" (alleen in de APK). Schrijft eerst
         een startregel in het logboek en laat dan de native kant
         chrome://crash laden. Vanuit JavaScript kan dat niet: Capacitor
         stuurt elk adres buiten allowNavigation naar buiten.

 ═══════════════════════════════════════════════════════════
 22-09-2026 — een rendercrash neemt de app niet meer mee (#229)
 ═══════════════════════════════════════════════════════════

 Sessie 5 van het v1.0-plan.

 - #229  Sterft de WebView-renderer, dan gaf Capacitor "false" door en
         schoot Android het hele proces af, met de meetdienst, de wake lock
         en de adapterverbinding erin. native/PLRender.java vangt het af:
         legt het moment en de oorzaak vast, geeft true terug en bouwt de
         activiteit opnieuw op. Na de herstart zet pidlane-render.js het in
         het logboek (en in D1), zodat het gat zijn oorzaak draagt.
 - Nog niet: de ritmarkering in PLRit/PLAchtergrond. Het gat staat nu in
         het logboek, maar nog niet als eigen oorzaak in het verslag.

 ═══════════════════════════════════════════════════════════
 22-09-2026 — afmelden blijft afgemeld, en de DTC-vlag wacht op het antwoord
 ═══════════════════════════════════════════════════════════

 Sessie 4 van het v1.0-plan.

 - #261  Afmelden riep aan het eind handleConnect() aan om de verbinding
         te verbreken. Dat is een schakelaar: zonder verbinding opent hij
         het verbindingsscherm, en na het afmelden leek de app gewoon door
         te gaan. Nu alleen verbreken als er een verbinding is.
 - #261  "Sluit de app" in het menu (alleen in de APK): verbreekt eerst de
         verbinding, dan App.exitApp(). De terugknop sluit nog steeds niet.
 - #218  _didDTCScan gaat pas aan ná het antwoord van de scan. Het
         onderdeelpaneel zei tijdens de scan en na een fout "geen
         foutcodes" in plaats van "nog niet uitgelezen".

 ═══════════════════════════════════════════════════════════
 22-09-2026 — de logketen is helemaal over: lezen, opruimen, opdrachten
 ═══════════════════════════════════════════════════════════

 Het vervolg op de verhuizing hieronder. Logs, testrunregels en
 meetopdrachten staan nu volledig in D1, beide richtingen. Config en
 Veldlab blijven waar ze zijn.

 - #262  De meetopdrachten verhuizen mee. Ze stonden in dezelfde volle base
         als de log, dus de lus van #241 lag aan twee kanten tegelijk stil.
         Gedrag ongewijzigd: nog steeds de actieve, nieuwste rij, nog
         steeds geen keuring in de Worker.
 - #262  /admin/tabel krijgt een tweede motor in plaats van een tweede
         route. Een D1-bron geeft dezelfde antwoordvorm als een
         Airtable-bron, dus beheer.html toont ze met dezelfde tabel,
         dezelfde zoekbalk en dezelfde knoppen.
 - #260  Twee afgeleide bronnen erbij, allebei alleen-lezen omdat ze niets
         bewaren maar berekend worden: "Ritten" vat elke rit samen in één
         regel (aantallen, uitkomsten, welke issues een antwoord kregen) en
         "Bevindingen" laat alleen zien wat opviel.
 - #260  Opruimknop in beheer.html: wissen op ouderdom, op rit of op soort.
         Hij telt eerst en wist pas na een tweede klik, en regels met een
         Outcome blijven staan tenzij je er expliciet om vraagt.
 - #260  Een nachtelijke opruimronde kan aan met de var LOG_BEWAARDAGEN.
         Staat standaard uit; zonder dat getal ruimt hij niets op en zegt
         dat ook.
 - #262  Nieuw: public/test-adminbron-d1.js (43 controles op de SQL-motor).
         test-opdrachtroute.js en test-adminbron.js zijn meeverhuisd; drie
         mutaties erbij in plmutate.sh voor de opruimkant.

 ═══════════════════════════════════════════════════════════
 22-09-2026 — de logregels gaan naar Cloudflare D1
 ═══════════════════════════════════════════════════════════

 De Airtable-base met de logtabel stond op 1.159 van de 1.000 rijen en nam
 niets meer aan. In diezelfde base staat Meetopdracht, dus zowel het
 wegschrijven van een rit als de opdracht voor de volgende rit lag stil.

 - #262  De logregels gaan naar Cloudflare D1 (pidlane_log_db, binding
         LOGDB). Het schema staat in schema.sql en de kolomnamen blijven
         gelijk aan wat de app stuurt, zodat er geen vertaaltabel in de
         Worker komt die uit de pas kan lopen. De app hoefde voor het
         schrijven zelf niet te veranderen.
 - #262  Een veld zonder kolom verdwijnt niet meer. Airtable maakte er
         vanzelf een kolom bij, SQLite niet; zo'n veld gaat nu als JSON naar
         de kolom `onbekend` in plaats van stil weg te raken.
 - #262  "Aangenomen" is niet langer hetzelfde als "weggeschreven". Van
         20-09 17:12 tot vandaag gaf de route HTTP 200 met {ok:true} terug
         zonder iets op te slaan, en de proef in blok 5 die juist dat kanaal
         bewaakt keurde dat goed. De Worker meldt nu hoeveel rijen hij
         wegschreef; komt dat getal niet of is het te laag, dan gaat de
         batch terug in de buffer en wordt blok 5 rood.
 - #260  Nieuw: schema.sql, public/test-logschema.js (schema tegen de
         velden die de app werkelijk stuurt) en public/test-logroute.js (de
         Worker-kant, met echte SQLite als nep-D1). Vijf mutaties erbij in
         plmutate.sh.

 ═══════════════════════════════════════════════════════════
 Testrun 8.0 (19-09-2026) — een groen oordeel hoeft niet meer op een hele
 testrun te wachten
 ═══════════════════════════════════════════════════════════

 De rit van 19-09 leverde niets op, en dat was geen pech. Dertien opdrachten
 achter elkaar gekozen, van elk het oordeel op het scherm gelezen, en in de
 logtabel stond er nul van terug — alleen vijftien regels "Nieuwe sessie".
 De begeleide run brak af na stap 1, de verbinding viel om 15:02:31 weg, en
 daarmee was de hele rit weg. De rit is hier de schaarste (#257).

 - #257  De meetkamer krijgt een verzendknop. Zodra er een oordeel is staat
         onder de vraag "↑ Verzenden" met het woord erbij: GESLOTEN,
         BEVINDING of NOG NIET. Hij schrijft dezelfde regels als blok 0 —
         één per proef plus de uitkomst, met Outcome en de issues in hun
         eigen veld — want hij loopt langs dezelfde functie. De terugweg is
         daarvoor uit blok 0 gelicht naar `_verzendOpdracht()`; een tweede
         plek die zijn eigen payload bouwt, is de vorm die #246 en #256 al
         twee keer kostten.

         Hij staat ook bij rood aan: een bevinding sluit een issue net zo
         goed als een groen vinkje. Twee keer drukken levert géén twee rijen
         op — de knop onthoudt de uitkomst zelf en niet een teller, dus hij
         gaat vanzelf weer aan zodra het oordeel kantelt.

 - #232  De MAF-vuistregel is voor het eerst aan deze motor gemeten, uit de
         ruwe logs: min 0,86, mediaan 1,91, max 13,40 g/s over 118 monsters.
         De mediaan ligt op de ~2 g/s die de vuistregel voor een 2,0
         verwacht, dus stationair scheidt 2,0 niet van 2,5.

         De stationair-proef viel rood om de verkeerde reden: hij stond op
         `0110 min`, en `min` loopt over de hele sessie. Hij pakte 0,86 van
         vlak na het verbinden. Op een auto met i-stop is die proef zelfs
         onmogelijk groen te krijgen. Geen van de vijf maten kan "de waarde
         terwijl hij stationair draait" uitdrukken — de oplossing zit in de
         sessie en niet in een zesde maat. In de voorraad staan nu twee
         rijen: stationair in een eigen stilstaande sessie, en de
         vollasthelft apart.

 ═══════════════════════════════════════════════════════════
 Testrun 7.9 (18-09-2026) — het verslag vertelde te vaak iets verkeerds
 ═══════════════════════════════════════════════════════════

 Na tien ritten kwam de klacht: te vaak verkeerde conclusies. Drie oorzaken,
 alle drie gevonden door de twee runs van 18-09 naast elkaar te leggen.

 - #255  De toestelronde wiste de markeringen van de meetrit. De bedoelde
         volgorde (rit → testrun → toestel → testrun) maakte de tweede run
         blind: acht proeven vielen terug op hun "niet gedaan"-tak en zeiden
         dat als een feit over de rit. De lijst wordt niet meer geleegd en
         elke markering draagt zelf uit welke ronde hij komt.
 - #256  De logtabel kreeg de proefwaarden van blok 5 binnen als echte
         metingen — 300 °C koelwater op een auto die 91–93 °C loopt, bij elke
         run. logToSheets() vult nu zelf RecordType, SessionId en Adapter; een
         proefwaarde heet proefwaarde; de dubbele uitschieterregel is weg en
         de voorrangsregel in log() heeft haakjes gekregen.
 - #257  Een meetopdracht draagt `voorwaarden` (meetbaar, zelfde vorm als een
         proef) en het oordeel is driewaardig: GESLOTEN, BEVINDING of NOG
         NIET. Negen van de twintig LET OP-regels van 18-09 gingen niet over
         de auto maar over omstandigheden die er niet waren; die staan nu
         vóór de rit in het keuzescherm in plaats van erna in het verslag.
 - #252  De blok-5-proef riep PLMeetkamer.issuebaan() aan; die heet sinds de
         herbouw ronde(). Gerepareerd, mét een toets die elke aanroep naast de
         echt geladen module legt.

 Drie toetsen erbij (test-markeringen.js, test-logvelden.js,
 test-opdrachtvoorwaarden.js) en twaalf mutaties in plmutate.sh. Drie nieuwe
 entries in PROEVEN_B5.

 ═══════════════════════════════════════════════════════════
     PidLane — AI-OBD2-diagnose voor autobedrijven
     Build: 2026-09-18a (CET) — DE VRAAG VAN DE RIT
     IN BEELD

       • 🔬 HET TESTRUNSCHERM IS HERBOUWD. Bovenaan staat nu
         één ding groot: de vraag die deze rit moet
         beantwoorden. Welke meetopdracht uit Airtable
         binnenkwam, en hoeveel proeven er binnen bereik
         vallen — 2/3, met de zin eronder die zegt wat er
         nog ontbreekt.

       • 📊 ELKE PROEF HEEFT EEN BALK. Je ziet tijdens de
         rit waar de meting in zijn band staat. De band
         beslaat altijd het middelste stuk, dus twee proeven
         zijn naast elkaar te lezen zonder de assen erbij.
         Niet gemeten tekent géén stip: dat is iets anders
         dan nul.

       • ⚪ DE LUS IS VIER STIPJES. Opdracht → meten →
         Airtable → Claude, met een lijn ertussen die
         meekleurt. Hij is context, geen nieuws — tot de
         terugweg stukgaat, dan komt er een eigen rood blok
         dat zegt dat er wel gemeten maar niets teruggemeld
         wordt.

       • 🎯 DRIE ISSUES, GEEN DRIEËNVEERTIG. Alleen waar
         deze rit werkelijk over gaat: de vraag uit Airtable
         en wat blok 5 déze run te melden had. De andere
         veertig lopen mee als bewaking en staan achter één
         regel met een telling.

       • ⚙ DE KNOPPEN ZIJN OPGERUIMD. Eén knop om een
         meetrit te starten; het andere gereedschap zit
         achter ⚙. Niets is weg — het staat alleen niet
         meer vóór het antwoord.

       • WAAROM. De rit van 18-09 stond stil, en dat bleek
         pas achteraf uit een FOUT-regel tussen 130 andere,
         terwijl de opdracht daar een proef voor droeg. Nu
         is dat tijdens de rit te zien.

       • HET SCHERM MEET ZELF NIETS. De balk en de FOUT-regel
         in het verslag komen uit dezelfde aanroep. Blok 5
         legt die twee elke run naast elkaar en meldt het
         als ze uit elkaar lopen (#246).
