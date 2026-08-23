# PLAN.md — wat er nog open staat

Bijgewerkt: 23-08-2026 — versie 3.0.0, testrun 3.5.

Dit bestand is het werkplan over sessies heen: **alleen wat er nog moet
gebeuren, in volgorde**. Wat er gebeurd is staat in `OVERDRACHT.md`, hoe het
systeem in elkaar zit in `PIDLANE.md`.

**Werkwijze per sessie**

1. Kijk hier welke sessie aan de beurt is. Eén sessie = één taak.
2. Upload de repo als zip. Alleen de modules openen die de taak raakt
   (`PIDLANE.md` §4 heeft de tabel).
3. Vóór elke oplevering: `plcheck` (Termux). Alles groen = veilig committen.
4. Na afloop: hier afvinken, nieuwe bevindingen naar `OVERDRACHT.md`,
   `PIDLANE.md` bijwerken als de architectuur geraakt is.

**Bij elke update die je oplevert**

Herschrijf in `pidlane-testrun.js` zowel `CAMPAGNE` (de vraag) als `_blok5()`
(de controle). Per wijziging twee regels: bestaat het nieuwe en wérkt het, en is
het oude echt weg. Zie §20 in `PIDLANE.md`.

---

## 1. ~~De preset-fix bevestigen~~ — DICHT (21-08, 11:28)

Bevestigd in het veld. Testrun 2.6 op de CX-5: **118 ok, 0 fout, 7 let op**, en
het bewijs staat op drie plekken tegelijk:

```
blok 5   Preset respecteert de steunbits — 4 bitmapblokken gelezen, poort actief
blok 6   55 PIDs, geen enkele door de ECU ontkend        (was 7 van 62)
blok 3   45 gelezen, 0 geen data, 0 parserprobleem
blok 4   bad 1 van 279, foutPct 0                        (was 18 van 230, 15%)
```

Dat 55 exact gelijk blijft is geen toeval: alles wat de preset aandraagt en de
ECU wél steunt, zat al in de bitmapset. Met de zeef ervoor voegt de preset per
definitie niets meer toe. De melding "veel lege antwoorden van de ECU" is weg.

Het was een **snelle start op een bekend profiel** — de app bood "verbinden of
toch scannen" aan. `profielTegenSteunbits()` verwijderde er nul, want het
profiel wás al schoon, en daarom bleef de melding "N sensoren verwijderd"
terecht uit. Precies zoals voorspeld.

**Wat er uit deze run nog te doen is:**

*Blok 1 slaat vals alarm.* De regel "VIN-profiel — 55 PIDs, 55 health-oordelen,
0 uur oud — **dit had bij het verbinden geladen moeten worden**" stond er
terwijl het profiel wél geladen was. Die tekst is statisch: hij controleert
alleen of er een profiel in de opslag ligt, niet of het gebruikt is. Zo'n
melding leer je binnen een week negeren. Herformuleren, of echt toetsen (bij een
snelle start zet `applyVinProfileIfKnown()` een vlag — lees die).

*De race in `bt.js:1787` staat er nog.* `updateVehicleCard()` roept `rdwLookup()`
aan **zonder `await`**, dus de preset kan `supportedPIDs` bijwerken vóórdat
`initConnection` op regel 1730 `saveVinProfile()` doet. Zo kwamen de zeven
ontkende PIDs ooit in het opgeslagen profiel. De zeef dicht het gevolg, niet de
oorzaak. Klein en zelfstandig; oppakken wanneer je toch in die module zit.

*`CAMPAGNE` klopt niet meer.* Vraag 12 vraagt om de melding "7 sensoren
verwijderd" als bewijs, terwijl die bij een werkende zeef juist wegblijft.
Herschrijven bij de volgende oplevering, samen met `_blok5()`.

**Wat er nog gereden moet worden** (zie punt 2 en 4):

- **Tien minuten rijden**, dan pas de run starten. Deze run gaf 17 monsters over
  34 s en blok 7 zegt zelf: te kort voor een oordeel.
- **Blok 9 met warme motor**, losse knop, 45 s. Koelwater stond nu op 53 °C.


## 2. ~~Het pollbudget bij bezetting zonder fouten~~ — DICHT (21-08)

Drie ritten, drie keer **nul ongevraagde remmomenten**: elke verlaging reageerde
op echte fouten of op een oplopende responstijd. Het vermoeden in de oude kop —
dat de app zichzelf terugschroeft op bezetting alleen — is niet één keer
bevestigd.

```
11:28   34 s   1 remmoment,  0 ongevraagd   responstijd  83 -> 85 ms   (+2%)
11:36  500 s   4 remmomenten, 0 ongevraagd  responstijd  83 -> 995 ms  (+1099%)
11:47   22 s   2 remmomenten, 0 ongevraagd  responstijd  99 -> 247 ms  (+149%)
```

Bezetting voorspelt de responstijd juist heel sterk zodra er echt gereden wordt.
De tegendruk hangt dus terecht waar hij hangt, en er is geen regel aan
`pidlane-plload.js` veranderd. Wat punt 2 leek te zijn was punt 1: de vier
fantoom-PIDs die elke twee minuten een foutpuls gaven.

**Wat er wél overblijft — nieuw punt 2b hieronder.**

## 2b. ~~Waarom loopt de adapter achter tijdens het rijden?~~ — BEANTWOORD (21-08, 19:12)

**Hij loopt niet achter. De adapter is niet de beperking.** Snelheidsproef
(blok 10), rijdend, 1229 verzoeken over vijf trappen, **nul missers**:

