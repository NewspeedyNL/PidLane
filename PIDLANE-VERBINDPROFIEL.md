# PidLane — het verbindprofiel: elke auto goed, zonder merkenlijst

Versie 0.3 — 06-10-2026 — **fase 1–5 gebouwd** (PR #390, 03-10-2026), fase 6 open

> Antwoord op #388 en #389. §1–§8 zijn het plan zoals het in 0.2 stond; dat
> blijft staan, want de afweging is meer waard dan alleen de uitkomst. Wat er
> bij de bouw anders werd, staat in **§10**. Lees die eerst als je wilt weten
> wat er nu in de app zit.

De vraag uit #389 is niet "hoe maak ik de T6 ook goed" maar: **hoe krijgt élke
auto de juiste taal, de juiste snelheid en de juiste verwerking, ook een auto
die nooit iemand gemeten heeft.** Dat is een andere vraag, en hij heeft een
ander antwoord dan een tabel met merken.

**Inhoud.** §1 wat er in #388/#389 niet klopt · §2 wat er wél stukgaat op de T6
· §3 de inventaris: acht regelaars die er al staan · §4 het ontwerp in drie
lagen · §5 de genomen keuzes, met de afweging · §6 de zes fases · §7 het
vangnet dat de Mazda beschermt · §8 wat dit niet oplost

---

## 1. Wat er in #388 en #389 niet klopt

Die twee issues zijn door een taalmodel geschreven dat de repo niet gedraaid
heeft. De richting is goed, de diagnose niet. Dat moet eerst van tafel, want
het voorgestelde ontwerp lost een probleem op dat er niet is en laat het
probleem staan dat er wél is.

**"De app heeft één universeel tempo en geen fabrikant-check."** Onwaar — zie
de inventaris in §3. Er staan acht regelaars, en zeven ervan meten al.

**"VIN → merk → timing" komt te laat.** De T6 gaat stuk tijdens de handshake.
De VIN is op dat moment nog niet gelezen: `initELM327()`
(`pidlane-bt.js:1683`) zet de ELM-basis, `startDiscovery()` (`:2101`) zet het
protocol, en pas daarná komt `tryReadVIN()`. Een profiel dat op de VIN wacht,
wacht tot ná het moment waarop het nodig was. Zie de volgorde in §4.0.

**"Mode 22 PIDs mappen op displaykaarten"** kan vandaag niet. De PID-sleutel is
vier tekens, mode plus één byte; `222005` is zes. Dat staat uitgelegd in
`pidlane-uitgebreid.js:37-49`, inclusief de meting van 19-08-2026 dat mode 22
op deze CX-5 op header 7E0 wél leeft (`7F 22 31` = identifier onbekend, service
ondersteund). De sleutelruimte verbreden is een eigen, grotere verandering —
fase 6, niet een stap in een timing-fix.

**De handleiding in #389 is niet nagemeten.** Hij noemt
`vinInfo.vin = "JTHBP5C2XA5034656"` als "Mazda CX-5". `JTH` is Lexus. Hij
citeert "huidige code" in `pidlane-rijsituatie.js` die daar niet zo staat, en
mist de plek waar het batchen echt gebeurt (`_pollRonde` in
`pidlane-plload.js`). De meetgetallen erin (31,7 req/s, 25 ms, 78%
busbezetting) komen uit een echte testrun en zijn wél bruikbaar.

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
niets. Op de CX-5 antwoordt de ECU in 25 ms — zestien keer de marge, je merkt
het nooit. Een verzoek dat bij een VAG via de gateway naar de motor-ECU
gerouteerd wordt, kan daar langs. Dan is het antwoord niet traag, het is
**weg**, en de app ziet een auto die zijn eigen PIDs niet ondersteunt.

Dit is één hexgetal, en het is de belangrijkste regel in dit document. Een
merktabel die `interPIDDelay: 30` zet, verandert hier niets aan: die pauze zit
aan onze kant, de limiet staat in de adapter.

### 2.2 Een leeg antwoord is bewijs van twee dingen tegelijk

Vier plekken lezen een lege buffer als mogelijk dode socket:

```
pidlane-bt.js:1107   write()-fout        → sppReconnectGuard(..., force)
pidlane-bt.js:1134   leeg in eventstand  → sppReconnectGuard(...)
pidlane-bt.js:1182   write()-fout (poll) → sppReconnectGuard(..., force)
pidlane-bt.js:1227   leeg in pollstand   → sppReconnectGuard(...)
```

De guard (`:1287`) is netjes: `isConnected` eerst, uit tijdens een scan, 10 s
afstand tussen twee pogingen. Op een auto waar lege antwoorden zéldzaam zijn,
is dat een goed vangnet. Op een auto waar ze het *normale* gevolg van §2.1
zijn, is elk leeg antwoord een reden om de socket te gaan betwijfelen.

### 2.3 En dan versterkt het zichzelf

Zodra er geherinitialiseerd wordt, gaat de harde ELM-poort dicht
(`_elmPoortDicht`, `pidlane-bt.js:788`) en weigert alles zonder doorlaatbewijs:

```
pidlane-bt.js:932    sendBT "<cmd>" geweigerd: ELM-herinitialisatie bezig  → return ''
pidlane-bt.js:1377   "<cmd>" geweigerd: ELM-herinitialisatie bezig         → return ''
```

Een geweigerd commando komt terug als `''`. Dat is **dezelfde lege string als
een uitgebleven antwoord.** De poll-lus kan dat verschil niet zien en boekt het
als een dip (`batchDip`, `pidlane-plload.js:779`); `PLAntwoordtal` kan het als
een onvolledig antwoord lezen. Jouw log uit #388 staat er letterlijk:

```
19:15:08 | Multi-PID leeg TX="01492" RX="" — dip
19:15:08 | "010C2" geweigerd: ELM-herinitialisatie bezig
19:15:08 | ELM-poort dicht (elm-init) — overig busverkeer wordt geweigerd
```

Dus: de poort staat dicht, het geweigerde `010C2` wordt geteld als mislukte
batch, en de regelkringen krimpen op een meting die niet over de auto ging maar
over onze eigen poort. `_herstelNaProtocolLock()` (`pidlane-plload.js:1056`) is
precies voor zulke nasleep gemaakt, maar wordt alleen na een
protocolvergrendeling aangeroepen, niet na een re-init.

Welk van de twee re-initpaden op de T6 liep — de guard (`:1352`) of een
volledige verbindcascade (`:426`, `:543`, `:910`, `:2120`) — valt uit dit
fragment niet te zien; de guard logt eerst `Socket dood na "<cmd>"` en die
regel staat er niet. Dat is een vraag voor het volledige log.

### 2.4 De regelkringen leren in de verkeerde richting

Alle regelaars uit §3 beginnen optimistisch en zakken op fouten. De prijs van
zo'n fout is niet symmetrisch:

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

## 3. De inventaris — wat er al staat, en wie welke knop bezit

Dit is het belangrijkste hoofdstuk voor de bouw. Een nieuwe regelaar op een
knop die al een eigenaar heeft, is de bug die `CLAUDE.md` onder *"Eén ding
heeft één betekenis"* als drie keer eerder beschrijft.

| # | knop (actuator) | eigenaar | waar | past zich aan? |
|---|---|---|---|---|
| 1 | groepsgrootte 1…3 | `PLBus.batchGroep()` | `pidlane-data.js:1440`, `:1658-1689` | ✅ `_groepTel` (`plload:1025`), `batchKleiner/Groter` |
| 2 | batch aan/uit | `window._batchSupported` | `plload:719`, `batchDip` `:952` | ✅ uit na 3 dips, terug na 30 s |
| 3 | antwoordcijfer per verzoek | `PLAntwoordtal` | `plload:889` | ✅ leert, herijkt elke 200×, blokkeert 5 min |
| 4 | pollbudget (busbezetting) | `PLLoad` | `pidlane-plload.js` | ✅ meet bezetting |
| 5 | poll-interval-multiplier | `_pollMult` via `applyStrategy()` | `bt:1526`, `STRATEGIE_INFO` `data:545` | ⚠️ eenmalig, uit `measureConnSpeed()` |
| 6 | protocol-id vergrendeling | `_onthoudProtocol`/`_bekendProtocolId` | `bt:1655-1680` | ✅ onthoudt, herdetecteert bij afwijking |
| 7 | SPP eventstand vs pollen | `_sppEventsUit()` | `bt:978-1010` | ✅ terug naar pollen na 3 time-outs |
| 8 | **`ATST` (ELM-timeout)** | **niemand** | `bt:1702`, `data:525` | ❌ **constant, 400 ms, elke auto** |

Plus de filters die bepalen *wat* er gebatcht wordt — die zijn goed en blijven:
`isCAN` (`plload:717`), `isMode01` (`:737`), `isBitmapPid` (`:734`).

**Twee dingen die hieruit volgen, en die het hele ontwerp bepalen:**

- **Knop 8 is het gat.** Zeven van de acht meten al. De achtste is een
  constante, en dat is precies de knop waar de T6 op stukloopt.
- **`measureConnSpeed()` bestaat al en meet al wat nodig is** (`bt:1483`): acht
  keer een solo-PID met het `'1'`-achtervoegsel, en `readsPerSec` daaruit is
  letterlijk waar jouw 31,7/s vandaan komt. Hij staat alleen op de verkeerde
  plek (aan het eind van `startDiscovery`, ná de gezondheidsscan), neemt het
  gemiddelde in plaats van het maximum, en voedt alleen knop 5. **De
  ST-kalibratie is dus geen nieuwe functie maar een verplaatsing en uitbreiding
  van een bestaande.** Dat is de goedkoopste en veiligste vorm die dit ontwerp
  kan hebben.

En het profiel per voertuig bestaat ook al: `saveVinProfile()` /
`applyVinProfileIfKnown()` / `profielHealth()` (`pidlane-pids.js:1280-1322`),
met `supportedPIDs`, merk, model, brandstof en het gezondheidsoordeel erin,
onder `vinProfileKey(vin)`. Fase 4 is dus **een veld toevoegen aan een
bestaand profiel**, geen tweede opslag.

---

## 4. Het ontwerp

Drie lagen. De regel die ze bij elkaar houdt: **meten beslist, kennis raadt,
geheugen versnelt.** Een merknaam mag nooit een knop uit §3 aanraken.

### 4.0 De volgorde — waar de koude poort in de flow staat

```
kenteken (poort, bt:1881)
  → verbinden (SPP/BLE/WebSerial-cascade)
  → initELM327()            bt:1683   ATWS, ATE0/L0/S0/H0, ATAT1, ATST?? ← knop 8
  → scanNetworks()          bt:1879   ATSP0 → 0100 → ATDPN → vergrendelen
  → startDiscovery()        bt:2101   ATSP<id>
      ┌───────────────────────────────────────────────────────┐
      │ ⟨KOUDE POORT⟩  A1 taal · A2 ST · A3 groep · A4 cijfer │ ← NIEUW, fase 2+3
      └───────────────────────────────────────────────────────┘
  → tryReadVIN()                      VIN → merk/jaar
  → updateVehicleCard() + RDW         merk/model/brandstof
  → brandstofPoort()                  0151 of kenteken
  → bitmaps 0100/0120/0140/0160       welke PIDs bestaan
  → initialHealthScan()               welke PIDs leven echt
  → measureConnSpeed() → applyStrategy()   knop 5
  → saveVinProfile()                  profiel bewaren
  → pollen (_pollRonde, plload:690)
```

**De koude poort staat vóór de VIN, met opzet.** Alles ná `scanNetworks()` —
VIN lezen, bitmaps, gezondheidsscan — is al busverkeer dat op knop 8 stuk kan
gaan. Op de T6 is de VIN-uitlezing (`22F190`, mode 22!) juist een van de
zwaarste verzoeken van de hele flow. Kalibreren ná de VIN betekent kalibreren
ná de plek waar het nodig was.

**Dus: de VIN bepaalt niet de timing.** Hij doet drie andere dingen, en alle
drie staan er al of komen in fase 4/5:

1. sleutel waaronder het profiel bewaard wordt (`vinProfileKey`);
2. de merkgok voor de *volgende* verbinding (fase 5);
3. de PID-preset en de brandstofpoort (bestaat).

### 4.1 Laag A — de koude poort

Eén keer per verbinding. Hij mag een paar seconden kosten; hij verdient ze
terug binnen de eerste minuut.

**A1 — taal en adressering.** Bestaat half: `ATDPN`/`ATDP` worden al gelezen
(`bt:1911-1912`). Erbij: 11- of 29-bits uit het protocolnummer, en of de
bitmapreeks `0100/0120/0140/0160` solo antwoordt. Dat laatste is de goedkoopste
echte test of de taal klopt — en hij is gratis, want die vier verzoeken gaan
toch al de bus op.

**A2 — ST-kalibratie.** Dit is de kern, en hij hergebruikt `measureConnSpeed()`.

1. Zet `ATST` ruim open (`ATSTFF` = 1020 ms), `ATAT1` blijft aan.
2. Acht keer een PID die in A1 bewezen antwoordde, solo, met het
   `'1'`-achtervoegsel — precies wat `measureConnSpeed()` nu al doet.
3. Neem het **maximum** van de acht, niet het gemiddelde. Het plafond moet de
   uitschieter dekken, niet het midden. (`measureConnSpeed()` geeft het
   gemiddelde terug voor knop 5; dat blijft, er komt een veld bij.)
4. Zet `ATST` op dat maximum × 2, omhoog afgerond, geklemd op **48…1020 ms**
   (0x0C…0xFF). De bodem is dezelfde die de foutcodescan al gebruikt
   (`pidlane-kaart.js:107`: 0x0C = 48 ms).
5. Log het getal. Staat het boven ~200 ms, dan is dat de verklaring voor alles
   wat deze auto eerder "niet ondersteunde".

Verwachte uitkomst CX-5: round-trip ~50 ms gemeten → `ATST` rond 0x19 (100 ms),
dus **sneller dan nu**: een misser kost 100 ms in plaats van 400. Verwachte
uitkomst trage gateway: `ATST` boven de 400, en de PIDs komen binnen. Eén
mechanisme, beide auto's beter, geen merknaam nodig.

**A3 — groepsproef.** Neem twee PIDs die in A1 solo antwoordden. Vraag ze als
groep van 2; beoordeel met `plGroepOordeel()` (`plload:990`), die al bestaat en
al het goede onderscheid maakt. Lukt dat, probeer 3. Dat bepaalt het
**startpunt** van knop 1 in plaats van de huidige optimistische 3.

**A4 — antwoordcijfer-proef.** Laat de proef van A3 het cijfer meteen meelezen
(`plFrames()`, `plload:874`), dan begint knop 3 gevuld in plaats van leeg. Eén
misser daar kost nu vijf minuten blokkade.

**Wat A oplevert:**

```js
_verbindProfiel = {
  bron:     'gemeten' | 'geheugen' | 'gok',   // nooit 'merk'
  protocol: { id:'A6', bits:11, bitmapSolo:true },
  st:       { rondritMaxMs:52, gezetHex:'19', marge:2, bodemHex:'0C', topHex:'FF' },
  groep:    { start:3, plafond:3, bron:'proef' },
  cijfer:   { '010C0D11':1 },
  gemetenOp: 1759500000000,
  adapter:  'spp-stn'            // vervalgrond, zie §5.6
}
```

Elk veld draagt waar het vandaan komt. Een veld met `bron:'gok'` mag door laag
B meteen overschreven worden; een gemeten veld is startpunt **én** plafond.

### 4.2 Laag B — de regelkringen houden het gezag

Wat verandert: niet de mechanismen uit §3, alleen hun **beginstand en
richting**.

- Knop 1 start op `profiel.groep.start` in plaats van 3, en klimt niet boven
  `profiel.groep.plafond`.
- Knop 3 begint gevuld uit A4, met dezelfde zelfcontrole en blokkade.
- Knop 8 krijgt eindelijk een eigenaar: de gekalibreerde waarde uit A2.
  `ELM_BASELINE` (`data:525`) wordt per verbinding opgebouwd in plaats van
  constant, en de rollback in `btflow.js:301`/`:313` valt terug op het
  gekalibreerde profiel in plaats van op 400 ms.
- Knoppen 2, 4, 5, 6, 7 blijven zoals ze zijn.
- `batchDip()`, `_groepTel()`, `PLLoad` mogen **altijd** omlaag. Dat is een
  meting, en een meting wint van een profiel.

Geen nieuwe regelaar, geen tweede eigenaar van een knop.

### 4.3 Laag C — kennis en geheugen, strikt ondergeschikt

**Het geheugen is wat "altijd goed" schaalbaar maakt.** Het bestaande
voertuigprofiel (`saveVinProfile`, `pids.js:1280`) krijgt één veld:
`verbind: _verbindProfiel`. De eerste verbinding met een onbekende auto kost
een paar seconden kalibratie; elke volgende begint waar de vorige eindigde.

Dat is het antwoord op *"hoeveel verschillende manieren zijn er"* uit #389:
**dat hoef je niet te weten.** Je meet het één keer per auto en je onthoudt
het. Een merkenlijst is per definitie een lijst uitzonderingen en is op de dag
dat hij af is alweer incompleet; een meting die blijft staan is dat niet.

**Merkkennis is een gok die de proef korter maakt, en niets meer.** Een WMI mag
A3 laten beginnen op 2 in plaats van 1, of A2 laten starten met een ruimer
`ATST`. Weigert de proef die gok, dan telt de proef. Daarmee is een foute of
verouderde tabelregel een vertraging van een halve seconde en nooit een kapotte
verbinding — en dat is de hele reden om het zo te bouwen.

---

## 5. De genomen keuzes

Elk besluit met de afweging erbij, zodat hij niet verdwijnt als de keuze later
ter discussie staat.

### 5.1 Meten in plaats van opzoeken — en dus géén merktabel op de knoppen

**Besluit.** Geen enkele merkafhankelijke waarde mag een knop uit §3 zetten.
Merkkennis komt alleen binnen als startwaarde van een proef.

**Waarom.** Twee redenen die elk los al genoeg zijn. (a) Een tweede regelaar op
dezelfde knop is de bug uit `CLAUDE.md` — de ene krimpt op een meting, de andere
zet terug op een tabelwaarde, en wie wint hangt af van de volgorde van twee
`await`s. (b) Een tabel dekt per definitie niet de auto die niemand gemeten
heeft, en dát is precies de vraag die gesteld is.

### 5.2 `measureConnSpeed()` uitbreiden, niet een nieuwe functie ernaast

**Besluit.** A2 wordt een extra veld op de bestaande meting, plus een tweede
aanroepplek vroeg in de flow. Geen `detectConnectionProfile()` zoals #389
voorstelt.

**Waarom.** De functie bestaat, is in gebruik, en levert het getal waar de
Mazda-prestatie op afgerekend wordt. Een nieuwe functie ernaast zou twee
metingen van hetzelfde geven die uit de pas kunnen lopen — dezelfde vorm als de
twee lijsten die `PIDLANE-WERK.md` en het oude §11 de kop kostten.

### 5.3 Het maximum, niet het gemiddelde — en een harde bodem én top

**Besluit.** `ATST` = max(8 metingen) × 2, geklemd op 0x0C…0xFF.

**Waarom.** `ATST` is een plafond, geen verwachtingswaarde: zet je hem op het
gemiddelde, dan valt de helft van de antwoorden erbuiten. De bodem voorkomt dat
een onmogelijk snelle meting (cache, demo, een adapter die uit zijn eigen buffer
antwoordt) de timeout onder het werkbare duwt. De top is wat de ELM aankan.

### 5.4 De koude poort staat vóór het VIN uitlezen

**Besluit.** Kalibreren direct na `scanNetworks()`, vóór `tryReadVIN()`.

**Waarom.** Zie §4.0: de VIN-uitlezing is zelf een zwaar verzoek (`22F190`,
mode 22) en alles erna is busverkeer dat op knop 8 stuk kan. Dit is tegelijk de
reden dat het voorstel uit #389 niet kán werken.

### 5.5 Een geweigerd commando krijgt een eigen uitkomst

**Besluit.** `sendCmd`/`sendBT` geven bij een gesloten ELM-poort iets anders
terug dan `''`, en de regelkringen tellen die uitkomst niet als busmeting.

**Waarom.** §2.3. Dit is fase 1 en het is de kleinste diff met het grootste
effect, want het haalt de **versterking** uit de lus: zonder dit maakt elke
re-init de regelkringen een stukje pessimistischer over een auto waar niets mee
is.

**Het risico, en dat is het echte risico van fase 1.** `''` betekent op heel
veel plekken "geen data" en wordt daar correct behandeld. Een nieuwe
retourwaarde die ergens als tékst doorgaat, is erger dan het probleem. Daarom:
de nieuwe uitkomst mag **nooit** een string zijn die op een antwoord lijkt, en
hij moet door `parsePID` en `antwoordHerkend` net zo afgekeurd worden als `''`.
Twee kandidaten, en de keuze valt bij de bouw op grond van wat de aanroepers
echt doen:

- **een sentinel-string** (`'\x00GEWEIGERD'`): minste code, maar hij reist door
  elke `String()`-bewerking en elke regex mee;
- **een vlag naast de uitkomst** (`window._laatsteWeigering` of een
  `{tekst, geweigerd}`-object op de paar plekken die het moeten weten): meer
  code, maar hij kan niet per ongeluk als meting gelezen worden.

Voorkeur: de **vlag**, juist omdat hij niet mee kan reizen. En de controle
erop is niet "het werkt" maar een mutatie in `plmutate.sh` die de vlag
weghaalt en `test-*` rood moet maken.

### 5.6 Het profiel vervalt op drie dingen, en meet áltijd één steekproef

**Besluit.** Een bewaard `verbind`-profiel wordt genegeerd bij: een ander
adaptertype, een ander protocol-id, of een profiel ouder dan zes maanden. En
ook met geldig geheugen doet A2 één steekproef (niet acht).

**Waarom.** Een andere adapter is een andere round-trip en dus een andere
`ATST`. Een ander protocol-id is een andere auto of een andere bus. En een auto
die koud anders reageert dan warm moet dat kunnen laten zien — één steekproef
kost ~50 ms en vangt dat. Wijkt hij meer dan een factor 2 af van het
onthouden maximum, dan volledig herkalibreren.

### 5.7 Het bewaren blijft lokaal; D1 is een eigen besluit met een eigen prijs

**Besluit.** Fase 4 bewaart lokaal, in het bestaande voertuigprofiel. Het
aanleggen van een D1-tabel is zinvol maar hoort bij fase 5, niet bij fase 4.

**Waarom nuttig.** De binding bestaat al (`LOGDB`, `wrangler.toml:88`), dus een
tabel erbij is bijna gratis. En het punt is niet dat jij een merktabel met de
hand vult met forumkennis — het punt is dat **elke verbinding al exact de
kennis produceert die je wil hebben**: WMI, protocol-id, gemeten `ATST`,
groepsgrootte die bleef staan, welke PIDs antwoordden. Eén stap erbij en de
database vult zich uit echte auto's, met gemeten getallen in plaats van gegokte.
Dat is ook de enige route naar fase 5 die geen gokwerk is.

**Waarom niet nu.** Twee redenen. (a) De tabel blijft leeg tot fase 2-4 staan,
dus er is niets te verliezen door te wachten. (b) **Dit is nieuwe verwerking.**
Alleen het pseudoniem mag de telefoon uit (`_vlVinPseudoniem()`,
`SHA-256(zout + VIN)`, eerste 16 hextekens), nooit de ruwe VIN en nooit het
kenteken. Let op het verschil met de lokale opslag: `vinProfileKey()`
(`pids.js:1267`) gebruikt wél de ruwe VIN als sleutel, en dat mag — die blijft
op het toestel, en #102 heeft hem al uit de meldingen gehaald. Zodra er iets
naar D1 gaat, geldt de regel uit `CLAUDE.md`: *verandert de verwerking, dan
verandert de toestemmingstekst mee, en dan is een eerder gegeven akkoord niet
meer geldig.* Dat is een besluit van jou, geen implementatiedetail, en het is
de reden dat het een eigen fase is.

### 5.8 Mode 22 is een eigen fase, met de sleutelruimte als voorwaarde

**Besluit.** De mode-22-identifiers (olietemp, laaddruk, DPF) komen pas nadat
de PID-sleutel breder is dan vier tekens, en ze komen binnen als `onzeker:true`.

**Waarom.** De sleutelruimte is de blokkade, niet de kennis
(`pidlane-uitgebreid.js:37-49`). En dit is het enige onderdeel van het hele
plan waar een **ingevulde** tabel onmisbaar is: een schaalformule kun je niet
meten, alleen opzoeken en ijken. Daarom gaat hij door de bestaande deur:
`UITGEBREID_DEFS` zet ongeijkte definities op `onzeker:true` en `cat:'Overig'`,
waarna `pidGate('duidbaar')` ze buiten rapporten en AI-analyse houdt tot iemand
ze op een echte auto geijkt heeft. Dat is `CLAUDE.md`'s *"niets live zetten wat
niet getoetst is"*, toegepast op data in plaats van op code.

### 5.9 De Mazda-prestatie wordt mechanisch beschermd, niet op mijn woord

**Besluit.** Vóór er iets aan de timing verandert, staat er een blok-5-proef
die rood wordt als het CX-5-profiel niet uitkomt op groep 3, antwoordcijfer
aan en `ATST` ≤ 0x64. Zie §7.

---

## 6. De zes fases

Elke fase is een eigen PR met één onderwerp. Elke fase staat op zichzelf: breek
je af na fase 1, dan is de app al beter. De kolom **raakt niet** is de
belangrijkste: dat is wat er níét stuk mag gaan.

### Fase 1 — een geweigerd commando is geen busmeting

| | |
|---|---|
| **waarom eerst** | haalt de versterking uit §2.3 weg; kleinste diff, grootste effect op het log; en het is de enige fase die *nu al* iets repareert zonder dat er een meting bij komt |
| **raakt** | de weigerpaden `bt:932` en `bt:1377`; de boekhouding in `batchDip` (`plload:952`), `PLAntwoordtal.leer` (`:907`) en `plGroepOordeel`-aanroepers; `sppReconnectGuard` (`bt:1287`) mag een weigering niet als stille socket-dood lezen |
| **raakt niet** | de ELM-poort zelf (hij blijft dicht zoals hij is — dat is goed gedrag), de vier regelaars 4-7, `_pollRonde` zelf |
| **keuze** | vlag naast de uitkomst, geen sentinel-string — §5.5 |
| **toetsing** | `test-*` op de weigeruitkomst; **mutatie in `plmutate.sh`** die de vlag weghaalt → test moet rood; `bproef-*` met een nep-adapter die midden in een poll-ronde een re-init uitlokt |
| **risico** | `''` is overal "geen data"; een nieuwe waarde die als tekst doorgaat is erger dan het probleem. Daarom een vlag en een mutatie, geen vertrouwen |

### Fase 2 — `ATST` krijgt een eigenaar

| | |
|---|---|
| **waarom hier** | §2.1, knop 8 uit §3. Dit is de fase die de T6 mogelijk werkend maakt én de CX-5 sneller |
| **raakt** | `measureConnSpeed()` (`bt:1483`) krijgt een `maxMs`-veld; `initELM327()` (`bt:1701-1702`); `ELM_BASELINE` (`data:525`) wordt per verbinding opgebouwd; de rollback in `btflow:301`/`:313` |
| **raakt niet** | knop 5 (`suggestStrategy`/`applyStrategy`) — die blijft op `avgMs` draaien zoals nu; de batch-logica; de PID-ontdekking |
| **keuze** | max × 2, geklemd 0x0C…0xFF — §5.3. `ATAT1` blijft aan: adaptive timing ónder een goed plafond is beter dan een vast getal |
| **toetsing** | `test-*` puur op de rekenregel (max, marge, klem, hex); `bproef-*` met een nep-adapter die 300 ms antwoordt → `ATST` moet boven 0x64 uitkomen; **tegenproef**: kalibratie uit → de trage auto valt weer uit, met de gemeten waarde in de melding |
| **risico** | een te lage `ATST` maakt een gezonde auto stil. Daarom de bodem, en daarom logt de melding het getal — een stille verkeerde `ATST` is precies de fout die hier nu al staat |

### Fase 3 — de koude poort en `_verbindProfiel`

| | |
|---|---|
| **waarom hier** | pas zinvol als fase 2 het meetpunt heeft; draait de richting uit §2.4 om |
| **raakt** | `startDiscovery()` (`bt:2101`) krijgt de poort tussen `ATSP<id>` en `tryReadVIN()`; `PLBus.batchReset()` (`data:1689`) moet op `profiel.groep.start` kunnen beginnen i.p.v. `GROEP_AUTO_MAX`; `PLAntwoordtal` krijgt een voorgevulde start |
| **raakt niet** | de ontdekkingsvolgorde erna (bitmaps → brandstof → healthscan) blijft precies zoals hij is; `_groepTel`/`batchDip` blijven ongewijzigd en mogen altijd omlaag |
| **keuze** | de poort vóór de VIN — §5.4. A1 hergebruikt de bitmapverzoeken die er toch al zijn, dus hij kost niets extra |
| **toetsing** | `bproef-*` op de volgorde (het profiel moet er staan vóór de eerste `_pollRonde`); `test-*` op het profielobject en op `bron`-velden; mutatie: `profiel.groep.plafond` negeren → test rood |
| **risico** | een paar seconden extra op het verbindscherm. Mitigatie: A1 is gratis, A2 is 8×~50 ms, A3 is twee verzoeken. Begroting: onder een seconde op een snelle auto |

### Fase 4 — het profiel onthouden

| | |
|---|---|
| **waarom hier** | maakt het schaalbaar: eerste rit meet, elke volgende begint goed |
| **raakt** | `saveVinProfile()` / `applyVinProfileIfKnown()` (`pids.js:1280+`) krijgen één veld `verbind`; de vervalregels |
| **raakt niet** | de bestaande profielvelden (`pids`, `health`, merk/model/brandstof) en de bestaande vraag "deze auto is bekend, scan overslaan?" (`bt:2232+`) |
| **keuze** | lokaal, in het bestaande profiel, ruwe VIN als sleutel zoals nu — §5.6/§5.7. Drie vervalgronden, en áltijd één steekproef |
| **toetsing** | `test-*` op vervallen (andere adapter, ander protocol, te oud) en op de steekproef-afwijking; een `test-vinlek`-achtige proef dat er geen nieuw pad is waarlangs de ruwe VIN in een melding of export belandt |
| **risico** | een bewaard profiel van een auto die intussen gerepareerd is. Mitigatie: de steekproef, en laag B mag altijd omlaag |

### Fase 5 — merkkennis als gok, en D1 als oogst

| | |
|---|---|
| **waarom hier** | pas nuttig als 1-4 staan, want anders is er niets om te oogsten |
| **raakt** | een nieuwe D1-tabel naast `logregels`; een inzend-endpoint in `worker.js`; de startwaarden van A2/A3; **de toestemmingstekst** |
| **raakt niet** | geen enkele knop uit §3 — de gok is alleen een startwaarde, de proef beslist |
| **keuze** | oogsten uit echte verbindingen, niet met de hand vullen — §5.7. Alleen het pseudoniem de telefoon uit, nooit VIN of kenteken. Eén merk per keer |
| **toetsing** | **mutatie: een foute tabelregel mag de verbinding niet breken** — dat is de hele belofte van laag C, en dus de enige test die telt. Plus `test-toestemmingstekst.js`, die hier mee verandert |
| **risico** | privacy en consent. Dit is de enige fase die een besluit van jou vraagt vóór de bouw |

### Fase 6 — mode 22 pollbaar

| | |
|---|---|
| **waarom laatst** | eigen onderwerp, eigen risico, en de enige fase die niet over verbinden gaat maar over inhoud |
| **raakt** | de PID-sleutelruimte (vier tekens → breder), `pidCmd()` in `pidlane-uitgebreid.js`, `parsePID`, de batchfilters (`isMode01`), `PIDS_EXTRA` |
| **raakt niet** | de koude poort; de acht knoppen. Mode 22 batcht niet, en dat is al geregeld |
| **keuze** | identifiers komen binnen als `onzeker:true` via `UITGEBREID_DEFS` — §5.8 |
| **toetsing** | `test-mode21.js` uitbreiden; mutatie op de sleutellengte; de ijking zelf is `CAMPAGNE` |
| **risico** | de sleutelconventie raakt de hele app. Dit is de enige fase die ik niet zou beginnen voordat 1-4 live staan en een maand gereden hebben |

### Wat hiervan een rit nodig heeft

Fase 1 t/m 4 zijn **browserproeven**. Een nep-adapter die traag antwoordt, die
weigert, die twee van drie PIDs teruggeeft — dat is precies wat `plbrowser.sh`
kan maken: de nep-adapter vervangt `_sendBTOnce()` en alles erboven blijft echte
code. Wat een echte gateway-ECU onder belasting doet, is dat niet. Dat is de
ene vraag die naar `CAMPAGNE` gaat, en dan met deze twee metingen als uitkomst:

- de gekalibreerde `ATST` op de **T6** — het getal uit A2, en of de PIDs die
  "niet ondersteund" leken dan binnenkomen;
- de gekalibreerde `ATST` op de **CX-5** — of de 31,7 req/s staan blijft of
  hoger wordt.

---

## 7. Het vangnet dat de Mazda beschermt

Weken werk zit in die 31,7 req/s. Die mag niet op mijn woord afhangen. Vóór
fase 2 — dus als eerste werk in fase 1 — komt er één entry in `PROEVEN_B5`
(`pidlane-testrun.js`, zie §20 van `PIDLANE.md`) die rood wordt als het
verbindprofiel op deze auto níét uitkomt op:

| wat | eis | waarom dit getal |
|---|---|---|
| `groep.start` | = 3 | knop 1 staat nu op 3 en blijft daar; zakt dit, dan verdrievoudigt het aantal verzoeken |
| antwoordcijfer | aan, ≥1 verzoek geleerd | knop 3 is de winst van 28-09; `PLAntwoordtal.stand()` levert dit al |
| `st.gezetHex` | ≤ `0x64` | de kalibratie mag op deze auto nooit *trager* uitkomen dan de 400 ms van nu |
| `readsPerSec` | ≥ 25 | marge onder de 31,7; onder de 25 is er iets kwijt |

En de nameting die je al hebt: `PLAntwoordtal.stand()` geeft `msMet` tegen
`msZonder` — dat is het bewijs dat knop 3 nog werkt, gemeten door de app zelf.

**Dit is dus ook een antwoord op "wat als fase 2 de Mazda langzamer maakt".**
Dan staat blok 5 rood vóór de PR, niet na een rit.

---

## 8. Wat dit ontwerp niet oplost

- **Een auto die een PID écht niet heeft.** Geen timing, geen tabel en geen
  kalibratie maakt een sensor die er niet is zichtbaar. De olietemperatuur van
  de T6 is fase 6, niet fase 2.
- **De belofte "altijd goed".** Wat dit garandeert is smaller en eerlijker: de
  app **meet** wat deze auto en deze adapter aankunnen vóórdat hij er een tempo
  op zet, en onthoudt dat per auto. Dat sluit één categorie fouten uit — een
  auto die stukgaat op een getal dat voor een andere auto gekozen is. Het sluit
  niet uit dat een ECU iets doet wat hier niemand verwacht heeft.
- **K-lijn** (ISO 9141, KWP2000). A2 werkt er in principe; A3 niet, want batch
  is CAN-only en dat is al goed geregeld. De keep-alives (`ATPC`, `bt:941`)
  hebben hun eigen timing. Ongemeten.
- **Een auto die per ECU een header nodig heeft** (`ATSH`). De app kan het
  (`pidlane-kaart.js`), maar de koude poort kiest het niet zelf.
- **Een EV.** De meeste mode-01-motorPIDs bestaan er niet. Dan is het scherm
  leeg terwijl de verbinding perfect is — een inhoudsprobleem, geen
  verbindprobleem.

---

## 9. Versiehistorie

| datum | versie | wat |
|---|---|---|
| 03-10-2026 | 0.1 | eerste ontwerp, als antwoord op #388/#389 |
| 03-10-2026 | 0.2 | volledig plan: inventaris van de acht knoppen (§3), de volgorde in de flow (§4.0), negen genomen keuzes met afweging (§5), zes fases met raakt/raakt-niet/risico (§6), het blok-5-vangnet voor de Mazda (§7) |
| 06-10-2026 | 0.3 | fase 1–5 gebouwd; §10: wat er bij de bouw afweek van 0.2, en wat de eerste drie dagen kennisbank laten zien (#391) |

## 10. Wat er bij de bouw afweek van 0.2

Gebouwd in PR #390 (03-10-2026). Vijf afwijkingen van het plan, elk met de
reden:

- **ATST = 2× de óp één na traagste rondrit**, niet 2× de traagste (§5.3).
  Eén Bluetooth-haper zou een snelle auto anders een seconde per misser
  kosten. Zie `plStUitMetingen()` in `pidlane-bt.js`.
- **A4 (antwoordcijfer voorvullen) vervalt.** De sleutel van `PLAntwoordtal`
  is de exacte groep, en die hangt af van welke PIDs op dat moment aan de
  beurt zijn. Een proefgroep uit de koude poort valt daar zelden mee samen.
- **Merkkennis als startgok (fase 5) vervalt; D1 oogst wel.** De WMI komt pas
  ná de koude poort binnen, en de meting zelf kost op een snelle auto onder
  een seconde. Een gok vooraf wint dus niets. De tabel `verbindprofielen`
  bestaat wel, onder het VIN-pseudoniem (§5.7), met bijgewerkte
  toestemmingstekst (`AKKOORD_TEKST_SINDS` = 03-10-2026).
- **Het geheugen beperkt zich tot ATST, en alleen omhoog** (fase 4). Groep en
  protocol worden elke verbinding opnieuw gemeten.
  **Herzien op 06-10-2026 (#414).** "Alleen omhoog" klopt voor één
  verbinding: het geheugen verlaagt de meting van vandaag nooit. Over
  verbindingen heen was het een ratel. Het geheugen is nu het veld
  `verbind.metingen`, met de laatste drie metingen van de koude poort
  (`ST_GEHEUGEN_N`). De traagste daarvan telt (`plStUitGeheugen`). Een
  bijsturing tijdens de rit gaat er niet in, en drie snellere metingen op
  rij halen het geheugen mee omlaag. Het oude veld `verbind.st` telt niet
  meer als geheugen; een profiel van vóór deze datum begint dus leeg.
- **Een nieuwe verbinding begint weer op ATST 64** (400 ms). Alleen het
  herverbindpad houdt de meting van de vorige verbinding vast.

**Wat de kennisbank na drie dagen laat zien (06-10-2026).** Twintig records,
allemaal van de Mazda CX-5 2018 (SPP, protocol A6); de T6 staat er nog niet
in. Gemeten ATST 48–176 ms bij een traagste antwoord van 17–173 ms, groep 3,
37 reads/s gemiddeld. Maar het geheugen duwde de ATST in drie dagen op naar
**0xFF (1020 ms)**, terwijl het traagste gemeten antwoord 81 ms was. Het
bijsturen tijdens de rit schrijft in het geheugen, en het geheugen gaat
alleen omhoog. Dat is #414; zie de herziening bij "alleen omhoog" hierboven.

