# PidLane — overdracht naar een nieuwe chat (25-08-2026)

Plak dit als eerste bericht in de nieuwe chat, of upload het als bestand. Het is
bedoeld om zonder de oude chat verder te kunnen.

---

## Waar we staan

Delta van 24/25-08 is klaar en gecontroleerd, maar **nog niet gecommit**.
Testrun ging van 3.8 naar **4.5**. Vier bestanden gewijzigd:

| bestand | wat |
|---|---|
| `public/pidlane-pids.js` | waakknop dooft niet meer bij weergavewissel |
| `public/pidlane-auth.js` | inlogmelding, tijdslimiet login, PLWakelock, uitlogvlag |
| `public/pidlane-testrun.js` | 4.5: blok 12, blok 5 uitgebreid, CAMPAGNE herzien |
| `PIDLANE-WERK.md` | administratie |

Eerst `git pull`, dan vier losse commits. Volgorde staat in `LEESMIJ-DELTA.md`.

---

## Het grootste nieuws: de adapter is een STN

Blok 12 (nieuw) gaf op 25-08:

```
STI  = "STN2255 v5.12.4"
STDI = "OBDLink MX+ r3.1.3"
ATI  = "ELM327 v1.4b"
```

`PIDLANE.md` zegt "ELM327 v1.4b clone, geen STN-chip, geen STPX/MS-CAN". **Dat
is fout** — het was een conclusie uit de `ATI`-string, en die liegt bij deze
adapter.

Gevolg: **STPX en MS-CAN zijn beschikbaar.** Met STPX geef je per commando een
eigen timeout en een verwacht aantal frames mee. Het gokken met batchgroottes,
de zelflerende `PLPidLen` en de terugval van drie-naar-één zijn dan niet meer
nodig. Dat is geen optimalisatie maar een hele laag die kan verdwijnen.

**Dit is de logische volgende sessie.** `PIDLANE.md` moet hoe dan ook bij.

---

## Wat er deze sessie is opgelost

**Waakknop dooft bij weergavewissel.** `#waakBtn` draagt de klasse
`pidview-btn` maar heeft geen `data-mode`, dus de `active`-lus in
`setPidView()` haalde zijn markering eraf terwijl `PLWaak` gewoon doorliep.
Selector nu `.pidview-btn[data-mode]`.

**Drie puntjes onder het wachtwoordveld.** `doLogin()` zette `'…'` in
`#loginErr`, en dat vakje heeft inline `color:var(--rd)` — een wachtindicator
in de foutkleur. Alle veertien schrijvers lopen nu via
`plLoginMeld(el, tekst, soort)`. Plus: `serverLogin()` had geen tijdslimiet, dus
een hangende fetch gaf nooit een fout en dus nooit een uitweg. Nu 12 s via
`AbortController`.

**Uitloggen bleef niet hangen.** Je logde niet automatisch opnieuw in — je was
nooit uitgelogd geraakt. `logout()` vraagt een admin eerst of de log bewaard
moet worden, dat opent een deelvenster, Android herlaadt de WebView, en het
herstel in `pidlane-theme.js` (regel 277, `tokLoad()`) vond nog een geldig token
omdat het wissen pas ná de export gebeurde. Opgelost met een uitlogvlag
(`pl_uitloggen`): opgeslagen sessie meteen dood, `window.APP_TOKEN` blijft leven
tot de export klaar is.

**Testrun opgeruimd.** Knoppen "DID-scan (45 s)" en "Budget + olie" weg, `b8`
uit de standaardset — alle drie dienden de mode 22-olietemperatuur, en die is op
23-08 losgelaten. `_blok8()`/`_blok9()` bestaan nog en zijn los aanroepbaar.

**Wake lock.** `PLWakelock` in `pidlane-auth.js`, hangt aan `connected` met een
tik van 5 s en een `visibilitychange`-haak (de browser laat de lock zelf los bij
achtergrond). Dekt alleen "scherm gaat uit", niet "app wordt verlaten".

---

## De grote open bevinding: de app bevriest op de achtergrond

Uit de nachtrit van 23-08 (27,6 min, 1295 monsters, tot 96 km/u):

