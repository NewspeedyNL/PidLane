# PidLane — het verbindprofiel: elke auto goed, zonder merkenlijst

Versie 0.1 — 03-10-2026 — **ontwerp, nog niet gebouwd**

> Antwoord op #388 en #389. Er staat geen code in en er verandert nog niets aan
> de app. Dit is bedoeld om eerst te lezen en te bekritiseren.

De vraag uit #389 is niet "hoe maak ik de T6 ook goed" maar: **hoe krijgt élke
auto de juiste taal, de juiste snelheid en de juiste verwerking, ook een auto
die nooit iemand gemeten heeft.** Dat is een andere vraag, en hij heeft een
ander antwoord dan een tabel met merken.

---

## 1. Wat er in #388 en #389 niet klopt

Die twee issues zijn door een taalmodel geschreven dat de repo niet gedraaid
heeft. De richting is goed, de diagnose niet. Dat moet eerst van tafel, want
het voorgestelde ontwerp lost een probleem op dat er niet is en laat het
probleem staan dat er wél is.

**"De app heeft één universeel tempo en geen fabrikant-check."** Onwaar. De
regelkringen staan er al en meten al:

| mechanisme | waar | wat het doet |
|---|---|---|
| adaptieve groepsgrootte 3→2→1 | `pidlane-plload.js:745-760`, `_groepTel` op `:1025` | krimpt op onvolledige antwoorden, klimt na 25 schone rondes |
| batch-uitval met herstel | `batchDip`/`batchOk`, `pidlane-plload.js:952-971` | zet multi-PID tijdelijk uit, probeert na 30 s opnieuw |
| onvolledig-oordeel per groep | `plGroepOordeel`, `pidlane-plload.js:990` | onderscheidt "deze auto heeft die PID niet" van "dit antwoord miste er een" |
| antwoordcijfer-geheugen | `PLAntwoordtal`, `pidlane-plload.js:889` | leert per verzoek hoeveel frames er komen, met zelfcontrole en blokkade |
| batch alleen op CAN | `pidlane-plload.js:717-719` | niet-CAN gaat sequentieel |
| batch alleen op mode 01 | `pidlane-plload.js:737-743` | mode 21 gaat solo |
| bitmaps nooit batchen | `pidlane-plload.js:734` | gemeten op de CX-5 |
| protocolgeheugen | `pidlane-bt.js:1632-1680` | vergrendelt na herverbinden het eerder gevonden protocol |
| pollbudget | `PLLoad` | schaalt het tempo op gemeten busbezetting |

Een merktabel die `batchingAllowed`, `maxBatch` en `interPIDDelay` zet, schrijft
op dezelfde actuatoren als deze acht. Dan staan er twee regelaars op één knop,
en dat is precies wat `CLAUDE.md` onder *"Eén ding heeft één betekenis"* als
drie keer eerder een bug beschrijft. De ene zou krimpen op een meting, de
andere zou terugzetten op een tabelwaarde, en wie wint hangt af van de
volgorde van twee `await`s.

**"VIN → merk → timing" komt te laat.** De T6 gaat stuk tijdens de handshake.
De VIN is op dat moment nog niet gelezen: `initELM327()` (`pidlane-bt.js:1683`)
zet de ELM-basis, dan detecteert `scanNetworks()` (`:1879`) het protocol met
`0100`, en pas daarna leest `startDiscovery()` de VIN. Een profiel dat op de
VIN wacht, wacht tot ná het moment waarop het nodig was.

**"Mode 22 PIDs mappen op displaykaarten"** kan vandaag niet. De PID-sleutel is
vier tekens, mode plus één byte; `222005` is zes. Dat staat uitgelegd in
`pidlane-uitgebreid.js:37-49`, inclusief de meting van 19-08-2026 dat mode 22
op deze CX-5 op header 7E0 wél leeft (`7F 22 31` = identifier onbekend, service
ondersteund). De sleutelruimte verbreden is een eigen, grotere verandering —
niet een stap in een timing-fix.

**De handleiding in #389 is niet nagemeten.** Hij noemt
`vinInfo.vin = "JTHBP5C2XA5034656"` als "Mazda CX-5". `JTH` is Lexus. Hij noemt
`discoverPIDsBitmap()` en `initialHealthScan()` in `pidlane-rijsituatie.js` met
regelnummers en "huidige code" die er niet zo staat. Hij noemt een
`detectConnectionProfile()` die `window._connProfile` zet en dan drie plekken
die dat lezen — maar niet de plek waar het batchen echt gebeurt
(`pidlane-plload.js`, `_pollRonde`). De getallen (31,7 req/s, 25 ms, 78%) komen
uit jouw eigen testrun en zijn echt; de code eromheen is gegokt.

