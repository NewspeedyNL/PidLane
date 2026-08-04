# Wijzigingen 4 augustus 2026

Twee dingen: de protocolbug uit het veldlog van vannacht, en de drie
functies uit tier 1 ingebouwd op hun logische plek.

---

## 1. Protocolvergrendeling gaat verloren bij herverbinden

**`pidlane-bt.js` · `pidlane-plload.js`**

### Wat er misging

Koude start deed het goed:
`ATWS` → `ATSP0` → detectie → `ATSPA6` ← vergrendeld

Het herverbindpad (`sppReconnectGuard`) riep alleen `initELM327()` aan en ging
niet door naar `scanNetworks()`. Dat pad eindigde dus op `ATSP0` — expliciet
AUTO — en vergrendelde nooit opnieuw. Vanaf dat moment zocht de ELM327 bij élk
commando het protocol opnieuw op.

In het log van 4-8: **227× `SEARCHING...`, 117× `UNABLE TO CONNECT`**.

De timingverdeling laat zien dat het geen traagheid was maar een timeout:

| Duur | Aandeel |
|---|---|
| < 200 ms | 94,3 % |
| 200 ms – 1 s | 4,2 % |
| 1 – 4 s | 0,2 % |
| **> 4 s** | **1,3 %** |

Bijna niets tussen 1 en 4 seconden. Commando's waren snel óf ze liepen in de
zoekcyclus. 101 commando's boven 4 seconden = **8,8 minuten pure wachttijd**.

De app wist het protocol wel degelijk: `proto-id="A6"` staat 295× in de
BATCH-diag-regels. De informatie was er, hij ging alleen niet terug naar de
adapter.

### De vervolgschade

De regelkringen deden precies wat ze moesten en kwamen op de verkeerde
diagnose, omdat ze een verzadigde bus mátenwaar er geen was:

- pollbudget verlaagd tot **17 %** (12×)
- multi-PID verkleind 4 → 2 → 1 → helemaal uit
- herstel wachtte op de herstelperiode — één keer van 00:26:50 tot 00:37:21,
  ruim **tien minuten** degradatie na een storing die na 30 seconden voorbij was

### Wat er nu gebeurt

**`pidlane-bt.js`**

- `_onthoudProtocol(id)` / `_bekendProtocolId()` — het gedetecteerde protocol
  wordt onthouden in `localStorage.pl_proto_id`, met de sessiewaarde
  (`selectedNetwork.id`) als voorkeur. Zo overleeft het ook een herstart plus
  direct herverbinden.
- `initELM327({herstelProtocol:true})` stuurt `ATSP<id>` in plaats van `ATSP0`,
  en **verifieert met `ATDPN`** of de adapter de vergrendeling ook echt overnam.
  Zegt de adapter iets anders, dan valt hij terug op `ATSP0` zodat de normale
  detectie het overneemt — geen aanname doordrukken.
- Het herverbindpad roept die variant nu aan. De koude start blijft ongewijzigd
  `ATSP0`, want daar hóórt detectie te volgen.

**`pidlane-plload.js`**

- `PLLoad.herstelNaProtocolLock()` zet pollbudget en multi-PID meteen terug na
  een geslaagde hervergrendeling. De oorzaak is weg, dus de meting moet opnieuw
  ijken in plaats van minutenlang in een lage stand te blijven hangen.

### Let op bij de validatieregex

Mijn eerste versie testte op `/^[0-9A-C]$/` en verwierp daarmee `A6` — de
`A`-prefix die `ATDPN` gebruikt voor een automatisch gevonden protocol. Dat had
de hele fix stilzwijgend uitgeschakeld. Nu `/^A?[0-9A-C]$/`, met `A0` expliciet
geweigerd omdat dat gewoon AUTO is.

### Nog niet opgelost

Na een herverbinding duurt élk init-commando ~950 ms in plaats van ~65 ms, met
`1 polls` in plaats van `2 polls`. De `spp.read()` van de Capacitor-plugin
blokkeert zelf op een verse socket. Dat kost ~7 s per herverbinding in plaats
van ~0,5 s. Vervelend maar niet fout, en het zit aan de native kant — vandaar
niet aangeraakt.

