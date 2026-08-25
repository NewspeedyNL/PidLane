# PidLane — werkdocument

Eén bestand. Vervangt `PLAN.md`, `OVERDRACHT.md` en alle losse leesmij's.
Bijgewerkt: 23-08-2026 · app v3.0.0 · testrun 3.6

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

- **VIN-profiel wordt niet gebruikt.** Blok 1: *"staat in de opslag maar is bij
  het verbinden NIET geladen; de app deed een volle discovery."* 55 PIDs met 55
  health-oordelen, 18 minuten oud, en toch alles opnieuw scannen. Kost tijd bij
  elke verbinding. Vermoedelijk ook de reden dat het voertuig op "Mazda" staat
  zonder model, bouwjaar en brandstof — en dát voedt `merkGroep()` en de
  brandstofafhankelijke gates.
- **`0155`/`0156` staan niet in `ALL_PID_DEFS`.** In de sweep heten ze letterlijk
  "PID 0155". Daarom komt de rauwe byte `0x80` = 128 eruit — geen parserfout maar
  een ontbrekende definitie. Het zijn de secundaire O2-trims; met
  `(A−128)·100/128` wordt 128 netjes 0%. Eén regel per PID in `pidlane-data.js`.
  Dit sluit het losse eindje uit de rit van 23-08.
- **Naambotsing `PLWake`.** Testrun 4.3 gaf FOUT `PLWake.steunt is not a
  function` terwijl het object bestond: er is al een `window.PLWake` in een
  module die ná `pidlane-auth.js` laadt. Hernoemd naar `PLWakelock` (4.5). Nog
  te doen: nagaan wat die andere `PLWake` is —
  `grep -rn "PLWake" public/*.js | grep -v pidlane-auth`. Als dat een bestaande
  wakelock is, is de mijne een duplicaat.
- **PLLoad opnieuw schoon.** 4 remmomenten, 0 ongevraagd, bezetting voorspelt
  responstijd (+89%). Tweede bevestiging van fix 11.

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
