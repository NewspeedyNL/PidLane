# PLAN.md — wat er nog open staat

Bijgewerkt: 15-08-2026, na de bedradingssweep.

Dit bestand is het werkplan over sessies heen. `PIDLANE.md` beschrijft hoe het
systeem in elkaar zit, `OVERDRACHT.md` wat er in één sessie gebeurd is, dit
bestand wat er nog moet gebeuren en in welke volgorde.

## Koude start beantwoord (18-08, tweede log)

Het tweede bestand van 18-08 is **dezelfde run**, zeven minuten later opnieuw
opgeslagen. Alleen de TX/RX-staart en de logs onderaan zijn vers — en juist die
geven het antwoord, want daarin rijdt hij écht: koelwater 53 °C, toerental tot
2292, belasting tot 71%.

**Ontstekingstiming bij het opwarmen, uit de ruwe batches:**

| ruw | graden | keer |
|---|---|---|
| `0x84` | +2,0° | 1 |
| `0x95` | +10,5° | 2 |
| `0x9C`–`0xAB` | +14° t/m +21,5° | 3 |
| `0xBB`–`0xBE` | +29,5° t/m +31° | 10 |
| `0xC9`–`0xCA` | +36,5° t/m +37° | 4 |

Allemaal positief, en het patroon klopt: meer vervroeging naarmate toerental en
belasting stijgen. **In drie runs en ruim veertig ruwe metingen is er geen
enkele negatieve waarde meer geweest.** De −11,5° t/m −21,5° van 16-08 blijven
onverklaard maar zijn niet teruggekeerd. `parsePID()` bewaart nu de ruwe bytes
en de let-op-melding zet ze erbij, dus mocht het terugkomen, dan staat het
antwoord meteen in het log. Vraag blijft open, maar niet meer urgent.

**Wel een echt gebrek in het logboek zelf:** de meetblokken waren van 13:47, de
TX/RX-staart van 13:54, en er stond nergens dat dat twee verschillende momenten
waren. Vanaf 1.4 staan er twee tijdstippen in de kop, met een waarschuwing zodra
ze meer dan twee minuten uiteenlopen.

## Testrun 1.2 op de weg (18-08): 1 fout, en die was van de test zelf

- **Beide meldingen in blok 5 waren vals alarm.** De dode-knoppencontrole knipte
  het voorvoegsel van `PLRemote.openShare()` af en meldde 27 werkende knoppen
  als dood; `event.preventDefault()` en `.catch()` telden ook mee. En het
  "restant van een afgebroken run" was het herstelpunt dat dezelfde run een
  seconde eerder had weggeschreven. Allebei gerepareerd, met
  `test-dodeknoppen.js` eromheen: vals alarm mag niet, en het echte geval moet
  gevonden worden. **Een controle die altijd vals alarm slaat is erger dan geen
  controle — die leer je negeren.**
- **Het busslot werkte wel**: `bus geclaimd voor de sweep`. De wissel van
  `claim()` naar `wait()` deed wat hij moest doen.
- **`vehicleInfo` was compleet**: Mazda CX-5 2018 benzine. Vorige keer half
  leeg; oorzaak nog onbekend, dus blijft de moeite van het opletten waard.
- **Het pollbudget klom terug van 100% naar 74% en bleef daar**, met
  `belasting 75` en label `normaal`. Anders dan de spiraal van 17-08. Wel
  `foutPct 15` — dat is nieuw en hoger dan de 0% van gisteren.
- **`0155`/`0156` afwijking is weg**: 18 geleerd, 0 afwijkend. Vorige run had er
  40 geleerd met 2 afwijkend; de selectie was deze keer kleiner.
- **`010E` gaf `410E94` = +10°** en in de TX/RX `410E93`, `410E90`. Nog steeds
  positief — maar het koelwater stond al op 50 °C, dus dit was geen koude start.
  De vraag blijft open.
- **Vier stille sensoren staan in de actieve selectie**: `015C` (motorolie),
  `0146` (omgevingstemperatuur), `015E` (brandstofverbruik) en `0114` (O2 B1S1).
  Zes pogingen elk, nul antwoorden. Dat zijn vier tegels die nooit iets tonen.

## De vier stille sensoren: oorzaak gevonden (18-08, zonder rijden)

De ECU zégt gewoon dat hij ze niet ondersteunt. Uit de bestaande logs:

```
0100 → 4100FE3FA813
0140 → 4140FAD08C81
```

