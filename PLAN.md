# PLAN.md — wat er nog open staat

Bijgewerkt: 21-08-2026 (avond) — versie 3.0.0.

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

## 2b. Waarom loopt de adapter achter tijdens het rijden?

Geen regelkringprobleem maar een transportprobleem, en het is nog niet verklaard.

Op 21-08 om 11:36, na acht minuten rijden:

```
gemMs 950   venGemMs 148   reqOnvol 12 (4%)   busbelasting "bufferend"
tempoPct 30%, klimt binnen 500 s niet meer terug boven 55%
```

Het cumulatieve gemiddelde stond op 950 ms terwijl het venster op 148 ms zat:
er is dus een periode geweest met extreme vertraging. De missers zaten verspreid
over **alle** gepollde PIDs, één of twee per stuk — geen enkele sensor stak eruit.
Dat sluit een fantoom-PID uit en wijst op de verbinding zelf.

Om 11:47 was het beeld milder ("langzaam", 58%) maar niet weg: **0% fouten in
álle monsters en tóch een tempo van 56%.** Dat is de kern van de vraag — waarom
klimt hij niet terug als er niets meer misgaat?

Eerste stap is meten, niet bouwen: kijk in het Logboek of er bij die trage
momenten een BT-dip of herverbinding staat. Er liggen al twee aanwijzingen in
`OVERDRACHT.md`: vier BT-herverbindingen in twaalf minuten op 16-08, telkens
gevolgd door "scherm blijft aan", met het vermoeden dat Android de WebView naar
de achtergrond duwt en de socket meeneemt.

Pas als de oorzaak bekend is heeft het zin om aan de terugweg van `PLLoad` te
sleutelen.

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

## 11. De race in `bt.js:1787`

`updateVehicleCard()` roept `rdwLookup()` aan **zonder `await`**, dus de preset
kan `supportedPIDs` bijwerken vóórdat `initConnection` op regel 1730
`saveVinProfile()` doet. Zo kwamen de zeven ontkende PIDs ooit in het opgeslagen
profiel terecht. De steunbitzeef dicht het gevolg, niet de oorzaak. Klein en
zelfstandig; oppakken wanneer je toch in die module zit.

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