Ook blijft er onafhankelijke socket-instabiliteit: van de 5 herverbindingen
vielen er 2 midden in normaal verkeer (00:20:18, 14:16:14), niet in een
zoekcyclus. Dat is een aparte kwestie.

---

## 2. Terugroepacties met detail — `pidlane-recall.js` (nieuw)

Koopcheck had de vlag al: `openstaande_terugroepactie_indicator` → banner
"RECALL ACTIEF", ja of nee. Correct, maar het stopt waar het gesprek met de
klant begint: wélke actie, welk risico, al uitgevoerd of niet.

`PLRecall` knoopt de drie RDW-detailtabellen aan elkaar op referentiecode
(`t49b-isb7` → `j9yg-7rg9` + `9ihi-jgpf`) en maakt van de vlag een lijst met per
actie code, status, omschrijving en risico.

- Gebruikt de **bestaande proxy** (`PROXY_URL + '/proxy?url='` met `APP_TOKEN`).
  `opendata.rdw.nl` staat al in `PROXY_ALLOWED_HOSTS` — **geen wijziging in
  `worker.js` nodig**.
- Haakt automatisch in op beide kentekenlookups via een nieuw
  `pl:kenteken-geladen` event (`pidlane-bt.js` en `pidlane-koopcheck.js`).
- Vult de bestaande `#koopRecallBanner` met de details.
- `PLRecall.naarPromptRegel()` gaat mee in de inkoopprompt, zodat het model
  weet waaróver de recall gaat in plaats van alleen "JA".

**Eén ding verifiëren op echte data:** de veldnamen van `j9yg-7rg9` en
`9ihi-jgpf` staan niet vast. De module haalt het hele record op en toont
onbekende velden onder een uitklapper, dus er valt niets weg. Doe één lookup op
een auto met een echte actie, kijk in `PLRecall.laatsteRuwe()` welke namen
eruit komen en scherp `VELD_VOORKEUR` aan — dan verdwijnt de uitklapper.

---

## 3. Monitortests — `pidlane-mode06.js` (nieuw)

Mode 03 geeft wat al mis is. Mode 06 geeft de meetwaarden waarop de ECU die
beslissing baseert: per monitor de waarde plus de fabrieksgrenzen. Een
katalysator op 0,72 waar de grens 0,75 is geeft geen foutcode — maar dat is wel
wat een klant wil horen vóórdat de MIL aangaat.

**Waarom het oordeel betrouwbaar is en de eenheid soms niet.** Waarde, min en
max staan in dezelfde ruwe eenheid. Voor geslaagd/gezakt is de schaalfactor dus
niet nodig, alleen of de getallen signed of unsigned zijn. De UAS-tabel is
bewust kort gehouden; bij een onbekende schaal-ID worden **beide interpretaties
doorgerekend**. Eens → oordeel staat vast, alleen ruwe waarde getoond. Oneens →
`onzeker`, geen gok die eruitziet als een meting.

Onbekende schaal-ID's verzamelen in `PLM06.onbekendeUas()`, aan te vullen na
een paar echte auto's — zelfde idee als `PLPidLen`.

Claimt het busslot via `withBus('mode06', …)`, net als `pidlane-verify.js`.

**Op een trage dongle:** 6 discovery-calls plus één per MID, op een auto met
veel monitors 30-40 stuks. Draai deze scan pas ná de protocolfix, anders is dat
40 × 5 s.

---

## 4. GPS-ritlogging — `pidlane-gps.js` (nieuw)

Standaard **uit**; `PLGps.zetToestemming(true)` in de instellingen zet hem aan.

Wikkelt `startRitAnalyse()` / `stopRitAnalyse()` in plaats van erin te patchen,
dus `pidlane-rit.js` blijft ongewijzigd en GPS is puur additief.