Die vier bytes per steunvraag zijn 32 bits, één per PID. Uitgerekend:

| PID | steunbit | |
|---|---|---|
| `0114` O2 B1S1 | **NEE** | staat wel in de selectie |
| `015C` motorolie | **NEE** | staat wel in de selectie |
| `0146` omgevingstemp | **NEE** | staat wel in de selectie |
| `015E` brandstofverbruik | **NEE** | staat wel in de selectie |
| `010C` toerental | JA | werkt |
| `0115` O2 B1S2 | JA | werkt |

Geen pollprobleem, geen batchkwestie. Ze horen daar nooit te zijn gekomen.

**Hoe komen ze er dan in?** `initConnection()` slaat de ontdekking over zodra
het VIN bekend is: `applyVinProfileIfKnown()` zet `supportedPIDs` uit een
opgeslagen profiel van 55 PIDs en de bitmap wordt niet meer gelezen. Dat
profiel is ooit gemaakt — waarschijnlijk door de directe-poll-fallback of een
oudere versie — en wordt sindsdien elke sessie hergebruikt zonder ooit tegen de
steunbits gehouden te worden. Een fout die één keer is opgeslagen blijft
daardoor voor altijd staan.

**Sessie B — profiel tegen de steunbits houden.** De bitmap kost drie of vier
verzoeken, dus het snelle-start-voordeel blijft grotendeels overeind. Voorstel:
bij het laden van een profiel altijd `0100/0120/0140/0160` lezen en de
doorsnede nemen; wat de ECU ontkent gaat eruit en wordt gemeld. En het profiel
opnieuw wegschrijven, zodat het zichzelf herstelt. Raakt `pidlane-pids.js`
(`applyVinProfileIfKnown`) en `pidlane-bt.js` (`initConnection`); gedrags-
wijziging, dus apart, met een test op de bitdecodering.

Blok 6 van de testrun (1.5) meet dit nu breed: hoeveel van de PIDs in het
profiel worden door de ECU ontkend. Draai dat één keer, dan weet je hoe groot
het is voordat je de fix bouwt.

**Sessie C — mag de gate een stille sensor opruimen?** Los van bovenstaande:
een PID die herhaald geen antwoord geeft is geen ongeldige waarde, dus de
plausibiliteitszeef laat hem staan. Op hoeveel mislukte pogingen mag de
herijking hem uit `activePIDs` halen, en hoe komt hij terug als hij later
alsnog antwoordt? Dit blijft nodig als vangnet voor PIDs die de ECU wél belooft
maar niet levert.

**Bij elke update die je oplevert**

Herschrijf in `pidlane-testrun.js` zowel `CAMPAGNE` (de vraag) als `_blok5()`
(de controle). Per wijziging twee regels: bestaat het nieuwe en wérkt het, en
is het oude echt weg. Zie §20 in `PIDLANE.md`.

**Werkwijze per sessie**

1. Kijk hier welke sessie aan de beurt is. Eén sessie = één taak.
2. Upload de repo als zip. Alleen de modules openen die de taak raakt
   (`PIDLANE.md` §4 heeft de tabel).
3. Vóór elke oplevering: `node --check` op elk gewijzigd JS-bestand, en de
   volledige testsuite (`for t in test-*.js; do node $t; done`, alle exit 0).
4. Na afloop: hier afvinken, nieuwe bevindingen toevoegen, `PIDLANE.md`
   bijwerken als de architectuur geraakt is.

---

## Rit van 16-08-2026 — uitkomst

- **ELM-poort werkt.** Socket dood om 10:53:27, poort direct dicht, 27 polls
  geweigerd, schone herinitialisatie, poort open om 10:53:37 en meteen geldige
  data. Nul vervuilde metingen tegenover ~10 s rommel per dip daarvoor.
- **Herijking draaide** bij protocoldetectie en meldde terecht "geen wijziging":
  de boost-PIDs stonden niet in de actieve lijst, dus er viel niets weg te
  halen. Geen tegels verdwenen.
- **`brandstof:?` in het log was cosmetisch** — het veld stond wél goed; de
  logregel las uit de verkeerde RDW-tabel. Gerepareerd.
- **`_oz` gemeld door de bedradingscontrole**: vals alarm, lokale const in
  waakronde. In `GEEN_GLOBALE` gezet, mét reden.
