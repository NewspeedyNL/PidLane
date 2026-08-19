# OVERDRACHT.md — sessie 15 t/m 19 augustus 2026

Wat er in deze sessies is gebeurd, wat er nu anders werkt, en waar de volgende
sessie begint. Voor de volgorde van het werk: `PLAN.md`. Voor hoe het systeem in
elkaar zit: `PIDLANE.md`.

---

## In één alinea

Er is deze week vooral gerepareerd wat er al kapot *stond zonder dat iemand het
kon zien*. Drie mechanismen bleken maandenlang dood terwijl ze in de
documentatie als afgerond stonden, en de oorzaak was steeds dezelfde: een
stille `catch` die de fout opat. Daarna is de diagnosekant van de app
teruggebracht van zes losse pagina's naar één testrun, en die testrun heeft
meteen een echte oorzaak gevonden die drie ritten lang onopgemerkt bleef.

---

## Wat er nu anders werkt

**De ELM-poort** (`pidlane-bt.js`). Tijdens een herinitialisatie van de ELM327
weigeren `sendCmd` en `sendBT` al het overige busverkeer. Het bestaande busslot
was adviserend — het werkte alleen voor code die netjes `PLBus.claim()` deed —
en liet drie gaten open. Bewezen in het veld op 16-08: socket dood om 10:53:27,
27 polls geweigerd, schone herinitialisatie, om 10:53:37 weer geldige data. Nul
vervuilde metingen, waar het daarvoor ~10 seconden rommel per dip was.

**Ronde 5 is eindelijk bedraad** (`pidlane-pids.js`, `pidlane-pidgate.js`).
`updPID()` riep `_noteMap()` noch `plHerijkTick()` aan, `purgeImplausiblePids()`
bestond niet meer, en `rebuildPidDefsCache()` heeft nooit bestaan. Alle drie
verstopt in stille catches. Nu bedraad en aantoonbaar levend: 307 ticks en 2
herijkingen in een run van 18-08.

**De bedradingscontrole** (`pidlane-bedrading.js` + `test-bedrading.js`). Eén
lijst met de functies die modules van elkaar verwachten, afgeleid uit élke
`typeof X === 'function'`-guard. Runtime meldt wat ontbreekt; de test bewaakt
twee kanten: elke naam moet bestaan, en elke guard moet geregistreerd zijn.

**De testrun** (`pidlane-testrun.js`). Vervangt busdiagnose, zelftest, opdracht,
diagnosebundel-UI, logscherm en copiloot. Eén admin-knop, zes blokken, één
logboek. Blok 5 toetst wat er in de laatste update veranderd is (toegevoegd
*en* verwijderd); `CAMPAGNE` onderaan het bestand stelt de vragen die die run
moet beantwoorden. **Herschrijf `CAMPAGNE` en `_blok5()` bij elke oplevering.**

**Opslaan met keuze** (`pidlane-export.js`). Elke log- en rapportknop vraagt
eerst tekst of PDF. De PDF gebruikt de huisstijl van het AI-rapport.

**Het profiel wordt tegen de ECU gehouden** (`pidlane-rijsituatie.js`).
`profielTegenSteunbits()` leest bij een snelle start alsnog `0100/0120/0140/0160`
en gooit eruit wat de ECU ontkent. Dit was de laatste vondst van 18-08 en is
**nog niet op de weg bevestigd**.

**Testrun 1.7: twee sondes die vooruitlopen op punt 2 en 4** (19-08,
`pidlane-testrun.js`). Beide veranderen niets aan het gedrag; ze verzamelen het
bewijs waarmee die sessies moeten beginnen.

*Blok 7 — pollbudget.* `PLBudget` bemonstert `PLBus.stats()` en `PLLoad.staat()`
elke twee seconden in een ring van een uur, vanaf het laden en de hele rit door.
Het telt de remmomenten waarbij er 0% fouten waren én de responstijd niet opliep
tegenover de mediaan van de 30 s ervoor. Dat aantal ís de vraag van punt 2.
`PLLoad` wordt niet gewrapt en niet aangeraakt: de genomen beslissing wordt
gereconstrueerd uit `PLLoad.cfg`, dus als sessie 2 de drempels verzet meet het
blok automatisch tegen de nieuwe. Reden voor een eigen sampler: `PLLoad` logt pas
bij een stap van 0,2 en de spiraal bestaat juist uit stapjes van 0,03.

*Blok 8 — olietemperatuur.* Vraagt `2101`, `22111F` en `015C` op, herkent een
negatief ECU-antwoord (`7F 22 31`) apart van NO DATA, en rekent A−40 én A−50 uit
tegen het koelwater als plausibiliteitsanker. Zet tijdelijk header `7E0` en
herstelt naar `7DF` in een `finally`.

Knop "Budget + olie" draait alleen deze twee. Doe die vóór de sweep: de sweep
jaagt de bezetting naar 100% en vervuilt het spoor.