```
trap 1  0,9/s → 123 ms
trap 2  1,6/s → 131 ms
trap 3  2,5/s → 151 ms
trap 4  3,5/s → 164 ms
trap 5  9,1/s →  92 ms      <- sneller dan trap 1
```

Bij negen verzoeken per seconde is de mediaan een kwart lager dan bij één per
seconde: 638 verzoeken, p90 op 158 ms. Snel achter elkaar pollen houdt de
ELM327 warm — de seriële pipeline blijft gevuld en de adaptive timing hoeft
niet steeds opnieuw in te regelen. Een verzoek ná stilte betaalt die opstart
elke keer opnieuw. De losse prikken tijdens de rustmomenten bevestigen dat: 33
metingen, mediaan 177 ms, hóger dan welke continue trap dan ook.

**Rust maakt het per verzoek dus langzamer, niet sneller.** Dat is het
omgekeerde van wat de vraag veronderstelde.

De 950 ms van 's ochtends was een incident (vermoedelijk een BT-dip), geen
rijgedrag: dezelfde auto, ook rijdend, komt nu op 130 ms gemiddeld uit.

**Wat er wél uit kwam staat hieronder als punt 13.**

---

## 13. `PLLoad` regelde op de verkeerde grootheid — INGREEP GEDAAN (23-08)

**De wijziging is één regel.** In `pidlane-plload.js` stond:

```js
const druk = s.belasting>=this.cfg.bezetOp || s.foutPct>=this.cfg.foutOp;
```

Die `||` was de fout: bezetting boven 85% sloeg op zichzelf al aan, ongeacht
responstijd of fouten. Nu telt bezetting alleen mee mét een tweede signaal —
een responstijd die oploopt (`venStijgFactor` 1.15) of al boven `traagMs` zit.
Fouten blijven een zelfstandige trigger.

### Het bewijs uit het veldlog van 23-08

48 minuten, bergen op en af, met bulk-recorder, caravan-tracker, rijmonitor en
waakronde tegelijk aan.

- **86 verlagingen tegen 21 verhogingen.** Vier keer zo vaak omlaag als omhoog.
- **61 van die 86 bij foutgraad nul.**
- Verlagingen komen in cascades van 4 seconden; verhogingen kosten minuten en
  gebeuren alleen onder 78% bezet. Daardoor zit de app structureel op 17-29%.
- De cascade van 12:19 — tempo 74 → 55 → 41 → 30 → 22 → 17% in 22 seconden,
  terwijl de bezetting op 93-100% bleef staan. **Verlagen bracht de bezetting
  niet omlaag.**

### Waarom bezetting hier niet werkt

`PLLoad` regelt zíjn pollronde, maar de waakronde (15 sensoren per 60 s, buiten
de selectie), de bulk-recorder en de profielwissels vullen de bus ook — het log
telt 267 unieke TX-groepen en vijftien profielwissels. De bezetting weerspiegelt
ál dat verkeer; het budget raakt maar een deel. Zo knijpt hij zichzelf af voor
drukte die hij niet veroorzaakt en niet kan wegnemen.

Dat is een andere diagnose dan "bezetting is intrinsiek een slecht signaal", en
het verschil is niet uitgemeten. Wat wél vaststaat is dat de regelaar op dit
toestel, met deze modules, zichzelf naar de bodem duwt zonder aanleiding.

### Nagerekend op datzelfde log

Van de 86 verlagingen blijven er **26** staan, waarvan 24 bij een responstijd
boven 400 ms of duidelijk oplopend. De cascade van 12:19 (600-700 ms) verlaagt
dus nog steeds — terecht. Die van 11:37 (97-101 ms bij 85-87% bezet) niet meer.

Rooktest bevestigde dat op de echte reeksen, plus vier randgevallen: sluipende
opbouw wordt gevangen vóórdat `traagMs` bereikt is, een hoge maar vlakke
responstijd (300 ms) verlaagt niet, een ontbrekende `venGemMs` laat het tempo
staan in plaats van te verlagen, en `reset()` wist het ijkpunt zodat er na een
protocolherstel niet tegen een oude waarde vergeleken wordt.

### Wat er nog niet vaststaat

**De cascade kan terugkomen.** Blijft de responstijd oplopen terwijl `PLLoad`
verlaagt, dan zakt hij alsnog naar 17%. Dat is per ontwerp — dan is er echt iets
aan de hand — maar het is niet uitgesloten dat responstijd net zo min op de
ingreep reageert als bezetting. Dat blijkt pas uit de nameting.

**De snelheidsproef meet deels iets anders dan gedacht.** Blok 10 claimt tijdens
elke trap het busslot, in de rustpauzes niet. Het verschil tussen trap (119 ms)
en rust (379 ms) is dus deels het verschil tussen een schone en een drukke bus,
niet alleen tussen snel en langzaam pollen. Lees de rustprikken niet als "rust
maakt de verbinding traag".

**Vier aanvragers op één bus blijft open.** Deze ingreep maakt `PLLoad`
ongevoelig voor drukte die hij niet veroorzaakt; hij lost niet op dát er vier
modules langs elkaar heen de bus vullen. Dat hoort bij punt 6.

### De nameting

Rijd zoals op 23-08 — dezelfde vier modules aan, anders toets je niets. Testrun
3.5 stelt de vragen. Drie dingen om te noteren:

1. Waar staat het tempo aan het eind van de rit bij 0% fouten?
2. Hoe vaak staat `"Pollbudget vastgehouden"` in het log? Op 23-08 zou die
   regel ongeveer 60 keer gevuurd hebben.
