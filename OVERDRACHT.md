# OVERDRACHT.md — sessie 15 t/m 20 augustus 2026

Wat er in deze sessies is gebeurd, wat er nu anders werkt, en waar de volgende
sessie begint. Voor de volgorde van het werk: `PLAN.md`. Voor hoe het systeem in
elkaar zit: `PIDLANE.md`.

---

## In één alinea

Er is deze week vooral gerepareerd wat er al kapot *stond zonder dat iemand het
kon zien*. Drie mechanismen bleken maandenlang dood terwijl ze in de
documentatie als afgerond stonden, en de oorzaak was steeds dezelfde: een
stille `catch` die de fout opat. Daarna is de diagnosekant van de app
teruggebracht van zes losse pagina's naar één testrun, en die testrun heeft
meteen een echte oorzaak gevonden die drie ritten lang onopgemerkt bleef.

---

## Wat er nu anders werkt

**De ELM-poort** (`pidlane-bt.js`). Tijdens een herinitialisatie van de ELM327
weigeren `sendCmd` en `sendBT` al het overige busverkeer. Het bestaande busslot
was adviserend — het werkte alleen voor code die netjes `PLBus.claim()` deed —
en liet drie gaten open. Bewezen in het veld op 16-08: socket dood om 10:53:27,
27 polls geweigerd, schone herinitialisatie, om 10:53:37 weer geldige data. Nul
vervuilde metingen, waar het daarvoor ~10 seconden rommel per dip was.

**Ronde 5 is eindelijk bedraad** (`pidlane-pids.js`, `pidlane-pidgate.js`).
`updPID()` riep `_noteMap()` noch `plHerijkTick()` aan, `purgeImplausiblePids()`
bestond niet meer, en `rebuildPidDefsCache()` heeft nooit bestaan. Alle drie
verstopt in stille catches. Nu bedraad en aantoonbaar levend: 307 ticks en 2
herijkingen in een run van 18-08.

**De bedradingscontrole** (`pidlane-bedrading.js` + `test-bedrading.js`). Eén
lijst met de functies die modules van elkaar verwachten, afgeleid uit élke
`typeof X === 'function'`-guard. Runtime meldt wat ontbreekt; de test bewaakt
twee kanten: elke naam moet bestaan, en elke guard moet geregistreerd zijn.

**De testrun** (`pidlane-testrun.js`). Vervangt busdiagnose, zelftest, opdracht,
diagnosebundel-UI, logscherm en copiloot. Eén admin-knop, zes blokken, één
logboek. Blok 5 toetst wat er in de laatste update veranderd is (toegevoegd
*en* verwijderd); `CAMPAGNE` onderaan het bestand stelt de vragen die die run
moet beantwoorden. **Herschrijf `CAMPAGNE` en `_blok5()` bij elke oplevering.**

**Opslaan met keuze** (`pidlane-export.js`). Elke log- en rapportknop vraagt
eerst tekst of PDF. De PDF gebruikt de huisstijl van het AI-rapport.

**Het profiel wordt tegen de ECU gehouden** (`pidlane-rijsituatie.js`).
`profielTegenSteunbits()` leest bij een snelle start alsnog `0100/0120/0140/0160`
en gooit eruit wat de ECU ontkent. Dit was de laatste vondst van 18-08 en is
**nog niet op de weg bevestigd**.

**Testrun 1.7: twee sondes die vooruitlopen op punt 2 en 4** (19-08,
`pidlane-testrun.js`). Beide veranderen niets aan het gedrag; ze verzamelen het
bewijs waarmee die sessies moeten beginnen.

*Blok 7 — pollbudget.* `PLBudget` bemonstert `PLBus.stats()` en `PLLoad.staat()`
elke twee seconden in een ring van een uur, vanaf het laden en de hele rit door.
Het telt de remmomenten waarbij er 0% fouten waren én de responstijd niet opliep
tegenover de mediaan van de 30 s ervoor. Dat aantal ís de vraag van punt 2.
`PLLoad` wordt niet gewrapt en niet aangeraakt: de genomen beslissing wordt
gereconstrueerd uit `PLLoad.cfg`, dus als sessie 2 de drempels verzet meet het
blok automatisch tegen de nieuwe. Reden voor een eigen sampler: `PLLoad` logt pas
bij een stap van 0,2 en de spiraal bestaat juist uit stapjes van 0,03.

*Blok 8 — olietemperatuur.* Vraagt `2101`, `22111F` en `015C` op, herkent een
negatief ECU-antwoord (`7F 22 31`) apart van NO DATA, en rekent A−40 én A−50 uit
tegen het koelwater als plausibiliteitsanker. Zet tijdelijk header `7E0` en
herstelt naar `7DF` in een `finally`.