Het leek socket-instabiliteit — 9× SPP herverbonden, 12× flush read-fout, drie
gaten in de bulkopname. **Dat was fout.** Het *logboek zelf* heeft veertien
stiltes op precies dezelfde kloktijden (179 s, 168 s, 177 s, 66 s). Een dode
socket lógt fouten; hier logt niets. Het proces liep niet.

Android bevriest de JS-timers van een WebView op de achtergrond: pollus,
recorder en logger stoppen tegelijk. **Elke herverbinding volgt direct op een
stilte.** Om 23:31:00 hervat de app, 16 s later "socket dood na 012E1" — het
eerste commando in een socket die Android intussen heeft opgeruimd.

Aanleiding: het logboek openen of opslaan schakelt naar een ander venster.

Op opbrengst gesorteerd:

1. **Foreground service + wake lock** (Capacitor). De echte oplossing, en werk.
2. **Herkennen in plaats van repareren.** `visibilitychange` afvangen, opname
   als gepauzeerd markeren, bij terugkomst actief herverbinden. Klein.
3. **Opslaan zonder venster te wisselen.** Zie hieronder — goedkoopst.

---

## De richting: PIDLANE-CONTRACT.md

Nieuw op 25-08, en het belangrijkste stuk van deze sessie. Ontwerp, geen code.

De hele app draait op "data verzamelen en aan AI koppelen". Die koppeling werkt
op een aanname die niet klopt: dat elke waarde die binnenkomt een echte meting
is. `0155 = 128` is een rauwe byte. Raildruk stond 27 minuten stil. `019D = −40`
komt van een PID die de ECU claimt maar niet levert. Een rit van 27,6 minuten
miste er zes. Alle vier kwamen ze bij de AI aan als feiten.

Het contract legt vast: per meetwaarde een kwaliteitsklasse met reden, en per
sessie een dekking. Kernregel: `waarde` is `null` zodra de kwaliteit niet
`gemeten` of `stabiel` is — dan faalt een afnemer die de kwaliteit negeert
zichtbaar in plaats van stil.

**Geen herbouw.** Tussenlaag (`plMeetwaarde`, `plDekking`), daarna één afnemer
per sessie met blok 5-test, AI-rapport eerst. Eerst STPX, want dat verandert de
meetlaag nog.

**Vier besluiten staan open in §9** — die zijn aan Nico en bepalen de vorm.

## Openstaande punten, in volgorde

### 1. Opslaglocaties veranderen (staat in Claude's geheugen)

Logs, meetdata en rapporten niet meer naar de gedeelde `Documents`-map maar naar
een eigen map.

| Capacitor | pad | zichtbaar | overleeft deïnstallatie |
|---|---|---|---|
| `Directory.Data` | app-privé | nee | nee |
| `Directory.External` | `Android/data/<pakket>/files/PidLane` | ja | nee |
| `Directory.Documents` | gedeeld | ja, ook andere apps | ja |

Voorkeur `Directory.External`: eigen map, terug te vinden, maar niet leesbaar
voor andere apps — en er staan VIN en kentekens in de rapporten.

Tweede winst: rechtstreeks naar een vaste map schrijven scheelt de
bestandskiezer, dus geen vensterwissel, dus geen herverbinding.

De opslagfunctie heet **`plOpslaan(basis, tekst, opties)`** — gevonden in
`pidlane-logboek.js`, maar hij wordt daar alleen aangeroepen, niet gedefinieerd.

Nodig voor die sessie:
```
grep -rln "plOpslaan\|exportAllLogs\|liveLogStop" public/*.js
```

### 2. STPX/MS-CAN verkennen nu de adapter een STN blijkt

### 3. `0155`/`0156` toevoegen aan `ALL_PID_DEFS`

In de sweep heten ze letterlijk "PID 0155" — ze staan niet in de tabel, dus komt
de rauwe byte `0x80` = 128 eruit. Geen parserfout maar een ontbrekende
definitie. Secundaire O2-trims, formule `(A−128)·100/128`, dan wordt 128 → 0%.
Eén regel per PID in `pidlane-data.js`.

### 4. VIN-profiel wordt niet geladen bij verbinden

