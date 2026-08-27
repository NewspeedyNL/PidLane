# PidLane — het contract tussen meten en gebruiken

Versie 0.2 — 27-08-2026 — **ontwerp, nog niet gebouwd**

> De vier besluiten uit §9 zijn op 27-08-2026 genomen. Ze zijn hieronder in de
> tekst verwerkt; §9 legt vast wat er gekozen is en waarom, zodat de afweging
> niet verdwijnt als de keuze later ter discussie staat.

Dit document beschrijft één afspraak: wat een meting is als hij de meetlaag
verlaat. Er staat geen code in en er verandert nog niets aan de app. Het is
bedoeld om eerst te lezen en te bekritiseren, en pas daarna stap voor stap in te
voeren.

---

## 1. Waarom dit nodig is

PidLane verzamelt data en koppelt die aan AI. Die koppeling werkt, maar hij
werkt op een aanname die niet klopt: **dat elke waarde die binnenkomt een echte
meting is.**

Vier voorbeelden uit één week, allemaal uit echte logs:

| wat er binnenkwam | wat het werkelijk was |
|---|---|
| `0155 = 128` | de rauwe byte `0x80`; er staat geen definitie in `ALL_PID_DEFS`, dus er is niets omgerekend. Brandstoftrim hoort rond 0% te liggen |
| `0123 = 9900`, 27 minuten stil | raildruk die tijdens een hele rit niet beweegt. Op directe inspuiting onmogelijk |
| `019D = −40` | de ECU claimt de PID in bitmapblok `0180` maar levert niets; −40 is de temperatuuroffset van een rauwe nul |
| een rit van 27,6 minuten | waarvan zes minuten ontbraken, waaronder 167 seconden middenin het rijden |

Alle vier kwamen ze bij de AI aan als feiten. Geef een taalmodel een
brandstoftrim van 128% en het verzint met overtuiging een defect. Vertel het
niet dat er zes minuten data ontbreken, en het trekt conclusies over een trend
die het niet gezien heeft.

**Dit is geen meetprobleem meer. Het is een presentatieprobleem.** De meetlaag
wéét in de meeste gevallen prima dat er iets mis is — blok 6 kan het zelfs
uitsplitsen naar oorzaak. Die kennis komt alleen nergens terecht.

### Wat dit uitdrukkelijk níét is

Geen herbouw. Er staan 63 werkende modules; die blijven staan. Dit contract is
een afspraak over wat er tussen de lagen doorgaat, niet over hoe de lagen van
binnen werken. De invoering gebeurt met een tussenlaag (§7) zodat de bestaande
afnemers blijven werken tot ze één voor één zijn omgezet.

---

## 2. Twee dingen worden vastgelegd

**De meetwaarde** — wat weten we over deze ene sensor op dit moment.

**De sessiedekking** — hoe compleet is de meting waar die waarde uit komt.

Dat tweede ontbreekt nu volledig, en het is waarschijnlijk het belangrijkste van
de twee. Een perfecte waarde uit een rit met zes minuten gaten is iets anders
dan dezelfde waarde uit een ononderbroken rit.

---

## 3. De meetwaarde

```
{
  pid:        '0155',
  naam:       'Brandstoftrim kort B1S2',
  waarde:     null,
  eenheid:    '%',
  kwaliteit:  'rauw',
  bron:       'ecu',
  gemetenOp:  1756123456789,
  monsters:   0,
  reden:      'geen definitie in ALL_PID_DEFS — antwoord 415580 is de rauwe byte 0x80'
}
```

**`waarde` is `null` zodra `kwaliteit` niet `gemeten` of `stabiel` is.** Geen
uitzonderingen. Dit is de kern van het contract: een afnemer die de kwaliteit
negeert krijgt dan `null` en niet een getal dat toevallig geloofwaardig oogt.
128 is geloofwaardig. Dat is precies het probleem.

**`reden`** is verplicht bij alles behalve `gemeten` en `stabiel`, en is
mensentaal — hij komt letterlijk in het AI-rapport en in het logboek terecht.

**`bron`** is `ecu`, `afgeleid` (berekend uit andere PIDs), `profiel` (uit het
opgeslagen VIN-profiel, dus niet vers gemeten) of `demo`. Staat er ergens in een
sessie `demo`, dan moet dat bovenaan het rapport en in de gearchiveerde versie
komen te staan — zie besluit 4 in §9.

**`gemetenOp`** is een epoch-timestamp in milliseconden, **UTC**. Zie §6.

