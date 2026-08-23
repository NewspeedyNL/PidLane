# PidLane — werkdocument

Eén bestand. Vervangt `PLAN.md`, `OVERDRACHT.md` en alle losse leesmij's.
Bijgewerkt: 24-08-2026 · app v3.0.0 · testrun 3.8

---

# 1. WAT NU

**De rit van 23-08 is gereden. Eén ding open, één ding nieuw te toetsen.**

De batch van 23-08 is grotendeels groen — zie §2 voor de uitslag per fix. Wat
er nu bij komt is de opruimregel voor stille sensoren, gebouwd op 24-08 naar
het besluit dat er al lag.

Volgende rit toetst twee dingen: of de opruimregel de juiste sensoren pakt (op
deze CX-5 verwacht: hoogstens `0101`, `0121`, `016D`) en of de resterende
open punten uit §2 alsnog groen worden.

---

# 1b. UITSLAG VAN DE RIT VAN 23-08

Vier logs: testrun bij stilstand, twee logboek-exports over de rit, en een
testrun na herverbinden.

**Fix 11 (PLLoad) is de grote winst.**

| | 23-08 oud | 23-08 na de fix |
|---|---|---|
| verlagingen | 86 | 6 |
| waarvan bij foutgraad 0 | 61 | 1 |

Die ene had 1198 ms responstijd, ruim boven `traagMs` — dus terecht. De andere
vijf zaten op 33-100% fouten. **Nul verlagingen op bezetting alleen.** De
nieuwe logregel vuurde ook, precies in het doelgeval: *"Pollbudget
vastgehouden op 78% — bezet 86% maar responstijd 176ms (vorige 234ms), fout
0%"*.

**Let op:** die regel staat op `info` en komt daardoor NIET in de
logboek-export. Hij was alleen terug te vinden in de diagbundel binnen de
testrun. Wil je hem kunnen opzoeken, dan moet dat `warn` worden.

**`0143` is opgelost.** `41430029 → 16,08%` en `41430038 → 21,96%`. PIDLANE.md
§11 noemde 16,1% als de juiste waarde. Punt dicht.

**Fix 2 was NIET stuk — de controle was stuk.** Blok 5 meldde tweemaal
"survey transport (veldlab) — dat bestand is niet meegekomen". De fix zat er
gewoon in; `vlFullSurvey` staat op regel 334 binnen de IIFE die op regel 18
opent, dus `String(window.vlFullSurvey)` leverde een lege string. Exact de val
uit PIDLANE.md §20: een statische definitie is geen globale beschikbaarheid.
Op 24-08 rechtgezet — de uitkomstregel staat nu als `plSurveyUitkomst()`
buiten de IIFE en blok 5 roept hem echt aan.

**Blok 1-tegenproef geslaagd.** Het niet-geladen VIN-profiel werd als LET OP
geboekt, niet alleen in de BT-log.

**Blok 11 heeft geleverd:**

- 55 sensoren beoordeeld, 5 nodata, **3 niet-ok maar wél actief**: `0101`,
  `0121`, `016D`. Dat is de populatie waar de opruimregel op landt — klein
  genoeg om veilig te bouwen.
- Alle vier terugweg-haken bestaan.
- Punt 6: eigen uitpakwerk op 8 plekken over 5 modules (diagbundel 1, graph 1,
  monitor 2, veldlab 3, verify 1); 18 losse fetch-aanroepen over 7 modules,
  geen centrale helper.
- Punt 12 (bytelengtes `0155`/`0156`): geen enkele afwijking. Dicht.
- `010E` uiterste -18 (3x) — de `PID_LET_OP`-signaaltabel werkt.

**Twee nieuwe bevindingen:**

- **De turbodrempel heeft 1 kPa marge.** 1461 MAP-monsters, piek **105 kPa**,
  `MAP_ATMOSF_MAX` staat op 106. Eén kPa hoger en deze atmosferische CX-5 was
  als turbo beoordeeld. De verkeerde kant op is veilig (turbo = niets
  verwijderen), maar dit is geen marge. Nog niet aangeraakt.