- **Open: vier herverbindingen in twaalf minuten.** Telkens gevolgd door
  "scherm blijft aan". Vermoeden: Android duwt de WebView naar de achtergrond
  en neemt de BT-socket mee. Nog niet onderzocht.
- **Open: ontstekingstiming.** Vijf meldingen tussen −11.5° en −21.5°, maar het
  BT-log is een rolbuffer van 300 regels en die momenten waren eruit. In de
  bewaarde vensters ligt 010E tussen −4.5° en +9.5°. Niet te zeggen of dit
  echte klopregeling/katalysatoropwarming was of een verkeerd gesplitste batch.
  `parsePID()` bewaart nu de ruwe respons per PID en de let-op-melding zet die
  erbij — volgende keer staat het antwoord in het log.

---

## Nu eerst: één rit rijden

**Testrun 1.0 gedraaid (16-08, 14 s, stationair).** Uitkomst:

- *Drie meldingen waren de test zelf.* `pidlane-remote.js` wrapt `updPID` en
  `sendCmd` in closures, dus broncode-inspectie op `window.X` leest de wrapper.
  "Ronde 5 staat stil" en "sendCmd kent de poort niet" waren dus vals alarm.
  Vervangen door echte tellers: `PLGate.stats()` en `PLElm.poortDicht()`.
  **Les: in deze codebase is broncode-inspectie onbetrouwbaar — meet gedrag.**
- *`openShare` bestaat wel maar is lokaal* in de IIFE van remote. De statische
  test zag de definitie, de runtime-controle niet. Uit `KRITIEK` gehaald.
- *De sweep liep ongelokt.* Het busslot stond bij "poll" terwijl de sweep
  draaide — dezelfde klasse fout als de ELM-init. De sweep claimt nu de bus.
- *Zeven PIDs geven nooit data*, waarvan er in de actieve selectie stonden
  (o.a. `015C` motorolie en `0114` O2 B1S1). De testrun noemt die nu apart:
  dat is precies wat de gate had moeten opruimen.
- *Bytelengte-afwijking:* `0155` en `0156` staan in de tabel als 2 bytes maar
  leveren er 1. Nog uitzoeken.
- *Bus onder druk:* 7% fout, 16% onvolledige batches, belasting 100%, tempo
  teruggeschroefd naar 22%. Stationair, met de sweep erdoorheen.
- *`010E` gaf `410E8B` = +5.5°* — normaal bij stationair. De negatieve waarden
  van de vorige rit zijn dus nog niet verklaard; die komen alleen koud voor.
- *Logboek opslaan werkte niet* op Android. Nu via het deelvenster, hetzelfde
  pad als de bugmelder.

**Testrun 1.0 tweede run (17-08, warm, stationair): 0 fouten.**

- **Ronde 5 leeft**: 307 ticks, 2 herijkingen. Dat is het bewijs dat de
  bedrading van 15-08 werkt. 0 MAP-monsters bij max 40 kPa is correct — een
  atmosferische motor komt nooit boven de 85 kPa-drempel, dus de turbodetectie
  hoort niets te tellen. Die vraag is daarmee beantwoord.
- **ELM-poort aanwezig en open.** Geen socket-dip deze run.
- **`010E` gaf `410E92` = +9°**, en in de TX/RX-gevallen `410B250E9510` =
  +10,5°. Warm klopt alles. De negatieve waarden blijven dus koud-specifiek.
- **Bus claimen mislukte**: `claim()` is één poging en de pollus stond er net
  op. Nu `wait()` met 8 s. (Fix in 1.1.)
- **`vehicleInfo` was half leeg**: alleen "Mazda", terwijl de run ervoor
  "Mazda CX-5 2018 benzine" gaf. Een half gevuld `vehicleInfo` stuurt de
  PID-gate en de presets aan, dus dat is geen detail. De testrun meldt nu
  welke velden ontbreken. **Waarom het leegliep is nog niet bekend.**
- **Pollbudget zakte 30% → 22% → 17%** bij `fout 0%`, `124 ms`. De AIMD ziet
  `belasting 100%` en schroeft terug — maar die 100% komt van de sweep zelf.
  De dode zone is in een eerdere ronde al gerepareerd; dit is een andere
  vraag: **is bezetting zonder fouten en zonder oplopende responstijd wel een
  reden om terug te schroeven?** Zie hieronder.
