# PLAN.md — wat er nog open staat

Bijgewerkt: 19-08-2026.

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

## 1. Eerst rijden: bevestigen dat de preset-fix werkt

**De oorzaak is gevonden (20-08, avond).** Punt 1 leek vier ritten te falen
terwijl de steunbitcontrole gewoon werkte. Uit het logboek van 19:36:

```
19:36:22  discovery uit de bitmaps      → 55 PIDs, precies conform
19:36:26  profiel opgeslagen            → 55 PIDs, schoon
19:36:49  applyVehiclePIDPreset()       → 26 PIDs erbij, waaronder 015C
19:37:51  blok 6 telt supportedPIDs     → 62, waarvan 7 ontkend
```

`MERK_EXTRA_PIDS.MAZDA = ['015C','0110']` stond hard in
`pidlane-rijsituatie.js` en zette de motorolietemperatuur terug die de bitmap
net had ontkend. "Een fix die faalt door een fix" in zuivere vorm: de gate zat
in `profielTegenSteunbits()`, niet in de preset.

**Wat er is veranderd.** De bitmaps worden nu bewaard zodra ze gelezen worden
(`_steunbits` in `pidlane-rijsituatie.js`), en `magToevoegen()` is de poort
waar de preset langs moet. De scheidslijn staat als commentaar bij die functie:
toevoegen op **bewijs** (een echt antwoord) mag zonder zeef, toevoegen op
**aanname** (merk + brandstof) niet. Alle vijf toevoegplekken zijn nagelopen;
alleen de preset viel in de tweede categorie. `test-steunbits.js` bewaakt het
aantal, dus een zesde plek valt op.

**Wat de rit moet bevestigen:**

- Blok 6 meldt **0 ontkend**. Staat er nog iets, dan is er nóg een plek die
  PIDs terugzet ná de discovery.
- Bij het verbinden staat *"Preset sloeg N sensoren over die deze auto niet
  heeft"*, met `015C` erbij.
- **Er verdwijnt niets dat het wél deed**: `010C`, `0104`, `0105`, `010E` en
  `0115` horen er gewoon te zijn. Deze fix weigert sensoren, dus een te gretige
  versie is erger dan de kwaal.

**Het profiel apart, met twee verbindingen.** Verbind twee keer zonder
tussendoor de app-gegevens te wissen. De eerste maakt het profiel (55 PIDs), de
tweede laadt het en toont *"Bekend voertuig"*. Dat is nooit gelukt omdat er bij
elke nieuwe build gewist werd — geen bug, wel een testmethode die de vraag niet
kon beantwoorden. Blok 1 "VIN-profiel" zegt nu of hij in de opslag staat.

Twee dingen vooraf, allebei eerder misgegaan: blok 5 mag geen FOUT geven
(deploy compleet), en vul het kenteken in, anders blijft `vehicleInfo` op enkel
"Mazda" staan.

Blok 7 loopt in dezelfde rit mee voor punt 2 — dat vraagt minstens tien minuten
rijden vóór je de run start. Blok 9 (DID-scan, 45 s) is een losse knop en
vraagt een warme motor.

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