3. Staat er nog een `"Pollbudget verlaagd"` bij 100-250 ms? Dan lekt er een pad
   langs de nieuwe voorwaarde.

Blok 10 is de harde nameting: op 23-08 was de slotregel *tempo 17%, bus 94%
bezet, fout 0%*.

### Nog niet aangeraakt

`omlaagTraag` (0,03) en `bezetAf` (55) staan onveranderd. Knop 1 en 2 uit de
oude opzet vielen af: `bezetAf` naar 75 doet niets als de bezetting tijdens elke
cascade op 93-100% staat, en de terugweg versnellen bestrijdt het symptoom
terwijl het probleem de heenweg was. Blijkt na de nameting dat het herstel nog
steeds te traag is, dan is `omlaagTraag` alsnog de volgende stap.

---
## 3. Mag de gate een stille sensor opruimen?

Raakt `pidlane-pidgate.js` en de health-laag. Gedragswijziging.

Vangnet naast de steunbitcontrole, voor PIDs die de ECU wél belooft maar niet
levert. Een PID die herhaald geen antwoord geeft is geen ongeldige waarde, dus
de plausibiliteitszeef laat hem staan; `_pidHealth` weet het wel.

Twee vragen die je vooraf moet beantwoorden: op hoeveel mislukte pogingen mag de
herijking hem uit `activePIDs` halen, en hoe komt hij terug als hij later alsnog
antwoordt (koud/warm, motor uit/aan)? Zonder dat tweede bouw je een zeef die
sensoren voorgoed wegwerkt.

**Testrun 3.4 levert de cijfers voor allebei.** Blok 11 telt hoeveel PIDs een
niet-ok health-oordeel hebben én in de actieve selectie staan — dat is precies
de populatie waar de drempel over moet gaan. En het controleert of de vier
haken bestaan waarmee een opgeruimde sensor ooit terug kan komen
(`plHerijkTick`, `herijkPidGate`, `pidToevoegen`, `magToevoegen`). Ontbreekt er
één, dan bouw je die zeef zonder terugweg.

---

## 4. Waar zit de motorolietemperatuur? — GEMETEN 19-08

**Beslist. Wat hier stond klopte op twee punten niet**, en de meting heeft de
rest afgemaakt. De oude tekst zei "mode 22 PID `2101`, nergens opgevraagd":
`2101` is in dit project mode 21 PID 01 (een mode-22 identifier is twee bytes en
past niet in de vier-tekens-sleutel), en `pidlane-bt.js:1691` roept
`probeUitgebreid()` al aan bij het verbinden — in een stille catch.

Blok 8 van testrun 1.7, CX-5, koelwater 73 °C:

| aanvraag | antwoord |
|---|---|
| `2101` (mode 21) | NO DATA |
| `22111F` functioneel | NO DATA |
| `015C` (standaard) | NO DATA |
| `22111F` op header `7E0` | **`7F 22 31`** |

Die laatste is de vondst. `31` is requestOutOfRange, niet `11`
(serviceNotSupported): **mode 22 leeft op 7E0, alleen bestaat identifier `111F`
daar niet.** De veldbron klopt voor andere SkyActiv-jaren, niet voor deze auto.

**Herhaald op 21-08 (koelwater 53 °C):** `2101` NO DATA, `22111F` NO DATA,
`015C` niet opgevraagd (steunbit NEE), en `22111F` op header 7E0 opnieuw
`7F 22 31`. Onveranderd beeld, dus stap 2 hieronder staat nog open — en toen was
de motor te koud voor een zinnige tweede meting.

**Wat er nog te doen is:**

1. ~~`2101` uit `pidlane-uitgebreid.js` halen.~~ **Gedaan 19-08.** De definitie is
   weg uit `UITGEBREID_DEFS` met de meting als aantekening erbij, de melding
   "olietemp zit op 2101 in plaats van 015C" is eruit, en in `PIDS_EXTRA`
   (dood object, wordt nergens gelezen) staat hij nu als `DOOD op CX-5 2018` —
   dat is de bron waaruit hij ooit is overgenomen. Blok 5 bewaakt dat hij niet
   terugkruipt. De mode-21-route blijft, voor `2102`/`210C`/`210D`.
2. Blok 9 draaien (losse knop, warme motor): 256 identifiers `2211xx` op 7E0,
   ~45 s. Antwoordt er een, dan bestaat hij; of het de olie is blijkt pas uit
   twee metingen, koud en warm. Loopt hij mee met het koelwater maar trager,
   dan is het de olie.
3. Levert blok 9 niets op, dan is dit punt dicht: deze CX-5 heeft de
   olietemperatuur niet op de diagnosebus. Verder zoeken heeft dan alleen zin
   met een echte Mazda-DID-lijst, niet met raden.

## 4b. ~~`0143` staat er 256× naast~~ — DICHT (21-08)

De fout was niet `A + B/256` maar de deler **`655.35`** (= 65535/100) waar
`2.55` hoort: PID 43 is volgens SAE `(A×256+B) × 100/255`. Drie veldmetingen
werden er exact door verklaard, en de vierde bevestigde de fix:

```
41430048  toonde 0,11   hoort 28,24 %
41430029  toonde 0,06   hoort 16,08 %
41430038  toonde 0,09   hoort 21,96 %
41430037  toont  21,57 %              <- na de fix, 21-08 11:47
```

`max` moest mee, van 100 naar 400: absolute belasting loopt bij overdruk tot een
paar honderd procent, en met de oude grens zou de gerepareerde waarde op een
turbo meteen als "buiten bereik" gemeld zijn door veldlab en koopcheck. Een
nieuw vals alarm in ruil voor het oude.