---

## 2. Wat er wél stukgaat op de T6

### 2.1 De ELM-timeout staat voor élke auto op 400 ms

```
pidlane-bt.js:1701   await _elmSend('ATAT1'); // Adaptive timing
pidlane-bt.js:1702   await _elmSend('ATST64');// 400ms timeout per commando
pidlane-data.js:525  window.ELM_BASELINE = ['ATE0','ATL0','ATS0','ATH0','ATAT1','ATST64'];
```

`ATST64` is 0x64 × 4 ms = 400 ms. Met `ATAT1` is dat het plafond waarbinnen de
adapter een antwoord moet zien; daarna geeft hij op en stuurt `NO DATA` of
niets. Op de CX-5 antwoordt de ECU in 25 ms — 400 ms is daar zestien keer de
marge en je merkt het nooit. Een verzoek dat bij een VAG via de gateway naar de
motor-ECU gerouteerd wordt, kan daar langs. Dan is het antwoord niet traag, het
is **weg**, en de app ziet een auto die zijn eigen PIDs niet ondersteunt.

Dit is één hexgetal, en het is de belangrijkste regel in dit document. Een
merktabel die `interPIDDelay: 30` zet, verandert hier niets aan: de pauze zit
aan onze kant, de limiet staat in de adapter.

### 2.2 Een leeg antwoord is bewijs van twee dingen tegelijk

Vier plekken lezen een lege buffer als mogelijk dode socket:

```
pidlane-bt.js:1107   write()-fout        → sppReconnectGuard(..., force)
pidlane-bt.js:1134   leeg in eventstand  → sppReconnectGuard(...)
pidlane-bt.js:1182   write()-fout (poll) → sppReconnectGuard(..., force)
pidlane-bt.js:1227   leeg in pollstand   → sppReconnectGuard(...)
```

De guard (`:1287`) is netjes: hij doet eerst een `isConnected`-controle, slaat
over tijdens een scan, en houdt 10 s afstand tussen twee pogingen. Op een auto
waar lege antwoorden zéldzaam zijn, is dat een goed vangnet. Op een auto waar
ze het *normale* gevolg van §2.1 zijn, is elk leeg antwoord een reden om de
socket te gaan betwijfelen.

### 2.3 En dan versterkt het zichzelf

Zodra er geherinitialiseerd wordt, gaat de harde ELM-poort dicht
(`_elmPoortDicht`, `pidlane-bt.js:788`) en weigert alles zonder doorlaatbewijs:

```
pidlane-bt.js:932    sendBT "<cmd>" geweigerd: ELM-herinitialisatie bezig  → return ''
pidlane-bt.js:1377   "<cmd>" geweigerd: ELM-herinitialisatie bezig         → return ''
```

Een geweigerd commando komt terug als `''`. Dat is dezelfde lege string als een
uitgebleven antwoord. De poll-lus kan dat verschil niet zien en boekt het als
een dip (`batchDip`, `pidlane-plload.js:779`); `PLAntwoordtal` kan het als een
onvolledig antwoord lezen. Jouw log uit #388 staat er letterlijk:

```
19:15:08 | Multi-PID leeg TX="01492" RX="" — dip
19:15:08 | "010C2" geweigerd: ELM-herinitialisatie bezig
19:15:08 | ELM-poort dicht (elm-init) — overig busverkeer wordt geweigerd
```

Dus: de ELM-poort staat dicht, het geweigerde `010C2` wordt geteld als een
mislukte batch, en de regelkringen krimpen op een meting die niet over de auto
ging maar over onze eigen poort. `_herstelNaProtocolLock()`
(`pidlane-plload.js:1056`) is er precies voor dit soort nasleep, maar hij wordt
alleen na een protocolvergrendeling aangeroepen, niet na een re-init.

Welk van de twee re-initpaden op de T6 aan de gang was — de guard op `:1352` of
een volledige verbindcascade (`:426`, `:543`, `:910`, `:2120`) — valt uit dit
fragment niet te zien; de guard logt eerst `Socket dood na "<cmd>"` en die
regel staat er niet. Dat is een vraag voor het volledige log, niet voor dit
ontwerp.

### 2.4 De regelkringen leren in de verkeerde richting

Alle acht mechanismen uit §1 beginnen optimistisch en zakken op fouten. De
prijs van zo'n fout is niet symmetrisch:

