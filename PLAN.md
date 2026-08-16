# PLAN.md — wat er nog open staat

Bijgewerkt: 15-08-2026, na de bedradingssweep.

Dit bestand is het werkplan over sessies heen. `PIDLANE.md` beschrijft hoe het
systeem in elkaar zit, `OVERDRACHT.md` wat er in één sessie gebeurd is, dit
bestand wat er nog moet gebeuren en in welke volgorde.

**Werkwijze per sessie**

1. Kijk hier welke sessie aan de beurt is. Eén sessie = één taak.
2. Upload de repo als zip. Alleen de modules openen die de taak raakt
   (`PIDLANE.md` §4 heeft de tabel).
3. Vóór elke oplevering: `node --check` op elk gewijzigd JS-bestand, en de
   volledige testsuite (`for t in test-*.js; do node $t; done`, alle exit 0).
4. Na afloop: hier afvinken, nieuwe bevindingen toevoegen, `PIDLANE.md`
   bijwerken als de architectuur geraakt is.

---

## Rit van 16-08-2026 — uitkomst

- **ELM-poort werkt.** Socket dood om 10:53:27, poort direct dicht, 27 polls
  geweigerd, schone herinitialisatie, poort open om 10:53:37 en meteen geldige
  data. Nul vervuilde metingen tegenover ~10 s rommel per dip daarvoor.
- **Herijking draaide** bij protocoldetectie en meldde terecht "geen wijziging":
  de boost-PIDs stonden niet in de actieve lijst, dus er viel niets weg te
  halen. Geen tegels verdwenen.
- **`brandstof:?` in het log was cosmetisch** — het veld stond wél goed; de
  logregel las uit de verkeerde RDW-tabel. Gerepareerd.
- **`_oz` gemeld door de bedradingscontrole**: vals alarm, lokale const in
  waakronde. In `GEEN_GLOBALE` gezet, mét reden.
- **Open: vier herverbindingen in twaalf minuten.** Telkens gevolgd door
  "scherm blijft aan". Vermoeden: Android duwt de WebView naar de achtergrond
  en neemt de BT-socket mee. Nog niet onderzocht.
- **Open: ontstekingstiming.** Vijf meldingen tussen −11.5° en −21.5°, maar het
  BT-log is een rolbuffer van 300 regels en die momenten waren eruit. In de
  bewaarde vensters ligt 010E tussen −4.5° en +9.5°. Niet te zeggen of dit
  echte klopregeling/katalysatoropwarming was of een verkeerd gesplitste batch.
  `parsePID()` bewaart nu de ruwe respons per PID en de let-op-melding zet die
  erbij — volgende keer staat het antwoord in het log.

---

## Nu eerst: één rit rijden

**Sessie 1 — verificatierit (geen code)**

De bedradingsfix van 15-08 heeft slapend gedrag geactiveerd. Dat moet je zien
vóór je verder bouwt, want alles daarna staat erop.

Waar je op let tijdens en na de rit:

- Verdwijnen er tegels die er altijd stonden? Op de CX-5 horen de boost-PIDs
  (`0170`, `2102`, `0187`) weg te vallen zodra er tien MAP-metingen ≥ 85 kPa
  bij draaiende motor zijn geweest en de piek onder 106 kPa bleef. Dat is een
  atmosferische motor die correct als atmosferisch herkend wordt — de eerste
  keer dat die detectie überhaupt draait.
- Staat er `herijking` in het log bij protocoldetectie en bij het binnenkomen
  van het RDW-brandstoftype? Dat zijn de twee plekken die eerder stil faalden.
- Meldt de bedradingscontrole iets? Zo ja: naam noteren, dat is een echte
  ontbrekende functie.
- Bij een socket-dip: staan er `geweigerd: ELM-herinitialisatie bezig`-regels in
  het log, en is de rommelperiode weg?

Neem de diagnosebundel mee terug. Valt de herijking vervelend uit, dan is die
ene commit los terug te draaien — de rest van de levering hangt er niet aan.

**Sessie 2 — mode 22, PID `2101` (motorolietemperatuur)**

Kort en zelfstandig, goed om onderweg te doen. `015C` beantwoordt deze CX-5
niet (stil weggelaten uit het multi-PID-antwoord, bewezen in het log van 15-08).
De Mazda-route is mode 22 PID `2101`, al gedefinieerd in `pidlane-data.js:220`
maar nergens opgevraagd. `pidlane-uitgebreid.js` heeft het mode-22-pad al.
Raakt: `pidlane-uitgebreid.js`, mogelijk `pidlane-data.js`.

---

## Daarna: de stille catches

Dit is de eigenlijke uitkomst van de sweep. 626 van de 948 `try`-blokken gooien
hun fout weg zonder spoor; dat is hoe ronde 5 maanden dood kon zijn zonder dat
iemand het zag.

**De regel:** een `catch` mag stil zijn als je de fout verwacht (localStorage
vol, DOM-element weg, JSON van een gebruiker). Nooit rond een aanroep van eigen
code — daar hoort minimaal een `btDiag(..., 'warn')` in.