- **`0155`/`0156` leveren één byte waar de tabel er twee verwacht**
  (`4155805680`). `PLPidLen` vangt het op; de tabel volgt de generieke spec.
- Kop en voet gaven verschillende looptijden (17 s vs 9 s) — de kop telde door
  tot het opslaan. Bevroren in 1.1.

**Sessie A — het pollbudget bij bezetting zonder fouten.** Bezetting is
aanvraagtempo × responstijd; bij continu pollen is die per definitie hoog. Nu
geldt `belasting ≥ 85%` als tegendruk, óók bij 0% fouten en vlakke
responstijden. Dan throttlet de app zichzelf zonder dat de ECU het vraagt.
Voorstel: bezetting alleen als tegendruk tellen wanneer de responstijd oploopt
of er fouten bijkomen. Raakt `pidlane-plload.js` en `test-plload.js`, en het is
een gedragswijziging — dus apart, met een test die de spiraal reproduceert.

**Sessie 0 — testrun op de weg (16-08).** De zes losse diagnose-ingangen zijn
vervangen door één testrun (§20 in `PIDLANE.md`). Eerste gebruik: admin →
🔬 Testrun → Start, rijden, daarna Logboek opslaan. Let bij het teruglezen op:
herstelt de PID-selectie netjes, geeft blok 3 ruwe bytes bij 010E, en staat
`_mapSamples` boven nul.

**Sessie 1 — verificatierit (geen code)**

De bedradingsfix van 15-08 heeft slapend gedrag geactiveerd. Dat moet je zien
vóór je verder bouwt, want alles daarna staat erop.

Waar je op let tijdens en na de rit:

- Verdwijnen er tegels die er altijd stonden? Op de CX-5 horen de boost-PIDs
  (`0170`, `2102`, `0187`) weg te vallen zodra er tien MAP-metingen ≥ 85 kPa
  bij draaiende motor zijn geweest en de piek onder 106 kPa bleef. Dat is een
  atmosferische motor die correct als atmosferisch herkend wordt — de eerste
  keer dat die detectie überhaupt draait.
- Staat er `herijking` in het log bij protocoldetectie en bij het binnenkomen
  van het RDW-brandstoftype? Dat zijn de twee plekken die eerder stil faalden.
- Meldt de bedradingscontrole iets? Zo ja: naam noteren, dat is een echte
  ontbrekende functie.
- Bij een socket-dip: staan er `geweigerd: ELM-herinitialisatie bezig`-regels in
  het log, en is de rommelperiode weg?

Neem de diagnosebundel mee terug. Valt de herijking vervelend uit, dan is die
ene commit los terug te draaien — de rest van de levering hangt er niet aan.

**Sessie 2 — mode 22, PID `2101` (motorolietemperatuur)**

Kort en zelfstandig, goed om onderweg te doen. `015C` beantwoordt deze CX-5
niet (stil weggelaten uit het multi-PID-antwoord, bewezen in het log van 15-08).
De Mazda-route is mode 22 PID `2101`, al gedefinieerd in `pidlane-data.js:220`
maar nergens opgevraagd. `pidlane-uitgebreid.js` heeft het mode-22-pad al.
Raakt: `pidlane-uitgebreid.js`, mogelijk `pidlane-data.js`.

---

## Daarna: de stille catches

Dit is de eigenlijke uitkomst van de sweep. 626 van de 948 `try`-blokken gooien
hun fout weg zonder spoor; dat is hoe ronde 5 maanden dood kon zijn zonder dat
iemand het zag.

**De regel:** een `catch` mag stil zijn als je de fout verwacht (localStorage
vol, DOM-element weg, JSON van een gebruiker). Nooit rond een aanroep van eigen
code — daar hoort minimaal een `btDiag(..., 'warn')` in.

Niet in één sessie te doen, en ook niet als aparte klus de moeite waard. Doe het
per module, telkens als je er tóch bent. Wél gericht beginnen bij de modules
waar een stille fout het meest kost:

**Sessie 3 —** `pidlane-pidgate.js` en `pidlane-pids.js` (de PID-filtering; hier
ging het drie keer mis).
**Sessie 4 —** `pidlane-bt.js` (45 stille catches in de transportlaag).
**Sessie 5 —** `pidlane-plload.js` en `pidlane-data.js` (de regelkringen).

