# PidLane — het contract tussen meten en gebruiken

Versie 0.1 — 25-08-2026 — **ontwerp, nog niet gebouwd**

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
opgeslagen VIN-profiel, dus niet vers gemeten) of `demo`.

**`gemetenOp`** is een epoch-timestamp in milliseconden, **UTC**. Zie §6.

---

## 4. De kwaliteitsklassen

Acht klassen. Ze sluiten aan bij wat blok 6 nu al onderscheidt en bij de
opruimregel; er wordt geen nieuw vocabulaire uitgevonden waar er al een is.

| klasse | betekenis | `waarde` | wie stelt het vast |
|---|---|---|---|
| `gemeten` | vers antwoord, binnen bereik, beweegt | getal | meetlaag |
| `stabiel` | vers antwoord, binnen bereik, beweegt niet — kan legitiem zijn (koelwater bij warme motor) | getal | meetlaag |
| `verdacht` | binnen bereik maar bevroren waar beweging hoort, of buiten `PID_HARD_LIMITS` | **null** | waakronde / PLWatch |
| `rauw` | geen definitie, waarde is een ongeschaalde byte | **null** | de gate, bij het opzoeken van de definitie |
| `stil` | gepollt, geen antwoord | **null** | meetlaag |
| `nietGemeten` | deze sessie niet gepollt | **null** | de gate |
| `opgeruimd` | door de opruimregel uit `activePIDs` verwijderd | **null** | opruimregel |
| `ontkend` | steunbit zegt nee | **null** | steunbitcontrole |

Het onderscheid tussen `stabiel` en `verdacht` is het lastigste en het is
bewust niet automatisch te beslissen. Koelwater dat bij 92 °C stilstaat is
gezond; raildruk die bij 9900 stilstaat is dat niet. Dat verschil zit in de
PID-definitie, niet in de meting — zie de openstaande besluiten (§9).

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
  herverbindingen: 9,
  achtergrond:     14,
  actievePIDs:     24,
  opgeruimd:       ['0101', '0121']
}
```

**`volledigheid`** is `gemetenS / duurS` en is het getal dat een afnemer moet
lezen voordat hij iets over een verloop zegt.

**`achtergrond`** telt hoe vaak de app naar de achtergrond ging. Dat is de
oorzaak van de gaten en van de herverbindingen (zie `PIDLANE-WERK.md`), en het
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
verloop, een trend of een gemiddelde, dan moet `volledigheid` erin meegewogen
zijn. Onder een nader te bepalen drempel (§9) mag er geen uitspraak over
verloop gedaan worden, alleen over losse waarnemingen.

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
tussenlaag uit stap 1 wel. Eerst STPX, dan dit.

---

## 9. Openstaande besluiten — voor Nico

Deze vier bepalen de vorm en ik wil er niet zelf over beslissen.

**1. `stabiel` versus `verdacht`.** Het onderscheid zit in de PID: van sommige
sensoren is stilstand normaal, van andere niet. Dat vraagt een veld in
`ALL_PID_DEFS`, zoiets als `beweegtBij: 'rijden'` of `magStilstaan: true`. Dat
is een aanpassing in een tabel met ~55 ingangen. Wil je dat, of houden we het
voorlopig bij één klasse `stabiel` en laten we het oordeel aan de afnemer?

**2. De drempel voor `volledigheid`.** Onder welk percentage mag een afnemer
niets meer over een verloop zeggen? Ik zou 0,7 voorstellen, maar dat is een
gok — de rit van 23-08 zat op 0,78 en dat voelde al te mager.

**3. Waar dit document hoort.** Los bestand (zoals nu) of een hoofdstuk in
`PIDLANE.md`? Los is makkelijker te herzien; in `PIDLANE.md` is het beter
vindbaar. Ik neig naar los, met een verwijzing vanuit `PIDLANE.md` §4.

**4. Wat er met `demo` gebeurt.** Demo-data heeft per definitie kwaliteit
`gemeten`, maar bron `demo`. Mag de AI daar een rapport op baseren, of moet er
een expliciete waarschuwing in? Nu gebeurt het eerste, en voor een gratis
etalageversie kan dat prima zijn — maar dan wel bewust.

---

## 10. Hoe je merkt dat het werkt

Niet aan de code, maar aan het rapport. Als het contract doet wat het moet doen,
dan staat er in een AI-rapport na een rit met gaten iets als:

> Gemeten over 27,6 minuten, waarvan 6 minuten ontbraken. Over dat gat kan geen
> uitspraak worden gedaan. Brandstoftrim bank 2 is niet gemeten (deze app kent
> die sensor nog niet) — dat betekent niet dat er iets mis mee is.

En niet meer wat er nu zou staan: een verhaal over een brandstoftrim van 128%.