De interessantste functie is `vergelijkMetObd()`: mediane afwijking tussen
GPS-snelheid en PID 0x0D. Een fabrieksteller mag in de EU hoger aanwijzen dan
werkelijk, nooit lager — een **negatieve** afwijking is dus een echt signaal
(te grote banden, aangepaste eindoverbrenging). Geeft `null` onder 15 bruikbare
meetparen, dus geen uitspraken op te weinig data.

**AVG:** locatie van een bedrijfsvoertuig is persoonsgegeven zodra het aan een
bestuurder te koppelen is. Opt-in, punten ouder dan 30 dagen worden opgeruimd,
niets buiten het geheugen. Bij structurele inzet in een wagenpark met
werknemers speelt ook medezeggenschap — ik ben geen jurist, laat dat toetsen
voordat het bij Van Meel aan gaat.

**Voor de APK** nog toevoegen aan `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

---

## De vier losgestuurde bestanden

| Bestand | Gewijzigd | Waarom (of waarom niet) |
|---|---|---|
| `pidlane.css` | ✅ +58 regels | Stijlen voor beide nieuwe blokken, kleurcodering gelijk aan de rest van de app |
| `pidlane-credits.js` | ✅ +17 regels | Mode 06 zet een eigen kop in de prompt. Zonder eigen kostenblok viel dat onder "Vraag + opmaakinstructies" en zag de gebruiker niet dat een monitorscan tokens kost. Nu een `🔬 Monitortests`-blok |
| `pidlane-uitgebreid.js` | ❌ | Gaat over mode 21/22 fabrikant-PIDs. Mode 06 is een andere mode met een eigen antwoordstructuur; er was geen eerlijke reden om hier iets te veranderen |
| `pidlane-waakronde.js` | ❌ | Claimt het busslot via `PLBus`, net als `PLM06`. Ze gaan elkaar dus vanzelf niet in de weg zitten. Een wijziging zou hier alleen ruis toevoegen |

---

## Validatie

- `node --check` op **alle 59 JS-bestanden** in de repo: schoon
- `index.html`: 780 `<div>` / 780 `</div>`, 51 `<script>` / 51 `</script>`
- `pidlane.css`: 1101 `{` / 1101 `}`
- **Mode 06 parser, 24 tests:** ruisfilter, enkelvoudig frame, multi-frame
  ISO-TP met regelnummers, hersynchronisatie na rommelbytes, gezakt, krap,
  onbekende UAS met en zonder tegenspraak, MID-naamgeving, `NO DATA` mag niet
  doorlekken, sortering, promptfiltering
- **Protocolhelpers, 19 tests:** inclusief de `A6`-regexbug, `A0`-weigering en
  een injectiepoging (`"6; ATZ"` wordt geweigerd)
- **Herverbindsimulatie tegen een nagebootste ELM327:** oud gedrag 100
  zoekcycli op 100 commando's, nieuw gedrag 0. Afwijkend `ATDPN`-antwoord valt
  correct terug op `ATSP0`
- **Kostenblok, 6 tests:** knipt op de lege regel, telt testregels, `vraag` kan
  niet negatief worden
- **Recall, 6 tests:** vier samenvattingsniveaus plus HTML-escaping tegen
  injectie via RDW-velden

Niet getest: echt busverkeer en echte RDW-responses. Dat kan alleen op een auto
en met een kenteken dat een lopende actie heeft.

---

## Volgorde die ik zou aanhouden

1. **Push de protocolfix apart.** Dat is de grote winst en raakt weinig code.
   Rijd een rondje, forceer een herverbinding en kijk in het log of er
   `Protocol opnieuw vergrendeld: A6 (bevestigd via ATDPN)` staat en of het
   aantal `SEARCHING` naar nul gaat.
2. Recall-lookup op een auto met een lopende actie → `PLRecall.laatsteRuwe()`
   → `VELD_VOORKEUR` aanscherpen.
3. Mode 06 draaien, eerst op de MX+, daarna op de trage dongle als stresstest.
4. GPS als laatste, want daar hangt de permissie- en privacyvraag aan.