Blok 1, 25-08: *"staat in de opslag maar is bij het verbinden NIET geladen; de
app deed een volle discovery."* 55 PIDs met health-oordelen, 18 minuten oud.
Kost bij elke verbinding een complete scan. Waarschijnlijk ook de reden dat het
voertuig op "Mazda" staat zonder model, bouwjaar en brandstof — en dát voedt
`merkGroep()` en de brandstofafhankelijke gates.

### 5. Naambotsing `PLWake` uitzoeken

```
grep -rn "PLWake" public/*.js | grep -v pidlane-auth
```
Testrun 4.3 gaf `PLWake.steunt is not a function` terwijl het object bestond.
Er is dus al een `window.PLWake` elders. Hernoemd naar `PLWakelock` in 4.5, maar
als die andere een bestaande wakelock is, is de nieuwe een duplicaat.

### 6. Vier vondsten uit de bulkopname (vastgelegd, niet gerepareerd)

- `0123`/`0159` (raildruk) stonden 27 minuten stil op 9900 — op directe
  inspuiting onmogelijk
- `0120`, `0140`, `0160`, `0180` staan als *sensorwaarde* in de bulkopname; dat
  zijn de steunbitmaps. `GEEN_SENSOR_PIDS` houdt ze uit de keuzelijst maar niet
  uit `pidlane-bulk.js` — een vijfde deur naast de vier uit ronde 6
- `018E`, `019D`, `019E`, `01A0` op −40/−24: blok `0180` claimt ze, de ECU
  levert niets. Precies waar de opruimregel voor bestaat
- **Bulk en logboek gebruiken verschillende klokken**: recorder schrijft UTC,
  logger lokale tijd. Exact twee uur verschil, alleen opgemerkt doordat de
  seconden van de gaten toevallig gelijk waren

### 7. Ideeën uit de kennisbank

- **Vier statuschips → één bal**, slechtste kleur wint, uitvouwen bij tikken.
  Het lastige is niet de UI maar de regel: vier ongelijksoortige dingen (een
  percentage, een verbindingsstatus, een dienst, een teller) op één schaal. Leg
  die afbeelding op **één plek** vast.
- **Gratis versie met OBD2 zonder AI.** Server-side rol, geen tweede build.
- **"Zodra data top werkt, data vertalen naar functies"** — hier zou ik tegen
  ingaan. Die voorwaarde wordt nooit gehaald. Kies één functie en laat díé
  bepalen welke data goed genoeg moet zijn.

---

## Werkregels die in deze sessie meespeelden

- **Blok 5 toetst gedrag, niet broncode** (§20). Bron lezen mag alleen waar een
  gedragstest onmogelijk is, en dan met de reden erbij.
- **Elke controle krijgt een tegenproef** — een versie die rood wordt als de
  logica wordt teruggedraaid. Alle nieuwe controles van deze sessie zijn zo
  nagerekend.
- **Een test die altijd rood staat wordt genegeerd.** Vandaar LET OP in plaats
  van FOUT als de voorwaarden niet kloppen (niet verbonden, pagina onzichtbaar).
- **Bugs gevonden in een sessie worden vastgelegd, niet in dezelfde sessie
  gefixt** — tenzij expliciet gevraagd.
- **"Niet geladen" in blok 5 kan de HTTP-cache zijn.** Twee keer voorgekomen
  (23-08 veldlab, 24-08 pidgate), beide keren weg na "Nieuwste versie laden".
  De melding zegt dat sinds 4.1 zelf.
- **`PLWakelock` moet nog in de KRITIEK-lijst van `pidlane-bedrading.js`.**

---

## Eén patroon dat drie keer terugkwam

Alle UI-vondsten van deze sessie hebben dezelfde vorm: **één ding met twee
betekenissen, waarbij de ene de opmaak of behandeling van de andere erft.**

- `active` op `#waakBtn` = "waakronde loopt" én "dit is de gekozen weergave"
- `#loginErr` = "er is een fout" én "we zijn bezig"
- `pidview-btn` = "knop in deze rij" én "knop met een modus"

Dezelfde soort fout als de fantoomsensor-familie uit §7, maar in de UI. Bij een
volgende UI-melding: kijk eerst of het element of de klasse twee rollen heeft.