- **Het opmerkingveld kapt af op 20 tekens.** "Testrun na herverbin" is exact
  20. In `pidlane-export.js` staat geen `maxlength`, dus het zit elders.

**Socket:** 9 herverbindingen in 35 min tegen 12 in 48 min op 23-08 — zelfde
tempo, fix 11 beweegt daar niet in mee. Wel anders verdeeld: tussen 23:09 en
23:29 nul, en daarna een ineenstorting (fout 100%, responstijd 33 s, 76
geweigerde verzoeken tijdens herinit).

---

# 1c. GEBOUWD OP 24-08 — de opruimregel

Naar het besluit dat op 23-08 is vastgelegd. Geen nieuw systeem: de
dode-PID-snoei in `pidlane-plload.js` bestond al en is uitgebreid met een
uitgang.

`pidOpruimen(pid, reden)` in `pidlane-pidgate.js` is de tegenhanger van
`pidToevoegen()` — één deur naar binnen, één naar buiten. `pidGate()` weert
een opgeruimde sensor op de trede `kiesbaar`, binnen de force-uitzondering:
zet je hem met "Toon alles" handmatig aan, dan mag dat.

Drempels: `PID_DEAD_THRESHOLD` 4 → **5**, `PID_REPROBE_MS` 120 s → **60 s**,
nieuw `PID_OPRUIM_NA` = **5**.

**Het worden er zes, en dat is akkoord (24-08).** De snoei vereist vier dingen
tegelijk, niet alleen een reeks missers: ook een kwaliteitsscore onder 35, een
reeks die in echte tijd lang genoeg duurt, en een bus die zelf gezond is. Die
score begint op 100 en zakt 12 per misser, dus hij passeert de 35 pas bij de
**zesde**. Vijf missers snoeien nog niet.

De kwaliteitspoort blijft dus staan. Hij vangt precies het scenario af dat op
23-08 in het log stond — drie socketdoden bij foutgraad 100% — waar je niet
wilt dat sensoren opdraaien voor een zieke bus. Het besluit "na 5 pogingen"
blijft de ondergrens; zes is de praktijk. Geen open punt meer.

Melding gaat naar `btDiag` én `log`, en de opgeruimde sensoren gaan mee in
`plMeetPromptBlok()` met de instructie ze niet als afwezig of defect te
behandelen.

`test-stilopruim.js` (25 toetsen), tegenproef gedaan: `PID_OPRUIM_NA` op 1
zetten maakt de test rood.

---

# 1d. GEBOUWD OP 24-08 — turbodrempel volgt de omgevingsdruk

De twee drukdrempels van de turbo-detectie stonden als vast getal in de code:
bewijs vanaf 85 kPa, atmosferisch onder 106 kPa. Die werken alleen op
zeeniveau.

**Wat er mis was, in twee maten.** De kleine: op 23-08 mat de CX-5 een piek van
105 bij een grens van 106 — één kPa. Onschuldige kant (te snel "turbo" zeggen
verwijdert niets), maar geen marge.

De grote: op hoogte klopt geen van beide. Op 1500 m is de omgevingsdruk ~85
kPa. Een atmosferische motor haalt de bewijsdrempel van 85 dan **nooit**, dus
valt er nooit een oordeel en is de detectie stil dood — dezelfde vorm als de
dode code van ronde 5. En een turbo die daar naar 100 kPa laadt blijft onder de
106 en wordt als atmosferisch bestempeld, waarna zijn boost-tegels verdwijnen.
Dát is de schadelijke kant.

**De oplossing komt uit de auto zelf.** PID `0133` (barometerdruk) is op de
CX-5 gewoon beschikbaar en gaf twee keer 102 kPa. De drempels zijn nu
`baro − 15` voor bewijs en `baro + 8` voor boost. Op deze auto: 87 en 110, dus
5 kPa marge op de piek van 105 in plaats van 1.

