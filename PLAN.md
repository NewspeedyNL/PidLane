# PLAN.md — wat er nog open staat

Bijgewerkt: 21-08-2026.

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


## 2. Het pollbudget bij bezetting zonder fouten

Raakt `pidlane-plload.js` en `test-plload.js`. Gedragswijziging.

Bezetting is aanvraagtempo × responstijd; bij continu pollen is die per
definitie hoog. Nu geldt `belasting >= 85%` als tegendruk, óók bij 0% fouten en
vlakke responstijden. Dan throttlet de app zichzelf zonder dat de ECU erom
vraagt. Gemeten op 17-08: 30% → 22% → 17% bij `fout 0%` en `124 ms`.

Voorstel: bezetting alleen als tegendruk tellen wanneer de responstijd oploopt
of er fouten bijkomen. Bouw eerst een test die de spiraal reproduceert, dan pas
de wijziging — anders weet je achteraf niet of het beter is geworden.

**Dit punt is waarschijnlijk een gevolg van punt 1 (bewezen 20-08).** In de run
van 19:40 kwamen **alle 18 missers** van 230 verzoeken van precies vier PIDs:

```
0114  n=0  mis=6      015E  n=0  mis=6
015C  n=0  mis=3      0146  n=0  mis=3
```

Nul geslaagde metingen, alleen missers — en het zijn exact de PIDs die de
bitmap ontkent en die de preset terugzette. Geen enkele andere PID miste er
één. De keten:

```
preset zet 015C c.s. terug → worden gepolld → altijd NO DATA
   → foutgraad 15% → boven foutOp (10%) → pollbudget naar 55%
   → "⚠ Veel lege antwoorden van de ECU" aan de gebruiker
```

Met de preset-zeef en een testrun die ontkende PIDs niet meer opvraagt, zou
dit vanzelf moeten verdwijnen. **Meet dat eerst.** Blijft de foutgraad op 0%
en het tempo op 100%, dan gaat dit punt dicht zonder dat er één regel aan de
regelkring is veranderd.

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

**Meting van 21-08, 34 s stationair — nog steeds te kort, maar de richting is
consistent.** Blok 7: 17 monsters, tempo van 100% naar 79%, één remmoment en dat
was er één *mét* fouten (hoogste foutgraad 2%, 71% van de monsters op 0%). Nul
ongevraagde remmomenten dus. En de kernvraag opnieuw omgekeerd beantwoord ten
opzichte van 19-08: responstijd 83 ms bij lage bezetting tegen 85 ms bij hoge,
**+2%** — bezetting voorspelt hier geen tegendruk, maar hij veroorzaakt er ook
geen. Twee runs, twee verschillende uitkomsten (+57% en +2%), allebei op
stilstand. Dat is precies waarom dit een rit nodig heeft.

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

## 4b. `0143` staat er 256× naast

Klein, zelfstandig, twee keer bevestigd. De parser rekent `A + B/256` waar het
`A × 256 + B` moet zijn.

| ruw | app toont | hoort |
|---|---|---|
| `41430048` (B=72) | 0,11 | 28,2 % |
| `41430029` (B=41) | 0,06 | 16,1 % |
| `41430038` (B=56) | 0,09 | 22,0 % |

De derde regel komt uit de sweep van 21-08 en rekent exact uit: `(0 + 56/256) ×
100/255 = 0,0858` → toont 0,09, terwijl `56 × 100/255 = 21,96 %` de juiste
waarde is en klopt voor stationair draaien.

Nooit opgevallen omdat niemand naar absolute motorbelasting kijkt. Raakt
`pidlane-data.js`. Controleer meteen of dezelfde bytecombinatie elders in de
tabel voorkomt — dit is precies het soort fout dat op meer PIDs zit.

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

## 8. Vierde chip in de topbar: "Run"

Gevraagd 21-08. Nieuwe module `pidlane-run.js`, plus een chip in de topbar van
`index.html` en één script-tag (vóór `pidlane-bedrading.js`, die blijft
laatste). Doe dit **na** de validatierit van punt 1: nieuwe code erin betekent
een nieuwe `CAMPAGNE`, en dan verwatert de vraag die nu precies op de
steunbitfix gericht is.

Naast de bestaande drie chips (Auto, OBD, AI) komt een vierde met een dot die
groen wordt zodra er iets op de achtergrond draait. Dat is meteen de winst: nu
is nergens te zien dát de waakronde aanstaat. Tikken opent een paneel met
schakelaars.

| functie | aan/uit | staat uitlezen |
|---|---|---|
| Rit-monitor | `toggleRitMonitor()` | `PLMon.userAan`, `PLMon.active` |
| Bulk-recorder | `PLBulk.start()` / `.stop()` | `PLBulk.status().actief` (+ `.gepauzeerd`) |
| Waakronde | `PLWaak.schakel()` | `PLWaak.actief()` |
| Caravan-modus | `startCaravan()` / `stopCaravan()` | `caravanActive` |
| Rit-analyse | `startRitAnalyse()` / `stopRitAnalyse()` | `ritActive` |

De laatste twee zijn geen schakelaars maar **sessies met fasen**. Halverwege
uitzetten gooit een lopende meting weg — `stopCaravan()` genereert meteen het
rapport, `stopRitAnalyse()` breekt de fasenreeks af. Vraag daar om bevestiging
vóór het stoppen; aanzetten mag zonder. Ze starten ook geen van beide zonder
verbinding (`preAnalysisCheck()`), dus toon ze grijs als er geen adapter hangt
in plaats van ze te laten falen.

**Valkuil bij het uitlezen.** `caravanActive` en `ritActive` zijn top-level
`let` in een klassiek script zónder IIFE. Die staan in script-scope, niet op
`window`: `typeof caravanActive !== 'undefined'` werkt, `window.caravanActive`
geeft altijd `undefined`. Bouw je het paneel op de tweede vorm, dan staat elke
schakelaar altijd op uit en zie je dat pas in de auto.

Elke `typeof`-guard die hierbij ontstaat: registreren in `KRITIEK`
(`pidlane-bedrading.js`), anders vangt `test-bedrading.js` hem.

## 9. Opmerkingveld bij het opslaan van een log

Gevraagd 21-08. Raakt alleen `pidlane-export.js` en `test-export.js`.

In de keuzedialoog van `plOpslaan()` een tekstvak erbij: wat is dit voor log,
en wat viel er op. Die opmerking gaat mee in het bestand, zodat hij bij het
uploaden niet apart hoeft te worden verteld en later nog bij de meting staat.

- **Tekst**: als eigen blok bovenaan, vóór de bestaande kop.
- **PDF**: als kader onder de kopband, boven de inhoud — `plMaakPdf()` krijgt
  hem via `opties`.
- Leeg laten mag; dan verandert er niets aan het huidige bestand.

De vier aanroepers (`archief`, `logboek`, `rijsituatie`, `testrun`) hoeven niet
mee te veranderen: de opmerking wordt in de dialoog ingevuld, niet doorgegeven.

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