---

## 4. De kwaliteitsklassen

Acht klassen. Ze sluiten aan bij wat blok 6 nu al onderscheidt en bij de
opruimregel; er wordt geen nieuw vocabulaire uitgevonden waar er al een is.

| klasse | betekenis | `waarde` | wie stelt het vast |
|---|---|---|---|
| `gemeten` | vers antwoord, binnen bereik, beweegt | getal | meetlaag |
| `stabiel` | vers antwoord, binnen bereik, beweegt niet — kan legitiem zijn (koelwater bij warme motor) | getal | meetlaag |
| `verdacht` | bevroren terwijl `moetBewegen` het uitsluit, of buiten `PID_HARD_LIMITS` | **null** | waakronde / PLWatch |
| `rauw` | geen definitie, waarde is een ongeschaalde byte | **null** | de gate, bij het opzoeken van de definitie |
| `stil` | gepollt, geen antwoord | **null** | meetlaag |
| `nietGemeten` | deze sessie niet gepollt | **null** | de gate |
| `opgeruimd` | door de opruimregel uit `activePIDs` verwijderd | **null** | opruimregel |
| `ontkend` | steunbit zegt nee | **null** | steunbitcontrole |

Het onderscheid tussen `stabiel` en `verdacht` zit in de PID, niet in de
meting: koelwater dat bij 92 °C stilstaat is gezond, raildruk die bij 9900
stilstaat niet. Dat verschil wordt vastgelegd met één nieuw, **optioneel** veld
in `ALL_PID_DEFS`:

```
moetBewegen: 'draait'    // motor draait  → stilstand is onmogelijk
moetBewegen: 'rijden'    // in beweging   → stilstand is onmogelijk
```

Een PID **zonder** dat veld kan nooit `verdacht` worden op grond van stilstand;
die blijft `stabiel`. Zo kost een tabel van ~55 ingangen geen 55 oordelen, en
levert een vergeten ingang geen vals alarm op maar hooguit een gemiste vangst.
Vullen doe je alleen waar stilstand fysiek uitgesloten is — raildruk, toerental,
MAF, inspuittijd — en dat is een stuk of acht. Besluit 1, §9.

`rauw` is nieuw en volgt rechtstreeks uit de `0155`-vondst. Zodra een PID
zonder definitie binnenkomt is de waarde per definitie betekenisloos, hoe
plausibel hij er ook uitziet.

---

## 5. De sessiedekking

```
{
  klok:            'UTC',
  start:           1756100000000,
  eind:            1756101656000,
  duurS:           1656,
  gemetenS:        1290,
  gatenS:          366,
  gaten:           [ {vanaf, tot, s: 134}, {vanaf, tot, s: 167}, {vanaf, tot, s: 66} ],
  volledigheid:    0.78,
  monsters:        1295,
  hz:              1,
  segmenten:       { rijden: 798, stil: 268, onbekend: 229 },
  langsteGatRijdenS: 167,
  herverbindingen: 9,
  achtergrond:     14,
  actievePIDs:     24,
  opgeruimd:       ['0101', '0121']
}
```

**`volledigheid`** is `gemetenS / duurS` en is het eerste van twee getallen die
een afnemer moet lezen voordat hij iets over een verloop zegt. Het tweede is
`langsteGatRijdenS`: de langste ononderbroken stilte die in een rijdend segment
viel. Eén percentage verbergt namelijk juist wat je wilt weten — 0,78 verdeeld
over stilstand is iets anders dan 0,78 met één gat van 167 s middenin het
rijden. Zie de drempel in §7.

**`achtergrond`** telt hoe vaak de app naar de achtergrond ging. Dat is de
oorzaak van de gaten en van de herverbindingen (zie `PIDLANE.md` §11), en het
hoort in de dekking omdat het de betrouwbaarheid van de hele sessie raakt.

**`gaten`** staat er voluit in, niet alleen als totaal. Een gat van 167 seconden
middenin het rijden is iets anders dan drie gaten van een minuut bij stilstand,
en dat verschil moet een afnemer kunnen zien.

---

## 6. Eén klok

Alle tijden in het contract zijn **epoch-milliseconden in UTC**. Weergave in
lokale tijd gebeurt pas op het scherm en in de export.

Dit staat hier omdat het nu fout is: de bulkrecorder schrijft UTC, de logger
lokale tijd. Op 23-08 scheelde dat exact twee uur, en dat viel alleen op doordat
de seconden van de gaten toevallig gelijk waren. Wie die twee bestanden naast
elkaar legt concludeert eerst dat ze niet bij elkaar horen.

