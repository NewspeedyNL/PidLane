# PidLane — werkdocument

Eén bestand. Vervangt `PLAN.md`, `OVERDRACHT.md` en alle losse leesmij's.
Bijgewerkt: 26-08-2026 · app v3.0.0 · testrun 4.8

---

# 1. WAT NU

**Eén rit. Daarna gaat de batch van 23-08 dicht.**

Rijd met bulk-recorder, caravan-tracker, rijmonitor en waakronde tegelijk aan —
anders toets je de PLLoad-ingreep niet. Testrun 3.6 stelt de vragen; loop ze af
en noteer per fix of hij groen of rood is.

Daarna: groene fixes verdwijnen uit dit document. Rode gaan in één naronde en
dan is de set klaar. Ze komen niet terug als nieuwe genummerde punten.

---

# 2. DE BATCH VAN 23-08 — 13 fixes, één toets

Afvinken tijdens de rit.

| # | fix | bestand | uitkomst |
|---|---|---|---|
| 1 | `clearBtLog()` wist de localStorage-spiegel niet | btflow | ☐ |
| 2 | transportfout telt niet meer als "PID bestaat niet" | veldlab | ☐ |
| 3 | deep-log: waarschuwing als sensoren niet aanstaan | koopcheck | ☐ |
| 4 | onderhoudsadvies: oranje balk bij twijfel | koopcheck | ☐ |
| 5 | EV/accu-check: idem | koopcheck | ☐ |
| 6 | lange-rit-check: idem | koopcheck | ☐ |
| 7 | klimaatcheck: waarschuwing in het rapport | koopcheck | ☐ |
| 8 | koopcheck (de P2-fix): oranje balk bij twijfel | koopcheck | ☐ |
| 9 | meetpoort meldt zichtbaar waarom hij zeurt | fuel | ☐ |
| 10 | remote: terugval op steunbits i.p.v. ongefilterd | remote | ☐ |
| 11 | PLLoad regelt niet meer op bezetting alleen | plload | ☐ |
| 12 | `clearDTC`-wrapper meldt als installatie faalt | remote | ☐ |
| 13 | header-reset meldt als hij faalt | testrun | ☐ |

## Wat elke fix inhoudt

**1 — Log wissen.** `_btPersistNow()` schreef naar sessionStorage én een
localStorage-spiegel; `clearBtLog()` wiste alleen de eerste. Log wissen,
herladen, en hij stond er weer. Nu beide.

**2 — Survey.** Gooide `sendCmd` een fout, dan telde dat als "deze auto
ondersteunt deze PID niet", en dat oordeel ging naar Airtable en voedde de
dekkingsmatrix per merk. Eén slechte verbinding kon zo een heel merk wegzetten.
Nu een eigen uitkomst `transport`, maar pas nadat de herkansing óók faalde.

**3 t/m 8 — De zeven analyses (variant A).** Ze zetten eerst het juiste
PID-profiel aan en meten dan pas. Faalt die aanzet, dan gaan ze door — maar het
rapport zegt er nu zelf bij dat het op verouderde data kan draaien, met een
oranje balk bovenaan en een regel in het gearchiveerde rapport. Afbreken zou
erger zijn: een koopcheck die halverwege stopt kost een klant.