Nergens anders in de tabel staat een 16-bit procent-PID, dus deze fout stond
alleen. Waarom het nooit opviel: `pidlane-auth.js:532` voedt de demo met
kant-en-klare procenten, dus in demomodus zag de sensor er altijd goed uit.

---

## 6. Verspreide logica samentrekken

Zelfde soort probleem als de PID-gate vóór ronde 1: dezelfde regel op veel
plekken, dus elke fix raakt er één.

**Responsontleding.** Acht modules pakken zelf een `41`-header uit
(`pidlane-bt.js`, `-diagbundel`, `-graph`, `-monitor`, `-uitgebreid`,
`-veldlab`, `-verify`, `-waakronde`) in plaats van `splitBatchResponse()` te
gebruiken. Daardoor profiteert de helft niet van `PLPidLen`. Eerst
inventariseren wat elk van die acht anders doet, pas dan samentrekken —
mechanisch en gedragsneutraal, met een test die oude en nieuwe uitkomst op echte
logregels vergelijkt.

**Worker-ingang.** Elf modules doen hun eigen `fetch`. Eén `plFetch(pad,
opties)` met foutafhandeling, tegoedcontrole en logging op één plek. Raakt veel
bestanden, dus strikt mechanisch en in twee stappen: eerst de helper erbij en
één module erdoorheen, daarna de rest.

**`merkGroep()`-asymmetrie.** `MINI` matcht op prefix, `BMW` op gelijkheid.
Raakt de DTC-lookup (§14). Klein, maar apart houden omdat het gedrag verandert.

**De inventarisatie die dit punt als eerste vraagt, doet blok 11 nu vanzelf**
(testrun 3.4): het telt per module het eigen uitpakwerk tegen
`splitBatchResponse`, telt de losse `fetch`-aanroepen en kijkt of er al een
`plFetch`-helper is, en toetst de `merkGroep`-asymmetrie live op vier
merkstrings. Draai eerst een run, dan begin je die sessie met getallen.

---

## 7. ~~Opruimen en afmaken~~ — zie punt 15

Hernoemen, vangnet en mode 06 zijn afgehandeld op 21-08. Wat er van dit punt
overblijft staat in punt 5 (stille catches) en punt 6 (verspreide logica).

## 8. ~~Vierde chip in de topbar~~ — GEBOUWD (21-08)

`pidlane-run.js` + `test-run.js`, chip in `index.html`. Vijf schakelaars, dot
groen met teller zodra er iets draait. Caravan en rit-analyse vragen bevestiging
bij **stoppen**, niet bij starten, en staan grijs zonder adapter.

De valkuil uit de vorige versie van dit punt was echt: `caravanActive` en
`ritActive` zijn top-level `let` zonder IIFE, dus `window.caravanActive` is
altijd `undefined`. `test-run.js` bewaakt het.

Daarbij kwam een gat in de bedradingscontrole boven water: `test-bedrading.js`
scande alleen op `typeof X === 'function'`, niet op `!==`. De vijf nieuwe guards
gleden er zonder melding doorheen. Regex uitgebreid; er kwam meteen één bestaand
geval mee (`obj`, lusvariabele in de dode-knoppencontrole).

## 9. ~~Opmerkingveld bij het opslaan~~ — GEBOUWD (21-08)

Tekstvak in de keuzedialoog van `plOpslaan()`. Bovenaan het tekstbestand, in een
kader onder de kopband in de PDF. Leeg laten verandert niets aan het bestand. De
vier aanroepers hoefden niet mee te veranderen.

## 10. ~~Wizard-HTML, versies, locatie~~ — GEDAAN (21-08, avond)

Drie dingen die als "openstaand van gisteravond" op de lijst stonden.

**De wizard-HTML is weg.** Stappenbalk (12 divs) en `wizS1` t/m `wizS5` (42
divs) uit `index.html`: 782 → 728, in balans. Daarmee werden `wizNext`,
`wizRdwLookup`, `_wizRefreshKnown` en `wizToggleDetail` dood en die zijn ook
verwijderd — dode functies maken de dode-knoppencontrole waardeloos, want die
kan dan niet meer zien of iets bij een knop hoort of gewoon nooit opgeruimd is.

**De versies lopen niet meer uiteen.** `package.json` zei 2.1.0, `config.js`
zei 2.9.0, en de CI zet `versionName` uit package.json — een bugmelding op
"2.9.0" ging dus over een APK die 2.1.0 heette. Beide staan op **3.0.0**,
`test-versie.js` bewaakt het, en de workflow faalt hard als ze verschillen.
`public/config.js` is als build-trigger toegevoegd, anders bouwt een versiebump
geen nieuwe APK. `versionCode` blijft het buildnummer; die hoort juist niet
gelijk te zijn.

**Locatie is eruit.** `pidlane-gps.js` verwijderd, geen positie meer in de
bulk-recorder, `privacy.html` en het disclosurescherm bijgewerkt, blokkade 1 in
`ANDROID-PLAYSTORE.md` gesloten op route (a). De functie wérkte toch al niet:
`ACCESS_FINE_LOCATION` liep tot API 30, dus op Android 12+ kreeg `watchPosition`
nooit een fix en verdween de fout in een lege catch. `test-geen-gps.js` bewaakt
de drie verklaringen samen, en de CI faalt als de permissie ooit zonder
`maxSdkVersion=30` in het manifest komt.

