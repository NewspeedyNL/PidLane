# PLAN.md — wat er nog open staat

Bijgewerkt: 20-08-2026.

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

## 1. Eerst rijden: drie dingen bevestigen

**De poging van 19-08 telt niet.** Blok 5 meldde `profielTegenSteunbits
ontbreekt` — de tablet draaide een oude build. Blok 6 zei wél "55 PIDs, geen
enkele ontkend", en dat zag eruit als geslaagd, maar dat profiel was al schoon.
Een halve deploy die eruitziet als een bevestiging is duurder dan een mislukte
test. Testrun 1.7.1 zet die controle daarom vooraan in blok 5: staat daar FOUT,
lees de rest van de run dan niet als bewijs.

Twee dingen vooraf, allebei op 19-08 misgegaan:

- **Deploy compleet?** Blok 5 mag geen FOUT geven.
- **Kenteken ingevoerd?** Zonder kenteken blijft `vehicleInfo` op alleen "Mazda"
  staan en geeft het merkfilter in `probeUitgebreid()` GEEN kandidaten terug.
  Dat lijkt op een defect en is het niet.

Doe de rest in één rit met **testrun 1.7.1**, en let erop dat het profiel vóór
de rit nog vervuild ís — anders bewijst "0 ontkend" niets.

Testrun 1.7.1 meet in dezelfde rit alvast voor punt 2, zonder er iets aan te
veranderen. Dat vraagt **minstens tien minuten rijden vóór je de run start**,
anders is het pollbudget-spoor te kort. Blok 7 is los te draaien met de knop
"Budget + olie" — dat is de verstandige volgorde: eerst die, dan pas de sweep,
want de sweep vervuilt het spoor. Blok 9 (DID-scan, 45 s) vraagt een warme
motor en staat bewust niet in de gewone run.

**Bij het verbinden** hoort er te staan: *"7 sensoren verwijderd die deze auto
niet ondersteunt"* (`0146`, `0114`, `010A`, `015E`, `012C`, `015C`, `015A`).

**In blok 6** hoort "Profiel tegen de steunbits" nu **0 ontkend** te melden.
Staat er nog iets, dan is het profiel niet opnieuw weggeschreven en komt de fout
elke sessie terug — dan is `saveVinProfile()` het probleem, niet de controle.

**Controleer dat er niets verdween dat het wél deed**: `010C`, `0104`, `0105`,
`010E` en `0115` horen er gewoon te zijn. Deze fix verwijdert sensoren, dus een
te gretige versie is erger dan de kwaal.

Neem ook mee: hoeveel tijd kost de steunbitcontrole bij een bekend voertuig —
blijft de snelle start snel?

---

## 2. Het pollbudget bij bezetting zonder fouten

Raakt `pidlane-plload.js` en `test-plload.js`. Gedragswijziging.

Bezetting is aanvraagtempo × responstijd; bij continu pollen is die per
definitie hoog. Nu geldt `belasting >= 85%` als tegendruk, óók bij 0% fouten en
vlakke responstijden. Dan throttlet de app zichzelf zonder dat de ECU erom
vraagt. Gemeten op 17-08: 30% → 22% → 17% bij `fout 0%` en `124 ms`.

Voorstel: bezetting alleen als tegendruk tellen wanneer de responstijd oploopt
of er fouten bijkomen. Bouw eerst een test die de spiraal reproduceert, dan pas
de wijziging — anders weet je achteraf niet of het beter is geworden.

**Twee metingen van 19-08, en ze wijzen niet dezelfde kant op.**

*14:38, oude build, vier fantoom-PIDs actief.* Eén verlaging: `bezet 74%, fout
18%, 194ms`. Bezetting 74% ligt **onder** `bezetOp` (85), dus de trigger was de
foutgraad, niet de bezetting. En die foutgraad kwam ergens vandaan: `perPid`
telt `015C` 5 missers, `0146` 5, `0114` 3, `015E` 3. Zestien missers van PIDs
die de ECU ontkent. Tempo eindigde op 34%.

*23:25, fantoom-PIDs weg.* Blok 7 over 42 s stationair: nul remmomenten, tempo
100% van begin tot eind, foutgraad 0% in álle monsters. En de omgekeerde
uitslag op de kernvraag: responstijd 102 ms bij lage bezetting tegen 160 ms bij
hoge — **+57%**. Bezetting voorspelt hier wél tegendruk. Zone "ruim" werd 64%
van de tijd gehaald, dus de vaste terugweg bestaat.