Knop "Budget + olie" draait alleen deze twee. Doe die vóór de sweep: de sweep
jaagt de bezetting naar 100% en vervuilt het spoor.

**Wat de ritten van 19-08 opleverden.** Drie runs: 14:38 op de oude build
(1.5), 23:25 op 1.7, plus de eerste echte bulkopname.

*De olietemperatuur zit niet waar de code denkt.* `2101`, `22111F` en `015C`
gaven alle drie NO DATA. Maar `22111F` gericht op header `7E0` gaf `7F 22 31` —
requestOutOfRange, niet serviceNotSupported. Mode 22 leeft dus op 7E0 en alleen
die identifier bestaat er niet. `2101` staat nu als vervanger van `015C`
geregistreerd terwijl hij aantoonbaar dood is; dat moet eruit. Blok 9 (nieuw,
losse knop) scant de 11xx-reeks in 45 s.

*Het pollbudget remde op fouten, niet op bezetting.* De enige verlaging van
14:38 stond op `bezet 74%, fout 18%` — 74% ligt onder de drempel van 85, dus de
foutgraad was de trigger. Die kwam van `015C`, `0146`, `0114` en `015E`: zestien
missers van PIDs die de ECU ontkent. `PLSched` snoeit ze wel, maar herkanst na
120 s, dus de foutpuls komt elke twee minuten terug. Om 23:25, zonder die vier,
0% fouten en 100% tempo. Punt 1 en punt 2 hangen dus aan elkaar, en dat stond
nergens.

*`0143` staat er 256× naast.* Twee metingen: `41430048` toont 0,11 waar 28,2%
hoort, `41430029` toont 0,06 waar 16,1% hoort. De parser rekent `A + B/256` in
plaats van `A × 256 + B`.

*De bulk-recorder werkt.* 101 monsters op 1 Hz, 55 PIDs, 7,4 minuten, geen
ontbrekende velden, één gat van 343 s (de pauze). MAP haalde 103 kPa bij
barometer 101 — 18 monsters boven de 85 kPa-drempel, dus de turbodetectie krijgt
eindelijk voer, en 2 kPa boven barometrisch bevestigt atmosferisch. `010E` ging
naar −1° bij 1177 rpm en 74,5% belasting; mild en verklaarbaar als klopregeling,
niets als de −21,5° van 16-08. Segmentdetectie zet wel 59 van de 101 monsters op
"onbekend" — die herkent stationair niet.

**De preset liep dwars door de steunbitcontrole heen** (20-08 avond,
`pidlane-rijsituatie.js`). Punt 1 leek vier ritten te falen terwijl de controle
gewoon werkte. De discovery leverde 55 PIDs op, precies conform de bitmaps; 23
seconden later zette `applyVehiclePIDPreset()` er 26 bij, waaronder `015C` uit
`MERK_EXTRA_PIDS.MAZDA` — de PID waarvan `4140FAD08C81` NEE zegt en die op deze
auto nooit antwoordt. Blok 6 telde daarna 62 PIDs met 7 ontkende, en dat las als
een falende fix.

De bitmaps worden nu bewaard zodra ze gelezen worden (`_steunbits`), en
`magToevoegen()` is de poort waar de preset langs moet. De scheidslijn die
daarbij hoort: toevoegen op **bewijs** (een echt antwoord uit de auto) mag
zonder zeef, toevoegen op **aanname** (merk + brandstof) niet. Van de vijf
plekken die `supportedPIDs` uitbreiden viel alleen de preset in die tweede
categorie. `test-steunbits.js` telt ze nu, dus een zesde plek valt op.

**De wizard is van zes stappen naar één** (20-08 avond, `pidlane-motortype.js`).
Vier ervan toonden voortgang voor werk dat `initConnection()` al had gedaan:
adapter en protocol (staan nu op het startscherm, met de cascade live), een
tweede snelheidsmeting van acht reads bovenop die van regel 1721, en twee
voortgangsbalken voor een discovery en een health-scan die allebei klaar waren
— met een deadline van 4 seconden erin om te voorkomen dat de nep-animatie
bleef hangen. Stap 4 vroeg het kenteken in een tweede invoerveld naast
`kentInput`; dat doet `brandstofPoort()` nu, en alleen wanneer het nodig is.