**Bij elke update meeleveren:** `package.json` en `public/config.js` met een
opgehoogde versie, in de delta-zip. Dat is nu onderdeel van de oplevering.

---

## 14. ~~Play Store: de drie blokkades~~ — ALLE DRIE UIT DE CODE (21-08)

**Blokkade 1 — locatie.** Route (a): de app leest geen locatie meer.
`pidlane-gps.js` weg, geen positie in de bulk-recorder, `privacy.html` en het
disclosurescherm bijgewerkt. `ACCESS_FINE_LOCATION` blijft alleen als
legacy-BT-permissie met `maxSdkVersion=30`; de CI faalt als dat ooit verruimd
wordt. Locatie is geen onderwerp in de Data safety-form.

**Blokkade 2 — inzendbaar bestand.** De CI bouwt en ondertekent een `.aab`,
`versionCode` loopt mee met `github.run_number`, `versionName` komt uit
`package.json` en is gelijk aan `APP_VERSION`.

**Blokkade 3 — minimum functionality.** De demoknop staat nu op het
**loginscherm**, met woordelijk de tekst die de reviewnotitie belooft. Hij stond
tot 21-08 in het verbindscherm, dus achter de inlogmuur: een reviewer zonder
account zag alleen een loginformulier. De notitie en de app vertelden twee
verschillende verhalen, en juist dat merkt een reviewer op.

De knop zet géén sessie — geen token, geen rol. AI loopt via de worker en die
vraagt een geldig sessietoken, dus die route blijft dicht voor iedereen die
alleen de demo opent. `test-demo-toegang.js` bewaakt de knop, de functie én dat
de tekst gelijk blijft aan de reviewnotitie.

**Ook opgeruimd:** drie terugvallen op versie `'2.1'` — in de HTML van het
loginscherm, in het scriptje dat die HTML overschrijft, en in de
Airtable-melding van `pidlane-auth.js`. Alle drie uit de tijd dat `package.json`
werkelijk 2.1.0 zei. Zo'n terugval is erger dan geen waarde: hij ziet er geldig
uit, dus niemand controleert hem. Nu `'?'`, en `test-versie.js` houdt het zo.

**Wat er nog moet is geen code:** screenshots waarop echte meetgegevens te zien
zijn, een storebeschrijving die Bluetooth-diagnose als kernfunctie noemt, en de
Data safety-form invullen gelijk aan `privacy.html`. Plus de keystore-back-up
ergens die niet dezelfde plek is als de secrets.

---

## 11. ~~De race in `bt.js:1787`~~ — DICHT (21-08)

`updateVehicleCard()` geeft de lopende `rdwLookup()` nu terug, en
`initConnection` wacht erop voordat `saveVinProfile()` draait. Twaalf seconden
grens; daarna geen internet of RDW plat, en dan wordt het profiel **niet**
opgeslagen — het zou merk, model en brandstof missen en dat blijft hangen tot de
volgende volle discovery.

Nieuw: aandachtspunten bij het voertuigdossier (`plVoertuigLet()` in
`pidlane-voertuigdata.js`). Mislukt de opzoeking, dan kleurt de auto-chip oranje
en staat er in het dossier waarom het profiel ontbreekt. Geen toast: een melding
die wegvalt terwijl je rijdt is geen melding. Het punt verdwijnt bij een
geslaagde nieuwe poging.

---

## 15. ~~Punt 7: hernoemen, vangnet, mode 06~~ — DICHT (21-08)

`pidlane-scheduler.js` heet nu `pidlane-motortype.js`; alle acht referenties in
één keer mee. De echte scheduler zat altijd al in `pidlane-plload.js`.

Het `renderGauges()`-vangnet is weg. Het meldde niets meer sinds de
steunbitcontrole en de geactiveerde herijking. Bewust wég in plaats van laten
staan: een controle die nooit aanslaat wordt niet gelezen, en een zeef in de
tekenlus filtert stil — precies wat de bug destijds drie rondes verborgen hield.

Mode 06 vervalt; was voor eigen gebruik en niet meer nodig.

---

## 5. ~~De stille catches~~ — DICHT (22-08): 584 opgeruimd, 0 te gaan

**Alle zes bestanden uit deze klus staan op 0:** `pidlane-bt.js`,
`pidlane-veldlab.js` (21-08), `pidlane-btflow.js`, `pidlane-auth.js`,
`pidlane-fuel.js`, `pidlane-koopcheck.js`, `pidlane-remote.js` en
`pidlane-testrun.js` (22-08, resp. 30, 39, 40, 43, 105 en 66). Samen 584 van
de oorspronkelijke 824. Voor elk bestand bewezen dat alleen catch-bodies en
commentaar wijzigden — de rest van de code is teken voor teken gelijk.

`test-stille-catches.js` is een **ratel**: per module staat de huidige stand,
meer mag niet, minder mag altijd. Een catch met een reden erin
(`catch(e){ /* stil: opslag kan vol zijn */ }`) telt niet mee — dat onderscheid
is het punt. Een test die nul eist zou vanaf dag één rood staan, en een test die
altijd rood staat wordt genegeerd.

**Werkregel:** stil mag bij een verwachte externe fout (opslag vol, element weg,
een sonde die juist test óf iets antwoordt), nooit rond een aanroep van eigen
code. Bij twijfel: `btDiag` als het in het logboek hoort, `console.warn` voor de
rest. Nooit een toast — die vallen weg tijdens het rijden.

