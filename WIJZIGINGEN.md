# Rondgang v2 — vol scherm met gecombineerde trend

Losse update bovenop `PidLane-wijzigingen-2026-08-02.zip`.
Alleen deze drie bestanden vervangen; `index.html` hoeft NIET opnieuw
(de knop en de script-tag zaten al in de vorige levering).

| Bestand | Wat |
|---|---|
| `public/pidlane-rondgang.js` | Volledig herschreven weergavedeel. Beurtenlogica ongewijzigd. |
| `public/pidlane.css` | Oude `#rondgangBar`-regels verwijderd, opmaak vol scherm ervoor in de plaats. |
| `public/test-rondgang.js` | 19 → 35 toetsen: venster op tijd, normalisatie per lijn, richting. |

## Indeling

```
┌──────────────────────────────────────────┐
│ 🔄 Emissie 2/2        89s · 2/2  ‹ › ✕   │
├──────────────────────────────────────────┤
│ 1686 rpm · 49 % · 38 % · 111 kPa · 93 °C │  basis, klein
├──────────────────────────────────────────┤
│                                          │
│   alle categorie-PIDs in één grafiek     │  20 s venster
│                                          │
├──────────────────────────────────────────┤
│ ● Lambda 0,99   ● O2 B1S1 0,45 V         │  waarden + legenda
└──────────────────────────────────────────┘
```

## Instellingen (bovenaan het bestand)

| Constante | Waarde | Wat |
|---|---|---|
| `INTERVAL_MS` | 100000 | tijd per categorie |
| `VENSTER_MS` | 20000 | zichtbaar trendvenster |
| `TEKEN_MS` | 250 | hertekenfrequentie (4 Hz) |
| `MIN_PIDS` | 2 | minder → categorie overslaan |
| `MAX_PIDS` | 12 | meer → over meerdere beurten |
| `MIN_PUNTEN` | 2 | minder punten in venster → lijn niet tekenen |

## Keuzes die om uitleg vragen

**Basis staat NIET in de grafiek.** Toerental 800–4000 naast een lambda
van 0,98–1,02 in dezelfde grafiek maakt van die lambda een rechte streep.
De basis is context; hij hoort in cijfers bovenaan.

**Elke lijn heeft zijn eigen schaal**, genormaliseerd over zijn min/max
binnen het venster. Je leest er geen absolute waarde uit — die staat
eronder — maar wel de vorm en of lijnen synchroon lopen. Dat is wat een
rondgang moet laten zien.

**Venster filtert op tijd, niet op aantal punten.** Een PID die elke 10 s
ververst heeft in 20 s maar twee punten; een 1 Hz-PID twintig. Op aantal
filteren zou de trage PID een venster van drie minuten geven.

**`renderGauges()` wordt overgeslagen zolang het volle scherm aan staat.**
Die tegels zitten erachter en twaalf kaarten herbouwen per beurt is op een
telefoon zonde. Bij sluiten wordt het raster in één keer bijgewerkt.

**Terugknop van de telefoon sluit het scherm** in plaats van de app.