Wat overblijft is de samenvatting, die echt werk doet (`selectStandardSet`).
`wizNext()` en `wizRdwLookup()` blijven bestaan omdat de knoppen in `wizS4` ze
nog aanroepen — die HTML wordt niet meer getoond, maar een verdwenen functie
achter een bestaande onclick is een dode knop. De HTML zelf weghalen raakt de
div-balans en is een aparte, mechanische stap.

**De testrun maakte zelf het probleem dat hij mat.** In de run van 20-08 19:40
kwamen alle 18 missers van 230 verzoeken van vier ontkende PIDs (`0114`,
`015E`, `015C`, `0146`) — nul geslaagde metingen, alleen missers. Dat gaf 15%
foutgraad, een pollbudget van 55% en de waarschuwing "veel lege antwoorden van
de ECU" aan de gebruiker. De sweep vraagt die PIDs nu niet meer op, blok 6
stelt met één regel vast wat hij eerst in dertig verzoeken uitzocht, en blok 8
slaat `015C` over. Wat overblijft in blok 6 is de interessante categorie:
steunbit JA maar de auto zwijgt toch.

**Het logboek is terug** (20-08, `pidlane-logboek.js`, kebab → Logboek). Er
werd op vier plekken gelogd en sinds de testrun-consolidatie bracht geen scherm
ze samen: `log()` (500 regels), `btDiag()` (1400, met kopie in localStorage),
de diagbundel-ring (400) en de live-log-spiegel. Het logboek *trekt* die
bronnen op het moment dat je het opent — geen wrappers om `log()` of `btDiag()`,
want die codebase heeft er al één laag van en die maakt broncode-inspectie
onbetrouwbaar. Filteren op bron en niveau, zoeken, exporteren via `plOpslaan`.
Leest de localStorage-kopie als de ring in het geheugen leeg is, dus ná een
crash sta je niet met lege handen. Eén regel in `pidlane-auth.js` erbij:
`window.plLokaalLog` — geregistreerd in `KRITIEK`, want `test-bedrading.js`
ving hem direct.

**Privacy en de Play Store** (20-08, `pidlane-privacy.js` + `privacy.html` +
`ANDROID-PLAYSTORE.md`). De prominente disclosure staat nu vóór het scannen in
`connectSerial()`, als eigen scherm dat alleen over Bluetooth en
voertuiggegevens gaat. Bewust niet samengevoegd met het akkoordscherm voor
geanonimiseerde data: Google verbiedt het combineren van een data-disclosure
met andere mededelingen. Twee echte blokkades gevonden — de workflow bouwde
alleen een debug-APK terwijl Play een `.aab` eist, en `ACCESS_FINE_LOCATION`
staat op `maxSdkVersion=30` terwijl de bulk-recorder wél GPS gebruikt, waardoor
die functie op elk modern toestel stil kapot is.

**Termux op de telefoon.** Node draait nu op het toestel; `plcheck.sh` in de
repo-root doet syntaxcontrole, alle tests, div-balans en scripttag-controle.
Draai dat vóór elke commit.

---

## Waar de volgende sessie begint

1. **Bevestigen dat de steunbitfix werkt.** Verbinden met de CX-5 en kijken of
   er "7 sensoren verwijderd die deze auto niet ondersteunt" in het log staat,
   daarna testrun 1.7 draaien: blok 6 moet nu 0 ontkende PIDs melden. Staat er
   nog iets, dan is het profiel niet opnieuw weggeschreven en komt de fout elke
   sessie terug.
   Neem in dezelfde rit blok 7 en 8 mee — die vragen tien minuten rijden vooraf
   en een warme motor, dus start de run niet meteen na het instappen.
2. **Sessie A uit `PLAN.md`** — het pollbudget dat terugschroeft op bezetting
   zonder fouten. Begin niet zonder het getal uit blok 7.
3. **Sessie C** — mag de gate een sensor opruimen die herhaald zwijgt terwijl de
   ECU hem wél belooft. Blijft nodig als vangnet naast de steunbitcontrole.

---

## Wat je moet weten om hier niet in te trappen

**Broncode-inspectie werkt niet in deze codebase.** `pidlane-remote.js` vervangt
`updPID`, `sendCmd`, `ensurePIDListActive`, `selectCategoryPIDs` en
`realScanDTC` door wrappers die het origineel in een closure houden. Wie
`String(window.updPID)` doorzoekt leest de wrapper. Meet gedrag: daarvoor zijn
`PLGate.stats()` en `PLElm.poortDicht()` toegevoegd.

**Een statische definitie is geen globale beschikbaarheid.** `openShare` staat
in de bron maar lokaal in een IIFE. De statische test zag hem, de runtime niet.
De runtime-controle is de autoriteit.