| de app leert dat… | kost op de CX-5 | kost op een strakke ECU |
|---|---|---|
| deze groep is te groot | 1 ronde | 1 ronde |
| dit antwoordcijfer is mis | 1 verzoek | 5 min blokkade (`ANTWOORDTAL_BLOK_MS`) |
| de bus is verzadigd | pollbudget omlaag | pollbudget tot 17% |
| het protocol klopt niet | — | `SEARCHING` tot 13 s per commando |
| de socket is dood | — | 3 pogingen + re-init, poort tot 15 s dicht |

Optimistisch beginnen is goedkoop als fouten milliseconden kosten en duur als
ze seconden kosten. Daarom gaat het op de ene auto goed en op de andere niet,
en daarom is het geen merkprobleem: het is een **richtingprobleem**.

---

## 3. Het ontwerp

Drie lagen. De regel die ze bij elkaar houdt: **meten beslist, kennis raadt,
geheugen versnelt.** Een merknaam mag nooit een actuator aanraken.

```
      ┌─ laag C: geraden ───────────────────────────────────────┐
      │ WMI/merk/adapter → startgok voor de proeven van laag A  │
      │ pseudonieme VIN → opgeslagen profiel van de vorige rit  │
      └────────────────────┬────────────────────────────────────┘
                           │ alleen als STARTWAARDE
      ┌─ laag A: gemeten ──▼────────────────────────────────────┐
      │ de koude poort: na de ELM-init, vóór de eerste poll     │
      │  A1 protocol + adressering   A3 batchproef              │
      │  A2 ST-kalibratie            A4 antwoordcijfer-proef    │
      │ levert: _verbindProfiel (gemeten getallen + marges)     │
      └────────────────────┬────────────────────────────────────┘
                           │ bodem, plafond en STARTPUNT
      ┌─ laag B: geregeld ─▼────────────────────────────────────┐
      │ de bestaande acht regelkringen — ongewijzigd van opzet, │
      │ maar ze beginnen op het gemeten punt en klimmen omhoog  │
      └─────────────────────────────────────────────────────────┘
```

### 3.1 Laag A — de koude poort

Eén keer per verbinding, na `initELM327()` en `scanNetworks()`, vóór de eerste
`_pollRonde()`. Hij mag een paar seconden kosten; hij verdient ze terug op de
eerste minuut.

**A1 — protocol en adressering.** Bestaat half: `ATDPN`/`ATDP` worden al
gelezen (`pidlane-bt.js:1911-1912`). Erbij: 11- of 29-bits uit het
protocolnummer, en of de bitmapreeks `0100/0120/0140/0160` solo antwoordt. Dat
laatste is de goedkoopste echte test of de taal klopt.

**A2 — ST-kalibratie.** Dit is de kern.

1. Zet `ATST` ruim open (`ATSTFF` = 1020 ms) en `ATAT1` aan.
2. Vraag acht keer een PID die in A1 bewezen antwoordde, solo, met `ATH1` zodat
   het antwoord te herkennen is.
3. Neem de hoogste van de acht (niet het gemiddelde — het plafond moet de
   uitschieter dekken, niet het midden).
4. Zet `ATST` op dat maximum × 2, afgerond omhoog, geklemd op 48…1020 ms.
5. Log het getal. Staat het boven ~200 ms, dan is dat de verklaring voor alles
   wat deze auto eerder "niet ondersteunde".

Resultaat op de CX-5: ~50 ms gemeten, `ATST` rond 0x19 — **sneller dan de
huidige 400 ms**, want een misser kost nu 100 ms in plaats van 400
(`pidlane-kaart.js:55-57` rekent dat al voor de foutcodescan uit). Resultaat op
een trage gateway: `ATST` boven de 400, en de PIDs komen binnen. Eén
mechanisme, beide auto's beter. Geen merknaam nodig.

**A3 — batchproef.** Neem twee PIDs die in A1 solo antwoordden. Vraag ze als
groep van 2; beoordeel met `plGroepOordeel()`, die al bestaat en al het goede
onderscheid maakt. Lukt dat, probeer 3. Dat bepaalt het **startpunt** van
`PLBus.batchGroep()` in plaats van de huidige optimistische 3. Op de CX-5 komt
er 3 uit en verandert er niets. Op de T6 komt er 1 of 2 uit en wordt de eerste
minuut geen stormvloed van dips.

**A4 — antwoordcijfer-proef.** `PLAntwoordtal` leert nu ín het echte werk, en
een misser kost vijf minuten blokkade. Laat de proef van A3 het cijfer meteen
meelezen (`plFrames()`, `pidlane-plload.js:874`), dan begint het geheugen
gevuld in plaats van leeg.