**Waar dat op neerkomt.** Het vermoeden in de kop hierboven — terugschroeven op
bezetting zonder fouten — is in geen van beide metingen bevestigd. Wat er in de
14:38-run gebeurde was terugschroeven op fouten die er niet hadden moeten zijn.
Als dat het hele verhaal is, is punt 2 geen regelkringprobleem maar een gevolg
van punt 1, en gaat het vanzelf weg zodra de steunbitfix draait.

**Doe daarom eerst dit, en pas dan de wijziging overwegen:** blok 7 over een rit
van minstens tien minuten, op een build mét de steunbitfix. Blijft de foutgraad
dan op 0% en het tempo op 100%, dan gaat punt 2 dicht en is de winst al binnen.
Duikt het tempo alsnog bij 0% fouten, dan pas is de tegendruk verkeerd
opgehangen — en dan weet je ook meteen waaraan wél, want blok 7 logt de
responstijd erbij. 42 s stilstand bewijst geen van beide.

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

## 4b. `0143` staat er 256× naast

Klein, zelfstandig, twee keer bevestigd. De parser rekent `A + B/256` waar het
`A × 256 + B` moet zijn.

| ruw | app toont | hoort |
|---|---|---|
| `41430048` (B=72) | 0,11 | 28,2 % |
| `41430029` (B=41) | 0,06 | 16,1 % |

Nooit opgevallen omdat niemand naar absolute motorbelasting kijkt. Raakt
`pidlane-data.js`. Controleer meteen of dezelfde bytecombinatie elders in de
tabel voorkomt — dit is precies het soort fout dat op meer PIDs zit.

---

## 4c. Play Store: twee blokkades, één keuze

Zie `ANDROID-PLAYSTORE.md` voor de volledige checklist. Wat er beslist moet
worden voordat er iets ingezonden kan worden:

**Locatie — kiezen.** De app gebruikt `navigator.geolocation` in
`pidlane-bulk.js` en `pidlane-gps.js`, maar het manifest zet
`ACCESS_FINE_LOCATION` op `maxSdkVersion=30`. Op Android 12+ is die functie dus
stil kapot: `watchPosition` roept nooit zijn callback aan. Ofwel GPS eruit
(snelste route door de review), ofwel `maxSdkVersion` weg plus een eigen
disclosure vóór de eerste ritopname en locatie in de Data safety-form.

**Ondertekenen.** De workflow bouwt nu ook een `.aab` (Play neemt geen losse
APK meer aan), maar die is ongetekend. Keystore aanmaken en beslissen tussen
Play App Signing en zelf tekenen. Doe dit pas als de rest staat — een gelekte
keystore is niet te repareren.

Verder: reken erop dat een reviewer geen OBD2-adapter heeft. Wat hij dan te
zien krijgt bepaalt of de app "onbruikbaar" of "ik had geen hardware" is.

## 5. De stille catches, per module

626 van de 948 `try`-blokken gooien hun fout weg zonder spoor. Dat is hoe ronde
5 maanden dood kon zijn zonder dat iemand het zag.

**De regel:** een `catch` mag stil zijn als je de fout verwacht (localStorage
vol, DOM-element weg, JSON van een gebruiker). Nooit rond een aanroep van eigen
code — daar hoort minimaal een `btDiag(..., 'warn')` in.

Niet als aparte grote klus doen. Wel gericht beginnen bij de modules waar een
stille fout het meest kost, telkens als je er tóch bent:

- `pidlane-pidgate.js` en `pidlane-pids.js` — de PID-filtering; hier ging het
  drie keer mis
- `pidlane-bt.js` — 45 stille catches in de transportlaag
- `pidlane-plload.js` en `pidlane-data.js` — de regelkringen

Nieuwe `typeof`-guards die je onderweg maakt: registreren in `KRITIEK`
(`pidlane-bedrading.js`). `test-bedrading.js` dwingt dat af.

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

---

## 7. Opruimen en afmaken

**`pidlane-scheduler.js` heet verkeerd.** De echte scheduler (`PLSched`,
`pidPollInterval`, `pidsDueNow`) zit in `pidlane-plload.js`; wat in
`scheduler.js` staat is motortype-splitsing en EV-modus. Hernoemen naar
`pidlane-motortype.js` of samenvoegen. Puur naamgeving, maar het kost elke keer
dat je erin duikt tien minuten.

**`renderGauges()`-vangnet.** Verwijderen zodra uit de logs blijkt dat de zeef
daar nooit meer iets tegenhoudt. Kan pas na een paar ritten met de geactiveerde
herijking én de steunbitcontrole, want die veranderen precies wat er langskomt.

**Mode 06 in `pidlane-veldlab.js`** plus de bijbehorende `PIDLANE.md`-update.
Al een keer uitgesteld.

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