Terugval in twee stappen: kent het voertuig `0133` niet, dan is de MAP bij
draaiend contact en stilstaande motor dezelfde waarde (geen onderdruk), met een
eis van minstens drie monsters. Levert geen van beide iets op, dan blijven de
oude vaste 85/106 staan — bewust laag, want te snel "turbo" zeggen verwijdert
niets.

`PLGate.stats()` publiceert nu ook `omgevingsdruk`, `bewijsDrempel` en
`atmosfDrempel`, zodat blok 5 het gedrag kan toetsen in plaats van de broncode
te lezen. Blok 5 meldt het bovendien als de marge tussen piek en grens onder
3 kPa zakt.

`test-turbodrempel.js` (34 toetsen), knippad tussen `// Boost/laaddruk-PID` en
`// true = sensor past bij dit voertuig`. Twee tegenproeven: allebei de
drempels weer vast maken geeft rood.

---

# 2. DE BATCH VAN 23-08 — 13 fixes, één toets

Afvinken tijdens de rit.

| # | fix | bestand | uitkomst |
|---|---|---|---|
| 1 | `clearBtLog()` wist de localStorage-spiegel niet | btflow | ☐ |
| 2 | transportfout telt niet meer als "PID bestaat niet" | veldlab | ✅ (controle was stuk, niet de fix) |
| 3 | deep-log: waarschuwing als sensoren niet aanstaan | koopcheck | ☐ |
| 4 | onderhoudsadvies: oranje balk bij twijfel | koopcheck | ☐ |
| 5 | EV/accu-check: idem | koopcheck | ☐ |
| 6 | lange-rit-check: idem | koopcheck | ☐ |
| 7 | klimaatcheck: waarschuwing in het rapport | koopcheck | ☐ |
| 8 | koopcheck (de P2-fix): oranje balk bij twijfel | koopcheck | ☐ |
| 9 | meetpoort meldt zichtbaar waarom hij zeurt | fuel | ☐ |
| 10 | remote: terugval op steunbits i.p.v. ongefilterd | remote | ☐ |
| 11 | PLLoad regelt niet meer op bezetting alleen | plload | ✅ 86→6 verlagingen |
| 12 | `clearDTC`-wrapper meldt als installatie faalt | remote | ✅ 6 wrappers actief |
| 13 | header-reset meldt als hij faalt | testrun | ✅ geen meldingen = faalde niet |

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

**Demo-knop op het loginscherm.** OPGELOST 24-08, na een screenshot.

De oorzaak zat niet in `.lg-foot` maar in de cirkel: `.ov#loginOv .modal` heeft
`width` én `height` allebei op `--lgD`, dus een **vaste** hoogte. De demo-knop
brak naar twee regels, de inhoud liep onderuit de cirkel, en de versieregel
stond op de nominale onderkant — vandaar twee elementen op dezelfde plek.

De Engelse tekst blijft staan: de Play-reviewnotitie belooft letterlijk
"Try demo — no adapter needed". Niet de tekst korter, maar de knop passend.
`.mact` van 62% naar 70% van `--lgD`, een eigen regel voor `.mbtn.s` met een
kleiner lettertype, en `white-space:nowrap` als garantie — een knop die niet
kán afbreken laat de cirkel niet overlopen. Nagerekend over `--lgD` 300 t/m
470: kleinste marge 21 px.

**Bulk-recorder komt niet bovenop.** OPGELOST 23-08. De overlay stond op
`z-index:9200` en lag daarmee onder de topbar (9550), het tokenchipje van
PLCredits (9400) en elke andere overlay in de app — alle andere schermvullende
modals zitten op 9600-9900. Nu 9800, gelijk aan `.wiz-ov`.

**Opmerkingveld bij opslaan.** Zit er wél in, in `pidlane-export.js`: de
opmerking komt in een eigen kader boven aan de PDF en bovenaan het tekstbestand.
Toetsen tijdens de rit.