Niet in één sessie te doen, en ook niet als aparte klus de moeite waard. Doe het
per module, telkens als je er tóch bent. Wél gericht beginnen bij de modules
waar een stille fout het meest kost:

**Sessie 3 —** `pidlane-pidgate.js` en `pidlane-pids.js` (de PID-filtering; hier
ging het drie keer mis).
**Sessie 4 —** `pidlane-bt.js` (45 stille catches in de transportlaag).
**Sessie 5 —** `pidlane-plload.js` en `pidlane-data.js` (de regelkringen).

Per sessie: elke `catch` langslopen, verwachte fouten met een korte reden
markeren, de rest van een melding voorzien. Puur mechanisch, geen gedrag
wijzigen. Nieuwe `typeof`-guards die je tegenkomt registreren in `KRITIEK`
(`pidlane-bedrading.js`) — `test-bedrading.js` dwingt dat af.

---

## Verspreide logica samentrekken

Zelfde soort probleem als de PID-gate vóór ronde 1: dezelfde regel op veel
plekken, dus elke fix raakt er één.

**Sessie 6 — responsontleding.** Acht modules pakken zelf een `41`-header uit
(`pidlane-bt.js`, `-diagbundel`, `-graph`, `-monitor`, `-uitgebreid`,
`-veldlab`, `-verify`, `-waakronde`) in plaats van `splitBatchResponse()` te
gebruiken. Daardoor profiteert de helft niet van `PLPidLen`. Eerst inventariseren
wat elk van die acht precies anders doet, pas dan samentrekken — mechanisch en
gedragsneutraal, met een test die de oude en nieuwe uitkomst op echte
logregels vergelijkt.

**Sessie 7 — worker-ingang.** Elf modules doen hun eigen `fetch`. Eén
`plFetch(pad, opties)` met foutafhandeling, tegoedcontrole en logging op één
plek. Raakt veel bestanden, dus strikt mechanisch en in twee stappen: eerst de
helper erbij en één module erdoorheen, daarna de rest.

**Sessie 8 — `merkGroep()`-asymmetrie.** `MINI` matcht op prefix, `BMW` op
gelijkheid. Al gedocumenteerd, raakt de DTC-lookup (§14). Klein, maar apart
houden omdat het gedrag verandert.

---

## Opruimen en afmaken

**Sessie 9 — `pidlane-scheduler.js` heet verkeerd.** De echte scheduler
(`PLSched`, `pidPollInterval`, `pidsDueNow`) zit in `pidlane-plload.js`; wat in
`scheduler.js` staat is motortype-splitsing en EV-modus. Hernoemen naar
`pidlane-motortype.js` of de inhoud samenvoegen. Puur naamgeving, geen kapotte
code — maar het kost elke keer dat je erin duikt tien minuten.

**Sessie 10 — `renderGauges()`-vangnet.** Verwijderen zodra uit de logs blijkt
dat de zeef daar nooit meer iets tegenhoudt. Kan pas na een paar ritten met de
geactiveerde herijking, want die verandert precies wat er langskomt.

**Sessie 11 — ~~bulk-recorder aanhaken~~ GEDAAN (15-08).** Scripttag en
kebab-knop staan erin. Bij het aanhaken bleek de module zonder start volledig
inert: het interval van 1 s doet niets zonder lopende opname, en de
herstelpoging na 3 s slaat aan op een sessie in `localStorage` die er nooit is
geweest. Er was dus geen reden om te wachten. Airtable-flushing blijft buiten
scope. **Nog wél te doen:** een echte opname over een hele rit, om te zien wat
IndexedDB doet aan groei en wat het met de accu kost.

**Sessie 12 — mode 06 in `pidlane-veldlab.js`** plus de bijbehorende
`PIDLANE.md`-update. Al een keer uitgesteld.

---

## Meten in het veld (geen sessie, maar meenemen)

Drie dingen die alleen uit echte ritten kunnen komen:

- Hoe vaak vuurt het `renderGauges()`-vangnet nog? (voorwaarde voor sessie 10)
- Turbo-detectie op een auto mét laaddruk-PIDs. Nu de detectie eindelijk leeft,
  is dit voor het eerst een zinnige test.
- Echte merkstrings uit RDW-data, om ronde 9 te valideren.

En een nieuwe, uit de aanslag-episode van augustus: **ontstekingsvervroeging
(`010E`) uitgezet tegen belasting (`0104`/`010B`), als mediaan per rit en als
trend over ritten.** Een motor die stil vermogen inlevert door koolstofaanslag
tekent zich daar af als een langzaam zakkende lijn, terwijl elke losse waarde
netjes binnen bereik blijft en er geen enkele DTC staat. Dat is precies de
bevinding waar een garage voor betaald krijgt — klant komt binnen met "hij trekt
niet meer" en het foutgeheugen is leeg. Vraagt wel dat de bulk-recorder over
ritten heen bewaart, dus na sessie 11.

---

## Buiten de techniek

- **Snap-on-patentfamilie** (gelijkenis met de referentie-opslag) — juridisch
  laten nakijken vóórdat je erop doorbouwt.