**Een halve deploy ziet eruit als een geslaagde test.** De run van 19-08 om
23:25 draaide op een tablet met een oude build: `profielTegenSteunbits`
ontbrak. Blok 6 meldde niettemin "55 PIDs, geen enkele ontkend" en dat las als
bevestiging van de fix — terwijl dat profiel gewoon al schoon wás. De fix is
dus nog steeds onbevestigd, en er is bijna een vinkje gezet op iets wat niet
gemeten is. Testrun 1.7.1 zet daarom een deploy-controle vooraan in blok 5:
staat daar FOUT, dan telt de rest van de run niet.

Hetzelfde geldt kleiner voor het kenteken. Zonder ingevoerd kenteken blijft
`vehicleInfo` op alleen "Mazda" staan, en dan geeft het merkfilter in
`probeUitgebreid()` GEEN kandidaten terug. Dat leest als een defect in de
mode-21-route en is een lege invoer.

**Een meting die zijn eigen onderwerp verstoort.** Twee keer op één dag: blok 7
telde een foutpiek van 82% die van de testrun zelf kwam, en blok 6 telde zeven
"ontkende" PIDs die de preset er ná de discovery bij had gezet. Beide keren leek
de app stuk terwijl de meetopstelling het probleem was. Vraag bij een
verrassende uitslag eerst of het meetmoment klopt — blok 6 draait ná blok 3, en
de preset draait ná de discovery.

**Een taakomschrijving is geen bron.** `PLAN.md` punt 4 zei "mode 22 PID `2101`,
al gedefinieerd maar nergens opgevraagd". Allebei fout: `2101` is in dit project
mode 21 PID 01 (een mode-22 identifier is twee bytes en past niet in de
vier-tekens-sleutel — zie de kop van `pidlane-uitgebreid.js`), en
`pidlane-bt.js:1691` roept `probeUitgebreid()` al aan na het verbinden. In een
stille catch, dus als dat faalt zie je niets — daarom kon de regel maandenlang
blijven staan. Wie punt 4 op de tekst was begonnen had een tweede pad gebouwd
naast een bestaand pad dat niemand had gemeten. Lees de module vóór je de taak
gelooft, ook als je de taak zelf hebt opgeschreven.

**Een guard op een lokale naam is geen bedradingspunt.** `KRITIEK` in
`pidlane-bedrading.js` is afgeleid uit álle `typeof X === 'function'`-guards, en
daar zitten er een paar tussen die naar een lokale variabele wijzen (`_oz` in
waakronde, `onAnnuleer` als parameter). Die horen in `GEEN_GLOBALE`, mét reden —
niet zomaar geschrapt, anders komen ze bij de volgende afleiding terug.

**Een controle die vals alarm slaat is erger dan geen controle.** De eerste
dode-knoppencontrole meldde 27 werkende knoppen als kapot omdat hij
`PLRemote.openShare()` afknipte tot `openShare`. Zulke meldingen leer je binnen
een week negeren, en dan mis je de echte. `test-dodeknoppen.js` bewaakt beide
kanten.

**626 van de 948 try-blokken zijn stille catches.** Dat is hoe alle drie de
dode mechanismen konden blijven bestaan. Werkregel: een `catch` mag stil zijn
bij een verwachte fout (localStorage vol, DOM-element weg), nooit rond een
aanroep van eigen code. Ruim op per module, telkens als je er toch bent.

**Lees een bestand vóór je het opent om te schrijven.** In deze sessie is
`pidlane-testrun.js` een keer leeggelopen door `open(p,'w')` vóór de read.
Teruggehaald uit de laatste gecontroleerde zip.

---

## Openstaand, zonder haast

- De negatieve ontstekingstiming van 16-08 (−11,5° t/m −21,5°) is in drie runs
  en ruim veertig ruwe metingen niet teruggekeerd. `parsePID()` bewaart nu de
  ruwe bytes en de let-op-melding zet ze erbij, dus mocht het terugkomen dan
  staat het antwoord in het log.
- Vier BT-herverbindingen in twaalf minuten op 16-08, telkens gevolgd door
  "scherm blijft aan". Vermoeden: Android duwt de WebView naar de achtergrond
  en neemt de socket mee. Niet onderzocht.
- `vehicleInfo` was op 17-08 half gevuld (alleen "Mazda") en op 18-08 compleet.
  Oorzaak onbekend; de testrun meldt nu welke velden ontbreken.
- `pidlane-motortype.js` heet verkeerd: de echte scheduler zit in
  `pidlane-plload.js`.
- Snap-on-patentfamilie juridisch laten nakijken vóór de referentie-opslag.