---

## 7. Regels voor afnemers

Een afnemer is elke module die meetwaarden gebruikt om iets te beweren:
AI-rapport, koopcheck, verbruik, caravan, klimaatcheck, rapporten.

**Regel 1 — de kwaliteit lezen is verplicht.** Een afnemer die `waarde` gebruikt
zonder `kwaliteit` te lezen, is fout. Omdat `waarde` `null` is bij alles behalve
`gemeten` en `stabiel`, faalt zo'n afnemer zichtbaar in plaats van stil.

**Regel 2 — afwezigheid is geen bewijs.** Een oordeel over het ontbreken van
iets mag alleen op `gemeten` of `stabiel` gebaseerd zijn. "Deze auto heeft geen
turbo" mag nooit volgen uit `nietGemeten`. Dit is precies de fout die
`_boostPhantom()` moest voorkomen en die nu ongetest is.

**Regel 3 — de dekking hoort in het oordeel.** Zegt een afnemer iets over een
verloop, een trend of een gemiddelde, dan moet de dekking erin meegewogen zijn.
De drempel heeft twee voorwaarden en ze moeten **allebei** gehaald worden:

| | |
|---|---|
| `volledigheid` | ≥ 0,85 |
| `langsteGatRijdenS` | ≤ 60 |

Wordt één van beide niet gehaald, dan mag er geen uitspraak over verloop gedaan
worden — alleen over losse waarnemingen, en met de reden erbij. De rit van 23-08
(0,78; langste gat 167 s tijdens het rijden) valt daarmee op beide gronden af,
en dat is de bedoeling: die rit voelde te mager en was het ook. Besluit 2, §9.

### Wat de AI-prompt concreet moet krijgen

Bovenaan, vóór de meetwaarden:

- de dekking uit §5, in mensentaal — *"27,6 minuten gemeten, waarvan 6 minuten
  ontbrekend in drie gaten; het langste gat van 167 s viel tijdens het rijden"*
- een expliciete lijst van wat er **niet** gemeten is, met de reden erbij —
  `0155` niet gemeten (geen definitie), `019D` stil (ECU claimt maar levert
  niet), `0101` opgeruimd na 6 mislukte pogingen

En één instructieregel: dat het model over niet-gemeten sensoren **geen**
uitspraak doet, en het verschil tussen "niet gemeten" en "afwezig of defect"
expliciet benoemt. Dat onderscheid is de hele reden dat de opruimregel zijn
melding heeft.

---

## 8. Hoe dit ingevoerd wordt

Niet in één keer, en niet met een herbouw.

**Stap 1 — de tussenlaag.** Eén functie die uit de huidige toestand een
contractwaarde maakt: `plMeetwaarde(pid)`. Die leest wat er nu al is
(`pidVals`, `_sessionStats`, de health-oordelen, de steunbits, de opruimregel)
en giet dat in de vorm uit §3. Verandert niets aan de meetlaag en niets aan de
afnemers. Puur additief, dus gedragsneutraal — en dat is de enige stap die
gedragsneutraal is.

**Stap 2 — de dekking.** Eén functie `plDekking()` die §5 oplevert. De gegevens
zitten al in de bulkrecorder en het logboek; ze worden alleen nergens
samengebracht.

**Stap 3 — één afnemer per sessie.** Beginnen bij het AI-rapport, want daar is
de schade het grootst. Per afnemer een blok 5-controle mét tegenproef. Pas
overgaan naar de volgende als de vorige groen is.

Voorstel voor de volgorde: AI-rapport → koopcheck → verbruik → caravan →
klimaatcheck → rapporten. AI eerst omdat het de meeste vrijheid heeft om iets te
verzinnen; koopcheck als tweede omdat daar geld aan hangt.

**Stap 4 — de meetlaag zelf.** Pas als alle afnemers het contract gebruiken,
heeft het zin om `0155` een definitie te geven, de raildruk uit te zoeken en de
bitmaps uit `pidlane-bulk.js` te halen. Dan zie je namelijk meteen wat het
oplevert.

### Wat er vóór stap 1 nog moet gebeuren

STPX. De adapter blijkt een STN2255, en als de transportlaag daarop overgaat
verandert het gedrag van de meetlaag — batchgroottes, timeouts, `PLPidLen`, de
terugval van drie-naar-één. Het contract raakt daar niet door van vorm, maar de
tussenlaag uit stap 1 wel.