**`remote` en `testrun` (22-08, avond) zijn ook klaar.** Bij `testrun` is
alleen de regel over `CAMPAGNE`/`_blok5()` gevolgd: de catch-*bodies* binnen
`_blok5()` zijn gevuld zoals overal elders in het bestand, maar de
testlogica zelf (welke controles er zijn, wat ze toetsen) is niet aangeraakt.
Dat blijft een losse stap, samen met de volgende `CAMPAGNE`-herschrijving.

Bij het opruimen van `testrun.js` maakte ik zelf twee keer de fout die deze
hele klus juist moet voorkomen: een `return {...}` en een geneste try/catch
ín een catch-body. `verifieer.js` ving het meteen (zei `false` in plaats van
`true`) — hersteld naar `throw new Error(...)` respectievelijk één enkel
catch-niveau. Genoemd omdat het laat zien dat de regel "geen `{`/`}` in een
catch-body" ook geldt voor `return`-statements met een object-literal, niet
alleen voor `console.warn`-aanroepen.

**Wat de twee modules opleverden:**

*`bt.js`* — `probeUitgebreid()` stond in een lege catch. Dáárom zei `PLAN.md`
punt 4 maandenlang dat mode 21 nergens werd opgevraagd. Idem
`herijkPidGate('protocol gevonden')`: faalt die, dan draait de PID-zeef op oude
kennis, en dat is de hele fantoomsensor-familie.

*`veldlab.js`* — zie punt 16 hieronder.

*`btflow.js` (22-08)* — zie punt 17 hieronder. Elf van de dertig zaten om een
eigen tekenfunctie heen (`updateVehicleCard`, `renderDTC`, `renderGauges`,
`buildDiscoveredPIDList`, `buildPIDList`, `updateScenarioBadge`): faalt zo'n
aanroep, dan loopt het scherm achter op de staat en zegt niets dat er iets
misging. Die melden nu via `log(...,'warn')`, want ze raken wat de monteur ziet,
niet de BT-verbinding.

