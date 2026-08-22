# PLAN.md — wat er nog open staat

Bijgewerkt: 21-08-2026 (nacht) — versie 3.0.0, testrun 3.3.

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

## 13. `PLLoad` regelt op de verkeerde grootheid

De slotregel van de proef: **`tempo 18%, bus 66% bezet, fout 0%`** — terwijl de
verbinding er net 9,1 verzoeken per seconde foutloos doorheen duwde. De app
stond op achttien procent van wat de bus aankan, zonder één fout als aanleiding.

**De oorzaak staat al in de code, in het commentaar van 01-08:** bezetting is
aanvraagtempo × responstijd. Juist een *snelle* bus haalt daar een hoog
percentage — 66% bij 92 ms mediaan is efficiëntie, geen tegendruk. `PLLoad`
leest dat als druk en schroeft terug.

**En de terugweg is te traag om het te herstellen.** Bij tempo 18% staat `_mult`
op 5,56. De weg terug naar 1,0:

```
ruim  (bezetting < 55, stap 0,05)   92 ticks  = 3,1 min
kalm  (dode zone,     stap 0,03)   152 ticks  = 5,1 min
```

Bij 66% bezetting zit hij in de dode zone, dus geldt de traagste van de twee.
Dat verklaart precies waarom het tempo op 21-08 om 11:47 op 56% bleef staan
terwijl er 0% fouten waren, en waarom het in 500 s niet terugklom.

**Drie knoppen, in volgorde van veiligheid:**

1. `omlaagTraag` van 0,03 naar ongeveer 0,08 — halveert de hersteltijd zonder
   de hysterese aan te tasten. Kleinste ingreep, minste risico.
2. `bezetAf` van 55 naar ongeveer 75, zodat `ruim` op dit voertuig bereikbaar is
   en de snellere stap van 0,05 geldt. Het commentaar van 01-08 zegt zelf al dat
   `ruim` hier onbereikbaar was; dit maakt dat af.
3. `druk` alleen laten aanslaan op bezetting **in combinatie met** een oplopende
   `venGemMs`. Bezetting alleen is aantoonbaar geen tegendruk. Grootste ingreep,
   raakt de vorm van de regelkring.

**Meet vóór en ná met blok 10.** Die proef is nu het meetinstrument: dezelfde
vijf trappen, en de slotregel zegt of het tempo van de app nog steeds ver onder
ligt bij wat de verbinding foutloos haalt. Zonder die voor-en-nameting is dit
sleutelen aan een regelkring op gevoel.

Eén ding om niet te vergeten: de proef jaagt de bezetting zelf omhoog. Het tempo
van 18% is dus deels door de meting veroorzaakt. Dat maakt de conclusie niet
anders — 0% fouten en 9,1/s foutloos staat los van wie de bus bezet hield — maar
lees de slotregel niet als "de app staat in het dagelijks gebruik altijd op 18%".

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

## 5. De stille catches — 108 opgeruimd, 716 te gaan

**`pidlane-bt.js` en `pidlane-veldlab.js`: allebei van 54 naar 0.** Bewezen dat
alleen catch-bodies en commentaar wijzigden; de rest van de code is teken voor
teken gelijk.

`test-stille-catches.js` is een **ratel**: per module staat de huidige stand,
meer mag niet, minder mag altijd. Een catch met een reden erin
(`catch(e){ /* stil: opslag kan vol zijn */ }`) telt niet mee — dat onderscheid
is het punt. Een test die nul eist zou vanaf dag één rood staan, en een test die
altijd rood staat wordt genegeerd.

**Werkregel:** stil mag bij een verwachte externe fout (opslag vol, element weg,
een sonde die juist test óf iets antwoordt), nooit rond een aanroep van eigen
code. Bij twijfel: `btDiag` als het in het logboek hoort, `console.warn` voor de
rest. Nooit een toast — die vallen weg tijdens het rijden.

**Nog te doen, op volgorde van omvang:** `remote` 105, `testrun` 66,
`koopcheck` 42, `fuel` 40, `auth` 39, `btflow` 30. Eén module per sessie, en
verlaag daarna de grens in de ratel.

**Wat de twee modules opleverden:**

*`bt.js`* — `probeUitgebreid()` stond in een lege catch. Dáárom zei `PLAN.md`
punt 4 maandenlang dat mode 21 nergens werd opgevraagd. Idem
`herijkPidGate('protocol gevonden')`: faalt die, dan draait de PID-zeef op oude
kennis, en dat is de hele fantoomsensor-familie.

*`veldlab.js`* — zie punt 16 hieronder.

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

## 12. Blok 1 van de testrun: nog twee scherpe randen

De VIN-profielmelding is op 21-08 gerepareerd (leest nu `profielHealth()` in
plaats van onvoorwaardelijk te waarschuwen), maar de tegenproef is nooit
gedaan: **wis de app-gegevens, verbind opnieuw, en kijk of daar dan LET OP met
"NIET geladen" staat.** Een controle die alleen groen kan worden bewijst niets.

Tweede randje uit dezelfde hoek: blok 4 meldde op 21-08 om 11:36 twee afwijkende
bytelengtes (`0155` en `0156`, tabel 2 tegen gemeten 1). Om 11:47 was dat weg.
Komt het terug, dan klopt de lengtetabel niet voor die twee.

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