Per sessie: elke `catch` langslopen, verwachte fouten met een korte reden
markeren, de rest van een melding voorzien. Puur mechanisch, geen gedrag
wijzigen. Nieuwe `typeof`-guards die je tegenkomt registreren in `KRITIEK`
(`pidlane-bedrading.js`) — `test-bedrading.js` dwingt dat af.

---

## Verspreide logica samentrekken

Zelfde soort probleem als de PID-gate vóór ronde 1: dezelfde regel op veel
plekken, dus elke fix raakt er één.

**Sessie 6 — responsontleding.** Acht modules pakken zelf een `41`-header uit
(`pidlane-bt.js`, `-diagbundel`, `-graph`, `-monitor`, `-uitgebreid`,
`-veldlab`, `-verify`, `-waakronde`) in plaats van `splitBatchResponse()` te
gebruiken. Daardoor profiteert de helft niet van `PLPidLen`. Eerst inventariseren
wat elk van die acht precies anders doet, pas dan samentrekken — mechanisch en
gedragsneutraal, met een test die de oude en nieuwe uitkomst op echte
logregels vergelijkt.

**Sessie 7 — worker-ingang.** Elf modules doen hun eigen `fetch`. Eén
`plFetch(pad, opties)` met foutafhandeling, tegoedcontrole en logging op één
plek. Raakt veel bestanden, dus strikt mechanisch en in twee stappen: eerst de
helper erbij en één module erdoorheen, daarna de rest.

**Sessie 8 — `merkGroep()`-asymmetrie.** `MINI` matcht op prefix, `BMW` op
gelijkheid. Al gedocumenteerd, raakt de DTC-lookup (§14). Klein, maar apart
houden omdat het gedrag verandert.

---

## Opruimen en afmaken

**Sessie 9 — `pidlane-scheduler.js` heet verkeerd.** De echte scheduler
(`PLSched`, `pidPollInterval`, `pidsDueNow`) zit in `pidlane-plload.js`; wat in
`scheduler.js` staat is motortype-splitsing en EV-modus. Hernoemen naar
`pidlane-motortype.js` of de inhoud samenvoegen. Puur naamgeving, geen kapotte
code — maar het kost elke keer dat je erin duikt tien minuten.

**Sessie 10 — `renderGauges()`-vangnet.** Verwijderen zodra uit de logs blijkt
dat de zeef daar nooit meer iets tegenhoudt. Kan pas na een paar ritten met de
geactiveerde herijking, want die verandert precies wat er langskomt.

**Sessie 11 — ~~bulk-recorder aanhaken~~ GEDAAN (15-08).** Scripttag en
kebab-knop staan erin. Bij het aanhaken bleek de module zonder start volledig
inert: het interval van 1 s doet niets zonder lopende opname, en de
herstelpoging na 3 s slaat aan op een sessie in `localStorage` die er nooit is
geweest. Er was dus geen reden om te wachten. Airtable-flushing blijft buiten
scope. **Nog wél te doen:** een echte opname over een hele rit, om te zien wat
IndexedDB doet aan groei en wat het met de accu kost.

**Sessie 12 — mode 06 in `pidlane-veldlab.js`** plus de bijbehorende
`PIDLANE.md`-update. Al een keer uitgesteld.

---

## Meten in het veld (geen sessie, maar meenemen)

Drie dingen die alleen uit echte ritten kunnen komen:

- Hoe vaak vuurt het `renderGauges()`-vangnet nog? (voorwaarde voor sessie 10)
- Turbo-detectie op een auto mét laaddruk-PIDs. Nu de detectie eindelijk leeft,
  is dit voor het eerst een zinnige test.
- Echte merkstrings uit RDW-data, om ronde 9 te valideren.

En een nieuwe, uit de aanslag-episode van augustus: **ontstekingsvervroeging
(`010E`) uitgezet tegen belasting (`0104`/`010B`), als mediaan per rit en als
trend over ritten.** Een motor die stil vermogen inlevert door koolstofaanslag
tekent zich daar af als een langzaam zakkende lijn, terwijl elke losse waarde
netjes binnen bereik blijft en er geen enkele DTC staat. Dat is precies de
bevinding waar een garage voor betaald krijgt — klant komt binnen met "hij trekt
niet meer" en het foutgeheugen is leeg. Vraagt wel dat de bulk-recorder over
ritten heen bewaart, dus na sessie 11.

---

## Buiten de techniek

- **Snap-on-patentfamilie** (gelijkenis met de referentie-opslag) — juridisch
  laten nakijken vóórdat je erop doorbouwt.
