# PidLane — werkdocument

Eén bestand. Vervangt `PLAN.md`, `OVERDRACHT.md` en alle losse leesmij's.
Bijgewerkt: 23-08-2026 (avond) · app v3.0.0 · testrun 3.6

---

# 1. WAT NU

**Eén rit. Daarna gaat de batch van 23-08 dicht.**

Rijd met bulk-recorder, caravan-tracker, rijmonitor en waakronde tegelijk aan —
anders toets je de PLLoad-ingreep niet. Testrun 3.6 stelt de vragen; loop ze af
en noteer per fix of hij groen of rood is.

Daarna: groene fixes verdwijnen uit dit document. Rode gaan in één naronde en
dan is de set klaar. Ze komen niet terug als nieuwe genummerde punten.

**Let op — de batch stond tot vanavond rood.** `test-plload.js` faalde op 6 van
17 toetsen door fix 11. Niet omdat de fix fout was, maar omdat het plantmodel
in de test `venGemMs` vastpinde op 105 ms: geijkt op de oude regeling, die
alleen naar bezetting keek. Met een vlakke responstijd bestaat er onder de
nieuwe voorwaarde per definitie geen tegendruk, dus zakte de regeling in het
model door tot MIN bij 100% bezetting. Het model beschreef geen bus meer.
Herzien en uitgebreid naar 20 toetsen; tegenproef gedaan (oude `||` terug =
4 toetsen rood). Evenwicht in het model nu mult ~5 bij 81% bezetting.

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

**Demo-knop op het loginscherm.** Nog open, bewust niet blind gerepareerd.
Twee dingen die niet samen kunnen: de Engelse tekst is er met opzet. Het
commentaar erboven in `index.html` zegt dat de Play-reviewnotitie letterlijk
"Try demo — no adapter needed" belooft en dat wat de reviewer leest en ziet
woordelijk moet kloppen. Vertalen naar Nederlands breekt dus de reviewbelofte
die Play-blokkade 3 moest wegnemen.

Wat overblijft is opmaak: de knop loopt over twee regels en `.lg-foot` botst
ertegenaan. Dat zit in `pidlane.css` (`.ov#loginOv .mact` en `.ov#loginOv
.lg-foot`, beide `flex:0 0 auto` in een kolom die overloopt), niet in de HTML.
Zonder te kunnen zien hoe het rendert is dat gokken. Stuur een screenshot van
het loginscherm op je eigen toestel, dan is het één regel CSS.

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

- **Socket-stabiliteit.** 12 keer dood in 48 minuten op 23-08, met 107
  geweigerde verzoeken tijdens herinitialisatie. Een kwart van de sessie ging op
  aan herstellen. Kijk of fix 11 dit meebeweegt.
- **Blok 1 tegenproef.** Op 23-08 verscheen spontaan "Geen profiel onder
  pl_vinprof_… — volle discovery". De controle kán dus rood worden. Blijft over:
  nagaan of blok 1 dat óók als LET OP boekt, niet alleen de BT-log.
- **`0143` staat er 256x naast.** De parser rekent `A + B/256` waar
  `A x 256 + B` hoort (PIDLANE.md §11). Stond niet in dit document en zat dus
  in geen enkele batch. Na de rit de nieuwe logs nakijken; nog steeds fout, dan
  herfix + hertest en daarna dicht.
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
