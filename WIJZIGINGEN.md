# Waakronde — vervangt Rondgang

## VERWIJDEREN uit de repo

    public/pidlane-rondgang.js
    public/test-rondgang.js

Deze twee bestanden zitten NIET in de zip omdat ze weg moeten. De
CSS-regels voor `#rgScherm` en `#rondgangBar` zijn al uit `pidlane.css`
gehaald; die hoef je alleen te overschrijven.

## Wat er verandert

Rondgang was een WEERGAVE: hij nam het scherm over en toonde elke 100 s
een andere categorie. Twee problemen. Het verdrong je eigen selectie, en
belangrijker: het toonde data terwijl je aandacht nodig hebt. Veertig
genormaliseerde lijnen kun je niet lezen, zeker niet tijdens het rijden.

Waakronde is geen weergave maar een SCHAKELAAR ernaast. Trends, Getallen
en Puntjes blijven een keuze uit drie; Waakronde zet je daar los bij aan.
Je hoofdscherm blijft precies zoals het was.

Op de achtergrond loopt een trage ronde langs de sensoren die je NIET
hebt aangevinkt. Drie tegelijk, elke twaalf seconden een groepje, met een
kort busslot — hetzelfde patroon als de fabrikant-probe en vlFullSurvey().
Een ronde over dertig sensoren duurt zo ongeveer twee minuten, daarna
45 s rust en opnieuw.

Elke meting krijgt een OORDEEL, geen grafiek:

| | |
|---|---|
| groen | binnen bereik |
| oranje | buiten fysiek bereik, of buiten het bereik van de definitie |
| grijs | geen antwoord |

Op het scherm: één smalle strook boven het raster. Een rij stipjes, één
per sensor, die tijdens de ronde inkleurt. De stip die nu gelezen wordt
pulseert. Eén regel tekst met wat er onder de naald ligt. Rechtsboven het
aantal bevindingen. Tik op de kop en je krijgt alleen de bevindingen.

## Bestanden

| Bestand | Wat |
|---|---|
| `public/pidlane-waakronde.js` | nieuw — `PLWaak` |
| `public/index.html` | Rondgang-knop → Waakronde-schakelaar; script-tag omgezet |
| `public/pidlane.css` | rondgang-opmaak eruit, waakronde-opmaak erin |
| `public/test-waakronde.js` | nieuw — 21 toetsen |
| `PIDLANE.md` | module 43 herschreven |

## Instellingen (bovenaan het bestand)

| Constante | Waarde | Wat |
|---|---|---|
| `RONDE_MS` | 12000 | tijd tussen twee groepjes |
| `BATCH` | 3 | sensoren per groepje |
| `PAUZE_MS` | 45000 | rust tussen twee volledige rondes |
| `LEES_MS` | 1800 | time-out per sensor |

## Iets dat ik onderweg tegenkwam

`pidlane-datalog.js:47` leest `PID_LET_OP` — de tabel voor "buiten het
gebruikelijke bereik maar fysiek mogelijk", laag 1b van validateAndSmooth().
Die tabel wordt NERGENS gedefinieerd. De check staat achter
`typeof PID_LET_OP!=='undefined'`, dus hij gooit geen fout, maar de hele
laag is dood: er is geen enkele PID waarvoor "opvallend maar echt" ooit
afgaat. Niet aangeraakt — dat is jouw call, en het vullen van die tabel
vraagt om echte meetgegevens per PID.