**Wat A oplevert:**

```js
_verbindProfiel = {
  bron:      'gemeten' | 'geheugen' | 'gok',   // nooit 'merk'
  protocol:  { id:'A6', bits:11, bitmapSolo:true },
  st:        { gemetenMaxMs: 52, gezetHex:'1A', marge: 2 },
  groep:     { start: 3, plafond: 3 },
  cijfer:    { '010C0D11': 1 },
  gemetenOp: 1759500000000
}
```

Elk veld draagt waar het vandaan komt. Een veld met `bron:'gok'` mag door laag
B meteen overschreven worden; een gemeten veld is het startpunt én het plafond.

### 3.2 Laag B — de regelkringen houden het gezag

Wat verandert: niet de mechanismen, alleen hun **beginstand en richting**.

- `PLBus.batchGroep()` start op `profiel.groep.start` in plaats van 3, en
  klimt niet boven `profiel.groep.plafond`.
- `batchDip()` en `_groepTel()` blijven precies zoals ze zijn. Ze mogen altijd
  omlaag; dat is een meting en die wint.
- `PLAntwoordtal` begint gevuld uit A4, met dezelfde zelfcontrole en blokkade.
- `ATST` wordt niet meer door de baseline teruggezet op `ST64` maar op de
  gekalibreerde waarde. `ELM_BASELINE` (`pidlane-data.js:525`) wordt daarmee
  per verbinding opgebouwd in plaats van constant — en de rollback in
  `pidlane-btflow.js` valt terug op het gekalibreerde profiel, niet op 400 ms.

Geen nieuwe regelaar, geen tweede eigenaar van een knop.

### 3.3 Laag C — kennis en geheugen, strikt ondergeschikt

**Het geheugen is wat "altijd goed" schaalbaar maakt.** Sla het profiel op
onder de **pseudonieme** VIN — `_vlVinPseudoniem()`, `SHA-256(zout + VIN)`,
eerste 16 hextekens, zoals `pidlane-garage.js:36-44` het al doet. De ruwe VIN
gaat nergens naartoe, ook niet naar `localStorage` als sleutel van dit profiel.

Dan geldt: de **eerste** verbinding met een onbekende auto kost een paar
seconden kalibratie. Elke volgende verbinding met diezelfde auto begint waar de
vorige eindigde. Dat is het antwoord op *"hoeveel verschillende manieren zijn
er"* uit #389: **dat hoef je niet te weten.** Je meet het één keer per auto en
je onthoudt het. Een merkenlijst is per definitie een lijst uitzonderingen en
is op de dag dat hij af is alweer incompleet; een meting die blijft staan is
dat niet.

Een opgeslagen profiel vervalt op drie dingen: een ander adaptertype, een
ander protocolnummer, of een profiel ouder dan een half jaar. Dan opnieuw
meten. En A2 blijft áltijd één steekproef doen, ook met geheugen: een auto die
koud anders reageert dan warm moet dat kunnen laten zien.

**Merkkennis is een gok die de proef korter maakt, en niets meer.** Een WMI mag
A3 laten beginnen op 2 in plaats van 1, of A2 laten starten met een ruimer
`ATST`. Weigert de proef die gok, dan telt de proef. Daarmee is een foute of
verouderde tabelregel een vertraging van een halve seconde en nooit een kapotte
verbinding — en dat is de hele reden om het zo te bouwen.

---

## 4. Externe bronnen — wat ze kunnen en wat niet

#389 stelt voor merk→protocol-kennis uit andere repo's te halen. Dat is nuttig,
maar voor twee verschillende dingen, en maar één ervan is dit ontwerp.

| waarvoor | nut | hoe het binnenkomt |
|---|---|---|
| timing/batching per merk | **gering.** Een gok die A2/A3 een halve seconde scheelt. Nooit een actuatorwaarde. | laag C, als startwaarde |
| mode-22 identifiers per merk (olietemp, laaddruk, DPF) | **groot.** Dit is kennis die je niet kunt meten, alleen opzoeken. | een eigen traject, na §5 fase 4 |
| DTC-teksten per fabrikant | los van dit ontwerp | — |

