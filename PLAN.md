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

## 1. Eerst rijden: drie dingen bevestigen

Geen code. Er staan drie fixes klaar die alleen de weg kan bevestigen. Doe ze in
één rit met **testrun 1.7**.

Testrun 1.7 meet in dezelfde rit alvast voor punt 2 en 4, zonder er iets aan te
veranderen. Dat vraagt twee dingen van de rit: **minstens tien minuten rijden
vóór je de run start** (anders is het pollbudget-spoor te kort) en **een warme
motor** (anders liggen olie- en koelwatertemperatuur te dicht bij elkaar om
schalingen te scheiden). Blok 7 en 8 zijn ook los te draaien met de knop
"Budget + olie" — dat is de verstandige volgorde: eerst die, dan pas de sweep,
want de sweep vervuilt het spoor.

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

**Voorwerk staat klaar (19-08).** Blok 7 van de testrun bemonstert de regelkring
elke twee seconden en telt de remmomenten waarbij er 0% fouten waren én de
responstijd niet opliep. Die telling is de hele vraag. Begin deze sessie niet
zonder dat getal: is hij nul, dan klopt het vermoeden niet en gaat punt 2 dicht
in plaats van open. Blok 7 raakt `PLLoad` niet aan en reconstrueert de genomen
beslissing uit `PLLoad.cfg` — wijkt die reconstructie af van wat `_mult` deed,
dan is dat op zichzelf een vondst.

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

## 4. Waar zit de motorolietemperatuur?

**Deze tekst stond hier fout, op twee punten (nagelopen 19-08).** Er stond "mode
22 PID `2101`, nergens opgevraagd". Beide kloppen niet:

- `2101` is in dit project **mode 21 PID 01**, niet mode 22. Zie de kop van
  `pidlane-uitgebreid.js`: een mode-22 identifier is twee bytes (`22`+`111F`) en
  past niet in de vier-tekens-sleutelconventie.
- Het **wordt** opgevraagd. `pidlane-bt.js:1691` roept `probeUitgebreid()` aan na
  het verbinden — in een stille catch, dus faalt hij, dan zie je niets.

Wat er dus werkelijk open staat is niet bouwen maar **meten welke adressering
klopt**. Er zijn drie kandidaten en geen enkele is ooit tegen deze auto gehouden:

| aanvraag | verwacht | herkomst |
|---|---|---|
| `2101` | `6101 xx`, waarde A−40 | wat `pidlane-uitgebreid.js` aanneemt |
| `22111F` | `62111F xx`, waarde A−50 | breed gedeeld voor SkyActiv, header 7E0 |
| `015C` | `415C xx` | de standaard; volgens de steunbits dood op deze CX-5 |

Blok 8 van testrun 1.7 vraagt alle drie op, herkent een negatief antwoord
(`7F 22 31`) apart van NO DATA, en rekent beide schalingen uit tegen het
koelwater als plausibiliteitsanker. Uitkomsten en gevolg:

- **`22111F` antwoordt, `2101` niet** → de definitie in `pidlane-uitgebreid.js`
  is fout en de sleutelconventie moet mode 22 aankunnen. Dat is dan een echte
  sessie, want het raakt de sleutelruimte.
- **`2101` antwoordt** → de code klopt en dit punt is al af; alleen de naam in
  dit bestand was verkeerd.
- **Geen van beide** → deze CX-5 heeft de olietemperatuur niet op de
  diagnosebus. Punt dicht.

De sonde zet tijdelijk header `7E0` en herstelt naar `7DF` in een `finally`.
Blijft `7E0` staan, dan praat de app daarna alleen nog tegen het motorblok.

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