De scherpste hiervan is **8**. Het commentaar boven die regel noemt het
letterlijk een gedocumenteerde bugfix ("P2 — koopcheck miste eerder een
profiel"). Faalde de aanroep die 'm oplost, dan was de koopcheck stilletjes
terug bij het probleem dat P2 moest wegnemen.

**9 — Meetpoort.** Dit is fase 1 van de poort: sensoren aanzetten vóór de
meting. Faalde dat stil, dan toetste de poort op de verkeerde set en zei "te
weinig data" zonder reden. Nu weet je waarom hij zeurt.

**10 — Remote.** Faalde `pidToevoegen()`, dan bleef de remote-selectie
ongefilterd staan. Nu terugval op de steunbits: liever een kleinere set die
klopt dan een volledige set die de expert misleidt.

**11 — PLLoad.** Eén regel. Hier stond `belasting>=bezetOp || foutPct>=foutOp`;
die `||` maakte bezetting op zichzelf al genoeg. Uit het veldlog van 23-08: 86
verlagingen tegen 21 verhogingen, 61 daarvan bij foutgraad nul, en een cascade
van 74% naar 17% in 22 seconden terwijl de bezetting op 93-100% bleef staan —
verlagen bracht de bezetting dus niet omlaag. Nu telt bezetting alleen mee mét
een oplopende of al trage responstijd. Nagerekend op datzelfde log blijven 26
van de 86 verlagingen staan, waarvan 24 terecht.

---

# 3. UI — nog niet gedaan, bestanden ontbreken

Drie meldingen van 23-08. Ik heb de bestanden niet, dus deze zitten **niet** in
de batch.

**Demo-knop op het loginscherm.** Zit in `index.html`. Niet alleen slecht
geplaatst: de tekst is Engels in een Nederlandse app, loopt over twee regels, en
de versieregel "PidLane v3.0.0 — AI Car Diagnostics" loopt er dwars doorheen.
Twee elementen op dezelfde plek.

**Bulk-recorder komt niet bovenop.** Zit in `pidlane-bulk.js`. Op het screenshot
staat de modal wél voor, maar de zwevende chips (tokens, saldo, Mijn plan,
km/u) liggen eroverheen. Eén oorzaak, twee symptomen: de modal-laag en de
chip-laag zijn niet geordend.

**Opmerkingveld bij opslaan werkt niet.** Stond als gebouwd genoteerd op 21-08,
maar de tekst komt niet in het bestand. Bestand onbekend.

Stuur `index.html` en `pidlane-bulk.js` en zeg waar het opmerkingveld zit, dan
gaan die drie in de naronde mee.

## Nieuw op 24-08

**Waakknop dooft bij wisselen van weergave — opgelost.** Melding was "waakronde
gaat uit als ik van puntjes naar getallen of grafieken schakel". Hij ging niet
uit: `#waakBtn` draagt de klasse `pidview-btn` maar heeft geen `data-mode`, dus
de `active`-lus in `setPidView()` haalde zijn markering eraf terwijl `_aan`
gewoon `true` bleef en de bus nog geclaimd werd. Selector nu
`.pidview-btn[data-mode]`. Eén regel in `pidlane-pids.js`, geleverd 24-08.

Waard om te onthouden: dit is dezelfde soort fout als de fantoomsensor-familie,
maar dan in de UI — één lus die op klasse selecteert terwijl de bedoeling
"heeft een modus" is. Komt er ooit nog een knop bij in die rij, dan valt hij
vanzelf buiten de lus.

**Drie oranje puntjes onder het wachtwoordveld — opgelost.** Geen CSS en geen
los element: `doLogin()` zette tijdens het wachten letterlijk `'…'` in
`#loginErr`, en dat vakje heeft inline `color:var(--rd)`. Een wachtindicator in
de foutkleur dus. Bovendien had de fetch naar `/auth/login` geen tijdslimiet,
dus bij een Worker die de verbinding openhield bleven ze staan tot je de app
afsloot. Nu: één setter `plLoginMeld(el, tekst, soort)` — grijs bij `bezig`,
rood bij `fout` — plus afbreken na 12 s (`LOGIN_TIMEOUT_MS`). Alle veertien
schrijvers naar `#loginErr` lopen erdoorheen, ook die in `logout()`.

Waard om te onthouden: dit is dezelfde vorm als de waakknop hierboven. Eén
element met twee betekenissen, en de ene betekenis erft de opmaak van de
andere.

**Testrun opgeruimd (3.9).** De knoppen "DID-scan (45 s)" en "Budget + olie"
zijn weg, en `b8` staat niet meer in de standaardset — die drie dienden alleen
de mode 22-olietemperatuur, en dat is op 23-08 losgelaten. Zonder die laatste
stap scande élke volle run alsnog. `_blok8()` en `_blok9()` blijven bestaan en
zijn los aan te roepen met `startTestrun({b8:true})` of `{b9:true}`; ze slopen
is een mechanische stap en gaat apart. Wat overblijft van de oude knop is
"Budget" (blok 7 alleen).

---

# 4. OPEN KEUZES — geen bugs, jouw besluit

Deze twee vragen een beslissing, geen code. Ze staan hier zodat ze niet
verdwijnen, niet omdat er iets stuk is.

**Mag de gate een stille sensor opruimen?** Twee vragen: na hoeveel mislukte
pogingen mag hij uit `activePIDs`, en hoe komt hij terug als hij later alsnog
antwoordt (koud/warm, motor uit/aan)? Zonder dat tweede bouw je een zeef die
sensoren voorgoed wegwerkt. Blok 11 telt hoeveel PIDs dit raakt en of de vier
terugweg-haken bestaan.

**Vier aanvragers op één bus.** Waakronde, bulk-recorder, caravan-tracker en
rijmonitor vullen de bus langs elkaar heen; PLLoad regelt er maar één. Fix 11
maakt PLLoad daar ongevoelig voor, maar lost niet op dát ze langs elkaar heen
werken. Blok 11 telt het eigen uitpakwerk en de losse fetch-aanroepen per
module.

---

# 5. LOSSE EINDJES

Klein, geen sessie waard, maar niet vergeten.

- **Mode 22 olietemperatuur.** De scan van 23-08 vond één treffer op 256:
  `221166` antwoordt met `0000` bij koelwater 91 °C. Dat is de olietemperatuur
  niet. Alleen prefix `11` op header `7E0` is gescand; `7E1` (TCM) is
  onaangeroerd. Zonder echte Mazda-DID-lijst is verder zoeken raden.
- **Socket-stabiliteit.** 12 keer dood in 48 minuten op 23-08, met 107
  geweigerde verzoeken tijdens herinitialisatie. Een kwart van de sessie ging op
  aan herstellen. Kijk of fix 11 dit meebeweegt.
- **Blok 1 tegenproef.** Op 23-08 verscheen spontaan "Geen profiel onder
  pl_vinprof_… — volle discovery". De controle kán dus rood worden. Blijft over:
  nagaan of blok 1 dat óók als LET OP boekt, niet alleen de BT-log.
- **Play Store.** `.aab` via `bundleRelease` staat klaar, blokkades zijn weg.
- **`worker.js` — 44 lege catches, dicht (26-08).** Was afgelopen als los
  eindje: de backend was nooit meegegaan in de ronde van 22-08, en
  `test-stille-catches.js` scande het bestand niet. Nu wel — het pad staat
  vooraan in de lijst zodat de foutmelding hem herkenbaar toont.

  Correctie op de eerdere triage hieronder: **r376** slikte geen wachtwoord-
  wijziging weg zoals hier eerst stond, maar het opportunistische herhashen
  van een legacy-hash na een geslaagde login — mislukt dat stil, dan blijft
  het account op het oude formaat staan en probeert de volgende inlog het
  gewoon opnieuw. Minder ernstig dan gedacht, maar bij structureel falen
  (kapotte token, verkeerde tabel) wil je dat wél zien; heeft nu een melding
  onder `[auth]`. **r643** klopte wel: een AI-antwoord dat geen geldige JSON
  is laat de kostenberekening stil op het minimumtarief vallen — het
  commentaar één regel erboven zegt zelfs expliciet "het gemis gaat naar de
  logs", en deed dat tot nu toe niet. Heeft nu een melding onder `[tegoed]`.

  De overige 42 kregen een reden in plaats van een melding: `JSON.parse` op
  externe of optionele invoer (`USERS_JSON`, `body.context`, een verzoek-body
  die toch verderop gevalideerd wordt), een best-effort `cache.delete`, een
  saldo-slot dat in een `finally` probeert los te laten maar toch vanzelf na
  30s verloopt, dertien WebSocket-`send`/`close`-aanroepen waar de andere kant
  al weg kan zijn, en de bestaande "melden mag de stroom niet breken"-guards
  rond `console.error` zelf.

## Richting: het contract tussen meten en gebruiken

Nieuw op 25-08, uitgewerkt in **`PIDLANE-CONTRACT.md`** (versie 0.1, ontwerp).

Aanleiding: de vier meetvondsten van deze week kwamen allemaal bij de AI aan
alsof het echte metingen waren — `0155 = 128` (rauwe byte), raildruk 27 minuten
bevroren, `019D = −40` (ECU claimt maar levert niet), en een rit waarvan zes
minuten ontbraken. De meetlaag wéét dat meestal prima; die kennis komt alleen
nergens terecht.

Het contract legt twee dingen vast: per meetwaarde een kwaliteitsklasse met
reden, en per sessie een dekking (duur, gaten, volledigheid, herverbindingen).
Kernregel: `waarde` is `null` zodra de kwaliteit niet `gemeten` of `stabiel` is,
zodat een afnemer die de kwaliteit negeert zichtbaar faalt in plaats van stil.

**Geen herbouw.** Invoering via een tussenlaag (`plMeetwaarde`, `plDekking`) en
daarna één afnemer per sessie, AI-rapport eerst. Eerst STPX afronden, want dat
verandert de meetlaag nog.

Vier besluiten staan open in §9 van dat document.

## Testrun 25-08 (stilstand, 23 s) — nieuwe bevindingen

- **VIN-profiel wordt niet gebruikt.** ~~Blok 1: *"staat in de opslag maar is
  bij het verbinden NIET geladen; de app deed een volle discovery."*~~
  **Afgehandeld 26-08 (batch, fix 2).** De melding sloeg ook vals alarm bij een
  eerste verbinding met een onbekend voertuig en bij een profiel dat de
  discovery zélf net had aangemaakt — dat is nu "ok". Blijft over: nagaan of
  het hierboven beschreven geval (bekend voertuig, écht genegeerd profiel)
  zich nog voordoet — zie CAMPAGNE in testrun 4.7.
- **`0155`/`0156` staan niet in `ALL_PID_DEFS`.** ~~In de sweep heten ze
  letterlijk "PID 0155".~~ **Afgehandeld 26-08 (batch, fix 3).** Toegevoegd met
  `(A−128)·100/128`, zelfde vorm als `0106`/`0107`. Byte 128 geeft nu 0%.
- **Naambotsing `PLWake`.** ~~Testrun 4.3 gaf FOUT `PLWake.steunt is not a
  function`...~~ **Afgehandeld 26-08 (batch, fix 1).** Uitgezocht: `window.PLWake`
  (index.html) is geen naambotsing maar een eerder gebouwde, bredere
  scherm-wakelock — wikkelt `setConn()` om, kijkt ook naar `remPill`/
  `remDrivePill`. `window.PLWakelock` (pidlane-auth.js) was het duplicaat en is
  verwijderd; blok 5 toetst nu `PLWake` en meldt FOUT als het duplicaat
  terugkomt.
- **PLLoad opnieuw schoon.** 4 remmomenten, 0 ongevraagd, bezetting voorspelt
  responstijd (+89%). Tweede bevestiging van fix 11.

## Batch 26-08 — vier fixes, dicht

Vier kleine, losse fixes; elk een eigen commit. Testrun opgehoogd naar 4.7,
CAMPAGNE herschreven naar deze batch plus de nog openstaande rit.

1. **PLWakelock-duplicaat verwijderd** — zie "Naambotsing `PLWake`" hierboven.
2. **VIN-profielmelding gesplitst** — zie "VIN-profiel wordt niet gebruikt"
   hierboven.
3. **`0155`/`0156` toegevoegd aan `ALL_PID_DEFS`** — zie hierboven.
4. **Steunbitmaps `0180`/`01A0` uit `ALL_PID_DEFS`.** Stonden dubbel geboekt:
   `GEEN_SENSOR_PIDS` hield ze al buiten de keuzelijst via `pidGate()`, maar
   `ALL_PID_DEFS` had er nog volledige — en verkeerde — sensordefinities voor
   staan ("Motor looptijd totaal" resp. "Tussenkoeler temp A"; het zijn de
   steunbitmaps voor PIDs 81-A0 en A1-C0). Verklaart de "STEUNBITMAPS IN DE
   OPNAME"-bevinding uit de rit van 23-08 (0180 = 262157, 01A0 = −24).

**Nawerk dezelfde dag: `test-piddefs.js`.** De twee tabelcontroles van fix 3 en
fix 4 stonden eerst alleen in blok 5. Die toetsen de tabel zoals hij op schijf
staat, en dat kan node ook — dus ze zijn verhuisd naar `test-piddefs.js`, waar
ze bij élke commit meedraaien via `plcheck.sh`, mét hun tegenproef als tweede
helft van het bestand. In blok 5 staat nog één goedkope versiemarkering (0155
erin, 0180 eruit) voor wat node níét kan zien: of de app de nieuwe tabel ook
echt geladen heeft, of dat de HTTP-cache een oude serveert.

**Tweede ronde: nog twee controles uit blok 5.** Dezelfde werkregel toegepast
op wat er al stond.

- **`0143 rekent in procenten`** las alleen de tabel en riep `parse()` aan.
  Verhuisd naar `test-piddefs.js`, en meteen aangescherpt: alle drie de
  veldmetingen van de CX-5 als ijkpunt in plaats van alleen `41430038`, en de
  eis `max >= 400` heeft een eigen tegenproef gekregen — dat max van 100 naar
  400 moest was de tweede helft van de fix van 21-08, want bij overdruk loopt
  absolute belasting over de 100% en anders meldt veldlab het als "buiten
  bereik".
- **`Geen lege catches meer in de acht opgeruimde modules`** haalde acht
  modules op via `fetch`. Volledig gedekt door `test-stille-catches.js` (50
  modules, elke commit, eis is nul), dus weg. De acht waren de modules van de
  opruimronde van 22-08 — historisch toeval, geen principiële set.

Daarbij twee dingen bovenwater die er los van staan:

1. De regex van `test-stille-catches.js` miste de bindingloze en de
   destructurerende lege catch; die van blok 5 miste de bindingloze én sloeg
   vals alarm op een promise-afhandelaar met een lege functie. Beide gaten
   dicht, nog steeds nul bevindingen.
2. **`worker.js` heeft 44 lege catches.** Die test scande het bestand niet,
   terwijl `plcheck.sh` het voor syntax wél meeneemt met het argument dat een
   fout daar de hele dienst plat legt. Bij een eerste inschatting leken het er
   13 en allemaal gevuld; dat was fout — er was alleen op de bindingloze vorm
   gekeken. De echte telling is 44: 10x `catch (e) {}` en 34x `catch (_) {}`.
   Zie het losse eindje hieronder.

Nog open na deze batch: STPX onder belasting, de opruimregel (vijf minuten
nodig om te triggeren), en raildruk `0123`/`0159` die op 23-08 bevroren stond.
Zie CAMPAGNE in testrun 4.7 voor de exacte vragen.

## Testrun 4.7 (26-08-2026, stilstand, 18 s) — batch bevestigd, twee staarten open, drie nieuwe bevindingen

**Batch 26-08, per fix.**

- **Fix 1 (PLWakelock-duplicaat)** — groen. Blok 5: "PLWake aanwezig (sync),
  geen duplicaat PLWakelock."
- **Fix 2 (VIN-profielmelding)** — groen voor de twee gevallen die deze run
  raakte (eerste verbinding zonder profiel; profiel binnen dezelfde sessie
  opgeslagen — "0 uur oud... terecht niet geladen"). Het derde geval uit de
  CAMPAGNE-vraag — twee keer verbinden met hetzelfde *bekende* voertuig, dan
  een écht genegeerd profiel ouder dan een paar minuten — deed zich niet voor;
  deze meting is een verse discovery, geen herverbinding. **Blijft open.**
- **Fix 3 (0155/0156 als percentage)** — groen. Live-sweep: beide op 0%, net
  als 0106/0107.
- **Fix 4 (steunbitmaps uit `ALL_PID_DEFS`)** — groen in de tabel zelf
  (nieuwe PID-tabel geladen, geen fantomen in `supportedPIDs`). De
  consumer-check uit de vraag (bulk-recorder, gauges, AI-rapport) is deze run
  niet uitgevoerd — blok 2 opent/sluit die schermen alleen, toetst geen
  PID-inhoud. **Blijft open.** Verschijnen 0180/01A0 daar toch, dan gaat die
  consument buiten `pidGate()` om `ALL_PID_DEFS` lezen — dat is dan de
  volgende plek.

**Geen bug: bytelengtes 0155/0156 (punt 12).** `PLPidLen.afwijkingen()` meldt
tabel=2, gemeten=1 voor allebei. Nagekeken in `pidlane-data.js`: dat is precies
waar `PLPidLen` (26-07) voor gebouwd is — "Mazda SkyActiv geeft PID 55/56 in 1
byte i.p.v. 2" staat al als voorbeeld in die comment. Het zelflerende systeem
werkt zoals ontworpen. Niets te fixen.

**Nieuwe bug: `merkGroep()`-asymmetrie MINI vs BMW (§14, DTC-lookup).**
Bevestigd door de code te lezen (`pidlane-data.js:258`): MINI matcht op
prefix (`m.indexOf('MINI')===0`), dus "MINI COOPER" → groep BMW/Mini. BMW
matcht op exacte gelijkheid (`m==='BMW'`) — "BMW 320D" wordt na het strippen
van spaties/cijfers `BMWD`, mist de vergelijking en valt terug op `''`: geen
groep, geen merk-specifieke DTC-lookup. Bij BMW is alleen het kale merk zonder
toevoeging gedekt, bij MINI elke variant. Vermoedelijk een prefix-match ook
voor BMW; niet in deze sessie gefixt.

**Vier aanvragers op één bus — cijfers voor de openstaande vraag (§4).** Eigen
41-header-uitpakwerk buiten `splitBatchResponse()` om: diagbundel (1), graph
(1), monitor (2), veldlab (3), verify (1) — plus diagbundel (4) die wél via
`splitBatchResponse` gaat. Losse `fetch`-aanroepen: 18 over 7 modules (auth 4,
fuel 2, koopcheck 1, remote 7, veldlab 1, credits 1, klant 2); een gedeelde
`plFetch`-helper bestaat nog niet. Geen bug — voedt de bestaande open vraag,
geen actie op zichzelf.

**Adapter-identiteit herbevestigd, `PIDLANE.md` nog niet bijgewerkt.** STI/STDI
bevestigen opnieuw de STN-chip (dus STPX en MS-CAN beschikbaar); `PIDLANE.md`
beweert nog het tegendeel. Stond al als "de logische volgende sessie" in
`OVERDRACHT-NIEUWE-CHAT.md` (25-08) — nog steeds niet gedaan.

**STPX bij stilstand: verschil te klein om op te bouwen.** Gewoon 154 ms, STPX
167 ms (+8%). Dit is het gunstigste geval (rustige bus, zie CAMPAGNE-punt 9);
de vraag blijft open voor het rijden met alle vier de aanvragers aan.

**Raildruk 0123/0159 bewegen weer — niet over een hele rit bevestigd.** Deze
sweep: 0123 = 10050, 0159 = 9890 — niet langer de vaste 9900 van 23-08. Eén
meting van 18 s zegt niets over of ze een hele rit blijven bewegen. Blijft
open tot de rit met alle vier de aanvragers.

**Voertuig mist model/bouwjaar/brandstof — ongewijzigd, gekoppeld aan het
VIN-profiel.** Bevestigt het vermoeden uit `OVERDRACHT-NIEUWE-CHAT.md` punt 4:
dit voertuig heeft nog geen (volledig) profiel om die velden uit te halen. Los
van de `merkGroep`-asymmetrie hierboven, wel dezelfde databron.

**Opruimregel: niet getriggerd.** 18 s zit ruim onder de vijf minuten die
nodig zijn; ongewijzigd open.

## Batch 26-08b — kentekenstap, protocolkeuze, merkGroep

Vijf commits, testrun naar **4.8**. Uit §4/§5 is bewust alleen het kleine werk
meegenomen (merkGroep + PIDLANE.md); de opruimregel en de vier aanvragers
blijven open keuzes.

**1. `merkGroep()` matcht overal op prefix.** Zeven merkregels deden dat al,
twee toetsten op gelijkheid (`m==='BMW'`, `m==='VW'`). De normalisatie stript
alles wat geen letter is, dus `BMW 320D` → `BMWD` en `VW GOLF` → `VWGOLF`:
allebei ongelijk, allebei terug naar `''`, dus generieke DTC-tekst en geen
merk-preset. Stil, want `''` is de geldige uitkomst voor een onbekend merk.
Testrun 4.7 vond de BMW-helft; **de VW-helft kwam pas boven bij het narekenen**,
want blok 11 probeerde alleen MINI en BMW. Daarom is de regel structureel
gelijkgetrokken in plaats van per merk goedgezet. `test-merkgroep.js` legt de
regel vast (kaal merk en merk-met-model geven dezelfde groep, veertien
merknamen) met de oude implementatie als tegenproef.

Meegevallen: de tweede merkgroepering waar §14 van PIDLANE.md voor
waarschuwde, in `applyVehiclePIDPreset()`, is in ronde 9 al naar `merkGroep()`
gegaan. Er was dus maar één plek te fixen. Die waarschuwing is weg.

**2. `PIDLANE.md` bijgewerkt.** De onjuiste "clone zonder STN-chip" stond er al
niet meer in, maar de positieve kant ontbrak: `ATI` liegt, `STI`/`STDI` niet, en
STPX en MS-CAN zijn dus beschikbaar. Met de kanttekening van blok 13 erbij
(+8% bij stilstand — geen grond om die laag te herbouwen vóór er onder
belasting gemeten is).

**3. Het lezen van de VIN wist geen sterkere data meer.** Voorwaarde voor punt
4, maar op zichzelf al fout. Twee plekken gooiden voertuigdata weg zodra de VIN
binnenkwam — `resetVehicleSources()` in `tryReadVIN()` (de bron-rangen) en de
`vehicleInfo`-reset in `updateVehicleCard()` (de velden). Allebei toetsten ze op
"binnenkomende VIN != opgeslagen VIN", waarbij een **lege** opgeslagen VIN als
ongelijk telde. Zolang de VIN het eerste was wat de app over een auto wist viel
dat niet op. `plAnderVoertuig()` beantwoordt nu de juiste vraag: niet "is de VIN
veranderd" maar "is dit aantoonbaar een ANDERE auto", en dat is alleen zo bij
twee ingevulde VINs die verschillen. Bij een echt ander voertuig wordt er nog
steeds volledig gereset — inclusief de bron-rangen, wat in
`updateVehicleCard()` juist ontbrak.

**4. Kenteken is een eigen stap vóór de protocolscan.** Het stond op de
voertuigkaart en werd dus pas ná de hele discovery gevraagd, terwijl het merk,
model, bouwjaar en brandstof bepaalt — en dát voedt `merkGroep()`, de
DTC-lookup en de brandstofgates. De poort zit in `scanNetworks()` en niet in de
vier transports die daarop uitkomen: één beslisplek. Overslaan mag, staat als
knop en komt in het log; een buitenlands kenteken of een RDW die plat ligt mag
een diagnose nooit blokkeren.

Nevenwinst: het laatst gebruikte kenteken wordt voorgevuld maar moet worden
**bevestigd**. Tot nu toe hergebruikte `updateVehicleCard()` dat stilzwijgend op
elke auto waarmee je verbond — de plaat van gisteren op de auto van nu.

Bewust géén tweede element met id `kentInput`: het wizardveld heet
`kentWizInput` en `rdwLookup()` krijgt de waarde mee via een nieuwe
opties-parameter. Dat is precies de fout die `pidlane-motortype.js`
documenteert. `test-dubbele-ids.js` bewaakt het als ratel — twee bewust
geaccepteerde dubbele id's met reden (`btnConnect`/`btnDemo`, scoped bedraad),
elk nieuw geval faalt.

**5. Protocolkeuze biedt echt een keuze.** De app stapte na het detecteren
vanzelf door: `scanNetworks()` zette alleen het gevonden protocol in de lijst en
`renderNetworkCards()` had een tak "precies één netwerk? na 1,5 s
`startDiscovery()`". Omdat de lijst er altijd precies één bevatte, was dat de
enige tak die ooit liep. Het protocol werd dus vergrendeld voordat je het scherm
gelezen had, en zat de detectie ernaast dan was opnieuw beginnen de enige uitweg.

`PROTOCOLS` (tien protocollen, sinds de opsplitsing in `pidlane-data.js`) werd
daarbij **door niets gelezen**. Dat is nu de bron van de handmatige
alternatieven. Herkend protocol bovenaan en voorgeselecteerd, alternatieven
eronder, gebruiker bevestigt altijd zelf. Zonder detectie verschijnt de
volledige lijst met "opnieuw scannen" vooraan in plaats van een doodlopend
"geen netwerken gevonden" — want dan staat meestal gewoon het contact uit.
De `A` die `ATDPN` voor een automatisch gevonden protocol zet (`A6`) wordt
gestript bij het ontdubbelen.

**Werkregel bevestigd.** Beide nieuwe fixes gingen over hetzelfde als de vorige
batch: één waarheid per feit. `PROTOCOLS` bestond naast een hardcoded lijst van
één, en `kentInput` dreigde een tweeling te krijgen. En `test-bedrading.js` wees
twee keer meteen aan dat een nieuwe `typeof`-guard in KRITIEK hoort — die ratel
werkt.

## Rit van 23-08 (nacht) — wat de meting opleverde

27,6 min, 1295 monsters op 1 Hz, 11 min boven 15 km/u, tot 96 km/u en 3865 rpm.
De eerste echte rit onder belasting sinds de batch.

- **Fix 11 werkt.** 34 remmomenten, waarvan 1 zonder fouten én zonder oplopende
  responstijd. Vóór de fix: 61 van de 86. Bezetting voorspelt nu wél responstijd
  (128 → 180 ms, +41%).
- **De app stond stil, de socket was het gevolg.** *(Herzien 24-08. Hier stond
  eerst "socket is de echte boosdoener"; dat was fout en de correctie staat
  hieronder, omdat de redenering leerzaam is.)*

  De aanleiding was 9× SPP herverbonden, 12× `flush read() fout` en drie gaten
  in de bulkopname (134 s, **167 s middenin het rijden**, 66 s). Dat leek een
  instabiele verbinding. Maar het **logboek zelf** heeft veertien stiltes op
  precies dezelfde kloktijden — 179 s, 168 s, 177 s, 66 s — en dáár zit het
  bewijs: een dode socket logt fouten. Hier logt niets. Geen fout, geen poging,
  geen watchdog. Het proces liep niet.

  Android bevriest de JS-timers van een WebView op de achtergrond, dus pollus,
  recorder en logger stoppen tegelijk. Sluitstuk: **elke herverbinding volgt
  direct op een stilte.** Om 23:31:00 hervat de app, 16 s later "socket dood na
  012E1" — dat is het eerste commando in een socket die Android intussen heeft
  opgeruimd, niet busfalen.

  Aanleiding volgens Nico: het logboek openen of opslaan schakelt naar een ander
  venster; bij terugkomst moet er herverbonden worden.

  Wat er moet gebeuren, op opbrengst gesorteerd:
  1. **Foreground service + wake lock** (Capacitor). Zolang de pollus in
     JS-timers zit is elke vensterwissel een gat. Dit is de echte oplossing en
     het is werk.
  2. **Herkennen in plaats van repareren.** `visibilitychange` afvangen, opname
     als gepauzeerd markeren, bij terugkomst meteen actief herverbinden in
     plaats van wachten tot een commando faalt. Klein, kan snel.
  3. **Logboek openen zonder venster te wisselen.** De directe aanleiding,
     waarschijnlijk het goedkoopst.

  Gevolg voor PLLoad: een deel van de 34 remmomenten kan een reactie zijn op
  het hervatten, niet op de bus. Pas te scheiden met een rit waarin de app niet
  naar de achtergrond gaat.
- **Turbo-oordeel voor het eerst gevallen.** 1461 MAP-monsters, piek 105 kPa,
  barometer 102, grens 110.
- **Boost-PIDs kunnen op deze auto niet verdwijnen.** `0160 = 41606B080001`
  decodeert naar `62 63 65 67 68 6D 80` — geen `70`. De mode 21-probe vindt
  `2102`/`2187` niet. Het fantoom-scenario vraagt een ander voertuig.
  (Openstaand: in §15 van PIDLANE.md staat `2187`, elders `0187`. Eén van beide
  klopt niet; `PIDS_EXTRA` in `pidlane-data.js` is de bron.)
- **32 van de 55 PIDs bewogen niet in 27 minuten rijden.** `0155`/`0156` staan
  op 128 — de rauwe byte `0x80`, ongeschaald, terwijl trim rond 0% hoort te
  liggen. `0123`/`0159` (raildruk) bevroren op 9900. `019D`/`019E`/`01A0` op
  −40/−24: rauwe nul met temperatuuroffset. Die laatste drie zijn géén
  fantomen — blok `0180` (`262157`) meldt ze, de ECU claimt ze dus en levert
  niets. Precies de gevallen waar de opruimregel voor bestaat.
- **De bulk-recorder gaat niet door de gate.** `0120`, `0140`, `0160` en `0180`
  staan als sensorwaarde in de opname; dat zijn de steunbitmaps.
  `GEEN_SENSOR_PIDS` houdt ze uit de keuzelijst maar niet uit `pidlane-bulk.js`.
  Een vijfde deur naast de vier uit ronde 6.
- **De adapter IS een STN — bevestigd 25-08.** Blok 12 gaf
  `STI="STN2255 v5.12.4"`, `STDI="OBDLink MX+ r3.1.3"` terwijl `ATI` gewoon
  `ELM327 v1.4b` zegt. De aanname in PIDLANE.md ("clone, geen STN-chip") was een
  verkeerde conclusie uit de ATI-string en moet weg.

  **STPX en MS-CAN zijn dus beschikbaar.** Dat raakt de pollstrategie
  fundamenteel: met STPX geef je per commando een eigen timeout en een verwacht
  aantal frames mee. Het gokken met batchgroottes, de zelflerende `PLPidLen` en
  de terugval van drie-naar-één zijn dan niet meer nodig. Dat is geen
  optimalisatie maar een hele laag die kan verdwijnen — eigen sessie waard.
- **Bulk en logboek gebruiken verschillende klokken.** Opname 21:03:34–21:31:12,
  logboek 23:00:11–23:35:23. Exact twee uur: de recorder schrijft UTC, de logger
  lokale tijd. Alleen opgemerkt doordat de seconden van de gaten toevallig
  gelijk waren. Wie de twee bestanden naast elkaar legt, concludeert eerst dat
  ze niet bij elkaar horen.
- **`0143` lijkt al goed.** 0–96,9%, gemiddeld 19,4 tegen 30,0 voor `0104`.
  Formule nakijken vóór afvinken.
- **Opmerkingveld kapt af op exact 20 tekens** — bevestigd
  (`"Testrun na herverbin"`).
- **Blok 5 stond op FOUT in beide runs van die nacht** ("survey transport
  (veldlab) niet geladen"), en op 24-08 op "pidgate niet geladen". Beide keren
  weg na herladen. Dat is de HTTP-cache. De melding zegt dat sinds testrun 4.1
  zelf. Werkregel: vóór elke meetrit "Nieuwste versie laden", en pas starten als
  blok 5 schoon is.

---

# 6. HOE WE WERKEN

**Batches, geen groeiende nummerlijst.** Meerdere fixes, één toets, één rit.
Groen verdwijnt, rood gaat in één naronde, daarna dicht.

**Eén ingreep per commit.** Mechanisch (gedragsneutraal) en inhoudelijk nooit in
dezelfde stap.

**Nooit fixen in de sessie die iets ontdekt.** Zichtbaar maken en oplossen zijn
twee dingen.

**Verificatie is mechanisch.** `node --check` op elk JS-bestand, en de ratel
(`test-stille-catches.js`) mag alleen omlaag.

**Tests die altijd groen kunnen zijn bewijzen niets.** Elke nieuwe controle
krijgt een tegenproef.

**Levering.** Delta-zip met `PidLane-main/…`, dit document bijgewerkt mee.
Complete bestanden, nooit patch-blokken.

## Vaste aannames

Geen lokale wrangler, geen Node op de werklaptop. Deploy is git push →
Cloudflare Workers Builds. Secrets alleen via het Cloudflare-dashboard. Airtable
is de opslag; bij een echte SQL-behoefte D1, nooit MariaDB.

---

# 7. GESCHIEDENIS

Kort, alleen wat het gedrag van nu verklaart.

**Stille catches (dicht, 22-08).** 584 van de 824 lege catches gevuld over acht
modules. Die klasse bug verborg drie dode functieaanroepen maandenlang.
Werkregel sindsdien: een catch mag alleen stil zijn bij een verwachte externe
fout, nooit rond een aanroep van eigen code.

**De fantoomsensor-familie.** De regel "mag deze PID door" stond op zes plekken;
een fix op één plek liet de andere regresseren. Opgelost met één centrale poort
(`pidGate()` / `pidlane-pidgate.js`). Werk je aan PID-filtering, kijk dan altijd
naar alle zes tegelijk.

**Cross-PID timing.** PIDs op verschillende intervallen leveren metingen van
verschillende momenten. Detectiecriteria op één PID bouwen waar het kan.

**Steunbits zijn leidend, gecachte profielen niet.**
`profielTegenSteunbits()` moet elk gecacht profiel hertoetsen na verbinden.

**ELM-reinit moet bus-geïsoleerd.** `ATE0`/`ATS0`/`ATSP0` tussen polls door
verpest data. De harde poort werkt, bevestigd in veldlogs.

**Snelheidsproef, met een kanttekening.** Blok 10 claimt tijdens elke trap het
busslot, in de rust niet. Het verschil tussen trap (119 ms) en rust (379 ms) is
dus deels schone bus tegen drukke bus — lees het niet als "rust maakt de
verbinding traag".

**Eén waarheid per feit (26-08).** Twee keer dezelfde les in één batch: een
`window.PLWake` (index.html) en een `window.PLWakelock` (pidlane-auth.js)
deden onafhankelijk van elkaar hetzelfde; `ALL_PID_DEFS` en `GEEN_SENSOR_PIDS`
spraken elkaar tegen over of `0180`/`01A0` sensoren zijn. Beide keren was de
oplossing dezelfde: één plek aanwijzen als de waarheid en de andere
verwijderen, niet allebei laten bestaan "voor de zekerheid". `GEEN_SENSOR_PIDS`
is nu blijvend bewaakt in `test-piddefs.js`: geen enkele PID daarin mag een
definitie in `ALL_PID_DEFS` hebben.

**Een tegenproef die niet meedraait is geen tegenproef (26-08).** De regel
"elke nieuwe controle krijgt een tegenproef" stond er al, maar in blok 5 kwam
die neer op één keer met de hand omdraaien bij het schrijven — blok 5 draait
in een browser, op een telefoon, in een auto. Daarna bewijst hij niets meer.
Werkregel erbij: toetst een controle alleen data of pure functies (geen DOM,
geen bus, geen verbinding), dan hoort hij als `test-*.js` onder `plcheck.sh`,
met de tegenproef als tweede helft van het bestand — dezelfde vorm die
`test-dodeknoppen.js` al had ("vals alarm mag niet" / "het echte geval moet
wél gevonden worden"). Blok 5 houdt wat alleen in de auto zichtbaar is.