**Termux op de telefoon.** Node draait nu op het toestel; `plcheck.sh` in de
repo-root doet syntaxcontrole, alle tests, div-balans en scripttag-controle.
Draai dat vóór elke commit.

---

## Waar de volgende sessie begint

1. **Bevestigen dat de steunbitfix werkt.** Verbinden met de CX-5 en kijken of
   er "7 sensoren verwijderd die deze auto niet ondersteunt" in het log staat,
   daarna testrun 1.7 draaien: blok 6 moet nu 0 ontkende PIDs melden. Staat er
   nog iets, dan is het profiel niet opnieuw weggeschreven en komt de fout elke
   sessie terug.
   Neem in dezelfde rit blok 7 en 8 mee — die vragen tien minuten rijden vooraf
   en een warme motor, dus start de run niet meteen na het instappen.
2. **Sessie A uit `PLAN.md`** — het pollbudget dat terugschroeft op bezetting
   zonder fouten. Begin niet zonder het getal uit blok 7.
3. **Sessie C** — mag de gate een sensor opruimen die herhaald zwijgt terwijl de
   ECU hem wél belooft. Blijft nodig als vangnet naast de steunbitcontrole.

---

## Wat je moet weten om hier niet in te trappen

**Broncode-inspectie werkt niet in deze codebase.** `pidlane-remote.js` vervangt
`updPID`, `sendCmd`, `ensurePIDListActive`, `selectCategoryPIDs` en
`realScanDTC` door wrappers die het origineel in een closure houden. Wie
`String(window.updPID)` doorzoekt leest de wrapper. Meet gedrag: daarvoor zijn
`PLGate.stats()` en `PLElm.poortDicht()` toegevoegd.

**Een statische definitie is geen globale beschikbaarheid.** `openShare` staat
in de bron maar lokaal in een IIFE. De statische test zag hem, de runtime niet.
De runtime-controle is de autoriteit.

**Een taakomschrijving is geen bron.** `PLAN.md` punt 4 zei "mode 22 PID `2101`,
al gedefinieerd maar nergens opgevraagd". Allebei fout: `2101` is in dit project
mode 21 PID 01 (een mode-22 identifier is twee bytes en past niet in de
vier-tekens-sleutel — zie de kop van `pidlane-uitgebreid.js`), en
`pidlane-bt.js:1691` roept `probeUitgebreid()` al aan na het verbinden. In een
stille catch, dus als dat faalt zie je niets — daarom kon de regel maandenlang
blijven staan. Wie punt 4 op de tekst was begonnen had een tweede pad gebouwd
naast een bestaand pad dat niemand had gemeten. Lees de module vóór je de taak
gelooft, ook als je de taak zelf hebt opgeschreven.

**Een guard op een lokale naam is geen bedradingspunt.** `KRITIEK` in
`pidlane-bedrading.js` is afgeleid uit álle `typeof X === 'function'`-guards, en
daar zitten er een paar tussen die naar een lokale variabele wijzen (`_oz` in
waakronde, `onAnnuleer` als parameter). Die horen in `GEEN_GLOBALE`, mét reden —
niet zomaar geschrapt, anders komen ze bij de volgende afleiding terug.

**Een controle die vals alarm slaat is erger dan geen controle.** De eerste
dode-knoppencontrole meldde 27 werkende knoppen als kapot omdat hij
`PLRemote.openShare()` afknipte tot `openShare`. Zulke meldingen leer je binnen
een week negeren, en dan mis je de echte. `test-dodeknoppen.js` bewaakt beide
kanten.

**626 van de 948 try-blokken zijn stille catches.** Dat is hoe alle drie de
dode mechanismen konden blijven bestaan. Werkregel: een `catch` mag stil zijn
bij een verwachte fout (localStorage vol, DOM-element weg), nooit rond een
aanroep van eigen code. Ruim op per module, telkens als je er toch bent.

**Lees een bestand vóór je het opent om te schrijven.** In deze sessie is
`pidlane-testrun.js` een keer leeggelopen door `open(p,'w')` vóór de read.
Teruggehaald uit de laatste gecontroleerde zip.

---

## Openstaand, zonder haast

- De negatieve ontstekingstiming van 16-08 (−11,5° t/m −21,5°) is in drie runs
  en ruim veertig ruwe metingen niet teruggekeerd. `parsePID()` bewaart nu de
  ruwe bytes en de let-op-melding zet ze erbij, dus mocht het terugkomen dan
  staat het antwoord in het log.
- Vier BT-herverbindingen in twaalf minuten op 16-08, telkens gevolgd door
  "scherm blijft aan". Vermoeden: Android duwt de WebView naar de achtergrond
  en neemt de socket mee. Niet onderzocht.
- `vehicleInfo` was op 17-08 half gevuld (alleen "Mazda") en op 18-08 compleet.
  Oorzaak onbekend; de testrun meldt nu welke velden ontbreken.
- `pidlane-scheduler.js` heet verkeerd: de echte scheduler zit in
  `pidlane-plload.js`.
- Snap-on-patentfamilie juridisch laten nakijken vóór de referentie-opslag.