Wat ik gevonden heb als *leads*, niet als gecontroleerde bronnen:
[obd2-elm327-pid-reference](https://github.com/evrenonur/obd2-elm327-pid-reference)
(MIT, claimt ~1018 PIDs waarvan ~142 mode-22 DID's over 25+ merken) en
[ScanYourCar](https://github.com/slafi/ScanYourCar). Ik heb de inhoud daarvan
niet nagemeten; de licentie en de herkomst van de schaalformules moeten eerst
nagekeken worden.

**De poort waardoor zulke data binnenkomt, staat er al.** `UITGEBREID_DEFS` in
`pidlane-uitgebreid.js` zet ongeijkte definities op `onzeker:true` en
`cat:'Overig'`, waarna `pidGate('duidbaar')` ze buiten rapporten en AI-analyse
houdt tot iemand ze op een echte auto geijkt heeft. Een geïmporteerde tabel
komt via diezelfde deur binnen: gepollt en gelogd, maar nooit getoond als
waarheid. Dat is `CLAUDE.md`'s *"niets live zetten wat niet getoetst is"*,
toegepast op data in plaats van op code.

---

## 5. Fasering

Elke fase is een eigen PR met een eigen onderwerp, en elke fase staat op
zichzelf: breek je af na fase 1, dan is de app al beter.

| fase | wat | waarom hier | toetsing |
|---|---|---|---|
| **1** | leeg antwoord ≠ dode socket: geef een geweigerd commando een eigen uitkomst terug, zodat `batchDip`/`PLAntwoordtal`/de guard het niet als busmeting tellen | de versterking uit §2.3 weg; kleinste diff, grootste effect op het log | `test-*` op de poortuitkomst + mutatie in `plmutate.sh` |
| **2** | A2, de ST-kalibratie, en `ELM_BASELINE` per verbinding | §2.1; maakt de CX-5 sneller en de T6 mogelijk werkend | `bproef-*` met een nep-adapter die traag antwoordt; tegenproef: kalibratie uit → de trage auto valt weer uit |
| **3** | A1/A3/A4 en `_verbindProfiel` als startpunt van laag B | richting omgedraaid (§2.4) | `bproef-*` op de opstartvolgorde; `test-*` op het profielobject |
| **4** | laag C: profiel onthouden onder pseudonieme VIN, met vervalregels | maakt het schaalbaar | `test-*` op vervallen + `test-vinlek`-stijl proef dat de ruwe VIN er niet in zit |
| **5** | merkkennis als gok, één merk per keer, met de meting die altijd wint | pas nuttig als 1-4 staan | mutatie: foute tabelregel mag de verbinding niet breken |
| **6** | mode 22 pollbaar: sleutelruimte verbreden, dan pas identifiers importeren | eigen onderwerp, eigen risico | — |

**Wat hiervan een rit nodig heeft, en waarom.** Fase 1 t/m 4 zijn
browserproeven: een nep-adapter die traag antwoordt, die weigert, die twee van
drie PIDs teruggeeft, is precies wat `plbrowser.sh` kan maken — de nep-adapter
vervangt `_sendBTOnce()` en alles erboven blijft echte code. Wat een echte
gateway-ECU doet onder belasting is dat niet: dat is de ene vraag die naar
`CAMPAGNE` gaat, en dan met deze twee metingen als uitkomst:

- de gekalibreerde `ATST` op de T6 — het getal uit A2, en of de PIDs die
  "niet ondersteund" leken dan binnenkomen;
- de gekalibreerde `ATST` op de CX-5 — of de 31,7 req/s staan blijft of hoger
  wordt.

---

## 6. Wat dit ontwerp niet oplost

- **Een auto die een PID écht niet heeft.** Geen timing, geen tabel en geen
  kalibratie maakt een sensor die er niet is zichtbaar. De T6 heeft zijn
  olietemperatuur op mode 22; dat is fase 6, niet fase 2.
- **De belofte "altijd goed".** Wat dit garandeert is iets smaller en iets
  eerlijker: de app **meet** wat deze auto en deze adapter aankunnen vóórdat
  hij er een tempo op zet, en hij onthoudt dat per auto. Dat sluit een
  categorie fouten uit — een auto die stukgaat op een getal dat voor een andere
  auto gekozen is. Het sluit niet uit dat een protocol of een ECU iets doet wat
  hier niemand verwacht heeft.
- **Non-CAN.** K-lijn (ISO 9141, KWP2000) heeft eigen keep-alives (`ATPC`,
  `pidlane-bt.js:941`) en eigen timing. A2 werkt er in principe, A3 niet
  (batch is CAN-only, dat is al goed geregeld). Ongemeten.

---

## 7. Versiehistorie

| datum | versie | wat |
|---|---|---|
| 03-10-2026 | 0.1 | eerste ontwerp, als antwoord op #388/#389 |