**Die voorwaarde staat inmiddels op losse schroeven.** Drie metingen met blok 13
geven STPX geen enkele voorsprong: +8% trager (4.7, stilstand), −1% (4.8,
stilstand) en +13% trager op een drukkere bus (26-08, `gemMs` 196, bezet 90%).
Drie keer dezelfde richting. Bevestigt de rit met alle vier de aanvragers dat
beeld, dan vervalt deze voorwaarde en kan stap 1 meteen beginnen — dan wordt de
STPX-sessie geschrapt in plaats van ingepland.

---

## 9. De vier besluiten — genomen op 27-08-2026

Ze stonden hier open omdat ze de vorm van het contract bepalen. Hieronder wat er
gekozen is en waarom; de tekst hierboven is er al op aangepast. De afweging
blijft staan, want over een half jaar is de vraag "waarom eigenlijk?" en niet
"wat ook alweer?".

**1. `stabiel` versus `verdacht` → een opt-in veld `moetBewegen`, korte lijst.**
Niet alle ~55 ingangen een oordeel geven, maar alleen de sensoren waar stilstand
met draaiende motor fysiek onmogelijk is. De reden is de richting waarin een
vergissing uitpakt: een ontbrekend veld levert een gemiste vangst op, een fout
ingevuld veld zet een gezonde sensor permanent op `verdacht`. Het eerste kost
een bevinding, het tweede kost vertrouwen in het hele oordeel. Begin daarom bij
raildruk (`0123`/`0159`), toerental, MAF en inspuittijd, en vul de rest pas aan
als een meting daar aanleiding toe geeft.

**2. De drempel → `volledigheid` ≥ 0,85 én geen gat langer dan 60 s tijdens het
rijden.** Twee voorwaarden in plaats van het voorgestelde ene getal van 0,7. De
rit van 23-08 is precies waarom: die zat op 0,78 — ruim boven 0,7 — en had
tegelijk één gat van 167 seconden middenin het rijden. Eén percentage kan dat
niet uitdrukken, want het middelt de plek van het gat weg. Daarvoor is
`langsteGatRijdenS` aan §5 toegevoegd.

**3. Waar dit document hoort → los, en het verhuist bij oplevering.** Zolang dit
ontwerp is, blijft het een eigen bestand met een verwijzing vanuit `PIDLANE.md`
§4; makkelijker te herzien, en `PIDLANE.md` beschrijft wat er drááit. Zodra de
tussenlaag er staat verhuist de beschrijving naar `PIDLANE.md` en verdwijnt dit
bestand. Dat is bewust een opdracht en geen keuze achteraf: twee beschrijvingen
van hetzelfde die naast elkaar blijven liggen, is hier al drie keer een bug
geweest.

**4. Demo → wél een AI-rapport, mét verplichte vermelding en op een kort
budget.** Een demo zonder rapport laat juist het onderdeel weg dat je wilt
tonen. Twee voorwaarden dus:

- **Vermelding.** `bron: 'demo'` staat bovenaan het rapport, in het
  gearchiveerde rapport én in de prompt. Zonder dat kan een demorapport voor een
  echte diagnose worden aangezien, en dat kan nu wel.
- **Kort budget.** Demo krijgt een eigen, ingekorte prompt en een lage
  `max_tokens`. Dat is geen zuinigheid maar noodzaak: `_vrijgesteld()` in
  `pidlane-credits.js` geeft `true` bij `demoMode`, dus een demogebruiker betaalt
  niet — de rekening komt op het projectaccount. Zonder plafond is de
  etalageversie een open kraan. Bij de bouw hoort daar een teller per sessie
  bij, en de vraag of er nog een tweede blokkade zit: `sendCmd()` weigert in
  demo (`pidlane-bt.js:1058`), maar of dat het rapportpad raakt is niet
  uitgezocht.

---

## 10. Hoe je merkt dat het werkt

Niet aan de code, maar aan het rapport. Als het contract doet wat het moet doen,
dan staat er in een AI-rapport na een rit met gaten iets als:

> Gemeten over 27,6 minuten, waarvan 6 minuten ontbraken. Over dat gat kan geen
> uitspraak worden gedaan. Brandstoftrim bank 2 is niet gemeten (deze app kent
> die sensor nog niet) — dat betekent niet dat er iets mis mee is.

En niet meer wat er nu zou staan: een verhaal over een brandstoftrim van 128%.