---

# 4. OPEN KEUZES — geen bugs, jouw besluit

Deze twee vragen een beslissing, geen code. Ze staan hier zodat ze niet
verdwijnen, niet omdat er iets stuk is.

**Vier aanvragers op één bus.** Waakronde, bulk-recorder, caravan-tracker en
rijmonitor vullen de bus langs elkaar heen; PLLoad regelt er maar één. Fix 11
maakt PLLoad daar ongevoelig voor, maar lost niet op dát ze langs elkaar heen
werken. Blok 11 telt het eigen uitpakwerk en de losse fetch-aanroepen per
module.

---

# 5. LOSSE EINDJES

Klein, geen sessie waard, maar niet vergeten.

- **Socket-stabiliteit.** 12 keer dood in 48 minuten op 23-08, met 107
  geweigerde verzoeken tijdens herinitialisatie. Een kwart van de sessie ging op
  aan herstellen. Kijk of fix 11 dit meebeweegt.
- **Blok 1 tegenproef.** Op 23-08 verscheen spontaan "Geen profiel onder
  pl_vinprof_… — volle discovery". De controle kán dus rood worden. Blijft over:
  nagaan of blok 1 dat óók als LET OP boekt, niet alleen de BT-log.
- **Opmerkingveld kapt af op 20 tekens.** Niet in `pidlane-export.js`; bron
  onbekend.
- **"Pollbudget vastgehouden" staat op info-niveau** en ontbreekt daardoor in
  de logboek-export. Naar `warn`?
- **Play Store.** `.aab` via `bundleRelease` staat klaar, blokkades zijn weg.
  Stille catches zijn er 394, niet 240 — zie het hoofdstuk hieronder.

---

# 5b. STILLE CATCHES — gemeten, met een aflopend criterium

Uit de bron van 23-08, zelfde definitie als `test-stille-catches.js`.

**394**, niet 240, over 38 modules. Die 240 kwam uit 824 - 584 en telde
`pidlane-remote.js` en `pidlane-testrun.js` nog mee; die staan inmiddels op 0.
Hun ratelgrenzen stonden nog op 105 en 66 — daar mochten dus 171 lege catches
bij zonder dat de test piepte. Nu allebei op 0 gezet, tegenproef gedaan.

**Wat er niet gevonden is, is het belangrijkste.** Per stille catch is het
`try`-blok uitgeknipt en gekeken of er een aanroep in zit van een functie die
nergens in het project bestaat — de klasse bug die ronde 5 maandenlang
stillegde. **Nul treffers.** Er ligt op dit moment geen dood mechanisme achter
deze 394 te wachten.

| soort | aantal | oordeel |
|---|---|---|
| om een aanroep van eigen code heen | 266 | tegen de werkregel |
| alleen extern (opslag, DOM, JSON, fetch) | 63 | mag stil zijn |
| geen aanroep herkend | 64 | onschuldig |

Naar bereikbaarheid: ring 1 (opstart en verbinden) 65 om eigen code, ring 2
(meten en parsen) 115, ring 3 (alleen als je die functie opent) 86.

**Criterium voor publiceren: ring 1 + 2 naar nul — 180 stuks over 21 modules.**
Dat is drie a vier sessies op het tempo van 22-08. Ring 2 eerst: daar raakt een
gemiste fout de meetdata in plaats van een schermpje, en `datalog`,
`rijsituatie` en `pids` zijn samen 52 van de 115. "Nul in de hele codebase" is
geen criterium maar een horizon.

Kanttekening bij het getal: de eerste telling zat er 19 naast omdat de
tokenizer struikelde over een regex met een quote erin (`/"/g` in een
template-interpolatie in `pidlane-pids.js`). Een grove regex geeft hier net zo
makkelijk een verkeerd getal als het getal dat hiermee gecorrigeerd werd.

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