*`auth.js`, `fuel.js`, `koopcheck.js` (22-08)* — zie punt 18 hieronder. Zelfde
soort patroon, maar dan zeven keer dezelfde aanname ("de sensoren staan al goed
vóór ik meet") in plaats van tekenfuncties.

*`remote.js` (22-08, avond)* — zie punt 19 hieronder. Een wrapper-installatie
die de op-afstand-schrijfblokkade (`clearDTC`) activeert, zat in een lege
catch — de scherpste vondst van de hele klus.

*`testrun.js` (22-08, avond)* — zie punt 20 hieronder. Twee keer dezelfde
header-reset (`ATSH7DF`) die "ALTIJD" moet gebeuren volgens het eigen
commentaar, zat toch stil. Plus: het eigen testblok (`_blok5`) had twee
plekken die een leesfout ten onrechte als "PASS" zouden boeken.

---

## 16. De survey telt een transportfout als "PID bestaat niet"

Gevonden op 21-08 bij het opruimen van `pidlane-veldlab.js`, regel 373:

```js
let raw=''; try{ raw=await sendCmd(...); }catch(e){}
// verderop:  let st='nodata'
```

Gooit `sendCmd` — timeout, socket weg, bus bezet — dan blijft `raw` leeg en
wordt de status `nodata`. Een **transportfout telt dus als "deze auto
ondersteunt deze PID niet"**, en dat oordeel gaat naar Airtable en voedt de
dekkingsmatrix per merk.

Exact dezelfde verwarring die blok 10 met een ijkronde vermijdt — maar dan in
het instrument dat bepaalt wat een merk ondersteunt. Hoeveel van de bestaande
Airtable-records hierdoor vervuild zijn is onbekend.

De catch meldt het nu. `nodata` en `transportfout` uit elkaar trekken is een
gedragswijziging: aparte teller in `sv.pids`, en dan de vraag of oude records
nog te vertrouwen zijn.

Kleiner uit dezelfde module: `vlSave()` en `_vlAtQueuePush()` slikten
QuotaExceeded stil, terwijl het commentaar erboven letterlijk waarschuwt voor
"onzichtbaar dataverlies". Een mislukte `vlSave()` betekent dat de veldlab-sessie
weg is — het enige wat een rit aan onderzoek oplevert. Beide melden nu.

En `pidlane-veldlab.js:618` wrapt `log()`. Dat is de tweede wrapperlaag naast
`pidlane-remote.js`; nu gedocumenteerd op de plek zelf.

---

## 17. "Log wissen" wist de spiegel niet

Gevonden op 22-08 bij het opruimen van `pidlane-btflow.js`.

`_btPersistNow()` schrijft de BT-log naar **twee** plekken — `sessionStorage`
én een `localStorage`-spiegel, omdat sessionStorage een Android WebView
proces-kill niet overleeft. `restoreBtLog()` valt op die spiegel terug.
`clearBtLog()` (regel 632) wist alleen de sessionStorage-kant.

Gevolg: log wissen, daarna herladen zonder dat er nog een `btDiag`-regel bij is
gekomen, en de oude log staat er weer. Een knop die zegt dat hij iets wist en
het dan niet doet is erger dan geen knop — zeker als je hem gebruikt om een
schone log voor een bugmelding te maken.

De fix is één regel (`localStorage.removeItem('pl_btlog')` ernaast), maar dat is
een gedragswijziging en hoort dus niet in de opruimstap. Meenemen in de sessie
die `btflow` inhoudelijk raakt.

Kleiner uit dezelfde module: bij een mislukte optimalisatie zet de code de
adapter terug op `ELM_BASELINE` in een lege catch, terwijl het venster de
gebruiker wél meldt dat de standaardinstellingen hersteld zijn. Faalt dat
herstel, dan staat de adapter nog op de geprobeerde instellingen en weet niemand
het. Meldt nu via `log(...,'err')`.

---

## 18. Zeven keer dezelfde stille aanname: "de sensoren staan al goed"

Gevonden op 22-08 bij het opruimen van `pidlane-koopcheck.js` en
`pidlane-fuel.js`. Zeven analysefuncties zetten eerst het juiste PID-profiel
aan (`ensurePIDsActive` / `ensurePIDListActive`) en beginnen dán pas te meten
of te analyseren — maar die aanzet-aanroep stond overal in een lege catch:

- `pidRecStartRec()` en `deepLogStart()` (handmatige opnames)
- `runOnderhoud()`, `runEVCheck()`, `runLangeRitTech()` (de AI-doorlichtingen)
- `climateStart()` (airco/wintercheck)
- **`runKoopcheck()` — de scherpste van de zeven.** Het commentaar erboven zegt
  letterlijk: *"P2: zorg dat de conditiecheck op de juiste, verse PIDs draait —
  niet op toevallig-actieve of lege sensoren. (Koopcheck miste eerder een
  profiel.)"* Dat is een gedocumenteerde bugfix. Faalt de aanroep die 'm
  oplost, dan is de koopcheck stilletjes terug bij precies het probleem dat P2
  moest wegnemen, en niemand ziet het gebeuren.

Alle zeven melden nu via `log(...,'warn')` als de aanzet mislukt, met erbij dat
de meting/analyse dan op oude of lege data kan draaien.

Zelfde patroon, los van de zeven: in `loadRemoteConfig()`
(`auth.js`/`fuel.js`) zegt het commentaar zelf *"faalt dit stil, dan lijkt
admin.html kapot terwijl de config gewoon in Airtable staat"* — en toch stond
`applyConfigToUI()` er in een lege catch naast. En in `apiFetch()` (`fuel.js`)
zat `_situatiePromptLine()` stil: het commentaar zegt dat de AI zonder die
regel een caravanrit als een zieke auto beoordeelt.

**Niets hiervan is opgelost — alleen zichtbaar gemaakt.** Of de aanroep ook
echt faalt in het veld is niet getest; dat vraagt een sessie die met opzet een
PID-activatie laat mislukken en kijkt of de melding verschijnt.

Kleinere vondst uit dezelfde ronde: `markeer.js` matcht `catch(...){}` zonder
`g`-vlag, dus op een regel met **twee** lege catches op één regel wordt alleen
de eerste gemarkeerd. In `pidlane-koopcheck.js` (`maybeStartLiveLog()`, regel
197) bleef zo een `showToast`-catch achter de hand over. Met de hand gevonden
en gevuld; `gereedschap/markeer.js` zelf is niet aangepast (hoort niet in deze
klus).

---

## 19. `remote.js`: de schrijfblokkade kon zwijgend uitblijven

Gevonden op 22-08 (avond) bij het opruimen van `pidlane-remote.js` — de
scherpste vondst van deze klus.

Het bestand haakt met vijftien wrapper-installaties in op bestaande
functies, elk in zijn eigen `try{ if(typeof X==='function'){...} }catch(_){}`.
Voor veertien daarvan is een mislukte installatie vervelend (de expert ziet
dan geen live-telemetrie, of een knop synct niet) maar niet gevaarlijk. Voor
één is dat anders:

```js
try{ // de éne schrijfactie in de app: op afstand hard geblokkeerd
  if(typeof clearDTC==='function'){const _cd=clearDTC;
    clearDTC=async function(){
      if(window._remoteVehicleMode){ /* ... blokkeer ... */ return; }
      return _cd.apply(this,arguments);
    }; window.clearDTC=clearDTC;}
}catch(_){}
```

Het eigen commentaar noemt dit "de éne schrijfactie in de app" — de garantie
dat een remote sessie alleen-lezen is. Faalt de installatie (bijvoorbeeld
omdat `clearDTC` op het moment van laden nog niet bestaat), dan is die
garantie stilletjes niet actief, en zou een expert op afstand foutcodes
kunnen wissen op andermans auto. Dit is nu de enige plek in de hele
stille-catches-klus met een `console.error` in plaats van `console.warn`.

**Twee kleinere, verwante vondsten in hetzelfde bestand:**

- `applyVState()` — de functie die het voertuigprofiel van de local naar de
  expert-instantie kopieert — had `supportedPIDs=new Set(...)` en de
  `pidToevoegen()`-poort allebei in een lege catch. Faalt de eerste, dan blijft
  de PID-keuzelijst bij de expert leeg of verouderd. Faalt de tweede, dan komt
  de remote-selectie ongefilterd door de poort heen — dezelfde
  fantoomsensor-familie als punt 1, nu via de remote-sessie in plaats van een
  ECU-verbinding.
- `shareStop()` — het sluiten van de sessie op de server kon stil mislukken
  terwijl de lokale UI toch "gestopt" toont. De sessie kan dan op de server
  nog actief blijven voor de expert.

Niets hiervan is opgelost, alleen zichtbaar gemaakt (`console.error` /
`console.warn` / `logA(...,'warn')`).

---

## 20. `testrun.js`: twee "ALTIJD"-garanties die toch stil konden falen

Gevonden op 22-08 (avond) bij het opruimen van `pidlane-testrun.js`.

**De header-reset.** Blok 8 en blok 9 zetten voor een test de ECU-header op
`7E0` (motorblok) en moeten die na afloop terugzetten naar de brede
broadcast. Het commentaar erboven is ondubbelzinnig:

> Header ALTIJD terugzetten naar de functionele broadcast. Blijft 7E0 staan,
> dan praat de hele app daarna alleen nog tegen het motorblok — en dat merk
> je pas als een andere module niets meer terugkrijgt.

En toch stond `try{ await sendCmd('ATSH7DF', 1500); }catch(e){}` in de
`finally` van allebei de blokken. Blok 9 heeft zelfs een tweede, met opzet
gebouwd vangnet (nog een `ATSH7DF`-poging) voor het geval de eerste al
faalde tijdens de scan — en ook dát vangnet was stil. Bij een dubbele mislukking
zou de rest van de app-sessie zonder waarschuwing alleen nog met het
motorblok praten. Beide boeken nu een `FOUT`-regel in het testrun-logboek in
plaats van te zwijgen.

**Het herstelpunt.** `_bewaarSelectie()` legt vóór elke run vast welke PIDs
en welk profiel actief waren, zodat `_herstelSelectie()` dat na afloop
terug kan zetten — inclusief bij een crash. De drie regels die dat
vastleggen (`activePIDs`, `manualPIDs`, `actiefPollProfiel()`) zaten alle
drie in een lege catch. Faalt zo'n vastlegging, dan legt de run een
onvolledig of leeg herstelpunt vast, en het herstel ná de run zet dan
netjes een lege of halve selectie terug — precies het scenario waar de
module haar bestaansrecht aan ontleent ("de selectie wordt hersteld in een
finally, ook als de run halverwege klapt").

**De test die zichzelf voor de gek houdt.** In `_blok5()` — het blok dat
controleert of een opgeruimd stuk code écht weg is — zaten twee controles
die bij een leesfout de verkeerde kant op vallen: een mislukte lezing van
`window.renderGauges` (om te checken of een oud vangnet weg is) of van
`PLBulk.status()` (om te checken of een oud GPS-veld weg is) werd stil
geslikt, waarna de test gewoon doorging alsof het oude ding aantoonbaar weg
was. Een test die bij een fout "PASS" meldt in plaats van "kon niet
controleren" is erger dan geen test. Beide gooien nu door (`throw new
Error(...)`) zodat `_doe()` het als `FOUT` boekt.

**Bewijsvoering voor PLAN.md punt 2/13.** Los van bovenstaande: `_budgetVoor`
(het tempo vóór de sweep, blok 3) en de `PLLoad.staat()`/`PLBus.stats()`-
vergelijking aan het eind van blok 10 zijn de metingen waar die twee
openstaande punten om vragen. Beide lazen stil — een mislukte meting hier
levert geen foutmelding op maar gewoon een onvolledige regel in het log,
wat het bewijs voor punt 2/13 zonder waarschuwing kan uithollen.

Niets hiervan is opgelost, alleen zichtbaar gemaakt.

---

## 12. Blok 1 van de testrun: nog twee scherpe randen

De VIN-profielmelding is op 21-08 gerepareerd (leest nu `profielHealth()` in
plaats van onvoorwaardelijk te waarschuwen), maar de tegenproef is nooit
gedaan: **wis de app-gegevens, verbind opnieuw, en kijk of daar dan LET OP met
"NIET geladen" staat.** Een controle die alleen groen kan worden bewijst niets.

Tweede randje uit dezelfde hoek: blok 4 meldde op 21-08 om 11:36 twee afwijkende
bytelengtes (`0155` en `0156`, tabel 2 tegen gemeten 1). Om 11:47 was dat weg.
Komt het terug, dan klopt de lengtetabel niet voor die twee.

**Sinds testrun 3.4 hoef je daar niet meer naar te zoeken:** blok 11 noemt
`0155`/`0156` expliciet als ze in `PLPidLen.afwijkingen()` staan.

**De eerste rand is op 23-08 vanzelf beantwoord.** Om 11:33:32 stond er in het
veldlog `Geen profiel onder pl_vinprof_JMZKF6W7600766507 — volle discovery`.
Dat is precies de tegenproef die nooit gedaan was: de controle kán rood worden,
hij is niet alleen-groen. Blijft over: nagaan of blok 1 dat óók als LET OP
boekt, niet alleen de BT-log.

---

## Meten in het veld (geen sessie, maar meenemen)

- Hoe vaak vuurt het `renderGauges()`-vangnet nog? (voorwaarde voor punt 7)
- Turbo-detectie op een auto mét laaddruk-PIDs. De CX-5 is atmosferisch en komt
  nooit boven de 85 kPa-drempel, dus daar valt niets te zien. Nu de detectie
  eindelijk leeft is dit voor het eerst een zinnige test.
- Echte merkstrings uit RDW-data, om ronde 9 te valideren.
- **Ontstekingsvervroeging (`010E`) tegen belasting (`0104`/`010B`)**, als
  mediaan per rit en als trend over ritten. Een motor die stil vermogen
  inlevert door koolstofaanslag tekent zich daar af als een langzaam zakkende
  lijn, terwijl elke losse waarde binnen bereik blijft en het foutgeheugen leeg
  is. Dat is de bevinding waar een garage voor betaald krijgt. Vraagt dat de
  bulk-recorder over ritten heen bewaart — dat doet hij nog niet.
- Eerste echte bulkopname over een hele rit: wat doet IndexedDB aan groei, en
  wat kost het aan accu?

---

## Buiten de techniek

- **Snap-on-patentfamilie** (gelijkenis met de referentie-opslag) — juridisch
  laten nakijken vóórdat je erop doorbouwt.
